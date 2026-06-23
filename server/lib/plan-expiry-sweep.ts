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
    // 2026-06 BUGFIX: founder reported a client who paid a 2nd time, app
    // showed her as paid, then she got bounced to the paywall before her 24h
    // was up. Root cause: race between the expiry sweep and second-payment
    // activations. Two specific scenarios fixed here:
    //
    //   1. Renewal protection — if a successful M-Pesa payment landed for
    //      this user in the last 5 minutes, DO NOT expire any of their
    //      subscriptions. The callback may be mid-flight; the new active
    //      sub may not yet be committed. Better to wait one sweep cycle.
    //
    //   2. Just-created grace period — never expire a subscription that
    //      was created in the last 60 seconds. Handles clock-skew + commit
    //      lag where end_date was set in the past somehow.
    //
    // Both are conservative — we lose at most 5 min of revenue protection
    // on truly-expired users, in exchange for never downgrading someone
    // who just paid.
    const { rows } = await pool.query<{ user_id: string; plan: string; end_date: Date }>(
      `WITH expired AS (
         UPDATE user_subscriptions us
            SET status = 'expired', updated_at = NOW()
          WHERE us.status = 'active'
            AND us.end_date IS NOT NULL
            AND us.end_date < NOW()
            -- Grace period: don't expire freshly-created rows (commit lag, clock skew)
            AND us.created_at < NOW() - INTERVAL '60 seconds'
            -- Renewal protection: skip users who had a successful M-Pesa payment in the last 5 min.
            -- That payment's callback is probably still propagating through runPaymentPipeline.
            AND NOT EXISTS (
              SELECT 1 FROM payments p
               WHERE p.user_id = us.user_id
                 AND p.method = 'mpesa'
                 AND p.status IN ('success', 'completed')
                 AND p.created_at > NOW() - INTERVAL '5 minutes'
            )
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

    // 2026-06: pull emails so we can notify each user their plan expired.
    // Best-effort — if the email fetch fails, sweep still completes.
    const { rows: contactRows } = await pool.query<{
      id: string; email: string | null; first_name: string | null;
    }>(
      `SELECT id, email, first_name FROM users WHERE id = ANY($1::varchar[]) AND is_active = true`,
      [userIds],
    ).catch(() => ({ rows: [] }) as any);
    const contactByUser = new Map<string, { email: string | null; firstName: string | null }>();
    contactRows.forEach((r: any) => contactByUser.set(r.id, { email: r.email, firstName: r.first_name }));

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

      // 4. Email notification — "your plan has expired, renew to keep access"
      //    Hostinger SMTP is the primary path; if it fails (rate limit, network
      //    blip) we just log and move on — the user still sees the paywall on
      //    their next visit, so they're not silently stuck.
      const contact = contactByUser.get(userId);
      if (contact?.email) {
        const planLabel = row.plan === "trial" || row.plan === "basic"
          ? "1-Day Trial (KES 99)"
          : row.plan === "monthly"
            ? "Monthly plan (KES 1,000)"
            : row.plan === "yearly" || row.plan === "pro" || row.plan === "pro_referral"
              ? "Yearly plan (KES 4,500)"
              : `${row.plan} plan`;
        import("../email").then(({ sendEmail }) => sendEmail({
          to: contact.email!,
          subject: `Your WorkAbroad Hub ${planLabel} has expired`,
          html: `
            <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:auto;padding:24px;color:#1a2530;">
              <h2 style="margin:0 0 12px;color:#C2461E;">Your plan just expired</h2>
              <p>Hi ${escapeHtmlForEmail((contact.firstName || "").trim() || "there")},</p>
              <p>Your <strong>${planLabel}</strong> on WorkAbroad Hub has just expired.</p>
              <p>Renew in 30 seconds to keep applying to verified overseas jobs, Kenya Careers openings, and unlock the full app:</p>
              <p style="margin:24px 0;">
                <a href="https://workabroadhub.tech/pricing"
                   style="display:inline-block;background:#C2461E;color:#fff;font-weight:600;font-size:14px;
                          padding:12px 28px;border-radius:8px;text-decoration:none;">
                  Renew my plan →
                </a>
              </p>
              <p style="font-size:13px;color:#475569;">
                Plans start at <strong>KES 99 for 24 hours</strong>, or pay <strong>KES 1,000 for 30 days</strong> /
                <strong>KES 4,500 for the full year</strong>. M-Pesa STK push only — no card needed.
              </p>
              <p style="margin-top:32px;font-size:13px;color:#94a3b8;">— Tony &amp; the WorkAbroad Hub team, Nairobi</p>
            </div>`,
          text: `Hi,\n\nYour ${planLabel} on WorkAbroad Hub has expired.\n\nRenew in 30 seconds at https://workabroadhub.tech/pricing — plans start at KES 99 for 24 hours.\n\n— Tony & the WorkAbroad Hub team, Nairobi`,
        })).catch((err: any) => console.warn(`[expiry-sweep] email failed for userId=${userId}: ${err?.message}`));
      }

      console.log(`[expiry-sweep] expired userId=${userId} previousPlan=${row.plan} endDate=${new Date(row.end_date).toISOString()} ${contact?.email ? "(notified)" : "(no email on file)"}`);
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

// Tiny HTML escape so user-supplied first names can't break the email template.
function escapeHtmlForEmail(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c] || c));
}
