/**
 * Admin: M-Pesa Transaction Status forensics.
 *
 * 2026-10 (Tony — Faith Mbugua's "I paid but didn't receive" case).
 * When a customer insists they paid but our DB shows the payment failed,
 * we need to query Safaricom directly to find out what REALLY happened —
 * did M-Pesa actually debit the customer, or did the STK push abort
 * before the money moved?
 *
 * This endpoint hits Safaricom's STK Push Query API with any one of:
 *   • paymentId        — our DB payment row id (grabs its checkoutRequestId)
 *   • checkoutRequestId — the Safaricom reference (ws_CO_xxxx)
 *
 * Returns the raw Safaricom verdict (ResultCode / ResultDesc / etc) plus
 * our own interpretation. If Safaricom confirms the payment actually
 * SUCCEEDED but our DB marked it failed (common when the callback timed
 * out or got lost in transit), the endpoint optionally reconciles: flips
 * the payment to "success" and fires onPaymentSuccessForServiceOrder so
 * the deliverable actually ships.
 *
 * Usage from admin console:
 *   fetch('/api/admin/mpesa/status', {
 *     method: 'POST',
 *     credentials: 'include',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({
 *       paymentId: 'cd11a63f-36d2-4841-9f73-f606f8d7589e',
 *       autoReconcile: true,
 *     }),
 *   }).then(r => r.json()).then(console.log);
 */

import type { Express, Request, Response } from "express";
import { pool } from "../db";

export function registerAdminMpesaStatusRoutes(app: Express): void {
  app.post("/api/admin/mpesa/status", async (req: Request, res: Response) => {
    try {
      // Admin auth — same pattern as other admin endpoints.
      const userId = (req.session as any)?.customUserId as string | undefined;
      if (!userId) return res.status(401).json({ error: "Please sign in first." });
      const { rows: adminRows } = await pool.query<{ is_admin: boolean; role: string; email: string }>(
        `SELECT is_admin, role, email FROM users WHERE id = $1`,
        [userId],
      );
      const caller = adminRows[0];
      if (!caller?.is_admin && caller?.role !== "ADMIN" && caller?.role !== "SUPER_ADMIN") {
        return res.status(403).json({ error: "admin only" });
      }

      const paymentId         = String((req.body?.paymentId ?? "")).trim();
      const explicitCheckout  = String((req.body?.checkoutRequestId ?? "")).trim();
      const autoReconcile     = Boolean(req.body?.autoReconcile);

      if (!paymentId && !explicitCheckout) {
        return res.status(400).json({ error: "Provide paymentId or checkoutRequestId." });
      }

      // Resolve the checkoutRequestId from DB if the caller passed paymentId.
      let checkoutRequestId = explicitCheckout;
      let paymentRow: any = null;
      if (paymentId) {
        const { rows } = await pool.query(
          `SELECT id, user_id, email, amount, status, method, phone, service_id,
                  service_name, metadata, created_at
             FROM payments WHERE id = $1`,
          [paymentId],
        );
        paymentRow = rows[0] ?? null;
        if (!paymentRow) {
          return res.status(404).json({ error: `Payment ${paymentId} not found.` });
        }
        try {
          const meta = typeof paymentRow.metadata === "string"
            ? JSON.parse(paymentRow.metadata)
            : (paymentRow.metadata ?? {});
          checkoutRequestId = String(meta?.checkoutRequestId ?? meta?.CheckoutRequestID ?? "").trim();
        } catch {}
        if (!checkoutRequestId) {
          return res.status(400).json({
            error: "This payment has no checkoutRequestId in metadata — can't query Safaricom.",
            payment: paymentRow,
          });
        }
      }

      // Hit Safaricom.
      const { stkQuery } = await import("../mpesa");
      let daraja: any;
      try {
        daraja = await stkQuery(checkoutRequestId);
      } catch (err: any) {
        // Safaricom returns 500 with a specific response body for unknown or
        // expired CheckoutRequestIDs — surface that cleanly instead of a stack trace.
        const safaricomDetail = err?.response?.data ?? err?.message ?? String(err);
        return res.json({
          ok: false,
          checkoutRequestId,
          paymentId: paymentRow?.id,
          daraja: null,
          error: "Safaricom STK Query failed",
          detail: safaricomDetail,
        });
      }

      // Interpret.
      // ResultCode 0 = success (customer was debited, receipt generated)
      // ResultCode 1032 = user cancelled on their phone
      // ResultCode 1037 = user did not enter PIN in time
      // ResultCode 2001 = wrong PIN
      // ResultCode 1 = insufficient funds
      // ResultCode 1025 = STK push expired (any value → failed)
      // ResultCode 1019 = transaction expired
      // ResultCode 1001 = transaction already in process
      const resultCode = String(daraja?.ResultCode ?? "");
      const resultDesc = String(daraja?.ResultDesc ?? "");
      const safaricomSaysPaid = resultCode === "0";
      const humanVerdict =
        safaricomSaysPaid
          ? "SAFARICOM CONFIRMS PAYMENT SUCCEEDED — customer was debited and receipt was generated."
          : resultCode === "1032" ? "Customer cancelled the STK on their phone — not debited."
          : resultCode === "1037" ? "Customer didn't enter PIN in time — not debited."
          : resultCode === "2001" ? "Customer entered wrong PIN — not debited."
          : resultCode === "1"    ? "Insufficient funds — not debited."
          : resultCode === "1025" || resultCode === "1019" ? "STK push expired — not debited."
          : resultCode === "1001" ? "Transaction is still being processed by Safaricom — try again in a minute."
          : `Payment did NOT succeed. Safaricom code ${resultCode}: ${resultDesc}`;

      // Optional reconciliation — if Safaricom confirms success but our DB
      // row isn't marked completed, flip it and trigger delivery.
      let reconciled: any = null;
      if (safaricomSaysPaid && autoReconcile && paymentRow && paymentRow.status !== "success" && paymentRow.status !== "completed") {
        try {
          await pool.query(
            `UPDATE payments
                SET status = 'success',
                    updated_at = NOW(),
                    metadata = COALESCE(metadata::text, '{}')::jsonb || jsonb_build_object(
                      'reconciled_at', NOW()::text,
                      'reconciled_by', $2,
                      'safaricom_resultCode', $3,
                      'safaricom_resultDesc', $4
                    )
              WHERE id = $1`,
            [paymentRow.id, caller.email ?? userId, resultCode, resultDesc],
          ).catch(async () => {
            // Fallback for schemas where metadata is TEXT not JSONB
            await pool.query(
              `UPDATE payments
                  SET status = 'success',
                      updated_at = NOW(),
                      metadata = $2
                WHERE id = $1`,
              [
                paymentRow.id,
                JSON.stringify({
                  ...(typeof paymentRow.metadata === "string" ? JSON.parse(paymentRow.metadata || "{}") : (paymentRow.metadata ?? {})),
                  reconciled_at: new Date().toISOString(),
                  reconciled_by: caller.email ?? userId,
                  safaricom_resultCode: resultCode,
                  safaricom_resultDesc: resultDesc,
                }),
              ],
            );
          });

          // Trigger service-order delivery if this payment was tied to one.
          let orderId: string | null = null;
          try {
            const meta = typeof paymentRow.metadata === "string"
              ? JSON.parse(paymentRow.metadata)
              : (paymentRow.metadata ?? {});
            orderId = String(meta?.serviceOrderId ?? "").trim() || null;
          } catch {}

          if (orderId) {
            const { onPaymentSuccessForServiceOrder } = await import("../service-order-routes");
            onPaymentSuccessForServiceOrder(orderId).catch((e) =>
              console.error("[admin-mpesa-status] delivery trigger failed:", e?.message),
            );
          }
          reconciled = {
            paymentId: paymentRow.id,
            flippedToStatus: "success",
            deliveryTriggered: Boolean(orderId),
            orderId,
          };
          console.log(
            `[admin-mpesa-status] RECONCILED payment ${paymentRow.id} ` +
            `(by ${caller.email ?? userId}): Safaricom says success → DB now success. ` +
            `${orderId ? `Delivery firing for order ${orderId}.` : "No order tied."}`,
          );
        } catch (rErr: any) {
          console.error("[admin-mpesa-status] reconcile failed:", rErr?.message);
          reconciled = { error: rErr?.message || "reconcile failed" };
        }
      }

      return res.json({
        ok: true,
        checkoutRequestId,
        paymentId: paymentRow?.id,
        paymentStatus: paymentRow?.status,
        amount: paymentRow?.amount,
        phone: paymentRow?.phone,
        serviceName: paymentRow?.service_name,
        safaricomSaysPaid,
        verdict: humanVerdict,
        resultCode,
        resultDesc,
        daraja,
        reconciled,
      });
    } catch (err: any) {
      console.error("[admin-mpesa-status] handler error:", err?.message);
      return res.status(500).json({ error: err?.message || "status check failed" });
    }
  });

  console.log("[admin-mpesa-status] registered: POST /api/admin/mpesa/status");
}
