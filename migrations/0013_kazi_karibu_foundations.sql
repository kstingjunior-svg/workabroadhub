-- ─── Migration 0013 — Kazi Karibu foundations ──────────────────────────────
-- 2026-07-03
--
-- Creates the storage layer for the Kazi Karibu individual-employer job-posting
-- surface. See docs/kazi-karibu/STRATEGY.md §16 for the design rationale.
--
-- SAFETY:
--   • Every table is new; no changes to existing tables.
--   • Every FK uses ON DELETE CASCADE so purging a user removes their trail.
--   • All indexes are plain (no partial-index-with-NOW footguns; the
--     `moderation_state = 'live'` filter is on a static value which IS
--     IMMUTABLE-safe for Postgres partial indexes).
--   • Adds three rows to `services` so posting payments flow through the
--     existing M-Pesa pipeline. All new services carry
--     `granting_subscription = false` to preserve the CV Fix Lite separation.
--
-- ROLLBACK: `DROP TABLE` on the five new tables (reverse dependency order)
--           and `DELETE FROM services WHERE category = 'kazi_karibu'`.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── kazi_karibu_posts ──────────────────────────────────────────────────────
-- Every individual-poster job post lives here through its whole lifecycle.
CREATE TABLE IF NOT EXISTS kazi_karibu_posts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poster_user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category            TEXT NOT NULL,
  county              TEXT NOT NULL,
  sub_county          TEXT,
  title               TEXT NOT NULL,
  description         TEXT NOT NULL,
  budget_min_kes      INT,
  budget_max_kes      INT,
  budget_period       TEXT,       -- 'hour' | 'day' | 'month' | 'project'
  duration            TEXT,       -- 'one_off' | 'recurring_weekly' | 'permanent'
  poster_display_name TEXT,
  poster_shows_name   BOOLEAN NOT NULL DEFAULT false,
  -- payments.id is VARCHAR (see shared/schema.ts §payments), not UUID.
  -- Matching type is required for the FK to be creatable.
  payment_id          VARCHAR REFERENCES payments(id),
  is_first_post_free  BOOLEAN NOT NULL DEFAULT false,
  moderation_state    TEXT NOT NULL DEFAULT 'draft',
  -- Allowed states: 'draft' | 'awaiting_payment' | 'pending_moderation'
  --                 | 'live' | 'held' | 'rejected' | 'expired' | 'removed'
  published_at        TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ,
  removed_reason      TEXT,
  is_boosted          BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT kk_posts_state_ck CHECK (moderation_state IN (
    'draft','awaiting_payment','pending_moderation',
    'live','held','rejected','expired','removed'
  )),
  CONSTRAINT kk_posts_budget_ck CHECK (
    budget_min_kes IS NULL OR budget_max_kes IS NULL OR budget_min_kes <= budget_max_kes
  )
);

-- Browse index: (category, county) filtered to live rows only.
CREATE INDEX IF NOT EXISTS kk_posts_live_idx
  ON kazi_karibu_posts (category, county, published_at DESC)
  WHERE moderation_state = 'live';

-- Poster's own posts view.
CREATE INDEX IF NOT EXISTS kk_posts_poster_idx
  ON kazi_karibu_posts (poster_user_id, created_at DESC);

-- Expiry sweep support.
CREATE INDEX IF NOT EXISTS kk_posts_expires_idx
  ON kazi_karibu_posts (expires_at)
  WHERE moderation_state = 'live';

-- ── kazi_karibu_moderation ─────────────────────────────────────────────────
-- Audit trail of every layer's decision on every post. One row per decision
-- (a post that goes through rules → nanjila → human review produces 3 rows).
CREATE TABLE IF NOT EXISTS kazi_karibu_moderation (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       UUID NOT NULL REFERENCES kazi_karibu_posts(id) ON DELETE CASCADE,
  layer         TEXT NOT NULL,   -- 'rules' | 'nanjila' | 'human'
  decision      TEXT NOT NULL,   -- 'approve' | 'clarify' | 'hold' | 'reject'
  reason_codes  TEXT[],
  narrative     TEXT,
  actor         TEXT,            -- 'system' | 'nanjila' | admin user id
  confidence    NUMERIC(3,2),    -- Nanjila's self-reported 0.00..1.00
  decided_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT kk_mod_layer_ck    CHECK (layer    IN ('rules','nanjila','human')),
  CONSTRAINT kk_mod_decision_ck CHECK (decision IN ('approve','clarify','hold','reject'))
);
CREATE INDEX IF NOT EXISTS kk_mod_post_idx ON kazi_karibu_moderation (post_id, decided_at);

-- ── kazi_karibu_interest ───────────────────────────────────────────────────
-- Each "Show interest" click. Unique per (post, applicant) so re-clicks
-- don't create duplicates. Contact-reveal is tracked here per interest.
CREATE TABLE IF NOT EXISTS kazi_karibu_interest (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id                  UUID NOT NULL REFERENCES kazi_karibu_posts(id) ON DELETE CASCADE,
  applicant_user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message                  TEXT,
  shared_profile_snapshot  JSONB NOT NULL,
  contact_revealed_at      TIMESTAMPTZ,
  reported                 BOOLEAN NOT NULL DEFAULT false,
  report_reason            TEXT,
  reported_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, applicant_user_id)
);
CREATE INDEX IF NOT EXISTS kk_interest_applicant_idx
  ON kazi_karibu_interest (applicant_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS kk_interest_post_idx
  ON kazi_karibu_interest (post_id, created_at DESC);

-- ── kazi_karibu_feedback ───────────────────────────────────────────────────
-- Post-hire feedback captured from both sides. Fuels reputation.
CREATE TABLE IF NOT EXISTS kazi_karibu_feedback (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id                 UUID NOT NULL REFERENCES kazi_karibu_posts(id) ON DELETE CASCADE,
  submitted_by            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role                    TEXT NOT NULL,   -- 'applicant' | 'poster'
  hire_happened           BOOLEAN,
  agreed_pay_delivered    BOOLEAN,
  overall_rating          INT,
  free_text               TEXT,
  submitted_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT kk_feedback_role_ck   CHECK (role IN ('applicant','poster')),
  CONSTRAINT kk_feedback_rating_ck CHECK (overall_rating IS NULL OR (overall_rating BETWEEN 1 AND 5))
);
CREATE INDEX IF NOT EXISTS kk_feedback_post_idx ON kazi_karibu_feedback (post_id);
CREATE INDEX IF NOT EXISTS kk_feedback_user_idx ON kazi_karibu_feedback (submitted_by);

-- ── kazi_karibu_poster_reputation ──────────────────────────────────────────
-- Denormalised reputation snapshot per poster. Refreshed by a nightly job
-- (Phase 2). Phase 1 just inserts stub rows so the schema is there.
CREATE TABLE IF NOT EXISTS kazi_karibu_poster_reputation (
  user_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  posts_published    INT NOT NULL DEFAULT 0,
  posts_removed      INT NOT NULL DEFAULT 0,
  confirmed_hires    INT NOT NULL DEFAULT 0,
  negative_reports   INT NOT NULL DEFAULT 0,
  verified_badge     BOOLEAN NOT NULL DEFAULT false,
  verified_badge_at  TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── services rows for the payment pipeline ─────────────────────────────────
-- Reuses the existing service_orders / payments infrastructure. All new
-- rows carry is_subscription = false so buying a post NEVER grants
-- Kenya Careers or Overseas Pro access. This preserves the CV Fix Lite
-- separation invariant enforced across the codebase (see server/routes.ts
-- CANONICAL_TIERS handling).
--
-- Prices are the Phase 1 values from docs/kazi-karibu/STRATEGY.md §13.
-- Only "standard" is active in Phase 1 (is_active = true); boost and
-- verified-badge are registered as inactive so Phase 2 flips a flag rather
-- than shipping a follow-up migration.
--
-- The 'services' schema columns are defined in shared/schema.ts §services.
-- Slug matches code so downstream code that looks up either finds it.
INSERT INTO services (slug, code, name, description, price, currency, category, is_subscription, is_active, "order")
VALUES
  ('kazi_karibu_post_standard',
   'kazi_karibu_post_standard',
   'Kazi Karibu — Standard post',
   'One 7-day job posting on Kazi Karibu. Passes phone verification, automated content review, and Nanjila pre-publish review before going live.',
   100, 'KES', 'kazi_karibu', false, true, 0),
  ('kazi_karibu_boost',
   'kazi_karibu_boost',
   'Kazi Karibu — Boost / featured',
   '7 days pinned to the top of the post''s category. Phase 2.',
   500, 'KES', 'kazi_karibu', false, false, 0),
  ('kazi_karibu_verified_badge',
   'kazi_karibu_verified_badge',
   'Kazi Karibu — Verified poster badge (one-time)',
   'One-time KYC verification (ID + selfie). Badge sticks to the account permanently. Phase 2.',
   1000, 'KES', 'kazi_karibu', false, false, 0)
ON CONFLICT (code) DO NOTHING;

-- ── Register the Nanjila Layer-4 capability ────────────────────────────────
-- The runtime handler is server/nanjila/capabilities/kaziKaribuReview.ts.
-- The manifest cache picks up this row within 60 seconds of insert (see
-- server/nanjila/capabilities/index.ts MANIFEST_CACHE_TTL_MS).
INSERT INTO nanjila_capabilities (
  slug, label, description,
  input_schema, output_schema, handler_module,
  requires_auth, requires_paid, requires_admin, enabled
)
VALUES (
  'kazi_karibu_review',
  'Kazi Karibu — pre-publish moderation',
  'Reviews a submitted Kazi Karibu post for coherence, red flags, and applicant safety before publication. Returns APPROVE, CLARIFY, or HOLD.',
  '{"type":"object","properties":{"postId":{"type":"string","format":"uuid"},"layer3FlagCodes":{"type":"array","items":{"type":"string"}}},"required":["postId"]}'::jsonb,
  '{"type":"object","properties":{"ok":{"type":"boolean"},"decision":{"type":"string","enum":["approve","clarify","hold"]},"confidence":{"type":"number"},"rationale":{"type":"string"},"clarify_question":{"type":"string"},"hold_reason_code":{"type":"string"},"moderationRecordId":{"type":"string"},"promptVersion":{"type":"string"},"error":{"type":"string"}}}'::jsonb,
  'capabilities/kaziKaribuReview',
  false, false, false,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  label       = EXCLUDED.label,
  description = EXCLUDED.description,
  updated_at  = NOW();

-- ── comment for the DBA reading this later ─────────────────────────────────
COMMENT ON TABLE kazi_karibu_posts IS
  'Individual-employer job postings. See docs/kazi-karibu/STRATEGY.md.';
COMMENT ON TABLE kazi_karibu_moderation IS
  'One row per moderation-layer decision. Six trust layers documented in strategy doc.';
COMMENT ON TABLE kazi_karibu_interest IS
  'Applicant expressions of interest. Contact-reveal tracked here per (post,applicant).';
COMMENT ON TABLE kazi_karibu_feedback IS
  'Post-hire feedback from both sides. Fuels the reputation flywheel (Layer 6).';
COMMENT ON TABLE kazi_karibu_poster_reputation IS
  'Denormalised reputation per poster. Refreshed by nightly job (Phase 2).';

COMMIT;
