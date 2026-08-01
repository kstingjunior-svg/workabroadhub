/**
 * scam-cross-ref.ts — the fraud intelligence engine.
 *
 * Tony's founder brief (2026-07):
 *   "If multiple users report the same agency / phone / bank / M-Pesa /
 *   recruiter / employer — automatically group them into one investigation
 *   page. Display: '17 independent reports reference this phone number.'"
 *
 * The engine does two jobs on every submitted report:
 *
 *   1. NORMALIZE + PERSIST every identifier (phone, email, bank, mpesa,
 *      website, socials) into `scam_report_contacts`.
 *   2. LOOK UP how many OTHER reports share each identifier, and produce
 *      a "cluster" summary the client can render as
 *      "17 reports reference this phone".
 *   3. UPSERT the reported_agency_profiles row so /agencies-reported/:slug always
 *      reflects the freshest state.
 */

import crypto from "crypto";
import { pool } from "../db";

// ── Types ──────────────────────────────────────────────────────────────

export type ContactKind =
  | "phone" | "whatsapp" | "email" | "bank" | "mpesa" | "crypto"
  | "website" | "facebook" | "instagram" | "tiktok" | "linkedin";

export interface ReportContactPayload {
  phoneNumbers?: string | string[] | null;
  emailAddresses?: string | string[] | null;
  whatsappNumber?: string | null;
  bankAccount?: string | null;
  mpesaNumber?: string | null;
  cryptoWallet?: string | null;
  website?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  tiktokUrl?: string | null;
  linkedinUrl?: string | null;
}

export interface CrossRefCluster {
  /** Machine kind — "phone" | "email" | ... */
  kind: ContactKind;
  /** The normalized identifier value (safe to display; masked where needed). */
  normalized: string;
  /** Human-readable format (kept close to what user entered). */
  display: string;
  /** How many OTHER reports (excluding the current one) share this value. */
  otherReportCount: number;
  /** Total independent reporter fingerprints (approximate unique reporters). */
  independentReporters: number;
}

export interface CrossRefResult {
  clusters: CrossRefCluster[];
  /** Sum of `otherReportCount` across all clusters (upper bound of unique matches). */
  totalRelatedReports: number;
  /** Human-readable summary line for the confirmation screen. */
  headline: string;
}

// ── Normalization ──────────────────────────────────────────────────────

/** Slugify an agency name for use as a stable public URL segment. */
export function slugifyAgency(name: string): string {
  return (name || "")
    .toLowerCase()
    .trim()
    .replace(/\bltd\b|\blimited\b|\bplc\b|\binc\b|\bcompany\b|\bco\b/gi, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "unknown-agency";
}

/** Normalize a phone-like string to digits only, strip leading zeros. */
function normalizePhone(v: string | null | undefined): string {
  if (!v) return "";
  return v.replace(/[^\d]/g, "").replace(/^0+/, "");
}

/** Normalize an email to lowercase-trimmed. */
function normalizeEmail(v: string | null | undefined): string {
  if (!v) return "";
  return v.trim().toLowerCase();
}

/** Normalize a URL: strip protocol, www, trailing slash, lowercase host. */
function normalizeUrl(v: string | null | undefined): string {
  if (!v) return "";
  try {
    const withProto = v.startsWith("http") ? v : `https://${v}`;
    const u = new URL(withProto);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    return host + u.pathname.replace(/\/+$/, "");
  } catch {
    return v.toLowerCase().trim();
  }
}

/** Normalize bank / mpesa / wallet: digits + letters only, lowercased. */
function normalizeAccount(v: string | null | undefined): string {
  if (!v) return "";
  return v.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

/** Split a "phone1, phone2, phone3" free-text field into an array. */
function splitList(v: string | string[] | null | undefined): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  return String(v).split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Extract every identifier from a payload as a list of
 * { kind, raw, normalized } records. Used by the caller to insert into
 * scam_report_contacts and to look up cross-refs.
 */
export function extractContacts(p: ReportContactPayload): Array<{
  kind: ContactKind;
  raw: string;
  normalized: string;
}> {
  const out: Array<{ kind: ContactKind; raw: string; normalized: string }> = [];
  const add = (kind: ContactKind, raw: string, normalized: string) => {
    if (!normalized) return;
    out.push({ kind, raw, normalized });
  };

  for (const p2 of splitList(p.phoneNumbers))     add("phone",     p2, normalizePhone(p2));
  if (p.whatsappNumber)                           add("whatsapp",  p.whatsappNumber, normalizePhone(p.whatsappNumber));
  for (const e of splitList(p.emailAddresses))    add("email",     e, normalizeEmail(e));
  if (p.bankAccount)                              add("bank",      p.bankAccount, normalizeAccount(p.bankAccount));
  if (p.mpesaNumber)                              add("mpesa",     p.mpesaNumber, normalizePhone(p.mpesaNumber));
  if (p.cryptoWallet)                             add("crypto",    p.cryptoWallet, normalizeAccount(p.cryptoWallet));
  if (p.website)                                  add("website",   p.website,   normalizeUrl(p.website));
  if (p.facebookUrl)                              add("facebook",  p.facebookUrl,  normalizeUrl(p.facebookUrl));
  if (p.instagramUrl)                             add("instagram", p.instagramUrl, normalizeUrl(p.instagramUrl));
  if (p.tiktokUrl)                                add("tiktok",    p.tiktokUrl,    normalizeUrl(p.tiktokUrl));
  if (p.linkedinUrl)                              add("linkedin",  p.linkedinUrl,  normalizeUrl(p.linkedinUrl));

  // Dedupe within one report (same phone entered twice → one contact)
  const seen = new Set<string>();
  return out.filter((c) => {
    const key = `${c.kind}::${c.normalized}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Persist + look up ──────────────────────────────────────────────────

/**
 * Insert every contact into scam_report_contacts and return the cross-ref
 * cluster summary for the client to display.
 *
 * Non-blocking on individual insert failure — the report itself is more
 * important than the cross-ref index.
 */
export async function persistAndCrossRef(
  reportId: string,
  payload: ReportContactPayload,
): Promise<CrossRefResult> {
  const contacts = extractContacts(payload);
  if (contacts.length === 0) {
    return { clusters: [], totalRelatedReports: 0, headline: "" };
  }

  // Bulk insert
  try {
    const values: any[] = [];
    const placeholders: string[] = [];
    contacts.forEach((c, i) => {
      const base = i * 4;
      placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
      values.push(reportId, c.kind, c.raw, c.normalized);
    });
    await pool.query(
      `INSERT INTO scam_report_contacts (report_id, kind, raw_value, normalized)
       VALUES ${placeholders.join(", ")}`,
      values,
    );
  } catch (err: any) {
    console.warn("[scam-cross-ref] contact insert failed:", err?.message);
  }

  // Look up matches for each contact
  const clusters: CrossRefCluster[] = [];
  for (const c of contacts) {
    try {
      const { rows } = await pool.query<{ other_count: string; reporter_count: string }>(
        `SELECT
           COUNT(DISTINCT contacts.report_id) FILTER (WHERE contacts.report_id != $1) AS other_count,
           COUNT(DISTINCT reports.reporter_ip_hash) FILTER (WHERE contacts.report_id != $1) AS reporter_count
         FROM scam_report_contacts contacts
         LEFT JOIN scam_reports reports ON reports.id = contacts.report_id
         WHERE contacts.kind = $2 AND contacts.normalized = $3`,
        [reportId, c.kind, c.normalized],
      );
      const other = Number(rows[0]?.other_count ?? 0);
      const reporters = Number(rows[0]?.reporter_count ?? 0);
      if (other > 0) {
        clusters.push({
          kind: c.kind,
          normalized: maskForDisplay(c.kind, c.normalized),
          display: c.raw,
          otherReportCount: other,
          independentReporters: Math.max(1, reporters),
        });
      }
    } catch (err: any) {
      console.warn("[scam-cross-ref] lookup failed:", err?.message);
    }
  }

  const totalRelated = clusters.reduce((sum, c) => sum + c.otherReportCount, 0);
  const headline = buildHeadline(clusters);

  return { clusters, totalRelatedReports: totalRelated, headline };
}

/**
 * Upsert the aggregated reported_agency_profiles row for a report's agency.
 * Called after cross-ref persistence to keep the public page fresh.
 */
export async function upsertAgencyProfile(
  agencyName: string,
  info: {
    country?: string | null;
    officeLocation?: string | null;
    licenceNumber?: string | null;
    licenceStatus?: string | null;
    licenceExpiresAt?: string | null;
    contacts: ReportContactPayload;
    amountLostKes?: number | null;
  },
): Promise<{ slug: string }> {
  const slug = slugifyAgency(agencyName);
  const contactBuckets = extractContacts(info.contacts);
  const bucket = (k: ContactKind) => contactBuckets.filter((c) => c.kind === k).map((c) => c.normalized);

  try {
    await pool.query(
      `INSERT INTO reported_agency_profiles (
         slug, display_name, country, office_location,
         known_websites, known_phones, known_emails, known_whatsapp,
         known_bank_accounts, known_mpesa_numbers,
         licence_number, licence_status, licence_expires_at,
         report_count, approved_report_count, total_reported_loss_kes,
         first_report_at, last_report_at
       ) VALUES (
         $1, $2, $3, $4,
         $5, $6, $7, $8,
         $9, $10,
         $11, $12, $13,
         1, 0, COALESCE($14, 0),
         NOW(), NOW()
       )
       ON CONFLICT (slug) DO UPDATE SET
         known_websites      = array(SELECT DISTINCT unnest(reported_agency_profiles.known_websites      || EXCLUDED.known_websites)),
         known_phones        = array(SELECT DISTINCT unnest(reported_agency_profiles.known_phones        || EXCLUDED.known_phones)),
         known_emails        = array(SELECT DISTINCT unnest(reported_agency_profiles.known_emails        || EXCLUDED.known_emails)),
         known_whatsapp      = array(SELECT DISTINCT unnest(reported_agency_profiles.known_whatsapp      || EXCLUDED.known_whatsapp)),
         known_bank_accounts = array(SELECT DISTINCT unnest(reported_agency_profiles.known_bank_accounts || EXCLUDED.known_bank_accounts)),
         known_mpesa_numbers = array(SELECT DISTINCT unnest(reported_agency_profiles.known_mpesa_numbers || EXCLUDED.known_mpesa_numbers)),
         report_count        = reported_agency_profiles.report_count + 1,
         total_reported_loss_kes = reported_agency_profiles.total_reported_loss_kes + COALESCE($14, 0),
         last_report_at      = NOW(),
         updated_at          = NOW(),
         country             = COALESCE(reported_agency_profiles.country, EXCLUDED.country),
         office_location     = COALESCE(reported_agency_profiles.office_location, EXCLUDED.office_location),
         licence_number      = COALESCE(EXCLUDED.licence_number, reported_agency_profiles.licence_number),
         licence_status      = COALESCE(EXCLUDED.licence_status, reported_agency_profiles.licence_status)`,
      [
        slug, agencyName, info.country ?? null, info.officeLocation ?? null,
        bucket("website"), bucket("phone"), bucket("email"), bucket("whatsapp"),
        bucket("bank"), bucket("mpesa"),
        info.licenceNumber ?? null, info.licenceStatus ?? null,
        info.licenceExpiresAt ? new Date(info.licenceExpiresAt) : null,
        info.amountLostKes ?? 0,
      ],
    );

    // Recompute risk_band based on report count + loss aggregate
    await pool.query(
      `UPDATE reported_agency_profiles SET risk_band = CASE
         WHEN approved_report_count >= 5 OR total_reported_loss_kes >= 500000 THEN 'critical'
         WHEN approved_report_count >= 2 OR total_reported_loss_kes >= 100000 THEN 'high'
         WHEN approved_report_count >= 1 OR report_count >= 3               THEN 'medium'
         ELSE 'medium' END
       WHERE slug = $1`,
      [slug],
    );
  } catch (err: any) {
    console.warn("[scam-cross-ref] agency profile upsert failed:", err?.message);
  }

  return { slug };
}

/**
 * Hash the reporter's IP + user-agent for abuse deduplication.
 * NOT used as an identity or lookup key — only as a "same reporter?" signal
 * for cluster stats + abuse rate limiting.
 */
export function hashReporterIp(ip: string | undefined | null, ua: string | undefined | null): string {
  return crypto.createHash("sha256").update(`${ip ?? ""}::${ua ?? ""}`).digest("hex").slice(0, 32);
}

// ── Display helpers ─────────────────────────────────────────────────────

function maskForDisplay(kind: ContactKind, normalized: string): string {
  if (kind === "email") {
    const [local, domain] = normalized.split("@");
    if (!local || !domain) return normalized;
    const masked = local.length > 2 ? local.slice(0, 2) + "***" : "***";
    return `${masked}@${domain}`;
  }
  if (kind === "phone" || kind === "whatsapp" || kind === "mpesa") {
    if (normalized.length <= 5) return normalized;
    return normalized.slice(0, -4).replace(/./g, "*") + normalized.slice(-4);
  }
  if (kind === "bank" || kind === "crypto") {
    if (normalized.length <= 5) return normalized;
    return normalized.slice(0, 4) + "***" + normalized.slice(-3);
  }
  return normalized;
}

function buildHeadline(clusters: CrossRefCluster[]): string {
  if (clusters.length === 0) return "";
  const strongest = [...clusters].sort((a, b) => b.otherReportCount - a.otherReportCount)[0];
  const kindLabel: Record<ContactKind, string> = {
    phone:     "phone number",
    whatsapp:  "WhatsApp number",
    email:     "email address",
    bank:      "bank account",
    mpesa:     "M-Pesa number",
    crypto:    "crypto wallet",
    website:   "website",
    facebook:  "Facebook page",
    instagram: "Instagram page",
    tiktok:    "TikTok page",
    linkedin:  "LinkedIn page",
  };
  return `⚠ ${strongest.otherReportCount} other report${strongest.otherReportCount === 1 ? "" : "s"} in our database reference the same ${kindLabel[strongest.kind]}.`;
}
