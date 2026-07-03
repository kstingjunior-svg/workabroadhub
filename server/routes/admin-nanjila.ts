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

import type { Express, Response } from "express";
import { pool } from "../db";
import { dumpNanjilaFlags } from "../nanjila/feature-flags";
import { invalidateManifest } from "../nanjila/capabilities";

export function registerAdminNanjilaRoutes(
  app: Express,
  isAuthenticated: any,
  isAdmin: any,
): void {
  // ── GET /api/admin/nanjila/flags ─────────────────────────────────────────
  app.get(
    "/api/admin/nanjila/flags",
    isAuthenticated, isAdmin,
    async (_req, res: Response) => {
      try {
        const flags = dumpNanjilaFlags();
        res.json({
          generatedAt: new Date().toISOString(),
          flags,
          hint: "To change a flag, set its env var on Render and redeploy — flags are read on every request.",
        });
      } catch (err: any) {
        console.error("[/api/admin/nanjila/flags] failed:", err);
        res.status(500).json({ error: err?.message ?? String(err) });
      }
    },
  );

  // ── GET /api/admin/nanjila/capabilities ──────────────────────────────────
  app.get(
    "/api/admin/nanjila/capabilities",
    isAuthenticated, isAdmin,
    async (_req, res: Response) => {
      try {
        const { rows } = await pool.query(`
          SELECT id, slug, label, description, requires_auth, requires_paid,
                 requires_admin, enabled, avg_latency_ms, created_at, updated_at
            FROM nanjila_capabilities
           ORDER BY slug
        `);
        res.json({ count: rows.length, capabilities: rows });
      } catch (err: any) {
        console.error("[/api/admin/nanjila/capabilities] failed:", err);
        res.status(500).json({ error: err?.message ?? String(err) });
      }
    },
  );

  // ── PATCH /api/admin/nanjila/capabilities/:slug ──────────────────────────
  app.patch(
    "/api/admin/nanjila/capabilities/:slug",
    isAuthenticated, isAdmin,
    async (req: any, res: Response) => {
      try {
        const { slug } = req.params;
        const { enabled } = req.body ?? {};
        if (typeof enabled !== "boolean") {
          return res.status(400).json({
            error: "Body must include { enabled: true|false }",
          });
        }

        const { rows } = await pool.query(
          `UPDATE nanjila_capabilities
              SET enabled = $2,
                  updated_at = NOW()
            WHERE slug = $1
        RETURNING id, slug, enabled, updated_at`,
          [slug, enabled],
        );
        if (rows.length === 0) {
          return res.status(404).json({ error: `Capability "${slug}" not found` });
        }

        // Runtime cache lives in server/nanjila/capabilities/index.ts with a
        // 60-second TTL. Invalidate now so the toggle takes effect on the
        // very next orchestrator call.
        invalidateManifest();

        console.log(
          `[Admin] capability ${slug} ${enabled ? "ENABLED" : "DISABLED"} by admin=${req.user?.claims?.sub ?? req.user?.id ?? "unknown"}`,
        );

        res.json({ ok: true, capability: rows[0] });
      } catch (err: any) {
        console.error("[/api/admin/nanjila/capabilities/:slug] failed:", err);
        res.status(500).json({ error: err?.message ?? String(err) });
      }
    },
  );

  // ── GET /api/admin/nanjila/trust/:userId ─────────────────────────────────
  app.get(
    "/api/admin/nanjila/trust/:userId",
    isAuthenticated, isAdmin,
    async (req: any, res: Response) => {
      try {
        const { userId } = req.params;

        const [latest, trend, user] = await Promise.all([
          pool.query(
            `SELECT * FROM nanjila_readiness_snapshots
              WHERE user_id = $1
              ORDER BY snapshot_date DESC
              LIMIT 1`,
            [userId],
          ),
          pool.query(
            `SELECT snapshot_date,
                    cv_strength, application_readiness, scam_awareness,
                    document_completeness, verification_status, country_readiness,
                    language_readiness, interview_readiness,
                    overall_migration_readiness
               FROM nanjila_readiness_snapshots
              WHERE user_id = $1
                AND snapshot_date > CURRENT_DATE - INTERVAL '30 days'
              ORDER BY snapshot_date ASC`,
            [userId],
          ),
          pool.query(
            `SELECT id, email, first_name, last_name, created_at,
                    email_verified, phone_verified
               FROM users WHERE id = $1 LIMIT 1`,
            [userId],
          ),
        ]);

        if (user.rows.length === 0) {
          return res.status(404).json({ error: "User not found" });
        }

        res.json({
          user:    user.rows[0],
          latest:  latest.rows[0] ?? null,
          trend:   trend.rows,
          hint:    latest.rows.length === 0
            ? "No snapshot yet. Use POST /api/admin/nanjila/trust/:userId/refresh to compute one now."
            : undefined,
        });
      } catch (err: any) {
        console.error("[/api/admin/nanjila/trust/:userId] failed:", err);
        res.status(500).json({ error: err?.message ?? String(err) });
      }
    },
  );

  // ── POST /api/admin/nanjila/trust/:userId/refresh ────────────────────────
  app.post(
    "/api/admin/nanjila/trust/:userId/refresh",
    isAuthenticated, isAdmin,
    async (req: any, res: Response) => {
      try {
        const { userId } = req.params;

        // Verify the user exists so we don't enqueue jobs for phantom IDs.
        const { rows } = await pool.query(
          `SELECT id FROM users WHERE id = $1 LIMIT 1`, [userId],
        );
        if (rows.length === 0) {
          return res.status(404).json({ error: "User not found" });
        }

        const { refreshReadinessForUser } = await import("../nanjila/jobs/nightlyReadiness");
        const enq = await refreshReadinessForUser(userId);

        console.log(
          `[Admin] Nanjila readiness refresh queued: user=${userId} jobId=${enq.jobId} by admin=${req.user?.claims?.sub ?? req.user?.id ?? "unknown"}`,
        );

        res.json({
          ok:    true,
          userId,
          jobId: enq.jobId,
          hint:  "Snapshot will be updated within seconds. Refetch /trust/:userId to see it.",
        });
      } catch (err: any) {
        console.error("[/api/admin/nanjila/trust/:userId/refresh] failed:", err);
        res.status(500).json({ error: err?.message ?? String(err) });
      }
    },
  );

  // ── POST /api/admin/nanjila/trust/sweep ──────────────────────────────────
  app.post(
    "/api/admin/nanjila/trust/sweep",
    isAuthenticated, isAdmin,
    async (req: any, res: Response) => {
      try {
        const { triggerReadinessSweepNow } = await import("../nanjila/jobs/nightlyReadiness");
        const enq = await triggerReadinessSweepNow();
        console.log(
          `[Admin] Nanjila readiness FULL SWEEP triggered: jobId=${enq.jobId} by admin=${req.user?.claims?.sub ?? req.user?.id ?? "unknown"}`,
        );
        res.json({
          ok:    true,
          jobId: enq.jobId,
          hint:  "Sweep will enqueue one job per active user. Watch /queue for progress.",
        });
      } catch (err: any) {
        console.error("[/api/admin/nanjila/trust/sweep] failed:", err);
        res.status(500).json({ error: err?.message ?? String(err) });
      }
    },
  );

  // ── GET /api/admin/nanjila/queue ─────────────────────────────────────────
  app.get(
    "/api/admin/nanjila/queue",
    isAuthenticated, isAdmin,
    async (_req, res: Response) => {
      try {
        const { readinessQueueStats } = await import("../nanjila/jobs/nightlyReadiness");
        const stats = await readinessQueueStats();
        res.json({
          generatedAt: new Date().toISOString(),
          queue:       "nanjila-readiness",
          stats,
        });
      } catch (err: any) {
        console.error("[/api/admin/nanjila/queue] failed:", err);
        res.status(500).json({ error: err?.message ?? String(err) });
      }
    },
  );
}
