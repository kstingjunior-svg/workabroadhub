-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0011 — Offer Letter Screening Tool (free tools)
--
-- Storage for /tools/offer-check screening pipeline. Mirrors visa_checks
-- structure so the same admin review + retention discipline applies:
--   • user_id nullable — guests can use the tool without signing in
--   • hashed IP + user-agent = guest_fingerprint for rate-limiting
--   • only sha256 of the file bytes is retained; bytes discarded
--   • 30-day retention default; daily sweep deletes past-window rows
--
-- Screening result columns match the shape returned by
-- server/tools/offer-screening.screenOffer():
--   parsed:      candidate name, company, position, salary, start date
--   employerSig: sender domain vs claimed company, letterhead presence
--   findings:    array of { code, severity, message, matched? }
--   verdict:     0-100 risk score + low/medium/high band
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS offer_letter_checks (
  id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  guest_fingerprint     VARCHAR,

  -- The input we screened
  original_filename     VARCHAR,
  mime_type             VARCHAR,
  file_size_bytes       INTEGER,
  file_sha256           VARCHAR NOT NULL,

  -- Extracted content
  ocr_text              TEXT,
  extraction_method     VARCHAR,          -- 'pdf' | 'docx' | 'vision' | 'tesseract'

  -- Parsed candidate + offer details (best-effort)
  candidate_name        VARCHAR,
  employer_name         VARCHAR,
  position_title        VARCHAR,
  work_country          VARCHAR,
  salary_amount         VARCHAR,          -- text — may contain currency, ranges
  salary_currency       VARCHAR,
  start_date            DATE,

  -- Employer authenticity signals
  sender_domain         VARCHAR,          -- domain of any HR email found in the letter
  domain_matches_company BOOLEAN,         -- rough match on domain root vs employer name
  has_letterhead        BOOLEAN,          -- visual signal from AI vision (nullable)
  has_signature         BOOLEAN,
  has_physical_address  BOOLEAN,

  -- Result of the screening pipeline
  risk_score            INTEGER NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  risk_band             VARCHAR NOT NULL CHECK (risk_band IN ('low', 'medium', 'high')),
  findings              JSONB NOT NULL,   -- array of { code, severity, message }
  ai_vision_used        BOOLEAN NOT NULL DEFAULT FALSE,
  ai_vision_notes       TEXT,

  -- Admin review lifecycle (for escalated cases)
  escalated             BOOLEAN NOT NULL DEFAULT FALSE,
  admin_verdict         VARCHAR,          -- 'confirmed_legit' | 'confirmed_fake' | 'inconclusive'
  admin_notes           TEXT,
  reviewed_by           VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at           TIMESTAMP,

  -- Bookkeeping
  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  retention_expires_at  TIMESTAMP NOT NULL DEFAULT NOW() + INTERVAL '30 days'
);

CREATE INDEX IF NOT EXISTS offer_letter_checks_user_created_idx
  ON offer_letter_checks (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS offer_letter_checks_guest_created_idx
  ON offer_letter_checks (guest_fingerprint, created_at DESC)
  WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS offer_letter_checks_retention_idx
  ON offer_letter_checks (retention_expires_at);

CREATE INDEX IF NOT EXISTS offer_letter_checks_escalated_idx
  ON offer_letter_checks (escalated, created_at DESC)
  WHERE escalated = TRUE AND admin_verdict IS NULL;

CREATE INDEX IF NOT EXISTS offer_letter_checks_sha_idx
  ON offer_letter_checks (file_sha256);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback:
--   BEGIN;
--   DROP INDEX IF EXISTS offer_letter_checks_sha_idx;
--   DROP INDEX IF EXISTS offer_letter_checks_escalated_idx;
--   DROP INDEX IF EXISTS offer_letter_checks_retention_idx;
--   DROP INDEX IF EXISTS offer_letter_checks_guest_created_idx;
--   DROP INDEX IF EXISTS offer_letter_checks_user_created_idx;
--   DROP TABLE IF EXISTS offer_letter_checks;
--   COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────
