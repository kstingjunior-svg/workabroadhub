-- ─────────────────────────────────────────────────────────────────────────
-- 0040_add_awaiting_review_status.sql
-- 2026-08 — expand service_orders.status CHECK constraint
--
-- Adds 'awaiting_review' as a valid status for service_orders. This is the
-- terminal state set by the CV Revamp quality guardrail
-- (server/service-order-routes.ts) when the AI output fails the length-
-- preservation check even after a retry — meaning the WorkAbroad Hub team
-- will personally rewrite the document within 4 hours.
--
-- Without this migration:
--   - The guardrail attempted to set status='awaiting_review' but the old
--     CHECK constraint only allowed the 7 statuses in use at the time.
--   - The UPDATE errored (23514), the row stayed in status='processing',
--     and the client polling loop hung indefinitely on the
--     "Generating your CV Revamp…" spinner.
--
-- This migration preserves every status value already in production
-- (pending_payment, paid, processing, completed, failed, cancelled,
-- expired) and adds 'awaiting_review' on top. No data changes — only the
-- constraint is widened.
-- ─────────────────────────────────────────────────────────────────────────

BEGIN;

-- Drop the old constraint if it exists (safe on fresh DBs and re-runs)
ALTER TABLE service_orders
  DROP CONSTRAINT IF EXISTS service_orders_status_check;

-- Recreate with the full set of allowed statuses
ALTER TABLE service_orders
  ADD CONSTRAINT service_orders_status_check
  CHECK (status IN (
    'pending_payment',
    'paid',
    'processing',
    'completed',
    'failed',
    'cancelled',
    'expired',
    'awaiting_review'
  ));

COMMIT;
