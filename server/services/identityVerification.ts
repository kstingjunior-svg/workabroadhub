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

// 2026-08 (Tony's "users can't verify" report): bumped from 10 → 30 minutes.
// Real behaviour: user gets email code, switches tab to check WhatsApp, sees
// notification, replies to friend, comes back 12 minutes later, enters code,
// gets "code expired" — thinks the site is broken. 30 min covers 95%+ of
// real-world lag between receiving and entering.
const CODE_TTL_MS = 30 * 60 * 1000;          // 30 minutes
const MAX_ATTEMPTS = 5;
// 2026-06: bumped from 3 to 6. Three was too aggressive — users hitting "resend"
// twice while panicking (one for "didn't arrive", one for spam-folder thinking)
// would lock themselves out for an hour. Six gives a reasonable buffer while
// still preventing pure abuse.
const MAX_CODES_PER_HOUR = 6;

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
  /**
   * 2026-08 (deliverability aid): last 2 digits of the code we just sent.
   * The client shows this to the user ("Look for a code ending in **52**")
   * so they can find the right email even when it's buried in Spam or
   * Promotions with 50 other emails.
   */
  codeHint?: string;
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

  // 2026-08 (Tony's "users can't find code in inbox/spam" report): less
  // spam-triggering subject + content. Gmail penalises "verification",
  // numeric codes in subject, and thin HTML — replaced with a plain
  // conversational subject and richer body that reads like a real
  // person wrote it.
  // 2026-10 (Tony): Netflix-style layout. Big brand header, prominent
  // "Enter this code to sign in" heading, large spaced code, expiry +
  // security line, signature. Table-based so Gmail/Outlook/Yahoo render
  // it the same way. Keeps the deliverability-friendly subject.
  const codeDigits = code.split("").map(d => `<td style="width:38px;height:48px;border:1px solid #e5e7eb;border-radius:6px;text-align:center;font-family:'Segoe UI',Arial,sans-serif;font-size:28px;font-weight:700;color:#111827;background:#ffffff;">${d}</td><td style="width:8px;">&nbsp;</td>`).join("");
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
          <tr><td style="background:#15803d;padding:20px 32px;">
            <div style="font-family:-apple-system,'Segoe UI',Arial,sans-serif;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">WorkAbroad<span style="color:#bbf7d0;">Hub</span></div>
          </td></tr>
          <tr><td style="padding:40px 32px 8px;">
            <h1 style="margin:0 0 8px;font-size:26px;font-weight:700;color:#111827;line-height:1.25;">Enter this code to sign in</h1>
          </td></tr>
          <tr><td style="padding:16px 32px 8px;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>${codeDigits}</tr></table>
          </td></tr>
          <tr><td style="padding:16px 32px 0;color:#374151;font-size:15px;line-height:1.55;">
            Enter the code above on WorkAbroadHub to finish signing in. This code will expire in 30 minutes.
          </td></tr>
          <tr><td style="padding:16px 32px 0;color:#374151;font-size:15px;line-height:1.55;">
            If you didn't request this, you can ignore this email — nothing will happen to your account.
          </td></tr>
          <tr><td style="padding:16px 32px 32px;color:#374151;font-size:15px;line-height:1.55;">
            To keep your account safe, please don't share this code with anyone.
          </td></tr>
          <tr><td style="padding:24px 32px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:13px;line-height:1.55;">
            <div style="font-weight:600;color:#374151;margin-bottom:4px;">The WorkAbroad Hub team</div>
            Nairobi, Kenya &middot; <a href="https://workabroadhub.tech" style="color:#15803d;text-decoration:none;">workabroadhub.tech</a>
          </td></tr>
        </table>
        <div style="max-width:560px;margin:16px auto 0;color:#9ca3af;font-size:12px;text-align:center;line-height:1.5;">
          This message was sent to ${dest} because a sign-in code was requested on WorkAbroadHub.
        </div>
      </td></tr>
    </table>
  </body></html>`;
  const text = `Enter this code to sign in\n\n${code}\n\nEnter the code above on WorkAbroadHub to finish signing in. This code will expire in 30 minutes.\n\nIf you didn't request this, you can ignore this email.\n\nTo keep your account safe, please don't share this code with anyone.\n\n— The WorkAbroad Hub team\nNairobi, Kenya\nworkabroadhub.tech`;

  const result = await sendEmail({
    to: dest,
    // 2026-08: personal-sounding subject. Removed "verification" (spam trigger)
    // and removed the numeric code from the subject line (Gmail flags subjects
    // that look like OTPs from new senders). Personal name in subject +
    // simple ask reads as a real conversation.
    subject: `Your sign-in code from Tony`,
    html,
    text,
    replyTo: "support@workabroadhub.tech",
  } as any);
  if (result.success) return { ok: true, codeHint: code.slice(-2) } as any;
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
 * 2026-09 (Tony: "clients are not seeing codes"): expose the code-mint
 * step WITHOUT sending an email. The verification-reminder sweep uses this
 * to embed a freshly-minted code directly in the reminder body so a user
 * who missed / lost the original code doesn't need to hunt through spam
 * or click "resend" — the reminder itself IS the code.
 *
 * Same DB behaviour as sendEmailVerificationCode: rate-limit check,
 * invalidate prior codes, hash + store, 30 min TTL. Just no email send.
 * Caller is responsible for delivering the returned code somehow.
 */
export async function mintEmailVerificationCode(
  userId: string,
  email: string,
): Promise<{ ok: true; code: string } | { ok: false; reason: "rate_limited" }> {
  const dest = email.trim().toLowerCase();
  if (await exceededRateLimit(dest, "email")) {
    return { ok: false, reason: "rate_limited" };
  }
  await invalidatePriorCodes(userId, "email");
  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await pool.query(
    `INSERT INTO verification_codes (user_id, channel, destination, code_hash, expires_at)
     VALUES ($1, 'email', $2, $3, $4)`,
    [userId, dest, sha256(code), expiresAt],
  );
  return { ok: true, code };
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
    await pool.query(`UPDATE verification_codes SET attempts = attempts + 1 WHERE id = $1`, [row.id]);
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

  // 2026-08 (Tony's "verify not responsive" report): drop the server-side
  // /api/auth/user cache for this user so the very next request returns the
  // fresh email_verified=true state instead of a stale unverified one.
  // Without this, the banner + Pro gates kept showing as unverified for
  // up to 5 s after a successful verify — users thought nothing happened
  // and hit Verify repeatedly, each time overwriting the same result.
  try {
    const { invalidateAuthUserCache } = await import("../lib/auth-user-cache");
    invalidateAuthUserCache(userId);
  } catch { /* non-fatal */ }

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
