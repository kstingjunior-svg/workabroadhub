-- 2026-07: IELTS Verifier — user uploads their TRF (Test Report Form),
-- we run heuristic + AI-vision checks, flag likely fakes, and direct them
-- to the official IELTS verification portal for the definitive check.
--
-- Retention: 30 days. Purge older rows via a scheduled job (mirrors
-- offer_letter_checks pattern).

CREATE TABLE IF NOT EXISTS ielts_checks (
  id                  varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             varchar,                              -- nullable — guests can check with per-IP limit
  guest_fingerprint   varchar(64),                           -- for anon rate-limiting
  file_sha256         varchar(64) NOT NULL,                  -- dedupe key

  -- Parsed fields from the TRF
  trf_number          varchar(32),                           -- e.g. "24CN000123ABCD01"
  test_centre_code    varchar(16),                           -- from TRF (e.g. "CN000")
  test_date           date,                                  -- date on the TRF
  candidate_name      varchar(200),
  test_type           varchar(30),                           -- Academic | General Training | Life Skills
  overall_band        numeric(2, 1),                         -- e.g. 7.5
  listening_band      numeric(2, 1),
  reading_band        numeric(2, 1),
  writing_band        numeric(2, 1),
  speaking_band       numeric(2, 1),

  -- Verdict
  verdict             varchar(30) NOT NULL,                  -- likely_genuine | suspicious | likely_fake | undetermined
  confidence          integer NOT NULL DEFAULT 0,             -- 0..100
  findings_json       jsonb NOT NULL DEFAULT '[]'::jsonb,     -- array of { code, severity, message }

  -- Ops
  ai_vision_used      boolean NOT NULL DEFAULT false,
  raw_text            text,                                    -- extracted text (or vision-derived text)
  error_message       text,
  created_at          timestamp DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ielts_checks_user_idx    ON ielts_checks(user_id);
CREATE INDEX IF NOT EXISTS ielts_checks_guest_idx   ON ielts_checks(guest_fingerprint);
CREATE INDEX IF NOT EXISTS ielts_checks_sha_idx     ON ielts_checks(file_sha256);
CREATE INDEX IF NOT EXISTS ielts_checks_created_idx ON ielts_checks(created_at);
