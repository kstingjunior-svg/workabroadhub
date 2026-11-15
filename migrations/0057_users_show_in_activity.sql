-- 2026-11: opt-out for the public live activity feed (initials + country only).
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS show_in_activity boolean NOT NULL DEFAULT true;
