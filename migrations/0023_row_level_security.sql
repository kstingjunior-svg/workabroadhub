-- 2026-07: Row Level Security — defense in depth.
--
-- The server connects via the Postgres service role (bypasses RLS by
-- default), so enabling RLS here does NOT break the server. But: if the
-- SUPABASE_ANON_KEY ever leaks into a client bundle, or if you later add
-- Supabase client-side reads, these policies stop unauthorized rows from
-- being returned.
--
-- Rules:
--   • User can SEE their own rows and rows explicitly published (status='active').
--   • User can INSERT rows only with their own user_id.
--   • User can UPDATE / DELETE only their own rows.
--   • Admins bypass RLS via the service role connection (server unaffected).
--
-- Safe to re-run — each policy is dropped-then-recreated.

-- ═══════════════════════════════════════════════════════════════════════
-- LINKEDIN_OPTIMIZATIONS — per-user private drafts
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE linkedin_optimizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS linkedin_own_select   ON linkedin_optimizations;
DROP POLICY IF EXISTS linkedin_own_insert   ON linkedin_optimizations;
DROP POLICY IF EXISTS linkedin_own_update   ON linkedin_optimizations;
DROP POLICY IF EXISTS linkedin_own_delete   ON linkedin_optimizations;

-- Reads: only your own drafts.
CREATE POLICY linkedin_own_select ON linkedin_optimizations
  FOR SELECT
  USING (user_id = current_setting('request.jwt.claim.sub', true));

-- Writes: only rows tagged with your own user_id.
CREATE POLICY linkedin_own_insert ON linkedin_optimizations
  FOR INSERT
  WITH CHECK (user_id = current_setting('request.jwt.claim.sub', true));

CREATE POLICY linkedin_own_update ON linkedin_optimizations
  FOR UPDATE
  USING      (user_id = current_setting('request.jwt.claim.sub', true))
  WITH CHECK (user_id = current_setting('request.jwt.claim.sub', true));

CREATE POLICY linkedin_own_delete ON linkedin_optimizations
  FOR DELETE
  USING (user_id = current_setting('request.jwt.claim.sub', true));

-- ═══════════════════════════════════════════════════════════════════════
-- SCOUT_JOBS — publicly readable when active, per-user editable when draft
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE scout_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scout_public_read     ON scout_jobs;
DROP POLICY IF EXISTS scout_own_read        ON scout_jobs;
DROP POLICY IF EXISTS scout_own_insert      ON scout_jobs;
DROP POLICY IF EXISTS scout_own_update      ON scout_jobs;
DROP POLICY IF EXISTS scout_own_delete      ON scout_jobs;

-- Anyone can read active listings (this is a public marketplace).
CREATE POLICY scout_public_read ON scout_jobs
  FOR SELECT
  USING (status = 'active');

-- The scout can also read their own drafts / pending posts.
CREATE POLICY scout_own_read ON scout_jobs
  FOR SELECT
  USING (posted_by_user_id = current_setting('request.jwt.claim.sub', true));

-- Only insert with your own user id.
CREATE POLICY scout_own_insert ON scout_jobs
  FOR INSERT
  WITH CHECK (posted_by_user_id = current_setting('request.jwt.claim.sub', true));

-- Only edit / close your own listing.
CREATE POLICY scout_own_update ON scout_jobs
  FOR UPDATE
  USING      (posted_by_user_id = current_setting('request.jwt.claim.sub', true))
  WITH CHECK (posted_by_user_id = current_setting('request.jwt.claim.sub', true));

CREATE POLICY scout_own_delete ON scout_jobs
  FOR DELETE
  USING (posted_by_user_id = current_setting('request.jwt.claim.sub', true));

-- ═══════════════════════════════════════════════════════════════════════
-- WRITE_FROM_SCRATCH_DRAFTS — per-user private drafts
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE write_from_scratch_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wfs_own_select   ON write_from_scratch_drafts;
DROP POLICY IF EXISTS wfs_own_insert   ON write_from_scratch_drafts;
DROP POLICY IF EXISTS wfs_own_update   ON write_from_scratch_drafts;

CREATE POLICY wfs_own_select ON write_from_scratch_drafts
  FOR SELECT
  USING (user_id = current_setting('request.jwt.claim.sub', true) OR user_id IS NULL);

CREATE POLICY wfs_own_insert ON write_from_scratch_drafts
  FOR INSERT
  WITH CHECK (user_id = current_setting('request.jwt.claim.sub', true) OR user_id IS NULL);

CREATE POLICY wfs_own_update ON write_from_scratch_drafts
  FOR UPDATE
  USING      (user_id = current_setting('request.jwt.claim.sub', true) OR user_id IS NULL)
  WITH CHECK (user_id = current_setting('request.jwt.claim.sub', true) OR user_id IS NULL);
