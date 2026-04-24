import crypto from "crypto";
import type { Request, Response, NextFunction, RequestHandler } from "express";

// Routes that must be exempt from CSRF validation (external webhooks / OAuth redirects)
const CSRF_EXEMPT = new Set([
  "/api/mpesa/callback",
  "/api/mpesa/b2c/callback",
  "/api/mpesa/b2c/result",
  "/api/mpesa/b2c/timeout",
  "/api/login",
  "/api/callback",
  "/api/logout",
  "/api/whatsapp/webhook",
  "/api/whatsapp/voice",
  "/api/whatsapp/status",
  "/api/payments/mpesa/callback",
  "/api/payments/paypal/webhook",
  "/api/log/client-error",
  // Public pricing lookup — read-only, no state changes
  "/api/price",
  // AI endpoints — authenticated + PRO-gated; no destructive state changes
  "/api/generate-cover-letter",
  "/api/gpt-match",
  "/api/score-cv",
  "/api/prepare-application",
  // Passive telemetry — no destructive state changes
  "/api/track-live",
  "/api/track-event",
]);

function isCsrfExempt(path: string): boolean {
  if (CSRF_EXEMPT.has(path)) return true;
  // Exempt the entire /api/mpesa/* subtree (Safaricom callbacks hit various sub-paths)
  if (path.startsWith("/api/mpesa/")) return true;
  return false;
}

// Generate or retrieve the CSRF token for the current session.
// The token is created once per session and reused for its lifetime.
function getOrCreateToken(req: Request): string {
  const session = (req as any).session;
  if (!session) return "";
  if (!session.csrfToken) {
    session.csrfToken = crypto.randomBytes(32).toString("hex");
  }
  return session.csrfToken;
}

// GET /api/csrf-token — returns the token for the current session.
// The frontend calls this once on startup and caches the value.
export const csrfTokenEndpoint: RequestHandler = (req, res) => {
  const token = getOrCreateToken(req);
  // Save session so the token is persisted before the response reaches the client
  (req as any).session?.save?.(() => {
    res.json({ csrfToken: token });
  });
};

// Validation middleware — applies to all mutating API requests.
// Must be registered AFTER session middleware (i.e. after setupAuth).
export const validateCsrf: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  // Only validate mutating methods
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  // Only validate /api/* paths
  if (!req.path.startsWith("/api/")) return next();
  // Skip exempt routes (external webhooks, OAuth)
  if (isCsrfExempt(req.path)) return next();

  const session = (req as any).session;
  const sessionToken: string | undefined = session?.csrfToken;
  const headerToken = req.headers["x-csrf-token"] as string | undefined;

  if (!sessionToken || !headerToken) {
    console.warn(`[CSRF] Missing token | method=${req.method} path=${req.path} ip=${req.ip}`);
    return res.status(403).json({ message: "Invalid or missing CSRF token" });
  }

  // Constant-time comparison to prevent timing attacks
  const sessionBuf = Buffer.from(sessionToken, "hex");
  const headerBuf  = Buffer.from(headerToken,  "hex");

  const tokensMatch =
    sessionBuf.length === headerBuf.length &&
    sessionBuf.length === 32 &&
    crypto.timingSafeEqual(sessionBuf, headerBuf);

  if (!tokensMatch) {
    console.warn(`[CSRF] Token mismatch | method=${req.method} path=${req.path} ip=${req.ip}`);
    return res.status(403).json({ message: "Invalid or missing CSRF token" });
  }

  next();
};
