"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyChangeSetCore = applyChangeSetCore;
exports.applyChangeSet = applyChangeSet;
const storage_1 = require("./storage");
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
async function applyChangeSetCore(client, changes, ctx, validated, quarantined, normalizerVersion) {
    const createdAgencyIds = [];
    const updatedAgencyIds = [];
    const deletedAgencyIds = [];
    const changeLogEntries = [];
    await applyInner(client, changes, ctx, validated, quarantined, normalizerVersion, createdAgencyIds, updatedAgencyIds, deletedAgencyIds, changeLogEntries);
    return {
        createdCount: changes.created.length,
        updatedCount: changes.updated.length,
        unchangedCount: changes.unchanged.length,
        deletedCount: changes.deleted.length,
        changeLogCount: changeLogEntries.length,
        createdAgencyIds,
        updatedAgencyIds,
        deletedAgencyIds,
    };
}
async function applyChangeSet(changes, ctx, validated, quarantined, normalizerVersion) {
    const createdAgencyIds = [];
    const updatedAgencyIds = [];
    const deletedAgencyIds = [];
    const changeLogEntries = [];
    await (0, storage_1.withTransaction)(async (client) => {
        await applyInner(client, changes, ctx, validated, quarantined, normalizerVersion, createdAgencyIds, updatedAgencyIds, deletedAgencyIds, changeLogEntries);
    });
    return {
        createdCount: changes.created.length,
        updatedCount: changes.updated.length,
        unchangedCount: changes.unchanged.length,
        deletedCount: changes.deleted.length,
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
async function applyInner(client, changes, ctx, validated, quarantined, normalizerVersion, createdAgencyIds, updatedAgencyIds, deletedAgencyIds, changeLogEntries) {
    {
        // ── 1. Persist sync_records (raw + normalized + quarantine). ─────────────
        await (0, storage_1.insertSyncRecords)(ctx.runId, ctx.providerId, normalizerVersion, validated, quarantined, client);
        // ── 2. Created: upsert + change-log. ─────────────────────────────────────
        for (const c of changes.created) {
            const { id, wasCreated } = await (0, storage_1.upsertAgency)(ctx.providerId, c.agency, c.fingerprint, client);
            // wasCreated should be true for entries in the created bin; if it
            // came back false it means a race or stale diff — log as "updated"
            // for accuracy and let the test suite catch the divergence.
            if (wasCreated) {
                createdAgencyIds.push(id);
                changeLogEntries.push({
                    agencyId: id,
                    providerId: ctx.providerId,
                    runId: ctx.runId,
                    changeType: "created",
                    fieldChanges: agencyToFieldDict(c.agency),
                    performedBy: ctx.performedBy,
                    reason: ctx.reason ?? null,
                });
            }
            else {
                updatedAgencyIds.push(id);
                changeLogEntries.push({
                    agencyId: id,
                    providerId: ctx.providerId,
                    runId: ctx.runId,
                    changeType: "updated",
                    fieldChanges: { "(diff-race)": { from: "created-bin", to: "row-existed" } },
                    performedBy: ctx.performedBy,
                    reason: ctx.reason ?? null,
                });
            }
        }
        // ── 3. Updated: upsert (same query path) + per-field change log. ────────
        for (const u of changes.updated) {
            const { id } = await (0, storage_1.upsertAgency)(ctx.providerId, u.agency, u.fingerprint, client);
            updatedAgencyIds.push(id);
            changeLogEntries.push({
                agencyId: id,
                providerId: ctx.providerId,
                runId: ctx.runId,
                changeType: "updated",
                fieldChanges: u.fieldChanges,
                performedBy: ctx.performedBy,
                reason: ctx.reason ?? null,
            });
        }
        // ── 4. Deleted: status_source flip + change log. ────────────────────────
        for (const d of changes.deleted) {
            await (0, storage_1.markAgencyDeletedFromSource)(d.agencyId, client);
            deletedAgencyIds.push(d.agencyId);
            changeLogEntries.push({
                agencyId: d.agencyId,
                providerId: ctx.providerId,
                runId: ctx.runId,
                changeType: "deleted",
                fieldChanges: {
                    status_source: { from: d.before.statusSource, to: "expired" },
                },
                performedBy: ctx.performedBy,
                reason: ctx.reason ?? "Absent from source on this run",
            });
        }
        // ── 5. Unchanged: touch last_seen_at; NO change-log entry. ──────────────
        for (const u of changes.unchanged) {
            await (0, storage_1.touchAgencyLastSeen)(u.agencyId, client);
        }
        // ── 6. Bulk-write all change-log entries. ───────────────────────────────
        await (0, storage_1.writeChangeLog)(changeLogEntries, client);
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// Internal — render a full NormalizedAgency as a field_changes dict for
// the "created" log entry. There's no before, so `from` is null for every
// field; this keeps the JSON shape consistent across created/updated rows
// in the admin UI's "what changed?" panel.
// ─────────────────────────────────────────────────────────────────────────────
function agencyToFieldDict(a) {
    return {
        agencyName: { from: null, to: a.agencyName },
        licenseNumber: { from: null, to: a.licenseNumber },
        country: { from: null, to: a.country },
        serviceType: { from: null, to: a.serviceType },
        email: { from: null, to: a.email },
        website: { from: null, to: a.website },
        phone: { from: null, to: a.phone },
        issueDate: { from: null, to: a.issueDate },
        expiryDate: { from: null, to: a.expiryDate },
        statusSource: { from: null, to: a.statusSource },
    };
}
