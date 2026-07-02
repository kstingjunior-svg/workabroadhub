import { describe, it, expect } from "vitest";
import {
  classifyDocument,
  checkDocumentType,
  DOCUMENT_CLASSIFIER_VERSION,
} from "../../../server/tools/document-classifier";

// ─────────────────────────────────────────────────────────────────────────────
// Sample documents for each type
// ─────────────────────────────────────────────────────────────────────────────

const CV_SAMPLE = `
John Doe
Nairobi, Kenya | john.doe@gmail.com | linkedin.com/in/johndoe

CAREER SUMMARY
Senior Software Engineer with 8 years of experience...

WORK EXPERIENCE
Tech Company Ltd — Senior Engineer
Jan 2020 - Present
- Led backend rebuild
- Managed team of 4

Startup Inc — Junior Engineer
2018 - 2020
- Built REST APIs

EDUCATION
University of Nairobi — Bachelor of Science in Computer Science, 2018

SKILLS
Proficient in: Python, TypeScript, React
Expertise in: distributed systems

REFERENCES
Available upon request.
`;

const JOB_ADVERT_SAMPLE = `
NOW HIRING — Senior Software Engineer

We are hiring a Senior Software Engineer to join our team at Acme Corp.

Key Responsibilities:
- Lead backend architecture decisions
- Mentor junior engineers
- Review code and drive engineering excellence

Required Qualifications:
- 5+ years of software engineering experience
- Strong proficiency in TypeScript

Preferred Skills:
- AWS experience
- Team leadership

Salary Range: USD 6,000 - 8,000 per month

Application deadline: 15 August 2027

Send your CV to careers@acmecorp.com or apply now via our website.

Acme Corp is an equal opportunity employer.
`;

const OFFER_LETTER_SAMPLE = `
Acme Holdings LLC
Sheikh Zayed Road, Dubai, UAE

Dear John Doe,

We are pleased to offer you the position of Senior Engineer at Acme Holdings LLC.

Your annual salary will be AED 180,000, paid monthly. Your start date is
15 January 2027. You will be on a 6-month probation period.

By signing this letter, you accept the offer and its conditions of employment
outlined in the attached employment contract. Your acceptance of this offer
should be communicated by 20 December 2026.

You will be reporting to Sarah Al-Nahyan, Head of Engineering.

Sincerely,
Sarah Al-Nahyan
HR Manager
`;

const VISA_SAMPLE = `
UNITED ARAB EMIRATES — RESIDENCE PERMIT

Visa Number: 784-1234567890
Category: Employment
Issuing State: UAE
Issuing Authority: General Directorate of Residency and Foreigners Affairs

Holder Name: DOE JOHN
Passport Number: K1234567
Nationality: KEN
Issue Date: 15 January 2027
Expiry Date: 14 January 2029
Emirates ID: 784-1990-1234567-8

Purpose of Entry: Employment
`;

const AMBIGUOUS_SAMPLE = `
Hello, this is a random note about my day. I went to the shop, bought some
groceries, and came home. The weather was nice today.
`;

// ─────────────────────────────────────────────────────────────────────────────
// classifyDocument — text-based classification
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyDocument — text-based classification", () => {
  it("identifies a CV", () => {
    const r = classifyDocument({ text: CV_SAMPLE });
    expect(r.version).toBe(DOCUMENT_CLASSIFIER_VERSION);
    expect(r.type).toBe("cv");
    expect(r.confidence).toBeGreaterThanOrEqual(30);
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it("identifies a job advert", () => {
    const r = classifyDocument({ text: JOB_ADVERT_SAMPLE });
    expect(r.type).toBe("job_advert");
    expect(r.scores.job_advert).toBeGreaterThan(r.scores.cv);
    expect(r.scores.job_advert).toBeGreaterThan(r.scores.offer_letter);
  });

  it("identifies an offer letter", () => {
    const r = classifyDocument({ text: OFFER_LETTER_SAMPLE });
    expect(r.type).toBe("offer_letter");
    expect(r.scores.offer_letter).toBeGreaterThan(r.scores.job_advert);
  });

  it("identifies a visa", () => {
    const r = classifyDocument({ text: VISA_SAMPLE });
    expect(r.type).toBe("visa");
    expect(r.scores.visa).toBeGreaterThan(20);
  });

  it("returns 'unknown' for ambiguous text", () => {
    const r = classifyDocument({ text: AMBIGUOUS_SAMPLE });
    expect(r.type).toBe("unknown");
  });

  it("returns 'unknown' for empty input", () => {
    const r = classifyDocument({ text: "" });
    expect(r.type).toBe("unknown");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Vision hint override
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyDocument — vision hint override", () => {
  it("trusts a high-confidence vision hint when text also supports it", () => {
    // CV text + vision confidently says CV — vision wins (but text also agrees)
    const r = classifyDocument({
      text: CV_SAMPLE,
      visionHint: { type: "cv", confidence: 92 },
    });
    expect(r.type).toBe("cv");
    expect(r.confidence).toBe(92);
  });

  it("ignores vision hint when confidence is low", () => {
    const r = classifyDocument({
      text: VISA_SAMPLE,
      visionHint: { type: "cv", confidence: 30 },  // low confidence
    });
    // Should fall back to text-based: visa
    expect(r.type).toBe("visa");
  });

  it("ignores vision hint of 'unknown'", () => {
    const r = classifyDocument({
      text: CV_SAMPLE,
      visionHint: { type: "unknown", confidence: 90 },
    });
    // Should fall back to text-based: cv
    expect(r.type).toBe("cv");
  });

  it("does not trust vision when text has zero support for its choice", () => {
    // Text is a CV; vision confidently claims visa. If text has zero visa
    // signal we don't blindly trust vision.
    const r = classifyDocument({
      text: CV_SAMPLE,
      visionHint: { type: "visa", confidence: 95 },
    });
    expect(r.type).toBe("cv");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkDocumentType — the endpoint gate
// ─────────────────────────────────────────────────────────────────────────────

describe("checkDocumentType", () => {
  it("returns null when type matches expected", () => {
    const cls = classifyDocument({ text: VISA_SAMPLE });
    const check = checkDocumentType(cls, "visa");
    expect(check).toBeNull();
  });

  it("returns wrongDocumentType with suggested tool when types don't match", () => {
    const cls = classifyDocument({ text: CV_SAMPLE });
    const check = checkDocumentType(cls, "visa");
    expect(check).not.toBeNull();
    expect(check!.wrongDocumentType).toBe(true);
    expect(check!.detected).toBe("cv");
    expect(check!.expected).toBe("visa");
    expect(check!.suggestedTool.path).toBe("/tools/ats-cv-checker");
    expect(check!.suggestedTool.label).toBe("ATS CV Checker");
    expect(check!.message).toMatch(/CV/i);
    expect(check!.message).toMatch(/ATS CV Checker/i);
  });

  it("returns clarifying message when detected type is unknown", () => {
    const cls = classifyDocument({ text: AMBIGUOUS_SAMPLE });
    const check = checkDocumentType(cls, "visa");
    expect(check).not.toBeNull();
    expect(check!.detected).toBe("unknown");
    expect(check!.suggestedTool.label).toBe("Visa Screening");
    expect(check!.message).toMatch(/couldn't confidently identify/i);
  });

  it("suggests the CORRECT tool for each detected type", () => {
    // A CV uploaded to any of the other three tools should suggest ATS CV Checker
    for (const expected of ["visa", "offer_letter", "job_advert"] as const) {
      const cls = classifyDocument({ text: CV_SAMPLE });
      const check = checkDocumentType(cls, expected);
      expect(check!.suggestedTool.path).toBe("/tools/ats-cv-checker");
    }

    // A visa uploaded to the offer checker should suggest visa screening
    const visaCls = classifyDocument({ text: VISA_SAMPLE });
    const check2 = checkDocumentType(visaCls, "offer_letter");
    expect(check2!.suggestedTool.path).toBe("/tools/visa-check");

    // An offer letter uploaded to the CV checker should suggest offer screener
    const offerCls = classifyDocument({ text: OFFER_LETTER_SAMPLE });
    const check3 = checkDocumentType(offerCls, "cv");
    expect(check3!.suggestedTool.path).toBe("/tools/offer-check");

    // A job advert uploaded to the visa checker should suggest job scam checker
    const advertCls = classifyDocument({ text: JOB_ADVERT_SAMPLE });
    const check4 = checkDocumentType(advertCls, "visa");
    expect(check4!.suggestedTool.path).toBe("/tools/job-scam-checker");
  });
});
