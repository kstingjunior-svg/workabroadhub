/**
 * paywall.ts — reusable plan-gate middleware.
 *
 * 2026-07 (production audit HIGH-4): premium-content protection is currently
 * per-endpoint by convention. Every new /tools/* route relies on the author
 * remembering to check `users.plan !== "free"` — one forgotten check leaks
 * a paid tool for free. This middleware centralizes the gate so it's
 * impossible to forget.
 *
 * Usage:
 *   import { requirePaidPlan } from "./middleware/paywall";
 *
 *   app.post("/api/tools/premium-thing",
 *     isAuthenticated,
 *     requirePaidPlan("basic"),        // "basic" | "pro" — minimum tier
 *     handler,
 *   );
 *
 * The middleware reads users.plan + user_subscriptions.status to determine
 * effective access, matching the resolution logic already used elsewhere in
 * the codebase.
 *
 * Order matters: MUST run AFTER isAuthenticated (needs req.user).
 */

import type { Request, Response, NextFunction } from "express";
import { pool } from "../db";

type Tier = "free" | "basic" | "pro";

const TIER_ORDER: Record<Tier, number> = {
  free:  0,
  basic: 1,
  pro:   2,
};

interface UserRow {
  id: string;
  plan: string | null;
  subscription_status: string | null;
}

/**
 * Cache resolved plan for the duration of a request to avoid double lookups
 * when multiple middleware layers ask the same question.
 */
function attachPlan(req: any, plan: Tier): void {
  req._resolvedPlan = plan;
}

function readCachedPlan(req: any): Tier | null {
  return (req._resolvedPlan as Tier | undefined) ?? null;
}

/**
 * Resolve a user's effective plan by combining:
 *   1. users.plan column (denormalized fast path)
 *   2. user_subscriptions.status (source of truth — only trust rows with status='active')
 *
 * Falls back to "free" on any lookup failure — deny by default is safer than
 * grant by default.
 */
export async function resolveUserPlan(userId: string): Promise<Tier> {
  try {
    // 1. Fast path — read denormalized column
    const userRes = await pool.query<UserRow>(
      `SELECT id, plan, subscription_status FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    );
    const user = userRes.rows[0];
    if (!user) return "free";

    // 2. Cross-check against user_subscriptions — the denormalized column can
    //    lag after an expiry; the subscription row is the source of truth.
    const subRes = await pool.query<{ plan: string }>(
      `SELECT plan FROM user_subscriptions
        WHERE user_id = $1 AND status = 'active'
        ORDER BY created_at DESC
        LIMIT 1`,
      [userId],
    );
    const activeSubPlan = subRes.rows[0]?.plan;

    // Use the higher of the two — protects against both lag directions
    // (denorm column stale one way OR user_subscriptions stale the other).
    const plansToConsider: Tier[] = [];
    if (isTier(user.plan))     plansToConsider.push(user.plan);
    if (isTier(activeSubPlan)) plansToConsider.push(activeSubPlan);

    if (plansToConsider.length === 0) return "free";

    return plansToConsider.reduce((max, p) => TIER_ORDER[p] > TIER_ORDER[max] ? p : max);
  } catch (err: any) {
    console.warn(`[paywall] plan resolution failed for user ${userId}:`, err?.message);
    return "free"; // deny by default
  }
}

function isTier(v: unknown): v is Tier {
  return v === "free" || v === "basic" || v === "pro";
}

/**
 * Middleware factory. Rejects the request with 402 Payment Required if the
 * authed user's plan is below `minTier`.
 *
 * MUST be preceded by isAuthenticated.
 */
export function requirePaidPlan(minTier: Exclude<Tier, "free"> = "basic") {
  return async (req: any, res: Response, next: NextFunction) => {
    const userId: string | undefined = req.user?.claims?.sub ?? req.user?.id;
    if (!userId) {
      return res.status(401).json({
        message: "Please sign in to use this feature.",
        code: "AUTH_REQUIRED",
      });
    }

    const cached = readCachedPlan(req);
    const plan = cached ?? (await resolveUserPlan(userId));
    if (!cached) attachPlan(req, plan);

    if (TIER_ORDER[plan] >= TIER_ORDER[minTier]) return next();

    // Below minimum tier — return a client-actionable response.
    return res.status(402).json({
      message: minTier === "pro"
        ? "This is a Pro feature. Upgrade to Pro to unlock it — from KES 1,000/month."
        : "This tool requires an active plan. Upgrade from KES 99 to unlock it.",
      code: "PLAN_UPGRADE_REQUIRED",
      currentPlan: plan,
      requiredPlan: minTier,
      upgradeUrl: "/pricing",
    });
  };
}

/**
 * Non-blocking variant — attaches the resolved plan to req but never rejects.
 * Useful when a handler wants to CUSTOMIZE its response based on plan (e.g.
 * strip premium fields for free users) instead of hard-blocking.
 *
 * Usage:
 *   app.get("/api/tools/x", isAuthenticated, attachPlan(), (req, res) => {
 *     const plan = req._resolvedPlan; // "free" | "basic" | "pro"
 *     ...
 *   });
 */
export function attachResolvedPlan() {
  return async (req: any, _res: Response, next: NextFunction) => {
    const userId: string | undefined = req.user?.claims?.sub ?? req.user?.id;
    if (!userId) { req._resolvedPlan = "free"; return next(); }
    if (readCachedPlan(req)) return next();
    const plan = await resolveUserPlan(userId);
    attachPlan(req, plan);
    next();
  };
}
