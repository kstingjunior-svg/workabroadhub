import express, { type Express } from "express";
import fs from "fs";
import path from "path";

// In production:
//   - server bundle lives at dist/server/index.js  (tsconfig.server.json outDir)
//   - frontend bundle lives at dist/public/        (vite.config.ts build.outDir)
// __dirname here is `dist/server`, so the static assets are one level up.
export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "..", "public");

  if (!fs.existsSync(distPath)) {
    console.warn(
      `[serveStatic] No frontend bundle at ${distPath} — did you run 'npm run build'?`
    );
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
  app.use(
    express.static(distPath, {
      // Disable ETag — in-app browsers sometimes still return a 200 from
      // their cache even when the server would respond 304. no-cache below
      // forces a network revalidation; killing ETag avoids ambiguity.
      etag: false,
      lastModified: false,
      setHeaders(res, filePath) {
        if (/\/assets\//.test(filePath)) {
          // Hashed assets — safe to cache forever, the URL changes on deploy.
          res.setHeader(
            "Cache-Control",
            "public, max-age=31536000, immutable"
          );
        } else if (/\.html?$/i.test(filePath) || filePath.endsWith(path.sep + "manifest.json")) {
          // index.html + PWA manifest — must always be revalidated so a fresh
          // deploy is picked up on the very next request.
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
        }
      },
    })
  );

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
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
