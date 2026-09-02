"use strict";
/**
 * Sync Engine — M3 run wrapper (Milestone 3).
 *
 * Extends the M2 runner with: health check, snapshot capture, safety gate,
 * event emission across the full lifecycle, and data quality report.
 *
 * Lifecycle (additions to M2 marked with [M3]):
 *
 *   [M3] runHealthCheck()          ← skip run if provider is broken
 *   create sync_runs row
 *   [M3] emit SynchronizationStarted
 *   runFoundation()
 *   read current state
 *   computeDiff()
 *   [M3] evaluateSafety()          ← may hold the run
 *   [M3] captureSnapshot()         ← always; even for dry-run
 *   if held: emit SynchronizationFailed(held_for_review); skip apply
 *   else: applyChangeSet() + emit Agency* events
 *   [M3] generateDataQualityReport()
 *   close sync_runs row (with data_quality_report attached)
 *   [M3] emit SynchronizationCompleted | SynchronizationFailed
 *   [M3] flush event buffer in the same transaction as apply
 *
 * M2's runSync remains the simpler entry point for callers that don't
 * need M3 features (and for the M2 unit tests).
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSyncM3 = runSyncM3;
const node_crypto_1 = __importDefault(require("node:crypto"));
const apply_1 = require("./apply");
const diff_1 = require("./diff");
const engine_1 = require("./engine");
const events_1 = require("./events");
const health_1 = require("./health");
const quality_report_1 = require("./quality-report");
const safety_1 = require("./safety");
const snapshot_1 = require("./snapshot");
const storage_1 = require("./storage");
// ─────────────────────────────────────────────────────────────────────────────
// runSyncM3
// ─────────────────────────────────────────────────────────────────────────────
async function runSyncM3(provider, opts) {
    const snapshotStore = opts.snapshotStore ?? new snapshot_1.MemorySnapshotStore();
    const correlationId = opts.correlationId ?? node_crypto_1.default.randomUUID();
    // ── 1. Resolve provider_id ──────────────────────────────────────────────
    const providerId = await (0, storage_1.getProviderIdBySlug)(provider.slug);
    if (!providerId) {
        throw new Error(`[sync-m3] provider "${provider.slug}" not registered in sync_providers`);
    }
    // ── 2. Health check (may abort the run before any work) ─────────────────
    if (!opts.skipHealthCheck) {
        const healthBuffer = new events_1.EventBuffer();
        const probe = await (0, health_1.runHealthCheck)(provider, providerId, healthBuffer);
        // Flush the health transition event (if any) immediately so it's
        // visible in the event store regardless of whether the run proceeds.
        if (probe.transitioned) {
            await (0, storage_1.withTransaction)(async (c) => healthBuffer.flush(c));
        }
        if (probe.after.status === "broken") {
            throw new Error(`[sync-m3] provider "${provider.slug}" is broken — refusing to run. ` +
                `Last error: ${probe.outcome.errorMessage ?? "(none reported)"}`);
        }
    }
    // ── 3. Pinned versions ──────────────────────────────────────────────────
    const { NORMALIZER_VERSION } = await Promise.resolve().then(() => __importStar(require("./normalize")));
    const { FINGERPRINT_VERSION } = await Promise.resolve().then(() => __importStar(require("./fingerprint")));
    // ── 4. Open sync_runs row ───────────────────────────────────────────────
    const run = await (0, storage_1.createRun)({
        providerId,
        mode: opts.mode,
        triggeredBy: opts.triggeredBy,
        correlationId,
        normalizerVersion: NORMALIZER_VERSION,
        fingerprintVersion: FINGERPRINT_VERSION,
    });
    // EventBuffer for the main run. Flushed inside the apply transaction.
    const buffer = new events_1.EventBuffer();
    (0, events_1.emitSynchronizationStarted)(buffer, {
        runId: run.id,
        providerId,
        correlationId,
        mode: opts.mode,
        triggeredBy: opts.triggeredBy,
    });
    try {
        // ── 5. Run foundation pipeline ────────────────────────────────────────
        const foundation = await (0, engine_1.runFoundation)(provider, { ...opts, correlationId });
        // Emit quarantine events.
        for (const q of foundation.quarantined) {
            const isNormalize = q.reasons.some((r) => r.path === "(normalize)");
            (0, events_1.emitAgencyQuarantined)(buffer, {
                runId: run.id,
                providerId,
                licenseNumber: String(q.raw.licenseNumber ?? ""),
                rawPayload: q.raw,
                stage: isNormalize ? "normalize" : "validate",
                reasons: q.reasons,
            });
        }
        // ── 6. Read current state + compute diff ──────────────────────────────
        const current = await (0, storage_1.readCurrentAgenciesByProvider)(providerId);
        const changes = (0, diff_1.computeDiff)(current, foundation.validated);
        const counts = (0, diff_1.countChanges)(changes);
        // ── 7. Safety gate ────────────────────────────────────────────────────
        const safety = (0, safety_1.evaluateSafety)({
            changes,
            counts,
            fetchedCount: foundation.fetched,
            quarantinedCount: foundation.quarantined.length,
            currentCount: current.size,
            recentFetchedCounts: opts.recentFetchedCounts,
            config: opts.safetyConfig,
        });
        // ── 8. Generate data quality report (regardless of held/apply) ────────
        const qualityReport = (0, quality_report_1.generateDataQualityReport)({
            runId: run.id,
            providerSlug: provider.slug,
            fetched: foundation.fetched,
            validated: foundation.validated,
            quarantined: foundation.quarantined,
            changes,
            counts,
            normalizerVersion: foundation.normalizerVersion,
            fingerprintVersion: foundation.fingerprintVersion,
            safety: {
                anomalyScore: safety.anomalyScore,
                held: safety.holdRun,
                anomalies: safety.anomalies,
            },
        });
        // ── 9. Snapshot + (conditionally) apply, both inside one transaction ──
        let snapshot = null;
        let apply = null;
        if (safety.holdRun) {
            // Held — capture snapshot for admin review, persist hold reason +
            // anomalies + quality report. NO apply.
            await (0, storage_1.withTransaction)(async (client) => {
                snapshot = await (0, snapshot_1.captureSnapshot)(snapshotStore, {
                    runId: run.id,
                    providerId,
                    providerSlug: provider.slug,
                    validated: foundation.validated,
                    quarantined: foundation.quarantined,
                    normalizerVersion: foundation.normalizerVersion,
                    fingerprintVersion: foundation.fingerprintVersion,
                }, client);
                await writeAnomalies(client, run.id, safety);
                (0, events_1.emitSynchronizationFailed)(buffer, {
                    runId: run.id,
                    providerId,
                    correlationId,
                    reason: "held_for_review",
                    errorMessage: safety.holdReason ?? "Safety gate tripped.",
                });
                await buffer.flush(client);
            });
            await (0, storage_1.updateRunStatus)(run.id, {
                status: "held_for_review",
                recordsSeen: foundation.fetched,
                recordsCreated: counts.created,
                recordsUpdated: counts.updated,
                recordsDeleted: counts.deleted,
                recordsQuarantined: foundation.quarantined.length,
                durationMs: foundation.durationMs,
                holdReason: safety.holdReason,
            });
            await persistQualityReport(run.id, qualityReport);
            return {
                runId: run.id,
                correlationId,
                status: "held_for_review",
                foundation,
                diff: counts,
                apply: null,
                safety,
                snapshot,
                qualityReport,
            };
        }
        // Dry-run: capture snapshot, skip apply, succeed.
        if (opts.mode === "dry_run") {
            await (0, storage_1.withTransaction)(async (client) => {
                snapshot = await (0, snapshot_1.captureSnapshot)(snapshotStore, {
                    runId: run.id,
                    providerId,
                    providerSlug: provider.slug,
                    validated: foundation.validated,
                    quarantined: foundation.quarantined,
                    normalizerVersion: foundation.normalizerVersion,
                    fingerprintVersion: foundation.fingerprintVersion,
                }, client);
                (0, events_1.emitSynchronizationCompleted)(buffer, {
                    runId: run.id,
                    providerId,
                    correlationId,
                    counts: {
                        fetched: foundation.fetched,
                        created: counts.created,
                        updated: counts.updated,
                        unchanged: counts.unchanged,
                        deleted: counts.deleted,
                        quarantined: foundation.quarantined.length,
                    },
                    durationMs: foundation.durationMs,
                });
                await buffer.flush(client);
            });
            await (0, storage_1.updateRunStatus)(run.id, {
                status: "succeeded",
                recordsSeen: foundation.fetched,
                recordsCreated: counts.created,
                recordsUpdated: counts.updated,
                recordsDeleted: counts.deleted,
                recordsQuarantined: foundation.quarantined.length,
                durationMs: foundation.durationMs,
            });
            await persistQualityReport(run.id, qualityReport);
            return {
                runId: run.id,
                correlationId,
                status: "succeeded",
                foundation,
                diff: counts,
                apply: null,
                safety,
                snapshot,
                qualityReport,
            };
        }
        // ── 10. Normal apply path: snapshot + apply + events in ONE transaction ─
        // applyChangeSet runs its own transaction internally; we need the
        // snapshot + events to share that transaction so atomicity covers all
        // three. So we call the apply storage primitives ourselves here.
        //
        // For simplicity in this milestone, we let applyChangeSet do its own
        // transaction and snapshot in a separate transaction immediately
        // before. A future M-N can consolidate into one transaction if the
        // ordering ever becomes a consistency hazard. Today: snapshot capture
        // is read-only over already-validated records and posing no risk.
        await (0, storage_1.withTransaction)(async (client) => {
            snapshot = await (0, snapshot_1.captureSnapshot)(snapshotStore, {
                runId: run.id,
                providerId,
                providerSlug: provider.slug,
                validated: foundation.validated,
                quarantined: foundation.quarantined,
                normalizerVersion: foundation.normalizerVersion,
                fingerprintVersion: foundation.fingerprintVersion,
            }, client);
        });
        apply = await (0, apply_1.applyChangeSet)(changes, {
            providerId,
            runId: run.id,
            performedBy: opts.triggeredBy,
            reason: opts.reason ?? null,
        }, foundation.validated, foundation.quarantined, foundation.normalizerVersion);
        // Emit Agency lifecycle events. This happens AFTER apply so the
        // emitted agency_ids are real. Buffer flushed alongside.
        await (0, storage_1.withTransaction)(async (client) => {
            for (const c of changes.created) {
                const id = apply.createdAgencyIds.find((_id) => true);
                (0, events_1.emitAgencyCreated)(buffer, {
                    runId: run.id,
                    providerId,
                    agencyId: id ?? "(unknown)",
                    licenseNumber: c.licenseNumber,
                    fingerprint: c.fingerprint,
                    agency: c.agency,
                });
            }
            for (const u of changes.updated) {
                (0, events_1.emitAgencyUpdated)(buffer, {
                    runId: run.id,
                    providerId,
                    agencyId: u.agencyId,
                    licenseNumber: u.licenseNumber,
                    oldFingerprint: "(prior)",
                    newFingerprint: u.fingerprint,
                    fieldChanges: u.fieldChanges,
                });
            }
            for (const d of changes.deleted) {
                (0, events_1.emitAgencyRemoved)(buffer, {
                    runId: run.id,
                    providerId,
                    agencyId: d.agencyId,
                    licenseNumber: d.licenseNumber,
                    previousStatus: d.before.statusSource,
                });
            }
            (0, events_1.emitSynchronizationCompleted)(buffer, {
                runId: run.id,
                providerId,
                correlationId,
                counts: {
                    fetched: foundation.fetched,
                    created: counts.created,
                    updated: counts.updated,
                    unchanged: counts.unchanged,
                    deleted: counts.deleted,
                    quarantined: foundation.quarantined.length,
                },
                durationMs: foundation.durationMs,
            });
            await buffer.flush(client);
        });
        await (0, storage_1.updateRunStatus)(run.id, {
            status: "succeeded",
            recordsSeen: foundation.fetched,
            recordsCreated: apply.createdCount,
            recordsUpdated: apply.updatedCount,
            recordsDeleted: apply.deletedCount,
            recordsQuarantined: foundation.quarantined.length,
            durationMs: foundation.durationMs,
        });
        await persistQualityReport(run.id, qualityReport);
        return {
            runId: run.id,
            correlationId,
            status: "succeeded",
            foundation,
            diff: counts,
            apply,
            safety,
            snapshot,
            qualityReport,
        };
    }
    catch (err) {
        const message = err?.message ?? String(err);
        // Best-effort: persist failure event + status.
        await (0, storage_1.withTransaction)(async (client) => {
            (0, events_1.emitSynchronizationFailed)(buffer, {
                runId: run.id,
                providerId,
                correlationId,
                reason: "exception",
                errorMessage: message,
            });
            await buffer.flush(client);
        }).catch(() => { });
        await (0, storage_1.updateRunStatus)(run.id, {
            status: "failed",
            errorMessage: message,
        }).catch(() => { });
        throw err;
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
async function persistQualityReport(runId, report) {
    const { pool } = await Promise.resolve().then(() => __importStar(require("../db")));
    await pool.query(`UPDATE sync_runs SET data_quality_report = $2::jsonb WHERE id = $1`, [runId, JSON.stringify(report)]);
}
async function writeAnomalies(client, runId, safety) {
    if (safety.anomalies.length === 0)
        return;
    for (const a of safety.anomalies) {
        await client.query(`INSERT INTO sync_anomalies
         (run_id, anomaly_type, severity, metric_value, threshold, sample_data, notes)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`, [
            runId, a.type, a.severity,
            a.metricValue.toString(), a.threshold.toString(),
            JSON.stringify(a.sampleData),
            a.message,
        ]);
    }
}
