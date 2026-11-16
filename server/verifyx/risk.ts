/**
 * Overall risk level + separate verification states (Intelligence Engine,
 * increment 2 — 2026-11). PURE.
 *
 * The risk level is a deterministic summary of the accepted findings — no
 * model, no percentage. It is a risk assessment, never a verdict on
 * authenticity; LOW is explicitly "not confirmation".
 */
import type { Finding, OverallOutcome } from "./evidence";

export type RiskLevel = "LOW" | "MODERATE" | "HIGH" | "CRITICAL" | "INSUFFICIENT_EVIDENCE";

export interface RiskAssessment {
  level: RiskLevel;
  label: string;
  reasons: string[];
  recommendedAction: string;
  statement: string;
}

export type StateValue = "confirmed" | "passed" | "failed" | "not_confirmed" | "not_checked";

export interface VerificationState {
  key: "issuer_authenticity" | "employer" | "internal_consistency" | "immigration_info" | "overall";
  label: string;
  state: StateValue;
  detail: string;
}

export const RISK_STATEMENT = "This is a risk assessment, not a legal determination. It is based only on the checks listed in this report.";

const IDENTITY_CODES = new Set(["applicant_name_mismatch", "applicant_passport_mismatch", "applicant_dob_mismatch", "mrz_dob_mismatch"]);
const PAYMENT_CODES = new Set(["payment_to_personal_account", "payment_requested", "upfront_fee_requested", "personal_payment_account", "email_requests_payment"]);

export function assessRisk(findings: Finding[], outcome: OverallOutcome): RiskAssessment {
  const disc = findings.filter((f) => f.status === "confirmed_discrepancy");
  const highAttn = findings.filter((f) => (f.status === "potential_risk_indicator" || f.status === "manual_review_required") && f.priority === "high");
  const attn = findings.filter((f) => f.status === "potential_risk_indicator" || f.status === "manual_review_required");
  const payment = findings.some((f) => PAYMENT_CODES.has(f.code));
  const identityDisc = disc.some((f) => IDENTITY_CODES.has(f.code));
  const intelConfirmed = findings.some((f) => f.code === "intel_confirmed_link");

  const titles = (xs: Finding[]) => xs.slice(0, 4).map((f) => f.title);

  if (outcome === "insufficient_information" && disc.length === 0 && attn.length === 0) {
    return {
      level: "INSUFFICIENT_EVIDENCE", label: "Insufficient evidence",
      reasons: ["Too little of the document could be read or checked against official sources."],
      recommendedAction: "Upload a clearer photo of every page, or the original PDF, and run the check again (corrections are free).",
      statement: RISK_STATEMENT,
    };
  }
  if (identityDisc || (disc.length > 0 && payment) || (intelConfirmed && payment)) {
    return {
      level: "CRITICAL", label: "Critical risk",
      reasons: titles([...disc, ...highAttn]),
      recommendedAction: "Do not pay any money, resign or travel. Contact the employer only through its official website and confirm every point below in writing.",
      statement: RISK_STATEMENT,
    };
  }
  if (disc.length > 0 || highAttn.length > 0) {
    return {
      level: "HIGH", label: "High risk",
      reasons: titles([...disc, ...highAttn]),
      recommendedAction: "Do not pay any money until every high-priority item below has been confirmed directly with the employer and the official source listed.",
      statement: RISK_STATEMENT,
    };
  }
  if (attn.length > 0) {
    return {
      level: "MODERATE", label: "Moderate risk",
      reasons: titles(attn),
      recommendedAction: "Check each item below before you rely on this document.",
      statement: RISK_STATEMENT,
    };
  }
  return {
    level: "LOW", label: "Low risk",
    reasons: ["None of our checks found a contradiction or risk indicator."],
    recommendedAction: "Low risk is not confirmation that the document is authentic. Still confirm the offer directly with the employer and the official source below.",
    statement: RISK_STATEMENT,
  };
}

const EMPLOYER_LISTED = new Set(["uk_sponsor_listed", "nl_sponsor_listed", "nea_agency_listed"]);
const EMPLOYER_NOT_FOUND = new Set(["uk_sponsor_not_found", "nl_sponsor_not_found", "nea_agency_not_found", "nea_licence_not_current"]);
const INTERNAL_CODES = new Set([
  "applicant_name_mismatch", "applicant_passport_mismatch", "applicant_dob_mismatch", "applicant_name_variant",
  "mrz_check_digit_failed", "mrz_expiry_mismatch", "mrz_dob_mismatch", "expiry_not_after_issue", "start_before_letter_date",
]);
const INTERNAL_OK = new Set(["mrz_check_digits_valid", "dates_consistent"]);

export function verificationStates(
  findings: Finding[],
  ctx: { tool: "visa_check" | "offer_check"; identity: "consistent" | "inconsistent" | "not_enough" | null },
): VerificationState[] {
  const has = (set: Set<string>, ok?: (f: Finding) => boolean) => findings.some((f) => set.has(f.code) && (!ok || ok(f)));

  // 1. Issuer authenticity — only an authorised issuer channel can confirm it.
  const issuer = findings.some((f) => f.status === "officially_confirmed" && (f.method === "crypto" || f.method === "registry_lookup") && !EMPLOYER_LISTED.has(f.code));
  const s1: VerificationState = issuer
    ? { key: "issuer_authenticity", label: "Authenticity confirmed by issuer", state: "confirmed", detail: "An authorised official channel confirmed this document." }
    : { key: "issuer_authenticity", label: "Authenticity confirmed by issuer", state: "not_confirmed", detail: "No issuer verification service confirmed this document. Nothing here proves it is authentic." };

  // 2. Employer
  let s2: VerificationState;
  if (has(EMPLOYER_LISTED, (f) => f.status === "consistent_with_requirements" || f.status === "officially_confirmed")) {
    const f = findings.find((x) => EMPLOYER_LISTED.has(x.code))!;
    s2 = { key: "employer", label: "Employer independently verified", state: "passed", detail: `${f.title}${f.source?.retrievedAt ? ` (register data from ${f.source.retrievedAt.slice(0, 10)})` : ""}. This confirms the register entry, not that this letter came from them.` };
  } else if (has(EMPLOYER_NOT_FOUND)) {
    s2 = { key: "employer", label: "Employer independently verified", state: "failed", detail: "The employer or agency was not found as named on the official register we checked." };
  } else {
    s2 = { key: "employer", label: "Employer independently verified", state: "not_checked", detail: ctx.tool === "offer_check" ? "No official employer register we can query covers this employer's country." : "Not applicable to this document." };
  }

  // 3. Internal consistency
  let s3: VerificationState;
  const internalBad = findings.some((f) => INTERNAL_CODES.has(f.code) && (f.status === "confirmed_discrepancy" || f.status === "potential_risk_indicator"));
  if (internalBad || ctx.identity === "inconsistent") {
    s3 = { key: "internal_consistency", label: "Document internally consistent", state: "failed", detail: "Details inside the document contradict each other — see the findings below." };
  } else if (ctx.identity === "consistent" || has(INTERNAL_OK)) {
    s3 = { key: "internal_consistency", label: "Document internally consistent", state: "passed", detail: "The details we could compare inside the document agree with each other. This is not proof of authenticity." };
  } else {
    s3 = { key: "internal_consistency", label: "Document internally consistent", state: "not_checked", detail: "There were not enough clearly readable details to compare." };
  }

  // 4. Immigration information
  const ruleOk = findings.filter((f) => f.source?.ruleId && f.source.ruleVersion != null && f.status === "consistent_with_requirements");
  const ruleBad = findings.filter((f) => f.source?.ruleId && f.source.ruleVersion != null && (f.status === "confirmed_discrepancy" || f.status === "potential_risk_indicator"));
  const s4: VerificationState = ruleBad.length
    ? { key: "immigration_info", label: "Immigration information verified", state: "failed", detail: `Conflicts with ${ruleBad.length === 1 ? "an official rule" : `${ruleBad.length} official rules`} we hold — see below.` }
    : ruleOk.length
      ? { key: "immigration_info", label: "Immigration information verified", state: "passed", detail: `Consistent with ${ruleOk.length === 1 ? "an official rule" : `${ruleOk.length} official rules`} reviewed against the official source.` }
      : { key: "immigration_info", label: "Immigration information verified", state: "not_checked", detail: "We hold no reviewed official rule that applies to these details. Use the official links in this report." };

  const complete = s1.state === "confirmed";
  const s5: VerificationState = complete
    ? { key: "overall", label: "Verification complete", state: "confirmed", detail: "Confirmed through an authorised issuer channel." }
    : { key: "overall", label: "Verification incomplete", state: "not_confirmed", detail: "Some points could only be checked for consistency, not confirmed with the issuer." };

  return [s1, s2, s3, s4, s5];
}
