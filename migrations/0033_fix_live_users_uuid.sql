-- 2026-08 (Tony emergency): 22P02 error flood in Supabase logs.
--
-- Root cause: the `live_users` presence table was created (by an early
-- Drizzle auto-push, before we standardized on UUID user IDs) with
-- `user_id INTEGER`. Every 5-second heartbeat from every signed-in user
-- now fails at the DB with:
--
--   ERROR 22P02: invalid input syntax for type integer: "<uuid>"
--
-- 7 users online × 1 request every 5s = ~5,000 failed inserts per hour.
-- The client swallows the failure silently, so users never see it, but
-- Postgres logs are 98%+ error rate and the DB is doing pointless work.
--
-- Fix: drop and recreate with the correct schema. live_users is *transient*
-- presence data (5-minute TTL); dropping loses nothing — worst case the
-- "online now" widget briefly reads zero for a minute while heartbeats
-- refresh.
--
-- Safe to re-run. Idempotent.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- Recreate live_users with UUID-compatible types.
-- ═══════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS live_users;

CREATE TABLE live_users (
  user_id       VARCHAR PRIMARY KEY,           -- matches users.id (UUID string)
  current_page  VARCHAR,                        -- last page path they were on
  last_seen     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Presence query filter: "who's been seen in the last 5 minutes?" — needs
-- the last_seen index to stay fast even at thousands of concurrent users.
CREATE INDEX IF NOT EXISTS live_users_last_seen_idx
  ON live_users (last_seen DESC);

COMMIT;
