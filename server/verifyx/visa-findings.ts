/**
 * Pure: extracted visa / permit fields → evidence findings.
 * Deterministic checks only, plus clearly-labelled visual observations.
 */
import { parseMrz } from "../tools/visa-screening";
import { makeFinding, type Finding } from "./evidence";
import { officialStatusCheck, ruleSource, rulesInForce } from "./sources";
import type { InjectionScan, PdfSignatureScan } from "./guards";

export type VisaDocumentKind =
  | "visa_label" | "evisa_or_grant_notice" | "residence_card" | "work_permit"
  | "approval_letter" | "entry_permit" | "other" | null;

export interface VisaFields {
  country: string | null;
  documentKind: VisaDocumentKind;
  visaNumber: string | null;
  passportNumber: string | null;
  applicantName: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  employer: string | null;
  visaType: string | null;
  workPermitNumber: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  hasMrz: boolean;
  hasQrCode: boolean;
}

export interface VisaEvidenceInput {
  fields: VisaFields;
  fieldConfidence: Record<string, number | null>;
  overallReadability: number | null;
  mrzLines: string[] | null;
  country: { code: string; name: string; links: { visaStatusChecker: string | null; immigration: string | null } } | null;
  visualObservations: string[];
  injection: InjectionScan;
  aiFlaggedInstructions: boolean;
  pdf: PdfSignatureScan | null;
  now: Date;
}

export function parseIsoDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s).trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return d;
}

/** MRZ YYMMDD → ISO. kind "expiry" → 20YY; "dob" → 19YY if in the future. */
export function mrzDateToIso(yymmdd: string | null, kind: "expiry" | "dob", now = new Date()): string | null {
  if (!yymmdd || !/^\d{6}$/.test(yymmdd)) return null;
  const yy = +yymmdd.slice(0, 2);
  const curYY = now.getUTCFullYear() % 100;
  const century = kind === "expiry" ? 2000 : (yy > curYY ? 1900 : 2000);
  const iso = `${century + yy}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
  return parseIsoDate(iso) ? iso : null;
}

const fmt = (d: Date) => d.toISOString().slice(0, 10);

export function buildVisaFindings(inp: VisaEvidenceInput): Finding[] {
  const out: Finding[] = [];
  const f = inp.fields;
  const now = inp.now;
  const at = now.toISOString();

  // ── Prompt-injection content (manual review, never silently ignored) ──
  if (inp.injection.detected || inp.aiFlaggedInstructions) {
    out.push(makeFinding({
      code: "document_contains_ai_instructions", status: "manual_review_required", priority: "high", checkedAt: at,
      title: "Document contains text aimed at automated checkers",
      examined: "The full text of the document.",
      documentSays: inp.injection.samples.length ? `“${inp.injection.samples[0]}”` : "Text addressed to an AI system.",
      whyItMatters: "Official documents do not contain instructions for AI tools. Text like this is sometimes added to try to fool automated screening.",
      howToVerify: "Ask the issuer to confirm the document through official channels. Our team can review it manually.",
      method: "text_pattern", check: { name: "prompt_injection_scan", version: 1, result: inp.injection.reasons },
    }));
  }

  // ── Readability ────────────────────────────────────────────────────
  if (inp.overallReadability != null && inp.overallReadability < 60) {
    out.push(makeFinding({
      code: "low_readability", status: "unable_to_verify", priority: "medium", checkedAt: at,
      title: "Image quality limits these checks",
      examined: "How clearly the document could be read.",
      evidenceSays: "Parts of the document could not be read reliably, so some checks were skipped or are marked uncertain.",
      howToVerify: "Upload a sharp, flat, well-lit photo of the whole page, or the original PDF.",
      method: "ai_observation", check: { name: "readability", version: 1, result: inp.overallReadability },
    }));
  }

  // ── Country ────────────────────────────────────────────────────────
  if (!inp.country) {
    out.push(makeFinding({
      code: "country_not_identified", status: "unable_to_verify", priority: "medium", checkedAt: at,
      title: "Issuing country not identified",
      examined: "The issuing country / authority.",
      documentSays: f.country ? `Read as: ${f.country}` : "No issuing country could be read.",
      evidenceSays: "Country-specific checks and official links could not be applied.",
      howToVerify: "Confirm the issuing country using “Correct details” and we will re-run the checks free of charge.",
      method: "deterministic", check: { name: "country_lookup", version: 1, result: f.country },
    }));
  }

  // ── Document type (Canada approval letter vs permit, etc.) ─────────
  if (f.documentKind === "approval_letter") {
    out.push(makeFinding({
      code: "approval_letter_not_permit", status: "unable_to_verify", priority: "medium", checkedAt: at,
      title: "This looks like an approval letter, not the visa or permit itself",
      examined: "The type of document uploaded.",
      evidenceSays: "Approval or introduction letters are not the same as the work permit or visa that is issued later.",
      whyItMatters: "Some offers present an approval letter as if it were a permit. You should see the final permit or visa before relying on it.",
      howToVerify: "Ask for the issued permit/visa and check it through the official channel below.",
      method: "ai_observation", check: { name: "document_kind", version: 1, result: f.documentKind },
    }));
  }

  // ── Dates (deterministic) ──────────────────────────────────────────
  const issue = parseIsoDate(f.issueDate);
  const expiry = parseIsoDate(f.expiryDate);
  if (issue && expiry) {
    if (expiry.getTime() <= issue.getTime()) {
      out.push(makeFinding({
        code: "expiry_not_after_issue", status: "confirmed_discrepancy", priority: "high", checkedAt: at,
        title: "Expiry date is not after the issue date",
        examined: "Issue date and expiry date as printed.",
        documentSays: `Issued ${f.issueDate}, expires ${f.expiryDate}.`,
        evidenceSays: "A permission cannot expire on or before the day it was issued.",
        whyItMatters: "Internally contradictory dates must be explained by the issuer.",
        howToVerify: "Check both dates on the original and confirm them with the issuing authority.",
        documentRefs: [{ field: "issueDate", value: f.issueDate, ocrConfidence: null }, { field: "expiryDate", value: f.expiryDate, ocrConfidence: null }],
        method: "deterministic", check: { name: "date_order", version: 1, result: { issue: f.issueDate, expiry: f.expiryDate } },
      }));
    } else {
      out.push(makeFinding({
        code: "dates_consistent", status: "consistent_with_requirements", priority: "low", checkedAt: at,
        title: "Issue and expiry dates are in a logical order",
        examined: "Issue date and expiry date as printed.",
        documentSays: `Issued ${f.issueDate}, expires ${f.expiryDate}.`,
        uncertainty: "This only shows the dates do not contradict each other.",
        documentRefs: [{ field: "issueDate", value: f.issueDate, ocrConfidence: null }, { field: "expiryDate", value: f.expiryDate, ocrConfidence: null }],
        method: "deterministic", check: { name: "date_order", version: 1, result: "ok" },
      }));
    }
  }
  if (issue && issue.getTime() > now.getTime() + 24 * 3600_000) {
    out.push(makeFinding({
      code: "issue_date_in_future", status: "confirmed_discrepancy", priority: "high", checkedAt: at,
      title: "Issue date is in the future",
      examined: "Issue date as printed, compared with today's date.",
      documentSays: `Issued ${f.issueDate}.`, evidenceSays: `Today is ${fmt(now)}.`,
      whyItMatters: "A document cannot be issued on a date that has not happened yet.",
      howToVerify: "Check the date on the original and confirm it with the issuing authority.",
      documentRefs: [{ field: "issueDate", value: f.issueDate, ocrConfidence: null }],
      method: "deterministic", check: { name: "issue_not_future", version: 1, result: f.issueDate },
    }));
  }
  if (expiry && expiry.getTime() < now.getTime()) {
    out.push(makeFinding({
      code: "expiry_date_passed", status: "potential_risk_indicator", priority: "high", checkedAt: at,
      title: "The expiry date shown has passed",
      examined: "Expiry date as printed, compared with today's date.",
      documentSays: `Expires ${f.expiryDate}.`, evidenceSays: `Today is ${fmt(now)}.`,
      whyItMatters: "An expired document cannot be used for travel or work, unless the permission was extended or replaced (for example by an eVisa).",
      howToVerify: "Check the current status through the official channel below.",
      documentRefs: [{ field: "expiryDate", value: f.expiryDate, ocrConfidence: null }],
      method: "deterministic", check: { name: "not_expired", version: 1, result: f.expiryDate },
    }));
  }
  if (!issue && !expiry) {
    out.push(makeFinding({
      code: "dates_not_read", status: "unable_to_verify", priority: "low", checkedAt: at,
      title: "Validity dates could not be read",
      examined: "Issue and expiry dates.",
      evidenceSays: "No complete issue or expiry date could be read, so date checks were not run.",
      howToVerify: "Use “Correct details” to enter the dates exactly as printed.",
      method: "deterministic", check: { name: "dates_present", version: 1, result: false },
    }));
  }

  // ── MRZ (ICAO 9303) ────────────────────────────────────────────────
  if (inp.mrzLines && inp.mrzLines.length >= 2) {
    const mrz = parseMrz(inp.mrzLines.map((l) => l.replace(/\s+/g, "").toUpperCase()).join("\n"));
    if (mrz.present) {
      const ref = { field: "mrz", value: inp.mrzLines.join("\n"), ocrConfidence: null as number | null };
      if (mrz.checksumValid) {
        out.push(makeFinding({
          code: "mrz_check_digits_valid", status: "consistent_with_requirements", priority: "low", checkedAt: at,
          title: "Machine-readable zone check digits are valid",
          examined: "The check digits in the machine-readable zone (MRZ).",
          evidenceSays: `All check digits match the ICAO 9303 calculation (${mrz.checkDetails}).`,
          uncertainty: "Anyone can generate valid check digits, so this shows internal consistency, not authenticity.",
          documentRefs: [ref], source: ruleSource("INT.MRZ.CHECK_DIGITS"),
          method: "deterministic", check: { name: "icao9303_check_digits", version: 1, result: mrz.checkDetails },
        }));
      } else if (mrz.checksumValid === false) {
        out.push(makeFinding({
          code: "mrz_check_digit_failed", status: "confirmed_discrepancy", priority: "high", checkedAt: at,
          title: "Machine-readable zone check digit does not match",
          examined: "The check digits in the machine-readable zone (MRZ).",
          documentSays: inp.mrzLines.join(" / "),
          evidenceSays: `ICAO 9303 check-digit calculation: ${mrz.checkDetails}.`,
          whyItMatters: "Issuing authorities generate MRZ check digits automatically, so a mismatch means a character differs from what was issued.",
          howToVerify: "Compare the two MRZ lines character by character with the original (0/O and 1/I are easily misread), then confirm through the official channel.",
          documentRefs: [ref], source: ruleSource("INT.MRZ.CHECK_DIGITS"),
          method: "deterministic", check: { name: "icao9303_check_digits", version: 1, result: mrz.checkDetails },
        }));
      }
      // Cross-field: MRZ expiry vs printed expiry
      const mrzExp = mrzDateToIso(mrz.expiry, "expiry", now);
      if (mrzExp && expiry && mrzExp !== f.expiryDate) {
        out.push(makeFinding({
          code: "mrz_expiry_mismatch", status: "confirmed_discrepancy", priority: "high", checkedAt: at,
          title: "Expiry date in the MRZ differs from the printed expiry date",
          examined: "Printed expiry date vs the expiry date encoded in the MRZ.",
          documentSays: `Printed: ${f.expiryDate}. MRZ: ${mrzExp}.`,
          evidenceSays: "Both encode the same permission and should match.",
          whyItMatters: "A mismatch is a common sign that printed details were changed.",
          howToVerify: "Check both on the original document, then confirm the dates with the issuing authority.",
          documentRefs: [ref, { field: "expiryDate", value: f.expiryDate, ocrConfidence: null }],
          method: "deterministic", check: { name: "mrz_vs_visual_expiry", version: 1, result: { mrzExp, printed: f.expiryDate } },
        }));
      }
      const mrzDob = mrzDateToIso(mrz.dob, "dob", now);
      if (mrzDob && f.dateOfBirth && parseIsoDate(f.dateOfBirth) && mrzDob !== f.dateOfBirth) {
        out.push(makeFinding({
          code: "mrz_dob_mismatch", status: "confirmed_discrepancy", priority: "high", checkedAt: at,
          title: "Date of birth in the MRZ differs from the printed date of birth",
          examined: "Printed date of birth vs the date of birth encoded in the MRZ.",
          documentSays: `Printed: ${f.dateOfBirth}. MRZ: ${mrzDob}.`,
          evidenceSays: "Both should record the same person's date of birth.",
          howToVerify: "Check both on the original document.",
          documentRefs: [ref, { field: "dateOfBirth", value: f.dateOfBirth, ocrConfidence: null }],
          method: "deterministic", check: { name: "mrz_vs_visual_dob", version: 1, result: { mrzDob, printed: f.dateOfBirth } },
        }));
      }
    }
  } else if (f.hasMrz) {
    out.push(makeFinding({
      code: "mrz_not_readable", status: "unable_to_verify", priority: "low", checkedAt: at,
      title: "Machine-readable zone could not be read",
      examined: "Machine-readable zone (MRZ).",
      evidenceSays: "An MRZ appears to be present, but its characters could not be read reliably, so the check digits were not tested.",
      howToVerify: "Upload a close, sharp photo of the bottom of the document, or type the two MRZ lines using “Correct details”.",
      method: "deterministic", check: { name: "mrz_present", version: 1, result: "unreadable" },
    }));
  }

  // ── Country-specific, time-aware rules ─────────────────────────────
  if (inp.country?.code === "GB") {
    const at2 = issue ?? now;
    const physical = f.documentKind === "visa_label" || f.documentKind === "residence_card";
    if (physical && issue && rulesInForce("GB", "visa", issue).some((r) => r.ruleId === "GB.STATUS.PHYSICAL")) {
      out.push(makeFinding({
        code: "gb_physical_format_historic", status: "unable_to_verify", priority: "low", checkedAt: at,
        title: "Physical UK document from before the eVisa switch",
        examined: `Document format, judged against UK rules in force on the issue date (${fmt(at2)}).`,
        evidenceSays: "Vignettes and BRPs were normal formats at that time. Today, UK immigration status is held online as an eVisa.",
        whyItMatters: "An older physical document can be genuine and still not show someone's current permission.",
        howToVerify: "Ask the holder to share their status with a share code from the official View and Prove service.",
        howToVerifyUrl: "https://www.gov.uk/view-prove-immigration-status",
        source: ruleSource("GB.STATUS.PHYSICAL"),
        method: "deterministic", check: { name: "gb_temporal_format", version: 1, result: { issue: f.issueDate } },
      }));
    }
  }
  if (inp.country?.code === "AU" && f.documentKind === "visa_label" && issue && rulesInForce("AU", "visa", issue).some((r) => r.ruleId === "AU.VISA.NO_LABELS")) {
    out.push(makeFinding({
      code: "au_label_after_2015", status: "potential_risk_indicator", priority: "medium", checkedAt: at,
      title: "Visa label issued after Australia moved to electronic visas",
      examined: `Document format vs Australian practice on the issue date (${f.issueDate}).`,
      evidenceSays: "Australia records visas electronically and generally does not place visa labels in passports.",
      whyItMatters: "A physical label dated after this change is unusual and should be checked on VEVO.",
      howToVerify: "Check the visa on VEVO with the holder's passport details.",
      howToVerifyUrl: "https://immi.homeaffairs.gov.au/visas/already-have-a-visa/check-visa-details-and-conditions/check-conditions-online",
      source: ruleSource("AU.VISA.NO_LABELS"),
      method: "deterministic", check: { name: "au_label_temporal", version: 1, result: f.issueDate },
    }));
  }
  if (inp.country?.code === "US" && !f.hasMrz && f.documentKind === "visa_label") {
    out.push(makeFinding({
      code: "us_mrz_not_seen", status: "unable_to_verify", priority: "low", checkedAt: at,
      title: "No machine-readable zone detected on the U.S. visa image",
      examined: "Machine-readable zone (MRZ).",
      evidenceSays: "U.S. visa foils carry an MRZ along the bottom, but none was detected in this image. It may be cropped or blurred.",
      howToVerify: "Upload a photo that shows the whole foil, including the bottom two lines.",
      method: "ai_observation", check: { name: "us_mrz_presence", version: 1, result: false },
    }));
  }

  // ── PDF digital signature (structural Layer D) ─────────────────────
  if (inp.pdf?.hasSignature) {
    out.push(makeFinding({
      code: "pdf_signature_present", status: "unable_to_verify", priority: "low", checkedAt: at,
      title: "The PDF carries a digital signature",
      examined: "Digital-signature structures inside the PDF.",
      evidenceSays: `${inp.pdf.signatureCount} signature field(s) found. We have not validated the certificate chain.`,
      uncertainty: "A valid digital signature would show the file has not changed since signing; it would not by itself prove immigration status.",
      howToVerify: "Open the PDF in Adobe Acrobat Reader and check the Signature Panel for who signed it and whether the signature is valid.",
      method: "crypto", check: { name: "pdf_signature_scan", version: 1, result: inp.pdf },
    }));
    if (inp.pdf.modifiedAfterSigning) {
      out.push(makeFinding({
        code: "pdf_modified_after_signing", status: "potential_risk_indicator", priority: "medium", checkedAt: at,
        title: "Content was added to the PDF after it was signed",
        examined: "Byte ranges covered by the digital signature.",
        evidenceSays: "The signed byte ranges do not cover the end of the file, so something was appended after signing.",
        whyItMatters: "This can be legitimate (a second signature or form filling), but it can also mean the document was edited after the issuer signed it.",
        howToVerify: "In Adobe Acrobat Reader, open the Signature Panel and look for “document has been modified since this signature was applied”.",
        method: "deterministic", check: { name: "pdf_byte_range", version: 1, result: true },
      }));
    }
  }

  // ── Visual observations (AI; never proof) ──────────────────────────
  for (const obs of inp.visualObservations.slice(0, 4)) {
    out.push(makeFinding({
      code: "visual_observation", status: "potential_risk_indicator", priority: "low", checkedAt: at,
      title: "Visual observation (not proof)",
      examined: "The appearance of the uploaded image.",
      evidenceSays: obs,
      uncertainty: "Photos, compression and scanning can all cause visual irregularities. Physical security features cannot be checked from a photo.",
      howToVerify: "Rely on the official check below, not on appearance.",
      method: "ai_observation", check: { name: "visual_observation", version: 1 },
    }));
  }

  // ── Official status: always disclosed ──────────────────────────────
  const official = officialStatusCheck(
    inp.country?.code ?? null,
    inp.country?.links.visaStatusChecker ?? inp.country?.links.immigration ?? null,
    inp.country?.name,
  );
  out.push(makeFinding({
    code: "official_status_not_checked", status: "unable_to_verify", priority: "medium", checkedAt: at,
    title: official.capability === "not_available" ? "No public official verification available" : "Official status not checked by WorkAbroadHub",
    examined: "Whether the issuing authority's records confirm this permission.",
    evidenceSays: official.limitation,
    howToVerify: official.needs ? `${official.title}: ${official.needs}` : official.title,
    howToVerifyUrl: official.url ?? undefined,
    method: "deterministic", check: { name: "official_channel", version: 1, result: official.capability },
  }));

  return out;
}
