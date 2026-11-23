-- 0067 (2026-11-23) — Kazi Karibu: admin can post jobs on an employer's behalf.
-- Applied to production 23 Nov. Contact columns override the poster's own
-- phone/email when set (admin-posted jobs show the employer's contact).
ALTER TABLE kazi_karibu_posts
  ADD COLUMN IF NOT EXISTS posted_by_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS employer_name   text,
  ADD COLUMN IF NOT EXISTS contact_name    text,
  ADD COLUMN IF NOT EXISTS contact_phone   text,
  ADD COLUMN IF NOT EXISTS contact_email   text,
  ADD COLUMN IF NOT EXISTS how_to_apply    text,
  ADD COLUMN IF NOT EXISTS source_note     text;
