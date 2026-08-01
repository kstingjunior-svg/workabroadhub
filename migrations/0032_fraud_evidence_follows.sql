-- 2026-07 (Tony's Fraud Intelligence Platform — Phase 2)
--
-- Adds:
--   scam_report_evidence — up to 50 files per report, with mime + size + hash
--   agency_follows       — user opts in to updates on a specific agency
--
-- Safe to re-run. Idempotent.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- 1) scam_report_evidence — per-file evidence records.
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS scam_report_evidence (
  id             VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id      VARCHAR,                            -- link to scam_reports.id (nullable during upload batch)
  upload_batch   VARCHAR NOT NULL,                   -- groups uploads BEFORE the report is submitted
  file_name      VARCHAR NOT NULL,
  file_mime      VARCHAR NOT NULL,
  file_size      INTEGER NOT NULL,
  file_sha256    VARCHAR(64) NOT NULL,
  file_data      TEXT,                               -- base64 data URL (bounded — server enforces 8 MB cap)
  ai_extracted   JSONB,                              -- optional post-analysis: names, phones, amounts pulled from the file
  ai_analyzed_at TIMESTAMP,
  uploaded_by    VARCHAR,                            -- user id or NULL for anonymous
  reporter_ip_hash VARCHAR(64),
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS scam_report_evidence_report_id_idx    ON scam_report_evidence (report_id) WHERE report_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS scam_report_evidence_upload_batch_idx ON scam_report_evidence (upload_batch);
CREATE INDEX IF NOT EXISTS scam_report_evidence_sha256_idx       ON scam_report_evidence (file_sha256);

-- ═══════════════════════════════════════════════════════════════════════
-- 2) agency_follows — user subscribes to updates on a reported agency.
--
-- One row per (user_id, agency_slug). When new reports get approved for
-- that agency, followed users get a notification (in-app + optional email).
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS agency_follows (
  id             VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        VARCHAR NOT NULL,
  agency_slug    VARCHAR NOT NULL,
  notify_email   BOOLEAN NOT NULL DEFAULT TRUE,     -- email me on new reports for this agency
  notify_licence BOOLEAN NOT NULL DEFAULT TRUE,     -- email me if their licence status changes
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS agency_follows_user_slug_idx ON agency_follows (user_id, agency_slug);
CREATE INDEX IF NOT EXISTS agency_follows_slug_idx ON agency_follows (agency_slug);

COMMIT;
