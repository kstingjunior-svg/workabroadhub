-- 2026-11: one row per day for the 07:00 "needs your attention" admin email (prevents double sends).
CREATE TABLE IF NOT EXISTS admin_digest_runs (
  day date PRIMARY KEY,
  items int,
  sent boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admin_digest_runs ENABLE ROW LEVEL SECURITY;
