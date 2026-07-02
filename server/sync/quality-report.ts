/**
 * Sync Engine — Data Quality Report (Milestone 3).
 *
 * Pure function. Aggregates a run's results into a structured JSON
 * document that's persisted to `sync_runs.data_quality_report`. The
 * admin dashboard (M6) reads this directly; no aggregation queries
 * are needed at view-time.
 *
 * The report answers:
 *   • How clean was this run?
 *   • Where did the quarantines come from?
 *   • What changed shape?
 *   • Were safety thresholds approached?
 *
 * Design notes:
 *
 *   1. **Pure aggregation**. Inputs are everything the engine already has
 *      after diff + safety. No DB I/O. Deterministic; easily testable.
 *
 *   2. **Schema is versioned**. `version` field on the report lets future
 *      readers detect format changes. Bumps follow ADR-0002 §D-2 rules.
 *
 *   3. **Bounded sample sizes**. Top-N lists are capped at 10 entries —
 *      enough to be useful in the dashboard without bloating the JSON.
 */

import type { ChangeSet, ChangeSetCounts } from "./diff";
import type { Anomaly } from "./safety";
import type {
  QuarantinedRecord,
  ValidatedRecord,
  ValidationIssue,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Versioning
// ─────────────────────────────────────────────────────────────────────────────

export const DATA_QUALITY_REPORT_VERSION = 1 as const;

// ─────────────────────────────────────────────────────────────────────────────
// Report shape
// ─────────────────────────────────────────────────────────────────────────────

export interface DataQualityReport {
  version: typeof DATA_QUALITY_REPORT_VERSION;
  generatedAt: string;
  runId:        string;
  providerSlug: string;
  /** Versions in effect for the run — provenance trail per ADR-0002. */
  versions: {
    normalizer: string;
    fingerprint: number;
  };
  /** Top-line counts. */
  totals: {
    fetched:     number;
    validated:   number;
    quarantined: number;
    created:     number;
    updated:     number;
    unchanged:   number;
    deleted:     number;
  };
  /** Quarantine breakdown. */
  quarantine: {
    /** Total quarantined this run. */
    count: number;
    /** Percentage of fetched. Useful trend metric. */
    ratePct: number;
    /** Histogram by ValidationIssue.code. */
    byCode: Record<string, number>;
    /** Histogram by which validator rejected (base Zod vs adapter-specific). */
    byStage: { normalize: number; validate: number };
    /** Top-N quarantined licences with reasons. */
    samples: Array<{
      licenseNumber: string;
      reasons: ValidationIssue[];
    }>;
  };
  /** Updated-row summary. */
  drift: {
    /** Histogram of "which fields changed" — useful schema-shift signal. */
    fieldChangeFrequency: Record<string, number>;
    /** Subset of updates that flipped status_source. */
    statusFlips: number;
    /** Top-N most-changed licences. */
    samples: Array<{
      licenseNumber: string;
      fieldsChanged: string[];
    }>;
  };
  /** Safety verdict summary. */
  safety: {
    anomalyScore: number;
    held:         boolean;
    anomalies: Array<{
      type: string;
      severity: string;
      metricValue: number;
      threshold:   number;
      message:     string;
    }>;
  };
}

export interface QualityReportInputs {
  runId:        string;
  providerSlug: string;
  fetched:      number;
  validated:    ReadonlyArray<ValidatedRecord>;
  quarantined:  ReadonlyArray<QuarantinedRecord>;
  changes:      ChangeSet;
  counts:       ChangeSetCounts;
  normalizerVersion:  string;
  fingerprintVersion: number;
  safety: {
    anomalyScore: number;
    held:         boolean;
    anomalies:    ReadonlyArray<Anomaly>;
  };
}

const TOP_N = 10;

// ─────────────────────────────────────────────────────────────────────────────
// generateDataQualityReport
// ─────────────────────────────────────────────────────────────────────────────

export function generateDataQualityReport(input: QualityReportInputs): DataQualityReport {
  // ── Quarantine analysis ─────────────────────────────────────────────────
  const byCode:   Record<string, number> = {};
  const byStage = { normalize: 0, validate: 0 };

  for (const q of input.quarantined) {
    for (const r of q.reasons) {
      byCode[r.code] = (byCode[r.code] ?? 0) + 1;
    }
    // Stage: heuristic — if any reason has path "(normalize)" we say normalize,
    // otherwise validate. Aligns with how engine.ts quarantines.
    const isNormalize = q.reasons.some((r) => r.path === "(normalize)");
    if (isNormalize) byStage.normalize++;
    else             byStage.validate++;
  }

  const quarantineSamples = input.quarantined.slice(0, TOP_N).map((q) => ({
    licenseNumber: String((q.raw as any).licenseNumber ?? "(unknown)"),
    reasons:       q.reasons,
  }));

  const ratePct = input.fetched > 0
    ? round2((input.quarantined.length / input.fetched) * 100)
    : 0;

  // ── Drift analysis ──────────────────────────────────────────────────────
  const fieldChangeFrequency: Record<string, number> = {};
  let statusFlips = 0;
  for (const u of input.changes.updated) {
    for (const field of Object.keys(u.fieldChanges)) {
      fieldChangeFrequency[field] = (fieldChangeFrequency[field] ?? 0) + 1;
    }
    if (u.fieldChanges.statusSource !== undefined) statusFlips++;
  }

  // Top-N by "most fields changed" — surfaces rows the admin should sanity-check.
  const updatesByChurn = [...input.changes.updated]
    .map((u) => ({ u, churn: Object.keys(u.fieldChanges).length }))
    .sort((a, b) => b.churn - a.churn)
    .slice(0, TOP_N);

  const driftSamples = updatesByChurn.map(({ u }) => ({
    licenseNumber: u.licenseNumber,
    fieldsChanged: Object.keys(u.fieldChanges),
  }));

  // ── Safety summary ──────────────────────────────────────────────────────
  const safety = {
    anomalyScore: input.safety.anomalyScore,
    held:         input.safety.held,
    anomalies:    input.safety.anomalies.map((a) => ({
      type:        a.type,
      severity:    a.severity,
      metricValue: a.metricValue,
      threshold:   a.threshold,
      message:     a.message,
    })),
  };

  return {
    version:     DATA_QUALITY_REPORT_VERSION,
    generatedAt: new Date().toISOString(),
    runId:        input.runId,
    providerSlug: input.providerSlug,
    versions: {
      normalizer:  input.normalizerVersion,
      fingerprint: input.fingerprintVersion,
    },
    totals: {
      fetched:     input.fetched,
      validated:   input.validated.length,
      quarantined: input.quarantined.length,
      created:     input.counts.created,
      updated:     input.counts.updated,
      unchanged:   input.counts.unchanged,
      deleted:     input.counts.deleted,
    },
    quarantine: {
      count:   input.quarantined.length,
      ratePct,
      byCode,
      byStage,
      samples: quarantineSamples,
    },
    drift: {
      fieldChangeFrequency,
      statusFlips,
      samples: driftSamples,
    },
    safety,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
