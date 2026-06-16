"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runExpirySweep = runExpirySweep;
exports.startExpirySweep = startExpirySweep;
exports.stopExpirySweep = stopExpirySweep;
/**
 * Plan expiry sweep — defensive-in-depth safety net.
 *
 * Runs every 60 seconds and proactively expires any user_subscriptions row
 * whose end_date has passed. This is belt-and-braces on top of the lazy
 * expiry that already happens inside storage.getUserPlan() — that lazy path
 * only fires when the user requests something. A user sitting on their
 * dashboard at the moment their trial expires would otherwise keep their
 * cached "trial" plan until they navigated somewhere that called
 * /api/auth/user or /api/user/plan.
 *
 * For each expired subscription we:
 *   1. UPDATE user_subscriptions SET status = 'expired'
 *   2. UPDATE users SET plan = 'free', subscription_status = 'expired'
 *   3. Invalidate the in-memory auth-user cache (so the next /api/auth/user
 *      hit forces a fresh read and returns plan='free')
 *   4. Mirror to Supabase via downgradeSupabaseUser
 *   5. Send WebSocket notification on /ws/user/:userId so any open browser
 *      tabs refetch /api/user/plan and re-render the paywall instantly
 *
 * 2026-06: built as part of the strict expiry audit. Founder explicitly asked
 * "after twenty four hours, they are automatically thrown out of the pro
 * usage. They cannot access more jobs." Lazy expiry alone doesn't guarantee
 * that promise during quiet sessions — this sweep does.
 */
const db_1 = require("../db");
const auth_user_cache_1 = require("./auth-user-cache");
const SWEEP_INTERVAL_MS = 60 * 1000; // every minute — tight enough to feel real-time
let _timer = null;
let _isRunning = false;
async function runExpirySweep() {
    const start = Date.now();
    const expiredUserIds = [];
    try {
        // Single transaction: find + expire all stale active subscriptions atomically.
        // Returns the user IDs so we can fire follow-up side effects (cache invalidate,
        // Supabase mirror, WebSocket nudge).
        const { rows } = await db_1.pool.query(`WITH expired AS (
         UPDATE user_subscriptions
            SET status = 'expired', updated_at = NOW()
          WHERE status = 'active'
            AND end_date IS NOT NULL
            AND end_date < NOW()
         RETURNING user_id, plan, end_date
       )
       SELECT user_id, plan, end_date FROM expired`);
        if (rows.length === 0) {
            return { expiredCount: 0, expiredUserIds: [], durationMs: Date.now() - start };
        }
        // Sync the denormalised users.plan column for every affected user
        const userIds = rows.map((r) => r.user_id);
        await db_1.pool.query(`UPDATE users
          SET plan = 'free', subscription_status = 'expired', updated_at = NOW()
        WHERE id = ANY($1::varchar[])`, [userIds]);
        // Side effects per user — best-effort, never block the sweep on failures
        for (const row of rows) {
            const userId = row.user_id;
            expiredUserIds.push(userId);
            // 1. In-memory auth-user cache
            try {
                (0, auth_user_cache_1.invalidateAuthUserCache)(userId);
            }
            catch { /* ignore */ }
            // 2. Supabase mirror — keeps the fast-path /api/jobs check honest
            Promise.resolve().then(() => __importStar(require("../supabaseClient"))).then(({ downgradeSupabaseUser }) => downgradeSupabaseUser(userId))
                .catch((err) => console.warn(`[expiry-sweep] downgradeSupabaseUser failed for ${userId}:`, err?.message));
            // 3. WebSocket nudge — any open tab gets told to refetch its plan + bounce
            //    to the paywall. Without this, a user mid-session sees stale Pro UI
            //    until they navigate.
            Promise.resolve().then(() => __importStar(require("../websocket"))).then((ws) => {
                const fn = ws.notifyUserPlanExpired
                    || ws.notifyUserPlanChanged
                    || ws.notifyUser;
                if (typeof fn === "function") {
                    fn(userId, {
                        type: "plan_expired",
                        message: "Your plan has expired. Renew to keep access.",
                        previousPlan: row.plan,
                        expiredAt: row.end_date,
                    });
                }
            })
                .catch(() => { });
            console.log(`[expiry-sweep] expired userId=${userId} previousPlan=${row.plan} endDate=${new Date(row.end_date).toISOString()}`);
        }
        return { expiredCount: rows.length, expiredUserIds, durationMs: Date.now() - start };
    }
    catch (err) {
        console.error("[expiry-sweep] sweep failed:", err?.message);
        return { expiredCount: 0, expiredUserIds, durationMs: Date.now() - start };
    }
}
function startExpirySweep() {
    if (_timer)
        return;
    console.log(`[expiry-sweep] Started — running every ${SWEEP_INTERVAL_MS / 1000}s`);
    // Kick off first sweep after 30s (let server warm up) — never block server startup
    setTimeout(async () => {
        if (_isRunning)
            return;
        _isRunning = true;
        try {
            const result = await runExpirySweep();
            if (result.expiredCount > 0) {
                console.log(`[expiry-sweep] First run: expired ${result.expiredCount} subscriptions in ${result.durationMs}ms`);
            }
        }
        finally {
            _isRunning = false;
        }
    }, 30000);
    // Then sweep every minute
    _timer = setInterval(async () => {
        if (_isRunning)
            return;
        _isRunning = true;
        try {
            const result = await runExpirySweep();
            if (result.expiredCount > 0) {
                console.log(`[expiry-sweep] Expired ${result.expiredCount} subscriptions in ${result.durationMs}ms`);
            }
        }
        catch (err) {
            console.error("[expiry-sweep] tick failed:", err?.message);
        }
        finally {
            _isRunning = false;
        }
    }, SWEEP_INTERVAL_MS);
}
function stopExpirySweep() {
    if (_timer) {
        clearInterval(_timer);
        _timer = null;
        console.log("[expiry-sweep] Stopped");
    }
}
