-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0007 — Sync Engine: Raw Import + Versioned Normalization
--
-- Pre-M2 architectural improvements per ADR-0002:
--
--   1. Raw Import stage  — sync_records.raw_payload now means "exact byte-
--      for-byte provider response, untouched". A new normalized_payload
--      column captures the canonical post-normalize shape. Both are
--      preserved so we can always re-derive the normalized form if the
--      normalizer changes in the future.
--
--   2. Versioned normalizer — sync_records.normalizer_version records
--      which normalizer produced normalized_payload. Combined with the
--      raw payload, this is what makes #1 actionable: a future M-N can
--      scan sync_records WHERE normalizer_version < CURRENT and re-derive
--      the normalized form from raw_payload using the new normalizer.
--
-- sync_records is empty at this point (M1 ships the schema but no engine
-- writes against it yet — M2's apply stage is the first writer), so no
-- backfill logic is needed. The columns are added as nullable; M2 code
-- always populates them; once we ship M2 we can tighten to NOT NULL in a
-- follow-up migration if we want the DB constraint to enforce it.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Add normalized_payload + normalizer_version to sync_records ─────────────
ALTER TABLE sync_records
  ADD COLUMN IF NOT EXISTS normalized_payload  JSONB,
  ADD COLUMN IF NOT EXISTS normalizer_version  VARCHAR;

-- Mirror on sync_runs so we know which normalizer the run was processed
-- with even after sync_records rows are pruned by retention policy.
ALTER TABLE sync_runs
  ADD COLUMN IF NOT EXISTS normalizer_version  VARCHAR,
  ADD COLUMN IF NOT EXISTS fingerprint_version INTEGER;

-- Index on (provider_id, normalizer_version) so M-future re-normalisation
-- can quickly find rows produced by an obsolete normalizer.
CREATE INDEX IF NOT EXISTS sync_records_provider_normalizer_idx
  ON sync_records (provider_id, normalizer_version);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback playbook:
--   BEGIN;
--   DROP INDEX IF EXISTS sync_records_provider_normalizer_idx;
--   ALTER TABLE sync_runs    DROP COLUMN normalizer_version, DROP COLUMN fingerprint_version;
--   ALTER TABLE sync_records DROP COLUMN normalized_payload, DROP COLUMN normalizer_version;
--   COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────
