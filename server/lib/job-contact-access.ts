/**
 * Job-contact paywall (2026-11, Tony): jobs are posted free, job seekers pay.
 * Thin wrapper over the central feature-access check (server/lib/feature-access.ts,
 * registry entry `local_job_contacts` in shared/feature-access.ts):
 *   - any active plan (trial / monthly / yearly …) or admin → allowed
 *   - otherwise one option only: Monthly, KES 1,000 / 30 days
 *
 * Job lists and detail pages stay public; phone numbers typed into free text
 * (description, how-to-apply) are masked so the paywall can't be bypassed.
 */
import { checkFeature, upgradeRequiredBody } from "./feature-access";
import { PAID_PLAN_IDS, safeReturnPath } from "../../shared/feature-access";

export const JOB_CONTACT_PAID_PLANS = new Set<string>(PAID_PLAN_IDS);
export const JOB_UNLOCK_PLAN = "monthly";
export const JOB_UNLOCK_PRICE_KES = 1000;

export async function canSeeJobContacts(userId: string): Promise<{ ok: boolean; plan: string; admin: boolean }> {
  const r = await checkFeature("local_job_contacts", userId);
  return { ok: r.allowed, plan: r.plan, admin: r.plan === "admin" };
}

export function paywallBody(returnTo?: string) {
  const b = upgradeRequiredBody("local_job_contacts", safeReturnPath(returnTo) ?? "/kazi-karibu/browse");
  const message = "Unlock employer contacts — KES 1,000 for 30 days.";
  return { ...b, error: message, message, amount: JOB_UNLOCK_PRICE_KES, plan: JOB_UNLOCK_PLAN };
}

/** Hide Kenyan phone numbers inside free text shown to the public. */
const PHONE_RE = /(?:\+?\s?254[\s-]?|0)\s?[17](?:[\s-]?\d){8}\b|\b[17]\d{2}[\s-]?\d{3}[\s-]?\d{3}\b/g;
export function maskPhones<T extends string | null | undefined>(s: T): T {
  if (!s) return s;
  return String(s).replace(PHONE_RE, "[number hidden — tap Call/WhatsApp]") as T;
}
