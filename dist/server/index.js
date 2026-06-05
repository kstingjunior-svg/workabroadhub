"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// ─────────────────────────────────────────────────────────────────────────────
// RUNTIME PATH-ALIAS RESOLVER (PROD ONLY)
// ─────────────────────────────────────────────────────────────────────────────
// tsc does not transform TypeScript `paths` aliases at compile time, so the
// compiled CJS output still contains literal `require("@shared/...")` calls
// that Node cannot resolve. In dev, tsx hooks into module resolution and
// honors tsconfig paths, so this prologue does nothing. In compiled prod
// (running from dist/), we register module-alias to map @shared -> dist/shared.
// Detection key: only run when this file is loaded from a path containing
// the dist folder; never when executed directly from source via tsx.
{
    const _path = require("path");
    if (typeof __filename === "string" && __filename.split(_path.sep).includes("dist")) {
        const moduleAlias = require("module-alias");
        // __dirname here = .../dist/server, so ../shared = .../dist/shared
        moduleAlias.addAliases({
            "@shared": _path.resolve(__dirname, "..", "shared"),
        });
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// SAFE PROCESS-LEVEL HANDLERS (ONLY DEFINE ONCE)
// ─────────────────────────────────────────────────────────────────────────────
process.on("unhandledRejection", (reason) => {
    console.error(JSON.stringify({
        level: "error",
        ts: new Date().toISOString(),
        event: "unhandledRejection",
        reason: reason instanceof Error
            ? {
                message: reason.message,
                stack: reason.stack,
            }
            : String(reason),
    }));
    // Forward to Sentry (no-op if SENTRY_DSN is not set).
    try {
        (0, sentry_1.captureException)(reason, { source: "unhandledRejection" });
    }
    catch { }
    // DO NOT CRASH THE SERVER
});
process.on("uncaughtException", (err) => {
    // Passport regenerate race condition safeguard
    if (err.message?.includes("regenerate") ||
        (err.message?.includes("Cannot read properties of undefined") &&
            err.stack?.includes("regenerate"))) {
        console.warn("[Auth] Non-fatal session regenerate race condition:", err.message);
        return;
    }
    console.error(JSON.stringify({
        level: "fatal",
        ts: new Date().toISOString(),
        event: "uncaughtException",
        message: err.message,
        stack: err.stack,
    }));
    // ONLY EXIT FOR TRULY FATAL ERRORS
    const fatalPatterns = [
        "ENOMEM",
        "heap out of memory",
        "EADDRINUSE",
        "Segmentation fault",
    ];
    const isFatal = fatalPatterns.some((p) => err.message?.toLowerCase().includes(p.toLowerCase()));
    if (isFatal) {
        console.error("[System] Fatal runtime error detected. Shutting down.");
        process.exit(1);
    }
});
// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS
// ─────────────────────────────────────────────────────────────────────────────
const express_1 = __importDefault(require("express"));
const compression_1 = __importDefault(require("compression"));
const cors_1 = __importDefault(require("cors"));
const crypto_1 = __importDefault(require("crypto"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const http_1 = require("http");
const db_1 = require("./db");
const routes_1 = require("./routes");
const sentry_1 = require("./lib/sentry");
// Initialise Sentry as early as possible (before Express is constructed)
// so import-time errors in any route module can still be captured.
// No-op when SENTRY_DSN is not set.
(0, sentry_1.initSentry)();
const static_1 = require("./static");
const socket_1 = require("./socket");
const ddos_protection_1 = require("./middleware/ddos-protection");
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
// ─────────────────────────────────────────────────────────────────────────────
// SERVER BOOT FIRST (IMPORTANT FOR RENDER)
// ─────────────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || "5000", 10);
httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Running on port ${PORT}`);
});
// ─────────────────────────────────────────────────────────────────────────────
// SOCKET.IO
// ─────────────────────────────────────────────────────────────────────────────
(0, socket_1.initSocketIO)(httpServer);
// ─────────────────────────────────────────────────────────────────────────────
// /ws/* SHORT-CIRCUIT — MUST come before every other middleware
// ─────────────────────────────────────────────────────────────────────────────
//
// /ws/analytics and /ws/user are WebSocket endpoints (see server/websocket.ts).
// They're handled by the `ws` library via the httpServer 'upgrade' event,
// NOT by Express's HTTP routing. When a client sends a plain HTTP GET to
// /ws/analytics (e.g. a stale browser tab, a probe, or a misconfigured
// monitoring agent), Express still tries to route it — and one of our many
// middlewares (DDOS protection, CSRF, rate limiter, helmet) ends up returning
// 500 instead of a clean 404/426. That floods production logs with hundreds
// of thousands of red 500s per day.
//
// Short-circuit here, BEFORE any other middleware runs, with HTTP 426
// (Upgrade Required) — the correct response for "this endpoint is only
// reachable via WebSocket Upgrade". No middleware downstream gets a chance
// to touch these requests.
app.use((req, res, next) => {
    if (req.path.startsWith("/ws/")) {
        res.status(426).set("Upgrade", "websocket").json({
            message: "This endpoint is reachable only via WebSocket Upgrade.",
            path: req.path,
        });
        return;
    }
    next();
});
// ─────────────────────────────────────────────────────────────────────────────
// SECURITY
// ─────────────────────────────────────────────────────────────────────────────
const allowedOrigins = new Set([
    "https://workabroadhub.tech",
    "https://www.workabroadhub.tech",
    "https://workabroadhub.onrender.com",
    "https://workabroadhub.vercel.app",
    // Additional production origins, comma-separated. Set in Render → Environment
    // when you add new frontend hosts (e.g. a Vercel preview, a custom domain).
    ...(process.env.ADDITIONAL_CORS_ORIGINS?.split(",")
        .map((o) => o.trim())
        .filter(Boolean) || []),
].filter(Boolean));
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true);
        try {
            const originUrl = new URL(origin);
            if (allowedOrigins.has(originUrl.origin)) {
                return callback(null, true);
            }
            if (process.env.NODE_ENV !== "production" &&
                originUrl.hostname === "localhost") {
                return callback(null, true);
            }
        }
        catch { }
        callback(new Error("CORS not allowed"));
    },
    credentials: true,
}));
// ─────────────────────────────────────────────────────────────────────────────
// HELMET
// ─────────────────────────────────────────────────────────────────────────────
app.use((0, helmet_1.default)({
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: {
        policy: "same-origin-allow-popups",
    },
}));
// ─────────────────────────────────────────────────────────────────────────────
// COMPRESSION
// ─────────────────────────────────────────────────────────────────────────────
app.use((0, compression_1.default)({
    level: 6,
    threshold: 1024,
}));
// ─────────────────────────────────────────────────────────────────────────────
// REQUEST IDS
// ─────────────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
    const reqId = req.headers["x-request-id"] ||
        crypto_1.default.randomUUID().slice(0, 8);
    req.reqId = reqId;
    res.setHeader("x-request-id", reqId);
    next();
});
// ─────────────────────────────────────────────────────────────────────────────
// DDOS PROTECTION
// ─────────────────────────────────────────────────────────────────────────────
app.use(ddos_protection_1.applyDdosProtection);
// ─────────────────────────────────────────────────────────────────────────────
// RATE LIMITERS
// ─────────────────────────────────────────────────────────────────────────────
function rateLimitKey(req) {
    const raw = req.headers.cookie ?? "";
    const m = raw.match(/connect\.sid=s%3A([^;.%]+)/);
    if (m && m[1]) {
        return `sid:${m[1]}`;
    }
    return (req.headers["x-forwarded-for"]
        ?.split(",")[0]
        ?.trim() ||
        req.socket?.remoteAddress ||
        "unknown");
}
const apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: rateLimitKey,
});
app.use("/api", apiLimiter);
// ─────────────────────────────────────────────────────────────────────────────
// SAFE BODY PARSERS
// ─────────────────────────────────────────────────────────────────────────────
app.use("/api/mpesa", express_1.default.json({
    limit: "1mb",
    // REMOVED */* (VERY IMPORTANT)
    type: ["application/json", "text/plain"],
    verify: (req, _res, buf) => {
        req.rawBody = buf;
    },
}));
app.use(express_1.default.json({
    limit: "100kb",
}));
app.use(express_1.default.urlencoded({
    extended: false,
    limit: "100kb",
}));
// ─────────────────────────────────────────────────────────────────────────────
// LIGHTWEIGHT REQUEST LOGGING
// ─────────────────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
        const duration = Date.now() - start;
        if (req.path.startsWith("/api") &&
            (res.statusCode >= 400 || duration > 2000)) {
            console.log(JSON.stringify({
                ts: new Date().toISOString(),
                method: req.method,
                path: req.path,
                status: res.statusCode,
                duration,
            }));
        }
    });
    next();
});
// ─────────────────────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────────────────────
(async () => {
    try {
        // IMPORTANT:
        // registerRoutes(app)
        // NOT registerRoutes(httpServer, app)
        await (0, routes_1.registerRoutes)(httpServer, app);
        // Wire Sentry's Express error handler AFTER all routes are registered
        // but BEFORE any custom 500 middleware. No-op if Sentry isn't initialised.
        (0, sentry_1.attachSentryErrorHandler)(app);
        // ────────────────────────────────────────────────────────────────────────
        // BACKGROUND STARTUP TASKS (NON-BLOCKING)
        // ────────────────────────────────────────────────────────────────────────
        Promise.resolve().then(() => __importStar(require("./seed"))).then(async (m) => {
            // Existing seeds
            m.seedDatabase?.().catch(console.error);
            m.promoteFirstUserToAdmin?.().catch(console.error);
            m.seedStudentVisas?.().catch(console.error);
            m.seedApplicationPacks?.().catch(console.error);
            m.seedPlans?.().catch(console.error);
            // Restored seeds (Batch C): fraud rules, visa jobs, indexes, NEA sync,
            // service prices. All non-blocking — failures logged but won't crash
            // boot.
            m.seedFraudDetectionRules?.().catch(console.error);
            m.seedVisaJobs?.().catch(console.error);
            m.seedUsaVisaJobs?.().catch(console.error);
            m.ensureIndexes?.().catch(console.error);
            m.syncNeaAgencies?.().catch(console.error);
            m.deduplicateNeaAgencies?.().catch(console.error);
            m.syncServicePrices?.().catch(console.error);
            // CRITICAL: ensure every destination country has its job_links populated.
            // Migration 0004 used uppercase codes that never matched the lowercase
            // seed, leaving all "Apply on Platforms" tabs empty. This self-healer
            // is idempotent — safe to run on every boot.
            m.seedCountryPortals?.().catch(console.error);
            m.syncPlanPrices?.().catch(console.error);
            m.ensureServiceOrderStatusCheck?.().catch(console.error);
        })
            .catch(console.error);
        Promise.resolve().then(() => __importStar(require("./license-checker"))).then(async (m) => {
            const { storage } = await Promise.resolve().then(() => __importStar(require("./storage")));
            m.startLicenseChecker(storage);
        })
            .catch(console.error);
        Promise.resolve().then(() => __importStar(require("./stk-recovery"))).then((m) => {
            m.startStkRecoveryPoller();
        })
            .catch(console.error);
        Promise.resolve().then(() => __importStar(require("./portal-health-checker"))).then((m) => {
            m.startPortalHealthChecker();
        })
            .catch(console.error);
        // Restored (Batch C): security event monitor. Watches for anomalies and
        // creates security alerts. Safe no-op if no security events occur.
        Promise.resolve().then(() => __importStar(require("./security"))).then((m) => {
            m.initSecurityMonitor();
        })
            .catch(console.error);
        // Restored (Batch C): background async queue + handlers. Drives CV
        // processing, email delivery, fraud checks, WhatsApp follow-ups, etc.
        // Without this, jobs enqueued elsewhere in the app sit forever unprocessed.
        Promise.resolve().then(() => __importStar(require("./queue"))).then((m) => {
            m.registerQueueHandlers();
        })
            .catch(console.error);
        // ────────────────────────────────────────────────────────────────────────
        // SAFE RECURSIVE JOBS
        // ────────────────────────────────────────────────────────────────────────
        async function paymentExpiryLoop() {
            try {
                const { storage } = await Promise.resolve().then(() => __importStar(require("./storage")));
                const expired = await storage.expireStalePayments(2);
                if (expired.length > 0) {
                    console.log(`[Payments] Expired ${expired.length} stale payments`);
                }
            }
            catch (err) {
                console.error("[Payments] Expiry loop failed:", err);
            }
            setTimeout(paymentExpiryLoop, 60 * 1000);
        }
        paymentExpiryLoop();
        async function serviceOrderLoop() {
            try {
                const { storage } = await Promise.resolve().then(() => __importStar(require("./storage")));
                const expired = await storage.expireStaleServiceOrders(48);
                if (expired.length > 0) {
                    console.log(`[Orders] Expired ${expired.length} stale service orders`);
                }
            }
            catch (err) {
                console.error("[Orders] Cleanup loop failed:", err);
            }
            setTimeout(serviceOrderLoop, 6 * 60 * 60 * 1000);
        }
        serviceOrderLoop();
        // ────────────────────────────────────────────────────────────────────────
        // STATIC/VITE
        // ────────────────────────────────────────────────────────────────────────
        if (process.env.NODE_ENV === "production") {
            (0, static_1.serveStatic)(app);
        }
        else {
            const { setupVite } = await Promise.resolve().then(() => __importStar(require("./vite")));
            await setupVite(httpServer, app);
        }
        // ────────────────────────────────────────────────────────────────────────
        // GLOBAL ERROR HANDLER
        // ────────────────────────────────────────────────────────────────────────
        app.use((err, req, res, _next) => {
            console.error(JSON.stringify({
                ts: new Date().toISOString(),
                method: req.method,
                path: req.path,
                message: err.message,
                stack: err.stack,
            }));
            // Restored (Batch C): mirror server errors to Firebase RTDB for
            // centralized monitoring. Fire-and-forget — Firebase outages must
            // never block the user response. firebaseRtdb itself catches its
            // own errors, so we just need to not await it.
            Promise.resolve().then(() => __importStar(require("./services/firebaseRtdb"))).then((m) => m.logErrorToFirebase?.({
                type: err.name || "Error",
                code: err.status || 500,
                message: err.message ?? "Unknown error",
                stack: err.stack,
                url: req.originalUrl ?? req.path,
                method: req.method,
                timestamp: new Date().toISOString(),
                reqId: req.reqId,
            }))
                .catch(() => { });
            if (res.headersSent) {
                return;
            }
            const status = err.status || 500;
            return res.status(status).json({
                success: false,
                message: status >= 500
                    ? "Internal server error"
                    : err.message,
            });
        });
        // DATABASE AUDIT
        // ────────────────────────────────────────────────────────────────────────
        try {
            const result = await db_1.pool.query("SELECT current_database() AS name");
            console.log(`[DB] Connected to database: ${result.rows[0]?.name}`);
        }
        catch (err) {
            console.error("[DB] Audit failed:", err);
        }
        // ────────────────────────────────────────────────────────────────────────
        // GRACEFUL SHUTDOWN
        // ────────────────────────────────────────────────────────────────────────
        async function shutdown(signal) {
            console.log(`[Shutdown] ${signal} received`);
            httpServer.close(async () => {
                try {
                    await db_1.pool.end();
                    console.log("[Shutdown] Database pool closed");
                    process.exit(0);
                }
                catch (err) {
                    console.error("[Shutdown] Failed:", err);
                    process.exit(1);
                }
            });
            setTimeout(() => {
                console.error("[Shutdown] Forced exit");
                process.exit(1);
            }, 10000);
        }
        process.once("SIGTERM", () => shutdown("SIGTERM"));
        process.once("SIGINT", () => shutdown("SIGINT"));
    }
    catch (err) {
        console.error("[Startup] Fatal boot error:", err);
        process.exit(1);
    }
})();
