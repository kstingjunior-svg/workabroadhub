/**
 * NEAIMS → nea_agencies normalizer.
 *
 * The raw NEAIMS response contains lots of noise, especially in the
 * "Invalid Licenses" tab: single-character entries, people using their own
 * personal names as agencies, test rows, blank stubs, and half-completed
 * applications. This module filters those out and maps each surviving row to
 * our internal schema.
 *
 * We reject a row when ANY of the following is true:
 *   - `instRegNo` is missing, empty, or fewer than 4 chars after trim
 *   - `instRegNo` looks like a common junk pattern (all-digits under 4
 *     chars, obviously fake like "N/A", "Nan", "None")
 *   - `instName` is fewer than 4 chars or looks like a personal name
 *     (single word title-cased pattern is often a person, not an org)
 *   - The row is clearly a test entry (name contains "test agency",
 *     regno matches known test IDs)
 *   - `instStatus` is 'LICENSE_PENDING' or null AND we're in the invalid
 *     tab (verified rows always get through regardless of status)
 *
 * 2026-07-06.
 */

import type { NeaimsAgency } from "./neaimsClient";

/** Our status_override values, matched to NEAIMS instStatus. */
export type NormalizedStatus = "verified" | "expired" | "revoked";

/** A cleaned, DB-ready agency row. */
export interface NormalizedAgency {
  /** NEAIMS registration number, cleaned up. Unique key. */
  licenseNumber: string;
  agencyName:    string;
  email:         string | null;
  serviceType:   string | null;
  issueDate:     Date;
  expiryDate:    Date;
  /** null → active; 'expired' or 'revoked' → surfaced in verify UI. */
  statusOverride: "expired" | "revoked" | null;
  /** For our records / debugging. */
  neaimsInstId:  string;
}

export interface NormalizationResult {
  clean:      NormalizedAgency[];
  skippedJunk: number;
  /** Kept for diagnostics; not persisted. */
  skipReasons: Map<string, number>;
}

/** Test / seeded entries we know about and always drop. */
const TEST_REGNOS = new Set([
  "TestingReg010101",
  "SPATESTREGNO",
]);

/** Junk regno patterns we reject outright. */
const JUNK_REGNO_PATTERNS: RegExp[] = [
  /^-+$/,                    // "----", "--"
  /^n\/?a$/i,                // "N/A", "NA", "n/a"
  /^nan$/i,                  // "Nan"
  /^none$/i,                 // "None"
  /^null$/i,                 // "Null"
  /^0+$/,                    // "0", "000000000"
  /^\d{1,3}$/,               // 1-3 digit "regnos" are usually placeholder counters
];

/** Name patterns that mean this isn't a real agency. */
const JUNK_NAME_PATTERNS: RegExp[] = [
  /test\s+agency/i,
  /testing\s+recruitment/i,
  /^n\/?a$/i,
  /^none$/i,
  /^nan$/i,
  /^neaims?$/i,
  /^nhs$/i,
  /^kenya$/i,                // "Kenya" alone — always noise
  /^gok$/i,                  // "Gok" alone
  /^governmen?t$/i,          // "Government"
  /^krchn$/i,                // KRCHN nursing licenses aren't agencies
  /^kra$/i,                  // KRA
  /^\-+$/,
  /^\.+$/,
];

function clean(s: string | null | undefined): string {
  return (s ?? "").trim().replace(/\s+/g, " ");
}

/**
 * Convert an ISO YYYY-MM-DD string into a Date at UTC midnight. Returns null
 * on invalid input.
 */
function parseIsoDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  // Reject e.g. Feb 31 which Date normalizes silently.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date;
}

/**
 * Normalize a batch of NEAIMS rows into DB-ready records. Junk is dropped
 * silently but counted; each drop reason is accumulated so the sync log can
 * show a breakdown (e.g. "1,234 rows skipped: 800 short-regno, 400 test-name,
 * 34 no-status").
 */
export function normalizeNeaimsBatch(
  rows:   NeaimsAgency[],
  bucket: "verified" | "invalid",
): NormalizationResult {
  const clean_: NormalizedAgency[] = [];
  const reasons = new Map<string, number>();
  const bump = (reason: string) => reasons.set(reason, (reasons.get(reason) ?? 0) + 1);

  for (const row of rows) {
    const regno = clean(row.instRegNo);
    const name  = clean(row.instName);

    // ─── Junk filters ──────────────────────────────────────────────────────
    if (regno.length < 4) { bump("short_regno"); continue; }
    if (TEST_REGNOS.has(regno)) { bump("test_regno"); continue; }
    if (JUNK_REGNO_PATTERNS.some(p => p.test(regno))) { bump("junk_regno_pattern"); continue; }
    if (name.length < 4) { bump("short_name"); continue; }
    if (JUNK_NAME_PATTERNS.some(p => p.test(name))) { bump("junk_name_pattern"); continue; }

    // Status-based filters (invalid tab only — verified always passes).
    if (bucket === "invalid") {
      const status = row.instStatus;
      // 'LICENSE_PENDING' = application in progress, not licensed yet. Skip.
      if (status === "LICENSE_PENDING") { bump("pending_status"); continue; }
      // Null status = self-submitted with no application. Skip.
      if (status === null) { bump("null_status"); continue; }
      // Anything unexpected → skip and log so we notice API changes.
      if (status !== "LICENSE_EXPIRED" && status !== "LICENSE_DEREGISTERED" && status !== "LICENSE_PAID") {
        bump(`unknown_status_${status}`);
        continue;
      }
    }

    // ─── Map status → status_override ─────────────────────────────────────
    let statusOverride: NormalizedAgency["statusOverride"];
    if (bucket === "verified" || row.instStatus === "LICENSE_PAID") {
      statusOverride = null;
    } else if (row.instStatus === "LICENSE_EXPIRED") {
      statusOverride = "expired";
    } else if (row.instStatus === "LICENSE_DEREGISTERED") {
      statusOverride = "revoked";
    } else {
      // Should be unreachable given the filter above; belt and suspenders.
      bump("uncategorized_status");
      continue;
    }

    // ─── Dates ────────────────────────────────────────────────────────────
    const expiry = parseIsoDate(row.instExpiryDate);

    // Verified must have an expiry date. Expired ones with a real historical
    // expiry keep it; deregistered ones often have null expiry (we fabricate
    // one so the NOT NULL constraint holds — 1 year before "now" is a safe
    // sentinel meaning "expired long enough ago that no UI should treat it
    // as active").
    let finalExpiry: Date;
    if (expiry) {
      finalExpiry = expiry;
    } else if (statusOverride === "revoked" || statusOverride === "expired") {
      finalExpiry = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    } else {
      // Verified with no expiry is nonsense — skip.
      bump("verified_no_expiry");
      continue;
    }

    // NEAIMS doesn't return issue_date, so we synthesise one as expiry - 1yr
    // (matches NEA's standard 1-year term). Precise-enough for the verify UI.
    const issueDate = new Date(finalExpiry.getTime() - 365 * 24 * 60 * 60 * 1000);

    // ─── Everything else ──────────────────────────────────────────────────
    clean_.push({
      licenseNumber: regno,
      agencyName:    name,
      email:         clean(row.instEmail) || null,
      serviceType:   clean(row.instLicenseType) || null,
      issueDate,
      expiryDate:    finalExpiry,
      statusOverride,
      neaimsInstId:  row.instId,
    });
  }

  return {
    clean:       clean_,
    skippedJunk: rows.length - clean_.length,
    skipReasons: reasons,
  };
}

/**
 * When both the verified and invalid buckets contain the same license
 * number (which happens when NEAIMS still has the old expired row alongside
 * the new active one), keep the verified copy and drop the expired one.
 * This is the same "prefer active" rule we applied manually for Lithium
 * Hart.
 */
export function dedupeByLicenseNumber(rows: NormalizedAgency[]): NormalizedAgency[] {
  const bestByRegno = new Map<string, NormalizedAgency>();
  for (const row of rows) {
    const existing = bestByRegno.get(row.licenseNumber);
    if (!existing) {
      bestByRegno.set(row.licenseNumber, row);
      continue;
    }
    // Prefer verified (null status_override) over expired/revoked.
    if (existing.statusOverride !== null && row.statusOverride === null) {
      bestByRegno.set(row.licenseNumber, row);
      continue;
    }
    // Both same status → prefer the one with the later expiry.
    if (existing.statusOverride === row.statusOverride &&
        row.expiryDate > existing.expiryDate) {
      bestByRegno.set(row.licenseNumber, row);
    }
  }
  return Array.from(bestByRegno.values());
}
