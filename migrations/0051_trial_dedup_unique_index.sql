-- 2026-09 (Tony's "reusage of a trial" follow-up): the two unique partial
-- indexes that trial-gate.ts's bootstrapTrialGuards() is supposed to
-- install (uniq_trial_success_per_user, uniq_trial_success_per_phone) have
-- never actually existed in production -- every boot has been silently
-- failing to create them (the error is caught and logged as non-fatal) ever
-- since enough historical duplicate trial rows existed to violate a unique
-- constraint on first creation. That left the app-level SELECT-EXISTS
-- checks as the ONLY defence against a repeat trial, with no DB-level
-- backstop against a race (two near-simultaneous requests both passing the
-- check before either commits) or a code path that forgets to check.
--
-- We do not delete or alter the status of any existing payment row -- every
-- KES 99 ever collected (real or admin-granted) stays exactly as it was for
-- revenue/audit history. Instead we add a narrow, additive dedup flag: for
-- each user_id (and separately each phone) that has more than one
-- successful trial/basic row, the EARLIEST is left alone and every later
-- one is flagged is_duplicate_trial = true. The unique indexes then only
-- ever need to hold true for non-duplicate rows, which is trivially
-- satisfied since every new row still defaults to false and the app-level
-- gates (now including /api/admin/manual-grant) already refuse to create a
-- second real one.
--
-- Applied directly to production via Supabase on 2026-09-16 (migration
-- "trial_dedup_unique_index"); this file documents that change and lets a
-- fresh environment reach the same schema. Idempotent — safe to re-run.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS is_duplicate_trial boolean NOT NULL DEFAULT false;

WITH trial_rows AS (
  SELECT id, user_id, phone, created_at
  FROM payments
  WHERE status IN ('success', 'completed')
    AND (plan_id IN ('trial', 'basic') OR service_id IN ('plan_trial', 'plan_basic'))
),
ranked_by_user AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC) AS rn_user
  FROM trial_rows
  WHERE user_id IS NOT NULL
),
ranked_by_phone AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY phone ORDER BY created_at ASC) AS rn_phone
  FROM trial_rows
  WHERE phone IS NOT NULL
)
UPDATE payments p
SET is_duplicate_trial = true
WHERE p.id IN (
  SELECT id FROM ranked_by_user WHERE rn_user > 1
  UNION
  SELECT id FROM ranked_by_phone WHERE rn_phone > 1
)
  AND p.is_duplicate_trial IS DISTINCT FROM true;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_trial_success_per_user
  ON payments (user_id)
  WHERE status IN ('success', 'completed')
    AND (plan_id IN ('trial', 'basic') OR service_id IN ('plan_trial', 'plan_basic'))
    AND user_id IS NOT NULL
    AND is_duplicate_trial = false;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_trial_success_per_phone
  ON payments (phone)
  WHERE status IN ('success', 'completed')
    AND (plan_id IN ('trial', 'basic') OR service_id IN ('plan_trial', 'plan_basic'))
    AND phone IS NOT NULL
    AND is_duplicate_trial = false;
