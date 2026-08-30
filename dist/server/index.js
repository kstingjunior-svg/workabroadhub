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
// 2026-08 (P0 CSP audit): analytics WebSocket was defined but never wired
// to the HTTP server, so every client hit `WebSocket connection failed` on
// /ws/analytics — polluting console + retry-looping every 5s forever. This
// import + init call below closes the loop.
const websocket_1 = require("./websocket");
const ddos_protection_1 = require("./middleware/ddos-protection");
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
// ─────────────────────────────────────────────────────────────────────────────
// SERVER BOOT FIRST (IMPORTANT FOR RENDER)
// ─────────────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || "5000", 10);
httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Running on port ${PORT}`);
    // 2026-08 (P0 CSP audit): mount WebSocket server on the SAME http server
    // so the /ws/analytics + /ws/user + /ws/presence-count paths get proper
    // HTTP-upgrade handshakes. Without this, every browser client hit
    // "WebSocket connection failed" on load and the reconnect loop retried
    // every 5s indefinitely. Called from inside listen() so the http server
    // is already accepting connections when we attach.
    try {
        (0, websocket_1.initWebSocketServer)(httpServer);
    }
    catch (e) {
        console.error("[Server] initWebSocketServer failed:", e?.message);
    }
    // 2026-06 CRITICAL: start BullMQ workers on boot. These three queues handle
    // ATS CV generation, bulk job applications, and job-alert delivery — all
    // PAID services. Without the workers running, every paid order's job
    // silently piles up in Redis with no consumer, the user sees "your CV is
    // being generated" but nothing ever arrives. Tony hit exactly this case.
    //
    // Order matters: CV first (highest-impact paid service), then app, then job.
    // Each worker logs its own startup line so Render's startup log makes it
    // obvious if any of them failed to come up.
    (async () => {
        // 2026-07 (production audit CRIT-5): legacy cvQueue retired. The old
        // worker ran alongside the new unified processOrder flow (see
        // server/service-order-routes.ts + services/delivery.ts) and generated
        // a DIFFERENT CV from a user's career profile, then WhatsApp'd its
        // preview. Users got contradictory outputs. All queue-add calls have
        // been removed from delivery.ts. The worker is now dead code.
        //
        // Not deleting the file yet in case any straggling job sits in Redis
        // and needs draining. Revisit + delete server/lib/cvQueue.ts and
        // server/services/cv.ts after 30 days of stable production.
        //
        // Comment restored intentionally:
        // const { startCvWorker } = await import("./lib/cvQueue");
        // startCvWorker();
        try {
            // no-op — CV worker retired 2026-07 (see comment above)
        }
        catch (err) {
            console.error("[Server] ❌ CV worker init failed:", err?.message);
        }
        try {
            const { startAppWorker } = await Promise.resolve().then(() => __importStar(require("./lib/appQueue")));
            startAppWorker();
        }
        catch (err) {
            console.error("[Server] ❌ App worker failed to start:", err?.message);
        }
        try {
            const { startJobWorker } = await Promise.resolve().then(() => __importStar(require("./lib/jobQueue")));
            startJobWorker();
        }
        catch (err) {
            console.error("[Server] ❌ Job worker failed to start:", err?.message);
        }
        // Service-order recovery sweep: retries any service order stuck in
        // paid|processing state for >90 s. Protects against silent OpenAI
        // timeouts and lost callback metadata.
        try {
            const { startStuckOrderSweep } = await Promise.resolve().then(() => __importStar(require("./service-order-routes")));
            startStuckOrderSweep();
        }
        catch (err) {
            console.error("[Server] ❌ Stuck-order sweep failed to start:", err?.message);
        }
        // 2026-06: M-Pesa reconciler — safety net for any STK push whose
        // /api/payments/mpesa/callback never arrived (Render cold-start,
        // network blip, Safaricom timeout, etc.). Pulls the last 90 minutes
        // of transactions from Daraja's Pull API every 5 minutes and unlocks
        // any payment that we recorded as initiated but never marked complete.
        // Was previously built but never booted — discovered during the
        // 2026-06 M-Pesa audit. Worst case it does nothing; best case it
        // saves a user whose webhook was silently dropped.
        try {
            const { startReconcilerScheduler } = await Promise.resolve().then(() => __importStar(require("./mpesa-reconciler")));
            startReconcilerScheduler();
        }
        catch (err) {
            console.error("[Server] ❌ M-Pesa reconciler failed to start:", err?.message);
        }
        // 2026-07 Nanjila Phase A completion: nightly readiness snapshot job.
        // Gated on NANJILA_READINESS_JOB_ENABLED (default off). When on, boots
        // the BullMQ worker and schedules the nightly sweep at 03:00 EAT.
        // The worker + scheduler are both idempotent — safe to call across
        // process restarts.
        try {
            const { startReadinessWorker, scheduleNightlyReadiness } = await Promise.resolve().then(() => __importStar(require("./nanjila/jobs/nightlyReadiness")));
            startReadinessWorker();
            await scheduleNightlyReadiness();
        }
        catch (err) {
            console.error("[Server] ❌ Nanjila readiness job failed to start:", err?.message);
        }
        // 2026-06 STRICT EXPIRY AUDIT: proactive plan-expiry sweep runs every
        // 60s. Finds any user_subscriptions row where end_date < now() and
        // status='active', flips it to 'expired', syncs users.plan='free',
        // invalidates the auth-user cache, mirrors to Supabase, and notifies
        // connected WebSocket sessions. This is defensive-in-depth on top of
        // the lazy expiry in storage.getUserPlan(). Founder asked: "after
        // 24h, they are automatically thrown out of pro usage." Without this
        // sweep, a user sitting on their dashboard at the moment of expiry
        // keeps stale Pro UI until they trigger a fresh plan check.
        try {
            const { startExpirySweep } = await Promise.resolve().then(() => __importStar(require("./lib/plan-expiry-sweep")));
            startExpirySweep();
        }
        catch (err) {
            console.error("[Server] ❌ Plan expiry sweep failed to start:", err?.message);
        }
        // 2026-06 AUDIT REC #4: verification reminder sweep — every hour, send
        // ONE friendly reminder email to users who signed up 6-48h ago but
        // never verified. Caps at one reminder per user (column
        // verification_reminder_sent_at). Recovers part of the 535-unverified
        // figure the Email Health page surfaced as a funnel leak.
        try {
            const { startVerificationReminderSweep } = await Promise.resolve().then(() => __importStar(require("./lib/verification-reminder-sweep")));
            startVerificationReminderSweep();
        }
        catch (err) {
            console.error("[Server] ❌ Verification reminder sweep failed to start:", err?.message);
        }
        // 2026-06: paid-but-free reconciler — every 15 min, find users whose
        // payment status is 'success'/'completed' but whose users.plan is still
        // 'free' and re-run runPaymentPipeline. Closes the silent gap when
        // pipeline Step 1 swallows a DB error and leaves a paying KES 99 /
        // 1,000 / 4,500 user without access. Idempotent — running on an
        // already-recovered user is a no-op.
        try {
            const { startPaidButFreeReconciler } = await Promise.resolve().then(() => __importStar(require("./lib/paid-but-free-reconciler")));
            startPaidButFreeReconciler();
        }
        catch (err) {
            console.error("[Server] ❌ Paid-but-free reconciler failed to start:", err?.message);
        }
        // 2026-08: service-order reconciler — every 5 min, find completed payments
        // for service purchases (cv_fix_lite, offer_verify, etc.) whose service
        // orders never got flipped to 'paid' or triggered AI generation. Root
        // cause was a client-side key mismatch (orderId vs serviceOrderId) that
        // dropped metadata; that bug is fixed, but this belt-and-braces sweep
        // ensures no future silent gap can strand a paying customer > 5 min.
        // Idempotent — running against an already-linked payment is a no-op.
        try {
            const { startServiceOrderReconciler } = await Promise.resolve().then(() => __importStar(require("./lib/service-order-reconciler")));
            startServiceOrderReconciler();
        }
        catch (err) {
            console.error("[Server] ❌ Service-order reconciler failed to start:", err?.message);
        }
    })();
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
// 2026-07 (production pool-exhaustion fallout fix):
// When DB queries take longer than the HTTP timeout, express-timeout (or the
// LB) sends a 408 to the client. THEN the query finally errors, and the
// route's catch block tries to res.json(...) — throwing "Cannot set headers
// after they are sent to the client". That error cascades into 400+ noisy
// unhandledRejection log lines per minute.
//
// This guard patches res.json / res.send / res.status.send at request start
// so any post-timeout send is a silent no-op instead of a throw. Routes with
// old, badly-guarded try/catch blocks now behave gracefully after timeout.
app.use((_req, res, next) => {
    const origJson = res.json.bind(res);
    const origSend = res.send.bind(res);
    const origSetHeader = res.setHeader.bind(res);
    res.json = ((body) => {
        if (res.headersSent) {
            // console.debug("[res-guard] Ignored double res.json after headers sent");
            return res;
        }
        return origJson(body);
    });
    res.send = ((body) => {
        if (res.headersSent)
            return res;
        return origSend(body);
    });
    res.setHeader = ((name, value) => {
        if (res.headersSent)
            return res;
        return origSetHeader(name, value);
    });
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
    // 2026-08 (P0 CSP audit): Helmet's default CSP is `default-src 'self'`
    // which blocks Firebase Realtime DB, our own analytics WebSocket, our
    // inline theme/version-check scripts in index.html, and every third-
    // party we depend on (Google Fonts, PayPal, Adzuna attribution img,
    // etc). This custom policy allow-lists ONLY what the app actually
    // needs — nothing more.
    //
    // Sources touched:
    //   • Self-hosted assets: 'self' everywhere
    //   • Inline bootstrap scripts (theme, version-check): 'unsafe-inline'
    //     for script-src (small, self-contained, unavoidable without a
    //     nonce pipeline in vite; hash-pinning them was too brittle
    //     across builds)
    //   • Firebase Realtime DB + Auth + Storage: *.firebaseio.com,
    //     *.googleapis.com, *.gstatic.com, wss://*.firebaseio.com
    //   • Own WebSocket (analytics presence): wss://workabroadhub.tech,
    //     wss://*.onrender.com (Render staging), ws:// for local dev
    //   • Fonts: fonts.googleapis.com (CSS) + fonts.gstatic.com (fonts)
    //   • Images: data: URIs (all photo embeds), blob: (uploads previews),
    //     any HTTPS (job portal favicons, agency logos)
    //   • PayPal: paypal.com + paypalobjects.com for its checkout SDK
    //   • Frame-src: PayPal + Google (for OAuth) checkout iframes
    contentSecurityPolicy: {
        useDefaults: false,
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'", // for inline theme + version-check bootstrap
                "https://*.firebaseio.com",
                "https://*.googleapis.com",
                "https://*.gstatic.com",
                "https://apis.google.com",
                "https://www.paypal.com",
                "https://*.paypalobjects.com",
                "https://www.google-analytics.com",
                "https://www.googletagmanager.com",
            ],
            // 2026-08: allow inline event handlers (onclick=…) in our own HTML
            // bootstrap — the version-check banner uses onclick attributes.
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: [
                "'self'",
                "'unsafe-inline'", // Tailwind + shadcn set inline styles at runtime
                "https://fonts.googleapis.com",
            ],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
            imgSrc: ["'self'", "data:", "blob:", "https:"],
            connectSrc: [
                "'self'",
                "https://*.firebaseio.com",
                "wss://*.firebaseio.com",
                "https://*.googleapis.com",
                "https://*.google-analytics.com",
                "https://*.paypal.com",
                "https://api.openai.com",
                "https://sandbox.safaricom.co.ke",
                "https://api.safaricom.co.ke",
                "wss://workabroadhub.tech",
                "wss://*.onrender.com",
                "ws://localhost:*",
                "https://o4506995718553600.ingest.sentry.io",
            ],
            frameSrc: [
                "'self'",
                "https://www.paypal.com",
                "https://accounts.google.com",
                "https://*.firebaseapp.com",
                // 2026-08 FIX (live console error): Firebase RTDB uses regional
                // subdomains like s-gke-usc1-nssi4-41.firebaseio.com for its
                // long-polling fallback iframe. Without this, the presence /
                // realtime features break silently in Chrome.
                "https://*.firebaseio.com",
            ],
            workerSrc: ["'self'", "blob:"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            upgradeInsecureRequests: [],
        },
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
// 2026-06 scaling work: tier rate limits per-endpoint instead of one
// blanket /api limit. Order matters — Express picks the FIRST matching
// app.use. The mpesa/auth/ai limiters are mounted ABOVE the catch-all
// /api one so they win for their paths.
//
// Calibrated for 3,000 concurrent users:
//   - Auth endpoints: 20 req/15min/IP — prevents credential stuffing
//   - M-Pesa callback: 240 req/min/IP — Safaricom retries can burst,
//     but no legit caller hits it 4×/sec
//   - AI tools: 60 req/15min/user — keeps abuse off OpenAI bill
//   - General API: bumped to 2000/15min/session so signed-in users with
//     a hot dashboard don't hit the ceiling
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: rateLimitKey,
    message: { error: "Too many login attempts. Please wait 15 minutes." },
});
const mpesaCallbackLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 240,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: rateLimitKey,
    // Don't include success — Safaricom legitimate retries shouldn't be punished
    skipSuccessfulRequests: true,
});
const aiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: rateLimitKey,
    message: { error: "AI quota reached. Try again in 15 minutes." },
});
const apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 2000,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: rateLimitKey,
});
// 2026-06 SECURITY: payment-initiate limiter. An attacker who can fire STK
// pushes at will can harass a victim's phone number with PIN prompts (or
// run a brute-force across a list of stolen card/phone pairs). 10 per 15 min
// per session/IP is plenty for any legit user — usually 1-2 retries max.
const paymentInitiateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: rateLimitKey,
    message: { error: "Too many payment attempts. Please wait a few minutes before trying again." },
});
// Mount tier-specific limiters BEFORE the catch-all /api limit
app.use("/api/login", authLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/signup", authLimiter);
// 2026-07 FIX: was "/api/forgot-password" and "/api/reset-password" —
// wrong prefix. The actual endpoints live under /api/auth/*. Result was
// that both endpoints only fell under the general apiLimiter (2000/15min)
// which lets attackers spam thousands of reset emails per session. Now
// correctly limited. Also added dedicated limits for the SMS/email
// code-send endpoints so a burst of send-*-code requests can't blow up
// the Twilio bill.
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/auth/reset-password", authLimiter);
app.use("/api/auth/send-email-code", authLimiter);
app.use("/api/auth/send-phone-code", authLimiter);
app.use("/api/mpesa/callback", mpesaCallbackLimiter);
app.use("/api/payments/mpesa/callback", mpesaCallbackLimiter);
// Payment-initiate endpoints — block STK-push harassment / brute force
app.use("/api/payments/initiate", paymentInitiateLimiter);
app.use("/api/payments/mpesa/stk-push", paymentInitiateLimiter);
app.use("/api/mpesa/stk", paymentInitiateLimiter);
app.use("/api/payments/retry", paymentInitiateLimiter);
app.use("/api/ai", aiLimiter);
app.use("/api/tools", aiLimiter);
app.use("/api/bulk-apply", aiLimiter);
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
        // 2026-06 RC1 Sync Engine: fail-fast config validation.
        // Asserts DATABASE_URL + SESSION_SECRET are present BEFORE we register
        // any provider or open a pool. Soft warnings (SENTRY_DSN absent,
        // NODE_ENV unusual, etc.) are logged but non-fatal.
        // See server/sync/hardening.ts and docs/rc1/PRODUCTION_CHECKLIST.md (B).
        try {
            const { validateConfigOrPanic } = await Promise.resolve().then(() => __importStar(require("./sync/hardening")));
            validateConfigOrPanic();
        }
        catch (cfgErr) {
            console.error("[Server] ❌ Sync engine config validation failed:", cfgErr?.message);
            // Re-throw — this is a deliberate fail-fast. Boot must not continue
            // if required env vars are missing.
            throw cfgErr;
        }
        // IMPORTANT:
        // registerRoutes(app)
        // NOT registerRoutes(httpServer, app)
        // 2026-06 CRITICAL ORDERING — TWO constraints to satisfy:
        //
        // 1. Kenya Careers /api/local-jobs/* routes must register BEFORE the
        //    `app.use("/api", 404)` catch-all inside registerRoutes (otherwise
        //    every /api/local-jobs/* returns 404 — founder reported "Could not
        //    load jobs right now").
        //
        // 2. Kenya Careers endpoints read req.session.customUserId to recognise
        //    logged-in users (so signed-in users aren't asked to sign in again).
        //    But the session middleware is installed by setupAuth(), which is
        //    called INSIDE registerRoutes. If we register Kenya Careers BEFORE
        //    registerRoutes, req.session is undefined when our routes run.
        //
        // Solution: install just the session parser here, BEFORE Kenya Careers
        // routes register. getSessionParser() is a singleton — when setupAuth()
        // later calls app.use(getSessionParser()) inside registerRoutes, it
        // re-registers the same function reference. Express-session is safe to
        // call twice per request (the second pass sees req.session already set
        // and is a no-op for our purposes).
        try {
            const { getSessionParser } = await Promise.resolve().then(() => __importStar(require("./replit_integrations/auth/replitAuth")));
            app.set("trust proxy", 1);
            app.use(getSessionParser());
        }
        catch (err) {
            console.error("[Server] ❌ Early session parser install failed (non-fatal):", err?.message);
        }
        try {
            const { registerLocalJobsRoutes } = await Promise.resolve().then(() => __importStar(require("./local-jobs-routes")));
            registerLocalJobsRoutes(app);
        }
        catch (err) {
            console.error("[Server] ❌ Kenya Careers route registration failed (non-fatal):", err?.message);
        }
        // 2026-06 Phase 0: IELTS demand-validation routes. Same ordering
        // constraint as Kenya Careers — must register BEFORE registerRoutes()
        // so the /api 404 catch-all doesn't shadow them.
        try {
            const { registerIeltsRoutes } = await Promise.resolve().then(() => __importStar(require("./routes/ielts-routes")));
            registerIeltsRoutes(app);
        }
        catch (err) {
            console.error("[Server] ❌ IELTS routes registration failed (non-fatal):", err?.message);
        }
        // 2026-08 Phase 3 — MY CAREER dashboard aggregation.
        // GET /api/me/career-overview returns 6 stat tiles + 10 recent applications.
        // Registered here (before registerRoutes) so the /api catch-all doesn't shadow it.
        try {
            const { registerCareerOverviewRoute } = await Promise.resolve().then(() => __importStar(require("./routes/career-overview")));
            registerCareerOverviewRoute(app);
        }
        catch (err) {
            console.error("[Server] ❌ Career overview route registration failed (non-fatal):", err?.message);
        }
        // 2026-08 CRITICAL FIX (Tony's live 404 on /api/autoapply/agent):
        // MUST register AutoApply routes BEFORE registerRoutes() — that function
        // ends with an `app.use("/api", 404)` catch-all that shadows every
        // /api/* route registered afterwards. This was the actual root cause of
        // "Setup failed" on Activate. Same pattern Kenya Careers + Career Overview
        // above use for the same reason.
        try {
            const { registerAutoApplyRoutes } = await Promise.resolve().then(() => __importStar(require("./routes/autoapply")));
            registerAutoApplyRoutes(app);
            console.log("[Server] ✓ AutoApply routes registered (before /api catch-all)");
        }
        catch (err) {
            console.error("[Server] ❌ AutoApply route registration failed:", err?.message);
        }
        await (0, routes_1.registerRoutes)(httpServer, app);
        // Bootstrap can run after registerRoutes — it only touches the DB.
        try {
            const { bootstrapLocalJobs } = await Promise.resolve().then(() => __importStar(require("./lib/local-jobs-bootstrap")));
            await bootstrapLocalJobs();
        }
        catch (err) {
            console.error("[Server] ❌ Kenya Careers bootstrap failed (non-fatal):", err?.message);
        }
        // 2026-06: ensure the plans table has rows for trial/basic/monthly/
        // yearly/pro/pro_referral before any manual-grant endpoint can fire.
        // Was previously missing and broke admin grants with the message
        // "Plan 'yearly' is not configured in the database." Idempotent.
        try {
            const { ensurePlansSeeded } = await Promise.resolve().then(() => __importStar(require("./lib/ensure-plans-seeded")));
            await ensurePlansSeeded();
        }
        catch (err) {
            console.error("[Server] ❌ ensurePlansSeeded failed:", err?.message);
        }
        // 2026-06: ensure Luxembourg appears as a country with its four real
        // portals and the honest "skilled workers only" eligibility banner.
        // Idempotent — re-runs are no-ops. See server/lib/ensure-luxembourg-seeded.ts
        try {
            const { ensureLuxembourgSeeded } = await Promise.resolve().then(() => __importStar(require("./lib/ensure-luxembourg-seeded")));
            await ensureLuxembourgSeeded();
        }
        catch (err) {
            console.error("[Server] ❌ ensureLuxembourgSeeded failed:", err?.message);
        }
        // 2026-08 (Tony's request): seed Lithuania as a real country hub.
        // Idempotent — re-runs are no-ops. See server/lib/ensure-lithuania-seeded.ts
        try {
            const { ensureLithuaniaSeeded } = await Promise.resolve().then(() => __importStar(require("./lib/ensure-lithuania-seeded")));
            await ensureLithuaniaSeeded();
        }
        catch (err) {
            console.error("[Server] ❌ ensureLithuaniaSeeded failed:", err?.message);
        }
        // 2026-06 (Tony's bulk update): upsert 581 verified NEA agencies from
        // the NEA portal export. Idempotent — re-runs update existing rows in
        // place via ON CONFLICT (license_number). Source-of-truth is the NEA
        // portal, so an admin manually editing fields between deploys will be
        // overwritten on the next boot. See server/lib/ensure-nea-agencies-seeded.ts
        try {
            const { ensureNeaAgenciesSeeded } = await Promise.resolve().then(() => __importStar(require("./lib/ensure-nea-agencies-seeded")));
            await ensureNeaAgenciesSeeded();
        }
        catch (err) {
            console.error("[Server] ❌ ensureNeaAgenciesSeeded failed:", err?.message);
        }
        // 2026-08 (Tony's "live NEA sync" request): create the nea_sync_runs
        // table if missing and start the weekly cron. Auto-fetch attempts fire
        // every Monday 02:00 EAT. When NEAIMS blocks/JS-renders, admins get an
        // "error, admin paste required" run row and can trigger a manual sync
        // via /admin/nea-sync.
        try {
            await db_1.pool.query(`
        CREATE TABLE IF NOT EXISTS nea_sync_runs (
          id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          started_at        TIMESTAMP   NOT NULL DEFAULT NOW(),
          finished_at       TIMESTAMP,
          source            VARCHAR(32) NOT NULL,
          status            VARCHAR(32) NOT NULL,
          triggered_by      VARCHAR(128),
          raw_bytes         INTEGER,
          fetched_rows      INTEGER    DEFAULT 0,
          new_agencies      INTEGER    DEFAULT 0,
          updated_agencies  INTEGER    DEFAULT 0,
          expired_agencies  INTEGER    DEFAULT 0,
          revoked_agencies  INTEGER    DEFAULT 0,
          unchanged         INTEGER    DEFAULT 0,
          active_after      INTEGER,
          expired_after     INTEGER,
          error_message     TEXT,
          notes             TEXT
        );
        CREATE INDEX IF NOT EXISTS nea_sync_runs_started_at_idx ON nea_sync_runs (started_at DESC);
        CREATE INDEX IF NOT EXISTS nea_sync_runs_status_idx     ON nea_sync_runs (status);
      `);
            // 2026-08 fix: don't re-register the admin routes here — routes.ts
            // already wires them via `registerAdminNeaSyncRoutes(app, isAuthenticated,
            // isAdmin)`. Calling both would double-register handlers, and the
            // earlier attempt broke boot with a name-mismatch TypeError. This
            // block now only starts the weekly scheduler.
            const { startNEASyncScheduler } = await Promise.resolve().then(() => __importStar(require("./lib/nea-sync/scheduler")));
            startNEASyncScheduler();
        }
        catch (err) {
            console.error("[Server] ❌ NEA sync bootstrap failed:", err?.message);
        }
        // 2026-08 (Tony's "wild ideas #1"): AutoApply Agent. Idempotent table
        // creation, then register routes and start the overnight scan cron.
        // Adzuna API keys are optional at boot — scanner silently no-ops until
        // ADZUNA_APP_ID and ADZUNA_APP_KEY are set in Render env.
        //
        // 2026-08 FIX (Tony's "Setup failed" report on /autoapply):
        // The old flow wrapped CREATE TABLE + route registration + scheduler
        // start in ONE try block, so a single Postgres hiccup (e.g. an ALTER
        // TABLE that lacks permission on Supabase, or the users table not yet
        // being visible on cold start) silently killed the ENTIRE AutoApply
        // feature — routes never got registered, and every client request
        // returned 404 "Resource not found". User saw a useless "Setup failed"
        // toast with no way to know the actual cause.
        // Routes are registered EARLIER (before registerRoutes) so they can't
        // be shadowed by the /api catch-all. Here we just create the tables +
        // start the scheduler — any failure gets logged but the routes still
        // work (and will surface a real 500 with a proper message if a table is
        // genuinely missing).
        try {
            await db_1.pool.query(`
        CREATE TABLE IF NOT EXISTS autoapply_agents (
          id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id             VARCHAR     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          target_countries    TEXT[]      NOT NULL DEFAULT '{}',
          target_roles        TEXT[]      NOT NULL DEFAULT '{}',
          target_industries   TEXT[]              DEFAULT '{}',
          min_salary_kes      INTEGER,
          visa_sponsorship_required BOOLEAN NOT NULL DEFAULT true,
          remote_ok           BOOLEAN     NOT NULL DEFAULT false,
          experience_years    INTEGER,
          cv_text             TEXT        NOT NULL,
          cv_file_url         TEXT,
          is_active           BOOLEAN     NOT NULL DEFAULT true,
          max_matches_per_day INTEGER     NOT NULL DEFAULT 10,
          daily_report_time   VARCHAR(5)  NOT NULL DEFAULT '06:00',
          last_scan_at        TIMESTAMP,
          next_scan_at        TIMESTAMP,
          total_matches_lifetime  INTEGER NOT NULL DEFAULT 0,
          total_applied_lifetime  INTEGER NOT NULL DEFAULT 0,
          created_at          TIMESTAMP   NOT NULL DEFAULT NOW(),
          updated_at          TIMESTAMP   NOT NULL DEFAULT NOW(),
          UNIQUE(user_id)
        );
        CREATE INDEX IF NOT EXISTS autoapply_agents_user_id_idx  ON autoapply_agents(user_id);
        CREATE INDEX IF NOT EXISTS autoapply_agents_active_idx   ON autoapply_agents(is_active) WHERE is_active = true;

        -- 2026-08 Phase 2.5: 7-day Pro free trial on first agent creation.
        -- pro_trial_ends_at is set to NOW() + 7 days when the user first
        -- creates an agent. resolveLimitsForUser treats users with an
        -- active trial as Pro regardless of their users.plan column.
        ALTER TABLE autoapply_agents ADD COLUMN IF NOT EXISTS pro_trial_ends_at TIMESTAMP;
        CREATE INDEX IF NOT EXISTS autoapply_agents_trial_idx ON autoapply_agents(pro_trial_ends_at) WHERE pro_trial_ends_at IS NOT NULL;

        CREATE TABLE IF NOT EXISTS autoapply_matches (
          id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          agent_id            UUID        NOT NULL REFERENCES autoapply_agents(id) ON DELETE CASCADE,
          user_id             VARCHAR     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          source              VARCHAR(64) NOT NULL,
          external_id         VARCHAR(256),
          job_title           VARCHAR(500) NOT NULL,
          employer            VARCHAR(500),
          country             VARCHAR(64),
          city                VARCHAR(200),
          salary_display      VARCHAR(200),
          salary_kes_monthly  INTEGER,
          posted_at           TIMESTAMP,
          apply_url           TEXT        NOT NULL,
          description         TEXT,
          match_score         INTEGER     NOT NULL,
          match_reasons       TEXT[],
          cover_letter        TEXT,
          cover_letter_at     TIMESTAMP,
          status              VARCHAR(32) NOT NULL DEFAULT 'new',
          applied_at          TIMESTAMP,
          dismissed_at        TIMESTAMP,
          created_at          TIMESTAMP   NOT NULL DEFAULT NOW(),
          UNIQUE(agent_id, source, external_id)
        );
        CREATE INDEX IF NOT EXISTS autoapply_matches_agent_id_idx  ON autoapply_matches(agent_id);
        CREATE INDEX IF NOT EXISTS autoapply_matches_user_id_idx   ON autoapply_matches(user_id);
        CREATE INDEX IF NOT EXISTS autoapply_matches_status_idx    ON autoapply_matches(status);
        CREATE INDEX IF NOT EXISTS autoapply_matches_created_at_idx ON autoapply_matches(created_at DESC);
        CREATE INDEX IF NOT EXISTS autoapply_matches_score_idx     ON autoapply_matches(match_score DESC);

        CREATE TABLE IF NOT EXISTS autoapply_scan_runs (
          id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          agent_id            UUID        NOT NULL REFERENCES autoapply_agents(id) ON DELETE CASCADE,
          started_at          TIMESTAMP   NOT NULL DEFAULT NOW(),
          finished_at         TIMESTAMP,
          status              VARCHAR(32) NOT NULL,
          jobs_scanned        INTEGER     DEFAULT 0,
          matches_found       INTEGER     DEFAULT 0,
          matches_stored      INTEGER     DEFAULT 0,
          cover_letters_generated INTEGER DEFAULT 0,
          report_sent         BOOLEAN     DEFAULT false,
          error_message       TEXT
        );
        CREATE INDEX IF NOT EXISTS autoapply_scan_runs_agent_idx ON autoapply_scan_runs(agent_id, started_at DESC);
      `);
            // Routes already registered above — just start the scheduler now
            // that the tables are guaranteed to exist.
            const { startAutoApplyScheduler } = await Promise.resolve().then(() => __importStar(require("./lib/autoapply/scheduler")));
            startAutoApplyScheduler();
            console.log("[Server] ✓ AutoApply schema + scheduler ready");
        }
        catch (err) {
            console.error("[Server] ❌ AutoApply schema/scheduler bootstrap failed (routes still work, but scans won't run):", err?.message);
        }
        // Wire Sentry's Express error handler AFTER all routes are registered
        // but BEFORE any custom 500 middleware. No-op if Sentry isn't initialised.
        (0, sentry_1.attachSentryErrorHandler)(app);
        // 2026-07 (production audit MED-4): global catch-all handler. Runs LAST,
        // after Sentry has captured the exception. Ensures every unhandled
        // exception returns friendly JSON to the client (no HTML "Cannot GET /"
        // or stack-trace leakage). Every 500 gets a shareable error ref that
        // matches the Sentry event id + Render log timestamp.
        app.use((err, req, res, _next) => {
            // If a handler already sent a response, delegate to the default handler
            // so headers-already-sent doesn't blow up.
            if (res.headersSent)
                return _next(err);
            const timestamp = new Date();
            const y = timestamp.getUTCFullYear().toString().slice(-2);
            const m = String(timestamp.getUTCMonth() + 1).padStart(2, "0");
            const d = String(timestamp.getUTCDate()).padStart(2, "0");
            const h = String(timestamp.getUTCHours()).padStart(2, "0");
            const mi = String(timestamp.getUTCMinutes()).padStart(2, "0");
            const rand = Math.random().toString(36).slice(2, 6);
            const ref = `WAH-500-${y}${m}${d}${h}${mi}-${rand}`;
            // Log with enough context to correlate in Render logs
            console.error(`[error-handler] ${ref} ${req.method} ${req.path} | user=${req.user?.claims?.sub ?? "anon"} | msg="${err?.message ?? err}"`, err?.stack ? `\n${err.stack.split("\n").slice(0, 5).join("\n")}` : "");
            // Best-effort Sentry capture (may already have been captured by attachSentryErrorHandler)
            try {
                (0, sentry_1.captureException)(err);
            }
            catch { /* noop */ }
            const isProd = process.env.NODE_ENV === "production";
            res.status(err?.status ?? 500).json({
                ok: false,
                message: isProd
                    ? "Something went wrong on our end. Our team has been alerted."
                    : `[dev] ${err?.message ?? "Unknown error"}`,
                ref,
                supportEmail: "support@workabroadhub.tech",
            });
        });
        // 404 fallback for any /api/* route that no handler matched.
        // Returns JSON instead of Express's default HTML.
        app.use("/api", (_req, res) => {
            res.status(404).json({ ok: false, message: "Endpoint not found." });
        });
        // 2026-06 scaling work — fire-and-forget boot-time index creation.
        // Idempotent (CREATE INDEX IF NOT EXISTS) so safe to run every deploy.
        // Non-blocking so cold-start latency isn't affected.
        Promise.resolve().then(() => __importStar(require("./db/indexes"))).then((m) => m.ensureScalingIndexes().catch((e) => console.warn("[indexes] ensure failed (non-fatal):", e?.message)))
            .catch(() => { });
        // 2026-06 EXPIRATION ENFORCEMENT — scheduled sweep of expired subscriptions.
        // The lazy check in storage.getUserPlan() already prevents access for
        // expired users on their next request, but that leaves stale flags in
        // both Postgres + Supabase until the user comes back. Now a sweep runs
        // every 5 minutes server-side to proactively flip status='active' →
        // 'expired' when expires_at < now(). Ensures admin counts are accurate
        // and downgrades take effect even for offline users.
        //
        // Plan durations (per server/utils/plans.ts and storage.activateUserPlan):
        //   trial    KES 99       1 day    (24 hours)
        //   monthly  KES 1,000   30 days
        //   yearly   KES 4,500  365 days
        //   pro      alias for yearly
        Promise.resolve().then(() => __importStar(require("./services/subscriptionRenewal"))).then((m) => {
            const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
            // Run once at boot so freshly-deployed servers immediately catch
            // anything that expired while they were rebuilding.
            m.runSubscriptionExpirySweep().catch((e) => console.warn("[subscriptionRenewal] boot sweep failed:", e?.message));
            setInterval(() => {
                m.runSubscriptionExpirySweep().catch((e) => console.warn("[subscriptionRenewal] scheduled sweep failed:", e?.message));
            }, SWEEP_INTERVAL_MS);
            console.log("[subscriptionRenewal] scheduled sweep every 5 min — expired KES 99 / 1000 / 4500 subs auto-downgrade");
        })
            .catch(() => { });
        // ────────────────────────────────────────────────────────────────────────
        // NEAIMS SYNC — nightly refresh of the government agency registry.
        // ────────────────────────────────────────────────────────────────────────
        //
        // Pulls the full list of licensed / expired / deregistered agencies from
        // https://api.neaims.go.ke and UPSERTs into nea_agencies. Runs once at
        // boot (with a 30s delay so the server is ready), then every 24 hours.
        //
        // Feature-flagged: set env NEAIMS_SYNC_ENABLED=true to turn on. Off by
        // default so a bad deploy can't accidentally hammer the government API.
        //
        // See server/nea/neaimsSync.ts for the orchestrator and
        // server/routes/admin-nea-sync.ts for the admin trigger + history UI.
        if (process.env.NEAIMS_SYNC_ENABLED === "true") {
            Promise.resolve().then(() => __importStar(require("./nea/neaimsSync"))).then((m) => {
                const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
                const BOOT_DELAY_MS = 30 * 1000; // 30 seconds
                // Delay the boot-time run so we don't compete with startup traffic
                // and give the DB pool time to warm up.
                setTimeout(() => {
                    m.runNeaimsSync({ triggeredBy: "boot" })
                        .then((r) => console.log(`[NEAIMS sync] Boot sync ${r.status}: ${r.message}`))
                        .catch((e) => console.warn("[NEAIMS sync] Boot run threw:", e?.message));
                }, BOOT_DELAY_MS);
                setInterval(() => {
                    m.runNeaimsSync({ triggeredBy: "schedule" })
                        .then((r) => console.log(`[NEAIMS sync] Scheduled sync ${r.status}: ${r.message}`))
                        .catch((e) => console.warn("[NEAIMS sync] Scheduled run threw:", e?.message));
                }, SYNC_INTERVAL_MS);
                console.log(`[NEAIMS sync] Enabled — boot run in ${BOOT_DELAY_MS / 1000}s, then every 24h`);
            })
                .catch((e) => console.warn("[NEAIMS sync] Module import failed:", e?.message));
        }
        else {
            console.log("[NEAIMS sync] Disabled — set NEAIMS_SYNC_ENABLED=true to enable");
        }
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
