// ─────────────────────────────────────────────────────────────────────────────
// Plan helpers — single source of truth for client-side paywall decisions.
//
// Anyone who has paid ANYTHING (KES 99 trial, KES 1,000 monthly,
// KES 4,500 yearly, or yearly via referral) is treated as a paid user and
// gets full access to every Pro-gated feature on the client.
//
// This deliberately matches the server-side `requireAnyPaidPlan` middleware
// so the two layers can never disagree (which historically caused paying
// customers to see "upgrade to Pro" CTAs even though the API let them in).
//
// 2026-06: created during the "ensure all paid tiers get full access" audit
// after KES 99 + KES 1,000 customers reported being blocked from /api/visa-jobs.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every plan tier that grants paid access. Free is the only excluded tier.
 *  - trial         — KES 99 / 24 hours
 *  - basic         — legacy KES 500 SKU (still grandfathered for old payers)
 *  - monthly       — KES 1,000 / 30 days
 *  - yearly        — KES 4,500 / 365 days
 *  - pro           — alias for yearly used in older code paths
 *  - pro_referral  — yearly granted via referral system
 */
export const PAID_PLAN_IDS = new Set<string>([
  "trial",
  "basic",
  "monthly",
  "yearly",
  "pro",
  "pro_referral",
]);

/**
 * True if the user has paid for any tier (or is an admin granted a plan).
 *
 * Accepts a loose input shape because the planId comes from many places —
 * /api/user/plan, /api/auth/user.plan, /api/bulk-apply/usage.planId, etc.
 */
export function isPaidUser(planId?: string | null | undefined): boolean {
  if (!planId) return false;
  return PAID_PLAN_IDS.has(String(planId).toLowerCase());
}

/**
 * Convenience for components that receive a whole `user` object whose `.plan`
 * or `.planId` field carries the tier. Handles both shapes seen across the app.
 */
export function userIsPaid(user: unknown): boolean {
  if (!user || typeof user !== "object") return false;
  const u = user as Record<string, unknown>;
  const planId = (u.planId ?? u.plan ?? u.subscription_plan ?? null) as string | null;
  return isPaidUser(planId);
}

/**
 * For copy/labels — friendly tier name. Falls back to the raw planId if we don't
 * have a localised label.
 */
export function planLabel(planId?: string | null): string {
  switch ((planId || "").toLowerCase()) {
    case "trial":        return "Trial";
    case "basic":        return "Basic";
    case "monthly":      return "Monthly";
    case "yearly":       return "Yearly";
    case "pro":          return "Yearly";
    case "pro_referral": return "Yearly (Referral)";
    case "free":         return "Free";
    default:             return planId || "Free";
  }
}
