/**
 * Service-level payment tracking — acceptance rules (pure logic).
 * server/lib/finance-ledger.ts
 */
import { describe, it, expect } from "vitest";
import {
  normaliseReceipt, decideReceiptClaim, resolvePurpose, countsAsRevenue, orderRef,
  canTransitionRefund, validateRefundAmount, validateRefundCompletion, deliveryFromServiceOrder,
} from "../../server/lib/finance-ledger";

describe("what was bought comes from the order, never the amount", () => {
  it("(1) KES 99 CV Revamp order → CV Revamp", () => {
    expect(resolvePurpose({ serviceId: "cv_fix_lite", metadata: { serviceOrderId: "o1" }, orderSlug: "cv_fix_lite" }))
      .toEqual({ kind: "service", key: "cv_fix_lite" });
  });
  it("(2) a different KES 99 purchase (cover letter) stays a cover letter", () => {
    expect(resolvePurpose({ serviceId: "cover_letter", orderSlug: "cover_letter" }).key).toBe("cover_letter");
  });
  it("(3) SOP / any catalogue service resolves to its own service id", () => {
    expect(resolvePurpose({ serviceId: "sop_writing" })).toEqual({ kind: "service", key: "sop_writing" });
  });
  it("(4) KES 1,000 monthly plan → monthly subscription", () => {
    expect(resolvePurpose({ planId: "monthly", serviceId: "plan_monthly" })).toEqual({ kind: "subscription", key: "monthly" });
  });
  it("(5) KES 4,500 yearly plan is a subscription; a KES 4,500 service is NOT", () => {
    expect(resolvePurpose({ serviceId: "plan_pro" })).toEqual({ kind: "subscription", key: "pro" });
    expect(resolvePurpose({ serviceId: "assisted_application_bundle" }).kind).toBe("service");
  });
  it("no recorded reference → unknown (never guessed)", () => {
    expect(resolvePurpose({})).toEqual({ kind: "unknown", key: null });
  });
  it("write-from-scratch drafts are their own service", () => {
    expect(resolvePurpose({ source: "wfs" }).key).toBe("write_from_scratch");
  });
  it("tools are tools", () => {
    expect(resolvePurpose({ serviceId: "tool_visa_check" }).kind).toBe("tool");
  });
});

describe("revenue counts only verified money", () => {
  it("(6) failed / pending payments are never revenue", () => {
    expect(countsAsRevenue("failed", "matched")).toBe(false);
    expect(countsAsRevenue("pending", "not_confirmed")).toBe(false);
    expect(countsAsRevenue("pending_manual_verification", "not_confirmed")).toBe(false);
  });
  it("(7) duplicates, admin grants and unverified receipts are not revenue", () => {
    expect(countsAsRevenue("success", "duplicate")).toBe(false);
    expect(countsAsRevenue("success", "admin_grant")).toBe(false);
    expect(countsAsRevenue("success", "unverified_receipt")).toBe(false);
  });
  it("(8) unmatched verified money IS collected (shown separately)", () => {
    expect(countsAsRevenue("success", "unmatched")).toBe(true);
    expect(countsAsRevenue("completed", "matched")).toBe(true);
  });
});

describe("customer-typed receipts", () => {
  const me = "user-me", other = "user-other";
  const stk = (o: any) => ({ id: "p1", userId: me, amount: 1000, status: "success", source: null, ...o });
  it("normalises pasted codes and rejects phone numbers / timestamps", () => {
    expect(normaliseReceipt(" ujl6vas4x4 confirmed.")).toBe("UJL6VAS4X4");
    expect(normaliseReceipt("UFLL08A57OCONFIRMED")).toBe("UFLL08A57O");
    expect(normaliseReceipt("712482722")).toBeNull();
    expect(normaliseReceipt("1781775687673")).toBeNull();
    expect(normaliseReceipt("UFII83FNX")).toBeNull();
  });
  it("(15) a receipt Safaricom never sent us grants nothing — queued for review", () => {
    expect(decideReceiptClaim(me, 4500, []).action).toBe("queue_for_review");
  });
  it("another customer's self-typed claim is not proof either", () => {
    expect(decideReceiptClaim(me, 1000, [stk({ userId: other, source: "manual_receipt_verification" })]).action).toBe("queue_for_review");
  });
  it("an unlinked Safaricom Paybill record with the right amount is linked", () => {
    expect(decideReceiptClaim(me, 1000, [stk({ userId: "unknown" })])).toEqual({ action: "link_orphan", paymentId: "p1" });
  });
  it("wrong amount is never activated", () => {
    expect(decideReceiptClaim(me, 4500, [stk({ userId: "unknown", amount: 1000 })]).action).toBe("amount_mismatch");
  });
  it("someone else's verified payment can't be claimed", () => {
    expect(decideReceiptClaim(me, 1000, [stk({ userId: other })]).action).toBe("belongs_to_other");
  });
  it("(7) re-submitting your own receipt doesn't create a second entitlement", () => {
    expect(decideReceiptClaim(me, 1000, [stk({})]).action).toBe("already_yours");
  });
  it("duplicate-labelled rows are ignored", () => {
    expect(decideReceiptClaim(me, 1000, [stk({ userId: "unknown", reconciliationStatus: "duplicate" })]).action).toBe("queue_for_review");
  });
});

describe("delivery is not payment", () => {
  it("(9)/(10) service order status drives delivery", () => {
    expect(deliveryFromServiceOrder("paid")).toBe("awaiting_delivery");
    expect(deliveryFromServiceOrder("processing")).toBe("processing");
    expect(deliveryFromServiceOrder("completed")).toBe("delivered");
    expect(deliveryFromServiceOrder("failed")).toBe("delivery_failed");
  });
});

describe("refunds", () => {
  it("(12) approval ≠ money returned: completion needs a transaction reference", () => {
    expect(validateRefundCompletion("").ok).toBe(false);
    expect(validateRefundCompletion("  ").ok).toBe(false);
    expect(validateRefundCompletion("UJM1AB2CD3").ok).toBe(true);
  });
  it("lifecycle cannot skip review or reopen a completed refund", () => {
    expect(canTransitionRefund("requested", "completed")).toBe(false);
    expect(canTransitionRefund("requested", "approved")).toBe(true);
    expect(canTransitionRefund("approved", "completed")).toBe(true);
    expect(canTransitionRefund("completed", "processing")).toBe(false);
    expect(canTransitionRefund("rejected", "approved")).toBe(false);
  });
  it("(14) refunds can never exceed what was paid", () => {
    expect(validateRefundAmount(99, 0, 99).ok).toBe(true);
    expect(validateRefundAmount(99, 99, 1).ok).toBe(false);       // already fully refunded
    expect(validateRefundAmount(1000, 400, 700).ok).toBe(false);  // over balance
    expect(validateRefundAmount(1000, 400, 600).ok).toBe(true);   // partial ok
    expect(validateRefundAmount(1000, 0, 0).ok).toBe(false);
    expect(validateRefundAmount(1000, 0, 10.555).ok).toBe(false);
  });
});

describe("order references", () => {
  it("are stable and match the Paybill account code", () => {
    expect(orderRef("4482fdcd-7235-48e4-9fb5-b35670e8dbd0")).toBe("WA-4482FDCD");
    expect(orderRef(null)).toBe("");
  });
});
