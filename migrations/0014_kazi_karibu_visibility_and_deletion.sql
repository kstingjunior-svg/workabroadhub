-- ─── Migration 0014 — Kazi Karibu visibility toggle + contact-view log ─────
-- 2026-07-05
--
-- Adds two capabilities to the Kazi Karibu surface:
--
--   1. `poster_shows_phone` toggle on kazi_karibu_posts. When TRUE (the
--      default), signed-in browsers can see the poster's phone directly on
--      the post detail page — matches Jiji / OLX Kenya UX. When FALSE, phone
--      stays hidden and applicants use the express-interest flow instead.
--
--   2. `kazi_karibu_contact_views` — every phone-view is logged with
--      (post_id, viewer_user_id, viewed_at). Powers per-user rate limiting
--      (~20 views/hour) so scrapers can't harvest numbers, and gives
--      moderators fraud-investigation data.
--
-- Safe:
--   • poster_shows_phone defaults TRUE — matches the design choice that
--     phone visibility is the norm. Existing rows automatically inherit.
--   • Contact-view table is new; no data loss possible.
--
-- Rollback:
--   ALTER TABLE kazi_karibu_posts DROP COLUMN poster_shows_phone;
--   DROP TABLE kazi_karibu_contact_views;

BEGIN;

-- 1. Phone visibility toggle
ALTER TABLE kazi_karibu_posts
  ADD COLUMN IF NOT EXISTS poster_shows_phone BOOLEAN NOT NULL DEFAULT true;

-- 2. Contact-view log — one row per phone reveal
CREATE TABLE IF NOT EXISTS kazi_karibu_contact_views (
  id               BIGSERIAL PRIMARY KEY,
  post_id          UUID NOT NULL REFERENCES kazi_karibu_posts(id) ON DELETE CASCADE,
  viewer_user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rate-limiting index: fast "how many views in the last hour by this user"
CREATE INDEX IF NOT EXISTS kk_contact_views_recent_idx
  ON kazi_karibu_contact_views (viewer_user_id, viewed_at DESC);

-- Fraud-audit index: "which viewers hit this post"
CREATE INDEX IF NOT EXISTS kk_contact_views_post_idx
  ON kazi_karibu_contact_views (post_id, viewed_at DESC);

COMMENT ON COLUMN kazi_karibu_posts.poster_shows_phone IS
  'When TRUE, signed-in browsers can view poster phone directly on the post detail page. When FALSE, applicants must express interest and wait for the poster to release contact.';
COMMENT ON TABLE kazi_karibu_contact_views IS
  'Every phone-view is logged for rate limiting (20/hour/user) and fraud audit.';

COMMIT;
