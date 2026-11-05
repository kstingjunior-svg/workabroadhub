/**
 * Employer / agency lookups against synced official datasets, plus DNS
 * checks for sender domains. Returns plain data; findings are built in
 * employer-findings.ts (pure).
 */
import { promises as dns } from "dns";
import { pool } from "../db";
import { normalizeEmployerName, registrableDomain } from "./names";

export interface RegistryMatch {
  name: string;
  town?: string | null;
  county?: string | null;
  typeRating?: string | null;
  route?: string | null;
  licenceNumber?: string | null;
  licenceExpiry?: string | null;
  licenceStatus?: string | null;
}

export interface RegistryLookupResult {
  registryId: "uk_sponsor_register" | "ke_nea_register";
  queriedName: string;
  outcome: "match" | "no_match" | "close_matches" | "unavailable";
  matches: RegistryMatch[];
  retrievedAt: string | null;
  stale: boolean;
  /** For NEA: whether the licence number printed on the letter matched an entry. */
  licenceNumberMatched?: boolean;
}

async function sourceFreshness(id: string): Promise<{ retrievedAt: string | null; stale: boolean; usable: boolean }> {
  const { rows: [s] } = await pool.query(
    `SELECT last_success_at, max_age_hours, row_count FROM verifyx_official_sources WHERE id=$1`, [id],
  );
  const at: Date | null = s?.last_success_at ?? null;
  const stale = !at || (s?.max_age_hours ? Date.now() - new Date(at).getTime() > s.max_age_hours * 3600_000 : false);
  return { retrievedAt: at ? new Date(at).toISOString() : null, stale, usable: !!at };
}

export async function lookupUkSponsor(name: string): Promise<RegistryLookupResult> {
  const base: RegistryLookupResult = { registryId: "uk_sponsor_register", queriedName: name, outcome: "unavailable", matches: [], retrievedAt: null, stale: true };
  try {
    const fresh = await sourceFreshness("uk_sponsor_register");
    base.retrievedAt = fresh.retrievedAt; base.stale = fresh.stale;
    const { rows: [cnt] } = await pool.query(`SELECT count(*)::int AS n FROM verifyx_employer_registry WHERE registry_id='uk_sponsor_register'`);
    if (!fresh.usable || (cnt?.n ?? 0) < 1000) return base;
    const norm = normalizeEmployerName(name);
    if (!norm || norm.length < 3) return { ...base, outcome: "no_match" };
    const { rows: exact } = await pool.query(
      `SELECT DISTINCT name, town, county, type_rating, route FROM verifyx_employer_registry
        WHERE registry_id='uk_sponsor_register' AND name_norm=$1 LIMIT 10`, [norm],
    );
    if (exact.length) {
      return { ...base, outcome: "match", matches: exact.map((r: any) => ({ name: r.name, town: r.town, county: r.county, typeRating: r.type_rating, route: r.route })) };
    }
    const { rows: close } = await pool.query(
      `SELECT name, town, type_rating, route, similarity(name_norm, $1) AS sim FROM verifyx_employer_registry
        WHERE registry_id='uk_sponsor_register' AND name_norm % $1
        ORDER BY sim DESC LIMIT 3`, [norm],
    ).catch(() => ({ rows: [] as any[] }));
    const good = close.filter((r: any) => Number(r.sim) >= 0.55);
    if (good.length) {
      return { ...base, outcome: "close_matches", matches: good.map((r: any) => ({ name: r.name, town: r.town, typeRating: r.type_rating, route: r.route })) };
    }
    return { ...base, outcome: "no_match" };
  } catch (err: any) {
    console.warn("[VerifyX] UK sponsor lookup failed:", err?.message);
    return base;
  }
}

let neaCache: { at: number; rows: Array<{ name: string; norm: string; licence: string | null; expiry: string | null; status: string | null }> } | null = null;

export async function lookupNeaAgency(name: string | null, licenceNumber: string | null): Promise<RegistryLookupResult | null> {
  if (!name && !licenceNumber) return null;
  const base: RegistryLookupResult = { registryId: "ke_nea_register", queriedName: name ?? licenceNumber ?? "", outcome: "unavailable", matches: [], retrievedAt: null, stale: true };
  try {
    const fresh = await sourceFreshness("ke_nea_register");
    base.retrievedAt = fresh.retrievedAt; base.stale = fresh.stale;
    if (!fresh.usable) return base;
    if (!neaCache || Date.now() - neaCache.at > 3600_000) {
      const { rows } = await pool.query(`SELECT agency_name, license_number, expiry_date, status_override FROM nea_agencies`);
      neaCache = {
        at: Date.now(),
        rows: rows.map((r: any) => ({
          name: r.agency_name, norm: normalizeEmployerName(r.agency_name),
          licence: r.license_number ? String(r.license_number).trim() : null,
          expiry: r.expiry_date ? new Date(r.expiry_date).toISOString().slice(0, 10) : null,
          status: r.status_override ?? null,
        })),
      };
    }
    const norm = normalizeEmployerName(name);
    const lic = (licenceNumber ?? "").replace(/\s+/g, "").toUpperCase();
    const byName = norm ? neaCache.rows.filter((r) => r.norm === norm) : [];
    const byLic = lic ? neaCache.rows.filter((r) => r.licence && r.licence.replace(/\s+/g, "").toUpperCase() === lic) : [];
    const hits = byName.length ? byName : byLic;
    if (!hits.length) return { ...base, outcome: "no_match" };
    return {
      ...base,
      outcome: "match",
      licenceNumberMatched: !!lic && hits.some((h) => h.licence && h.licence.replace(/\s+/g, "").toUpperCase() === lic),
      matches: hits.slice(0, 5).map((h) => ({ name: h.name, licenceNumber: h.licence, licenceExpiry: h.expiry, licenceStatus: h.status })),
    };
  } catch (err: any) {
    console.warn("[VerifyX] NEA lookup failed:", err?.message);
    return base;
  }
}

export interface DomainCheck {
  domain: string;
  resolved: boolean | null;   // null = lookup error (unknown)
  hasMx: boolean | null;
  checkedAt: string;
}

/** DNS-only check (no HTTP fetch → no SSRF surface). */
export async function checkEmailDomain(email: string | null | undefined): Promise<DomainCheck | null> {
  const domain = (email ?? "").split("@")[1]?.trim().toLowerCase();
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return null;
  const withTimeout = <T,>(p: Promise<T>, ms = 4000) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
  let hasMx: boolean | null = null;
  let resolved: boolean | null = null;
  try {
    const mx = await withTimeout(dns.resolveMx(domain));
    hasMx = mx.length > 0;
    resolved = true;
  } catch (e: any) {
    if (e?.code === "ENOTFOUND" || e?.code === "ENODATA") {
      hasMx = false;
      try { await withTimeout(dns.resolve(domain)); resolved = true; } catch (e2: any) { resolved = e2?.code === "ENOTFOUND" ? false : null; }
    }
  }
  return { domain, resolved, hasMx, checkedAt: new Date().toISOString() };
}

export { registrableDomain };
