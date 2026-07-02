/**
 * Sync Engine — validation (Milestone 1).
 *
 * Zod schema enforcing the rules in SRS §14. Returns a structured
 * ValidationResult; we never throw. Bad records go to quarantine, not the
 * exception path.
 */

import { z } from "zod";
import {
  SERVICE_TYPES,
  AGENCY_STATUSES,
  type NormalizedAgency,
  type ValidationIssue,
  type ValidationResult,
} from "./types";

const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;

function nowMs(): number {
  return _nowProvider();
}

let _nowProvider: () => number = () => Date.now();

/** Test-only escape hatch — let the suite freeze "now" for deterministic bounds. */
export function _setNowProviderForTests(p: () => number): void {
  _nowProvider = p;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COUNTRY_RE  = /^[A-Z]{2}$/;
// Permits the character set seen across NEA-KE, UK Sponsors, Canada Employer
// Registry, etc.: alphanumerics, "." "/" "-" " " "&". The "&" was added after
// M1 smoke testing caught NEA's REF/NEA/FE&LE/S/042 format being falsely
// quarantined. Providers can tighten further in their own validate() hook.
const LICENCE_RE  = /^[A-Z0-9./\- &]+$/;

function isoDateInRange(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return false;
  return Math.abs(t - nowMs()) <= TEN_YEARS_MS;
}

export const NormalizedAgencySchema = z.object({
  agencyName: z.string()
    .min(1, "Agency name is required.")
    .max(200, "Agency name exceeds 200 characters."),

  licenseNumber: z.string()
    .min(1, "Licence number is required.")
    .max(120, "Licence number exceeds 120 characters.")
    .regex(LICENCE_RE, "Licence number contains characters outside the allowed set."),

  country: z.string()
    .regex(COUNTRY_RE, "Country must be an ISO-3166-1 alpha-2 code."),

  serviceType: z.enum(SERVICE_TYPES),

  email:   z.string().email().nullable(),
  website: z.string().url().nullable(),
  phone:   z.string().min(8).max(20).nullable(),

  issueDate: z.string()
    .nullable()
    .refine(
      (v) => v == null || isoDateInRange(v),
      "Issue date is malformed or outside the ±10-year sanity window.",
    ),

  expiryDate: z.string()
    .refine(
      (v) => isoDateInRange(v),
      "Expiry date is malformed or outside the ±10-year sanity window.",
    ),

  statusSource: z.enum(AGENCY_STATUSES),
})
  .refine(
    (v) => v.issueDate == null || v.issueDate <= v.expiryDate,
    { message: "Issue date must be on or before expiry date.", path: ["issueDate"] },
  );

/**
 * Validate a candidate NormalizedAgency. Always returns a discriminated
 * union; never throws.
 */
export function validate(candidate: unknown): ValidationResult {
  const parsed = NormalizedAgencySchema.safeParse(candidate);
  if (parsed.success) {
    return { ok: true, value: parsed.data as NormalizedAgency };
  }
  const reasons = parsed.error.issues.map(zodIssueToValidationIssue);
  return { ok: false, reasons };
}

function zodIssueToValidationIssue(issue: z.ZodIssue): ValidationIssue {
  const path = issue.path.join(".") || "(root)";
  return {
    path,
    code: zodCodeToOurs(issue),
    message: issue.message,
  };
}

function zodCodeToOurs(issue: z.ZodIssue): ValidationIssue["code"] {
  switch (issue.code) {
    case "invalid_type":
      return "required";
    case "too_small":
      return issue.type === "string" && issue.minimum === 1 ? "required" : "out_of_range";
    case "too_big":
      return "too_long";
    case "invalid_string":
      return "invalid_format";
    case "invalid_enum_value":
      return "not_in_set";
    case "invalid_date":
      return "invalid_format";
    case "custom":
      return "invalid_format";
    default:
      return "invalid_format";
  }
}
