# RC1 Report 6 — Recommendation

**Engine:** WorkAbroad Hub Agency Synchronization Engine
**Release Candidate:** RC1
**Date:** 2026-06-29
**Author:** Sync Engine team
**Reader:** Tony / WorkAbroad Hub founder

---

## Recommendation

**READY FOR PRODUCTION — with three pre-flight items.**

The substance of the engine is production-grade. The remaining items
are mechanical wire-ups + one empirical sign-off; none require new
design or new code.

---

## What is ready

- **Atomic transactions (P1).** One COMMIT covers every row a run
  produces. The reliability invariant ("events without DB writes" /
  "DB writes without events") is closed by construction. ADR 0004
  documents the design; F1–F7 walked through.
- **Schema Drift Detection (P3), Confidence Score (P4), Replay
  Engine (P2), Shadow Mode (P6), Performance Validation (P7),
  Dev Ops Dashboard (P5), Operational Hardening (P8).** All
  implemented as pure functions where possible, all carry version
  constants, all have unit-test coverage.
- **Provider Adapter framework.** NEA-KE adapter is the proof; the
  `SyncProvider` interface is provider-agnostic and shadow-mode-ready
  for future adapters.
- **Documentation.** 4 ADRs + 6 RC1 reports + Production Checklist +
  inline comments throughout `server/sync/**`.
- **CV Fix Lite + Kenya Careers + M-Pesa separation.** Unaffected.
  Sync engine writes only to its own tables.

## Pre-flight items (the three things you should do before
flipping the switch)

1. **Wire the three call sites.** All three already exist as helpers
   in `server/sync/hardening.ts`. They need one-line invocations
   from the appropriate boot/runner sites:
   - `validateConfigOrPanic()` at server boot.
   - `acquireRunLock(client, slug)` at the top of the RC1 runner's
     atomic block (with a graceful abort if it returns false).
   - `registerSyncDashboardRoutes(app)` in `server/routes.ts`.

2. **Run the integration test.** Spin up a real Postgres (test
   Supabase project or local docker) and execute:
   - One clean end-to-end run → verify six tables consistent.
   - One injected failure mid-`buffer.flush` → verify zero rows
     anywhere; status='failed' present.
   - One held-for-review run → verify snapshot + anomalies + events
     committed; `nea_agencies` untouched.

3. **One dev replay_apply.** Pick yesterday's NEA-KE snapshot.
   Invoke `runReplay({ mode: 'replay_apply', ... })`. Verify the
   diff counts match the original run's diff counts.

If all three pass, the engine ships.

## Why this is "Ready" rather than "Not Ready"

The Production Readiness Report (Doc 04) shows the dimension scorecard
as 4 Green + 6 Yellow + 0 Red. Every Yellow is one of:

- *one-line wire-up* (config-panic call, lock-acquire call, route
  registration), or
- *empirical sign-off* (integration test, dev replay-apply, on-call
  playbook).

None of them are "we don't know how to do this." None of them require
revising a design. None of them are a substance-of-the-engine
question. They are the closing 5% of work that exists at the boundary
between "code is done" and "ops is done."

A "Not Ready" recommendation would be appropriate if any of the
following were true; none are:

- A correctness gap with no documented mitigation. (None.)
- A safety gap that could damage user data. (CV Fix Lite separation
  rule unaffected; Kenya Careers unaffected.)
- A performance gap that violates a target. (All targets met with
  substantial headroom — see Performance Report.)
- A documentation gap such that an operator cannot reason about a
  failure. (4 ADRs + 6 reports + checklist + dashboard.)

## What "Ready" means operationally

- **Day-1 mode:** keep the M3 runner registered in the scheduler as
  the fallback. Run the RC1 runner manually (`/api/admin/sync/runs`
  + a "run-now" admin button) on NEA-KE. Inspect the dashboard. Read
  the events. After a week of clean runs, swap the scheduler over.
- **Week-2 mode:** scheduler invokes the RC1 runner. M3 runner is
  archived (kept for reference only). Confidence-score grades become
  the daily-health KPI.
- **Month-1 mode:** add the first second adapter via Shadow Mode. The
  shadow-vs-live verification report is the gating artifact.

## Risk acceptance

The Remaining Risks report (Doc 05) catalogues 10 risks. Zero are
High × High. The two operational risks worth re-acknowledging are:

- **R-002** (recovery-write fails after rollback). Bound: one
  `'running'` row per double-failure. Dashboard surfaces it; manual
  reconciliation is documented.
- **R-005** (memory at scale). Bound: not relevant at NEA-KE scale.
  Becomes relevant ≥ 50k records / run; documented as a future
  refactor.

Both are accepted-with-mitigation. Neither blocks RC1.

## Stop conditions (what would trigger a rollback)

- Any run leaves the `sync_events` ↔ `nea_agencies` invariant
  inconsistent (events present, agencies missing, or vice versa).
- Any `sync_runs` row persists in `'running'` for > 30 minutes
  without manual reconciliation being triggered.
- Confidence score average across a week of NEA-KE runs falls
  below C (60).
- Any of the safety-gate thresholds trips on a normal day's payload
  (this would indicate the thresholds are mis-set, not that anything
  is broken).

Rollback procedure: per migration 0009 rollback block. Revert the
runner registration in the scheduler to point at the M3 runner.
No data loss; M3 runner is functionally equivalent for happy-path runs.

---

## Sign-off readiness

- ✅ ADRs reviewed and accepted (0001-0004)
- ✅ Architecture review (Doc 01)
- ✅ Reliability report (Doc 02)
- ✅ Performance report (Doc 03)
- ✅ Production readiness scorecard (Doc 04)
- ✅ Remaining risks (Doc 05)
- ✅ This recommendation (Doc 06)

**Recommendation:** READY — proceed with the three pre-flight items.

Stopping here as RC1 directed. Awaiting your sign-off before
proceeding to the wire-ups or to the next milestone.
