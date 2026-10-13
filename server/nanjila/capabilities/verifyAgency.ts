/**
 * Nanjila — verify_agency capability.
 *
 * 2026-10 (Tony's idea): give Nanjila live access to the full NEA agency
 * registry so users can ask conversationally — "is ABC Travel legit?" —
 * instead of leaving the chat to search the Agency Verification Portal.
 *
 * Why this is high-impact:
 *   • Scam prevention — someone about to send KES 150,000 to a Westlands
 *     "agency" can ask Nanjila and get an authoritative answer BEFORE
 *     the money leaves their phone.
 *   • Discoverability — most users don't know /verify exists; Nanjila can
 *     surface the right info in context.
 *   • Trust reinforcement — Nanjila becomes the single pane of trust.
 *
 * Safety discipline (CRITICAL):
 *   • Nanjila MUST call this tool for every "is X agency licensed?" style
 *     question. Never answer from memory. The system prompt in Nanjila's
 *     prompt-assembly layer enforces this (see persona-guards.ts).
 *   • Results always include the raw license number + expiry date so
 *     Nanjila's natural-language summary can be traced back to a real
 *     DB row by the user.
 *   • When no match exists, we return a confident "not in NEA registry"
 *     warning — do NOT guess or interpolate possible matches.
 *
 * Query strategy:
 *   • ILIKE wildcards for case-insensitive substring match (works without
 *     the pg_trgm extension; cheap on our dataset of 2,635 rows).
 *   • Score matches so an exact-start match ranks above a mid-string hit.
 *   • Cap at `limit` (default 5, max 10). If more than `limit` match,
 *     flag `hasMoreMatches=true` so Nanjila can ask the user to narrow it.
 *
 * Status derivation:
 *   • Mirrors the same ordering used by landing-nea-search.tsx AFTER the
 *     2026-10 fix (expiry beats stale 'verified' override).
 *   • "revoked" / "suspended" / "blacklisted" override everything.
 *   • Then date-based: expiry_date < today → "expired".
 *   • Then "verified" override → "active" (only when not expired).
 *   • Else default to "active" when expiry is still in the future.
 */

import { pool } from "../../db";
import type { CapabilityDefinition, CapabilityContext } from "./index";

// ─────────────────────────────────────────────────────────────────────────────
// Input / output types
// ─────────────────────────────────────────────────────────────────────────────

export interface VerifyAgencyInput {
  /** Agency name OR license number the user asked about. Free-text. */
  query: string;
  /** Max matches to return. Default 5, hard-capped at 10. */
  limit?: number;
}

export interface AgencyMatch {
  id:            string;
  agencyName:    string;
  licenseNumber: string | null;
  /** "active" | "expired" | "revoked" | "suspended" | "blacklisted" | "unknown" */
  status:        string;
  statusLabel:   string;
  expiryDate:    string | null;   // ISO yyyy-mm-dd
  daysUntilExpiry: number | null;
  serviceType:   string | null;
  email:         string | null;
  city:          string | null;
  country:       string | null;
  /** Deep link to the /verify page so the user can see proof. */
  verifyUrl:     string;
}

export interface VerifyAgencyOutput {
  ok:              boolean;
  query:           string;
  matchCount:      number;
  hasMoreMatches:  boolean;
  matches:         AgencyMatch[];
  /** A single sentence Nanjila can quote verbatim when there's one clear match. */
  headline:        string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

function daysBetween(fromISO: string | null): number | null {
  if (!fromISO) return null;
  const t = Date.parse(fromISO);
  if (!Number.isFinite(t)) return null;
  const diffMs = t - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function deriveStatus(row: {
  status_override: string | null;
  expiry_date:     Date | null;
  is_blacklisted?: boolean;
}): { status: string; label: string } {
  const now = Date.now();
  const override = (row.status_override || "").toLowerCase().trim();
  const expiryTime = row.expiry_date ? new Date(row.expiry_date).getTime() : null;
  const isExpired = expiryTime !== null && expiryTime < now;

  if (row.is_blacklisted)        return { status: "blacklisted", label: "BLACKLISTED" };
  if (override === "revoked")    return { status: "revoked",     label: "REVOKED" };
  if (override === "suspended")  return { status: "suspended",   label: "SUSPENDED" };
  if (override === "blacklisted")return { status: "blacklisted", label: "BLACKLISTED" };
  if (isExpired)                 return { status: "expired",     label: "EXPIRED" };
  if (override === "verified")   return { status: "active",      label: "ACTIVE & LICENSED" };
  if (expiryTime !== null)       return { status: "active",      label: "ACTIVE & LICENSED" };
  return { status: "unknown", label: "STATUS UNKNOWN" };
}

function composeHeadline(matches: AgencyMatch[], raw: string): string {
  if (matches.length === 0) {
    return `No agency named "${raw}" is in the NEA registry. [red]Agencies not registered with NEA cannot legally recruit for overseas jobs[/red]. Be very cautious — ask them for their NEA licence number and let me check it directly.`;
  }
  if (matches.length === 1) {
    const m = matches[0];
    const lic = m.licenseNumber ? ` (licence ${m.licenseNumber})` : "";
    switch (m.status) {
      case "active": {
        const expiryBit = m.daysUntilExpiry !== null && m.daysUntilExpiry <= 30
          ? ` BUT their licence [amber]expires in just ${m.daysUntilExpiry} day${m.daysUntilExpiry === 1 ? "" : "s"}[/amber] — renewal check recommended.`
          : m.expiryDate ? ` Current licence valid until [green]${m.expiryDate}[/green].` : "";
        return `✅ ${m.agencyName}${lic} is [green]currently licensed[/green] by Kenya's National Employment Authority.${expiryBit}`;
      }
      case "expired":
        return `⚠️ ${m.agencyName}${lic}'s NEA licence [red]expired on ${m.expiryDate ?? "an unspecified date"}[/red]. [red]They CANNOT legally recruit right now[/red] — do not pay them until they renew.`;
      case "revoked":
        return `🚨 ${m.agencyName}${lic}'s NEA licence has been [red]REVOKED[/red]. Do not pay them. If they contacted you, report it to NEA on 0800-721-253 or complaints@nea.go.ke.`;
      case "suspended":
        return `🚨 ${m.agencyName}${lic} is currently [red]SUSPENDED[/red] by NEA. Do not transact with them until their licence is reinstated.`;
      case "blacklisted":
        return `🚨 ${m.agencyName}${lic} is [red]BLACKLISTED[/red]. Do not engage. Report any contact to NEA immediately.`;
      default:
        return `I found ${m.agencyName}${lic} in the registry but their status is unclear. Please view the full record for the latest info: ${m.verifyUrl}`;
    }
  }
  return `I found ${matches.length} agencies that match "${raw}". Can you tell me which one — the city they're in, or their licence number?`;
}

async function verifyAgencyHandler(
  input: VerifyAgencyInput,
  _ctx:  CapabilityContext,
): Promise<VerifyAgencyOutput> {
  const raw = String(input.query || "").trim();
  if (!raw || raw.length < 2) {
    return {
      ok:             false,
      query:          raw,
      matchCount:     0,
      hasMoreMatches: false,
      matches:        [],
      headline:       "I need the agency's name or licence number to check — can you share that?",
    };
  }
  const limit = Math.max(1, Math.min(10, input.limit ?? 5));
  const appOrigin = (process.env.APP_ORIGIN || "https://workabroadhub.tech").replace(/\/$/, "");

  // 2026-10 fix (Tony: "if someone just says 'twin', she should find
  // Twinpalm; if they say 'twin palm global' she should also find
  // TWINPALM GLOBAL even though the DB has no space"). Three parallel
  // match strategies, each stripped of non-alphanumerics so punctuation
  // and spacing don't block hits:
  //   • needleRaw        = "twin palm global" (as typed, lowercase)
  //   • needleDespaced   = "twinpalmglobal"   (spaces + punct stripped,
  //                                             so "twin palm" matches
  //                                             "TWINPALM")
  //   • needleFirstWord  = "twin"             (first word only — users
  //                                             often remember only the
  //                                             distinctive first word)
  // Both the needles AND the compared columns go through the same
  // alphanumeric-only normalisation. That way "AL-NAHDA" matches
  // "al nahda" and vice versa.
  const needleRaw     = raw.replace(/^\s*[+(]/, "").trim().toLowerCase();
  const needleAlnum   = needleRaw.replace(/[^a-z0-9]+/g, "");
  const needleFirst   = (needleRaw.split(/\s+/).filter(Boolean)[0] || needleRaw);
  // Columns normalised the same way via regexp_replace in SQL.
  // Minimum useful length for a prefix-only search is 3 chars — avoids
  // "is" matching 400 agencies.
  const needleFirstPrefix = needleFirst.length >= 3 ? needleFirst : needleAlnum;

  try {
    const { rows } = await pool.query<{
      id:              string;
      agency_name:     string;
      license_number:  string | null;
      status_override: string | null;
      expiry_date:     Date | null;
      service_type:    string | null;
      email:           string | null;
      city:            string | null;
      country:         string | null;
      score:           number;
      total:           number;
    }>(
      // 2026-10 fix v2 (Tony: "still has no access"). First fix cast
      // $2/$3/$4 but $1 (needleRaw) was passed in the params array yet
      // never referenced in the query — Postgres saw an untyped
      // parameter and crashed with "could not determine data type of
      // parameter $1". Dropped needleRaw from params (it was dead) and
      // renumbered. All remaining params explicitly cast.
      `WITH norm AS (
         SELECT id, agency_name, license_number, status_override, expiry_date,
                service_type, email, city, country,
                regexp_replace(LOWER(agency_name),                   '[^a-z0-9]+', '', 'g') AS name_alnum,
                regexp_replace(LOWER(COALESCE(license_number,'')),   '[^a-z0-9]+', '', 'g') AS lic_alnum
           FROM nea_agencies
       ),
       candidates AS (
         SELECT *,
                CASE
                  -- 1. Exact ISO licence number match (highest)
                  WHEN lic_alnum = ($1::text)  AND LENGTH($1::text) >= 4 THEN 100
                  WHEN name_alnum = ($1::text) AND LENGTH($1::text) >= 3 THEN 95
                  -- 2. Prefix matches on name or licence (very strong)
                  WHEN name_alnum LIKE ($1::text) || '%' AND LENGTH($1::text) >= 3 THEN 90
                  WHEN lic_alnum  LIKE ($1::text) || '%' AND LENGTH($1::text) >= 4 THEN 88
                  -- 3. First-word-only prefix match (user said "twin" →
                  --    finds "twinpalm", "twinbright" etc.)
                  WHEN ($2::text) <> '' AND name_alnum LIKE ($2::text) || '%' THEN 75
                  -- 4. Substring anywhere in name
                  WHEN name_alnum LIKE '%' || ($1::text) || '%' AND LENGTH($1::text) >= 3 THEN 50
                  WHEN lic_alnum  LIKE '%' || ($1::text) || '%' AND LENGTH($1::text) >= 4 THEN 45
                  ELSE 0
                END AS score
           FROM norm
       )
       SELECT id, agency_name, license_number, status_override, expiry_date,
              service_type, email, city, country, score,
              COUNT(*) OVER() AS total
         FROM candidates
        WHERE score > 0
        ORDER BY score DESC, agency_name ASC
        LIMIT ($3::int)`,
      [needleAlnum, needleFirstPrefix, limit + 1],
    );

    const total = rows[0] ? Number(rows[0].total) : 0;
    const hasMore = total > limit;
    const shown = rows.slice(0, limit);

    const matches: AgencyMatch[] = shown.map((r) => {
      const expiryISO = r.expiry_date ? new Date(r.expiry_date).toISOString().slice(0, 10) : null;
      const { status, label } = deriveStatus({
        status_override: r.status_override,
        expiry_date:     r.expiry_date,
      });
      return {
        id:              r.id,
        agencyName:      r.agency_name,
        licenseNumber:   r.license_number,
        status,
        statusLabel:     label,
        expiryDate:      expiryISO,
        daysUntilExpiry: daysBetween(expiryISO),
        serviceType:     r.service_type,
        email:           r.email,
        city:            r.city,
        country:         r.country,
        verifyUrl:       `${appOrigin}/verify/${r.id}`,
      };
    });

    return {
      ok:             true,
      query:          raw,
      matchCount:     matches.length,
      hasMoreMatches: hasMore,
      matches,
      headline:       composeHeadline(matches, raw),
    };
  } catch (err: any) {
    console.warn("[Nanjila/verifyAgency] lookup failed:", err?.message);
    return {
      ok:             false,
      query:          raw,
      matchCount:     0,
      hasMoreMatches: false,
      matches:        [],
      headline:       "I couldn't reach the NEA registry just now. Try again in a moment, or verify directly at https://workabroadhub.tech/verify.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Capability definition — exported for the registry
// ─────────────────────────────────────────────────────────────────────────────

export const verifyAgencyCapability: CapabilityDefinition<VerifyAgencyInput, VerifyAgencyOutput> = {
  slug:        "verify_agency",
  label:       "Verify a recruitment agency against NEA registry",
  description:
    "Look up a Kenyan recruitment / employment agency in the National Employment Authority (NEA) registry. " +
    "ALWAYS call this before telling a user whether a specific agency is licensed — never answer from memory. " +
    "Pass the agency name OR their licence number (e.g. 'PVT-8LU76GZM') as `query`. " +
    "Returns up to 5 matches with the authoritative licence status (active / expired / revoked / suspended / blacklisted), " +
    "the licence number, expiry date, and a verifyUrl the user can tap for the full record. " +
    "If no match is returned, warn the user: unregistered agencies cannot legally recruit for overseas jobs.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type:        "string",
        description: "Agency name or NEA licence number as the user typed it.",
      },
      limit: {
        type:        "integer",
        description: "Max matches to return (default 5, max 10).",
        minimum:     1,
        maximum:     10,
      },
    },
    required: ["query"],
  },
  outputSchema: {
    type: "object",
    properties: {
      ok:             { type: "boolean" },
      query:          { type: "string" },
      matchCount:     { type: "integer" },
      hasMoreMatches: { type: "boolean" },
      headline:       { type: "string" },
    },
  },
  requiresAuth:  false,  // ← open to anonymous users — scam prevention trumps gating
  requiresPaid:  false,
  requiresAdmin: false,
  handler:       verifyAgencyHandler,
};
