-- 2026-08 (Tony's "Creating order..." infinite spinner long-term fix):
--   Background CV extraction. Order creation returns in <1s regardless of
--   whether the CV needs slow OCR — we stash the raw file bytes and let
--   processOrder run the slow extraction (Tesseract / OpenAI PDF) after
--   payment confirms, before AI generation.
--
--   New columns on service_orders:
--     cv_raw_base64        text     — base64-encoded file bytes, cleared once
--                                     cv_text is populated
--     cv_raw_mime          varchar  — original MIME type (for extraction)
--     cv_raw_filename      varchar  — original filename (helps pdfjs)
--     cv_extraction_status varchar  — 'complete' | 'pending' | 'failed'
--                                     'complete' = cv_text is authoritative
--                                     'pending'  = raw file stored, extract on payment
--                                     'failed'   = tried and got nothing usable
--
--   Fully backward-compatible:
--     - Existing rows have all NULL, treated as 'complete' by processOrder
--     - No existing code path breaks if the columns don't yet exist (helper
--       reads them defensively).
--
--   Safe to re-run.

BEGIN;

ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS cv_raw_base64        TEXT,
  ADD COLUMN IF NOT EXISTS cv_raw_mime          VARCHAR(128),
  ADD COLUMN IF NOT EXISTS cv_raw_filename      VARCHAR(300),
  ADD COLUMN IF NOT EXISTS cv_extraction_status VARCHAR(20);

-- Backfill: existing rows are treated as complete (their cv_text was populated
-- synchronously by the old flow). New pending rows get 'pending' set explicitly.
UPDATE service_orders
   SET cv_extraction_status = 'complete'
 WHERE cv_extraction_status IS NULL
   AND cv_text IS NOT NULL;

-- Index to let the background sweep find pending rows quickly.
CREATE INDEX IF NOT EXISTS idx_service_orders_extraction_pending
  ON service_orders (cv_extraction_status, status)
  WHERE cv_extraction_status = 'pending';

COMMIT;
