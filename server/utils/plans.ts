/** Duration in days for each paid plan. */
const PLAN_DURATION: Record<string, number> = {
  trial:   1,    // KES 99    / 1 day
  monthly: 30,   // KES 1,000 / 30 days
  yearly:  365,  // KES 4,500 / 365 days
  pro:     365,  // legacy alias for yearly — KES 4,500 / 365 days
};

/** Human-readable label for each plan (used in Firebase records, notifications, etc.) */
const PLAN_LABEL: Record<string, string> = {
  trial:   "Trial Access (1 day)",
  monthly: "Monthly Access (30 days)",
  yearly:  "Yearly Access (365 days)",
  pro:     "Yearly Access (365 days)",
};

/**
 * Returns the expiry Date for a given planId, calculated from now.
 * Defaults to 365 days if planId is unrecognised (guards against unknown future plans).
 */
export function planExpiry(planId?: string): Date {
  const days = planId ? (PLAN_DURATION[planId] ?? 365) : 365;
  if (planId && !PLAN_DURATION[planId]) {
    console.warn(`[planExpiry] Unknown planId "${planId}" — defaulting to 365 days`);
  }
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/**
 * Returns the duration in days for a given planId.
 * Defaults to 365 days if planId is unrecognised.
 */
export function planDurationDays(planId?: string): number {
  if (!planId) return 365;
  const days = PLAN_DURATION[planId];
  if (!days) {
    console.warn(`[planDurationDays] Unknown planId "${planId}" — defaulting to 365 days`);
    return 365;
  }
  return days;
}

/**
 * Returns a human-readable label for a given planId.
 */
export function planLabel(planId?: string): string {
  if (!planId) return "Subscription";
  return PLAN_LABEL[planId] ?? `${planId} plan`;
}
