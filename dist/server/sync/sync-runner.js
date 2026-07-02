"use strict";
/**
 * Sync Engine — M2 run wrapper (Milestone 2).
 *
 * Wraps the M1 `runFoundation` with the full M2 lifecycle:
 *
 *   sync_runs row open (status=running)
 *      │
 *      ▼
 *   runFoundation()   (M1 — pure data pipeline)
 *      │
 *      ▼
 *   read current state for provider
 *      │
 *      ▼
 *   computeDiff()     (M2 — pure)
 *      │
 *      ▼
 *   applyChangeSet()  (M2 — transactional)
 *      │
 *      ▼
 *   sync_runs row close (status=succeeded|failed; counts written)
 *
 * Architectural notes:
 *
 *   1. **runFoundation result is NOT modified.** M2 wraps it, doesn't
 *      replace it. M1 tests continue to pass against the foundation
 *      pipeline unchanged.
 *
 *   2. **The sync_runs row opens BEFORE foundation runs** so the
 *      correlation id and provider id are persisted even if the adapter
 *      explodes mid-fetch. Failed runs leave a row with status='failed'
 *      and the error message — diagnostics, not silent disappearance.
 *
 *   3. **Apply is the only DB-write call inside the transactional flow.**
 *      The sync_runs open/close are short, non-transactional UPDATEs
 *      whose failure cannot corrupt nea_agencies (their effect is
 *      bounded to the run-tracking table).
 *
 *   4. **Idempotency on re-run** is inherited from Diff (fingerprint
 *      match = no-op) and Apply (UPSERT). Re-running the same data
 *      against the same provider produces zero changes and zero
 *      agency_change_log rows.
 *
 *   5. **Correlation id flows through every log line.** sync_runs row,
 *      every foundation-stage log, every storage call. Stitching post-hoc
 *      across logs is a single grep.
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
exports.runSync = runSync;
const apply_1 = require("./apply");
const diff_1 = require("./diff");
const engine_1 = require("./engine");
const storage_1 = require("./storage");
// ─────────────────────────────────────────────────────────────────────────────
// runSync — the M2 entry point
// ─────────────────────────────────────────────────────────────────────────────
async function runSync(provider, opts) {
    // ── 1. Resolve provider_id from slug ──────────────────────────────────────
    const providerId = await (0, storage_1.getProviderIdBySlug)(provider.slug);
    if (!providerId) {
        throw new Error(`[sync] provider "${provider.slug}" not registered in sync_providers — ` +
            `did the migration 0006 run, and did the bootstrap insert the row?`);
    }
    // ── 2. Open sync_runs row early (correlation id known up-front) ──────────
    // We need the correlation id NOW so foundation + storage can stitch logs.
    // generateUuid() is what foundation does internally too; we pre-generate
    // here and pass to foundation via correlationId opt.
    const correlationId = opts.correlationId ??
        (await Promise.resolve().then(() => __importStar(require("node:crypto")))).randomUUID();
    // Foundation's pinned versions are known at module-load time, but the
    // values live on the foundation result. We pre-fetch them indirectly
    // by reading what foundation will report; cleaner to import the
    // constants directly.
    const { NORMALIZER_VERSION } = await Promise.resolve().then(() => __importStar(require("./normalize")));
    const { FINGERPRINT_VERSION } = await Promise.resolve().then(() => __importStar(require("./fingerprint")));
    const run = await (0, storage_1.createRun)({
        providerId,
        mode: opts.mode,
        triggeredBy: opts.triggeredBy,
        correlationId,
        normalizerVersion: NORMALIZER_VERSION,
        fingerprintVersion: FINGERPRINT_VERSION,
    });
    // ── 3. Run foundation → diff → apply, inside a single try/catch so any
    //       failure leaves a sync_runs row in a terminal 'failed' state. ──────
    try {
        const foundation = await (0, engine_1.runFoundation)(provider, {
            ...opts,
            correlationId,
        });
        // ── 4. Read current state for the provider ──────────────────────────────
        const current = await (0, storage_1.readCurrentAgenciesByProvider)(providerId);
        // ── 5. Diff (pure) ──────────────────────────────────────────────────────
        const changes = (0, diff_1.computeDiff)(current, foundation.validated);
        const diffCounts = (0, diff_1.countChanges)(changes);
        // Dry-run short-circuits BEFORE apply. We still persist sync_records
        // so the admin UI can preview a hypothetical apply.
        if (opts.mode === "dry_run") {
            await (0, storage_1.updateRunStatus)(run.id, {
                status: "succeeded",
                recordsSeen: foundation.fetched,
                recordsCreated: diffCounts.created,
                recordsUpdated: diffCounts.updated,
                recordsDeleted: diffCounts.deleted,
                recordsQuarantined: foundation.quarantined.length,
                durationMs: foundation.durationMs,
            });
            return {
                runId: run.id,
                correlationId,
                foundation,
                diff: diffCounts,
                apply: {
                    createdCount: 0,
                    updatedCount: 0,
                    unchangedCount: diffCounts.unchanged,
                    deletedCount: 0,
                    changeLogCount: 0,
                    createdAgencyIds: [],
                    updatedAgencyIds: [],
                    deletedAgencyIds: [],
                },
                status: "succeeded",
            };
        }
        // ── 6. Apply (transactional) ────────────────────────────────────────────
        const apply = await (0, apply_1.applyChangeSet)(changes, {
            providerId,
            runId: run.id,
            performedBy: opts.triggeredBy,
            reason: opts.reason ?? null,
        }, foundation.validated, foundation.quarantined, foundation.normalizerVersion);
        // ── 7. Close the run successfully ──────────────────────────────────────
        await (0, storage_1.updateRunStatus)(run.id, {
            status: "succeeded",
            recordsSeen: foundation.fetched,
            recordsCreated: apply.createdCount,
            recordsUpdated: apply.updatedCount,
            recordsDeleted: apply.deletedCount,
            recordsQuarantined: foundation.quarantined.length,
            durationMs: foundation.durationMs,
        });
        // Stamp last_successful_run_at on the provider so the freshness watchdog
        // sees recent activity. Non-fatal if it fails.
        await markProviderSuccessful(providerId).catch((err) => {
            console.warn(`[sync] markProviderSuccessful failed (non-fatal):`, err?.message);
        });
        return {
            runId: run.id,
            correlationId,
            foundation,
            diff: diffCounts,
            apply,
            status: "succeeded",
        };
    }
    catch (err) {
        // ── Failure path: close the run with status=failed + error message ─────
        const message = err?.message ?? String(err);
        await (0, storage_1.updateRunStatus)(run.id, {
            status: "failed",
            errorMessage: message,
        }).catch(() => { });
        return {
            runId: run.id,
            correlationId,
            foundation: makeEmptyFoundationResult(provider.slug, correlationId),
            diff: { created: 0, updated: 0, unchanged: 0, deleted: 0, total: 0 },
            apply: {
                createdCount: 0, updatedCount: 0, unchangedCount: 0, deletedCount: 0,
                changeLogCount: 0, createdAgencyIds: [], updatedAgencyIds: [], deletedAgencyIds: [],
            },
            status: "failed",
            errorMessage: message,
        };
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────
async function markProviderSuccessful(providerId) {
    const { pool } = await Promise.resolve().then(() => __importStar(require("../db")));
    await pool.query(`UPDATE sync_providers
        SET last_successful_run_at = NOW(),
            health = CASE WHEN health = 'broken' THEN 'degraded' ELSE 'healthy' END,
            updated_at = NOW()
      WHERE id = $1`, [providerId]);
}
function makeEmptyFoundationResult(slug, correlationId) {
    return {
        correlationId,
        providerSlug: slug,
        fetched: 0,
        validated: [],
        quarantined: [],
        fingerprintsByLicense: new Map(),
        durationMs: 0,
        stageDurations: { rawImport: 0, fetch: 0, normalize: 0, validate: 0, fingerprint: 0 },
        normalizerVersion: "",
        fingerprintVersion: 0,
    };
}
