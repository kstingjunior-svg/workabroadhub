import { describe, it, expect } from "vitest";
import { paypalErrorInfo } from "../../server/services/paypalCapture";
import { buildReceipt } from "../../server/lib/payment-receipt";

// The exact error shape the PayPal SDK produced in production (2 Nov / 12 Nov).
const declinedSdkError = {
  message: JSON.stringify({
    name: "UNPROCESSABLE_ENTITY",
    details: [{ issue: "INSTRUMENT_DECLINED", description: "declined" }],
    links: [
      { href: "https://developer.paypal.com/x", rel: "information_link", method: "GET" },
      { href: "https://www.paypal.com/checkoutnow?token=5UE539252X816563C", rel: "redirect", method: "GET" },
    ],
  }),
};

describe("paypalErrorInfo", () => {
  it("reads the issue + retry link from the SDK's JSON-string message", () => {
    const info = paypalErrorInfo(declinedSdkError);
    expect(info.issue).toBe("INSTRUMENT_DECLINED");
    expect(info.redirect).toBe("https://www.paypal.com/checkoutnow?token=5UE539252X816563C");
  });
  it("still reads structured errors", () => {
    expect(paypalErrorInfo({ details: [{ issue: "ORDER_ALREADY_CAPTURED" }] }).issue).toBe("ORDER_ALREADY_CAPTURED");
  });
  it("returns nothing for a plain error", () => {
    expect(paypalErrorInfo(new Error("socket hang up")).issue).toBeUndefined();
  });
});

describe("buildReceipt", () => {
  const base = { firstName: "Agnes", activatedAt: new Date("2026-11-15T10:00:00Z"), expiresAt: new Date("2026-12-15T10:00:00Z") };
  it("M-Pesa monthly receipt shows KES, M-Pesa, plan and dates — not '365 days'", () => {
    const r = buildReceipt({ ...base, planId: "monthly", method: "mpesa", amountKes: 1000, reference: "UK1N60V1WQ" });
    expect(r.subject).toContain("Monthly");
    expect(r.text).toContain("KES 1,000");
    expect(r.text).toContain("M-Pesa");
    expect(r.text).toContain("UK1N60V1WQ");
    expect(r.text).toContain("15 December 2026");
    expect(r.text).not.toMatch(/365/);
  });
  it("PayPal receipt shows USD with the KES equivalent", () => {
    const r = buildReceipt({ ...base, planId: "pro", method: "paypal", amountKes: 4500, amountUsd: "34.62", reference: "9AB12345CD" });
    expect(r.text).toContain("USD 34.62");
    expect(r.text).toContain("PayPal");
  });
  it("escapes names in HTML", () => {
    const r = buildReceipt({ ...base, firstName: "<script>", planId: "monthly", method: "mpesa", amountKes: 1000 });
    expect(r.html).not.toContain("<script>");
  });
});
