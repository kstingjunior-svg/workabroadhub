# RC1 Report 3 — Performance Report

**Engine:** WorkAbroad Hub Agency Synchronization Engine
**Release Candidate:** RC1
**Date:** 2026-06-29

---

## Instrumentation

`server/sync/performance.ts` introduces `PerformanceRecorder`, used by
the RC1 runner to bracket each phase. Each phase records (startedAt,
durationMs, errorMessage?), and the final `finalize()` produces a
versioned `PerformanceReport` JSON that gets stored on
`sync_runs.performance_report`.

The dev-ops dashboard plots these per phase, and the confidence score
(P4) docks points when `totalMs > 2× expectedDurationMs`. Baselines
are computed as p50/p95 over the last 20 successful non-shadow runs
via `loadPerformanceBaseline()`.

## Targets

Performance targets are set per-provider in operator documentation,
not in code. For NEA-KE the targets are:

| Phase | Target (NEA-KE, ~580 records) | Notes |
|---|---|---|
| `health_check` | < 1500ms | Upstream HEAD probe with 5s timeout. |
| `fetch` | < 5000ms | Static JSON ≪ paginated source. |
| `normalize` | < 200ms | 580 records, ~0.3ms each. |
| `validate` | < 200ms | Zod once-per-record. |
| `fingerprint` | < 200ms | sha-256 on small payloads. |
| `read_current` | < 500ms | Single SELECT with index. |
| `diff` | < 100ms | In-memory Map ops. |
| `safety_evaluation` | < 50ms | Pure. |
| `drift_detection` | < 50ms | Sample-of-100. |
| `quality_report` | < 50ms | Pure. |
| `apply_transaction` (atomic block) | < 2000ms | 6 writes × O(records) statements. |
| `persist_signature` | < 100ms | Single UPDATE. |
| **TOTAL** | **< 10s** | End-to-end. |

These are dev-environment numbers, measured locally during M3 testing
and during the RC1 atomic-block refactor. Production numbers will be
surfaced as the dashboard accumulates real runs.

## Measured (dev environment, NEA-KE)

| Phase | p50 (ms) | p95 (ms) |
|---|---|---|
| health_check | 280 | 410 |
| fetch | 120 | 180 |
| normalize | 95 | 130 |
| validate | 110 | 150 |
| fingerprint | 60 | 80 |
| read_current | 180 | 240 |
| diff | 22 | 35 |
| safety_evaluation | 8 | 12 |
| drift_detection | 14 | 22 |
| quality_report | 11 | 16 |
| apply_transaction | 720 | 1100 |
| persist_signature | 18 | 30 |
| **TOTAL** | **~1640** | **~2400** |

All well under target. The atomic block dominates wall-clock as
expected (it's the only multi-statement transaction in the lifecycle).

## Atomic-block decomposition

For NEA-KE-scale runs, the 720ms p50 / 1100ms p95 atomic block
breaks down roughly as:

- `captureSnapshot`: ~150ms (file build + upload + 1 INSERT)
- `insertSyncRecords`: ~80ms (~580 INSERTs, batched)
- `upsertAgency` × created/updated: ~250ms (variable; ~2ms/record)
- `markAgencyDeletedFromSource` × deleted: ~40ms (typically <10 deletes)
- `touchAgencyLastSeen` × unchanged: ~100ms (most records)
- `writeChangeLog`: ~30ms (1 batched INSERT)
- `buffer.flush` → sync_events: ~40ms
- `UPDATE sync_runs` (data_quality_report + status): ~10ms

The largest line is the per-record upserts. Future optimization
(P7 follow-up): batch upserts via `INSERT ... ON CONFLICT ... DO UPDATE`
with multi-row VALUES.

## Scaling envelope

The current architecture is comfortably correct up to ~10k records
per run. Beyond that, three things change:

1. **Memory.** Foundation pipeline holds the full validated +
   quarantined arrays. At 100k records × ~1 KB each = 100 MB. At
   1 M records the streaming refactor becomes required.
2. **Atomic block duration.** At ~2ms/upsert, 10k records would
   add ~20s to the block. Connection-pool contention starts to
   bite. Batching is the lever.
3. **Snapshot file size.** JSONL.gz compresses well (~0.2 KB/record
   on NEA payloads), so 10k records ≈ 2 MB compressed — still cheap.
   At 1 M records, splitting the snapshot into chunks would be
   warranted.

For NEA-KE (~580 records, 4 runs/day) and the realistic short-term
expansion to UAE/Saudi/Qatar (each ~5-10k agencies, 1-4 runs/day),
no architectural changes are required.

## Confidence score interplay

The performance factor in the confidence score is `0.10` weight.
A run at 1.0× expected scores 100; 2.0× scores 50; 4.0× scores 0.
For NEA-KE this means a single slow run drops a clean A to B+ at
worst, which is the intended sensitivity — slowness alone shouldn't
veto a run, but it should be visible.

## Dashboard surfaces

- `/api/admin/sync/dashboard` shows last-24h `avgDurationMs`.
- `/api/admin/sync/runs/:runId` returns the full `performance_report`.
- `/api/admin/sync/providers/:slug/health` includes recent run
  durations for a per-provider trend view.

## Score

Performance: **meets all current targets** with substantial headroom.
The instrumentation is in place; baselines will sharpen as
production data accumulates.
