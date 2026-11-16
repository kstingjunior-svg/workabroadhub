/**
 * Scam Intelligence Network — PRIVATE, admin-reviewed (2026-11).
 *
 * Tony: "compare new reports and checks against previous reports … recruiter
 * names, email domains, phone numbers, payment numbers/accounts, recurring
 * templates … alert admins. This must be a private, evidence-reviewed
 * intelligence system, not a public blacklist based on unverified
 * allegations."
 *
 * How it works
 *   • Every finished offer check is indexed into intel_indicators
 *     (phone / email / domain / payment account / recruiter or agency name /
 *     letter template hash). Values are normalised so "0712 345 678",
 *     "+254712345678" and an M-Pesa "254712345678" all match.
 *   • Matching runs against (a) earlier offer checks from OTHER customers and
 *     other files and (b) scam_report_contacts / scam_reports.
 *   • A match creates an intel_alerts row and a socket event to the admin
 *     room. Customers are told nothing.
 *   • Only when an admin marks an indicator "confirmed" does a future
 *     customer report carry a neutral note ("our review team linked this
 *     phone number to previously reviewed reports"). "false_positive" stops
 *     alerts for that indicator.
 *
 * Names are weak evidence: they are matched against scam reports only
 * (never between offer checks — many real customers check letters from the
 * same real employer) and never produce a customer-facing note.
 */
import { createHash } from "crypto";
import { pool } from "../db";
import { makeFinding, type Finding } from "../verifyx/evidence";
import { FREE_EMAIL } from "../verifyx/employer-findings";
import { registrableDomain } from "../verifyx/names";
import { nameTokens } from "../verifyx/forensics";

export type IndicatorKind = "phone" | "email" | "domain" | "payment_account" | "name" | "template";

export interface Indicator { kind: IndicatorKind; value: string; display: string }

export const KIND_LABEL: Record<IndicatorKind, string> = {
  phone: "phone / M-Pesa number", email: "email address", domain: "web / email domain",
  payment_account: "payment account", name: "recruiter or agency name", template: "letter template",
};

// ── Normalisation (PURE — unit tested) ──────────────────────────────────

export function normPhone(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = v.replace(/\D/g, "");
  if (d.length < 7 || d.length > 15) return null;
  return d.length >= 9 ? d.slice(-9) : d;
}
export function normEmail(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(v);
  return m ? m[0].toLowerCase() : null;
}
export function normDomain(v: string | null | undefined): string | null {
  if (!v) return null;
  const host = v.includes("@") ? v.split("@")[1] : v;
  const d = registrableDomain(host);
  if (!d || !d.includes(".") || FREE_EMAIL.has(d)) return null;
  return d;
}
export function normAccount(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return s.length >= 5 && /\d{4,}/.test(s) ? s : null;
}
const ORG_WORDS = /\b(ltd|limited|plc|inc|llc|llp|company|co|group|international|intl|agency|agencies|consultants?|consultancy|services|recruitment|recruiters?|manpower|the|and)\b/g;
export function normName(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9\s]/g, " ").replace(ORG_WORDS, " ").replace(/\s+/g, " ").trim();
  if (/^(unknown|none|nil|n a|na|not known|not sure|no name|anonymous)\b/.test(s)) return null;
  return s.length >= 4 ? s : null;
}
/**
 * Letter template fingerprint: the first ~120 words with digits, the
 * applicant's own name and page markers removed. Two letters that differ only
 * in name, dates and amounts get the same hash.
 */
export function templateHash(text: string | null | undefined, applicantNames: string[]): string | null {
  if (!text) return null;
  const drop = new Set(applicantNames.flatMap((n) => nameTokens(n)));
  const words = text.toLowerCase().replace(/=== page \d+ ===/g, " ").replace(/[^a-z\s]/g, " ").split(/\s+/)
    .filter((w) => w.length > 2 && !drop.has(w));
  if (words.length < 60) return null;
  return createHash("sha256").update(words.slice(0, 120).join(" ")).digest("hex").slice(0, 32);
}

/** Indicators from an offer-check extraction (PURE). */
export function indicatorsFromOffer(ex: any): Indicator[] {
  const f = ex?.fields ?? {};
  const out: Indicator[] = [];
  const add = (kind: IndicatorKind, value: string | null, display: string | null | undefined) => {
    if (value) out.push({ kind, value, display: String(display ?? value).slice(0, 160) });
  };
  add("phone", normPhone(f.recruiterPhone), f.recruiterPhone);
  add("email", normEmail(f.recruiterEmail), f.recruiterEmail);
  add("domain", normDomain(f.recruiterEmail), f.recruiterEmail ? f.recruiterEmail.split("@")[1] : null);
  add("domain", normDomain(f.companyWebsite), f.companyWebsite);
  const rn = nameTokens(f.recruiterName).length >= 2 ? normName(f.recruiterName) : null;
  add("name", rn, f.recruiterName);
  add("name", normName(f.recruitmentAgency), f.recruitmentAgency);
  for (const p of ex?.paymentRequests ?? []) {
    const ref = p?.accountRef ?? null;
    const ph = normPhone(ref);
    if (ph && /^\+?\d[\d\s-]{6,}$/.test(String(ref).trim())) add("phone", ph, ref);
    else add("payment_account", normAccount(ref), ref);
  }
  const em = ex?.recruiterEmailText ? normEmail(/^\s*from\s*:\s*(.+)$/im.exec(ex.recruiterEmailText)?.[1] ?? null) : null;
  add("email", em, em);
  add("domain", normDomain(em), em ? em.split("@")[1] : null);
  const names = (ex?.applicantMentions ?? []).map((m: any) => m?.name).filter(Boolean);
  add("template", templateHash(ex?.scannedText ?? f.fullText, names), "same wording as another letter");
  const seen = new Set<string>();
  return out.filter((i) => { const k = `${i.kind}:${i.value}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

// ── SQL: unified view of every indicator we hold ────────────────────────

/**
 * Rows: (k, v, st, sid, display, owner). "owner" groups submissions by the
 * same person (reporter IP/UA hash, or the customer account) so one person
 * filing twice is not counted as two independent sources. Scam-report identifiers are
 * normalised in SQL the same way as normPhone / normEmail / normDomain /
 * normAccount / normName above.
 */
export const UNIFIED_SQL = `
  SELECT CASE WHEN c.kind IN ('phone','whatsapp','mpesa') THEN 'phone'
              WHEN c.kind = 'email' THEN 'email'
              WHEN c.kind IN ('bank','crypto') THEN 'payment_account'
              WHEN c.kind = 'website' THEN 'domain' END AS k,
         CASE WHEN c.kind IN ('phone','whatsapp','mpesa') THEN
                CASE WHEN length(regexp_replace(c.normalized,'\\D','','g')) >= 9 THEN right(regexp_replace(c.normalized,'\\D','','g'), 9)
                     ELSE regexp_replace(c.normalized,'\\D','','g') END
              WHEN c.kind = 'email' THEN lower(c.normalized)
              WHEN c.kind IN ('bank','crypto') THEN lower(regexp_replace(c.normalized,'[^a-zA-Z0-9]','','g'))
              WHEN c.kind = 'website' THEN regexp_replace(split_part(lower(c.normalized),'/',1),'^www\\.','') END AS v,
         'scam_report'::text AS st, c.report_id::text AS sid, c.raw_value::text AS display,
         ('reporter:' || coalesce(sr.reporter_ip_hash, c.report_id::text))::text AS owner
    FROM scam_report_contacts c LEFT JOIN scam_reports sr ON sr.id = c.report_id
  UNION ALL
  SELECT 'domain', lower(split_part(c.normalized,'@',2)), 'scam_report', c.report_id::text, split_part(c.normalized,'@',2),
         'reporter:' || coalesce(sr.reporter_ip_hash, c.report_id::text)
    FROM scam_report_contacts c LEFT JOIN scam_reports sr ON sr.id = c.report_id
   WHERE c.kind = 'email' AND lower(split_part(c.normalized,'@',2)) <> ALL($FREE::text[])
  UNION ALL
  SELECT 'name', n.v, 'scam_report', r.id::text, raw.display::text, 'reporter:' || coalesce(r.reporter_ip_hash, r.id::text)
    FROM scam_reports r
    CROSS JOIN LATERAL (VALUES (r.agency_name), (r.employer_name)) AS raw(display)
    CROSS JOIN LATERAL (SELECT trim(regexp_replace(regexp_replace(regexp_replace(lower(replace(raw.display,'&',' and ')),'[^a-z0-9\\s]',' ','g'),
             '\\m(ltd|limited|plc|inc|llc|llp|company|co|group|international|intl|agency|agencies|consultants?|consultancy|services|recruitment|recruiters?|manpower|the|and)\\M',' ','g'),'\\s+',' ','g')) AS v) n
   WHERE raw.display IS NOT NULL AND length(n.v) >= 4 AND n.v !~ '^(unknown|none|nil|n a|na|not known|not sure|no name|anonymous)\\M'
  UNION ALL
  SELECT kind, value, source_type, source_id, display, owner FROM intel_indicators`;

function unified(): { sql: string; params: any[] } {
  return { sql: UNIFIED_SQL.replace("$FREE", "$1"), params: [[...FREE_EMAIL]] };
}

// ── Indexing a finished offer check ─────────────────────────────────────

export async function indexOfferCheck(requestId: string, extraction: any, riskLevel: string | null): Promise<number> {
  const inds = indicatorsFromOffer(extraction);
  if (!inds.length) return 0;
  const { rows: [req] } = await pool.query(`SELECT user_id, file_sha256 FROM verifyx_requests WHERE id=$1`, [requestId]);
  const owner = req?.user_id ? `user:${req.user_id}` : `file:${req?.file_sha256 ?? requestId}`;
  for (const i of inds) {
    await pool.query(
      `INSERT INTO intel_indicators (kind, value, display, source_type, source_id, owner, file_sha256)
       VALUES ($1,$2,$3,'offer_check',$4,$5,$6) ON CONFLICT (kind, value, source_type, source_id) DO NOTHING`,
      [i.kind, i.value, i.display, requestId, owner, req?.file_sha256 ?? null]);
  }
  return raiseAlerts("offer_check", requestId, owner, req?.file_sha256 ?? null, inds, riskLevel);
}

async function raiseAlerts(st: string, sid: string, owner: string, fileSha: string | null, inds: Indicator[], riskLevel: string | null): Promise<number> {
  const u = unified();
  let raised = 0;
  for (const i of inds) {
    const { rows: [rev] } = await pool.query(`SELECT status FROM intel_indicator_reviews WHERE kind=$1 AND value=$2`, [i.kind, i.value]);
    if (rev?.status === "false_positive") continue;
    const { rows } = await pool.query(
      `SELECT DISTINCT u.st, u.sid FROM (${u.sql}) u
        WHERE u.k = $2 AND u.v = $3 AND NOT (u.st = $4 AND u.sid = $5) AND u.owner <> $6
          AND ($2 <> 'name' OR u.st = 'scam_report')
          AND ($7::text IS NULL OR u.sid NOT IN (SELECT source_id FROM intel_indicators WHERE file_sha256 = $7))
        LIMIT 50`,
      [...u.params, i.kind, i.value, st, sid, owner, fileSha]);
    if (!rows.length) continue;
    const reports = rows.filter((r) => r.st === "scam_report").length;
    const checks = rows.filter((r) => r.st === "offer_check").length;
    await pool.query(
      `INSERT INTO intel_alerts (kind, value, display, source_type, source_id, matched_reports, matched_checks, matches, risk_level)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [i.kind, i.value, i.display, st, sid, reports, checks, JSON.stringify(rows), riskLevel]);
    raised++;
  }
  if (raised) {
    try {
      const { getIO } = await import("../socket");
      getIO().to("admin").emit("intel_alert", { count: raised, sourceType: st });
    } catch { /* socket not initialised in tests */ }
    console.log(`[intel] ${raised} new alert(s) from ${st} ${sid}`);
  }
  return raised;
}

// ── Customer-facing: only admin-CONFIRMED links ─────────────────────────

export async function confirmedIntelFindings(extraction: any, now = new Date()): Promise<Finding[]> {
  const inds = indicatorsFromOffer(extraction).filter((i) => i.kind !== "name" && i.kind !== "template");
  if (!inds.length) return [];
  const { rows } = await pool.query(
    `SELECT kind, value, reviewed_at FROM intel_indicator_reviews
      WHERE status='confirmed' AND (kind, value) IN (SELECT * FROM unnest($1::text[], $2::text[]))`,
    [inds.map((i) => i.kind), inds.map((i) => i.value)]);
  return rows.slice(0, 3).map((r: any) => {
    const ind = inds.find((i) => i.kind === r.kind && i.value === r.value)!;
    return makeFinding({
      code: "intel_confirmed_link", status: "potential_risk_indicator", priority: "high", checkedAt: now.toISOString(),
      title: `This ${KIND_LABEL[ind.kind as IndicatorKind]} is linked to earlier reviewed reports`,
      examined: `The ${KIND_LABEL[ind.kind as IndicatorKind]} in your document.`,
      documentSays: ind.display,
      evidenceSays: "Our review team examined earlier reports and checks that used the same detail and linked them together. This is WorkAbroadHub's own review, not a government or court finding.",
      whyItMatters: "The same contact or payment detail appearing in earlier reviewed cases is a strong reason to stop and check before paying anything.",
      howToVerify: "Do not pay. Contact the employer only through its official website, and check the agency on the NEA register. You can ask our team for details on WhatsApp +254 111 467 601.",
      uncertainty: "A shared detail can occasionally belong to someone unconnected — this is why it is a risk indicator, not a conclusion.",
      method: "human_review", check: { name: "intel_confirmed_link", version: 1, result: { kind: ind.kind, reviewedAt: r.reviewed_at } },
    });
  });
}

// ── Backfill (admin action) ─────────────────────────────────────────────

export async function backfillOfferChecks(limit = 500): Promise<{ indexed: number; alerts: number }> {
  const { rows } = await pool.query(
    `SELECT r.id, r.outcome FROM verifyx_requests r
      WHERE r.tool='offer_check' AND r.status='done' AND r.purged_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM intel_indicators i WHERE i.source_type='offer_check' AND i.source_id=r.id::text)
      ORDER BY r.created_at ASC LIMIT $1`, [limit]);
  let indexed = 0, alerts = 0;
  const { loadExtraction, loadReport } = await import("../verifyx/store");
  for (const r of rows) {
    const ex = await loadExtraction(r.id);
    if (!ex) continue;
    const rep: any = await loadReport(r.id).catch(() => null);
    alerts += await indexOfferCheck(r.id, ex, rep?.risk?.level ?? null);
    indexed++;
  }
  return { indexed, alerts };
}

// ── Admin queries ───────────────────────────────────────────────────────

export async function linkedIndicators(opts: { status?: string; kind?: string; limit?: number } = {}) {
  const u = unified();
  const params: any[] = [...u.params];
  const where: string[] = [];
  if (opts.kind) { params.push(opts.kind); where.push(`g.k = $${params.length}`); }
  if (opts.status) { params.push(opts.status); where.push(`coalesce(rv.status,'unreviewed') = $${params.length}`); }
  params.push(Math.min(500, opts.limit ?? 200));
  const { rows } = await pool.query(
    `WITH u AS (${u.sql}),
          g AS (
            SELECT k, v, min(display) AS display,
                   count(DISTINCT sid) FILTER (WHERE st='scam_report')::int AS reports,
                   count(DISTINCT sid) FILTER (WHERE st='offer_check')::int AS checks,
                   count(DISTINCT owner)::int AS owners,
                   array_agg(DISTINCT st || ':' || sid) AS sources
              FROM u WHERE k IS NOT NULL AND v IS NOT NULL AND length(v) >= 4
             GROUP BY k, v)
     SELECT g.*, coalesce(rv.status,'unreviewed') AS review_status, rv.notes, rv.reviewed_at
       FROM g LEFT JOIN intel_indicator_reviews rv ON rv.kind=g.k AND rv.value=g.v
      WHERE g.owners >= 2 AND (g.k <> 'name' OR g.reports >= 1)
        ${where.length ? "AND " + where.join(" AND ") : ""}
      ORDER BY (g.reports + g.checks) DESC, g.k LIMIT $${params.length}`, params);
  return rows;
}

export async function indicatorDetail(kind: string, value: string) {
  const u = unified();
  const { rows: src } = await pool.query(
    `SELECT DISTINCT st, sid, display FROM (${u.sql}) u WHERE u.k=$2 AND u.v=$3 LIMIT 100`, [...u.params, kind, value]);
  const reportIds = src.filter((s) => s.st === "scam_report").map((s) => s.sid);
  const checkIds = src.filter((s) => s.st === "offer_check").map((s) => s.sid);
  const [{ rows: reports }, { rows: checks }, { rows: [review] }] = await Promise.all([
    reportIds.length
      ? pool.query(`SELECT id, agency_name, employer_name, country, destination_country, amount_lost, currency, status, created_at,
                           left(description, 400) AS description
                      FROM scam_reports WHERE id = ANY($1::text[]) ORDER BY created_at DESC`, [reportIds])
      : Promise.resolve({ rows: [] as any[] }),
    checkIds.length
      ? pool.query(`SELECT id, reference_no, outcome, country_code, created_at FROM verifyx_requests WHERE id::text = ANY($1::text[]) ORDER BY created_at DESC`, [checkIds])
      : Promise.resolve({ rows: [] as any[] }),
    pool.query(`SELECT * FROM intel_indicator_reviews WHERE kind=$1 AND value=$2`, [kind, value]),
  ]);
  return { kind, value, label: KIND_LABEL[kind as IndicatorKind] ?? kind, review: review ?? null, reports, checks };
}

/** Called after a new scam report is saved: alert admins if it shares details with earlier checks/reports. */
export async function alertOnNewScamReport(reportId: string): Promise<number> {
  const u = unified();
  const { rows } = await pool.query(
    `SELECT DISTINCT k, v, min(display) AS display FROM (${u.sql}) u
      WHERE u.st='scam_report' AND u.sid=$2 AND k IS NOT NULL AND v IS NOT NULL AND length(v) >= 4 GROUP BY k, v`,
    [...u.params, reportId]);
  const inds: Indicator[] = rows.map((r: any) => ({ kind: r.k, value: r.v, display: r.display ?? r.v }));
  const { rows: [rep] } = await pool.query(`SELECT reporter_ip_hash FROM scam_reports WHERE id=$1`, [reportId]);
  const owner = `reporter:${rep?.reporter_ip_hash ?? reportId}`;
  return inds.length ? raiseAlerts("scam_report", reportId, owner, null, inds, null) : 0;
}
