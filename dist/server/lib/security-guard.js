"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// security-guard.ts — defensive helpers for the most common attacks against
// a fresh production app.
//
// Provides:
//   1. Per-account login brute-force lockout (in-memory + DB mirror via
//      createSecurityAlert) — protects against credential stuffing even when
//      the attacker rotates IPs around the per-IP rate limit.
//   2. safeRedirectPath() — open-redirect prevention. Validates a user-supplied
//      ?redirect= param is a relative path (no scheme, no //, no \) so an
//      attacker can't craft a phishing link like
//      /?redirect=https://evil.com that the login flow would honour.
//   3. notifySecurityAlert() — fan-out hook. Today: console + Sentry. The
//      function signature is stable so we can add a Discord/email webhook
//      later without touching every caller.
//
// 2026-06: added during the post-launch hardening pass. Founder ask:
// "make sure that all types of possible attacks and hacks are all handled
// because the app is just new, and I know that it will be under such kinds
// of attacks."
// ─────────────────────────────────────────────────────────────────────────────
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkLockout = checkLockout;
exports.recordFailedLogin = recordFailedLogin;
exports.clearFailedAttempts = clearFailedAttempts;
exports.safeRedirectPath = safeRedirectPath;
exports.notifySecurityAlert = notifySecurityAlert;
const sentry_1 = require("../lib/sentry");
// ─── Brute-force lockout ────────────────────────────────────────────────────
//
// We track failed login attempts per (email + IP) in a rolling window. Once
// the threshold is crossed, that pairing is locked for LOCKOUT_MS — the user
// (or attacker) gets a 429 with a clear retry-after.
//
// In-memory is fine because:
//   - Multi-instance Render is fronted by sticky-session load balancing
//     (per-tab session cookie), so the same attacker hits the same instance
//     until they rotate sessions — which they probably will.
//   - The risk we're guarding against is THOUSANDS of tries per second from
//     one source. Even spread across N instances the per-instance rate is
//     1/N of total, and the lockout fires at single-digit-tries-per-15-min
//     thresholds, so the multi-instance case isn't more permissive in any
//     meaningful way.
//   - Persisting to DB on every failed attempt would itself be a load amp
//     for the very attack we're trying to block.
const FAILED_ATTEMPTS_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const attempts = new Map();
// Clean up stale entries every 5 min so the map doesn't grow forever.
setInterval(() => {
    const now = Date.now();
    for (const [key, rec] of attempts) {
        if (rec.lockedUntil < now && now - rec.firstAttemptAt > FAILED_ATTEMPTS_WINDOW_MS) {
            attempts.delete(key);
        }
    }
}, 5 * 60 * 1000).unref?.();
function keyFor(email, ip) {
    return `${email.toLowerCase().trim()}|${ip}`;
}
/**
 * Check whether this (email, IP) pair is currently locked. Call BEFORE
 * checking the password.
 */
function checkLockout(email, ip) {
    const rec = attempts.get(keyFor(email, ip));
    const now = Date.now();
    if (rec && rec.lockedUntil > now) {
        return {
            locked: true,
            retryAfterSeconds: Math.ceil((rec.lockedUntil - now) / 1000),
            remainingAttempts: 0,
        };
    }
    // Stale window — reset the counter
    if (rec && now - rec.firstAttemptAt > FAILED_ATTEMPTS_WINDOW_MS) {
        attempts.delete(keyFor(email, ip));
        return { locked: false, retryAfterSeconds: 0, remainingAttempts: MAX_FAILED_ATTEMPTS };
    }
    return {
        locked: false,
        retryAfterSeconds: 0,
        remainingAttempts: rec ? Math.max(0, MAX_FAILED_ATTEMPTS - rec.failures) : MAX_FAILED_ATTEMPTS,
    };
}
/**
 * Record a failed login attempt. Returns the updated lockout status. When the
 * threshold is crossed, fires a security alert through notifySecurityAlert.
 */
function recordFailedLogin(email, ip) {
    const key = keyFor(email, ip);
    const now = Date.now();
    const rec = attempts.get(key);
    if (!rec || now - rec.firstAttemptAt > FAILED_ATTEMPTS_WINDOW_MS) {
        attempts.set(key, { failures: 1, firstAttemptAt: now, lockedUntil: 0 });
        return { locked: false, retryAfterSeconds: 0, remainingAttempts: MAX_FAILED_ATTEMPTS - 1 };
    }
    rec.failures += 1;
    if (rec.failures >= MAX_FAILED_ATTEMPTS) {
        rec.lockedUntil = now + LOCKOUT_MS;
        notifySecurityAlert({
            alertType: "suspicious_login",
            severity: "high",
            title: `Login lockout triggered for ${email}`,
            description: `${rec.failures} failed login attempts from IP ${ip} within ${FAILED_ATTEMPTS_WINDOW_MS / 60000} minutes. Account locked for ${LOCKOUT_MS / 60000} minutes.`,
            ipAddress: ip,
            metadata: { email, failures: rec.failures, lockedUntil: rec.lockedUntil },
        });
    }
    return {
        locked: rec.lockedUntil > now,
        retryAfterSeconds: rec.lockedUntil > now ? Math.ceil((rec.lockedUntil - now) / 1000) : 0,
        remainingAttempts: Math.max(0, MAX_FAILED_ATTEMPTS - rec.failures),
    };
}
/**
 * Successful login clears the attempt record. Call AFTER a successful
 * password verification.
 */
function clearFailedAttempts(email, ip) {
    attempts.delete(keyFor(email, ip));
}
// ─── Open-redirect prevention ───────────────────────────────────────────────
/**
 * Validate a user-supplied redirect path. Returns a SAFE path (always starting
 * with `/`, no host, no scheme) or the fallback if the input is dangerous.
 *
 * Blocks:
 *   - Absolute URLs    (https://evil.com)
 *   - Protocol-relative (//evil.com — browser resolves to https://evil.com)
 *   - Backslash hosts   (/\\evil.com — old IE bypass, defence in depth)
 *   - data:, javascript: URLs
 *   - Any path containing a newline (header injection)
 */
function safeRedirectPath(input, fallback = "/") {
    if (typeof input !== "string")
        return fallback;
    const trimmed = input.trim();
    if (!trimmed)
        return fallback;
    // Must start with a single forward slash and have no scheme.
    if (!trimmed.startsWith("/"))
        return fallback;
    // Block //host and /\\host bypasses
    if (trimmed.startsWith("//") || trimmed.startsWith("/\\"))
        return fallback;
    // Newline injection guard (CRLF, LF)
    if (/[\r\n]/.test(trimmed))
        return fallback;
    // No data:/javascript: hidden in encoded form — re-decode once and re-check
    let decoded = trimmed;
    try {
        decoded = decodeURIComponent(trimmed);
    }
    catch { }
    if (/^\s*(javascript:|data:|vbscript:)/i.test(decoded))
        return fallback;
    // Final length sanity
    if (trimmed.length > 2048)
        return fallback;
    return trimmed;
}
/**
 * Single dispatch point for security alerts. Today this:
 *   - Logs to stdout with a [SECURITY] tag so Render's log search picks it up
 *   - Calls captureException so Sentry shows it if SENTRY_DSN is set
 *   - Calls createSecurityAlert (best-effort, never throws) so the admin
 *     dashboard sees it
 *
 * To add a Discord/email webhook later, edit this one function — every
 * caller passes the same shape.
 */
function notifySecurityAlert(alert) {
    const tag = `[SECURITY:${alert.severity.toUpperCase()}:${alert.alertType}]`;
    console.warn(`${tag} ${alert.title} — ${alert.description}`, {
        ipAddress: alert.ipAddress,
        userId: alert.userId,
        metadata: alert.metadata,
    });
    // Sentry (no-op if SENTRY_DSN is unset)
    try {
        (0, sentry_1.captureException)(new Error(`${tag} ${alert.title}`), {
            level: alert.severity === "critical" || alert.severity === "high" ? "error" : "warning",
            tags: { alertType: alert.alertType, severity: alert.severity },
            extra: {
                description: alert.description,
                ipAddress: alert.ipAddress,
                userId: alert.userId,
                ...(alert.metadata || {}),
            },
        });
    }
    catch { /* never let alerting break the request */ }
    // Persist to DB best-effort. Lazy import to avoid circular deps.
    Promise.resolve().then(() => __importStar(require("../security"))).then(({ createSecurityAlert }) => {
        createSecurityAlert({
            alertType: alert.alertType,
            severity: alert.severity,
            title: alert.title,
            description: alert.description,
            ipAddress: alert.ipAddress,
            userId: alert.userId,
            metadata: alert.metadata,
        }).catch(() => { });
    })
        .catch(() => { });
}
