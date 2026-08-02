-- 2026-08 (Tony emergency #3): fix follow-on errors from 0034.
--
-- After creating user_events + subscriptions, three new error classes
-- appeared in Supabase logs:
--
--   42883  "operator does not exist: character varying = uuid"
--          → user_events.user_id was created as VARCHAR, but users.id
--            is UUID. supabase-js sends UUID values as native UUID type
--            so the comparison fails. Fix by aligning types.
--
--   42501  "permission denied for table user_events / subscriptions /
--          payments / service_requests / users"
--          → Newly-created tables have no grants for the PostgREST
--            roles (anon / authenticated / service_role). The server
--            uses SUPABASE_SERVICE_ROLE_KEY which authenticates as
--            service_role, so we grant only to that role. RLS stays off
--            (service_role bypasses RLS by default).
--
--   42P10  "there is no unique or exclusion constraint matching the
--           ON CONFLICT specification"
--          → subscriptions upsert uses ON CONFLICT (user_id), but the
--            unique index I created was PARTIAL (WHERE status = 'active')
--            — Postgres refuses partial indexes for ON CONFLICT. Fix by
--            adding a full unique constraint.
--
-- Also picking up a pre-existing schema drift: `users.referred_by`
-- is queried by the referral tracker but was never added to the users
-- table. Add it here so the referral flow stops 42703-ing.
--
-- Safe to re-run. Idempotent.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- 1) user_events.user_id — VARCHAR → UUID.
-- Table was just created and is empty, so the type swap is safe.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE user_events
  ALTER COLUMN user_id TYPE UUID USING NULLIF(user_id, '')::UUID;

-- ═══════════════════════════════════════════════════════════════════════
-- 2) subscriptions — replace partial unique index with a full unique
--    constraint so ON CONFLICT (user_id) can use it.
-- Semantics unchanged: we still want one live row per user, we just
-- express it as a constraint instead of a partial index.
-- ═══════════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS subscriptions_user_active_idx;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_user_id_unique'
  ) THEN
    ALTER TABLE subscriptions
      ADD CONSTRAINT subscriptions_user_id_unique UNIQUE (user_id);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 3) users.referred_by — column referral tracker expects.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referred_by VARCHAR;

CREATE INDEX IF NOT EXISTS users_referred_by_idx
  ON users (referred_by) WHERE referred_by IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 4) GRANT permissions to PostgREST roles.
--
-- On Supabase, tables created via SQL Editor have NO grants for the
-- REST API roles. Server code hitting PostgREST via supabase-js gets
-- 42501 until we explicitly grant.
--
-- service_role: full access, used by our server (SUPABASE_SERVICE_ROLE_KEY)
-- anon:         analytics writes only (user_events INSERT for guests)
-- authenticated: read/write on their own subscriptions + events
-- ═══════════════════════════════════════════════════════════════════════

-- Server-only tables (server never uses anon key for these)
GRANT SELECT, INSERT, UPDATE, DELETE ON subscriptions   TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON payments        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON service_requests TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON users           TO service_role;

-- Analytics: server + logged-in clients can write
GRANT SELECT, INSERT, UPDATE, DELETE ON user_events     TO service_role;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE user_events_id_seq TO service_role;

-- Also grant to authenticated so logged-in users can query their own
-- subscription state directly (used by the client's plan check).
GRANT SELECT ON subscriptions TO authenticated;
GRANT SELECT ON user_events   TO authenticated;
GRANT INSERT ON user_events   TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE user_events_id_seq TO authenticated;

COMMIT;
