/**
 * Platform statistics — the ONE source for every number shown publicly (2026-11).
 * Policy: docs/architecture/AUTHENTIC_DATA_POLICY.md
 *   REAL MEMBERS. REAL ACTIVITY. REAL SUBSCRIPTIONS. REAL STATISTICS.
 *
 * Every metric has a written definition (METRIC_DEFINITIONS) and a SQL source here.
 * Unavailable → null (the UI then shows neutral wording). Never a made-up fallback.
 * No personal data leaves this module — counts only.
 */
import { pool } from "../db";

/** Accounts that are not real members: staff/admin and obvious test/QA/demo addresses. */
export const INTERNAL_OR_TEST_USER_SQL = `(
  u.is_admin = true OR u.role IN ('ADMIN','SUPER_ADMIN')
  OR u.email ~* '(^test([0-9]*|[._+-][^@]*)@|[+]test@|^qa[0-9]*@|^demo@|@example\\.(com|org)$|@test\\.|@wah\\.test$|mailinator\\.|@workabroadhub\\.tech$)'
)`;
/** Real member = not deleted, not deactivated, not internal/test. */
export const MEMBER_SQL = `(u.deleted_at IS NULL AND COALESCE(u.is_active, true) = true AND NOT ${INTERNAL_OR_TEST_USER_SQL})`;

/** A verified, successful plan payment, counted once per receipt (duplicate callbacks collapse). */
const VERIFIED_PLAN_PAYMENTS_SQL = `
  SELECT DISTINCT ON (COALESCE(p.receipt_norm, upper(p.mpesa_receipt_number), p.transaction_ref, p.id::text))
         COALESCE(p.matched_user_id, p.user_id) AS uid, p.service_id, p.amount, p.created_at
    FROM payments p
    JOIN users u ON u.id = COALESCE(p.matched_user_id, p.user_id)
   WHERE p.status IN ('success','completed') AND p.service_id LIKE 'plan\\_%'
     AND NOT ${INTERNAL_OR_TEST_USER_SQL}
   ORDER BY COALESCE(p.receipt_norm, upper(p.mpesa_receipt_number), p.transaction_ref, p.id::text), p.created_at`;

export const METRIC_DEFINITIONS = {
  registeredMembers: "Accounts that are not deleted or deactivated, excluding staff/admin and test accounts (users table).",
  verifiedMembers: "Registered members who confirmed their email address.",
  activeSubscribers: "Members with an active, unexpired paid subscription right now (user_subscriptions).",
  newPayingMembers7d: "Members whose FIRST verified plan payment happened in the last 7 days. Each M-Pesa/PayPal receipt counted once; failed, pending and cancelled payments excluded; renewals excluded; staff/test excluded.",
  agenciesOnRegister: "Recruitment agencies on the NEA public register as of our last check (excludes records NEA no longer lists).",
  agenciesExpiredOnRegister: "Agencies on the current NEA register whose licence is marked expired or whose expiry date has passed.",
  agenciesRevokedOnRegister: "Agencies on the current NEA register whose licence is marked revoked.",
  agenciesNoLongerListed: "Older records in our database that NEA no longer lists — status unknown, not counted as expired.",
  scamReports30d: "Community scam reports approved by our team in the last 30 days.",
  countriesWithPortals: "Active destination-country pages that have at least one verified job portal.",
  onlineNow: "Signed-in members with a heartbeat in the last 10 minutes (active_sessions).",
} as const;

export interface PublicStats {
  registeredMembers: number | null;
  verifiedMembers: number | null;
  activeSubscribers: number | null;
  newPayingMembers7d: number | null;
  agenciesOnRegister: number | null;
  agenciesExpiredOnRegister: number | null;
  agenciesRevokedOnRegister: number | null;
  agenciesNoLongerListed: number | null;
  agencyDataCheckedAt: string | null;
  scamReports30d: number | null;
  countriesWithPortals: number | null;
  onlineNow: number | null;
  generatedAt: string;
}

async function one<T = number>(sql: string, params: any[] = [], key = "n"): Promise<T | null> {
  try { const { rows } = await pool.query(sql, params); const v = rows[0]?.[key]; return v == null ? null : (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v) as T; }
  catch (e: any) { console.warn("[platform-stats]", e?.message); return null; }
}

let cache: { at: number; data: PublicStats } | null = null;
const TTL_MS = 60_000;

export async function getPublicStats(force = false): Promise<PublicStats> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const [registeredMembers, verifiedMembers, activeSubscribers, newPayingMembers7d, agencies, scamReports30d, countriesWithPortals, onlineNow] = await Promise.all([
    one(`SELECT count(*)::int n FROM users u WHERE ${MEMBER_SQL}`),
    one(`SELECT count(*)::int n FROM users u WHERE ${MEMBER_SQL} AND u.email_verified = true`),
    one(`SELECT count(DISTINCT s.user_id)::int n FROM user_subscriptions s JOIN users u ON u.id = s.user_id
          WHERE s.status = 'active' AND (s.end_date IS NULL OR s.end_date > now()) AND COALESCE(s.plan,'free') <> 'free' AND ${MEMBER_SQL}`),
    one(`WITH v AS (${VERIFIED_PLAN_PAYMENTS_SQL}), firsts AS (SELECT uid, min(created_at) f FROM v GROUP BY uid)
          SELECT count(*)::int n FROM firsts WHERE f > now() - interval '7 days'`),
    (async () => { try {
      const { rows: [r] } = await pool.query(`
        SELECT count(*) FILTER (WHERE COALESCE(status_override,'') <> 'unlisted')::int on_register,
               count(*) FILTER (WHERE COALESCE(status_override,'') <> 'unlisted' AND status_override IS DISTINCT FROM 'revoked'
                                 AND (status_override = 'expired' OR expiry_date < now()))::int expired,
               count(*) FILTER (WHERE status_override = 'revoked')::int revoked,
               count(*) FILTER (WHERE status_override = 'unlisted')::int unlisted,
               max(last_updated) FILTER (WHERE COALESCE(status_override,'') <> 'unlisted') checked_at
          FROM nea_agencies WHERE is_published = true`);
      return r ?? null; } catch (e: any) { console.warn("[platform-stats] agencies", e?.message); return null; } })(),
    one(`SELECT count(*)::int n FROM scam_reports WHERE status = 'approved' AND created_at > now() - interval '30 days'`),
    one(`SELECT count(DISTINCT c.id)::int n FROM countries c JOIN job_links j ON j.country_id = c.id AND j.is_active WHERE c.is_active`),
    one(`SELECT count(*)::int n FROM active_sessions WHERE is_online = true AND last_seen > now() - interval '10 minutes'`),
  ]);
  const data: PublicStats = {
    registeredMembers, verifiedMembers, activeSubscribers, newPayingMembers7d,
    agenciesOnRegister: agencies?.on_register ?? null,
    agenciesExpiredOnRegister: agencies?.expired ?? null,
    agenciesRevokedOnRegister: agencies?.revoked ?? null,
    agenciesNoLongerListed: agencies?.unlisted ?? null,
    agencyDataCheckedAt: agencies?.checked_at ? new Date(agencies.checked_at).toISOString() : null,
    scamReports30d,
    countriesWithPortals: countriesWithPortals && countriesWithPortals > 0 ? countriesWithPortals : null,
    onlineNow,
    generatedAt: new Date().toISOString(),
  };
  cache = { at: Date.now(), data };
  return data;
}

export function invalidatePublicStats() { cache = null; }

// ── Admin: date-ranged metrics + integrity checks ───────────────────────────
export interface RangeArgs { from: Date; to: Date }

export async function getAdminStats({ from, to }: RangeArgs) {
  const p = [from.toISOString(), to.toISOString()];
  const q = async (sql: string) => { try { return (await pool.query(sql, p)).rows; } catch (e: any) { console.warn("[admin-stats]", e?.message); return null; } };
  const [members, subs, payments, newPaying, tools, agencies, jobs, regsByDay] = await Promise.all([
    q(`SELECT count(*) FILTER (WHERE ${MEMBER_SQL})::int registered_total,
              count(*) FILTER (WHERE ${MEMBER_SQL} AND u.email_verified)::int verified_total,
              count(*) FILTER (WHERE ${MEMBER_SQL} AND u.created_at >= $1 AND u.created_at < $2)::int new_registrations,
              count(*) FILTER (WHERE u.deleted_at IS NOT NULL)::int deleted_total,
              count(*) FILTER (WHERE ${INTERNAL_OR_TEST_USER_SQL})::int internal_or_test_total
         FROM users u`),
    q(`SELECT COALESCE(s.plan,'?') plan, count(DISTINCT s.user_id)::int active
         FROM user_subscriptions s JOIN users u ON u.id = s.user_id
        WHERE s.status='active' AND (s.end_date IS NULL OR s.end_date > now()) AND COALESCE(s.plan,'free') <> 'free' AND ${MEMBER_SQL}
        GROUP BY 1 ORDER BY 2 DESC`),
    q(`SELECT CASE WHEN p.status IN ('success','completed') THEN 'successful'
                   WHEN p.status IN ('failed','cancelled','timeout','expired') THEN 'failed_or_cancelled'
                   WHEN p.status IN ('refunded','reversed') THEN 'refunded_or_reversed'
                   ELSE 'pending_or_other' END AS bucket,
              count(*)::int rows,
              count(DISTINCT COALESCE(p.receipt_norm, upper(p.mpesa_receipt_number), p.transaction_ref, p.id::text))::int unique_receipts,
              COALESCE(sum(p.amount) FILTER (WHERE p.status IN ('success','completed')),0)::bigint gross_rows_kes
         FROM payments p WHERE p.created_at >= $1 AND p.created_at < $2 GROUP BY 1 ORDER BY 1`),
    q(`WITH v AS (${VERIFIED_PLAN_PAYMENTS_SQL}), firsts AS (SELECT uid, min(created_at) f FROM v GROUP BY uid),
            inrange AS (SELECT * FROM v WHERE created_at >= $1 AND created_at < $2)
       SELECT (SELECT count(*) FROM firsts WHERE f >= $1 AND f < $2)::int new_paying_members,
              (SELECT count(*) FROM inrange)::int verified_plan_payments_unique,
              (SELECT COALESCE(sum(amount),0) FROM inrange)::bigint verified_plan_revenue_kes,
              (SELECT count(*) FILTER (WHERE service_id='plan_monthly') FROM inrange)::int monthly,
              (SELECT count(*) FILTER (WHERE service_id IN ('plan_pro','plan_yearly','plan_pro_referral')) FROM inrange)::int yearly,
              (SELECT count(*) FILTER (WHERE service_id='plan_trial') FROM inrange)::int trial`),
    q(`SELECT tool_name, count(*)::int uses FROM tool_usage WHERE created_at >= $1 AND created_at < $2 GROUP BY 1 ORDER BY 2 DESC LIMIT 15`),
    q(`SELECT COALESCE(status_override,'(none)') status, count(*)::int n,
              count(*) FILTER (WHERE expiry_date < now())::int past_expiry FROM nea_agencies WHERE is_published GROUP BY 1 ORDER BY 2 DESC`),
    q(`SELECT 'kazi_karibu' src, count(*) FILTER (WHERE moderation_state='live' AND expires_at > now())::int live,
              count(*) FILTER (WHERE published_at >= $1 AND published_at < $2)::int published_in_range FROM kazi_karibu_posts
       UNION ALL
       SELECT 'kenyan_jobs', count(*) FILTER (WHERE status='open')::int,
              count(*) FILTER (WHERE COALESCE(published_at, created_at) >= $1 AND COALESCE(published_at, created_at) < $2)::int FROM local_jobs`),
    q(`SELECT (u.created_at AT TIME ZONE 'Africa/Nairobi')::date d, count(*)::int n FROM users u
        WHERE ${MEMBER_SQL} AND u.created_at >= $1 AND u.created_at < $2 GROUP BY 1 ORDER BY 1`),
  ]);
  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    definitions: METRIC_DEFINITIONS,
    members: members?.[0] ?? null,
    activeSubscribersByPlan: subs,
    payments, newPaying: newPaying?.[0] ?? null,
    toolUsage: tools, agencies, jobs, registrationsByDay: regsByDay,
  };
}

export async function getIntegrityChecks() {
  const q = async (label: string, sql: string, hint: string) => {
    try { const { rows } = await pool.query(sql); return { label, count: Number(rows[0]?.n ?? 0), hint }; }
    catch (e: any) { return { label, count: null as number | null, hint: `check failed: ${e?.message}` }; }
  };
  return Promise.all([
    q("Duplicate successful payments (same receipt)", `
      SELECT count(*)::int n FROM (SELECT COALESCE(receipt_norm, upper(mpesa_receipt_number)) r FROM payments
        WHERE status IN ('success','completed') AND COALESCE(receipt_norm, mpesa_receipt_number) IS NOT NULL GROUP BY 1 HAVING count(*) > 1) x`,
      "One M-Pesa receipt stored as 2+ successful payments. Public stats count it once; finance totals that sum rows are overstated."),
    q("Members with 2+ active subscriptions at once", `
      SELECT count(*)::int n FROM (SELECT user_id FROM user_subscriptions WHERE status='active' AND (end_date IS NULL OR end_date > now())
        GROUP BY 1 HAVING count(*) > 1) x`, "Possible duplicate activation from a repeated callback."),
    q("Active subscriptions already past their end date", `
      SELECT count(*)::int n FROM user_subscriptions WHERE status='active' AND end_date < now()`, "Expiry sweep lag; getUserPlan() still treats them as expired."),
    q("Payments dated in the future", `SELECT count(*)::int n FROM payments WHERE created_at > now() + interval '1 hour'`, "Invalid timestamps."),
    q("Successful payments by staff/test accounts", `
      SELECT count(*)::int n FROM payments p JOIN users u ON u.id = COALESCE(p.matched_user_id, p.user_id)
       WHERE p.status IN ('success','completed') AND ${INTERNAL_OR_TEST_USER_SQL}`, "Excluded from all public and admin revenue metrics above."),
    q("Agency records with impossible expiry dates", `
      SELECT count(*)::int n FROM nea_agencies WHERE is_published AND (expiry_date < '2000-01-01' OR expiry_date > now() + interval '15 years')`, "Data-entry errors."),
    q("Duplicate agency licence numbers", `
      SELECT count(*)::int n FROM (SELECT upper(regexp_replace(license_number,'\\s','','g')) l FROM nea_agencies
        WHERE is_published AND license_number IS NOT NULL GROUP BY 1 HAVING count(*) > 1) x`, "Same licence stored twice."),
    q("Agency register not refreshed in 14 days", `
      SELECT CASE WHEN max(last_updated) < now() - interval '14 days' THEN 1 ELSE 0 END::int n
        FROM nea_agencies WHERE is_published AND COALESCE(status_override,'') <> 'unlisted'`, "Public agency figures would be stale."),
  ]);
}
