"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.serveStatic = serveStatic;
const express_1 = __importDefault(require("express"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// In production:
//   - server bundle lives at dist/server/index.js  (tsconfig.server.json outDir)
//   - frontend bundle lives at dist/public/        (vite.config.ts build.outDir)
// __dirname here is `dist/server`, so the static assets are one level up.
function serveStatic(app) {
    const distPath = path_1.default.resolve(__dirname, "..", "public");
    const indexHtml = path_1.default.resolve(distPath, "index.html");
    const bundleExists = fs_1.default.existsSync(distPath) && fs_1.default.existsSync(indexHtml);
    // 2026-06 OUTAGE FIX (Tony's "Cannot GET /" report): if dist/public or its
    // index.html is missing (Vite build failed on Render, out-of-memory during
    // build, partial deploy, etc.) we used to `return` here, leaving Express
    // with ZERO routes registered for "/" — every visitor saw "Cannot GET /"
    // instead of a recoverable error page. Now we register an emergency
    // fallback for ALL paths that returns a clear "Site is rebuilding" page
    // so:
    //   1. visitors see a friendly status, not a raw Express 404
    //   2. Tony notices immediately via Render uptime check + the log line
    //   3. /api/health still works for Render's health probe so the deploy
    //      doesn't get marked as failed/rolled back
    if (!bundleExists) {
        const missing = !fs_1.default.existsSync(distPath) ? distPath : indexHtml;
        console.error(`[serveStatic][CRITICAL] No frontend bundle at ${missing} — ` +
            `the Vite build did not produce dist/public/index.html. Run 'npm run build' ` +
            `and redeploy. Serving emergency fallback page for all routes.`);
        app.get("/api/health", (_req, res) => res.json({ ok: false, error: "frontend_bundle_missing" }));
        app.use((_req, res) => {
            res.status(503).set("Cache-Control", "no-store").type("html").send(`
        <!doctype html><html><head>
          <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
          <title>WorkAbroad Hub — Brief Maintenance</title>
          <style>
            body{font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;
                 display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:1rem}
            .card{background:#1e293b;padding:2rem;border-radius:1rem;max-width:32rem;text-align:center}
            h1{margin:0 0 .5rem;font-size:1.5rem;color:#f1f5f9}
            p{margin:.5rem 0;line-height:1.6;color:#cbd5e1}
            .btn{display:inline-block;margin-top:1rem;padding:.6rem 1.2rem;background:#3b82f6;
                 color:white;border-radius:.5rem;text-decoration:none;font-weight:500}
          </style></head>
        <body><div class="card">
          <h1>🛠 We're upgrading — back in a few minutes</h1>
          <p>WorkAbroad Hub is being deployed. Your account and payments are safe.</p>
          <p style="font-size:.85rem;opacity:.7">If this stays up for more than 10 minutes, message us on WhatsApp.</p>
          <a class="btn" href="/" onclick="setTimeout(()=>location.reload(),2000);return false">Try again</a>
        </div></body></html>
      `);
        });
        return;
    }
    // Hashed assets (Vite emits names like /assets/index-abc123.js) — long-cache.
    // Everything else (most importantly index.html + the PWA manifest) must
    // NEVER be cached, because index.html points at the current set of hashed
    // chunk filenames. If an in-app browser (Messenger / WhatsApp / FB / IG —
    // they cache HTML aggressively and often ignore ETags) holds a stale
    // index.html, the chunk URLs it references 404 after a deploy and the
    // user lands on the React error boundary.
    //
    // 2026-06 FIX (Tony's report): a user opened the site from an in-app
    // browser and immediately got "Just a small detour". Root cause was
    // express.static serving index.html for `/` with default ETag-based
    // caching BEFORE the SPA fallback (with no-cache headers) ever ran.
    // The fallback never matched for "/" so the no-cache headers below it
    // were dead code. We now set no-cache directly in the setHeaders callback
    // so every HTML response is fresh.
    app.use(express_1.default.static(distPath, {
        // Disable ETag — in-app browsers sometimes still return a 200 from
        // their cache even when the server would respond 304. no-cache below
        // forces a network revalidation; killing ETag avoids ambiguity.
        etag: false,
        lastModified: false,
        setHeaders(res, filePath) {
            if (/\/assets\//.test(filePath)) {
                // Hashed assets — safe to cache forever, the URL changes on deploy.
                res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
            }
            else if (/\.html?$/i.test(filePath) || filePath.endsWith(path_1.default.sep + "manifest.json")) {
                // index.html + PWA manifest — must always be revalidated so a fresh
                // deploy is picked up on the very next request.
                res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
                res.setHeader("Pragma", "no-cache");
                res.setHeader("Expires", "0");
            }
        },
    }));
    // ── API / WS short-circuit ────────────────────────────────────────────────
    // Any request to /api/* or /ws/* that wasn't matched by an earlier route
    // is a genuine 404 — NOT a client-side route. If we let those fall through
    // to the SPA fallback below, the server happily sends index.html back, the
    // client tries to parse HTML as JSON, and we get cascading 500s + log noise.
    //
    // Fix: return a clean JSON 404 here so misdirected clients (analytics
    // pollers, stale SDKs, scrapers hitting /api/track-live with GET, etc.)
    // get a fast, honest response and never poison the log.
    app.use(["/api", "/api/*", "/ws", "/ws/*"], (req, res) => {
        res.status(404).json({
            message: "Not found",
            method: req.method,
            path: req.originalUrl,
        });
    });
    // SPA fallback: any non-API GET should return index.html so wouter handles
    // client-side routing. NEVER cache index.html — it points at the current JS.
    app.use("*", (_req, res) => {
        res.set({
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        });
        res.sendFile(path_1.default.resolve(distPath, "index.html"));
    });
}
