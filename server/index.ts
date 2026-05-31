
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
  const _path = require("path") as typeof import("path");
  if (typeof __filename === "string" && __filename.split(_path.sep).includes("dist")) {
    const moduleAlias: any = require("module-alias");
    // __dirname here = .../dist/server, so ../shared = .../dist/shared
    moduleAlias.addAliases({
      "@shared": _path.resolve(__dirname, "..", "shared"),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SAFE PROCESS-LEVEL HANDLERS (ONLY DEFINE ONCE)
// ─────────────────────────────────────────────────────────────────────────────

process.on("unhandledRejection", (reason: unknown) => {
  console.error(
    JSON.stringify({
      level: "error",
      ts: new Date().toISOString(),
      event: "unhandledRejection",
      reason:
        reason instanceof Error
          ? {
              message: reason.message,
              stack: reason.stack,
            }
          : String(reason),
    })
  );

  // DO NOT CRASH THE SERVER
});

process.on("uncaughtException", (err: Error) => {
  // Passport regenerate race condition safeguard
  if (
    err.message?.includes("regenerate") ||
    (err.message?.includes("Cannot read properties of undefined") &&
      err.stack?.includes("regenerate"))
  ) {
    console.warn(
      "[Auth] Non-fatal session regenerate race condition:",
      err.message
    );
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

  // ONLY EXIT FOR TRULY FATAL ERRORS
  const fatalPatterns = [
    "ENOMEM",
    "heap out of memory",
    "EADDRINUSE",
    "Segmentation fault",
  ];

  const isFatal = fatalPatterns.some((p) =>
    err.message?.toLowerCase().includes(p.toLowerCase())
  );

  if (isFatal) {
    console.error("[System] Fatal runtime error detected. Shutting down.");
    process.exit(1);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS
// ─────────────────────────────────────────────────────────────────────────────

import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";

import compression from "compression";
import cors from "cors";
import crypto from "crypto";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { createServer } from "http";

import { db, pool } from "./db";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { initSocketIO } from "./socket";

import { applyDdosProtection } from "./middleware/ddos-protection";

const app = express();
const httpServer = createServer(app);

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

initSocketIO(httpServer);

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

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      try {
        const originUrl = new URL(origin);

        if (allowedOrigins.has(originUrl.origin)) {
          return callback(null, true);
        }

        if (
          process.env.NODE_ENV !== "production" &&
          originUrl.hostname === "localhost"
        ) {
          return callback(null, true);
        }
      } catch {}

      callback(new Error("CORS not allowed"));
    },

    credentials: true,
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// HELMET
// ─────────────────────────────────────────────────────────────────────────────

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: {
      policy: "same-origin-allow-popups",
    },
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// COMPRESSION
// ─────────────────────────────────────────────────────────────────────────────

app.use(
  compression({
    level: 6,
    threshold: 1024,
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// REQUEST IDS
// ─────────────────────────────────────────────────────────────────────────────

app.use((req: Request, res: Response, next: NextFunction) => {
  const reqId =
    (req.headers["x-request-id"] as string) ||
    crypto.randomUUID().slice(0, 8);

  (req as any).reqId = reqId;

  res.setHeader("x-request-id", reqId);

  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// DDOS PROTECTION
// ─────────────────────────────────────────────────────────────────────────────

app.use(applyDdosProtection);

// ─────────────────────────────────────────────────────────────────────────────
// RATE LIMITERS
// ─────────────────────────────────────────────────────────────────────────────

function rateLimitKey(req: Request): string {
  const raw = req.headers.cookie ?? "";
  const m = raw.match(/connect\.sid=s%3A([^;.%]+)/);

  if (m && m[1]) {
    return `sid:${m[1]}`;
  }

  return (
    (req.headers["x-forwarded-for"] as string)
      ?.split(",")[0]
      ?.trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

const apiLimiter = rateLimit({
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

app.use(
  "/api/mpesa",
  express.json({
    limit: "1mb",

    // REMOVED */* (VERY IMPORTANT)
    type: ["application/json", "text/plain"],

    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
  })
);

app.use(
  express.json({
    limit: "100kb",
  })
);

app.use(
  express.urlencoded({
    extended: false,
    limit: "100kb",
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// LIGHTWEIGHT REQUEST LOGGING
// ─────────────────────────────────────────────────────────────────────────────

app.use((req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;

    if (
      req.path.startsWith("/api") &&
      (res.statusCode >= 400 || duration > 2000)
    ) {
      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration,
        })
      );
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

    await registerRoutes(httpServer, app);

    // ────────────────────────────────────────────────────────────────────────
    // BACKGROUND STARTUP TASKS (NON-BLOCKING)
    // ────────────────────────────────────────────────────────────────────────

    import("./seed")
      .then(async (m) => {
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

    import("./license-checker")
      .then(async (m) => {
        const { storage } = await import("./storage");

        m.startLicenseChecker(storage);
      })
      .catch(console.error);

    import("./stk-recovery")
      .then((m) => {
        m.startStkRecoveryPoller();
      })
      .catch(console.error);

    import("./portal-health-checker")
      .then((m) => {
        m.startPortalHealthChecker();
      })
      .catch(console.error);

    // Restored (Batch C): security event monitor. Watches for anomalies and
    // creates security alerts. Safe no-op if no security events occur.
    import("./security")
      .then((m) => {
        m.initSecurityMonitor();
      })
      .catch(console.error);

    // Restored (Batch C): background async queue + handlers. Drives CV
    // processing, email delivery, fraud checks, WhatsApp follow-ups, etc.
    // Without this, jobs enqueued elsewhere in the app sit forever unprocessed.
    import("./queue")
      .then((m) => {
        m.registerQueueHandlers();
      })
      .catch(console.error);

    // ────────────────────────────────────────────────────────────────────────
    // SAFE RECURSIVE JOBS
    // ────────────────────────────────────────────────────────────────────────

    async function paymentExpiryLoop() {
      try {
        const { storage } = await import("./storage");

        const expired = await storage.expireStalePayments(2);

        if (expired.length > 0) {
          console.log(
            `[Payments] Expired ${expired.length} stale payments`
          );
        }
      } catch (err) {
        console.error("[Payments] Expiry loop failed:", err);
      }

      setTimeout(paymentExpiryLoop, 60 * 1000);
    }

    paymentExpiryLoop();

    async function serviceOrderLoop() {
      try {
        const { storage } = await import("./storage");

        const expired =
          await storage.expireStaleServiceOrders(48);

        if (expired.length > 0) {
          console.log(
            `[Orders] Expired ${expired.length} stale service orders`
          );
        }
      } catch (err) {
        console.error("[Orders] Cleanup loop failed:", err);
      }

      setTimeout(serviceOrderLoop, 6 * 60 * 60 * 1000);
    }

    serviceOrderLoop();

    // ────────────────────────────────────────────────────────────────────────
    // STATIC/VITE
    // ────────────────────────────────────────────────────────────────────────

    if (process.env.NODE_ENV === "production") {
      serveStatic(app);
    } else {
      const { setupVite } = await import("./vite");

      await setupVite(httpServer, app);
    }

    // ────────────────────────────────────────────────────────────────────────
    // GLOBAL ERROR HANDLER
    // ────────────────────────────────────────────────────────────────────────

    app.use(
      (
        err: any,
        req: Request,
        res: Response,
        _next: NextFunction
      ) => {
        console.error(
          JSON.stringify({
            ts: new Date().toISOString(),
            method: req.method,
            path: req.path,
            message: err.message,
            stack: err.stack,
          })
        );

        // Restored (Batch C): mirror server errors to Firebase RTDB for
        // centralized monitoring. Fire-and-forget — Firebase outages must
        // never block the user response. firebaseRtdb itself catches its
        // own errors, so we just need to not await it.
        import("./services/firebaseRtdb")
          .then((m) =>
            m.logErrorToFirebase?.({
              type: err.name || "Error",
              code: err.status || 500,
              message: err.message ?? "Unknown error",
              stack: err.stack,
              url: req.originalUrl ?? req.path,
              method: req.method,
              timestamp: new Date().toISOString(),
              reqId: (req as any).reqId,
            })
          )
          .catch(() => {});

        if (res.headersSent) {
          return;
        }

        const status = err.status || 500;

        return res.status(status).json({
          success: false,
          message:
            status >= 500
              ? "Internal server error"
              : err.message,
        });
      }
    );

    // ───────────────────────────────────────────────────────────────────────
    // DATABASE AUDIT
    // ────────────────────────────────────────────────────────────────────────

    try {
      const result = await pool.query(
        "SELECT current_database() AS name"
      );

      console.log(
        `[DB] Connected to database: ${result.rows[0]?.name}`
      );
    } catch (err) {
      console.error("[DB] Audit failed:", err);
    }

    // ────────────────────────────────────────────────────────────────────────
    // GRACEFUL SHUTDOWN
    // ────────────────────────────────────────────────────────────────────────

    async function shutdown(signal: string) {
      console.log(`[Shutdown] ${signal} received`);

      httpServer.close(async () => {
        try {
          await pool.end();

          console.log("[Shutdown] Database pool closed");

          process.exit(0);
        } catch (err) {
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
  } catch (err) {
    console.error("[Startup] Fatal boot error:", err);

    process.exit(1);
  }
})();
