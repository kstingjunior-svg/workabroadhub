-- 0066 (2026-11-20 admin sweep) — applied to production with CREATE INDEX CONCURRENTLY.
-- Account deletions ran "DELETE FROM conversion_events WHERE user_id = $1"
-- 555 times at ~1.8 s each (seq scan); analytics admin queries ~3.6 s each.
CREATE INDEX IF NOT EXISTS idx_conversion_events_user ON conversion_events (user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON analytics_events (user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type_time ON analytics_events (event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_vx_emp_reg_registry_id ON verifyx_employer_registry (registry_id);
