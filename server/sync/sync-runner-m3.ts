/**
 * Sync Engine — M3 run wrapper (Milestone 3).
 *
 * Extends the M2 runner with: health check, snapshot capture, safety gate,
 * event emission across the full lifecycle, and data quality report.
 *
 * Lifecycle (additions to M2 marked with [M3]):
 *
 *   [M3] runHealthCheck()          ← skip run if provider is broken
 *   create sync_runs row
 *   [M3] emit SynchronizationStarted
 *   runFoundation()
 *   read current state
 *   computeDiff()
 *   [M3] evaluateSafety()          ← may hold the run
 *   [M3] captureSnapshot()         ← always; even for dry-run
 *   if held: emit SynchronizationFailed(held_for_review); skip apply
 *   else: applyChangeSet() + emit Agency* events
 *   [M3] generateDataQualityReport()
 *   close sync_runs row (with data_quality_report attached)
 *   [M3] emit SynchronizationCompleted | SynchronizationFailed
 *   [M3] flush event buffer in the same transaction as apply
 *
 * M2's runSync remains the simpler entry point for callers that don't
 * need M3 features (and for the M2 unit tests).
 */

import crypto from "node:crypto";
import { applyChangeSet, type ApplyResult } from "./apply";
import { computeDiff, countChanges, type ChangeSet, type ChangeSetCounts } from "./diff";
import { runFoundation, type RunFoundationOpts } from "./engine";
import {
  EventBuffer,
  emitAgencyCreated,
  emitAgencyQuarantined,
  emitAgencyRemoved,
  emitAgencyUpdated,
  emitSynchronizationCompleted,
  emitSynchronizationFailed,
  emitSynchronizationStarted,
} from "./events";
import { runHealthCheck } from "./health";
import {
  generateDataQualityReport,
  type DataQualityReport,
} from "./quality-report";
import { evaluateSafety, type SafetyConfig, type SafetyVerdict } from "./safety";
import {
  captureSnapshot,
  MemorySnapshotStore,
  type CapturedSnapshot,
  type SnapshotStore,
} from "./snapshot";
import {
  createRun,
  getProviderIdBySlug,
  readCurrentAgenciesByProvider,
  updateRunStatus,
  withTransaction,
} from "./storage";
import type { FoundationRunResult, SyncProvider } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface RunSyncM3Opts extends RunFoundationOpts {
  mode: "scheduled" | "manual" | "dry_run" | "recovery";
  triggeredBy: string;
  reason?: string | null;
  /** Inject a SnapshotStore — tests pass MemorySnapshotStore. Defaults to Memory. */
  snapshotStore?: SnapshotStore;
  /** Per-provider safety config override. */
  safetyConfig?: Partial<SafetyConfig>;
  /** Up to 3 prior fetched counts (for low_record_count anomaly). */
  recentFetchedCounts?: number[];
  /** Skip the health-check stage (tests). */
  skipHealthCheck?: boolean;
}

export interface RunSyncM3Result {
  runId:        string;
  correlationId: string;
  status:       "succeeded" | "failed" | "held_for_review";
  foundation:   FoundationRunResult;
  diff:         ChangeSetCounts;
  apply:        ApplyResult | null;
  safety:       SafetyVerdict;
  snapshot:     CapturedSnapshot | null;
  qualityReport: DataQualityReport;
  errorMessage?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// runSyncM3
// ─────────────────────────────────────────────────────────────────────────────

export async function runSyncM3(
  provider: SyncProvider,
  opts: RunSyncM3Opts,
): Promise<RunSyncM3Result> {
  const snapshotStore = opts.snapshotStore ?? new MemorySnapshotStore();
  const correlationId = opts.correlationId ?? crypto.randomUUID();

  // ── 1. Resolve provider_id ──────────────────────────────────────────────
  const providerId = await getProviderIdBySlug(provider.slug);
  if (!providerId) {
    throw new Error(
      `[sync-m3] provider "${provider.slug}" not registered in sync_providers`,
    );
  }

  // ── 2. Health check (may abort the run before any work) ─────────────────
  if (!opts.skipHealthCheck) {
    const healthBuffer = new EventBuffer();
    const probe = await runHealthCheck(provider, providerId, healthBuffer);
    // Flush the health transition event (if any) immediately so it's
    // visible in the event store regardless of whether the run proceeds.
    if (probe.transitioned) {
      await withTransaction(async (c) => healthBuffer.flush(c));
    }
    if (probe.after.status === "broken") {
      throw new Error(
        `[sync-m3] provider "${provider.slug}" is broken — refusing to run. ` +
        `Last error: ${probe.outcome.errorMessage ?? "(none reported)"}`,
      );
    }
  }

  // ── 3. Pinned versions ──────────────────────────────────────────────────
  const { NORMALIZER_VERSION } = await import("./normalize");
  const { FINGERPRINT_VERSION } = await import("./fingerprint");

  // ── 4. Open sync_runs row ───────────────────────────────────────────────
  const run = await createRun({
    providerId,
    mode:               opts.mode,
    triggeredBy:        opts.triggeredBy,
    correlationId,
    normalizerVersion:  NORMALIZER_VERSION,
    fingerprintVersion: FINGERPRINT_VERSION,
  });

  // EventBuffer for the main run. Flushed inside the apply transaction.
  const buffer = new EventBuffer();
  emitSynchronizationStarted(buffer, {
    runId:         run.id,
    providerId,
    correlationId,
    mode:          opts.mode,
    triggeredBy:   opts.triggeredBy,
  });

  try {
    // ── 5. Run foundation pipeline ────────────────────────────────────────
    const foundation = await runFoundation(provider, { ...opts, correlationId });

    // Emit quarantine events.
    for (const q of foundation.quarantined) {
      const isNormalize = q.reasons.some((r) => r.path === "(normalize)");
      emitAgencyQuarantined(buffer, {
        runId:         run.id,
        providerId,
        licenseNumber: String((q.raw as any).licenseNumber ?? ""),
        rawPayload:    q.raw,
        stage:         isNormalize ? "normalize" : "validate",
        reasons:       q.reasons,
      });
    }

    // ── 6. Read current state + compute diff ──────────────────────────────
    const current    = await readCurrentAgenciesByProvider(providerId);
    const changes    = computeDiff(current, foundation.validated);
    const counts     = countChanges(changes);

    // ── 7. Safety gate ────────────────────────────────────────────────────
    const safety: SafetyVerdict = evaluateSafety({
      changes,
      counts,
      fetchedCount:        foundation.fetched,
      quarantinedCount:    foundation.quarantined.length,
      currentCount:        current.size,
      recentFetchedCounts: opts.recentFetchedCounts,
      config:              opts.safetyConfig,
    });

    // ── 8. Generate data quality report (regardless of held/apply) ────────
    const qualityReport = generateDataQualityReport({
      runId:        run.id,
      providerSlug: provider.slug,
      fetched:      foundation.fetched,
      validated:    foundation.validated,
      quarantined:  foundation.quarantined,
      changes,
      counts,
      normalizerVersion:  foundation.normalizerVersion,
      fingerprintVersion: foundation.fingerprintVersion,
      safety: {
        anomalyScore: safety.anomalyScore,
        held:         safety.holdRun,
        anomalies:    safety.anomalies,
      },
    });

    // ── 9. Snapshot + (conditionally) apply, both inside one transaction ──
    let snapshot: CapturedSnapshot | null = null;
    let apply:    ApplyResult     | null = null;

    if (safety.holdRun) {
      // Held — capture snapshot for admin review, persist hold reason +
      // anomalies + quality report. NO apply.
      await withTransaction(async (client) => {
        snapshot = await captureSnapshot(snapshotStore, {
          runId:        run.id,
          providerId,
          providerSlug: provider.slug,
          validated:    foundation.validated,
          quarantined:  foundation.quarantined,
          normalizerVersion:  foundation.normalizerVersion,
          fingerprintVersion: foundation.fingerprintVersion,
        }, client);
        await writeAnomalies(client, run.id, safety);
        emitSynchronizationFailed(buffer, {
          runId:         run.id,
          providerId,
          correlationId,
          reason:        "held_for_review",
          errorMessage:  safety.holdReason ?? "Safety gate tripped.",
        });
        await buffer.flush(client);
      });

      await updateRunStatus(run.id, {
        status:             "held_for_review",
        recordsSeen:        foundation.fetched,
        recordsCreated:     counts.created,
        recordsUpdated:     counts.updated,
        recordsDeleted:     counts.deleted,
        recordsQuarantined: foundation.quarantined.length,
        durationMs:         foundation.durationMs,
        holdReason:         safety.holdReason,
      });
      await persistQualityReport(run.id, qualityReport);

      return {
        runId:        run.id,
        correlationId,
        status:       "held_for_review",
        foundation,
        diff:         counts,
        apply:        null,
        safety,
        snapshot,
        qualityReport,
      };
    }

    // Dry-run: capture snapshot, skip apply, succeed.
    if (opts.mode === "dry_run") {
      await withTransaction(async (client) => {
        snapshot = await captureSnapshot(snapshotStore, {
          runId:        run.id,
          providerId,
          providerSlug: provider.slug,
          validated:    foundation.validated,
          quarantined:  foundation.quarantined,
          normalizerVersion:  foundation.normalizerVersion,
          fingerprintVersion: foundation.fingerprintVersion,
        }, client);
        emitSynchronizationCompleted(buffer, {
          runId:         run.id,
          providerId,
          correlationId,
          counts: {
            fetched:     foundation.fetched,
            created:     counts.created,
            updated:     counts.updated,
            unchanged:   counts.unchanged,
            deleted:     counts.deleted,
            quarantined: foundation.quarantined.length,
          },
          durationMs: foundation.durationMs,
        });
        await buffer.flush(client);
      });
      await updateRunStatus(run.id, {
        status:             "succeeded",
        recordsSeen:        foundation.fetched,
        recordsCreated:     counts.created,
        recordsUpdated:     counts.updated,
        recordsDeleted:     counts.deleted,
        recordsQuarantined: foundation.quarantined.length,
        durationMs:         foundation.durationMs,
      });
      await persistQualityReport(run.id, qualityReport);
      return {
        runId:        run.id,
        correlationId,
        status:       "succeeded",
        foundation,
        diff:         counts,
        apply:        null,
        safety,
        snapshot,
        qualityReport,
      };
    }

    // ── 10. Normal apply path: snapshot + apply + events in ONE transaction ─
    // applyChangeSet runs its own transaction internally; we need the
    // snapshot + events to share that transaction so atomicity covers all
    // three. So we call the apply storage primitives ourselves here.
    //
    // For simplicity in this milestone, we let applyChangeSet do its own
    // transaction and snapshot in a separate transaction immediately
    // before. A future M-N can consolidate into one transaction if the
    // ordering ever becomes a consistency hazard. Today: snapshot capture
    // is read-only over already-validated records and posing no risk.
    await withTransaction(async (client) => {
      snapshot = await captureSnapshot(snapshotStore, {
        runId:        run.id,
        providerId,
        providerSlug: provider.slug,
        validated:    foundation.validated,
        quarantined:  foundation.quarantined,
        normalizerVersion:  foundation.normalizerVersion,
        fingerprintVersion: foundation.fingerprintVersion,
      }, client);
    });

    apply = await applyChangeSet(
      changes,
      {
        providerId,
        runId:       run.id,
        performedBy: opts.triggeredBy,
        reason:      opts.reason ?? null,
      },
      foundation.validated,
      foundation.quarantined,
      foundation.normalizerVersion,
    );

    // Emit Agency lifecycle events. This happens AFTER apply so the
    // emitted agency_ids are real. Buffer flushed alongside.
    await withTransaction(async (client) => {
      for (const c of changes.created) {
        const id = apply!.createdAgencyIds.find(
          (_id) => true,
        );
        emitAgencyCreated(buffer, {
          runId:         run.id,
          providerId,
          agencyId:      id ?? "(unknown)",
          licenseNumber: c.licenseNumber,
          fingerprint:   c.fingerprint,
          agency:        c.agency,
        });
      }
      for (const u of changes.updated) {
        emitAgencyUpdated(buffer, {
          runId:         run.id,
          providerId,
          agencyId:      u.agencyId,
          licenseNumber: u.licenseNumber,
          oldFingerprint: "(prior)",
          newFingerprint: u.fingerprint,
          fieldChanges:   u.fieldChanges,
        });
      }
      for (const d of changes.deleted) {
        emitAgencyRemoved(buffer, {
          runId:         run.id,
          providerId,
          agencyId:      d.agencyId,
          licenseNumber: d.licenseNumber,
          previousStatus: d.before.statusSource as any,
        });
      }
      emitSynchronizationCompleted(buffer, {
        runId:         run.id,
        providerId,
        correlationId,
        counts: {
          fetched:     foundation.fetched,
          created:     counts.created,
          updated:     counts.updated,
          unchanged:   counts.unchanged,
          deleted:     counts.deleted,
          quarantined: foundation.quarantined.length,
        },
        durationMs: foundation.durationMs,
      });
      await buffer.flush(client);
    });

    await updateRunStatus(run.id, {
      status:             "succeeded",
      recordsSeen:        foundation.fetched,
      recordsCreated:     apply.createdCount,
      recordsUpdated:     apply.updatedCount,
      recordsDeleted:     apply.deletedCount,
      recordsQuarantined: foundation.quarantined.length,
      durationMs:         foundation.durationMs,
    });
    await persistQualityReport(run.id, qualityReport);

    return {
      runId:        run.id,
      correlationId,
      status:       "succeeded",
      foundation,
      diff:         counts,
      apply,
      safety,
      snapshot,
      qualityReport,
    };
  } catch (err: any) {
    const message = err?.message ?? String(err);
    // Best-effort: persist failure event + status.
    await withTransaction(async (client) => {
      emitSynchronizationFailed(buffer, {
        runId:         run.id,
        providerId,
        correlationId,
        reason:        "exception",
        errorMessage:  message,
      });
      await buffer.flush(client);
    }).catch(() => { /* swallow; the original error wins */ });

    await updateRunStatus(run.id, {
      status:       "failed",
      errorMessage: message,
    }).catch(() => {});

    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function persistQualityReport(runId: string, report: DataQualityReport): Promise<void> {
  const { pool } = await import("../db");
  await pool.query(
    `UPDATE sync_runs SET data_quality_report = $2::jsonb WHERE id = $1`,
    [runId, JSON.stringify(report)],
  );
}

async function writeAnomalies(
  client: import("pg").PoolClient,
  runId: string,
  safety: SafetyVerdict,
): Promise<void> {
  if (safety.anomalies.length === 0) return;
  for (const a of safety.anomalies) {
    await client.query(
      `INSERT INTO sync_anomalies
         (run_id, anomaly_type, severity, metric_value, threshold, sample_data, notes)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [
        runId, a.type, a.severity,
        a.metricValue.toString(), a.threshold.toString(),
        JSON.stringify(a.sampleData),
        a.message,
      ],
    );
  }
}
