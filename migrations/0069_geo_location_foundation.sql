-- 0069 (2026-11-23) — location foundation. Applied to production 23 Nov.
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
ALTER TABLE local_jobs
  ADD COLUMN IF NOT EXISTS place_id varchar(300), ADD COLUMN IF NOT EXISTS formatted_address varchar(400),
  ADD COLUMN IF NOT EXISTS street varchar(200), ADD COLUMN IF NOT EXISTS location_mode varchar(20) NOT NULL DEFAULT 'workplace',
  ADD COLUMN IF NOT EXISTS service_radius_km numeric(6,1), ADD COLUMN IF NOT EXISTS location_precision varchar(20);
ALTER TABLE local_jobs DROP CONSTRAINT IF EXISTS local_jobs_location_mode_chk;
ALTER TABLE local_jobs ADD CONSTRAINT local_jobs_location_mode_chk CHECK (location_mode IN ('workplace','service_area'));
ALTER TABLE local_jobs DROP CONSTRAINT IF EXISTS local_jobs_coords_chk;
ALTER TABLE local_jobs ADD CONSTRAINT local_jobs_coords_chk CHECK ((lat IS NULL AND lng IS NULL) OR (lat BETWEEN -5.2 AND 5.5 AND lng BETWEEN 33.5 AND 42.2));
ALTER TABLE local_jobs ADD COLUMN IF NOT EXISTS geo extensions.geography(Point, 4326)
  GENERATED ALWAYS AS (CASE WHEN lat IS NOT NULL AND lng IS NOT NULL THEN extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography END) STORED;
CREATE INDEX IF NOT EXISTS idx_local_jobs_geo ON local_jobs USING gist (geo);
ALTER TABLE kazi_karibu_posts
  ADD COLUMN IF NOT EXISTS lat double precision, ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS place_id varchar(300), ADD COLUMN IF NOT EXISTS formatted_address varchar(400),
  ADD COLUMN IF NOT EXISTS estate varchar(120), ADD COLUMN IF NOT EXISTS town varchar(120), ADD COLUMN IF NOT EXISTS street varchar(200),
  ADD COLUMN IF NOT EXISTS location_mode varchar(20) NOT NULL DEFAULT 'workplace', ADD COLUMN IF NOT EXISTS service_radius_km numeric(6,1),
  ADD COLUMN IF NOT EXISTS vacancies int NOT NULL DEFAULT 1;
ALTER TABLE kazi_karibu_posts DROP CONSTRAINT IF EXISTS kk_posts_location_mode_chk;
ALTER TABLE kazi_karibu_posts ADD CONSTRAINT kk_posts_location_mode_chk CHECK (location_mode IN ('workplace','service_area'));
ALTER TABLE kazi_karibu_posts DROP CONSTRAINT IF EXISTS kk_posts_coords_chk;
ALTER TABLE kazi_karibu_posts ADD CONSTRAINT kk_posts_coords_chk CHECK ((lat IS NULL AND lng IS NULL) OR (lat BETWEEN -5.2 AND 5.5 AND lng BETWEEN 33.5 AND 42.2));
ALTER TABLE kazi_karibu_posts ADD COLUMN IF NOT EXISTS geo extensions.geography(Point, 4326)
  GENERATED ALWAYS AS (CASE WHEN lat IS NOT NULL AND lng IS NOT NULL THEN extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography END) STORED;
CREATE INDEX IF NOT EXISTS idx_kk_posts_geo ON kazi_karibu_posts USING gist (geo);
