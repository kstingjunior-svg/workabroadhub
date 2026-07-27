-- 2026-07 (Tony's request): dedupe existing user_subscriptions.
--
-- History has produced rows where a single user has MULTIPLE status='active'
-- rows due to (a) race conditions in early callbacks, (b) manual admin grants
-- that predate the idempotent guard, (c) legacy code paths that inserted
-- without first expiring prior rows.
--
-- Policy: KEEP the row with the LATEST end_date per user. Expire the rest.
-- This preserves the user's longest-paid period + collapses the noise.
--
-- 2026-07 FIX (Tony's Supabase run): the actual user_subscriptions table
-- uses column `plan` (not `plan_id`) and does NOT have a `metadata` jsonb
-- column. Reworked to match the real schema in shared/schema.ts.
--
-- Safe to re-run. Idempotent.

BEGIN;

-- 1. Snapshot the winners: for every user with more than one active row,
--    the one with the greatest end_date (NULL end_date treated as smaller).
WITH ranked AS (
  SELECT
    id,
    user_id,
    plan,
    end_date,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY end_date DESC NULLS LAST, created_at DESC
    ) AS rn
  FROM user_subscriptions
  WHERE status = 'active'
)
-- 2. Expire every non-winner (rn > 1).
UPDATE user_subscriptions us
SET
  status     = 'expired',
  updated_at = NOW()
FROM ranked r
WHERE us.id = r.id
  AND r.rn > 1;

-- 3. Log the outcome — how many duplicates were expired in the last minute.
DO $$
DECLARE
  affected int;
BEGIN
  SELECT COUNT(*) INTO affected
    FROM user_subscriptions
   WHERE status = 'expired'
     AND updated_at > NOW() - INTERVAL '1 minute';
  RAISE NOTICE 'Dedupe complete: expired % duplicate active rows', affected;
END $$;

-- 4. PREVENTION: partial unique index so a user can NEVER again have more
--    than one active subscription. Enforced at the DB level — the app can
--    forget to guard and this still holds.
--
--    Uses status='active' predicate so historical expired/cancelled rows
--    don't count. Safe with the app's expire-then-insert pattern in
--    activateUserPlan (it expires FIRST, then inserts, so no race).
CREATE UNIQUE INDEX IF NOT EXISTS user_subscriptions_one_active_per_user_idx
  ON user_subscriptions (user_id)
  WHERE status = 'active';

COMMIT;
