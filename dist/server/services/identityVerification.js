"use strict";
/**
 * Identity verification — email + SMS OTP send/verify flow.
 *
 * - Generates a 6-digit code, stores sha256 hash in DB
 * - Sends via sendEmail() or Twilio SMS
 * - Code expires in 10 minutes
 * - Max 5 verification attempts before a code is invalidated
 * - Rate limit: max 3 codes per destination per hour
 */
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmailVerificationCode = sendEmailVerificationCode;
exports.sendSmsVerificationCode = sendSmsVerificationCode;
exports.verifyCode = verifyCode;
exports.requireVerifiedForPayment = requireVerifiedForPayment;
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("../db");
const email_1 = require("../email");
// 2026-08 (Tony's "users can't verify" report): bumped from 10 → 30 minutes.
// Real behaviour: user gets email code, switches tab to check WhatsApp, sees
// notification, replies to friend, comes back 12 minutes later, enters code,
// gets "code expired" — thinks the site is broken. 30 min covers 95%+ of
// real-world lag between receiving and entering.
const CODE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_ATTEMPTS = 5;
// 2026-06: bumped from 3 to 6. Three was too aggressive — users hitting "resend"
// twice while panicking (one for "didn't arrive", one for spam-folder thinking)
// would lock themselves out for an hour. Six gives a reasonable buffer while
// still preventing pure abuse.
const MAX_CODES_PER_HOUR = 6;
function sha256(s) {
    return crypto_1.default.createHash("sha256").update(s).digest("hex");
}
function generateCode() {
    // 6 digits — leading zeros possible (000000..999999)
    return crypto_1.default.randomInt(0, 1000000).toString().padStart(6, "0");
}
async function exceededRateLimit(destination, channel) {
    const { rows } = await db_1.pool.query(`SELECT COUNT(*)::text AS count
       FROM verification_codes
      WHERE destination = $1
        AND channel = $2
        AND created_at > NOW() - INTERVAL '1 hour'`, [destination, channel]);
    return Number(rows[0]?.count ?? 0) >= MAX_CODES_PER_HOUR;
}
async function invalidatePriorCodes(userId, channel) {
    await db_1.pool.query(`UPDATE verification_codes
        SET used_at = NOW()
      WHERE user_id = $1 AND channel = $2 AND used_at IS NULL`, [userId, channel]);
}
/**
 * Generate + send an email verification code.
 */
async function sendEmailVerificationCode(userId, email) {
    const dest = email.trim().toLowerCase();
    if (await exceededRateLimit(dest, "email")) {
        return {
            ok: false,
            code: "rate_limited",
            message: "Too many verification codes requested. Please wait an hour and try again.",
        };
    }
    await invalidatePriorCodes(userId, "email");
    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);
    await db_1.pool.query(`INSERT INTO verification_codes (user_id, channel, destination, code_hash, expires_at)
     VALUES ($1, 'email', $2, $3, $4)`, [userId, dest, sha256(code), expiresAt]);
    // 2026-08 (Tony's "users can't find code in inbox/spam" report): less
    // spam-triggering subject + content. Gmail penalises "verification",
    // numeric codes in subject, and thin HTML — replaced with a plain
    // conversational subject and richer body that reads like a real
    // person wrote it.
    const html = `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:auto;padding:24px;color:#1a2530;line-height:1.55;">
    <p style="margin:0 0 16px;">Hi,</p>
    <p style="margin:0 0 16px;">Here's the sign-in code you asked for:</p>
    <p style="font-size:32px;font-weight:700;letter-spacing:8px;background:#f0fdf4;color:#15803d;text-align:center;padding:16px;border-radius:8px;margin:24px 0;">${code}</p>
    <p style="margin:0 0 16px;">Just type these 6 numbers on the WorkAbroadHub page to finish signing in. It works for 30 minutes.</p>
    <p style="margin:0 0 16px;color:#475569;font-size:13px;">Didn't ask for this? You can safely ignore this email — nothing will happen.</p>
    <p style="margin:24px 0 0;color:#475569;font-size:13px;">— Tony<br>WorkAbroad Hub, Nairobi<br><a href="https://workabroadhub.tech" style="color:#475569;">workabroadhub.tech</a></p>
  </div>`;
    const text = `Hi,\n\nHere's the sign-in code you asked for: ${code}\n\nJust type these 6 numbers on the WorkAbroadHub page to finish signing in. It works for 30 minutes.\n\nDidn't ask for this? You can safely ignore this email — nothing will happen.\n\n— Tony\nWorkAbroad Hub, Nairobi\nworkabroadhub.tech`;
    const result = await (0, email_1.sendEmail)({
        to: dest,
        // 2026-08: personal-sounding subject. Removed "verification" (spam trigger)
        // and removed the numeric code from the subject line (Gmail flags subjects
        // that look like OTPs from new senders). Personal name in subject +
        // simple ask reads as a real conversation.
        subject: `Your sign-in code from Tony`,
        html,
        text,
        replyTo: "support@workabroadhub.tech",
    });
    if (result.success)
        return { ok: true, codeHint: code.slice(-2) };
    console.error(`[Verification] email send failed for ${dest}: ${result.error}`);
    return {
        ok: false,
        code: "send_failed",
        message: "We couldn't deliver the verification code to your inbox. " +
            "Please check that your email is spelled correctly, then try again. " +
            "If it keeps failing, switch to SMS verification or contact support@workabroadhub.tech.",
    };
}
/**
 * Generate + send an SMS verification code via Twilio.
 */
async function sendSmsVerificationCode(userId, phone) {
    const dest = phone.trim();
    if (await exceededRateLimit(dest, "sms")) {
        return {
            ok: false,
            code: "rate_limited",
            message: "Too many verification codes requested. Please wait an hour and try again.",
        };
    }
    await invalidatePriorCodes(userId, "sms");
    const code = generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);
    await db_1.pool.query(`INSERT INTO verification_codes (user_id, channel, destination, code_hash, expires_at)
     VALUES ($1, 'sms', $2, $3, $4)`, [userId, dest, sha256(code), expiresAt]);
    const accountSid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
    const authToken = (process.env.TWILIO_AUTH_TOKEN || "").trim();
    const fromNumber = (process.env.TWILIO_SMS_FROM || process.env.TWILIO_WHATSAPP_FROM || "").trim();
    if (!accountSid || !authToken || !fromNumber) {
        return {
            ok: false,
            code: "send_failed",
            message: "SMS service is not configured. Please contact support.",
        };
    }
    try {
        const body = `Your WorkAbroad Hub verification code is ${code}. Expires in 10 minutes.`;
        const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
        const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
        const form = new URLSearchParams({ To: dest, From: fromNumber, Body: body });
        const res = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Basic ${credentials}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: form.toString(),
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) {
            const errBody = await res.text().catch(() => "");
            console.error(`[Verification] Twilio SMS failed status=${res.status} body=${errBody.slice(0, 200)}`);
            return { ok: false, code: "send_failed", message: "Could not send SMS code. Please try again." };
        }
        return { ok: true };
    }
    catch (err) {
        console.error("[Verification] SMS exception:", err.message);
        return { ok: false, code: "send_failed", message: "Could not send SMS code. Please try again." };
    }
}
/**
 * Verify a submitted code. On success, marks user's email_verified / phone_verified = true.
 */
async function verifyCode(userId, channel, submitted) {
    const clean = (submitted || "").replace(/\D/g, "").trim();
    if (clean.length !== 6) {
        return { ok: false, reason: "wrong_code", message: "Please enter the 6-digit code." };
    }
    const { rows } = await db_1.pool.query(`SELECT id, code_hash, attempts, expires_at, used_at
       FROM verification_codes
      WHERE user_id = $1 AND channel = $2
        AND used_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1`, [userId, channel]);
    const row = rows[0];
    if (!row) {
        return { ok: false, reason: "no_code", message: "No active verification code. Please tap Resend to get a fresh code." };
    }
    if (new Date(row.expires_at) < new Date()) {
        return { ok: false, reason: "expired", message: "This code has expired (30 min limit). Please tap Resend to get a fresh one." };
    }
    // 2026-08: helpful message when user is entering an OLD code from an
    // earlier email — every Resend invalidates prior codes, so if they
    // grabbed the code from an older email in their inbox it won't match
    // the current active hash. Guide them explicitly.
    if (row.attempts === 0) {
        // Log the first attempt so support can see who's hitting each failure mode.
        console.log(`[verify] first-attempt userId=${userId} channel=${channel} code_len=${clean.length}`);
    }
    if (row.attempts >= MAX_ATTEMPTS) {
        return {
            ok: false,
            reason: "too_many_attempts",
            message: "Too many failed attempts. Please request a new code.",
        };
    }
    if (sha256(clean) !== row.code_hash) {
        await db_1.pool.query(`UPDATE verification_codes SET attempts = attempts + 1 WHERE id = $1`, [row.id]);
        const left = MAX_ATTEMPTS - (row.attempts + 1);
        // 2026-08 (Tony's "can't verify" report): if this is the FIRST wrong
        // attempt, the user probably grabbed an OLD code from a previous email
        // (every Resend invalidates prior codes, so old email codes silently
        // become dead). Guide them to use the NEWEST email.
        const hint = row.attempts === 0
            ? " Tip: use the code from your MOST RECENT email — earlier codes stop working when you tap Resend."
            : "";
        console.warn(`[verify] wrong_code userId=${userId} channel=${channel} attempts=${row.attempts + 1}/${MAX_ATTEMPTS} left=${left}`);
        return {
            ok: false,
            reason: "wrong_code",
            message: left > 0
                ? `Incorrect code.${hint} ${left} attempt${left === 1 ? "" : "s"} left.`
                : "Too many failed attempts. Please tap Resend for a fresh code.",
        };
    }
    // Success — mark code used + update user
    await db_1.pool.query(`UPDATE verification_codes SET used_at = NOW() WHERE id = $1`, [row.id]);
    if (channel === "email") {
        await db_1.pool.query(`UPDATE users SET email_verified = true, email_verified_at = NOW(), updated_at = NOW() WHERE id = $1`, [userId]);
    }
    else {
        await db_1.pool.query(`UPDATE users SET phone_verified = true, phone_verified_at = NOW(), updated_at = NOW() WHERE id = $1`, [userId]);
    }
    // 2026-08 (Tony's "verify not responsive" report): drop the server-side
    // /api/auth/user cache for this user so the very next request returns the
    // fresh email_verified=true state instead of a stale unverified one.
    // Without this, the banner + Pro gates kept showing as unverified for
    // up to 5 s after a successful verify — users thought nothing happened
    // and hit Verify repeatedly, each time overwriting the same result.
    try {
        const { invalidateAuthUserCache } = await Promise.resolve().then(() => __importStar(require("../lib/auth-user-cache")));
        invalidateAuthUserCache(userId);
    }
    catch { /* non-fatal */ }
    return { ok: true, message: "Verified ✓" };
}
/**
 * Express middleware — block payment endpoints for unverified users.
 * Admins always bypass (their accounts are auto-verified by the migration).
 */
async function requireVerifiedForPayment(req, res, next) {
    const userId = req.user?.claims?.sub ?? req.user?.id;
    if (!userId)
        return res.status(401).json({ message: "Unauthorized" });
    try {
        const { rows } = await db_1.pool.query(`SELECT email_verified, phone_verified, is_admin, role FROM users WHERE id = $1`, [userId]);
        const u = rows[0];
        if (!u)
            return res.status(401).json({ message: "User not found" });
        // Admins always allowed
        if (u.is_admin || u.role === "ADMIN" || u.role === "SUPER_ADMIN")
            return next();
        // EMAIL-ONLY verification policy (per founder decision).
        // Phone verification was removed because the user already proves phone
        // ownership during M-Pesa STK push (PIN confirmation against their own
        // SIM). Requiring a second SMS-OTP step was redundant and broke when
        // Twilio's A2P 10DLC for Kenya was pending.
        if (!u.email_verified) {
            return res.status(403).json({
                message: "Please verify your email before making a payment.",
                verificationRequired: true,
                verificationStep: "email",
            });
        }
        return next();
    }
    catch (err) {
        console.error("[requireVerifiedForPayment] error:", err?.message ?? err);
        return res.status(500).json({ message: "Verification check failed." });
    }
}
