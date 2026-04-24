/**
 * Single source of truth for Free vs Pro feature lists.
 * Import from here — never hard-code feature strings in components.
 */

export const FREE_FEATURES = [
  "NEA license check (3 per day)",
  "Browse 5 verified portals",
  "Basic CV template",
] as const;

export const PRO_FEATURES = [
  "Unlimited NEA checks",
  "All 30+ portals access",
  "ATS CV scanner",
  "WhatsApp consultation",
  "Application tracking",
  "Priority support",
] as const;

/** Rows for side-by-side comparison tables */
export const PLAN_COMPARISON = [
  { label: "NEA license checks",     free: "3 per day",       pro: "Unlimited"      },
  { label: "Verified portals",       free: "5 portals",       pro: "30+ portals"    },
  { label: "CV tools",               free: "Basic template",  pro: "ATS CV scanner" },
  { label: "WhatsApp consultation",  free: false,             pro: true             },
  { label: "Application tracking",   free: false,             pro: true             },
  { label: "Priority support",       free: false,             pro: true             },
] as const;

/** Upgrade modal PLANS — free column */
export const UPGRADE_MODAL_FREE = [
  { label: "NEA checks (3 per day)",  included: true  },
  { label: "5 verified portals",      included: true  },
  { label: "Basic CV template",       included: true  },
  { label: "ATS CV scanner",          included: false },
  { label: "WhatsApp consultation",   included: false },
  { label: "Application tracking",    included: false },
  { label: "Priority support",        included: false },
] as const;

/** Upgrade modal PLANS — pro column */
export const UPGRADE_MODAL_PRO = [
  { label: "Unlimited NEA checks",   included: true },
  { label: "All 30+ portals",        included: true },
  { label: "ATS CV scanner",         included: true },
  { label: "WhatsApp consultation",  included: true },
  { label: "Application tracking",   included: true },
  { label: "Priority support",       included: true },
] as const;
