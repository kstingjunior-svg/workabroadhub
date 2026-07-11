-- 0019_bookmarks_and_journeys.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Two tables that the app queries on every dashboard load but that no
-- previous migration ever created. Every user hits 4–8 x 500s on page load
-- because these tables don't exist (visible in Render runtime log 2026-07-11).
--
--   user_bookmarks         — "save this job / portal / country" (visible
--                            on multiple dashboards + the visa-jobs list)
--   user_country_journeys  — per-user checklist tracker keyed by ISO-2 country
--
-- Schema copied verbatim from the drizzle definitions in shared/schema.ts.
-- Once applied, the /api/bookmarks*, /api/journey* endpoints stop 500-ing.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_bookmarks (
  id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- "visa_job" | "agency_job" | "portal" | "service" | "country"
  item_type     VARCHAR(32)  NOT NULL,
  item_id       VARCHAR(200) NOT NULL,

  title         VARCHAR(300) NOT NULL,
  subtitle      VARCHAR(300),
  country_code  VARCHAR(8),
  href          VARCHAR(500),
  meta          JSONB,

  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- One bookmark row per (user, item_type, item_id) — clicking Save twice is a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_bookmark_item
  ON user_bookmarks (user_id, item_type, item_id);

-- List a user's bookmarks fast.
CREATE INDEX IF NOT EXISTS idx_user_bookmark_user
  ON user_bookmarks (user_id);


CREATE TABLE IF NOT EXISTS user_country_journeys (
  id                 VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  country_code       VARCHAR(8) NOT NULL,

  -- Array of step keys the user has marked complete (e.g. ["passport",
  -- "kcse_attestation"]). Pre-departure checklist items use "pd_" prefix.
  completed_steps    JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- preparing | applying | hired | departed
  stage              VARCHAR(32) NOT NULL DEFAULT 'preparing',

  -- 2026-06 retention #7: countdown + pre-departure visibility
  departure_date     TIMESTAMPTZ,

  started_at         TIMESTAMPTZ DEFAULT NOW(),
  last_touched_at    TIMESTAMPTZ DEFAULT NOW(),
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- One journey row per (user, country). Users targeting multiple countries
-- get one row each.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_country_journey
  ON user_country_journeys (user_id, country_code);

CREATE INDEX IF NOT EXISTS idx_user_country_journey_user
  ON user_country_journeys (user_id);


COMMENT ON TABLE user_bookmarks IS
  'Save-for-later store used by the dashboard and visa-jobs list. One row per (user, item_type, item_id).';

COMMENT ON TABLE user_country_journeys IS
  'Per-user + per-country checklist tracker. completed_steps holds step-key strings; stage tracks self-identified funnel position.';
