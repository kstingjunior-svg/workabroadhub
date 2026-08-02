-- 2026-08 (Tony emergency #4): the last 400s in the payments PATCH log.
--
-- After 0034 + 0035, everything else went green — but every PATCH on
-- /rest/v1/payments still logs a 400 immediately before a 204. That's
-- the smart-match engine writing three columns that don't exist yet:
--   matched_user_id  (server/routes.ts:511)
--   match_score      (server/routes.ts:512)
--   needs_review     (server/routes.ts:513)
--
-- The follow-up 204 UPDATE only touches columns that exist (matched,
-- user_id, auto_upgraded — all added or already present), so it
-- succeeds. Fix by adding the three smart-match columns.
--
-- Safe to re-run. Idempotent.

BEGIN;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS matched_user_id  VARCHAR;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS match_score      INTEGER;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS needs_review     BOOLEAN NOT NULL DEFAULT FALSE;

-- Support the retry engine's "who needs manual review?" query fast.
CREATE INDEX IF NOT EXISTS payments_needs_review_idx
  ON payments (created_at DESC)
  WHERE needs_review = TRUE;

COMMIT;
