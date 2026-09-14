-- 0047_direct_hire_marketplace.sql
-- Direct Hire Exchange — Phase 3: Success-Fee Marketplace (minus fee
-- collection). Verified overseas employers list real jobs for free;
-- workers apply and both sides confirm a placement start. The actual
-- placement fee is NOT collected anywhere in this migration or the code
-- built on it — that's gated on a Kenyan labour-migration lawyer's written
-- opinion on NEA Act / Labour Migration Management Bill exposure (see the
-- MVP roadmap, Phase 0). `placement_confirmations.fee_status` exists only
-- to keep that pending state visible to admins.
--
-- Deliberately a separate table set from Kenya Careers' companies/
-- local_jobs (server/lib/local-jobs-bootstrap.ts): that system is domestic
-- Kenyan retail/service hiring with its own seeded-demo-data legal
-- posture; this is real overseas placement, a different risk profile.

CREATE TABLE IF NOT EXISTS overseas_employers (
  id                        VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id             VARCHAR NOT NULL,
  company_name              VARCHAR NOT NULL,
  country                   VARCHAR NOT NULL,
  sector                    VARCHAR,
  website                   VARCHAR,
  contact_email             VARCHAR NOT NULL,
  contact_phone             VARCHAR,
  description               TEXT,
  rating_slug               VARCHAR,
  verification_status       VARCHAR NOT NULL DEFAULT 'pending',
  verification_evidence_url VARCHAR,
  verification_note         TEXT,
  verified_at               TIMESTAMP,
  verified_by               VARCHAR,
  created_at                TIMESTAMP DEFAULT now(),
  updated_at                TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS overseas_employers_owner_idx ON overseas_employers (owner_user_id);
CREATE INDEX IF NOT EXISTS overseas_employers_status_idx ON overseas_employers (verification_status);

CREATE TABLE IF NOT EXISTS overseas_job_listings (
  id                VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id       VARCHAR NOT NULL REFERENCES overseas_employers(id),
  title             VARCHAR NOT NULL,
  country           VARCHAR NOT NULL,
  city              VARCHAR,
  category          VARCHAR,
  employment_type   VARCHAR,
  salary_min        INTEGER,
  salary_max        INTEGER,
  salary_currency   VARCHAR DEFAULT 'USD',
  vacancies         INTEGER DEFAULT 1,
  requirements      TEXT,
  responsibilities  TEXT,
  status            VARCHAR NOT NULL DEFAULT 'pending_review',
  created_at        TIMESTAMP DEFAULT now(),
  updated_at        TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS overseas_job_listings_employer_idx ON overseas_job_listings (employer_id);
CREATE INDEX IF NOT EXISTS overseas_job_listings_status_idx ON overseas_job_listings (status);

CREATE TABLE IF NOT EXISTS overseas_job_applications (
  id                VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id        VARCHAR NOT NULL REFERENCES overseas_job_listings(id),
  applicant_user_id VARCHAR NOT NULL,
  cover_note        TEXT,
  status            VARCHAR NOT NULL DEFAULT 'applied',
  applied_at        TIMESTAMP DEFAULT now(),
  updated_at        TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS overseas_job_applications_listing_idx ON overseas_job_applications (listing_id);
CREATE INDEX IF NOT EXISTS overseas_job_applications_applicant_idx ON overseas_job_applications (applicant_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS overseas_job_applications_unique_idx ON overseas_job_applications (listing_id, applicant_user_id);

CREATE TABLE IF NOT EXISTS placement_confirmations (
  id                     VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id         VARCHAR NOT NULL UNIQUE REFERENCES overseas_job_applications(id),
  employer_confirmed_at  TIMESTAMP,
  employer_confirmed_by  VARCHAR,
  worker_confirmed_at    TIMESTAMP,
  start_date             VARCHAR,
  work_location          VARCHAR,
  status                 VARCHAR NOT NULL DEFAULT 'awaiting_confirmation',
  -- Intentionally inert. See the header comment — do not wire real
  -- charging to this column without Phase 0's legal sign-off.
  fee_status             VARCHAR NOT NULL DEFAULT 'pending_legal_review',
  created_at             TIMESTAMP DEFAULT now(),
  updated_at             TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS placement_disputes (
  id               VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id   VARCHAR NOT NULL REFERENCES overseas_job_applications(id),
  raised_by_user_id VARCHAR NOT NULL,
  raised_by_role   VARCHAR NOT NULL,
  category         VARCHAR NOT NULL,
  description      TEXT NOT NULL,
  evidence_url     VARCHAR,
  status           VARCHAR NOT NULL DEFAULT 'open',
  resolution_note  TEXT,
  resolved_by      VARCHAR,
  resolved_at      TIMESTAMP,
  created_at       TIMESTAMP DEFAULT now(),
  updated_at       TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS placement_disputes_application_idx ON placement_disputes (application_id);
CREATE INDEX IF NOT EXISTS placement_disputes_status_idx ON placement_disputes (status);
