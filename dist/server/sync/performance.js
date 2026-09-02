"use strict";
/**
 * Sync Engine — Performance Validation (RC1, Priority 7).
 *
 * A lightweight, pure-function timing instrument that the RC1 runner
 * uses to record how long each phase took. The result is a structured
 * report saved to `sync_runs.performance_report` (jsonb) so the dev
 * dashboard can plot it, and so the confidence score can dock points
 * for runs that exceed the expected duration.
 *
 * Why not use process.hrtime everywhere?
 *
 *   We do — but routing every Date.now / hrtime call through a tiny
 *   instrument gives us:
 *     • a uniform shape per phase (start, end, duration, error)
 *     • a guaranteed phase set that always reaches the dashboard
 *     • a no-op `withPhase` wrapper for code paths that don't care
 *     • easy serialization to JSONB without leaking BigInt or
 *       monotonic-clock weirdness across machines
 *
 * Phases tracked:
 *
 *   - health_check       : runHealthCheck duration
 *   - fetch              : foundation pipeline raw fetch (yields)
 *   - normalize          : foundation pipeline normalize loop
 *   - validate           : foundation pipeline validation loop
 *   - fingerprint        : foundation pipeline fingerprint loop
 *   - drift_detection    : detectSchemaDrift
 *   - read_current       : readCurrentAgenciesByProvider
 *   - diff               : computeDiff
 *   - safety_evaluation  : evaluateSafety
 *   - quality_report     : generateDataQualityReport
 *   - apply_transaction  : the whole RC1 atomic block
 *   - persist_signature  : persistCurrentSignature post-COMMIT
 *
 * Not every runner exercises every phase (held → skips apply portion of
 * the transaction). The report records the phases that ran.
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
exports.PerformanceRecorder = exports.PERFORMANCE_REPORT_VERSION = void 0;
exports.loadPerformanceBaseline = loadPerformanceBaseline;
// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────
exports.PERFORMANCE_REPORT_VERSION = 1;
// ─────────────────────────────────────────────────────────────────────────────
// PerformanceRecorder — collects phase timings; passed through the runner
// ─────────────────────────────────────────────────────────────────────────────
class PerformanceRecorder {
    constructor() {
        this.timings = [];
        this.t0 = Date.now();
        this.hr0 = process.hrtime.bigint();
    }
    /**
     * Time a synchronous or async function. Records the duration whether
     * or not the wrapped function throws. The thrown error is re-thrown
     * after recording so callers see normal exception flow.
     */
    async withPhase(phase, fn) {
        const startedAt = Date.now();
        const start = process.hrtime.bigint();
        try {
            const result = await fn();
            this.timings.push({
                phase,
                startedAt,
                durationMs: nsToMs(process.hrtime.bigint() - start),
            });
            return result;
        }
        catch (err) {
            this.timings.push({
                phase,
                startedAt,
                durationMs: nsToMs(process.hrtime.bigint() - start),
                errorMessage: err?.message ?? String(err),
            });
            throw err;
        }
    }
    /**
     * Manual mode for code paths that can't use the wrapper (e.g. inside
     * a streaming generator). Caller commits the timing when done.
     */
    begin(phase) {
        const startedAt = Date.now();
        const start = process.hrtime.bigint();
        return {
            commit: (errorMessage) => {
                this.timings.push({
                    phase,
                    startedAt,
                    durationMs: nsToMs(process.hrtime.bigint() - start),
                    errorMessage,
                });
            },
        };
    }
    /** Finalize into a serializable report. */
    finalize(opts = {}) {
        const totalMs = nsToMs(process.hrtime.bigint() - this.hr0);
        const atomicBlockMs = this.timings
            .filter((t) => t.phase === "apply_transaction")
            .reduce((acc, t) => acc + t.durationMs, 0);
        const expectedMs = opts.expectedMs ?? null;
        return {
            version: exports.PERFORMANCE_REPORT_VERSION,
            totalMs,
            phases: this.timings,
            atomicBlockMs,
            exceedsExpected: expectedMs !== null && totalMs > expectedMs * 2,
            expectedMs,
        };
    }
}
exports.PerformanceRecorder = PerformanceRecorder;
function nsToMs(ns) {
    // 1ns = 1e-6 ms; downcast through Number is safe within run-length windows.
    return Number(ns) / 1000000;
}
/** Pulls the last N successful (non-shadow) runs and computes p50/p95. */
async function loadPerformanceBaseline(providerSlug, n = 20) {
    const { pool } = await Promise.resolve().then(() => __importStar(require("../db")));
    const { rows } = await pool.query(`SELECT performance_report
       FROM sync_runs r
       JOIN sync_providers p ON p.id = r.provider_id
      WHERE p.slug = $1
        AND r.status = 'succeeded'
        AND COALESCE(r.is_shadow, FALSE) = FALSE
        AND r.performance_report IS NOT NULL
      ORDER BY r.finished_at DESC
      LIMIT $2`, [providerSlug, n]);
    const totals = rows.map((r) => r.performance_report?.totalMs ?? 0).filter((n) => n > 0);
    const atomic = rows.map((r) => r.performance_report?.atomicBlockMs ?? 0).filter((n) => n > 0);
    return {
        providerSlug,
        sampleSize: totals.length,
        totalMsP50: percentile(totals, 50),
        totalMsP95: percentile(totals, 95),
        atomicBlockMsP50: percentile(atomic, 50),
        atomicBlockMsP95: percentile(atomic, 95),
    };
}
function percentile(samples, p) {
    if (samples.length === 0)
        return null;
    const sorted = [...samples].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return Math.round(sorted[idx]);
}
