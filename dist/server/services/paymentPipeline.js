"use strict";
// @ts-nocheck
/**
 * runPaymentPipeline — canonical post-confirmation orchestrator.
 *
 * Called once a payment gateway (M-Pesa or PayPal) has confirmed receipt.
 * Runs four steps in strict order:
 *
 *   1. processPayment  — activate plan in local DB (if plan purchase); stamp payment delivered
 *   2. unlockService   — idempotent write to user_services (grants hasServiceAccess)
 *   3. deliverService  — WhatsApp message + CV queue / booking confirmation
 *   4. notify          — real-time WebSocket push (plan_activated + payment_update)
 *
 * Each step is isolated: a failure in step N is logged but never aborts N+1 or N+2,
 * except for step 1 which is always awaited because it mutates the authoritative plan state.
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
exports.runPaymentPipeline = runPaymentPipeline;
const db_1 = require("../db");
const schema_1 = require("@shared/schema");
const drizzle_orm_1 = require("drizzle-orm");
const storage_1 = require("../storage");
const delivery_1 = require("./delivery");
const plans_1 = require("../utils/plans");
async function runPaymentPipeline(opts) {
    const { payment, user, method, transactionId, } = opts;
    const planId = opts.planId ?? null;
    const expiresAt = opts.expiresAt ?? (planId ? (0, plans_1.planExpiry)(planId) : null);
    const serviceId = payment.serviceId ?? payment.service_id ??
        (planId ? `plan_${planId}` : "") ?? "";
    const amount = Number(payment.amount ?? 0);
    console.log(`[Pipeline] START | userId=${user.id} | method=${method} | planId=${planId ?? "none"}` +
        ` | serviceId=${serviceId} | txn=${transactionId}`);
    // ── Step 1: processPayment ──────────────────────────────────────────────────
    // Activate the plan in local Postgres and stamp the payment row delivered.
    // Always awaited — this is authoritative state that other reads depend on.
    //
    // 2026-06 SAFETY (Tony's CV Fix Lite bug): defence-in-depth. Even if a
    // caller hands us a non-canonical planId by mistake, we refuse to create
    // a subscription row for it. Service-purchase payments STILL get their
    // unlockService + deliverService steps below — they just don't get a
    // bogus subscription tied to them. The set must match the canonical
    // tiers used by every paid-feature gate (PAID_TIERS in routes.ts).
    const PIPELINE_VALID_TIERS = new Set(["trial", "basic", "monthly", "yearly", "pro", "pro_referral"]);
    const safePlanId = planId && PIPELINE_VALID_TIERS.has(planId) ? planId : null;
    if (planId && !safePlanId) {
        console.warn(`[Pipeline][SAFETY] Refusing to activate non-canonical plan "${planId}" for userId=${user.id} ` +
            `paymentId=${payment.id}. Service delivery still runs; subscription state untouched.`);
    }
    try {
        if (safePlanId && expiresAt) {
            await storage_1.storage.activateUserPlan(user.id, safePlanId, payment.id, expiresAt);
            await db_1.db
                .update(schema_1.users)
                .set({
                // 2026-06: TS cast covers the legacy union; runtime accepts any
                // string because users.plan is varchar with no DB constraint.
                // Trial / monthly / yearly all flow through here successfully.
                plan: safePlanId,
                userStage: "paid",
                isActive: true,
                lastLogin: new Date(),
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(schema_1.users.id, user.id));
            // 2026-06: belt-and-braces verification — read users.plan back and make
            // sure it actually persisted. If it didn't (silent CHECK constraint
            // violation, trigger reject, etc.) we want a loud warning in Render
            // logs instead of letting the paying user back to a "free" dashboard.
            try {
                const [verify] = await db_1.db
                    .select({ plan: schema_1.users.plan, status: schema_1.users.subscriptionStatus })
                    .from(schema_1.users)
                    .where((0, drizzle_orm_1.eq)(schema_1.users.id, user.id))
                    .limit(1);
                if (!verify || verify.plan !== safePlanId) {
                    console.error(`[Pipeline] ⚠ plan persistence MISMATCH for userId=${user.id} — ` +
                        `expected="${safePlanId}" actual="${verify?.plan ?? "missing"}". ` +
                        `Paying user will appear free on next refresh. Investigate now.`);
                }
            }
            catch (verr) {
                console.warn(`[Pipeline] plan verify read failed (non-fatal): ${verr?.message}`);
            }
            // 2026-06: invalidate the /api/auth/user server cache for this user so
            // their next request returns the fresh paid plan instead of a stale
            // "free" record from before the payment.
            try {
                const { invalidateAuthUserCache } = await Promise.resolve().then(() => __importStar(require("../lib/auth-user-cache")));
                invalidateAuthUserCache(user.id);
            }
            catch { /* ignore — best effort */ }
            // 2026-06 REAL-TIME: update the presence registry so the admin Live
            // Sessions panel sees the user's new paid tier immediately. No-op if
            // they're not currently online (no /ws/user connection).
            try {
                const { updatePlan: presenceUpdatePlan } = await Promise.resolve().then(() => __importStar(require("../lib/presence")));
                presenceUpdatePlan(user.id, safePlanId, expiresAt);
            }
            catch { /* ignore */ }
            console.log(`[Pipeline] Step 1 ✓ Plan "${safePlanId}" activated | expires=${expiresAt.toISOString()}`);
        }
        else {
            // Service purchase — mark user as paid but don't touch plan
            await db_1.db
                .update(schema_1.users)
                .set({ userStage: "paid", updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema_1.users.id, user.id));
        }
        await storage_1.storage.updatePayment(payment.id, {
            deliveryStatus: "delivered",
        }).catch((err) => {
            console.error("[Pipeline] Step 1 deliveryStatus stamp failed:", {
                error: err?.message, stack: err?.stack,
                paymentId: payment?.id, userId: user?.id,
                timestamp: new Date().toISOString(),
            });
        });
    }
    catch (err) {
        console.error(`[Pipeline] Step 1 FAILED (processPayment): ${err?.message}`);
        // Continue — delivery and notification should still run
    }
    // ── Step 2: unlockService ───────────────────────────────────────────────────
    // Write the service access row to user_services (idempotent ON CONFLICT DO UPDATE).
    // Non-fatal — a DB error here must never block delivery.
    if (serviceId && payment.id) {
        await storage_1.storage.unlockService(user.id, serviceId, payment.id, {
            method,
            transactionId,
            amountKes: amount,
            unlockedAt: new Date().toISOString(),
        }).then(() => {
            console.log(`[Pipeline] Step 2 ✓ unlockService | userId=${user.id} serviceId=${serviceId}`);
        }).catch((err) => {
            console.error(`[Pipeline] Step 2 FAILED (unlockService): ${err?.message}`);
        });
    }
    // ── Step 3: deliverService ──────────────────────────────────────────────────
    // Service-specific dispatch: WhatsApp confirmation, BullMQ CV queue, etc.
    await (0, delivery_1.deliverService)(payment, user).then(() => {
        console.log(`[Pipeline] Step 3 ✓ deliverService`);
    }).catch((err) => {
        console.error(`[Pipeline] Step 3 FAILED (deliverService): ${err?.message}`);
    });
    // ── Step 3b: Trigger AI generation for unified service-order flow ───────────
    // When a payment was initiated via POST /api/services/order/:slug, the
    // payment.metadata holds the orderId. Fire AI generation now so the
    // download is ready by the time the user finishes polling.
    try {
        const meta = typeof payment.metadata === "string"
            ? JSON.parse(payment.metadata)
            : (payment.metadata ?? {});
        const orderId = meta?.serviceOrderId;
        if (orderId) {
            const { onPaymentSuccessForServiceOrder } = await Promise.resolve().then(() => __importStar(require("../service-order-routes")));
            onPaymentSuccessForServiceOrder(orderId).then(() => console.log(`[Pipeline] Step 3b ✓ service-order AI triggered | orderId=${orderId}`)).catch((err) => console.error(`[Pipeline] Step 3b FAILED: ${err?.message}`));
        }
    }
    catch (err) {
        console.warn(`[Pipeline] Step 3b skipped (metadata parse): ${err?.message}`);
    }
    // ── Step 4: notify ──────────────────────────────────────────────────────────
    // Real-time WebSocket events — fire-and-forget so a missing WS connection
    // never delays the response back to the gateway.
    //
    // 2026-06: gate the "plan_activated" broadcast on safePlanId — if the
    // caller handed us a service ID dressed up as a plan, we already skipped
    // activation above, so we must not tell the UI that a plan was activated.
    Promise.resolve().then(() => __importStar(require("../websocket"))).then(({ notifyUserPlanActivated, notifyUserPaymentUpdate }) => {
        if (safePlanId && expiresAt) {
            notifyUserPlanActivated(user.id, {
                type: "plan_activated",
                planId: safePlanId,
                expiresAt: expiresAt.toISOString(),
                method,
                transactionId,
            });
            console.log(`[Pipeline] Step 4 ✓ notifyUserPlanActivated | planId=${safePlanId}`);
        }
        notifyUserPaymentUpdate(user.id, {
            type: "payment_update",
            paymentId: payment.id,
            status: safePlanId ? "completed" : "success",
            amount: payment.amount,
            kind: safePlanId ? "subscription" : (serviceId || "other"),
        });
    }).catch((err) => {
        console.error("[Pipeline] Step 4 WebSocket notify failed:", {
            error: err?.message, paymentId: payment?.id, userId: user?.id,
            timestamp: new Date().toISOString(),
        });
    });
    console.log(`[Pipeline] DONE | userId=${user.id} | txn=${transactionId}`);
}
