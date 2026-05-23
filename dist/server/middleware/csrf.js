"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateCsrf = exports.csrfTokenEndpoint = void 0;
const crypto_1 = __importDefault(require("crypto"));
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
    // Password recovery — protected by the one-time email token, not by session.
    // CSRF doesn't add real security here (the token IS the authorization);
    // rate limiting handles the only abuse vector (email spam).
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
]);
function isCsrfExempt(path) {
    if (CSRF_EXEMPT.has(path))
        return true;
    // Exempt the entire /api/mpesa/* subtree (Safaricom callbacks hit various sub-paths)
    if (path.startsWith("/api/mpesa/"))
        return true;
    return false;
}
// Generate or retrieve the CSRF token for the current session.
// The token is created once per session and reused for its lifetime.
function getOrCreateToken(req) {
    const session = req.session;
    if (!session)
        return "";
    if (!session.csrfToken) {
        session.csrfToken = crypto_1.default.randomBytes(32).toString("hex");
    }
    return session.csrfToken;
}
// GET /api/csrf-token — returns the token for the current session.
// The frontend calls this once on startup and caches the value.
const csrfTokenEndpoint = (req, res) => {
    const token = getOrCreateToken(req);
    // Save session so the token is persisted before the response reaches the client
    req.session?.save?.(() => {
        res.json({ csrfToken: token });
    });
};
exports.csrfTokenEndpoint = csrfTokenEndpoint;
// Validation middleware — applies to all mutating API requests.
// Must be registered AFTER session middleware (i.e. after setupAuth).
const validateCsrf = (req, res, next) => {
    // Only validate mutating methods
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method))
        return next();
    // Only validate /api/* paths
    if (!req.path.startsWith("/api/"))
        return next();
    // Skip exempt routes (external webhooks, OAuth)
    if (isCsrfExempt(req.path))
        return next();
    const session = req.session;
    const sessionToken = session?.csrfToken;
    const headerToken = req.headers["x-csrf-token"];
    if (!sessionToken || !headerToken) {
        console.warn(`[CSRF] Missing token | method=${req.method} path=${req.path} ip=${req.ip}`);
        return res.status(403).json({ message: "Invalid or missing CSRF token" });
    }
    // Constant-time comparison to prevent timing attacks
    const sessionBuf = Buffer.from(sessionToken, "hex");
    const headerBuf = Buffer.from(headerToken, "hex");
    const tokensMatch = sessionBuf.length === headerBuf.length &&
        sessionBuf.length === 32 &&
        crypto_1.default.timingSafeEqual(sessionBuf, headerBuf);
    if (!tokensMatch) {
        console.warn(`[CSRF] Token mismatch | method=${req.method} path=${req.path} ip=${req.ip}`);
        return res.status(403).json({ message: "Invalid or missing CSRF token" });
    }
    next();
};
exports.validateCsrf = validateCsrf;
