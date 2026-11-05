/**
 * VerifyX source & rule registry (code-side seed).
 *
 * Every rule VerifyX applies has a source, jurisdiction, effective window,
 * retrieval date, version and review status. Rules whose citation has not
 * been reviewed by a human ("pending_review") may only ever produce
 * "potential risk indicator" or "unable to verify" findings — never a
 * confirmed discrepancy or a "consistent with requirements" result.
 *
 * The same records are mirrored into the verifyx_official_sources /
 * verifyx_rules tables (migration 0055) so admins can see and review them.
 */

export type SourceCapability =
  | "synced_dataset"      // public dataset we download on a schedule
  | "user_run"            // the holder/employer must run it with their own credentials
  | "guidance_only"       // official guidance text, no lookup
  | "not_available";      // no public verification exists

export type ConnectorStatus = "operational" | "degraded" | "unavailable" | "awaiting_authorization" | "not_built";

export interface OfficialSource {
  id: string;
  country: string;                 // ISO-2, "INT" for international standards
  authority: string;
  title: string;
  url: string;
  capability: SourceCapability;
  /** For synced sources: expected max age before we call it stale (hours). */
  maxAgeHours?: number;
  /** What a user/employer needs to run a user_run check. */
  needs?: string;
  /** Plain-language limits shown to users. */
  limitation: string;
  /** Date a human last confirmed this source exists and says what we claim. */
  lastReviewed: string;
}

export const OFFICIAL_SOURCES: OfficialSource[] = [
  {
    id: "icao_9303", country: "INT", authority: "International Civil Aviation Organization",
    title: "Doc 9303 — Machine Readable Travel Documents",
    url: "https://www.icao.int/publications/pages/publication.aspx?docnum=9303",
    capability: "guidance_only",
    limitation: "Defines the MRZ layout and check-digit maths. A valid check digit proves the MRZ is internally consistent, not that the document is authentic.",
    lastReviewed: "2026-11-03",
  },
  {
    id: "uk_sponsor_register", country: "GB", authority: "UK Home Office (UK Visas and Immigration)",
    title: "Register of licensed sponsors: workers",
    url: "https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers",
    capability: "synced_dataset", maxAgeHours: 96,
    limitation: "Shows which organisations hold a Worker or Temporary Worker sponsor licence. It does not show job roles, salaries, or whether a particular letter was issued by that organisation.",
    lastReviewed: "2026-11-03",
  },
  {
    id: "uk_view_prove_status", country: "GB", authority: "UK Home Office",
    title: "View and prove your immigration status (eVisa) / Check a job applicant's right to work",
    url: "https://www.gov.uk/view-prove-immigration-status",
    capability: "user_run",
    needs: "The visa holder signs in to their UKVI account and creates a share code; an employer checks it with the share code and date of birth.",
    limitation: "Only the holder can create a share code. WorkAbroadHub cannot query UK immigration records.",
    lastReviewed: "2026-11-03",
  },
  {
    id: "uk_sponsor_guidance", country: "GB", authority: "UK Home Office",
    title: "Workers and Temporary Workers: guidance for sponsors",
    url: "https://www.gov.uk/government/collections/sponsorship-information-for-employers-and-educators",
    capability: "guidance_only",
    limitation: "Official sponsor duties and costs. Read the current version before relying on any specific figure.",
    lastReviewed: "2026-11-03",
  },
  {
    id: "ca_noncompliant_employers", country: "CA", authority: "Immigration, Refugees and Citizenship Canada",
    title: "Employers who have been found non-compliant",
    url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/work-canada/employers-non-compliant.html",
    capability: "user_run",
    needs: "Search the employer's name on the official list.",
    limitation: "The table on this page loads dynamically; WorkAbroadHub has not yet built an automated connector, so we link to it instead of checking it for you.",
    lastReviewed: "2026-11-03",
  },
  {
    id: "ca_irpr_fees", country: "CA", authority: "Government of Canada — Immigration and Refugee Protection Regulations",
    title: "IRPR 209.2(1)(a)(ix)-(x) / 209.3(1)(a)(xv)-(xvi): employers must not charge, or allow recruiters to charge, hiring fees to foreign workers",
    url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/work-canada/employers-non-compliant.html",
    capability: "guidance_only",
    limitation: "Application processing fees paid to the government are excluded from this rule.",
    lastReviewed: "2026-11-03",
  },
  {
    id: "ca_status", country: "CA", authority: "IRCC", title: "Check your application status",
    url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/application/check-status.html",
    capability: "user_run", needs: "The applicant signs in to their IRCC account.",
    limitation: "Only the applicant can see their application or permit record.", lastReviewed: "2026-11-03",
  },
  {
    id: "au_vevo", country: "AU", authority: "Australian Department of Home Affairs",
    title: "Visa Entitlement Verification Online (VEVO)",
    url: "https://immi.homeaffairs.gov.au/visas/already-have-a-visa/check-visa-details-and-conditions/check-conditions-online",
    capability: "user_run",
    needs: "The visa holder (or an employer with the holder's consent) enters passport and identity details.",
    limitation: "WorkAbroadHub does not run VEVO checks for you.", lastReviewed: "2026-11-03",
  },
  {
    id: "ae_icp_file_validity", country: "AE", authority: "UAE Federal Authority for Identity, Citizenship, Customs & Port Security (ICP)",
    title: "Check visa validity, issuance and expiry dates",
    url: "https://u.ae/en/information-and-services/visa-and-emirates-id/track-visa-application-and-validity/check-visa-validity-issuance-and-expiry-dates",
    capability: "user_run",
    needs: "File number or passport details. Dubai-issued visas are checked on GDRFA Dubai instead of ICP.",
    limitation: "Interactive government portal — WorkAbroadHub does not query it.", lastReviewed: "2026-11-03",
  },
  {
    id: "us_ceac", country: "US", authority: "U.S. Department of State", title: "CEAC visa status check",
    url: "https://ceac.state.gov/CEACStatTracker/Status.aspx",
    capability: "user_run", needs: "The applicant's case number / application ID.",
    limitation: "Shows application status only to people who hold the case details.", lastReviewed: "2026-11-03",
  },
  {
    id: "us_everify", country: "US", authority: "USCIS",
    title: "E-Verify", url: "https://www.e-verify.gov/",
    capability: "not_available",
    limitation: "Only enrolled U.S. employers may use E-Verify, and only after hiring. It cannot be used to check an offer or a visa before employment.",
    lastReviewed: "2026-11-03",
  },
  {
    id: "ke_nea_register", country: "KE", authority: "National Employment Authority (Kenya)",
    title: "Register of private employment agencies",
    url: "https://neaims.go.ke/EmploymentAgencyList.aspx",
    capability: "synced_dataset", maxAgeHours: 48,
    limitation: "Shows NEA licence status for Kenyan recruitment agencies. It does not verify a foreign employer or a specific job.",
    lastReviewed: "2026-11-03",
  },
];

export function getSource(id: string): OfficialSource | undefined {
  return OFFICIAL_SOURCES.find((s) => s.id === id);
}

// ── Rules (temporal) ─────────────────────────────────────────────────────

export type ReviewStatus = "approved" | "pending_review";

export interface ImmigrationRule {
  ruleId: string;
  version: number;
  country: string;
  documentType: "visa" | "offer_letter" | "any";
  sourceId: string;
  ruleText: string;
  effectiveFrom: string | null;  // ISO date
  effectiveTo: string | null;    // ISO date (exclusive)
  retrievedAt: string;
  reviewStatus: ReviewStatus;
}

export const IMMIGRATION_RULES: ImmigrationRule[] = [
  {
    ruleId: "INT.MRZ.CHECK_DIGITS", version: 1, country: "INT", documentType: "visa", sourceId: "icao_9303",
    ruleText: "Machine-readable visas carry check digits (weights 7-3-1, modulo 10) for document number, date of birth and expiry date.",
    effectiveFrom: null, effectiveTo: null, retrievedAt: "2026-11-03", reviewStatus: "approved",
  },
  {
    ruleId: "GB.STATUS.EVISA", version: 1, country: "GB", documentType: "visa", sourceId: "uk_view_prove_status",
    ruleText: "UK immigration status is evidenced online through an eVisa and the View and Prove service. Older physical documents (vignettes, BRPs) were legitimate formats for their issue period; current status must be checked online.",
    effectiveFrom: "2025-01-01", effectiveTo: null, retrievedAt: "2026-11-03", reviewStatus: "approved",
  },
  {
    ruleId: "GB.STATUS.PHYSICAL", version: 1, country: "GB", documentType: "visa", sourceId: "uk_view_prove_status",
    ruleText: "Before 2025, most UK permissions were evidenced by a vignette and/or Biometric Residence Permit (BRP).",
    effectiveFrom: null, effectiveTo: "2025-01-01", retrievedAt: "2026-11-03", reviewStatus: "pending_review",
  },
  {
    ruleId: "GB.SPONSOR.LICENSED", version: 1, country: "GB", documentType: "offer_letter", sourceId: "uk_sponsor_register",
    ruleText: "A UK employer offering Skilled Worker or Temporary Worker sponsorship must hold a sponsor licence and appear on the register of licensed sponsors.",
    effectiveFrom: null, effectiveTo: null, retrievedAt: "2026-11-03", reviewStatus: "approved",
  },
  {
    ruleId: "CA.EMPLOYER.NO_HIRING_FEES", version: 1, country: "CA", documentType: "offer_letter", sourceId: "ca_irpr_fees",
    ruleText: "Employers of temporary foreign workers must not charge, or allow anyone in the recruitment chain to charge, the worker fees related to hiring (government application processing fees excluded).",
    effectiveFrom: null, effectiveTo: null, retrievedAt: "2026-11-03", reviewStatus: "approved",
  },
  {
    ruleId: "AU.VISA.NO_LABELS", version: 1, country: "AU", documentType: "visa", sourceId: "au_vevo",
    ruleText: "Australia records visas electronically and generally no longer places visa labels in passports; visa details are checked through VEVO.",
    effectiveFrom: "2015-09-01", effectiveTo: null, retrievedAt: "2026-11-03", reviewStatus: "pending_review",
  },
];

/** Rules in force on `at` for a country/document type (temporal lookup). */
export function rulesInForce(country: string, documentType: ImmigrationRule["documentType"], at: Date): ImmigrationRule[] {
  const t = at.getTime();
  return IMMIGRATION_RULES.filter((r) =>
    (r.country === country || r.country === "INT") &&
    (r.documentType === documentType || r.documentType === "any") &&
    (!r.effectiveFrom || new Date(r.effectiveFrom).getTime() <= t) &&
    (!r.effectiveTo || t < new Date(r.effectiveTo).getTime()),
  );
}

export function getRule(ruleId: string): ImmigrationRule | undefined {
  return IMMIGRATION_RULES.find((r) => r.ruleId === ruleId);
}

/** Build the EvidenceSource block for a rule (drops ruleVersion when unreviewed → validator downgrades). */
export function ruleSource(ruleId: string) {
  const rule = getRule(ruleId);
  if (!rule) return undefined;
  const src = getSource(rule.sourceId);
  if (!src) return undefined;
  return {
    sourceId: src.id,
    authority: src.authority,
    url: src.url,
    retrievedAt: rule.retrievedAt,
    ruleId: rule.ruleId,
    ruleVersion: rule.reviewStatus === "approved" ? rule.version : undefined,
    effectiveFrom: rule.effectiveFrom,
  };
}

// ── Per-country official check guidance ──────────────────────────────────

export interface OfficialCheck {
  country: string;
  sourceId: string | null;
  title: string;
  url: string | null;
  capability: SourceCapability;
  needs: string | null;
  limitation: string;
}

const COUNTRY_STATUS_SOURCE: Record<string, string> = {
  GB: "uk_view_prove_status", CA: "ca_status", AU: "au_vevo", AE: "ae_icp_file_validity", US: "us_ceac",
};

/**
 * The official status check for a country. Falls back to the country
 * registry link (server/visa-verify/countries.ts) as a user-run portal.
 */
export function officialStatusCheck(countryCode: string | null, fallbackUrl: string | null, countryName?: string): OfficialCheck {
  const sid = countryCode ? COUNTRY_STATUS_SOURCE[countryCode] : undefined;
  const src = sid ? getSource(sid) : undefined;
  if (src) {
    return { country: countryCode!, sourceId: src.id, title: src.title, url: src.url, capability: src.capability, needs: src.needs ?? null, limitation: src.limitation };
  }
  if (fallbackUrl) {
    return {
      country: countryCode ?? "", sourceId: null,
      title: `${countryName ?? "Issuing country"} official visa / permit enquiry`,
      url: fallbackUrl, capability: "user_run",
      needs: "Usually the visa or permit number plus passport details. Some portals require an account or a CAPTCHA.",
      limitation: "WorkAbroadHub does not query this portal — run the check yourself on the official site.",
    };
  }
  return {
    country: countryCode ?? "", sourceId: null,
    title: "No public online verification", url: null, capability: "not_available", needs: null,
    limitation: "This authority does not publish an online verification service. Contact the issuing authority or its embassy directly with the document number.",
  };
}
