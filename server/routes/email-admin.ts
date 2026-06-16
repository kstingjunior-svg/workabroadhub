/**
 * Email diagnostic + emergency-verify endpoints (admin-only).
 *
 * Why: users have been reporting "I can't see my verification code". This
 * gives the admin tools to:
 *   - GET /api/admin/email/diagnostics        — provider config + recent attempts
 *   - POST /api/admin/email/test              — send a test email to any address
 *   - POST /api/admin/email/resend-code/:userId — resend verification code AND
 *                                                 return it to admin for manual relay
 *   - POST /api/admin/email/force-verify/:userId — emergency mark email_verified
 *
 * The /resend-code endpoint returns the code in plaintext IN THE RESPONSE so
 * the admin can read it over WhatsApp to a stuck user. This is intentional —
 * it's gated behind admin auth and only used when email delivery has failed.
 *
 * 2026-06: built in response to founder reporting users not seeing email codes.
 */
import type { Express, Response } from "express";
import crypto from "crypto";
import { pool } from "../db";
import { sendEmail } from "../email";
import { getRecentEmailAttempts, getProviderStats, getActiveSmtpProfile } from "../lib/email-providers";

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function registerEmailAdminRoutes(
  app: Express,
  isAuthenticated: any,
  isAdmin: any,
): void {
  // ─── 1. Provider diagnostic ─────────────────────────────────────────────
  app.get("/api/admin/email/diagnostics", isAuthenticated, isAdmin, async (_req, res: Response) => {
    const providers = getProviderStats();
    const recent = getRecentEmailAttempts(50);

    // Last 1h verification-code summary from DB
    let codesLastHour = 0;
    let unverifiedSignupsLast24h = 0;
    try {
      const a = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM verification_codes
         WHERE channel = 'email' AND created_at > NOW() - INTERVAL '1 hour'`,
      );
      codesLastHour = Number(a.rows[0]?.count ?? 0);
      const b = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM users
         WHERE email_verified = false
           AND created_at > NOW() - INTERVAL '24 hours'`,
      );
      unverifiedSignupsLast24h = Number(b.rows[0]?.count ?? 0);
    } catch (err: any) {
      console.warn("[email-admin/diagnostics] DB query failed:", err?.message);
    }

    res.json({
      providers,
      activeProfile: getActiveSmtpProfile(),
      configuredFrom: (process.env.SMTP_FROM || process.env.EMAIL_FROM || "").trim() || null,
      codesGeneratedLastHour: codesLastHour,
      unverifiedSignupsLast24h,
      recentAttempts: recent.map((a) => ({
        at: a.at,
        to: a.to.replace(/(.{2}).*(@.*)/, "$1***$2"),  // partial mask
        subject: a.subject,
        success: a.success,
        provider: a.provider,
        errorCode: a.errorCode,
        error: a.error?.slice(0, 200),
        durationMs: a.durationMs,
      })),
    });
  });

  // ─── 2. Test email ──────────────────────────────────────────────────────
  app.post("/api/admin/email/test", isAuthenticated, isAdmin, async (req, res: Response) => {
    const to = String(req.body?.to || "").trim();
    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return res.status(400).json({ message: "Provide a valid recipient email." });
    }
    const code = generateCode();
    const html = `<div style="font-family:sans-serif;padding:24px;">
      <h2>WorkAbroad Hub — Test Email</h2>
      <p>This is a test from the admin diagnostic tool.</p>
      <p>Test code: <strong style="font-size:24px;letter-spacing:6px;">${code}</strong></p>
      <p style="font-size:12px;color:#666;">Sent at: ${new Date().toISOString()}</p>
    </div>`;
    const result = await sendEmail({
      to,
      subject: `WorkAbroad Hub — Test Email (${code})`,
      html,
      text: `WorkAbroad Hub test email. Code: ${code}`,
    });
    res.json({
      success: result.success,
      messageId: result.messageId,
      error: result.error,
      to,
      testCode: code,                     // shown to admin for confirmation
    });
  });

  // ─── 3. Resend verification code (admin sees the code too) ──────────────
  app.post("/api/admin/email/resend-code/:userId", isAuthenticated, isAdmin, async (req, res: Response) => {
    const userId = String(req.params.userId);
    try {
      const r = await pool.query<{ email: string; email_verified: boolean; first_name: string | null }>(
        `SELECT email, email_verified, first_name FROM users WHERE id = $1`,
        [userId],
      );
      const u = r.rows[0];
      if (!u) return res.status(404).json({ message: "User not found" });
      if (u.email_verified) {
        return res.json({ ok: true, alreadyVerified: true, message: "User is already verified." });
      }

      // Invalidate prior codes + insert a fresh one
      await pool.query(
        `UPDATE verification_codes SET used_at = NOW()
         WHERE user_id = $1 AND channel = 'email' AND used_at IS NULL`,
        [userId],
      );
      const code = generateCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await pool.query(
        `INSERT INTO verification_codes (user_id, channel, destination, code_hash, expires_at)
         VALUES ($1, 'email', $2, $3, $4)`,
        [userId, u.email.toLowerCase(), sha256(code), expiresAt],
      );

      // Try to send via email
      const html = `<div style="font-family:sans-serif;padding:24px;">
        <h2>Your verification code (admin-resent)</h2>
        <p>Hi ${u.first_name || "there"},</p>
        <p>Here's a new verification code (sent at the request of our support team):</p>
        <p style="font-size:32px;letter-spacing:8px;background:#f0fdf4;color:#15803d;text-align:center;padding:16px;border-radius:8px;">
          <strong>${code}</strong>
        </p>
        <p>Enter this in the app to verify your email. Expires in 10 minutes.</p>
      </div>`;
      const sendResult = await sendEmail({
        to: u.email,
        subject: `Your WorkAbroad Hub verification code: ${code}`,
        html,
        text: `Your WorkAbroad Hub verification code: ${code}. Expires in 10 minutes.`,
      });

      // Always return the plaintext code so admin can WhatsApp/call it to the
      // user when email delivery is failing. This is the whole point of this
      // endpoint — gated behind admin auth.
      res.json({
        ok: true,
        emailSentSuccessfully: sendResult.success,
        sendError: sendResult.error,
        code,                          // ← plaintext for admin to relay manually
        expiresAt,
        userEmail: u.email,
        instructions: sendResult.success
          ? "Email sent. Tell the user to check inbox AND spam."
          : "Email did NOT send. Read this code to the user over phone/WhatsApp.",
      });
    } catch (err: any) {
      console.error("[email-admin/resend-code]", err?.message);
      res.status(500).json({ message: "Failed to generate code", error: err?.message });
    }
  });

  // ─── 4. Emergency force-verify (skip email entirely) ────────────────────
  app.post("/api/admin/email/force-verify/:userId", isAuthenticated, isAdmin, async (req, res: Response) => {
    const userId = String(req.params.userId);
    const reason = String(req.body?.reason || "admin-override").slice(0, 200);
    try {
      const r = await pool.query<{ email: string; email_verified: boolean }>(
        `SELECT email, email_verified FROM users WHERE id = $1`,
        [userId],
      );
      const u = r.rows[0];
      if (!u) return res.status(404).json({ message: "User not found" });
      if (u.email_verified) {
        return res.json({ ok: true, alreadyVerified: true });
      }
      await pool.query(
        `UPDATE users SET email_verified = true, email_verified_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [userId],
      );
      // Mark any outstanding codes used so they don't lock the user later
      await pool.query(
        `UPDATE verification_codes SET used_at = NOW()
         WHERE user_id = $1 AND channel = 'email' AND used_at IS NULL`,
        [userId],
      );
      console.log(`[email-admin/force-verify] userId=${userId} email=${u.email} reason="${reason}"`);
      res.json({
        ok: true,
        userId,
        email: u.email,
        reason,
        message: "Email forcibly marked as verified. User can now proceed without entering a code.",
      });
    } catch (err: any) {
      console.error("[email-admin/force-verify]", err?.message);
      res.status(500).json({ message: "Failed to force-verify", error: err?.message });
    }
  });

  console.log("[email-admin] Routes registered: /api/admin/email/{diagnostics,test,resend-code/:userId,force-verify/:userId}");
}
