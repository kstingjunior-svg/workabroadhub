"use strict";
/**
 * Developer Operations Dashboard for the Sync Engine (RC1, Priority 5).
 *
 * INTERNAL-ONLY: protected by isAuthenticated + isAdmin. There is no
 * public version of these endpoints. They expose the internal state of
 * the synchronization subsystem for triage, on-call, and post-incident
 * review.
 *
 * Routes:
 *
 *   GET /api/admin/sync/dashboard
 *     Top-level overview: providers, health, last-run-by-provider,
 *     last 24h success rate, average duration, last anomaly summary.
 *
 *   GET /api/admin/sync/runs?provider=&status=&limit=
 *     Paginated run history. Defaults: latest 25 across all providers.
 *
 *   GET /api/admin/sync/runs/:runId
 *     One run with everything attached: quality report, performance
 *     report, drift report, confidence score, anomalies, snapshot id.
 *
 *   GET /api/admin/sync/snapshots?provider=&limit=
 *     List recent snapshots with sizes + checksums.
 *
 *   GET /api/admin/sync/events?runId=&type=&limit=
 *     Read from the Event Store, filtered by run_id or event type.
 *
 *   GET /api/admin/sync/providers/:slug/health
 *     Current health state + last N probe outcomes.
 *
 * All endpoints return JSON. The admin client renders the UI; the
 * server is API-only here.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSyncDashboardRoutes = registerSyncDashboardRoutes;
const db_1 = require("../db");
function registerSyncDashboardRoutes(app, isAuthenticated, isAdmin) {
    // ── Top-level dashboard summary ───────────────────────────────────────
    app.get("/api/admin/sync/dashboard", isAuthenticated, isAdmin, async (_req, res) => {
        try {
            const [providers, lastRunByProvider, last24h, recentAnomalies] = await Promise.all([
                db_1.pool.query(`
            SELECT id, slug, display_name, country, is_active,
                   COALESCE(last_schema_signature->>'hash', '(no baseline)') AS signature_hash
              FROM sync_providers
             ORDER BY display_name`),
                db_1.pool.query(`
            SELECT DISTINCT ON (r.provider_id)
                   p.slug, p.display_name,
                   r.id AS run_id, r.status, r.mode, r.started_at, r.finished_at,
                   r.records_seen, r.records_created, r.records_updated,
                   r.records_deleted, r.records_quarantined,
                   r.duration_ms, r.confidence_score, r.confidence_grade,
                   COALESCE(r.is_shadow, FALSE) AS is_shadow
              FROM sync_runs r
              JOIN sync_providers p ON p.id = r.provider_id
             WHERE COALESCE(r.is_shadow, FALSE) = FALSE
             ORDER BY r.provider_id, r.started_at DESC`),
                db_1.pool.query(`
            SELECT
              COUNT(*)::text                                       AS total,
              COUNT(*) FILTER (WHERE status = 'succeeded')::text   AS succeeded,
              COUNT(*) FILTER (WHERE status = 'failed')::text      AS failed,
              COUNT(*) FILTER (WHERE status = 'held_for_review')::text AS held,
              AVG(duration_ms)::text                               AS avg_duration_ms
            FROM sync_runs
            WHERE started_at > NOW() - INTERVAL '24 hours'
              AND COALESCE(is_shadow, FALSE) = FALSE`),
                db_1.pool.query(`
            SELECT a.id, a.run_id, a.anomaly_type, a.severity,
                   a.metric_value, a.threshold, a.notes,
                   a.created_at,
                   p.slug AS provider_slug
              FROM sync_anomalies a
              JOIN sync_runs r ON r.id = a.run_id
              JOIN sync_providers p ON p.id = r.provider_id
             WHERE a.created_at > NOW() - INTERVAL '7 days'
             ORDER BY a.created_at DESC
             LIMIT 50`),
            ]);
            const r = last24h.rows[0];
            const total = Number(r?.total ?? 0);
            const succeeded = Number(r?.succeeded ?? 0);
            const successRate = total === 0 ? null : Math.round((succeeded / total) * 100);
            res.json({
                generatedAt: new Date().toISOString(),
                providers: providers.rows,
                lastRuns: lastRunByProvider.rows,
                last24h: {
                    total,
                    succeeded,
                    failed: Number(r?.failed ?? 0),
                    heldForReview: Number(r?.held ?? 0),
                    successRatePct: successRate,
                    avgDurationMs: r?.avg_duration_ms ? Math.round(Number(r.avg_duration_ms)) : null,
                },
                recentAnomalies: recentAnomalies.rows,
            });
        }
        catch (err) {
            console.error("[/api/admin/sync/dashboard] failed:", err);
            res.status(500).json({ error: err.message ?? String(err) });
        }
    });
    // ── Run history (paginated) ────────────────────────────────────────────
    app.get("/api/admin/sync/runs", isAuthenticated, isAdmin, async (req, res) => {
        try {
            const provider = req.query.provider || null;
            const status = req.query.status || null;
            const limit = Math.min(200, Number(req.query.limit) || 25);
            const where = [];
            const params = [];
            let i = 1;
            if (provider) {
                where.push(`p.slug = $${i++}`);
                params.push(provider);
            }
            if (status) {
                where.push(`r.status = $${i++}`);
                params.push(status);
            }
            const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";
            params.push(limit);
            const { rows } = await db_1.pool.query(`
          SELECT r.id, r.mode, r.status, r.triggered_by, r.started_at, r.finished_at,
                 r.records_seen, r.records_created, r.records_updated,
                 r.records_deleted, r.records_quarantined, r.duration_ms,
                 r.confidence_score, r.confidence_grade,
                 COALESCE(r.is_shadow, FALSE)         AS is_shadow,
                 r.replayed_from_snapshot_id          AS replayed_from,
                 p.slug AS provider_slug, p.display_name AS provider_name
            FROM sync_runs r
            JOIN sync_providers p ON p.id = r.provider_id
            ${whereSQL}
            ORDER BY r.started_at DESC
            LIMIT $${i}`, params);
            res.json({ count: rows.length, runs: rows });
        }
        catch (err) {
            console.error("[/api/admin/sync/runs] failed:", err);
            res.status(500).json({ error: err.message ?? String(err) });
        }
    });
    // ── One run, everything attached ───────────────────────────────────────
    app.get("/api/admin/sync/runs/:runId", isAuthenticated, isAdmin, async (req, res) => {
        try {
            const { runId } = req.params;
            const [run, anomalies, snapshot] = await Promise.all([
                db_1.pool.query(`
            SELECT r.*, p.slug AS provider_slug, p.display_name AS provider_name
              FROM sync_runs r
              JOIN sync_providers p ON p.id = r.provider_id
             WHERE r.id = $1`, [runId]),
                db_1.pool.query(`SELECT * FROM sync_anomalies WHERE run_id = $1 ORDER BY created_at`, [runId]),
                db_1.pool.query(`SELECT id, byte_size, checksum_sha256, validated_count, quarantined_count, created_at
                        FROM sync_snapshots WHERE run_id = $1 LIMIT 1`, [runId]),
            ]);
            if (run.rows.length === 0) {
                return res.status(404).json({ error: "run not found" });
            }
            res.json({
                run: run.rows[0],
                anomalies: anomalies.rows,
                snapshot: snapshot.rows[0] ?? null,
            });
        }
        catch (err) {
            console.error("[/api/admin/sync/runs/:runId] failed:", err);
            res.status(500).json({ error: err.message ?? String(err) });
        }
    });
    // ── Snapshots ──────────────────────────────────────────────────────────
    app.get("/api/admin/sync/snapshots", isAuthenticated, isAdmin, async (req, res) => {
        try {
            const provider = req.query.provider || null;
            const limit = Math.min(200, Number(req.query.limit) || 25);
            const params = [];
            let where = "";
            if (provider) {
                where = "WHERE p.slug = $1";
                params.push(provider);
            }
            params.push(limit);
            const { rows } = await db_1.pool.query(`
          SELECT s.id, s.run_id, s.byte_size, s.checksum_sha256,
                 s.validated_count, s.quarantined_count,
                 s.normalizer_version, s.fingerprint_version,
                 s.created_at,
                 p.slug AS provider_slug
            FROM sync_snapshots s
            JOIN sync_providers p ON p.id = s.provider_id
            ${where}
            ORDER BY s.created_at DESC
            LIMIT $${params.length}`, params);
            res.json({ count: rows.length, snapshots: rows });
        }
        catch (err) {
            console.error("[/api/admin/sync/snapshots] failed:", err);
            res.status(500).json({ error: err.message ?? String(err) });
        }
    });
    // ── Events ─────────────────────────────────────────────────────────────
    app.get("/api/admin/sync/events", isAuthenticated, isAdmin, async (req, res) => {
        try {
            const runId = req.query.runId || null;
            const type = req.query.type || null;
            const limit = Math.min(500, Number(req.query.limit) || 100);
            const where = [];
            const params = [];
            let i = 1;
            if (runId) {
                where.push(`run_id = $${i++}`);
                params.push(runId);
            }
            if (type) {
                where.push(`event_type = $${i++}`);
                params.push(type);
            }
            const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";
            params.push(limit);
            const { rows } = await db_1.pool.query(`
          SELECT id, run_id, event_type, event_version, payload, created_at
            FROM sync_events
            ${whereSQL}
            ORDER BY created_at DESC
            LIMIT $${i}`, params);
            res.json({ count: rows.length, events: rows });
        }
        catch (err) {
            console.error("[/api/admin/sync/events] failed:", err);
            res.status(500).json({ error: err.message ?? String(err) });
        }
    });
    // ── Provider health detail ─────────────────────────────────────────────
    app.get("/api/admin/sync/providers/:slug/health", isAuthenticated, isAdmin, async (req, res) => {
        try {
            const { slug } = req.params;
            const { rows: providerRows } = await db_1.pool.query(`SELECT id, slug, display_name, country, is_active,
                  last_schema_signature
             FROM sync_providers WHERE slug = $1 LIMIT 1`, [slug]);
            if (providerRows.length === 0) {
                return res.status(404).json({ error: "provider not found" });
            }
            const provider = providerRows[0];
            const { rows: recentRuns } = await db_1.pool.query(`SELECT id, status, started_at, finished_at, duration_ms,
                  confidence_score, confidence_grade
             FROM sync_runs WHERE provider_id = $1
              AND COALESCE(is_shadow, FALSE) = FALSE
             ORDER BY started_at DESC LIMIT 20`, [provider.id]);
            const { rows: healthEvents } = await db_1.pool.query(`SELECT created_at, event_type, payload
             FROM sync_events
            WHERE event_type IN ('ProviderHealthDegraded', 'ProviderHealthRestored', 'ProviderHealthBroken')
              AND payload->>'providerId' = $1
            ORDER BY created_at DESC
            LIMIT 25`, [provider.id]);
            res.json({
                provider,
                recentRuns,
                healthEvents,
            });
        }
        catch (err) {
            console.error("[/api/admin/sync/providers/:slug/health] failed:", err);
            res.status(500).json({ error: err.message ?? String(err) });
        }
    });
}
