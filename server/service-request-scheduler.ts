/**
 * Service Request Scheduler
 *
 * Polls the Supabase `service_requests` table every 2 minutes for rows
 * whose status is "pending" and retry_count < MAX_AUTO_RETRIES.
 *
 * Each row is handed to `processService` from service-processor.ts, which:
 *   1. Resolves the service name from the service_id (UUID or slug)
 *   2. Calls the appropriate AI generator (cover letter, ATS CV, etc.)
 *   3. Marks the row "completed" with output_data, or increments retry_count
 *
 * Mirrors the shape of commission-payout-scheduler.ts for consistency.
 */

import { supabase } from "./supabaseClient";
import { processService, type ServiceRequestRow } from "./services/service-processor";

const SCHEDULER_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const MAX_AUTO_RETRIES      = 3;
const BATCH_SIZE            = 10;

interface BatchResult {
  processed: number;
  succeeded: number;
  skipped:   number;
  failed:    number;
  errors:    string[];
}

interface SchedulerState {
  enabled:       boolean;
  lastRunAt:     Date | null;
  lastRunResult: BatchResult | null;
  nextRunAt:     Date | null;
  totalRuns:     number;
  totalCompleted: number;
}

const state: SchedulerState = {
  enabled:        true,
  lastRunAt:      null,
  lastRunResult:  null,
  nextRunAt:      null,
  totalRuns:      0,
  totalCompleted: 0,
};

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

// ── Core batch runner ────────────────────────────────────────────────────────

export async function runServiceRequestBatch(): Promise<BatchResult> {
  const result: BatchResult = {
    processed: 0,
    succeeded: 0,
    skipped:   0,
    failed:    0,
    errors:    [],
  };

  const { data: pending, error } = await supabase
    .from("service_requests")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE * 3); // over-fetch so client-side retry filter doesn't starve the batch

  if (error) {
    result.errors.push(`Supabase fetch error: ${error.message}`);
    console.error("[ServiceRequestScheduler] Fetch error:", error.message);
    return result;
  }

  // Filter client-side so missing retry_count column in Supabase doesn't break the query
  const rows = ((pending ?? []) as ServiceRequestRow[])
    .filter(r => (r.retry_count ?? 0) < MAX_AUTO_RETRIES)
    .slice(0, BATCH_SIZE);
  console.log(
    `[ServiceRequestScheduler] ${rows.length} pending request(s). Processing up to ${BATCH_SIZE}.`
  );

  for (const row of rows) {
    result.processed++;

    // Skip rows without a service_id
    if (!row.service_id) {
      result.skipped++;
      console.warn(`[ServiceRequestScheduler] request=${row.id} has no service_id — skipping`);
      continue;
    }

    try {
      await processService(row, MAX_AUTO_RETRIES);

      // Re-fetch to check final status
      const { data: updated } = await supabase
        .from("service_requests")
        .select("status")
        .eq("id", row.id)
        .single();

      if (updated?.status === "completed") {
        result.succeeded++;
        state.totalCompleted++;
      } else {
        result.failed++;
      }
    } catch (err: any) {
      result.failed++;
      const msg = err?.message ?? String(err);
      result.errors.push(`Request ${row.id}: ${msg}`);
      console.error(`[ServiceRequestScheduler] Unhandled error for request=${row.id}:`, msg);
    }
  }

  return result;
}

// ── Scheduler lifecycle ──────────────────────────────────────────────────────

async function tick() {
  if (!state.enabled) return;

  state.totalRuns++;
  state.lastRunAt  = new Date();
  state.nextRunAt  = new Date(Date.now() + SCHEDULER_INTERVAL_MS);

  try {
    state.lastRunResult = await runServiceRequestBatch();
  } catch (err: any) {
    console.error("[ServiceRequestScheduler] Batch error:", err.message);
    state.lastRunResult = {
      processed: 0, succeeded: 0, skipped: 0, failed: 0,
      errors: [err.message],
    };
  }
}

export function startServiceRequestScheduler() {
  if (schedulerTimer) return;

  state.nextRunAt = new Date(Date.now() + SCHEDULER_INTERVAL_MS);
  schedulerTimer  = setInterval(tick, SCHEDULER_INTERVAL_MS);

  console.log(
    `[ServiceRequestScheduler] Started — interval: ${SCHEDULER_INTERVAL_MS / 1000}s, ` +
    `max retries: ${MAX_AUTO_RETRIES}, batch size: ${BATCH_SIZE}`
  );
}

export function stopServiceRequestScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

export function setServiceRequestSchedulerEnabled(enabled: boolean) {
  state.enabled = enabled;
  console.log(`[ServiceRequestScheduler] ${enabled ? "Enabled" : "Disabled"}`);
}

export function getServiceRequestSchedulerStatus() {
  return {
    ...state,
    intervalSeconds: SCHEDULER_INTERVAL_MS / 1000,
    maxAutoRetries:  MAX_AUTO_RETRIES,
    batchSize:       BATCH_SIZE,
    isRunning:       schedulerTimer !== null,
  };
}
