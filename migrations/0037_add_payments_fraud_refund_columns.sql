-- 2026-08 (Tony emergency #5): last two missing columns on payments.
--
-- The fraud-detection and refund flows also write to columns that
-- don't exist yet:
--   suspected_fraud    (server/routes.ts:773, 899, 7336)
--   refund_requested   (server/routes.ts:962, 979, 22068)
--
-- These are what's causing the final 400s. Adding them here so every
-- code path that touches payments finally succeeds.
--
-- Safe to re-run. Idempotent.

BEGIN;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS suspected_fraud  BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_requested BOOLEAN NOT NULL DEFAULT FALSE;

-- Fast partial indexes for admin queues
CREATE INDEX IF NOT EXISTS payments_suspected_fraud_idx
  ON payments (created_at DESC) WHERE suspected_fraud = TRUE;

CREATE INDEX IF NOT EXISTS payments_refund_requested_idx
  ON payments (created_at DESC) WHERE refund_requested = TRUE;

COMMIT;
