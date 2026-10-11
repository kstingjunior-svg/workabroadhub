/**
 * Admin: comp (free) service order.
 *
 * 2026-10 (Tony — Saidi Dzimba's stuck KES 1,499 Assisted Apply refund).
 *
 * When a customer gets burned by a bug (payment taken, delivery never fired)
 * we want to make them whole by delivering what they paid for. Refunding
 * the money is step 1; delivering the actual service for free is step 2.
 *
 * This endpoint lets an admin create a `service_orders` row with
 * payment_method='comp', paid_at=NOW(), and immediately fire the normal
 * AI pipeline (processOrder) so the customer gets the deliverable via
 * the same email + WhatsApp path as a paid order.
 *
 * Usage (admin-only):
 *   POST /api/admin/comp-order
 *   {
 *     "userEmail":     "omarseyyid02@gmail.com",   // or "userId"
 *     "serviceSlug":   "assisted_apply_lite",
 *     "cvText":        "...pasted CV text...",     // optional for services with needsCv=false
 *     "targetCountry": "UAE",                      // optional
 *     "extraInput":    "Hospitality / F&B roles",  // optional job focus
 *     "reason":        "Comp for refunded 2026-10-07 stuck order WAH-ukLlSf81Wayi"
 *   }
 *
 * Response:
 *   { ok: true, orderId: "...", status: "processing", eta: "3 minutes" }
 *
 * The customer's existing user record is used; they do NOT need to log in
 * again. Delivery goes to u.email + u.phone (WhatsApp) exactly as a paid
 * order would.
 */

import type { Express, Request, Response } from "express";
import { pool } from "../db";
import crypto from "crypto";

export function registerAdminCompOrderRoutes(app: Express): void {
  app.post("/api/admin/comp-order", async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (!user?.isAdmin) {
        return res.status(403).json({ error: "admin only" });
      }

      const {
        userEmail,
        userId: userIdInput,
        serviceSlug,
        cvText,
        targetCountry,
        extraInput,
        reason,
      } = (req.body || {}) as {
        userEmail?: string;
        userId?: string;
        serviceSlug?: string;
        cvText?: string;
        targetCountry?: string;
        extraInput?: string;
        reason?: string;
      };

      if (!serviceSlug) {
        return res.status(400).json({ error: "serviceSlug is required" });
      }
      if (!userEmail && !userIdInput) {
        return res.status(400).json({ error: "userEmail or userId is required" });
      }

      // Resolve user
      const userRow = userIdInput
        ? (await pool.query(
            `SELECT id, email, phone, first_name, last_name FROM users WHERE id = $1`,
            [userIdInput],
          )).rows[0]
        : (await pool.query(
            `SELECT id, email, phone, first_name, last_name FROM users WHERE LOWER(email) = LOWER($1)`,
            [userEmail],
          )).rows[0];
      if (!userRow) {
        return res.status(404).json({ error: "user not found" });
      }

      // Resolve service — must exist AND be AI-delivered (SERVICE_CONFIGS
      // with a non-empty systemPrompt). We refuse to comp a slug the
      // pipeline doesn't know how to process — otherwise processOrder
      // would just flip the row to 'failed' with "Unknown service slug".
      const { isAiDeliveredSlug } = await import("../service-order-routes");
      if (!isAiDeliveredSlug(serviceSlug)) {
        return res.status(400).json({
          error: `Service "${serviceSlug}" is not AI-delivered. Comp this one manually or verify the slug (it must exist in SERVICE_CONFIGS with a non-empty systemPrompt).`,
        });
      }
      const svcRow = (await pool.query(
        `SELECT id, name, price FROM services WHERE slug = $1 LIMIT 1`,
        [serviceSlug],
      )).rows[0];
      if (!svcRow) {
        return res.status(404).json({ error: `service row not found for slug ${serviceSlug}` });
      }

      // Services that need CV need cv_text present — otherwise processOrder
      // immediately sets 'failed' with "CV required".
      const needsCv = ["cv_fix_lite","ats_cv_optimization","cv_rewrite","cover_letter",
        "sop_writing","motivation_letter","linkedin_optimization","interview_coaching",
        "ats_cover_bundle","interview_prep_pack","contract_review","application_tracking",
        "assisted_apply_lite","assisted_apply","guided_apply"].includes(serviceSlug);
      if (needsCv && (!cvText || cvText.trim().length < 100)) {
        return res.status(400).json({
          error: `Service "${serviceSlug}" needs cvText (at least 100 chars). Ask the customer to paste their CV via WhatsApp.`,
        });
      }

      // Create the order row with payment_method='comp'. Setting paid_at
      // mimics a confirmed payment so the pipeline treats this as ready
      // to process.
      const orderId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO service_orders
           (id, user_id, service_id, service_slug, service_name,
            status, amount, currency, payment_method, payment_ref,
            paid_at, cv_text, target_country, extra_input,
            admin_notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5,
                 'processing', 0, 'KES', 'comp', $6,
                 NOW(), $7, $8, $9,
                 $10, NOW(), NOW())`,
        [
          orderId,
          userRow.id,
          svcRow.id,
          serviceSlug,
          svcRow.name,
          `comp-${Date.now()}`,
          cvText || null,
          targetCountry || null,
          extraInput || null,
          `[COMP by admin ${user.id ?? user.email ?? "unknown"}] ${reason || "no reason given"}`,
        ],
      );

      console.log(
        `[admin-comp-order] created comp order ${orderId} for user ${userRow.email} ` +
        `(${userRow.id}), slug=${serviceSlug}. Firing processOrder now.`,
      );

      // Fire the AI pipeline in the background exactly like a paid order
      // would. We don't await — the admin UI just gets back the order id.
      import("../service-order-routes")
        .then((m: any) => {
          // processOrder is not exported directly; service-order-routes.ts
          // exposes an internal retry hook via the module. Easiest: call
          // the same path that the payment callback uses.
          if (typeof m.onPaymentSuccessForServiceOrder === "function") {
            return m.onPaymentSuccessForServiceOrder(orderId);
          }
          // Fallback: hit the internal reprocess endpoint from server-side.
          // Shouldn't be needed in production.
          console.warn("[admin-comp-order] onPaymentSuccessForServiceOrder not exported; order will be picked up by the stuck-order reconciler on its next tick.");
        })
        .catch((err: any) => {
          console.error("[admin-comp-order] processOrder trigger failed:", err?.message);
        });

      return res.json({
        ok: true,
        orderId,
        userId: userRow.id,
        userEmail: userRow.email,
        serviceSlug,
        status: "processing",
        eta: "~3 minutes",
        message: `Comp order created. Delivery will go to ${userRow.email} + WhatsApp ${userRow.phone || "(no phone)"} once AI completes.`,
      });
    } catch (err: any) {
      console.error("[admin-comp-order] handler error:", err);
      return res.status(500).json({ error: err?.message || "comp order failed" });
    }
  });

  console.log("[admin-comp-order] registered: POST /api/admin/comp-order");
}
