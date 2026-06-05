"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// Sentry server initialisation.
//
// Errors land in your Sentry inbox at https://sentry.io/issues/.
// Both unhandled exceptions AND Express route-level throws are captured.
//
// Gated on SENTRY_DSN env var — when not set, every Sentry function is a
// no-op. Local dev runs with no DSN and the app boots fine. Production
// deploy requires you to set SENTRY_DSN in the Render Environment tab.
//
// Tags attached to every event:
//   route        — the matched Express route path (e.g. /api/services/order/:slug)
//   service_slug — set by service-order routes for orders
//   user_id      — set by /api/auth/* handlers once we know who's logged in
//
// Per-environment sample rate so dev / staging / prod can have different
// volumes:
//   NODE_ENV=production  -> traces 10% (keep cost down)
//   anything else        -> traces 100% (full fidelity in dev)
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
exports.initSentry = initSentry;
exports.attachSentryErrorHandler = attachSentryErrorHandler;
exports.captureException = captureException;
exports.tagUser = tagUser;
const Sentry = __importStar(require("@sentry/node"));
let initialised = false;
function initSentry() {
    if (initialised)
        return true;
    const dsn = (process.env.SENTRY_DSN || "").trim();
    if (!dsn) {
        console.log("[sentry] SENTRY_DSN not set — error monitoring disabled.");
        return false;
    }
    const env = (process.env.NODE_ENV || "development").trim();
    const isProd = env === "production";
    Sentry.init({
        dsn,
        environment: env,
        // Capture 10% of transactions in prod, 100% in dev. Performance data
        // (slow DB queries, slow routes) shows up under Performance in Sentry.
        tracesSampleRate: isProd ? 0.1 : 1.0,
        // Capture 10% of route profiles in prod for the Profiling tier — cheap
        // and reveals CPU hot spots we'd otherwise never see.
        profilesSampleRate: isProd ? 0.1 : 0.0,
        // Send PII (user IPs, request bodies) only in prod, gated by Render env.
        sendDefaultPii: isProd,
        // Tag every event with our deploy SHA if Render exposed it.
        release: (process.env.RENDER_GIT_COMMIT || "").trim() || undefined,
    });
    initialised = true;
    console.log(`[sentry] initialised — env=${env}, sampleRate=${isProd ? "10%" : "100%"}`);
    return true;
}
/**
 * Wire Sentry's Express error handler. Must be called AFTER all routes
 * but BEFORE your own 500 error handler — so Sentry sees the error
 * before Express handles it.
 */
function attachSentryErrorHandler(app) {
    if (!initialised)
        return;
    Sentry.setupExpressErrorHandler(app);
}
/**
 * Manually capture an exception that you've already caught + handled.
 * Useful for try/catch blocks where you don't want to re-throw but still
 * want Sentry to know.
 */
function captureException(err, context) {
    if (!initialised)
        return;
    Sentry.captureException(err, context ? { extra: context } : undefined);
}
/**
 * Tag the current Sentry scope with the user ID so every subsequent error
 * in this request shows up grouped by user. Call this from your auth
 * middleware once you know who's logged in.
 */
function tagUser(userId, email) {
    if (!initialised || !userId)
        return;
    Sentry.setUser({ id: userId, email: email ?? undefined });
}
