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

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/** Version of the drift report shape. Bumped on breaking format changes. */
export const SCHEMA_DRIFT_REPORT_VERSION = 1;

/** Number of raw records to sample. Sufficient for top-level field detection. */
export const SAMPLE_SIZE = 100;

/** Coarse JS types we distinguish. Object/array nesting is summarized. */
export type SignatureType =
  | "string" | "number" | "boolean" | "null"
  | "array" | "object" | "undefined";

/** Per-key statistics. The most common type wins. */
export interface KeyStat {
  key:           string;
  /** Histogram of types observed across the sample. */
  typeHistogram: Record<SignatureType, number>;
  /** Most common type (`mode` of typeHistogram). */
  modeType:      SignatureType;
  /** % of sampled records where this key was present (0-100). */
  presencePct:   number;
  /** % of present values that were null (relative to presencePct). */
  nullSharePct:  number;
}

/** Structural signature of a payload. Persisted as JSONB. */
export interface SchemaSignature {
  version:    typeof SCHEMA_DRIFT_REPORT_VERSION;
  sampleSize: number;
  keys:       string[];
  byKey:      Record<string, KeyStat>;
  /** Stable hash so equality is a single string compare. */
  hash:       string;
}

/** A single drift finding. */
export interface DriftFinding {
  kind:
    | "key_added"      | "key_removed"
    | "type_changed"   | "presence_dropped"
    | "case_changed";
  /** The key (or pair of keys for case_changed) involved. */
  key: string;
  /** For case_changed: the prior-run case form of the same key. */
  priorKey?: string;
  /** Human-friendly message for the dashboard. */
  message: string;
  /** Severity hint for the Confidence Score weighting. */
  severity: "info" | "warning" | "critical";
  /** Type before/after (only for type_changed). */
  fromType?: SignatureType;
  toType?:   SignatureType;
  /** Presence-drop quantifier (only for presence_dropped). */
  fromPresencePct?: number;
  toPresencePct?:   number;
}

/** The full report, attached to sync_runs.schema_drift_report. */
export interface SchemaDriftReport {
  version:        typeof SCHEMA_DRIFT_REPORT_VERSION;
  providerSlug:   string;
  /** Signature of THIS run (always present). */
  current:        SchemaSignature;
  /** Signature of the prior successful run (null on first-ever run). */
  prior:          SchemaSignature | null;
  /** Empty array on first-ever run OR when shapes match exactly. */
  findings:       DriftFinding[];
  /** `true` when the signatures' hashes are equal. */
  matchesPrior:   boolean;
  /** Aggregate severity for fast filtering in the dashboard. */
  worstSeverity:  "info" | "warning" | "critical" | null;
}

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
export function signSchema(
  raw: ReadonlyArray<unknown>,
  sampleSize = SAMPLE_SIZE,
): SchemaSignature {
  const sample = raw.slice(0, Math.max(0, sampleSize));
  const N = sample.length;

  const byKey: Record<string, KeyStat> = {};
  const presenceCount: Record<string, number> = {};
  const nullCount:     Record<string, number> = {};

  for (const r of sample) {
    if (r === null || r === undefined || typeof r !== "object") continue;
    for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
      const t = classifyType(v);
      const stat = (byKey[k] ??= emptyKeyStat(k));
      stat.typeHistogram[t] = (stat.typeHistogram[t] ?? 0) + 1;
      presenceCount[k] = (presenceCount[k] ?? 0) + 1;
      if (v === null) nullCount[k] = (nullCount[k] ?? 0) + 1;
    }
  }

  // Compute mode + presence + nullShare per key.
  for (const k of Object.keys(byKey)) {
    const stat = byKey[k];
    let modeType: SignatureType = "undefined";
    let modeCount = -1;
    for (const [t, c] of Object.entries(stat.typeHistogram) as [SignatureType, number][]) {
      if (c > modeCount) { modeCount = c; modeType = t; }
    }
    stat.modeType    = modeType;
    stat.presencePct = N === 0 ? 0 : round2((presenceCount[k] / N) * 100);
    const present     = presenceCount[k] ?? 0;
    stat.nullSharePct = present === 0 ? 0 : round2(((nullCount[k] ?? 0) / present) * 100);
  }

  const keys = Object.keys(byKey).sort();
  const hash = hashSignature(keys, byKey);

  return {
    version:    SCHEMA_DRIFT_REPORT_VERSION,
    sampleSize: N,
    keys,
    byKey,
    hash,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// detectSchemaDrift — compare current vs prior signature
// ─────────────────────────────────────────────────────────────────────────────

export interface DetectSchemaDriftOpts {
  providerSlug: string;
  /** Up to SAMPLE_SIZE raw records from the foundation pipeline's `raw` bin. */
  rawSample:    ReadonlyArray<unknown>;
  /** Pulled from `sync_providers.last_schema_signature`. May be null. */
  priorSignature: SchemaSignature | null;
  /** Minimum presence drop (in percentage points) to flag. Default: 25. */
  presenceDropThresholdPp?: number;
}

export function detectSchemaDrift(
  opts: DetectSchemaDriftOpts,
): SchemaDriftReport {
  const current = signSchema(opts.rawSample);

  // First-ever run: nothing to compare against. Report current shape only.
  if (!opts.priorSignature) {
    return {
      version:       SCHEMA_DRIFT_REPORT_VERSION,
      providerSlug:  opts.providerSlug,
      current,
      prior:         null,
      findings:      [],
      matchesPrior:  false,
      worstSeverity: null,
    };
  }

  const prior     = opts.priorSignature;
  const findings: DriftFinding[] = [];
  const dropThr   = opts.presenceDropThresholdPp ?? 25;

  // Build lowercase-key index once so we can detect case_changed cheaply.
  const priorByLower = new Map<string, string>();
  for (const k of prior.keys) priorByLower.set(k.toLowerCase(), k);
  const currentByLower = new Map<string, string>();
  for (const k of current.keys) currentByLower.set(k.toLowerCase(), k);

  // Detect case_changed PAIRS first, so we don't double-flag a single
  // re-cased key as both "removed (oldCase)" and "added (newCase)".
  const caseChanges = new Set<string>();
  for (const k of current.keys) {
    const lower = k.toLowerCase();
    const priorMatch = priorByLower.get(lower);
    if (priorMatch && priorMatch !== k) {
      findings.push({
        kind:      "case_changed",
        key:       k,
        priorKey:  priorMatch,
        message:   `Provider re-cased "${priorMatch}" → "${k}". Normalizer may need an alias.`,
        severity:  "warning",
      });
      caseChanges.add(k);
      caseChanges.add(priorMatch);
    }
  }

  // key_added
  for (const k of current.keys) {
    if (caseChanges.has(k)) continue;
    if (!prior.byKey[k]) {
      findings.push({
        kind:     "key_added",
        key:      k,
        message:  `New field "${k}" appeared in upstream. May contain data we now ignore.`,
        severity: "info",
      });
    }
  }

  // key_removed
  for (const k of prior.keys) {
    if (caseChanges.has(k)) continue;
    if (!current.byKey[k]) {
      findings.push({
        kind:     "key_removed",
        key:      k,
        message:  `Field "${k}" disappeared from upstream. Downstream may now see nulls.`,
        severity: "critical",
      });
    }
  }

  // type_changed + presence_dropped
  for (const k of current.keys) {
    if (caseChanges.has(k)) continue;
    const p = prior.byKey[k];
    if (!p) continue;
    const c = current.byKey[k];

    if (c.modeType !== p.modeType && c.modeType !== "undefined" && p.modeType !== "undefined") {
      findings.push({
        kind:      "type_changed",
        key:       k,
        fromType:  p.modeType,
        toType:    c.modeType,
        message:   `Field "${k}" type drifted ${p.modeType} → ${c.modeType}. Normalizer may misread values.`,
        severity:  "critical",
      });
    }

    if (p.presencePct - c.presencePct >= dropThr) {
      findings.push({
        kind:      "presence_dropped",
        key:       k,
        fromPresencePct: p.presencePct,
        toPresencePct:   c.presencePct,
        message:   `Field "${k}" presence fell ${p.presencePct}% → ${c.presencePct}% (≥${dropThr}pp drop).`,
        severity:  "warning",
      });
    }
  }

  // Compute aggregate worst severity.
  let worst: "info" | "warning" | "critical" | null = null;
  for (const f of findings) {
    if (f.severity === "critical") { worst = "critical"; break; }
    if (f.severity === "warning")  worst = "warning";
    else if (!worst)               worst = "info";
  }

  return {
    version:       SCHEMA_DRIFT_REPORT_VERSION,
    providerSlug:  opts.providerSlug,
    current,
    prior,
    findings,
    matchesPrior:  current.hash === prior.hash,
    worstSeverity: worst,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence helpers — update last_schema_signature on success only
// ─────────────────────────────────────────────────────────────────────────────

export async function loadPriorSignature(
  providerSlug: string,
): Promise<SchemaSignature | null> {
  const { pool } = await import("../db");
  const { rows } = await pool.query<{ last_schema_signature: SchemaSignature | null }>(
    `SELECT last_schema_signature FROM sync_providers WHERE slug = $1 LIMIT 1`,
    [providerSlug],
  );
  return rows[0]?.last_schema_signature ?? null;
}

/**
 * Persist the current signature as the new baseline. Called ONLY after
 * a successful, non-shadow, non-dry-run run that did not hit the safety
 * gate. The RC1 runner invokes this AFTER its main atomic COMMIT — by
 * design, the baseline only advances when a real successful write
 * landed for the operator.
 */
export async function persistCurrentSignature(
  providerSlug: string,
  sig: SchemaSignature,
): Promise<void> {
  const { pool } = await import("../db");
  await pool.query(
    `UPDATE sync_providers SET last_schema_signature = $2::jsonb WHERE slug = $1`,
    [providerSlug, JSON.stringify(sig)],
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────────

function classifyType(v: unknown): SignatureType {
  if (v === null)        return "null";
  if (v === undefined)   return "undefined";
  if (Array.isArray(v))  return "array";
  const t = typeof v;
  if (t === "object")    return "object";
  if (t === "string")    return "string";
  if (t === "number")    return "number";
  if (t === "boolean")   return "boolean";
  return "undefined";
}

function emptyKeyStat(key: string): KeyStat {
  return {
    key,
    typeHistogram: {
      string: 0, number: 0, boolean: 0, null: 0,
      array: 0, object: 0, undefined: 0,
    },
    modeType:     "undefined",
    presencePct:  0,
    nullSharePct: 0,
  };
}

function hashSignature(keys: string[], byKey: Record<string, KeyStat>): string {
  // sha-256 of a deterministic canonical form: "key:modeType|key:modeType|..."
  // (presence is intentionally excluded so a small data shift doesn't flip
  // the hash; type changes do, which is what we care about for equality.)
  const canonical = keys.map((k) => `${k}:${byKey[k].modeType}`).join("|");
  // Sync crypto so this can run in pure-function paths (no async).
  const { createHash } = require("node:crypto");
  return createHash("sha256").update(canonical).digest("hex");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
