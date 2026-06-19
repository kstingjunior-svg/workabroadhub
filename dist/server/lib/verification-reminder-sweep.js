"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runVerificationReminderSweep = runVerificationReminderSweep;
exports.startVerificationReminderSweep = startVerificationReminderSweep;
exports.stopVerificationReminderSweep = stopVerificationReminderSweep;
/**
 * Verification reminder sweep — recovers signups who never clicked verify.
 *
 * Founder reported 535 unverified users in 24h on the Email Health page
 * (2026-06). Email delivery itself is fine (0 failures) — those users just
 * forgot to come back. Each one is a potential paying user we lost to
 * inbox-tab-clutter.
 *
 * This sweep runs every hour and sends ONE friendly reminder email to any
 * user who:
 *   - signed up between 6 and 48 hours ago, AND
 *   - hasn't yet verified their email, AND
 *   - hasn't already received a reminder (we mark them via a column on the
 *     users table or via a "reminded_at" payload on verification_codes).
 *
 * Cap: 1 reminder per user, ever. We don't want to spam — better to lose
 * a non-converter than annoy them into unsubscribing.
 *
 * 2026-06: built when applying the production audit recommendations.
 */
const db_1 = require("../db");
const email_1 = require("../email");
const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // every hour
const REMINDER_AGE_MIN_HOURS = 6; // don't pester instantly
const REMINDER_AGE_MAX_HOURS = 48; // give up after 2 days
const REMINDER_BATCH_LIMIT = 100; // per sweep — safety guard
let _timer = null;
let _isRunning = false;
async function runVerificationReminderSweep() {
    const start = Date.now();
    let candidates = 0;
    let remindersSent = 0;
    let errors = 0;
    try {
        // Best-effort: try to ensure the column exists so we don't double-remind.
        // ALTER IF NOT EXISTS is a no-op when the column is already there.
        await db_1.pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS verification_reminder_sent_at TIMESTAMP
    `).catch((err) => {
            console.warn("[verification-reminder] could not ALTER users:", err?.message);
        });
        // Find candidates — created 6-48h ago, NOT verified, NOT already reminded.
        const { rows } = await db_1.pool.query(`
      SELECT id, email, first_name
        FROM users
       WHERE email_verified = false
         AND verification_reminder_sent_at IS NULL
         AND created_at < NOW() - INTERVAL '${REMINDER_AGE_MIN_HOURS} hours'
         AND created_at > NOW() - INTERVAL '${REMINDER_AGE_MAX_HOURS} hours'
         AND email IS NOT NULL AND email <> ''
         AND email NOT LIKE '%@deleted.workabroadhub.local'
         AND is_active = true
       ORDER BY created_at ASC
       LIMIT ${REMINDER_BATCH_LIMIT}
    `);
        candidates = rows.length;
        if (candidates === 0) {
            return { candidates: 0, remindersSent: 0, errors: 0, durationMs: Date.now() - start };
        }
        for (const user of rows) {
            const name = (user.first_name || "").trim() || "there";
            // Pull their currently-valid code (or generate one if none active).
            // The verification-status route on the client also lets them request a
            // fresh code if this one expired — but pre-loading it in the email
            // saves a click.
            let codeForEmail = null;
            try {
                const codeRow = await db_1.pool.query(`
          SELECT code_hash FROM verification_codes
          WHERE user_id = $1 AND channel = 'email' AND used_at IS NULL
                AND expires_at > NOW()
          ORDER BY created_at DESC LIMIT 1
        `, [user.id]);
                // We only have the hash — can't recover the plaintext. The email
                // simply links them back to /verify so they can re-request a fresh
                // code if needed. That's still the right pattern (codes shouldn't
                // be replayable from old emails).
            }
            catch { /* non-fatal */ }
            const verifyUrl = `https://workabroadhub.tech/verify-email?email=${encodeURIComponent(user.email)}`;
            const html = `
        <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:auto;padding:24px;color:#1a2530;">
          <h2 style="margin:0 0 12px;color:#C2461E;">One quick thing, ${escapeHtml(name)}</h2>
          <p>You signed up at WorkAbroad Hub a couple of days ago but didn't get a chance to verify your email.</p>
          <p>It takes one tap — and unlocks the full app: verified jobs in 9 countries, CV check, salary comparison, and the country roadmap.</p>
          <p style="margin:24px 0;">
            <a href="${verifyUrl}"
               style="display:inline-block;background:#C2461E;color:#fff;font-weight:600;font-size:14px;
                      padding:12px 28px;border-radius:8px;text-decoration:none;">
              Verify my email →
            </a>
          </p>
          <p style="font-size:13px;color:#475569;">
            If you signed up by mistake, no action needed — we'll stop emailing you after this.
          </p>
          <p style="margin-top:32px;font-size:13px;color:#475569;">
            — Tony &amp; the WorkAbroad Hub team, Nairobi
          </p>
        </div>`;
            const text = `Hi ${name},\n\nYou signed up at WorkAbroad Hub a couple of days ago but didn't get a chance to verify your email.\n\nIt takes one tap — verify here: ${verifyUrl}\n\nVerifying unlocks the full app: verified jobs in 9 countries, CV check, salary comparison, country roadmap.\n\nIf you signed up by mistake, no action needed — we'll stop emailing you after this.\n\n— Tony & the WorkAbroad Hub team, Nairobi`;
            try {
                const result = await (0, email_1.sendEmail)({
                    to: user.email,
                    subject: "One quick thing — verify your WorkAbroad Hub email",
                    html,
                    text,
                });
                if (result.success) {
                    remindersSent++;
                    await db_1.pool.query(`UPDATE users SET verification_reminder_sent_at = NOW() WHERE id = $1`, [user.id]);
                }
                else {
                    errors++;
                    console.warn(`[verification-reminder] send failed for ${user.email}: ${result.error}`);
                }
            }
            catch (err) {
                errors++;
                console.warn(`[verification-reminder] exception for ${user.email}: ${err?.message}`);
            }
            // Tiny pause between sends so we don't bursting against SMTP rate limits
            await new Promise((r) => setTimeout(r, 250));
        }
        return { candidates, remindersSent, errors, durationMs: Date.now() - start };
    }
    catch (err) {
        console.error("[verification-reminder] sweep failed:", err?.message);
        return { candidates, remindersSent, errors: errors + 1, durationMs: Date.now() - start };
    }
}
function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c] || c));
}
function startVerificationReminderSweep() {
    if (_timer)
        return;
    console.log(`[verification-reminder] Started — running every ${SWEEP_INTERVAL_MS / 60000} min`);
    // First run 10 min after boot so we don't hammer SMTP during startup.
    setTimeout(async () => {
        if (_isRunning)
            return;
        _isRunning = true;
        try {
            const result = await runVerificationReminderSweep();
            if (result.remindersSent > 0 || result.errors > 0) {
                console.log(`[verification-reminder] First run: ${result.remindersSent} sent / ${result.errors} errors of ${result.candidates} candidates in ${result.durationMs}ms`);
            }
        }
        finally {
            _isRunning = false;
        }
    }, 10 * 60000);
    _timer = setInterval(async () => {
        if (_isRunning)
            return;
        _isRunning = true;
        try {
            const result = await runVerificationReminderSweep();
            if (result.remindersSent > 0 || result.errors > 0) {
                console.log(`[verification-reminder] ${result.remindersSent} sent / ${result.errors} errors of ${result.candidates} candidates in ${result.durationMs}ms`);
            }
        }
        catch (err) {
            console.error("[verification-reminder] tick failed:", err?.message);
        }
        finally {
            _isRunning = false;
        }
    }, SWEEP_INTERVAL_MS);
}
function stopVerificationReminderSweep() {
    if (_timer) {
        clearInterval(_timer);
        _timer = null;
        console.log("[verification-reminder] Stopped");
    }
}
