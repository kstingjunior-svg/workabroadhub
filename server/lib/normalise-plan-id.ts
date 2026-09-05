// ─────────────────────────────────────────────────────────────────────────────
// normalisePlanId — collapse legacy aliases into their canonical form
//
// The plans table historically had aliases that duplicated a real tier:
//   basic         → same 24h product as trial (KES 99)
//   pro           → same 365d product as yearly (KES 4500)
//
// We can't drop the alias rows because historic user_subscriptions and
// payments reference them. But we CAN make sure any NEW write uses the
// canonical form, and any read that needs to compare against canonical
// resolves through this function.
//
// Call this at the boundary — anywhere planId comes in from:
//   - client payloads (/api/subscriptions/upgrade body)
//   - external webhooks (M-Pesa callback, PayPal webhook)
//   - admin grants
//   - reconcilers
//
// Bug avoided: two users on the "same product" but recorded under
// different plan_id strings would show as different tiers in every
// admin table, splitting revenue reports and confusing gate logic.
// ─────────────────────────────────────────────────────────────────────────────

const ALIAS_MAP: Record<string, string> = {
  basic: "trial",   // KES 99 / 24h
  pro:   "yearly",  // KES 4,500 / 365d
};

const CANONICAL = new Set(["trial", "monthly", "yearly", "pro_referral"]);

/**
 * Normalise a plan identifier to its canonical form. Never throws — falls
 * back to the input if unrecognised so callers with their own validation
 * (activateUserPlan's CANONICAL_TIERS gate) still get their expected value.
 *
 * Preserves case-safety: 'BASIC' → 'trial', ' Pro ' → 'yearly'.
 */
export function normalisePlanId(planId: string | null | undefined): string | null {
  if (!planId || typeof planId !== "string") return null;
  const trimmed = planId.trim().toLowerCase();
  if (!trimmed) return null;
  if (CANONICAL.has(trimmed)) return trimmed;
  if (ALIAS_MAP[trimmed]) return ALIAS_MAP[trimmed]!;
  return trimmed;   // unknown — let downstream validators reject if needed
}

/** Same but for the `plan_<slug>` prefixed service identifier. */
export function normaliseServiceIdToPlan(serviceId: string | null | undefined): string | null {
  if (!serviceId || typeof serviceId !== "string") return null;
  const s = serviceId.trim().toLowerCase();
  if (s.startsWith("plan_")) return normalisePlanId(s.slice("plan_".length));
  return normalisePlanId(s);
}
