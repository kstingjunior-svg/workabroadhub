/**
 * Freemium conversion events (2026-11). Stored server-side in funnel_events via
 * POST /api/track-event (user id comes from the session — pseudonymous).
 *
 * Privacy: metadata carries ONLY feature ids, plan ids, trigger names and the page
 * path. Never names, phones, emails, CV text, documents or payment details.
 *
 * Payment attempts and VERIFIED activations are not tracked here — the payments
 * table is the source of truth for those (see GET /api/admin/freemium-funnel).
 */
import { trackServerEvent } from "@/lib/analytics";

export const CONV = {
  PREMIUM_CLICK: "premium_click",            // user tapped a premium action (allowed or not)
  UPGRADE_VIEW: "upgrade_modal_view",        // subscription modal shown (Monthly/Yearly)
  UPGRADE_DISMISS: "upgrade_modal_dismiss",  // closed / "Continue browsing"
  UPGRADE_PLAN: "upgrade_plan_select",       // chose monthly | yearly → checkout
  JOB_UNLOCK_VIEW: "job_unlock_view",        // KES 1,000 local-jobs modal shown
  JOB_UNLOCK_DISMISS: "job_unlock_dismiss",
  JOB_UNLOCK_PAY: "job_unlock_pay",          // tapped "Pay KES 1,000 with M-Pesa" (retired 2026-11-25: local jobs free)
  LOCAL_CONTACT: "local_contact",            // free employer contact revealed (Kazi / Kenyan Jobs)
  AFTER_CONTACT_CV_CLICK: "after_contact_cv_click", // tapped the CV-help suggestion shown after a contact
} as const;
export type ConvEvent = (typeof CONV)[keyof typeof CONV];

const SAFE_KEYS = new Set(["feature", "plan", "trigger", "allowed", "reason", "offer"]);

export function conv(event: ConvEvent, meta: Record<string, string | number | boolean | null | undefined> = {}) {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) if (SAFE_KEYS.has(k) && v != null) clean[k] = typeof v === "string" ? v.slice(0, 60) : v;
  try { trackServerEvent(event, clean); } catch { /* analytics must never break the UI */ }
}
