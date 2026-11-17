-- 2026-11: "Tailor for another job" (KES 100) links a new draft to the CV it was copied from.
ALTER TABLE write_from_scratch_drafts ADD COLUMN IF NOT EXISTS parent_draft_id uuid;
CREATE INDEX IF NOT EXISTS idx_wfs_parent ON write_from_scratch_drafts (parent_draft_id) WHERE parent_draft_id IS NOT NULL;
