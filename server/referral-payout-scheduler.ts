/**
 * Referral Payout Scheduler
 *
 * Runs every 5 minutes. Finds all pending referrals (retry count < MAX_AUTO_RETRIES)
 * and fires M-Pesa B2C payouts automatically. Results are confirmed asynchronously
 * via the /api/mpesa/b2c/result callback which marks the referral as "paid".
 *
 * After MAX_AUTO_RETRIES failed attempts the referral moves to "failed" status and
 * requires manual admin action to avoid indefinitely hammering Safaricom.
 */

import { storage } from "./storage";
import { b2cPayout, isB2CAvailable } from "./mpesa";
import { logPayout } from "./supabaseClient";

const SCHEDULER_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_AUTO_RETRIES = 5;
const BATCH_SIZE = 20; // max referrals per run to avoid Safaricom rate limits

interface SchedulerState {
  enabled: boolean;
  lastRunAt: Date | null;
  lastRunResult: {
    processed: number;
    succeeded: number;
    skipped: number;
    failed: number;
    errors: string[];
  } | null;
  nextRunAt: Date | null;
  totalRuns: number;
  totalPaid: number;
}

const state: SchedulerState = {
  enabled: true,
  lastRunAt: null,
  lastRunResult: null,
  nextRunAt: null,
  totalRuns: 0,
  totalPaid: 0,
};

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

export async function runPayoutBatch(): Promise<SchedulerState["lastRunResult"]> {
  const result = {
    processed: 0,
    succeeded: 0,
    skipped: 0,
    failed: 0,
    errors: [] as string[],
  };

  if (!isB2CAvailable()) {
    console.warn("[PayoutScheduler] B2C circuit breaker is open — skipping batch");
    result.errors.push("M-Pesa B2C unavailable (circuit breaker open)");
    return result;
  }

  const pending = await storage.getPendingReferrals(MAX_AUTO_RETRIES);
  const batch = pending.slice(0, BATCH_SIZE);

  console.log(`[PayoutScheduler] Found ${pending.length} pending referral(s). Processing ${batch.length}.`);

  for (const referral of batch) {
    result.processed++;

    try {
      // Resolve the referrer's phone number from influencer or user record
      let referrerPhone: string | null = null;

      const influencer = await storage.getInfluencerByRefCode(referral.refCode);
      if (influencer?.phone) {
        referrerPhone = influencer.phone;
      } else {
        const referrerUser = await storage.getUserByReferralCode(referral.refCode);
        if (referrerUser?.phone) {
          referrerPhone = referrerUser.phone;
        }
      }

      if (!referrerPhone) {
        result.skipped++;
        console.warn(`[PayoutScheduler] No phone for refCode ${referral.refCode} (id=${referral.id}) — skipping`);
        continue;
      }

      const payoutResult = await b2cPayout(
        referrerPhone,
        referral.commission,
        `WorkAbroad Referral Commission - ${referral.refCode}`
      );

      const convId =
        payoutResult.ConversationID ||
        payoutResult.OriginatorConversationID ||
        payoutResult.originatorConversationID;

      // Audit log — every B2C send gets a payouts row for callback reconciliation
      logPayout({
        phone:                   referrerPhone,
        amount:                  referral.commission,
        occasion:                `WorkAbroad Referral Commission - ${referral.refCode}`,
        conversationId:          convId              || undefined,
        originatorConversationId: payoutResult.originatorConversationID || undefined,
        referralId:              String(referral.id),
      }).catch((e) => console.error("[PayoutScheduler] logPayout failed:", e?.message));

      await storage.markReferralPayoutAttempt(referral.id, convId || "");
      result.succeeded++;
      state.totalPaid++;

      console.log(
        `[PayoutScheduler] B2C initiated — referral ${referral.id}, ` +
        `refCode=${referral.refCode}, phone=${referrerPhone}, ` +
        `amount=KES ${referral.commission}, convId=${convId}`
      );

      // Brief pause between requests to avoid flooding Safaricom
      await new Promise(r => setTimeout(r, 800));

    } catch (err: any) {
      result.failed++;
      const errMsg = err?.message || String(err);
      result.errors.push(`Referral ${referral.id}: ${errMsg}`);
      console.error(`[PayoutScheduler] Payout failed for referral ${referral.id}:`, errMsg);

      // If we've hit the retry limit, permanently fail this referral
      const nextRetry = (referral.retryCount ?? 0) + 1;
      if (nextRetry >= MAX_AUTO_RETRIES) {
        await storage.markReferralFailed(referral.id);
        console.warn(
          `[PayoutScheduler] Referral ${referral.id} marked FAILED after ${nextRetry} attempts`
        );
      } else {
        // Increment retry count without changing status (stays "pending" for next batch)
        await storage.markReferralPayoutAttempt(referral.id, "");
        await storage.updateReferralStatus(referral.id, "pending");
      }
    }
  }

  return result;
}

async function tick() {
  if (!state.enabled) return;

  state.totalRuns++;
  state.lastRunAt = new Date();
  state.nextRunAt = new Date(Date.now() + SCHEDULER_INTERVAL_MS);

  try {
    state.lastRunResult = await runPayoutBatch();
  } catch (err: any) {
    console.error("[PayoutScheduler] Batch run error:", err.message);
    state.lastRunResult = {
      processed: 0,
      succeeded: 0,
      skipped: 0,
      failed: 0,
      errors: [err.message],
    };
  }
}

export function startPayoutScheduler() {
  if (schedulerTimer) return;

  state.nextRunAt = new Date(Date.now() + SCHEDULER_INTERVAL_MS);

  schedulerTimer = setInterval(tick, SCHEDULER_INTERVAL_MS);

  console.log(
    `[PayoutScheduler] Started — interval: ${SCHEDULER_INTERVAL_MS / 1000}s, ` +
    `max retries: ${MAX_AUTO_RETRIES}, batch size: ${BATCH_SIZE}`
  );
}

export function stopPayoutScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

export function setSchedulerEnabled(enabled: boolean) {
  state.enabled = enabled;
  console.log(`[PayoutScheduler] ${enabled ? "Enabled" : "Disabled"}`);
}

export function getSchedulerStatus() {
  return {
    ...state,
    intervalSeconds: SCHEDULER_INTERVAL_MS / 1000,
    maxAutoRetries: MAX_AUTO_RETRIES,
    batchSize: BATCH_SIZE,
    isRunning: schedulerTimer !== null,
  };
}
