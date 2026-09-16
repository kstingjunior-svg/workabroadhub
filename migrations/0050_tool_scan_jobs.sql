-- 2026-09 (Tony's "people are paying but I can't tell if it's working"
-- report): the four paid AI verification tools (offer_check, visa_check,
-- ielts_verify, job_scam_check) all ran their gpt-4o analysis SYNCHRONOUSLY
-- inside the HTTP request, exactly like the ATS checker did before
-- migration 0049 fixed it. Render's edge proxy kills any request around
-- ~30s; production logs show hundreds of real paid scans (confirmed: 65+
-- on offer-verify, 35+ on visa-verify in the most recent sample alone,
-- going back weeks) dying to a 502 before the client ever saw a result —
-- and because requireToolCredit() consumes the KES 100 credit atomically
-- BEFORE the slow analysis starts, every one of those was a real customer
-- charged for a scan they never received.
--
-- Same fix as 0049: the endpoint now returns a job id immediately and the
-- client polls for the result instead of holding one long request open.
-- One shared table (with a `tool` discriminator) backs all four tools
-- instead of four near-identical copies of ats_check_jobs.
CREATE TABLE IF NOT EXISTS tool_scan_jobs (
  id            uuid PRIMARY KEY,
  tool          varchar NOT NULL, -- 'offer_check' | 'visa_check' | 'ielts_verify' | 'job_scam_check'
  user_id       varchar,
  payment_id    varchar,          -- the consumed scan-token (payments.id), for traceability
  status        varchar NOT NULL DEFAULT 'processing', -- 'processing' | 'done' | 'error'
  result        jsonb,
  error_message text,
  created_at    timestamp NOT NULL DEFAULT now(),
  updated_at    timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tool_scan_jobs_created_at ON tool_scan_jobs (created_at);
CREATE INDEX IF NOT EXISTS idx_tool_scan_jobs_tool ON tool_scan_jobs (tool);
