// @ts-nocheck
/**
 * PayPal Auto-Recovery Poller
 *
 * 2026-09 (Tony's "check payment bugs across all services" audit): PayPal's
 * live success rate was found to be ~0% for 2+ months. Orders were created
 * successfully every time, but the client-side PayPal Buttons `onApprove`
 * callback (client/src/pages/payment.tsx) essentially never reached
 * POST /api/paypal/capture-order — and PayPal's own webhook, meant to be
 * the safety net for exactly this scenario, was never subscribed on
 * PayPal's side either (zero hits in 30 days of logs). Every affected
 * order was NOT lost money — PayPal still has it — it just never got
 * completed server-side, so the payment row sat "pending" forever and the
 * buyer never got their plan.
 *
 * This mirrors server/stk-recovery.ts's pattern for M-Pesa: a background
 * poller that proactively asks the gateway (PayPal) what actually happened
 * to any payment stuck pending, instead of relying solely on the client's
 * own follow-up call or an inbound webhook.
 *
 * Safety: completePayPalCapture() (server/services/paypalCapture.ts) always
 * checks the order's CURRENT status via getPayPalOrder() before touching
 * the Capture API, so polling an order the buyer hasn't approved yet
 * (status=CREATED) is a no-op — no side effects, nothing marked failed.
 * Only APPROVED orders actually get captured, and COMPLETED orders are
 * read back without a second capture call (idempotent against
 * ORDER_ALREADY_CAPTURED).
 *
 * State machine (payments.method = 'paypal'):
 *  pending/awaiting_payment/processing, age >= MIN_AGE_SECONDS
 *    → ask PayPal via completePayPalCapture({source:"recovery"})
 *       COMPLETED  → upgradeUserAccount marks payment "completed" internally
 *                    (same as the live capture path) — nothing left to do here.
 *       CREATED / still pending far too long (> MAX_AGE_HOURS) or query
 *       attempts exhausted (>= MAX_QUERY_ATTEMPTS) → give up, mark "failed"
 *       so the row stops showing as a ghost "pending" payment forever.
 *       Anything else (declined, verification failed, etc.) → already
 *       marked "failed" by completePayPalCapture/upgradeUserAccount
 *       internally; nothing extra to do.
 */

import { storage } from "./storage";

const POLL_INTERVAL_MS = 60_000;     // check every 60s — PayPal isn't as
                                      // latency-sensitive as M-Pesa STK.
const MIN_AGE_SECONDS = 60;          // give the client's own onApprove/
                                      // capture-order call a head start
                                      // before the poller steps in.
const RECHECK_INTERVAL_MS = 5 * 60_000; // don't re-query PayPal for the
                                      // same stuck order more than once
                                      // every 5 minutes.
const MAX_AGE_HOURS = 6;             // PayPal auto-voids an unapproved
                                      // CREATED order after ~3h; give a
                                      // generous buffer past that before
                                      // we give up and mark the row failed.
const MAX_QUERY_ATTEMPTS = 30;       // hard cap regardless of age — stops
                                      // an order stuck in a persistent
                                      // verification-failure loop from
                                      // being polled forever.

const RECOVERABLE_STATUSES = ["pending", "awaiting_payment", "processing"] as const;

const inFlight = new Set<string>();  // paymentIds currently being processed

let timer: NodeJS.Timeout | null = null;

async function giveUp(payment: any, reason: string): Promise<void> {
  await storage.updatePayment(payment.id, {
    status: "failed",
    failReason: reason,
    statusLastChecked: new Date(),
  } as any).catch((err: any) => {
    console.error("[PaypalRecovery] giveUp updatePayment failed:", {
      error: err?.message, paymentId: payment?.id,
      timestamp: new Date().toISOString(),
    });
  });

  storage.createUserNotification({
    userId: payment.userId,
    type: "warning",
    title: "PayPal Payment Not Completed",
    message: "We were unable to confirm your PayPal payment went through. If you were charged, please contact support with your PayPal receipt.",
  }).catch((err: any) => {
    console.error("[PaypalRecovery] createNotification(giveUp) failed:", {
      error: err?.message, paymentId: payment?.id, userId: payment?.userId,
      timestamp: new Date().toISOString(),
    });
  });

  console.log(`[PaypalRecovery] ✗ Gave up on payment ${payment.id} (${reason})`);
}

async function runPaypalRecovery(): Promise<void> {
  try {
    const now = Date.now();
    const minAgeCutoff = new Date(now - MIN_AGE_SECONDS * 1000);
    const maxAgeCutoff = new Date(now - MAX_AGE_HOURS * 60 * 60 * 1000);
    const recheckCutoff = new Date(now - RECHECK_INTERVAL_MS);

    const results = await Promise.all(
      RECOVERABLE_STATUSES.map((s) => storage.getPaymentsByStatus(s).catch(() => [])),
    );
    const pending = results.flat().filter(
      (p: any) => p.method === "paypal" && !!p.checkoutRequestId && !!p.createdAt,
    );

    if (pending.length === 0) return;

    for (const payment of pending) {
      if (inFlight.has(payment.id)) continue;

      const created = new Date(payment.createdAt).getTime();
      const attempts = (payment as any).queryAttempts ?? 0;

      // Too old or out of attempts — give up rather than poll forever.
      if (created <= maxAgeCutoff.getTime() || attempts >= MAX_QUERY_ATTEMPTS) {
        inFlight.add(payment.id);
        try {
          await giveUp(
            payment,
            created <= maxAgeCutoff.getTime()
              ? `paypal_order_expired_after_${MAX_AGE_HOURS}h`
              : `paypal_recovery_exhausted_after_${MAX_QUERY_ATTEMPTS}_attempts`,
          );
        } finally {
          inFlight.delete(payment.id);
        }
        continue;
      }

      // Too new — let the client's own capture-order call finish normally.
      if (created > minAgeCutoff.getTime()) continue;

      // Checked too recently — don't hammer PayPal's API.
      const lastChecked = (payment as any).statusLastChecked
        ? new Date((payment as any).statusLastChecked).getTime()
        : 0;
      if (lastChecked > recheckCutoff.getTime()) continue;

      inFlight.add(payment.id);
      try {
        await storage.updatePayment(payment.id, {
          queryAttempts: attempts + 1,
          statusLastChecked: new Date(),
        } as any).catch((err: any) => {
          console.error("[PaypalRecovery] updatePayment(queryAttempts) failed:", {
            error: err?.message, paymentId: payment?.id,
            timestamp: new Date().toISOString(),
          });
        });

        const { completePayPalCapture } = await import("./services/paypalCapture");
        const result = await completePayPalCapture({
          paypalOrderId: payment.checkoutRequestId,
          paymentId: payment.id,
          userId: payment.userId,
          source: "recovery",
        });

        if (result.status === 200) {
          console.log(`[PaypalRecovery] ✓ Recovered payment ${payment.id} (orderId=${payment.checkoutRequestId})`);
        } else {
          console.log(`[PaypalRecovery] Payment ${payment.id} not yet completable — status=${result.status} body=${JSON.stringify(result.body).slice(0, 200)}`);
        }
      } catch (err: any) {
        console.warn(`[PaypalRecovery] Query error for payment ${payment.id}: ${err?.message}`);
      } finally {
        inFlight.delete(payment.id);
      }
    }
  } catch (err: any) {
    console.error("[PaypalRecovery] Worker error:", err?.message);
  }
}

export function startPaypalRecoveryPoller(): void {
  if (timer) return;
  timer = setInterval(runPaypalRecovery, POLL_INTERVAL_MS);
  // Run shortly after startup to catch anything stuck from before restart.
  setTimeout(runPaypalRecovery, 10_000);
  console.log("[PaypalRecovery] Auto-recovery poller started (every 60s, gives up after 6h or 30 attempts)");
}

export function stopPaypalRecoveryPoller(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

// ── Exported helper for admin batch use ─────────────────────────────────────
export { runPaypalRecovery };
