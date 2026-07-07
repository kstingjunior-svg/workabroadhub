-- 0016_write_from_scratch.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- "Write from Scratch" tool — generate a CV / cover letter / recruitment CV /
-- reference letter from a short form instead of forcing the user to upload
-- an existing document.
--
-- Pricing: KES 300 per generation (Free users), free for Pro subscribers.
-- Output: user chooses Word or PDF at download time.
--
-- One row per generation attempt. If the user pays but bails before
-- generating, the row sits at status='paid' and can be resumed.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS write_from_scratch_drafts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Author. NULL for guests who pay via M-Pesa without an account.
  user_id           VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,

  -- Which document the user asked for:
  --   cv               – general CV/resume
  --   cover_letter     – job-specific cover letter
  --   recruitment_cv   – Kenyan-agency-format CV (Gulf/Saudi structure)
  --   reference_letter – employer-style reference / recommendation
  doc_type          VARCHAR(32) NOT NULL
                    CHECK (doc_type IN ('cv','cover_letter','recruitment_cv','reference_letter')),

  -- The user's input from the form. Shape varies by doc_type — we keep it
  -- loose (JSONB) so we can iterate on the form without a schema migration.
  input_json        JSONB NOT NULL,

  -- Generated body, plain text with "# " / "## " heading markers so
  -- server/services/document-renderer.ts can render either .docx or .pdf.
  output_body       TEXT,

  -- Payment gate. status flow:
  --   pending_payment → paid → generated
  --                              \-> failed  (AI error, refund on request)
  -- Pro users skip pending_payment entirely — they start at 'paid'.
  status            VARCHAR(24) NOT NULL DEFAULT 'pending_payment'
                    CHECK (status IN ('pending_payment','paid','generated','failed','refunded')),

  mpesa_amount      INTEGER NOT NULL DEFAULT 300,
  mpesa_receipt     VARCHAR(64),
  mpesa_checkout_id VARCHAR(128),   -- CheckoutRequestID from Safaricom, used to match callbacks
  mpesa_phone       VARCHAR(20),

  -- If gen fails we surface this to the user so support can trace it.
  error_message     TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at           TIMESTAMPTZ,
  generated_at      TIMESTAMPTZ
);

-- Look up by CheckoutRequestID when M-Pesa callback lands.
CREATE INDEX IF NOT EXISTS write_from_scratch_drafts_checkout_idx
  ON write_from_scratch_drafts (mpesa_checkout_id)
  WHERE mpesa_checkout_id IS NOT NULL;

-- List a user's own recent generations (for "My documents" if we build it).
CREATE INDEX IF NOT EXISTS write_from_scratch_drafts_user_created_idx
  ON write_from_scratch_drafts (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Admin: recent activity across all users.
CREATE INDEX IF NOT EXISTS write_from_scratch_drafts_created_idx
  ON write_from_scratch_drafts (created_at DESC);

COMMENT ON TABLE write_from_scratch_drafts IS
  'One row per Write-from-Scratch generation attempt. Users pay KES 300 (or free for Pro), fill a short form describing themselves, and we generate a CV / cover letter / recruitment CV / reference letter downloadable as .docx or .pdf.';
