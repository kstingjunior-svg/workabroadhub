"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireEmailVerifiedApi = void 0;
const db_1 = require("../db");
// Substring/prefix allowlist. Paths that START WITH any of these are exempt.
// Kept generous so users can complete signup + verify + basic dashboard reads
// without hitting the wall.
const ALLOWED_PREFIXES = [
    // ── Session / identity — client must be able to read who it is ──────────
    "/api/auth/user",
    "/api/auth/session",
    "/api/csrf",
    "/api/csrf-token",
    // ── Auth entry / exit ───────────────────────────────────────────────────
    "/api/auth/login",
    "/api/auth/logout",
    "/api/logout",
    "/api/auth/register",
    "/api/auth/signup",
    "/api/auth/callback",
    "/api/callback",
    "/api/login",
    // ── Verification flow itself ────────────────────────────────────────────
    "/api/auth/verify-email",
    "/api/auth/verify-phone",
    "/api/auth/verification-status", // GET — /account/verify page reads status
    "/api/auth/send-email-code",
    "/api/auth/send-phone-code",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
    "/api/auth/delete-account",
    // ── Admin can also toggle verification out-of-band ──────────────────────
    "/api/auth/admin/force-verify-phone",
    // ── Ops / health / diagnostics ──────────────────────────────────────────
    "/api/health",
    "/api/log/client-error",
    "/api/track-live", // presence pings — must not be blocked
    // ── Payment gateway webhooks (server-to-server, no user session) ────────
    "/api/mpesa/callback",
    "/api/mpesa/b2c",
    "/api/payments/mpesa/callback",
    "/api/payments/paypal/webhook",
    "/api/paypal/webhook",
    // ── PWA / uptime bits ───────────────────────────────────────────────────
    "/api/pwa/event",
];
function isAllowed(path) {
    for (const p of ALLOWED_PREFIXES) {
        if (path === p || path.startsWith(p + "/") || path.startsWith(p + "?"))
            return true;
    }
    return false;
}
const requireEmailVerifiedApi = async (req, res, next) => {
    // Only guard /api routes — static assets, HTML entry, etc. must pass through.
    if (!req.path.startsWith("/api"))
        return next();
    // Allow the routes that unverified users need to complete verification.
    if (isAllowed(req.path))
        return next();
    // Only enforce for authenticated sessions. Anonymous /api hits either fail
    // upstream (isAuthenticated) or are legitimate public reads.
    const userId = req.user?.claims?.sub ??
        req.user?.id ??
        req.session?.customUserId;
    if (!userId)
        return next();
    try {
        const { rows } = await db_1.pool.query(`SELECT email_verified, is_admin, role FROM users WHERE id = $1`, [userId]);
        const u = rows[0];
        // User not in DB — let downstream route decide (probably 401).
        if (!u)
            return next();
        // Admin bypass — never lock ourselves out.
        if (u.is_admin === true || u.role === "ADMIN" || u.role === "SUPER_ADMIN")
            return next();
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
    }
    catch (err) {
        // Fail open — never take down the whole app because of a DB blip.
        console.warn(`[requireEmailVerifiedApi] DB check failed, allowing through: ${err?.message}`);
        return next();
    }
};
exports.requireEmailVerifiedApi = requireEmailVerifiedApi;
