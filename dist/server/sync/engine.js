"use strict";
/**
 * Sync Engine — foundation pipeline (Milestone 1).
 *
 * Pure orchestration: takes a SyncProvider, streams its records through
 * Raw Import → Normalize → Validate → Fingerprint, and returns a
 * structured FoundationRunResult. No DB writes, no Diff, no Apply,
 * no Snapshot — those arrive in later milestones (M2, M3).
 *
 * The pipeline is deterministic by design: given the same provider output
 * and the same FINGERPRINT_VERSION + NORMALIZER_VERSION, it always
 * produces the same result.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runFoundation = runFoundation;
const node_crypto_1 = __importDefault(require("node:crypto"));
const fingerprint_1 = require("./fingerprint");
const normalize_1 = require("./normalize");
const validation_1 = require("./validation");
/**
 * Run the foundation pipeline against a provider.
 */
async function runFoundation(provider, opts = {}) {
    const correlationId = opts.correlationId ?? node_crypto_1.default.randomUUID();
    const runStart = performance.now();
    let fetched = 0;
    let fetchMs = 0;
    let rawImportMs = 0;
    let normalizeMs = 0;
    let validateMs = 0;
    let fingerprintMs = 0;
    const validated = [];
    const quarantined = [];
    const fingerprintsByLicense = new Map();
    const pages = provider.fetchRecords({ limit: opts.limit, signal: opts.signal });
    for await (const page of pages) {
        if (opts.signal?.aborted) {
            throw new Error(`[sync-engine] aborted (correlationId=${correlationId})`);
        }
        fetched += page.length;
        const pageStart = performance.now();
        for (const raw of page) {
            const result = processOne(raw, provider);
            if (result.ok) {
                validated.push(result.validated);
                fingerprintsByLicense.set(result.validated.agency.licenseNumber, result.validated.fingerprint);
            }
            else {
                quarantined.push(result.quarantined);
            }
            rawImportMs += result.timings.rawImport;
            normalizeMs += result.timings.normalize;
            validateMs += result.timings.validate;
            fingerprintMs += result.timings.fingerprint;
        }
        fetchMs += performance.now() - pageStart - (rawImportMs + validateMs + normalizeMs + fingerprintMs);
    }
    const durationMs = Math.round(performance.now() - runStart);
    return {
        correlationId,
        providerSlug: provider.slug,
        fetched,
        validated,
        quarantined,
        fingerprintsByLicense,
        durationMs,
        stageDurations: {
            rawImport: Math.round(rawImportMs),
            fetch: Math.max(0, Math.round(fetchMs)),
            normalize: Math.round(normalizeMs),
            validate: Math.round(validateMs),
            fingerprint: Math.round(fingerprintMs),
        },
        normalizerVersion: normalize_1.NORMALIZER_VERSION,
        fingerprintVersion: fingerprint_1.FINGERPRINT_VERSION,
    };
}
function processOne(raw, provider) {
    const timings = { rawImport: 0, normalize: 0, validate: 0, fingerprint: 0 };
    // ── Raw Import (ADR-0002 / Improvement 1) ────────────────────────────────
    // Deep-clone the raw payload before anything else touches it.
    const rawStart = performance.now();
    const rawSnapshot = structuredClone(raw);
    timings.rawImport = performance.now() - rawStart;
    // ── Normalize ─────────────────────────────────────────────────────────────
    const normStart = performance.now();
    let normalized;
    try {
        normalized = provider.normalize(rawSnapshot);
    }
    catch (err) {
        timings.normalize = performance.now() - normStart;
        return {
            ok: false,
            quarantined: {
                raw: rawSnapshot,
                partial: null,
                reasons: [{
                        path: "(normalize)",
                        code: "invalid_format",
                        message: `Adapter normalize() threw: ${err?.message ?? String(err)}`,
                    }],
                normalizerVersion: null,
            },
            timings,
        };
    }
    timings.normalize = performance.now() - normStart;
    // ── Validate (provider-specific tightening, then base schema) ─────────────
    const validateStart = performance.now();
    if (provider.validate) {
        const providerCheck = provider.validate(normalized);
        if (!providerCheck.ok) {
            timings.validate = performance.now() - validateStart;
            return {
                ok: false,
                quarantined: {
                    raw: rawSnapshot, partial: normalized, reasons: providerCheck.reasons,
                    normalizerVersion: normalize_1.NORMALIZER_VERSION,
                },
                timings,
            };
        }
    }
    const baseCheck = (0, validation_1.validate)(normalized);
    timings.validate = performance.now() - validateStart;
    if (!baseCheck.ok) {
        return {
            ok: false,
            quarantined: {
                raw: rawSnapshot, partial: normalized, reasons: dedupeReasons(baseCheck.reasons),
                normalizerVersion: normalize_1.NORMALIZER_VERSION,
            },
            timings,
        };
    }
    // ── Fingerprint ──────────────────────────────────────────────────────────
    const fpStart = performance.now();
    const fp = (0, fingerprint_1.fingerprint)(baseCheck.value);
    timings.fingerprint = performance.now() - fpStart;
    return {
        ok: true,
        validated: {
            raw: rawSnapshot,
            agency: baseCheck.value,
            fingerprint: fp,
            normalizerVersion: normalize_1.NORMALIZER_VERSION,
        },
        timings,
    };
}
function dedupeReasons(reasons) {
    const seen = new Set();
    const out = [];
    for (const r of reasons) {
        const key = `${r.path}::${r.code}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(r);
    }
    return out;
}
