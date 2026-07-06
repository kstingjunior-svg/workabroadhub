/**
 * Admin routes for the NEAIMS sync service.
 *
 * INTERNAL-ONLY: every route is protected by isAuthenticated + isAdmin.
 *
 * Endpoints:
 *
 *   POST /api/admin/nea-sync/run
 *     Manually trigger a NEAIMS sync. Runs in-request (returns when done)
 *     — the sync is fast enough (<30s for ~3000 rows) that async fire-and-
 *     forget isn't necessary. Returns the full SyncResult.
 *
 *   GET  /api/admin/nea-sync/runs?limit=20
 *     Last N runs of the sync from nea_sync_runs. Powers the "history" tab
 *     in the admin dashboard so we can spot slow trends or repeated failures.
 *
 *   GET  /api/admin/nea-sync/latest
 *     The most recent successful run (or the current running one if there
 *     is one). Small payload — designed to be polled by a status widget.
 *
 * 2026-07-06.
 */

import type { Express, Response } from "express";
import { pool } from "../db";
import { runNeaimsSync } from "../nea/neaimsSync";

export function registerAdminNeaSyncRoutes(
  app: Express,
  isAuthenticated: any,
  isAdmin: any,
): void {
  /**
   * POST /api/admin/nea-sync/run
   * Fire a sync right now. The admin who clicked the button is logged as
   * triggered_by_user_id in nea_sync_runs so we can trace back who ran what.
   */
  app.post(
    "/api/admin/nea-sync/run",
    isAuthenticated, isAdmin,
    async (req: any, res: Response) => {
      const adminId = req.user?.claims?.sub ?? req.user?.id ?? "unknown";
      try {
        const result = await runNeaimsSync({
          triggeredBy:       "admin",
          triggeredByUserId: String(adminId),
        });
        // 200 for all statuses (including 'failed') because the API call
        // itself succeeded — the client renders the SyncResult and shows
        // the failure to the admin so they can debug.
        return res.json(result);
      } catch (err: any) {
        // runNeaimsSync should never throw; if it does, it's a bug worth
        // surfacing loudly.
        console.error("[Admin] NEAIMS sync threw unexpectedly:", err);
        return res.status(500).json({
          error: err?.message ?? "Unknown error",
        });
      }
    },
  );

  /**
   * GET /api/admin/nea-sync/runs?limit=20
   * History table for the dashboard.
   */
  app.get(
    "/api/admin/nea-sync/runs",
    isAuthenticated, isAdmin,
    async (req, res: Response) => {
      const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 200);
      try {
        const { rows } = await pool.query(
          `SELECT id, triggered_by, triggered_by_user_id,
                  started_at, finished_at, duration_ms, status,
                  verified_fetched, expired_fetched, deregistered_fetched,
                  pending_fetched, raw_total, skipped_junk, clean_total,
                  inserted, updated, marked_unlisted,
                  error_message, error_code
             FROM nea_sync_runs
            ORDER BY started_at DESC
            LIMIT $1`,
          [limit],
        );
        return res.json({ runs: rows, count: rows.length });
      } catch (err: any) {
        console.error("[Admin] Could not load NEAIMS sync runs:", err?.message);
        return res.status(500).json({ error: "Could not load runs" });
      }
    },
  );

  /**
   * GET /api/admin/nea-sync/latest
   * Small payload the dashboard status widget can poll.
   */
  app.get(
    "/api/admin/nea-sync/latest",
    isAuthenticated, isAdmin,
    async (_req, res: Response) => {
      try {
        const { rows } = await pool.query(
          `SELECT id, triggered_by, started_at, finished_at, duration_ms,
                  status, inserted, updated, marked_unlisted, skipped_junk,
                  raw_total, clean_total, error_message
             FROM nea_sync_runs
            ORDER BY started_at DESC
            LIMIT 1`,
        );
        return res.json({ run: rows[0] ?? null });
      } catch (err: any) {
        console.error("[Admin] Could not load latest NEAIMS sync run:", err?.message);
        return res.status(500).json({ error: "Could not load latest run" });
      }
    },
  );
}
