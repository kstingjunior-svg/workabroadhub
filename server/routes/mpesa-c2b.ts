// ─────────────────────────────────────────────────────────────────────────────
// mpesa-c2b.ts — Customer-To-Business (C2B) confirmation + validation
//                receiver endpoints for Paybill 4153025.
//
// FLOW (from Safaricom's perspective)
//   1. Customer opens M-Pesa app → Lipa Na M-Pesa → Paybill → enters 4153025
//      + an account reference (usually their phone or a payment id we handed
//      them) + amount + PIN.
//   2. Safaricom validates the request. If we've registered a Validation URL
//      (we do), Safaricom POSTs the details here first — we return
//      { ResultCode: 0, ResultDesc: "Accepted" } to accept, or a non-zero
//      code to reject (e.g. account doesn't exist).
//   3. Once accepted, Safaricom completes the payment and POSTs the final
//      receipt to our Confirmation URL. This is the "money-has-moved" signal.
//   4. We match the receipt to any pending payment in our DB by
//      phone + amount + account reference, and auto-activate. Anything we
//      can't match is stashed as an orphan for admin review.
//
// SECURITY
//   · Both endpoints sit behind safaricomIpGuard — non-Safaricom IPs get a
//     silent 200 { ResultCode: 0 } so an attacker can't fingerprint the
//     guard. See server/middleware/safaricomIpGuard.ts.
//   · We ACK Safaricom immediately (Safaricom retries anything non-2xx for
//     up to 4 hours). All heavy lifting runs in setImmediate after ACK.
//   · Idempotency: the Confirmation handler stores the TransID as the
//     unique key. Duplicate deliveries are a no-op.
//
// 2026-09 (Tony's "customers pay by paybill, no auto-activation" fix).
// ─────────────────────────────────────────────────────────────────────────────

import type { Express, Request, Response } from "express";
import { pool } from "../db";
import { storage } from "../storage";
import { safaricomIpGuard } from "../middleware/safaricomIpGuard";

// Safaricom's C2B payload — well-documented but fields arrive in mixed
// case depending on channel. We accept either the canonical PascalCase
// (documented) or lowercased variants that appear in some sandbox tests.
interface SafaricomC2BPayload {
  TransactionType?:   string;
  TransID?:           string;
  TransTime?:         string;   // e.g. "20260926110145"
  TransAmount?:       string;   // decimal string
  BusinessShortCode?: string;
  BillRefNumber?:     string;   // account reference the customer typed
  InvoiceNumber?:     string;
  OrgAccountBalance?: string;
  ThirdPartyTransID?: string;
  MSISDN?:            string;   // customer phone (2547XXXXXXXX format)
  FirstName?:         string;
  MiddleName?:        string;
  LastName?:          string;
}

function normalisePayload(body: any): SafaricomC2BPayload {
  const raw = (body ?? {}) as Record<string, any>;
  const pick = (canonical: string, ...aliases: string[]) => {
    for (const key of [canonical, ...aliases]) {
      if (raw[key] !== undefined && raw[key] !== null && raw[key] !== "") {
        return String(raw[key]);
      }
    }
    return undefined;
  };
  return {
    TransactionType:   pick("TransactionType", "transactiontype"),
    TransID:           pick("TransID", "transid"),
    TransTime:         pick("TransTime", "transtime"),
    TransAmount:       pick("TransAmount", "transamount"),
    BusinessShortCode: pick("BusinessShortCode", "businessshortcode"),
    BillRefNumber:     pick("BillRefNumber", "billrefnumber"),
    InvoiceNumber:     pick("InvoiceNumber", "invoicenumber"),
    OrgAccountBalance: pick("OrgAccountBalance", "orgaccountbalance"),
    ThirdPartyTransID: pick("ThirdPartyTransID", "thirdpartytransid"),
    MSISDN:            pick("MSISDN", "msisdn"),
    FirstName:         pick("FirstName", "firstname"),
    MiddleName:        pick("MiddleName", "middlename"),
    LastName:          pick("LastName", "lastname"),
  };
}

// ── Matching + activation ────────────────────────────────────────────────────

async function tryMatchAndActivate(payload: SafaricomC2BPayload): Promise<void> {
  const receipt = payload.TransID?.trim();
  const phone   = payload.MSISDN?.trim();
  const amountKes = payload.TransAmount ? Math.round(Number(payload.TransAmount)) : NaN;
  const acctRef = payload.BillRefNumber?.trim() ?? "";

  if (!receipt || !phone || !Number.isFinite(amountKes)) {
    console.warn(`[c2b] Malformed payload — receipt=${receipt} phone=${phone} amount=${amountKes}`);
    return;
  }

  // 1. Idempotency guard: if we've already recorded this receipt, stop.
  try {
    const { rows: dupe } = await pool.query(
      `SELECT id FROM payments
        WHERE mpesa_receipt_number = $1
           OR mpesa_code = $1
           OR transaction_ref = $1
        LIMIT 1`,
      [receipt],
    );
    if (dupe.length > 0) {
      console.log(`[c2b] Receipt ${receipt} already recorded (paymentId=${dupe[0].id}) — no-op`);
      return;
    }
  } catch (err: any) {
    console.error(`[c2b] Duplicate check failed for ${receipt}:`, err?.message);
  }

  // 2. Try to match a pending payment by (phone + amount) OR (acctRef as paymentId).
  //    acctRef is the payment id we handed the user in the "pay manually" flow,
  //    so it's the most reliable match when present.
  let matchedPaymentId: string | null = null;
  try {
    if (/^[0-9a-f-]{16,}$/i.test(acctRef)) {
      const { rows } = await pool.query(
        `SELECT id FROM payments WHERE id::text = $1 AND status = 'pending' LIMIT 1`,
        [acctRef],
      );
      if (rows.length > 0) matchedPaymentId = String(rows[0].id);
    }
    if (!matchedPaymentId) {
      const { rows } = await pool.query(
        `SELECT id FROM payments
          WHERE phone = $1
            AND amount = $2
            AND status IN ('pending', 'pending_manual_verification')
            AND created_at > NOW() - INTERVAL '24 hours'
          ORDER BY created_at DESC
          LIMIT 1`,
        [phone, amountKes],
      );
      if (rows.length > 0) matchedPaymentId = String(rows[0].id);
    }
  } catch (err: any) {
    console.error(`[c2b] Match query failed for ${receipt}:`, err?.message);
  }

  if (matchedPaymentId) {
    console.log(`[c2b] MATCH receipt=${receipt} → paymentId=${matchedPaymentId} — activating`);
    try {
      await storage.updatePayment(matchedPaymentId, {
        status: "success",
        mpesaCode: receipt,
        mpesaReceiptNumber: receipt,
        phone,
        amount: amountKes,
        updatedAt: new Date(),
        verification_status: "verified",
        verified_at: new Date(),
      } as any);

      // Kick the runPaymentPipeline so plan activation / order fulfilment
      // fires the same way the STK callback does.
      try {
        const { runPaymentPipeline } = await import("../services/paymentPipeline");
        const payment = await storage.getPaymentById(matchedPaymentId);
        if (payment?.userId) {
          const user = await storage.getUserById(payment.userId).catch(() => null);
          if (user) {
            await runPaymentPipeline({
              user,
              payment,
              method:        "mpesa",
              planId:        (payment as any).planId ?? null,
              serviceId:     String((payment as any).serviceId ?? "").replace(/^plan_/, "") || "",
              transactionId: receipt,
            } as any);
          }
        }
      } catch (pipelineErr: any) {
        console.error(`[c2b] runPaymentPipeline failed for ${matchedPaymentId}:`, pipelineErr?.message);
      }
      return;
    } catch (err: any) {
      console.error(`[c2b] Failed to activate matched paymentId=${matchedPaymentId}:`, err?.message);
    }
  }

  // 3. No match — record as orphan for admin review.
  console.warn(`[c2b] ORPHAN receipt=${receipt} phone=${phone} amount=${amountKes} acctRef="${acctRef}" — saved for admin`);
  try {
    await storage.createPayment({
      userId:             "unknown",
      amount:             amountKes,
      currency:           "KES",
      method:             "mpesa",
      phone,
      status:             "success",
      mpesaCode:          receipt,
      mpesaReceiptNumber: receipt,
      transactionRef:     receipt,
      metadata: JSON.stringify({
        source:     "c2b_orphan",
        billRefNumber: acctRef,
        firstName:  payload.FirstName ?? null,
        lastName:   payload.LastName  ?? null,
        transTime:  payload.TransTime ?? null,
      }),
    } as any);
    // Flag for admin queue.
    await pool.query(
      `UPDATE payments SET needs_review = true WHERE mpesa_receipt_number = $1`,
      [receipt],
    ).catch(() => {});
  } catch (err: any) {
    console.error(`[c2b] Failed to persist orphan ${receipt}:`, err?.message);
  }
}

// ── Route registration ───────────────────────────────────────────────────────

export function registerMpesaC2BRoutes(app: Express): void {
  // ── VALIDATION URL ────────────────────────────────────────────────────────
  // Safaricom hits this before completing the payment. We accept everything
  // (ResultCode: 0). To reject specific accounts (e.g. expired plans), branch
  // on payload.BillRefNumber here.
  app.post("/api/mpesa/c2b/validation", safaricomIpGuard, (req: Request, res: Response) => {
    try {
      const payload = normalisePayload(req.body);
      console.log(`[c2b/validation] ref="${payload.BillRefNumber}" amount=${payload.TransAmount} phone=${payload.MSISDN}`);
    } catch { /* never fail Safaricom's validation over a log line */ }
    return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  });

  // ── CONFIRMATION URL ──────────────────────────────────────────────────────
  // Safaricom's money-has-moved receipt. ACK immediately, then match + activate
  // in the background so we never miss a retry due to slow processing.
  app.post("/api/mpesa/c2b/confirmation", safaricomIpGuard, (req: Request, res: Response) => {
    // 1. Snapshot the payload BEFORE ACK-ing (Safaricom may not resend).
    let payload: SafaricomC2BPayload;
    try {
      payload = normalisePayload(req.body);
    } catch (err: any) {
      console.error("[c2b/confirmation] payload parse failed:", err?.message);
      return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    // 2. ACK Safaricom immediately so retries stop.
    res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });

    // 3. Match + activate asynchronously.
    setImmediate(() => {
      tryMatchAndActivate(payload).catch((err) =>
        console.error("[c2b/confirmation] tryMatchAndActivate failed:", err?.message),
      );
    });
  });

  console.log(
    "[c2b] ✓ POST /api/mpesa/c2b/validation + POST /api/mpesa/c2b/confirmation registered",
  );
}
