"use strict";
// @ts-nocheck
/**
 * requireAuth — session-based auth guard for Express routes.
 *
 * Mirrors the Firebase Admin `requireAuth` pattern:
 *   - HTML/page requests → redirect to /?redirect=<originalUrl>
 *   - API requests       → 401 JSON { error, message }
 *
 * Also validates the user record is active in the database so a deactivated
 * account cannot continue using a live session.
 *
 * Usage:
 *   import { requireAuth } from "./middleware/requireAuth";
 *   app.get("/api/user/documents", requireAuth, handler);
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = void 0;
const db_1 = require("../db");
const auth_1 = require("@shared/models/auth");
const drizzle_orm_1 = require("drizzle-orm");
const security_guard_1 = require("../lib/security-guard");
function getUserId(req) {
    if (req.session?.customUserId) {
        return req.session.customUserId;
    }
    if (req.isAuthenticated && req.isAuthenticated() && req.user?.claims?.sub) {
        return req.user.claims.sub;
    }
    return undefined;
}
function isHtmlRequest(req) {
    return !!(req.headers.accept && req.headers.accept.includes("text/html"));
}
/**
 * Build a safe `/?redirect=...` URL. Validates req.originalUrl via
 * safeRedirectPath — defence against an attacker crafting a request whose
 * `Host` or proxy headers cause originalUrl to contain a foreign host. Should
 * never happen with Express's defaults, but cheap insurance.
 */
function buildLoginRedirect(req) {
    const safe = (0, security_guard_1.safeRedirectPath)(req.originalUrl, "/");
    return `/?redirect=${encodeURIComponent(safe)}`;
}
const requireAuth = async (req, res, next) => {
    const userId = getUserId(req);
    if (!userId) {
        if (isHtmlRequest(req)) {
            return res.redirect(buildLoginRedirect(req));
        }
        return res.status(401).json({
            error: "Unauthorized",
            message: "You must be signed in to access this resource.",
        });
    }
    try {
        const [user] = await db_1.db
            .select({ id: auth_1.users.id, isActive: auth_1.users.isActive })
            .from(auth_1.users)
            .where((0, drizzle_orm_1.eq)(auth_1.users.id, userId));
        if (!user) {
            if (isHtmlRequest(req)) {
                return res.redirect(buildLoginRedirect(req));
            }
            return res.status(401).json({
                error: "Unauthorized",
                message: "User account not found.",
            });
        }
        if (!user.isActive) {
            if (isHtmlRequest(req)) {
                return res.redirect("/");
            }
            return res.status(403).json({
                error: "Forbidden",
                message: "Your account has been deactivated. Please contact support.",
            });
        }
        req.user = req.user ?? { claims: { sub: userId } };
        next();
    }
    catch (err) {
        console.error("[requireAuth] DB check failed:", err?.message ?? err);
        if (isHtmlRequest(req)) {
            return res.redirect("/");
        }
        return res.status(500).json({
            error: "Server error",
            message: "Authentication check failed. Please try again.",
        });
    }
};
exports.requireAuth = requireAuth;
