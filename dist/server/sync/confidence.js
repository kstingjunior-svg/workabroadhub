"use strict";
/**
 * Sync Engine — Synchronization Confidence Score (RC1, Priority 4).
 *
 * Produces a single 0–100 number + letter grade (A/B/C/D/F) summarizing
 * how much an operator should trust the outcome of a given run. The
 * intent is "one glanceable signal" for the dashboard and digest.
 *
 * Inputs are deliberately broad — quality report, safety verdict, schema
 * drift, health, performance — and the scoring is documented so the
 * operator can predict the grade from the underlying numbers.
 *
 * **Why not just use the safety score?**
 *   The safety score answers "should we hold?". The confidence score
 *   answers "should we trust?". A run can pass the safety gate but still
 *   have, say, 30% quarantine and a new field appearing upstream — that
 *   should grade B-, not A.
 *
 * **Determinism:**
 *   This is a PURE function. Same inputs → same score. The weighting
 *   constants are exported so tests + the dashboard can show the
 *   contributing factors.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONFIDENCE_WEIGHTS = exports.CONFIDENCE_SCORE_VERSION = void 0;
exports.computeConfidenceScore = computeConfidenceScore;
exports.gradeFor = gradeFor;
// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────
exports.CONFIDENCE_SCORE_VERSION = 1;
// ─────────────────────────────────────────────────────────────────────────────
// Weights
//
// Picked so that, in a baseline good run (no quarantine, no drift, no
// safety anomalies, healthy provider, fast), you score 100. Each factor
// contributes its (score × weight). Tunable but versioned.
// ─────────────────────────────────────────────────────────────────────────────
exports.CONFIDENCE_WEIGHTS = {
    validity: 0.30, // fraction of records that passed validation
    driftPenalty: 0.20, // structural drift findings
    safetyGate: 0.20, // anomalies + hold decision
    changeRatio: 0.10, // change magnitude vs baseline expectation
    health: 0.10, // provider health state
    performance: 0.10, // duration p95 vs expectation
};
// ─────────────────────────────────────────────────────────────────────────────
// computeConfidenceScore
// ─────────────────────────────────────────────────────────────────────────────
function computeConfidenceScore(opts) {
    const factors = [];
    // ── Factor 1: validity (quarantine rate inverse) ───────────────────────
    {
        const quarRate = opts.quality.totals.fetched === 0
            ? 0
            : opts.quality.totals.quarantined / opts.quality.totals.fetched;
        const score = clamp(100 - quarRate * 200, 0, 100); // 50% quar → 0; 0% → 100
        factors.push({
            key: "validity",
            label: "Validity (validated / fetched)",
            score: round(score),
            weight: exports.CONFIDENCE_WEIGHTS.validity,
            notes: `${opts.quality.totals.quarantined}/${opts.quality.totals.fetched} quarantined`,
        });
    }
    // ── Factor 2: drift penalty ─────────────────────────────────────────────
    {
        let score = 100;
        let notes = "No prior signature";
        if (opts.drift) {
            if (opts.drift.matchesPrior) {
                score = 100;
                notes = "Signature matches prior run";
            }
            else {
                // Sum severity-weighted deductions, cap at 100.
                let deduction = 0;
                for (const f of opts.drift.findings) {
                    if (f.severity === "critical")
                        deduction += 30;
                    else if (f.severity === "warning")
                        deduction += 12;
                    else
                        deduction += 3;
                }
                score = clamp(100 - deduction, 0, 100);
                notes = `${opts.drift.findings.length} findings (worst: ${opts.drift.worstSeverity ?? "none"})`;
            }
        }
        factors.push({
            key: "driftPenalty",
            label: "Schema drift findings",
            score: round(score),
            weight: exports.CONFIDENCE_WEIGHTS.driftPenalty,
            notes,
        });
    }
    // ── Factor 3: safety gate (anomaly score inverse + hold = 0) ────────────
    {
        let score;
        let notes;
        if (opts.safety.holdRun) {
            score = 0;
            notes = `HELD — ${opts.safety.holdReason ?? "anomaly ceiling exceeded"}`;
        }
        else {
            // anomalyScore is 0..N (N = sum of all triggered anomaly severities).
            // We cap the deduction at 100 so the factor stays bounded.
            score = clamp(100 - opts.safety.anomalyScore, 0, 100);
            notes = `Anomaly score ${opts.safety.anomalyScore}; ${opts.safety.anomalies.length} anomalies`;
        }
        factors.push({
            key: "safetyGate",
            label: "Safety gate (anomalies)",
            score: round(score),
            weight: exports.CONFIDENCE_WEIGHTS.safetyGate,
            notes,
        });
    }
    // ── Factor 4: change ratio (extreme creates/deletes = lower confidence) ─
    {
        const totals = opts.quality.totals;
        const denom = totals.fetched || 1;
        const changeRatio = (totals.created + totals.deleted) / denom; // 0..1+
        // 0% change = 100; ≥40% change = 0. Linear in between.
        const score = clamp(100 - changeRatio * 250, 0, 100);
        factors.push({
            key: "changeRatio",
            label: "Change magnitude",
            score: round(score),
            weight: exports.CONFIDENCE_WEIGHTS.changeRatio,
            notes: `${totals.created} created + ${totals.deleted} deleted of ${denom}`,
        });
    }
    // ── Factor 5: provider health ───────────────────────────────────────────
    {
        const s = opts.health.status;
        const score = s === "healthy" ? 100 :
            s === "degraded" ? 50 :
                0;
        factors.push({
            key: "health",
            label: "Provider health",
            score,
            weight: exports.CONFIDENCE_WEIGHTS.health,
            notes: `status=${s}`,
        });
    }
    // ── Factor 6: performance vs expected ──────────────────────────────────
    {
        let score = 100;
        let notes = "No prior baseline";
        if (opts.expectedDurationMs && opts.expectedDurationMs > 0) {
            const ratio = opts.durationMs / opts.expectedDurationMs;
            // 1.0× → 100; 2.0× → 50; 4.0× → 0.
            score = clamp(100 - Math.max(0, (ratio - 1) * 50), 0, 100);
            notes = `${opts.durationMs}ms vs expected ${opts.expectedDurationMs}ms (${ratio.toFixed(2)}×)`;
        }
        factors.push({
            key: "performance",
            label: "Performance vs baseline",
            score: round(score),
            weight: exports.CONFIDENCE_WEIGHTS.performance,
            notes,
        });
    }
    // ── Composite ───────────────────────────────────────────────────────────
    const composite = factors.reduce((acc, f) => acc + f.score * f.weight, 0);
    const score = clamp(round(composite), 0, 100);
    const grade = gradeFor(score);
    // Top three deductions = three factors with the largest (weight × (100-score)).
    const topDeductions = factors
        .map((f) => ({ f, lost: f.weight * (100 - f.score) }))
        .filter((x) => x.lost > 0)
        .sort((a, b) => b.lost - a.lost)
        .slice(0, 3)
        .map((x) => `${x.f.label}: ${x.f.notes}`);
    return {
        version: exports.CONFIDENCE_SCORE_VERSION,
        score,
        grade,
        factors,
        topDeductions,
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// Letter grade thresholds.
//
// Picked so a "clean run with one new field added" lands B+, a held run
// lands F, a quarantine-heavy run lands D. Tunable but versioned with
// CONFIDENCE_SCORE_VERSION.
// ─────────────────────────────────────────────────────────────────────────────
function gradeFor(score) {
    if (score >= 90)
        return "A";
    if (score >= 75)
        return "B";
    if (score >= 60)
        return "C";
    if (score >= 40)
        return "D";
    return "F";
}
function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
}
function round(n) {
    return Math.round(n);
}
