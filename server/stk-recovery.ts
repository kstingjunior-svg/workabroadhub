/**
 * STK Auto-Recovery Poller — Production-hardened
 *
 * Safaricom's STK callback is unreliable — it sometimes never arrives.
 * This poller queries Safaricom proactively to resolve stuck payments.
 *
 * State machine:
 *  awaiting_payment (>60s) → query Safaricom every 30s (up to MAX_QUERY_ATTEMPTS)
 *  ResultCode=0            → immediate Pro upgrade + WebSocket push
 *  ResultCode=1037         → STK timeout → auto-retry STK once
 *  Other FAIL_CODE         → mark retry_available (user can retry)
 *  >5 min & still pending  → mark TIMED_OUT (retry_available, no callback)
 *
 * Auto-timeout rule:
 *  Any awaiting_payment older than AUTO_TIMEOUT_MINUTES without a callback
 *  is automatically moved to retry_available with reason=auto_timeout.
 *  This eliminates the "Awaiting Payment" ghost state.
 */

import { storage } from "./storage";
import { stkQuery, stkPush } from "./mpesa";
import { sendProActivationEmail } from "./email";
import { notifyPaymentRecovery } from "./sms";
import { db } from "./db";
import { payments } from "@shared/schema";
import { eq, and, lt, isNull, sql } from "drizzle-orm";
import { planExpiry } from "./utils/plans";

const POLL_INTERVAL_MS    = 30_000;   // run every 30 seconds
const MIN_AGE_SECONDS     = 60;       // start querying after 60s (STK PIN window)
const AUTO_TIMEOUT_MINUTES = 5;       // auto-timeout awaiting_payment after 5 min
const MAX_AGE_MINUTES     = 12;       // hard stop querying at 12 min (STK fully expired)
const MAX_QUERY_ATTEMPTS  = 10;       // max STK Query API calls per payment

const inFlight = new Set<string>();   // paymentIds currently being processed

// ResultCodes that mean the payment definitively failed
const FAIL_CODES = new Set([1032, 1037, 2001, 17, 1]);
// ResultCode 1037 = STK push timeout (user didn't enter PIN)
const TIMEOUT_CODE = 1037;

let timer: NodeJS.Timeout | null = null;


async function handleSuccess(payment: any, receipt: string): Promise<void> {
  const expiresAt = planExpiry();
  const receiptStr = String(receipt || `RECOVERED-${Date.now()}`);

  await storage.updatePayment(payment.id, {
    status: "success",
    transactionRef: receiptStr,
    statusLastChecked: new Date(),
  } as any);

  await storage.activateUserPlan(payment.userId, (payment as any).planId || "pro", payment.id, expiresAt);
  await storage.updateUserStage(payment.userId, "paid").catch((err: any) => {
    console.error("[StkRecovery] updateUserStage failed:", {
      error: err?.message, paymentId: payment?.id, userId: payment?.userId,
      timestamp: new Date().toISOString(),
    });
  });

  // In-app notification
  storage.createUserNotification({
    userId: payment.userId,
    type: "success",
    title: "Pro Plan Activated",
    message: `Your M-Pesa payment was confirmed (${receiptStr}). Pro plan active — expires ${expiresAt.toLocaleDateString("en-KE")}.`,
  }).catch((err: any) => {
    console.error("[StkRecovery] createNotification(success) failed:", {
      error: err?.message, paymentId: payment?.id, userId: payment?.userId,
      timestamp: new Date().toISOString(),
    });
  });

  // WebSocket push — instant UI update without refresh
  import("./websocket").then(({ notifyUserPlanActivated }) => {
    notifyUserPlanActivated(payment.userId, {
      type: "plan_activated",
      planId: "pro",
      expiresAt: expiresAt.toISOString(),
      method: "mpesa",
      transactionId: receiptStr,
    });
  }).catch((err: any) => {
    console.error("[StkRecovery] WebSocket push failed:", {
      error: err?.message, paymentId: payment?.id, userId: payment?.userId,
      timestamp: new Date().toISOString(),
    });
  });

  // Confirmation email
  try {
    const user = await storage.getUserById(payment.userId);
    if (user?.email) {
      await sendProActivationEmail(user.email, user.firstName || "", expiresAt, receiptStr);
    }
  } catch (emailErr: any) {
    console.warn(`[StkRecovery] Email failed for payment ${payment.id}: ${emailErr.message}`);
  }

  console.log(`[StkRecovery] ✓ Auto-recovered payment ${payment.id} → receipt ${receiptStr}`);
}

async function handleFailure(payment: any, code: number, desc: string): Promise<void> {
  const retryCount = (payment as any).retryCount ?? 0;
  const maxRetries = (payment as any).maxRetries ?? 3;
  const isTimeout = code === TIMEOUT_CODE;

  // For 1037 (STK timeout), auto-retry STK once if retryCount < 1
  if (isTimeout && retryCount < 1) {
    console.log(`[StkRecovery] Payment ${payment.id} timed out (1037) — auto-retrying STK push`);
    try {
      // Parse phone from metadata
      let phone: string | undefined;
      try {
        const meta = JSON.parse(payment.metadata || "{}");
        phone = meta.phone as string | undefined;
      } catch {}

      if (phone) {
        // Mark current payment as exhausted, create new STK push via retry
        await storage.updatePayment(payment.id, {
          status: "retry_available",
          retryCount: 1,
          failReason: `STK timeout (1037) — auto-retry sent`,
          statusLastChecked: new Date(),
        } as any);

        // Use payment-retry to dispatch a new STK push
        const { retryPayment } = await import("./payment-retry");
        const result = await retryPayment(payment.id, "auto");
        console.log(`[StkRecovery] Auto-retry for ${payment.id}: ${result.status} — ${result.message}`);
        return;
      }
    } catch (retryErr: any) {
      console.warn(`[StkRecovery] Auto-retry failed for ${payment.id}: ${retryErr.message}`);
    }
  }

  const canRetry = retryCount < maxRetries && !(payment as any).isSuspicious;

  await storage.updatePayment(payment.id, {
    status: canRetry ? "retry_available" : "failed",
    failReason: desc || `STK failed (code ${code})`,
    statusLastChecked: new Date(),
  } as any);

  // Notify user
  storage.createUserNotification({
    userId: payment.userId,
    type: "warning",
    title: canRetry ? "Payment Failed — Retry Available" : "Payment Failed",
    message: canRetry
      ? `Your M-Pesa payment was not completed (${desc || "cancelled"}). Tap "Retry Payment" to try again.`
      : `Your M-Pesa payment was not completed after multiple attempts. Please start a new payment.`,
  }).catch((err: any) => {
    console.error("[StkRecovery] createNotification(failure) failed:", {
      error: err?.message, paymentId: payment?.id, userId: payment?.userId,
      timestamp: new Date().toISOString(),
    });
  });

  // WhatsApp/SMS recovery nudge
  storage.getUserById(payment.userId).then(async (user) => {
    if (user?.phone) {
      await notifyPaymentRecovery(user.phone);
    }
  }).catch((err: any) => {
    console.error("[StkRecovery] notifyPaymentRecovery(failure) failed:", {
      error: err?.message, paymentId: payment?.id, userId: payment?.userId,
      timestamp: new Date().toISOString(),
    });
  });

  console.log(`[StkRecovery] ✗ Payment ${payment.id} failed (code=${code}) → ${canRetry ? "retry_available" : "failed"}`);
}

async function autoTimeoutAwaiting(): Promise<void> {
  // Payments older than AUTO_TIMEOUT_MINUTES with no callback → move to retry_available
  const cutoff = new Date(Date.now() - AUTO_TIMEOUT_MINUTES * 60 * 1000);

  // Try querying with callbackReceivedAt first; fall back to without if column is missing
  // (can happen if production DB hasn't had the column migrated yet)
  let timedOut: any[] = [];
  try {
    timedOut = await db
      .select()
      .from(payments)
      .where(
        and(
          sql`${payments.status} = 'awaiting_payment'`,
          sql`${payments.method} = 'mpesa'`,
          sql`${payments.createdAt} < ${cutoff}`,
          sql`${payments.callbackReceivedAt} IS NULL`
        )
      )
      .limit(50);
  } catch (colErr: any) {
    // Column doesn't exist yet — fall back to querying without it
    console.warn(`[StkRecovery] callbackReceivedAt column missing, using fallback query: ${colErr.message}`);
    timedOut = await db
      .select()
      .from(payments)
      .where(
        and(
          sql`status = 'awaiting_payment'`,
          sql`method = 'mpesa'`,
          sql`created_at < ${cutoff}`
        )
      )
      .limit(50);
  }

  for (const payment of timedOut) {
    if (inFlight.has(payment.id)) continue;
    inFlight.add(payment.id);
    try {
      const retryCount = payment.retryCount ?? 0;
      const maxRetries = payment.maxRetries ?? 3;
      const canRetry = retryCount < maxRetries;

      await storage.updatePayment(payment.id, {
        status: canRetry ? "retry_available" : "failed",
        failReason: "No callback received within 5 minutes — STK push timed out",
        statusLastChecked: new Date(),
      } as any);

      storage.createUserNotification({
        userId: payment.userId,
        type: "warning",
        title: "Payment Timed Out",
        message: canRetry
          ? "Your M-Pesa payment session expired before confirmation. Tap \"Retry Payment\" to try again."
          : "Your M-Pesa payment expired. Please start a new payment.",
      }).catch((err: any) => {
        console.error("[StkRecovery] createNotification(timeout) failed:", {
          error: err?.message, paymentId: payment?.id, userId: payment?.userId,
          timestamp: new Date().toISOString(),
        });
      });

      // WhatsApp nudge
      storage.getUserById(payment.userId).then(async (u) => {
        if (u?.phone) await notifyPaymentRecovery(u.phone);
      }).catch((err: any) => {
        console.error("[StkRecovery] notifyPaymentRecovery(timeout) failed:", {
          error: err?.message, paymentId: payment?.id, userId: payment?.userId,
          timestamp: new Date().toISOString(),
        });
      });

      console.log(`[StkRecovery] Auto-timed out payment ${payment.id} (created ${payment.createdAt}) → ${canRetry ? "retry_available" : "failed"}`);
    } finally {
      inFlight.delete(payment.id);
    }
  }
}

async function runStkRecovery(): Promise<void> {
  try {
    // 1. Auto-timeout payments that have been awaiting for >5 min with no callback
    await autoTimeoutAwaiting();

    const now = Date.now();
    const minAge = new Date(now - MIN_AGE_SECONDS * 1000);
    const maxAge = new Date(now - MAX_AGE_MINUTES * 60 * 1000);

    // 2. Query Safaricom for payments in the active query window (60s – 12min)
    const pending = await storage.getPaymentsByStatus("awaiting_payment");

    const candidates = pending.filter((p: any) => {
      if (!p.transactionRef?.startsWith("ws_CO_")) return false;
      if (!p.createdAt) return false;
      const created = new Date(p.createdAt).getTime();
      if (created >= minAge.getTime()) return false; // too new
      if (created <= maxAge.getTime()) return false; // too old (expired)
      if ((p.queryAttempts ?? 0) >= MAX_QUERY_ATTEMPTS) return false; // exhausted
      return true;
    });

    if (candidates.length === 0) return;

    console.log(`[StkRecovery] Querying Safaricom for ${candidates.length} in-progress payment(s)`);

    for (const payment of candidates) {
      if (inFlight.has(payment.id)) continue;
      inFlight.add(payment.id);

      try {
        // Update query attempt count and last checked time (best-effort — columns may not exist yet)
        await storage.updatePayment(payment.id, {
          queryAttempts: ((payment as any).queryAttempts ?? 0) + 1,
          statusLastChecked: new Date(),
        } as any).catch((err: any) => {
          console.error("[StkRecovery] updatePayment(queryAttempts) failed:", {
            error: err?.message, paymentId: payment?.id,
            timestamp: new Date().toISOString(),
          });
        });

        const result = await stkQuery(payment.transactionRef!);
        const code = Number(result.ResultCode);

        console.log(`[StkRecovery] Payment ${payment.id} → ResultCode=${code} (${result.ResultDesc})`);

        if (code === 0) {
          const receipt =
            result.CallbackMetadata?.Item?.find((i: any) => i.Name === "MpesaReceiptNumber")?.Value
            || result.MpesaReceiptNumber
            || `RECOVERED-${Date.now()}`;
          await handleSuccess(payment, String(receipt));

        } else if (FAIL_CODES.has(code)) {
          await handleFailure(payment, code, result.ResultDesc || `STK failed (code ${code})`);

        } else {
          // Still processing — leave for next poll
          console.log(`[StkRecovery] Payment ${payment.id} still pending (ResultCode=${code})`);
        }
      } catch (err: any) {
        console.warn(`[StkRecovery] Query error for payment ${payment.id}: ${err.message}`);
      } finally {
        inFlight.delete(payment.id);
      }
    }
  } catch (err: any) {
    console.error("[StkRecovery] Worker error:", err.message);
  }
}

export function startStkRecoveryPoller(): void {
  if (timer) return;
  timer = setInterval(runStkRecovery, POLL_INTERVAL_MS);
  // Run immediately on startup to catch any payments stuck from before restart
  setTimeout(runStkRecovery, 5000);
  console.log("[StkRecovery] Auto-recovery poller started (every 30s, auto-timeout at 5min)");
}

export function stopStkRecoveryPoller(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

// ── Exported helper for admin batch query ──────────────────────────────────────
export { runStkRecovery };
