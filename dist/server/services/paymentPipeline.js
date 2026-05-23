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
    try {
        if (planId && expiresAt) {
            await storage_1.storage.activateUserPlan(user.id, planId, payment.id, expiresAt);
            await db_1.db
                .update(schema_1.users)
                .set({
                plan: planId,
                userStage: "paid",
                isActive: true,
                lastLogin: new Date(),
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(schema_1.users.id, user.id));
            console.log(`[Pipeline] Step 1 ✓ Plan "${planId}" activated | expires=${expiresAt.toISOString()}`);
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
    // ── Step 4: notify ──────────────────────────────────────────────────────────
    // Real-time WebSocket events — fire-and-forget so a missing WS connection
    // never delays the response back to the gateway.
    Promise.resolve().then(() => __importStar(require("../websocket"))).then(({ notifyUserPlanActivated, notifyUserPaymentUpdate }) => {
        if (planId && expiresAt) {
            notifyUserPlanActivated(user.id, {
                type: "plan_activated",
                planId,
                expiresAt: expiresAt.toISOString(),
                method,
                transactionId,
            });
            console.log(`[Pipeline] Step 4 ✓ notifyUserPlanActivated | planId=${planId}`);
        }
        notifyUserPaymentUpdate(user.id, {
            type: "payment_update",
            paymentId: payment.id,
            status: planId ? "completed" : "success",
            amount: payment.amount,
            kind: planId ? "subscription" : (serviceId || "other"),
        });
    }).catch((err) => {
        console.error("[Pipeline] Step 4 WebSocket notify failed:", {
            error: err?.message, paymentId: payment?.id, userId: user?.id,
            timestamp: new Date().toISOString(),
        });
    });
    console.log(`[Pipeline] DONE | userId=${user.id} | txn=${transactionId}`);
}
