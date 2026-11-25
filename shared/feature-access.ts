/**
 * WorkAbroadHub feature-access registry — the ONE place that says who may do what.
 *
 * Permanent business rule (Tony, 2026-11):  EXPLORE FIRST. PAY WHEN NECESSARY.
 * See docs/architecture/FREEMIUM_RULES.md.
 *
 * Five separate questions, never mixed up:
 *   1. Authentication  — is this a signed-in account?            (session; never asks for money)
 *   2. Authorization   — is this account allowed (e.g. admin)?   (role)
 *   3. Entitlement     — does the account hold an active plan?   (storage.getUserPlan, server-side)
 *   4. Feature access  — does THIS feature need 1–3?             (this file)
 *   5. Payment verification — only a verified M-Pesa/PayPal callback creates an entitlement.
 *
 * Access levels
 *   PUBLIC        — anyone, no account.
 *   FREE          — any signed-in account. Free accounts are real accounts.
 *   PREMIUM       — active paid plan. `tier` keeps the existing rules:
 *                     "any_paid"  = trial, monthly, yearly (… the requireAnyPaidPlan / job paywall rule)
 *                     "full_plan" = monthly or yearly only (… the requireProPlan rule; trial excluded)
 *   ONE_TIME_PAID — bought per use / per order (CV services, tool scans). Has its own checkout.
 *   ADMIN         — admin / super-admin only.
 *
 * This registry DESCRIBES existing entitlements; it does not change any price or plan.
 * Adding a feature here never makes it paid by itself — server endpoints enforce, the
 * UI uses the same entry to word the prompt and to open it only on a deliberate tap.
 */

export type AccessLevel = "PUBLIC" | "FREE" | "PREMIUM" | "ONE_TIME_PAID" | "ADMIN";
export type PremiumTier = "any_paid" | "full_plan";

export interface FeatureDef {
  access: AccessLevel;
  tier?: PremiumTier;            // PREMIUM only
  label: string;                 // shown as "Unlock {label}"
  /** Plans offered at the prompt. Local-jobs unlock is Monthly-only by Tony's rule. */
  offer?: "monthly_or_yearly" | "monthly_only";
  /** Where the paid action is enforced server-side (for audits/tests). */
  enforcedBy?: string;
}

export const PAID_PLAN_IDS = ["trial", "basic", "monthly", "yearly", "pro", "pro_referral"] as const;
export const FULL_PLAN_IDS = ["monthly", "yearly", "pro", "pro_referral"] as const;

export const FEATURES = {
  // ── Browsing: always free ──────────────────────────────────────────────────
  home:                 { access: "PUBLIC", label: "Home" },
  pricing_page:         { access: "PUBLIC", label: "Plans & pricing" },
  country_pages:        { access: "PUBLIC", label: "Job destinations & country guides" },
  service_descriptions: { access: "PUBLIC", label: "Service descriptions" },
  scam_wall:            { access: "PUBLIC", label: "Scam Wall" },
  nea_agency_search:    { access: "PUBLIC", label: "Agency licence search" },
  kenya_jobs_browse:    { access: "PUBLIC", label: "Kenyan Jobs Section listings" },
  kazi_karibu_browse:   { access: "PUBLIC", label: "Kazi Karibu listings" },
  dashboard:            { access: "FREE", label: "Dashboard" },
  profile_settings:     { access: "FREE", label: "Profile & account settings" },
  application_tracker_view: { access: "FREE", label: "Application tracker" },

  // ── Premium (subscription) — prompt only on a deliberate tap ────────────────
  // 2026-11-25 (Tony): local jobs are FREE for any signed-in account — a growth
  // strategy (build job-seeker audience → attract employers). Sign-in still required.
  // Was PREMIUM (KES 1,000, monthly_only) for one day; 12 prompts, 0 payments.
  local_job_contacts:   { access: "FREE", label: "employer contacts",
                          enforcedBy: "server/lib/job-contact-access.ts (lj/kazi contact + interest)" },
  kenya_jobs_apply:     { access: "FREE", label: "Kenyan jobs applications",
                          enforcedBy: "server/local-jobs-routes.ts POST /api/local-jobs/jobs/:id/apply" },
  premium_job_links:    { access: "PREMIUM", tier: "any_paid", offer: "monthly_or_yearly", label: "premium job links",
                          enforcedBy: "GET /api/go/job/:id (403 → prompt)" },
  visa_sponsorship_apply: { access: "PREMIUM", tier: "any_paid", offer: "monthly_or_yearly", label: "Visa Sponsorship Jobs",
                          enforcedBy: "server/visa-jobs-routes.ts" },
  ai_auto_apply:        { access: "PREMIUM", tier: "full_plan", offer: "monthly_or_yearly", label: "AI Auto-Apply",
                          enforcedBy: "server/routes.ts auto-apply (403 PRO required)" },
  cv_matching:          { access: "PREMIUM", tier: "full_plan", offer: "monthly_or_yearly", label: "CV matching",
                          enforcedBy: "server/routes.ts CV matching (403)" },
  linkedin_optimizer:   { access: "PREMIUM", tier: "full_plan", offer: "monthly_or_yearly", label: "LinkedIn Optimizer",
                          enforcedBy: "server/routes/linkedin-optimize.ts requireProPlan" },
  whatsapp_consultation:{ access: "PREMIUM", tier: "full_plan", offer: "monthly_or_yearly", label: "WhatsApp Consultation" },

  // ── One-time purchases: own checkout, never the subscription wall ───────────
  cv_services:          { access: "ONE_TIME_PAID", label: "CV services", enforcedBy: "service orders + payments" },
  tool_scans:           { access: "ONE_TIME_PAID", label: "verification scans", enforcedBy: "server/tools/tool-pay.ts" },
  assisted_apply:       { access: "ONE_TIME_PAID", label: "Assisted Apply", enforcedBy: "service orders + payments" },

  // ── Admin ───────────────────────────────────────────────────────────────────
  admin_panel:          { access: "ADMIN", label: "Admin panel" },
} as const satisfies Record<string, FeatureDef>;

export type FeatureId = keyof typeof FEATURES;

export interface AccessContext {
  authenticated: boolean;
  plan?: string | null;        // from storage.getUserPlan (server) or /api/user/plan (client hint)
  isAdmin?: boolean;
}

export type AccessDecision =
  | { allowed: true }
  | { allowed: false; reason: "SIGNIN" | "UPGRADE" | "PURCHASE" | "ADMIN_ONLY" };

export function hasPlanFor(tier: PremiumTier, plan?: string | null): boolean {
  const p = String(plan ?? "").toLowerCase();
  return tier === "full_plan" ? (FULL_PLAN_IDS as readonly string[]).includes(p) : (PAID_PLAN_IDS as readonly string[]).includes(p);
}

/** Pure decision used by server middleware, client gates and tests alike. */
export function decideAccess(feature: FeatureId, ctx: AccessContext): AccessDecision {
  const f = FEATURES[feature] as FeatureDef;
  switch (f.access) {
    case "PUBLIC": return { allowed: true };
    case "FREE": return ctx.authenticated ? { allowed: true } : { allowed: false, reason: "SIGNIN" };
    case "ADMIN": return ctx.authenticated && ctx.isAdmin ? { allowed: true } : { allowed: false, reason: ctx.authenticated ? "ADMIN_ONLY" : "SIGNIN" };
    // Bought per order/scan through its own checkout; a subscription never stands in for it here.
    case "ONE_TIME_PAID": return { allowed: false, reason: "PURCHASE" };
    case "PREMIUM":
      if (!ctx.authenticated) return { allowed: false, reason: "SIGNIN" };
      if (ctx.isAdmin) return { allowed: true };
      return hasPlanFor(f.tier ?? "any_paid", ctx.plan) ? { allowed: true } : { allowed: false, reason: "UPGRADE" };
  }
}

/** Safe same-site return path (no open redirects). Returns null if unsafe. */
export function safeReturnPath(p?: string | null): string | null {
  if (!p || typeof p !== "string") return null;
  if (!/^\/[A-Za-z0-9]/.test(p)) return null;                 // must be "/x…", not "//" or "/\"
  if (/^\/(payment|pricing|login|signup|logout|api\/)/.test(p)) return null;
  if (p.length > 300 || /[\r\n]/.test(p)) return null;
  return p;
}

/** Checkout link for a premium feature, carrying the user back afterwards. */
export function checkoutUrl(feature: FeatureId, plan: "monthly" | "yearly", returnTo?: string | null): string {
  const f = FEATURES[feature] as FeatureDef;
  const planId = f.offer === "monthly_only" ? "monthly" : plan === "yearly" ? "pro" : "monthly";
  const qs = new URLSearchParams({ plan: planId });
  if (f.offer === "monthly_only") qs.set("only", "1");
  const ret = safeReturnPath(returnTo);
  if (ret) qs.set("return", ret);
  return `/payment?${qs.toString()}`;
}
