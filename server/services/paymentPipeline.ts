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

import { db, pool } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { deliverService } from "./delivery";
import { planExpiry } from "../utils/plans";

export interface PaymentPipelineOptions {
  payment: any;
  user: any;
  method: "mpesa" | "paypal";
  transactionId: string;          // M-Pesa receipt number or PayPal capture ID
  planId?: string | null;         // "pro" | "basic" etc — present only for plan purchases
  expiresAt?: Date | null;        // pre-computed expiry (omit to auto-compute via planExpiry)
}

export async function runPaymentPipeline(opts: PaymentPipelineOptions): Promise<void> {
  const {
    payment,
    user,
    method,
    transactionId,
  } = opts;

  const planId: string | null = opts.planId ?? null;
  const expiresAt: Date | null =
    opts.expiresAt ?? (planId ? planExpiry(planId) : null);

  const serviceId: string =
    payment.serviceId ?? payment.service_id ??
    (planId ? `plan_${planId}` : "") ?? "";
  const amount = Number(payment.amount ?? 0);

  console.log(
    `[Pipeline] START | userId=${user.id} | method=${method} | planId=${planId ?? "none"}` +
    ` | serviceId=${serviceId} | txn=${transactionId}`,
  );

  // ── Step 1: processPayment ──────────────────────────────────────────────────
  // Activate the plan in local Postgres and stamp the payment row delivered.
  // Always awaited — this is authoritative state that other reads depend on.
  try {
    if (planId && expiresAt) {
      await storage.activateUserPlan(user.id, planId, payment.id, expiresAt);
      await db
        .update(users)
        .set({
          plan:      planId as "free" | "basic" | "pro",
          userStage: "paid",
          isActive:  true,
          lastLogin: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
      console.log(`[Pipeline] Step 1 ✓ Plan "${planId}" activated | expires=${expiresAt.toISOString()}`);
    } else {
      // Service purchase — mark user as paid but don't touch plan
      await db
        .update(users)
        .set({ userStage: "paid", updatedAt: new Date() })
        .where(eq(users.id, user.id));
    }
    await storage.updatePayment(payment.id, {
      deliveryStatus: "delivered",
    } as any).catch((err: any) => {
      console.error("[Pipeline] Step 1 deliveryStatus stamp failed:", {
        error: err?.message, stack: err?.stack,
        paymentId: payment?.id, userId: user?.id,
        timestamp: new Date().toISOString(),
      });
    });
  } catch (err: any) {
    console.error(`[Pipeline] Step 1 FAILED (processPayment): ${err?.message}`);
    // Continue — delivery and notification should still run
  }

  // ── Step 2: unlockService ───────────────────────────────────────────────────
  // Write the service access row to user_services (idempotent ON CONFLICT DO UPDATE).
  // Non-fatal — a DB error here must never block delivery.
  if (serviceId && payment.id) {
    await storage.unlockService(user.id, serviceId, payment.id, {
      method,
      transactionId,
      amountKes: amount,
      unlockedAt: new Date().toISOString(),
    }).then(() => {
      console.log(`[Pipeline] Step 2 ✓ unlockService | userId=${user.id} serviceId=${serviceId}`);
    }).catch((err: any) => {
      console.error(`[Pipeline] Step 2 FAILED (unlockService): ${err?.message}`);
    });
  }

  // ── Step 3: deliverService ──────────────────────────────────────────────────
  // Service-specific dispatch: WhatsApp confirmation, BullMQ CV queue, etc.
  await deliverService(payment, user).then(() => {
    console.log(`[Pipeline] Step 3 ✓ deliverService`);
  }).catch((err: any) => {
    console.error(`[Pipeline] Step 3 FAILED (deliverService): ${err?.message}`);
  });

  // ── Step 4: notify ──────────────────────────────────────────────────────────
  // Real-time WebSocket events — fire-and-forget so a missing WS connection
  // never delays the response back to the gateway.
  import("../websocket").then(({ notifyUserPlanActivated, notifyUserPaymentUpdate }) => {
    if (planId && expiresAt) {
      notifyUserPlanActivated(user.id, {
        type:          "plan_activated",
        planId,
        expiresAt:     expiresAt.toISOString(),
        method,
        transactionId,
      });
      console.log(`[Pipeline] Step 4 ✓ notifyUserPlanActivated | planId=${planId}`);
    }
    notifyUserPaymentUpdate(user.id, {
      type:      "payment_update",
      paymentId: payment.id,
      status:    planId ? "completed" : "success",
      amount:    payment.amount,
      kind:      planId ? "subscription" : (serviceId || "other"),
    });
  }).catch((err: any) => {
    console.error("[Pipeline] Step 4 WebSocket notify failed:", {
      error: err?.message, paymentId: payment?.id, userId: user?.id,
      timestamp: new Date().toISOString(),
    });
  });

  console.log(`[Pipeline] DONE | userId=${user.id} | txn=${transactionId}`);
}
