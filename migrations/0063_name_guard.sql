-- 2026-11: Name Guard (registration name screening) + separate identity-verification status.
-- Additive only: new tables + new nullable/defaulted user columns. No existing data changed.
CREATE TABLE IF NOT EXISTS name_guard_terms (
  id bigserial PRIMARY KEY, term text NOT NULL, norm text NOT NULL, language text NOT NULL DEFAULT 'en',
  category text NOT NULL, severity text NOT NULL CHECK (severity IN ('block','review')),
  mode text NOT NULL CHECK (mode IN ('word','contains','phrase')), active boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'seed', created_by text, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (norm, mode)
);
CREATE TABLE IF NOT EXISTS name_guard_allow (
  id bigserial PRIMARY KEY, norm text NOT NULL UNIQUE, display text, note text, created_by text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS name_guard_events (
  id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), client_hash text, context text NOT NULL,
  decision text NOT NULL, category text, reason_codes jsonb, ai jsonb, ai_error boolean NOT NULL DEFAULT false,
  name_text text, name_norm text, user_id text, review_status text, reviewed_by text, reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_ng_events_at ON name_guard_events (at DESC);
CREATE INDEX IF NOT EXISTS idx_ng_events_client ON name_guard_events (client_hash, at DESC);
CREATE INDEX IF NOT EXISTS idx_ng_events_review ON name_guard_events (review_status) WHERE review_status = 'open';
CREATE TABLE IF NOT EXISTS name_guard_blocks (
  client_hash text PRIMARY KEY, until timestamptz NOT NULL, reason text, created_by text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS name_guard_admin_log (id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), actor_id text, action text NOT NULL, detail jsonb);
ALTER TABLE users ADD COLUMN IF NOT EXISTS name_screen_status varchar(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS name_screened_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_verified boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_verified_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_verified_by text;
ALTER TABLE name_guard_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE name_guard_allow ENABLE ROW LEVEL SECURITY;
ALTER TABLE name_guard_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE name_guard_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE name_guard_admin_log ENABLE ROW LEVEL SECURITY;
