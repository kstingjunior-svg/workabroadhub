// 2026-11-27 (Tony): document services work without an account or email
// verification. Only subscription PLAN purchases keep the verified-email rule.
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";

vi.mock("../../server/db", () => ({ pool: { query: vi.fn(async () => ({ rows: [] })) } }));
import { isPlanPurchase } from "../../server/services/identityVerification";
import { isEmailVerificationExempt } from "../../shared/email-verification-gate";

const ROOT = path.resolve(__dirname, "../..");

describe("documents: no sign-in or email verification required", () => {
  it("document endpoints pass the global verified-email gate", () => {
    for (const p of ["/api/write-from-scratch/init", "/api/write-from-scratch/paypal-init", "/api/write-from-scratch/abc/download.pdf",
      "/api/services/order/cv_fix_lite", "/api/services/order/123/pay-guest", "/api/service-orders/1",
      "/api/tools/pay", "/api/payments/initiate", "/api/mpesa/stk", "/api/mpesa/status/x", "/api/paypal/create-order"]) {
      expect(isEmailVerificationExempt(p), p).toBe(true);
    }
    // Everything else stays behind the gate for unverified accounts
    expect(isEmailVerificationExempt("/api/dashboard")).toBe(false);
  });

  it("only plan purchases need a verified email", () => {
    for (const b of [{ serviceId: "cv_fix_lite" }, { serviceId: "ats_cv_optimization" }, { serviceId: "cover_letter" }, { serviceId: "tool_offer_check" }]) {
      expect(isPlanPurchase(b), JSON.stringify(b)).toBe(false);
    }
    for (const b of [{}, { serviceId: "plan_monthly" }, { plan_id: "pro" }, { serviceId: "main_subscription" }, { planId: "monthly" }]) {
      expect(isPlanPurchase(b), JSON.stringify(b)).toBe(true);
    }
  });

  it("Write-from-Scratch no longer blocks guests or unverified emails", () => {
    const src = fs.readFileSync(path.join(ROOT, "server/routes/write-from-scratch.ts"), "utf8");
    expect(src).not.toMatch(/assertEmailVerified\(/);
    expect(src).not.toMatch(/Please sign in and verify your email first/);
    expect(src).toMatch(/contact_email/); // optional email kept to send a copy
  });
});
