/**
 * Customer-submitted M-Pesa receipts (2026-10 security fix).
 *
 * BEFORE: /api/mpesa/verify-receipt and /api/payment-success activated
 * whatever plan the customer asked for as long as the typed code had not
 * been used before — Safaricom was never consulted (22 historical "receipts"
 * were phone numbers / timestamps; 34 were never seen from Safaricom).
 *
 * NOW: a receipt only unlocks anything if Safaricom itself sent us that
 * transaction (STK callback or C2B confirmation), it is not credited to
 * someone else, and the amount equals the plan's price. Otherwise the claim
 * is queued (status pending_manual_verification) for an admin, and the C2B
 * matcher links it automatically if Safaricom's confirmation arrives later.
 */
import { pool } from "../db";
import { decideReceiptClaim, normaliseReceipt, type ReceiptRecord } from "./finance-ledger";
import { notifyFinanceAdmins } from "./finance-notify";

export interface ClaimInput { userId: string; receipt: string; planId: string; amount: number; phone?: string | null }
export type ClaimResult =
  | { status: "activated"; paymentId: string }
  | { status: "already_active"; paymentId: string }
  | { status: "pending_review"; paymentId: string; message: string }
  | { status: "rejected"; httpStatus: number; message: string };

export async function claimReceipt(input: ClaimInput): Promise<ClaimResult> {
  const receipt = normaliseReceipt(input.receipt);
  if (!receipt) {
    return { status: "rejected", httpStatus: 400, message: "That doesn't look like an M-Pesa code. It's 10 letters/numbers, e.g. UJL6VAS4X4 — copy it from your M-Pesa SMS." };
  }
  const { rows } = await pool.query(
    `SELECT id, user_id, amount, status, reconciliation_status, fin_meta(metadata)->>'source' AS source
       FROM payments WHERE receipt_norm = $1`, [receipt],
  );
  const records: ReceiptRecord[] = rows.map((r: any) => ({
    id: String(r.id), userId: r.user_id, amount: Number(r.amount), status: r.status,
    source: r.source, reconciliationStatus: r.reconciliation_status,
  }));
  const d = decideReceiptClaim(input.userId, input.amount, records);

  if (d.action === "already_yours") return { status: "already_active", paymentId: d.paymentId };
  if (d.action === "belongs_to_other") {
    notifyFinanceAdmins({
      kind: "review", dedupeKey: `claim-other:${receipt}:${input.userId}`,
      title: "Receipt claimed by a second account",
      body: `A customer submitted M-Pesa receipt ${receipt}, which is already credited to another account. No access was granted.`,
    }).catch(() => {});
    return { status: "rejected", httpStatus: 409, message: "This M-Pesa receipt is already linked to another account. If you paid, contact support@workabroadhub.tech." };
  }
  if (d.action === "amount_mismatch") {
    const p = await queueClaim(input, receipt, `Receipt found but amount KES ${d.received} ≠ plan price KES ${d.expected}`);
    return { status: "pending_review", paymentId: p, message: `We found your payment of KES ${d.received}, but this plan costs KES ${d.expected}. Our team will review it and contact you.` };
  }
  if (d.action === "link_orphan") {
    // Claim the Safaricom-recorded Paybill payment for this customer.
    const { rowCount } = await pool.query(
      `UPDATE payments SET user_id = $2, plan_id = $3, service_id = $4, matched = true, matched_user_id = $2,
              needs_review = false, reconciliation_status = 'matched', reconciled_at = NOW(),
              unmatched_reason = NULL, updated_at = NOW(),
              verification_note = 'Linked by customer receipt claim (Safaricom record verified)'
        WHERE id = $1 AND user_id = 'unknown'`,
      [d.paymentId, input.userId, input.planId, `plan_${input.planId}`],
    );
    if (!rowCount) return { status: "rejected", httpStatus: 409, message: "This receipt was just claimed. Refresh and check your plan." };
    await pool.query(
      `INSERT INTO finance_audit_log (entity, entity_id, action, actor_id, note, after)
       VALUES ('payment', $1, 'receipt_claim_linked', $2, 'Customer claimed unlinked Paybill payment; amount matched plan price', $3)`,
      [d.paymentId, input.userId, JSON.stringify({ receipt, planId: input.planId })],
    ).catch(() => {});
    return { status: "activated", paymentId: d.paymentId };
  }
  // queue_for_review
  const p = await queueClaim(input, receipt, "Receipt not (yet) received from Safaricom");
  return {
    status: "pending_review", paymentId: p,
    message: "Thanks — we've received your M-Pesa code. We haven't had Safaricom's confirmation for it yet; your plan will activate automatically as soon as it arrives, or our team will check it within a few hours.",
  };
}

async function queueClaim(input: ClaimInput, receipt: string, reason: string): Promise<string> {
  // One open claim per customer + receipt.
  const { rows: existing } = await pool.query(
    `SELECT id FROM payments WHERE user_id = $1 AND status = 'pending_manual_verification' AND upper(transaction_ref) = $2 LIMIT 1`,
    [input.userId, receipt],
  );
  if (existing[0]) return String(existing[0].id);
  const { rows } = await pool.query(
    `INSERT INTO payments (user_id, amount, currency, method, status, plan_id, service_id, transaction_ref, phone, metadata, needs_review, unmatched_reason)
     VALUES ($1, $2, 'KES', 'mpesa', 'pending_manual_verification', $3, $4, $5, $6, $7, true, $8)
     RETURNING id`,
    [input.userId, input.amount, input.planId, `plan_${input.planId}`, receipt, input.phone ?? null,
     JSON.stringify({ source: "receipt_claim", receipt, planId: input.planId }), reason],
  );
  const id = String(rows[0].id);
  notifyFinanceAdmins({
    kind: "review", paymentId: id, amount: input.amount, dedupeKey: `claim:${receipt}:${input.userId}`,
    title: "Receipt claim awaiting verification",
    body: `A customer submitted M-Pesa receipt ${receipt} for plan "${input.planId}" (KES ${input.amount}). ${reason}. No access granted yet.`,
  }).catch(() => {});
  return id;
}
