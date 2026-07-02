/**
 * Sync Engine — Replay Engine (RC1, Priority 2).
 *
 * Loads a previously captured snapshot, optionally re-normalizes and
 * re-fingerprints with the CURRENT normalizer/fingerprint versions, and
 * either reports what would change ("preview") or actually applies the
 * resulting changeset to nea_agencies ("apply"). A `replay_only` mode
 * exists to materialize the snapshot back into ValidatedRecord shape
 * without doing anything else (useful for ad-hoc forensics).
 *
 * Replays NEVER fetch from the upstream provider. Their entire input is
 * the snapshot. This makes them deterministic, fast, and safe to run
 * any number of times against historical data.
 *
 * Use cases:
 *
 *   1. Normalizer bug fix: replay the last week of snapshots with the
 *      new normalizer and verify the diff matches what we expect.
 *   2. Fingerprint algorithm change: confirm no spurious "updated"
 *      bin entries are produced by the new fingerprint vs the old.
 *   3. Disaster recovery: nea_agencies was corrupted; replay the latest
 *      snapshot to restore.
 *   4. Audit reproducibility: prove that "this snapshot, with these
 *      versions, produces exactly this set of changes."
 *
 * Modes:
 *
 *   - `replay_only`     → load snapshot, return materialized records;
 *                         no diff, no apply, no run record changes.
 *   - `replay_preview`  → replay through pipeline, compute diff, but
 *                         do NOT apply. Returns the ChangeSet + counts.
 *   - `replay_apply`    → run a real sync_run from the snapshot. Uses
 *                         the RC1 atomic runner under the hood, with
 *                         the source snapshot tagged on the new run.
 *
 * All modes record a `sync_replays` audit row.
 */

import crypto from "node:crypto";
import { computeDiff, countChanges, type ChangeSetCounts } from "./diff";
import { FINGERPRINT_VERSION, computeFingerprint } from "./fingerprint";
import { NORMALIZER_VERSION, normalizeAgency } from "./normalize";
import {
  restoreSnapshot,
  type CapturedSnapshot,
  type SnapshotStore,
} from "./snapshot";
import { readCurrentAgenciesByProvider, getProviderIdBySlug } from "./storage";
import { validateAgency } from "./validation";
import type {
  NormalizedAgency,
  QuarantinedRecord,
  SyncProvider,
  ValidatedRecord,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type ReplayMode = "replay_only" | "replay_preview" | "replay_apply";

export interface ReplayOpts {
  /** sync_snapshots.id to load. */
  snapshotId:  string;
  mode:        ReplayMode;
  /** Who triggered the replay. Recorded on sync_replays.triggered_by. */
  triggeredBy: string;
  /** Snapshot store (must match the one used at capture). */
  snapshotStore: SnapshotStore;
  /** Required for replay_apply — we need to actually run the RC1 pipeline. */
  provider?:   SyncProvider;
  /** Free-form notes column on sync_replays. */
  notes?: string;
}

export interface ReplayPreviewResult {
  replayId:    string;
  mode:        "replay_preview";
  /** The snapshot we replayed against. */
  snapshot:    CapturedSnapshot;
  /** Whether re-normalization actually changed any records. */
  versionsBumped: boolean;
  /** Records that passed validation under the CURRENT versions. */
  validated:   ValidatedRecord[];
  /** Records that fell out under the CURRENT versions. */
  quarantined: QuarantinedRecord[];
  /** Diff against today's live nea_agencies state. */
  counts:      ChangeSetCounts;
}

export interface ReplayOnlyResult {
  replayId:  string;
  mode:      "replay_only";
  snapshot:  CapturedSnapshot;
  validated: ValidatedRecord[];
}

export interface ReplayApplyResult {
  replayId:  string;
  mode:      "replay_apply";
  snapshot:  CapturedSnapshot;
  /** sync_runs.id created by the RC1 atomic runner. */
  resultingRunId: string;
}

export type ReplayResult = ReplayOnlyResult | ReplayPreviewResult | ReplayApplyResult;

// ─────────────────────────────────────────────────────────────────────────────
// runReplay
// ─────────────────────────────────────────────────────────────────────────────

export async function runReplay(opts: ReplayOpts): Promise<ReplayResult> {
  const replayId = crypto.randomUUID();

  // ── 1. Load + checksum-verify the snapshot ──────────────────────────────
  const snapshot = await restoreSnapshot(opts.snapshotStore, opts.snapshotId);

  // ── 2. Open the sync_replays audit row ──────────────────────────────────
  await openReplayRow(replayId, snapshot, opts);

  try {
    if (opts.mode === "replay_only") {
      // Snapshot's `validated` was already materialized by restoreSnapshot.
      const result: ReplayOnlyResult = {
        replayId,
        mode:      "replay_only",
        snapshot,
        validated: snapshot.validated,
      };
      await closeReplayRow(replayId, "succeeded");
      return result;
    }

    // For preview + apply we need to re-process raw payloads through the
    // CURRENT normalize + fingerprint pipeline. This is the whole point
    // of replay: catch what the new pipeline does differently.
    const { validated, quarantined, versionsBumped } = await replayPipeline(snapshot);

    if (opts.mode === "replay_preview") {
      const providerId = await getProviderIdBySlug(snapshot.providerSlug);
      if (!providerId) {
        throw new Error(`[replay] provider "${snapshot.providerSlug}" not registered`);
      }
      const current = await readCurrentAgenciesByProvider(providerId);
      const changes = computeDiff(current, validated);
      const counts  = countChanges(changes);

      const result: ReplayPreviewResult = {
        replayId,
        mode:      "replay_preview",
        snapshot,
        versionsBumped,
        validated,
        quarantined,
        counts,
      };
      await closeReplayRow(replayId, "succeeded");
      return result;
    }

    // replay_apply: invoke the RC1 atomic runner with a provider stub
    // whose fetchRecords just yields the snapshot's raw records back.
    if (!opts.provider) {
      throw new Error(`[replay] replay_apply requires a provider (for adapter metadata)`);
    }
    const runner = await import("./sync-runner-rc1");
    const replayProvider = makeReplayProvider(opts.provider, snapshot);

    const { runSyncRc1 } = runner;
    const runResult = await runSyncRc1(replayProvider, {
      mode:        "recovery",
      triggeredBy: `replay:${opts.triggeredBy}`,
      reason:      `Replay of snapshot ${snapshot.id}`,
      replayedFromSnapshotId: snapshot.id,
      snapshotStore: opts.snapshotStore,
    });

    await closeReplayRow(replayId, "succeeded", runResult.runId);

    return {
      replayId,
      mode:           "replay_apply",
      snapshot,
      resultingRunId: runResult.runId,
    };
  } catch (err) {
    await closeReplayRow(replayId, "failed").catch(() => {});
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// replayPipeline — pure re-normalization + re-fingerprint + re-validate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Re-runs the foundation pipeline on the snapshot's raw payloads with
 * the CURRENT normalizer + fingerprint versions. Returns the new
 * validated + quarantined bins and a flag indicating whether either
 * version is different from the snapshot's stored versions.
 *
 * If both versions match the snapshot's, this is effectively idempotent —
 * the resulting validated set should match the snapshot's stored
 * validated set 1:1. We re-run it anyway so callers always have a
 * predictable, fresh result regardless of what's in the snapshot row.
 */
async function replayPipeline(
  snapshot: CapturedSnapshot,
): Promise<{
  validated:      ValidatedRecord[];
  quarantined:    QuarantinedRecord[];
  versionsBumped: boolean;
}> {
  const versionsBumped =
    snapshot.normalizerVersion  !== NORMALIZER_VERSION ||
    snapshot.fingerprintVersion !== FINGERPRINT_VERSION;

  const validated:   ValidatedRecord[]   = [];
  const quarantined: QuarantinedRecord[] = [];

  // Walk validated bin → re-normalize the underlying raw payload.
  // Quarantined bin → re-try; might now pass (or fail differently).
  const allRaw: Array<{ raw: unknown }> = [
    ...snapshot.validated.map((v) => ({ raw: v.raw })),
    ...snapshot.quarantined.map((q) => ({ raw: q.raw })),
  ];

  for (const r of allRaw) {
    // Re-normalize
    let normalized: NormalizedAgency | null = null;
    try {
      normalized = normalizeAgency(r.raw);
    } catch (err: any) {
      quarantined.push({
        raw:     r.raw,
        partial: null,
        reasons: [{
          path:    "(normalize)",
          code:    "normalize_error" as any,
          message: err?.message ?? "Normalization threw",
        }],
        normalizerVersion: null,
      });
      continue;
    }

    // Re-validate
    const result = validateAgency(normalized);
    if (!result.ok) {
      quarantined.push({
        raw:     r.raw,
        partial: normalized,
        reasons: result.reasons,
        normalizerVersion: NORMALIZER_VERSION,
      });
      continue;
    }

    // Re-fingerprint
    const fingerprint = computeFingerprint(result.value);
    validated.push({
      raw:               r.raw,
      agency:            result.value,
      fingerprint,
      normalizerVersion: NORMALIZER_VERSION,
    });
  }

  return { validated, quarantined, versionsBumped };
}

// ─────────────────────────────────────────────────────────────────────────────
// makeReplayProvider — wrap real adapter, swap fetchRecords for snapshot stream
// ─────────────────────────────────────────────────────────────────────────────

function makeReplayProvider(
  base: SyncProvider,
  snapshot: CapturedSnapshot,
): SyncProvider {
  return {
    slug:        base.slug,
    displayName: base.displayName,
    country:     base.country,
    metadata:    base.metadata,
    healthCheck: base.healthCheck,
    normalize:   base.normalize,
    fetchRecords: async function* () {
      // Yield each raw payload from the snapshot back as if it were a
      // fresh fetch. The pipeline will re-normalize and re-fingerprint.
      for (const v of snapshot.validated)   yield v.raw;
      for (const q of snapshot.quarantined) yield q.raw;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence helpers — sync_replays audit table
// ─────────────────────────────────────────────────────────────────────────────

async function openReplayRow(
  replayId:  string,
  snapshot:  CapturedSnapshot,
  opts:      ReplayOpts,
): Promise<void> {
  const { pool } = await import("../db");
  await pool.query(
    `INSERT INTO sync_replays
      (id, source_snapshot_id, mode, triggered_by,
       normalizer_version, fingerprint_version,
       started_at, status, notes)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'running', $7)`,
    [
      replayId,
      snapshot.id,
      opts.mode,
      opts.triggeredBy,
      NORMALIZER_VERSION,
      FINGERPRINT_VERSION,
      opts.notes ?? null,
    ],
  );
}

async function closeReplayRow(
  replayId: string,
  status: "succeeded" | "failed",
  resultingRunId?: string,
): Promise<void> {
  const { pool } = await import("../db");
  await pool.query(
    `UPDATE sync_replays
        SET finished_at = NOW(),
            status      = $2,
            resulting_run_id = COALESCE($3, resulting_run_id)
      WHERE id = $1`,
    [replayId, status, resultingRunId ?? null],
  );
}
