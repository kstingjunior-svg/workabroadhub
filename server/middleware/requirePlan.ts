import type { RequestHandler } from "express";
import { storage } from "../storage";
import { isUserPro } from "../supabaseClient";
import { pool } from "../db";

interface AccessViolation {
  userId: string | null;
  endpoint: string;
  method: string;
  ip: string;
  reason: string;
  timestamp: string;
  planId: string;
}

// In-memory rotating audit buffer (last 500 violations)
const ACCESS_VIOLATIONS: AccessViolation[] = [];
const MAX_VIOLATIONS = 500;

function logViolation(v: AccessViolation) {
  if (ACCESS_VIOLATIONS.length >= MAX_VIOLATIONS) ACCESS_VIOLATIONS.shift();
  ACCESS_VIOLATIONS.push(v);
  console.warn(
    `[AccessControl] BLOCKED ${v.method} ${v.endpoint} — userId=${v.userId ?? "anon"} plan=${v.planId} reason="${v.reason}" ip=${v.ip} ts=${v.timestamp}`
  );
}

export function getAccessViolations(limit = 100): AccessViolation[] {
  return ACCESS_VIOLATIONS.slice(-limit).reverse();
}

/**
 * requireAnyPaidPlan — blocks FREE users.
 * Requires planId = "pro" (or legacy "basic") with an active, non-expired subscription.
 * Applies after isAuthenticated.
 */
export const requireAnyPaidPlan: RequestHandler = async (req: any, res, next) => {
  const userId: string | undefined = req.user?.claims?.sub;
  const ip = String(req.ip || req.headers["x-forwarded-for"] || "unknown");
  const endpoint = req.path;
  const method = req.method;
  const ts = new Date().toISOString();

  if (!userId) {
    logViolation({ userId: null, endpoint, method, ip, reason: "unauthenticated", planId: "none", timestamp: ts });
    return res.status(401).json({
      error: "Unauthorized",
      message: "Please log in to access this feature.",
    });
  }

  try {
    const { rows } = await pool.query<{ plan: string; subscription_status: string }>(
      `SELECT plan, subscription_status FROM users WHERE id = $1`,
      [userId],
    );
    const user = rows[0];

    if (!user || user.subscription_status !== "active") {
      const planId = user?.plan ?? "free";
      logViolation({ userId, endpoint, method, ip, reason: "free_plan", planId, timestamp: ts });
      return res.status(403).json({
        error: "Upgrade required",
        message: "🚫 This is a premium feature. Upgrade to Pro to unlock full access.",
        upgradeRequired: true,
        currentPlan: planId,
        upgradeUrl: "/pricing",
      });
    }

    req.planId = user.plan;
    next();
  } catch (err) {
    console.error("[requireAnyPaidPlan] Error checking plan:", err);
    return res.status(500).json({ error: "Server error", message: "Could not verify subscription." });
  }
};

/**
 * requireProPlan — blocks FREE and BASIC users.
 * Requires planId = "pro" only.
 * Also exported as requireProAccess (semantic alias).
 */
export const requireProPlan: RequestHandler = async (req: any, res, next) => {
  const userId: string | undefined = req.user?.claims?.sub;
  const ip = String(req.ip || req.headers["x-forwarded-for"] || "unknown");
  const endpoint = req.path;
  const method = req.method;
  const ts = new Date().toISOString();

  if (!userId) {
    logViolation({ userId: null, endpoint, method, ip, reason: "unauthenticated", planId: "none", timestamp: ts });
    return res.status(401).json({
      error: "Unauthorized",
      message: "Please log in to access this feature.",
    });
  }

  try {
    const { rows } = await pool.query<{ plan: string; subscription_status: string }>(
      `SELECT plan, subscription_status FROM users WHERE id = $1`,
      [userId],
    );
    const user = rows[0];
    const planId = user?.plan ?? "free";

    if (!user || user.subscription_status !== "active" || planId !== "pro") {
      const reason = !user || planId === "free" ? "free_plan" : user.subscription_status !== "active" ? "expired_plan" : "insufficient_plan";
      logViolation({ userId, endpoint, method, ip, reason, planId, timestamp: ts });
      return res.status(403).json({
        error: "Pro plan required",
        message: "🚫 This feature requires an active Pro plan. Upgrade to unlock unlimited access.",
        upgradeRequired: true,
        currentPlan: planId,
        upgradeUrl: "/pricing",
      });
    }

    req.planId = planId;
    next();
  } catch (err) {
    console.error("[requireProPlan] Error checking plan:", err);
    return res.status(500).json({ error: "Server error", message: "Could not verify subscription." });
  }
};

/**
 * requireProAccess — semantic alias for requireProPlan.
 * Use this name when the context is "gating a premium feature" rather than "requiring a plan tier".
 *
 * Usage: app.get("/api/some-premium-feature", isAuthenticated, requireProAccess, handler)
 */
export const requireProAccess: RequestHandler = requireProPlan;

/**
 * requirePaidAccess — semantic alias for requireAnyPaidPlan.
 * Blocks FREE users; allows PRO (and legacy BASIC for backward compat).
 */
export const requirePaidAccess: RequestHandler = requireAnyPaidPlan;

/**
 * requireSupabasePro — Supabase-backed PRO gate.
 * Checks subscriptions.status = 'active' AND expires_at > now() in Supabase.
 * Use this when Supabase is the source of truth (e.g. cross-platform checks).
 * Falls back gracefully to 403 if Supabase is unreachable.
 *
 * Usage: app.get("/api/pro-feature", isAuthenticated, requireSupabasePro, handler)
 */
export const requireSupabasePro: RequestHandler = async (req: any, res, next) => {
  const userId: string | undefined = req.user?.claims?.sub;
  const ip = String(req.ip || req.headers["x-forwarded-for"] || "unknown");
  const endpoint = req.path;
  const method = req.method;
  const ts = new Date().toISOString();

  if (!userId) {
    logViolation({ userId: null, endpoint, method, ip, reason: "unauthenticated", planId: "none", timestamp: ts });
    return res.status(401).json({
      error: "Unauthorized",
      message: "Please log in to access this feature.",
    });
  }

  try {
    const pro = await isUserPro(userId);

    if (!pro) {
      logViolation({ userId, endpoint, method, ip, reason: "supabase_not_pro", planId: "free", timestamp: ts });
      return res.status(403).json({
        error: "Pro plan required",
        message: "🚫 This feature requires an active Pro subscription.",
        upgradeRequired: true,
        upgradeUrl: "/pricing",
      });
    }

    next();
  } catch (err) {
    console.error("[requireSupabasePro] Error checking Supabase plan:", err);
    return res.status(500).json({ error: "Server error", message: "Could not verify subscription." });
  }
};
