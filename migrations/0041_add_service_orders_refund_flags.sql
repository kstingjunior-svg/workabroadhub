-- ─────────────────────────────────────────────────────────────────────────
-- 0041_add_service_orders_refund_flags.sql
-- 2026-08 — add refund tracking columns to service_orders
--
-- When the CV quality guardrail fires (AI produced subpar output that got
-- kicked to human review), we want to automatically flag the order for
-- refund so admin has a clear queue of "these people paid but got less
-- than promised on the first attempt."
--
-- Even when we manually rewrite for them free of charge, the refund still
-- makes sense as accounting acknowledgement of the failed first attempt.
--
-- The payments table already has refund_requested (migration 0037), but
-- the guardrail operates on service_orders and shouldn't need to reverse-
-- lookup the payment. Add the same flag on the service order level.
-- ─────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS refund_requested BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS refund_processed_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_service_orders_refund_requested
  ON service_orders (refund_requested)
  WHERE refund_requested = true;

COMMIT;
