import { pool } from "../db";
import { sendWhatsApp } from "../services/whatsapp";

const INTERVAL_MS    = 60 * 60 * 1000;  // run every hour
const MIN_IDLE_HOURS = 24;               // abandoned after 24h of inactivity
const COOLDOWN_DAYS  = 7;               // don't re-message within 7 days

async function getAbandonedUsers() {
  const res = await pool.query<{ id: number; phone: string; service_name: string | null }>(`
    SELECT DISTINCT ON (u.id)
      u.id, u.phone, p.service_name
    FROM users u
    JOIN payments p ON p.user_id = u.id
    WHERE p.status = 'pending'
      AND p.created_at < NOW() - INTERVAL '${MIN_IDLE_HOURS} hours'
      AND u.phone IS NOT NULL
      AND u.id NOT IN (
        SELECT DISTINCT user_id
        FROM funnel_events
        WHERE event = 're_engagement_sent'
          AND (metadata->>'sent_at')::timestamptz > NOW() - INTERVAL '${COOLDOWN_DAYS} days'
      )
    ORDER BY u.id, p.created_at DESC
  `);
  return res.rows;
}

function getMessage(serviceName: string | null): string {
  const s = (serviceName || "").toLowerCase();

  if (s.includes("cv") || s.includes("resume")) {
    return `You started your CV but didn't finish.

Without a strong CV, most applications get rejected.

Let me help you complete it today.`;
  }

  return `👋 You were almost there!

Your opportunity abroad is still waiting.

Don't let delays cost you.

👉 Complete your process now:
https://workabroadhub.tech

Need help? Just reply here.`;
}

async function markSent(userId: number, event = 're_engagement_sent') {
  await pool.query(
    `INSERT INTO funnel_events (user_id, event, metadata)
     VALUES ($1, $2, $3)`,
    [userId, event, JSON.stringify({ sent_at: new Date().toISOString() })]
  );
}

// ── Score-based nudge ─────────────────────────────────────────────────────────
// Points: view_service = 5, click_service = 10, click_pay = 10.
// Fire once when score > 20 and user has no completed payment.
async function runScoredNudge() {
  try {
    const res = await pool.query<{ id: number; phone: string; score: number }>(`
      SELECT
        u.id,
        u.phone,
        COALESCE(SUM(
          CASE fe.event
            WHEN 'view_service'  THEN 5
            WHEN 'click_service' THEN 10
            WHEN 'click_pay'     THEN 10
            ELSE 0
          END
        ), 0) AS score
      FROM users u
      JOIN funnel_events fe ON fe.user_id = u.id
      WHERE u.phone IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM payments p
          WHERE p.user_id = u.id AND p.status = 'completed'
        )
        AND NOT EXISTS (
          SELECT 1 FROM funnel_events x
          WHERE x.user_id = u.id
            AND x.event = 'score_nudge_sent'
            AND (x.metadata->>'sent_at')::timestamptz > NOW() - INTERVAL '7 days'
        )
      GROUP BY u.id, u.phone
      HAVING SUM(
        CASE fe.event
          WHEN 'view_service'  THEN 5
          WHEN 'click_service' THEN 10
          WHEN 'click_pay'     THEN 10
          ELSE 0
        END
      ) > 20
    `);

    if (!res.rows.length) return;
    console.log(`[ReEngagement] Score nudge → ${res.rows.length} user(s)`);

    for (const user of res.rows) {
      await sendWhatsApp(
        user.phone,
        `🔥 You're close! Finish your application today and get priority support.`
      );
      await markSent(user.id, 'score_nudge_sent');
    }
  } catch (err: any) {
    console.error("[ReEngagement] Score nudge error:", err.message);
  }
}

async function runReEngagement() {
  try {
    const abandonedUsers = await getAbandonedUsers();
    if (!abandonedUsers.length) return;

    console.log(`[ReEngagement] Sending to ${abandonedUsers.length} abandoned user(s)`);

    for (const user of abandonedUsers) {
      await sendWhatsApp(user.phone, getMessage(user.service_name));
      await markSent(user.id);
    }
  } catch (err: any) {
    console.error("[ReEngagement] Error:", err.message);
  }
}

export function startReEngagementScheduler() {
  console.log(`[ReEngagement] Scheduler started (hourly, ${MIN_IDLE_HOURS}h idle threshold, ${COOLDOWN_DAYS}d cooldown)`);
  setInterval(runReEngagement, INTERVAL_MS);
  setInterval(runScoredNudge, INTERVAL_MS);
}
