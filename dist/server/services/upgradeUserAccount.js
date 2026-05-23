"use strict";
// @ts-nocheck
/**
 * upgradeUserAccount — Centralized, verified plan activation.
 *
 * Called after BOTH M-Pesa callback verification AND PayPal capture.
 * Never call this before the gateway has confirmed the transaction.
 *
 * Security guarantees:
 *  • User lookup is email-first: if an email is provided, the user is found by
 *    email before falling back to userId. If neither resolves a user, the upgrade
 *    is BLOCKED loudly — never silently ignored.
 *  • Duplicate-transaction guard: rejects if transactionId already "completed"
 *  • Idempotent service unlock (ON CONFLICT DO UPDATE)
 *  • No trust of client-side data — all inputs come from server-verified gateway responses
 *  • service_id gate: every payment MUST carry a plan_* serviceId — no amount-based plan derivation
 *  • Minimum-amount gate: secondary sanity check — amount must still meet plan floor after serviceId resolves it
 *
 * Plan resolution:
 *  serviceId prefix ONLY — "plan_pro" → "pro". Amount-based derivation has been removed.
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
exports.PLAN_DURATION_DAYS = exports.PLAN_MIN_AMOUNTS = void 0;
exports.upgradeUserAccount = upgradeUserAccount;
const storage_1 = require("../storage");
const db_1 = require("../db");
const schema_1 = require("@shared/schema");
const COUNTRY_NAMES = {
    KE: "Kenya", UG: "Uganda", TZ: "Tanzania", RW: "Rwanda", ET: "Ethiopia",
    GH: "Ghana", NG: "Nigeria", ZA: "South Africa", ZM: "Zambia", ZW: "Zimbabwe",
    US: "USA", GB: "UK", CA: "Canada", AU: "Australia", AE: "UAE",
    DE: "Germany", NL: "Netherlands", FR: "France", SE: "Sweden", NO: "Norway",
};
/**
 * Authorized minimum KES amounts for each plan — used only as a secondary
 * sanity guard after serviceId has already resolved the plan.
 * Plan resolution is always driven by serviceId, never by amount alone.
 */
exports.PLAN_MIN_AMOUNTS = {
    trial: 99, // 1 Day Trial
    monthly: 1000, // 30-day Monthly
    yearly: 4500, // 365-day Yearly
    pro: 4500, // legacy alias for yearly
};
/**
 * Duration in days for each plan type.
 */
exports.PLAN_DURATION_DAYS = {
    trial: 1,
    monthly: 30,
    yearly: 365,
    pro: 365, // legacy alias — updated from 360 to 365
};
async function upgradeUserAccount(opts) {
    const { userId, email, phone, planType, transactionId, paymentId, method, amountKes, extraMeta, } = opts;
    const serviceId = opts.serviceId || "main_subscription";
    // ── 0. User lookup: email → userId → phone (in priority order) ────────────
    // 1st: email (canonical, unique identifier)
    // 2nd: userId (session-linked identifier from payment record)
    // 3rd: phone (normalized 254XXXXXXXXX — last resort for M-Pesa paybill payments)
    // If none resolves a user, BLOCK loudly — never silently proceed.
    let user = email ? await storage_1.storage.getUserByEmail(email) : undefined;
    let lookupMethod = "email";
    if (!user) {
        console.info(`[Upgrade] email lookup failed (${email ?? "none"}) — trying userId=${userId}`);
        user = await storage_1.storage.getUserById(userId);
        lookupMethod = "userId";
    }
    if (!user && phone) {
        const { normalizePhone } = await Promise.resolve().then(() => __importStar(require("../utils/phone")));
        const normalizedPhone = normalizePhone(phone);
        console.info(`[Upgrade] userId lookup failed — trying phone="${normalizedPhone}"`);
        user = await storage_1.storage.getUserByPhone(normalizedPhone);
        lookupMethod = `phone=${normalizedPhone}`;
    }
    if (!user) {
        // CRITICAL: no user found by email, userId, or phone — hard block
        const identity = [
            email ? `email=${email}` : null,
            `userId=${userId}`,
            phone ? `phone=${phone}` : null,
        ].filter(Boolean).join(" / ");
        console.error(`[Upgrade][CRITICAL] User NOT FOUND in database: ${identity} ` +
            `| paymentId=${paymentId} | txn=${transactionId} | method=${method} | KES=${amountKes} ` +
            `| serviceId=${serviceId} — upgrade BLOCKED. Payment remains for manual review.`);
        await storage_1.storage.updatePayment(paymentId, {
            status: "failed",
            failReason: `user_not_found:${identity}`,
        }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        console.error(`[Payment][UPGRADE] FAILED | reason=user_not_found | ${identity} ` +
            `| paymentId=${paymentId} | txn=${transactionId} | method=${method.toUpperCase()} | KES=${amountKes}`);
        return {
            success: false,
            planActivated: planType,
            expiresAt: new Date(),
            blocked: true,
            error: `User not found (${identity}). Payment ${paymentId} flagged for manual review.`,
        };
    }
    if (lookupMethod !== "email" && lookupMethod !== "userId") {
        console.info(`[Upgrade] User resolved via ${lookupMethod} → userId=${user.id} email=${user.email}`);
    }
    // If we found the user by email but the userId differs, log the discrepancy
    if (user.id !== userId) {
        console.warn(`[Upgrade][EmailMismatch] Found user by email=${email} with id=${user.id} ` +
            `but payment record has userId=${userId} — using email-resolved user.id`);
    }
    const resolvedUserId = user.id;
    // ── 1. Duplicate-transaction guard ────────────────────────────────────────
    const existing = await storage_1.storage.getPaymentByTransactionRef(transactionId);
    if (existing && existing.status === "completed" && existing.id !== paymentId) {
        console.warn(`[Upgrade] Duplicate transactionId blocked: ${transactionId} | ` +
            `existingPaymentId=${existing.id} | userId=${resolvedUserId}`);
        return { success: false, planActivated: planType, expiresAt: new Date(), alreadyProcessed: true };
    }
    // ── 2. Resolve plan from serviceId — serviceId is REQUIRED ───────────────
    // Amount-based plan derivation has been removed.
    // Every payment must carry a plan_* serviceId (e.g. "plan_pro").
    if (!serviceId.startsWith("plan_")) {
        console.error(`[Upgrade][SECURITY] serviceId="${serviceId}" is not a plan_* identifier — upgrade BLOCKED. ` +
            `userId=${resolvedUserId} txn=${transactionId} method=${method}`);
        await storage_1.storage.updatePayment(paymentId, {
            status: "failed",
            isSuspicious: true,
            fraudReason: `invalid_service_id:${serviceId}`,
        }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        return {
            success: false,
            planActivated: planType,
            expiresAt: new Date(),
            blocked: true,
            error: `serviceId must start with "plan_". Amount-based plan derivation has been removed.`,
        };
    }
    const resolvedPlan = serviceId.replace("plan_", "");
    // ── 3. Amount gate — secondary fraud defence for web payments ─────────────
    // All payments (M-Pesa and PayPal) are server-verified before this function
    // is called. This floor check is a final sanity guard only.
    const minRequired = exports.PLAN_MIN_AMOUNTS[resolvedPlan] ?? exports.PLAN_MIN_AMOUNTS.pro;
    if (amountKes < minRequired) {
        console.error(`[Upgrade][SECURITY] Amount gate FAILED for user ${resolvedUserId}: ` +
            `plan=${resolvedPlan} requires KES ${minRequired} but only KES ${amountKes} received | ` +
            `txn=${transactionId} method=${method}`);
        await storage_1.storage.updatePayment(paymentId, {
            status: "failed",
            isSuspicious: true,
            fraudReason: `insufficient_amount:required=${minRequired},got=${amountKes}`,
        }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        await storage_1.storage.createUserNotification({
            userId: resolvedUserId,
            type: "error",
            title: "Payment Amount Insufficient",
            message: `Your payment of KES ${amountKes} was received but does not meet the KES ${minRequired} required for the ${resolvedPlan} plan. Please contact support.`,
        }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        console.error(`[Payment][UPGRADE] FAILED | reason=insufficient_amount | userId=${resolvedUserId} ` +
            `| paymentId=${paymentId} | txn=${transactionId} | method=${method.toUpperCase()} ` +
            `| KES=${amountKes} | required=${minRequired} | plan=${resolvedPlan}`);
        return {
            success: false,
            planActivated: resolvedPlan,
            expiresAt: new Date(),
            blocked: true,
            error: `KES ${amountKes} is below the KES ${minRequired} minimum for the ${resolvedPlan} plan.`,
        };
    }
    // ── 4. Mark payment as completed — stamp email + planId for full audit trail ──
    try {
        await storage_1.storage.updatePayment(paymentId, {
            status: "completed",
            transactionRef: transactionId,
            email: user.email || null,
            planId: resolvedPlan,
        });
        console.log(`[Upgrade] Payment ${paymentId} completed: userId=${resolvedUserId} email=${user.email} plan=${resolvedPlan} txn=${transactionId}`);
    }
    catch (err) {
        console.error(`[Upgrade] Failed to update payment record ${paymentId}:`, err.message);
    }
    // ── 5. Activate subscription ───────────────────────────────────────────────
    // Duration is plan-specific: trial=1d, monthly=30d, yearly/pro=365d
    const durationDays = exports.PLAN_DURATION_DAYS[resolvedPlan] ?? exports.PLAN_DURATION_DAYS.pro;
    const durationMs = durationDays * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + durationMs);
    if (serviceId.startsWith("plan_")) {
        await storage_1.storage.activateUserPlan(resolvedUserId, resolvedPlan, paymentId, expiresAt);
        console.log(`[Upgrade][${method.toUpperCase()}] User ${resolvedUserId} → ${resolvedPlan} ` +
            `| expires ${expiresAt.toISOString()} | txn: ${transactionId} | KES ${amountKes}`);
    }
    else {
        await storage_1.storage.activateUserPlan(resolvedUserId, resolvedPlan, paymentId, expiresAt);
        console.log(`[Upgrade][${method.toUpperCase()}] Subscription created for user ${resolvedUserId} → ${resolvedPlan} ` +
            `| expires ${expiresAt.toISOString()} | txn: ${transactionId} | KES ${amountKes}`);
    }
    // ── 6. Unlock service access (idempotent) ─────────────────────────────────
    storage_1.storage
        .unlockService(resolvedUserId, serviceId, paymentId, {
        transactionId,
        method,
        amountKes,
        ...extraMeta,
    })
        .catch((err) => console.error(`[Upgrade][ServiceUnlock] Error for user ${resolvedUserId}:`, err.message));
    // ── 7. Funnel stage: mark as paid ─────────────────────────────────────────
    storage_1.storage.updateUserStage(resolvedUserId, "paid").catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
    // ── 8. In-app notification ────────────────────────────────────────────────
    const planLabel = resolvedPlan.charAt(0).toUpperCase() + resolvedPlan.slice(1);
    storage_1.storage
        .createUserNotification({
        userId: resolvedUserId,
        type: "success",
        title: `${planLabel} Plan Activated!`,
        message: `Your ${planLabel} plan is now active until ${expiresAt.toLocaleDateString("en-KE")}. ` +
            `${method === "mpesa" ? "M-Pesa" : "PayPal"} Ref: ${transactionId}.`,
    })
        .catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
    // ── 9. Real-time WebSocket push to user's browser ─────────────────────────
    Promise.resolve().then(() => __importStar(require("../websocket"))).then(({ notifyUserPlanActivated }) => {
        notifyUserPlanActivated(resolvedUserId, {
            type: "plan_activated",
            planId: resolvedPlan,
            expiresAt: expiresAt.toISOString(),
            method,
            transactionId,
        });
    })
        .catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
    console.info(`[Payment][UPGRADE] SUCCESS | userId=${resolvedUserId} | email=${user.email || "unknown"} ` +
        `| plan=${resolvedPlan} | txn=${transactionId} | method=${method.toUpperCase()} ` +
        `| KES=${amountKes} | expiresAt=${expiresAt.toISOString()}`);
    console.log(`User upgraded successfully: ${user.email || resolvedUserId} → ${resolvedPlan} (${method.toUpperCase()} KES ${amountKes})`);
    // Write real activity event — fire and forget, no personal data stored
    const upgradeLocation = user.country ? (COUNTRY_NAMES[user.country.toUpperCase()] || null) : null;
    db_1.db.insert(schema_1.activityEvents).values({
        type: "upgrade",
        location: upgradeLocation,
    }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
    // Mirror to Firebase RTDB — subscription + payment record + daily/monthly revenue rollup
    Promise.resolve().then(() => __importStar(require("./firebaseRtdb"))).then(({ pushActivityEvent, recordPaymentEvent, trackRevenue }) => {
        pushActivityEvent("upgrade", upgradeLocation);
        const planLabels = {
            trial: `1 Day Trial (${durationDays}d)`,
            monthly: `Monthly Access (${durationDays}d)`,
            yearly: `Yearly Access (${durationDays}d)`,
            pro: `Yearly Access (${durationDays}d)`,
        };
        recordPaymentEvent({
            userId: resolvedUserId,
            paymentId,
            amountKes,
            reference: transactionId,
            method,
            creditCount: 0,
            serviceLabel: planLabels[resolvedPlan] ?? `${planLabel} Plan Subscription (${durationDays}d)`,
            serviceId,
            subscriptionKey: `${resolvedPlan}_plan`,
            subscriptionExpiryMs: expiresAt.getTime(),
        }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        // trackRevenue writes to revenue/daily and revenue/monthly for the Live Dashboard
        trackRevenue({
            userId: resolvedUserId,
            amountKes,
            serviceId,
            method,
            reference: transactionId,
        }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
    }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
    Promise.resolve().then(() => __importStar(require("./activityLogger"))).then(({ logActivity }) => {
        logActivity({
            event: "user_upgraded",
            userId: resolvedUserId,
            email: user.email ?? undefined,
            meta: {
                plan: resolvedPlan,
                method: method.toUpperCase(),
                amountKes,
                transactionId,
                paymentId,
                expiresAt: expiresAt.toISOString(),
            },
        });
    }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
    // Track CV funnel: 'upgraded' (fires for both M-Pesa and PayPal)
    Promise.resolve().then(() => __importStar(require("./firebaseRtdb"))).then(({ trackCvFunnelEvent }) => {
        trackCvFunnelEvent(resolvedUserId, "upgraded", {
            plan: resolvedPlan,
            method: method.toUpperCase(),
            amountKes,
            transactionId,
        });
    }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
    return { success: true, planActivated: resolvedPlan, expiresAt };
}
