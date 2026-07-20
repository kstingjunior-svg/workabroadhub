-- 2026-07: Job Scout feature (Tony's sketch).
-- Individuals already living in destination countries pay KES 200 to list
-- direct job leads. Not registered agents — "scout" is the deliberate
-- product distinction. Seekers browse + contact via WhatsApp / email.

CREATE TABLE IF NOT EXISTS scout_jobs (
  id                  varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  posted_by_user_id   varchar NOT NULL,
  scout_name          varchar(150) NOT NULL,
  scout_country       varchar(100) NOT NULL,
  scout_whatsapp      varchar(30)  NOT NULL,
  scout_email         varchar(200),

  job_title           varchar(200) NOT NULL,
  job_country         varchar(100) NOT NULL,
  job_city            varchar(100),
  job_industry        varchar(100) NOT NULL,
  job_description     text NOT NULL,
  salary_text         varchar(120),
  how_to_apply        text,

  payment_id          varchar,
  amount_paid         integer NOT NULL DEFAULT 200,
  currency            varchar(8) NOT NULL DEFAULT 'KES',

  -- pending_payment → pending_review → active → (flagged | expired | closed)
  status              varchar(30) NOT NULL DEFAULT 'pending_payment',
  moderation_notes    text,

  view_count          integer NOT NULL DEFAULT 0,
  contact_count       integer NOT NULL DEFAULT 0,

  expires_at          timestamp,
  approved_at         timestamp,
  created_at          timestamp DEFAULT NOW(),
  updated_at          timestamp DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scout_jobs_status_idx   ON scout_jobs(status);
CREATE INDEX IF NOT EXISTS scout_jobs_country_idx  ON scout_jobs(job_country);
CREATE INDEX IF NOT EXISTS scout_jobs_industry_idx ON scout_jobs(job_industry);
CREATE INDEX IF NOT EXISTS scout_jobs_poster_idx   ON scout_jobs(posted_by_user_id);
