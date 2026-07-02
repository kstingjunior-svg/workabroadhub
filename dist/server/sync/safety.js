"use strict";
/**
 * Sync Engine — Safety Gate + Anomaly Detection (Milestone 3).
 *
 * Pure function. Takes a ChangeSet plus optional prior-run statistics and
 * provider-specific thresholds, produces a SafetyVerdict.
 *
 * Per SRS §9 FR-9 + §15: the engine refuses to apply a run whose net
 * change exceeds configured safety thresholds. Held runs stay in
 * `status='held_for_review'` until an admin approves or rejects.
 *
 * Architectural decisions:
 *
 *   1. **Evaluation is pure**. No DB I/O, no logging. Inputs are explicit;
 *      output is a verdict + a list of structured Anomaly objects.
 *      Persistence (sync_anomalies rows, event emission, sync_runs status
 *      update) happens in the caller (sync-runner).
 *
 *   2. **Thresholds are config-driven per provider.** Defaults come from
 *      SRS §35; per-provider config in `sync_providers.config` can
 *      override. A provider with predictably-volatile data (e.g. a
 *      government registry doing a yearly bulk cleanup) tunes itself.
 *
 *   3. **Anomaly score is 0–100.** Each detected anomaly contributes to
 *      the score weighted by severity. Above a per-provider ceiling the
 *      run is held. The numeric score is mostly for dashboards; the
 *      `holdRun` boolean is what gates Apply.
 *
 *   4. **Anomalies carry a 10-row sample.** Spec §35 — admin needs to
 *      see WHICH rows look problematic without paging through every
 *      record. Samples are deterministic (first-N) so re-evaluating
 *      the same input yields the same Anomaly list.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SAFETY_CONFIG = void 0;
exports.evaluateSafety = evaluateSafety;
exports.DEFAULT_SAFETY_CONFIG = {
    deletePct: 20,
    updatePct: 50,
    validationFailurePct: 5,
    lowRecordCountPct: 80,
    scoreCeiling: 70,
};
// ─────────────────────────────────────────────────────────────────────────────
// evaluateSafety
// ─────────────────────────────────────────────────────────────────────────────
const SEVERITY_WEIGHTS = {
    info: 10,
    warn: 35,
    critical: 60,
};
function evaluateSafety(input) {
    const cfg = { ...exports.DEFAULT_SAFETY_CONFIG, ...input.config };
    const anomalies = [];
    // ── 1. mass_delete ──────────────────────────────────────────────────────
    // Only meaningful when there's a baseline; if the DB is empty, deletes
    // can't happen anyway.
    if (input.currentCount > 0) {
        const deletePct = (input.counts.deleted / input.currentCount) * 100;
        if (deletePct > cfg.deletePct) {
            anomalies.push({
                type: "mass_delete",
                severity: deletePct > cfg.deletePct * 2 ? "critical" : "warn",
                metricValue: round2(deletePct),
                threshold: cfg.deletePct,
                message: `${input.counts.deleted} of ${input.currentCount} rows ` +
                    `(${round2(deletePct)}%) absent from source — threshold is ${cfg.deletePct}%.`,
                sampleData: input.changes.deleted.slice(0, 10).map((d) => ({
                    licenseNumber: d.licenseNumber,
                    agencyName: d.before.agencyName,
                })),
            });
        }
    }
    // ── 2. mass_update ──────────────────────────────────────────────────────
    if (input.currentCount > 0) {
        const updatePct = (input.counts.updated / input.currentCount) * 100;
        if (updatePct > cfg.updatePct) {
            anomalies.push({
                type: "mass_update",
                severity: updatePct > cfg.updatePct * 1.5 ? "critical" : "warn",
                metricValue: round2(updatePct),
                threshold: cfg.updatePct,
                message: `${input.counts.updated} of ${input.currentCount} rows ` +
                    `(${round2(updatePct)}%) changed in one run — threshold is ${cfg.updatePct}%.`,
                sampleData: input.changes.updated.slice(0, 10).map((u) => ({
                    licenseNumber: u.licenseNumber,
                    fieldChanges: Object.keys(u.fieldChanges),
                })),
            });
        }
    }
    // ── 3. schema_drift (excessive validation failures) ────────────────────
    if (input.fetchedCount > 0) {
        const failPct = (input.quarantinedCount / input.fetchedCount) * 100;
        if (failPct > cfg.validationFailurePct) {
            anomalies.push({
                type: "schema_drift",
                severity: failPct > cfg.validationFailurePct * 3 ? "critical" : "warn",
                metricValue: round2(failPct),
                threshold: cfg.validationFailurePct,
                message: `${input.quarantinedCount} of ${input.fetchedCount} records ` +
                    `(${round2(failPct)}%) failed validation — threshold is ${cfg.validationFailurePct}%. ` +
                    `Possible upstream schema change.`,
                sampleData: [],
            });
        }
    }
    // ── 4. low_record_count (vs trend) ────────────────────────────────────
    if (input.recentFetchedCounts && input.recentFetchedCounts.length > 0) {
        const avg = mean(input.recentFetchedCounts);
        if (avg > 0) {
            const ratioPct = (input.fetchedCount / avg) * 100;
            if (ratioPct < cfg.lowRecordCountPct) {
                anomalies.push({
                    type: "low_record_count",
                    severity: ratioPct < cfg.lowRecordCountPct / 2 ? "critical" : "warn",
                    metricValue: round2(ratioPct),
                    threshold: cfg.lowRecordCountPct,
                    message: `Run returned ${input.fetchedCount} records vs ${round2(avg)}-record ` +
                        `recent average (${round2(ratioPct)}% of trend). Possible truncated source response.`,
                    sampleData: [],
                });
            }
        }
    }
    // ── 5. duplicate_fingerprints ────────────────────────────────────────
    // Within one run, two records sharing (licenseNumber, fingerprint) means
    // the adapter is yielding a record twice. The engine has already deduped
    // (last write wins), but the diagnostic is worth surfacing.
    const seenLic = new Set();
    let dupes = 0;
    for (const c of input.changes.created) {
        if (seenLic.has(c.licenseNumber))
            dupes++;
        else
            seenLic.add(c.licenseNumber);
    }
    for (const u of input.changes.updated) {
        if (seenLic.has(u.licenseNumber))
            dupes++;
        else
            seenLic.add(u.licenseNumber);
    }
    if (dupes > 0) {
        anomalies.push({
            type: "duplicate_fingerprints",
            severity: dupes > 10 ? "warn" : "info",
            metricValue: dupes,
            threshold: 0,
            message: `${dupes} duplicate licence number(s) observed within one run. Adapter is ` +
                `yielding the same record more than once — review provider pagination.`,
            sampleData: [],
        });
    }
    // ── Composite score + verdict ────────────────────────────────────────
    const anomalyScore = Math.min(100, anomalies.reduce((acc, a) => acc + SEVERITY_WEIGHTS[a.severity], 0));
    const holdRun = anomalyScore > cfg.scoreCeiling;
    const holdReason = holdRun
        ? `Anomaly score ${anomalyScore} > ceiling ${cfg.scoreCeiling}. Detected: ` +
            anomalies.map((a) => a.type).join(", ")
        : null;
    return { holdRun, anomalyScore, anomalies, holdReason };
}
// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function round2(n) {
    return Math.round(n * 100) / 100;
}
function mean(xs) {
    if (xs.length === 0)
        return 0;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
}
