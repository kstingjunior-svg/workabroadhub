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
import { pool } from "../db";
import { invalidateAuthUserCache } from "./auth-user-cache";

const SWEEP_INTERVAL_MS = 60 * 1000; // every minute — tight enough to feel real-time
let _timer: NodeJS.Timeout | null = null;
let _isRunning = false;

interface SweepResult {
  expiredCount: number;
  expiredUserIds: string[];
  durationMs: number;
}

export async function runExpirySweep(): Promise<SweepResult> {
  const start = Date.now();
  const expiredUserIds: string[] = [];

  try {
    // Single transaction: find + expire all stale active subscriptions atomically.
    // Returns the user IDs so we can fire follow-up side effects (cache invalidate,
    // Supabase mirror, WebSocket nudge).
    const { rows } = await pool.query<{ user_id: string; plan: string; end_date: Date }>(
      `WITH expired AS (
         UPDATE user_subscriptions
            SET status = 'expired', updated_at = NOW()
          WHERE status = 'active'
            AND end_date IS NOT NULL
            AND end_date < NOW()
         RETURNING user_id, plan, end_date
       )
       SELECT user_id, plan, end_date FROM expired`,
    );

    if (rows.length === 0) {
      return { expiredCount: 0, expiredUserIds: [], durationMs: Date.now() - start };
    }

    // Sync the denormalised users.plan column for every affected user
    const userIds = rows.map((r) => r.user_id);
    await pool.query(
      `UPDATE users
          SET plan = 'free', subscription_status = 'expired', updated_at = NOW()
        WHERE id = ANY($1::varchar[])`,
      [userIds],
    );

    // Side effects per user — best-effort, never block the sweep on failures
    for (const row of rows) {
      const userId = row.user_id;
      expiredUserIds.push(userId);

      // 1. In-memory auth-user cache
      try { invalidateAuthUserCache(userId); } catch { /* ignore */ }

      // 2. Supabase mirror — keeps the fast-path /api/jobs check honest
      import("../supabaseClient")
        .then(({ downgradeSupabaseUser }) => downgradeSupabaseUser(userId))
        .catch((err) => console.warn(`[expiry-sweep] downgradeSupabaseUser failed for ${userId}:`, err?.message));

      // 3. WebSocket nudge — any open tab gets told to refetch its plan + bounce
      //    to the paywall. Without this, a user mid-session sees stale Pro UI
      //    until they navigate.
      import("../websocket")
        .then((ws) => {
          const fn = (ws as any).notifyUserPlanExpired
                  || (ws as any).notifyUserPlanChanged
                  || (ws as any).notifyUser;
          if (typeof fn === "function") {
            fn(userId, {
              type: "plan_expired",
              message: "Your plan has expired. Renew to keep access.",
              previousPlan: row.plan,
              expiredAt: row.end_date,
            });
          }
        })
        .catch(() => { /* WebSocket optional */ });

      console.log(`[expiry-sweep] expired userId=${userId} previousPlan=${row.plan} endDate=${new Date(row.end_date).toISOString()}`);
    }

    return { expiredCount: rows.length, expiredUserIds, durationMs: Date.now() - start };
  } catch (err: any) {
    console.error("[expiry-sweep] sweep failed:", err?.message);
    return { expiredCount: 0, expiredUserIds, durationMs: Date.now() - start };
  }
}

export function startExpirySweep(): void {
  if (_timer) return;

  console.log(`[expiry-sweep] Started — running every ${SWEEP_INTERVAL_MS / 1000}s`);

  // Kick off first sweep after 30s (let server warm up) — never block server startup
  setTimeout(async () => {
    if (_isRunning) return;
    _isRunning = true;
    try {
      const result = await runExpirySweep();
      if (result.expiredCount > 0) {
        console.log(`[expiry-sweep] First run: expired ${result.expiredCount} subscriptions in ${result.durationMs}ms`);
      }
    } finally {
      _isRunning = false;
    }
  }, 30_000);

  // Then sweep every minute
  _timer = setInterval(async () => {
    if (_isRunning) return;
    _isRunning = true;
    try {
      const result = await runExpirySweep();
      if (result.expiredCount > 0) {
        console.log(`[expiry-sweep] Expired ${result.expiredCount} subscriptions in ${result.durationMs}ms`);
      }
    } catch (err: any) {
      console.error("[expiry-sweep] tick failed:", err?.message);
    } finally {
      _isRunning = false;
    }
  }, SWEEP_INTERVAL_MS);
}

export function stopExpirySweep(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    console.log("[expiry-sweep] Stopped");
  }
}
