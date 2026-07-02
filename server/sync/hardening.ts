/**
 * Sync Engine — Operational Hardening (RC1, Priority 8).
 *
 * Three concrete defensive measures + the audit that produced them:
 *
 *   1. acquireRunLock() — Postgres advisory lock per provider so two
 *      runs can never overlap. If a stale lock survives a crash, it
 *      expires when the holding session ends (which Postgres detects).
 *
 *   2. validateConfigOrPanic() — boot-time guard that asserts the
 *      sync-engine's required environment variables exist BEFORE any
 *      provider is allowed to register. Fail-fast > debugging at 3am.
 *
 *   3. snapshotOrphanGc() — finds object-store blobs that no
 *      sync_snapshots row points to (created when the RC1 atomic
 *      transaction rolled back after the file upload) and reports
 *      them. Actual deletion is opt-in.
 *
 * Plus a documented audit table of every defensive check, so the
 * recommendation report has something concrete to cite.
 */

import type { PoolClient } from "pg";
import type { SnapshotStore } from "./snapshot";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Per-provider advisory lock
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Try to acquire the advisory lock for a provider. Returns true on
 * success (caller may proceed) and false if another session already
 * holds it (caller should abort the run).
 *
 * The lock is bound to the supplied PoolClient's session — it auto-
 * releases when the connection is returned to the pool OR when the
 * session terminates (e.g. process crash). This is exactly the
 * semantic we want for "at most one run per provider".
 *
 * The key is hashtext('sync-provider:' || slug), per ADR 0004
 * convention (documented in migration 0009).
 */
export async function acquireRunLock(
  client: PoolClient,
  providerSlug: string,
): Promise<boolean> {
  const { rows } = await client.query<{ pg_try_advisory_lock: boolean }>(
    `SELECT pg_try_advisory_lock(hashtext($1)) AS pg_try_advisory_lock`,
    [`sync-provider:${providerSlug}`],
  );
  return rows[0]?.pg_try_advisory_lock === true;
}

/**
 * Explicit release. Optional — the session-bound auto-release covers
 * the crash case. Use this when the run completes normally and we want
 * to free the lock immediately so the next scheduled run isn't blocked
 * by a lingering connection.
 */
export async function releaseRunLock(
  client: PoolClient,
  providerSlug: string,
): Promise<void> {
  await client.query(
    `SELECT pg_advisory_unlock(hashtext($1))`,
    [`sync-provider:${providerSlug}`],
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Boot-time config validation
// ─────────────────────────────────────────────────────────────────────────────

export const REQUIRED_SYNC_ENGINE_ENV = [
  "DATABASE_URL",      // Postgres connection
  "SESSION_SECRET",    // existing app secret; sync engine uses logger
  // SUPABASE_SERVICE_ROLE_KEY is only required if Supabase storage is used.
  // We treat it as conditional: the SnapshotStore implementation declares
  // its env needs via .requiredEnv() (see SnapshotStore interface).
] as const;

export interface ConfigValidationResult {
  ok:       boolean;
  missing:  string[];
  /** Non-fatal warnings (e.g. "SENTRY_DSN absent — exceptions won't be reported"). */
  warnings: string[];
}

export function validateConfig(env: NodeJS.ProcessEnv = process.env): ConfigValidationResult {
  const missing:  string[] = [];
  const warnings: string[] = [];

  for (const k of REQUIRED_SYNC_ENGINE_ENV) {
    if (!env[k] || String(env[k]).trim() === "") missing.push(k);
  }

  // Soft signals — not blockers, but the recommendation report should
  // call out their absence.
  if (!env.SENTRY_DSN)        warnings.push("SENTRY_DSN absent — exceptions are local-only");
  if (!env.UPSTASH_REDIS_REST_URL) warnings.push("UPSTASH_REDIS_REST_URL absent — BullMQ disabled");
  if (env.NODE_ENV !== "production" && env.NODE_ENV !== "development") {
    warnings.push(`NODE_ENV is "${env.NODE_ENV}" — expected "production" or "development"`);
  }

  return { ok: missing.length === 0, missing, warnings };
}

/**
 * Hard fail at boot if the engine is missing critical config. Called
 * from server bootstrap BEFORE any provider is registered.
 */
export function validateConfigOrPanic(env: NodeJS.ProcessEnv = process.env): void {
  const v = validateConfig(env);
  if (!v.ok) {
    const msg = `[sync-engine] missing required env: ${v.missing.join(", ")}`;
    console.error(msg);
    throw new Error(msg);
  }
  for (const w of v.warnings) {
    console.warn(`[sync-engine] config warning: ${w}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Orphan snapshot GC (reporting only by default)
// ─────────────────────────────────────────────────────────────────────────────

export interface OrphanGcReport {
  scannedBlobs:        number;
  knownSnapshotIds:    number;
  orphanIds:           string[];
  /** Only populated if `actuallyDelete` was true. */
  deletedIds:          string[];
}

export interface SnapshotStoreWithListing extends SnapshotStore {
  /** Optional — returns ALL blob ids the store currently holds. */
  listAllIds?(): Promise<string[]>;
}

/**
 * Compares the object store's blob ids against the sync_snapshots
 * table and reports those that have no DB row. Deletion is opt-in via
 * `actuallyDelete: true` — by default this is a read-only audit.
 */
export async function snapshotOrphanGc(
  store: SnapshotStoreWithListing,
  opts: { actuallyDelete?: boolean } = {},
): Promise<OrphanGcReport> {
  if (!store.listAllIds) {
    // Memory store doesn't expose listing; nothing to GC.
    return {
      scannedBlobs:     0,
      knownSnapshotIds: 0,
      orphanIds:        [],
      deletedIds:       [],
    };
  }

  const blobIds = await store.listAllIds();
  const { pool } = await import("../db");
  const { rows } = await pool.query<{ id: string }>(`SELECT id FROM sync_snapshots`);
  const known = new Set(rows.map((r) => r.id));

  const orphans = blobIds.filter((id) => !known.has(id));
  const deleted: string[] = [];

  if (opts.actuallyDelete && (store as any).deleteById) {
    for (const id of orphans) {
      try {
        await (store as any).deleteById(id);
        deleted.push(id);
      } catch {
        // best-effort; orphan stays
      }
    }
  }

  return {
    scannedBlobs:     blobIds.length,
    knownSnapshotIds: known.size,
    orphanIds:        orphans,
    deletedIds:       deleted,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hardening audit catalogue — what we checked, what we did, what we deferred
// ─────────────────────────────────────────────────────────────────────────────

export const HARDENING_AUDIT: ReadonlyArray<{
  id:        string;
  area:      "concurrency" | "config" | "storage" | "error-handling" | "observability";
  finding:   string;
  status:    "fixed" | "mitigated" | "deferred" | "accepted-risk";
  notes:     string;
}> = [
  {
    id:      "H-001",
    area:    "concurrency",
    finding: "Two scheduled runs of the same provider could overlap if the previous run hung.",
    status:  "fixed",
    notes:   "Postgres advisory lock (hashtext('sync-provider:'||slug)); auto-releases on connection drop.",
  },
  {
    id:      "H-002",
    area:    "config",
    finding: "Missing DATABASE_URL surfaced only when first pool.query() failed at runtime.",
    status:  "fixed",
    notes:   "validateConfigOrPanic() at boot blocks startup; soft warnings for SENTRY_DSN, UPSTASH, NODE_ENV.",
  },
  {
    id:      "H-003",
    area:    "storage",
    finding: "Snapshot blob uploaded before sync_snapshots row insert — rollback leaves orphan.",
    status:  "mitigated",
    notes:   "snapshotOrphanGc() report job; deletion opt-in. Disk-cheap; full fix deferred to file-staging pattern.",
  },
  {
    id:      "H-004",
    area:    "error-handling",
    finding: "Recovery write (failed-status update) could itself fail and leave run in 'running'.",
    status:  "accepted-risk",
    notes:   "Best-effort .catch(()=>{}) in runner; documented in ADR 0004. Manual reconciliation if it occurs.",
  },
  {
    id:      "H-005",
    area:    "observability",
    finding: "No structured per-phase timings made performance regressions hard to spot.",
    status:  "fixed",
    notes:   "PerformanceRecorder (P7) + sync_runs.performance_report + dashboard plot.",
  },
  {
    id:      "H-006",
    area:    "concurrency",
    finding: "Diff engine read of nea_agencies could race against in-flight apply on the same provider.",
    status:  "fixed",
    notes:   "Run lock from H-001 makes this impossible: only one run touches a provider at a time.",
  },
  {
    id:      "H-007",
    area:    "config",
    finding: "Provider adapter version was free-form text; old runs were hard to attribute.",
    status:  "fixed",
    notes:   "ProviderMetadata.adapterVersion is required (M1) + foundation engine pins it to the run.",
  },
  {
    id:      "H-008",
    area:    "observability",
    finding: "Event Store had no replay-attribution column.",
    status:  "fixed",
    notes:   "sync_runs.replayed_from_snapshot_id (migration 0009) + RC1 runner tags it.",
  },
  {
    id:      "H-009",
    area:    "storage",
    finding: "data_quality_report grew unbounded with every snapshot sample.",
    status:  "fixed",
    notes:   "Quarantine + drift sample arrays capped at TOP_N=10 in quality-report.ts and safety.ts.",
  },
  {
    id:      "H-010",
    area:    "observability",
    finding: "Held-for-review runs disappeared from success-rate metrics.",
    status:  "fixed",
    notes:   "Dashboard counts 'held' separately from 'succeeded' and 'failed'.",
  },
];
