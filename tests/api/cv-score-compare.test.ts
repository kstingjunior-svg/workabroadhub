import { describe, it, expect } from "vitest";
import { deriveImprovements, buildCompareRecord, liftFeedback } from "../../server/lib/cv-score-compare";

const before = { score: 62, grade: "Below Average", missingKeywords: ["patient care", "IV therapy", "triage"], weaknesses: ["No professional summary section", "Bullets describe duties not results"] };
const after = { score: 84, grade: "Good", missingKeywords: [], weaknesses: ["Could add more certifications"] };
const inputCv = "Jane Doe\nExperience\nNurse at KNH. Responsible for ward rounds. Worked on admissions.\nEducation\nKMTC Diploma";
const outputCv = "Jane Doe\nProfessional Summary\nRegistered nurse with patient care and triage expertise.\nCore Skills\nIV therapy, patient care, triage\nWork Experience\nNurse at KNH. Led ward rounds for 30 patients daily, cut admission time by 20%.\nEducation\nKMTC Diploma";

describe("CV revamp honest scoring", () => {
  it("record holds exactly the measured numbers — nothing chosen or raised", () => {
    const r = buildCompareRecord(inputCv, outputCv, before, after, 2);
    expect(r.inputAtsScore).toBe(62);
    expect(r.outputAtsScore).toBe(84);
    expect(r.atsLift).toBe(22);
    expect(r.atsAttempts).toBe(2);
  });

  it("a rewrite that scored lower is reported as lower, with no improvements claimed", () => {
    const r = buildCompareRecord(inputCv, outputCv, { ...before, score: 90 }, { ...after, score: 88 }, 3);
    expect(r.outputAtsScore).toBe(88);
    expect(r.atsLift).toBe(-2);
    expect(r.atsImprovements).toEqual([]);
  });

  it("improvements come from real differences", () => {
    const imps = deriveImprovements(inputCv, outputCv, before, after);
    const keys = imps.map((i) => i.key);
    expect(keys).toContain("keywords");
    expect(keys).toContain("summary");
    expect(keys).toContain("achievements");
    expect(keys).toContain("language");
    expect(imps.find((i) => i.key === "keywords")!.detail).toMatch(/3 keywords/);
  });

  it("no differences → no claimed improvements", () => {
    expect(deriveImprovements(inputCv, inputCv, before, before)).toEqual([]);
  });

  it("retry feedback uses the checker's own findings", () => {
    const f = liftFeedback(before, { ...after, score: 64, missingKeywords: ["triage"], weaknesses: ["weak summary"] });
    expect(f).toContain("64/100");
    expect(f).toContain("triage");
    expect(f).toContain("weak summary");
  });
});
