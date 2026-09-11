// ─────────────────────────────────────────────────────────────────────────────
// tool-pay.ts — KES 100 pay-per-scan for the verification tools.
//
// 2026-09 (Tony's monetisation directive): the AI verification tools are no
// longer free. Every scan of the four paid tools costs KES 100, paid via
// M-Pesa STK push, one payment = exactly ONE scan. The ATS CV checker stays
// free (top-of-funnel), and browsing (jobs, templates) stays free.
//
//   Paid tools:  offer_check  · visa_check · ielts_verify · job_scam_check
//
// FLOW
//   1. POST /api/tools/pay { tool, phone }  → creates a payments row
//      (service_id = "tool_<tool>", amount = 100) and fires the STK push
//      with AccountReference = paymentId, so the existing unified callback
//      (/api/payments/mpesa/callback) marks it success — a fast-path branch
//      there skips the plan/service pipeline for isToolScan payments.
//   2. Client polls GET /api/tools/pay/:id/status until "success".
//   3. Client calls the tool endpoint with header  x-scan-token: <paymentId>.
//      requireToolCredit() consumes the credit ATOMICALLY (single UPDATE with
//      a WHERE guard), so one payment can never fund two scans — even two
//      parallel requests racing with the same token.
//
// SECURITY
//   · Price is hard-coded server-side; the client never sends an amount.
//   · The credit is bound to the tool it was bought for (service_id match),
//     so an offer-check credit can't be spent on a visa scan.
//   · Consumption is a compare-and-set UPDATE … WHERE delivery_status IS
//     DISTINCT FROM 'consumed' RETURNING — first request wins, second gets
//     402 CREDIT_ALREADY_USED.
//   · Status endpoint only ever exposes tool-scan payment rows (service_id
//     LIKE 'tool_%'), never plan or service payments.
// ─────────────────────────────────────────────────────────────────────────────

import type { Express, Request, Response, NextFunction } from "express";
import { pool } from "../db";
import { storage } from "../storage";
import { stkPush } from "../mpesa";

export const TOOL_SCAN_PRICE_KES = 100;

export const PAID_TOOLS: Record<string, string> = {
  offer_check:    "Offer Letter Screening",
  visa_check:     "Visa Screening",
  ielts_verify:   "IELTS Verification",
  job_scam_check: "Job Scam Check",
};
export type PaidTool = keyof typeof PAID_TOOLS;

/** 07XXXXXXXX / 01XXXXXXXX / +2547… / 2547… → 2547XXXXXXXX (or null if invalid). */
function normaliseKenyanPhone(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  let p = digits;
  if (p.startsWith("0") && p.length === 10) p = "254" + p.slice(1);
  if ((p.startsWith("7") || p.startsWith("1")) && p.length === 9) p = "254" + p;
  if (!/^254(7|1)\d{8}$/.test(p)) return null;
  return p;
}

export function registerToolPayRoutes(app: Express): void {
  // ── 1. Initiate a KES 100 scan payment ────────────────────────────────────
  app.post("/api/tools/pay", async (req: any, res: Response) => {
    try {
      const tool = String(req.body?.tool ?? "").trim();
      if (!PAID_TOOLS[tool]) {
        return res.status(400).json({ message: "Unknown tool.", code: "INVALID_TOOL" });
      }
      const phone = normaliseKenyanPhone(req.body?.phone);
      if (!phone) {
        return res.status(400).json({
          message: "Enter a valid Safaricom number (07XX… or 2547XX…).",
          code: "INVALID_PHONE",
        });
      }

      const userId: string =
        req.user?.claims?.sub ?? req.user?.id ?? "guest_tool_scan";

      const payment = await storage.createPayment({
        userId,
        amount:      TOOL_SCAN_PRICE_KES,
        currency:    "KES",
        method:      "mpesa",
        phone,
        status:      "pending",
        serviceId:   `tool_${tool}`,
        serviceName: `${PAID_TOOLS[tool]} (per-scan)`,
        metadata:    JSON.stringify({ isToolScan: true, tool }),
      } as any);

      const stk = await stkPush(
        phone,
        TOOL_SCAN_PRICE_KES,
        `${PAID_TOOLS[tool]} — WorkAbroad Hub`,
        String(payment.id),
      );

      if (String(stk?.ResponseCode) !== "0") {
        await storage.updatePayment(payment.id, {
          status: "failed",
          failReason: `stk_rejected:${stk?.ResponseDescription ?? "unknown"}`,
        } as any).catch(() => {});
        return res.status(502).json({
          message: "M-Pesa did not accept the payment request. Please try again.",
          code: "STK_REJECTED",
        });
      }

      await storage.updatePayment(payment.id, {
        transactionRef:    stk.CheckoutRequestID,
        checkoutRequestId: stk.CheckoutRequestID,
      } as any);

      console.log(
        `[ToolPay] STK sent: tool=${tool} phone=${phone} paymentId=${payment.id} ` +
        `checkoutRequestId=${stk.CheckoutRequestID}`,
      );
      return res.json({
        paymentId: String(payment.id),
        amount: TOOL_SCAN_PRICE_KES,
        message: "Enter your M-Pesa PIN on your phone to complete the KES 100 payment.",
      });
    } catch (err: any) {
      console.error("[ToolPay] initiation failed:", err?.message);
      return res.status(500).json({ message: "Could not start the payment. Please try again.", code: "PAY_INIT_FAILED" });
    }
  });

  // ── 2. Poll payment status ────────────────────────────────────────────────
  app.get("/api/tools/pay/:id/status", async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id ?? "").trim();
      if (!id) return res.status(400).json({ message: "Missing payment id." });
      const { rows } = await pool.query(
        `SELECT id, status, delivery_status, service_id
           FROM payments
          WHERE id::text = $1 AND service_id LIKE 'tool_%'`,
        [id],
      );
      if (!rows.length) return res.status(404).json({ message: "Payment not found." });
      const row = rows[0];
      return res.json({
        status:   row.status,
        consumed: row.delivery_status === "consumed",
        paid:     row.status === "success" || row.status === "completed",
      });
    } catch (err: any) {
      console.error("[ToolPay] status check failed:", err?.message);
      return res.status(500).json({ message: "Status check failed." });
    }
  });

  console.log("[ToolPay] ✓ /api/tools/pay + /api/tools/pay/:id/status registered (KES 100/scan)");
}

// ── 3. The gate: consume exactly one paid credit per scan ────────────────────
export function requireToolCredit(tool: PaidTool) {
  return async (req: any, res: Response, next: NextFunction) => {
    try {
      const token = String(
        req.headers["x-scan-token"] ?? req.body?.scanToken ?? req.query?.scanToken ?? "",
      ).trim();

      if (!token) {
        return res.status(402).json({
          message: `This check costs KES ${TOOL_SCAN_PRICE_KES}. Pay via M-Pesa to run it.`,
          code: "PAYMENT_REQUIRED",
          priceKes: TOOL_SCAN_PRICE_KES,
          tool,
        });
      }

      // Atomic consume: only ever succeeds ONCE per paid credit, and only for
      // the tool the credit was bought for.
      const { rows } = await pool.query(
        `UPDATE payments
            SET delivery_status = 'consumed'
          WHERE id::text = $1
            AND service_id = $2
            AND amount >= $3
            AND status IN ('success', 'completed')
            AND delivery_status IS DISTINCT FROM 'consumed'
        RETURNING id`,
        [token, `tool_${tool}`, TOOL_SCAN_PRICE_KES],
      );
      if (rows.length) {
        (req as any).toolPaymentId = token;
        return next();
      }

      // Explain WHY it failed, without consuming anything.
      const { rows: existing } = await pool.query(
        `SELECT status, delivery_status, service_id FROM payments WHERE id::text = $1 AND service_id LIKE 'tool_%'`,
        [token],
      );
      if (!existing.length) {
        return res.status(402).json({ message: "Payment not found. Please pay KES 100 to run this check.", code: "PAYMENT_REQUIRED", priceKes: TOOL_SCAN_PRICE_KES, tool });
      }
      const row = existing[0];
      if (row.delivery_status === "consumed") {
        return res.status(402).json({ message: "That payment was already used for a scan. Each KES 100 payment covers one check.", code: "CREDIT_ALREADY_USED", priceKes: TOOL_SCAN_PRICE_KES, tool });
      }
      if (row.service_id !== `tool_${tool}`) {
        return res.status(402).json({ message: "That payment was for a different tool.", code: "WRONG_TOOL_CREDIT", priceKes: TOOL_SCAN_PRICE_KES, tool });
      }
      return res.status(402).json({ message: "Payment not confirmed yet. Complete the M-Pesa prompt, then try again.", code: "PAYMENT_PENDING", priceKes: TOOL_SCAN_PRICE_KES, tool });
    } catch (err: any) {
      console.error(`[ToolPay] credit check failed (tool=${tool}):`, err?.message);
      // Fail CLOSED — this gate exists to stop free scans.
      return res.status(402).json({ message: "Could not verify your payment. Please try again.", code: "CREDIT_CHECK_FAILED", priceKes: TOOL_SCAN_PRICE_KES, tool });
    }
  };
}
