/**
 * AutoApply plan tiers — single source of truth for what each plan gets.
 *
 * 2026-08 (Tony's "revenue model — Phase 2"): free-forever tier for
 * hooked users, KES 1,500/mo Pro tier for full experience. Kept
 * intentionally simple — 2 tiers only. If we later add Premium (KES
 * 4,500) with WhatsApp coach + interview prep, drop it in here.
 *
 * Used by:
 *   • server/lib/autoapply/index.ts     — caps scan volume & letter drafting
 *   • server/routes/autoapply.ts        — surfaces the same numbers on the API
 *     so the frontend can render the paywall UI accurately
 *   • client/src/pages/autoapply.tsx    — receives via /api/autoapply/agent
 */

export interface AutoApplyPlanLimits {
  tier:                 "free" | "pro";
  maxMatchesPerDay:     number;
  maxCoverLettersPerDay: number;   // 0 = no AI letters, use template
  scanEvery:            "daily" | "weekly";
  dailyDigestEmail:     boolean;
  priorityQueue:        boolean;    // scan runs first when the tick fires
  monthlyPriceKes:      number;     // 0 for free
}

// Canonical limits. Update here and both server + client update in the
// same deploy (client reads via /api/autoapply/plan-info).
// 2026-08 Phase 2.5: length of the auto-granted Pro trial when a user
// first activates their AutoApply agent. Long enough for them to see
// the value (daily digest × 7 days = 7 morning "wow" moments), short
// enough to force a decision.
export const AUTOAPPLY_PRO_TRIAL_DAYS = 7;

// 2026-08 Phase 2.5: annual pricing option shown alongside monthly.
// Two months free vs. paying 12 × monthly = ~17% discount. Bumps LTV
// dramatically because annual customers rarely churn mid-year.
export const AUTOAPPLY_PRO_ANNUAL_KES = 15_000;

export const AUTOAPPLY_PLAN_LIMITS: Record<string, AutoApplyPlanLimits> = {
  free: {
    tier:                 "free",
    maxMatchesPerDay:     3,
    maxCoverLettersPerDay: 0,   // free users see match + apply URL; upgrade for AI letters
    scanEvery:            "weekly",
    dailyDigestEmail:     false,
    priorityQueue:        false,
    monthlyPriceKes:      0,
  },
  basic: {
    // Basic plan users get the same as pro for AutoApply — the paywall
    // is a two-tier "free vs paid" story, not a three-tier one. This
    // keeps the marketing simple.
    tier:                 "pro",
    maxMatchesPerDay:     30,
    maxCoverLettersPerDay: 10,
    scanEvery:            "daily",
    dailyDigestEmail:     true,
    priorityQueue:        false,
    monthlyPriceKes:      1500,
  },
  pro: {
    tier:                 "pro",
    maxMatchesPerDay:     30,
    maxCoverLettersPerDay: 10,
    scanEvery:            "daily",
    dailyDigestEmail:     true,
    priorityQueue:        true,
    monthlyPriceKes:      1500,
  },
};

/**
 * Resolve limits for a user's plan. Falls back to FREE if the plan
 * string is unrecognised — safe default.
 */
export function getAutoApplyLimits(planId: string | null | undefined): AutoApplyPlanLimits {
  const key = (planId ?? "free").toLowerCase();
  return AUTOAPPLY_PLAN_LIMITS[key] ?? AUTOAPPLY_PLAN_LIMITS.free;
}
