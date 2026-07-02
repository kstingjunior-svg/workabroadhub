-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0010 — Visa Screening Tool (free tools)
--
-- Storage for the /tools/visa-check screening pipeline. Each row records
-- one screening request: the OCR'd fields we extracted, the findings the
-- rule engine + AI vision produced, and the composite 0-100 risk score.
--
-- Design notes:
--   • user_id is nullable — guests can use the tool without signing in.
--   • image_sha256 lets us de-duplicate repeat uploads and detect abuse.
--   • image_bytes is NOT stored on the row (PII); only the hash + OCR text
--     survive. If admin needs the original for review, they retrieve from
--     a separate, encrypted blob store keyed by image_sha256.
--   • retention_expires_at defaults to 30 days out. A daily sweep deletes
--     everything past its window per the Kenya Data Protection Act.
--   • Never store the raw MRZ line as-is in production logs — it contains
--     the passport number of the holder. Stored here in the DB row only
--     because the whole row is admin-gated + auto-expiring.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS visa_checks (
  id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  -- Guest identifier: hashed IP + user-agent so we can rate-limit guests
  -- without storing the raw IP. Populated only when user_id is NULL.
  guest_fingerprint     VARCHAR,

  -- The input we screened
  original_filename     VARCHAR,
  mime_type             VARCHAR,
  file_size_bytes       INTEGER,
  image_sha256          VARCHAR NOT NULL,

  -- Extracted content
  ocr_text              TEXT,
  ocr_method            VARCHAR,          -- 'vision' | 'tesseract' | 'both'

  -- Parsed fields (nullable — some visas won't yield all of these)
  visa_number           VARCHAR,
  issuing_country       VARCHAR,
  holder_name           VARCHAR,
  visa_type             VARCHAR,
  issue_date            DATE,
  expiry_date           DATE,

  -- MRZ (Machine Readable Zone) — the strongest single signal
  mrz_present           BOOLEAN NOT NULL DEFAULT FALSE,
  mrz_raw               TEXT,
  mrz_checksum_valid    BOOLEAN,

  -- Result of the screening pipeline
  risk_score            INTEGER NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  risk_band             VARCHAR NOT NULL CHECK (risk_band IN ('low', 'medium', 'high')),
  findings              JSONB NOT NULL,   -- array of { code, severity, message }
  ai_vision_used        BOOLEAN NOT NULL DEFAULT FALSE,
  ai_vision_notes       TEXT,             -- what the vision model flagged

  -- Admin review lifecycle (optional — for cases users escalate)
  escalated             BOOLEAN NOT NULL DEFAULT FALSE,
  admin_verdict         VARCHAR,          -- 'confirmed_genuine' | 'confirmed_fake' | 'inconclusive'
  admin_notes           TEXT,
  reviewed_by           VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at           TIMESTAMP,

  -- Bookkeeping
  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  retention_expires_at  TIMESTAMP NOT NULL DEFAULT NOW() + INTERVAL '30 days'
);

CREATE INDEX IF NOT EXISTS visa_checks_user_created_idx
  ON visa_checks (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS visa_checks_guest_created_idx
  ON visa_checks (guest_fingerprint, created_at DESC)
  WHERE user_id IS NULL;

-- For the daily retention sweep.
CREATE INDEX IF NOT EXISTS visa_checks_retention_idx
  ON visa_checks (retention_expires_at);

-- For admin queue: escalated checks awaiting review.
CREATE INDEX IF NOT EXISTS visa_checks_escalated_idx
  ON visa_checks (escalated, created_at DESC)
  WHERE escalated = TRUE AND admin_verdict IS NULL;

-- For repeated-upload detection (same image_sha256).
CREATE INDEX IF NOT EXISTS visa_checks_sha_idx
  ON visa_checks (image_sha256);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback:
--   BEGIN;
--   DROP INDEX IF EXISTS visa_checks_sha_idx;
--   DROP INDEX IF EXISTS visa_checks_escalated_idx;
--   DROP INDEX IF EXISTS visa_checks_retention_idx;
--   DROP INDEX IF EXISTS visa_checks_guest_created_idx;
--   DROP INDEX IF EXISTS visa_checks_user_created_idx;
--   DROP TABLE IF EXISTS visa_checks;
--   COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────
