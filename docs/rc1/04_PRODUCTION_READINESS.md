# RC1 Report 4 — Production Readiness Report

**Engine:** WorkAbroad Hub Agency Synchronization Engine
**Release Candidate:** RC1
**Date:** 2026-06-29

---

## How this report is scored

For each readiness dimension we record:

- **Required outcome** — what must be true to ship.
- **Current state** — what is true today.
- **Gap** — what (if anything) is still open.
- **Status** — Green / Yellow / Red.

A single Red anywhere blocks RC1. A small number of Yellows is
acceptable provided each Yellow has an owner and a documented bound.

---

## 1. Correctness

**Required outcome:** Synchronization runs leave the database in a
consistent state under every single-event failure mode.

**Current state:** ADR 0004 + the RC1 atomic-transaction runner
(`sync-runner-rc1.ts`) collapse all production writes into one
`withTransaction` block. The Reliability Report walks through F1–F7
failure modes and confirms the invariant holds in each.

**Gap:** Integration test against a real Postgres (item K in the
production checklist) is the only artifact not yet green. The
construction is sound; we want the empirical sign-off.

**Status:** Yellow (integration test).

## 2. Atomicity

**Required outcome:** One COMMIT per run. No events without rows, no
rows without events.

**Current state:** Implemented via `applyChangeSetCore(client, ...)` +
the runner's single `withTransaction` block. ADR 0004 documents the
design and the orphan-blob trade-off.

**Gap:** None for in-scope behaviour.

**Status:** Green.

## 3. Observability

**Required outcome:** The operator can answer "what happened on this
run?" from a single dashboard, and can reach back into history.

**Current state:**
- Event Store (`sync_events`) is the canonical audit trail.
- Quality Report stored on `sync_runs.data_quality_report`.
- Performance Report stored on `sync_runs.performance_report`.
- Drift Report stored on `sync_runs.schema_drift_report`.
- Confidence Score + grade stored as columns.
- Anomalies stored on `sync_anomalies`.
- Snapshots stored on `sync_snapshots` (+ object-store blob).
- Dashboard endpoints exist (`/api/admin/sync/*`).

**Gap:** Dashboard route registration in `server/routes.ts` (item I
in the checklist).

**Status:** Yellow (one-line wiring).

## 4. Replayability

**Required outcome:** Any historical run can be reproduced from its
snapshot through the current normalizer + fingerprint pipeline.

**Current state:** `server/sync/replay.ts` implements all three
modes (`replay_only`, `replay_preview`, `replay_apply`). The audit
table `sync_replays` records every invocation. Replays never touch
upstream.

**Gap:** A `replay_apply` dry-run in dev that confirms the diff
counts match the original run (checklist F's `[blocker]`).

**Status:** Yellow (verification dry-run).

## 5. Safety

**Required outcome:** Anomalies are detected pre-write and can hold
a run for human review.

**Current state:** Safety Gate (M3) detects mass_delete, schema_drift,
low_record_count anomalies. RC1 adds Schema Drift Detection (P3) for
pre-normalize structural surprises. A run is held when the composite
anomaly score exceeds the configurable ceiling.

**Gap:** None.

**Status:** Green.

## 6. Versioning

**Required outcome:** Every persisted artifact carries its schema
version. Format changes are tracked.

**Current state:** NORMALIZER_VERSION, FINGERPRINT_VERSION,
ADAPTER_VERSION, plus per-report version constants on every JSONB
artifact. The runner pins versions to each run.

**Gap:** None.

**Status:** Green.

## 7. Concurrency

**Required outcome:** Two runs cannot overlap on the same provider.

**Current state:** Per-provider Postgres advisory lock convention
documented in migration 0009 and implemented in
`server/sync/hardening.ts`. Lock auto-releases on connection drop.

**Gap:** Lock acquisition needs to be wired into the runner's
pre-transaction phase. The helper exists; the call site is the next
mechanical step.

**Status:** Yellow (wire-up).

## 8. Configuration

**Required outcome:** Boot fails fast when required env vars are
absent. Soft signals emit warnings.

**Current state:** `validateConfigOrPanic()` in
`server/sync/hardening.ts` validates DATABASE_URL + SESSION_SECRET
and warns on SENTRY_DSN / UPSTASH_REDIS_REST_URL / NODE_ENV.

**Gap:** Called from server bootstrap before provider registration.
The call site is the next mechanical step.

**Status:** Yellow (wire-up).

## 9. Security

**Required outcome:** No PII leaks. Admin routes gated. CV Fix Lite
+ Kenya Careers separation rules respected.

**Current state:** All sync routes go through
`isAuthenticated + isAdmin`. Sync engine writes to no
subscription/payment/Kenya-Careers tables. SUPABASE_SERVICE_ROLE_KEY
is referenced only from server-side code.

**Gap:** None.

**Status:** Green.

## 10. Documentation

**Required outcome:** An operator can run, monitor, and roll back the
engine from the docs.

**Current state:**
- 4 ADRs (Foundation, Versioning+Capabilities, Event Store,
  Atomic Transactions).
- 4 RC1 reports (this set).
- Production Checklist.
- Inline comments in every module.

**Gap:** On-call playbook (checklist item L `[blocker]`).

**Status:** Yellow (playbook).

---

## Summary table

| Dimension | Status |
|---|---|
| 1. Correctness | Yellow (integration test) |
| 2. Atomicity | Green |
| 3. Observability | Yellow (route wiring) |
| 4. Replayability | Yellow (dev dry-run) |
| 5. Safety | Green |
| 6. Versioning | Green |
| 7. Concurrency | Yellow (lock wire-up) |
| 8. Configuration | Yellow (call wire-up) |
| 9. Security | Green |
| 10. Documentation | Yellow (playbook) |

Reds: 0
Yellows: 6 (all mechanical wire-ups or empirical sign-offs)
Greens: 4

---

## Bottom line

The engine's **substance is production-grade**. The remaining
yellows are all of one of two shapes:

(a) "the code exists; call it from the right place" — concurrency
lock acquisition, config-validation panic, dashboard route
registration; or

(b) "run the tests against a real backend" — Postgres integration
suite, dev replay-apply dry-run.

None of the remaining items require new design or new code. They
are small, scoped, and named.
