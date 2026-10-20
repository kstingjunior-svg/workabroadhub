/**
 * Kenya Careers employer directory — server-side filtering + paging, and
 * signed follow (unsubscribe) tokens.
 *
 * 2026-10 (Tony: "Redesign the Kenyan Jobs employer directory"). Pure
 * functions so they can be unit-tested without a database.
 *
 * Listing types (never blurred together in the UI):
 *   verified   — companies.verified_at set by admin claim approval
 *   registered — has a company admin or a live (non-seed) posting
 *   invited    — in our directory only; hasn't joined, no vacancies
 */
import crypto from "crypto";

export const DIRECTORY_PAGE_SIZE_MAX = 48;

/** Industry chips → ILIKE patterns on companies.industry. */
export const DIRECTORY_CHIPS: Record<string, { label: string; patterns: string[]; schools?: boolean }> = {
  retail:        { label: "Retail",            patterns: ["%retail%", "%supermarket%"] },
  banking:       { label: "Banking",           patterns: ["%bank%", "%financ%"] },
  healthcare:    { label: "Healthcare",        patterns: ["%health%", "%hospital%", "%medical%"] },
  hospitality:   { label: "Hospitality",       patterns: ["%hospitality%", "%hotel%", "%restaurant%"] },
  telecom:       { label: "Telecom",           patterns: ["%telecom%"] },
  security:      { label: "Security",          patterns: ["%security%"] },
  manufacturing: { label: "Manufacturing",     patterns: ["%manufactur%"] },
  education:     { label: "Education",         patterns: ["%educat%"], schools: true },
  transport:     { label: "Transport",         patterns: ["%transport%", "%logistic%"] },
  energy:        { label: "Energy",            patterns: ["%energy%", "%fuel%", "%oil%"] },
  construction:  { label: "Construction",      patterns: ["%construct%"] },
  ngo:           { label: "NGOs & Government", patterns: ["%ngo%", "%non-profit%", "%government%", "%public sector%"] },
};

/** SQL boolean: company is "live" (has an admin or a live posting). Uses alias `c`. */
export const LIVE_COMPANY_SQL = `(EXISTS (SELECT 1 FROM company_admins ca WHERE ca.company_id = c.id)
      OR EXISTS (SELECT 1 FROM local_jobs lj WHERE lj.company_id = c.id AND COALESCE(lj.is_seed, false) = false))`;

export interface DirectoryQuery {
  search?: string; county?: string; industry?: string; category?: string;
  /** invited = not yet joined; hiring = registered or verified; all = both */
  status?: "invited" | "hiring" | "all";
  page?: number; pageSize?: number;
}

export interface NormalisedDirectoryQuery {
  search: string | null; county: string | null; industry: string | null; category: string | null;
  status: "invited" | "hiring" | "all"; page: number; pageSize: number;
}

const clean = (v: unknown, max: number) => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  return s && s !== "all" ? s : null;
};

export function normaliseDirectoryQuery(q: Record<string, unknown>): NormalisedDirectoryQuery {
  const status = q.status === "invited" || q.status === "hiring" ? q.status : "all";
  const category = clean(q.category, 30);
  const page = Math.max(1, Math.floor(Number(q.page) || 1));
  const pageSize = Math.min(DIRECTORY_PAGE_SIZE_MAX, Math.max(1, Math.floor(Number(q.pageSize) || 12)));
  return {
    search: clean(q.search, 80),
    county: clean(q.county, 40),
    industry: clean(q.industry, 80),
    category: category && DIRECTORY_CHIPS[category] ? category : null,
    status, page, pageSize,
  };
}

/** Builds the WHERE clause (alias `c` = companies) + positional params. */
export function buildDirectoryWhere(q: NormalisedDirectoryQuery): { where: string; params: any[] } {
  const conds: string[] = ["c.status = 'approved'"];
  const params: any[] = [];
  const p = (v: any) => { params.push(v); return `$${params.length}`; };

  if (q.search) {
    const term = p(`%${q.search.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
    conds.push(`(c.name ILIKE ${term} OR COALESCE(c.industry, '') ILIKE ${term})`);
  }
  if (q.county) {
    const cty = p(q.county);
    conds.push(`(c.county = ${cty} OR EXISTS (SELECT 1 FROM branches b WHERE b.company_id = c.id AND b.county = ${cty}))`);
  }
  if (q.industry) conds.push(`c.industry = ${p(q.industry)}`);
  if (q.category) {
    const chip = DIRECTORY_CHIPS[q.category];
    const pats = p(chip.patterns);
    conds.push(chip.schools
      ? `(COALESCE(c.industry, '') ILIKE ANY(${pats}) OR c.institution_type = 'school')`
      : `COALESCE(c.industry, '') ILIKE ANY(${pats})`);
  }
  if (q.status === "invited") conds.push(`NOT ${LIVE_COMPANY_SQL}`);
  if (q.status === "hiring")  conds.push(LIVE_COMPANY_SQL);
  return { where: conds.join(" AND "), params };
}

export function listingTypeOf(row: { verified_at?: Date | string | null; is_live?: boolean | null }): "verified" | "registered" | "invited" {
  if (row.verified_at) return "verified";
  return row.is_live ? "registered" : "invited";
}

/* ── Signed follow tokens (one-click unfollow links in emails) ───────── */

function followSecret(): string {
  return process.env.FOLLOW_TOKEN_SECRET || process.env.SESSION_SECRET || "wah-follow-dev-secret";
}

export function signFollowToken(signupId: string): string {
  const mac = crypto.createHmac("sha256", followSecret()).update(`follow:${signupId}`).digest("base64url").slice(0, 32);
  return `${signupId}.${mac}`;
}

export function verifyFollowToken(token: string): string | null {
  const [id, mac] = String(token || "").split(".");
  if (!id || !mac || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const expected = signFollowToken(id).split(".")[1];
  const a = Buffer.from(mac), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? id : null;
}
