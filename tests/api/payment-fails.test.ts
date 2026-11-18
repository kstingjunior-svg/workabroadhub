/** 2026-11 payment-failure investigation fixes — pure logic only. */
import { describe, it, expect } from "vitest";
import { classifyOutcome } from "../../server/lib/payment-outcome";
import { decide, last9, UNREACHABLE_LIMIT } from "../../server/lib/mpesa-retry-guard";
import { judge } from "../../server/lib/paypal-health";

describe("plain-English payment outcomes", () => {
  it("separates customer choices, phone problems, Safaricom errors and abandoned PayPal", () => {
    expect(classifyOutcome("failed", "DS timeout user cannot be reached.", "mpesa")).toEqual({ kind: "phone", label: "Phone unreachable" });
    expect(classifyOutcome("failed", "Request Cancelled by user.", "mpesa").kind).toBe("customer");
    expect(classifyOutcome("failed", "No response from user.", "mpesa").label).toBe("PIN not entered");
    expect(classifyOutcome("failed", "The balance is insufficient for the transaction.", "mpesa").kind).toBe("customer");
    expect(classifyOutcome("failed", "Error occurred while sending push request.", "mpesa").kind).toBe("system");
    expect(classifyOutcome("failed", "paypal_recovery_exhausted_after_30_attempts", "paypal").kind).toBe("abandoned");
    expect(classifyOutcome("completed", null, "mpesa").kind).toBe("paid");
    expect(classifyOutcome("failed", "paypal_buyer_cancelled", "paypal").label).toBe("Cancelled at PayPal");
    expect(classifyOutcome("awaiting_paybill", null, "mpesa").label).toBe("Waiting for Paybill");
  });
});

describe("M-Pesa retry guard", () => {
  const now = new Date("2026-11-17T10:00:00Z");
  const ago = (m: number) => new Date(now.getTime() - m * 60_000);
  it("allows retries until the limit", () => {
    expect(decide([ago(1), ago(2)], now).blocked).toBe(false);
  });
  it("blocks the 4th prompt after 3 unreachable failures in 30 min, with advice", () => {
    const r = decide([ago(1), ago(2), ago(3)], now);
    expect(UNREACHABLE_LIMIT).toBe(3);
    expect(r.blocked).toBe(true);
    expect(r.retryAfterMin).toBeGreaterThan(0);
    expect(r.message).toMatch(/WhatsApp \+254 111 467 601/);
  });
  it("lifts the block after the cool-down", () => {
    expect(decide([ago(16), ago(17), ago(18)], now).blocked).toBe(false);
  });
  it("ignores failures older than 30 minutes", () => {
    expect(decide([ago(40), ago(45), ago(1)], now).blocked).toBe(false);
  });
  it("matches phone formats", () => {
    expect(last9("0712 345 678")).toBe(last9("+254712345678"));
  });
});

describe("PayPal health", () => {
  it("flags orders that are never approved", () => {
    const h = judge(3, 0, 113, 0, null);
    expect(h.status).toBe("no_approvals");
    expect(h.message).toMatch(/never completed a payment/);
  });
  it("ok when payments go through, quiet when no orders", () => {
    expect(judge(4, 2, 50, 10, "2026-11-16T00:00:00Z").status).toBe("ok");
    expect(judge(0, 0, 50, 10, null).status).toBe("quiet");
  });
});
