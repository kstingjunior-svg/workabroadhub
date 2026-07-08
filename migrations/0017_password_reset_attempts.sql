-- 0017_password_reset_attempts.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Persistent audit trail for password-reset attempts.
--
-- Why: Founder reported "6+ clients complaining they can't recover their
-- accounts — they click Forgot Password, are told to check email, but nothing
-- arrives, spam or otherwise." Root cause is invisible right now because
-- delivery attempts live only in an in-process ring buffer that resets on
-- every Render deploy. This table gives us a durable record we can query
-- when a user says "I never got the email."
--
-- One row per forgot-password submission (even if the email doesn't exist —
-- we still record the attempt so we can see enumeration patterns). We record
-- what channels we tried (email, whatsapp) and what came back from each.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS password_reset_attempts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who asked (null if the email doesn't match any user — we still log it).
  user_id             VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  email               VARCHAR(320) NOT NULL,

  -- Token issued (only when a user matched). Foreign key back to reset tokens.
  token_id            UUID,

  -- Delivery outcomes. Both channels are attempted when the user has a phone.
  --   'sent'    – provider accepted the message
  --   'failed'  – provider rejected or timed out
  --   'skipped' – channel not configured / no phone on file
  email_status        VARCHAR(16) NOT NULL DEFAULT 'skipped',
  email_provider      VARCHAR(24),                     -- 'gmail' | 'smtp' | 'resend'
  email_message_id    VARCHAR(255),
  email_error         TEXT,

  whatsapp_status     VARCHAR(16) NOT NULL DEFAULT 'skipped',
  whatsapp_error      TEXT,

  -- Request context — helps us spot bot-driven bursts.
  ip_address          VARCHAR(64),
  user_agent          TEXT,

  requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Look up recent attempts for a specific email (support flow).
CREATE INDEX IF NOT EXISTS password_reset_attempts_email_time_idx
  ON password_reset_attempts (LOWER(email), requested_at DESC);

-- Look up recent failures (admin dashboard).
CREATE INDEX IF NOT EXISTS password_reset_attempts_failures_idx
  ON password_reset_attempts (requested_at DESC)
  WHERE email_status = 'failed' OR whatsapp_status = 'failed';

COMMENT ON TABLE password_reset_attempts IS
  'Every forgot-password request, whether the email matched or not, plus the outcome of each delivery channel (email + WhatsApp). Durable across deploys — unlike the in-memory ring buffer in server/lib/email-providers.ts.';
