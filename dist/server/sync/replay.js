"use strict";
/**
 * Sync Engine — Replay Engine (RC1, Priority 2).
 *
 * Loads a previously captured snapshot, optionally re-normalizes and
 * re-fingerprints with the CURRENT normalizer/fingerprint versions, and
 * either reports what would change ("preview") or actually applies the
 * resulting changeset to nea_agencies ("apply"). A `replay_only` mode
 * exists to materialize the snapshot back into ValidatedRecord shape
 * without doing anything else (useful for ad-hoc forensics).
 *
 * Replays NEVER fetch from the upstream provider. Their entire input is
 * the snapshot. This makes them deterministic, fast, and safe to run
 * any number of times against historical data.
 *
 * Use cases:
 *
 *   1. Normalizer bug fix: replay the last week of snapshots with the
 *      new normalizer and verify the diff matches what we expect.
 *   2. Fingerprint algorithm change: confirm no spurious "updated"
 *      bin entries are produced by the new fingerprint vs the old.
 *   3. Disaster recovery: nea_agencies was corrupted; replay the latest
 *      snapshot to restore.
 *   4. Audit reproducibility: prove that "this snapshot, with these
 *      versions, produces exactly this set of changes."
 *
 * Modes:
 *
 *   - `replay_only`     → load snapshot, return materialized records;
 *                         no diff, no apply, no run record changes.
 *   - `replay_preview`  → replay through pipeline, compute diff, but
 *                         do NOT apply. Returns the ChangeSet + counts.
 *   - `replay_apply`    → run a real sync_run from the snapshot. Uses
 *                         the RC1 atomic runner under the hood, with
 *                         the source snapshot tagged on the new run.
 *
 * All modes record a `sync_replays` audit row.
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
exports.runReplay = runReplay;
const node_crypto_1 = __importDefault(require("node:crypto"));
const diff_1 = require("./diff");
const fingerprint_1 = require("./fingerprint");
const normalize_1 = require("./normalize");
const snapshot_1 = require("./snapshot");
const storage_1 = require("./storage");
const validation_1 = require("./validation");
// ─────────────────────────────────────────────────────────────────────────────
// runReplay
// ─────────────────────────────────────────────────────────────────────────────
async function runReplay(opts) {
    const replayId = node_crypto_1.default.randomUUID();
    // ── 1. Load + checksum-verify the snapshot ──────────────────────────────
    const snapshot = await (0, snapshot_1.restoreSnapshot)(opts.snapshotStore, opts.snapshotId);
    // ── 2. Open the sync_replays audit row ──────────────────────────────────
    await openReplayRow(replayId, snapshot, opts);
    try {
        if (opts.mode === "replay_only") {
            // Snapshot's `validated` was already materialized by restoreSnapshot.
            const result = {
                replayId,
                mode: "replay_only",
                snapshot,
                validated: snapshot.validated,
            };
            await closeReplayRow(replayId, "succeeded");
            return result;
        }
        // For preview + apply we need to re-process raw payloads through the
        // CURRENT normalize + fingerprint pipeline. This is the whole point
        // of replay: catch what the new pipeline does differently.
        const { validated, quarantined, versionsBumped } = await replayPipeline(snapshot);
        if (opts.mode === "replay_preview") {
            const providerId = await (0, storage_1.getProviderIdBySlug)(snapshot.providerSlug);
            if (!providerId) {
                throw new Error(`[replay] provider "${snapshot.providerSlug}" not registered`);
            }
            const current = await (0, storage_1.readCurrentAgenciesByProvider)(providerId);
            const changes = (0, diff_1.computeDiff)(current, validated);
            const counts = (0, diff_1.countChanges)(changes);
            const result = {
                replayId,
                mode: "replay_preview",
                snapshot,
                versionsBumped,
                validated,
                quarantined,
                counts,
            };
            await closeReplayRow(replayId, "succeeded");
            return result;
        }
        // replay_apply: invoke the RC1 atomic runner with a provider stub
        // whose fetchRecords just yields the snapshot's raw records back.
        if (!opts.provider) {
            throw new Error(`[replay] replay_apply requires a provider (for adapter metadata)`);
        }
        const runner = await Promise.resolve().then(() => __importStar(require("./sync-runner-rc1")));
        const replayProvider = makeReplayProvider(opts.provider, snapshot);
        const { runSyncRc1 } = runner;
        const runResult = await runSyncRc1(replayProvider, {
            mode: "recovery",
            triggeredBy: `replay:${opts.triggeredBy}`,
            reason: `Replay of snapshot ${snapshot.id}`,
            replayedFromSnapshotId: snapshot.id,
            snapshotStore: opts.snapshotStore,
        });
        await closeReplayRow(replayId, "succeeded", runResult.runId);
        return {
            replayId,
            mode: "replay_apply",
            snapshot,
            resultingRunId: runResult.runId,
        };
    }
    catch (err) {
        await closeReplayRow(replayId, "failed").catch(() => { });
        throw err;
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// replayPipeline — pure re-normalization + re-fingerprint + re-validate
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Re-runs the foundation pipeline on the snapshot's raw payloads with
 * the CURRENT normalizer + fingerprint versions. Returns the new
 * validated + quarantined bins and a flag indicating whether either
 * version is different from the snapshot's stored versions.
 *
 * If both versions match the snapshot's, this is effectively idempotent —
 * the resulting validated set should match the snapshot's stored
 * validated set 1:1. We re-run it anyway so callers always have a
 * predictable, fresh result regardless of what's in the snapshot row.
 */
async function replayPipeline(snapshot) {
    const versionsBumped = snapshot.normalizerVersion !== normalize_1.NORMALIZER_VERSION ||
        snapshot.fingerprintVersion !== fingerprint_1.FINGERPRINT_VERSION;
    const validated = [];
    const quarantined = [];
    // Walk validated bin → re-normalize the underlying raw payload.
    // Quarantined bin → re-try; might now pass (or fail differently).
    const allRaw = [
        ...snapshot.validated.map((v) => ({ raw: v.raw })),
        ...snapshot.quarantined.map((q) => ({ raw: q.raw })),
    ];
    for (const r of allRaw) {
        // Re-normalize
        let normalized = null;
        try {
            normalized = (0, normalize_1.normalizeAgency)(r.raw);
        }
        catch (err) {
            quarantined.push({
                raw: r.raw,
                partial: null,
                reasons: [{
                        path: "(normalize)",
                        code: "normalize_error",
                        message: err?.message ?? "Normalization threw",
                    }],
                normalizerVersion: null,
            });
            continue;
        }
        // Re-validate
        const result = (0, validation_1.validateAgency)(normalized);
        if (!result.ok) {
            quarantined.push({
                raw: r.raw,
                partial: normalized,
                reasons: result.reasons,
                normalizerVersion: normalize_1.NORMALIZER_VERSION,
            });
            continue;
        }
        // Re-fingerprint
        const fingerprint = (0, fingerprint_1.computeFingerprint)(result.value);
        validated.push({
            raw: r.raw,
            agency: result.value,
            fingerprint,
            normalizerVersion: normalize_1.NORMALIZER_VERSION,
        });
    }
    return { validated, quarantined, versionsBumped };
}
// ─────────────────────────────────────────────────────────────────────────────
// makeReplayProvider — wrap real adapter, swap fetchRecords for snapshot stream
// ─────────────────────────────────────────────────────────────────────────────
function makeReplayProvider(base, snapshot) {
    return {
        slug: base.slug,
        displayName: base.displayName,
        country: base.country,
        metadata: base.metadata,
        healthCheck: base.healthCheck,
        normalize: base.normalize,
        fetchRecords: async function* () {
            // Yield each raw payload from the snapshot back as if it were a
            // fresh fetch. The pipeline will re-normalize and re-fingerprint.
            for (const v of snapshot.validated)
                yield v.raw;
            for (const q of snapshot.quarantined)
                yield q.raw;
        },
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// Persistence helpers — sync_replays audit table
// ─────────────────────────────────────────────────────────────────────────────
async function openReplayRow(replayId, snapshot, opts) {
    const { pool } = await Promise.resolve().then(() => __importStar(require("../db")));
    await pool.query(`INSERT INTO sync_replays
      (id, source_snapshot_id, mode, triggered_by,
       normalizer_version, fingerprint_version,
       started_at, status, notes)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'running', $7)`, [
        replayId,
        snapshot.id,
        opts.mode,
        opts.triggeredBy,
        normalize_1.NORMALIZER_VERSION,
        fingerprint_1.FINGERPRINT_VERSION,
        opts.notes ?? null,
    ]);
}
async function closeReplayRow(replayId, status, resultingRunId) {
    const { pool } = await Promise.resolve().then(() => __importStar(require("../db")));
    await pool.query(`UPDATE sync_replays
        SET finished_at = NOW(),
            status      = $2,
            resulting_run_id = COALESCE($3, resulting_run_id)
      WHERE id = $1`, [replayId, status, resultingRunId ?? null]);
}
