-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0006 — Sync Engine Foundation (Milestone 1)
--
-- Adds the six provider-agnostic synchronization tables and extends nea_agencies
-- with provenance + lifecycle columns. Existing 581 NEA rows are preserved and
-- backfilled to point at the canonical "nea-ke" provider; the global UNIQUE on
-- license_number is replaced by a composite UNIQUE on (provider_id, license_number)
-- so future providers (UK Licensed Sponsors, Canada Employer Registry, etc.) can
-- coexist with overlapping license-number namespaces.
--
-- This migration is fully re-runnable. Every CREATE uses IF NOT EXISTS; every
-- ALTER is wrapped in a DO block that checks the current state first.
--
-- Architectural notes:
--   1. Tables: sync_providers, sync_runs, sync_snapshots, sync_records,
--      agency_change_log, sync_anomalies (per spec §7).
--   2. Snapshots and anomalies arrive in M3, but the tables exist now so M2
--      apply-pipeline can reference them without a second migration.
--   3. nea_agencies.license_number constraint swap is the only destructive
--      step; it runs in a transaction so a failure preserves the prior state.
--   4. The NEA-KE provider row is inserted at the bottom, after the table
--      exists, so first-boot is a single SQL apply with no follow-up code.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. sync_providers ────────────────────────────────────────────────────────
-- Registry of every external data source. One row per provider, identified by
-- a URL-safe slug. Adapter code references rows by slug, never by id, so the
-- slug is the stable contract.
CREATE TABLE IF NOT EXISTS sync_providers (
  id                       VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                     VARCHAR NOT NULL UNIQUE,
  display_name             VARCHAR NOT NULL,
  country                  CHAR(2) NOT NULL,
  adapter_name             VARCHAR NOT NULL,
  mode                     VARCHAR NOT NULL DEFAULT 'manual',
  cron_expression          VARCHAR,
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  config                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  health                   VARCHAR NOT NULL DEFAULT 'unknown',
  last_health_check_at     TIMESTAMP,
  last_successful_run_at   TIMESTAMP,
  created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMP NOT NULL DEFAULT NOW(),
  -- Soft constraints expressed via CHECK so bad data fails loud, not silent.
  CONSTRAINT sync_providers_mode_chk
    CHECK (mode IN ('scheduled', 'manual', 'webhook')),
  CONSTRAINT sync_providers_health_chk
    CHECK (health IN ('healthy', 'degraded', 'broken', 'unknown'))
);

-- ── 2. sync_runs ─────────────────────────────────────────────────────────────
-- Every synchronization attempt — one row per run, regardless of outcome.
-- Lifecycle: pending → running → (succeeded | failed | held_for_review | rolled_back).
CREATE TABLE IF NOT EXISTS sync_runs (
  id                       VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id              VARCHAR NOT NULL REFERENCES sync_providers(id) ON DELETE CASCADE,
  mode                     VARCHAR NOT NULL,
  status                   VARCHAR NOT NULL DEFAULT 'pending',
  triggered_by             VARCHAR NOT NULL,
  started_at               TIMESTAMP,
  finished_at              TIMESTAMP,
  snapshot_id              VARCHAR,   -- FK added after sync_snapshots exists (deferred-friendly)
  records_seen             INTEGER NOT NULL DEFAULT 0,
  records_created          INTEGER NOT NULL DEFAULT 0,
  records_updated          INTEGER NOT NULL DEFAULT 0,
  records_deleted          INTEGER NOT NULL DEFAULT 0,
  records_quarantined      INTEGER NOT NULL DEFAULT 0,
  anomaly_score            NUMERIC NOT NULL DEFAULT 0,
  hold_reason              TEXT,
  error_message            TEXT,
  duration_ms              INTEGER,
  correlation_id           VARCHAR NOT NULL,
  created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT sync_runs_mode_chk
    CHECK (mode IN ('scheduled', 'manual', 'dry_run', 'recovery')),
  CONSTRAINT sync_runs_status_chk
    CHECK (status IN ('pending', 'running', 'held_for_review', 'succeeded', 'failed', 'rolled_back'))
);

CREATE INDEX IF NOT EXISTS sync_runs_provider_started_idx
  ON sync_runs (provider_id, started_at DESC);
CREATE INDEX IF NOT EXISTS sync_runs_status_idx
  ON sync_runs (status);

-- ── 3. sync_snapshots ────────────────────────────────────────────────────────
-- Immutable point-in-time provider state. The actual JSONL.gz lives in
-- Supabase Storage; this table records the pointer + checksum.
-- Used by M3 (snapshots) and M7 (rollback). Created now so M2 has the FK
-- target and we never need a follow-up migration.
CREATE TABLE IF NOT EXISTS sync_snapshots (
  id                       VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id              VARCHAR NOT NULL REFERENCES sync_providers(id) ON DELETE CASCADE,
  run_id                   VARCHAR NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
  captured_at              TIMESTAMP NOT NULL DEFAULT NOW(),
  record_count             INTEGER NOT NULL DEFAULT 0,
  storage_uri              VARCHAR NOT NULL,
  checksum                 VARCHAR NOT NULL,
  size_bytes               INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS sync_snapshots_provider_captured_idx
  ON sync_snapshots (provider_id, captured_at DESC);

-- Now wire the deferred FK on sync_runs.snapshot_id → sync_snapshots.id.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'sync_runs_snapshot_id_fkey'
  ) THEN
    ALTER TABLE sync_runs
      ADD CONSTRAINT sync_runs_snapshot_id_fkey
      FOREIGN KEY (snapshot_id) REFERENCES sync_snapshots(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 4. sync_records ──────────────────────────────────────────────────────────
-- Every observed record across history. The fingerprint column is the diff
-- key — identical fingerprints are no-ops on re-sync. A row here precedes any
-- write to nea_agencies; agency_id is null until M2's Apply stage links them.
CREATE TABLE IF NOT EXISTS sync_records (
  id                       VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id              VARCHAR NOT NULL REFERENCES sync_providers(id) ON DELETE CASCADE,
  run_id                   VARCHAR NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
  license_number           VARCHAR NOT NULL,
  record_fingerprint       VARCHAR NOT NULL,
  agency_id                VARCHAR,   -- FK added in step 8 once nea_agencies has provider_id
  raw_payload              JSONB NOT NULL,
  is_quarantined           BOOLEAN NOT NULL DEFAULT FALSE,
  quarantine_reason        TEXT,
  observed_at              TIMESTAMP NOT NULL DEFAULT NOW(),
  -- Same fingerprint twice in one run is a duplicate and must be deduped;
  -- across runs they are intentionally distinct rows (history).
  UNIQUE (provider_id, run_id, license_number, record_fingerprint)
);

CREATE INDEX IF NOT EXISTS sync_records_provider_license_idx
  ON sync_records (provider_id, license_number);
CREATE INDEX IF NOT EXISTS sync_records_run_idx
  ON sync_records (run_id);

-- ── 5. agency_change_log ─────────────────────────────────────────────────────
-- Append-only audit of every applied mutation to nea_agencies. Drives the
-- per-agency history view and the "what changed" comparison in admin UI.
-- Used by M2 (Apply) and M7 (rollback rows).
CREATE TABLE IF NOT EXISTS agency_change_log (
  id                       VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id                VARCHAR NOT NULL,   -- nea_agencies.id (FK added after step 8)
  provider_id              VARCHAR NOT NULL REFERENCES sync_providers(id) ON DELETE CASCADE,
  run_id                   VARCHAR NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
  change_type              VARCHAR NOT NULL,
  field_changes            JSONB NOT NULL DEFAULT '{}'::jsonb,
  performed_by             VARCHAR NOT NULL DEFAULT 'system',
  reason                   TEXT,
  created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_change_log_type_chk
    CHECK (change_type IN ('created', 'updated', 'deleted', 'suspended', 'restored', 'rolled_back'))
);

CREATE INDEX IF NOT EXISTS agency_change_log_agency_created_idx
  ON agency_change_log (agency_id, created_at DESC);

-- ── 6. sync_anomalies ────────────────────────────────────────────────────────
-- Runs that the safety gate refused to apply pending admin review.
-- M3 populates this; the table exists now so the FK target is stable.
CREATE TABLE IF NOT EXISTS sync_anomalies (
  id                       VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                   VARCHAR NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
  detected_at              TIMESTAMP NOT NULL DEFAULT NOW(),
  anomaly_type             VARCHAR NOT NULL,
  severity                 VARCHAR NOT NULL,
  metric_value             NUMERIC NOT NULL,
  threshold                NUMERIC NOT NULL,
  sample_data              JSONB NOT NULL DEFAULT '[]'::jsonb,
  resolution               VARCHAR,
  resolved_by              VARCHAR,
  resolved_at              TIMESTAMP,
  notes                    TEXT,
  CONSTRAINT sync_anomalies_severity_chk
    CHECK (severity IN ('info', 'warn', 'critical')),
  CONSTRAINT sync_anomalies_resolution_chk
    CHECK (resolution IS NULL OR resolution IN ('approved', 'rejected', 'auto_resolved'))
);

CREATE INDEX IF NOT EXISTS sync_anomalies_run_idx
  ON sync_anomalies (run_id);
CREATE INDEX IF NOT EXISTS sync_anomalies_open_idx
  ON sync_anomalies (resolution) WHERE resolution IS NULL;

-- ── 7. Insert canonical NEA-Kenya provider row ───────────────────────────────
-- This is the row every existing nea_agencies record will be tagged with.
-- ON CONFLICT (slug) DO NOTHING so the migration is replayable.
INSERT INTO sync_providers
  (slug, display_name, country, adapter_name, mode, cron_expression, is_active, config)
VALUES
  (
    'nea-ke',
    'Kenya National Employment Authority',
    'KE',
    'NeaKeProvider',
    'scheduled',
    '0 */6 * * *',
    TRUE,
    jsonb_build_object(
      'source',          'static-seed-v1',
      'rateLimit',       jsonb_build_object('requestsPerMinute', 60, 'concurrentRequests', 5),
      'anomalyThresholds', jsonb_build_object(
        'deletePct', 20,
        'updatePct', 50,
        'validationFailurePct', 5
      )
    )
  )
ON CONFLICT (slug) DO NOTHING;

-- ── 8. Extend nea_agencies with provenance + lifecycle columns ───────────────
-- All new columns are nullable initially so existing 581 rows survive the ALTER.
-- We backfill provider_id from the row we just inserted, then make it NOT NULL.
ALTER TABLE nea_agencies
  ADD COLUMN IF NOT EXISTS provider_id            VARCHAR,
  ADD COLUMN IF NOT EXISTS provider_record_fp     VARCHAR,
  ADD COLUMN IF NOT EXISTS status_source          VARCHAR,
  ADD COLUMN IF NOT EXISTS first_seen_at          TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_seen_at           TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_changed_at        TIMESTAMP;

-- Backfill: tag every existing row with the NEA-KE provider.
UPDATE nea_agencies
   SET provider_id    = (SELECT id FROM sync_providers WHERE slug = 'nea-ke'),
       status_source  = COALESCE(status_source, status_override, 'verified'),
       first_seen_at  = COALESCE(first_seen_at, last_updated, NOW()),
       last_seen_at   = COALESCE(last_seen_at,  last_updated, NOW())
 WHERE provider_id IS NULL;

-- Make provider_id NOT NULL now that every row has it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'nea_agencies' AND column_name = 'provider_id' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE nea_agencies ALTER COLUMN provider_id SET NOT NULL;
  END IF;
END $$;

-- Foreign key constraint for provider_id → sync_providers.id.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'nea_agencies_provider_id_fkey'
  ) THEN
    ALTER TABLE nea_agencies
      ADD CONSTRAINT nea_agencies_provider_id_fkey
      FOREIGN KEY (provider_id) REFERENCES sync_providers(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ── 9. Swap uniqueness: global license_number → composite (provider_id, lic) ──
-- The old constraint name is whatever Postgres auto-named it (usually
-- nea_agencies_license_number_unique). We discover and drop it dynamically.
-- This is the only structural change to nea_agencies that future providers
-- depend on.
DO $$
DECLARE
  old_constraint_name TEXT;
BEGIN
  SELECT constraint_name INTO old_constraint_name
    FROM information_schema.table_constraints
   WHERE table_name      = 'nea_agencies'
     AND constraint_type = 'UNIQUE'
     AND constraint_name LIKE '%license_number%';

  IF old_constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE nea_agencies DROP CONSTRAINT ' || quote_ident(old_constraint_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name      = 'nea_agencies'
      AND constraint_name = 'nea_agencies_provider_license_unique'
  ) THEN
    ALTER TABLE nea_agencies
      ADD CONSTRAINT nea_agencies_provider_license_unique
      UNIQUE (provider_id, license_number);
  END IF;
END $$;

-- ── 10. Wire deferred FKs that depend on nea_agencies.id ────────────────────
-- sync_records.agency_id → nea_agencies.id (set in M2 Apply).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'sync_records_agency_id_fkey'
  ) THEN
    ALTER TABLE sync_records
      ADD CONSTRAINT sync_records_agency_id_fkey
      FOREIGN KEY (agency_id) REFERENCES nea_agencies(id) ON DELETE SET NULL;
  END IF;
END $$;

-- agency_change_log.agency_id → nea_agencies.id.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'agency_change_log_agency_id_fkey'
  ) THEN
    ALTER TABLE agency_change_log
      ADD CONSTRAINT agency_change_log_agency_id_fkey
      FOREIGN KEY (agency_id) REFERENCES nea_agencies(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ── Indexes for the diff hot path ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS nea_agencies_provider_license_idx
  ON nea_agencies (provider_id, license_number);
CREATE INDEX IF NOT EXISTS nea_agencies_expiry_idx
  ON nea_agencies (expiry_date)
  WHERE is_published = TRUE;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback playbook (informational; not auto-executed):
--
--   BEGIN;
--   ALTER TABLE nea_agencies DROP CONSTRAINT nea_agencies_provider_license_unique;
--   ALTER TABLE nea_agencies ADD CONSTRAINT nea_agencies_license_number_unique
--     UNIQUE (license_number);
--   ALTER TABLE nea_agencies DROP CONSTRAINT nea_agencies_provider_id_fkey;
--   ALTER TABLE nea_agencies
--     DROP COLUMN provider_id,
--     DROP COLUMN provider_record_fp,
--     DROP COLUMN status_source,
--     DROP COLUMN first_seen_at,
--     DROP COLUMN last_seen_at,
--     DROP COLUMN last_changed_at;
--   DROP TABLE agency_change_log;
--   DROP TABLE sync_anomalies;
--   DROP TABLE sync_records;
--   DROP TABLE sync_snapshots;
--   DROP TABLE sync_runs;
--   DROP TABLE sync_providers;
--   COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────
