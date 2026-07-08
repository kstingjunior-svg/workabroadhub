-- 0018_password_reset_tokens.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Password-reset token storage.
--
-- This table has been referenced by server/replit_integrations/auth/routes.ts
-- since forgot-password was built, but NO migration ever created it. The
-- INSERT / UPDATE / SELECT calls silently failed because the try/catch in
-- the handler swallowed the error and returned 200 to the user — leading to
-- the "6+ users can't recover their accounts, told to check email, nothing
-- arrives" report. The email actually never sent because we crashed before
-- reaching the send.
--
-- After this migration + the auth code fixes in 0017/9cc0b56, forgot-password
-- actually works end-to-end.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- 96-char hex (from crypto.randomBytes(48).toString("hex")). Unguessable.
  -- Anyone with the token can reset the password, so treat it as a capability.
  token        VARCHAR(255) NOT NULL UNIQUE,

  expires_at   TIMESTAMPTZ NOT NULL,

  -- Set when the token is used to prevent replay. Also set proactively when
  -- a fresh token is issued for the same user, invalidating any prior ones.
  used_at      TIMESTAMPTZ,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lookup by token (the reset-password endpoint's primary path).
CREATE INDEX IF NOT EXISTS password_reset_tokens_token_idx
  ON password_reset_tokens (token);

-- Look up all a user's tokens (support flow, invalidation on new-token issue).
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx
  ON password_reset_tokens (user_id);

-- Sweeping expired tokens (future cron).
CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_idx
  ON password_reset_tokens (expires_at)
  WHERE used_at IS NULL;

COMMENT ON TABLE password_reset_tokens IS
  'One-shot capability tokens for password reset. Anyone holding a live (unused, unexpired) token can reset the associated users.password_hash. Consumed via /api/auth/reset-password.';
