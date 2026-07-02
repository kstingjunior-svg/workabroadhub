# RC1 Report 5 — Remaining Risks

**Engine:** WorkAbroad Hub Agency Synchronization Engine
**Release Candidate:** RC1
**Date:** 2026-06-29

---

## Scope

This is the honest list of what we have NOT eliminated. Each item has
an owner, a likelihood, an impact, and a documented bound on how bad
it can get if it manifests.

Items are sorted by (likelihood × impact), highest first.

---

## R-001 — Orphan snapshot blobs after rolled-back atomic transactions

**Likelihood:** Medium (occurs on every transaction rollback that
happened after the file upload completed).
**Impact:** Low (object-store cost, easily GCed).
**Bound:** Per orphan, ~100-200 KB. Even with one orphan per failed
run, NEA-KE volume yields < 1 MB/year.

**Mitigation:** `snapshotOrphanGc()` reporter in
`server/sync/hardening.ts`; deletion is opt-in. P8 deferred a
periodic job to wire to cron.

**Owner:** Operator. Run the reporter monthly; delete only after
spot-checking a few orphans.

---

## R-002 — Recovery write fails after the atomic rollback

**Likelihood:** Low (requires a second failure on a separate
connection inside seconds of the first).
**Impact:** Medium (a sync_runs row stays in `'running'` until
manually reconciled).
**Bound:** One row per double-failure.

**Mitigation:** Dashboard treats `running` rows older than 5 minutes
as suspect and surfaces them. Manual reconciliation: `UPDATE
sync_runs SET status='failed', error_message='manual reconciliation'
WHERE id = '...'`.

**Owner:** Operator. Catalogued under HARDENING_AUDIT entry H-004
as `accepted-risk`.

---

## R-003 — Hand-run script bypasses the runner and skips the
        advisory lock

**Likelihood:** Low (we control all entry points).
**Impact:** Medium (overlapping writes could violate the per-provider
serialization invariant).
**Bound:** Until detected by change-log collisions or change-log
duplicate-key constraints.

**Mitigation:** Operational discipline. All writes must go through
`runSyncRc1`. Code review should reject direct calls to
`applyChangeSetCore` outside the runner.

**Owner:** Engineering.

---

## R-004 — Adapter generalization untested beyond NEA-KE

**Likelihood:** N/A (this is a coverage gap, not a runtime risk).
**Impact:** Medium (an adapter for UAE/Saudi/Qatar may reveal
implicit NEA-KE assumptions in the pipeline).
**Bound:** Each new adapter is one provider; failures isolated by
the per-provider lock.

**Mitigation:** Shadow Mode (P6) is the intended path: run the new
adapter shadow for a week, inspect the shadow verification report,
promote only when the recommendation is `promote_to_live`.

**Owner:** Engineering, on the next adapter milestone.

---

## R-005 — Memory pressure at large record counts

**Likelihood:** Low at NEA-KE scale; medium when a future provider
exceeds ~50k records.
**Impact:** High (worst case: process OOM mid-run, lost connection
to Postgres, partial work rolled back).
**Bound:** Foundation pipeline holds the full raw + validated +
quarantined arrays in memory.

**Mitigation:** Documented in Performance Report § "Scaling
envelope". Streaming refactor planned at the ~100k record threshold.

**Owner:** Engineering, on the first ≥10k-record adapter.

---

## R-006 — Drift detector false-negatives at the SAMPLE_SIZE boundary

**Likelihood:** Low (provider would have to expose the new/changed
field on < 1% of records).
**Impact:** Medium (silent data loss for that field).
**Bound:** SAMPLE_SIZE=100; up to 99% of records can be ignored on
the sample.

**Mitigation:** Confidence Score docks for drift findings, but
not for SAMPLE_SIZE undercounting. Eventually, sample-with-stratification
would close this. For RC1: dev-team review of upstream changes
remains required.

**Owner:** Engineering, on the next pipeline iteration.

---

## R-007 — Confidence Score grade boundaries are calibrated to
        NEA-KE expectations

**Likelihood:** Medium when applied to providers with very
different baselines (e.g. a high-churn upstream).
**Impact:** Low (operator sees a wrong-looking grade; underlying
data is still correct).
**Bound:** Per-provider tuning of `CONFIDENCE_WEIGHTS` is a
constants change; versioned by `CONFIDENCE_SCORE_VERSION`.

**Mitigation:** Per-provider weight overrides are intentionally NOT
implemented in RC1 (avoid drift between operator mental model and
reality). Re-tune the global weights if a second adapter justifies it.

**Owner:** Engineering.

---

## R-008 — Replay against a snapshot whose versions are bumped
        beyond support

**Likelihood:** Very low (we control version bumps).
**Impact:** Medium (replay throws because normalizer can no longer
parse the old payload shape).
**Bound:** Per-incident; affects historical replays only.

**Mitigation:** The replay engine returns `versionsBumped=true` on
preview so operators see version drift before applying. ADR 0002
versioning policy: bumps are explicit, documented commits.

**Owner:** Engineering on every normalize/fingerprint version bump.

---

## R-009 — Per-provider advisory lock leaked by a long-running
        transaction holding the connection

**Likelihood:** Very low (RC1 runner releases the connection at
end-of-run; advisory lock releases automatically).
**Impact:** Low (next scheduled run is blocked until lock clears).
**Bound:** Until the holding session ends (Postgres kills idle
sessions per the configured timeout).

**Mitigation:** `releaseRunLock()` helper for explicit release at
end-of-run. Pool `idleTimeoutMillis` configured in `server/db.ts`
prevents indefinite holds.

**Owner:** Operator monitoring.

---

## R-010 — Performance regression undetected by the baseline

**Likelihood:** Medium (a 10% slowdown takes time to show in
p50/p95).
**Impact:** Low (engine continues to work; dashboard surfaces it
eventually).
**Bound:** Per-run; surfaced via confidence score's performance
factor once `expectedDurationMs > 2× actual`.

**Mitigation:** Dashboard plot + confidence score. No automated
paging for performance alone.

**Owner:** Engineering when the trend becomes visible.

---

## What we are NOT accepting as a risk

These were investigated and ruled out:

- **CV Fix Lite cross-grant** — impossible by code separation; the
  sync engine touches no subscription tables.
- **Kenya Careers contamination** — same.
- **M-Pesa flow disruption** — the sync engine does not register
  any payment hooks.
- **Public-data leak via admin routes** — every admin route runs
  `isAuthenticated + isAdmin`.
- **Auth bypass via CSRF** — `/api/admin/sync/*` follows the same
  CSRF rules as the rest of admin; no exemptions added.

---

## Risk summary

| Risk | Likelihood | Impact | Owner |
|---|---|---|---|
| R-001 Orphan blobs | Med | Low | Operator |
| R-002 Recovery-write fails | Low | Med | Operator |
| R-003 Lock-bypass scripts | Low | Med | Engineering |
| R-004 Adapter generalization | n/a | Med | Engineering |
| R-005 Memory at scale | Low/Med | High | Engineering |
| R-006 Drift sample false-negs | Low | Med | Engineering |
| R-007 Grade calibration | Med | Low | Engineering |
| R-008 Replay version mismatch | Very low | Med | Engineering |
| R-009 Lock leak | Very low | Low | Operator |
| R-010 Perf regression detection | Med | Low | Engineering |

**Zero accepted risks at High likelihood × High impact.**
