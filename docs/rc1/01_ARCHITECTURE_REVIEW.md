# RC1 Report 1 — Architecture Review

**Engine:** WorkAbroad Hub Agency Synchronization Engine
**Release Candidate:** RC1
**Date:** 2026-06-29

---

## What the engine is

A pure-function pipeline that converts upstream agency listings into
canonical `nea_agencies` rows while producing a per-run audit trail
(events, snapshot, anomalies, change log) and a per-run quality + safety
summary. The engine is provider-agnostic: NEA-KE is the first adapter,
but the pipeline does not depend on it.

## High-level shape

```
   ┌──────────────┐
   │   Provider   │  fetchRecords(): yields raw payloads
   │   Adapter    │
   └──────┬───────┘
          │ raw[]
   ┌──────▼───────────────────────────────────────────────┐
   │              Foundation Pipeline (pure)              │
   │ ─ normalize → validate → fingerprint                 │
   │ ─ outputs: validated[], quarantined[], raw[]         │
   └──────┬───────────────────────────────────────────────┘
          │
          │  ┌───────────────────────────────────────────┐
          ├─►│  Schema Drift Detection (P3)              │
          │  └───────────────────────────────────────────┘
          │
          │  ┌───────────────────────────────────────────┐
          ├─►│  Diff Engine (M2)                         │
          │  │  ─ computeDiff(current, validated)        │
          │  │  ─ {created, updated, unchanged, deleted} │
          │  └───────────────────────────────────────────┘
          │
          │  ┌───────────────────────────────────────────┐
          ├─►│  Safety Gate (M3) — pure evaluateSafety   │
          │  └───────────────────────────────────────────┘
          │
          │  ┌───────────────────────────────────────────┐
          ├─►│  Data Quality Report (M3) — pure          │
          │  └───────────────────────────────────────────┘
          │
          │  ┌───────────────────────────────────────────┐
          ├─►│  Confidence Score (P4) — pure             │
          │  └───────────────────────────────────────────┘
          │
   ┌──────▼─────────────────── ATOMIC BLOCK ──────────────┐
   │      ONE withTransaction — ONE COMMIT — RC1-P1       │
   │                                                      │
   │  1. captureSnapshot()                                │
   │  2. applyChangeSetCore() (unless held / shadow / dry)│
   │  3. writeAnomalies() (if held)                       │
   │  4. emit Agency* + Synchronization* events           │
   │  5. buffer.flush() → sync_events                     │
   │  6. UPDATE sync_runs.data_quality_report             │
   │  7. updateRunStatus() → sync_runs.status terminal    │
   └──────────────────────────────────────────────────────┘
                              │
                              ▼
                ┌─────────────────────────┐
                │  Provider Health update │
                │  Performance Report     │
                │  Confidence Score       │
                │  Schema Signature bump  │
                │  (post-COMMIT, separate │
                │   tiny transactions)    │
                └─────────────────────────┘
```

## Why this shape

1. **Pure-function pipeline.** Normalize, validate, fingerprint, diff,
   safety, drift, quality, confidence — all pure. Same inputs always
   yield the same outputs. This is what makes the Replay Engine
   possible: feed a snapshot back in, and you get the same answer.

2. **One COMMIT for the run.** ADR 0004 ratifies that the synchronization
   run is an atomic database event. Either every row that should appear
   together appears together, or none of them do. This was the central
   correctness improvement of RC1.

3. **Snapshot-first.** Every run captures a JSONL.gz snapshot of the
   raw + validated + quarantined payloads BEFORE applying changes. This
   underwrites the Replay Engine, anomaly forensics, and disaster
   recovery without re-fetching from upstream.

4. **Event Store as canonical audit trail.** Per ADR 0003, sync_events
   is the source of truth for "what happened". sync_runs is the
   denormalized header for fast dashboard queries.

5. **Versioned at every layer.** NORMALIZER_VERSION,
   FINGERPRINT_VERSION, ADAPTER_VERSION, SchemaSignature.version,
   PerformanceReport.version, DataQualityReport.version,
   ConfidenceScore.version, SCHEMA_DRIFT_REPORT_VERSION,
   SHADOW_VERIFICATION_REPORT_VERSION. Every artifact carries its
   schema version so changing one of them is a tracked operation, not
   a silent format drift.

## Module map

| File | Role | Pure? |
|---|---|---|
| `server/sync/types.ts` | Shared types + `SyncProvider` interface | yes |
| `server/sync/normalize.ts` | Field normalization | yes |
| `server/sync/validation.ts` | Zod validation | yes |
| `server/sync/fingerprint.ts` | sha-256 record fingerprint | yes |
| `server/sync/engine.ts` | Foundation pipeline | yes |
| `server/sync/diff.ts` | computeDiff → ChangeSet | yes |
| `server/sync/safety.ts` | Pure anomaly evaluator | yes |
| `server/sync/quality-report.ts` | Pure quality report builder | yes |
| `server/sync/schema-drift.ts` (P3) | Pure drift detector | yes |
| `server/sync/confidence.ts` (P4) | Pure confidence score | yes |
| `server/sync/performance.ts` (P7) | Phase recorder + baselines | yes/IO |
| `server/sync/events.ts` | Buffered Event Store writer | IO |
| `server/sync/snapshot.ts` | Snapshot capture + restore | IO |
| `server/sync/health.ts` | Provider health probe + state machine | IO + pure |
| `server/sync/apply.ts` | `applyChangeSetCore` (RC1) + `applyChangeSet` (M2) | IO |
| `server/sync/storage.ts` | Drizzle / SQL primitives | IO |
| `server/sync/replay.ts` (P2) | Replay Engine | IO + pure |
| `server/sync/shadow.ts` (P6) | Shadow runner + verification report | IO + pure |
| `server/sync/hardening.ts` (P8) | Advisory locks + config guard + GC | IO + pure |
| `server/sync/sync-runner-rc1.ts` (P1) | Atomic-transaction runner | IO |
| `server/routes/admin-sync-dashboard.ts` (P5) | Admin metrics API | IO |
| `server/sync/providers/nea-ke.ts` | First adapter | IO |

Plus three database migrations:

- `0007_sync_engine_m1.sql` — core sync_* tables + nea_agencies extensions
- `0008_sync_engine_m3.sql` — sync_events + sync_snapshots + sync_anomalies
- `0009_sync_engine_rc1.sql` — RC1 columns + sync_replays + advisory-lock convention

And four ADRs:

- `0001-sync-engine-foundation.md`
- `0002-raw-import-versioning-capabilities.md`
- `0003-event-store.md`
- `0004-rc1-atomic-transactions.md`

## Boundary discipline

- Sync engine writes ONLY to: `sync_runs`, `sync_records`, `sync_events`,
  `sync_anomalies`, `sync_snapshots`, `sync_replays`, `sync_providers`,
  `agency_change_log`, `nea_agencies`.
- Sync engine does NOT touch: `users`, `subscriptions`, `payments`,
  `service_orders`, `cv_fix_jobs`, Kenya-Careers tables, M-Pesa flows.
- Frontend never imports anything from `server/sync/**`.
- The CV Fix Lite cross-grant separation rule is unaffected: sync
  engine and subscription engine share no code paths.

## Strengths

- Deterministic pipeline → replayable, testable, predictable.
- One COMMIT per run → no partial-state hazards.
- Snapshot-first → forensic & disaster-recovery capable.
- Provider-agnostic → adding UAE / Saudi / Qatar is "implement
  SyncProvider, register row, ship."
- Heavy versioning → safe to evolve.

## Weaknesses (acknowledged)

- Snapshot file upload precedes its DB row → orphan-blob possibility
  on rollback (mitigated by GC reporter; full fix deferred).
- Pre-transaction phase holds memory for the full raw + validated +
  quarantined arrays. For NEA-KE (~580 records) this is well under
  10 MB. For a future provider with 1 M records this becomes a
  consideration — streaming refactor will be needed.
- Only one adapter exists today (NEA-KE). The provider-agnostic claim
  is structural, not empirical, until the second adapter ships.
