/**
 * Finance ledger — pure rules for service-level payment tracking,
 * reconciliation and refunds. No DB access here so it is unit-testable.
 *
 * 2026-10 (Tony: "Every confirmed payment must answer: what exactly did the
 * customer pay for, and was it delivered?").
 *
 * GOLDEN RULE: the purpose of a payment comes from the order/plan recorded
 * when the customer chose it (payments.plan_id / service_id / metadata
 * serviceOrderId). It is NEVER inferred from the amount.
 */

/* ── Receipts ─────────────────────────────────────────────────────────── */

/** Normalise an M-Pesa receipt as typed/pasted ("uj l6vas4x4 confirmed."). */
export function normaliseReceipt(raw: unknown): string | null {
  let s = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.endsWith("CONFIRMED")) s = s.slice(0, -"CONFIRMED".length);
  return /^[A-Z][A-Z0-9]{9}$/.test(s) ? s : null;
}

/** Sources whose receipt was typed by the CUSTOMER (not sent by Safaricom). */
export const SELF_CLAIMED_SOURCES = new Set(["manual_receipt_verification", "payment_success_webhook", "receipt_claim"]);

export interface ReceiptRecord {
  id: string;
  userId: string | null;            // 'unknown' for unlinked Paybill (C2B) rows
  amount: number;
  status: string;
  source: string | null;            // metadata.source
  reconciliationStatus?: string | null;
}

export type ClaimDecision =
  | { action: "link_orphan"; paymentId: string }          // Safaricom-recorded, unlinked, right amount → link to claimant
  | { action: "already_yours"; paymentId: string }
  | { action: "belongs_to_other" }
  | { action: "amount_mismatch"; expected: number; received: number; paymentId: string }
  | { action: "queue_for_review" };                         // not (yet) seen from Safaricom → admin verifies

/**
 * Decide what to do when a signed-in customer submits an M-Pesa receipt.
 * Only a record that Safaricom itself sent us (STK callback / C2B
 * confirmation) can prove a payment. A customer-typed code never does.
 */
export function decideReceiptClaim(
  claimantId: string, expectedAmount: number, records: ReceiptRecord[],
): ClaimDecision {
  const confirmed = records.filter((r) =>
    (r.status === "success" || r.status === "completed") &&
    !SELF_CLAIMED_SOURCES.has(String(r.source ?? "")) &&
    r.reconciliationStatus !== "duplicate");
  if (!confirmed.length) return { action: "queue_for_review" };
  const mine = confirmed.find((r) => r.userId === claimantId);
  if (mine) return { action: "already_yours", paymentId: mine.id };
  const orphan = confirmed.find((r) => !r.userId || r.userId === "unknown");
  if (!orphan) return { action: "belongs_to_other" };
  if (Math.round(orphan.amount) !== Math.round(expectedAmount)) {
    return { action: "amount_mismatch", expected: expectedAmount, received: orphan.amount, paymentId: orphan.id };
  }
  return { action: "link_orphan", paymentId: orphan.id };
}

/* ── Reconciliation status ────────────────────────────────────────────── */

export const RECON_STATUSES = [
  "matched",            // verified payment linked to a customer + purpose
  "manually_matched",   // admin linked it with evidence
  "unmatched",          // verified money, owner/purpose unknown → queue
  "unverified_receipt", // customer-typed receipt never seen from Safaricom
  "duplicate",          // second row for the same receipt — not revenue
  "admin_grant",        // access granted by admin, no money moved — not revenue
  "test",               // admin marked as test / internal
  "not_confirmed",      // pending / failed / cancelled
] as const;
export type ReconStatus = typeof RECON_STATUSES[number];

/** Statuses that count as verified collected money. */
export const REVENUE_STATUSES: ReadonlySet<string> = new Set(["matched", "manually_matched", "unmatched"]);
/** …of which these are fully attributed to a service. */
export const ATTRIBUTED_STATUSES: ReadonlySet<string> = new Set(["matched", "manually_matched"]);

export function countsAsRevenue(paymentStatus: string, recon: string | null | undefined): boolean {
  return (paymentStatus === "success" || paymentStatus === "completed") && REVENUE_STATUSES.has(String(recon ?? ""));
}

/* ── Purpose (what was bought) ────────────────────────────────────────── */

export const PLAN_IDS = new Set(["trial", "basic", "monthly", "yearly", "pro", "pro_referral"]);

export interface PurposeInput {
  planId?: string | null;
  serviceId?: string | null;
  serviceName?: string | null;
  metadata?: Record<string, any> | null;
  orderSlug?: string | null;        // service_orders.service_slug when linked
  source?: string | null;           // 'payments' | 'wfs'
}
export interface Purpose {
  kind: "subscription" | "service" | "tool" | "unknown";
  key: string | null;               // canonical id: plan id or service slug/id
}

/** Purpose from recorded references only — the amount is never consulted. */
export function resolvePurpose(p: PurposeInput): Purpose {
  if (p.source === "wfs") return { kind: "service", key: "write_from_scratch" };
  const meta = p.metadata ?? {};
  const plan = String(p.planId ?? meta.planId ?? "").trim();
  const svc = String(p.serviceId ?? "").trim();
  const planFromSvc = svc.startsWith("plan_") ? svc.slice(5) : "";
  const planKey = PLAN_IDS.has(plan) ? plan : PLAN_IDS.has(planFromSvc) ? planFromSvc : "";
  if (planKey) return { kind: "subscription", key: planKey };
  if (p.orderSlug) return { kind: "service", key: p.orderSlug };
  if (svc.startsWith("tool_")) return { kind: "tool", key: svc };
  if (svc) return { kind: "service", key: svc };
  if (PLAN_IDS.has(plan)) return { kind: "subscription", key: plan };
  return { kind: "unknown", key: null };
}

/** Human order reference shown to customers & admins (also the Paybill account code). */
export function orderRef(id: string | null | undefined): string {
  return id ? `WA-${String(id).replace(/-/g, "").slice(0, 8).toUpperCase()}` : "";
}

/* ── Delivery ─────────────────────────────────────────────────────────── */

export type DeliveryStatus = "pending_payment" | "awaiting_delivery" | "processing" | "delivered" | "delivery_failed" | "active" | "expired" | "not_applicable" | "unknown";

export function deliveryFromServiceOrder(status: string | null | undefined): DeliveryStatus {
  switch (String(status ?? "")) {
    case "completed": case "delivered": return "delivered";
    case "failed": return "delivery_failed";
    case "processing": case "awaiting_review": case "in_progress": return "processing";
    case "paid": return "awaiting_delivery";
    case "pending_payment": case "pending": return "pending_payment";
    default: return "unknown";
  }
}

/* ── Refunds ──────────────────────────────────────────────────────────── */

export const REFUND_STATUSES = ["requested", "approved", "rejected", "processing", "completed", "failed"] as const;
export type RefundStatus = typeof REFUND_STATUSES[number];

const REFUND_FLOW: Record<string, string[]> = {
  requested:  ["approved", "rejected"],
  approved:   ["processing", "completed", "failed", "rejected"],
  processing: ["completed", "failed"],
  failed:     ["processing", "completed", "rejected"],
  rejected:   [],
  completed:  [],
};
export function canTransitionRefund(from: string, to: string): boolean {
  return (REFUND_FLOW[from] ?? []).includes(to);
}

/**
 * A refund may never push total refunds above what was actually paid.
 * `committed` = sum of refunds already approved/processing/completed.
 */
export function validateRefundAmount(paid: number, committed: number, requested: number): { ok: true } | { ok: false; error: string } {
  if (!Number.isFinite(requested) || requested <= 0) return { ok: false, error: "Refund amount must be more than 0." };
  if (Math.round(requested * 100) !== requested * 100) return { ok: false, error: "Refund amount can have at most 2 decimals." };
  const remaining = Math.round((paid - committed) * 100) / 100;
  if (remaining <= 0) return { ok: false, error: "This payment has already been fully refunded." };
  if (requested > remaining) return { ok: false, error: `Refund exceeds the refundable balance (KES ${remaining}).` };
  return { ok: true };
}

/** A completed refund needs proof the money actually moved. */
export function validateRefundCompletion(refundRef: string | null | undefined): { ok: true } | { ok: false; error: string } {
  const ref = String(refundRef ?? "").trim();
  if (ref.length < 6) return { ok: false, error: "Enter the M-Pesa reversal/B2C transaction reference as proof the refund was paid." };
  return { ok: true };
}
