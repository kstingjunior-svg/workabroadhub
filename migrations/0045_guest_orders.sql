-- 0045_guest_orders.sql
-- Allow anonymous (no-signup) checkout for career services.
-- Tony's directive 2026-08: career services (CV Revamp, Cover Letter, SOP,
-- Write-from-Scratch, LinkedIn, Country CV, Recruitment CV) should be
-- purchasable WITHOUT an account. User clicks → upload/fill → pay → gets a
-- magic download link via email. No signup, no login modal.
--
-- Design:
--   * user_id stays nullable (already was) — set NULL for guest orders
--   * guest_name / guest_email / guest_phone: captured at checkout
--   * download_token: 48-char cryptographically random hex, mailed to guest
--   * download_expires_at: 30 days after generation
--   * download_count: cap at 20 to prevent public re-sharing abuse
--
-- Logged-in users keep the existing user_id flow untouched — this is purely
-- additive. Guest orders are identifiable by (user_id IS NULL) OR by having
-- a non-null download_token.

ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS guest_name           TEXT,
  ADD COLUMN IF NOT EXISTS guest_email          TEXT,
  ADD COLUMN IF NOT EXISTS guest_phone          TEXT,
  ADD COLUMN IF NOT EXISTS download_token       TEXT,
  ADD COLUMN IF NOT EXISTS download_expires_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS download_count       INTEGER NOT NULL DEFAULT 0;

-- Unique index so a token can identify exactly one order. Partial index
-- (WHERE download_token IS NOT NULL) so it only covers guest orders and
-- doesn't waste space on the millions of eventual logged-in orders.
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_orders_download_token
  ON service_orders (download_token)
  WHERE download_token IS NOT NULL;

-- Case-insensitive lookup by guest_email so users can request "resend link"
-- from the download page using the same email they paid with.
CREATE INDEX IF NOT EXISTS idx_service_orders_guest_email
  ON service_orders (LOWER(guest_email))
  WHERE guest_email IS NOT NULL;

-- 2026-08 (P0 guest-checkout follow-up): payments.user_id was NOT NULL,
-- which blocked our anonymous M-Pesa flow ("column phone_number of relation
-- payments does not exist" error was misleading — the real fault was the
-- user_id NULL constraint tripping on the INSERT). Drop the constraint so
-- guest payments can record with user_id NULL. All existing rows already
-- have a user_id, so this is safe (no data lost, no default backfill).
ALTER TABLE payments ALTER COLUMN user_id DROP NOT NULL;
