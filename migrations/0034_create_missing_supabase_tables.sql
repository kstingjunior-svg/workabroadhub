-- 2026-08 (Tony emergency #2): 404 flood in Supabase REST logs.
--
-- Root cause: server code calls supabase.from("user_events") and
-- supabase.from("subscriptions") heavily (analytics, subscription
-- renewal, expiry sweeps) but neither table exists in the current
-- schema — probably renamed at some point without the calls being
-- updated. Every logged-in user page view fires 4 user_events reads
-- and every 5-minute cron fires a subscriptions expiry check — all
-- silently returning 404 from PostgREST.
--
-- Fix: create both tables with the exact shape the code expects.
-- Both writes and reads then succeed. No RLS added — server uses
-- the service_role key which bypasses RLS by default.
--
-- Safe to re-run. Idempotent.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- 1) user_events — analytics log used by hot-users detection, personal
--    interest inference, and Nanjila's user activity summariser.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_events (
  id         BIGSERIAL PRIMARY KEY,
  user_id    VARCHAR,                        -- may be null for anonymous events
  event      VARCHAR NOT NULL,               -- 'view_job'|'click_upgrade'|'payment_success'|...
  category   VARCHAR,                        -- optional service/job category tag
  country    VARCHAR,                        -- optional country dimension
  page       VARCHAR,                        -- optional route path
  metadata   JSONB,                          -- catch-all for future extra dims
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hot indexes for the queries we saw in logs
CREATE INDEX IF NOT EXISTS user_events_user_id_idx
  ON user_events (user_id) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_events_user_event_idx
  ON user_events (user_id, event) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_events_created_at_idx
  ON user_events (created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- 2) subscriptions — plan-status table used by the fraud check, the
--    subscription renewal service, and the expiry sweep. Note this is
--    DIFFERENT from `user_subscriptions` (Drizzle-managed) which serves
--    a different code path. Keeping both to avoid a risky refactor.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS subscriptions (
  id             VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        VARCHAR NOT NULL,
  plan_id        VARCHAR,                          -- 'pro'|'basic'|...
  provider       VARCHAR,                          -- 'mpesa'|'paypal'|'card'
  status         VARCHAR NOT NULL DEFAULT 'active',-- 'active'|'expired'|'cancelled'
  auto_renew     BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at     TIMESTAMPTZ,
  purchase_token VARCHAR,                          -- external provider receipt
  product_id     VARCHAR,                          -- external product id
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active subscription per user (matches how the code queries it).
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_active_idx
  ON subscriptions (user_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS subscriptions_status_idx
  ON subscriptions (status, expires_at);

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx
  ON subscriptions (user_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 3) payments — add missing columns the unmatched-payment retry engine
--    (server/routes.ts around line 22386) expects. Query was 400ing
--    every 5 minutes with "column payments.matched does not exist".
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS matched         BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS retry_count     INTEGER NOT NULL DEFAULT 0;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS auto_upgraded   BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS processed       BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial index that supports the exact retry-engine query.
CREATE INDEX IF NOT EXISTS payments_unmatched_retryable_idx
  ON payments (created_at DESC)
  WHERE matched = FALSE AND retry_count < 5;

COMMIT;
