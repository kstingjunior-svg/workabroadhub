-- ────────────────────────────────────────────────────────────────────────────
-- Identity verification — adds email_verified / phone_verified columns,
-- the verification_codes OTP table, and a phone_lookups cache for Twilio.
--
-- Run once in Supabase SQL Editor. Idempotent — safe to re-run.
-- ────────────────────────────────────────────────────────────────────────────

-- Add verification flags to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;

-- One-time codes for email + SMS OTP
CREATE TABLE IF NOT EXISTS verification_codes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       VARCHAR REFERENCES users(id) ON DELETE CASCADE,
  channel       VARCHAR(10) NOT NULL CHECK (channel IN ('email', 'sms')),
  destination   VARCHAR(120) NOT NULL,  -- the email or phone the code was sent to
  code_hash     VARCHAR(128) NOT NULL,  -- sha256 of the 6-digit code, never store plaintext
  attempts      INTEGER NOT NULL DEFAULT 0,
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_codes_user_channel
  ON verification_codes (user_id, channel)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_verification_codes_destination
  ON verification_codes (destination, channel)
  WHERE used_at IS NULL;

-- Auto-cleanup: drop codes older than 24h (saves table bloat)
-- Not a hard requirement — a separate cron job can also do this.

-- Phone lookup cache — saves Twilio Lookup costs ($0.005 per call)
CREATE TABLE IF NOT EXISTS phone_lookups (
  phone         VARCHAR(20) PRIMARY KEY,
  valid         BOOLEAN NOT NULL,
  carrier_name  VARCHAR(80),
  line_type     VARCHAR(20),
  checked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phone_lookups_checked_at ON phone_lookups (checked_at);

-- Mark existing admin users as verified so they don't get locked out
UPDATE users
   SET email_verified = true,
       email_verified_at = NOW(),
       phone_verified = true,
       phone_verified_at = NOW()
 WHERE is_admin = true
    OR role IN ('ADMIN', 'SUPER_ADMIN');
