"use strict";
// @ts-nocheck
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startStkRecoveryPoller = startStkRecoveryPoller;
exports.stopStkRecoveryPoller = stopStkRecoveryPoller;
exports.runStkRecovery = runStkRecovery;
const storage_1 = require("./storage");
const mpesa_1 = require("./mpesa");
const email_1 = require("./email");
const sms_1 = require("./sms");
const db_1 = require("./db");
const schema_1 = require("@shared/schema");
const drizzle_orm_1 = require("drizzle-orm");
const plans_1 = require("./utils/plans");
const POLL_INTERVAL_MS = 15000; // 2026-07: halved from 30s so paying users
// see activation within ~15-45s.
const MIN_AGE_SECONDS = 20; // 2026-07: was 60s. Catches STKs the moment
// Safaricom's window opens.
const AUTO_TIMEOUT_MINUTES = 5; // auto-timeout after 5 min
const MAX_AGE_MINUTES = 60; // 2026-07: was 12. Backlog of "failed" 4500
// rows is mostly 12-60 min old stragglers
// we can still recover.
const MAX_QUERY_ATTEMPTS = 40; // 2026-07: was 10. Cover the wider window.
// 2026-07 BUGFIX (Tony's manual-grant burden): the STK push handler for plan
// payments creates rows with status="pending" but this poller was only asking
// storage.getPaymentsByStatus("awaiting_payment"). Result: the poller literally
// never saw plan payments and every KES 4,500 user needed manual activation.
// This set covers every "we're still waiting on Safaricom" status the codebase
// produces so recovery finally kicks in for plan payments too.
const RECOVERABLE_STATUSES = ["pending", "awaiting_payment", "processing"];
const inFlight = new Set(); // paymentIds currently being processed
// ResultCodes that mean the payment definitively failed
const FAIL_CODES = new Set([1032, 1037, 2001, 17, 1]);
// ResultCode 1037 = STK push timeout (user didn't enter PIN)
const TIMEOUT_CODE = 1037;
let timer = null;
async function handleSuccess(payment, receipt) {
    const receiptStr = String(receipt || `RECOVERED-${Date.now()}`);
    // 2026-06 SAFETY: resolve canonical tier from the payment itself — never
    // default to "pro" for a service-only payment (CV Fix Lite, etc.).
    const RECOVERY_VALID_TIERS = new Set(["trial", "basic", "monthly", "yearly", "pro", "pro_referral"]);
    const sid = (payment.serviceId ?? "").toLowerCase();
    const fromService = sid.startsWith("plan_") ? sid.replace("plan_", "") : null;
    const fromPlanId = payment.planId ? String(payment.planId).toLowerCase() : null;
    const resolvedTier = (fromService && RECOVERY_VALID_TIERS.has(fromService)) ? fromService :
        (fromPlanId && RECOVERY_VALID_TIERS.has(fromPlanId)) ? fromPlanId :
            null;
    await storage_1.storage.updatePayment(payment.id, {
        status: "success",
        transactionRef: receiptStr,
        statusLastChecked: new Date(),
    });
    if (!resolvedTier) {
        // Service-only payment — unlock the service, no subscription activation.
        console.log(`[StkRecovery] Service-only payment ${payment.id} (serviceId=${sid}) — unlocking service, no plan activation.`);
        if (sid) {
            await storage_1.storage.unlockService(payment.userId, sid, payment.id, {
                recovered: true, receipt: receiptStr,
            }).catch((err) => console.warn(`[StkRecovery] unlockService failed: ${err?.message}`));
        }
        return;
    }
    const expiresAt = (0, plans_1.planExpiry)(resolvedTier);
    await storage_1.storage.activateUserPlan(payment.userId, resolvedTier, payment.id, expiresAt);
    await storage_1.storage.updateUserStage(payment.userId, "paid").catch((err) => {
        console.error("[StkRecovery] updateUserStage failed:", {
            error: err?.message, paymentId: payment?.id, userId: payment?.userId,
            timestamp: new Date().toISOString(),
        });
    });
    // In-app notification
    storage_1.storage.createUserNotification({
        userId: payment.userId,
        type: "success",
        title: `${resolvedTier.charAt(0).toUpperCase() + resolvedTier.slice(1)} Plan Activated`,
        message: `Your M-Pesa payment was confirmed (${receiptStr}). ${resolvedTier} plan active — expires ${expiresAt.toLocaleDateString("en-KE")}.`,
    }).catch((err) => {
        console.error("[StkRecovery] createNotification(success) failed:", {
            error: err?.message, paymentId: payment?.id, userId: payment?.userId,
            timestamp: new Date().toISOString(),
        });
    });
    // WebSocket push — instant UI update without refresh
    Promise.resolve().then(() => __importStar(require("./websocket"))).then(({ notifyUserPlanActivated }) => {
        notifyUserPlanActivated(payment.userId, {
            type: "plan_activated",
            planId: resolvedTier,
            expiresAt: expiresAt.toISOString(),
            method: "mpesa",
            transactionId: receiptStr,
        });
    }).catch((err) => {
        console.error("[StkRecovery] WebSocket push failed:", {
            error: err?.message, paymentId: payment?.id, userId: payment?.userId,
            timestamp: new Date().toISOString(),
        });
    });
    // Confirmation email
    try {
        const user = await storage_1.storage.getUserById(payment.userId);
        if (user?.email) {
            await (0, email_1.sendProActivationEmail)(user.email, user.firstName || "", expiresAt, receiptStr);
        }
    }
    catch (emailErr) {
        console.warn(`[StkRecovery] Email failed for payment ${payment.id}: ${emailErr.message}`);
    }
    console.log(`[StkRecovery] ✓ Auto-recovered payment ${payment.id} → receipt ${receiptStr}`);
}
async function handleFailure(payment, code, desc) {
    const retryCount = payment.retryCount ?? 0;
    const maxRetries = payment.maxRetries ?? 3;
    const isTimeout = code === TIMEOUT_CODE;
    // For 1037 (STK timeout), auto-retry STK once if retryCount < 1
    if (isTimeout && retryCount < 1) {
        console.log(`[StkRecovery] Payment ${payment.id} timed out (1037) — auto-retrying STK push`);
        try {
            // Parse phone from metadata
            let phone;
            try {
                const meta = JSON.parse(payment.metadata || "{}");
                phone = meta.phone;
            }
            catch { }
            if (phone) {
                // Mark current payment as exhausted, create new STK push via retry
                await storage_1.storage.updatePayment(payment.id, {
                    status: "retry_available",
                    retryCount: 1,
                    failReason: `STK timeout (1037) — auto-retry sent`,
                    statusLastChecked: new Date(),
                });
                // Use payment-retry to dispatch a new STK push
                const { retryPayment } = await Promise.resolve().then(() => __importStar(require("./payment-retry")));
                const result = await retryPayment(payment.id, "auto");
                console.log(`[StkRecovery] Auto-retry for ${payment.id}: ${result.status} — ${result.message}`);
                return;
            }
        }
        catch (retryErr) {
            console.warn(`[StkRecovery] Auto-retry failed for ${payment.id}: ${retryErr.message}`);
        }
    }
    const canRetry = retryCount < maxRetries && !payment.isSuspicious;
    await storage_1.storage.updatePayment(payment.id, {
        status: canRetry ? "retry_available" : "failed",
        failReason: desc || `STK failed (code ${code})`,
        statusLastChecked: new Date(),
    });
    // Notify user
    storage_1.storage.createUserNotification({
        userId: payment.userId,
        type: "warning",
        title: canRetry ? "Payment Failed — Retry Available" : "Payment Failed",
        message: canRetry
            ? `Your M-Pesa payment was not completed (${desc || "cancelled"}). Tap "Retry Payment" to try again.`
            : `Your M-Pesa payment was not completed after multiple attempts. Please start a new payment.`,
    }).catch((err) => {
        console.error("[StkRecovery] createNotification(failure) failed:", {
            error: err?.message, paymentId: payment?.id, userId: payment?.userId,
            timestamp: new Date().toISOString(),
        });
    });
    // WhatsApp/SMS recovery nudge
    storage_1.storage.getUserById(payment.userId).then(async (user) => {
        if (user?.phone) {
            await (0, sms_1.notifyPaymentRecovery)(user.phone);
        }
    }).catch((err) => {
        console.error("[StkRecovery] notifyPaymentRecovery(failure) failed:", {
            error: err?.message, paymentId: payment?.id, userId: payment?.userId,
            timestamp: new Date().toISOString(),
        });
    });
    console.log(`[StkRecovery] ✗ Payment ${payment.id} failed (code=${code}) → ${canRetry ? "retry_available" : "failed"}`);
}
async function autoTimeoutAwaiting() {
    // Payments older than AUTO_TIMEOUT_MINUTES with no callback → move to retry_available
    const cutoff = new Date(Date.now() - AUTO_TIMEOUT_MINUTES * 60 * 1000);
    // Try querying with callbackReceivedAt first; fall back to without if column is missing
    // (can happen if production DB hasn't had the column migrated yet)
    let timedOut = [];
    try {
        timedOut = await db_1.db
            .select()
            .from(schema_1.payments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.sql) `${schema_1.payments.status} IN ('pending', 'awaiting_payment', 'processing')`, (0, drizzle_orm_1.sql) `${schema_1.payments.method} = 'mpesa'`, (0, drizzle_orm_1.sql) `${schema_1.payments.createdAt} < ${cutoff}`, (0, drizzle_orm_1.sql) `${schema_1.payments.callbackReceivedAt} IS NULL`))
            .limit(50);
    }
    catch (colErr) {
        // Column doesn't exist yet — fall back to querying without it
        console.warn(`[StkRecovery] callbackReceivedAt column missing, using fallback query: ${colErr.message}`);
        timedOut = await db_1.db
            .select()
            .from(schema_1.payments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.sql) `status IN ('pending', 'awaiting_payment', 'processing')`, (0, drizzle_orm_1.sql) `method = 'mpesa'`, (0, drizzle_orm_1.sql) `created_at < ${cutoff}`))
            .limit(50);
    }
    for (const payment of timedOut) {
        if (inFlight.has(payment.id))
            continue;
        inFlight.add(payment.id);
        try {
            const retryCount = payment.retryCount ?? 0;
            const maxRetries = payment.maxRetries ?? 3;
            const canRetry = retryCount < maxRetries;
            await storage_1.storage.updatePayment(payment.id, {
                status: canRetry ? "retry_available" : "failed",
                failReason: "No callback received within 5 minutes — STK push timed out",
                statusLastChecked: new Date(),
            });
            storage_1.storage.createUserNotification({
                userId: payment.userId,
                type: "warning",
                title: "Payment Timed Out",
                message: canRetry
                    ? "Your M-Pesa payment session expired before confirmation. Tap \"Retry Payment\" to try again."
                    : "Your M-Pesa payment expired. Please start a new payment.",
            }).catch((err) => {
                console.error("[StkRecovery] createNotification(timeout) failed:", {
                    error: err?.message, paymentId: payment?.id, userId: payment?.userId,
                    timestamp: new Date().toISOString(),
                });
            });
            // WhatsApp nudge
            storage_1.storage.getUserById(payment.userId).then(async (u) => {
                if (u?.phone)
                    await (0, sms_1.notifyPaymentRecovery)(u.phone);
            }).catch((err) => {
                console.error("[StkRecovery] notifyPaymentRecovery(timeout) failed:", {
                    error: err?.message, paymentId: payment?.id, userId: payment?.userId,
                    timestamp: new Date().toISOString(),
                });
            });
            console.log(`[StkRecovery] Auto-timed out payment ${payment.id} (created ${payment.createdAt}) → ${canRetry ? "retry_available" : "failed"}`);
        }
        finally {
            inFlight.delete(payment.id);
        }
    }
}
async function runStkRecovery() {
    try {
        // 1. Auto-timeout payments that have been awaiting for >5 min with no callback
        await autoTimeoutAwaiting();
        const now = Date.now();
        const minAge = new Date(now - MIN_AGE_SECONDS * 1000);
        const maxAge = new Date(now - MAX_AGE_MINUTES * 60 * 1000);
        // 2. Query Safaricom for payments in the active query window
        // 2026-07: pull every "waiting" status the codebase produces so the poller
        // finally covers plan payments (which use "pending"). Silent bug for months.
        const results = await Promise.all(RECOVERABLE_STATUSES.map((s) => storage_1.storage.getPaymentsByStatus(s).catch(() => [])));
        const pending = results.flat();
        const candidates = pending.filter((p) => {
            if (!p.transactionRef?.startsWith("ws_CO_"))
                return false;
            if (!p.createdAt)
                return false;
            const created = new Date(p.createdAt).getTime();
            if (created >= minAge.getTime())
                return false; // too new
            if (created <= maxAge.getTime())
                return false; // too old (expired)
            if ((p.queryAttempts ?? 0) >= MAX_QUERY_ATTEMPTS)
                return false; // exhausted
            return true;
        });
        if (candidates.length === 0)
            return;
        console.log(`[StkRecovery] Querying Safaricom for ${candidates.length} in-progress payment(s)`);
        for (const payment of candidates) {
            if (inFlight.has(payment.id))
                continue;
            inFlight.add(payment.id);
            try {
                // Update query attempt count and last checked time (best-effort — columns may not exist yet)
                await storage_1.storage.updatePayment(payment.id, {
                    queryAttempts: (payment.queryAttempts ?? 0) + 1,
                    statusLastChecked: new Date(),
                }).catch((err) => {
                    console.error("[StkRecovery] updatePayment(queryAttempts) failed:", {
                        error: err?.message, paymentId: payment?.id,
                        timestamp: new Date().toISOString(),
                    });
                });
                const result = await (0, mpesa_1.stkQuery)(payment.transactionRef);
                const code = Number(result.ResultCode);
                console.log(`[StkRecovery] Payment ${payment.id} → ResultCode=${code} (${result.ResultDesc})`);
                if (code === 0) {
                    const receipt = result.CallbackMetadata?.Item?.find((i) => i.Name === "MpesaReceiptNumber")?.Value
                        || result.MpesaReceiptNumber
                        || `RECOVERED-${Date.now()}`;
                    await handleSuccess(payment, String(receipt));
                }
                else if (FAIL_CODES.has(code)) {
                    await handleFailure(payment, code, result.ResultDesc || `STK failed (code ${code})`);
                }
                else {
                    // Still processing — leave for next poll
                    console.log(`[StkRecovery] Payment ${payment.id} still pending (ResultCode=${code})`);
                }
            }
            catch (err) {
                console.warn(`[StkRecovery] Query error for payment ${payment.id}: ${err.message}`);
            }
            finally {
                inFlight.delete(payment.id);
            }
        }
    }
    catch (err) {
        console.error("[StkRecovery] Worker error:", err.message);
    }
}
function startStkRecoveryPoller() {
    if (timer)
        return;
    timer = setInterval(runStkRecovery, POLL_INTERVAL_MS);
    // Run immediately on startup to catch any payments stuck from before restart
    setTimeout(runStkRecovery, 5000);
    console.log("[StkRecovery] Auto-recovery poller started (every 30s, auto-timeout at 5min)");
}
function stopStkRecoveryPoller() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}
