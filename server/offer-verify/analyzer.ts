/**
 * analyzer.ts — AI Employment Offer Letter Verification engine.
 *
 * Tony's founder brief (2026-07):
 *   "The AI should behave like an experienced HR manager, immigration
 *   officer, labour inspector, and document forensic analyst. Never simply
 *   respond 'This letter is genuine.' Instead provide evidence and explain
 *   the reasoning."
 *
 * Pipeline:
 *   1. Vision extract every field (employer, salary, dates, benefits, contact info)
 *      + forensic observations + full document text.
 *   2. Match issuing country against the same country registry the visa
 *      verifier uses (server/visa-verify/countries.ts — reused).
 *   3. Run universal fraud pattern detectors (fraud-patterns.ts).
 *   4. Run salary realism check against country/occupation benchmarks
 *      (salary-benchmarks.ts).
 *   5. Compute 8 sub-scores: Company, Document, Salary, Contact, Country
 *      Compliance, Fraud Indicators, Recruitment Practices, Website Trust.
 *   6. Aggregate → overall trust + risk band + verdict copy.
 *   7. Assemble recommendations + country gov-links + scam matches.
 */

import { openai } from "../lib/openai";
import { findCountry, type CountryVisaResources } from "../visa-verify/countries";
import {
  detectFraudPatterns,
  type ExtractedOfferFields,
  type FraudFinding,
} from "./fraud-patterns";
import {
  getSalaryTable,
  classifyJobTitle,
  type OccupationKey,
} from "./salary-benchmarks";

// ── Result shape ────────────────────────────────────────────────────────

export type RiskBand = "low" | "medium" | "high" | "critical";
export type Verdict  = "trustworthy" | "verify_first" | "suspicious" | "high_risk";

export interface SubScore {
  key: string;
  label: string;
  score: number;
  detail: string;
}

export interface SalaryAssessment {
  detected: boolean;
  occupationKey: OccupationKey | null;
  occupationLabel: string | null;
  offeredMonthly: number | null;
  currency: string | null;
  expectedMonthlyMin: number | null;
  expectedMonthlyMax: number | null;
  band: "below_range" | "in_range" | "above_range" | "too_high" | "unknown";
  explanation: string;
}

export interface OfferAnalyzerReport {
  ok: true;
  overallTrust: number;
  confidence: number;
  riskBand: RiskBand;
  verdict: Verdict;
  headline: string;
  explanation: string;
  extractedFields: ExtractedOfferFields;
  country: CountryVisaResources | null;
  subScores: SubScore[];
  findings: FraudFinding[];
  salaryAssessment: SalaryAssessment;
  positiveIndicators: string[];
  negativeIndicators: string[];
  recommendations: string[];
  scamPatternsMatched: string[];
}

export interface OfferAnalyzerFailure {
  ok: false;
  error: string;
  message: string;
}

export type OfferAnalyzerResult = OfferAnalyzerReport | OfferAnalyzerFailure;

// ── Vision prompt ──────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior HR compliance officer with 15 years of experience verifying overseas employment offers. Your job is to extract every fact from the offer letter you are shown and note forensic observations — never to guess authenticity.

You will be shown an employment offer letter document. Your job:
1. EXTRACT every field present.
2. OBSERVE forensic properties (letterhead quality, signature presence, formatting consistency).
3. RETURN a strict JSON object.

Return ONLY valid JSON in this shape (no markdown, no code fences):

{
  "employerName": string | null,
  "companyRegistrationNumber": string | null,
  "companyAddress": string | null,
  "country": "United Arab Emirates" | "Canada" | "United Kingdom" | ... | null,
  "jobTitle": string | null,
  "salaryText": string | null,
  "salaryMonthly": number | null,
  "currency": "AED" | "USD" | "GBP" | ... | null,
  "workingHours": string | null,
  "benefits": [string],
  "accommodation": string | null,
  "medicalInsurance": string | null,
  "visaSponsorship": string | null,
  "probationPeriod": string | null,
  "contractDuration": string | null,
  "leaveDays": string | null,
  "reportingManager": string | null,
  "startDate": "YYYY-MM-DD" | null,
  "workLocation": string | null,
  "recruitmentAgency": string | null,
  "recruiterName": string | null,
  "recruiterEmail": string | null,
  "recruiterPhone": string | null,
  "companyWebsite": string | null,
  "hasSignature": boolean,
  "hasStamp": boolean,
  "hasLetterhead": boolean,
  "dateIssued": "YYYY-MM-DD" | null,
  "referenceNumber": string | null,
  "fullText": string,
  "layoutScore": 0-100,
  "documentAuthenticityScore": 0-100,
  "forgeryIndicators": [string],
  "positiveIndicators": [string],
  "confidence": 0-100
}

Rules:
- Unknown fields → null. NEVER guess.
- salaryMonthly: convert stated pay to MONTHLY figure in local currency. If letter says "$60,000 annual", set salaryMonthly=5000 and currency="USD". If unclear, leave null.
- fullText: extract EVERY word of visible text (used for scam-phrase scanning downstream). Keep line breaks.
- benefits: only list items explicitly stated.
- forgeryIndicators: only include things you actually observed (font mismatch, misaligned baseline, copy-paste artifact, low-res logo, spelling errors that suggest a template not authored by native English HR, etc). Empty is fine.
- positiveIndicators: what specifically looks legitimate (crisp corporate letterhead, matching signature block, professional English, reasonable specificity).
- confidence: how sure you are of your own reading (0 = illegible, 100 = crystal clear).`;

// ── Main entrypoint ────────────────────────────────────────────────────

/**
 * 2026-08 (Tony): accept EITHER an image data URL (vision path) OR raw
 * extracted text (PDF / Word path). Vision remains the default because
 * layout signals matter — pixelated logos, misaligned baselines, font
 * mismatches — but for PDFs and Word docs we skip the image encode and
 * feed the extracted text directly. Same JSON schema, same downstream
 * scoring — the analyzer just loses the visual forgery signals when
 * running on text.
 */
export type AnalyzeOfferInput =
  | { kind: "image"; imageBase64DataUrl: string }
  | { kind: "text"; text: string; sourceFilename?: string };

export async function analyzeOffer(
  input: string | AnalyzeOfferInput,
): Promise<OfferAnalyzerResult> {
  // Backwards-compat: legacy callers still pass a raw data URL string.
  const normalized: AnalyzeOfferInput =
    typeof input === "string" ? { kind: "image", imageBase64DataUrl: input } : input;

  // 2026-08 (Tony's Christopher NYAGA fix): retry-with-cleanup layer.
  // Mixed-script offers (Arabic/English MOHRE, Chinese contracts, French
  // Canadian) frequently trip up gpt-4o's JSON mode — the model returns
  // prose or malformed JSON despite response_format: json_object. First
  // attempt uses raw text; if it throws (including JSON.parse errors), we
  // retry once with Latin-only text stripped of RTL / CJK characters and
  // a bumped max_tokens ceiling.
  const buildUserContent = (textInput: string): any[] =>
    normalized.kind === "image"
      ? [
          { type: "text", text: "Analyze this employment offer letter. Return the JSON only." },
          { type: "image_url", image_url: { url: normalized.imageBase64DataUrl, detail: "high" } },
        ]
      : [
          {
            type: "text",
            text:
              "The user uploaded a document" +
              (normalized.sourceFilename ? ` named "${normalized.sourceFilename}"` : "") +
              " (PDF or Word). Layout/font signals are not available — analyze from the extracted text only. " +
              "For forgeryIndicators and positiveIndicators, ONLY include signals that can be judged from text " +
              "(grammar quality, template-y phrasing, contradictions, missing legal boilerplate, unusual monetary demands). " +
              "Do NOT invent visual observations like 'pixelated logo' when you can't see the image.\n\n" +
              "---BEGIN OFFER LETTER TEXT---\n" +
              textInput.slice(0, 12_000) + // safety cap
              "\n---END OFFER LETTER TEXT---\n\nReturn the JSON only.",
          },
        ];

  const callOpenAi = async (userContent: any[], maxTokens = 2200): Promise<any> => {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    return JSON.parse(raw);
  };

  // Strip RTL (Arabic, Hebrew), CJK, and other non-Latin scripts that
  // frequently break JSON emission. Keeps Latin, digits, punctuation,
  // whitespace. Also collapses multiple blank lines.
  const stripNonLatin = (t: string): string =>
    t
      .replace(/[֐-ࣿ一-鿿぀-ヿ가-힯]+/g, " ")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n");

  let vision: any;
  let attempt = 1;
  try {
    vision = await callOpenAi(
      buildUserContent(normalized.kind === "text" ? normalized.text : ""),
    );
  } catch (err: any) {
    console.warn(
      `[offer-analyzer] Attempt 1 failed: kind=${normalized.kind} ` +
      `status=${err?.status ?? "?"} code=${err?.code ?? "?"} type=${err?.type ?? "?"} ` +
      `msg="${err?.message ?? "?"}" ` +
      (normalized.kind === "text" ? `textLen=${normalized.text.length}` : ""),
    );

    // Second attempt: only useful for text path with mixed-script content
    // or JSON parse errors. For image errors (rate limit, invalid image,
    // quota) retrying with the same input won't help — surface immediately.
    const errStr = String(err?.message ?? "").toLowerCase();
    const looksLikeJsonParse =
      errStr.includes("unexpected token") ||
      errStr.includes("json") && errStr.includes("parse") ||
      errStr.includes("unexpected end of json");
    const isFatal =
      errStr.includes("credit_balance_exhausted") ||
      errStr.includes("insufficient_quota") ||
      errStr.includes("rate limit") ||
      errStr.includes("429");

    if (normalized.kind === "text" && looksLikeJsonParse && !isFatal) {
      try {
        attempt = 2;
        const cleaned = stripNonLatin(normalized.text);
        console.warn(
          `[offer-analyzer] Retrying with non-Latin stripped: ` +
          `origLen=${normalized.text.length} cleanedLen=${cleaned.length}`,
        );
        vision = await callOpenAi(buildUserContent(cleaned), 3000);
      } catch (err2: any) {
        console.error(
          `[offer-analyzer] Analysis call failed on retry: kind=${normalized.kind} ` +
          `status=${err2?.status ?? "?"} code=${err2?.code ?? "?"} type=${err2?.type ?? "?"} ` +
          `msg="${err2?.message ?? "?"}"`,
        );
        return {
          ok: false,
          error: "vision_failed",
          message: mapVisionError(err2?.message ?? "", normalized.kind),
        };
      }
    } else {
      console.error(
        `[offer-analyzer] Analysis call failed: kind=${normalized.kind} ` +
        `status=${err?.status ?? "?"} code=${err?.code ?? "?"} type=${err?.type ?? "?"} ` +
        `msg="${err?.message ?? "?"}" ` +
        (normalized.kind === "text" ? `textLen=${normalized.text.length}` : ""),
      );
      return {
        ok: false,
        error: "vision_failed",
        message: mapVisionError(err?.message ?? "", normalized.kind),
      };
    }
  }

  if (attempt === 2) {
    console.log(`[offer-analyzer] Retry succeeded after Latin-only cleanup`);
  }

  // Map vision output to structured fields
  const fields: ExtractedOfferFields = {
    employerName:              str(vision.employerName),
    companyRegistrationNumber: str(vision.companyRegistrationNumber),
    companyAddress:            str(vision.companyAddress),
    country:                   str(vision.country),
    jobTitle:                  str(vision.jobTitle),
    salaryText:                str(vision.salaryText),
    salaryMonthly:             num(vision.salaryMonthly),
    currency:                  str(vision.currency),
    workingHours:              str(vision.workingHours),
    benefits:                  arr(vision.benefits),
    accommodation:             str(vision.accommodation),
    medicalInsurance:          str(vision.medicalInsurance),
    visaSponsorship:           str(vision.visaSponsorship),
    probationPeriod:           str(vision.probationPeriod),
    contractDuration:          str(vision.contractDuration),
    leaveDays:                 str(vision.leaveDays),
    reportingManager:          str(vision.reportingManager),
    startDate:                 str(vision.startDate),
    workLocation:              str(vision.workLocation),
    recruitmentAgency:         str(vision.recruitmentAgency),
    recruiterName:             str(vision.recruiterName),
    recruiterEmail:            str(vision.recruiterEmail),
    recruiterPhone:            str(vision.recruiterPhone),
    companyWebsite:            str(vision.companyWebsite),
    hasSignature:              bool(vision.hasSignature),
    hasStamp:                  bool(vision.hasStamp),
    hasLetterhead:             bool(vision.hasLetterhead),
    dateIssued:                str(vision.dateIssued),
    referenceNumber:           str(vision.referenceNumber),
    fullText:                  str(vision.fullText),
  };

  // Country match
  const country = findCountry(fields.country);

  // Fraud pattern detection
  const findings = detectFraudPatterns(fields);

  // Salary realism check
  const salaryAssessment = assessSalary(fields, country);
  if (salaryAssessment.band === "too_high") {
    findings.push({
      id: "salary_too_high",
      label: "Salary is unrealistically high",
      severity: "hard",
      detail: salaryAssessment.explanation,
      actionable: "Verify by cross-checking the country's typical salary range for this role via the destination country's labour ministry.",
    });
  } else if (salaryAssessment.band === "above_range") {
    findings.push({
      id: "salary_above_range",
      label: "Salary is above the normal range",
      severity: "soft",
      detail: salaryAssessment.explanation,
      actionable: "Ask the employer to clarify how the salary is structured (basic + allowances + overtime).",
    });
  } else if (salaryAssessment.band === "below_range") {
    findings.push({
      id: "salary_below_range",
      label: "Salary is below the country's minimum wage / market range",
      severity: "hard",
      detail: salaryAssessment.explanation,
      actionable: "This may indicate exploitation. Do not accept without verifying with the destination country's labour authority.",
    });
  } else if (salaryAssessment.band === "in_range") {
    findings.push({
      id: "salary_in_range",
      label: "Salary matches expected market range",
      severity: "info",
      detail: salaryAssessment.explanation,
    });
  }

  // Sub-scores
  const docScore   = clamp0100(vision.documentAuthenticityScore);
  const layoutScore = clamp0100(vision.layoutScore);
  const ocrScore   = clamp0100(vision.confidence);
  const fraudScore = scoreFraud(findings);
  const salaryScore = salaryScoreFromAssessment(salaryAssessment);
  const contactScore = scoreContactInfo(fields);
  const companyScore = scoreCompanyIdentity(fields);
  const recruitmentScore = scoreRecruitment(fields, findings);
  const countryScore = country ? 100 : 40; // Unknown country = uncertain
  const websiteScore = fields.companyWebsite ? 80 : 45;

  const subScores: SubScore[] = [
    { key: "company",       label: "Company Identity",       score: companyScore,     detail: describeCompany(fields, companyScore) },
    { key: "document",      label: "Document Authenticity",  score: docScore,         detail: describeDocument(docScore, fields) },
    { key: "salary",        label: "Salary Realism",         score: salaryScore,      detail: salaryAssessment.explanation },
    { key: "contact",       label: "Contact Information",    score: contactScore,     detail: describeContact(fields, contactScore) },
    { key: "country",       label: "Country Compliance",     score: countryScore,     detail: describeCountry(country) },
    { key: "fraud",         label: "Fraud Indicators",       score: fraudScore,       detail: describeFraud(fraudScore, findings.length) },
    { key: "recruitment",   label: "Recruitment Practices",  score: recruitmentScore, detail: describeRecruitment(fields, recruitmentScore) },
    { key: "website",       label: "Website Trust",          score: websiteScore,     detail: fields.companyWebsite ? `Website provided: ${fields.companyWebsite}` : "No company website provided in the letter." },
  ];

  // Overall weighted trust
  const overallTrust = Math.round(
    companyScore     * 0.14 +
    docScore         * 0.12 +
    salaryScore      * 0.14 +
    contactScore     * 0.10 +
    countryScore     * 0.10 +
    fraudScore       * 0.22 +
    recruitmentScore * 0.10 +
    websiteScore     * 0.08,
  );
  const confidence = ocrScore;

  const { riskBand, verdict, headline, explanation } = deriveVerdict(overallTrust, findings, country, fields);
  const recommendations = buildRecommendations(country, fields, findings, salaryAssessment);
  const scamPatternsMatched = country?.knownScamPatterns?.slice() ?? [];

  return {
    ok: true,
    overallTrust,
    confidence,
    riskBand,
    verdict,
    headline,
    explanation,
    extractedFields: fields,
    country,
    subScores,
    findings,
    salaryAssessment,
    positiveIndicators: arr(vision.positiveIndicators),
    negativeIndicators: arr(vision.forgeryIndicators),
    recommendations,
    scamPatternsMatched,
  };
}

// ── Salary assessment ─────────────────────────────────────────────────

function assessSalary(fields: ExtractedOfferFields, country: CountryVisaResources | null): SalaryAssessment {
  const empty: SalaryAssessment = {
    detected: false,
    occupationKey: null,
    occupationLabel: null,
    offeredMonthly: null,
    currency: null,
    expectedMonthlyMin: null,
    expectedMonthlyMax: null,
    band: "unknown",
    explanation: "Salary or occupation could not be determined — cannot benchmark.",
  };
  if (!country) return { ...empty, explanation: "Country unknown — cannot benchmark salary." };
  if (!fields.salaryMonthly || !fields.jobTitle) return empty;

  const table = getSalaryTable(country.code);
  if (!table) return { ...empty, explanation: `No salary benchmarks available for ${country.name} yet.` };

  const occupation = classifyJobTitle(fields.jobTitle);
  if (!occupation) {
    return {
      ...empty,
      occupationKey: null,
      occupationLabel: null,
      offeredMonthly: fields.salaryMonthly,
      currency: fields.currency ?? null,
      explanation: `Job title "${fields.jobTitle}" doesn't map to a benchmarked occupation.`,
    };
  }
  const band = table.bands.find((b) => b.occupationKey === occupation);
  if (!band) return { ...empty, explanation: `No ${country.name} benchmark for occupation "${occupation}".` };

  const offered = fields.salaryMonthly;
  const min = band.localMonthlyMin;
  const max = band.localMonthlyMax;

  let category: SalaryAssessment["band"];
  let explanation: string;

  if (offered < min * 0.6) {
    category = "below_range";
    explanation = `Offered ${offered.toLocaleString()} ${band.currency}/mo is far below the typical ${band.label} range in ${country.name} (${min.toLocaleString()}–${max.toLocaleString()} ${band.currency}). This may indicate wage exploitation.${band.note ? " " + band.note : ""}`;
  } else if (offered < min) {
    category = "below_range";
    explanation = `Offered ${offered.toLocaleString()} ${band.currency}/mo is slightly below the typical ${band.label} range in ${country.name} (${min.toLocaleString()}–${max.toLocaleString()} ${band.currency}).`;
  } else if (offered <= max) {
    category = "in_range";
    explanation = `Offered ${offered.toLocaleString()} ${band.currency}/mo fits within the typical range for ${band.label} in ${country.name} (${min.toLocaleString()}–${max.toLocaleString()} ${band.currency}). Consistent with a legitimate offer.`;
  } else if (offered <= max * 1.5) {
    category = "above_range";
    explanation = `Offered ${offered.toLocaleString()} ${band.currency}/mo is above the typical range (${min.toLocaleString()}–${max.toLocaleString()} ${band.currency}) but not impossibly so. Verify the pay breakdown.`;
  } else {
    category = "too_high";
    explanation = `Offered ${offered.toLocaleString()} ${band.currency}/mo is dramatically higher than the typical ${band.label} pay in ${country.name} (${min.toLocaleString()}–${max.toLocaleString()} ${band.currency}). This is a classic "too-good-to-be-true" scam indicator.`;
  }

  return {
    detected: true,
    occupationKey: occupation,
    occupationLabel: band.label,
    offeredMonthly: offered,
    currency: band.currency,
    expectedMonthlyMin: min,
    expectedMonthlyMax: max,
    band: category,
    explanation,
  };
}

// ── Scoring helpers ───────────────────────────────────────────────────

function scoreFraud(findings: FraudFinding[]): number {
  let s = 100;
  for (const f of findings) {
    if (f.severity === "hard") s -= 25;
    else if (f.severity === "soft") s -= 10;
  }
  return Math.max(0, s);
}
function salaryScoreFromAssessment(a: SalaryAssessment): number {
  switch (a.band) {
    case "in_range":    return 100;
    case "above_range": return 60;
    case "below_range": return 30;
    case "too_high":    return 15;
    case "unknown":     return 55;
  }
}
function scoreContactInfo(f: ExtractedOfferFields): number {
  let s = 20;
  if (f.recruiterEmail)   s += 25;
  if (f.recruiterPhone)   s += 15;
  if (f.recruiterName)    s += 15;
  if (f.companyWebsite)   s += 15;
  if (f.companyAddress)   s += 10;
  return Math.min(100, s);
}
function scoreCompanyIdentity(f: ExtractedOfferFields): number {
  let s = 10;
  if (f.employerName)              s += 30;
  if (f.companyRegistrationNumber) s += 25;
  if (f.companyAddress)            s += 20;
  if (f.companyWebsite)            s += 15;
  return Math.min(100, s);
}
function scoreRecruitment(f: ExtractedOfferFields, findings: FraudFinding[]): number {
  let s = 80;
  if (findings.some((x) => x.id === "personal_payment_account")) s -= 40;
  if (findings.some((x) => x.id === "upfront_fee_requested"))    s -= 40;
  if (findings.some((x) => x.id === "pressure_tactics"))         s -= 15;
  if (f.recruitmentAgency)                                       s += 10;
  return Math.max(0, Math.min(100, s));
}

// ── Verdict derivation ───────────────────────────────────────────────

function deriveVerdict(
  overall: number,
  findings: FraudFinding[],
  country: CountryVisaResources | null,
  fields: ExtractedOfferFields,
): { riskBand: RiskBand; verdict: Verdict; headline: string; explanation: string } {
  const hardFails = findings.filter((f) => f.severity === "hard").length;
  const softFails = findings.filter((f) => f.severity === "soft").length;
  const employer = fields.employerName || "the employer";
  const countryName = country?.name || "the destination country";

  if (hardFails >= 2 || overall < 40) {
    return {
      riskBand: "critical",
      verdict:  "high_risk",
      headline: `⚠️ Multiple serious fraud indicators — do NOT act on this offer without official ${countryName} verification.`,
      explanation: `Our review found ${hardFails} critical issue${hardFails === 1 ? "" : "s"} that match known overseas employment scam patterns. This alone doesn't prove the offer is fake, but the pattern is unmistakable. Do not send money, share your passport, or resign your current job until you have independently verified ${employer} through official ${countryName} channels below.`,
    };
  }
  if (hardFails >= 1 || overall < 65) {
    return {
      riskBand: "high",
      verdict:  "suspicious",
      headline: `Serious concerns about this offer — verify everything before proceeding.`,
      explanation: `We identified ${hardFails + softFails} inconsistency${(hardFails + softFails) === 1 ? "" : "ies"} with what a legitimate ${countryName} employer typically provides. Some may be legitimate quirks, but at least one is a strong fraud indicator. Please verify with the ${countryName} authorities below before making any decisions.`,
    };
  }
  if (softFails >= 3 || overall < 80) {
    return {
      riskBand: "medium",
      verdict:  "verify_first",
      headline: `The offer looks generally consistent, but should be verified officially before you commit.`,
      explanation: `Nothing about this offer is a major red flag, and most standard fields are in place. However, ${softFails} soft concern${softFails === 1 ? "" : "s"} were noted, and appearance alone can't confirm legitimacy — always verify the employer directly and the country's work-permit process.`,
    };
  }
  return {
    riskBand: "low",
    verdict:  "trustworthy",
    headline: `This offer appears well-structured and consistent with a legitimate ${countryName} employer.`,
    explanation: `Our checks found no significant inconsistencies. The employer identification, salary, contact info, and document structure all look right. We still recommend a final official verification — no one should ever quit a job or send money based on visual review alone.`,
  };
}

// ── Recommendations builder ──────────────────────────────────────────

function buildRecommendations(
  country: CountryVisaResources | null,
  fields: ExtractedOfferFields,
  findings: FraudFinding[],
  salary: SalaryAssessment,
): string[] {
  const recs: string[] = [];

  if (fields.employerName && country?.links.employerCheck) {
    recs.push(`Verify "${fields.employerName}" against ${country.name}'s official employer registry: ${country.links.employerCheck}`);
  }
  if (country?.links.recruitmentCheck) {
    recs.push(`Confirm any recruitment agency involved is licensed via ${country.name}'s recruitment authority: ${country.links.recruitmentCheck}`);
  }
  if (country?.links.workPermitChecker) {
    recs.push(`Check the country's work-permit requirements at ${country.links.workPermitChecker} — a real employer must have started the permit process before you travel.`);
  }
  if (findings.some((f) => f.severity === "hard")) {
    recs.push("Do NOT send any money, share your original passport, or resign your current job until you have independently verified the employer.");
  }
  if (fields.companyWebsite) {
    recs.push(`Google "${fields.employerName || "the company"}" independently. Verify the website URL matches what the letter shows and the address on the letter matches the address on the website.`);
  } else {
    recs.push(`Google the company name + city — verify a real corporate website + LinkedIn page exist.`);
  }
  if (fields.recruiterEmail) {
    const domain = fields.recruiterEmail.split("@")[1] ?? "";
    if (domain) {
      recs.push(`Email the company's HR through their WEBSITE contact page (not the sender's email) and ask them to confirm the recruiter is a real employee.`);
    }
  }
  if (country?.contacts.embassyPhone) {
    recs.push(`For final confirmation, contact the ${country.name} embassy in Nairobi: ${country.contacts.embassyPhone}${country.contacts.embassyEmail ? ` / ${country.contacts.embassyEmail}` : ""}`);
  }
  if (salary.band === "too_high" || salary.band === "above_range") {
    recs.push(`The offered salary is above normal — request a full pay breakdown (basic + housing + transport + medical) in writing before accepting.`);
  }
  recs.push("Register the offer with Kenya's National Employment Authority (NEA) at neaims.nea.go.ke before travel — this is a legal requirement + your best proof if things go wrong.");
  recs.push("Kenya MFA overseas jobs desk: https://www.mfa.go.ke/");
  return recs;
}

// ── Sub-score descriptions ───────────────────────────────────────────

function describeCompany(f: ExtractedOfferFields, s: number): string {
  const bits: string[] = [];
  if (f.employerName)              bits.push("name");
  if (f.companyRegistrationNumber) bits.push("registration number");
  if (f.companyAddress)            bits.push("address");
  if (f.companyWebsite)            bits.push("website");
  return bits.length
    ? `Employer identity fields present: ${bits.join(", ")}.`
    : "No employer identity fields were clearly stated.";
}
function describeDocument(s: number, f: ExtractedOfferFields): string {
  const authBits: string[] = [];
  if (f.hasLetterhead) authBits.push("letterhead");
  if (f.hasSignature)  authBits.push("signature");
  if (f.hasStamp)      authBits.push("stamp");
  return `Authenticity elements: ${authBits.length ? authBits.join(" + ") : "none detected"}.`;
}
function describeContact(f: ExtractedOfferFields, s: number): string {
  const bits: string[] = [];
  if (f.recruiterEmail)  bits.push("email");
  if (f.recruiterPhone)  bits.push("phone");
  if (f.recruiterName)   bits.push("recruiter name");
  return bits.length
    ? `Contact info present: ${bits.join(", ")}.`
    : "No recruiter contact information detected.";
}
function describeCountry(c: CountryVisaResources | null): string {
  return c
    ? `${c.name} identified as the destination — country-specific compliance rules applied.`
    : "Destination country could not be identified — country-specific compliance not applied.";
}
function describeFraud(score: number, findingsCount: number): string {
  if (findingsCount === 0) return "No fraud pattern matches — clean.";
  return `${findingsCount} finding(s) contributing to fraud score. See detail below.`;
}
function describeRecruitment(f: ExtractedOfferFields, s: number): string {
  return f.recruitmentAgency
    ? `Recruitment via "${f.recruitmentAgency}" — verify the agency is licensed with the destination country's labour authority.`
    : "No recruitment agency named — direct-employer offer or agency not disclosed.";
}

// ── Helpers ────────────────────────────────────────────────────────────

function str(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" || s.toLowerCase() === "null" || s.toLowerCase() === "unknown" ? null : s;
}
function num(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function bool(v: any): boolean {
  return v === true || v === "true" || v === 1;
}
function arr(v: any): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim().length > 0).map(String) : [];
}
function clamp0100(v: any): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function mapVisionError(msg: string, kind: "image" | "text" = "image"): string {
  const lower = (msg || "").toLowerCase();
  // Billing / quota exhaustion — checked BEFORE the generic "429" branch
  // because OpenAI billing errors ALSO carry status 429, and the two need
  // very different user messaging (retry-later vs admin-must-top-up).
  if (
    lower.includes("credit_balance_exhausted") ||
    lower.includes("no credits remaining") ||
    lower.includes("credits remaining") ||
    lower.includes("insufficient_quota") ||
    lower.includes("exceeded your current quota")
  ) {
    return "Our verification service is temporarily unavailable. Our team has been notified and is topping it up now — please try again in 10-15 minutes.";
  }
  if (lower.includes("rate limit") || lower.includes("rate_limit") || lower.includes("429")) {
    return "Our verification AI is handling many requests right now. Please wait 30 seconds and try again.";
  }
  if (lower.includes("context_length") || lower.includes("maximum context") || lower.includes("too long")) {
    return kind === "text"
      ? "This offer letter is longer than we can analyse in one go. Please upload just the offer details page (skip the T&Cs and appendices)."
      : "This document is very long — try uploading just the first 2-3 pages, or a photo of the key page (offer details + salary + signatures).";
  }
  if (lower.includes("invalid_image") || lower.includes("could not process image")) {
    return "We couldn't read that image. Please try a clearer JPG/PNG photo — good lighting, no glare.";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return kind === "text"
      ? "The verification took longer than expected. Please try again."
      : "The verification took longer than expected. Please try again with a smaller or clearer image.";
  }
  if (lower.includes("connection") || lower.includes("network") || lower.includes("econnrefused")) {
    return "We couldn't reach the verification service. Please check your connection and try again.";
  }
  // 2026-08 (Tony): JSON parse failure — model returned prose instead of
  // JSON despite response_format: json_object. Rare but happens on mixed-
  // language content (e.g. Arabic/English MOHRE offers) or when the model
  // refuses. Guide the user without falsely blaming a "clearer scan".
  if (
    lower.includes("unexpected token") ||
    lower.includes("json") && lower.includes("parse") ||
    lower.includes("unexpected end of json")
  ) {
    return kind === "text"
      ? "Our AI struggled to structure this offer letter. If it contains mixed languages or an unusual layout, try uploading a photo of the English page only, or paste just the key details (employer, role, salary, dates) into the classic verifier."
      : "Our AI struggled to structure this document. Please try a clearer photo of just the offer details page.";
  }
  // 2026-08 (Tony): OpenAI content-policy refusal (rare for offer letters,
  // but possible if the offer contains sensitive personal data).
  if (lower.includes("content_policy") || lower.includes("safety_policy") || lower.includes("filtered")) {
    return "Our AI flagged this content for manual review. Please contact us via WhatsApp and we'll verify it personally.";
  }
  // 2026-08: context-aware fallback so we don't tell a PDF user "try a
  // clearer scan" when they never uploaded a scan.
  return kind === "text"
    ? "We couldn't complete verification for this document. Please try again in a minute, or paste just the offer details (employer, role, salary, dates) into the classic verifier."
    : "We couldn't complete verification for this document. Please try again with a clearer photo or scan.";
}
