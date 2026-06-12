"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireSupabasePro = exports.requirePaidAccess = exports.requireProAccess = exports.requireProPlan = exports.requireAnyPaidPlan = void 0;
exports.getAccessViolations = getAccessViolations;
const storage_1 = require("../storage");
const supabaseClient_1 = require("../supabaseClient");
const db_1 = require("../db");
// In-memory rotating audit buffer (last 500 violations)
const ACCESS_VIOLATIONS = [];
const MAX_VIOLATIONS = 500;
function logViolation(v) {
    if (ACCESS_VIOLATIONS.length >= MAX_VIOLATIONS)
        ACCESS_VIOLATIONS.shift();
    ACCESS_VIOLATIONS.push(v);
    console.warn(`[AccessControl] BLOCKED ${v.method} ${v.endpoint} — userId=${v.userId ?? "anon"} plan=${v.planId} reason="${v.reason}" ip=${v.ip} ts=${v.timestamp}`);
}
function getAccessViolations(limit = 100) {
    return ACCESS_VIOLATIONS.slice(-limit).reverse();
}
/**
 * requireAnyPaidPlan — blocks FREE users.
 * Requires an active, non-expired paid plan (trial, monthly, pro, or pro_referral).
 * Applies after isAuthenticated.
 *
 * 2026-06 hardening: previously read denormalized users.subscription_status +
 * users.plan, which DO NOT auto-update when end_date passes. An expired KES 99
 * trial user could keep hitting Pro endpoints for hours until something else
 * triggered the lazy plan sync. Now calls storage.getUserPlan() which does
 * the fresh end_date check + auto-downgrades to "free" on expiry.
 */
const requireAnyPaidPlan = async (req, res, next) => {
    const userId = req.user?.claims?.sub;
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
        // ── Admin bypass ────────────────────────────────────────────────────────
        // Admins (is_admin=true OR role in ADMIN/SUPER_ADMIN) get free access.
        const { rows } = await db_1.pool.query(`SELECT is_admin, role FROM users WHERE id = $1`, [userId]);
        const user = rows[0];
        if (user && (user.is_admin === true || user.role === "ADMIN" || user.role === "SUPER_ADMIN")) {
            req.planId = "pro";
            return next();
        }
        // ── Fresh plan check (does end_date expiration enforcement) ─────────────
        const planId = await storage_1.storage.getUserPlan(userId);
        const PAID_PLANS = ["trial", "monthly", "pro", "pro_referral", "basic", "yearly"];
        if (!PAID_PLANS.includes(planId)) {
            logViolation({ userId, endpoint, method, ip, reason: "no_active_plan", planId, timestamp: ts });
            return res.status(403).json({
                error: "Upgrade required",
                message: "🚫 This is a premium feature. Upgrade to unlock full access.",
                upgradeRequired: true,
                currentPlan: planId,
                upgradeUrl: "/pricing",
            });
        }
        req.planId = planId;
        next();
    }
    catch (err) {
        console.error("[requireAnyPaidPlan] Error checking plan:", err);
        return res.status(500).json({ error: "Server error", message: "Could not verify subscription." });
    }
};
exports.requireAnyPaidPlan = requireAnyPaidPlan;
/**
 * requireProPlan — blocks FREE and BASIC users.
 * Requires planId = "pro" only.
 * Also exported as requireProAccess (semantic alias).
 */
const requireProPlan = async (req, res, next) => {
    const userId = req.user?.claims?.sub;
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
        // ── Admin bypass — admins always count as Pro ───────────────────────────
        const { rows } = await db_1.pool.query(`SELECT is_admin, role FROM users WHERE id = $1`, [userId]);
        const user = rows[0];
        if (user && (user.is_admin === true || user.role === "ADMIN" || user.role === "SUPER_ADMIN")) {
            req.planId = "pro";
            return next();
        }
        // ── Fresh plan check with end_date expiration enforcement ───────────────
        const planId = await storage_1.storage.getUserPlan(userId);
        // 2026-06: requireProPlan now blocks trial users from Pro-only endpoints
        // explicitly. Trial = quick taste, monthly + pro = full access.
        const PRO_TIER_PLANS = ["monthly", "pro", "pro_referral", "yearly"];
        if (!PRO_TIER_PLANS.includes(planId)) {
            const reason = planId === "free" ? "free_plan" : planId === "trial" ? "trial_blocked_from_pro" : "insufficient_plan";
            logViolation({ userId, endpoint, method, ip, reason, planId, timestamp: ts });
            return res.status(403).json({
                error: "Pro plan required",
                message: planId === "trial"
                    ? "🚫 This feature needs Monthly or Yearly access. Upgrade to unlock."
                    : "🚫 This feature requires an active Monthly or Yearly plan. Upgrade to unlock unlimited access.",
                upgradeRequired: true,
                currentPlan: planId,
                upgradeUrl: "/pricing",
            });
        }
        req.planId = planId;
        next();
    }
    catch (err) {
        console.error("[requireProPlan] Error checking plan:", err);
        return res.status(500).json({ error: "Server error", message: "Could not verify subscription." });
    }
};
exports.requireProPlan = requireProPlan;
/**
 * requireProAccess — semantic alias for requireProPlan.
 * Use this name when the context is "gating a premium feature" rather than "requiring a plan tier".
 *
 * Usage: app.get("/api/some-premium-feature", isAuthenticated, requireProAccess, handler)
 */
exports.requireProAccess = exports.requireProPlan;
/**
 * requirePaidAccess — semantic alias for requireAnyPaidPlan.
 * Blocks FREE users; allows PRO (and legacy BASIC for backward compat).
 */
exports.requirePaidAccess = exports.requireAnyPaidPlan;
/**
 * requireSupabasePro — Supabase-backed PRO gate.
 * Checks subscriptions.status = 'active' AND expires_at > now() in Supabase.
 * Use this when Supabase is the source of truth (e.g. cross-platform checks).
 * Falls back gracefully to 403 if Supabase is unreachable.
 *
 * Usage: app.get("/api/pro-feature", isAuthenticated, requireSupabasePro, handler)
 */
const requireSupabasePro = async (req, res, next) => {
    const userId = req.user?.claims?.sub;
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
        const pro = await (0, supabaseClient_1.isUserPro)(userId);
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
    }
    catch (err) {
        console.error("[requireSupabasePro] Error checking Supabase plan:", err);
        return res.status(500).json({ error: "Server error", message: "Could not verify subscription." });
    }
};
exports.requireSupabasePro = requireSupabasePro;
