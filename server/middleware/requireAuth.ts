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

import type { RequestHandler } from "express";
import { db } from "../db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";

function getUserId(req: any): string | undefined {
  if ((req.session as any)?.customUserId) {
    return (req.session as any).customUserId as string;
  }
  if (req.isAuthenticated && req.isAuthenticated() && req.user?.claims?.sub) {
    return req.user.claims.sub as string;
  }
  return undefined;
}

function isHtmlRequest(req: any): boolean {
  return !!(req.headers.accept && req.headers.accept.includes("text/html"));
}

export const requireAuth: RequestHandler = async (req: any, res, next) => {
  const userId = getUserId(req);

  if (!userId) {
    if (isHtmlRequest(req)) {
      const redirect = encodeURIComponent(req.originalUrl);
      return res.redirect(`/?redirect=${redirect}`);
    }
    return res.status(401).json({
      error: "Unauthorized",
      message: "You must be signed in to access this resource.",
    });
  }

  try {
    const [user] = await db
      .select({ id: users.id, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      if (isHtmlRequest(req)) {
        return res.redirect("/?redirect=" + encodeURIComponent(req.originalUrl));
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
  } catch (err: any) {
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
