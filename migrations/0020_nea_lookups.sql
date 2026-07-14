-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0020 — NEA lookup daily counter
--
-- Enforces the free-tier promise ("3 NEAIMS agency lookups per day, self-service")
-- from client/src/lib/plan-features.ts. Before this migration, the endpoints
-- /api/agencies/bulk-verify and /api/nea-agencies/:id had NO server-side cap —
-- free users could hit them unlimited times, which contradicted the copy and
-- undermined the paid-plan value ("advisor-verified agency checks").
--
-- Design:
--   • One row per lookup (bulk-verify request OR agency detail view)
--   • Signed-in users tracked by user_id; anonymous browsers untracked
--     (they can't be tied to a plan tier anyway)
--   • Paid users skip the counter check entirely (unlimited)
--   • Free/no-plan users: 3 lookups per rolling 24 hours
--
-- Retention: rows older than 30 days are irrelevant to the 24h window; a
-- future cleanup job can prune them. Kept simple for now — table is tiny.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS nea_lookups (
  id           BIGSERIAL PRIMARY KEY,
  user_id      VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint     VARCHAR NOT NULL,        -- 'bulk-verify' | 'detail'
  looked_up_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS nea_lookups_user_time_idx
  ON nea_lookups (user_id, looked_up_at DESC);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback:
--   BEGIN;
--   DROP INDEX IF EXISTS nea_lookups_user_time_idx;
--   DROP TABLE IF EXISTS nea_lookups;
--   COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────
