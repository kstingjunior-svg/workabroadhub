-- 2026-11-27 (Tony): document services work without an account or email
-- verification. The customer's email (optional, typed on the form) is kept so
-- we can send them a copy of the finished document. Never verified, never required.
ALTER TABLE write_from_scratch_drafts
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS copy_emailed_at timestamptz;
