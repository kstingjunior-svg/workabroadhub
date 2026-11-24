/**
 * Server-side feature access (2026-11). The backend is the security boundary;
 * the UI only decides WHEN to show a prompt. See shared/feature-access.ts and
 * docs/architecture/FREEMIUM_RULES.md.
 *
 *   isAuthenticated  → who you are      (never asks for money)
 *   resolveEntitlement → what you've paid for (live DB read via storage.getUserPlan,
 *                        which already enforces subscription end dates)
 *   requireFeature   → may you do THIS  (decideAccess from the shared registry)
 *
 * Deny-by-default: any lookup error is treated as "no entitlement".
 */
import type { Request, Response, NextFunction } from "express";
import { pool } from "../db";
import { FEATURES, decideAccess, checkoutUrl, safeReturnPath, type FeatureId, type FeatureDef } from "../../shared/feature-access";

export interface Entitlement { plan: string; isAdmin: boolean }

export async function resolveEntitlement(userId: string): Promise<Entitlement> {
  try {
    const { rows: [u] } = await pool.query(`SELECT role, is_admin FROM users WHERE id = $1`, [userId]);
    const isAdmin = !!u && (u.is_admin === true || ["ADMIN", "SUPER_ADMIN", "admin", "super_admin"].includes(String(u.role ?? "")));
    if (isAdmin) return { plan: "admin", isAdmin: true };
    const { storage } = await import("../storage");
    return { plan: String(await storage.getUserPlan(userId)).toLowerCase(), isAdmin: false };
  } catch (e: any) {
    console.warn("[feature-access] entitlement lookup failed:", e?.message);
    return { plan: "free", isAdmin: false };
  }
}

export async function checkFeature(feature: FeatureId, userId: string | null | undefined) {
  if (!userId) return { allowed: false as const, reason: "SIGNIN" as const, plan: "none" };
  const ent = await resolveEntitlement(userId);
  const d = decideAccess(feature, { authenticated: true, plan: ent.plan, isAdmin: ent.isAdmin });
  return { ...d, plan: ent.plan };
}

/** Standard 402 body every premium endpoint returns, so the UI can prompt contextually. */
export function upgradeRequiredBody(feature: FeatureId, returnTo?: string | null) {
  const f = FEATURES[feature] as FeatureDef;
  const ret = safeReturnPath(returnTo);
  return {
    code: "PAYWALL",
    feature,
    featureLabel: f.label,
    offer: f.offer ?? "monthly_or_yearly",
    message: `Unlock ${f.label} with an active plan.`,
    error: `Unlock ${f.label} with an active plan.`,
    payUrl: checkoutUrl(feature, "monthly", ret),
    payUrlYearly: f.offer === "monthly_only" ? null : checkoutUrl(feature, "yearly", ret),
  };
}

const sessionUserId = (req: any): string | null =>
  req.user?.claims?.sub ?? req.user?.id ?? req.session?.customUserId ?? null;

/** Express middleware: `app.post(path, requireFeature("ai_auto_apply"), handler)`. */
export function requireFeature(feature: FeatureId, returnTo?: (req: Request) => string | null) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const uid = sessionUserId(req);
    const r = await checkFeature(feature, uid);
    if (r.allowed === true) { (req as any).entitlementPlan = r.plan; return next(); }
    if (!("reason" in r)) return res.status(402).json(upgradeRequiredBody(feature, returnTo?.(req) ?? null)); // deny by default
    if (r.reason === "SIGNIN") return res.status(401).json({ code: "SIGNIN", message: "Please sign in — it's free." });
    if (r.reason === "ADMIN_ONLY") return res.status(403).json({ code: "FORBIDDEN", message: "Not allowed." });
    console.log(`[feature-access] ${feature} blocked userId=${uid} plan=${r.plan}`);
    return res.status(402).json(upgradeRequiredBody(feature, returnTo?.(req) ?? null));
  };
}
