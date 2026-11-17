/** Write-from-Scratch job tailoring (2026-11) — pure logic, synthetic data. */
import { describe, it, expect } from "vitest";
import { verifyReport, evidenceInInput, tailoringBlock, personText } from "../../server/services/writeFromScratch/job-match";

const input = {
  role: "Private Chef", yearsExperience: 6,
  keySkills: "Mediterranean cuisine, Lebanese mezze, menu planning, food costing",
  workHistory: "Example Hotel Nairobi, Sous Chef, 2019-2023, ran the grill section",
  education: "Diploma in Culinary Arts", extras: "English, Swahili",
};

describe("match panel cannot award what the person didn't write", () => {
  it("keeps a match backed by the person's own words", () => {
    const r = verifyReport({ requirements: [{ requirement: "Mediterranean cuisine", importance: "must", status: "met", evidence: "Mediterranean cuisine" }] }, input);
    expect(r.requirements[0].status).toBe("met");
    expect(r.covered).toBe(1);
  });
  it("downgrades a hallucinated match to not shown", () => {
    const r = verifyReport({ requirements: [{ requirement: "Michelin-starred experience", importance: "must", status: "met", evidence: "worked at a Michelin-starred restaurant" }] }, input);
    expect(r.requirements[0].status).toBe("not_shown");
    expect(r.requirements[0].evidence).toBeNull();
    expect(r.summary).toMatch(/will not claim it/);
  });
  it("evidence matching tolerates small wording differences", () => {
    expect(evidenceInInput("Lebanese mezze and menu planning", personText(input))).toBe(true);
    expect(evidenceInInput("French fine dining", personText(input))).toBe(false);
  });
  it("caps and cleans model output", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ requirement: `Req ${i}`, status: "met", evidence: "nothing like this" }));
    const r = verifyReport({ requirements: many }, input);
    expect(r.total).toBe(12);
    expect(r.covered).toBe(0);
  });
});

describe("tailoring prompt", () => {
  it("includes the job and forbids invented claims and numbers", () => {
    const b = tailoringBlock({ ...input, jobDescription: "Private Chef in Dubai. Michelin experience required." });
    expect(b).toMatch(/TAILOR THIS CV TO THE JOB BELOW/);
    expect(b).toMatch(/NEVER claim a requirement the person did not state/);
    expect(b).toMatch(/Do not invent numbers/);
    expect(b).toMatch(/Example Hotel Nairobi/);
  });
  it("adds nothing when there is no job description or work history", () => {
    expect(tailoringBlock({ role: "Driver" })).toBe("");
  });
});
