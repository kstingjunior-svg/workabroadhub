/**
 * Single source of truth for which /api/* paths are exempt from the
 * "require verified email" wall — imported by BOTH:
 *
 *   - server/middleware/requireEmailVerifiedApi.ts — the actual enforcement.
 *     Every non-allowlisted /api/* call from an authenticated-but-unverified
 *     user gets a 403 here.
 *
 *   - client/src/lib/queryClient.ts — a client-side short-circuit. Once we
 *     know (from the already-cached /api/auth/user response) that the
 *     current user is unverified, there is no point letting dashboard
 *     widgets, notification polls, etc. keep firing requests the server is
 *     guaranteed to reject. Each of those wasted calls still costs a live
 *     Postgres round-trip inside requireEmailVerifiedApi, and at scale
 *     (many unverified users, each polling every 30s-2min for up to the
 *     72h auto-delete window) that adds up to a lot of pointless DB load
 *     and log noise — this is the real mechanism behind the "403 storm on
 *     ~15 different endpoints, every few seconds, for days" pattern Tony
 *     traced in September 2026. It was never a bug in DDoS protection,
 *     CSRF, or auth (all confirmed clean) — it was working-as-designed
 *     email verification enforcement, just with no client-side awareness
 *     to stop asking.
 *
 * 2026-09: keeping this list in ONE file that both sides import means the
 * client-side short-circuit can never silently drift out of sync with what
 * the server actually enforces. If you add a new allowlisted route on the
 * server, add it here — not in two places.
 */
export const EMAIL_VERIFICATION_ALLOWED_PREFIXES: readonly string[] = [
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
  "/api/auth/verification-status",
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
  "/api/track-live",
  // ── Payment gateway webhooks (server-to-server, no user session) ────────
  "/api/mpesa/callback",
  "/api/mpesa/b2c",
  "/api/payments/mpesa/callback",
  "/api/payments/paypal/webhook",
  "/api/paypal/webhook",
  // ── PWA / uptime bits ───────────────────────────────────────────────────
  "/api/pwa/event",
];

export function isEmailVerificationExempt(path: string): boolean {
  for (const p of EMAIL_VERIFICATION_ALLOWED_PREFIXES) {
    if (path === p || path.startsWith(p + "/") || path.startsWith(p + "?")) return true;
  }
  return false;
}
