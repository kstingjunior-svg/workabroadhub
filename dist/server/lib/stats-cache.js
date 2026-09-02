"use strict";
// @ts-nocheck
/**
 * Platform stats cache — PostgreSQL equivalent of the MySQL pattern:
 *   CREATE TABLE platform_stats + stored procedure + CREATE EVENT (every 5 min)
 *
 * MySQL → PostgreSQL mapping
 * ──────────────────────────────────────────────────────────────────────────
 *  REPLACE INTO           →  INSERT … ON CONFLICT (id) DO UPDATE SET …
 *  ON UPDATE CURRENT_TIMESTAMP → trigger or manual NOW() in the upsert
 *  CREATE PROCEDURE       →  TypeScript async function
 *  CREATE EVENT EVERY 5 MINUTE → setInterval (started in server/index.ts)
 *  CURDATE()              →  CURRENT_DATE  (or NOW()::date)
 *  DATE_SUB(NOW(),…)      →  NOW() - INTERVAL '5 minutes'
 *  plan IN ('Pro','Premium') AND subscription_status='active'
 *                         →  user_subscriptions.status = 'active' AND plan = 'pro'
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureStatsCacheTable = ensureStatsCacheTable;
exports.refreshPlatformStats = refreshPlatformStats;
exports.getCachedStats = getCachedStats;
exports.startStatsCacheScheduler = startStatsCacheScheduler;
const db_1 = require("../db");
const drizzle_orm_1 = require("drizzle-orm");
const active_users_1 = require("../active-users");
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let refreshTimer = null;
/* ── 1. Ensure the cache table exists (run once at startup) ─────────────── */
async function ensureStatsCacheTable() {
    await db_1.db.execute((0, drizzle_orm_1.sql) `
    CREATE TABLE IF NOT EXISTS platform_stats (
      id           INT PRIMARY KEY DEFAULT 1,
      total_users  INT            NOT NULL DEFAULT 0,
      paid_users   INT            NOT NULL DEFAULT 0,
      total_revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
      revenue_today NUMERIC(12,2) NOT NULL DEFAULT 0,
      active_now   INT            NOT NULL DEFAULT 0,
      signups_today INT           NOT NULL DEFAULT 0,
      signups_week  INT           NOT NULL DEFAULT 0,
      signups_month INT           NOT NULL DEFAULT 0,
      last_updated  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);
}
/* ── 2. Refresh function (replaces the MySQL stored procedure) ───────────── */
async function refreshPlatformStats() {
    try {
        // Step 1: ensure the table exists before any SELECT/INSERT
        await ensureStatsCacheTable();
        const result = await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT
        (SELECT COUNT(*)::int FROM users)
          AS total_users,

        (SELECT COUNT(DISTINCT us.user_id)::int
         FROM user_subscriptions us
         WHERE us.status = 'active'
           AND us.plan = 'pro'
           AND (us.end_date IS NULL OR us.end_date > NOW()))
          AS paid_users,

        (SELECT COALESCE(SUM(amount), 0)::numeric
         FROM payments
         WHERE status = 'completed' AND is_suspicious = false)
          AS total_revenue,

        (SELECT COALESCE(SUM(amount), 0)::numeric
         FROM payments
         WHERE status = 'completed'
           AND is_suspicious = false
           AND created_at >= CURRENT_DATE)
          AS revenue_today,

        (SELECT COUNT(*)::int FROM users
         WHERE created_at >= CURRENT_DATE)
          AS signups_today,

        (SELECT COUNT(*)::int FROM users
         WHERE created_at >= NOW() - INTERVAL '7 days')
          AS signups_week,

        (SELECT COUNT(*)::int FROM users
         WHERE created_at >= NOW() - INTERVAL '30 days')
          AS signups_month
    `);
        // db.execute() returns { rows: [...] } — same pattern as used elsewhere in routes.ts
        const statsRow = (result.rows ?? [])[0];
        if (!statsRow)
            return;
        const active = (0, active_users_1.getActiveUserCounts)();
        await db_1.db.execute((0, drizzle_orm_1.sql) `
      INSERT INTO platform_stats
        (id, total_users, paid_users, total_revenue, revenue_today,
         active_now, signups_today, signups_week, signups_month, last_updated)
      VALUES
        (1,
         ${Number(statsRow.total_users)},
         ${Number(statsRow.paid_users)},
         ${Number(statsRow.total_revenue)},
         ${Number(statsRow.revenue_today)},
         ${active.total},
         ${Number(statsRow.signups_today)},
         ${Number(statsRow.signups_week)},
         ${Number(statsRow.signups_month)},
         NOW())
      ON CONFLICT (id) DO UPDATE SET
        total_users   = EXCLUDED.total_users,
        paid_users    = EXCLUDED.paid_users,
        total_revenue = EXCLUDED.total_revenue,
        revenue_today = EXCLUDED.revenue_today,
        active_now    = EXCLUDED.active_now,
        signups_today = EXCLUDED.signups_today,
        signups_week  = EXCLUDED.signups_week,
        signups_month = EXCLUDED.signups_month,
        last_updated  = NOW()
    `);
        console.log("[StatsCache] Refreshed platform_stats");
    }
    catch (err) {
        console.error("[StatsCache] Refresh failed:", err.message, err.stack?.split("\n")[1]);
    }
}
async function getCachedStats() {
    try {
        const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT * FROM platform_stats WHERE id = 1 LIMIT 1
    `);
        const row = rows.rows?.[0];
        if (!row)
            return null;
        const lastUpdated = row.last_updated ? new Date(row.last_updated) : null;
        const cacheAgeSeconds = lastUpdated
            ? Math.floor((Date.now() - lastUpdated.getTime()) / 1000)
            : 999;
        return {
            totalUsers: Number(row.total_users),
            paidUsers: Number(row.paid_users),
            totalRevenue: Number(row.total_revenue),
            revenueToday: Number(row.revenue_today),
            activeNow: Number(row.active_now),
            signupsToday: Number(row.signups_today),
            signupsWeek: Number(row.signups_week),
            signupsMonth: Number(row.signups_month),
            lastUpdated,
            cacheAgeSeconds,
        };
    }
    catch {
        return null;
    }
}
/* ── 4. Scheduler (replaces CREATE EVENT … EVERY 5 MINUTE) ─────────────── */
function startStatsCacheScheduler() {
    if (refreshTimer)
        return; // already running
    // Warm the cache immediately on startup
    ensureStatsCacheTable()
        .then(() => refreshPlatformStats())
        .catch((err) => console.error("[StatsCache] Startup warmup failed:", err.message));
    // Then refresh every 5 minutes — equivalent to MySQL's CREATE EVENT
    refreshTimer = setInterval(async () => {
        await refreshPlatformStats();
    }, REFRESH_INTERVAL_MS);
    console.log("[StatsCache] Scheduler started — refresh every 5 min");
}
