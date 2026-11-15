/**
 * Live activity feed — REAL usage only.
 *
 * 2026-11 (Tony): replace every invented "someone in Kisumu just…" ticker
 * with what actually happened on the platform, newest first.
 *
 * Sources (all real rows):
 *   - payments completed for a tool / service / plan  → the buyer is known,
 *     shown as initials + country ("A. M. · Kenya"). The purchase type comes
 *     from service_id, never guessed from the amount.
 *   - tool_usage ats_cv_checker / cv_templates          → anonymous usage,
 *     shown as "Someone".
 *   - scam_reports submitted                            → "Someone reported a
 *     suspicious agency" (submitted, not "confirmed scam").
 *
 * Privacy: no full names, user ids, emails, phones, amounts, document
 * contents or results ever leave the server. Initials + country only, and a
 * user can opt out (users.show_in_activity = false).
 */
import { pool } from "../db";

export interface LiveActivityItem {
  id: string;
  who: string;            // "A. M." or "Someone"
  where: string | null;   // "Kenya", "UAE"… or null
  action: string;         // "screened a job offer letter"
  kind: "visa" | "offer" | "scam" | "ielts" | "cv" | "plan" | "service" | "report";
  at: string;             // ISO, rounded to the minute
}

const SERVICE_ACTIONS: Record<string, { action: string; kind: LiveActivityItem["kind"] }> = {
  tool_visa_check:      { action: "screened a visa", kind: "visa" },
  tool_offer_check:     { action: "screened a job offer letter", kind: "offer" },
  tool_job_scam_check:  { action: "checked a job ad for scams", kind: "scam" },
  tool_ielts_verify:    { action: "checked an IELTS result", kind: "ielts" },
  cv_fix_lite:          { action: "got their CV fixed for ATS", kind: "cv" },
  ats_cover_bundle:     { action: "got an ATS CV + cover letter", kind: "cv" },
  ats_cv_optimization:  { action: "got their CV optimised for ATS", kind: "cv" },
  cv_rewrite:           { action: "got their CV rewritten", kind: "cv" },
  cover_letter:         { action: "got a cover letter written", kind: "service" },
  write_from_scratch:   { action: "had a CV written from scratch", kind: "cv" },
  sop_writing:          { action: "got a statement of purpose written", kind: "service" },
  plan_monthly:         { action: "joined Monthly access", kind: "plan" },
  plan_pro:             { action: "joined Yearly access", kind: "plan" },
  plan_yearly:          { action: "joined Yearly access", kind: "plan" },
};

const COUNTRY: Record<string, string> = {
  KE: "Kenya", AE: "UAE", SA: "Saudi Arabia", QA: "Qatar", KW: "Kuwait", OM: "Oman", BH: "Bahrain",
  GB: "UK", UK: "UK", US: "USA", CA: "Canada", AU: "Australia", DE: "Germany", UG: "Uganda", TZ: "Tanzania",
  RW: "Rwanda", NG: "Nigeria", GH: "Ghana", ZA: "South Africa", IE: "Ireland", NZ: "New Zealand", PL: "Poland",
};

export function initialsOf(first?: string | null, last?: string | null): string {
  const clean = (s?: string | null) => String(s ?? "").trim().replace(/[^\p{L}\s'-]/gu, "");
  const f = clean(first), l = clean(last);
  const parts = [f.split(/\s+/)[0], (l || f.split(/\s+/).slice(1).join(" ")).split(/\s+/).pop()]
    .filter((p): p is string => !!p && p.length > 0);
  if (!parts.length) return "Someone";
  return parts.map((p) => p[0]!.toUpperCase() + ".").join(" ");
}

export function countryName(code?: string | null): string | null {
  const c = String(code ?? "").trim().toUpperCase();
  if (!c) return null;
  return COUNTRY[c] ?? null;
}

const minuteIso = (d: Date | string) => {
  const t = new Date(d); t.setSeconds(0, 0); return t.toISOString();
};

export interface RawPaymentRow { id: string; payer?: string | null; service: string | null; first_name: string | null; last_name: string | null; country: string | null; at: Date | string }
export interface RawAnonRow { id: string; kind: "ats" | "template" | "report"; at: Date | string }

/** Pure merge — exported for tests. */
export function buildLiveActivity(payments: RawPaymentRow[], anon: RawAnonRow[], limit = 40): LiveActivityItem[] {
  const items: LiveActivityItem[] = [];
  const seen = new Map<string, number>();
  for (const p of payments) {
    const meta = p.service ? SERVICE_ACTIONS[p.service] : undefined;
    if (!meta) continue; // unknown purchase type → never guess
    // The same person buying the same thing twice within 15 minutes is a
    // retry/echo, not two events — show it once.
    const t = new Date(p.at).getTime();
    const key = `${p.payer ?? p.id}|${p.service}`;
    const prev = seen.get(key);
    if (prev !== undefined && Math.abs(prev - t) < 15 * 60_000) continue;
    seen.set(key, t);
    items.push({ id: `p:${p.id}`, who: initialsOf(p.first_name, p.last_name), where: countryName(p.country), action: meta.action, kind: meta.kind, at: minuteIso(p.at) });
  }
  for (const a of anon) {
    const m = a.kind === "ats" ? { action: "checked their CV against ATS filters", kind: "cv" as const }
      : a.kind === "template" ? { action: "downloaded a CV template", kind: "cv" as const }
      : { action: "reported a suspicious agency", kind: "report" as const };
    items.push({ id: `${a.kind}:${a.id}`, who: "Someone", where: null, action: m.action, kind: m.kind, at: minuteIso(a.at) });
  }
  items.sort((x, y) => y.at.localeCompare(x.at));
  return items.slice(0, limit);
}

export async function loadLiveActivity(): Promise<{ items: LiveActivityItem[]; counts: Record<string, number> }> {
  const [pay, ats, tpl, rep, counts] = await Promise.all([
    pool.query<RawPaymentRow>(`
      SELECT p.id::text AS id, COALESCE(p.service_id, CASE WHEN p.plan_id IS NOT NULL THEN 'plan_' || p.plan_id END) AS service,
             CASE WHEN COALESCE(u.show_in_activity, TRUE) THEN u.first_name END AS first_name,
             CASE WHEN COALESCE(u.show_in_activity, TRUE) THEN u.last_name END AS last_name,
             COALESCE(u.country_iso, u.country, CASE WHEN p.phone LIKE '254%' OR p.phone LIKE '+254%' OR p.phone LIKE '07%' OR p.phone LIKE '01%' THEN 'KE' END) AS country,
             COALESCE(u.id, p.phone, p.email, p.id::text) AS payer,
             p.created_at AS at
        FROM payments p
        LEFT JOIN LATERAL (
          SELECT id, first_name, last_name, country, country_iso, show_in_activity FROM users x
           WHERE x.id = p.user_id OR (p.user_id IS NULL AND p.email IS NOT NULL AND lower(x.email) = lower(p.email))
           ORDER BY (x.id = p.user_id) DESC NULLS LAST LIMIT 1
        ) u ON TRUE
       WHERE p.status IN ('completed','success')
         AND p.created_at > NOW() - INTERVAL '30 days'
         AND COALESCE(p.reconciliation_status, '') NOT IN ('duplicate','admin_grant')
       ORDER BY p.created_at DESC LIMIT 60`),
    pool.query<{ id: string; at: Date }>(`SELECT id::text, created_at AS at FROM tool_usage WHERE tool_name = 'ats_cv_checker' ORDER BY created_at DESC LIMIT 12`),
    pool.query<{ id: string; at: Date }>(`SELECT id::text, created_at AS at FROM tool_usage WHERE tool_name = 'cv_templates' ORDER BY created_at DESC LIMIT 4`),
    pool.query<{ id: string; at: Date }>(`SELECT id::text, created_at AS at FROM scam_reports WHERE created_at > NOW() - INTERVAL '30 days' ORDER BY created_at DESC LIMIT 4`),
    pool.query<{ k: string; n: string }>(`
      SELECT 'cvChecks' k, count(*)::text n FROM tool_usage WHERE tool_name = 'ats_cv_checker'
      UNION ALL SELECT 'scamChecks', ((SELECT count(*) FROM tool_usage WHERE tool_name = 'job_scam_checker')
                                    + (SELECT count(*) FROM payments WHERE service_id = 'tool_job_scam_check' AND status IN ('completed','success')))::text
      UNION ALL SELECT 'visaScreens', ((SELECT count(*) FROM visa_checks) + (SELECT count(*) FROM verifyx_requests WHERE tool = 'visa_check' AND status = 'done'))::text
      UNION ALL SELECT 'offerScreens', ((SELECT count(*) FROM offer_letter_checks) + (SELECT count(*) FROM verifyx_requests WHERE tool = 'offer_check' AND status = 'done'))::text
      UNION ALL SELECT 'last24h', ((SELECT count(*) FROM tool_usage WHERE created_at > NOW() - INTERVAL '24 hours')
                                 + (SELECT count(*) FROM payments WHERE status IN ('completed','success') AND created_at > NOW() - INTERVAL '24 hours'))::text`),
  ]);
  const anon: RawAnonRow[] = [
    ...ats.rows.map((r) => ({ id: r.id, kind: "ats" as const, at: r.at })),
    ...tpl.rows.map((r) => ({ id: r.id, kind: "template" as const, at: r.at })),
    ...rep.rows.map((r) => ({ id: r.id, kind: "report" as const, at: r.at })),
  ];
  return {
    items: buildLiveActivity(pay.rows, anon),
    counts: Object.fromEntries(counts.rows.map((r) => [r.k, Number(r.n)])),
  };
}
