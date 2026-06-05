import type { Express, Request, Response } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "../../db";
import { users } from "@shared/models/auth";
import { sendEmail } from "../../email";
import { validateEmail } from "../../utils/email-validator";
import { validatePhone } from "../../utils/phone-validator";
import {
  sendEmailVerificationCode,
  sendSmsVerificationCode,
  verifyCode,
} from "../../services/identityVerification";
import {
  recordPwaEvent,
  getPwaStatus,
  type PwaEventType,
} from "../../services/pwaInstallTracking";

// Email + password auth routes (replaces the disabled stub).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function appBaseUrl(): string {
  const explicit = (process.env.APP_URL || "").trim().replace(/\/+$/, "");
  if (explicit) return explicit;
  // Production fallback when APP_URL is not configured — used for password
  // reset email links etc. Set APP_URL in Render → Environment for new hosts.
  return "https://workabroadhub.tech";
}

function setSessionUserId(req: Request, userId: string): Promise<void> {
  return new Promise((resolve) => {
    (req.session as any).customUserId = userId;
    if (typeof req.session?.save === "function") {
      req.session.save(() => resolve());
    } else {
      resolve();
    }
  });
}

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const rawEmail = String(req.body?.email ?? "").trim().toLowerCase();
      const password = String(req.body?.password ?? "");
      const firstName = req.body?.firstName ? String(req.body.firstName).trim() : null;
      const lastName  = req.body?.lastName  ? String(req.body.lastName).trim()  : null;

      // Real-identity email validation: blocks disposable/throwaway providers,
      // verifies the domain actually accepts mail (MX records), and rejects
      // obvious test patterns (test@test.com etc.).
      const emailCheck = await validateEmail(rawEmail);
      if (!emailCheck.valid) {
        return res.status(400).json({ message: emailCheck.message, reason: emailCheck.reason });
      }
      const cleanEmail = emailCheck.normalized;

      if (!password || password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters." });
      }

      const [existing] = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
      if (existing) {
        return res.status(409).json({ message: "An account with that email already exists. Try signing in instead." });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const [created] = await db
        .insert(users)
        .values({ email: cleanEmail, passwordHash, authMethod: "email", firstName, lastName })
        .returning();

      if (!created) {
        return res.status(500).json({ message: "Could not create your account. Please try again." });
      }

      await setSessionUserId(req, created.id);

      // Fire-and-forget: send email verification code so user can verify on next page.
      // Don't block registration response on email delivery — surfaces as a non-fatal
      // toast on the client. The user can also request a re-send from /verify-email.
      sendEmailVerificationCode(created.id, cleanEmail).catch((e) =>
        console.warn("[Auth][register] verification email failed:", e?.message),
      );

      res.json({
        id: created.id,
        email: created.email,
        emailVerified: false,
        phoneVerified: false,
        needsVerification: true,
      });
    } catch (err: any) {
      console.error("[Auth][register] error:", err?.message);
      if (err?.code === "23505") {
        return res.status(409).json({ message: "An account with that email already exists. Try signing in instead." });
      }
      res.status(500).json({ message: "Registration failed. Please try again." });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const rawEmail = String(req.body?.email ?? "").trim().toLowerCase();
      const password = String(req.body?.password ?? "");

      if (!rawEmail || !password) {
        return res.status(400).json({ message: "Email and password are required." });
      }

      const [user] = await db.select().from(users).where(eq(users.email, rawEmail)).limit(1);
      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "Invalid email or password." });
      }

      // Block deleted (anonymised) accounts — password_hash is wiped on
      // deletion so the bcrypt check below would already fail, but the
      // is_active flag is the authoritative gate. Return a soft error
      // matching the wording in case a user re-uses an email we anonymised.
      if (user.isActive === false) {
        return res.status(403).json({
          message: "This account has been deleted. Please sign up with a new account.",
          accountDeleted: true,
        });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ message: "Invalid email or password." });
      }

      await setSessionUserId(req, user.id);
      res.json({ id: user.id, email: user.email });
    } catch (err: any) {
      console.error("[Auth][login] error:", err?.message);
      res.status(500).json({ message: "Login failed. Please try again." });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    if (typeof req.session?.destroy === "function") {
      req.session.destroy(() => res.json({ success: true }));
    } else {
      res.json({ success: true });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // POST /api/auth/delete-account
  //
  // GDPR-style right-to-be-forgotten for users who want to leave the platform
  // entirely. Anonymises (does NOT hard-delete) the user record so payment
  // and order history are preserved for KRA tax compliance, but every piece
  // of PII is scrubbed:
  //
  //   users row:
  //     email           -> deleted-<id>@deleted.workabroadhub.local
  //     first/last name -> "Deleted" / "User"
  //     phone           -> NULL
  //     profile_image_url, country -> NULL
  //     password_hash   -> NULL  (can no longer log in)
  //     is_active       -> false
  //     email_verified  -> false
  //     deleted_at      -> NOW()
  //     deletion_reason -> user-supplied text or "no reason given"
  //
  //   verification_codes for this user -> hard delete
  //   active_sessions for this user    -> hard delete
  //   service_orders for this user     -> PII columns scrubbed (cv_text,
  //                                       extra_input, job_description) but
  //                                       order audit row stays so revenue
  //                                       reports remain accurate
  //   payments                         -> PRESERVED for KRA tax compliance
  //
  // Safety:
  //   • User MUST be signed in
  //   • Body MUST include confirmEmail that matches their current email
  //   • Admins are blocked from using this endpoint (use SQL or a separate
  //     admin-takedown flow to remove an admin so we don't accidentally
  //     orphan the platform)
  //   • A "your account was deleted" confirmation email is sent BEFORE we
  //     scrub the email column — gives the user a paper trail and tips
  //     them off if someone hijacked their session to delete the account
  //   • Session is destroyed atomically with the DB scrub
  // ───────────────────────────────────────────────────────────────────────────
  app.post("/api/auth/delete-account", async (req: Request, res: Response) => {
    const userId = (req.session as any)?.customUserId as string | undefined;
    if (!userId) {
      return res.status(401).json({ message: "Please sign in first." });
    }

    try {
      // Idempotent schema widener — adds deletion columns if not yet present.
      // Mirrors the pattern in server/services/pwaInstallTracking.ts.
      await pool.query(`
        ALTER TABLE users
          ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMPTZ NULL,
          ADD COLUMN IF NOT EXISTS deletion_reason VARCHAR(500) NULL
      `).catch((e) => console.warn("[Auth][delete-account] schema widener:", e?.message));

      // Fetch the current user.
      const { rows } = await pool.query<{
        id: string;
        email: string;
        is_admin: boolean;
        role: string;
        deleted_at: Date | null;
      }>(
        `SELECT id, email, is_admin, role, deleted_at FROM users WHERE id = $1`,
        [userId],
      );
      const u = rows[0];
      if (!u) {
        return res.status(404).json({ message: "User not found." });
      }
      if (u.deleted_at) {
        return res.status(410).json({ message: "Account is already deleted." });
      }

      // Admin block — admins must be removed via SQL or a separate flow.
      const isAdmin = u.is_admin || u.role === "ADMIN" || u.role === "SUPER_ADMIN";
      if (isAdmin) {
        return res.status(403).json({
          message: "Admin accounts cannot be deleted via this endpoint. Contact support to transfer admin rights first.",
        });
      }

      // Confirmation check — user must type their email exactly.
      const confirmEmail = String(req.body?.confirmEmail ?? "").trim().toLowerCase();
      if (!confirmEmail) {
        return res.status(400).json({
          message: "Please type your email address to confirm deletion.",
        });
      }
      if (confirmEmail !== String(u.email ?? "").trim().toLowerCase()) {
        return res.status(400).json({
          message: "Email confirmation does not match your account email. Type your email exactly to confirm.",
        });
      }

      const reason = String(req.body?.reason ?? "").trim().slice(0, 500) || "no reason given";

      // Send the "your account is deleted" confirmation email FIRST, while we
      // still know where to send it. Fire-and-forget — we don't want a flaky
      // SMTP step to block the actual deletion.
      const originalEmail = u.email;
      const html = `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:auto;padding:24px;color:#1a2530;">
        <h2 style="margin:0 0 12px;">Your WorkAbroad Hub account has been deleted</h2>
        <p>Hi,</p>
        <p>This is a confirmation that your account associated with this email address was permanently deleted on ${new Date().toUTCString()}.</p>
        <p>What was removed:</p>
        <ul>
          <li>Your name, email, phone number, and profile</li>
          <li>Your login credentials (you can no longer sign in)</li>
          <li>The text of any CVs you uploaded</li>
        </ul>
        <p>What was kept (for Kenya Revenue Authority tax compliance):</p>
        <ul>
          <li>Anonymised payment records — these no longer contain your name or contact details</li>
        </ul>
        <p>If you did NOT request this deletion, please reply to this email immediately.</p>
        <p style="margin-top:32px;font-size:13px;color:#475569;">— The WorkAbroad Hub team</p>
      </div>`;
      const text = `Your WorkAbroad Hub account associated with this email address was permanently deleted on ${new Date().toUTCString()}.\n\nIf you did NOT request this deletion, please reply to this email immediately.`;
      sendEmail({
        to: originalEmail,
        subject: "Your WorkAbroad Hub account has been deleted",
        html,
        text,
      }).catch((err: any) => {
        console.warn("[Auth][delete-account] confirmation email failed:", err?.message);
      });

      // ── Atomic scrub via a single transaction ────────────────────────────
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // 1) Anonymise the user row.
        await client.query(
          `UPDATE users
              SET email             = 'deleted-' || id || '@deleted.workabroadhub.local',
                  phone             = NULL,
                  first_name        = 'Deleted',
                  last_name         = 'User',
                  profile_image_url = NULL,
                  country           = NULL,
                  password_hash     = NULL,
                  is_active         = false,
                  email_verified    = false,
                  phone_verified    = false,
                  deleted_at        = NOW(),
                  deletion_reason   = $2,
                  updated_at        = NOW()
            WHERE id = $1`,
          [userId, reason],
        );

        // 2) Wipe verification codes (no longer needed).
        await client.query(
          `DELETE FROM verification_codes WHERE user_id = $1`,
          [userId],
        ).catch((e) => console.warn("[Auth][delete-account] verification_codes:", e?.message));

        // 3) Wipe active sessions (logs them out everywhere).
        await client.query(
          `DELETE FROM active_sessions WHERE user_id = $1`,
          [userId],
        ).catch((e) => console.warn("[Auth][delete-account] active_sessions:", e?.message));

        // 4) Scrub PII from service_orders but keep the audit row.
        await client.query(
          `UPDATE service_orders
              SET cv_text         = NULL,
                  extra_input     = NULL,
                  job_description = NULL,
                  output_text     = NULL,
                  updated_at      = NOW()
            WHERE user_id = $1`,
          [userId],
        ).catch((e) => console.warn("[Auth][delete-account] service_orders scrub:", e?.message));

        await client.query("COMMIT");
      } catch (txErr: any) {
        await client.query("ROLLBACK").catch(() => {});
        throw txErr;
      } finally {
        client.release();
      }

      console.log(`[Auth][delete-account] userId=${userId} anonymised. reason="${reason}"`);

      // Destroy the session so the next request is unauthenticated.
      const sess = req.session as any;
      if (sess && typeof sess.destroy === "function") {
        sess.destroy(() => {
          res.clearCookie("connect.sid");
          res.json({ ok: true, message: "Your account has been deleted." });
        });
      } else {
        res.json({ ok: true, message: "Your account has been deleted." });
      }
    } catch (err: any) {
      console.error("[Auth][delete-account] failed:", err?.message);
      res.status(500).json({ message: "Could not delete account. Please try again or contact support." });
    }
  });

  app.get("/api/auth/user", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.customUserId as string | undefined;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (user) {
        // ── Admin bypass ────────────────────────────────────────────────────
        // Admins (is_admin=true OR role in ADMIN/SUPER_ADMIN) must look like
        // Pro users to every client component so they can test/QA every paid
        // service without the "Upgrade to Pro" prompts. We override plan +
        // subscription flags + verification flags on the response only —
        // the DB values stay untouched.
        const isAdminUser =
          user.isAdmin === true ||
          user.role === "ADMIN" ||
          user.role === "SUPER_ADMIN";
        if (isAdminUser) {
          return res.json({
            ...user,
            plan: "pro",
            subscriptionStatus: "active",
            emailVerified: true,
            phoneVerified: true,
            isAdminBypass: true,
          });
        }
        return res.json(user);
      }
      // No user row matches the session userId — stale session, destroy it
      const sess = req.session as any;
      if (sess && typeof sess.destroy === "function") {
        sess.destroy(() => {
          res.clearCookie("connect.sid");
          res.status(401).json({ message: "Session expired. Please sign in again." });
        });
      } else {
        res.status(401).json({ message: "Session expired. Please sign in again." });
      }
    } catch (err: any) {
      // Defensive: this used to crash with no try/catch and produce a generic
      // 500 page on the client. Now we log the actual reason and surface it
      // to the client as 503 (transient) so the SPA can retry rather than
      // forcing a logout flow.
      console.error("[Auth][/api/auth/user] error:", err?.message, err?.code, err?.stack?.split("\n")[0]);
      res.status(503).json({
        message: "Temporary error fetching your session. Please retry.",
        code: err?.code ?? "auth_user_lookup_failed",
      });
    }
  });

  // Forgot password — always returns 200 to prevent email enumeration.
  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const rawEmail = String(req.body?.email ?? "").trim().toLowerCase();
      if (!rawEmail || !EMAIL_RE.test(rawEmail)) {
        return res.status(400).json({ message: "Please enter a valid email address." });
      }

      const [user] = await db.select().from(users).where(eq(users.email, rawEmail)).limit(1);

      if (user) {
        const token = crypto.randomBytes(48).toString("hex");
        const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

        // Invalidate prior unused tokens, then insert new one.
        await pool.query(
          `UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`,
          [user.id],
        );
        await pool.query(
          `INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
          [user.id, token, expiresAt],
        );

        const resetUrl = `${appBaseUrl()}/reset-password?token=${token}`;
        const name = (user.firstName || "there").toString();
        const html = `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:auto;padding:24px;color:#1a2530;"><h2 style="margin:0 0 12px;">Reset your WorkAbroad Hub password</h2><p>Hi ${name},</p><p>We received a request to reset the password for the account tied to <strong>${rawEmail}</strong>. Click the button below to set a new password. The link expires in 1 hour.</p><p style="margin:24px 0;"><a href="${resetUrl}" style="display:inline-block;background:#0f766e;color:#fff;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;">Reset password</a></p><p style="font-size:13px;color:#475569;">If the button does not work, copy this link into your browser:<br><a href="${resetUrl}" style="color:#1d4ed8;word-break:break-all;">${resetUrl}</a></p><p style="font-size:13px;color:#475569;">Did not ask for this? You can safely ignore this email — your password will not change unless you click the link above.</p><p style="margin-top:32px;font-size:13px;color:#475569;">— The WorkAbroad Hub team</p></div>`;
        const text = `Hi ${name},\n\nReset link (expires in 1 hour): ${resetUrl}\n\nDid not ask for this? Ignore this email.\n\n— WorkAbroad Hub`;

        sendEmail({ to: rawEmail, subject: "Reset your WorkAbroad Hub password", html, text })
          .catch((e: any) => console.error("[Auth][forgot-password] sendEmail failed:", e?.message));
      }

      res.json({ ok: true, message: "If an account exists for that email, a reset link has been sent." });
    } catch (err: any) {
      console.error("[Auth][forgot-password] error:", err?.message);
      res.json({ ok: true, message: "If an account exists for that email, a reset link has been sent." });
    }
  });

  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const token = String(req.body?.token ?? "").trim();
      const password = String(req.body?.password ?? "");

      if (!token || token.length < 32) {
        return res.status(400).json({ message: "Invalid or missing reset token." });
      }
      if (!password || password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters." });
      }

      const result = await pool.query(
        `SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token = $1 LIMIT 1`,
        [token],
      );
      const row = result.rows[0];
      if (!row) return res.status(400).json({ message: "This reset link is invalid. Request a new one." });
      if (row.used_at) return res.status(400).json({ message: "This reset link has already been used. Request a new one." });
      if (new Date(row.expires_at) < new Date()) {
        return res.status(400).json({ message: "This reset link has expired. Request a new one." });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      await pool.query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [passwordHash, row.user_id]);
      await pool.query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`, [row.id]);

      console.log(`[Auth][reset-password] Password updated for userId=${row.user_id}`);
      res.json({ ok: true, message: "Password updated. You can now sign in with your new password." });
    } catch (err: any) {
      console.error("[Auth][reset-password] error:", err?.message);
      res.status(500).json({ message: "Failed to reset password. Please try again." });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // IDENTITY VERIFICATION — email + phone OTP
  // Endpoints:
  //   POST /api/auth/send-email-code   — (re)send email OTP to current user
  //   POST /api/auth/send-phone-code   — validate phone via Twilio Lookup, then send SMS OTP
  //   POST /api/auth/verify-email      — submit 6-digit email code
  //   POST /api/auth/verify-phone      — submit 6-digit SMS code
  //   GET  /api/auth/verification-status — current email_verified / phone_verified flags
  // ──────────────────────────────────────────────────────────────────────────

  function getSessionUserId(req: Request): string | null {
    return ((req.session as any)?.customUserId as string | undefined) ?? null;
  }

  app.post("/api/auth/send-email-code", async (req: Request, res: Response) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Please sign in first." });
    const r = await pool.query<{ email: string; email_verified: boolean }>(
      `SELECT email, email_verified FROM users WHERE id = $1`,
      [userId],
    );
    const u = r.rows[0];
    if (!u) return res.status(404).json({ message: "User not found." });
    if (u.email_verified) return res.json({ ok: true, message: "Email already verified." });
    const result = await sendEmailVerificationCode(userId, u.email);
    if (!result.ok) return res.status(429).json({ message: result.message });
    res.json({ ok: true, message: "Verification code sent. Check your inbox." });
  });

  app.post("/api/auth/send-phone-code", async (req: Request, res: Response) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Please sign in first." });
    const rawPhone = String(req.body?.phone ?? "").trim();
    if (!rawPhone) return res.status(400).json({ message: "Phone number is required." });

    // Real-identity phone validation: format + Twilio Lookup (catches fake/disconnected numbers)
    const phoneCheck = await validatePhone(rawPhone);
    if (!phoneCheck.valid) {
      console.warn(`[send-phone-code] phone validation failed userId=${userId} raw=${rawPhone} reason=${phoneCheck.reason} msg=${phoneCheck.message}`);
      return res.status(400).json({ message: phoneCheck.message, reason: phoneCheck.reason });
    }
    const e164 = phoneCheck.e164;

    // Save the validated phone (so we know what to verify against later) BEFORE sending SMS
    await pool.query(`UPDATE users SET phone = $1, phone_verified = false, updated_at = NOW() WHERE id = $2`, [
      e164,
      userId,
    ]);

    const result = await sendSmsVerificationCode(userId, e164);

    // Map SMS-service failure codes to correct HTTP status codes so the client
    // shows the user a sensible error, not a misleading "Too Many Requests".
    if (!result.ok) {
      console.warn(`[send-phone-code] SMS send failed userId=${userId} phone=${e164} code=${result.code} message=${result.message}`);
      let status = 500;
      if (result.code === "rate_limited") status = 429;
      else if (result.code === "send_failed") status = 502;
      // If the failure is "SMS service is not configured", expose a clear hint
      // so admin can act, but keep the user-facing message friendly.
      const userMessage = result.code === "send_failed" && /not configured/i.test(result.message)
        ? "We're temporarily unable to send SMS codes. Please contact support@workabroadhub.tech and we'll verify you manually."
        : result.message;
      return res.status(status).json({ message: userMessage, code: result.code });
    }
    res.json({ ok: true, message: "Verification code sent via SMS.", phoneE164: e164 });
  });

  app.post("/api/auth/verify-email", async (req: Request, res: Response) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Please sign in first." });
    const code = String(req.body?.code ?? "");
    const result = await verifyCode(userId, "email", code);
    if (!result.ok) return res.status(400).json({ message: result.message, reason: result.reason });
    res.json({ ok: true, message: result.message });
  });

  app.post("/api/auth/verify-phone", async (req: Request, res: Response) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Please sign in first." });
    const code = String(req.body?.code ?? "");
    const result = await verifyCode(userId, "sms", code);
    if (!result.ok) return res.status(400).json({ message: result.message, reason: result.reason });
    res.json({ ok: true, message: result.message });
  });

  app.get("/api/auth/verification-status", async (req: Request, res: Response) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Please sign in first." });
    const r = await pool.query<{
      email: string;
      phone: string | null;
      email_verified: boolean;
      phone_verified: boolean;
      is_admin: boolean;
      role: string;
    }>(
      `SELECT email, phone, email_verified, phone_verified, is_admin, role FROM users WHERE id = $1`,
      [userId],
    );
    const u = r.rows[0];
    if (!u) return res.status(404).json({ message: "User not found." });
    const isAdmin = u.is_admin || u.role === "ADMIN" || u.role === "SUPER_ADMIN";
    // EMAIL-ONLY verification policy: phoneVerified is ALWAYS reported true
    // so the client never gates anything on it. Phone column is preserved
    // for M-Pesa STK push but is no longer a verification gate.
    res.json({
      email: u.email,
      phone: u.phone,
      emailVerified: u.email_verified || isAdmin,
      phoneVerified: true,
      isAdmin,
    });
  });

  // ── Admin override: mark a user phone-verified manually ──────────────────
  // Use this when SMS delivery is broken (Twilio not configured, account
  // suspended, A2P 10DLC pending, etc.) AND support has confirmed the user
  // owns the number through another channel (WhatsApp callback, etc.).
  app.post("/api/auth/admin/force-verify-phone", async (req: Request, res: Response) => {
    const userId = (req.session as any)?.customUserId as string | undefined;
    if (!userId) return res.status(401).json({ message: "Please sign in." });
    const me = await pool.query<{ is_admin: boolean; role: string }>(
      `SELECT is_admin, role FROM users WHERE id = $1`,
      [userId],
    );
    const isAdmin = me.rows[0]?.is_admin || me.rows[0]?.role === "ADMIN" || me.rows[0]?.role === "SUPER_ADMIN";
    if (!isAdmin) return res.status(403).json({ message: "Admin only." });

    const targetUserId = String(req.body?.userId ?? "").trim();
    const phone        = String(req.body?.phone  ?? "").trim();
    if (!targetUserId || !phone) {
      return res.status(400).json({ message: "userId and phone are required." });
    }
    await pool.query(
      `UPDATE users SET phone = $1, phone_verified = true, updated_at = NOW() WHERE id = $2`,
      [phone, targetUserId],
    );
    console.warn(`[Auth] ADMIN force-verified phone for userId=${targetUserId} phone=${phone} by admin=${userId}`);
    res.json({ ok: true, message: "Phone marked as verified." });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PWA install tracking
  //
  // The client calls these so we can answer "does this user have the app
  // installed on this device, or did they install it once and then uninstall?"
  // — used by the install prompt to swap copy between "Install our app?" and
  // "Looks like you removed the app — reinstall?".
  //
  // Both endpoints are silent no-ops for signed-out users so the client can
  // call them unconditionally without checking auth first.
  // ─────────────────────────────────────────────────────────────────────────
  app.post("/api/pwa/event", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.customUserId as string | undefined;
      const rawType = String(req.body?.type ?? "").trim();
      const allowed: PwaEventType[] = ["installed", "standalone-open", "uninstall-detected"];
      if (!allowed.includes(rawType as PwaEventType)) {
        return res.status(400).json({ ok: false, message: "Unknown event type." });
      }
      if (!userId) {
        // Signed-out — silently accept so the client doesn't have to branch.
        return res.json({ ok: true, recorded: false });
      }
      await recordPwaEvent(userId, rawType as PwaEventType);
      res.json({ ok: true, recorded: true });
    } catch (err: any) {
      console.warn("[Auth] /api/pwa/event error:", err?.message);
      res.json({ ok: true, recorded: false }); // never break the UI for telemetry
    }
  });

  app.get("/api/pwa/status", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.customUserId as string | undefined;
      if (!userId) {
        return res.json({
          installedAt: null,
          lastStandaloneAt: null,
          uninstallSeenAt: null,
          likelyUninstalled: false,
          signedIn: false,
        });
      }
      const status = await getPwaStatus(userId);
      res.json({ ...status, signedIn: true });
    } catch (err: any) {
      console.warn("[Auth] /api/pwa/status error:", err?.message);
      res.json({
        installedAt: null,
        lastStandaloneAt: null,
        uninstallSeenAt: null,
        likelyUninstalled: false,
        signedIn: false,
      });
    }
  });

  // Startup diagnostic — exposes whether SMS delivery is configured.
  const hasTwilio = Boolean(
    (process.env.TWILIO_ACCOUNT_SID || "").trim() &&
    (process.env.TWILIO_AUTH_TOKEN  || "").trim() &&
    ((process.env.TWILIO_SMS_FROM || "").trim() || (process.env.TWILIO_WHATSAPP_FROM || "").trim())
  );
  console.log(`[Auth] Twilio SMS configured: ${hasTwilio ? "YES" : "NO - phone OTP delivery will fail. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_SMS_FROM (or TWILIO_WHATSAPP_FROM) in Render env."}`);
  console.log("[Auth] Email/password routes registered: /api/auth/register, /api/auth/login, /api/auth/logout, /api/auth/user, /api/auth/forgot-password, /api/auth/reset-password, /api/auth/send-email-code, /api/auth/verify-email, /api/auth/verification-status, /api/pwa/event, /api/pwa/status");
}
