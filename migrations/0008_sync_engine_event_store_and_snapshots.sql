-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0008 — Sync Engine: Event Store + Data Quality Report
--
-- Pre-M3 architectural enhancement per ADR-0003.
--
-- Adds:
--   1. sync_events       — immutable, append-only canonical audit trail.
--   2. data_quality_report column on sync_runs (jsonb).
--   3. Indexes for the three primary query patterns documented in ADR-0003.
--
-- Append-only is enforced by convention (no UPDATE/DELETE statements from
-- application code). A future M-N can add a Postgres trigger that throws on
-- any UPDATE / DELETE if we want belt-and-braces, but that's not v1.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. sync_events ─────────────────────────────────────────────────────────
-- Every meaningful occurrence the engine emits. See server/sync/events.ts
-- for the twelve-variant TypeScript discriminated union that produces these
-- rows.
CREATE TABLE IF NOT EXISTS sync_events (
  id                 VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Wall-clock instant the event was recorded. Combined with id (which is
  -- monotonic-ish but not perfectly ordered) gives a stable replay order.
  occurred_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  -- Event type — see ADR-0003 §D-4 for the closed set. CHECK constraint
  -- enforced via the CHECK below; updated on each new event-type addition.
  event_type         VARCHAR NOT NULL,
  -- Per-event-type schema version. Bumps independently per type
  -- (ADR-0003 §D-2). Stored as integer for fast filtering.
  event_version      INTEGER NOT NULL DEFAULT 1,
  -- Run correlation id — stitches all events for one synchronization run.
  -- Matches sync_runs.correlation_id; NOT a FK because health-transition
  -- events occur outside any specific run.
  correlation_id     VARCHAR,
  -- Provider id when the event is provider-scoped or richer (every event
  -- except global ones). Nullable so we can record orphan-debug events
  -- in the future without a schema change.
  provider_id        VARCHAR REFERENCES sync_providers(id) ON DELETE CASCADE,
  -- What is this event about?
  --   "agency"   — agency_id in subject_id; canonical lifecycle events
  --   "run"      — run_id in subject_id; SynchronizationStarted/Completed/Failed
  --   "provider" — provider_id in subject_id; ProviderHealthChanged
  --   "license"  — license_number (NOT an agency id) when no row exists yet
  --   NULL       — system-level event with no specific subject
  subject_type       VARCHAR,
  subject_id         VARCHAR,
  -- Free-form payload — discriminated union members serialize here.
  payload            JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT sync_events_type_chk CHECK (event_type IN (
    'SynchronizationStarted',
    'SynchronizationCompleted',
    'SynchronizationFailed',
    'AgencyCreated',
    'AgencyUpdated',
    'AgencyRemoved',
    'AgencyRestored',
    'AgencyQuarantined',
    'NormalizationFailed',
    'ValidationFailed',
    'FingerprintChanged',
    'ProviderHealthChanged'
  )),
  CONSTRAINT sync_events_subject_type_chk CHECK (
    subject_type IS NULL OR subject_type IN ('agency', 'run', 'provider', 'license')
  )
);

-- Per-run replay: every event for one synchronization, in time order.
CREATE INDEX IF NOT EXISTS sync_events_correlation_occurred_idx
  ON sync_events (correlation_id, occurred_at)
  WHERE correlation_id IS NOT NULL;

-- Per-agency history: every event that ever happened to a specific agency.
CREATE INDEX IF NOT EXISTS sync_events_agency_subject_idx
  ON sync_events (subject_id, occurred_at DESC)
  WHERE subject_type = 'agency';

-- Per-type filtering ("show me all quarantines in the last 7 days").
CREATE INDEX IF NOT EXISTS sync_events_type_occurred_idx
  ON sync_events (event_type, occurred_at DESC);

-- Per-provider freshness watchdog: when did each provider last emit anything?
CREATE INDEX IF NOT EXISTS sync_events_provider_occurred_idx
  ON sync_events (provider_id, occurred_at DESC)
  WHERE provider_id IS NOT NULL;

-- ── 2. sync_runs.data_quality_report ───────────────────────────────────────
-- The M3 quality-report generator writes a structured JSON document here at
-- end-of-run. Nullable so historical M1/M2 runs aren't retroactively
-- pretending to have one.
ALTER TABLE sync_runs
  ADD COLUMN IF NOT EXISTS data_quality_report JSONB;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback playbook:
--   BEGIN;
--   ALTER TABLE sync_runs DROP COLUMN data_quality_report;
--   DROP INDEX IF EXISTS sync_events_provider_occurred_idx;
--   DROP INDEX IF EXISTS sync_events_type_occurred_idx;
--   DROP INDEX IF EXISTS sync_events_agency_subject_idx;
--   DROP INDEX IF EXISTS sync_events_correlation_occurred_idx;
--   DROP TABLE sync_events;
--   COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────
