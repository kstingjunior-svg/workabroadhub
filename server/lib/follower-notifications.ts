/**
 * Kenya Careers — "Follow employer" vacancy alerts.
 *
 * 2026-10: until now, Follow / "Notify me" stored a signup in
 * employer_notify_signups but nothing ever emailed anyone (1,030 signups,
 * 0 notified). This module delivers the promise: when a REAL vacancy goes
 * live (open, not a seed row, employer approved, deadline not passed), each
 * follower of that employer gets one email per vacancy, with a one-click
 * unfollow link.
 *
 * Idempotent: follow_job_notifications(signup_id, job_id) is unique, and a
 * row is claimed BEFORE sending, so restarts / double triggers never send
 * twice. Hard-bounced addresses are skipped by sendEmail's suppression gate.
 */
import { pool } from "../db";
import { signFollowToken } from "./employer-directory";

const SITE = process.env.PUBLIC_SITE_URL || "https://workabroadhub.tech";
const MAX_PER_RUN = 400;

let tableReady: Promise<void> | null = null;
export function ensureFollowTables(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS follow_job_notifications (
          id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          signup_id  UUID NOT NULL,
          job_id     UUID NOT NULL,
          status     VARCHAR(20) NOT NULL DEFAULT 'pending',
          error      TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          sent_at    TIMESTAMP,
          UNIQUE (signup_id, job_id)
        )`);
      await pool.query(`ALTER TABLE follow_job_notifications ENABLE ROW LEVEL SECURITY`).catch(() => {});
      await pool.query(`REVOKE ALL ON follow_job_notifications FROM anon, authenticated`).catch(() => {});
      await pool.query(`ALTER TABLE employer_notify_signups ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMP`).catch(() => {});
    })().catch((e) => { tableReady = null; throw e; });
  }
  return tableReady;
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/**
 * Email followers about live vacancies. Pass a jobId to target one vacancy
 * (called right after publishing); omit it to sweep vacancies published in
 * the last 14 days (covers employers approved after they posted).
 */
export async function notifyFollowersOfLiveJobs(jobId?: string): Promise<{ sent: number; failed: number }> {
  await ensureFollowTables();
  const params: any[] = [];
  let jobFilter = `AND j.published_at > NOW() - INTERVAL '14 days'`;
  if (jobId) { params.push(jobId); jobFilter = `AND j.id = $1`; }

  const { rows } = await pool.query<{
    signup_id: string; email: string; job_id: string; title: string; county: string | null; town: string | null;
    company_name: string; deadline: Date | null;
  }>(`
    SELECT s.id AS signup_id, s.email, j.id AS job_id, j.title, j.county, j.town, c.name AS company_name, j.deadline
      FROM local_jobs j
      JOIN companies c ON c.id = j.company_id
      JOIN employer_notify_signups s ON s.company_id = c.id AND s.unsubscribed_at IS NULL
     WHERE j.status = 'open' AND COALESCE(j.is_seed, false) = false AND c.status = 'approved'
       AND (j.deadline IS NULL OR j.deadline >= (NOW() AT TIME ZONE 'Africa/Nairobi')::date)
       ${jobFilter}
       AND NOT EXISTS (SELECT 1 FROM follow_job_notifications n WHERE n.signup_id = s.id AND n.job_id = j.id)
     ORDER BY j.published_at ASC
     LIMIT ${MAX_PER_RUN}
  `, params);

  let sent = 0, failed = 0;
  if (!rows.length) return { sent, failed };
  const { sendEmail } = await import("../email");

  for (const r of rows) {
    // Claim first — a concurrent run loses the INSERT and skips.
    const claim = await pool.query(
      `INSERT INTO follow_job_notifications (signup_id, job_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id`,
      [r.signup_id, r.job_id],
    );
    if (!claim.rowCount) continue;
    const jobUrl = `${SITE}/kenya-careers/job/${r.job_id}`;
    const unfollowUrl = `${SITE}/api/local-jobs/follow/unsubscribe?token=${encodeURIComponent(signFollowToken(r.signup_id))}`;
    const where = [r.town, r.county].filter(Boolean).join(", ");
    const by = r.deadline ? new Date(r.deadline).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }) : null;
    try {
      const result = await sendEmail({
        to: r.email,
        subject: `${r.company_name} just posted a job: ${r.title}`,
        html: `
          <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:auto;padding:24px;color:#1a2530;">
            <p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;color:#0f766e;font-weight:600;">KENYA CAREERS · EMPLOYER YOU FOLLOW</p>
            <h2 style="margin:0 0 12px;">${esc(r.company_name)} is hiring</h2>
            <p style="font-size:16px;margin:0 0 4px;"><strong>${esc(r.title)}</strong></p>
            <p style="font-size:14px;color:#475569;margin:0 0 18px;">${esc(where || "Kenya")}${by ? ` · Apply by ${esc(by)}` : ""}</p>
            <a href="${jobUrl}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;">View the vacancy</a>
            <p style="font-size:12px;color:#94a3b8;margin-top:28px;">You're receiving this because you followed ${esc(r.company_name)} on WorkAbroad Hub Kenya Careers.
              <a href="${unfollowUrl}" style="color:#64748b;">Unfollow</a></p>
          </div>`,
        text: `${r.company_name} is hiring: ${r.title}${where ? ` (${where})` : ""}.\nView: ${jobUrl}\nUnfollow: ${unfollowUrl}`,
      });
      if (result?.success === false) throw new Error(result.error || "send failed");
      await pool.query(`UPDATE follow_job_notifications SET status = 'sent', sent_at = NOW() WHERE signup_id = $1 AND job_id = $2`, [r.signup_id, r.job_id]);
      await pool.query(`UPDATE employer_notify_signups SET notified_at = NOW() WHERE id = $1`, [r.signup_id]).catch(() => {});
      sent++;
    } catch (err: any) {
      failed++;
      await pool.query(`UPDATE follow_job_notifications SET status = 'failed', error = $3 WHERE signup_id = $1 AND job_id = $2`,
        [r.signup_id, r.job_id, String(err?.message ?? err).slice(0, 300)]).catch(() => {});
    }
    await new Promise((res) => setTimeout(res, 250)); // gentle on the email provider
  }
  console.log(`[follow-alerts] job=${jobId ?? "sweep"} sent=${sent} failed=${failed}`);
  return { sent, failed };
}

let sweepTimer: NodeJS.Timeout | null = null;
export function startFollowerAlertSweep(): void {
  if (sweepTimer) return;
  const run = () => notifyFollowersOfLiveJobs().catch((e) => console.warn("[follow-alerts] sweep failed:", e?.message));
  setTimeout(run, 90_000);
  sweepTimer = setInterval(run, 30 * 60_000);
  sweepTimer.unref?.();
}
