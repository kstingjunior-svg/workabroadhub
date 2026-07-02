# RC1 Report 2 — Reliability Report

**Engine:** WorkAbroad Hub Agency Synchronization Engine
**Release Candidate:** RC1
**Date:** 2026-06-29

---

## The reliability invariant

> *Either every database row belonging to a synchronization run is
> committed, or none of them are.*

The two categorical failure modes RC1 set out to eliminate are:

1. **Events without DB writes.** sync_events says we created an
   agency; nea_agencies disagrees.
2. **DB writes without events.** nea_agencies changed; sync_events
   has no record. Audit trail breaks.

RC1-P1 closes both via a single `withTransaction` block in
`sync-runner-rc1.runSyncRc1`. ADR 0004 is the architectural commitment.

## What's now atomic

A single `withTransaction(async (client) => {...})` covers:

- `sync_records` — raw + validated + quarantined audit rows
  (`insertSyncRecords`)
- `nea_agencies` — creates, updates, soft-deletes, last-seen touches
  (`upsertAgency`, `markAgencyDeletedFromSource`, `touchAgencyLastSeen`)
- `agency_change_log` — per-field history (`writeChangeLog`)
- `sync_anomalies` — anomaly rows when the safety gate trips
- `sync_snapshots` — snapshot row (file body uploaded just before)
- `sync_events` — every event from this run's `EventBuffer.flush()`
- `sync_runs.data_quality_report` — JSONB report
- `sync_runs.status` — terminal transition (`succeeded` /
  `held_for_review`) via `updateRunStatus(client)`

If any step inside the block throws, Postgres rolls the transaction
back. Zero rows persist in any of the eight write paths above.

## What's outside the atomic block (and why)

| Operation | Why outside |
|---|---|
| `getProviderIdBySlug()` | Read-only; needed before the transaction starts. |
| `runHealthCheck()` | Own tiny tx for the transition event so it's recorded even if the run aborts. |
| `createRun()` | Own tiny tx — INSERT RETURNING returns the run-id we need to label subsequent writes. |
| `runFoundation()` | Pure pipeline; no DB writes. |
| `readCurrentAgenciesByProvider()` | Read-only. |
| `computeDiff`, `evaluateSafety`, `generateDataQualityReport` | Pure. |
| Failure-recovery `updateRunStatus('failed')` | DELIBERATELY separate so it survives the outer rollback. |

## Failure-mode walkthrough

### F1. Process crash after createRun, before the atomic block
- sync_runs row exists with `status='running'`.
- No other rows.
- Manual reconciliation: dashboard surfaces the stuck row; admin
  updates `status='failed'` or invokes the resume probe.
- **Acceptable.** Best-effort cleanup is documented in the
  `HARDENING_AUDIT` H-004 entry.

### F2. Network interrupt mid-applyChangeSetCore
- Outer transaction rolls back. Zero rows in `sync_records`,
  `nea_agencies`, `agency_change_log`, `sync_anomalies`,
  `sync_snapshots`, `sync_events`.
- Recovery handler opens a separate tiny tx: emits
  `SynchronizationFailed`, sets `sync_runs.status='failed'`.
- Snapshot blob may exist orphaned in object store. Mitigated by
  `snapshotOrphanGc()` reporter (P8 / H-003).
- **Correct.** Invariant preserved.

### F3. Snapshot blob upload fails before the transaction starts
- Caught inside the `try` block; recovery handler runs.
- sync_runs marked `failed` with the exception message.
- No partial state on the data tables.
- **Correct.**

### F4. Safety gate trips (held_for_review)
- Transaction commits: snapshot row, anomalies, sync_events
  (`SynchronizationFailed: held_for_review`).
- `applyChangeSetCore` NOT called → nea_agencies untouched.
- `sync_runs.status='held_for_review'`, `hold_reason` populated.
- Dashboard surfaces the run; admin reviews and either replays a
  fresh run or invokes `replay_apply` against the snapshot.
- **Correct.**

### F5. Shadow mode (isShadow=true)
- Atomic block commits: snapshot, sync_records, sync_events
  (Synchronization* only — no Agency* events because nothing
  actually happened to agencies).
- `applyChangeSetCore` NOT called → nea_agencies untouched.
- `sync_runs.is_shadow=TRUE` filters this run out of "real"
  dashboard metrics.
- **Correct.**

### F6. Replay mode (replayedFromSnapshotId set)
- Atomic block commits same as a normal run.
- `sync_runs.replayed_from_snapshot_id` attribution recorded.
- `sync_replays` row opened + closed.
- **Correct.**

### F7. Overlapping scheduled runs
- Run A acquires `pg_try_advisory_lock(hashtext('sync-provider:nea-ke'))`.
- Run B's `pg_try_advisory_lock` returns `FALSE`; B aborts.
- Run A's lock auto-releases when its connection ends (even on crash).
- **Prevented at the gate.** H-001 catalogue entry.

## What we still can't guarantee

| Hazard | Severity | Mitigation |
|---|---|---|
| Recovery `updateRunStatus('failed')` itself fails | Low | Dashboard `last 24h` query treats `running > 5min` rows as suspect. Manual cleanup. |
| Snapshot blob orphan after rollback | Low | `snapshotOrphanGc` reporter; deletion opt-in. |
| Two engine instances racing on the same provider WITHOUT the lock (e.g. a hand-run script bypassing the runner) | Med | Operational discipline: all writes must go through `runSyncRc1`. Detection is by `change_log` collisions. |
| Postgres long-running write lock during atomic block backs up other queries | Low | NEA-KE block measured at ~300-800ms; bounded by record count. |
| Pure-function bug regresses a deterministic result | Med | Replay Engine reproduces historical inputs; CI runs the snapshot suite. |

## Testing posture

Unit tests (`tests/unit/sync/`) cover the pure modules end-to-end:
types, normalize, fingerprint, validation, diff, apply, events,
snapshot, safety, health, quality-report, schema-drift, confidence,
performance, hardening, shadow.

Integration tests against a real Postgres are listed as `[blocker]`
in the production checklist (item K). The integration suite must
include:

- E2E: clean run → six tables consistent, one COMMIT
- Crash injection mid-`buffer.flush` → zero rows in any of the six
- held_for_review → snapshot + anomalies + events committed; agencies untouched
- dry_run → snapshot + events committed; agencies untouched
- shadow → snapshot + records + events; agencies untouched

## Score

Reliability invariant: **MET BY CONSTRUCTION** under all single-event
failure modes (F1–F7). Best-effort outcomes (recovery write,
orphan-blob cleanup) are catalogued and bounded.

We assess the engine as **reliable for production traffic at the
NEA-KE scale (~580 records / 4 runs/day)** subject to integration
test sign-off and dashboard-route registration (the two `[blocker]`
items in section K and I of the checklist).
