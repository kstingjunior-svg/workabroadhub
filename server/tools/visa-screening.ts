/**
 * Visa Screening — pure logic (RC1 free tool).
 *
 * Given OCR'd text from a visa/permit image and optional AI-vision
 * observations, this module produces a structured screening report:
 *
 *   • Extracted fields (visa number, dates, holder name, issuing country).
 *   • MRZ parse + ICAO check-digit validation (the strongest single signal).
 *   • Rule-based findings (date sanity, format checks, keyword presence).
 *   • Composite 0-100 risk score + three-band verdict (low/medium/high).
 *
 * The module is deliberately PURE: no I/O, no OpenAI calls, no DB writes.
 * The HTTP endpoint (visa-check-endpoint.ts) does the OCR and vision pass
 * and hands the results here for scoring. That separation lets us unit-test
 * every rule without needing an OpenAI key.
 *
 * IMPORTANT — legal framing:
 *   We never call an output "genuine" or "fake". The output is a risk-band
 *   and a list of findings. The user sees a screening report, not a
 *   verification certificate. See docs/tools/visa-screening.md (TODO).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export const VISA_SCREENING_VERSION = 1;

export type RiskBand = "low" | "medium" | "high";

export type FindingSeverity = "info" | "warning" | "critical";

export interface Finding {
  code:     string;
  severity: FindingSeverity;
  message:  string;
}

export interface ParsedVisaFields {
  visaNumber:      string | null;
  issuingCountry:  string | null;   // ISO-3166 alpha-3 preferred; free text tolerated
  holderName:      string | null;
  visaType:        string | null;   // e.g. "Skilled Worker", "Employment", "Iqama"
  issueDate:       string | null;   // YYYY-MM-DD
  expiryDate:      string | null;   // YYYY-MM-DD
}

export interface MrzParseResult {
  present:        boolean;
  raw:            string | null;   // the two/three MRZ lines concatenated
  documentType:   string | null;   // 'V' for visa; 'P' for passport (some visas embed pp mrz)
  issuingState:   string | null;   // 3-letter ICAO code
  holderName:     string | null;
  documentNumber: string | null;
  nationality:    string | null;
  dob:            string | null;   // YYMMDD
  sex:            string | null;
  expiry:         string | null;   // YYMMDD
  checksumValid:  boolean | null;  // null = couldn't compute
  checkDetails:   string;          // human-readable summary of what we checked
}

export interface AiVisionObservation {
  /** The raw notes returned by the vision model (2-4 sentences). */
  notes:                  string;
  /** Discrete anomaly flags the vision model raised. Free-form; scored below. */
  anomalyFlags:           string[];
  /** Vision model's own confidence that the image is a genuine visa (0-100). */
  visionConfidence:       number | null;
}

export interface ScreenVisaInput {
  ocrText:          string;
  parsed:           ParsedVisaFields;
  mrz:              MrzParseResult;
  aiVision:         AiVisionObservation | null;
  today?:           Date;              // injectable for tests
}

export interface ScreenVisaReport {
  version:        typeof VISA_SCREENING_VERSION;
  riskScore:      number;
  riskBand:       RiskBand;
  findings:       Finding[];
  parsed:         ParsedVisaFields;
  mrz:            MrzParseResult;
  aiVisionUsed:   boolean;
  aiVisionNotes:  string | null;
  /** One-line human-friendly headline for the UI. */
  headline:       string;
  /** Recommended next step for the user. */
  recommendation: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// MRZ parser + ICAO checksum
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse the Machine Readable Zone from OCR text. Handles Type-V (visa,
 * 2 lines × 44 chars) and Type-A/B (visa, 2 lines × 36-44 chars).
 * Returns { present: false } if no MRZ signal was found — that's not an
 * error, some paper visas legitimately have no MRZ.
 */
export function parseMrz(ocrText: string): MrzParseResult {
  const empty: MrzParseResult = {
    present:        false,
    raw:            null,
    documentType:   null,
    issuingState:   null,
    holderName:     null,
    documentNumber: null,
    nationality:    null,
    dob:            null,
    sex:            null,
    expiry:         null,
    checksumValid:  null,
    checkDetails:   "No MRZ found in OCR text.",
  };

  // Find two consecutive lines of ≥ 30 chars from the MRZ alphabet
  // (A-Z, 0-9, and '<' as filler). MRZ is bottom-of-document, so search
  // the last 12 non-blank lines.
  const lines = ocrText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const mrzChar = /^[A-Z0-9<]+$/;
  const isMrzLine = (s: string) =>
    s.length >= 30 && s.length <= 46 && mrzChar.test(s.replace(/\s+/g, ""));

  // Walk pairs of adjacent lines from the bottom up.
  for (let i = lines.length - 1; i >= 1; i--) {
    const l2 = lines[i].replace(/\s+/g, "");
    const l1 = lines[i - 1].replace(/\s+/g, "");
    if (isMrzLine(l1) && isMrzLine(l2)) {
      return decodeMrzTypeV(l1, l2) ?? empty;
    }
  }

  return empty;
}

/**
 * Decode an ICAO Type-V MRZ (2 lines × 44 chars). Type-V is the official
 * "visa" format. Also tolerates 36-char (older) variants by truncating
 * fields that don't exist.
 */
function decodeMrzTypeV(l1: string, l2: string): MrzParseResult | null {
  // Line 1 (44 chars typical):
  //   pos  1  : document type ('V' for visa)
  //   pos  2  : (subtype letter, often '<')
  //   pos  3-5: issuing state (3-letter ICAO)
  //   pos  6-44: holder name (SURNAME<<GIVEN<NAMES<filled with '<')
  //
  // Line 2 (44 chars typical):
  //   pos  1-9 : document number
  //   pos 10   : check digit for document number
  //   pos 11-13: nationality (3-letter ICAO)
  //   pos 14-19: date of birth (YYMMDD)
  //   pos 20   : check digit for DOB
  //   pos 21   : sex (M/F/<)
  //   pos 22-27: expiry date (YYMMDD)
  //   pos 28   : check digit for expiry
  //   pos 29-44: optional data + composite check digit at end

  if (l1[0] !== "V" && l1[0] !== "P") return null; // not a visa/passport line

  const documentType = l1[0];
  const issuingState = l1.slice(2, 5).replace(/</g, "");
  const nameRaw      = l1.slice(5).replace(/<{2,}/g, " ").replace(/</g, " ").trim();

  const documentNumber   = l2.slice(0, 9).replace(/</g, "");
  const docNumCheck      = l2[9];
  const nationality      = l2.slice(10, 13).replace(/</g, "");
  const dob              = l2.slice(13, 19);
  const dobCheck         = l2[19];
  const sex              = l2[20];
  const expiry           = l2.slice(21, 27);
  const expiryCheck      = l2[27];

  const details: string[] = [];
  let allValid = true;

  const okDoc = mrzCheckDigit(documentNumber) === docNumCheck;
  details.push(`document number checksum: ${okDoc ? "PASS" : "FAIL"}`);
  if (!okDoc) allValid = false;

  const okDob = mrzCheckDigit(dob) === dobCheck;
  details.push(`date-of-birth checksum: ${okDob ? "PASS" : "FAIL"}`);
  if (!okDob) allValid = false;

  const okExp = mrzCheckDigit(expiry) === expiryCheck;
  details.push(`expiry-date checksum: ${okExp ? "PASS" : "FAIL"}`);
  if (!okExp) allValid = false;

  return {
    present:        true,
    raw:            `${l1}\n${l2}`,
    documentType,
    issuingState:   issuingState || null,
    holderName:     nameRaw || null,
    documentNumber: documentNumber || null,
    nationality:    nationality || null,
    dob:            dob || null,
    sex:            sex && sex !== "<" ? sex : null,
    expiry:         expiry || null,
    checksumValid:  allValid,
    checkDetails:   details.join("; "),
  };
}

/**
 * ICAO 9303 check digit algorithm.
 * Weights: 7, 3, 1 repeating. '<' counts as 0. Letters A-Z map to 10-35.
 */
export function mrzCheckDigit(input: string): string {
  const weights = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    let v: number;
    if (c === "<") v = 0;
    else if (/[0-9]/.test(c)) v = parseInt(c, 10);
    else if (/[A-Z]/.test(c)) v = c.charCodeAt(0) - "A".charCodeAt(0) + 10;
    else continue; // skip unexpected chars
    sum += v * weights[i % 3];
  }
  return String(sum % 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Country-specific visa number patterns. Very rough — a real deployment
 * should refine per issuing state as we gather examples. Absence here does
 * NOT mean invalid; it means "no format rule to check".
 */
const VISA_NUMBER_PATTERNS: Record<string, RegExp> = {
  UAE:    /^\d{9,15}$/,           // Emirates ID / entry-permit style
  QAT:    /^\d{8,12}$/,           // Qatar visa numbers
  SAU:    /^\d{10}$/,             // Saudi visa numbers (Enjazit)
  GBR:    /^[A-Z0-9]{9,12}$/,     // UK BRP / vignette
  CAN:    /^[A-Z]{1}\d{9}$/,      // Canadian visa numbers
  USA:    /^[A-Z0-9]{8}$/,        // US visa foil number
  DEU:    /^[A-Z0-9]{9}$/,        // Schengen national ID
};

/**
 * Given parsed fields + MRZ + AI vision, produce findings and a composite
 * 0-100 risk score. Higher = more suspicious.
 */
export function screenVisa(input: ScreenVisaInput): ScreenVisaReport {
  const today = input.today ?? new Date();
  const findings: Finding[] = [];

  // ── 1. Document must LOOK like a visa at all ────────────────────────────
  const ocrLower = input.ocrText.toLowerCase();
  const visaKeywords = ["visa", "permit", "entry", "residence", "employment",
                        "iqama", "cos", "boarder", "border", "sponsor"];
  const hasVisaSignal = visaKeywords.some((k) => ocrLower.includes(k));
  if (!hasVisaSignal) {
    findings.push({
      code:     "not_visa_like",
      severity: "critical",
      message:  "The uploaded document does not contain the vocabulary of a visa or work permit. It may not be a visa at all.",
    });
  }

  // ── 2. MRZ presence + checksum ──────────────────────────────────────────
  if (input.mrz.present) {
    if (input.mrz.checksumValid === false) {
      findings.push({
        code:     "mrz_checksum_failed",
        severity: "critical",
        message:  `Machine-readable-zone checksum failed (${input.mrz.checkDetails}). Genuine visas always have valid MRZ check digits.`,
      });
    } else if (input.mrz.checksumValid === true) {
      findings.push({
        code:     "mrz_checksum_passed",
        severity: "info",
        message:  "Machine-readable-zone check digits are consistent with ICAO 9303 standards.",
      });
    }
  } else {
    // Missing MRZ isn't automatically bad — some real permits are text-only —
    // but it does mean we can't cross-verify parsed fields against the MRZ.
    findings.push({
      code:     "mrz_missing",
      severity: "info",
      message:  "No machine-readable-zone detected. Fewer cross-checks are possible on this document.",
    });
  }

  // ── 3. Date arithmetic ──────────────────────────────────────────────────
  const issue  = parseDateSafe(input.parsed.issueDate);
  const expiry = parseDateSafe(input.parsed.expiryDate);

  if (issue && expiry) {
    if (issue > expiry) {
      findings.push({
        code:     "dates_reversed",
        severity: "critical",
        message:  `Issue date (${input.parsed.issueDate}) is AFTER expiry date (${input.parsed.expiryDate}). Impossible on a genuine document.`,
      });
    }
    const spanDays = (expiry.getTime() - issue.getTime()) / (1000 * 60 * 60 * 24);
    if (spanDays > 365 * 10) {
      findings.push({
        code:     "duration_too_long",
        severity: "warning",
        message:  `Validity period spans ${Math.round(spanDays / 365)} years — unusually long for most visa classes.`,
      });
    }
    if (spanDays < 1 && spanDays > -1) {
      findings.push({
        code:     "duration_zero",
        severity: "warning",
        message:  "Issue and expiry dates are the same day — unusual.",
      });
    }
  }
  if (expiry && expiry < today) {
    findings.push({
      code:     "already_expired",
      severity: "warning",
      message:  `Visa has already expired (${input.parsed.expiryDate}). It cannot grant current entry.`,
    });
  }
  if (issue && issue > today) {
    findings.push({
      code:     "issued_in_future",
      severity: "critical",
      message:  `Issue date (${input.parsed.issueDate}) is in the future. Impossible on a genuine document.`,
    });
  }

  // ── 4. Visa-number format ──────────────────────────────────────────────
  if (input.parsed.visaNumber && input.parsed.issuingCountry) {
    const iso = normalizeCountryToIso3(input.parsed.issuingCountry);
    const rule = iso ? VISA_NUMBER_PATTERNS[iso] : undefined;
    if (rule && !rule.test(input.parsed.visaNumber.trim().toUpperCase())) {
      findings.push({
        code:     "visa_number_format_mismatch",
        severity: "warning",
        message:  `Visa number "${input.parsed.visaNumber}" does not match the typical format for ${iso}.`,
      });
    }
  }

  // ── 5. MRZ ↔ visible-field cross-check ─────────────────────────────────
  if (input.mrz.present && input.mrz.expiry && expiry) {
    const mrzExpiry = mrzYymmddToDate(input.mrz.expiry);
    if (mrzExpiry && Math.abs(mrzExpiry.getTime() - expiry.getTime()) > 24 * 60 * 60 * 1000) {
      findings.push({
        code:     "mrz_visible_expiry_mismatch",
        severity: "critical",
        message:  "MRZ expiry date does not match the visible expiry date. Tamper indicator.",
      });
    }
  }

  // ── 6. AI vision observations ───────────────────────────────────────────
  if (input.aiVision) {
    for (const flag of input.aiVision.anomalyFlags) {
      const sev = classifyVisionSeverity(flag);
      findings.push({
        code:     "vision_flag",
        severity: sev,
        message:  `AI vision review: ${flag}`,
      });
    }
    if (input.aiVision.visionConfidence !== null &&
        input.aiVision.visionConfidence < 40) {
      findings.push({
        code:     "vision_low_confidence",
        severity: "warning",
        message:  `AI vision confidence in authenticity is low (${input.aiVision.visionConfidence}/100).`,
      });
    }
  }

  // ── 7. Compose risk score ──────────────────────────────────────────────
  const riskScore = computeRiskScore(findings, input);
  const riskBand: RiskBand =
    riskScore >= 71 ? "high" :
    riskScore >= 31 ? "medium" :
    "low";

  const { headline, recommendation } = pickHeadline(riskBand, findings);

  return {
    version:        VISA_SCREENING_VERSION,
    riskScore,
    riskBand,
    findings,
    parsed:         input.parsed,
    mrz:            input.mrz,
    aiVisionUsed:   input.aiVision !== null,
    aiVisionNotes:  input.aiVision?.notes ?? null,
    headline,
    recommendation,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_WEIGHT: Record<FindingSeverity, number> = {
  info:      0,
  warning:  12,
  critical: 30,
};

function computeRiskScore(findings: Finding[], input: ScreenVisaInput): number {
  let score = 0;
  for (const f of findings) score += SEVERITY_WEIGHT[f.severity];

  // Positive-signal deductions — genuine indicators pull the score DOWN.
  if (input.mrz.present && input.mrz.checksumValid === true) score -= 15;
  if (input.aiVision?.visionConfidence &&
      input.aiVision.visionConfidence >= 80) score -= 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function pickHeadline(
  band: RiskBand,
  findings: Finding[],
): { headline: string; recommendation: string } {
  const critical = findings.filter((f) => f.severity === "critical").length;
  if (band === "high") {
    return {
      headline:       `High-risk indicators found${critical ? ` (${critical} critical)` : ""}.`,
      recommendation: "Do NOT rely on this document. Verify with the issuing authority directly before making any decision.",
    };
  }
  if (band === "medium") {
    return {
      headline:       "Some anomalies detected — human review recommended.",
      recommendation: "Cross-check the flagged items against the issuing authority's official portal, or ask a licensed agent to verify.",
    };
  }
  return {
    headline:       "No red flags found in our automated checks.",
    recommendation: "Our screening did not raise concerns. For anything high-stakes (travel, employment contract signing), still verify with the issuing authority directly — no automated tool replaces official verification.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function parseDateSafe(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function mrzYymmddToDate(yymmdd: string): Date | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const mm = parseInt(yymmdd.slice(2, 4), 10);
  const dd = parseInt(yymmdd.slice(4, 6), 10);
  // Two-digit year rollover: assume anything > current-year-30 is 19xx, else 20xx.
  const nowYy = new Date().getFullYear() % 100;
  const century = yy > (nowYy + 30) ? 1900 : 2000;
  const d = new Date(century + yy, mm - 1, dd);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeCountryToIso3(input: string): string | null {
  const t = input.trim().toUpperCase();
  const alias: Record<string, string> = {
    "UNITED ARAB EMIRATES": "UAE", "UAE": "UAE", "AE": "UAE",
    "QATAR": "QAT", "QA": "QAT",
    "SAUDI ARABIA": "SAU", "SAUDI": "SAU", "SA": "SAU", "KSA": "SAU",
    "UNITED KINGDOM": "GBR", "UK": "GBR", "GB": "GBR", "BRITAIN": "GBR",
    "CANADA": "CAN", "CA": "CAN",
    "UNITED STATES": "USA", "USA": "USA", "US": "USA", "AMERICA": "USA",
    "GERMANY": "DEU", "DE": "DEU",
  };
  if (alias[t]) return alias[t];
  if (/^[A-Z]{3}$/.test(t)) return t;
  return null;
}

function classifyVisionSeverity(flag: string): FindingSeverity {
  const f = flag.toLowerCase();
  if (/tamper|edit|photoshop|forged|forgery|altered|clon(e|ed)|paste|inconsist(ent|ency)/.test(f)) return "critical";
  if (/misalign|font|blur|artifact|artefact|shadow|watermark|hologram/.test(f)) return "warning";
  return "info";
}
