// ─────────────────────────────────────────────────────────────────────────────
// Admin KPI Snapshot — gives Nanjila eyes on the business when she's talking
// to an admin.
//
// User intent: 'I want her to fully represent me and replace me... she can
// even check the admin's boards, look at the revenue, get to know what is
// working, what is not working.'
//
// When a verified-admin user chats with Nanjila, this module runs and injects
// a compact KPI block into her system prompt — last-7d revenue, last-30d
// revenue, top services, abandoned-cart count, pending-payment count,
// signups, most-viewed countries. She can then answer business questions
// directly: 'Revenue this week is KES 12,400 — up 18% on last week. CV Fix
// Lite is your #1 seller at 47 units. UAE dashboard is the most-viewed.'
//
// Read-only — Nanjila has no power to mutate. Falls open: if any query
// fails, returns an empty summary string.
// ─────────────────────────────────────────────────────────────────────────────

import { pool } from "../db";

export interface AdminKpiSnapshot {
  asText: string;
  isEmpty: boolean;
}

export async function buildAdminKpiSnapshot(): Promise<AdminKpiSnapshot> {
  const lines: string[] = ["▸ Business snapshot (you are the founder — Nanjila has read-only KPI access):"];
  let hadAnyData = false;

  // 1. Revenue — last 7 days vs last 30 days
  try {
    const { rows } = await pool.query<{
      revenue_7d:  number | null;
      revenue_30d: number | null;
      paid_users_7d: number | null;
      paid_users_30d: number | null;
    }>(`
      SELECT
        COALESCE(SUM(CASE WHEN created_at > NOW() - INTERVAL '7  days' THEN amount END), 0)::int AS revenue_7d,
        COALESCE(SUM(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN amount END), 0)::int AS revenue_30d,
        COUNT(DISTINCT CASE WHEN created_at > NOW() - INTERVAL '7  days' THEN user_id END)::int AS paid_users_7d,
        COUNT(DISTINCT CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN user_id END)::int AS paid_users_30d
      FROM payments
      WHERE status IN ('completed','success')
    `);
    const r = rows[0];
    if (r) {
      lines.push(`   • Revenue last 7 days: KES ${(r.revenue_7d ?? 0).toLocaleString("en-KE")} (${r.paid_users_7d ?? 0} paying users)`);
      lines.push(`   • Revenue last 30 days: KES ${(r.revenue_30d ?? 0).toLocaleString("en-KE")} (${r.paid_users_30d ?? 0} paying users)`);
      hadAnyData = true;
    }
  } catch (e: any) {
    console.warn("[Nanjila KPI] revenue query failed:", e?.message);
  }

  // 2. Top 5 selling services in the last 30 days
  try {
    const { rows } = await pool.query<{
      name: string;
      sales: number;
      revenue: number;
    }>(`
      SELECT
        COALESCE(s.name, p.service_name, p.service_id, 'Unknown') AS name,
        COUNT(*)::int       AS sales,
        SUM(p.amount)::int  AS revenue
      FROM payments p
      LEFT JOIN services s ON s.slug = p.service_id OR s.code = p.service_id
      WHERE p.status IN ('completed','success')
        AND p.created_at > NOW() - INTERVAL '30 days'
        AND (p.plan_id IS NULL OR p.plan_id = '')
      GROUP BY name
      ORDER BY revenue DESC
      LIMIT 5
    `);
    if (rows.length > 0) {
      lines.push(`   • Top services (last 30d):`);
      for (const r of rows) {
        lines.push(`     – ${r.name}: ${r.sales} sales · KES ${r.revenue.toLocaleString("en-KE")}`);
      }
      hadAnyData = true;
    }
  } catch (e: any) {
    console.warn("[Nanjila KPI] top services query failed:", e?.message);
  }

  // 3. Funnel health — signups vs paid conversion in 30d
  try {
    const { rows: [s] } = await pool.query<{
      signups_30d: number;
      paid_users_total: number;
    }>(`
      SELECT
        (SELECT COUNT(*)::int FROM users WHERE created_at > NOW() - INTERVAL '30 days')                     AS signups_30d,
        (SELECT COUNT(*)::int FROM users WHERE plan IS NOT NULL AND plan <> 'free' AND subscription_status = 'active') AS paid_users_total
    `);
    if (s) {
      lines.push(`   • Signups (30d): ${s.signups_30d}   |   Total active paying users: ${s.paid_users_total}`);
      hadAnyData = true;
    }
  } catch (e: any) {
    console.warn("[Nanjila KPI] funnel query failed:", e?.message);
  }

  // 4. Abandoned-cart risk — pending_payment orders > 1h old
  try {
    const { rows: [a] } = await pool.query<{ abandoned_count: number; oldest_age_hr: number | null }>(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending_payment' AND created_at < NOW() - INTERVAL '1 hour')::int AS abandoned_count,
        EXTRACT(EPOCH FROM (NOW() - MIN(created_at) FILTER (WHERE status = 'pending_payment')))::int / 3600 AS oldest_age_hr
      FROM service_orders
    `);
    if (a) {
      lines.push(`   • Abandoned service orders right now: ${a.abandoned_count}${a.oldest_age_hr ? ` (oldest ${a.oldest_age_hr}h old)` : ""}`);
      hadAnyData = true;
    }
  } catch (e: any) {
    console.warn("[Nanjila KPI] abandoned-cart query failed:", e?.message);
  }

  // 5. Most-viewed countries — last 7 days from funnel_events
  try {
    const { rows } = await pool.query<{ slug: string; views: number }>(`
      SELECT
        SUBSTRING(page FROM '^/country/([a-z]+)') AS slug,
        COUNT(*)::int AS views
      FROM funnel_events
      WHERE event = 'page_view'
        AND page LIKE '/country/%'
        AND created_at > NOW() - INTERVAL '7 days'
      GROUP BY slug
      ORDER BY views DESC
      LIMIT 5
    `);
    if (rows.length > 0) {
      const tops = rows.filter(r => r.slug).map(r => `${r.slug} (${r.views})`).join(", ");
      lines.push(`   • Most-viewed countries (7d): ${tops}`);
      hadAnyData = true;
    }
  } catch (e: any) {
    console.warn("[Nanjila KPI] country views query failed:", e?.message);
  }

  if (!hadAnyData) {
    return { asText: "", isEmpty: true };
  }
  lines.push(`Use these numbers when the admin asks about business health, what to push, or how things are trending.`);
  return { asText: lines.join("\n"), isEmpty: false };
}

/**
 * Detect whether the caller is an admin. Used to decide whether to inject
 * the KPI block + the admin section of the system catalogue.
 */
export async function isAdminUser(userId: string | number | null | undefined): Promise<boolean> {
  if (userId == null) return false;
  try {
    const { rows: [r] } = await pool.query<{ is_admin: boolean; role: string }>(
      `SELECT is_admin, role FROM users WHERE id = $1 LIMIT 1`,
      [String(userId)],
    );
    if (!r) return false;
    return r.is_admin === true || r.role === "ADMIN" || r.role === "SUPER_ADMIN";
  } catch {
    return false;
  }
}
