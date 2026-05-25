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
      return res.status(400).json({ message: phoneCheck.message, reason: phoneCheck.reason });
    }
    const e164 = phoneCheck.e164;

    // Save the validated phone (so we know what to verify against later) BEFORE sending SMS
    await pool.query(`UPDATE users SET phone = $1, phone_verified = false, updated_at = NOW() WHERE id = $2`, [
      e164,
      userId,
    ]);

    const result = await sendSmsVerificationCode(userId, e164);
    if (!result.ok) return res.status(429).json({ message: result.message });
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
    res.json({
      email: u.email,
      phone: u.phone,
      emailVerified: u.email_verified || isAdmin,
      phoneVerified: u.phone_verified || isAdmin,
      isAdmin,
    });
  });

  console.log("[Auth] Email/password routes registered: /api/auth/register, /api/auth/login, /api/auth/logout, /api/auth/user, /api/auth/forgot-password, /api/auth/reset-password");
  console.log("[Auth] Verification routes registered: /api/auth/{send-email-code, send-phone-code, verify-email, verify-phone, verification-status}");
}
