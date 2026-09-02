"use strict";
/**
 * Sync Engine — Schema Drift Detection (RC1, Priority 3).
 *
 * Compares the STRUCTURAL shape of an incoming provider payload against
 * the structural shape recorded on the last successful run for the same
 * provider. The goal is to catch upstream surprises BEFORE we normalize:
 *
 *   - Provider added a new field we now ignore (silent data loss).
 *   - Provider removed a field we relied on (downstream nulls).
 *   - Provider changed a field's value type (string → number, etc.).
 *   - Provider re-cased a field name ("license_number" → "licenseNumber").
 *
 * The detector is intentionally provider-agnostic. It samples up to
 * SAMPLE_SIZE raw records, builds a key→type signature, then diffs that
 * signature against the persisted one. The persisted signature lives on
 * `sync_providers.last_schema_signature` and is only updated AFTER a
 * successful run — drift comparisons are always against the last known
 * good state, never against a partial run.
 *
 * The detector does NOT block the run. It produces a `SchemaDriftReport`
 * which gets attached to `sync_runs.schema_drift_report` and consulted
 * by the Confidence Score (P4) and the safety gate (already covered by
 * `evaluateSafety` via the quarantined-record path).
 *
 * Performance note: the signature is O(SAMPLE_SIZE × keys × types). For
 * NEA-KE this is ~50 × 8 × 3 = 1200 op-equivalents — under 5ms.
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
exports.SAMPLE_SIZE = exports.SCHEMA_DRIFT_REPORT_VERSION = void 0;
exports.signSchema = signSchema;
exports.detectSchemaDrift = detectSchemaDrift;
exports.loadPriorSignature = loadPriorSignature;
exports.persistCurrentSignature = persistCurrentSignature;
// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────
/** Version of the drift report shape. Bumped on breaking format changes. */
exports.SCHEMA_DRIFT_REPORT_VERSION = 1;
/** Number of raw records to sample. Sufficient for top-level field detection. */
exports.SAMPLE_SIZE = 100;
// ─────────────────────────────────────────────────────────────────────────────
// signSchema — build a SchemaSignature from raw records
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Walks the first `sampleSize` records of `raw` and accumulates per-key
 * type histograms. Only top-level keys are examined; nested objects are
 * summarized as `"object"` and arrays as `"array"`. This is intentional:
 * deep diffing is high-noise and low-signal for the schema-drift use
 * case (which is "did the wire format change shape?").
 */
function signSchema(raw, sampleSize = exports.SAMPLE_SIZE) {
    const sample = raw.slice(0, Math.max(0, sampleSize));
    const N = sample.length;
    const byKey = {};
    const presenceCount = {};
    const nullCount = {};
    for (const r of sample) {
        if (r === null || r === undefined || typeof r !== "object")
            continue;
        for (const [k, v] of Object.entries(r)) {
            const t = classifyType(v);
            const stat = (byKey[k] ?? (byKey[k] = emptyKeyStat(k)));
            stat.typeHistogram[t] = (stat.typeHistogram[t] ?? 0) + 1;
            presenceCount[k] = (presenceCount[k] ?? 0) + 1;
            if (v === null)
                nullCount[k] = (nullCount[k] ?? 0) + 1;
        }
    }
    // Compute mode + presence + nullShare per key.
    for (const k of Object.keys(byKey)) {
        const stat = byKey[k];
        let modeType = "undefined";
        let modeCount = -1;
        for (const [t, c] of Object.entries(stat.typeHistogram)) {
            if (c > modeCount) {
                modeCount = c;
                modeType = t;
            }
        }
        stat.modeType = modeType;
        stat.presencePct = N === 0 ? 0 : round2((presenceCount[k] / N) * 100);
        const present = presenceCount[k] ?? 0;
        stat.nullSharePct = present === 0 ? 0 : round2(((nullCount[k] ?? 0) / present) * 100);
    }
    const keys = Object.keys(byKey).sort();
    const hash = hashSignature(keys, byKey);
    return {
        version: exports.SCHEMA_DRIFT_REPORT_VERSION,
        sampleSize: N,
        keys,
        byKey,
        hash,
    };
}
function detectSchemaDrift(opts) {
    const current = signSchema(opts.rawSample);
    // First-ever run: nothing to compare against. Report current shape only.
    if (!opts.priorSignature) {
        return {
            version: exports.SCHEMA_DRIFT_REPORT_VERSION,
            providerSlug: opts.providerSlug,
            current,
            prior: null,
            findings: [],
            matchesPrior: false,
            worstSeverity: null,
        };
    }
    const prior = opts.priorSignature;
    const findings = [];
    const dropThr = opts.presenceDropThresholdPp ?? 25;
    // Build lowercase-key index once so we can detect case_changed cheaply.
    const priorByLower = new Map();
    for (const k of prior.keys)
        priorByLower.set(k.toLowerCase(), k);
    const currentByLower = new Map();
    for (const k of current.keys)
        currentByLower.set(k.toLowerCase(), k);
    // Detect case_changed PAIRS first, so we don't double-flag a single
    // re-cased key as both "removed (oldCase)" and "added (newCase)".
    const caseChanges = new Set();
    for (const k of current.keys) {
        const lower = k.toLowerCase();
        const priorMatch = priorByLower.get(lower);
        if (priorMatch && priorMatch !== k) {
            findings.push({
                kind: "case_changed",
                key: k,
                priorKey: priorMatch,
                message: `Provider re-cased "${priorMatch}" → "${k}". Normalizer may need an alias.`,
                severity: "warning",
            });
            caseChanges.add(k);
            caseChanges.add(priorMatch);
        }
    }
    // key_added
    for (const k of current.keys) {
        if (caseChanges.has(k))
            continue;
        if (!prior.byKey[k]) {
            findings.push({
                kind: "key_added",
                key: k,
                message: `New field "${k}" appeared in upstream. May contain data we now ignore.`,
                severity: "info",
            });
        }
    }
    // key_removed
    for (const k of prior.keys) {
        if (caseChanges.has(k))
            continue;
        if (!current.byKey[k]) {
            findings.push({
                kind: "key_removed",
                key: k,
                message: `Field "${k}" disappeared from upstream. Downstream may now see nulls.`,
                severity: "critical",
            });
        }
    }
    // type_changed + presence_dropped
    for (const k of current.keys) {
        if (caseChanges.has(k))
            continue;
        const p = prior.byKey[k];
        if (!p)
            continue;
        const c = current.byKey[k];
        if (c.modeType !== p.modeType && c.modeType !== "undefined" && p.modeType !== "undefined") {
            findings.push({
                kind: "type_changed",
                key: k,
                fromType: p.modeType,
                toType: c.modeType,
                message: `Field "${k}" type drifted ${p.modeType} → ${c.modeType}. Normalizer may misread values.`,
                severity: "critical",
            });
        }
        if (p.presencePct - c.presencePct >= dropThr) {
            findings.push({
                kind: "presence_dropped",
                key: k,
                fromPresencePct: p.presencePct,
                toPresencePct: c.presencePct,
                message: `Field "${k}" presence fell ${p.presencePct}% → ${c.presencePct}% (≥${dropThr}pp drop).`,
                severity: "warning",
            });
        }
    }
    // Compute aggregate worst severity.
    let worst = null;
    for (const f of findings) {
        if (f.severity === "critical") {
            worst = "critical";
            break;
        }
        if (f.severity === "warning")
            worst = "warning";
        else if (!worst)
            worst = "info";
    }
    return {
        version: exports.SCHEMA_DRIFT_REPORT_VERSION,
        providerSlug: opts.providerSlug,
        current,
        prior,
        findings,
        matchesPrior: current.hash === prior.hash,
        worstSeverity: worst,
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// Persistence helpers — update last_schema_signature on success only
// ─────────────────────────────────────────────────────────────────────────────
async function loadPriorSignature(providerSlug) {
    const { pool } = await Promise.resolve().then(() => __importStar(require("../db")));
    const { rows } = await pool.query(`SELECT last_schema_signature FROM sync_providers WHERE slug = $1 LIMIT 1`, [providerSlug]);
    return rows[0]?.last_schema_signature ?? null;
}
/**
 * Persist the current signature as the new baseline. Called ONLY after
 * a successful, non-shadow, non-dry-run run that did not hit the safety
 * gate. The RC1 runner invokes this AFTER its main atomic COMMIT — by
 * design, the baseline only advances when a real successful write
 * landed for the operator.
 */
async function persistCurrentSignature(providerSlug, sig) {
    const { pool } = await Promise.resolve().then(() => __importStar(require("../db")));
    await pool.query(`UPDATE sync_providers SET last_schema_signature = $2::jsonb WHERE slug = $1`, [providerSlug, JSON.stringify(sig)]);
}
// ─────────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────────
function classifyType(v) {
    if (v === null)
        return "null";
    if (v === undefined)
        return "undefined";
    if (Array.isArray(v))
        return "array";
    const t = typeof v;
    if (t === "object")
        return "object";
    if (t === "string")
        return "string";
    if (t === "number")
        return "number";
    if (t === "boolean")
        return "boolean";
    return "undefined";
}
function emptyKeyStat(key) {
    return {
        key,
        typeHistogram: {
            string: 0, number: 0, boolean: 0, null: 0,
            array: 0, object: 0, undefined: 0,
        },
        modeType: "undefined",
        presencePct: 0,
        nullSharePct: 0,
    };
}
function hashSignature(keys, byKey) {
    // sha-256 of a deterministic canonical form: "key:modeType|key:modeType|..."
    // (presence is intentionally excluded so a small data shift doesn't flip
    // the hash; type changes do, which is what we care about for equality.)
    const canonical = keys.map((k) => `${k}:${byKey[k].modeType}`).join("|");
    // Sync crypto so this can run in pure-function paths (no async).
    const { createHash } = require("node:crypto");
    return createHash("sha256").update(canonical).digest("hex");
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
