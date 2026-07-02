# ADR 0004 — RC1: Atomic Synchronization Transactions

**Status:** Accepted
**Date:** 2026-06-29
**Milestone:** Release Candidate 1 (RC1), Priority 1
**Supersedes:** None (extends M2 apply.ts, M3 sync-runner)
**Related:** ADR 0001 (Foundation), ADR 0002 (Versioning & Raw Import), ADR 0003 (Event Store)

---

## Context

By the end of Milestone 3 the synchronization runner produced six families
of writes that, taken together, are the canonical record of one run:

1. `sync_records`  — per-record raw + normalized + quarantine audit
2. `nea_agencies`  — upserts, status flips, last-seen touches
3. `agency_change_log` — append-only per-field change history
4. `sync_anomalies` — anomaly rows when the safety gate trips
5. `sync_snapshots` — JSONL.gz snapshot row + checksum
6. `sync_events`   — the discriminated-union event store

In the M3 runner (`server/sync/sync-runner-m3.ts`) these were emitted
across **three separate `withTransaction` blocks**:

- TX-A: snapshot capture + (held-path) anomaly writes + held-path events
- TX-B: `applyChangeSet` — its own internal transaction
- TX-C: lifecycle events + buffer flush

Plus a final `updateRunStatus` call on the bare pool (no transaction).

**The hazard:** any crash, network blip, or unhandled error between
COMMIT-A and COMMIT-B (or between B and C) leaves the database in a
state that the RC1 invariant explicitly forbids:

> **There must never be a situation where events exist without
> corresponding database changes (or vice versa).**
>   — Tony, RC1 directive, Priority 1

A real example: TX-B succeeds (agencies are updated, change-log written),
the process is then killed mid-TX-C, and the corresponding
`AgencyCreated` events are lost. The Event Store now lies: the audit
trail is incomplete, and there is no signal to the operator that this
happened.

## Decision

**One COMMIT — and only one — covers the entire write portion of a
synchronization run.** That commit covers, atomically:

- `sync_records` (raw + validated + quarantined audit rows)
- `nea_agencies` (creates, updates, soft-deletes, last-seen touches)
- `agency_change_log` (per-field history)
- `sync_anomalies` (when safety gate trips)
- `sync_snapshots` (row only; the file body is uploaded separately)
- `sync_events` (every event from this run's `EventBuffer`)
- `sync_runs.data_quality_report` (JSONB report)
- `sync_runs.status` and `sync_runs.finished_at` (terminal transition)

If **any** step inside this block raises, the transaction rolls back and
the run leaves zero footprint in the atomic block's six tables. A
best-effort recovery handler then opens a *separate* tiny transaction to
record the failure: it inserts a `SynchronizationFailed` event and sets
`sync_runs.status = 'failed'` so that the run cannot stay stuck in
`'running'` forever. This recovery write is on a separate transaction
**by design** — it must not interfere with the rollback of the main
block, and the operator's preferred outcome (failed → visible) is more
important than perfect atomicity for the failure breadcrumb itself.

The pre-transaction phase remains a pure read/compute pipeline:

- `runHealthCheck` (own tiny tx for the transition row only)
- `createRun` (own tiny tx for the `INSERT RETURNING`)
- `runFoundation` (memory only — fetch + normalize + validate + fingerprint)
- `readCurrentAgenciesByProvider` (read-only query)
- `computeDiff` (pure)
- `evaluateSafety` (pure)
- `generateDataQualityReport` (pure)

By keeping these outside the atomic block, the block stays short.
Lock contention on `nea_agencies` and `sync_events` is bounded by the
duration of the writes — not the duration of fetching the provider's
upstream.

## Implementation

### apply.ts refactor

`applyChangeSet` is preserved as a backward-compatible M2 entry point
that opens its own `withTransaction`. A new exported function:

```ts
export async function applyChangeSetCore(
  client: PoolClient,
  changes: ChangeSet,
  ctx: ApplyContext,
  validated:   ReadonlyArray<ValidatedRecord>,
  quarantined: ReadonlyArray<QuarantinedRecord>,
  normalizerVersion: string,
): Promise<ApplyResult>
```

takes a caller-supplied `PoolClient`. Both functions delegate to a
private `applyInner` helper containing the actual write logic, so the
M2 wrapper and the RC1 atomic path share identical semantics.

### sync-runner-rc1.ts

A new runner (separate file — does not replace M3) implements the single-
commit lifecycle. The atomic block is approximately:

```ts
await withTransaction(async (client) => {
  snapshot = await captureSnapshot(snapshotStore, {...}, client);

  if (willApply) {
    apply = await applyChangeSetCore(client, changes, ctx, ...);
    emitAgencyCreated/Updated/Removed(buffer, ...);
  }

  if (isHeld) {
    await writeAnomalies(client, runId, safety);
    emitSynchronizationFailed(buffer, {...reason: "held_for_review"});
  } else {
    emitSynchronizationCompleted(buffer, {...});
  }

  await buffer.flush(client);

  await client.query(
    `UPDATE sync_runs SET data_quality_report = $2::jsonb WHERE id = $1`,
    [runId, JSON.stringify(qualityReport)],
  );

  await updateRunStatus(runId, {...}, client);
});
```

`updateRunStatus` already accepts an optional `PoolClient` parameter
(M2), so no further storage-layer change was required.

### Snapshot file uploads

`captureSnapshot` writes both a JSONL.gz file (via the `SnapshotStore`)
and a row in `sync_snapshots`. The file is uploaded *before* the row is
inserted; if the transaction rolls back, the file becomes an orphan
blob.

We accept this for two reasons:

1. The alternative (deferring the upload until after COMMIT) re-
   introduces cross-transaction inconsistency.
2. Orphan blobs are cheap on object storage and trivially garbage-
   collected by joining the bucket listing against `sync_snapshots.id`.

A periodic GC job is documented as a P8 (Operational Hardening) item.

## Consequences

**Positive:**

- The RC1 invariant is satisfied by construction. Events cannot exist
  without their matching DB changes; DB changes cannot exist without
  their matching events.
- The runner is easier to reason about: there is exactly one place where
  "the run becomes real."
- The recovery path is now distinct from the success path, making
  partial-write scenarios impossible.

**Negative:**

- The atomic block holds a database connection for longer than M3's
  individual blocks did (roughly the sum of M3's TX-A + TX-B + TX-C).
  On a real run this is dominated by the `applyChangeSetCore` upserts.
  For NEA-KE (~580 agencies), measurements should be well under 5
  seconds; the connection-pool ceiling guards against starvation.
- The snapshot file upload happens inside the transaction window. For
  large providers we will eventually want to write the JSONL bytes to a
  staging area, then atomically move + INSERT inside the tx. Tracked
  as a P7 (Performance Validation) follow-up.
- An orphan-blob GC job is now a recurring operational obligation
  (low frequency; tracked under P8).

**Tested by:** RC1-Testing integration suite (Task #38) will include:

- successful end-to-end run → six tables all written, one COMMIT
- crash injection between `applyChangeSetCore` and `buffer.flush` →
  zero writes in any of the six tables; status='failed' visible
- held-for-review run → snapshot + anomalies + events committed
  together; no `nea_agencies` writes
- dry-run mode → snapshot + events committed together; no
  `nea_agencies` writes; no `sync_records` writes for non-validated

## Alternatives Considered

**Keep the M3 three-transaction layout and add a reconciliation job.**
Rejected: forces operators to trust a separate background job for
correctness. Detection of inconsistency is post-hoc and the window for
data-driven decisions made on an inconsistent state remains open.

**Two-phase commit across snapshot upload and DB writes.**
Rejected: no Postgres-side coordinator with the object store; we'd be
building a custom 2PC layer for marginal benefit over the orphan-blob
GC path.

**Inline the snapshot bytes in `sync_snapshots.body` (bytea).**
Rejected: a 50 MB JSONL.gz body on bytea kills the row-cache for the
table on every read, and Postgres backups become expensive. The
object-store path with a thin DB row is the standard pattern.
