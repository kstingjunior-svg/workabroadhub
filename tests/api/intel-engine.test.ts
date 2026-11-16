/**
 * Intelligence engine (2026-11) — pure logic only, SYNTHETIC data only.
 * No real customer names, passport numbers or contacts appear here.
 */
import { describe, it, expect } from "vitest";
import {
  compareNames, identityFindings, identityConsistency, maskPassport, paymentFindings,
  parsePastedEmail, emailFindings, isLookalike, parseMentions, parsePayments, type IdentityMention,
} from "../../server/verifyx/forensics";
import { validateFindings, containsBannedClaim, type Finding } from "../../server/verifyx/evidence";
import { assessRisk, verificationStates } from "../../server/verifyx/risk";
import { evaluateOffer, type OfferExtraction } from "../../server/offer-verify/analyzer";
import { normPhone, normEmail, normDomain, normAccount, normName, templateHash, indicatorsFromOffer } from "../../server/intel/network";

const NOW = new Date("2026-11-17T09:00:00Z");
const m = (name: string | null, location: string, confidence = 95, extra: Partial<IdentityMention> = {}): IdentityMention =>
  ({ name, location, page: null, confidence, passportNumber: null, dateOfBirth: null, ...extra });

const userText = (f: Finding) => [f.title, f.examined, f.documentSays, f.evidenceSays, f.whyItMatters, f.howToVerify, f.uncertainty].join(" ");

describe("name comparison", () => {
  it("ignores order, case, titles and a missing middle name", () => {
    expect(compareNames("Mr. TESTA Q. SAMPLEPERSON", "Testa Sampleperson")).toBe("same");
    expect(compareNames("Sampleperson Testa", "testa sampleperson")).toBe("same");
  });
  it("detects a completely different person", () => {
    expect(compareNames("Testa Sampleperson", "Otherina Fictionson")).toBe("different");
  });
  it("detects a partial variant", () => {
    expect(compareNames("Testa Mid Sampleperson", "Testa Other Sampleperson")).toBe("variant");
  });
});

describe("cross-location identity forensics", () => {
  it("raises a confirmed discrepancy when two clear readings name different people", () => {
    const f = identityFindings([m("Testa Sampleperson", "page 1 addressee block"), m("Otherina Fictionson", "page 2 footer")], NOW);
    const { accepted } = validateFindings(f);
    expect(accepted[0].code).toBe("applicant_name_mismatch");
    expect(accepted[0].status).toBe("confirmed_discrepancy");
  });
  it("downgrades to a risk indicator when one reading is unclear (no forgery claim from appearance)", () => {
    const f = identityFindings([m("Testa Sampleperson", "page 1 addressee block"), m("Otherina Fictionson", "page 2 footer", 60)], NOW);
    const { accepted } = validateFindings(f);
    expect(accepted[0].status).toBe("potential_risk_indicator");
    expect(accepted[0].downgradeReason).toMatch(/reading error/);
  });
  it("masks passport numbers and flags two different numbers", () => {
    const f = identityFindings([
      m("Testa Sampleperson", "page 1 body", 95, { passportNumber: "ZZ0000111" }),
      m("Testa Sampleperson", "page 3 id section", 95, { passportNumber: "ZZ0000999" }),
    ], NOW);
    const pp = f.find((x) => x.code === "applicant_passport_mismatch")!;
    expect(pp).toBeTruthy();
    expect(JSON.stringify(pp)).not.toContain("ZZ0000111");
    expect(pp.documentSays).toContain(maskPassport("ZZ0000111"));
  });
  it("reports consistency only with enough clear readings", () => {
    expect(identityConsistency([m("Testa Sampleperson", "a"), m("TESTA SAMPLEPERSON", "b")])).toBe("consistent");
    expect(identityConsistency([m("Testa Sampleperson", "a")])).toBe("not_enough");
    expect(identityConsistency([m("Testa Sampleperson", "a"), m("Otherina Fictionson", "b")])).toBe("inconsistent");
  });
  it("produces no banned authenticity language", () => {
    const all = [
      ...identityFindings([m("Testa Sampleperson", "a"), m("Otherina Fictionson", "b")], NOW),
      ...paymentFindings([{ amount: 25000, currency: "KES", purpose: "processing fee", payTo: "agent", method: "M-Pesa", accountRef: "0700000000", quote: null }], "AE", NOW, null),
    ];
    for (const f of all) expect(containsBannedClaim(userText(f))).toBe(false);
  });
});

describe("payment requests", () => {
  it("personal / mobile-money payee is high priority", () => {
    const [f] = paymentFindings([{ amount: 25000, currency: "KES", purpose: "processing fee", payTo: "Agent", method: "M-Pesa", accountRef: "0700000000", quote: null }], "AE", NOW, null);
    expect(f.code).toBe("payment_to_personal_account");
    expect(f.priority).toBe("high");
  });
  it("Canada cites the reviewed hiring-fee rule", () => {
    const [f] = paymentFindings([{ amount: 2000, currency: "CAD", purpose: "placement fee", payTo: "Recruiter", method: "bank transfer", accountRef: null, quote: null }], "CA", NOW, null);
    expect(f.source?.ruleId).toBe("CA.EMPLOYER.NO_HIRING_FEES");
  });
  it("government fees are never given a made-up figure", () => {
    const [f] = paymentFindings([{ amount: 500, currency: "USD", purpose: "visa application fee", payTo: null, method: null, accountRef: null, quote: null }], "GB", NOW, "https://www.gov.uk/");
    expect(f.evidenceSays).toMatch(/not checked this amount against an official fee table/);
    expect(f.howToVerifyUrl).toBe("https://www.gov.uk/");
  });
});

describe("recruiter email", () => {
  it("flags Reply-To mismatch, look-alike domain and payment wording", () => {
    const e = parsePastedEmail("From: HR <hr@examp1e-corp.com>\nReply-To: someone@othermail.test\nSubject: Offer\n\nPlease pay the processing fee within 24 hours to secure your slot.");
    const codes = emailFindings(e, { employerName: "Example Corp", companyWebsite: "https://example-corp.com", letterEmail: null }, NOW).map((f) => f.code);
    expect(codes).toContain("email_reply_to_differs");
    expect(codes).toContain("email_lookalike_domain");
    expect(codes).toContain("email_requests_payment");
    expect(codes).toContain("email_pressure");
  });
  it("look-alike detection", () => {
    expect(isLookalike("examp1e-corp.com", "example-corp.com")).toBe(true);
    expect(isLookalike("example-corp.co", "example-corp.com")).toBe(true);
    expect(isLookalike("unrelated.org", "example-corp.com")).toBe(false);
  });
});

describe("risk level + verification states", () => {
  it("identity discrepancy → CRITICAL; nothing found → LOW with a not-confirmation statement", () => {
    const { accepted } = validateFindings(identityFindings([m("Testa Sampleperson", "a"), m("Otherina Fictionson", "b")], NOW));
    expect(assessRisk(accepted, "discrepancies_found").level).toBe("CRITICAL");
    const low = assessRisk([], "no_discrepancies_found");
    expect(low.level).toBe("LOW");
    expect(low.recommendedAction).toMatch(/not confirmation/);
    expect(low.statement).toMatch(/not a legal determination/);
  });
  it("insufficient evidence", () => {
    expect(assessRisk([], "insufficient_information").level).toBe("INSUFFICIENT_EVIDENCE");
  });
  it("never claims issuer authenticity without an issuer channel", () => {
    const s = verificationStates([], { tool: "offer_check", identity: "consistent" });
    expect(s.find((x) => x.key === "issuer_authenticity")!.state).toBe("not_confirmed");
    expect(s.find((x) => x.key === "internal_consistency")!.state).toBe("passed");
    expect(s.find((x) => x.key === "overall")!.label).toBe("Verification incomplete");
  });
});

describe("end-to-end offer evaluation (synthetic, no network)", () => {
  const base: OfferExtraction = {
    fields: {
      employerName: "Example Corp", companyRegistrationNumber: null, companyAddress: null, country: "United Arab Emirates",
      jobTitle: "Driver", salaryText: "AED 2,500", salaryMonthly: 2500, currency: "AED", workingHours: null, benefits: [],
      accommodation: null, medicalInsurance: null, visaSponsorship: null, probationPeriod: null, contractDuration: null,
      leaveDays: null, reportingManager: null, startDate: null, workLocation: null, recruitmentAgency: null,
      agencyLicenceNumber: null, recruiterName: null, recruiterEmail: null, recruiterPhone: null, companyWebsite: null,
      hasSignature: true, hasStamp: false, hasLetterhead: true, dateIssued: null, referenceNumber: null, fullText: null,
    } as any,
    fieldConfidence: {}, readability: 90, visualObservations: [], aiFlaggedInstructions: false, scannedText: null,
    applicantMentions: parseMentions([
      { name: "Testa Sampleperson", location: "page 1 addressee block", page: 1, confidence: 96 },
      { name: "Otherina Fictionson", location: "page 2 footer", page: 2, confidence: 93 },
    ]),
    paymentRequests: parsePayments([{ amount: "KES 30,000", currency: "KES", purpose: "visa processing", payTo: "Agent", method: "M-Pesa", accountRef: "0700000000" }]),
  };
  it("report carries risk level, states and the new findings", async () => {
    const r = await evaluateOffer(base, { skipNetwork: true, now: NOW });
    expect(r.risk.level).toBe("CRITICAL");
    expect(r.findings.map((f) => f.code)).toEqual(expect.arrayContaining(["applicant_name_mismatch", "payment_to_personal_account"]));
    expect(r.verificationStates.find((s) => s.key === "internal_consistency")!.state).toBe("failed");
  });
  it("older stored extractions without the new keys still evaluate", async () => {
    const { applicantMentions, paymentRequests, ...old } = base;
    const r = await evaluateOffer(old as OfferExtraction, { skipNetwork: true, now: NOW });
    expect(r.risk).toBeTruthy();
    expect(r.findings.some((f) => f.code === "applicant_name_mismatch")).toBe(false);
  });
});

describe("intelligence network normalisation", () => {
  it("phones match across formats", () => {
    expect(normPhone("0700 000 001")).toBe(normPhone("+254700000001"));
    expect(normPhone("254700000001")).toBe("700000001");
  });
  it("free mailboxes are not domains", () => {
    expect(normDomain("someone@gmail.com")).toBeNull();
    expect(normDomain("hr@example-corp.co.ke")).toBe("example-corp.co.ke");
    expect(normEmail("HR <HR@Example.com>")).toBe("hr@example.com");
  });
  it("accounts need digits; junk names are ignored", () => {
    expect(normAccount("Paybill 400200 Acc 12345")).toBe("paybill400200acc12345");
    expect(normAccount("cash")).toBeNull();
    expect(normName("Unknown (reported via scam checker)")).toBeNull();
    expect(normName("Blue Example Travel Agency Ltd")).toBe("blue example travel");
  });
  it("template hash ignores the applicant's name and numbers", () => {
    const body = Array.from({ length: 80 }, (_, i) => `clause${String.fromCharCode(97 + (i % 26))}word`).join(" ");
    const a = templateHash(`Dear Testa Sampleperson, salary 2500. ${body}`, ["Testa Sampleperson"]);
    const b = templateHash(`Dear Otherina Fictionson, salary 9000. ${body}`, ["Otherina Fictionson"]);
    expect(a).toBeTruthy();
    expect(a).toBe(b);
  });
  it("indicators from an offer extraction", () => {
    const inds = indicatorsFromOffer({
      fields: { recruiterPhone: "+254 700 000 001", recruiterEmail: "hr@example-corp.com", recruiterName: "Testa Sampleperson" },
      paymentRequests: [{ accountRef: "0700000002" }, { accountRef: "Paybill 400200 Acc 12345" }],
    });
    const kinds = inds.map((i) => `${i.kind}:${i.value}`);
    expect(kinds).toEqual(expect.arrayContaining(["phone:700000001", "email:hr@example-corp.com", "domain:example-corp.com", "phone:700000002", "payment_account:paybill400200acc12345"]));
  });
});
