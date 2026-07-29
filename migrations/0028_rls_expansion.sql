-- 2026-07 Production audit CRIT-2 & CRIT-4:
--   Extend Row Level Security to the 12 highest-risk tables + add a UNIQUE
--   constraint on payments.checkout_request_id as belt-and-braces protection
--   against duplicate M-Pesa callbacks.
--
-- The server connects via the Postgres service role, which bypasses RLS by
-- default. So enabling RLS here does NOT break the server. But: if the
-- SUPABASE_ANON_KEY ever leaks or if you add client-side Supabase reads,
-- these policies stop unauthorized rows from being returned.
--
-- Rules (matching migration 0023's pattern):
--   • User can SEE their own rows only.
--   • User can INSERT rows only with their own user_id.
--   • User can UPDATE / DELETE only their own rows.
--   • Server bypasses RLS via service_role connection — server unaffected.
--
-- Every block is wrapped in DO ... EXCEPTION so a missing table doesn't
-- fail the whole migration. Safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════
-- USERS — own row only (id column, not user_id)
-- ═══════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE users ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS users_own_select ON users;
  DROP POLICY IF EXISTS users_own_update ON users;
  CREATE POLICY users_own_select ON users
    FOR SELECT USING (id = current_setting('request.jwt.claim.sub', true));
  CREATE POLICY users_own_update ON users
    FOR UPDATE USING      (id = current_setting('request.jwt.claim.sub', true))
               WITH CHECK (id = current_setting('request.jwt.claim.sub', true));
  -- No INSERT policy: only the auth flow creates users (service role).
  -- No DELETE policy: deletion is server-side only.
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'users table not present, skipping';
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- PAYMENTS — user_id column
-- ═══════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS payments_own_select ON payments;
  CREATE POLICY payments_own_select ON payments
    FOR SELECT USING (user_id = current_setting('request.jwt.claim.sub', true));
  -- Payments are only ever INSERTED/UPDATED by the server (service role).
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'payments table not present, skipping';
END $$;

-- Belt-and-braces UNIQUE constraint (audit CRIT-4). webhook_locks.lockKey
-- already prevents concurrent double-processing, but this stops duplicate
-- rows from ever landing at the DB level regardless of application code.
-- Partial index so NULL checkout_request_ids (PayPal, other providers) are
-- unaffected.
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS payments_checkout_request_id_unique_idx
    ON payments (checkout_request_id)
    WHERE checkout_request_id IS NOT NULL;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'payments table not present for UNIQUE index, skipping';
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- USER_SUBSCRIPTIONS — user_id column
-- ═══════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS user_subs_own_select ON user_subscriptions;
  CREATE POLICY user_subs_own_select ON user_subscriptions
    FOR SELECT USING (user_id = current_setting('request.jwt.claim.sub', true));
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'user_subscriptions table not present, skipping';
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- SERVICE_ORDERS — user_id column
-- ═══════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE service_orders ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS service_orders_own_select ON service_orders;
  DROP POLICY IF EXISTS service_orders_own_insert ON service_orders;
  DROP POLICY IF EXISTS service_orders_own_update ON service_orders;
  CREATE POLICY service_orders_own_select ON service_orders
    FOR SELECT USING (user_id = current_setting('request.jwt.claim.sub', true));
  CREATE POLICY service_orders_own_insert ON service_orders
    FOR INSERT WITH CHECK (user_id = current_setting('request.jwt.claim.sub', true));
  CREATE POLICY service_orders_own_update ON service_orders
    FOR UPDATE USING      (user_id = current_setting('request.jwt.claim.sub', true))
               WITH CHECK (user_id = current_setting('request.jwt.claim.sub', true));
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'service_orders table not present, skipping';
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- SERVICE_DELIVERABLES — no user_id; scoped via join to parent order
-- ═══════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE service_deliverables ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS deliverables_own_select ON service_deliverables;
  CREATE POLICY deliverables_own_select ON service_deliverables
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM service_orders so
        WHERE so.id = service_deliverables.order_id
          AND so.user_id = current_setting('request.jwt.claim.sub', true)
      )
    );
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'service_deliverables table not present, skipping';
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- USER_NOTIFICATIONS — user_id column
-- ═══════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS notifications_own_select ON user_notifications;
  DROP POLICY IF EXISTS notifications_own_update ON user_notifications;
  CREATE POLICY notifications_own_select ON user_notifications
    FOR SELECT USING (user_id = current_setting('request.jwt.claim.sub', true));
  CREATE POLICY notifications_own_update ON user_notifications
    FOR UPDATE USING      (user_id = current_setting('request.jwt.claim.sub', true))
               WITH CHECK (user_id = current_setting('request.jwt.claim.sub', true));
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'user_notifications table not present, skipping';
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- BOOKMARKS — user_id column
-- ═══════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS bookmarks_own_all ON bookmarks;
  CREATE POLICY bookmarks_own_all ON bookmarks
    FOR ALL USING      (user_id = current_setting('request.jwt.claim.sub', true))
            WITH CHECK (user_id = current_setting('request.jwt.claim.sub', true));
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'bookmarks table not present, skipping';
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- IDENTITY_VERIFICATION — user_id column
-- ═══════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE identity_verification ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS identity_own_select ON identity_verification;
  CREATE POLICY identity_own_select ON identity_verification
    FOR SELECT USING (user_id = current_setting('request.jwt.claim.sub', true));
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'identity_verification table not present, skipping';
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- PASSWORD_RESET_TOKENS — user_id column
-- ═══════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS pwreset_tokens_own_select ON password_reset_tokens;
  CREATE POLICY pwreset_tokens_own_select ON password_reset_tokens
    FOR SELECT USING (user_id = current_setting('request.jwt.claim.sub', true));
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'password_reset_tokens table not present, skipping';
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- IELTS_CHECKS — user_id (nullable — guests use guest_fingerprint)
-- ═══════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE ielts_checks ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS ielts_checks_own_select ON ielts_checks;
  -- Signed-in users see their own rows. Guest rows (user_id NULL) are
  -- server-only — never leaked to anon clients.
  CREATE POLICY ielts_checks_own_select ON ielts_checks
    FOR SELECT USING (
      user_id IS NOT NULL
      AND user_id = current_setting('request.jwt.claim.sub', true)
    );
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'ielts_checks table not present, skipping';
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- USER_CAREER_PROFILES — user_id column (unique)
-- ═══════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE user_career_profiles ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS career_profiles_own_all ON user_career_profiles;
  CREATE POLICY career_profiles_own_all ON user_career_profiles
    FOR ALL USING      (user_id = current_setting('request.jwt.claim.sub', true))
            WITH CHECK (user_id = current_setting('request.jwt.claim.sub', true));
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'user_career_profiles table not present, skipping';
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- APPLICATION_TRACKER — user_id column
-- ═══════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE application_tracker ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS app_tracker_own_all ON application_tracker;
  CREATE POLICY app_tracker_own_all ON application_tracker
    FOR ALL USING      (user_id = current_setting('request.jwt.claim.sub', true))
            WITH CHECK (user_id = current_setting('request.jwt.claim.sub', true));
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'application_tracker table not present, skipping';
END $$;

-- Done.
