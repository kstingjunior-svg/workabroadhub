-- 0046_verified_profiles.sql
-- Verified Migration Profile — Phase 2 of the "Direct Hire Exchange" concept
-- (see MVP roadmap doc). One reusable, worker-controlled shareable credential
-- bundling data already collected elsewhere: identity fields on `users`, a
-- genuine IELTS TRF check (ielts_checks, verdict = 'likely_genuine'), and the
-- AI-reviewed CV (users.generated_cv / ATS tool_reports).
--
-- This table stores ONLY sharing preferences, not profile content — the
-- content itself is assembled live at read time from the tables above, so
-- there is nothing here to keep in sync or go stale.
--
-- Public sharing is off by default (is_public = false): a worker must
-- explicitly opt in before /verified/:share_token resolves to anything.

CREATE TABLE IF NOT EXISTS verified_profiles (
  user_id     VARCHAR PRIMARY KEY,
  share_token VARCHAR(32) NOT NULL,
  is_public   BOOLEAN NOT NULL DEFAULT false,
  show_phone  BOOLEAN NOT NULL DEFAULT false,
  show_email  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMP DEFAULT now(),
  updated_at  TIMESTAMP DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_verified_profiles_share_token
  ON verified_profiles (share_token);
