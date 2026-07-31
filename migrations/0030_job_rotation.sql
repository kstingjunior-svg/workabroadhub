-- 2026-07 (Tony's founder brief): Dynamic Job Rotation Engine support tables.
--
-- Two lightweight tables:
--   job_impressions        — aggregated per-job counters (views, clicks, applies)
--   job_admin_overrides    — pin / feature / boost / blacklist per job
--
-- These are consumed by server/lib/job-rotation.ts to modify the ranking
-- signal. Both are safe to leave empty — rotation still works, just without
-- exposure-fairness or admin control.
--
-- Safe to re-run. Idempotent.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- job_impressions — aggregated engagement counters per job.
--
-- Updated by /api/visa-jobs/track (fire-and-forget from the client on
-- render) and by /api/visa-jobs/:id/apply on successful redirect. Used
-- by the rotation engine to boost under-shown jobs (exposure fairness).
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS job_impressions (
  job_id       VARCHAR PRIMARY KEY,
  impressions  INTEGER NOT NULL DEFAULT 0,      -- times rendered on any user's feed
  clicks       INTEGER NOT NULL DEFAULT 0,      -- times someone opened the detail
  applies      INTEGER NOT NULL DEFAULT 0,      -- times someone clicked Apply
  last_seen    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS job_impressions_impressions_idx
  ON job_impressions (impressions DESC);
CREATE INDEX IF NOT EXISTS job_impressions_applies_idx
  ON job_impressions (applies DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- job_admin_overrides — admin controls per job.
--
-- rank_type semantics:
--   'pinned'      → always shown at the top (in order of updated_at DESC)
--   'featured'    → strong boost, sits near the top most of the time
--   'boosted'     → mild boost (numeric strength via boost_amount 0-100)
--   'demoted'     → mild negative signal, drops toward the bottom
--   'blacklisted' → removed from all rotations
--
-- expires_at lets admins schedule short-term promotions ("Trending Today")
-- without needing to remember to remove them. NULL = permanent.
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS job_admin_overrides (
  job_id         VARCHAR PRIMARY KEY,
  rank_type      VARCHAR NOT NULL CHECK (rank_type IN ('pinned','featured','boosted','demoted','blacklisted')),
  boost_amount   INTEGER NOT NULL DEFAULT 0,    -- 0-100, only used for 'boosted'
  reason         TEXT,                          -- admin note
  starts_at      TIMESTAMP,
  expires_at     TIMESTAMP,
  created_by     VARCHAR,                       -- admin userId
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS job_admin_overrides_rank_type_idx
  ON job_admin_overrides (rank_type);
CREATE INDEX IF NOT EXISTS job_admin_overrides_expires_at_idx
  ON job_admin_overrides (expires_at)
  WHERE expires_at IS NOT NULL;

COMMIT;
