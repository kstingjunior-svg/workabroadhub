/** Pure: offer-letter fields + pattern matches → evidence findings. */
import type { ExtractedOfferFields, FraudFinding } from "../offer-verify/fraud-patterns";
import { makeFinding, type Finding, type Priority } from "./evidence";
import { ruleSource, getSource } from "./sources";
import type { InjectionScan } from "./guards";
import { parseIsoDate } from "./visa-findings";

export interface SalaryCheck {
  band: "below_range" | "in_range" | "above_range" | "too_high" | "unknown";
  offeredMonthly: number | null;
  currency: string | null;
  expectedMin: number | null;
  expectedMax: number | null;
  occupationLabel: string | null;
  countryName: string | null;
}

/** Pattern ids handled elsewhere (email checks) or not evidence (positive impressions). */
const SKIP = new Set(["email_free_provider", "email_domain_mismatch", "email_missing", "contract_detail_strong"]);

const MAP: Record<string, { status: Finding["status"]; priority: Priority; title?: string; method: Finding["method"] }> = {
  upfront_fee_requested:    { status: "potential_risk_indicator", priority: "high",   method: "text_pattern", title: "The letter mentions fees or deposits" },
  personal_payment_account: { status: "potential_risk_indicator", priority: "high",   method: "text_pattern", title: "Payment to a personal or mobile-money account" },
  overpromise_language:     { status: "potential_risk_indicator", priority: "medium", method: "text_pattern", title: "Promises that an employer cannot make" },
  pressure_tactics:         { status: "potential_risk_indicator", priority: "medium", method: "text_pattern", title: "Pressure to act quickly" },
  vague_terms:              { status: "potential_risk_indicator", priority: "low",    method: "text_pattern", title: "Vague contract terms" },
  employer_name_missing:    { status: "unable_to_verify",         priority: "high",   method: "deterministic", title: "Employer name not found" },
  company_address_missing:  { status: "unable_to_verify",         priority: "low",    method: "deterministic", title: "Company address not found" },
  job_title_missing:        { status: "unable_to_verify",         priority: "low",    method: "deterministic", title: "Job title not found" },
  start_date_missing:       { status: "unable_to_verify",         priority: "low",    method: "deterministic", title: "Start date not found" },
  salary_missing:           { status: "potential_risk_indicator", priority: "medium", method: "deterministic", title: "Salary not stated" },
  no_authenticity_elements: { status: "potential_risk_indicator", priority: "low",    method: "ai_observation", title: "No signature, letterhead or stamp detected" },
  weak_authenticity:        { status: "unable_to_verify",         priority: "low",    method: "ai_observation", title: "Only one of signature / letterhead / stamp detected" },
};

export interface OfferEvidenceInput {
  fields: ExtractedOfferFields;
  patterns: FraudFinding[];
  salary: SalaryCheck;
  countryCode: string | null;
  injection: InjectionScan;
  aiFlaggedInstructions: boolean;
  visualObservations: string[];
  now: Date;
}

export function buildOfferFindings(inp: OfferEvidenceInput): Finding[] {
  const out: Finding[] = [];
  const at = inp.now.toISOString();
  const f = inp.fields;

  if (inp.injection.detected || inp.aiFlaggedInstructions) {
    out.push(makeFinding({
      code: "document_contains_ai_instructions", status: "manual_review_required", priority: "high", checkedAt: at,
      title: "Letter contains text aimed at automated checkers",
      examined: "The full text of the letter.",
      documentSays: inp.injection.samples.length ? `“${inp.injection.samples[0]}”` : "Text addressed to an AI system.",
      whyItMatters: "Employers do not write instructions for AI tools into offer letters. Text like this is sometimes added to try to fool automated screening.",
      howToVerify: "Confirm the offer directly with the employer through its official website. Our team can review it manually.",
      method: "text_pattern", check: { name: "prompt_injection_scan", version: 1, result: inp.injection.reasons },
    }));
  }

  for (const p of inp.patterns) {
    if (SKIP.has(p.id)) continue;
    const m = MAP[p.id];
    if (!m) continue;
    const isFee = p.id === "upfront_fee_requested";
    const caFee = isFee && inp.countryCode === "CA";
    out.push(makeFinding({
      code: p.id, status: m.status, priority: m.priority, checkedAt: at,
      title: m.title ?? p.label,
      examined: m.method === "ai_observation" ? "The appearance of the letter." : m.method === "deterministic" ? "Fields extracted from the letter." : "The text of the letter.",
      evidenceSays: p.detail + (caFee ? " Canadian regulations prohibit employers of temporary foreign workers from charging, or letting recruiters charge, hiring fees (government application fees excluded)." : ""),
      whyItMatters: isFee ? "Being asked to pay to get a job is the most common pattern in overseas job fraud reported to us." : undefined,
      howToVerify: p.actionable,
      howToVerifyUrl: isFee ? getSource("ke_nea_register")?.url : undefined,
      source: caFee ? ruleSource("CA.EMPLOYER.NO_HIRING_FEES") : undefined,
      uncertainty: m.method === "text_pattern" ? "Based on wording found in the letter; the context may change its meaning." : undefined,
      method: m.method, check: { name: `pattern:${p.id}`, version: 1 },
    }));
  }

  // Salary vs reference bands (not an official source → indicators only)
  const s = inp.salary;
  if (s.band === "too_high" || s.band === "below_range" || s.band === "above_range") {
    const range = `${s.expectedMin?.toLocaleString()}–${s.expectedMax?.toLocaleString()} ${s.currency ?? ""}`.trim();
    out.push(makeFinding({
      code: `salary_${s.band}`,
      status: "potential_risk_indicator",
      priority: s.band === "above_range" ? "low" : "medium",
      checkedAt: at,
      title: s.band === "below_range" ? "Salary is below our reference range" : "Salary is above our reference range",
      examined: "Monthly salary stated in the letter vs WorkAbroadHub's reference range for this role and country.",
      documentSays: `${s.offeredMonthly?.toLocaleString()} ${s.currency ?? ""} per month`.trim(),
      evidenceSays: `Our reference range for ${s.occupationLabel ?? "this role"} in ${s.countryName ?? "this country"} is ${range} per month.`,
      whyItMatters: s.band === "below_range"
        ? "Pay well below normal levels can mean underpayment or exploitation."
        : "Unusually high pay is often used to attract applicants to fake offers.",
      uncertainty: "Our reference ranges come from market surveys, not an official wage source, and pay can legitimately differ (allowances, overtime, seniority).",
      howToVerify: "Ask for a written pay breakdown (basic + allowances) and compare it with the destination country's official wage guidance.",
      documentRefs: [{ field: "salaryMonthly", value: s.offeredMonthly != null ? String(s.offeredMonthly) : null, ocrConfidence: null }],
      method: "deterministic", check: { name: "salary_reference_band", version: 1, result: s },
    }));
  }

  // Internal consistency: start date before the letter date
  const issued = parseIsoDate(f.dateIssued ?? null);
  const start = parseIsoDate(f.startDate ?? null);
  if (issued && start && start.getTime() < issued.getTime() - 86400_000) {
    out.push(makeFinding({
      code: "start_before_letter_date", status: "potential_risk_indicator", priority: "medium", checkedAt: at,
      title: "Start date is before the date of the letter",
      examined: "Letter date and start date as printed.",
      documentSays: `Letter dated ${f.dateIssued}; start date ${f.startDate}.`,
      whyItMatters: "An offer normally comes before the job starts. This may be a typing error, or a reused template.",
      howToVerify: "Ask the employer to confirm the dates in writing from its official email domain.",
      documentRefs: [{ field: "dateIssued", value: f.dateIssued ?? null, ocrConfidence: null }, { field: "startDate", value: f.startDate ?? null, ocrConfidence: null }],
      method: "deterministic", check: { name: "start_after_issue", version: 1 },
    }));
  }

  for (const obs of inp.visualObservations.slice(0, 3)) {
    out.push(makeFinding({
      code: "visual_observation", status: "potential_risk_indicator", priority: "low", checkedAt: at,
      title: "Visual observation (not proof)",
      examined: "The appearance of the uploaded image.", evidenceSays: obs,
      uncertainty: "Photos, compression and scanning can all cause visual irregularities.",
      method: "ai_observation", check: { name: "visual_observation", version: 1 },
    }));
  }

  // Always disclose the authorship limit.
  out.push(makeFinding({
    code: "authorship_not_confirmed", status: "unable_to_verify", priority: "medium", checkedAt: at,
    title: "We cannot confirm the employer issued this letter",
    examined: "Whether the named employer actually issued this offer.",
    evidenceSays: "Even when a company exists or is licensed, that does not show that this letter came from it.",
    howToVerify: "Find the employer's official website yourself (not from links in the letter), contact HR there, and ask them to confirm the offer and the recruiter's name.",
    method: "deterministic", check: { name: "authorship", version: 1, result: "not_confirmable" },
  }));
  if (inp.countryCode === "CA") {
    const src = getSource("ca_noncompliant_employers")!;
    out.push(makeFinding({
      code: "ca_noncompliant_list_user_run", status: "unable_to_verify", priority: "low", checkedAt: at,
      title: "Check Canada's list of non-compliant employers",
      examined: "Whether the employer is banned from hiring temporary foreign workers.",
      evidenceSays: src.limitation, howToVerify: src.needs, howToVerifyUrl: src.url,
      method: "deterministic", check: { name: "ca_noncompliant_link", version: 1 },
    }));
  }
  return out;
}
