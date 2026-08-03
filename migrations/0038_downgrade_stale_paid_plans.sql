-- 2026-08 (Tony's leak report):
--
-- Free users were getting past the paywall on Canada Express Entry and
-- CV Match Apply Now. Root cause: users.plan column was set to a paid
-- tier for accounts whose subscription had EXPIRED without a clean
-- downgrade — or was set by an admin promo that never created a
-- subscription row.
--
-- getUserPlan() has been fixed to auto-downgrade going forward, but we
-- also need a one-time cleanup of the historical mess. This migration:
--
--   1. Finds every user whose users.plan says paid but who has NO
--      currently-active + non-expired subscription row.
--   2. Excludes admins (isAdmin=true OR role IN ADMIN/SUPER_ADMIN) —
--      admins keep pro access by design.
--   3. Resets users.plan to 'free' and users.subscription_status to
--      'expired' for those rows.
--   4. Logs how many users were downgraded.
--
-- Safe to re-run. Only touches rows that are actually stale.

BEGIN;

WITH stale_paid AS (
  SELECT u.id
  FROM users u
  WHERE COALESCE(LOWER(u.plan), 'free') IN ('trial', 'basic', 'monthly', 'yearly', 'pro', 'pro_referral')
    -- Not an admin
    AND COALESCE(u.is_admin, FALSE) = FALSE
    AND COALESCE(u.role, '') NOT IN ('ADMIN', 'SUPER_ADMIN')
    -- No active, non-expired subscription
    AND NOT EXISTS (
      SELECT 1 FROM user_subscriptions s
      WHERE s.user_id = u.id
        AND s.status = 'active'
        AND (s.end_date IS NULL OR s.end_date >= NOW())
    )
),
updated AS (
  UPDATE users
     SET plan = 'free',
         subscription_status = 'expired',
         updated_at = NOW()
   WHERE id IN (SELECT id FROM stale_paid)
  RETURNING id
)
SELECT COUNT(*) AS users_downgraded FROM updated;

COMMIT;
