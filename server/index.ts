import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { initSocketIO } from "./socket";
import { seedDatabase, promoteFirstUserToAdmin, seedStudentVisas, seedApplicationPacks, seedFraudDetectionRules, seedVisaJobs, seedUsaVisaJobs, seedPlans, ensureIndexes, syncNeaAgencies, deduplicateNeaAgencies, syncServicePrices } from "./seed";
import { startLicenseChecker } from "./license-checker";
import { initSecurityMonitor, trackSecurityEvent } from "./security";
import { asyncQueue, registerQueueHandlers } from "./queue";
import { storage } from "./storage";
import { db, pool } from "./db";
import { sql } from "drizzle-orm";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
import compression from "compression";
import crypto from "crypto";
import { applyDdosProtection } from "./middleware/ddos-protection";
import { startStkRecoveryPoller } from "./stk-recovery";
import { startPortalHealthChecker } from "./portal-health-checker";
import { AppError, buildErrorRef } from "./utils/errors";
import { logErrorToFirebase } from "./services/firebaseRtdb";

const app = express();
const httpServer = createServer(app);

initSocketIO(httpServer);

// Security: CORS configuration - restrict to same origin and trusted domains
const allowedOrigins = new Set([
  ...(process.env.REPLIT_DOMAINS?.split(",").map(d => `https://${d}`) || []),
  "https://replit.com",
].filter(Boolean));

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, same-origin requests)
    if (!origin) {
      return callback(null, true);
    }
    // SECURITY: Parse origin URL and check exact host match
    try {
      const originUrl = new URL(origin);
      const originHost = originUrl.origin; // Gets full origin (protocol + host)
      if (allowedOrigins.has(originHost)) {
        return callback(null, true);
      }
      // In development, allow localhost
      if (process.env.NODE_ENV !== "production" && originUrl.hostname === "localhost") {
        return callback(null, true);
      }
    } catch {
      // Invalid URL - reject
    }
    callback(new Error("CORS not allowed"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-CSRF-Token"],
  maxAge: 86400, // 24 hours
}));

// Performance: Gzip compression for all responses (reduces bandwidth ~70%)
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers["x-no-compression"]) return false;
    return compression.filter(req, res);
  },
}));

// Observability: Assign unique request ID to every request for log correlation
app.use((req: Request, res: Response, next: NextFunction) => {
  const reqId = (req.headers["x-request-id"] as string) || crypto.randomUUID().slice(0, 8);
  (req as any).reqId = reqId;
  res.setHeader("x-request-id", reqId);
  next();
});

// Observability: Structured JSON request logging — only errors (4xx/5xx) and
// slow requests (>2 s) to prevent log flood.  Successful fast API calls are
// covered by the Vite-style logger below without incurring double output.
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const reqId = (req as any).reqId;
  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const isError = res.statusCode >= 400;
    const isSlow  = durationMs > 2000;
    if (req.path.startsWith("/api") && (isError || isSlow)) {
      const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
      const entry = {
        level,
        ts: new Date().toISOString(),
        reqId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs,
        ip: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress,
        ua: req.headers["user-agent"]?.slice(0, 80),
        ...(isSlow ? { slow: true } : {}),
      };
      if (level === "error") {
        console.error(JSON.stringify(entry));
      } else {
        console.warn(JSON.stringify(entry));
      }
    }
  });
  next();
});

// Security: DDoS protection — 7-layer stack (IP ban, bot detection, spike
// detection, under-attack mode, geo-restriction, slowloris guard, dynamic
// rate limiting). Must run before rate limiters and body parsing.
app.use(applyDdosProtection);

// Security: HTTP headers protection
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: process.env.NODE_ENV === "production"
        ? [
            "'self'", "'unsafe-inline'",
            // PayPal SDK
            "https://www.paypal.com", "https://www.paypalobjects.com",
            "https://js.braintreegateway.com",
            // Firebase Realtime Database (long-polling fallback)
            "https://*.firebaseio.com",
          ]
        : ["'self'", "'unsafe-inline'", "'unsafe-eval'",
            "https://www.paypal.com", "https://www.paypalobjects.com",
            "https://*.firebaseio.com"],
      styleSrc: [
        "'self'", "'unsafe-inline'",
        "https://fonts.googleapis.com",
        "https://www.paypalobjects.com",
      ],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://www.paypalobjects.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: [
        "'self'",
        "https://replit.com",
        "https://*.safaricom.co.ke",
        "https://api.safaricom.co.ke",
        "https://sandbox.safaricom.co.ke",
        "https://*.paypal.com",
        "https://www.paypalobjects.com",
        // Firebase Realtime Database & Firestore
        "https://*.firebaseio.com",
        "wss://*.firebaseio.com",
        "https://*.googleapis.com",
        "https://firebaseinstallations.googleapis.com",
        "wss:", "ws:",
      ],
      frameSrc: [
        "'self'",
        "https://www.paypal.com",
        "https://www.sandbox.paypal.com",
      ],
      frameAncestors: ["'self'"],
      formAction: ["'self'", "https://www.paypal.com"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      workerSrc: ["'self'", "blob:"],
      manifestSrc: ["'self'"],
      upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  hsts: {
    maxAge: 63072000, // 2 years (recommended by hstspreload.org)
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  xssFilter: true,
  permittedCrossDomainPolicies: { permittedPolicies: "none" },
}));

// Security: Permissions-Policy header to restrict browser features
app.use((_req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(self), payment=(self), fullscreen=(self)"
  );
  // Explicitly serve assetlinks with correct content-type (for TWA / Play Store verification)
  if (_req.path === "/.well-known/assetlinks.json") {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  next();
});

// ─── Rate limiting strategy ────────────────────────────────────────────────
// Key insight: per-IP limits punish shared NAT users (mobile carriers, offices).
// For authenticated sessions we key by session cookie so each user gets their
// own bucket regardless of how many people share the same IP address.
function rateLimitKey(req: Request): string {
  const raw = req.headers.cookie ?? "";
  const m = raw.match(/connect\.sid=s%3A([^;.%]+)/);
  if (m && m[1]) return `sid:${m[1]}`; // per-session bucket for authenticated users
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
         req.socket?.remoteAddress ||
         "unknown";
}

// Global API rate limiter — protects public/anonymous endpoints.
// Limit is intentionally generous: 1 000 req / 15 min (≈ 1 req/sec sustained).
// Authenticated sessions each get their own per-session bucket.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
  // Skip non-API routes AND admin routes (admins have their own dedicated limiter)
  skip: (req) => !req.path.startsWith("/api") || req.path.startsWith("/api/admin"),
  message: { message: "Too many requests from this session. Please try again in a few minutes." },
});
app.use(apiLimiter);

// Auth read endpoints (GET /api/auth/user etc.) are called on every page load —
// they MUST NOT be rate-limited or normal browsing becomes impossible.
// Only apply the strict auth limiter to mutating requests (login, register, etc.).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 30 login/register attempts per 15 min per session/IP is ample
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
  skip: (req) => req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS",
  handler: (req, res, _next, options) => {
    const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || req.socket?.remoteAddress;
    trackSecurityEvent({ eventType: "rate_limit_hit", ipAddress: ip, endpoint: req.path, userAgent: req.headers["user-agent"], metadata: { limiter: "auth" } });
    res.status(options.statusCode).json(options.message);
  },
  message: { message: "Too many authentication attempts. Please wait before trying again." },
});
app.use("/api/auth", authLimiter);

// Security: Rate limiting for payment endpoints (per-session, not per-IP)
const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
  handler: (req, res, _next, options) => {
    const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || req.socket?.remoteAddress;
    trackSecurityEvent({ eventType: "rate_limit_hit", ipAddress: ip, endpoint: req.path, userAgent: req.headers["user-agent"], metadata: { limiter: "payment" } });
    res.status(options.statusCode).json(options.message);
  },
  message: { message: "Too many payment attempts. Please try again later." },
});
app.use("/api/payments", paymentLimiter);
// Also apply to the legacy /api/mpesa/stkpush endpoint (max 10 per hour same as payment limiter)
app.use("/api/mpesa/stkpush", paymentLimiter);

// Security: Rate limiting for abuse report endpoint (prevent spam flooding)
const abuseLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // max 3 abuse reports per 15 minutes per IP
  message: { message: "Too many reports submitted. Please wait before trying again." },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/reports/abuse", abuseLimiter);

// Security: Rate limiting for referral endpoints (prevent fraud/abuse)
const referralLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // limit each IP to 5 referral creations per hour
  message: { message: "Too many referral attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/referrals", referralLimiter);

// Security: Rate limiting for M-Pesa callbacks (prevent replay attacks)
const mpesaCallbackLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // limit to 30 callbacks per minute per IP
  message: { ResultCode: 1, ResultDesc: "Rate limited" },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/mpesa/callback", mpesaCallbackLimiter);
app.use("/api/mpesa/b2c", mpesaCallbackLimiter);

// Security: Dedicated admin rate limiter — protects admin endpoints from credential-stuffing
// and automated bulk scraping while allowing legitimate admin dashboard polling.
// Admin dashboards poll multiple endpoints (stats, users, payments) at regular intervals,
// so we set a generous limit: 1000 requests per 15 minutes (≈1 req/sec sustained).
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // generous for admin dashboards with multiple polled endpoints
  message: { message: "Too many admin requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, _next, options) => {
    console.warn(
      `[Security] Admin rate limit exceeded | ip=${req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || req.socket?.remoteAddress} | path=${req.path} | method=${req.method}`
    );
    res.status(options.statusCode).json(options.message);
  },
});
app.use("/api/admin", adminLimiter);

// Performance: Rate limiting for AI-powered tool endpoints (expensive GPU/API operations)
// These call OpenAI and are billed per request — cap at 10/hour per IP to prevent abuse
const aiToolsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { message: "AI tool usage limit reached. Please try again in an hour." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = (req as any).user?.claims?.sub;
    return userId || (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
  },
});
app.use("/api/tools/ats-check", aiToolsLimiter);
app.use("/api/tools/scam-check", aiToolsLimiter);
app.use("/api/tools/scam-check-file", aiToolsLimiter);
app.use("/api/jobs/match", aiToolsLimiter);
app.use("/api/career-recommendations", aiToolsLimiter);
app.use("/api/service-orders/*/ai-process", aiToolsLimiter);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Security: Request body size limits to prevent large payload attacks
const BODY_SIZE_LIMIT = "100kb"; // Standard API requests
const WEBHOOK_BODY_SIZE_LIMIT = "1mb"; // M-Pesa callbacks may be larger

// IMPORTANT: Apply M-Pesa body parser BEFORE the global parser.
// Accepts any Content-Type — Safaricom callbacks sometimes omit or vary
// the Content-Type header (e.g. text/plain, application/json;charset=UTF-8).
// Without `type: '*/*'` Express silently skips parsing and req.body stays undefined.
app.use("/api/mpesa", express.json({
  limit: WEBHOOK_BODY_SIZE_LIMIT,
  type: ["application/json", "text/plain", "text/html", "*/*"],
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
}));

// Global JSON parser with smaller limit for all other routes
app.use(
  express.json({
    limit: BODY_SIZE_LIMIT,
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: BODY_SIZE_LIMIT }));

// Security: Input validation middleware to block dangerous payloads
// Uses detection (not mutation) approach to preserve data integrity

// XSS patterns — checked on all non-admin routes
const XSS_PATTERNS = [
  /<script\b[^>]*>/i,
  /<\/script>/i,
  /javascript\s*:/i,
  /\bon\w+\s*=\s*["']/i,
  /data:\s*text\/html/i,
  /<iframe\b/i,
  /<object\b/i,
  /<embed\b/i,
  /<form\b[^>]*action\s*=/i,
];

// SQL injection patterns — checked on ALL routes including admin
const SQL_INJECTION_PATTERNS = [
  /('|%27)\s*(or|and)\s*('|%27|\d)/i,           // ' OR '1'='1  / ' AND '
  /;\s*(drop|alter|truncate|create|insert|delete|update|replace)\s+/i, // ; DROP TABLE
  /\bunion\s+(all\s+)?select\b/i,                // UNION SELECT
  /\bselect\b.+\bfrom\b.+\bwhere\b/i,            // SELECT ... FROM ... WHERE
  /\b(exec|execute)\s*(\(|xp_)/i,               // EXEC / xp_cmdshell
  /--\s*$/m,                                      // SQL comment --
  /\/\*.*\*\//s,                                  // /* block comment */
  /\bwaitfor\s+delay\b/i,                         // time-based blind SQLi
  /\bbenchmark\s*\(/i,                            // MySQL time-based
  /\bload_file\s*\(/i,                            // MySQL file read
  /\binto\s+(outfile|dumpfile)\b/i,              // MySQL file write
  /\bchar\s*\(\s*\d/i,                            // CHAR() encoding
  /0x[0-9a-f]{4,}/i,                              // hex encoding
];

// Input length limits
const MAX_STRING_LENGTH = 10_000;
const MAX_SEARCH_LENGTH = 200;

function containsXss(value: any): boolean {
  if (typeof value === 'string') return XSS_PATTERNS.some(p => p.test(value));
  if (Array.isArray(value)) return value.some(containsXss);
  if (value && typeof value === 'object') return Object.values(value).some(containsXss);
  return false;
}

function containsSqlInjection(value: any, depth = 0): boolean {
  if (depth > 10) return false; // guard against deeply nested objects
  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LENGTH) return true; // reject absurdly long strings
    return SQL_INJECTION_PATTERNS.some(p => p.test(value));
  }
  if (Array.isArray(value)) return value.some(v => containsSqlInjection(v, depth + 1));
  if (value && typeof value === 'object') return Object.values(value).some(v => containsSqlInjection(v, depth + 1));
  return false;
}

const SANITIZE_SKIP_KEYS = new Set(['url', 'profileImageUrl', 'imageUrl', 'videoUrl', 'thumbnailUrl', 'websiteUrl', 'link', 'href']);

function containsXssFiltered(obj: any, skipKeys = SANITIZE_SKIP_KEYS): boolean {
  if (typeof obj === 'string') return XSS_PATTERNS.some(p => p.test(obj));
  if (Array.isArray(obj)) return obj.some(v => containsXssFiltered(v, skipKeys));
  if (obj && typeof obj === 'object') {
    return Object.entries(obj).some(([key, value]) => {
      if (skipKeys.has(key)) return false;
      return containsXssFiltered(value, skipKeys);
    });
  }
  return false;
}

// Keep backward-compatible alias used elsewhere in the file
const containsDangerousContent = containsXss;
function containsDangerousContentFiltered(obj: any, skipKeys = SANITIZE_SKIP_KEYS): boolean {
  return containsXssFiltered(obj, skipKeys);
}

// SQL injection check — applies to ALL routes (including /api/admin)
app.use((req, res, next) => {
  // Skip Safaricom M-Pesa callbacks and Twilio WhatsApp webhooks — they send opaque payloads
  if (req.path.startsWith('/api/mpesa') || req.path.startsWith('/api/whatsapp')) return next();

  const bodyHasSqli = req.body && typeof req.body === 'object' && containsSqlInjection(req.body);
  const queryHasSqli = req.query && typeof req.query === 'object' && containsSqlInjection(req.query);
  if (bodyHasSqli || queryHasSqli) {
    console.warn(`[Security] SQL injection attempt blocked: ${req.method} ${req.path} from ${req.ip}`);
    return res.status(400).json({ message: "Request contains potentially unsafe content" });
  }
  next();
});

// XSS check — applies to all routes EXCEPT admin (admins legitimately use rich text/HTML)
const INTERNAL_LOCALHOST = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
app.use((req, res, next) => {
  // Skip: M-Pesa callbacks (opaque payloads), admin routes (rich text), WhatsApp webhook (Twilio URL-encoded body may include URLs/HTML from user messages)
  if (req.path.startsWith('/api/mpesa') || req.path.startsWith('/api/admin') || req.path.startsWith('/api/whatsapp')) return next();
  const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || req.socket?.remoteAddress || "";
  // Skip XSS check for internal/localhost traffic to prevent false-positive alerts
  if (INTERNAL_LOCALHOST.has(ip) || ip.startsWith("::ffff:127.")) return next();
  const hasXss =
    (req.body && typeof req.body === 'object' && containsXssFiltered(req.body)) ||
    (req.query && typeof req.query === 'object' && containsXssFiltered(req.query));
  if (hasXss) {
    trackSecurityEvent({ eventType: "xss_attempt", ipAddress: ip, endpoint: req.path, userAgent: req.headers["user-agent"], metadata: { method: req.method } });
    return res.status(400).json({ message: "Request contains potentially unsafe content" });
  }
  next();
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// Security: Sensitive data patterns to redact from logs
const SENSITIVE_PATTERNS = [
  /phone[^"]*":\s*"([^"]+)"/gi,
  /phoneNumber[^"]*":\s*"([^"]+)"/gi,
  /email[^"]*":\s*"([^"]+)"/gi,
  /password[^"]*":\s*"([^"]+)"/gi,
  /token[^"]*":\s*"([^"]+)"/gi,
  /secret[^"]*":\s*"([^"]+)"/gi,
  /mpesaReceipt[^"]*":\s*"([^"]+)"/gi,
  /transactionRef[^"]*":\s*"([^"]+)"/gi,
  /CheckoutRequestID[^"]*":\s*"([^"]+)"/gi,
  /MerchantRequestID[^"]*":\s*"([^"]+)"/gi,
  /"2547\d{8}"/g, // Kenyan phone numbers
];

function redactSensitiveData(data: string): string {
  let redacted = data;
  for (const pattern of SENSITIVE_PATTERNS) {
    redacted = redacted.replace(pattern, (match) => {
      // Keep the key, redact the value
      const colonIndex = match.indexOf(":");
      if (colonIndex > -1) {
        return match.substring(0, colonIndex + 1) + ' "[REDACTED]"';
      }
      return '"[REDACTED]"';
    });
  }
  return redacted;
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  // Only capture response body for errors or slow requests to avoid log bloat
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      const isError  = res.statusCode >= 400;
      const isSlow   = duration > 2000;
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;

      // Only log response body for errors or requests slower than 2 s
      if (capturedJsonResponse && (isError || isSlow)) {
        const safeResponse = redactSensitiveData(JSON.stringify(capturedJsonResponse));
        // Cap at 500 chars to prevent enormous log lines
        logLine += ` :: ${safeResponse.slice(0, 500)}${safeResponse.length > 500 ? "…" : ""}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  registerQueueHandlers();
  await registerRoutes(httpServer, app);

  // Initialize WebSocket server for real-time revenue analytics (Step 8)
  try {
    const { initWebSocketServer } = await import("./websocket");
    const { getSessionParser } = await import("./replit_integrations/auth");
    initWebSocketServer(httpServer, getSessionParser());
  } catch (error) {
    console.error("Error starting WebSocket server:", error);
  }
  
  try {
    await seedDatabase();
    await promoteFirstUserToAdmin();
    await seedStudentVisas();
    await seedApplicationPacks();
    await seedFraudDetectionRules();
    await seedVisaJobs();
    await seedUsaVisaJobs();
    await seedPlans();
    await ensureIndexes();
    await syncNeaAgencies();
    await deduplicateNeaAgencies();
    // Sync canonical service prices — runs every startup, updates production DB prices
    await syncServicePrices();
    // Invalidate services cache so fresh prices are served immediately
    const { cache, CACHE_KEYS } = await import("./cache");
    cache.invalidate(CACHE_KEYS.SERVICES);
  } catch (error) {
    console.error("Error seeding database:", error);
  }

  // Self-heal: backfill any active pro subscriptions with missing end_date
  try {
    const { db: healDb } = await import("./db");
    const { sql: healSql } = await import("drizzle-orm");
    const result = await healDb.execute(healSql`
      UPDATE user_subscriptions
      SET end_date = start_date + INTERVAL '360 days'
      WHERE status = 'active'
        AND plan = 'pro'
        AND end_date IS NULL
        AND start_date IS NOT NULL
    `);
    const count = (result as any).rowCount ?? 0;
    if (count > 0) {
      console.info(`[Startup][Heal] Backfilled end_date for ${count} active pro subscription(s) with missing expiry.`);
    }
  } catch (healErr) {
    console.warn("[Startup][Heal] Could not backfill subscription end_dates:", (healErr as Error).message);
  }

  try {
    const { storage } = await import("./storage");
    startLicenseChecker(storage);
  } catch (error) {
    console.error("Error starting license checker:", error);
  }

  try {
    const { runSubscriptionExpirySweep } = await import("./services/subscriptionRenewal");
    // Run immediately on startup then every 24 hours
    // Google subs → re-verify via Play API (extend or deactivate)
    // M-Pesa / PayPal / direct → deactivate (one-time payments)
    runSubscriptionExpirySweep().catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
    setInterval(() => runSubscriptionExpirySweep().catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); }), 24 * 60 * 60 * 1000);
    console.log("[Supabase] Subscription expiry scheduler started (24h interval)");
  } catch (error) {
    console.error("Error starting Supabase expiry scheduler:", error);
  }

  try {
    const { governmentSyncService, governmentRegistry } = await import("./government");
    const { storage } = await import("./storage");
    governmentSyncService.initialize();
    
    const integrations = await storage.getGovernmentIntegrations();
    for (const integration of integrations) {
      if (integration.enabled) {
        try {
          await governmentRegistry.initializeAdapter(integration.code, {
            integrationId: integration.id,
            code: integration.code,
            baseUrl: integration.baseUrl || "",
            authType: integration.authType as any,
            credentialRef: integration.credentialRef || undefined,
            timeoutMs: integration.timeoutMs || 30000,
            retryAttempts: integration.retryAttempts || 3,
            rateLimit: integration.rateLimit || 100,
            metadata: integration.metadata as any,
          });
        } catch (err) {
          console.error(`[Gov] Failed to initialize adapter ${integration.code}:`, err);
        }
      }
    }
    console.log("[Gov] Government integration layer initialized");

    // Startup reconciliation: recover integrations stuck in fallback mode after restart
    governmentSyncService.startupReconciliation().catch(err =>
      console.error("[Gov] Startup reconciliation error:", err)
    );
  } catch (error) {
    console.error("Error initializing government integrations:", error);
  }

  try {
    const COMPLIANCE_SCAN_INTERVAL = 24 * 60 * 60 * 1000;
    setInterval(async () => {
      try {
        const { batchCalculateRiskScores } = await import("./compliance-risk-engine");
        const { runAnomalyDetection } = await import("./compliance-anomaly-detector");
        console.log("[Compliance] Starting daily compliance scan...");
        const [riskResults, anomalyResults] = await Promise.all([
          batchCalculateRiskScores(),
          runAnomalyDetection(),
        ]);
        console.log(`[Compliance] Daily scan complete: ${riskResults.processed} risk scores (${riskResults.highRisk} high-risk), ${anomalyResults.anomaliesFound} anomalies`);
        try {
          const { batchCalculateIndex } = await import("./compliance-index-engine");
          const indexResult = await batchCalculateIndex();
          console.log(`[Compliance] Index recalculated: ${indexResult.ranked} agencies ranked`);
        } catch (indexErr) {
          console.error("[Compliance] Index recalculation failed:", indexErr);
        }
        try {
          const { invalidateExpiredCertificates } = await import("./certificate-engine");
          const certResult = await invalidateExpiredCertificates();
          console.log(`[Certificates] Auto-invalidated ${certResult.invalidated} certificates`);
        } catch (certErr) {
          console.error("[Certificates] Auto-invalidation failed:", certErr);
        }
        try {
          const { runPatternDetection } = await import("./scam-intelligence-engine");
          const scamResult = await runPatternDetection();
          console.log(`[ScamIntel] Pattern scan: ${scamResult.scanned} indicators scanned, ${scamResult.escalated} escalated, ${scamResult.alertsCreated} alerts`);
        } catch (scamErr) {
          console.error("[ScamIntel] Pattern detection failed:", scamErr);
        }
      } catch (err) {
        console.error("[Compliance] Daily scan failed:", err);
      }
    }, COMPLIANCE_SCAN_INTERVAL);
    console.log("[Compliance] Daily compliance scanner scheduled (24h interval)");

    try {
      const { invalidateExpiredCertificates } = await import("./certificate-engine");
      const startupResult = await invalidateExpiredCertificates();
      console.log(`[Certificates] Startup invalidation: ${startupResult.invalidated} certificates processed`);
    } catch (certStartupErr) {
      console.error("[Certificates] Startup invalidation failed:", certStartupErr);
    }
  } catch (error) {
    console.error("Error setting up compliance scanner:", error);
  }

  try {
    const { startReconcilerScheduler } = await import("./mpesa-reconciler");
    startReconcilerScheduler();
  } catch (error) {
    console.error("Error starting M-Pesa reconciler:", error);
  }

  try {
    const { startPayoutScheduler } = await import("./referral-payout-scheduler");
    startPayoutScheduler();
  } catch (error) {
    console.error("Error starting referral payout scheduler:", error);
  }

  try {
    const { startCommissionScheduler } = await import("./commission-payout-scheduler");
    startCommissionScheduler();
  } catch (error) {
    console.error("Error starting commission payout scheduler:", error);
  }

  try {
    const { startServiceRequestScheduler } = await import("./service-request-scheduler");
    startServiceRequestScheduler();
  } catch (error) {
    console.error("Error starting service request scheduler:", error);
  }

  try {
    initSecurityMonitor();
  } catch (error) {
    console.error("Error starting security monitor:", error);
  }

  // Ensure payment-related DB columns exist (safe no-op if already present).
  // Runs on every startup so production DB stays in sync with dev DB automatically.
  try {
    const { ensurePaymentColumns } = await import("./migrate-payments");
    await ensurePaymentColumns();
  } catch (error) {
    console.error("Error running payment schema migration:", error);
  }

  // STK Auto-Recovery poller — proactively queries Safaricom every 30s for in-progress
  // M-Pesa payments and auto-activates plans when payment is confirmed, eliminating
  // "STK Sent – Stuck" payments caused by unreliable Safaricom callbacks.
  try {
    startStkRecoveryPoller();
  } catch (error) {
    console.error("Error starting STK recovery poller:", error);
  }

  try {
    startPortalHealthChecker();
  } catch (error) {
    console.error("Error starting portal health checker:", error);
  }

  // ── Background error threshold poller ─────────────────────────────────────
  // Reads errors/backend from Firebase RTDB every 5 minutes.
  // If unresolved backend errors exceed ALERT_THRESHOLD and the last alert
  // was sent >1 hour ago, sends a WhatsApp message to ADMIN_PHONE_NUMBER.
  {
    const ALERT_THRESHOLD = 10;
    const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
    let lastAlertTs = 0;

    setInterval(async () => {
      try {
        const DB_URL = process.env.VITE_FIREBASE_DATABASE_URL;
        if (!DB_URL) return;

        const r = await fetch(`${DB_URL}/errors/backend.json`);
        if (!r.ok) return;
        const data = await r.json() as Record<string, { resolved?: boolean }> | null;
        if (!data) return;

        const unresolved = Object.values(data).filter((e) => !e?.resolved).length;
        const now = Date.now();

        if (unresolved > ALERT_THRESHOLD && now - lastAlertTs > ALERT_COOLDOWN_MS) {
          const adminPhone = process.env.ADMIN_PHONE_NUMBER;
          if (!adminPhone) return;

          const { sendWhatsApp } = await import("./sms");
          await sendWhatsApp(
            adminPhone,
            `🚨 *WorkAbroad Hub — Auto Alert*\n\n` +
            `Backend unresolved errors: *${unresolved}* (threshold: ${ALERT_THRESHOLD})\n\n` +
            `Review at: /admin/error-monitor`
          );
          lastAlertTs = now;
          console.log(`[ErrorPoller] Alert sent — ${unresolved} unresolved backend errors`);
        }
      } catch (e) {
        // Silent — never crash the server over a monitoring check
      }
    }, 5 * 60 * 1000); // every 5 minutes

    console.log("[ErrorPoller] Background error threshold poller started (5-min interval)");
  }

  // Payment expiry cron — expire "awaiting_payment" records older than 2 minutes.
  // Safaricom STK Push itself expires in ~2 minutes; matching our state machine to that window
  // means no callback will ever arrive for an expired order.
  // Cron runs every 60 seconds for prompt cleanup.
  // If the payment still has retries remaining, it transitions to "retry_available" instead of "expired".
  setInterval(async () => {
    try {
      const expiredRecords = await storage.expireStalePayments(2);
      if (expiredRecords.length > 0) {
        console.log(`[PaymentExpiry] Expired ${expiredRecords.length} stale awaiting_payment record(s)`);
        for (const p of expiredRecords) {
          // ── Safety net: do one final STK Query before marking as stuck ──────
          // The recovery poller handles most cases at 90s; this catches anything
          // that slipped through (e.g., server restart between 90s and 120s).
          if (p.transactionRef?.startsWith("ws_CO_")) {
            try {
              const { stkQuery: doQuery } = await import("./mpesa");
              const { sendProActivationEmail: sendEmail } = await import("./email");
              const qr = await doQuery(p.transactionRef);
              if (qr.ResultCode === 0) {
                const receipt =
                  qr.CallbackMetadata?.Item?.find((i: any) => i.Name === "MpesaReceiptNumber")?.Value
                  || qr.MpesaReceiptNumber
                  || `EXPIRY-RECOVERED-${Date.now()}`;
                const expiresAt = new Date(Date.now() + 360 * 24 * 60 * 60 * 1000);
                await storage.updatePayment(p.id, { status: "success", transactionRef: String(receipt) } as any);
                await storage.activateUserPlan(p.userId, (p as any).planId || "pro", p.id, expiresAt);
                await storage.updateUserStage(p.userId, "paid").catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
                const user = await storage.getUserById(p.userId);
                if (user?.email) {
                  sendEmail(user.email, user.firstName || "", expiresAt, receipt).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
                }
                console.log(`[PaymentExpiry] Late-recovery: payment ${p.id} confirmed → ${receipt}`);
                continue; // skip the retry_available / notify logic below
              } else if ([1032, 1037, 2001, 17, 1].includes(qr.ResultCode)) {
                await storage.updatePayment(p.id, {
                  status: "failed",
                  failReason: qr.ResultDesc || `STK failed (code ${qr.ResultCode})`,
                } as any).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
                console.log(`[PaymentExpiry] Payment ${p.id} definitively failed (code ${qr.ResultCode})`);
                continue;
              }
            } catch (_qErr: any) {
              // Query failed — fall through to normal retry_available handling
            }
          }

          const retryCount = (p as any).retryCount ?? 0;
          const maxRetries = (p as any).maxRetries ?? 3;
          const canRetry = retryCount < maxRetries && !p.isSuspicious;
          if (canRetry) {
            // Transition to retry_available instead of expired so user/auto-retry can retry
            await storage.updatePayment(p.id, {
              status: "retry_available",
              failReason: "awaiting_payment timeout — STK Push expired",
            } as any).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
          }
          // Notify user
          storage.createUserNotification({
            userId: p.userId,
            type: "warning",
            title: canRetry ? "Payment Session Expired — Retry Available" : "Payment Session Expired",
            message: canRetry
              ? `Your M-Pesa payment session expired. You have ${maxRetries - retryCount} retry attempt(s) remaining. Tap "Retry Payment" to try again.`
              : "Your M-Pesa payment session expired. Please start a new payment.",
          }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        }
      }
    } catch (err: any) {
      console.error("[PaymentExpiry] Error expiring stale payments:", err.message);
    }
  }, 60 * 1000);

  // Service order cleanup — expire pending_payment service orders older than 48h.
  // These are orders where the STK Push was initiated but payment never completed.
  // Runs every 6 hours to avoid orphaning large numbers of stale records.
  setInterval(async () => {
    try {
      const expired = await storage.expireStaleServiceOrders(48);
      if (expired.length > 0) {
        console.log(`[ServiceOrderExpiry] Expired ${expired.length} stale pending_payment service order(s)`);
      }
    } catch (err: any) {
      console.error("[ServiceOrderExpiry] Error expiring stale service orders:", err.message);
    }
  }, 6 * 60 * 60 * 1000); // every 6 hours

  // Manual override expiry reconciliation — runs every hour to detect overrides whose
  // manual verification window has passed and mark them for re-sync with the government API.
  setInterval(async () => {
    try {
      const expired = await storage.getExpiredManualOverrides();
      if (expired.length > 0) {
        for (const override of expired) {
          await storage.updateManualOverride(override.id, {
            overrideStatus: "submitted",
            manualLicenseStatus: "UNKNOWN",
            expiryNotified: true,
            syncRequired: true,
          });
          await storage.createComplianceAuditLog({
            userId: "system",
            userRole: "system",
            action: "manual_verification_expired",
            recordType: "manual_override",
            recordId: override.id,
            details: { licenseNumber: override.licenseNumber, expiredAt: override.manualVerificationExpiry },
          }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        }
        console.log(`[OverrideExpiry] Expired ${expired.length} manual override(s) — pending government re-sync`);
      }
    } catch (err: any) {
      console.error("[OverrideExpiry] Error checking override expiry:", err.message);
    }
  }, 60 * 60 * 1000); // every hour

  // Payment retry scheduler — auto-retries failed STK Push payments (first failure only)
  try {
    const { startPaymentRetryScheduler } = await import("./payment-retry");
    startPaymentRetryScheduler();
  } catch (error) {
    console.error("Error starting payment retry scheduler:", error);
  }

  // Platform stats cache — PostgreSQL equivalent of MySQL CREATE EVENT EVERY 5 MINUTE
  try {
    const { startStatsCacheScheduler } = await import("./lib/stats-cache");
    startStatsCacheScheduler();
  } catch (error) {
    console.error("Error starting stats cache scheduler:", error);
  }

  // Application deadline reminders — emails users 3 days before their set deadline
  try {
    const { startDeadlineReminderScheduler } = await import("./deadline-reminder-scheduler");
    startDeadlineReminderScheduler();
  } catch (error) {
    console.error("Error starting deadline reminder scheduler:", error);
  }

  // WhatsApp 24-hour CV follow-up messages
  try {
    const { startWaFollowupScheduler } = await import("./wa-followup-scheduler");
    startWaFollowupScheduler();
  } catch (error) {
    console.error("Error starting WA follow-up scheduler:", error);
  }

  // CV email drip sequence (email1 immediate, email2 +2d, email3 +5d)
  try {
    const { startCvEmailSequenceScheduler } = await import("./cv-email-sequence");
    startCvEmailSequenceScheduler();
  } catch (error) {
    console.error("Error starting CV email sequence scheduler:", error);
  }

  try {
    const { startReEngagementScheduler } = await import("./schedulers/reEngagement");
    startReEngagementScheduler();
  } catch (error) {
    console.error("Error starting re-engagement scheduler:", error);
  }

  // WhatsApp queue — generic outbox + abandoned payment/application scanner
  try {
    const { startWhatsappQueueProcessor } = await import("./whatsapp-queue");
    startWhatsappQueueProcessor();
  } catch (error) {
    console.error("Error starting WhatsApp queue processor:", error);
  }

  try {
    const { startCvWorker } = await import("./lib/cvQueue");
    startCvWorker();
  } catch (error) {
    console.error("Error starting CV BullMQ worker:", error);
  }

  try {
    const { startAppWorker } = await import("./lib/appQueue");
    startAppWorker();
  } catch (error) {
    console.error("Error starting application-materials BullMQ worker:", error);
  }

  try {
    const { startJobWorker, startJobRecoveryPoller } = await import("./lib/jobQueue");
    startJobWorker();
    startJobRecoveryPoller();
  } catch (error) {
    console.error("Error starting job-application Bull worker:", error);
  }

  // Firebase RTDB prune — removes records older than 30 days from unbounded paths
  // (signups/, errors/backend, errors/frontend, nanjila/conversations)
  try {
    const { startFirebasePruneScheduler } = await import("./services/firebaseRtdb");
    startFirebasePruneScheduler(30);
  } catch (error) {
    console.error("Error starting Firebase prune scheduler:", error);
  }

  // ── Global Express error handler ────────────────────────────────────────────
  // Must have exactly 4 parameters to be recognised as error middleware by Express.
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    // ── 1. Resolve status code & error type ─────────────────────────────────
    let statusCode: number = err.statusCode || err.status || 500;
    let errorType: string = err.errorType || "server";
    let message: string = err.message || "Something went wrong";

    // Zod / Mongoose-style validation errors
    if (err.name === "ZodError" || err.name === "ValidationError") {
      statusCode = 400;
      errorType = "validation";
      message = err.errors
        ? Object.values(err.errors).map((e: any) => e.message).join(", ")
        : err.message;
    }

    // Bad ID / cast errors
    if (err.name === "CastError") {
      statusCode = 400;
      errorType = "validation";
      message = "Invalid ID format";
    }

    // Unique constraint violations (pg error code 23505)
    if (err.code === "23505" || err.code === 11000) {
      statusCode = 409;
      errorType = "validation";
      message = "Duplicate entry — that record already exists";
    }

    // JWT auth errors
    if (err.name === "JsonWebTokenError") {
      statusCode = 401;
      errorType = "auth";
      message = "Invalid token. Please log in again.";
    }
    if (err.name === "TokenExpiredError") {
      statusCode = 401;
      errorType = "auth";
      message = "Your session has expired. Please log in again.";
    }

    // Payment-specific errors
    if (message?.includes("M-Pesa") || message?.includes("mpesa") || message?.includes("STK")) {
      errorType = "payment";
      message = "Payment processing issue. Your money is safe — please try again.";
    }

    // Network / connection errors
    if (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT" || err.code === "ENOTFOUND") {
      errorType = "network";
      message = "Connection issue. Please check your internet connection.";
    }

    const isServerError = statusCode >= 500;
    const ref = buildErrorRef(statusCode);

    // ── 2. Structured console log ────────────────────────────────────────────
    if (isServerError || process.env.NODE_ENV !== "production") {
      console.error(
        JSON.stringify({
          level: "error",
          ts: new Date().toISOString(),
          method: req.method,
          path: req.path,
          status: statusCode,
          errorType,
          message,
          ref,
          stack: isServerError ? err.stack : undefined,
        })
      );
    }

    // ── 3. Log to Firebase RTDB (fire-and-forget) ────────────────────────────
    logErrorToFirebase({
      type: errorType,
      code: statusCode,
      message,
      stack: isServerError ? err.stack : undefined,
      url: req.originalUrl,
      method: req.method,
      user: (req as any).user?.id?.toString() ?? "anonymous",
      timestamp: new Date().toISOString(),
    }).catch(() => { /* never block the response */ });

    if (res.headersSent) return;

    // ── 4. API callers get structured JSON ───────────────────────────────────
    const isApiRequest =
      req.xhr ||
      req.path.startsWith("/api") ||
      (req.headers.accept ?? "").includes("application/json");

    if (isApiRequest) {
      return res.status(statusCode).json({
        success: false,
        error: {
          type: errorType,
          message: isServerError
            ? "Something went wrong on our end. Please try again."
            : message,
          reference: ref,
        },
      });
    }

    // ── 5. Browser requests → redirect to branded error page ────────────────
    const source = encodeURIComponent(req.originalUrl);
    res.redirect(`/error?type=${errorType}&code=${statusCode}&source=${source}`);
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ── DATABASE AUDIT ─────────────────────────────────────────────────────────
  // Print which database URL is active, confirm all services share one pool,
  // then fix any stale users.plan values that diverged from user_subscriptions.
  {
    const rawUrl = process.env.DATABASE_URL || "(not set)";
    let maskedUrl = rawUrl;
    try {
      const u = new URL(rawUrl);
      maskedUrl = `${u.protocol}//${u.username}:****@${u.host}${u.pathname}`;
    } catch { /* not a valid URL — print raw */ }

    // Query the actual database name so we can prove all services share ONE DB
    let dbName = "unknown";
    try {
      const r = await pool.query("SELECT current_database() AS name");
      dbName = r.rows[0]?.name ?? "unknown";
    } catch { /* ignore — audit only */ }

    console.log("[DB] ═══════════════════════════════════════════════════");
    console.log(`[DB] DATABASE_URL (masked) : ${maskedUrl}`);
    console.log(`[DB] Active database name  : ${dbName}`);
    console.log("[DB] Services → single shared pool (server/db.ts)");
    console.log("[DB]   ✓ Signup / Login   → server/db.ts → DATABASE_URL");
    console.log("[DB]   ✓ Session store    → DATABASE_URL (connect-pg-simple)");
    console.log("[DB]   ✓ Admin dashboard  → server/db.ts → DATABASE_URL");
    console.log("[DB]   ✓ Payment system   → server/db.ts → DATABASE_URL");
    console.log("[DB]   ✓ All other routes → server/db.ts → DATABASE_URL");
    console.log("[DB] ONE database · ONE connection pool · ALL services unified ✓");
    console.log("[DB] ═══════════════════════════════════════════════════");

    // ── Startup plan sync ─────────────────────────────────────────────────
    // Fix users whose users.plan column diverged from their active subscription.
    // Safe to run on every startup — only updates rows that are out of sync.
    try {
      const syncResult = await pool.query(`
        UPDATE users u
        SET    plan       = us.plan,
               updated_at = NOW()
        FROM   user_subscriptions us
        WHERE  u.id       = us.user_id
          AND  us.status  = 'active'
          AND  (us.end_date IS NULL OR us.end_date > NOW())
          AND  u.plan    != us.plan
        RETURNING u.id, u.email, us.plan AS synced_plan
      `);
      if (syncResult.rowCount && syncResult.rowCount > 0) {
        console.log(`[DB] Plan sync: fixed ${syncResult.rowCount} user(s) whose plan was stale:`);
        syncResult.rows.forEach((r: any) =>
          console.log(`[DB]   ↳ userId=${r.id} email=${r.email} → plan=${r.synced_plan}`)
        );
      } else {
        console.log("[DB] Plan sync: all users.plan values are consistent ✓");
      }
    } catch (syncErr: any) {
      console.error("[DB] Plan sync error (non-fatal):", syncErr.message);
    }

    // ── Startup phone normalisation ────────────────────────────────────────
    // Convert any phone numbers stored in non-standard format to 254XXXXXXXXX.
    // Handles: 07XXXXXXXX → 254XXXXXXXX  |  0XXXXXXXXX → 254XXXXXXXXX  |  +254... → 254...
    // Leaves NULL untouched. Runs on every startup — idempotent.
    try {
      // 1. Normalize formatting
      const phoneNorm = await pool.query(`
        UPDATE users
        SET    phone      = CASE
                             WHEN phone LIKE '0%' THEN '254' || SUBSTRING(phone FROM 2)
                             WHEN phone LIKE '+%' THEN SUBSTRING(phone FROM 2)
                             ELSE phone
                           END,
               updated_at = NOW()
        WHERE  phone IS NOT NULL
          AND  (phone LIKE '0%' OR phone LIKE '+%')
        RETURNING id, email, phone AS normalized_phone
      `);
      if (phoneNorm.rowCount && phoneNorm.rowCount > 0) {
        console.log(`[DB] Phone normalisation: fixed ${phoneNorm.rowCount} user(s):`);
        phoneNorm.rows.forEach((r: any) =>
          console.log(`[DB]   ↳ userId=${r.id} email=${r.email} → phone=${r.normalized_phone}`)
        );
      } else {
        console.log("[DB] Phone normalisation: all phone numbers are already in 254XXXXXXXXX format ✓");
      }

      // 2. Detect duplicate phone numbers (keep first account, null out later duplicates)
      const dupeFix = await pool.query(`
        WITH ranked AS (
          SELECT id,
                 phone,
                 ROW_NUMBER() OVER (PARTITION BY phone ORDER BY created_at) AS rn
          FROM   users
          WHERE  phone IS NOT NULL
        ),
        dupes AS (
          SELECT id FROM ranked WHERE rn > 1
        )
        UPDATE users
        SET    phone      = NULL,
               updated_at = NOW()
        WHERE  id IN (SELECT id FROM dupes)
        RETURNING id, email
      `);
      if (dupeFix.rowCount && dupeFix.rowCount > 0) {
        console.warn(`[DB] Phone dedup: nulled phone on ${dupeFix.rowCount} duplicate account(s):`);
        dupeFix.rows.forEach((r: any) =>
          console.warn(`[DB]   ↳ userId=${r.id} email=${r.email} — duplicate phone cleared`)
        );
      } else {
        console.log("[DB] Phone dedup: no duplicate phone numbers found ✓");
      }
    } catch (phoneErr: any) {
      console.error("[DB] Phone normalisation error (non-fatal):", phoneErr.message);
    }
  }

  const PORT = process.env.PORT || 5000;

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    console.error("[Server] Fatal listen error:", err.message);
    process.exit(1);
  });

  httpServer.listen(PORT, "0.0.0.0", async () => {
    console.log("Server running on port " + PORT);

      // Log the M-Pesa callback URL at startup so it's always visible in logs
      const appUrl = process.env.APP_URL || "";
      const replitDomains = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim() || "";
      const baseUrl = appUrl || (replitDomains ? `https://${replitDomains}` : "http://localhost:5000");
      const callbackUrl = `${baseUrl}/api/mpesa/callback`;
      const isPublic = callbackUrl.startsWith("https://") && !callbackUrl.includes("localhost");
      log(`[M-Pesa] Callback URL: ${callbackUrl} | Public: ${isPublic ? "YES ✓" : "NO ✗ — set APP_URL secret to your deployed domain"}`);

      // ── Startup: patch mismatched sessions ───────────────────────────────
      // Fix sessions where a user registered via email/password then later
      // signed in via Replit OIDC — the OIDC claims.sub won't match their
      // real DB user ID, so we update the sessions table directly.
      try {
        const mismatchedRows = await db.execute(sql`
          SELECT s.sid, s.sess, u.id AS real_id, u.email
          FROM sessions s
          JOIN users u ON u.email = s.sess->'passport'->'user'->'claims'->>'email'
          WHERE s.expire > NOW()
            AND s.sess->'passport'->'user'->'claims'->>'sub' IS NOT NULL
            AND s.sess->'passport'->'user'->'claims'->>'sub' != u.id
        `);
        const rows = (mismatchedRows.rows ?? mismatchedRows) as any[];
        let patched = 0;
        for (const row of rows) {
          const sess = typeof row.sess === "string" ? JSON.parse(row.sess) : row.sess;
          const oldId = sess?.passport?.user?.claims?.sub;
          if (sess?.passport?.user?.claims) {
            sess.passport.user.claims.sub = row.real_id;
          }
          await db.execute(sql`
            UPDATE sessions SET sess = ${JSON.stringify(sess)}::jsonb WHERE sid = ${row.sid}
          `);
          patched++;
          console.log(`[SessionMerge] ${row.email}: ${oldId} → ${row.real_id}`);
        }
        if (patched > 0) {
          console.log(`[SessionMerge] ✓ Patched ${patched} mismatched session(s) at startup`);
        }
      } catch (mergeErr: any) {
        console.warn("[SessionMerge] Startup merge failed (non-fatal):", mergeErr?.message);
      }
  });

  // ── Graceful shutdown ────────────────────────────────────────────────────────
  // Drain connections cleanly when Replit / container sends SIGTERM (deploy / restart).
  async function shutdown(signal: string) {
    console.log(`[Shutdown] Received ${signal}. Draining connections…`);
    httpServer.close(async () => {
      try {
        await pool.end();
        console.log("[Shutdown] DB pool closed. Exiting.");
      } catch (e) {
        console.error("[Shutdown] Error closing DB pool:", e);
      }
      process.exit(0);
    });

    // Force exit after 10 s if still draining
    setTimeout(() => {
      console.error("[Shutdown] Forced exit after timeout.");
      process.exit(1);
    }, 10_000);
  }

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT",  () => shutdown("SIGINT"));
})();

// ── Process-level safety net ────────────────────────────────────────────────
// Catch async errors that escape all try/catch blocks so the process doesn't
// silently die without a log entry (critical for idempotent payment callbacks).
process.on("unhandledRejection", (reason: unknown) => {
  console.error(
    JSON.stringify({
      level: "fatal",
      ts: new Date().toISOString(),
      event: "unhandledRejection",
      reason: reason instanceof Error
        ? { message: reason.message, stack: reason.stack }
        : String(reason),
    })
  );
  // Don't crash — log and continue serving requests
});

process.on("uncaughtException", (err: Error) => {
  // Passport 0.6.x + connect-pg-simple race condition: if a session expires
  // between the time it's loaded and when passport calls req.session.regenerate(),
  // the session object is undefined and throws. This is non-fatal in both dev
  // (stack includes "sessionmanager"/"connect-pg-simple") and production
  // (stack only shows minified "dist/index.cjs" paths) — always swallow it.
  if (
    err.message?.includes("regenerate") ||
    (err.message?.includes("Cannot read properties of undefined") &&
      err.stack?.includes("regenerate"))
  ) {
    console.warn("[Auth] Session regenerate race condition (non-fatal, skipping):", err.message);
    return;
  }

  console.error(
    JSON.stringify({
      level: "fatal",
      ts: new Date().toISOString(),
      event: "uncaughtException",
      message: err.message,
      stack: err.stack,
    })
  );
  // Uncaught exceptions leave the process in an unknown state — exit and let
  // Replit restart the process automatically.
  process.exit(1);
});
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});
