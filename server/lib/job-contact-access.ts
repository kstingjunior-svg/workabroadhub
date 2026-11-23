/**
 * Job-contact paywall (2026-11, Tony): jobs are posted free, job seekers pay.
 *
 * Employer Call / WhatsApp / phone for Kazi Karibu AND the Kenyan Jobs
 * Section unlock only for users with an active paid plan (trial, monthly,
 * yearly…) or admins. Everyone else is offered ONE option: Monthly,
 * KES 1,000 for 30 days. No yearly / KES 4,500 choice on this path.
 *
 * Job lists and detail pages stay public; phone numbers typed into free text
 * (description, how-to-apply) are masked so the paywall can't be bypassed.
 */
import { pool } from "../db";

export const JOB_CONTACT_PAID_PLANS = new Set(["trial", "basic", "monthly", "yearly", "pro", "pro_referral"]);
export const JOB_UNLOCK_PLAN = "monthly";
export const JOB_UNLOCK_PRICE_KES = 1000;

export async function canSeeJobContacts(userId: string): Promise<{ ok: boolean; plan: string; admin: boolean }> {
  try {
    const { rows: [u] } = await pool.query(`SELECT role, is_admin FROM users WHERE id = $1`, [userId]);
    const admin = !!u && (u.is_admin === true || ["ADMIN", "SUPER_ADMIN", "admin", "super_admin"].includes(String(u.role ?? "")));
    if (admin) return { ok: true, plan: "admin", admin: true };
    const { storage } = await import("../storage");
    const plan = String(await storage.getUserPlan(userId)).toLowerCase();
    return { ok: JOB_CONTACT_PAID_PLANS.has(plan), plan, admin: false };
  } catch (e: any) {
    console.warn("[job-contact-access] plan check failed:", e?.message);
    return { ok: false, plan: "unknown", admin: false }; // deny by default
  }
}

export function paywallBody(returnTo?: string) {
  const ret = returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/kazi-karibu/browse";
  return {
    code: "PAYWALL",
    error: "Unlock employer contacts — KES 1,000 for 30 days.",
    message: "Unlock employer contacts — KES 1,000 for 30 days.",
    amount: JOB_UNLOCK_PRICE_KES,
    plan: JOB_UNLOCK_PLAN,
    payUrl: `/payment?plan=${JOB_UNLOCK_PLAN}&only=1&return=${encodeURIComponent(ret)}`,
  };
}

/** Hide Kenyan phone numbers inside free text shown to the public. */
const PHONE_RE = /(?:\+?\s?254[\s-]?|0)\s?[17](?:[\s-]?\d){8}\b|\b[17]\d{2}[\s-]?\d{3}[\s-]?\d{3}\b/g;
export function maskPhones<T extends string | null | undefined>(s: T): T {
  if (!s) return s;
  return String(s).replace(PHONE_RE, "[number hidden — tap Call/WhatsApp]") as T;
}
