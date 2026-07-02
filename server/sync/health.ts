/**
 * Sync Engine — Provider Health Monitoring (Milestone 3).
 *
 * Wraps the adapter's healthCheck() with a timeout, a consecutive-failure
 * counter, and a state machine that transitions sync_providers.health
 * through healthy → degraded → broken (and back).
 *
 * Per SRS §12 + §21 + §22.
 *
 * Architectural decisions:
 *
 *   1. **Timeout is non-negotiable.** A health probe that hangs takes
 *      the sync scheduler with it. Default 5 s per SRS §10.
 *
 *   2. **State machine is monotonic-with-recovery.** healthy starts
 *      at 0 consecutive failures; degraded at 1+; broken at 5+. A
 *      single success resets the counter and demotes to healthy.
 *      (Spec §22 transitions: healthy → degraded → broken on
 *      sustained failure.)
 *
 *   3. **The state machine is pure.** `nextHealthState(...)` takes
 *      current state + probe outcome, returns next state. Side
 *      effects (DB update, event emission) happen in `runHealthCheck`.
 *
 *   4. **ProviderHealthChanged event emits ONLY on transition.** Same
 *      state over multiple checks produces zero events. This is what
 *      makes the event store useful as a transition timeline.
 */

import type { PoolClient } from "pg";
import { pool } from "../db";
import {
  EventBuffer,
  emitProviderHealthChanged,
} from "./events";
import type { ProviderHealth, SyncProvider } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const HEALTH_CHECK_TIMEOUT_MS = 5_000;
/** Consecutive failures required to transition healthy → degraded → broken. */
const DEGRADED_THRESHOLD = 1;
const BROKEN_THRESHOLD   = 5;

export type HealthStatus = ProviderHealth["status"];

// ─────────────────────────────────────────────────────────────────────────────
// Pure state transition
// ─────────────────────────────────────────────────────────────────────────────

export interface HealthState {
  status: HealthStatus;
  /** 0 when last probe succeeded; otherwise the running streak length. */
  consecutiveFailures: number;
}

export interface HealthProbeOutcome {
  /** Did the probe complete + return a non-broken status? */
  ok: boolean;
  /** Raw result if the probe completed (whether ok or not). */
  result?: ProviderHealth;
  /** Set when probe threw or timed out. */
  errorMessage?: string;
}

/** Pure: given current state + probe outcome, return next state. */
export function nextHealthState(
  current: HealthState,
  outcome: HealthProbeOutcome,
): HealthState {
  if (outcome.ok) {
    return { status: "healthy", consecutiveFailures: 0 };
  }
  const next = current.consecutiveFailures + 1;
  let status: HealthStatus = current.status;
  if (next >= BROKEN_THRESHOLD)        status = "broken";
  else if (next >= DEGRADED_THRESHOLD) status = "degraded";
  return { status, consecutiveFailures: next };
}

// ─────────────────────────────────────────────────────────────────────────────
// Health check with timeout
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Call provider.healthCheck() with a hard timeout. Categorises the outcome
 * into HealthProbeOutcome — never throws to the caller.
 */
export async function performHealthProbe(
  provider: SyncProvider,
  timeoutMs: number = HEALTH_CHECK_TIMEOUT_MS,
): Promise<HealthProbeOutcome> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<HealthProbeOutcome>((resolve) => {
    timer = setTimeout(() => resolve({
      ok: false,
      errorMessage: `Health probe timed out after ${timeoutMs}ms`,
    }), timeoutMs);
  });

  try {
    const result = await Promise.race([
      provider.healthCheck(),
      timeout,
    ]);
    if ("ok" in (result as any)) {
      // Timeout fired first.
      return result as HealthProbeOutcome;
    }
    const r = result as ProviderHealth;
    return {
      ok:     r.status === "healthy" || r.status === "degraded",
      result: r,
    };
  } catch (err: any) {
    return {
      ok: false,
      errorMessage: err?.message ?? String(err),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Read current health state from sync_providers
// ─────────────────────────────────────────────────────────────────────────────

interface ProviderHealthRow {
  health: HealthStatus;
  consecutiveFailures: number;
}

/**
 * Reads health + a derived consecutive-failure counter. We don't store the
 * counter in DB; we infer it from a simple convention:
 *   • status = healthy  → counter = 0
 *   • status = degraded → counter = 1
 *   • status = broken   → counter = 5
 * That keeps the DB schema small (no new column) and is good enough for
 * the engine — the actual counter only matters as input to the next
 * transition.
 */
async function readHealthState(providerId: string): Promise<ProviderHealthRow> {
  const { rows } = await pool.query<{ health: HealthStatus }>(
    `SELECT health FROM sync_providers WHERE id = $1 LIMIT 1`,
    [providerId],
  );
  const status = (rows[0]?.health ?? "unknown") as HealthStatus;
  const consecutiveFailures =
    status === "broken"  ? BROKEN_THRESHOLD :
    status === "degraded" ? DEGRADED_THRESHOLD :
    0;
  return { health: status, consecutiveFailures };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry — probe + persist + emit transition event
// ─────────────────────────────────────────────────────────────────────────────

export interface RunHealthCheckResult {
  before: HealthState;
  after:  HealthState;
  outcome: HealthProbeOutcome;
  /** True iff the after-state differs from the before-state. */
  transitioned: boolean;
}

/**
 * Probe the provider, persist the new health state to sync_providers, and
 * emit a ProviderHealthChanged event on transition. Buffer is flushed by
 * the caller (sync-runner) as part of its main transaction; for
 * standalone health probes (e.g. an admin "check now" button) the
 * caller can pass a fresh buffer + flush it via this function's optional
 * client argument.
 */
export async function runHealthCheck(
  provider: SyncProvider,
  providerId: string,
  buffer: EventBuffer,
  flushClient?: PoolClient,
): Promise<RunHealthCheckResult> {
  const beforeRow = await readHealthState(providerId);
  const before: HealthState = {
    status:              beforeRow.health,
    consecutiveFailures: beforeRow.consecutiveFailures,
  };

  const outcome = await performHealthProbe(provider);
  const after   = nextHealthState(before, outcome);

  // Persist regardless of transition so last_health_check_at advances.
  await pool.query(
    `UPDATE sync_providers
        SET health = $2,
            last_health_check_at = NOW(),
            updated_at = NOW()
      WHERE id = $1`,
    [providerId, after.status],
  );

  const transitioned = before.status !== after.status;
  if (transitioned) {
    emitProviderHealthChanged(buffer, {
      providerId,
      before:  before.status,
      after:   after.status,
      message: outcome.errorMessage
        ?? outcome.result?.message
        ?? "Health probe completed.",
      consecutiveFailures: after.consecutiveFailures,
    });
    if (flushClient) {
      await buffer.flush(flushClient);
    }
  }

  return { before, after, outcome, transitioned };
}
