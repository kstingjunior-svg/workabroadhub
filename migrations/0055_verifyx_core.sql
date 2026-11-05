-- 0055_verifyx_core.sql — VerifyX evidence store, source registry, review & audit.
-- Additive only. All tables RLS-enabled with no policies (server-only access via
-- the owner role, same as visa_checks / offer_letter_checks today).
-- Directive table names → VerifyX tables:
--   official_sources→verifyx_official_sources, source_sync_jobs/source_snapshots→verifyx_source_syncs,
--   immigration_rules→verifyx_rules, rule_change_events→verifyx_rule_change_events,
--   employer_registries→verifyx_employer_registry, verification_requests→verifyx_requests,
--   extracted_document_fields→verifyx_extracted_fields, verification_findings/evidence→verifyx_findings,
--   verification_reports→verifyx_reports, human_review_cases→verifyx_review_cases,
--   correction_requests→verifyx_corrections, security_audit_logs→verifyx_audit_log,
--   model_evaluations→verifyx_model_evaluations.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Public intelligence ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS verifyx_official_sources (
  id                text PRIMARY KEY,
  country           text NOT NULL,
  authority         text NOT NULL,
  title             text NOT NULL,
  url               text NOT NULL,
  capability        text NOT NULL,          -- synced_dataset | user_run | guidance_only | not_available
  max_age_hours     integer,
  connector_status  text NOT NULL DEFAULT 'not_built', -- operational | degraded | unavailable | awaiting_authorization | not_built
  last_attempt_at   timestamptz,
  last_success_at   timestamptz,
  last_error        text,
  content_url       text,
  content_hash      text,
  row_count         integer,
  last_reviewed     date,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS verifyx_source_syncs (
  id            bigserial PRIMARY KEY,
  source_id     text NOT NULL,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  status        text NOT NULL DEFAULT 'running',   -- running | success | unchanged | failed
  rows          integer,
  content_url   text,
  content_hash  text,
  error         text
);
CREATE INDEX IF NOT EXISTS idx_vx_source_syncs_src ON verifyx_source_syncs (source_id, started_at DESC);

CREATE TABLE IF NOT EXISTS verifyx_rules (
  rule_id           text NOT NULL,
  version           integer NOT NULL,
  country           text NOT NULL,
  document_type     text NOT NULL,
  source_id         text NOT NULL,
  rule_text         text NOT NULL,
  effective_from    date,
  effective_to      date,
  retrieved_at      date NOT NULL,
  last_verified_at  timestamptz,
  content_hash      text,
  review_status     text NOT NULL DEFAULT 'pending_review',  -- approved | pending_review | rejected
  reviewed_by       text,
  reviewed_at       timestamptz,
  PRIMARY KEY (rule_id, version)
);

CREATE TABLE IF NOT EXISTS verifyx_rule_change_events (
  id             bigserial PRIMARY KEY,
  source_id      text NOT NULL,
  detected_at    timestamptz NOT NULL DEFAULT now(),
  old_hash       text,
  new_hash       text,
  summary        text,
  review_status  text NOT NULL DEFAULT 'pending',   -- pending | accepted | dismissed
  reviewed_by    text,
  reviewed_at    timestamptz,
  notes          text
);

CREATE TABLE IF NOT EXISTS verifyx_employer_registry (
  id              bigserial PRIMARY KEY,
  registry_id     text NOT NULL,          -- e.g. uk_sponsor_register
  name            text NOT NULL,
  name_norm       text NOT NULL,
  town            text,
  county          text,
  type_rating     text,
  route           text,
  synced_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vx_emp_reg_norm ON verifyx_employer_registry (registry_id, name_norm);
CREATE INDEX IF NOT EXISTS idx_vx_emp_reg_trgm ON verifyx_employer_registry USING gin (name_norm gin_trgm_ops);

-- ── Customer verification data (sensitive; retention-managed) ──────────
CREATE TABLE IF NOT EXISTS verifyx_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_no          text UNIQUE NOT NULL,
  tool                  text NOT NULL,              -- visa_check | offer_check
  user_id               text,
  guest_key_hash        text,
  payment_id            text,
  job_id                text,
  file_sha256           text,
  mime                  text,
  file_kind             text,
  engine_version        text NOT NULL,
  status                text NOT NULL DEFAULT 'processing',  -- processing | done | error
  outcome               text,                        -- discrepancies_found | needs_attention | no_discrepancies_found | insufficient_information
  country_code          text,
  document_kind         text,
  latency_ms            integer,
  model                 text,
  model_input_tokens    integer,
  model_output_tokens   integer,
  model_cost_usd        numeric(10,5),
  error_message         text,
  consent_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  retention_expires_at  timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  purged_at             timestamptz
);
CREATE INDEX IF NOT EXISTS idx_vx_requests_created ON verifyx_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vx_requests_user ON verifyx_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_vx_requests_job ON verifyx_requests (job_id);
CREATE INDEX IF NOT EXISTS idx_vx_requests_retention ON verifyx_requests (retention_expires_at) WHERE purged_at IS NULL;

CREATE TABLE IF NOT EXISTS verifyx_extracted_fields (
  request_id      uuid NOT NULL REFERENCES verifyx_requests(id) ON DELETE CASCADE,
  field           text NOT NULL,
  value           text,
  confidence      integer,
  user_corrected  boolean NOT NULL DEFAULT false,
  corrected_at    timestamptz,
  PRIMARY KEY (request_id, field)
);

CREATE TABLE IF NOT EXISTS verifyx_findings (
  request_id       uuid NOT NULL REFERENCES verifyx_requests(id) ON DELETE CASCADE,
  finding_id       text NOT NULL,
  revision         integer NOT NULL DEFAULT 1,
  code             text NOT NULL,
  status           text NOT NULL,
  priority         text NOT NULL,
  method           text NOT NULL,
  rule_id          text,
  source_id        text,
  downgraded_from  text,
  payload          jsonb NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, revision, finding_id)
);
CREATE INDEX IF NOT EXISTS idx_vx_findings_code ON verifyx_findings (code, status);

CREATE TABLE IF NOT EXISTS verifyx_rejected_findings (
  id          bigserial PRIMARY KEY,
  request_id  uuid REFERENCES verifyx_requests(id) ON DELETE CASCADE,
  code        text NOT NULL,
  reason      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS verifyx_reports (
  request_id   uuid PRIMARY KEY REFERENCES verifyx_requests(id) ON DELETE CASCADE,
  revision     integer NOT NULL DEFAULT 1,
  report       jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS verifyx_corrections (
  id          bigserial PRIMARY KEY,
  request_id  uuid NOT NULL REFERENCES verifyx_requests(id) ON DELETE CASCADE,
  user_id     text,
  field       text NOT NULL,
  old_value   text,
  new_value   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS verifyx_review_cases (
  id               bigserial PRIMARY KEY,
  request_id       uuid NOT NULL REFERENCES verifyx_requests(id) ON DELETE CASCADE,
  opened_by        text,
  kind             text NOT NULL DEFAULT 'dispute',   -- dispute | manual_review | auto_flag
  user_message     text,
  status           text NOT NULL DEFAULT 'open',      -- open | in_review | resolved
  reviewer_id      text,
  decision         text,                              -- upheld | corrected | needs_government_confirmation
  decision_notes   text,
  false_positive   boolean,
  false_negative   boolean,
  created_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_vx_review_status ON verifyx_review_cases (status, created_at DESC);

CREATE TABLE IF NOT EXISTS verifyx_audit_log (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  actor_id    text,
  actor_kind  text NOT NULL DEFAULT 'system',   -- system | user | admin
  action      text NOT NULL,
  request_id  uuid,
  detail      jsonb
);
CREATE INDEX IF NOT EXISTS idx_vx_audit_at ON verifyx_audit_log (at DESC);

CREATE TABLE IF NOT EXISTS verifyx_model_evaluations (
  id              bigserial PRIMARY KEY,
  created_at      timestamptz NOT NULL DEFAULT now(),
  engine_version  text NOT NULL,
  dataset         text NOT NULL,
  metrics         jsonb NOT NULL,
  notes           text
);

-- ── Security hardening of existing tables ─────────────────────────────
ALTER TABLE tool_scan_jobs ADD COLUMN IF NOT EXISTS poll_key_hash text;
ALTER TABLE tool_scan_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_document_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE visa_checks ADD COLUMN IF NOT EXISTS anonymised_at timestamptz;
ALTER TABLE offer_letter_checks ADD COLUMN IF NOT EXISTS anonymised_at timestamptz;

ALTER TABLE verifyx_official_sources   ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifyx_source_syncs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifyx_rules              ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifyx_rule_change_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifyx_employer_registry  ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifyx_requests           ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifyx_extracted_fields   ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifyx_findings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifyx_rejected_findings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifyx_reports            ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifyx_corrections        ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifyx_review_cases       ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifyx_audit_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifyx_model_evaluations  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON verifyx_official_sources, verifyx_source_syncs, verifyx_rules, verifyx_rule_change_events,
  verifyx_employer_registry, verifyx_requests, verifyx_extracted_fields, verifyx_findings,
  verifyx_rejected_findings, verifyx_reports, verifyx_corrections, verifyx_review_cases,
  verifyx_audit_log, verifyx_model_evaluations FROM anon, authenticated;
