import { describe, it, expect } from "vitest";
import {
  screenOffer,
  parseVisibleFields,
  extractSenderDomain,
  OFFER_SCREENING_VERSION,
  type EmployerSignals,
  type ParsedOfferFields,
} from "../../../server/tools/offer-screening";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function baseParsed(over: Partial<ParsedOfferFields> = {}): ParsedOfferFields {
  return {
    candidateName:  "John Doe",
    employerName:   "Acme Holdings LLC",
    positionTitle:  "Senior Engineer",
    workCountry:    "UAE",
    salaryAmount:   "AED 15,000 per month",
    salaryCurrency: "AED",
    startDate:      "2027-01-15",
    ...over,
  };
}

function baseEmployer(over: Partial<EmployerSignals> = {}): EmployerSignals {
  return {
    senderDomain:         "acmeholdings.com",
    domainMatchesCompany: true,
    hasLetterhead:        true,
    hasSignature:         true,
    hasPhysicalAddress:   true,
    ...over,
  };
}

const CLEAN_OFFER = `
Acme Holdings LLC
Sheikh Zayed Road, Dubai, UAE

Dear John Doe,

We are pleased to inform you of our offer for the position of Senior Engineer
at Acme Holdings LLC. Your salary will be AED 15,000 per month. Your start
date is 15 January 2027. You will be on a 6-month probation period.

Please contact hr@acmeholdings.com if you have any questions.

Sincerely,
Sarah Al-Nahyan
HR Manager
`;

const SCAM_OFFER = `
Dear Candidate,

Congratulations! You have been selected for immediate deployment. Please pay
a visa processing fee of KES 45,000 via M-Pesa to 0722XXXXXX to secure your
placement. This is guaranteed visa and 100% placement — no interview required.

We offer $8,000 per month plus free ticket and free accommodation. Reply ASAP
as slots are limited. Contact us via WhatsApp only.

Regards,
recruitment@gmail.com
`;

// ─────────────────────────────────────────────────────────────────────────────
// screenOffer — clean happy path
// ─────────────────────────────────────────────────────────────────────────────

describe("screenOffer — clean offer letter", () => {
  it("returns riskBand='low' on a clean corporate offer", () => {
    const r = screenOffer({
      ocrText:  CLEAN_OFFER,
      parsed:   baseParsed(),
      employer: baseEmployer(),
      aiVision: {
        notes: "Looks like a genuine corporate offer.",
        anomalyFlags: [],
        visionConfidence: 90,
      },
    });
    expect(r.version).toBe(OFFER_SCREENING_VERSION);
    expect(r.riskBand).toBe("low");
    expect(r.riskScore).toBeLessThan(31);
    expect(r.aiVisionUsed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// screenOffer — scam patterns
// ─────────────────────────────────────────────────────────────────────────────

describe("screenOffer — scam offer letter", () => {
  it("triggers multiple critical findings on obvious scam", () => {
    const r = screenOffer({
      ocrText:  SCAM_OFFER,
      parsed:   baseParsed({ candidateName: null, employerName: null }),
      employer: baseEmployer({
        senderDomain: "gmail.com",
        domainMatchesCompany: false,
        hasLetterhead: false,
        hasSignature: false,
        hasPhysicalAddress: false,
      }),
      aiVision: null,
    });
    const critical = r.findings.filter((f) => f.severity === "critical");
    expect(critical.length).toBeGreaterThanOrEqual(2);
    expect(r.riskBand).toBe("high");
    expect(r.findings.some((f) => f.code === "visa_fee_demand")).toBe(true);
    expect(r.findings.some((f) => f.code === "guaranteed_visa")).toBe(true);
    expect(r.findings.some((f) => f.code === "no_interview")).toBe(true);
  });

  it("flags free-email domain in HR contact", () => {
    const r = screenOffer({
      ocrText: `Contact hr@gmail.com for further details.`,
      parsed:  baseParsed(),
      employer: baseEmployer({ senderDomain: "gmail.com", domainMatchesCompany: false }),
      aiVision: null,
    });
    expect(r.findings.some((f) => f.code === "free_email_domain")).toBe(true);
  });

  it("flags upfront-fee demand", () => {
    const r = screenOffer({
      ocrText: `Please pay upfront KES 10,000 to complete your registration.`,
      parsed:  baseParsed(),
      employer: baseEmployer(),
      aiVision: null,
    });
    expect(r.findings.some((f) => f.code === "upfront_fee")).toBe(true);
  });

  it("flags Western Union / MoneyGram as critical", () => {
    const r = screenOffer({
      ocrText: `Send payment via Western Union to receive your offer.`,
      parsed:  baseParsed(),
      employer: baseEmployer(),
      aiVision: null,
    });
    const wu = r.findings.find((f) => f.code === "wire_transfer_service");
    expect(wu).toBeTruthy();
    expect(wu?.severity).toBe("critical");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// screenOffer — corporate signal deductions
// ─────────────────────────────────────────────────────────────────────────────

describe("screenOffer — corporate authenticity signals", () => {
  it("deducts points when letterhead + signature + matching domain all present", () => {
    const withSignals = screenOffer({
      ocrText: CLEAN_OFFER,
      parsed:  baseParsed(),
      employer: baseEmployer({
        hasLetterhead: true, hasSignature: true, hasPhysicalAddress: true,
        domainMatchesCompany: true,
      }),
      aiVision: null,
    });
    const withoutSignals = screenOffer({
      ocrText: CLEAN_OFFER,
      parsed:  baseParsed(),
      employer: baseEmployer({
        hasLetterhead: null, hasSignature: null, hasPhysicalAddress: null,
        domainMatchesCompany: null,
      }),
      aiVision: null,
    });
    expect(withSignals.riskScore).toBeLessThan(withoutSignals.riskScore);
  });

  it("flags domain_mismatch when sender domain != employer name", () => {
    const r = screenOffer({
      ocrText: CLEAN_OFFER,
      parsed:  baseParsed({ employerName: "Acme Holdings LLC" }),
      employer: baseEmployer({
        senderDomain: "recruit-jobs-online.info",
        domainMatchesCompany: false,
      }),
      aiVision: null,
    });
    expect(r.findings.some((f) => f.code === "domain_mismatch")).toBe(true);
  });

  it("flags no_letterhead when vision reports absence", () => {
    const r = screenOffer({
      ocrText: CLEAN_OFFER,
      parsed:  baseParsed(),
      employer: baseEmployer({ hasLetterhead: false }),
      aiVision: null,
    });
    expect(r.findings.some((f) => f.code === "no_letterhead")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// screenOffer — AI vision integration
// ─────────────────────────────────────────────────────────────────────────────

describe("screenOffer — vision flags", () => {
  it("classifies tampering keywords as critical", () => {
    const r = screenOffer({
      ocrText: CLEAN_OFFER,
      parsed:  baseParsed(),
      employer: baseEmployer(),
      aiVision: {
        notes: "Signature area appears fabricated.",
        anomalyFlags: ["fabricated signature", "photoshopped stamp"],
        visionConfidence: 25,
      },
    });
    expect(r.findings.filter((f) => f.severity === "critical").length).toBeGreaterThan(0);
    expect(r.findings.some((f) => f.code === "vision_low_confidence")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseVisibleFields
// ─────────────────────────────────────────────────────────────────────────────

describe("parseVisibleFields", () => {
  it("extracts employer + position + salary from a clean offer", () => {
    const p = parseVisibleFields(CLEAN_OFFER);
    expect(p.employerName ?? "").toMatch(/Acme/i);
    expect(p.positionTitle).toMatch(/Senior Engineer/);
    expect(p.salaryAmount).toMatch(/AED/);
    expect(p.salaryCurrency).toBe("AED");
    expect(p.workCountry).toBe("UAE");
  });

  it("returns nulls on unparseable text", () => {
    const p = parseVisibleFields("random text with no offer structure");
    expect(p.employerName).toBeNull();
    expect(p.salaryAmount).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// extractSenderDomain
// ─────────────────────────────────────────────────────────────────────────────

describe("extractSenderDomain", () => {
  it("matches domain root against employer name", () => {
    const r = extractSenderDomain(
      `Contact hr@acmeholdings.com for details.`,
      "Acme Holdings LLC",
    );
    expect(r.senderDomain).toBe("acmeholdings.com");
    expect(r.domainMatchesCompany).toBe(true);
  });

  it("returns false when employer name and domain diverge", () => {
    const r = extractSenderDomain(
      `Contact hr@quickrecruit-online.net`,
      "Acme Holdings LLC",
    );
    expect(r.domainMatchesCompany).toBe(false);
  });

  it("returns null when no email is found", () => {
    const r = extractSenderDomain(`No email visible.`, "Acme Ltd");
    expect(r.senderDomain).toBeNull();
    expect(r.domainMatchesCompany).toBeNull();
  });
});
