/**
 * Payment Retry & Recovery Worker
 *
 * Responsibilities:
 *  1. Auto-retry: every 30 s, find `retry_available` payments that failed due to
 *     timeout and have retryCount=0 (first-time auto-retry), then dispatch them.
 *  2. Gateway dispatch: wraps the universal payment router for retry scenarios.
 *  3. Recovery: on a successful retry, activates the related service.
 *
 * Safety guards:
 *  - Never retries paid, refunded, or suspicious payments.
 *  - Respects retryCount < maxRetries.
 *  - Does not run concurrent retries on the same payment (via in-flight set).
 */

import { storage } from "./storage";
import { routePayment } from "./services/payments/paymentRouter";
import type { CreatePaymentRequest } from "./services/payments/types";

const AUTO_RETRY_INTERVAL_MS = 30_000;
const MAX_AUTO_RETRY_ATTEMPT = 1; // only auto-retry once; manual retries handle the rest

const inFlight = new Set<string>(); // paymentIds currently being retried

// ─── Core Retry Logic ────────────────────────────────────────────────────────

export interface RetryResult {
  success: boolean;
  status: "retry_available" | "success" | "failed" | "exhausted";
  retryRemaining: number;
  gatewayRef?: string;
  message: string;
}

export async function retryPayment(
  paymentId: string,
  requestedBy: "user" | "auto" = "user",
): Promise<RetryResult> {
  const payment = await storage.getPaymentById(paymentId);

  if (!payment) {
    return { success: false, status: "failed", retryRemaining: 0, message: "Payment not found" };
  }

  // ── Safety guards ──────────────────────────────────────────────────────────
  const SAFE_TERMINAL = ["success", "refunded", "refund_pending"];
  if (SAFE_TERMINAL.includes(payment.status)) {
    return {
      success: false,
      status: "failed",
      retryRemaining: 0,
      message: `Cannot retry a payment with status "${payment.status}"`,
    };
  }

  if (payment.isSuspicious) {
    return {
      success: false,
      status: "failed",
      retryRemaining: 0,
      message: "Cannot retry a flagged suspicious payment",
    };
  }

  if (payment.status !== "retry_available") {
    return {
      success: false,
      status: "failed",
      retryRemaining: Math.max(0, (payment.maxRetries ?? 3) - (payment.retryCount ?? 0)),
      message: `Payment is not in retry_available state (current: ${payment.status})`,
    };
  }

  const retryCount = payment.retryCount ?? 0;
  const maxRetries = payment.maxRetries ?? 3;

  if (retryCount >= maxRetries) {
    await storage.updatePayment(paymentId, { status: "failed" });
    return { success: false, status: "exhausted", retryRemaining: 0, message: "Max retries reached" };
  }

  if (inFlight.has(paymentId)) {
    return {
      success: false,
      status: "retry_available",
      retryRemaining: maxRetries - retryCount,
      message: "Retry already in progress for this payment",
    };
  }

  inFlight.add(paymentId);

  try {
    // ── Extract original gateway parameters from metadata ──────────────────
    let meta: Record<string, any> = {};
    try { meta = JSON.parse(payment.metadata || "{}"); } catch {}

    const phone = meta.phone as string | undefined;
    const attemptNumber = retryCount + 1;

    // ── Dispatch to gateway ────────────────────────────────────────────────
    const req: CreatePaymentRequest = {
      orderId: paymentId,
      orderType: "payment",
      paymentMethod: payment.method as any,
      amount: payment.amount,
      currency: payment.currency || "KES",
      description: "WorkAbroad Hub Subscription (Retry)",
      userId: payment.userId,
      phone,
    };

    // Mark payment as retrying (awaiting_payment)
    await storage.updatePayment(paymentId, {
      status: "awaiting_payment",
      retryCount: attemptNumber,
      lastRetryAt: new Date(),
    } as any);

    let gatewayResult: Awaited<ReturnType<typeof routePayment>>;
    try {
      gatewayResult = await routePayment(req);
    } catch (err: any) {
      gatewayResult = {
        success: false,
        paymentMethod: payment.method as any,
        orderId: paymentId,
        status: "failed",
        error: err.message || "Gateway error",
      };
    }

    // ── Log the attempt ────────────────────────────────────────────────────
    await storage.createPaymentRetryLog({
      paymentId,
      attempt: attemptNumber,
      gateway: payment.method,
      result: gatewayResult.success ? "success" : "failed",
      gatewayRef: gatewayResult.gatewayRef,
      errorMessage: gatewayResult.error,
      metadata: JSON.stringify({ requestedBy, gatewayRef: gatewayResult.gatewayRef }),
    });

    if (gatewayResult.success) {
      // For M-Pesa: STK push sent — awaiting callback for final success
      // For PayPal: order created — awaiting frontend capture
      console.log(`[PaymentRetry] Retry #${attemptNumber} for ${paymentId} dispatched via ${payment.method}`);
      return {
        success: true,
        status: "retry_available",          // still needs callback/capture to become success
        retryRemaining: maxRetries - attemptNumber,
        gatewayRef: gatewayResult.gatewayRef,
        message: payment.method === "mpesa"
          ? "M-Pesa STK Push sent. Please enter your PIN."
          : "PayPal payment session created.",
      };
    } else {
      // Gateway rejected — mark as retry_available again (or failed if exhausted)
      const newCount = attemptNumber;
      const exhausted = newCount >= maxRetries;
      await storage.updatePayment(paymentId, {
        status: exhausted ? "failed" : "retry_available",
        failReason: gatewayResult.error,
      } as any);

      console.warn(`[PaymentRetry] Retry #${attemptNumber} for ${paymentId} failed: ${gatewayResult.error}`);
      return {
        success: false,
        status: exhausted ? "exhausted" : "retry_available",
        retryRemaining: maxRetries - newCount,
        message: gatewayResult.error || "Retry failed",
      };
    }
  } finally {
    inFlight.delete(paymentId);
  }
}

// ─── Auto-Retry Worker ────────────────────────────────────────────────────────
// Only auto-retries on the very first failure (retryCount=0) — subsequent retries
// are user-initiated.  This covers the "timeout" case (STK push sent but user
// didn't respond in time).

async function runAutoRetry(): Promise<void> {
  try {
    const eligible = await storage.getPaymentsEligibleForAutoRetry();
    const autoRetryable = eligible.filter(p => (p.retryCount ?? 0) < MAX_AUTO_RETRY_ATTEMPT);

    if (autoRetryable.length === 0) return;

    console.log(`[PaymentRetry] Auto-retry: found ${autoRetryable.length} candidate(s)`);

    for (const payment of autoRetryable) {
      // Only auto-retry if the failure is recent (< 5 minutes old) and likely a timeout
      const failedRecently = payment.updatedAt &&
        Date.now() - new Date(payment.updatedAt).getTime() < 5 * 60_000;
      if (!failedRecently) continue;

      console.log(`[PaymentRetry] Auto-retrying payment ${payment.id} (method=${payment.method})`);
      const result = await retryPayment(payment.id, "auto");
      console.log(`[PaymentRetry] Auto-retry result for ${payment.id}: ${result.status} — ${result.message}`);
    }
  } catch (err: any) {
    console.error("[PaymentRetry] Auto-retry worker error:", err.message);
  }
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

let autoRetryTimer: NodeJS.Timeout | null = null;

export function startPaymentRetryScheduler(): void {
  if (autoRetryTimer) return;
  autoRetryTimer = setInterval(runAutoRetry, AUTO_RETRY_INTERVAL_MS);
  console.log("[PaymentRetry] Auto-retry scheduler started (every 30s)");
}

export function stopPaymentRetryScheduler(): void {
  if (autoRetryTimer) {
    clearInterval(autoRetryTimer);
    autoRetryTimer = null;
  }
}
