-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0012 — Nanjila Foundations (OS Evolution Phase A)
--
-- Adds the four core tables plus two materialized-score tables that the ten
-- Nanjila-OS features build on. Every table is ADDITIVE — no existing column
-- is altered, no existing constraint is dropped, no existing row is touched.
--
-- Tables introduced (all prefixed nanjila_):
--   1. nanjila_user_memory          Persistent per-user facts with sensitivity
--                                   + confidence + decay.
--   2. nanjila_conversations        Session-level metadata (intent, mood,
--                                   tools invoked, outcome, CSAT).
--   3. nanjila_nudges               Proactive-assistance queue for predictors.
--   4. nanjila_capabilities         Declarative registry of things she can do.
--   5. nanjila_readiness_snapshots  Daily materialization of 9 trust scores.
--   6. nanjila_job_scores           Per-user-per-job composite match score
--                                   (materialized; recomputed on profile/CV change).
--
-- Also adds one nullable column to user_job_applications for Migration Timeline.
--
-- Backward compatibility: every table is new; the one column added is NULL by
-- default; no existing endpoint changes shape.
--
-- See docs/nanjila/OS_EVOLUTION_PLAN.md §16 (Phase A) for context.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. nanjila_user_memory ─────────────────────────────────────────────────
--
-- Persistent facts about a user Nanjila learns across sessions. Each fact
-- has a category (preference | personal | career | decision), a confidence
-- (how sure Nanjila is), and a sensitivity (0-100). Anything with
-- sensitivity > 30 in categories like health/religion/politics is BLOCKED
-- at the write layer (see server/nanjila/memory.ts).
--
-- Facts decay via decay_half_life_days — stale preferences fade unless
-- reconfirmed. On account deletion, all rows cascade.
CREATE TABLE IF NOT EXISTS nanjila_user_memory (
  id                     VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fact_key               VARCHAR NOT NULL,              -- 'preferred_country', 'passport_expiry', etc.
  fact_value             JSONB NOT NULL,
  category               VARCHAR NOT NULL
    CHECK (category IN ('preference', 'personal', 'career', 'decision')),
  confidence             INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  sensitivity            INTEGER NOT NULL CHECK (sensitivity BETWEEN 0 AND 100),
  source                 VARCHAR NOT NULL
    CHECK (source IN ('user_stated', 'inferred', 'system_derived')),
  learned_at             TIMESTAMP NOT NULL DEFAULT NOW(),
  last_verified_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  decay_half_life_days   INTEGER NOT NULL DEFAULT 90,
  archived               BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS nanjila_user_memory_lookup_idx
  ON nanjila_user_memory (user_id, fact_key) WHERE archived = FALSE;

CREATE INDEX IF NOT EXISTS nanjila_user_memory_category_idx
  ON nanjila_user_memory (user_id, category, archived);

CREATE INDEX IF NOT EXISTS nanjila_user_memory_active_idx
  ON nanjila_user_memory (user_id, last_verified_at DESC) WHERE archived = FALSE;

-- ── 2. nanjila_conversations ───────────────────────────────────────────────
--
-- One row per user session with Nanjila across any channel (widget, voice,
-- WhatsApp). Tracks what happened at a level useful for admin analytics and
-- for Nanjila's own memory — she can look back at the last conversation and
-- pick up threads.
CREATE TABLE IF NOT EXISTS nanjila_conversations (
  id                 VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  session_id         VARCHAR NOT NULL,                -- widget/voice-provided identifier
  channel            VARCHAR NOT NULL
    CHECK (channel IN ('widget', 'voice', 'whatsapp', 'email', 'admin')),
  started_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  ended_at           TIMESTAMP,
  message_count      INTEGER NOT NULL DEFAULT 0,
  detected_intents   JSONB NOT NULL DEFAULT '[]'::jsonb,
  detected_moods     JSONB NOT NULL DEFAULT '[]'::jsonb,
  tools_invoked      JSONB NOT NULL DEFAULT '[]'::jsonb,
  outcome            VARCHAR
    CHECK (outcome IN ('resolved', 'escalated', 'abandoned', 'converted', NULL)),
  csat_score         INTEGER CHECK (csat_score BETWEEN 1 AND 5),
  -- Pinning the prompt fingerprint per §17.3 of the OS plan — enables incident
  -- review "which prompt version was the user talking to?"
  prompt_hash        VARCHAR
);

CREATE INDEX IF NOT EXISTS nanjila_conversations_user_idx
  ON nanjila_conversations (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS nanjila_conversations_session_idx
  ON nanjila_conversations (session_id, started_at DESC);

CREATE INDEX IF NOT EXISTS nanjila_conversations_outcome_idx
  ON nanjila_conversations (outcome, started_at DESC)
  WHERE outcome IS NOT NULL;

-- ── 3. nanjila_nudges ──────────────────────────────────────────────────────
--
-- Proactive-assistance queue. Predictors (server/nanjila/predictors/) insert
-- rows here; the delivery layer respects the user's quiet period and channel
-- preferences before sending.
CREATE TABLE IF NOT EXISTS nanjila_nudges (
  id                 VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nudge_type         VARCHAR NOT NULL,                 -- 'passport_expiring', 'new_job_match', etc.
  priority           INTEGER NOT NULL CHECK (priority BETWEEN 1 AND 10),
  payload            JSONB NOT NULL,
  channel_preference JSONB NOT NULL
    DEFAULT '{"widget":true,"push":true,"whatsapp":false,"email":false}'::jsonb,
  reason             TEXT,                             -- Human-readable "why did we say that?"
  scheduled_for      TIMESTAMP NOT NULL DEFAULT NOW(),
  delivered_at       TIMESTAMP,
  dismissed_at       TIMESTAMP,
  clicked_at         TIMESTAMP,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Deliver-now query: pending nudges ready to fire, per user, oldest first.
CREATE INDEX IF NOT EXISTS nanjila_nudges_ready_idx
  ON nanjila_nudges (user_id, scheduled_for)
  WHERE delivered_at IS NULL AND dismissed_at IS NULL;

-- Nudge type audit for the admin dashboard.
CREATE INDEX IF NOT EXISTS nanjila_nudges_type_idx
  ON nanjila_nudges (nudge_type, created_at DESC);

-- ── 4. nanjila_capabilities ────────────────────────────────────────────────
--
-- Declarative registry of what Nanjila can do. The orchestrator queries this
-- to build the tool-use manifest for each conversation. Adding a new
-- capability is one INSERT + one handler file.
--
-- enabled=FALSE hides a capability without dropping the row (useful for A/B
-- and for entitlement-gated features being rolled out).
CREATE TABLE IF NOT EXISTS nanjila_capabilities (
  id                 SERIAL PRIMARY KEY,
  slug               VARCHAR UNIQUE NOT NULL,          -- e.g. 'check_payment', 'score_job'
  label              VARCHAR NOT NULL,                 -- Human label for prompt/manifest
  description        TEXT NOT NULL,                    -- What this capability does; shown to the model
  input_schema       JSONB NOT NULL,                   -- JSON-schema for tool input
  output_schema      JSONB NOT NULL,                   -- JSON-schema for tool output
  handler_module     VARCHAR NOT NULL,                 -- Code path, e.g. 'capabilities/checkPayment'
  requires_auth      BOOLEAN NOT NULL DEFAULT TRUE,
  requires_paid      BOOLEAN NOT NULL DEFAULT FALSE,
  requires_admin     BOOLEAN NOT NULL DEFAULT FALSE,
  enabled            BOOLEAN NOT NULL DEFAULT FALSE,
  avg_latency_ms     INTEGER,                          -- Rolling average for scheduler decisions
  created_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS nanjila_capabilities_enabled_idx
  ON nanjila_capabilities (enabled, slug) WHERE enabled = TRUE;

-- ── 5. nanjila_readiness_snapshots ─────────────────────────────────────────
--
-- Daily materialization of a user's 9 trust-dashboard scores. Real-time reads
-- hit this table (single-row lookup); compute happens in a nightly BullMQ job.
--
-- One row per user per day at most. Older rows retained for trend graphs.
CREATE TABLE IF NOT EXISTS nanjila_readiness_snapshots (
  user_id                       VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_date                 DATE NOT NULL DEFAULT CURRENT_DATE,
  cv_strength                   INTEGER CHECK (cv_strength BETWEEN 0 AND 100),
  application_readiness         INTEGER CHECK (application_readiness BETWEEN 0 AND 100),
  scam_awareness                INTEGER CHECK (scam_awareness BETWEEN 0 AND 100),
  document_completeness         INTEGER CHECK (document_completeness BETWEEN 0 AND 100),
  verification_status           INTEGER CHECK (verification_status BETWEEN 0 AND 100),
  country_readiness             INTEGER CHECK (country_readiness BETWEEN 0 AND 100),
  language_readiness            INTEGER CHECK (language_readiness BETWEEN 0 AND 100),
  interview_readiness           INTEGER CHECK (interview_readiness BETWEEN 0 AND 100),
  overall_migration_readiness   INTEGER CHECK (overall_migration_readiness BETWEEN 0 AND 100),
  factors                       JSONB NOT NULL DEFAULT '{}'::jsonb,
  next_actions                  JSONB NOT NULL DEFAULT '[]'::jsonb,
  computed_at                   TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS nanjila_readiness_snapshots_recent_idx
  ON nanjila_readiness_snapshots (user_id, snapshot_date DESC);

-- ── 6. nanjila_job_scores ──────────────────────────────────────────────────
--
-- Materialized composite score per (user, job) pair. Recomputed by BullMQ
-- when the user updates profile OR the job data changes OR every 7 days as
-- a floor.
--
-- Very fast reads via composite indexes for both directions (user's top
-- jobs; a job's top-scoring users).
CREATE TABLE IF NOT EXISTS nanjila_job_scores (
  user_id            VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id             VARCHAR NOT NULL,                 -- FK to jobs.id (no hard ref — jobs may be soft-deleted)
  score              INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  grade              VARCHAR NOT NULL
    CHECK (grade IN ('Excellent', 'Good', 'Fair', 'Weak')),
  factors            JSONB NOT NULL DEFAULT '[]'::jsonb,
  improvements       JSONB NOT NULL DEFAULT '[]'::jsonb,
  computed_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  stale_at           TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  PRIMARY KEY (user_id, job_id)
);

CREATE INDEX IF NOT EXISTS nanjila_job_scores_user_top_idx
  ON nanjila_job_scores (user_id, score DESC);

CREATE INDEX IF NOT EXISTS nanjila_job_scores_job_top_idx
  ON nanjila_job_scores (job_id, score DESC);

-- Note: a partial predicate "WHERE stale_at < NOW()" would be rejected by
-- Postgres with 42P17 ("functions in index predicate must be marked
-- IMMUTABLE"), because NOW() is STABLE, not IMMUTABLE. A plain index on
-- stale_at still serves the "find stale scores" query efficiently — the
-- BullMQ worker filters WHERE stale_at < NOW() at query time.
CREATE INDEX IF NOT EXISTS nanjila_job_scores_stale_idx
  ON nanjila_job_scores (stale_at);

-- ── 7. Additive column on user_job_applications for Migration Timeline ────
--
-- Populated by server/nanjila/timeline/migration.ts. NULL by default so no
-- existing rows need backfilling before feature ships. Backfilled by a
-- nightly BullMQ job (Phase B).
ALTER TABLE user_job_applications
  ADD COLUMN IF NOT EXISTS expected_next_transition_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS user_job_applications_next_transition_idx
  ON user_job_applications (expected_next_transition_at)
  WHERE expected_next_transition_at IS NOT NULL;

-- ── 8. Register the first capability: check_payment ────────────────────────
--
-- The existing checkPayment tool becomes the seed capability. Registered here
-- with enabled=FALSE so the orchestrator doesn't route to it until we flip
-- the flag intentionally.
INSERT INTO nanjila_capabilities
  (slug, label, description, input_schema, output_schema,
   handler_module, requires_auth, requires_paid, requires_admin, enabled)
VALUES (
  'check_payment',
  'Check payment status',
  'Verify the current user''s payment status for a specific service or plan. Returns success/failure, receipt number, and delivery status.',
  '{"type":"object","properties":{"paymentId":{"type":"string"}},"required":[]}'::jsonb,
  '{"type":"object","properties":{"status":{"type":"string"},"deliveryStatus":{"type":"string"},"receipt":{"type":"string"}}}'::jsonb,
  'capabilities/checkPayment',
  TRUE,
  FALSE,
  FALSE,
  FALSE
)
ON CONFLICT (slug) DO NOTHING;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback playbook (destructive — only if we abandon Phase A entirely):
--
--   BEGIN;
--   DROP INDEX IF EXISTS user_job_applications_next_transition_idx;
--   ALTER TABLE user_job_applications DROP COLUMN IF EXISTS expected_next_transition_at;
--   DROP TABLE IF EXISTS nanjila_job_scores;
--   DROP TABLE IF EXISTS nanjila_readiness_snapshots;
--   DROP TABLE IF EXISTS nanjila_capabilities;
--   DROP TABLE IF EXISTS nanjila_nudges;
--   DROP TABLE IF EXISTS nanjila_conversations;
--   DROP TABLE IF EXISTS nanjila_user_memory;
--   COMMIT;
--
-- Non-destructive rollback (recommended if Phase A ships partially):
--   Set feature flags NANJILA_ORCHESTRATOR_ENABLED=false etc. Tables stay,
--   endpoints stay, but new code paths never fire.
-- ─────────────────────────────────────────────────────────────────────────────
