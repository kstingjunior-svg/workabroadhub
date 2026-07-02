-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0009 — Sync Engine RC1: Production Readiness
--
-- Adds columns + tables required by RC1 priorities. None of these are
-- behavioural changes on their own; they're storage for the new artifacts
-- (drift report, confidence score, performance report) and an integrity
-- helper (run lock) for hardening work.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── sync_runs: storage for the four RC1 reports ─────────────────────────────
ALTER TABLE sync_runs
  ADD COLUMN IF NOT EXISTS schema_drift_report  JSONB,
  ADD COLUMN IF NOT EXISTS confidence_score     INTEGER,
  ADD COLUMN IF NOT EXISTS confidence_grade     VARCHAR(2),
  ADD COLUMN IF NOT EXISTS performance_report   JSONB,
  -- Replay attribution: when this run was triggered by replay.ts, record
  -- which snapshot it was derived from. Null for normal runs.
  ADD COLUMN IF NOT EXISTS replayed_from_snapshot_id VARCHAR,
  -- Shadow attribution: shadow runs do not write to nea_agencies. Useful
  -- for filtering them out of "real" historical analytics.
  ADD COLUMN IF NOT EXISTS is_shadow            BOOLEAN NOT NULL DEFAULT FALSE;

-- Cheap-to-add index for the dev dashboard's "last N successful runs per
-- provider" query.
CREATE INDEX IF NOT EXISTS sync_runs_provider_finished_idx
  ON sync_runs (provider_id, finished_at DESC)
  WHERE status = 'succeeded' AND is_shadow = FALSE;

-- ── sync_providers: persistent schema fingerprint for drift detection ──────
-- The drift detector compares the incoming payload's key shape against
-- the last successful run's recorded shape. Stored as JSONB:
--   { keys: ["agencyName", "licenseNumber", ...], typesByKey: { … } }
ALTER TABLE sync_providers
  ADD COLUMN IF NOT EXISTS last_schema_signature JSONB;

-- ── Replay run table ───────────────────────────────────────────────────────
-- Audit row per replay invocation. Distinct from sync_runs because replays
-- have their own lifecycle (load snapshot → optional preview → optional
-- apply) and may produce zero net changes against nea_agencies.
CREATE TABLE IF NOT EXISTS sync_replays (
  id                  VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  source_snapshot_id  VARCHAR NOT NULL REFERENCES sync_snapshots(id) ON DELETE CASCADE,
  -- The sync_runs row created for the replay's apply phase, if it ran.
  resulting_run_id    VARCHAR REFERENCES sync_runs(id) ON DELETE SET NULL,
  mode                VARCHAR NOT NULL,
  triggered_by        VARCHAR NOT NULL,
  normalizer_version  VARCHAR NOT NULL,
  fingerprint_version INTEGER NOT NULL,
  started_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  finished_at         TIMESTAMP,
  status              VARCHAR NOT NULL DEFAULT 'running',
  notes               TEXT,
  CONSTRAINT sync_replays_mode_chk
    CHECK (mode IN ('replay_only', 'replay_preview', 'replay_apply')),
  CONSTRAINT sync_replays_status_chk
    CHECK (status IN ('running', 'succeeded', 'failed'))
);

CREATE INDEX IF NOT EXISTS sync_replays_snapshot_idx
  ON sync_replays (source_snapshot_id, started_at DESC);

-- ── Run-lock support via advisory locks ────────────────────────────────────
-- We don't need a lock table; Postgres advisory locks are perfect for the
-- "at most one run per provider at a time" invariant. The convention:
--   pg_try_advisory_lock(hashtext('sync-provider:' || slug))
-- This migration just documents the convention via a comment.
COMMENT ON TABLE sync_providers IS
  'Per-provider advisory lock key: hashtext(''sync-provider:'' || slug). Acquired by sync-runner before fetch; held until terminal status transition.';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback playbook:
--   BEGIN;
--   DROP INDEX IF EXISTS sync_replays_snapshot_idx;
--   DROP TABLE IF EXISTS sync_replays;
--   ALTER TABLE sync_providers DROP COLUMN IF EXISTS last_schema_signature;
--   DROP INDEX IF EXISTS sync_runs_provider_finished_idx;
--   ALTER TABLE sync_runs
--     DROP COLUMN IF EXISTS schema_drift_report,
--     DROP COLUMN IF EXISTS confidence_score,
--     DROP COLUMN IF EXISTS confidence_grade,
--     DROP COLUMN IF EXISTS performance_report,
--     DROP COLUMN IF EXISTS replayed_from_snapshot_id,
--     DROP COLUMN IF EXISTS is_shadow;
--   COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────
