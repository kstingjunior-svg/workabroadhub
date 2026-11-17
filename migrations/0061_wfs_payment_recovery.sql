-- 2026-11 abandoned-payment recovery for Write from Scratch.
-- prior_checkout_ids: earlier M-Pesa prompts for the same draft (a late payment on an old prompt still counts).
-- payment_reminder_sent_at: the one "finish your payment" email, never sent twice.
ALTER TABLE write_from_scratch_drafts ADD COLUMN IF NOT EXISTS prior_checkout_ids text[];
ALTER TABLE write_from_scratch_drafts ADD COLUMN IF NOT EXISTS payment_reminder_sent_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_wfs_pending_reminder ON write_from_scratch_drafts (created_at) WHERE status = 'pending_payment' AND payment_reminder_sent_at IS NULL;
