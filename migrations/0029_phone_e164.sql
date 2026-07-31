-- 2026-07 (Tony's founder brief): pan-African phone registration.
-- Adds standardized E.164 columns to users. Backfill from existing .phone
-- column preserves the existing Kenyan user base — nothing gets deleted.
--
-- Rules:
--   phone_number_e164  — canonical "+254712345678" format, uniquely indexed
--   country_iso        — ISO 3166 alpha-2 ("KE", "NG", etc.)
--   dial_code          — digits without "+" ("254", "234")
--   national_number    — national digits after trunk-0 strip ("712345678")
--
-- Safe to re-run. Idempotent.

BEGIN;

-- 1. Add new columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number_e164 VARCHAR;
ALTER TABLE users ADD COLUMN IF NOT EXISTS country_iso       VARCHAR(2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS dial_code         VARCHAR(4);
ALTER TABLE users ADD COLUMN IF NOT EXISTS national_number   VARCHAR;

-- 2. Backfill from the legacy .phone column, best-effort.
--    Only rows where a country code is unambiguously extractable get filled;
--    everything else stays null and the app will prompt for re-entry.
--    Kenyan users (the current majority) → +254 pattern.

-- Kenya (default assumption for legacy rows starting with 254 or leading 0/7/1)
UPDATE users
SET phone_number_e164 = '+254' || regexp_replace(regexp_replace(phone, '\D', '', 'g'), '^(254|0)', ''),
    country_iso       = 'KE',
    dial_code         = '254',
    national_number   = regexp_replace(regexp_replace(phone, '\D', '', 'g'), '^(254|0)', '')
WHERE phone IS NOT NULL
  AND phone_number_e164 IS NULL
  AND (
    phone LIKE '+254%' OR phone LIKE '254%' OR
    phone ~ '^0[71][0-9]{8}$' OR                -- 07XXXXXXXX or 01XXXXXXXX (Kenya national)
    phone ~ '^[71][0-9]{8}$'                    -- 7XXXXXXXX or 1XXXXXXXX (Kenya stripped)
  );

-- Uganda (+256)
UPDATE users
SET phone_number_e164 = '+256' || regexp_replace(regexp_replace(phone, '\D', '', 'g'), '^(256|0)', ''),
    country_iso       = 'UG',
    dial_code         = '256',
    national_number   = regexp_replace(regexp_replace(phone, '\D', '', 'g'), '^(256|0)', '')
WHERE phone IS NOT NULL
  AND phone_number_e164 IS NULL
  AND (phone LIKE '+256%' OR phone LIKE '256%');

-- Tanzania (+255)
UPDATE users
SET phone_number_e164 = '+255' || regexp_replace(regexp_replace(phone, '\D', '', 'g'), '^(255|0)', ''),
    country_iso       = 'TZ',
    dial_code         = '255',
    national_number   = regexp_replace(regexp_replace(phone, '\D', '', 'g'), '^(255|0)', '')
WHERE phone IS NOT NULL
  AND phone_number_e164 IS NULL
  AND (phone LIKE '+255%' OR phone LIKE '255%');

-- Nigeria (+234)
UPDATE users
SET phone_number_e164 = '+234' || regexp_replace(regexp_replace(phone, '\D', '', 'g'), '^(234|0)', ''),
    country_iso       = 'NG',
    dial_code         = '234',
    national_number   = regexp_replace(regexp_replace(phone, '\D', '', 'g'), '^(234|0)', '')
WHERE phone IS NOT NULL
  AND phone_number_e164 IS NULL
  AND (phone LIKE '+234%' OR phone LIKE '234%');

-- 3. Prevent duplicate accounts on the SAME E.164 number.
--    Partial unique — nulls are allowed (users without a phone yet).
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_e164_unique_idx
  ON users (phone_number_e164)
  WHERE phone_number_e164 IS NOT NULL;

-- 4. Fast lookup for auth flows (SELECT by phone_number_e164).
CREATE INDEX IF NOT EXISTS users_country_iso_idx
  ON users (country_iso)
  WHERE country_iso IS NOT NULL;

COMMIT;

-- Report how many rows were backfilled per country (useful for the dev log).
DO $$
DECLARE
  ke_count int; ug_count int; tz_count int; ng_count int; total_backfilled int;
BEGIN
  SELECT COUNT(*) INTO ke_count FROM users WHERE country_iso = 'KE';
  SELECT COUNT(*) INTO ug_count FROM users WHERE country_iso = 'UG';
  SELECT COUNT(*) INTO tz_count FROM users WHERE country_iso = 'TZ';
  SELECT COUNT(*) INTO ng_count FROM users WHERE country_iso = 'NG';
  SELECT COUNT(*) INTO total_backfilled FROM users WHERE phone_number_e164 IS NOT NULL;
  RAISE NOTICE 'Phone backfill: KE=% UG=% TZ=% NG=% TOTAL=%', ke_count, ug_count, tz_count, ng_count, total_backfilled;
END $$;
