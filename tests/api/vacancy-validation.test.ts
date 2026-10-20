/**
 * School Recruitment Portal — vacancy validation & lifecycle rules.
 * Pure-function tests (no DB): server/lib/vacancy-validation.ts
 */
import { describe, it, expect } from "vitest";
import { validateVacancy, canTransition, isExpired, todayIso } from "../../server/lib/vacancy-validation";

const NOW = new Date("2026-10-20T09:00:00Z"); // 12:00 in Nairobi
const good = {
  title: "Mathematics & Physics Teacher",
  responsibilities: "Teach Mathematics and Physics to Form 2–4 classes and prepare KCSE candidates.",
  county: "Kajiado", town: "Kitengela",
  deadline: "2026-11-15",
  roleCategory: "teaching", subjects: ["Mathematics", "Physics"],
  employmentType: "full_time", experienceLevel: "mid",
};

describe("validateVacancy — schools", () => {
  it("accepts a complete teaching vacancy and forces category=education", () => {
    const r = validateVacancy(good, { isSchool: true, now: NOW });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.category).toBe("education");
      expect(r.value.subjects).toEqual(["Mathematics", "Physics"]);
      expect(r.value.status).toBe("open");
      expect(r.value.applicationMethod).toBe("platform");
      expect(r.value.applicationContact).toBeNull();
    }
  });

  it("requires description, county, deadline and subjects to publish", () => {
    const r = validateVacancy({ title: "Teacher", roleCategory: "teaching" }, { isSchool: true, now: NOW });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual(["county", "deadline", "responsibilities", "subjects"].sort());
    }
  });

  it("lets a draft be saved with only a title", () => {
    const r = validateVacancy({ title: "Chemistry Teacher", status: "draft" }, { isSchool: true, now: NOW });
    expect(r.ok).toBe(true);
  });

  it("does not require subjects for non-teaching roles", () => {
    const r = validateVacancy({ ...good, title: "School Bursar", roleCategory: "finance", subjects: [] }, { isSchool: true, now: NOW });
    expect(r.ok).toBe(true);
  });

  it("rejects a deadline in the past when publishing", () => {
    const r = validateVacancy({ ...good, deadline: "2026-10-19" }, { isSchool: true, now: NOW });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.deadline).toMatch(/past/);
  });

  it("accepts today's date as a deadline (Kenya time)", () => {
    const r = validateVacancy({ ...good, deadline: todayIso(NOW) }, { isSchool: true, now: NOW });
    expect(r.ok).toBe(true);
  });

  it("caps subjects at 8 and de-duplicates", () => {
    const subjects = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "A"];
    const r = validateVacancy({ ...good, subjects }, { isSchool: true, now: NOW });
    expect(r.ok && r.value.subjects?.length).toBe(8);
  });

  it("drops an unknown teaching level instead of storing it", () => {
    const r = validateVacancy({ ...good, teachingLevel: "<script>" }, { isSchool: true, now: NOW });
    expect(r.ok && r.value.teachingLevel).toBeNull();
  });
});

describe("validateVacancy — application method", () => {
  it("requires a valid email for email applications", () => {
    const bad = validateVacancy({ ...good, applicationMethod: "email", applicationContact: "not-an-email" }, { isSchool: true, now: NOW });
    expect(bad.ok).toBe(false);
    const ok = validateVacancy({ ...good, applicationMethod: "email", applicationContact: "HR@School.ac.ke" }, { isSchool: true, now: NOW });
    expect(ok.ok && ok.value.applicationContact).toBe("hr@school.ac.ke");
  });

  it("requires an https link for website applications", () => {
    expect(validateVacancy({ ...good, applicationMethod: "url", applicationContact: "http://x.com" }, { isSchool: true, now: NOW }).ok).toBe(false);
    expect(validateVacancy({ ...good, applicationMethod: "url", applicationContact: "javascript:alert(1)" }, { isSchool: true, now: NOW }).ok).toBe(false);
    expect(validateVacancy({ ...good, applicationMethod: "url", applicationContact: "https://school.ac.ke/jobs" }, { isSchool: true, now: NOW }).ok).toBe(true);
  });

  it("ignores a contact when applying through the platform", () => {
    const r = validateVacancy({ ...good, applicationMethod: "platform", applicationContact: "x@y.com" }, { isSchool: true, now: NOW });
    expect(r.ok && r.value.applicationContact).toBeNull();
  });

  it("falls back to platform for an unknown method", () => {
    const r = validateVacancy({ ...good, applicationMethod: "fax" }, { isSchool: true, now: NOW });
    expect(r.ok && r.value.applicationMethod).toBe("platform");
  });
});

describe("validateVacancy — general rules", () => {
  it("rejects max salary below min salary", () => {
    const r = validateVacancy({ ...good, salaryMin: 50000, salaryMax: 30000 }, { isSchool: true, now: NOW });
    expect(r.ok).toBe(false);
  });

  it("rejects an invalid employment type", () => {
    const r = validateVacancy({ ...good, employmentType: "slavery" }, { isSchool: true, now: NOW });
    expect(r.ok).toBe(false);
  });

  it("keeps company vacancies' own category and no school fields", () => {
    const r = validateVacancy({ title: "Cashier", category: "retail", subjects: ["Maths"] }, { isSchool: false, now: NOW });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.value.category).toBe("retail"); expect(r.value.subjects).toBeNull(); }
  });

  it("treats an unknown status as open (publish)", () => {
    const r = validateVacancy({ ...good, status: "verified" }, { isSchool: true, now: NOW });
    expect(r.ok && r.value.status).toBe("open");
  });
});

describe("status transitions", () => {
  it("allows the normal lifecycle", () => {
    expect(canTransition("draft", "open")).toBe(true);
    expect(canTransition("open", "paused")).toBe(true);
    expect(canTransition("paused", "open")).toBe(true);
    expect(canTransition("open", "closed")).toBe(true);
    expect(canTransition("closed", "open")).toBe(true);
  });
  it("blocks nonsense transitions", () => {
    expect(canTransition("draft", "paused")).toBe(false);
    expect(canTransition("paused", "draft")).toBe(false);
    expect(canTransition("bogus", "open")).toBe(false);
  });
});

describe("isExpired (end of deadline day, Kenya time)", () => {
  it("is not expired on the deadline day", () => {
    expect(isExpired("2026-10-20", NOW)).toBe(false);
  });
  it("is expired the day after", () => {
    expect(isExpired("2026-10-19", NOW)).toBe(true);
  });
  it("uses Kenya time near midnight UTC", () => {
    // 22:30 UTC on the 19th = 01:30 on the 20th in Nairobi → 19th has passed
    expect(isExpired("2026-10-19", new Date("2026-10-19T22:30:00Z"))).toBe(true);
  });
  it("never expires without a deadline", () => {
    expect(isExpired(null, NOW)).toBe(false);
  });
});
