-- 2026-08 (Tony's "wild ideas → build #1" call): AutoApply Agent tables.
--
-- Product concept: user configures an agent (target country, role keywords,
-- min salary, CV). Every night the worker in server/lib/autoapply/ scans
-- verified job sources, ranks matches against the user's CV, drafts a
-- tailored cover letter with the same AI stack we use for /services, and
-- delivers a morning inbox digest. User clicks "Apply" and the agent
-- either auto-submits (V2) or opens the job URL with the letter copied
-- to the clipboard (V1).
--
-- Business model: KES 1,500/month for up to 30 matches/week, KES 4,500/month
-- for unlimited + interview prep bundle. Subscription-gated via
-- users.plan and the requirePlan middleware.

-- ─── Per-user agent configuration ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS autoapply_agents (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             VARCHAR     NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- What the user is hunting for
  target_countries    TEXT[]      NOT NULL DEFAULT '{}',   -- e.g. {'uk','uae','canada'}
  target_roles        TEXT[]      NOT NULL DEFAULT '{}',   -- e.g. {'registered nurse','staff nurse','ICU nurse'}
  target_industries   TEXT[]              DEFAULT '{}',    -- e.g. {'healthcare','it','hospitality'}
  min_salary_kes      INTEGER,                             -- monthly floor in KES (converted at scan time)
  visa_sponsorship_required BOOLEAN NOT NULL DEFAULT true,
  remote_ok           BOOLEAN     NOT NULL DEFAULT false,
  experience_years    INTEGER,                             -- user's YOE, used for scoring

  -- CV snapshot at time of agent creation. Stored inline so scans don't
  -- have to re-fetch from service_orders every night.
  cv_text             TEXT        NOT NULL,
  cv_file_url         TEXT,                                -- optional storage URL

  -- Scan behaviour
  is_active           BOOLEAN     NOT NULL DEFAULT true,
  max_matches_per_day INTEGER     NOT NULL DEFAULT 10,     -- cap so users aren't overwhelmed
  daily_report_time   VARCHAR(5)  NOT NULL DEFAULT '06:00', -- local time (EAT) for digest email
  last_scan_at        TIMESTAMP,
  next_scan_at        TIMESTAMP,

  -- Diagnostics
  total_matches_lifetime  INTEGER NOT NULL DEFAULT 0,
  total_applied_lifetime  INTEGER NOT NULL DEFAULT 0,

  created_at          TIMESTAMP   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP   NOT NULL DEFAULT NOW(),

  -- 2026-08: one agent per user for now. The upsert in
  -- server/routes/autoapply.ts relies on this. If we ever add
  -- multiple agents per user, this UNIQUE would be dropped and
  -- the upsert would move to a compound key.
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS autoapply_agents_user_id_idx  ON autoapply_agents(user_id);
CREATE INDEX IF NOT EXISTS autoapply_agents_active_idx   ON autoapply_agents(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS autoapply_agents_next_scan_idx ON autoapply_agents(next_scan_at) WHERE is_active = true;

-- ─── Per-match record (one row per job the agent found for a user) ─────
CREATE TABLE IF NOT EXISTS autoapply_matches (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id            UUID        NOT NULL REFERENCES autoapply_agents(id) ON DELETE CASCADE,
  user_id             VARCHAR     NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- The matched job (from Adzuna / verified portals / RSS)
  source              VARCHAR(64) NOT NULL,     -- 'adzuna' | 'nhs_jobs' | 'ircc' | 'manual_import'
  external_id         VARCHAR(256),             -- source-specific id for dedupe
  job_title           VARCHAR(500) NOT NULL,
  employer            VARCHAR(500),
  country             VARCHAR(64),
  city                VARCHAR(200),
  salary_display      VARCHAR(200),             -- raw string as shown by source, e.g. "£30,000 – £35,000"
  salary_kes_monthly  INTEGER,                  -- normalised for filtering / comparison
  posted_at           TIMESTAMP,
  apply_url           TEXT        NOT NULL,     -- where the user goes to apply
  description         TEXT,                     -- job body (truncated to 8000 chars)

  -- Scoring
  match_score         INTEGER     NOT NULL,     -- 0-100, higher = better match
  match_reasons       TEXT[],                   -- e.g. {'nurse skills','uk experience','ielts 7'}

  -- AI-drafted cover letter (generated at scan time, cached)
  cover_letter        TEXT,
  cover_letter_at     TIMESTAMP,

  -- User action state
  status              VARCHAR(32) NOT NULL DEFAULT 'new',  -- 'new' | 'starred' | 'applied' | 'dismissed'
  applied_at          TIMESTAMP,
  dismissed_at        TIMESTAMP,

  created_at          TIMESTAMP   NOT NULL DEFAULT NOW(),
  UNIQUE(agent_id, source, external_id)                    -- dedupe: same job won't be re-added
);

CREATE INDEX IF NOT EXISTS autoapply_matches_agent_id_idx  ON autoapply_matches(agent_id);
CREATE INDEX IF NOT EXISTS autoapply_matches_user_id_idx   ON autoapply_matches(user_id);
CREATE INDEX IF NOT EXISTS autoapply_matches_status_idx    ON autoapply_matches(status);
CREATE INDEX IF NOT EXISTS autoapply_matches_created_at_idx ON autoapply_matches(created_at DESC);
CREATE INDEX IF NOT EXISTS autoapply_matches_score_idx     ON autoapply_matches(match_score DESC);

-- ─── Scan history (audit + rate limiting) ──────────────────────────────
CREATE TABLE IF NOT EXISTS autoapply_scan_runs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id            UUID        NOT NULL REFERENCES autoapply_agents(id) ON DELETE CASCADE,
  started_at          TIMESTAMP   NOT NULL DEFAULT NOW(),
  finished_at         TIMESTAMP,
  status              VARCHAR(32) NOT NULL,                -- 'running' | 'ok' | 'error'
  jobs_scanned        INTEGER     DEFAULT 0,
  matches_found       INTEGER     DEFAULT 0,
  matches_stored      INTEGER     DEFAULT 0,               -- after dedupe
  cover_letters_generated INTEGER DEFAULT 0,
  report_sent         BOOLEAN     DEFAULT false,
  error_message       TEXT
);
CREATE INDEX IF NOT EXISTS autoapply_scan_runs_agent_idx ON autoapply_scan_runs(agent_id, started_at DESC);
