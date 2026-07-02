"use strict";
/**
 * Sync Engine — Shadow Mode (RC1, Priority 6).
 *
 * Runs the entire RC1 lifecycle against a real provider EXCEPT the
 * writes to nea_agencies and agency_change_log. The atomic block still
 * happens (we want the sync_records, sync_events, sync_snapshots, and
 * sync_runs entries — they're how we observe what would have happened),
 * but the actual mutations to canonical agency tables are skipped.
 *
 * Why shadow mode?
 *
 *   1. Validate a new adapter without touching production data. Run it
 *      shadow for a week. Inspect the diff. Inspect the events. Only
 *      promote to real once the metrics are right.
 *
 *   2. Catch normalizer regressions: same source, two pipelines (shadow
 *      runs the new code, regular runs run the old code). Compare diffs.
 *
 *   3. Pre-flight a config change (e.g. tightened validation) and see
 *      how many records would now quarantine.
 *
 * Implementation:
 *
 *   The RC1 runner already accepts an `isShadow` flag. When true, the
 *   atomic block:
 *     • still captures the snapshot
 *     • still emits SynchronizationStarted/Completed events
 *     • still writes sync_records (the raw + validated + quarantined audit)
 *     • SKIPS applyChangeSetCore — no nea_agencies / change_log writes
 *     • SKIPS the Agency* lifecycle events (would be misleading; we
 *       didn't actually create/update/remove anyone)
 *     • tags sync_runs.is_shadow = true so the dashboard can filter
 *
 *   This module exists for two things on top of that:
 *     • the `runShadowSync` convenience entry point that sets the flag
 *     • the `generateShadowVerificationReport` analyzer that produces
 *       the structured comparison admins want to see
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHADOW_VERIFICATION_REPORT_VERSION = void 0;
exports.runShadowSync = runShadowSync;
exports.generateShadowVerificationReport = generateShadowVerificationReport;
exports.dryComparison = dryComparison;
const node_crypto_1 = __importDefault(require("node:crypto"));
const diff_1 = require("./diff");
const safety_1 = require("./safety");
const schema_drift_1 = require("./schema-drift");
const confidence_1 = require("./confidence");
const sync_runner_rc1_1 = require("./sync-runner-rc1");
const storage_1 = require("./storage");
const engine_1 = require("./engine");
// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────
exports.SHADOW_VERIFICATION_REPORT_VERSION = 1;
// ─────────────────────────────────────────────────────────────────────────────
// runShadowSync — convenience wrapper around runSyncRc1 with isShadow=true
// ─────────────────────────────────────────────────────────────────────────────
async function runShadowSync(provider, opts) {
    return (0, sync_runner_rc1_1.runSyncRc1)(provider, {
        ...opts,
        mode: opts.mode ?? "manual",
        isShadow: true,
    });
}
// ─────────────────────────────────────────────────────────────────────────────
// generateShadowVerificationReport — pure analyzer over a finished run
// ─────────────────────────────────────────────────────────────────────────────
function generateShadowVerificationReport(result, providerSlug) {
    const f = result.foundation;
    const safety = result.safety;
    const quality = result.qualityReport;
    const recommendation = pickRecommendation(result);
    const reasonNotes = [];
    if (safety.holdRun) {
        reasonNotes.push(`Safety gate would have HELD: ${safety.holdReason ?? "ceiling exceeded"}.`);
    }
    if (quality.totals.quarantined / Math.max(1, quality.totals.fetched) > 0.1) {
        reasonNotes.push(`Quarantine rate ${quality.quarantine.ratePct}% exceeds 10% threshold.`);
    }
    if (result.diff.deleted / Math.max(1, f.fetched) > 0.05) {
        reasonNotes.push(`Would delete ${result.diff.deleted} records (>5% of fetched).`);
    }
    if (reasonNotes.length === 0) {
        reasonNotes.push("Shadow run was clean within all configured thresholds.");
    }
    // The confidence score requires drift + health. The runner already
    // computed health internally (via runHealthCheck before opening the
    // run); we use a healthy default for the report since shadow runs
    // never start unless the provider passed the start-time health gate.
    const confidenceFromQuality = (0, confidence_1.computeConfidenceScore)({
        quality,
        safety,
        drift: null, // generated separately by the runner's drift step
        health: { status: "healthy", message: "shadow", checkedAt: new Date().toISOString() },
        durationMs: f.durationMs,
        expectedDurationMs: null,
    });
    return {
        version: exports.SHADOW_VERIFICATION_REPORT_VERSION,
        shadowRunId: result.runId,
        providerSlug,
        safety: {
            held: safety.holdRun,
            anomalyScore: safety.anomalyScore,
            anomalyCount: safety.anomalies.length,
            holdReason: safety.holdReason ?? null,
        },
        changeMagnitude: {
            fetched: f.fetched,
            created: result.diff.created,
            updated: result.diff.updated,
            deleted: result.diff.deleted,
            unchanged: result.diff.unchanged,
            quarantined: f.quarantined.length,
        },
        drift: {
            // We don't have the drift report inside RunSyncRc1Result yet —
            // until the RC1 runner is extended to include it, callers pass in
            // the canonical drift findings via the runner's persisted JSONB
            // column. For the report consumer, we surface "unknown" as
            // "matchesPrior=false, 0 findings, severity=null" — meaning the
            // dashboard will fall back to the quality report.
            matchesPrior: false,
            findingsCount: 0,
            worstSeverity: null,
        },
        confidence: {
            score: confidenceFromQuality.score,
            grade: confidenceFromQuality.grade,
            topDeductions: confidenceFromQuality.topDeductions,
        },
        recommendation,
        reasonNotes,
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// Recommendation heuristic
// ─────────────────────────────────────────────────────────────────────────────
function pickRecommendation(r) {
    if (r.safety.holdRun)
        return "do_not_promote";
    if (r.status === "failed")
        return "do_not_promote";
    const quarRate = r.qualityReport.quarantine.ratePct ?? 0;
    if (quarRate >= 15)
        return "do_not_promote";
    if (quarRate >= 5)
        return "investigate_then_retry";
    // Mass-delete sniff: more than 30% of current world disappeared.
    if (r.diff.deleted > 0 && r.foundation.fetched > 0) {
        const deleteRatio = r.diff.deleted / Math.max(1, r.foundation.fetched);
        if (deleteRatio >= 0.3)
            return "do_not_promote";
        if (deleteRatio >= 0.1)
            return "investigate_then_retry";
    }
    return "promote_to_live";
}
async function dryComparison(provider) {
    const providerId = await (0, storage_1.getProviderIdBySlug)(provider.slug);
    if (!providerId)
        throw new Error(`[shadow.dryComparison] provider not registered: ${provider.slug}`);
    // We deliberately use the foundation pipeline directly — no runs row,
    // no events, no snapshot. This is a "look but don't touch" probe.
    const correlationId = node_crypto_1.default.randomUUID();
    const foundation = await (0, engine_1.runFoundation)(provider, { correlationId });
    const current = await (0, storage_1.readCurrentAgenciesByProvider)(providerId);
    const changes = (0, diff_1.computeDiff)(current, foundation.validated);
    const counts = (0, diff_1.countChanges)(changes);
    const safety = (0, safety_1.evaluateSafety)({
        changes,
        counts,
        fetchedCount: foundation.fetched,
        quarantinedCount: foundation.quarantined.length,
        currentCount: current.size,
    });
    // Drift — load prior signature, sign current raw
    const priorSig = await (0, schema_drift_1.loadPriorSignature)(provider.slug);
    const rawSample = foundation.validated.map((v) => v.raw)
        .concat(foundation.quarantined.map((q) => q.raw));
    const drift = (0, schema_drift_1.detectSchemaDrift)({
        providerSlug: provider.slug,
        rawSample,
        priorSignature: priorSig,
    });
    return {
        providerSlug: provider.slug,
        fetched: foundation.fetched,
        quarantined: foundation.quarantined.length,
        diffCounts: {
            created: counts.created,
            updated: counts.updated,
            deleted: counts.deleted,
            unchanged: counts.unchanged,
        },
        safetyHeld: safety.holdRun,
        driftFindings: drift.findings.length,
    };
}
