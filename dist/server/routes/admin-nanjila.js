"use strict";
/**
 * Admin routes for Nanjila (Phase A OS-evolution completion).
 *
 * INTERNAL-ONLY: every route is protected by isAuthenticated + isAdmin.
 * There is no public version.
 *
 * Endpoints:
 *
 *   GET  /api/admin/nanjila/flags
 *     Current values of every Nanjila feature flag + rollout percentage.
 *
 *   GET  /api/admin/nanjila/capabilities
 *     List every registered capability + its enabled state + avg latency.
 *
 *   PATCH /api/admin/nanjila/capabilities/:slug
 *     Body: { enabled: boolean } — toggles a capability's enabled state and
 *     invalidates the runtime manifest cache so the change takes effect
 *     within seconds without a deploy.
 *
 *   GET  /api/admin/nanjila/trust/:userId
 *     Latest readiness snapshot for a user + trend of last 30 days.
 *
 *   POST /api/admin/nanjila/trust/:userId/refresh
 *     Enqueue an immediate readiness recompute for the user.
 *
 *   POST /api/admin/nanjila/trust/sweep
 *     Manually trigger a full nightly-sweep NOW.
 *
 *   GET  /api/admin/nanjila/queue
 *     BullMQ queue stats (waiting / active / completed / failed / delayed).
 *
 * All endpoints return JSON. Admin client renders any UI — server is API-only.
 *
 * See docs/nanjila/OS_EVOLUTION_PLAN.md §16 Phase A completion.
 */
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAdminNanjilaRoutes = registerAdminNanjilaRoutes;
const db_1 = require("../db");
const feature_flags_1 = require("../nanjila/feature-flags");
const capabilities_1 = require("../nanjila/capabilities");
function registerAdminNanjilaRoutes(app, isAuthenticated, isAdmin) {
    // ── GET /api/admin/nanjila/flags ─────────────────────────────────────────
    app.get("/api/admin/nanjila/flags", isAuthenticated, isAdmin, async (_req, res) => {
        try {
            const flags = (0, feature_flags_1.dumpNanjilaFlags)();
            res.json({
                generatedAt: new Date().toISOString(),
                flags,
                hint: "To change a flag, set its env var on Render and redeploy — flags are read on every request.",
            });
        }
        catch (err) {
            console.error("[/api/admin/nanjila/flags] failed:", err);
            res.status(500).json({ error: err?.message ?? String(err) });
        }
    });
    // ── GET /api/admin/nanjila/capabilities ──────────────────────────────────
    app.get("/api/admin/nanjila/capabilities", isAuthenticated, isAdmin, async (_req, res) => {
        try {
            const { rows } = await db_1.pool.query(`
          SELECT id, slug, label, description, requires_auth, requires_paid,
                 requires_admin, enabled, avg_latency_ms, created_at, updated_at
            FROM nanjila_capabilities
           ORDER BY slug
        `);
            res.json({ count: rows.length, capabilities: rows });
        }
        catch (err) {
            console.error("[/api/admin/nanjila/capabilities] failed:", err);
            res.status(500).json({ error: err?.message ?? String(err) });
        }
    });
    // ── PATCH /api/admin/nanjila/capabilities/:slug ──────────────────────────
    app.patch("/api/admin/nanjila/capabilities/:slug", isAuthenticated, isAdmin, async (req, res) => {
        try {
            const { slug } = req.params;
            const { enabled } = req.body ?? {};
            if (typeof enabled !== "boolean") {
                return res.status(400).json({
                    error: "Body must include { enabled: true|false }",
                });
            }
            const { rows } = await db_1.pool.query(`UPDATE nanjila_capabilities
              SET enabled = $2,
                  updated_at = NOW()
            WHERE slug = $1
        RETURNING id, slug, enabled, updated_at`, [slug, enabled]);
            if (rows.length === 0) {
                return res.status(404).json({ error: `Capability "${slug}" not found` });
            }
            // Runtime cache lives in server/nanjila/capabilities/index.ts with a
            // 60-second TTL. Invalidate now so the toggle takes effect on the
            // very next orchestrator call.
            (0, capabilities_1.invalidateManifest)();
            console.log(`[Admin] capability ${slug} ${enabled ? "ENABLED" : "DISABLED"} by admin=${req.user?.claims?.sub ?? req.user?.id ?? "unknown"}`);
            res.json({ ok: true, capability: rows[0] });
        }
        catch (err) {
            console.error("[/api/admin/nanjila/capabilities/:slug] failed:", err);
            res.status(500).json({ error: err?.message ?? String(err) });
        }
    });
    // ── GET /api/admin/nanjila/trust/:userId ─────────────────────────────────
    app.get("/api/admin/nanjila/trust/:userId", isAuthenticated, isAdmin, async (req, res) => {
        try {
            const { userId } = req.params;
            const [latest, trend, user] = await Promise.all([
                db_1.pool.query(`SELECT * FROM nanjila_readiness_snapshots
              WHERE user_id = $1
              ORDER BY snapshot_date DESC
              LIMIT 1`, [userId]),
                db_1.pool.query(`SELECT snapshot_date,
                    cv_strength, application_readiness, scam_awareness,
                    document_completeness, verification_status, country_readiness,
                    language_readiness, interview_readiness,
                    overall_migration_readiness
               FROM nanjila_readiness_snapshots
              WHERE user_id = $1
                AND snapshot_date > CURRENT_DATE - INTERVAL '30 days'
              ORDER BY snapshot_date ASC`, [userId]),
                db_1.pool.query(`SELECT id, email, first_name, last_name, created_at,
                    email_verified, phone_verified
               FROM users WHERE id = $1 LIMIT 1`, [userId]),
            ]);
            if (user.rows.length === 0) {
                return res.status(404).json({ error: "User not found" });
            }
            res.json({
                user: user.rows[0],
                latest: latest.rows[0] ?? null,
                trend: trend.rows,
                hint: latest.rows.length === 0
                    ? "No snapshot yet. Use POST /api/admin/nanjila/trust/:userId/refresh to compute one now."
                    : undefined,
            });
        }
        catch (err) {
            console.error("[/api/admin/nanjila/trust/:userId] failed:", err);
            res.status(500).json({ error: err?.message ?? String(err) });
        }
    });
    // ── POST /api/admin/nanjila/trust/:userId/refresh ────────────────────────
    app.post("/api/admin/nanjila/trust/:userId/refresh", isAuthenticated, isAdmin, async (req, res) => {
        try {
            const { userId } = req.params;
            // Verify the user exists so we don't enqueue jobs for phantom IDs.
            const { rows } = await db_1.pool.query(`SELECT id FROM users WHERE id = $1 LIMIT 1`, [userId]);
            if (rows.length === 0) {
                return res.status(404).json({ error: "User not found" });
            }
            const { refreshReadinessForUser } = await Promise.resolve().then(() => __importStar(require("../nanjila/jobs/nightlyReadiness")));
            const enq = await refreshReadinessForUser(userId);
            console.log(`[Admin] Nanjila readiness refresh queued: user=${userId} jobId=${enq.jobId} by admin=${req.user?.claims?.sub ?? req.user?.id ?? "unknown"}`);
            res.json({
                ok: true,
                userId,
                jobId: enq.jobId,
                hint: "Snapshot will be updated within seconds. Refetch /trust/:userId to see it.",
            });
        }
        catch (err) {
            console.error("[/api/admin/nanjila/trust/:userId/refresh] failed:", err);
            res.status(500).json({ error: err?.message ?? String(err) });
        }
    });
    // ── POST /api/admin/nanjila/trust/sweep ──────────────────────────────────
    app.post("/api/admin/nanjila/trust/sweep", isAuthenticated, isAdmin, async (req, res) => {
        try {
            const { triggerReadinessSweepNow } = await Promise.resolve().then(() => __importStar(require("../nanjila/jobs/nightlyReadiness")));
            const enq = await triggerReadinessSweepNow();
            console.log(`[Admin] Nanjila readiness FULL SWEEP triggered: jobId=${enq.jobId} by admin=${req.user?.claims?.sub ?? req.user?.id ?? "unknown"}`);
            res.json({
                ok: true,
                jobId: enq.jobId,
                hint: "Sweep will enqueue one job per active user. Watch /queue for progress.",
            });
        }
        catch (err) {
            console.error("[/api/admin/nanjila/trust/sweep] failed:", err);
            res.status(500).json({ error: err?.message ?? String(err) });
        }
    });
    // ── GET /api/admin/nanjila/queue ─────────────────────────────────────────
    app.get("/api/admin/nanjila/queue", isAuthenticated, isAdmin, async (_req, res) => {
        try {
            const { readinessQueueStats } = await Promise.resolve().then(() => __importStar(require("../nanjila/jobs/nightlyReadiness")));
            const stats = await readinessQueueStats();
            res.json({
                generatedAt: new Date().toISOString(),
                queue: "nanjila-readiness",
                stats,
            });
        }
        catch (err) {
            console.error("[/api/admin/nanjila/queue] failed:", err);
            res.status(500).json({ error: err?.message ?? String(err) });
        }
    });
    // ── GET /api/admin/nanjila/concurrency ───────────────────────────────────
    //
    // Live capacity snapshot. Assembles process (heap/CPU/event-loop), DB pool
    // stats, BullMQ queue depths, and recent AI activity in a single object.
    // Used by the /admin/nanjila-ops dashboard which auto-refreshes every 3s.
    //
    // Response shape: see ConcurrencySnapshot in server/nanjila/ops/concurrency.ts
    // Cost: ~50-200ms depending on DB responsiveness.
    app.get("/api/admin/nanjila/concurrency", isAuthenticated, isAdmin, async (_req, res) => {
        try {
            const { collectConcurrencySnapshot } = await Promise.resolve().then(() => __importStar(require("../nanjila/ops/concurrency")));
            const snapshot = await collectConcurrencySnapshot();
            res.json(snapshot);
        }
        catch (err) {
            console.error("[/api/admin/nanjila/concurrency] failed:", err);
            res.status(500).json({ error: err?.message ?? String(err) });
        }
    });
}
