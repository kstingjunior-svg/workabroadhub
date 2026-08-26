/**
 * Admin NEA-sync routes.
 *
 *   POST /api/admin/nea-sync/paste
 *     body: { raw: string }                — CSV/TSV/HTML pasted from NEAIMS
 *     Runs the pipeline and returns a SyncSummary. Admin-only.
 *
 *   POST /api/admin/nea-sync/auto
 *     Triggers an immediate auto-fetch (same as the weekly cron). Admin-only.
 *
 *   GET  /api/admin/nea-sync/history?limit=20
 *     Returns the last N sync runs for the admin dashboard.
 *
 *   GET  /api/admin/nea-sync/last
 *     Returns just the most recent run (for the small "Last synced" widget).
 */

import type { Express, Request, Response } from "express";
import { pool } from "../db";
import { runSyncFromSource, runAutoSync } from "../lib/nea-sync";

async function isAdmin(req: Request): Promise<boolean> {
  const userId = (req.session as any)?.customUserId as string | undefined;
  if (!userId) return false;
  const { rows } = await pool.query<{ is_admin: boolean; role: string }>(
    `SELECT is_admin, role FROM users WHERE id = $1`,
    [userId],
  );
  const u = rows[0];
  return !!(u?.is_admin || u?.role === "ADMIN" || u?.role === "SUPER_ADMIN");
}

export function registerAdminNEASyncRoutes(app: Express): void {
  // ── POST /api/admin/nea-sync/paste ─────────────────────────────────────
  app.post("/api/admin/nea-sync/paste", async (req: Request, res: Response) => {
    if (!(await isAdmin(req))) return res.status(403).json({ message: "Admin only." });

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

  // ── POST /api/admin/nea-sync/auto ──────────────────────────────────────
  app.post("/api/admin/nea-sync/auto", async (req: Request, res: Response) => {
    if (!(await isAdmin(req))) return res.status(403).json({ message: "Admin only." });
    const userId = (req.session as any)?.customUserId as string;
    try {
      const summary = await runAutoSync(userId);
      return res.json({ ok: summary.status !== "error", summary });
    } catch (err: any) {
      return res.status(500).json({ message: err?.message ?? "Auto-sync failed." });
    }
  });

  // ── GET /api/admin/nea-sync/history ────────────────────────────────────
  app.get("/api/admin/nea-sync/history", async (req: Request, res: Response) => {
    if (!(await isAdmin(req))) return res.status(403).json({ message: "Admin only." });

    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10)));
    const { rows } = await pool.query(
      `SELECT id, started_at, finished_at, source, status, triggered_by,
              fetched_rows, new_agencies, updated_agencies,
              expired_agencies, revoked_agencies, unchanged,
              active_after, expired_after, error_message, notes
         FROM nea_sync_runs
        ORDER BY started_at DESC
        LIMIT $1`,
      [limit],
    );
    return res.json({ runs: rows });
  });

  // ── GET /api/admin/nea-sync/last ───────────────────────────────────────
  app.get("/api/admin/nea-sync/last", async (req: Request, res: Response) => {
    if (!(await isAdmin(req))) return res.status(403).json({ message: "Admin only." });
    const { rows } = await pool.query(
      `SELECT id, started_at, finished_at, source, status,
              new_agencies, updated_agencies, expired_agencies,
              revoked_agencies, active_after, expired_after,
              error_message
         FROM nea_sync_runs
        ORDER BY started_at DESC
        LIMIT 1`,
    );
    return res.json({ run: rows[0] ?? null });
  });

  console.log("[Admin] NEA sync routes registered: /api/admin/nea-sync/{paste,auto,history,last}");
}
