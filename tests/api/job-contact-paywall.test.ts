// Local-job contacts & applying — 2026-11-25: FREE for any signed-in account
// (growth strategy). Sign-in still required; numbers typed into job text stay
// masked so contacts can't be scraped without signing in.
import { describe, it, expect, vi } from "vitest";

const q = vi.fn();
vi.mock("../../server/db", () => ({ pool: { query: (...a: any[]) => q(...a) } }));
const getUserPlan = vi.fn();
vi.mock("../../server/storage", () => ({ storage: { getUserPlan: (...a: any[]) => getUserPlan(...a) } }));

import { maskPhones, canSeeJobContacts } from "../../server/lib/job-contact-access";
import { checkFeature } from "../../server/lib/feature-access";
import { FEATURES, decideAccess } from "../../shared/feature-access";

describe("local jobs are free for signed-in accounts", () => {
  it("registry: contacts + applying are FREE (account needed, no plan)", () => {
    expect(FEATURES.local_job_contacts.access).toBe("FREE");
    expect(FEATURES.kenya_jobs_apply.access).toBe("FREE");
    expect(decideAccess("local_job_contacts", { authenticated: true, plan: "free" })).toEqual({ allowed: true });
    expect(decideAccess("kenya_jobs_apply", { authenticated: true, plan: "free" })).toEqual({ allowed: true });
    expect(decideAccess("local_job_contacts", { authenticated: false })).toEqual({ allowed: false, reason: "SIGNIN" });
  });

  it("free, paid and admin accounts can all see contacts; signed-out cannot", async () => {
    for (const plan of ["free", "trial", "monthly", "yearly"]) {
      q.mockResolvedValueOnce({ rows: [{ role: "user", is_admin: false }] });
      getUserPlan.mockResolvedValueOnce(plan);
      expect((await canSeeJobContacts("u")).ok, plan).toBe(true);
    }
    q.mockResolvedValueOnce({ rows: [{ role: "SUPER_ADMIN", is_admin: true }] });
    expect((await canSeeJobContacts("a")).ok).toBe(true);
    expect((await checkFeature("kenya_jobs_apply", null)).allowed).toBe(false);
  });

  it("hides phone numbers typed into job text", () => {
    for (const s of ["Call 0724948252 now", "WhatsApp +254 724 948 252", "tel 254724948252", "0712-345-678 ok", "reach 724948252", "0110123456"]) {
      expect(maskPhones(s)).not.toMatch(/\d{3}[\s-]?\d{3}[\s-]?\d{3}/);
      expect(maskPhones(s)).toContain("number hidden");
    }
    expect(maskPhones("Pay KES 12,000 per month, 8am-9pm, 2 vacancies")).toBe("Pay KES 12,000 per month, 8am-9pm, 2 vacancies");
    expect(maskPhones(null)).toBeNull();
  });
});
