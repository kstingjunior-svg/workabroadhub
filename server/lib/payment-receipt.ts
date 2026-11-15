/**
 * Payment receipt email — sent once per activated payment.
 *
 * 2026-11 (payment audit): confirmation emails were inconsistent. The main
 * M-Pesa callback and every PayPal path sent none; the STK recovery poller,
 * the reconciler and admin activations sent a "Pro plan, 365 days" email
 * even for Monthly (30-day) plans, with no amount, currency or method.
 *
 * Now storage.activateUserPlan() — the single writer every gateway goes
 * through — calls this after it commits a NEW subscription row for a
 * payment. A replayed callback for the same payment returns early there,
 * so it never emails twice. Email failure is logged and never affects the
 * payment or the subscription.
 */
import { pool } from "../db";
import { sendEmail } from "../email";

const PLAN_NAME: Record<string, string> = {
  trial: "Trial (1 day)",
  basic: "Trial (1 day)",
  monthly: "Monthly",
  yearly: "Yearly",
  pro: "Yearly (full portal access)",
  pro_referral: "Yearly (referral)",
};

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const fmtDate = (d: Date) => d.toLocaleDateString("en-KE", { year: "numeric", month: "long", day: "numeric", timeZone: "Africa/Nairobi" });

export interface ReceiptInput {
  userId: string;
  paymentId: string;
  planId: string;
  activatedAt: Date;
  expiresAt: Date;
}

export function buildReceipt(r: {
  firstName?: string | null; planId: string; method: string; amountKes: number;
  amountUsd?: string | null; reference?: string | null; activatedAt: Date; expiresAt: Date;
}) {
  const name = (r.firstName || "").trim() || "there";
  const plan = PLAN_NAME[r.planId] ?? r.planId;
  const isPaypal = r.method === "paypal";
  const amount = isPaypal && r.amountUsd
    ? `USD ${r.amountUsd} (≈ KES ${r.amountKes.toLocaleString("en-KE")})`
    : `KES ${r.amountKes.toLocaleString("en-KE")}`;
  const method = isPaypal ? "PayPal" : r.method === "mpesa" ? "M-Pesa" : r.method;
  const rows: Array<[string, string]> = [
    ["Plan", plan],
    ["Amount paid", amount],
    ["Payment method", method],
    ["Reference", r.reference || "—"],
    ["Activated", fmtDate(r.activatedAt)],
    ["Access until", fmtDate(r.expiresAt)],
  ];
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px;border:1px solid #e5e7eb;border-radius:12px;">
    <h2 style="color:#1d4ed8;margin:0 0 4px;text-align:center;">WorkAbroad Hub</h2>
    <p style="color:#6b7280;font-size:13px;margin:0 0 22px;text-align:center;">Payment receipt</p>
    <p style="color:#111827;font-size:15px;">Hi ${esc(name)},</p>
    <p style="color:#374151;font-size:14px;line-height:1.6;">Thank you — your payment was received and your <strong>${esc(plan)}</strong> plan is active.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:18px 0;">
      ${rows.map(([k, v]) => `<tr><td style="padding:8px 0;color:#6b7280;border-bottom:1px solid #f3f4f6;">${esc(k)}</td><td style="padding:8px 0;color:#111827;text-align:right;border-bottom:1px solid #f3f4f6;"><strong>${esc(v)}</strong></td></tr>`).join("")}
    </table>
    <div style="text-align:center;margin:26px 0 18px;">
      <a href="https://workabroadhub.tech/dashboard" style="display:inline-block;background:#1d4ed8;color:#fff;font-size:14px;font-weight:600;padding:12px 32px;border-radius:8px;text-decoration:none;">Go to my dashboard</a>
    </div>
    <p style="color:#9ca3af;font-size:12px;text-align:center;">Keep this email as your receipt. Questions? <a href="mailto:support@workabroadhub.tech" style="color:#1d4ed8;">support@workabroadhub.tech</a></p>
  </div>`;
  const text = [`Hi ${name},`, "", `Your payment was received and your ${plan} plan is active.`, "",
    ...rows.map(([k, v]) => `${k}: ${v}`), "", "Dashboard: https://workabroadhub.tech/dashboard",
    "Questions? support@workabroadhub.tech"].join("\n");
  return { subject: `Payment received — your ${plan} plan is active`, html, text };
}

export async function sendPaymentReceipt(input: ReceiptInput): Promise<void> {
  try {
    const { rows: [row] } = await pool.query<{
      email: string | null; first_name: string | null; method: string | null; amount: number | null;
      transaction_ref: string | null; mpesa_receipt_number: string | null;
    }>(
      `SELECT u.email, u.first_name, p.method, p.amount, p.transaction_ref, COALESCE(p.mpesa_receipt_number, p.mpesa_code) AS mpesa_receipt_number
         FROM users u LEFT JOIN payments p ON p.id::text = $2::text
        WHERE u.id = $1`,
      [input.userId, input.paymentId],
    );
    if (!row?.email) return;
    if (!row.method) return; // not a real payment row (e.g. a manual grant without a payment)
    const amountKes = Number(row.amount ?? 0);
    let amountUsd: string | null = null;
    if (row.method === "paypal") {
      const { kesToUsd } = await import("../paypal");
      amountUsd = kesToUsd(amountKes).toFixed(2);
    }
    const receipt = buildReceipt({
      firstName: row.first_name,
      planId: input.planId,
      method: row.method,
      amountKes,
      amountUsd,
      reference: row.mpesa_receipt_number || row.transaction_ref,
      activatedAt: input.activatedAt,
      expiresAt: input.expiresAt,
    });
    const r: any = await sendEmail({ to: row.email, subject: receipt.subject, html: receipt.html, text: receipt.text });
    if (r && r.success === false) console.warn(`[Receipt] email not sent for payment ${input.paymentId}: ${r.error ?? "unknown"}`);
    else console.log(`[Receipt] sent for payment ${input.paymentId} (${input.planId})`);
  } catch (err: any) {
    console.warn(`[Receipt] failed for payment ${input.paymentId}: ${err?.message ?? err}`);
  }
}
