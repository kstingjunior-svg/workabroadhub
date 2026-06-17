"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAdminRevenueSummaryRoute = registerAdminRevenueSummaryRoute;
const db_1 = require("../db");
function registerAdminRevenueSummaryRoute(app, isAuthenticated, isAdmin) {
    app.get("/api/admin/revenue/summary", isAuthenticated, isAdmin, async (_req, res) => {
        try {
            // Single round-trip — six aggregations in parallel
            const [todayRows, monthRows, allRows, last30Rows, last12Rows, breakdownRows,] = await Promise.all([
                // Today
                db_1.pool.query(`
          SELECT COALESCE(SUM(amount), 0)::text AS total, COUNT(*)::text AS cnt
            FROM payments
           WHERE status IN ('success', 'completed')
             AND created_at >= date_trunc('day', NOW())
        `),
                // This calendar month
                db_1.pool.query(`
          SELECT COALESCE(SUM(amount), 0)::text AS total, COUNT(*)::text AS cnt
            FROM payments
           WHERE status IN ('success', 'completed')
             AND created_at >= date_trunc('month', NOW())
        `),
                // All time
                db_1.pool.query(`
          SELECT COALESCE(SUM(amount), 0)::text AS total, COUNT(*)::text AS cnt
            FROM payments
           WHERE status IN ('success', 'completed')
        `),
                // Last 30 days, grouped by day. Filled with zeros for empty days so
                // the chart shows a full bar for every day not just spikes.
                db_1.pool.query(`
          WITH days AS (
            SELECT generate_series(
                     date_trunc('day', NOW()) - INTERVAL '29 days',
                     date_trunc('day', NOW()),
                     INTERVAL '1 day'
                   ) AS date
          )
          SELECT to_char(d.date, 'YYYY-MM-DD') AS date,
                 COALESCE(SUM(p.amount), 0)::text AS total,
                 COUNT(p.id)::text AS cnt
            FROM days d
            LEFT JOIN payments p
              ON date_trunc('day', p.created_at) = d.date
             AND p.status IN ('success', 'completed')
           GROUP BY d.date
           ORDER BY d.date ASC
        `),
                // Last 12 months
                db_1.pool.query(`
          WITH months AS (
            SELECT generate_series(
                     date_trunc('month', NOW()) - INTERVAL '11 months',
                     date_trunc('month', NOW()),
                     INTERVAL '1 month'
                   ) AS month
          )
          SELECT to_char(m.month, 'YYYY-MM') AS month,
                 COALESCE(SUM(p.amount), 0)::text AS total,
                 COUNT(p.id)::text AS cnt
            FROM months m
            LEFT JOIN payments p
              ON date_trunc('month', p.created_at) = m.month
             AND p.status IN ('success', 'completed')
           GROUP BY m.month
           ORDER BY m.month ASC
        `),
                // Today's breakdown by service_id
                db_1.pool.query(`
          SELECT COALESCE(service_id, 'other') AS service_id,
                 COALESCE(SUM(amount), 0)::text AS total,
                 COUNT(*)::text AS cnt
            FROM payments
           WHERE status IN ('success', 'completed')
             AND created_at >= date_trunc('day', NOW())
           GROUP BY service_id
           ORDER BY SUM(amount) DESC NULLS LAST
        `),
            ]);
            const today = todayRows.rows[0] ?? { total: "0", cnt: "0" };
            const month = monthRows.rows[0] ?? { total: "0", cnt: "0" };
            const allTime = allRows.rows[0] ?? { total: "0", cnt: "0" };
            const allTotal = Number(allTime.total);
            const allCnt = Number(allTime.cnt);
            const avgPerTxn = allCnt > 0 ? Math.round(allTotal / allCnt) : 0;
            // Cache for 30s — the page polls every 30s so this is the right window.
            // Admin only; private cache.
            res.setHeader("Cache-Control", "private, max-age=30");
            res.json({
                currency: "KES",
                today: {
                    revenue: Number(today.total),
                    transactions: Number(today.cnt),
                },
                month: {
                    revenue: Number(month.total),
                    transactions: Number(month.cnt),
                },
                allTime: {
                    revenue: allTotal,
                    transactions: allCnt,
                },
                avgPerTransaction: avgPerTxn,
                last30Days: last30Rows.rows.map((r) => ({
                    date: r.date,
                    total: Number(r.total),
                    transactions: Number(r.cnt),
                })),
                last12Months: last12Rows.rows.map((r) => ({
                    month: r.month,
                    total: Number(r.total),
                    transactions: Number(r.cnt),
                })),
                todayBreakdown: breakdownRows.rows.map((r) => ({
                    serviceId: r.service_id || "other",
                    total: Number(r.total),
                    transactions: Number(r.cnt),
                })),
                generatedAt: new Date().toISOString(),
            });
        }
        catch (err) {
            console.error("[/api/admin/revenue/summary]", err?.message);
            res.status(500).json({ message: "Failed to compute revenue summary", error: err?.message });
        }
    });
    console.log("[admin-revenue] Route registered: GET /api/admin/revenue/summary");
}
