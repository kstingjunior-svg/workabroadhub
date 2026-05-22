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
  app.use(
    express.static(distPath, {
      setHeaders(res, filePath) {
        if (/\/assets\//.test(filePath)) {
          res.setHeader(
            "Cache-Control",
            "public, max-age=31536000, immutable"
          );
        }
      },
    })
  );

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
