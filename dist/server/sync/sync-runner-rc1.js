"use strict";
/**
 * Sync Engine — RC1 run wrapper (Release Candidate 1, Priority 1).
 *
 * GUARANTEE: a single COMMIT (or ROLLBACK) covers every write that should
 * appear together: sync_records, nea_agencies upserts/touches, deletes,
 * agency_change_log, sync_anomalies, sync_snapshots, sync_events, AND the
 * terminal sync_runs status row.
 *
 * Compared with sync-runner-m3 (which used 3 separate withTransaction
 * blocks), RC1 eliminates the window in which sync_events could persist
 * while the apply/snapshot rows were lost to a crash — or vice versa.
 *
 * Lifecycle:
 *   ┌── outside any transaction ────────────────────────────────────┐
 *   │  runHealthCheck()        (own tiny tx for the transition row) │
 *   │  createRun()             (own tiny tx — INSERT RETURNING)     │
 *   │  runFoundation()         (pure, memory only)                  │
 *   │  readCurrentAgenciesByProvider()  (read-only query)           │
 *   │  computeDiff()           (pure)                               │
 *   │  evaluateSafety()        (pure)                               │
 *   │  generateDataQualityReport()  (pure)                          │
 *   └───────────────────────────────────────────────────────────────┘
 *   ┌── ONE withTransaction (atomic block) ─────────────────────────┐
 *   │  captureSnapshot()           ← sync_snapshots row             │
 *   │  if held:  writeAnomalies()  ← sync_anomalies rows            │
 *   │  if applying:                                                 │
 *   │      applyChangeSetCore()   ← sync_records, nea_agencies,     │
 *   │                              agency_change_log                │
 *   │      emit Agency* events                                      │
 *   │  emit SynchronizationCompleted | SynchronizationFailed         │
 *   │  buffer.flush()              ← sync_events                    │
 *   │  persistQualityReport()      ← sync_runs.data_quality_report  │
 *   │  updateRunStatus()           ← sync_runs.status='succeeded'   │
 *   │                                / 'failed' / 'held_for_review' │
 *   └───────────────────────────────────────────────────────────────┘
 *   ┌── on exception ───────────────────────────────────────────────┐
 *   │  outer transaction rolled back (nothing partial persisted)    │
 *   │  best-effort: updateRunStatus(failed) in its own tiny tx,     │
 *   │  emit SynchronizationFailed in its own tiny tx                │
 *   └───────────────────────────────────────────────────────────────┘
 *
 * Note on snapshot file uploads: when SnapshotStore is local-disk or
 * cloud-object-store, the file is uploaded BEFORE the row is INSERT'd in
 * sync_snapshots. If the transaction rolls back, the file becomes an
 * orphan blob — disk-cheap, easy to GC. We accept this trade-off because
 * the alternative (deferring the upload until after COMMIT) would
 * re-introduce the cross-transaction inconsistency we're closing here.
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
exports.runSyncRc1 = runSyncRc1;
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
const hardening_1 = require("./hardening");
// ─────────────────────────────────────────────────────────────────────────────
// runSyncRc1 — single-COMMIT lifecycle
// ─────────────────────────────────────────────────────────────────────────────
async function runSyncRc1(provider, opts) {
    const snapshotStore = opts.snapshotStore ?? new snapshot_1.MemorySnapshotStore();
    const correlationId = opts.correlationId ?? node_crypto_1.default.randomUUID();
    // ── 1. Resolve provider_id ──────────────────────────────────────────────
    const providerId = await (0, storage_1.getProviderIdBySlug)(provider.slug);
    if (!providerId) {
        throw new Error(`[sync-rc1] provider "${provider.slug}" not registered in sync_providers`);
    }
    // ── 1a. Acquire per-provider advisory lock ──────────────────────────────
    // RC1-P8 / H-001: at most ONE run per provider at a time. The lock is
    // bound to a dedicated PoolClient that lives for the entire run; when
    // the client is released back to the pool the lock is held until we
    // explicitly unlock (or until the connection ends). If pg_try_advisory_lock
    // returns false, another run is already in flight — abort cleanly so the
    // scheduler can retry on the next tick.
    const { pool } = await Promise.resolve().then(() => __importStar(require("../db")));
    const lockClient = await pool.connect();
    let lockAcquired = false;
    try {
        lockAcquired = await (0, hardening_1.acquireRunLock)(lockClient, provider.slug);
        if (!lockAcquired) {
            throw new Error(`[sync-rc1] provider "${provider.slug}" is already being synchronized ` +
                `(advisory lock held). Skipping this invocation.`);
        }
        // ── 2. Health check (own tiny tx; may abort the run before any work) ────
        if (!opts.skipHealthCheck) {
            const healthBuffer = new events_1.EventBuffer();
            const probe = await (0, health_1.runHealthCheck)(provider, providerId, healthBuffer);
            if (probe.transitioned) {
                await (0, storage_1.withTransaction)(async (c) => healthBuffer.flush(c));
            }
            if (probe.after.status === "broken") {
                throw new Error(`[sync-rc1] provider "${provider.slug}" is broken — refusing to run. ` +
                    `Last error: ${probe.outcome.errorMessage ?? "(none reported)"}`);
            }
        }
        // ── 3. Pinned versions ──────────────────────────────────────────────────
        const { NORMALIZER_VERSION } = await Promise.resolve().then(() => __importStar(require("./normalize")));
        const { FINGERPRINT_VERSION } = await Promise.resolve().then(() => __importStar(require("./fingerprint")));
        // ── 4. Open sync_runs row (own tiny tx — INSERT RETURNING) ──────────────
        const run = await (0, storage_1.createRun)({
            providerId,
            mode: opts.mode,
            triggeredBy: opts.triggeredBy,
            correlationId,
            normalizerVersion: NORMALIZER_VERSION,
            fingerprintVersion: FINGERPRINT_VERSION,
        });
        // Tag replay/shadow attribution BEFORE the main work, in its own tiny tx.
        if (opts.replayedFromSnapshotId || opts.isShadow) {
            await tagRunMetadata(run.id, {
                replayedFromSnapshotId: opts.replayedFromSnapshotId,
                isShadow: opts.isShadow,
            });
        }
        // EventBuffer for the main run. Flushed inside the SAME transaction
        // as apply + snapshot + run-status update.
        const buffer = new events_1.EventBuffer();
        (0, events_1.emitSynchronizationStarted)(buffer, {
            runId: run.id,
            providerId,
            correlationId,
            mode: opts.mode,
            triggeredBy: opts.triggeredBy,
        });
        // Variables that get populated INSIDE the transaction and read after.
        let foundation = null;
        let changes = null;
        let counts = null;
        let safety = null;
        let snapshot = null;
        let apply = null;
        let qualityReport = null;
        let terminalStatus = "succeeded";
        try {
            // ── 5. PURE / READ-ONLY PRELUDE (outside the atomic block) ────────────
            // These are deterministic functions over the source payload and the
            // current agency snapshot — no writes are issued. We do them outside
            // the transaction so the atomic block stays short (less lock pressure).
            foundation = await (0, engine_1.runFoundation)(provider, { ...opts, correlationId });
            const current = await (0, storage_1.readCurrentAgenciesByProvider)(providerId);
            changes = (0, diff_1.computeDiff)(current, foundation.validated);
            counts = (0, diff_1.countChanges)(changes);
            // Emit quarantine events (buffered; flushed inside the atomic block).
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
            safety = (0, safety_1.evaluateSafety)({
                changes,
                counts,
                fetchedCount: foundation.fetched,
                quarantinedCount: foundation.quarantined.length,
                currentCount: current.size,
                recentFetchedCounts: opts.recentFetchedCounts,
                config: opts.safetyConfig,
            });
            qualityReport = (0, quality_report_1.generateDataQualityReport)({
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
            // ── 6. THE ATOMIC BLOCK ───────────────────────────────────────────────
            // One transaction. One COMMIT. One ROLLBACK on any error.
            await (0, storage_1.withTransaction)(async (client) => {
                // 6a. Snapshot row — captured for ALL paths (apply, hold, dry-run)
                //     so admins can replay or diagnose any run.
                snapshot = await (0, snapshot_1.captureSnapshot)(snapshotStore, {
                    runId: run.id,
                    providerId,
                    providerSlug: provider.slug,
                    validated: foundation.validated,
                    quarantined: foundation.quarantined,
                    normalizerVersion: foundation.normalizerVersion,
                    fingerprintVersion: foundation.fingerprintVersion,
                }, client);
                // 6b. Decide which terminal path we're on.
                const isHeld = safety.holdRun;
                const isDryRun = opts.mode === "dry_run";
                const isShadow = opts.isShadow === true;
                const willApply = !isHeld && !isDryRun && !isShadow;
                // 6c. Apply phase — only when we will actually persist changes.
                if (willApply) {
                    apply = await (0, apply_1.applyChangeSetCore)(client, changes, {
                        providerId,
                        runId: run.id,
                        performedBy: opts.triggeredBy,
                        reason: opts.reason ?? null,
                    }, foundation.validated, foundation.quarantined, foundation.normalizerVersion);
                    // Agency lifecycle events.
                    //
                    // NOTE: applyChangeSetCore returns the new agency ids in INSERTION
                    // ORDER (it appends to createdAgencyIds in the same order it
                    // iterates over changes.created), so positional lookup is safe.
                    for (let i = 0; i < changes.created.length; i++) {
                        const c = changes.created[i];
                        (0, events_1.emitAgencyCreated)(buffer, {
                            runId: run.id,
                            providerId,
                            agencyId: apply.createdAgencyIds[i] ?? "(unknown)",
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
                }
                // 6d. Held-for-review: persist anomalies, emit failure event.
                if (isHeld) {
                    await writeAnomalies(client, run.id, safety);
                    (0, events_1.emitSynchronizationFailed)(buffer, {
                        runId: run.id,
                        providerId,
                        correlationId,
                        reason: "held_for_review",
                        errorMessage: safety.holdReason ?? "Safety gate tripped.",
                    });
                    terminalStatus = "held_for_review";
                }
                else {
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
                    terminalStatus = "succeeded";
                }
                // 6e. Flush ALL events — quarantines, started, lifecycle, terminal.
                await buffer.flush(client);
                // 6f. Persist data quality report onto sync_runs (still in tx).
                await client.query(`UPDATE sync_runs SET data_quality_report = $2::jsonb WHERE id = $1`, [run.id, JSON.stringify(qualityReport)]);
                // 6g. Terminal status — IN the same transaction.
                const recordCounts = willApply && apply
                    ? {
                        recordsCreated: apply.createdCount,
                        recordsUpdated: apply.updatedCount,
                        recordsDeleted: apply.deletedCount,
                    }
                    : {
                        recordsCreated: counts.created,
                        recordsUpdated: counts.updated,
                        recordsDeleted: counts.deleted,
                    };
                await (0, storage_1.updateRunStatus)(run.id, {
                    status: terminalStatus,
                    recordsSeen: foundation.fetched,
                    ...recordCounts,
                    recordsQuarantined: foundation.quarantined.length,
                    durationMs: foundation.durationMs,
                    holdReason: isHeld ? safety.holdReason : undefined,
                }, client);
            });
            return {
                runId: run.id,
                correlationId,
                status: terminalStatus,
                foundation: foundation,
                diff: counts,
                apply,
                safety: safety,
                snapshot,
                qualityReport: qualityReport,
            };
        }
        catch (err) {
            const message = err?.message ?? String(err);
            // Outer tx already rolled back — nothing partial is on disk for the
            // atomic block. We now best-effort persist a failure record so that
            // the run does not stay in 'running' forever.
            await (0, storage_1.withTransaction)(async (client) => {
                const failBuffer = new events_1.EventBuffer();
                (0, events_1.emitSynchronizationFailed)(failBuffer, {
                    runId: run.id,
                    providerId,
                    correlationId,
                    reason: "exception",
                    errorMessage: message,
                });
                await failBuffer.flush(client);
                await (0, storage_1.updateRunStatus)(run.id, { status: "failed", errorMessage: message }, client);
            }).catch(() => { });
            throw err;
        }
    }
    finally {
        // Always release the lock + client. Lock release is best-effort —
        // if it fails, the session-bound auto-release covers the gap.
        if (lockAcquired) {
            try {
                await (0, hardening_1.releaseRunLock)(lockClient, provider.slug);
            }
            catch { /* best-effort */ }
        }
        lockClient.release();
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
async function tagRunMetadata(runId, patch) {
    const { pool } = await Promise.resolve().then(() => __importStar(require("../db")));
    const sets = [];
    const params = [runId];
    let i = 2;
    if (patch.replayedFromSnapshotId !== undefined) {
        sets.push(`replayed_from_snapshot_id = $${i++}`);
        params.push(patch.replayedFromSnapshotId);
    }
    if (patch.isShadow !== undefined) {
        sets.push(`is_shadow = $${i++}`);
        params.push(patch.isShadow);
    }
    if (sets.length === 0)
        return;
    await pool.query(`UPDATE sync_runs SET ${sets.join(", ")} WHERE id = $1`, params);
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
