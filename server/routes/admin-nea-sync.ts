/**
 * Admin NEA-sync routes.
 *
 * Called from server/routes.ts as:
 *   registerAdminNeaSyncRoutes(app, isAuthenticated, isAdmin)
 *
 * Two sets of routes with alias URLs so both the pre-existing spec
 * (/run /runs /latest) and the admin UI I built (/paste /auto /history /last)
 * work off the same handlers:
 *
 *   POST /api/admin/nea-sync/run     (alias: /auto)
 *   POST /api/admin/nea-sync/paste                     — paste NEA export
 *   GET  /api/admin/nea-sync/runs    (alias: /history) — recent runs
 *   GET  /api/admin/nea-sync/latest  (alias: /last)    — most recent run
 */

import type { Express, Request, Response, RequestHandler } from "express";
import { pool } from "../db";
import { runSyncFromSource, runAutoSync } from "../lib/nea-sync";

/**
 * Backwards-compatible signature. routes.ts calls this with
 * (app, isAuthenticated, isAdmin) — accept both args, fall back to an
 * inline admin check if either middleware isn't passed.
 */
export function registerAdminNeaSyncRoutes(
  app: Express,
  isAuthenticated?: RequestHandler,
  isAdmin?: RequestHandler,
): void {
  // If the caller didn't hand us middleware, use these inline guards so
  // the routes are still admin-only (no accidental public exposure).
  const authGuard: RequestHandler = isAuthenticated ?? ((req, res, next) => {
    const userId = (req.session as any)?.customUserId as string | undefined;
    if (!userId) return res.status(401).json({ message: "Please sign in first." });
    next();
  });

  const adminGuard: RequestHandler = isAdmin ?? (async (req, res, next) => {
    const userId = (req.session as any)?.customUserId as string | undefined;
    if (!userId) return res.status(401).json({ message: "Please sign in first." });
    const { rows } = await pool.query<{ is_admin: boolean; role: string }>(
      `SELECT is_admin, role FROM users WHERE id = $1`,
      [userId],
    );
    const u = rows[0];
    if (!u?.is_admin && u?.role !== "ADMIN" && u?.role !== "SUPER_ADMIN") {
      return res.status(403).json({ message: "Admin only." });
    }
    next();
  });

  // ── Trigger endpoints ──────────────────────────────────────────────────
  // 2026-10 fix (Tony: admin trigger 500'd with "column source does not
  // exist"). The old runAutoSync() was wired to an obsolete sync module
  // (server/lib/nea-sync) whose schema was never migrated to the real DB.
  // The correct sync is server/nea/neaimsSync — it hits
  // POST https://api.neaims.go.ke/api/v1/agencies/public/list directly and
  // writes to the live nea_sync_runs schema. Redirecting the admin
  // endpoint to the right module.
  const autoHandler = async (req: Request, res: Response) => {
    const userId = (req.session as any)?.customUserId as string;
    try {
      const { runNeaimsSync } = await import("../nea/neaimsSync");
      const result = await runNeaimsSync({
        triggeredBy:       "admin",
        triggeredByUserId: userId ?? null,
      });
      return res.json({
        ok: result.status !== "failed",
        summary: {
          status:      result.status,
          message:     result.message,
          durationMs:  result.durationMs,
          added:       result.counts?.inserted ?? 0,
          updated:     result.counts?.updated ?? 0,
          unlisted:    result.counts?.markedUnlisted ?? 0,
          verifiedFetched:     result.counts?.verifiedFetched ?? 0,
          expiredFetched:      result.counts?.expiredFetched ?? 0,
          deregisteredFetched: result.counts?.deregisteredFetched ?? 0,
          pendingFetched:      result.counts?.pendingFetched ?? 0,
          rawTotal:    result.counts?.rawTotal ?? 0,
          cleanTotal:  result.counts?.cleanTotal ?? 0,
        },
      });
    } catch (err: any) {
      console.error("[admin-nea-sync] runNeaimsSync failed:", err?.message);
      return res.status(500).json({ message: err?.message ?? "Auto-sync failed." });
    }
  };
  app.post("/api/admin/nea-sync/run",  authGuard, adminGuard, autoHandler);
  app.post("/api/admin/nea-sync/auto", authGuard, adminGuard, autoHandler);

  // ── Paste endpoint ─────────────────────────────────────────────────────
  app.post("/api/admin/nea-sync/paste", authGuard, adminGuard, async (req, res) => {
    const raw = String(req.body?.raw ?? "").trim();
    if (!raw || raw.length < 100) {
      return res.status(400).json({
        message: "Please paste the NEA agency list (CSV, TSV, or HTML). Minimum 100 characters.",
      });
    }
    if (raw.length > 5_000_000) {
      return res.status(413).json({ message: "Payload too large (>5MB)." });
    }
    const userId = (req.session as any)?.customUserId as string;
    try {
      const summary = await runSyncFromSource(raw, "admin_paste", userId);
      return res.json({ ok: summary.status !== "error", summary });
    } catch (err: any) {
      return res.status(500).json({ message: err?.message ?? "Sync failed." });
    }
  });

  // ── History endpoints ──────────────────────────────────────────────────
  // 2026-10 fix: queries updated to use the ACTUAL nea_sync_runs schema
  // (triggered_by, verified_fetched, expired_fetched, inserted, updated,
  // marked_unlisted, etc.) which matches what runNeaimsSync writes.
  const historyHandler = async (req: Request, res: Response) => {
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10)));
    const { rows } = await pool.query(
      `SELECT id, started_at, finished_at, duration_ms, status, triggered_by, triggered_by_user_id,
              verified_fetched, expired_fetched, deregistered_fetched, pending_fetched,
              raw_total, skipped_junk, clean_total,
              inserted, updated, marked_unlisted,
              error_message, error_code
         FROM nea_sync_runs
        ORDER BY started_at DESC
        LIMIT $1`,
      [limit],
    );
    return res.json({ runs: rows });
  };
  app.get("/api/admin/nea-sync/runs",    authGuard, adminGuard, historyHandler);
  app.get("/api/admin/nea-sync/history", authGuard, adminGuard, historyHandler);

  // ── Latest-run endpoint ────────────────────────────────────────────────
  const latestHandler = async (_req: Request, res: Response) => {
    const { rows } = await pool.query(
      `SELECT id, started_at, finished_at, duration_ms, status, triggered_by,
              inserted, updated, marked_unlisted,
              verified_fetched, expired_fetched,
              raw_total, clean_total,
              error_message
         FROM nea_sync_runs
        ORDER BY started_at DESC
        LIMIT 1`,
    );
    return res.json({ run: rows[0] ?? null });
  };
  app.get("/api/admin/nea-sync/latest", authGuard, adminGuard, latestHandler);
  app.get("/api/admin/nea-sync/last",   authGuard, adminGuard, latestHandler);

  console.log("[Admin] NEA sync routes registered: /api/admin/nea-sync/{run|auto,paste,runs|history,latest|last}");
}

// Keep the old export name too so any other caller that imported the
// UPPERCASE variant still works. Both names point to the same function.
export const registerAdminNEASyncRoutes = registerAdminNeaSyncRoutes;
