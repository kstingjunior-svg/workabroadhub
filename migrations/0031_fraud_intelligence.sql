-- 2026-07 (Tony's Community Scam Reporting & Fraud Intelligence Platform).
--
-- Extends the minimal `scam_reports` table (agency_name + description +
-- amount) with the rich structured field set from Tony's spec, and adds
-- 4 supporting tables for cross-referencing, aggregated agency profiles,
-- appeals, and moderator audit logging.
--
-- Backwards compatible: existing rows keep working; new columns are all
-- nullable so historical scam reports don't need backfilling.
--
-- Safe to re-run. Idempotent.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- 1) Extend scam_reports with structured intake fields
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE scam_reports ADD COLUMN IF NOT EXISTS agency_slug             VARCHAR;         -- normalized "kingsway-recruitment"
ALTER TABLE scam_reports ADD COLUMN IF NOT EXISTS office_location         VARCHAR;
ALTER TABLE scam_reports ADD COLUMN IF NOT EXISTS website                 VARCHAR;
ALTER TABLE scam_reports ADD COLUMN IF NOT EXISTS facebook_url            VARCHAR;
ALTER TABLE scam_reports ADD COLUMN IF NOT EXISTS instagram_url           VARCHAR;
ALTER TABLE scam_reports ADD COLUMN IF NOT EXISTS tiktok_url              VARCHAR;
ALTER TABLE scam_reports ADD COLUMN IF NOT EXISTS linkedin_url            VARCHAR;
ALTER TABLE scam_reports ADD COLUMN IF NOT EXISTS whatsapp_number         VARCHAR;
ALTER TABLE scam_reports ADD COLUMN IF NOT EXISTS phone_numbers           TEXT;            -- comma-separated
ALTER TABLE scam_reports ADD COLUMN IF NOT EXISTS email_addresses         TEXT;            -- comma-separated
ALTER TABLE scam_reports ADD COLUMN IF NOT EXISTS company_registration    VARCHAR;
ALTER TABLE scam_reports ADD COLUMN IF NOT EXISTS recruitment_licence     VARCHAR;
ALTER TABLE scam_reports ADD COLUMN IF NOT EXISTS employer_name           VARCHAR;
ALTER TABLE scam_reports ADD COLUMN IF NOT EXISTS destination_country     VARCHAR;
ALTER TABLE scam_reports ADD COLUMN IF NOT EXISTS job_applied             VARCHAR;
ALTER TABLE scam_reports ADD COLUMN IF NOT EXISTS incident_date           DATE;
ALTER TABLE scam_reports ADD COLUMN IF NOT EXISTS currency                VARCHAR(8);
ALTER TABLE scam_reports ADD COLUMN IF NOT EXISTS payment_method          VARCHAR;         -- "mpesa","bank","western_union","crypto","cash"
ALTER TABLE scam_reports ADD COLUMN IF NOT EXISTS bank_account            VARCHAR;
ALTER TABLE scam_reports ADD COLUMN IF NOT EXISTS mpesa_number            VARCHAR;
ALTER TABLE scam_reports ADD COLUMN IF NOT EXISTS crypto_wallet           VARCHAR;
ALTER TABLE scam_reports ADD COLUMN IF NOT EXISTS transaction_reference   VARCHAR;
ALTER TABLE scam_reports ADD COLUMN IF NOT EXISTS timeline_json           JSONB;           -- [{ ts, event }]
ALTER TABLE scam_reports ADD COLUMN IF NOT EXISTS ai_analysis_json        JSONB;           -- extracted entities + AI notes
ALTER TABLE scam_reports ADD COLUMN IF NOT EXISTS risk_score              INTEGER;         -- 0-100 (0 = safe, 100 = certain fraud)
ALTER TABLE scam_reports ADD COLUMN IF NOT EXISTS risk_band               VARCHAR(16);     -- "low" | "medium" | "high" | "critical"
ALTER TABLE scam_reports ADD COLUMN IF NOT EXISTS evidence_strength       INTEGER;         -- 0-100 (documents + specificity)
ALTER TABLE scam_reports ADD COLUMN IF NOT EXISTS community_confidence    INTEGER;         -- 0-100 (independent-report count-weighted)
ALTER TABLE scam_reports ADD COLUMN IF NOT EXISTS reporter_ip_hash        VARCHAR(64);     -- SHA-256 of IP, for abuse dedup only
ALTER TABLE scam_reports ADD COLUMN IF NOT EXISTS reviewer_user_id        VARCHAR;
ALTER TABLE scam_reports ADD COLUMN IF NOT EXISTS reviewed_at             TIMESTAMP;
ALTER TABLE scam_reports ADD COLUMN IF NOT EXISTS published_at            TIMESTAMP;

-- Fast lookup indexes for the moderation queue + cross-ref
CREATE INDEX IF NOT EXISTS scam_reports_agency_slug_idx    ON scam_reports (agency_slug)     WHERE agency_slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS scam_reports_whatsapp_idx       ON scam_reports (whatsapp_number) WHERE whatsapp_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS scam_reports_mpesa_idx          ON scam_reports (mpesa_number)    WHERE mpesa_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS scam_reports_bank_idx           ON scam_reports (bank_account)    WHERE bank_account IS NOT NULL;
CREATE INDEX IF NOT EXISTS scam_reports_status_idx         ON scam_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS scam_reports_risk_band_idx      ON scam_reports (risk_band, created_at DESC) WHERE risk_band IS NOT NULL;
CREATE INDEX IF NOT EXISTS scam_reports_reporter_ip_hash_idx ON scam_reports (reporter_ip_hash, created_at DESC) WHERE reporter_ip_hash IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 2) scam_report_contacts — one row per (report, identifier) for cross-ref
--
-- Normalized denormalization: whenever a report includes a phone/email/
-- bank/mpesa/etc, we insert a row here so the cross-ref engine can
-- efficiently find all reports sharing an identifier.
--
-- kind: "phone" | "whatsapp" | "email" | "bank" | "mpesa" | "crypto" |
--       "website" | "facebook" | "instagram" | "tiktok" | "linkedin"
-- normalized: lowercased + stripped (e.g. phone digits only, email
--             lowercased, bank/mpesa digits only)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS scam_report_contacts (
  id           VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id    VARCHAR NOT NULL,
  kind         VARCHAR(16) NOT NULL,
  raw_value    VARCHAR NOT NULL,
  normalized   VARCHAR NOT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS scam_report_contacts_report_id_idx  ON scam_report_contacts (report_id);
CREATE INDEX IF NOT EXISTS scam_report_contacts_normalized_idx ON scam_report_contacts (normalized);
CREATE INDEX IF NOT EXISTS scam_report_contacts_kind_norm_idx  ON scam_report_contacts (kind, normalized);

-- ═══════════════════════════════════════════════════════════════════════
-- 3) reported_agency_profiles — aggregated public view per REPORTED agency.
--
-- One row per unique agency_slug. Updated by the cross-ref engine every
-- time a new report is approved. This powers /agencies-reported/:slug —
-- the community-warning page.
--
-- NAMING NOTE (2026-08): the shorter `agency_profiles` name is already
-- taken by the premium licensed-agency subscriber pages (see Drizzle
-- schema `agencyProfiles`). Do NOT rename or drop it — they're two
-- completely different features (paid subscribers vs. community fraud
-- reports). Kept the URL `/api/agency-profiles/:slug` unchanged because
-- it is public-facing; only the DB table name changed.
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS reported_agency_profiles (
  slug                    VARCHAR PRIMARY KEY,       -- "kingsway-recruitment"
  display_name            VARCHAR NOT NULL,
  country                 VARCHAR,
  office_location         VARCHAR,
  known_websites          TEXT[],
  known_phones            TEXT[],
  known_emails            TEXT[],
  known_whatsapp          TEXT[],
  known_recruiters        TEXT[],
  known_bank_accounts     TEXT[],
  known_mpesa_numbers     TEXT[],
  licence_number          VARCHAR,
  licence_status          VARCHAR,                   -- "active"|"expired"|"unlicensed"|"unknown"
  licence_expires_at      DATE,
  report_count            INTEGER NOT NULL DEFAULT 0,
  approved_report_count   INTEGER NOT NULL DEFAULT 0,
  total_reported_loss_kes BIGINT NOT NULL DEFAULT 0,
  risk_band               VARCHAR(16) NOT NULL DEFAULT 'medium',  -- 'low'|'medium'|'high'|'critical'
  first_report_at         TIMESTAMP,
  last_report_at          TIMESTAMP,
  updated_at              TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reported_agency_profiles_country_idx      ON reported_agency_profiles (country) WHERE country IS NOT NULL;
CREATE INDEX IF NOT EXISTS reported_agency_profiles_risk_band_idx    ON reported_agency_profiles (risk_band, last_report_at DESC);
CREATE INDEX IF NOT EXISTS reported_agency_profiles_report_count_idx ON reported_agency_profiles (report_count DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- 4) scam_report_appeals — controlled response workflow for reported
--    agencies. They submit a signed response; moderators review before
--    it's attached to the public agency profile.
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS scam_report_appeals (
  id                VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id         VARCHAR,                        -- specific report OR
  agency_slug       VARCHAR,                        --   agency-wide appeal
  claimant_name     VARCHAR NOT NULL,
  claimant_email    VARCHAR NOT NULL,
  claimant_phone    VARCHAR,
  claimant_role     VARCHAR,                        -- "owner"|"director"|"legal"|"other"
  proof_of_identity_url TEXT,                       -- link to submitted business licence / ID
  response_text     TEXT NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'pending',   -- pending|approved|rejected
  moderator_note    TEXT,
  reviewed_by       VARCHAR,
  reviewed_at       TIMESTAMP,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS scam_report_appeals_agency_slug_idx ON scam_report_appeals (agency_slug) WHERE agency_slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS scam_report_appeals_report_id_idx   ON scam_report_appeals (report_id)   WHERE report_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS scam_report_appeals_status_idx      ON scam_report_appeals (status, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- 5) scam_report_audit_log — every moderator action, immutable.
--
-- Required for legal defensibility. Every publication, rejection, edit,
-- merge, or blacklist is recorded here with the moderator's userId and
-- reason.
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS scam_report_audit_log (
  id             VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id      VARCHAR,
  agency_slug    VARCHAR,
  actor_user_id  VARCHAR,
  action         VARCHAR NOT NULL,                  -- "approved"|"rejected"|"merged"|"blacklisted"|"appealed"|"edited"
  before_json    JSONB,
  after_json     JSONB,
  reason         TEXT,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS scam_report_audit_log_report_id_idx  ON scam_report_audit_log (report_id, created_at DESC) WHERE report_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS scam_report_audit_log_agency_slug_idx ON scam_report_audit_log (agency_slug, created_at DESC) WHERE agency_slug IS NOT NULL;

COMMIT;
