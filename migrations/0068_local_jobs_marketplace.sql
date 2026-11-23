-- 0068 (2026-11-23) — Kenyan local jobs marketplace. Applied to production 23 Nov.
-- See server/local-jobs-marketplace.ts. Adds super-admin publishing fields,
-- direct-contact fields, verification, coordinates, scam flags; categories,
-- contact-click events and a publication audit trail.
ALTER TABLE local_jobs
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'employer',
  ADD COLUMN IF NOT EXISTS posted_by_user_id varchar,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS estate varchar(120),
  ADD COLUMN IF NOT EXISTS workplace_location varchar(240),
  ADD COLUMN IF NOT EXISTS min_qualification varchar(160),
  ADD COLUMN IF NOT EXISTS experience_text varchar(160),
  ADD COLUMN IF NOT EXISTS gender_requirement varchar(80),
  ADD COLUMN IF NOT EXISTS working_hours varchar(160),
  ADD COLUMN IF NOT EXISTS salary_period varchar(20),
  ADD COLUMN IF NOT EXISTS contact_person varchar(120),
  ADD COLUMN IF NOT EXISTS contact_phone varchar(20),
  ADD COLUMN IF NOT EXISTS whatsapp_phone varchar(20),
  ADD COLUMN IF NOT EXISTS alt_contact varchar(240),
  ADD COLUMN IF NOT EXISTS instructions text,
  ADD COLUMN IF NOT EXISTS contact_authorized boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_status varchar(30) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS verification_note text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS risk_flags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE local_jobs DROP CONSTRAINT IF EXISTS local_jobs_status_chk;
ALTER TABLE local_jobs ADD CONSTRAINT local_jobs_status_chk CHECK (status IN ('open','draft','paused','closed','archived'));
ALTER TABLE local_jobs DROP CONSTRAINT IF EXISTS local_jobs_source_chk;
ALTER TABLE local_jobs ADD CONSTRAINT local_jobs_source_chk CHECK (source IN ('employer','admin','admin_on_behalf'));
ALTER TABLE local_jobs DROP CONSTRAINT IF EXISTS local_jobs_verification_chk;
ALTER TABLE local_jobs ADD CONSTRAINT local_jobs_verification_chk CHECK (verification_status IN ('verified','contact_confirmed','admin_posted','pending'));
DROP INDEX IF EXISTS uq_local_jobs_seed_dedup;
CREATE UNIQUE INDEX IF NOT EXISTS uq_local_jobs_seed_dedup ON local_jobs (company_id, title, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE is_seed = true;
CREATE INDEX IF NOT EXISTS idx_local_jobs_live ON local_jobs (status, published_at DESC) WHERE COALESCE(is_seed,false) = false;
CREATE INDEX IF NOT EXISTS idx_local_jobs_town ON local_jobs (lower(town));
CREATE INDEX IF NOT EXISTS idx_local_jobs_estate ON local_jobs (lower(estate));
CREATE INDEX IF NOT EXISTS idx_local_jobs_contact_phone ON local_jobs (contact_phone);
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS created_by_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_phone varchar(20),
  ADD COLUMN IF NOT EXISTS verification_note text;
CREATE TABLE IF NOT EXISTS local_job_categories (slug varchar(40) PRIMARY KEY, label varchar(80) NOT NULL, icon varchar(8), sort int NOT NULL DEFAULT 100, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
-- (category seed rows: see production; 27 categories incl. Shop Attendants … General Labour)
CREATE TABLE IF NOT EXISTS local_job_contact_events (id bigserial PRIMARY KEY, job_id uuid NOT NULL REFERENCES local_jobs(id) ON DELETE CASCADE, kind varchar(20) NOT NULL CHECK (kind IN ('reveal','call','whatsapp','view')), viewer_hash varchar(40), created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_lj_contact_events_job ON local_job_contact_events (job_id, kind);
CREATE INDEX IF NOT EXISTS idx_lj_contact_events_time ON local_job_contact_events (created_at DESC);
CREATE TABLE IF NOT EXISTS job_publication_audit (id bigserial PRIMARY KEY, job_id uuid, company_id uuid, actor_id varchar, actor_role varchar(30), action varchar(40) NOT NULL, detail jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_job_pub_audit_job ON job_publication_audit (job_id, created_at DESC);
ALTER TABLE local_job_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_job_contact_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_publication_audit ENABLE ROW LEVEL SECURITY;
