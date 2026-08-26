/**
 * NEA sync differ — takes freshly-parsed records + current DB rows and
 * classifies each into one of five buckets:
 *
 *   • added     — licence number is new to our DB, insert
 *   • updated   — licence exists but agency name / contact / expiry changed
 *   • expired   — licence exists but expiry_date has passed (may or may not
 *                 also be in `revoked` — expired takes precedence)
 *   • revoked   — licence exists in our DB but is NOT in the fresh source
 *                 (NEA removed it — treat as revoked / withdrawn)
 *   • unchanged — everything else, no DB write needed
 *
 * The apply.ts layer trusts these buckets blindly, so all normalisation
 * (whitespace, capitalisation, licence-number canonical form) happens here.
 */

import type { ParsedAgency } from "./parser";

export interface DbAgency {
  id:            string;
  agencyName:    string;
  licenseNumber: string;
  email:         string | null;
  serviceType:   string | null;
  issueDate:     Date | null;
  expiryDate:    Date | null;
  statusOverride: string | null;
}

export interface DiffedAgency {
  parsed: ParsedAgency;
  db:     DbAgency | null;  // null for 'added'
  reason: "added" | "updated" | "expired" | "unchanged";
}

export interface DiffResult {
  added:     ParsedAgency[];
  updated:   { parsed: ParsedAgency; db: DbAgency }[];
  expired:   DbAgency[];  // now-expired (from either the source's status OR expiry date passing)
  revoked:   DbAgency[];  // in DB but not in fresh source
  unchanged: number;
}

// ─── Public API ───────────────────────────────────────────────────────────

export function diffAgencies(
  parsed: ParsedAgency[],
  dbRows: DbAgency[],
): DiffResult {
  const now = Date.now();
  const parsedByKey = new Map<string, ParsedAgency>();
  const dbByKey     = new Map<string, DbAgency>();

  for (const p of parsed) {
    const k = normalizeLicKey(p.licenseNumber);
    if (!k) continue;
    // Dedupe within source — last write wins (source-of-truth rows near end
    // of CSV/HTML tend to be freshest in ASP.NET GridView ordering).
    parsedByKey.set(k, p);
  }
  for (const d of dbRows) {
    const k = normalizeLicKey(d.licenseNumber);
    if (!k) continue;
    dbByKey.set(k, d);
  }

  const added:   ParsedAgency[]                          = [];
  const updated: { parsed: ParsedAgency; db: DbAgency }[] = [];
  const expired: DbAgency[]                              = [];
  const revoked: DbAgency[]                              = [];
  let   unchanged = 0;

  // Walk fresh source
  for (const [key, p] of parsedByKey) {
    const dbRow = dbByKey.get(key);

    // Case A: brand new to us
    if (!dbRow) {
      added.push(p);
      continue;
    }

    // Case B: newly expired (either source says so, or expiry passed)
    const expiryPassed =
      p.expiryDate && new Date(p.expiryDate).getTime() < now;
    const sourceSaysExpired = /expired|revoked|suspended|cancelled/i.test(p.rawStatus ?? "");
    const wasAlreadyExpired =
      dbRow.expiryDate ? dbRow.expiryDate.getTime() < now : false;

    if ((expiryPassed || sourceSaysExpired) && !wasAlreadyExpired) {
      expired.push(dbRow);
      continue;
    }

    // Case C: material change
    if (materialChange(p, dbRow)) {
      updated.push({ parsed: p, db: dbRow });
      continue;
    }

    unchanged++;
  }

  // Case D: in DB but missing from fresh source → treat as revoked ONLY if
  // the DB row was previously active (still within its expiry). Historically
  // expired rows should stay expired, not flip to revoked, so we don't lose
  // fraud-check history.
  for (const [key, dbRow] of dbByKey) {
    if (parsedByKey.has(key)) continue;
    const stillWithinExpiry =
      dbRow.expiryDate ? dbRow.expiryDate.getTime() >= now : false;
    if (stillWithinExpiry) revoked.push(dbRow);
  }

  return { added, updated, expired, revoked, unchanged };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function normalizeLicKey(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, "").replace(/[^\w\-\/.]/g, "");
}

function materialChange(p: ParsedAgency, d: DbAgency): boolean {
  if (norm(p.agencyName) !== norm(d.agencyName)) return true;

  const pEmail = (p.email ?? "").toLowerCase().trim();
  const dEmail = (d.email  ?? "").toLowerCase().trim();
  if (pEmail && pEmail !== dEmail) return true;

  if (p.expiryDate && d.expiryDate) {
    const pT = new Date(p.expiryDate).getTime();
    const dT = d.expiryDate.getTime();
    if (Math.abs(pT - dT) > 24 * 60 * 60 * 1000) return true;
  } else if (p.expiryDate && !d.expiryDate) {
    return true;
  }

  return false;
}

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}
