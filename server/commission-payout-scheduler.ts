/**
 * Commission Payout Scheduler
 *
 * Runs every 5 minutes. Fetches pending rows from the Supabase `commissions`
 * table, looks up each referrer's phone number, fires an M-Pesa B2C payout,
 * then stamps the row as "paid". After MAX_AUTO_RETRIES failures the row moves
 * to "failed" so it shows up in the admin dashboard for manual review.
 *
 * Mirrors the shape of referral-payout-scheduler.ts so admin tooling stays
 * consistent between the two payout flows.
 */

import { b2cPayout, isB2CAvailable } from "./mpesa";
import { supabase, logPayout } from "./supabaseClient";

const SCHEDULER_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_AUTO_RETRIES      = 5;
const BATCH_SIZE             = 20;

interface BatchResult {
  processed: number;
  succeeded: number;
  skipped:   number;
  failed:    number;
  errors:    string[];
}

interface SchedulerState {
  enabled:        boolean;
  lastRunAt:      Date | null;
  lastRunResult:  BatchResult | null;
  nextRunAt:      Date | null;
  totalRuns:      number;
  totalPaid:      number;
}

const state: SchedulerState = {
  enabled:       true,
  lastRunAt:     null,
  lastRunResult: null,
  nextRunAt:     null,
  totalRuns:     0,
  totalPaid:     0,
};

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

// ── Core batch runner ────────────────────────────────────────────────────────

export async function runCommissionBatch(): Promise<BatchResult> {
  const result: BatchResult = {
    processed: 0,
    succeeded: 0,
    skipped:   0,
    failed:    0,
    errors:    [],
  };

  if (!isB2CAvailable()) {
    console.warn("[CommissionScheduler] B2C circuit breaker open — skipping batch");
    result.errors.push("M-Pesa B2C unavailable (circuit breaker open)");
    return result;
  }

  // Fetch pending commissions — filter retry_count client-side (column may be missing in Supabase)
  const { data: pending, error } = await supabase
    .from("commissions")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE * 3);

  if (error) {
    result.errors.push(`Supabase fetch error: ${error.message}`);
    console.error("[CommissionScheduler] Fetch error:", error.message);
    return result;
  }

  const commissions = ((pending ?? []) as any[])
    .filter(c => (c.retry_count ?? 0) < MAX_AUTO_RETRIES)
    .slice(0, BATCH_SIZE);

  console.log(
    `[CommissionScheduler] ${commissions.length} pending commission(s). Processing up to ${BATCH_SIZE}.`
  );

  for (const commission of commissions) {
    result.processed++;

    try {
      // Guard 1 — skip micro-payouts (Safaricom rejects < KES 10; we add margin)
      if (commission.amount < 100) {
        result.skipped++;
        console.warn(
          `[CommissionScheduler] Commission ${commission.id} amount KES ${commission.amount} < 100 — skipping micro-payout`
        );
        continue;
      }

      // Resolve referrer from Supabase users table (phone + fraud/verification flags)
      const { data: referrer } = await supabase
        .from("users")
        .select("phone, suspected_fraud, phone_verified")
        .eq("id", commission.referrer_user_id)
        .single();

      if (!referrer?.phone) {
        result.skipped++;
        console.warn(
          `[CommissionScheduler] No phone for referrer=${commission.referrer_user_id} ` +
          `(commission id=${commission.id}) — skipping`
        );
        continue;
      }

      // Guard 2 — do not pay out to accounts flagged for fraud
      if (referrer.suspected_fraud) {
        result.skipped++;
        console.warn(
          `[CommissionScheduler] Referrer ${commission.referrer_user_id} flagged suspected_fraud — ` +
          `commission ${commission.id} held`
        );
        continue;
      }

      // Guard 3 — require a verified phone number before sending real money
      if (!referrer.phone_verified) {
        result.skipped++;
        console.warn(
          `[CommissionScheduler] Referrer ${commission.referrer_user_id} phone not verified — ` +
          `commission ${commission.id} held`
        );
        continue;
      }

      // Fire M-Pesa B2C
      const payoutResult = await b2cPayout(
        referrer.phone,
        commission.amount,
        `WorkAbroad Referral Commission - ${commission.id}`,
      );

      const convId =
        payoutResult.ConversationID ||
        payoutResult.OriginatorConversationID ||
        payoutResult.originatorConversationID ||
        "";

      // Audit log — every B2C send gets a payouts row for callback reconciliation
      logPayout({
        userId:                  commission.referrer_user_id,
        phone:                   referrer.phone,
        amount:                  commission.amount,
        occasion:                `WorkAbroad Referral Commission - ${commission.id}`,
        conversationId:          convId || undefined,
        originatorConversationId: payoutResult.originatorConversationID || undefined,
        commissionId:            commission.id,
      }).catch((e) => console.error("[CommissionScheduler] logPayout failed:", e?.message));

      // Mark commission as paid
      await supabase
        .from("commissions")
        .update({ status: "paid", transaction_id: convId, paid_at: new Date().toISOString() })
        .eq("id", commission.id);

      result.succeeded++;
      state.totalPaid++;
      console.log(
        `[CommissionScheduler] B2C initiated — commission=${commission.id} ` +
        `referrer=${commission.referrer_user_id} phone=${referrer.phone} ` +
        `KES=${commission.amount} convId=${convId}`
      );

      // Brief pause between Safaricom requests
      await new Promise((r) => setTimeout(r, 800));

    } catch (err: any) {
      result.failed++;
      const msg = err?.message || String(err);
      result.errors.push(`Commission ${commission.id}: ${msg}`);
      console.error(`[CommissionScheduler] Payout failed for commission=${commission.id}:`, msg);

      const nextRetry = (commission.retry_count ?? 0) + 1;

      if (nextRetry >= MAX_AUTO_RETRIES) {
        await supabase
          .from("commissions")
          .update({ status: "failed", retry_count: nextRetry })
          .eq("id", commission.id);
        console.warn(
          `[CommissionScheduler] Commission ${commission.id} marked FAILED after ${nextRetry} attempt(s)`
        );
      } else {
        await supabase
          .from("commissions")
          .update({ retry_count: nextRetry })
          .eq("id", commission.id);
      }
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
    state.lastRunResult = await runCommissionBatch();
  } catch (err: any) {
    console.error("[CommissionScheduler] Batch error:", err.message);
    state.lastRunResult = {
      processed: 0, succeeded: 0, skipped: 0, failed: 0,
      errors: [err.message],
    };
  }
}

export function startCommissionScheduler() {
  if (schedulerTimer) return;

  state.nextRunAt = new Date(Date.now() + SCHEDULER_INTERVAL_MS);
  schedulerTimer  = setInterval(tick, SCHEDULER_INTERVAL_MS);

  console.log(
    `[CommissionScheduler] Started — interval: ${SCHEDULER_INTERVAL_MS / 1000}s, ` +
    `max retries: ${MAX_AUTO_RETRIES}, batch size: ${BATCH_SIZE}`
  );
}

export function stopCommissionScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

export function setCommissionSchedulerEnabled(enabled: boolean) {
  state.enabled = enabled;
  console.log(`[CommissionScheduler] ${enabled ? "Enabled" : "Disabled"}`);
}

export function getCommissionSchedulerStatus() {
  return {
    ...state,
    intervalSeconds: SCHEDULER_INTERVAL_MS / 1000,
    maxAutoRetries:  MAX_AUTO_RETRIES,
    batchSize:       BATCH_SIZE,
    isRunning:       schedulerTimer !== null,
  };
}
