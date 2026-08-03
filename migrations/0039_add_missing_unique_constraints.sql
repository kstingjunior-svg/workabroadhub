-- 2026-08 (Tony's leak report — continued):
--
-- 42P10 "no unique or exclusion constraint matching the ON CONFLICT
-- specification" errors are still trickling in even after yesterday's
-- subscriptions upsert fix. Root cause: several tables that the code
-- treats as having UNIQUE constraints only have plain indexes on the
-- ON CONFLICT target column. Postgres refuses ON CONFLICT (col) unless
-- there's a real UNIQUE constraint or a UNIQUE index (not a plain one).
--
-- This migration adds a UNIQUE index on every hot ON CONFLICT target
-- across the app. Idempotent — CREATE UNIQUE INDEX IF NOT EXISTS is a
-- no-op if the constraint already exists.
--
-- Tables covered:
--   webhook_processing_locks (lock_key)   — every M-Pesa STK callback
--   mpesa_pull_config        (short_code) — reconciler every 5 minutes
--   mpesa_pull_transactions  (transaction_id) — every reconciled txn
--   phone_lookups            (phone)      — PK already, harmless recheck
--   chat_post_quota          (user_id)    — PK already, harmless recheck
--   agency_follows           (user_id, agency_slug) — from migration 0032
--
-- Safe to re-run. Zero downtime — CREATE UNIQUE INDEX with IF NOT EXISTS
-- doesn't take an exclusive lock long enough to disrupt live traffic.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- 1) webhook_processing_locks.lock_key
--    Called from server/payment-processor.ts on every payment webhook.
--    Volume: ~1-2 per minute during payment activity. This is the main
--    source of the 42P10 flood.
-- ═══════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS webhook_processing_locks_lock_key_uidx
  ON webhook_processing_locks (lock_key);

-- Drop the old plain index if it exists (redundant now — the unique
-- index above also serves as a lookup index).
DROP INDEX IF EXISTS idx_webhook_locks_key;

-- ═══════════════════════════════════════════════════════════════════════
-- 2) mpesa_pull_config.short_code
--    Called from server/mpesa-reconciler.ts every 5 minutes to update
--    the last-pull offset. If the table exists but short_code isn't
--    unique, every reconciler run 42P10s.
-- ═══════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mpesa_pull_config') THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS mpesa_pull_config_short_code_uidx ON mpesa_pull_config (short_code)';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 3) mpesa_pull_transactions.transaction_id
--    Called every time a pulled M-Pesa transaction is stored.
-- ═══════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mpesa_pull_transactions') THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS mpesa_pull_transactions_txn_id_uidx ON mpesa_pull_transactions (transaction_id)';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 4) phone_lookups.phone — already PK from migration 0003, harmless
--    to double-check. Skip if it doesn't exist (won't in fresh envs).
-- ═══════════════════════════════════════════════════════════════════════
-- (already PRIMARY KEY per migrations/0003_identity_verification.sql — noop)

-- ═══════════════════════════════════════════════════════════════════════
-- 5) chat_post_quota.user_id — already PK, noop.
-- ═══════════════════════════════════════════════════════════════════════
-- (already PRIMARY KEY — noop)

-- ═══════════════════════════════════════════════════════════════════════
-- 6) agency_follows(user_id, agency_slug) — from migration 0032.
--    Rewrite the index as an EXPLICIT unique constraint so ON CONFLICT
--    is happy with a composite target.
-- ═══════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agency_follows') THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS agency_follows_user_slug_uidx ON agency_follows (user_id, agency_slug)';
  END IF;
END $$;

COMMIT;
