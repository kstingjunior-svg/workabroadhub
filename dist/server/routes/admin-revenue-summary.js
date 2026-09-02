"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAdminRevenueSummaryRoute = registerAdminRevenueSummaryRoute;
const db_1 = require("../db");
// Match every status value our codebase writes for a successful payment.
// Case-insensitive via LOWER() in the SQL. Includes 'paid' (service order
// payments use this) which was the gap that hid yesterday's yearly upgrades.
const PAID_STATUS_VALUES = ["success", "completed", "paid"];
function registerAdminRevenueSummaryRoute(app, isAuthenticated, isAdmin) {
    app.get("/api/admin/revenue/summary", isAuthenticated, isAdmin, async (_req, res) => {
        try {
            // Build the WHERE clause for paid payments once — used everywhere.
            // Note the `LOWER(status)` so 'SUCCESS', 'Success', 'success' all match.
            const PAID_WHERE = `LOWER(status) = ANY($1)`;
            const params = [PAID_STATUS_VALUES];
            const [todayRows, monthRows, allRows, last30Rows, last12Rows, breakdownRows, tierTotalsRows, recentPayersRows, diagnosticsRows,] = await Promise.all([
                db_1.pool.query(`
          SELECT COALESCE(SUM(amount), 0)::text AS total, COUNT(*)::text AS cnt
            FROM payments
           WHERE ${PAID_WHERE}
             AND created_at >= date_trunc('day', NOW())
        `, params),
                db_1.pool.query(`
          SELECT COALESCE(SUM(amount), 0)::text AS total, COUNT(*)::text AS cnt
            FROM payments
           WHERE ${PAID_WHERE}
             AND created_at >= date_trunc('month', NOW())
        `, params),
                db_1.pool.query(`
          SELECT COALESCE(SUM(amount), 0)::text AS total, COUNT(*)::text AS cnt
            FROM payments
           WHERE ${PAID_WHERE}
        `, params),
                db_1.pool.query(`
          WITH days AS (
            SELECT generate_series(
              date_trunc('day', NOW()) - INTERVAL '29 days',
              date_trunc('day', NOW()), INTERVAL '1 day') AS date
          )
          SELECT to_char(d.date, 'YYYY-MM-DD') AS date,
                 COALESCE(SUM(p.amount), 0)::text AS total,
                 COUNT(p.id)::text AS cnt
            FROM days d
            LEFT JOIN payments p
              ON date_trunc('day', p.created_at) = d.date
             AND LOWER(p.status) = ANY($1)
           GROUP BY d.date
           ORDER BY d.date ASC
        `, params),
                db_1.pool.query(`
          WITH months AS (
            SELECT generate_series(
              date_trunc('month', NOW()) - INTERVAL '11 months',
              date_trunc('month', NOW()), INTERVAL '1 month') AS month
          )
          SELECT to_char(m.month, 'YYYY-MM') AS month,
                 COALESCE(SUM(p.amount), 0)::text AS total,
                 COUNT(p.id)::text AS cnt
            FROM months m
            LEFT JOIN payments p
              ON date_trunc('month', p.created_at) = m.month
             AND LOWER(p.status) = ANY($1)
           GROUP BY m.month
           ORDER BY m.month ASC
        `, params),
                db_1.pool.query(`
          SELECT COALESCE(service_id, 'other') AS service_id,
                 COALESCE(SUM(amount), 0)::text AS total,
                 COUNT(*)::text AS cnt
            FROM payments
           WHERE ${PAID_WHERE}
             AND created_at >= date_trunc('day', NOW())
           GROUP BY service_id
           ORDER BY SUM(amount) DESC NULLS LAST
        `, params),
                // 2026-06: per-tier counts that Tony explicitly asked to see.
                // Buckets by amount band (the prices we actually charge) so every
                // payment lands somewhere visible — including manual grants made
                // via /admin/manual-upgrade.
                db_1.pool.query(`
          SELECT
            CASE
              WHEN amount BETWEEN 95  AND 105   THEN 'trial'
              WHEN amount BETWEEN 950 AND 1050  THEN 'monthly'
              WHEN amount BETWEEN 4400 AND 4600 THEN 'yearly'
              WHEN amount BETWEEN 3500 AND 3700 THEN 'yearly_referral'
              ELSE 'other'
            END AS tier,
            COUNT(*)::text AS cnt,
            COALESCE(SUM(amount), 0)::text AS total
          FROM payments
          WHERE ${PAID_WHERE}
          GROUP BY tier
        `, params),
                // 2026-06: recent payers with names — so Tony can scroll and see
                // Karaoke + the two yearly upgrades from yesterday by name. Joined
                // with users for first/last name + email so this is human-readable.
                db_1.pool.query(`
          SELECT
            p.id, p.user_id, p.amount::text AS amount, p.status, p.service_id,
            p.transaction_ref, p.mpesa_code, p.created_at,
            u.first_name, u.last_name, u.email, u.phone
          FROM payments p
          LEFT JOIN users u ON u.id = p.user_id
          WHERE LOWER(p.status) = ANY($1)
          ORDER BY p.created_at DESC
          LIMIT 30
        `, params),
                // Diagnostics — what's actually in the table? Helps Tony confirm
                // payments exist even if a status filter is somehow still missing
                // something. He sees totalRows always; if that's > 0 but paidRows
                // is 0, the issue is a status he hasn't seen us covering.
                db_1.pool.query(`
          SELECT
            COUNT(*)::text AS total_rows,
            COUNT(*) FILTER (WHERE LOWER(status) = ANY($1))::text AS paid_rows,
            ARRAY_AGG(DISTINCT LOWER(status)) AS distinct_statuses
          FROM payments
        `, params),
            ]);
            const today = todayRows.rows[0] ?? { total: "0", cnt: "0" };
            const month = monthRows.rows[0] ?? { total: "0", cnt: "0" };
            const allTime = allRows.rows[0] ?? { total: "0", cnt: "0" };
            const allTotal = Number(allTime.total);
            const allCnt = Number(allTime.cnt);
            const avgPerTxn = allCnt > 0 ? Math.round(allTotal / allCnt) : 0;
            // Build the per-tier object — every tier present with zeros if no buyers.
            const tierMap = {
                trial: { count: 0, total: 0 },
                monthly: { count: 0, total: 0 },
                yearly: { count: 0, total: 0 },
                yearly_referral: { count: 0, total: 0 },
                other: { count: 0, total: 0 },
            };
            for (const r of tierTotalsRows.rows) {
                if (tierMap[r.tier]) {
                    tierMap[r.tier] = { count: Number(r.cnt), total: Number(r.total) };
                }
            }
            // Categorise recent payers by tier + format name
            const recentPayers = recentPayersRows.rows.map((r) => {
                const amt = Number(r.amount);
                const tier = amt >= 95 && amt <= 105 ? "trial"
                    : amt >= 950 && amt <= 1050 ? "monthly"
                        : amt >= 4400 && amt <= 4600 ? "yearly"
                            : amt >= 3500 && amt <= 3700 ? "yearly_referral"
                                : "other";
                const name = [r.first_name, r.last_name].filter(Boolean).join(" ").trim()
                    || r.email
                    || r.phone
                    || "Unknown user";
                return {
                    id: r.id,
                    userId: r.user_id,
                    name,
                    email: r.email,
                    phone: r.phone,
                    amount: amt,
                    tier,
                    serviceId: r.service_id,
                    transactionRef: r.transaction_ref,
                    mpesaCode: r.mpesa_code,
                    status: r.status,
                    createdAt: r.created_at,
                };
            });
            const diag = diagnosticsRows.rows[0] ?? { total_rows: "0", paid_rows: "0", distinct_statuses: [] };
            res.setHeader("Cache-Control", "private, max-age=15");
            res.json({
                currency: "KES",
                today: { revenue: Number(today.total), transactions: Number(today.cnt) },
                month: { revenue: Number(month.total), transactions: Number(month.cnt) },
                allTime: { revenue: allTotal, transactions: allCnt },
                avgPerTransaction: avgPerTxn,
                last30Days: last30Rows.rows.map((r) => ({ date: r.date, total: Number(r.total), transactions: Number(r.cnt) })),
                last12Months: last12Rows.rows.map((r) => ({ month: r.month, total: Number(r.total), transactions: Number(r.cnt) })),
                todayBreakdown: breakdownRows.rows.map((r) => ({ serviceId: r.service_id || "other", total: Number(r.total), transactions: Number(r.cnt) })),
                // 2026-06 founder ask: tier breakdown that always shows the three real
                // pricing bands. Counts are LIFETIME (all-time successful payments
                // in that band) so manually-granted users surface here too.
                tierBreakdown: {
                    trial: { label: "KES 99 · Trial", price: 99, count: tierMap.trial.count, total: tierMap.trial.total },
                    monthly: { label: "KES 1,000 · Monthly", price: 1000, count: tierMap.monthly.count, total: tierMap.monthly.total },
                    yearly: { label: "KES 4,500 · Yearly", price: 4500, count: tierMap.yearly.count, total: tierMap.yearly.total },
                    yearly_referral: { label: "KES 3,600 · Yearly (Ref)", price: 3600, count: tierMap.yearly_referral.count, total: tierMap.yearly_referral.total },
                    other: { label: "Other (service orders)", price: 0, count: tierMap.other.count, total: tierMap.other.total },
                },
                // Recent payers feed — last 30, newest first.
                recentPayers,
                // Diagnostics so Tony can verify what the system actually has.
                diagnostics: {
                    totalPaymentRows: Number(diag.total_rows),
                    paidPaymentRows: Number(diag.paid_rows),
                    distinctStatuses: diag.distinct_statuses || [],
                    paidStatusValues: PAID_STATUS_VALUES,
                },
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
