"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAdminNEASyncRoutes = void 0;
exports.registerAdminNeaSyncRoutes = registerAdminNeaSyncRoutes;
const db_1 = require("../db");
const nea_sync_1 = require("../lib/nea-sync");
/**
 * Backwards-compatible signature. routes.ts calls this with
 * (app, isAuthenticated, isAdmin) — accept both args, fall back to an
 * inline admin check if either middleware isn't passed.
 */
function registerAdminNeaSyncRoutes(app, isAuthenticated, isAdmin) {
    // If the caller didn't hand us middleware, use these inline guards so
    // the routes are still admin-only (no accidental public exposure).
    const authGuard = isAuthenticated ?? ((req, res, next) => {
        const userId = req.session?.customUserId;
        if (!userId)
            return res.status(401).json({ message: "Please sign in first." });
        next();
    });
    const adminGuard = isAdmin ?? (async (req, res, next) => {
        const userId = req.session?.customUserId;
        if (!userId)
            return res.status(401).json({ message: "Please sign in first." });
        const { rows } = await db_1.pool.query(`SELECT is_admin, role FROM users WHERE id = $1`, [userId]);
        const u = rows[0];
        if (!u?.is_admin && u?.role !== "ADMIN" && u?.role !== "SUPER_ADMIN") {
            return res.status(403).json({ message: "Admin only." });
        }
        next();
    });
    // ── Trigger endpoints ──────────────────────────────────────────────────
    const autoHandler = async (req, res) => {
        const userId = req.session?.customUserId;
        try {
            const summary = await (0, nea_sync_1.runAutoSync)(userId);
            return res.json({ ok: summary.status !== "error", summary });
        }
        catch (err) {
            return res.status(500).json({ message: err?.message ?? "Auto-sync failed." });
        }
    };
    app.post("/api/admin/nea-sync/run", authGuard, adminGuard, autoHandler);
    app.post("/api/admin/nea-sync/auto", authGuard, adminGuard, autoHandler);
    // ── Paste endpoint ─────────────────────────────────────────────────────
    app.post("/api/admin/nea-sync/paste", authGuard, adminGuard, async (req, res) => {
        const raw = String(req.body?.raw ?? "").trim();
        if (!raw || raw.length < 100) {
            return res.status(400).json({
                message: "Please paste the NEA agency list (CSV, TSV, or HTML). Minimum 100 characters.",
            });
        }
        if (raw.length > 5000000) {
            return res.status(413).json({ message: "Payload too large (>5MB)." });
        }
        const userId = req.session?.customUserId;
        try {
            const summary = await (0, nea_sync_1.runSyncFromSource)(raw, "admin_paste", userId);
            return res.json({ ok: summary.status !== "error", summary });
        }
        catch (err) {
            return res.status(500).json({ message: err?.message ?? "Sync failed." });
        }
    });
    // ── History endpoints ──────────────────────────────────────────────────
    const historyHandler = async (req, res) => {
        const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10)));
        const { rows } = await db_1.pool.query(`SELECT id, started_at, finished_at, source, status, triggered_by,
              fetched_rows, new_agencies, updated_agencies,
              expired_agencies, revoked_agencies, unchanged,
              active_after, expired_after, error_message, notes
         FROM nea_sync_runs
        ORDER BY started_at DESC
        LIMIT $1`, [limit]);
        return res.json({ runs: rows });
    };
    app.get("/api/admin/nea-sync/runs", authGuard, adminGuard, historyHandler);
    app.get("/api/admin/nea-sync/history", authGuard, adminGuard, historyHandler);
    // ── Latest-run endpoint ────────────────────────────────────────────────
    const latestHandler = async (_req, res) => {
        const { rows } = await db_1.pool.query(`SELECT id, started_at, finished_at, source, status,
              new_agencies, updated_agencies, expired_agencies,
              revoked_agencies, active_after, expired_after,
              error_message
         FROM nea_sync_runs
        ORDER BY started_at DESC
        LIMIT 1`);
        return res.json({ run: rows[0] ?? null });
    };
    app.get("/api/admin/nea-sync/latest", authGuard, adminGuard, latestHandler);
    app.get("/api/admin/nea-sync/last", authGuard, adminGuard, latestHandler);
    console.log("[Admin] NEA sync routes registered: /api/admin/nea-sync/{run|auto,paste,runs|history,latest|last}");
}
// Keep the old export name too so any other caller that imported the
// UPPERCASE variant still works. Both names point to the same function.
exports.registerAdminNEASyncRoutes = registerAdminNeaSyncRoutes;
