"use strict";
/**
 * NEA lookup daily counter — enforces the free-tier promise of
 * "3 NEAIMS agency lookups per day (self-service)" that appears in
 * client/src/lib/plan-features.ts.
 *
 * Before this counter existed, POST /api/agencies/bulk-verify and
 * GET /api/nea-agencies/:id were both open — free users got unlimited
 * lookups, contradicting the copy and undermining the paid tier
 * ("advisor-verified agency checks").
 *
 * Design decisions:
 *   • Signed-in only — anonymous browsers aren't tied to any plan and
 *     the browse page (GET /api/nea-agencies with no id) is still fully
 *     open for them. If they want targeted lookups, they can sign up.
 *   • Paid tiers (trial/monthly/pro/yearly/etc.) skip the check entirely.
 *   • Admins bypass — same pattern as requireAnyPaidPlan.
 *   • Rolling 24-hour window (not calendar day) — user who checked at
 *     23:59 doesn't get 6 lookups by midnight rollover.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkNeaLookupCap = checkNeaLookupCap;
exports.recordNeaLookup = recordNeaLookup;
const db_1 = require("../db");
const storage_1 = require("../storage");
const FREE_DAILY_LIMIT = 3;
const PAID_PLANS = new Set(["trial", "monthly", "pro", "pro_referral", "basic", "yearly"]);
async function checkNeaLookupCap(userId) {
    // Anonymous — no cap enforced (they can't be tied to a plan; they're
    // just browsing the public directory).
    if (!userId)
        return { allowed: true, used: 0, limit: Infinity };
    // Admin bypass — mirror requireAnyPaidPlan pattern.
    try {
        const { rows } = await db_1.pool.query(`SELECT is_admin, role FROM users WHERE id = $1`, [userId]);
        const user = rows[0];
        if (user && (user.is_admin === true || user.role === "ADMIN" || user.role === "SUPER_ADMIN")) {
            return { allowed: true, used: 0, limit: Infinity };
        }
    }
    catch {
        /* fall through to plan check */
    }
    // Paid plan — unlimited lookups.
    const planId = await storage_1.storage.getUserPlan(userId);
    if (PAID_PLANS.has(planId)) {
        return { allowed: true, used: 0, limit: Infinity };
    }
    // Free — count lookups in rolling 24h window.
    const { rows: countRows } = await db_1.pool.query(`SELECT COUNT(*)::text AS n
       FROM nea_lookups
      WHERE user_id = $1
        AND looked_up_at > NOW() - INTERVAL '24 hours'`, [userId]);
    const used = Number(countRows[0]?.n ?? 0);
    return {
        allowed: used < FREE_DAILY_LIMIT,
        used,
        limit: FREE_DAILY_LIMIT,
        reason: used < FREE_DAILY_LIMIT ? undefined : "free_daily_cap",
    };
}
/**
 * Record a lookup event. Best-effort; a failure here should not block
 * the response (the user already got the data).
 */
async function recordNeaLookup(userId, endpoint) {
    if (!userId)
        return;
    try {
        await db_1.pool.query(`INSERT INTO nea_lookups (user_id, endpoint) VALUES ($1, $2)`, [userId, endpoint]);
    }
    catch (err) {
        console.warn("[NEA lookupCounter] failed to record:", err?.message);
    }
}
