/**
 * analyzer.ts — AI IELTS Certificate Verification engine.
 *
 * Tony's founder brief (2026-07):
 *   "The AI should behave like an IELTS verification officer and forensic
 *   document examiner. Never simply respond 'Your IELTS certificate is
 *   genuine.' Instead provide evidence and explain the reasoning."
 *
 * Pipeline:
 *   1. GPT-4o vision extracts every TRF field + forensic observations.
 *   2. Match to provider (British Council / IDP / IELTS USA / Cambridge).
 *   3. Run IELTS-specific rules: score validity, overall-band consistency,
 *      TRF format, security features, date logic.
 *   4. Compute 7 sub-scores: Integrity, Format Compliance, Score Consistency,
 *      Security Features, Image Quality, Fraud Indicators, Verification
 *      Readiness.
 *   5. Aggregate → overall trust + risk band + verdict copy.
 *   6. Assemble recommendations + official portal links.
 */

import { openai } from "../lib/openai";
import { findProvider, SHARED_INSTITUTION_VERIFICATION, type IeltsProvider } from "./providers";
import { runIeltsRules, scoreIeltsRules, type RuleCheck, type ExtractedIeltsFields, computeExpectedOverallBand } from "./rules";

export type RiskBand = "low" | "medium" | "high" | "critical";
export type Verdict  = "consistent" | "verify_officially" | "suspicious" | "high_risk";

export interface SubScore {
  key: string;
  label: string;
  score: number;
  detail: string;
}

export interface IeltsAnalyzerReport {
  ok: true;
  overallTrust: number;
  confidence: number;
  riskBand: RiskBand;
  verdict: Verdict;
  headline: string;
  explanation: string;
  extractedFields: ExtractedIeltsFields;
  provider: IeltsProvider | null;
  subScores: SubScore[];
  findings: RuleCheck[];
  forgeryIndicators: string[];
  positiveIndicators: string[];
  recommendations: string[];
  officialResources: OfficialResource[];
}

export interface OfficialResource {
  label: string;
  url: string;
  audience: "candidates" | "institutions" | "both";
  note?: string;
}

export interface IeltsAnalyzerFailure {
  ok: false;
  error: string;
  message: string;
}

export type IeltsAnalyzerResult = IeltsAnalyzerReport | IeltsAnalyzerFailure;

const SYSTEM_PROMPT = `You are an IELTS Verification Officer with 10 years experience examining Test Report Forms (TRFs). You never guess whether a TRF is genuine — you observe carefully and report what you see.

You will be shown a suspected IELTS Test Report Form. Your job:
1. EXTRACT every field.
2. OBSERVE forensic properties.
3. RETURN a strict JSON object.

Return ONLY valid JSON (no markdown, no code fences):

{
  "candidateName": string | null,
  "candidateNumber": string | null,
  "trfNumber": string | null,
  "testCentreNumber": string | null,
  "testCentreName": string | null,
  "testDate": "YYYY-MM-DD" | null,
  "issueDate": "YYYY-MM-DD" | null,
  "passportNumber": string | null,
  "dateOfBirth": "YYYY-MM-DD" | null,
  "country": string | null,
  "nationality": string | null,
  "testType": "Academic" | "General Training" | "UKVI" | "Life Skills" | null,
  "deliveryMethod": "Paper" | "Computer" | "Online" | null,
  "overallBand": number | null,
  "listeningBand": number | null,
  "readingBand": number | null,
  "writingBand": number | null,
  "speakingBand": number | null,
  "cefrLevel": "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | null,
  "hasQrCode": boolean,
  "hasBarcode": boolean,
  "hasCandidatePhoto": boolean,
  "hasSignature": boolean,
  "hasSecurityBackground": boolean,
  "hasBritishCouncilLogo": boolean,
  "hasIdpLogo": boolean,
  "hasIeltsLogo": boolean,
  "hasWatermark": boolean,
  "layoutScore": 0-100,
  "imageQualityScore": 0-100,
  "forgeryIndicators": [string],
  "positiveIndicators": [string],
  "confidence": 0-100
}

Rules:
- Band scores use 0.5 increments (0, 0.5, 1, 1.5, ... 9). If you see a value that's not a valid IELTS band, still record it — the rule engine will flag it.
- Unknown → null. NEVER guess.
- forgeryIndicators: only things you actually observed (font mismatch, blurred text over the score field, edited photograph edges, low-res logo, misaligned baseline, colour banding around scores, etc.). Empty is fine.
- positiveIndicators: crisp official IELTS logo, matching security background pattern, sharp candidate photo edges, professional layout, etc.
- confidence: how sure you are of your reading (0 = illegible, 100 = crystal clear).`;

export async function analyzeIelts(imageBase64DataUrl: string): Promise<IeltsAnalyzerResult> {
  let vision: any;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 1500,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze this IELTS Test Report Form. Return the JSON only." },
            { type: "image_url", image_url: { url: imageBase64DataUrl, detail: "high" } },
          ],
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    vision = JSON.parse(raw);
  } catch (err: any) {
    console.error("[ielts-analyzer] Vision call failed:", err?.message);
    return { ok: false, error: "vision_failed", message: mapVisionError(err?.message ?? "") };
  }

  const fields: ExtractedIeltsFields = {
    candidateName:          str(vision.candidateName),
    candidateNumber:        str(vision.candidateNumber),
    trfNumber:              str(vision.trfNumber),
    testCentreNumber:       str(vision.testCentreNumber),
    testCentreName:         str(vision.testCentreName),
    testDate:               str(vision.testDate),
    issueDate:              str(vision.issueDate),
    passportNumber:         str(vision.passportNumber),
    dateOfBirth:            str(vision.dateOfBirth),
    country:                str(vision.country),
    nationality:            str(vision.nationality),
    testType:               str(vision.testType),
    deliveryMethod:         str(vision.deliveryMethod),
    overallBand:            num(vision.overallBand),
    listeningBand:          num(vision.listeningBand),
    readingBand:            num(vision.readingBand),
    writingBand:            num(vision.writingBand),
    speakingBand:           num(vision.speakingBand),
    cefrLevel:              str(vision.cefrLevel),
    hasQrCode:              bool(vision.hasQrCode),
    hasBarcode:             bool(vision.hasBarcode),
    hasCandidatePhoto:      bool(vision.hasCandidatePhoto),
    hasSignature:           bool(vision.hasSignature),
    hasSecurityBackground:  bool(vision.hasSecurityBackground),
    hasBritishCouncilLogo:  bool(vision.hasBritishCouncilLogo),
    hasIdpLogo:             bool(vision.hasIdpLogo),
    hasIeltsLogo:           bool(vision.hasIeltsLogo),
    hasWatermark:           bool(vision.hasWatermark),
  };

  const provider = findProvider({ testCentreName: fields.testCentreName, country: fields.country });
  const findings = runIeltsRules(fields);

  // Sub-scores
  const layoutScore    = clamp0100(vision.layoutScore);
  const imageScore     = clamp0100(vision.imageQualityScore);
  const ocrScore       = clamp0100(vision.confidence);
  const formatScore    = scoreIeltsRules(findings);
  const scoreConsistencyScore = scoreConsistencyBand(fields, findings);
  const securityFeatureCount = [
    fields.hasQrCode, fields.hasBarcode, fields.hasCandidatePhoto, fields.hasSignature,
    fields.hasSecurityBackground, fields.hasWatermark,
    fields.hasBritishCouncilLogo || fields.hasIdpLogo, fields.hasIeltsLogo,
  ].filter(Boolean).length;
  const securityScore  = Math.min(100, securityFeatureCount * 15);
  const forgeryCount   = arr(vision.forgeryIndicators).length;
  const fraudScore     = Math.max(0, 100 - forgeryCount * 20);
  const verifyReadinessScore = fields.trfNumber && fields.testCentreName && fields.candidateName ? 90 : 50;

  const subScores: SubScore[] = [
    { key: "integrity",       label: "Document Integrity",       score: layoutScore,    detail: describeIntegrity(layoutScore) },
    { key: "format",          label: "IELTS Format Compliance",  score: formatScore,    detail: describeFormat(formatScore, fields) },
    { key: "consistency",     label: "Score Consistency",        score: scoreConsistencyScore, detail: describeConsistency(fields) },
    { key: "security",        label: "Security Features",        score: securityScore,  detail: describeSecurityFeatures(fields, securityFeatureCount) },
    { key: "image",           label: "Image Quality / OCR",      score: (imageScore + ocrScore) / 2, detail: describeImage((imageScore + ocrScore) / 2) },
    { key: "fraud",           label: "Fraud Indicators (absent)", score: fraudScore,    detail: describeFraud(fraudScore, forgeryCount) },
    { key: "verify_ready",    label: "Verification Readiness",   score: verifyReadinessScore, detail: describeVerifyReadiness(fields) },
  ];

  // Overall weighted trust
  const overallTrust = Math.round(
    layoutScore              * 0.10 +
    formatScore              * 0.18 +
    scoreConsistencyScore    * 0.18 +
    securityScore            * 0.14 +
    ((imageScore + ocrScore) / 2) * 0.08 +
    fraudScore               * 0.22 +
    verifyReadinessScore     * 0.10,
  );
  const confidence = ocrScore;

  const { riskBand, verdict, headline, explanation } = deriveVerdict(overallTrust, findings, provider, fields);
  const recommendations = buildRecommendations(provider, fields, findings);
  const officialResources = buildOfficialResources(provider);

  return {
    ok: true,
    overallTrust,
    confidence,
    riskBand,
    verdict,
    headline,
    explanation,
    extractedFields: fields,
    provider,
    subScores,
    findings,
    forgeryIndicators:  arr(vision.forgeryIndicators),
    positiveIndicators: arr(vision.positiveIndicators),
    recommendations,
    officialResources,
  };
}

// ── Consistency helper ───────────────────────────────────────────────────

function scoreConsistencyBand(fields: ExtractedIeltsFields, findings: RuleCheck[]): number {
  const consistent = findings.find((f) => f.id === "overall_band_consistent");
  const inconsistent = findings.find((f) => f.id === "overall_band_inconsistent");
  const invalid = findings.some((f) => f.id.startsWith("band_") && f.id.endsWith("_invalid"));
  if (invalid) return 10;         // invalid band value = strongly suspicious
  if (inconsistent) return 25;    // wrong Overall Band calculation = classic forgery
  if (consistent) return 100;
  return 50;                      // no data to judge
}

// ── Verdict derivation ──────────────────────────────────────────────────

function deriveVerdict(
  overall: number,
  findings: RuleCheck[],
  provider: IeltsProvider | null,
  fields: ExtractedIeltsFields,
): { riskBand: RiskBand; verdict: Verdict; headline: string; explanation: string } {
  const hardFails = findings.filter((f) => f.status === "fail").length;
  const warns     = findings.filter((f) => f.status === "warn").length;
  const providerName = provider?.name || "the test provider";

  if (hardFails >= 2 || overall < 40) {
    return {
      riskBand: "critical",
      verdict:  "high_risk",
      headline: `⚠️ Multiple serious indicators — this TRF should NOT be accepted without ${providerName} confirming through official IELTS Verification.`,
      explanation: `Our forensic review found ${hardFails} critical issue${hardFails === 1 ? "" : "s"} inconsistent with a genuine IELTS Test Report Form. This doesn't confirm the document is forged, but the pattern matches known TRF fraud. Institutions receiving this TRF should independently verify through the official IELTS Verification Service (ORS) before making any decision.`,
    };
  }
  if (hardFails >= 1 || overall < 65) {
    return {
      riskBand: "high",
      verdict:  "suspicious",
      headline: `Serious concerns identified — verify through official IELTS channels before relying on this TRF.`,
      explanation: `We identified ${hardFails + warns} inconsistency${(hardFails + warns) === 1 ? "" : "ies"} with what a genuine ${providerName} TRF typically shows. At least one is a strong forgery indicator (overall band calculation, security features, or date logic). Independent verification via the official IELTS provider is essential.`,
    };
  }
  if (warns >= 3 || overall < 80) {
    return {
      riskBand: "medium",
      verdict:  "verify_officially",
      headline: `The TRF appears structurally consistent, but authenticity can only be confirmed via the official IELTS system.`,
      explanation: `Nothing about this TRF is a major red flag, and the standard fields are present. However, appearance alone cannot confirm a real IELTS certificate — every institution must verify through the ${providerName} channel. This is standard practice, not a criticism of the candidate.`,
    };
  }
  return {
    riskBand: "low",
    verdict:  "consistent",
    headline: `The document is consistent with a standard ${providerName} Test Report Form.`,
    explanation: `Our forensic checks found no significant inconsistencies. Layout, security features, band-score consistency, and date logic all match the expected ${providerName} format. However — critically — the IELTS Verification Service (ORS) is the only authoritative source, and only registered institutions can access it. If you are the receiving institution, please verify through ORS. If you are the candidate, download your official eTRF from your ${providerName} Test Taker Portal to share.`,
  };
}

// ── Recommendations ────────────────────────────────────────────────────

function buildRecommendations(provider: IeltsProvider | null, fields: ExtractedIeltsFields, findings: RuleCheck[]): string[] {
  const recs: string[] = [];

  if (provider?.links.testTakerPortal) {
    recs.push(`If you are the CANDIDATE: download your official eTRF from the ${provider.name} Test Taker Portal at ${provider.links.testTakerPortal} — sharing that link is the strongest proof of authenticity.`);
  }

  recs.push(`If you are the INSTITUTION receiving this TRF: verify through the official IELTS Online Results Verification Service (${SHARED_INSTITUTION_VERIFICATION.url}). Access is restricted to registered institutions.`);

  if (fields.trfNumber && fields.testCentreName) {
    recs.push(`Cross-reference the TRF number (${fields.trfNumber}) with the test centre "${fields.testCentreName}" — the centre can confirm whether this TRF was issued.`);
  }

  if (findings.some((f) => f.status === "fail")) {
    recs.push("Do NOT accept this TRF for admissions, visa, or employment decisions until officially verified. At least one hard fail was detected.");
  }

  if (provider?.contacts.supportPhone || provider?.contacts.supportEmail) {
    const parts: string[] = [];
    if (provider.contacts.supportEmail) parts.push(provider.contacts.supportEmail);
    if (provider.contacts.supportPhone) parts.push(provider.contacts.supportPhone);
    recs.push(`For direct queries, contact ${provider.name}: ${parts.join(" / ")}`);
  }

  if (provider?.links.fraudReporting) {
    recs.push(`Suspect a forged TRF? Report to ${provider.name}'s fraud channel: ${provider.links.fraudReporting}`);
  }

  recs.push("Compare the candidate name and passport number on this TRF to the candidate's passport — mismatches indicate identity fraud or clerical errors.");

  return recs;
}

// ── Official resources for the UI panel ────────────────────────────────

function buildOfficialResources(provider: IeltsProvider | null): OfficialResource[] {
  const list: OfficialResource[] = [];

  if (provider) {
    list.push({
      label: `${provider.name} Test Taker Portal`,
      url:   provider.links.testTakerPortal,
      audience: "candidates",
      note: "Candidates view + download their official eTRF here.",
    });
    list.push({
      label: `${provider.name} — Find a Test Centre`,
      url:   provider.links.findATestCentre,
      audience: "both",
    });
    list.push({
      label: `${provider.name} — Homepage`,
      url:   provider.links.homepage,
      audience: "both",
    });
    if (provider.links.fraudReporting) {
      list.push({
        label: `${provider.name} — Fraud Reporting`,
        url:   provider.links.fraudReporting,
        audience: "both",
      });
    }
  }

  list.push({
    label: SHARED_INSTITUTION_VERIFICATION.name,
    url:   SHARED_INSTITUTION_VERIFICATION.url,
    audience: "institutions",
    note: SHARED_INSTITUTION_VERIFICATION.note,
  });

  list.push({
    label: "Official IELTS.org",
    url:   "https://ielts.org/",
    audience: "both",
  });

  return list;
}

// ── Sub-score descriptions ─────────────────────────────────────────────

function describeIntegrity(s: number): string {
  if (s >= 85) return "Layout, alignment, and formatting are consistent with a genuine TRF.";
  if (s >= 60) return "Layout mostly consistent — minor spacing/alignment concerns.";
  return "Layout deviates from expected IELTS TRF formatting in visible ways.";
}
function describeFormat(s: number, f: ExtractedIeltsFields): string {
  const bits: string[] = [];
  if (f.testType)       bits.push(`type: ${f.testType}`);
  if (f.deliveryMethod) bits.push(`delivery: ${f.deliveryMethod}`);
  if (f.overallBand != null) bits.push(`overall: ${f.overallBand}`);
  return bits.length ? `TRF summary — ${bits.join(", ")}.` : "TRF fields incomplete — cannot fully validate format.";
}
function describeConsistency(f: ExtractedIeltsFields): string {
  if (f.listeningBand == null || f.readingBand == null || f.writingBand == null || f.speakingBand == null || f.overallBand == null) {
    return "Not all section scores + overall band were extracted — cannot verify calculation.";
  }
  const expected = computeExpectedOverallBand(f.listeningBand, f.readingBand, f.writingBand, f.speakingBand);
  return expected === f.overallBand
    ? `Overall band ${f.overallBand} correctly matches sections (L ${f.listeningBand} · R ${f.readingBand} · W ${f.writingBand} · S ${f.speakingBand}).`
    : `Overall band ${f.overallBand} does not match IELTS calculation of sections (expected ${expected}).`;
}
function describeSecurityFeatures(f: ExtractedIeltsFields, count: number): string {
  const bits: string[] = [];
  if (f.hasQrCode)         bits.push("QR");
  if (f.hasBarcode)        bits.push("barcode");
  if (f.hasCandidatePhoto) bits.push("photo");
  if (f.hasSignature)      bits.push("signature");
  if (f.hasSecurityBackground) bits.push("security bg");
  if (f.hasWatermark)      bits.push("watermark");
  if (f.hasBritishCouncilLogo || f.hasIdpLogo) bits.push("provider logo");
  if (f.hasIeltsLogo)      bits.push("IELTS logo");
  return `${count} security feature(s) detected: ${bits.join(", ") || "none"}.`;
}
function describeImage(s: number): string {
  if (s >= 85) return "Image is sharp and legible — extraction highly reliable.";
  if (s >= 60) return "Image is readable but somewhat compressed — some fields may be uncertain.";
  return "Image is low quality — extraction may be unreliable. Try a clearer scan for a better assessment.";
}
function describeFraud(score: number, count: number): string {
  if (count === 0) return "No forensic indicators of tampering detected.";
  if (count === 1) return "One forensic concern noted — see details.";
  return `${count} forensic concerns noted — see forgery indicators.`;
}
function describeVerifyReadiness(f: ExtractedIeltsFields): string {
  const bits: string[] = [];
  if (f.trfNumber)       bits.push("TRF #");
  if (f.testCentreName)  bits.push("centre name");
  if (f.candidateName)   bits.push("candidate");
  if (f.testDate)        bits.push("test date");
  return bits.length >= 3
    ? `Enough info to verify officially (${bits.join(", ")}).`
    : "Missing key fields required for official verification. Request a clearer TRF from the candidate.";
}

// ── Helpers ────────────────────────────────────────────────────────────

function str(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" || s.toLowerCase() === "null" || s.toLowerCase() === "unknown" ? null : s;
}
function num(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

function mapVisionError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("quota") || lower.includes("insufficient_quota")) return "Our verification AI is temporarily out of capacity. Please try again in a few minutes — no charge for this attempt.";
  if (lower.includes("rate limit") || lower.includes("429")) return "Our verification AI is handling many requests right now. Please try again in a few minutes.";
  if (lower.includes("timeout") || lower.includes("timed out")) return "The verification took longer than expected. Please try again with a smaller or clearer image.";
  return "We couldn't complete verification for this document. Please try again with a clearer photo or scan.";
}
