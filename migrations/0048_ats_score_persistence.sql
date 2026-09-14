-- 2026-09 (Tony: "Nanjila says 68%, the CV checker says 45% — no consistency.
-- Our selling point is trust.")
--
-- Root cause: the ATS CV Checker (/tools/ats-cv-checker) runs a structured
-- 20-phase analysis and produces a real score. Nanjila (the chat advisor) had
-- no memory of that score and no rubric of her own — if a user pasted their
-- CV into chat and asked "what would you score this?", the model free-
-- associated a number from scratch every single time, with no anchor. Same
-- CV, different chat turn, different number.
--
-- Fix: one single source of truth. Every /api/tools/ats-check run now saves
-- its score to user_career_profiles. Nanjila's system prompt reads that real,
-- saved number back and is instructed to never estimate her own — see
-- server/ai/nanjila.ts (getUserAtsScore) and server/tools-routes.ts.

ALTER TABLE user_career_profiles
  ADD COLUMN IF NOT EXISTS ats_score     integer,
  ADD COLUMN IF NOT EXISTS ats_grade     varchar,
  ADD COLUMN IF NOT EXISTS ats_scored_at timestamp;
