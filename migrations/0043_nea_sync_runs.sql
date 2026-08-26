-- 2026-08 (Tony's request): live NEA sync — one row per sync attempt.
-- Populated by server/lib/nea-sync/apply.ts. Admin dashboard reads the most
-- recent rows to show sync history: "Last sync 2 hours ago: +14 new,
-- ~8 renewed, ×3 revoked, 916 total active."
CREATE TABLE IF NOT EXISTS nea_sync_runs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at        TIMESTAMP   NOT NULL DEFAULT NOW(),
  finished_at       TIMESTAMP,
  source            VARCHAR(32) NOT NULL,      -- 'auto_fetch' | 'admin_paste' | 'cron'
  status            VARCHAR(32) NOT NULL,      -- 'running' | 'ok' | 'partial' | 'error'
  triggered_by      VARCHAR(128),              -- user id of admin, or 'cron'
  raw_bytes         INTEGER,                   -- size of the payload we parsed
  fetched_rows      INTEGER    DEFAULT 0,      -- how many rows the parser produced
  new_agencies      INTEGER    DEFAULT 0,      -- inserted (never seen before)
  updated_agencies  INTEGER    DEFAULT 0,      -- changed status / expiry / contact
  expired_agencies  INTEGER    DEFAULT 0,      -- newly-expired (crossed expiry date)
  revoked_agencies  INTEGER    DEFAULT 0,      -- present in DB but gone from source
  unchanged         INTEGER    DEFAULT 0,      -- no-op rows
  active_after      INTEGER,                   -- total active count after sync
  expired_after     INTEGER,                   -- total expired count after sync
  error_message     TEXT,
  notes             TEXT
);

CREATE INDEX IF NOT EXISTS nea_sync_runs_started_at_idx ON nea_sync_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS nea_sync_runs_status_idx     ON nea_sync_runs (status);
