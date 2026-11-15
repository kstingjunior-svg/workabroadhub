-- 2026-11: paid "Verified Partner" badge + featured listing for agencies,
-- KES 5,000 per month. Kept separate from the NEA licence expiry_date, which
-- only the NEAIMS sync may change.
ALTER TABLE public.nea_agencies ADD COLUMN IF NOT EXISTS partner_badge_until timestamp without time zone;
