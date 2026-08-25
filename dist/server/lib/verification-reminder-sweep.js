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
exports.runVerificationReminderSweep = void 0;
exports.runVerificationLifecycleSweep = runVerificationLifecycleSweep;
exports.startVerificationReminderSweep = startVerificationReminderSweep;
exports.stopVerificationReminderSweep = stopVerificationReminderSweep;
/**
 * Verification lifecycle sweep — escalating reminders + auto-delete at 72h.
 *
 * 2026-08 (Tony's fake-email + soft-delete request):
 *   - Immediate deletion is too harsh — someone might have signed up on a
 *     phone at bad signal, missed the email, and come back the next day.
 *   - Instead: 4 escalating reminders over 72 hours, then auto-delete only
 *     if they still haven't verified AND never paid.
 *
 * Reminder cadence (measured from users.created_at):
 *   • at signup:   the original "welcome — here's your code" email fires
 *                  from the signup route. This sweep does NOT re-send that.
 *   • +6h:         Reminder #1 — "Verify soon, ~66h until account deletion"
 *   • +24h:        Reminder #2 — "48h left"
 *   • +48h:        Reminder #3 — "24h left"
 *   • +66h:        Reminder #4 — "Final warning — 6h left"
 *   • +72h:        Auto-delete (respects the never-delete-paying-users guard)
 *
 * State tracking on users table (columns added on demand):
 *   verification_reminder_count      integer  DEFAULT 0
 *   last_verification_reminder_at    timestamp
 *
 * Guardrails baked in:
 *   • Never re-reminds within the same tier (checks count vs age bucket)
 *   • Never deletes paying users (EXISTS on payments where status=success/completed)
 *   • Never deletes admins or users with role ADMIN/SUPER_ADMIN
 *   • Batch caps + inter-send pauses avoid SMTP/WhatsApp burst limits
 *   • Fails-open on DB errors (never blocks the process)
 */
const db_1 = require("../db");
const email_1 = require("../email");
const SWEEP_INTERVAL_MS = 30 * 60 * 1000; // every 30 min
const BATCH_LIMIT = 100; // per sweep per stage
const SEND_PAUSE_MS = 250; // gap between sends
const DELETION_GRACE_HOURS = 72; // hard deletion cutoff
// Tier definitions: each has (name, min age hours, tier index).
// Tier index maps 1-to-1 to verification_reminder_count so we can skip
// people we've already reminded at that stage.
const TIERS = [
    { stage: 1, minAgeHours: 6, hoursLeftLabel: "66 hours", subject: "Verify your email to keep your WorkAbroadHub account", urgency: "gentle" },
    { stage: 2, minAgeHours: 24, hoursLeftLabel: "48 hours", subject: "Reminder — verify your email within 48 hours", urgency: "reminder" },
    { stage: 3, minAgeHours: 48, hoursLeftLabel: "24 hours", subject: "24 hours left to verify your WorkAbroadHub account", urgency: "warning" },
    { stage: 4, minAgeHours: 66, hoursLeftLabel: "6 hours", subject: "Final warning — verify in the next 6 hours", urgency: "final" },
];
let _timer = null;
let _isRunning = false;
// ── Templates ────────────────────────────────────────────────────────────────
function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c] || c));
}
function buildEmail(opts) {
    const { name, email, hoursLeftLabel, urgency } = opts;
    const verifyUrl = `https://workabroadhub.tech/account/verify?email=${encodeURIComponent(email)}`;
    const bannerColor = urgency === "final" ? "#B91C1C" :
        urgency === "warning" ? "#D97706" :
            urgency === "reminder" ? "#0F766E" :
                "#C2461E";
    const openingLine = urgency === "final"
        ? `<b>Final reminder</b> — your WorkAbroadHub account will be deleted in about <b>${hoursLeftLabel}</b> if the email is not verified.`
        : urgency === "warning"
            ? `Your unverified WorkAbroadHub account will be automatically deleted in about <b>${hoursLeftLabel}</b>.`
            : urgency === "reminder"
                ? `You started signing up on WorkAbroadHub but haven't verified your email yet. You have about <b>${hoursLeftLabel}</b> left before the account is auto-deleted.`
                : `Welcome ${escapeHtml(name)} — one small step left. Please verify your email so we can activate your account. If you don't verify within about <b>${hoursLeftLabel}</b>, the account will be automatically deleted.`;
    const html = `
    <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:auto;padding:24px;color:#1a2530;">
      <div style="background:${bannerColor};color:#fff;padding:14px 18px;border-radius:8px;margin-bottom:16px;font-weight:600;font-size:15px;">
        ${urgency === "final" ? "⚠ Final warning" : urgency === "warning" ? "24 hours remaining" : urgency === "reminder" ? "48 hours remaining" : "Please verify your email"}
      </div>
      <p>Hi ${escapeHtml(name)},</p>
      <p>${openingLine}</p>
      <p><b>What to do:</b> tap the button below, or open the app and enter the 6-digit code we sent when you signed up. If you can't find the code, request a new one on the verification page.</p>
      <p><b>Can't find our email?</b> Check your <b>Spam</b> or <b>Promotions</b> folder — the code comes from <code>noreply@workabroadhub.tech</code>.</p>
      <p style="margin:24px 0;">
        <a href="${verifyUrl}"
           style="display:inline-block;background:${bannerColor};color:#fff;font-weight:600;font-size:14px;
                  padding:12px 28px;border-radius:8px;text-decoration:none;">
          Verify my email →
        </a>
      </p>
      <p style="font-size:13px;color:#475569;">
        Signed up by mistake? No action needed — the account will be automatically deleted within ${hoursLeftLabel}.
      </p>
      <p style="margin-top:32px;font-size:13px;color:#475569;">
        — Tony &amp; the WorkAbroadHub team, Nairobi
      </p>
    </div>`;
    const text = `Hi ${name},\n\n${openingLine.replace(/<[^>]+>/g, "")}\n\nVerify here: ${verifyUrl}\n\nCan't find our email? Check your Spam or Promotions folder — the code comes from noreply@workabroadhub.tech.\n\nSigned up by mistake? No action needed — the account will be automatically deleted within ${hoursLeftLabel}.\n\n— Tony & the WorkAbroadHub team, Nairobi`;
    return { html, text };
}
// ── Schema hardening ─────────────────────────────────────────────────────────
async function ensureColumns() {
    await db_1.pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS verification_reminder_count integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_verification_reminder_at timestamp
  `).catch((err) => {
        console.warn("[verification-reminder] ALTER users failed:", err?.message);
    });
}
// ── Main sweep ───────────────────────────────────────────────────────────────
async function runVerificationLifecycleSweep() {
    const start = Date.now();
    let candidates = 0;
    let remindersSent = 0;
    let deletions = 0;
    let errors = 0;
    try {
        await ensureColumns();
        // ── Phase 1: process each reminder tier ────────────────────────────────
        for (const tier of TIERS) {
            const { rows } = await db_1.pool.query(`
        SELECT id, email, first_name, phone
          FROM users
         WHERE email_verified = false
           AND is_active = true
           AND (is_admin IS NOT TRUE)
           AND (role IS NULL OR role NOT IN ('ADMIN','SUPER_ADMIN'))
           AND verification_reminder_count < $1
           AND created_at <= NOW() - INTERVAL '${tier.minAgeHours} hours'
           AND created_at >  NOW() - INTERVAL '${DELETION_GRACE_HOURS} hours'
           AND email IS NOT NULL AND email <> ''
           AND email NOT LIKE '%@deleted.workabroadhub.local'
         ORDER BY created_at ASC
         LIMIT ${BATCH_LIMIT}
      `, [tier.stage]);
            candidates += rows.length;
            if (rows.length === 0)
                continue;
            for (const user of rows) {
                const name = (user.first_name || "").trim() || "there";
                const { html, text } = buildEmail({
                    name,
                    email: user.email,
                    hoursLeftLabel: tier.hoursLeftLabel,
                    urgency: tier.urgency,
                });
                try {
                    const result = await (0, email_1.sendEmail)({
                        to: user.email,
                        subject: tier.subject,
                        html,
                        text,
                    });
                    if (result.success) {
                        remindersSent++;
                        await db_1.pool.query(`UPDATE users
                  SET verification_reminder_count = $2,
                      last_verification_reminder_at = NOW()
                WHERE id = $1
                  AND verification_reminder_count < $2`, [user.id, tier.stage]);
                        // Best-effort WhatsApp reminder as well (only if phone present)
                        if (user.phone) {
                            try {
                                const { sendWhatsApp } = await Promise.resolve().then(() => __importStar(require("../services/whatsapp")));
                                const msg = tier.urgency === "final"
                                    ? `⚠ WorkAbroadHub: Final reminder. Your unverified account will be deleted in about ${tier.hoursLeftLabel}. Verify at workabroadhub.tech/account/verify or check spam for the code.`
                                    : `WorkAbroadHub: Please verify your email — ${tier.hoursLeftLabel} left before your unverified account is deleted. Check inbox or spam for the code, or verify at workabroadhub.tech/account/verify`;
                                await sendWhatsApp(user.phone, msg).catch(() => { });
                            }
                            catch { /* whatsapp module optional */ }
                        }
                    }
                    else {
                        errors++;
                        console.warn(`[verification-reminder] stage=${tier.stage} email send failed for ${user.email}: ${result.error}`);
                    }
                }
                catch (err) {
                    errors++;
                    console.warn(`[verification-reminder] stage=${tier.stage} exception for ${user.email}: ${err?.message}`);
                }
                await new Promise((r) => setTimeout(r, SEND_PAUSE_MS));
            }
        }
        // ── Phase 2: auto-delete unverified accounts past the 72h grace period ─
        // Guards:
        //   - Admins never deleted (role check + is_admin check).
        //   - Users with ANY successful payment never deleted (they gave us money;
        //     they need manual outreach to fix their email address).
        //   - Only if they're active AND still email_verified = false.
        // Note: DB has ON DELETE CASCADE on child rows (payments etc.), so the
        // paying-user guard is CRITICAL — without it, we'd delete their payment
        // history too. Test the guard by dry-running the SELECT first.
        //
        // 2026-08 (post-purge backlog): batch cap of 500 per sweep. Supabase's
        // statement timeout kills large one-shot deletes when child-row cascades
        // are heavy (referrals, sessions, activity_logs, etc.). Cap keeps each
        // sweep well under 30 s so it always finishes. A 19K-user backlog clears
        // in ~40 sweeps = ~20 hours at the current 30-min cadence, without any
        // manual intervention or SMTP burst.
        const DELETE_BATCH_CAP = 500;
        try {
            const { rows: doomed } = await db_1.pool.query(`
        WITH targets AS (
          SELECT id FROM users
           WHERE email_verified = false
             AND is_active = true
             AND (is_admin IS NOT TRUE)
             AND (role IS NULL OR role NOT IN ('ADMIN','SUPER_ADMIN'))
             AND created_at <= NOW() - INTERVAL '${DELETION_GRACE_HOURS} hours'
             AND NOT EXISTS (
               SELECT 1 FROM payments p
                WHERE p.user_id = users.id
                  AND p.status IN ('success','completed')
             )
           ORDER BY created_at ASC
           LIMIT ${DELETE_BATCH_CAP}
        )
        DELETE FROM users
         WHERE id IN (SELECT id FROM targets)
         RETURNING id, email
      `);
            deletions = doomed.length;
            if (deletions > 0) {
                console.warn(`[verification-reminder] Auto-deleted ${deletions} unverified account(s) past ${DELETION_GRACE_HOURS}h grace (batch cap ${DELETE_BATCH_CAP}): ` +
                    doomed.slice(0, 20).map((r) => r.email).join(", ") + (doomed.length > 20 ? `… (+${doomed.length - 20} more)` : ""));
            }
        }
        catch (err) {
            errors++;
            console.error("[verification-reminder] delete phase failed:", err?.message);
        }
        return { candidates, remindersSent, deletions, errors, durationMs: Date.now() - start };
    }
    catch (err) {
        console.error("[verification-reminder] sweep failed:", err?.message);
        return { candidates, remindersSent, deletions, errors: errors + 1, durationMs: Date.now() - start };
    }
}
// Backward-compat alias so existing imports keep working.
exports.runVerificationReminderSweep = runVerificationLifecycleSweep;
// ── Scheduler entry point ────────────────────────────────────────────────────
function startVerificationReminderSweep() {
    if (_timer)
        return;
    console.log(`[verification-reminder] Started — running every ${SWEEP_INTERVAL_MS / 60000} min. ` +
        `Reminders at 6h/24h/48h/66h; auto-delete at ${DELETION_GRACE_HOURS}h (paying users protected).`);
    // First run 3 min after boot so we don't hammer SMTP during startup.
    setTimeout(async () => {
        if (_isRunning)
            return;
        _isRunning = true;
        try {
            const r = await runVerificationLifecycleSweep();
            if (r.remindersSent > 0 || r.deletions > 0 || r.errors > 0) {
                console.log(`[verification-reminder] First run: ` +
                    `${r.remindersSent} reminders / ${r.deletions} deletions / ${r.errors} errors ` +
                    `(${r.candidates} candidates) in ${r.durationMs}ms`);
            }
        }
        finally {
            _isRunning = false;
        }
    }, 3 * 60000);
    _timer = setInterval(async () => {
        if (_isRunning)
            return;
        _isRunning = true;
        try {
            const r = await runVerificationLifecycleSweep();
            if (r.remindersSent > 0 || r.deletions > 0 || r.errors > 0) {
                console.log(`[verification-reminder] ` +
                    `${r.remindersSent} reminders / ${r.deletions} deletions / ${r.errors} errors ` +
                    `(${r.candidates} candidates) in ${r.durationMs}ms`);
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
