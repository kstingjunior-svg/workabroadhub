-- Scam Intelligence Network (2026-11). PRIVATE: server-only tables, RLS on, no policies.
CREATE TABLE IF NOT EXISTS intel_indicators (
  id           bigserial PRIMARY KEY,
  kind         text NOT NULL CHECK (kind IN ('phone','email','domain','payment_account','name','template')),
  value        text NOT NULL,
  display      text,
  source_type  text NOT NULL,
  source_id    text NOT NULL,
  owner        text NOT NULL,
  file_sha256  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, value, source_type, source_id)
);
CREATE INDEX IF NOT EXISTS idx_intel_ind_kv ON intel_indicators (kind, value);

CREATE TABLE IF NOT EXISTS intel_indicator_reviews (
  kind         text NOT NULL,
  value        text NOT NULL,
  status       text NOT NULL DEFAULT 'unreviewed' CHECK (status IN ('unreviewed','watch','confirmed','false_positive')),
  notes        text,
  reviewed_by  text,
  reviewed_at  timestamptz,
  PRIMARY KEY (kind, value)
);

CREATE TABLE IF NOT EXISTS intel_review_log (
  id           bigserial PRIMARY KEY,
  kind         text NOT NULL,
  value        text NOT NULL,
  before       jsonb,
  after        jsonb,
  actor_id     text,
  at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS intel_alerts (
  id              bigserial PRIMARY KEY,
  kind            text NOT NULL,
  value           text NOT NULL,
  display         text,
  source_type     text NOT NULL,
  source_id       text NOT NULL,
  matched_reports int NOT NULL DEFAULT 0,
  matched_checks  int NOT NULL DEFAULT 0,
  matches         jsonb,
  risk_level      text,
  status          text NOT NULL DEFAULT 'new' CHECK (status IN ('new','seen','dismissed')),
  seen_by         text,
  seen_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_intel_alerts_status ON intel_alerts (status, created_at DESC);

ALTER TABLE intel_indicators        ENABLE ROW LEVEL SECURITY;
ALTER TABLE intel_indicator_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE intel_review_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE intel_alerts            ENABLE ROW LEVEL SECURITY;
