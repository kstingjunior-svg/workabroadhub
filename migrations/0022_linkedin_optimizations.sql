-- 2026-07: LinkedIn Profile Optimization workspace (Tony's premium AI feature).
-- Pro-tier tool. Each session lives in a draft that can be re-opened and
-- versioned so users can compare / restore previous rewrites.

CREATE TABLE IF NOT EXISTS linkedin_optimizations (
  id                  varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             varchar NOT NULL,

  -- Raw input the user (or resume parser) gave us. jsonb so we can add fields
  -- without another migration.
  input_json          jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Target career hint (e.g. "warehouse associate", "registered nurse") and
  -- target country (Canada, UK, UAE, ...) drive the keyword injection.
  target_role         varchar(200),
  target_country      varchar(100),

  -- AI output — scores + rewrites. jsonb because the shape includes nested
  -- arrays (experience bullets, keywords, etc).
  scores_json         jsonb DEFAULT '{}'::jsonb,
  output_json         jsonb DEFAULT '{}'::jsonb,

  -- Version snapshot chain — every time a user refines / accepts a rewrite
  -- we append the previous output_json here so they can restore.
  versions_json       jsonb DEFAULT '[]'::jsonb,

  status              varchar(30) NOT NULL DEFAULT 'draft',
                       -- draft | analysing | optimized | error
  last_error          text,

  created_at          timestamp DEFAULT NOW(),
  updated_at          timestamp DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS linkedin_optimizations_user_idx  ON linkedin_optimizations(user_id);
CREATE INDEX IF NOT EXISTS linkedin_optimizations_status_idx ON linkedin_optimizations(status);
