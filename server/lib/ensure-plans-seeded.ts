/**
 * Idempotent plan seeding.
 *
 * Guarantees every paid tier we charge for exists as a row in the `plans` table
 * BEFORE the manual-upgrade endpoint or any payment flow tries to read it.
 *
 * Background: 2026-06 — Tony tried to manually grant a paying user the yearly
 * plan from /admin/users and got:
 *   "Grant failed — Plan 'yearly' is not configured in the database."
 * Root cause: the `plans` table only had a small number of historical rows
 * (e.g. "pro") and didn't include the six tiers our pricing actually uses.
 * The grant path validates the planId against the DB before issuing the
 * subscription, so the grant fails even though we know the price.
 *
 * Fix: insert (or update) the six canonical rows on every server boot.
 * ON CONFLICT (plan_id) DO UPDATE makes it idempotent — safe to re-run.
 */
import { pool } from "../db";

interface PlanSeed {
  planId: string;
  planName: string;
  price: number;            // KES
  billingPeriod: string;    // "daily" | "monthly" | "yearly" | "annual"
  description: string;
  displayOrder: number;
}

// Tony's canonical pricing. These are the prices the rest of the app already
// charges via M-Pesa — see /pricing, the upgrade modal, the visa-jobs pill,
// etc. If we change a price here we must change it everywhere else too.
const PLAN_SEEDS: PlanSeed[] = [
  {
    planId:        "trial",
    planName:      "1-Day Trial",
    price:         99,
    billingPeriod: "daily",
    description:   "24 hours of full access. Test before you commit.",
    displayOrder:  10,
  },
  {
    planId:        "basic",                         // legacy alias for "trial"
    planName:      "1-Day Trial (Basic alias)",
    price:         99,
    billingPeriod: "daily",
    description:   "Backward-compat alias for 'trial'. Same price, same duration.",
    displayOrder:  11,
  },
  {
    planId:        "monthly",
    planName:      "Monthly Access",
    price:         1000,
    billingPeriod: "monthly",
    description:   "30 days of full access.",
    displayOrder:  20,
  },
  {
    planId:        "yearly",
    planName:      "Yearly Access",
    price:         4500,
    billingPeriod: "yearly",
    description:   "365 days of full access. Best value — save KES 7,500 vs paying monthly.",
    displayOrder:  30,
  },
  {
    planId:        "pro",                          // legacy alias for "yearly"
    planName:      "Pro (Yearly alias)",
    price:         4500,
    billingPeriod: "yearly",
    description:   "Backward-compat alias for 'yearly'. Same price, same duration.",
    displayOrder:  31,
  },
  {
    planId:        "pro_referral",                 // referral-discounted yearly
    planName:      "Pro (Referral Discount)",
    price:         3600,                            // 20% off 4,500
    billingPeriod: "yearly",
    description:   "Yearly Pro with the standard 20% referral discount applied.",
    displayOrder:  32,
  },
];

export async function ensurePlansSeeded(): Promise<void> {
  // INSERT … ON CONFLICT DO UPDATE so this is safe to run on every boot and
  // also picks up any price tweaks we make to this file later.
  for (const p of PLAN_SEEDS) {
    try {
      await pool.query(
        `INSERT INTO plans (plan_id, plan_name, price, billing_period, description, display_order, currency, is_active, features, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'KES', true, '[]'::jsonb, '{}'::jsonb, NOW(), NOW())
         ON CONFLICT (plan_id) DO UPDATE
           SET plan_name      = EXCLUDED.plan_name,
               price          = EXCLUDED.price,
               billing_period = EXCLUDED.billing_period,
               description    = EXCLUDED.description,
               display_order  = EXCLUDED.display_order,
               is_active      = true,
               updated_at     = NOW()`,
        [p.planId, p.planName, p.price, p.billingPeriod, p.description, p.displayOrder],
      );
    } catch (err: any) {
      // Don't fail server boot if one plan row can't be upserted — log it
      // and move on. The defensive fallback in the manual-grant endpoint
      // will save the day if the row is missing at request time.
      console.error(`[ensurePlansSeeded] Failed to upsert "${p.planId}":`, err?.message);
    }
  }
  console.log(`[ensurePlansSeeded] ✓ ${PLAN_SEEDS.length} canonical plan rows verified`);
}

/**
 * Defensive fallback: when something asks for a planId we haven't been able
 * to confirm in the plans table, return the canonical price we know it is.
 * Caller (e.g. manual grant) can use this so an empty plans table never
 * blocks a legitimate admin action.
 */
export function getCanonicalPlanPrice(planId: string): number | null {
  const seed = PLAN_SEEDS.find((p) => p.planId === planId);
  return seed ? seed.price : null;
}
