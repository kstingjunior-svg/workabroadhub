-- 2026-09 (Tony: "CV checker has an issue — make sure any CV, they can
-- see their score"): the ATS check ran gpt-4o synchronously inside the
-- HTTP request. Render's edge proxy kills requests around ~30s; a full
-- 20-phase/18-section report from gpt-4o routinely took 22-30s+, so a
-- majority of real checks were getting killed by Render with a 502
-- before the client ever saw a score (confirmed in production logs:
-- roughly 60% of requests failing this way over the last 3 days, and
-- rising). Render's own guidance for exactly this situation is to make
-- the web handler a "thin" responder and run the slow work in the
-- background — this table backs that: the endpoint now returns a job id
-- immediately and the client polls for the result instead of holding one
-- long request open (see server/tools-routes.ts).
CREATE TABLE IF NOT EXISTS ats_check_jobs (
  id            uuid PRIMARY KEY,
  user_id       varchar,
  status        varchar NOT NULL DEFAULT 'processing', -- 'processing' | 'done' | 'error'
  result        jsonb,
  error_message text,
  created_at    timestamp NOT NULL DEFAULT now(),
  updated_at    timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ats_check_jobs_created_at ON ats_check_jobs (created_at);
