/**
 * 2026-10 (Tony: "do it") — one-time "welcome back" email to paying
 * customers who never verified their email (720 people, May–Aug signups,
 * none signed in for 30+ days because the verify wall stopped them).
 *
 * Safety design (old addresses → bounce risk → sender reputation):
 *   • Drip: BATCH_SIZE every INTERVAL_MS (≈5h for 720).
 *   • Skips anyone on email_suppressions (hard bounces / complaints).
 *   • Auto-PAUSES if bounces among sent recipients exceed BOUNCE_PAUSE_RATE
 *     (bounce data arrives via the Resend webhook → email_suppressions).
 *   • Each user gets it at most once (campaign_email_log primary key).
 *   • Kill switch: WELCOME_BACK_DRIP=off.
 * The CTA opens one-tap code sign-in, which also verifies the email.
 */
import { pool } from "../db";
import { sendEmail } from "../email";

const CAMPAIGN = "welcome_back_paid_unverified_2026_10";
const BATCH_SIZE = 40;
const INTERVAL_MS = 15 * 60 * 1000;
const BOUNCE_PAUSE_RATE = 0.08;
const MIN_SENT_BEFORE_RATE_CHECK = 40;

let timer: NodeJS.Timeout | null = null;
let running = false;

function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
}

function buildEmail(name: string, email: string) {
  const url = `https://workabroadhub.tech/login?code=1&email=${encodeURIComponent(email)}`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#111827;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#15803d;padding:20px 32px;"><div style="font-size:22px;font-weight:800;color:#ffffff;">WorkAbroad<span style="color:#bbf7d0;">Hub</span></div></td></tr>
<tr><td style="padding:32px;font-size:15px;line-height:1.6;color:#374151;">
<p style="margin:0 0 16px;">Hi ${esc(name)},</p>
<p style="margin:0 0 16px;">Your WorkAbroad Hub account is still here, along with everything you've paid for. We've made signing in much easier since your last visit:</p>
<ul style="margin:0 0 16px;padding-left:20px;">
<li style="margin-bottom:6px;"><b>No password needed.</b> Tap the button below and we'll email you a 6-digit code.</li>
<li style="margin-bottom:6px;">You can also sign in with the <b>phone number</b> you registered with.</li>
</ul>
<p style="margin:24px 0;"><a href="${url}" style="display:inline-block;background:#15803d;color:#ffffff;font-weight:600;font-size:15px;padding:12px 28px;border-radius:8px;text-decoration:none;">Sign in to my account</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#6b7280;">Signing in this way also confirms your email address, so you won't be asked again.</p>
<p style="margin:0;">— Tony &amp; the WorkAbroad Hub team, Nairobi</p>
</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">You're receiving this one-time message because you have a paid WorkAbroad Hub account. Reply "stop" and we won't email you about this again.</td></tr>
</table></td></tr></table></body></html>`;
  const text = `Hi ${name},

Your WorkAbroad Hub account is still here, along with everything you've paid for. We've made signing in much easier since your last visit:

- No password needed. Open the link below and we'll email you a 6-digit code.
- You can also sign in with the phone number you registered with.

Sign in: ${url}

Signing in this way also confirms your email address, so you won't be asked again.

— Tony & the WorkAbroad Hub team, Nairobi

You're receiving this one-time message because you have a paid WorkAbroad Hub account. Reply "stop" and we won't email you about this again.`;
  return { html, text };
}

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS campaign_email_log (
      campaign   text        NOT NULL,
      user_id    varchar     NOT NULL,
      email      text        NOT NULL,
      status     text        NOT NULL,
      sent_at    timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (campaign, user_id)
    )`);
}

async function bounceRate(): Promise<{ sent: number; bounced: number }> {
  const { rows } = await pool.query<{ sent: string; bounced: string }>(
    `SELECT COUNT(*) FILTER (WHERE l.status = 'sent')::text AS sent,
            COUNT(*) FILTER (WHERE l.status = 'sent' AND EXISTS (
              SELECT 1 FROM email_suppressions s WHERE s.email_lower = LOWER(l.email)))::text AS bounced
       FROM campaign_email_log l WHERE l.campaign = $1`,
    [CAMPAIGN],
  );
  return { sent: Number(rows[0]?.sent ?? 0), bounced: Number(rows[0]?.bounced ?? 0) };
}

export async function runWelcomeBackBatch(): Promise<{ sent: number; failed: number; paused?: string; done?: boolean }> {
  await ensureTable();

  const paused = await pool.query(`SELECT 1 FROM campaign_email_log WHERE campaign = $1 AND user_id = '__paused__'`, [CAMPAIGN]);
  if ((paused.rowCount ?? 0) > 0) return { sent: 0, failed: 0, paused: "previously paused" };

  const br = await bounceRate();
  if (br.sent >= MIN_SENT_BEFORE_RATE_CHECK && br.bounced / br.sent > BOUNCE_PAUSE_RATE) {
    await pool.query(
      `INSERT INTO campaign_email_log (campaign, user_id, email, status) VALUES ($1, '__paused__', '', $2)
       ON CONFLICT DO NOTHING`,
      [CAMPAIGN, `paused: ${br.bounced}/${br.sent} bounced`],
    );
    console.warn(`[welcome-back] PAUSED — ${br.bounced}/${br.sent} bounced (> ${BOUNCE_PAUSE_RATE * 100}%)`);
    return { sent: 0, failed: 0, paused: `${br.bounced}/${br.sent} bounced` };
  }

  const { rows } = await pool.query<{ id: string; email: string; first_name: string | null }>(
    `SELECT u.id, u.email, u.first_name
       FROM users u
      WHERE u.email_verified = false AND u.is_active = true
        AND (u.is_admin IS NOT TRUE)
        AND (u.role IS NULL OR u.role NOT IN ('ADMIN','SUPER_ADMIN'))
        AND u.email IS NOT NULL AND u.email <> ''
        AND u.email NOT LIKE '%@deleted.workabroadhub.local'
        AND u.email NOT LIKE '%@merged.workabroadhub.local'
        AND EXISTS (SELECT 1 FROM payments p WHERE p.user_id = u.id AND p.status IN ('success','completed'))
        AND NOT EXISTS (SELECT 1 FROM campaign_email_log l WHERE l.campaign = $1 AND l.user_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM email_suppressions s WHERE s.email_lower = LOWER(u.email))
      ORDER BY u.last_login DESC NULLS LAST
      LIMIT $2`,
    [CAMPAIGN, BATCH_SIZE],
  );
  if (rows.length === 0) return { sent: 0, failed: 0, done: true };

  let sent = 0, failed = 0;
  for (const u of rows) {
    const name = (u.first_name || "").trim() || "there";
    const { html, text } = buildEmail(name, u.email.toLowerCase());
    // Claim the row first so a crash/restart can never double-send.
    const claim = await pool.query(
      `INSERT INTO campaign_email_log (campaign, user_id, email, status) VALUES ($1, $2, $3, 'sending')
       ON CONFLICT DO NOTHING`,
      [CAMPAIGN, u.id, u.email],
    );
    if ((claim.rowCount ?? 0) === 0) continue;
    try {
      const r = await sendEmail({ to: u.email, subject: "Your WorkAbroad Hub account is ready — signing in is easier now", html, text });
      await pool.query(`UPDATE campaign_email_log SET status = $3, sent_at = now() WHERE campaign = $1 AND user_id = $2`,
        [CAMPAIGN, u.id, r.success ? "sent" : "failed"]);
      if (r.success) sent++; else failed++;
    } catch {
      failed++;
      await pool.query(`UPDATE campaign_email_log SET status = 'failed' WHERE campaign = $1 AND user_id = $2`, [CAMPAIGN, u.id]).catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return { sent, failed };
}

export function startWelcomeBackDrip(): void {
  if (String(process.env.WELCOME_BACK_DRIP || "").toLowerCase() === "off") {
    console.log("[welcome-back] disabled via WELCOME_BACK_DRIP=off");
    return;
  }
  if (timer) return;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runWelcomeBackBatch();
      if (r.sent || r.failed || r.paused) console.log(`[welcome-back] batch: sent=${r.sent} failed=${r.failed}${r.paused ? ` paused=${r.paused}` : ""}`);
      if (r.done) {
        console.log("[welcome-back] campaign complete — stopping drip");
        if (timer) { clearInterval(timer); timer = null; }
      }
    } catch (e: any) {
      console.warn("[welcome-back] batch error:", e?.message);
    } finally {
      running = false;
    }
  };
  // First batch 5 min after boot (keeps startup + deploys quiet).
  setTimeout(tick, 5 * 60 * 1000);
  timer = setInterval(tick, INTERVAL_MS);
  console.log(`[welcome-back] drip scheduled: ${BATCH_SIZE} every ${INTERVAL_MS / 60000} min, auto-pause at ${BOUNCE_PAUSE_RATE * 100}% bounces`);
}
