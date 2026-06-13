/**
 * Identity verification — email + SMS OTP send/verify flow.
 *
 * - Generates a 6-digit code, stores sha256 hash in DB
 * - Sends via sendEmail() or Twilio SMS
 * - Code expires in 10 minutes
 * - Max 5 verification attempts before a code is invalidated
 * - Rate limit: max 3 codes per destination per hour
 */

import crypto from "crypto";
import { pool } from "../db";
import { sendEmail } from "../email";

const CODE_TTL_MS = 10 * 60 * 1000;          // 10 minutes
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_HOUR = 3;

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function generateCode(): string {
  // 6 digits — leading zeros possible (000000..999999)
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

async function exceededRateLimit(destination: string, channel: "email" | "sms"): Promise<boolean> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM verification_codes
      WHERE destination = $1
        AND channel = $2
        AND created_at > NOW() - INTERVAL '1 hour'`,
    [destination, channel],
  );
  return Number(rows[0]?.count ?? 0) >= MAX_CODES_PER_HOUR;
}

async function invalidatePriorCodes(userId: string, channel: "email" | "sms"): Promise<void> {
  await pool.query(
    `UPDATE verification_codes
        SET used_at = NOW()
      WHERE user_id = $1 AND channel = $2 AND used_at IS NULL`,
    [userId, channel],
  );
}

export interface SendCodeResult {
  ok: boolean;
  code?: "rate_limited" | "send_failed";
  message?: string;
}

/**
 * Generate + send an email verification code.
 */
export async function sendEmailVerificationCode(
  userId: string,
  email: string,
): Promise<SendCodeResult> {
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

  await pool.query(
    `INSERT INTO verification_codes (user_id, channel, destination, code_hash, expires_at)
     VALUES ($1, 'email', $2, $3, $4)`,
    [userId, dest, sha256(code), expiresAt],
  );

  const html = `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:auto;padding:24px;color:#1a2530;">
    <h2 style="margin:0 0 12px;">Your WorkAbroad Hub verification code</h2>
    <p>Enter this code in the app to verify your email address:</p>
    <p style="font-size:32px;font-weight:700;letter-spacing:8px;background:#f0fdf4;color:#15803d;text-align:center;padding:16px;border-radius:8px;margin:24px 0;">${code}</p>
    <p style="font-size:13px;color:#475569;">This code expires in 10 minutes. If you didn't request it, you can safely ignore this email.</p>
    <p style="margin-top:32px;font-size:13px;color:#475569;">— The WorkAbroad Hub team</p>
  </div>`;
  const text = `Your WorkAbroad Hub verification code: ${code}\nExpires in 10 minutes.\nIf you didn't request it, ignore this email.`;

  try {
    await sendEmail({ to: dest, subject: `Your WorkAbroad Hub verification code: ${code}`, html, text });
    return { ok: true };
  } catch (err: any) {
    console.error("[Verification] email send failed:", err.message);
    return { ok: false, code: "send_failed", message: "Could not send verification email. Please try again." };
  }
}

/**
 * Generate + send an SMS verification code via Twilio.
 */
export async function sendSmsVerificationCode(
  userId: string,
  phone: string,
): Promise<SendCodeResult> {
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

  await pool.query(
    `INSERT INTO verification_codes (user_id, channel, destination, code_hash, expires_at)
     VALUES ($1, 'sms', $2, $3, $4)`,
    [userId, dest, sha256(code), expiresAt],
  );

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
  } catch (err: any) {
    console.error("[Verification] SMS exception:", err.message);
    return { ok: false, code: "send_failed", message: "Could not send SMS code. Please try again." };
  }
}

export interface VerifyCodeResult {
  ok: boolean;
  reason?: "expired" | "too_many_attempts" | "wrong_code" | "no_code";
  message: string;
}

/**
 * Verify a submitted code. On success, marks user's email_verified / phone_verified = true.
 */
export async function verifyCode(
  userId: string,
  channel: "email" | "sms",
  submitted: string,
): Promise<VerifyCodeResult> {
  const clean = (submitted || "").replace(/\D/g, "").trim();
  if (clean.length !== 6) {
    return { ok: false, reason: "wrong_code", message: "Please enter the 6-digit code." };
  }

  const { rows } = await pool.query(
    `SELECT id, code_hash, attempts, expires_at, used_at
       FROM verification_codes
      WHERE user_id = $1 AND channel = $2
        AND used_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId, channel],
  );
  const row = rows[0];
  if (!row) {
    return { ok: false, reason: "no_code", message: "No active verification code. Please request a new one." };
  }
  if (new Date(row.expires_at) < new Date()) {
    return { ok: false, reason: "expired", message: "This code has expired. Please request a new one." };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    return {
      ok: false,
      reason: "too_many_attempts",
      message: "Too many failed attempts. Please request a new code.",
    };
  }

  if (sha256(clean) !== row.code_hash) {
    await pool.query(`UPDATE verification_codes SET attempts = attempts + 1 WHERE id = $1`, [row.id]);
    const left = MAX_ATTEMPTS - (row.attempts + 1);
    return {
      ok: false,
      reason: "wrong_code",
      message: left > 0
        ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.`
        : "Too many failed attempts. Please request a new code.",
    };
  }

  // Success — mark code used + update user
  await pool.query(`UPDATE verification_codes SET used_at = NOW() WHERE id = $1`, [row.id]);

  if (channel === "email") {
    await pool.query(
      `UPDATE users SET email_verified = true, email_verified_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [userId],
    );
  } else {
    await pool.query(
      `UPDATE users SET phone_verified = true, phone_verified_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [userId],
    );
  }

  return { ok: true, message: "Verified ✓" };
}

/**
 * Express middleware — block payment endpoints for unverified users.
 * Admins always bypass (their accounts are auto-verified by the migration).
 */
export async function requireVerifiedForPayment(req: any, res: any, next: any) {
  const userId: string | undefined = req.user?.claims?.sub ?? req.user?.id;
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  try {
    const { rows } = await pool.query<{
      email_verified: boolean;
      phone_verified: boolean;
      is_admin: boolean;
      role: string;
    }>(
      `SELECT email_verified, phone_verified, is_admin, role FROM users WHERE id = $1`,
      [userId],
    );
    const u = rows[0];
    if (!u) return res.status(401).json({ message: "User not found" });

    // Admins always allowed
    if (u.is_admin || u.role === "ADMIN" || u.role === "SUPER_ADMIN") return next();

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
  } catch (err: any) {
    console.error("[requireVerifiedForPayment] error:", err?.message ?? err);
    return res.status(500).json({ message: "Verification check failed." });
  }
}
