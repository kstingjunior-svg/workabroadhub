# RC1 Production Checklist — Agency Synchronization Engine

This is the operator's runbook for promoting the synchronization engine
from RC1 to production. Each item is **binary**: it's either done or
it's a blocker. Items marked **[blocker]** must be green before any
real run is allowed to write to nea_agencies on production.

Owner: WorkAbroad Hub engineering. Last reviewed: 2026-06-29.

---

## A. Database

- [x] **[blocker]** Migration 0009 (`sync_engine_rc1.sql`) applied to production.
- [x] `sync_runs` has `schema_drift_report`, `confidence_score`,
      `confidence_grade`, `performance_report`,
      `replayed_from_snapshot_id`, `is_shadow` columns.
- [x] `sync_providers.last_schema_signature` column present.
- [x] `sync_replays` table present with `mode`/`status` CHECK constraints.
- [x] Index `sync_runs_provider_finished_idx` exists (dashboard query path).
- [x] Rollback playbook documented inline in 0009.

## B. Environment

- [x] **[blocker]** `DATABASE_URL` set in production (`validateConfigOrPanic`).
- [x] **[blocker]** `SESSION_SECRET` set in production.
- [ ] `SENTRY_DSN` set (soft warning if absent — surfaces exceptions).
- [ ] `UPSTASH_REDIS_REST_URL` set (BullMQ scheduling — required if cron
      scheduling enabled).
- [x] `NODE_ENV=production` on Render.
- [x] No new env vars added without being declared in `.env.example`.

## C. Atomic Transactions (P1)

- [x] **[blocker]** All run writes flow through `sync-runner-rc1.runSyncRc1`.
- [x] M3 runner is NOT wired to any schedule (kept for reference only).
- [x] `applyChangeSetCore(client, ...)` accepts caller's `PoolClient`.
- [x] One `withTransaction` block covers: sync_records, nea_agencies,
      agency_change_log, sync_anomalies, sync_snapshots, sync_events,
      sync_runs.{status, data_quality_report, performance_report,
      confidence_*, schema_drift_report}.
- [x] On exception, a separate tiny tx records `status='failed'` + emits
      `SynchronizationFailed`. Never leave a run in 'running'.
- [x] ADR 0004 documents the design.

## D. Schema Drift Detection (P3)

- [x] `signSchema()` is pure + deterministic.
- [x] `detectSchemaDrift()` correctly classifies: `key_added`,
      `key_removed`, `type_changed`, `presence_dropped`, `case_changed`.
- [x] Case changes do not double-count as add+remove.
- [x] `loadPriorSignature()` returns `null` on first-ever run; runner
      stores the first signature only after the first successful COMMIT.
- [x] Unit tests cover the five finding kinds (`schema-drift.test.ts`).

## E. Confidence Score (P4)

- [x] Six weighted factors sum to weight=1: validity, drift, safety,
      changeRatio, health, performance.
- [x] Letter grades: A ≥ 90, B ≥ 75, C ≥ 60, D ≥ 40, F < 40.
- [x] `topDeductions` returned for fast-glance triage.
- [x] Unit tests cover each factor + cross-cutting cases
      (`confidence.test.ts`).

## F. Replay Engine (P2)

- [x] Three modes implemented: `replay_only`, `replay_preview`, `replay_apply`.
- [x] Replays never touch the upstream provider (no fetch).
- [x] `replay_apply` invokes the RC1 atomic runner with
      `replayedFromSnapshotId` tag.
- [x] `sync_replays` audit row opened + closed in all paths.
- [x] **[blocker]** A `replay_apply` test run executed against the most
      recent snapshot in dev produces the same diff counts as the
      original run.

## G. Shadow Mode (P6)

- [x] `runShadowSync()` sets `isShadow=true` on the runner.
- [x] Shadow runs skip `applyChangeSetCore` AND the Agency*
      lifecycle events (otherwise the events would lie).
- [x] Shadow runs still record sync_records, sync_events,
      sync_snapshots, sync_runs.
- [x] `sync_runs.is_shadow = TRUE` filtered out of dashboard's
      "last 24h" success-rate KPI.
- [x] `generateShadowVerificationReport()` returns a promote / retry /
      do_not_promote recommendation.

## H. Performance Validation (P7)

- [x] `PerformanceRecorder` wraps each phase via `withPhase()`.
- [x] Errors are timed and re-thrown; report shows `errorMessage`.
- [x] `loadPerformanceBaseline()` computes p50/p95 over the last 20
      non-shadow successful runs.
- [x] Confidence score docks for `durationMs > 2× expected`.

## I. Developer Operations Dashboard (P5)

- [x] All endpoints behind `isAuthenticated + isAdmin`.
- [x] No PII exposed beyond what already lives on nea_agencies.
- [x] Dashboard surfaces: providers, last-run-per-provider,
      24h success rate, anomalies, snapshots, events.
- [ ] **[blocker]** Dashboard route registered in `server/routes.ts`
      via `registerSyncDashboardRoutes(app)` — verify after merge.

## J. Operational Hardening (P8)

- [x] Per-provider Postgres advisory lock prevents overlapping runs.
- [x] `validateConfigOrPanic()` called at boot before provider
      registration.
- [x] Orphan-snapshot GC reporter exists (deletion opt-in).
- [x] 10 hardening findings catalogued in `HARDENING_AUDIT`.

## K. Testing

- [x] Vitest suite passes locally (`npm test`):
      types, normalize, fingerprint, validation, diff, apply,
      events, snapshot, safety, health, quality-report,
      schema-drift, confidence, performance, hardening, shadow.
- [ ] **[blocker]** Integration test against a real Postgres in CI:
      a clean run end-to-end + a forced rollback that leaves zero rows
      in any of the six atomic-block tables.

## L. Operational Runbook

- [x] ADR 0001 (Foundation), 0002 (Versioning + Capabilities),
      0003 (Event Store), 0004 (Atomic Transactions) all checked in.
- [ ] **[blocker]** On-call playbook posted with: how to read the
      dashboard, how to interpret confidence grades, how to launch a
      `replay_preview`, how to roll back via migration 0009 rollback.

## M. Security

- [x] Sync engine never logs raw `SUPABASE_SERVICE_ROLE_KEY`.
- [x] Admin routes require `isAdmin`.
- [x] No new public endpoints added.
- [x] CV Fix Lite separation rule unaffected (sync engine touches
      `nea_agencies` only — never `users.plan` or `subscriptions`).
- [x] Kenya Careers independence rule unaffected.
- [x] M-Pesa flow unaffected.

## N. Outstanding (open work that does NOT block production)

- [ ] Adapters beyond NEA-KE (UAE, Saudi, Qatar) — future milestone.
- [ ] Public-facing rollback UI — not required for RC1.
- [ ] Periodic orphan-GC job wired to cron — manual-trigger
      sufficient for v1.
- [ ] Notifications (Slack/email) on `held_for_review` — manual
      dashboard polling sufficient for v1.
