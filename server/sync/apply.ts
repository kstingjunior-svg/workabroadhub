/**
 * Sync Engine — apply (Milestone 2).
 *
 * Takes a ChangeSet and persists it to nea_agencies + agency_change_log in
 * a single Postgres transaction. Idempotent on re-apply (an unchanged
 * fingerprint produces no writes; a re-applied identical run is a no-op
 * on the data, but still creates fresh agency_change_log rows ONLY for
 * net-new changes).
 *
 * Architectural notes:
 *
 *   1. **One transaction, all-or-nothing.** Created + updated + deleted
 *      writes plus their agency_change_log entries all live inside one
 *      pool.connect() → BEGIN/COMMIT. A mid-flight failure rolls back
 *      everything. SRS NFR-2 satisfied.
 *
 *   2. **Touch last_seen_at on unchanged rows OUTSIDE the main critical
 *      path.** They don't carry diff information, but we still want to
 *      know "still in source as of run N". They're batched at the end of
 *      the same transaction so they get the same all-or-nothing guarantee.
 *
 *   3. **agency_change_log is append-only.** Apply NEVER updates an
 *      existing log row. A re-applied identical run produces zero log
 *      rows (because zero net diffs). A re-applied DIFFERENT run
 *      produces only the new entries.
 *
 *   4. **Deleted → status_source='expired', not hard-delete.** SRS §16
 *      "deleted-from-source"; admin may still claim/investigate. The
 *      public list-filter respects status_source.
 *
 *   5. **Returns counts + per-bin id arrays.** The M2 engine wrapper
 *      writes the counts to sync_runs; tests assert on the ids.
 */

import type { PoolClient } from "pg";
import type { ChangeSet } from "./diff";
import {
  insertSyncRecords,
  markAgencyDeletedFromSource,
  touchAgencyLastSeen,
  upsertAgency,
  withTransaction,
  writeChangeLog,
  type ChangeLogInput,
} from "./storage";
import type { ValidatedRecord, QuarantinedRecord } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface ApplyContext {
  providerId: string;
  runId:      string;
  /** Who/what triggered the run. Stamped on agency_change_log.performed_by. */
  performedBy: string;
  /** Free-form reason; null for scheduled runs. */
  reason?: string | null;
}

export interface ApplyResult {
  createdCount:   number;
  updatedCount:   number;
  unchangedCount: number;
  deletedCount:   number;
  changeLogCount: number;
  createdAgencyIds: string[];
  updatedAgencyIds: string[];
  deletedAgencyIds: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// applyChangeSet()
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist the change set. Single transaction. Returns counts + ids for
 * the engine to write to sync_runs and for tests to assert against.
 *
 * The `validated`/`quarantined` lists are persisted to sync_records inside
 * the same transaction so a rolled-back apply also rolls back the
 * sync_records insert — keeping the per-run audit row consistent with
 * what landed on nea_agencies.
 */
/**
 * RC1 atomic-transaction entry point. Runs the same writes as
 * applyChangeSet, but inside a caller-supplied PoolClient — so the
 * sync-runner can wrap this PLUS the snapshot + events + run-status update
 * in ONE COMMIT. The M2 wrapper below preserves the original signature
 * for M2 callers and tests.
 */
export async function applyChangeSetCore(
  client: PoolClient,
  changes: ChangeSet,
  ctx: ApplyContext,
  validated:   ReadonlyArray<ValidatedRecord>,
  quarantined: ReadonlyArray<QuarantinedRecord>,
  normalizerVersion: string,
): Promise<ApplyResult> {
  const createdAgencyIds: string[] = [];
  const updatedAgencyIds: string[] = [];
  const deletedAgencyIds: string[] = [];
  const changeLogEntries: ChangeLogInput[] = [];

  await applyInner(
    client, changes, ctx, validated, quarantined, normalizerVersion,
    createdAgencyIds, updatedAgencyIds, deletedAgencyIds, changeLogEntries,
  );

  return {
    createdCount:   changes.created.length,
    updatedCount:   changes.updated.length,
    unchangedCount: changes.unchanged.length,
    deletedCount:   changes.deleted.length,
    changeLogCount: changeLogEntries.length,
    createdAgencyIds,
    updatedAgencyIds,
    deletedAgencyIds,
  };
}

export async function applyChangeSet(
  changes: ChangeSet,
  ctx: ApplyContext,
  validated:   ReadonlyArray<ValidatedRecord>,
  quarantined: ReadonlyArray<QuarantinedRecord>,
  normalizerVersion: string,
): Promise<ApplyResult> {
  const createdAgencyIds: string[] = [];
  const updatedAgencyIds: string[] = [];
  const deletedAgencyIds: string[] = [];
  const changeLogEntries: ChangeLogInput[] = [];

  await withTransaction(async (client) => {
    await applyInner(
      client, changes, ctx, validated, quarantined, normalizerVersion,
      createdAgencyIds, updatedAgencyIds, deletedAgencyIds, changeLogEntries,
    );
  });

  return {
    createdCount:   changes.created.length,
    updatedCount:   changes.updated.length,
    unchangedCount: changes.unchanged.length,
    deletedCount:   changes.deleted.length,
    changeLogCount: changeLogEntries.length,
    createdAgencyIds,
    updatedAgencyIds,
    deletedAgencyIds,
  };
}

/**
 * Inner body — runs every write inside the caller-supplied PoolClient. Used
 * by both applyChangeSet (own transaction) and applyChangeSetCore
 * (caller's transaction, RC1 atomic path).
 */
async function applyInner(
  client: PoolClient,
  changes: ChangeSet,
  ctx: ApplyContext,
  validated:   ReadonlyArray<ValidatedRecord>,
  quarantined: ReadonlyArray<QuarantinedRecord>,
  normalizerVersion: string,
  createdAgencyIds: string[],
  updatedAgencyIds: string[],
  deletedAgencyIds: string[],
  changeLogEntries: ChangeLogInput[],
): Promise<void> {
  {
    // ── 1. Persist sync_records (raw + normalized + quarantine). ─────────────
    await insertSyncRecords(
      ctx.runId, ctx.providerId, normalizerVersion,
      validated, quarantined, client,
    );

    // ── 2. Created: upsert + change-log. ─────────────────────────────────────
    for (const c of changes.created) {
      const { id, wasCreated } = await upsertAgency(
        ctx.providerId, c.agency, c.fingerprint, client,
      );
      // wasCreated should be true for entries in the created bin; if it
      // came back false it means a race or stale diff — log as "updated"
      // for accuracy and let the test suite catch the divergence.
      if (wasCreated) {
        createdAgencyIds.push(id);
        changeLogEntries.push({
          agencyId:   id,
          providerId: ctx.providerId,
          runId:      ctx.runId,
          changeType: "created",
          fieldChanges: agencyToFieldDict(c.agency),
          performedBy: ctx.performedBy,
          reason:      ctx.reason ?? null,
        });
      } else {
        updatedAgencyIds.push(id);
        changeLogEntries.push({
          agencyId:   id,
          providerId: ctx.providerId,
          runId:      ctx.runId,
          changeType: "updated",
          fieldChanges: { "(diff-race)": { from: "created-bin", to: "row-existed" } },
          performedBy: ctx.performedBy,
          reason:      ctx.reason ?? null,
        });
      }
    }

    // ── 3. Updated: upsert (same query path) + per-field change log. ────────
    for (const u of changes.updated) {
      const { id } = await upsertAgency(
        ctx.providerId, u.agency, u.fingerprint, client,
      );
      updatedAgencyIds.push(id);
      changeLogEntries.push({
        agencyId:   id,
        providerId: ctx.providerId,
        runId:      ctx.runId,
        changeType: "updated",
        fieldChanges: u.fieldChanges,
        performedBy: ctx.performedBy,
        reason:      ctx.reason ?? null,
      });
    }

    // ── 4. Deleted: status_source flip + change log. ────────────────────────
    for (const d of changes.deleted) {
      await markAgencyDeletedFromSource(d.agencyId, client);
      deletedAgencyIds.push(d.agencyId);
      changeLogEntries.push({
        agencyId:    d.agencyId,
        providerId:  ctx.providerId,
        runId:       ctx.runId,
        changeType:  "deleted",
        fieldChanges: {
          status_source: { from: d.before.statusSource, to: "expired" },
        },
        performedBy: ctx.performedBy,
        reason:      ctx.reason ?? "Absent from source on this run",
      });
    }

    // ── 5. Unchanged: touch last_seen_at; NO change-log entry. ──────────────
    for (const u of changes.unchanged) {
      await touchAgencyLastSeen(u.agencyId, client);
    }

    // ── 6. Bulk-write all change-log entries. ───────────────────────────────
    await writeChangeLog(changeLogEntries, client);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal — render a full NormalizedAgency as a field_changes dict for
// the "created" log entry. There's no before, so `from` is null for every
// field; this keeps the JSON shape consistent across created/updated rows
// in the admin UI's "what changed?" panel.
// ─────────────────────────────────────────────────────────────────────────────

function agencyToFieldDict(
  a: import("./types").NormalizedAgency,
): Record<string, { from: unknown; to: unknown }> {
  return {
    agencyName:    { from: null, to: a.agencyName },
    licenseNumber: { from: null, to: a.licenseNumber },
    country:       { from: null, to: a.country },
    serviceType:   { from: null, to: a.serviceType },
    email:         { from: null, to: a.email },
    website:       { from: null, to: a.website },
    phone:         { from: null, to: a.phone },
    issueDate:     { from: null, to: a.issueDate },
    expiryDate:    { from: null, to: a.expiryDate },
    statusSource:  { from: null, to: a.statusSource },
  };
}
