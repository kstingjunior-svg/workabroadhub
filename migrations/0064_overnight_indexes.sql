-- 0064 (2026-11 overnight sweep) — applied to production 19 Nov.
-- conversion_events (355k rows) had no index → admin analytics dashboard/funnel
-- timed out (500). finance_ledger view looked up user_subscriptions by
-- payment_id with a seq scan per payment → Admin Finance took ~10 s and hit
-- the statement timeout (500). verified_profiles (0046) was never applied.
CREATE INDEX IF NOT EXISTS idx_conversion_events_step_time ON conversion_events (funnel_step, completed_at);
CREATE INDEX IF NOT EXISTS idx_conversion_events_time ON conversion_events (completed_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events (created_at);
CREATE INDEX IF NOT EXISTS idx_user_subs_payment_id_text ON user_subscriptions ((payment_id::text));
CREATE TABLE IF NOT EXISTS verified_profiles (
  user_id     VARCHAR PRIMARY KEY,
  share_token VARCHAR(32) NOT NULL,
  is_public   BOOLEAN NOT NULL DEFAULT false,
  show_phone  BOOLEAN NOT NULL DEFAULT false,
  show_email  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMP DEFAULT now(),
  updated_at  TIMESTAMP DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_verified_profiles_share_token ON verified_profiles (share_token);
ALTER TABLE verified_profiles ENABLE ROW LEVEL SECURITY;
