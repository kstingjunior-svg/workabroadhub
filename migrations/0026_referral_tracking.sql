-- 2026-07 (Tony's viral share loop): every completed order gets a shareable
-- URL /share/:orderId. When a NEW customer arrives via that link and pays,
-- we save the ORIGINATING orderId here so we can (a) attribute the paid
-- conversion, (b) reward the referrer later.
--
-- Deliberately not a FK — if the origin order is ever deleted, we still
-- want the derivative order to survive with a dangling reference.
-- Reward-computation code should nullsafe-join on it.
--
-- Safe to re-run. Idempotent.

ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS referrer_order_id VARCHAR;

-- Index for the eventual "how many people did user X refer?" query.
-- Filters on non-null so we don't index the 99% of rows without a referral.
CREATE INDEX IF NOT EXISTS service_orders_referrer_idx
  ON service_orders (referrer_order_id)
  WHERE referrer_order_id IS NOT NULL;
