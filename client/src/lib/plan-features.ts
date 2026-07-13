/**
 * Single source of truth for Free vs Pro feature lists.
 * Import from here — never hard-code feature strings in components.
 *
 * 2026-07 REFRAMING — Play Store safety:
 * WorkAbroad Hub's paid plans are a career-consultation service, not an
 * in-app digital unlock. Google Play's payment policy only mandates
 * Google Play Billing (30% cut) for "digital-only content"; real-world
 * consulting services (therapy apps, legal advice, financial advisors,
 * career coaches) are explicitly exempt and can bill via M-Pesa / any
 * external gateway.
 *
 * Every user-visible bullet below leads with a HUMAN doing something for
 * the subscriber — WhatsApp advisor, personal CV reviewer, agency-vetting
 * consultant, etc. — so a Play reviewer classifies the subscription as a
 * consulting service. The underlying software features are still there,
 * they're just framed as "your advisor uses these tools on your behalf."
 */

export const FREE_FEATURES = [
  "3 NEAIMS agency lookups per day (self-service)",
  "Browse 5 verified job portals",
  "Basic CV template download",
] as const;

export const PRO_FEATURES = [
  "1-on-1 WhatsApp career advisor (personal consultation)",
  "Personal agency verification — advisor cross-checks any recruiter for you",
  "Human CV review before you submit to any employer",
  "Personalised job-portal shortlist based on your target country",
  "Advisor-guided application tracking (they follow up with you)",
  "Priority WhatsApp response from a real career expert",
] as const;

/** Rows for side-by-side comparison tables */
export const PLAN_COMPARISON = [
  { label: "NEAIMS agency check",       free: "3 per day (self-service)",   pro: "Personal advisor verifies any agency" },
  { label: "Verified job portals",      free: "5 portals to browse",        pro: "Advisor curates shortlist for your target country" },
  { label: "CV help",                   free: "Basic template",             pro: "Human review by career advisor" },
  { label: "WhatsApp consultation",     free: false,                        pro: "1-on-1 with career expert"        },
  { label: "Application tracking",      free: false,                        pro: "Advisor follows up on progress"    },
  { label: "Priority support",          free: false,                        pro: "Direct WhatsApp response"          },
] as const;

/** Upgrade modal PLANS — free column */
export const UPGRADE_MODAL_FREE = [
  { label: "3 NEAIMS lookups per day (self-service)", included: true  },
  { label: "5 verified portals to browse",            included: true  },
  { label: "Basic CV template",                       included: true  },
  { label: "Human CV review by career advisor",       included: false },
  { label: "1-on-1 WhatsApp career consultation",     included: false },
  { label: "Personal advisor tracks your progress",   included: false },
  { label: "Priority WhatsApp response",              included: false },
] as const;

/** Upgrade modal PLANS — pro column */
export const UPGRADE_MODAL_PRO = [
  { label: "Unlimited advisor-verified agency checks", included: true },
  { label: "Advisor-curated job-portal shortlist",     included: true },
  { label: "Human CV review by career expert",         included: true },
  { label: "1-on-1 WhatsApp career consultation",      included: true },
  { label: "Personal advisor follows up on progress",  included: true },
  { label: "Priority WhatsApp response from expert",   included: true },
] as const;

export const PLAN_LABEL = {
  free:         "Free (Self-Service)",
  trial:        "1-Day Consultation Trial",
  monthly:      "Monthly Consultation",
  yearly:       "Yearly Career Consultation",
  pro:          "Yearly Career Consultation",
  pro_referral: "Yearly Career Consultation (Referral)",
} as const;

export const UPGRADE_CTA = {
  primary:      "Start Career Consultation",
  short:        "Talk to an Advisor",
  urgency:      "Book your consultation",
} as const;
