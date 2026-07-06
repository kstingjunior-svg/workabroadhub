-- ─── Migration 0015 — NEAIMS sync run log ────────────────────────────────
-- 2026-07-06
--
-- Every time the NEAIMS sync service runs (nightly cron or admin-triggered),
-- it inserts a row here before it starts and updates the row when it
-- finishes. Powers the admin dashboard's "sync history" panel and gives us
-- an audit trail if anything goes sideways.
--
-- Design notes:
--   • One row per run — never mutated after finished_at is set (except
--     to attach a post-mortem error message if needed).
--   • status: 'running' during the sync, 'succeeded' on clean finish,
--     'partial' if some records were skipped due to filtering, 'failed'
--     if the run threw and rolled back.
--   • Counts are cumulative across the run so we can trend upserts/day
--     and spot sudden drops (which usually means the NEAIMS API changed
--     shape).
--
-- Rollback:
--   DROP TABLE nea_sync_runs;

BEGIN;

CREATE TABLE IF NOT EXISTS nea_sync_runs (
  id                    BIGSERIAL PRIMARY KEY,
  triggered_by          TEXT NOT NULL DEFAULT 'schedule',   -- 'schedule' | 'admin' | 'boot'
  triggered_by_user_id  TEXT,                                -- filled when triggered_by='admin'
  started_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at           TIMESTAMPTZ,
  duration_ms           INTEGER,
  status                TEXT NOT NULL DEFAULT 'running',    -- 'running' | 'succeeded' | 'partial' | 'failed'

  -- Fetched from NEAIMS
  verified_fetched      INTEGER NOT NULL DEFAULT 0,
  expired_fetched       INTEGER NOT NULL DEFAULT 0,
  deregistered_fetched  INTEGER NOT NULL DEFAULT 0,
  pending_fetched       INTEGER NOT NULL DEFAULT 0,
  raw_total             INTEGER NOT NULL DEFAULT 0,

  -- After normalization
  skipped_junk          INTEGER NOT NULL DEFAULT 0,
  clean_total           INTEGER NOT NULL DEFAULT 0,

  -- Applied to nea_agencies
  inserted              INTEGER NOT NULL DEFAULT 0,
  updated               INTEGER NOT NULL DEFAULT 0,
  marked_unlisted       INTEGER NOT NULL DEFAULT 0,

  -- Errors (short summary; full stack goes to server logs)
  error_message         TEXT,
  error_code            TEXT
);

-- Fast lookup for "latest run" queries powering the admin dashboard.
CREATE INDEX IF NOT EXISTS nea_sync_runs_started_idx
  ON nea_sync_runs (started_at DESC);

COMMENT ON TABLE nea_sync_runs IS
  'Audit log for the NEAIMS sync service. One row per sync attempt.';
COMMENT ON COLUMN nea_sync_runs.status IS
  '''running'' during a live run, ''succeeded'' on clean completion, ''partial'' when some rows were skipped, ''failed'' on rollback.';

COMMIT;
