/**
 * requireEmailVerifiedApi — global wall for unverified accounts.
 *
 * 2026-08 (Tony's fake-email report): people were signing up with typo /
 * fake emails, skipping verification entirely, and using every free tool
 * on the platform. This middleware runs on every /api/* request and blocks
 * unverified authenticated users with a 403 that the client renders as
 * a banner + redirect to /verify-email.
 *
 * Design notes
 * ────────────
 *   • Only enforced for AUTHENTICATED requests. Anonymous users get their
 *     usual guest treatment (some free tools work anon; those routes handle
 *     the guest case themselves).
 *   • The allowlist below covers every endpoint the user NEEDS to hit while
 *     unverified — auth (login/register/logout), the verification flow
 *     itself (send-code, verify-email, verify-phone, /api/auth/user so the
 *     client can render "Hi <name>, please verify"), CSRF token, and health.
 *   • Admins bypass entirely.
 *   • On DB error we FAIL OPEN — never lock the whole platform out because
 *     of a transient Postgres blip.
 */

import type { RequestHandler } from "express";
import { pool } from "../db";
import { isEmailVerificationExempt } from "../../shared/email-verification-gate";


export const requireEmailVerifiedApi: RequestHandler = async (req: any, res, next) => {
  // Only guard /api routes — static assets, HTML entry, etc. must pass through.
  if (!req.path.startsWith("/api")) return next();

  // Allow the routes that unverified users need to complete verification.
  if (isEmailVerificationExempt(req.path)) return next();

  // Only enforce for authenticated sessions. Anonymous /api hits either fail
  // upstream (isAuthenticated) or are legitimate public reads.
  const userId: string | undefined =
    req.user?.claims?.sub ??
    req.user?.id ??
    (req.session as any)?.customUserId;
  if (!userId) return next();

  try {
    const { rows } = await pool.query<{
      email_verified: boolean;
      is_admin: boolean;
      role: string | null;
    }>(
      `SELECT email_verified, is_admin, role FROM users WHERE id = $1`,
      [userId],
    );
    const u = rows[0];
    // User not in DB — let downstream route decide (probably 401).
    if (!u) return next();
    // Admin bypass — never lock ourselves out.
    if (u.is_admin === true || u.role === "ADMIN" || u.role === "SUPER_ADMIN") return next();

    if (!u.email_verified) {
      return res.status(403).json({
        error: "email_verification_required",
        message: "Please verify your email address to continue using WorkAbroadHub. Check your inbox and spam folder for the verification code.",
        verificationRequired: true,
        verificationStep: "email",
        actionUrl: "/account/verify",
      });
    }
    return next();
  } catch (err: any) {
    // Fail open — never take down the whole app because of a DB blip.
    console.warn(`[requireEmailVerifiedApi] DB check failed, allowing through: ${err?.message}`);
    return next();
  }
};
