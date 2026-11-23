import { describe, it, expect, vi } from "vitest";

const q = vi.fn();
vi.mock("../../server/db", () => ({ pool: { query: (...a: any[]) => q(...a) } }));
const getUserPlan = vi.fn();
vi.mock("../../server/storage", () => ({ storage: { getUserPlan: (...a: any[]) => getUserPlan(...a) } }));

import { maskPhones, paywallBody, canSeeJobContacts, JOB_UNLOCK_PRICE_KES } from "../../server/lib/job-contact-access";

describe("job contact paywall", () => {
  it("offers exactly one option: monthly, KES 1,000, back to the job", () => {
    const b = paywallBody("/kazi-karibu/job/abc");
    expect(b.code).toBe("PAYWALL");
    expect(b.amount).toBe(1000);
    expect(JOB_UNLOCK_PRICE_KES).toBe(1000);
    expect(b.plan).toBe("monthly");
    expect(b.payUrl).toBe("/payment?plan=monthly&only=1&return=%2Fkazi-karibu%2Fjob%2Fabc");
    expect(b.payUrl).not.toMatch(/yearly|pro|4500/);
    expect(paywallBody("https://evil.example").payUrl).toContain("return=%2Fkazi-karibu%2Fbrowse");
    expect(paywallBody("//evil.example").payUrl).toContain("return=%2Fkazi-karibu%2Fbrowse");
  });

  it("hides phone numbers typed into job text", () => {
    for (const s of ["Call 0724948252 now", "WhatsApp +254 724 948 252", "tel 254724948252", "0712-345-678 ok", "reach 724948252", "0110123456"]) {
      expect(maskPhones(s)).not.toMatch(/\d{3}[\s-]?\d{3}[\s-]?\d{3}/);
      expect(maskPhones(s)).toContain("number hidden");
    }
    expect(maskPhones("Pay KES 12,000 per month, 8am-9pm, 2 vacancies")).toBe("Pay KES 12,000 per month, 8am-9pm, 2 vacancies");
    expect(maskPhones(null)).toBeNull();
  });

  it("admins and active plans get in; free users don't", async () => {
    q.mockResolvedValueOnce({ rows: [{ role: "SUPER_ADMIN", is_admin: true }] });
    expect((await canSeeJobContacts("a")).ok).toBe(true);

    for (const plan of ["trial", "monthly", "yearly", "pro"]) {
      q.mockResolvedValueOnce({ rows: [{ role: "user", is_admin: false }] });
      getUserPlan.mockResolvedValueOnce(plan);
      expect((await canSeeJobContacts("u")).ok).toBe(true);
    }
    q.mockResolvedValueOnce({ rows: [{ role: "user", is_admin: false }] });
    getUserPlan.mockResolvedValueOnce("free");
    expect((await canSeeJobContacts("u")).ok).toBe(false);

    q.mockRejectedValueOnce(new Error("db down"));
    expect((await canSeeJobContacts("u")).ok).toBe(false); // deny by default
  });
});
