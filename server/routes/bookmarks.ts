/**
 * Bookmarks API — save / unsave / list any job, portal, or service.
 *
 * Endpoints
 *   GET    /api/bookmarks                  — list all bookmarks for current user
 *   GET    /api/bookmarks/check            — ?type=X&itemId=Y → { bookmarked: true|false, id?: string }
 *   POST   /api/bookmarks                  — body: { itemType, itemId, title, subtitle?, countryCode?, href?, meta? }
 *   DELETE /api/bookmarks/:id              — by bookmark row ID
 *   DELETE /api/bookmarks/by-item          — body: { itemType, itemId } → idempotent unsave
 *
 * Graceful fallback: if the user_bookmarks table doesn't exist yet (migration
 * not pushed), reads return [] and writes return 503 with a friendly message —
 * never 500.
 *
 * 2026-06 retention #5.
 */
import type { Express, Response } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import { userBookmarks } from "@shared/schema";
import { isAuthenticated } from "../replit_integrations/auth/replitAuth";

const VALID_TYPES = new Set(["visa_job", "agency_job", "portal", "service", "country"]);

function getUserId(req: any): string | undefined {
  return req.user?.claims?.sub ?? req.user?.id ?? req.session?.customUserId;
}

function isMissingTable(err: any): boolean {
  return err?.code === "42P01"
      || /relation .* does not exist/i.test(String(err?.message || ""));
}

export function registerBookmarkRoutes(app: Express): void {
  // ── List all bookmarks for the current user ───────────────────────────
  app.get("/api/bookmarks", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const typeFilter = String(req.query.type ?? "").trim();
      let q = db.select().from(userBookmarks).where(eq(userBookmarks.userId, userId)).$dynamic();
      if (typeFilter && VALID_TYPES.has(typeFilter)) {
        q = db
          .select()
          .from(userBookmarks)
          .where(and(eq(userBookmarks.userId, userId), eq(userBookmarks.itemType, typeFilter)))
          .$dynamic();
      }
      const rows = await q.orderBy(desc(userBookmarks.createdAt));
      res.json(rows);
    } catch (err: any) {
      if (isMissingTable(err)) {
        console.warn("[bookmarks][list] table missing — returning []");
        return res.json([]);
      }
      console.error("[bookmarks][list]", err?.message);
      res.status(500).json({ message: "Failed to list bookmarks" });
    }
  });

  // ── Is a specific item bookmarked? ─────────────────────────────────────
  app.get("/api/bookmarks/check", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const itemType = String(req.query.type ?? "").trim();
      const itemId   = String(req.query.itemId ?? "").trim();
      if (!VALID_TYPES.has(itemType) || !itemId) {
        return res.status(400).json({ message: "type and itemId required" });
      }
      const [row] = await db
        .select({ id: userBookmarks.id })
        .from(userBookmarks)
        .where(and(
          eq(userBookmarks.userId, userId),
          eq(userBookmarks.itemType, itemType),
          eq(userBookmarks.itemId, itemId),
        ))
        .limit(1);
      res.json({ bookmarked: !!row, id: row?.id ?? null });
    } catch (err: any) {
      if (isMissingTable(err)) return res.json({ bookmarked: false, id: null });
      console.error("[bookmarks][check]", err?.message);
      res.status(500).json({ message: "Failed to check bookmark" });
    }
  });

  // ── Create (idempotent: re-saving same item is a no-op) ────────────────
  app.post("/api/bookmarks", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const { itemType, itemId, title, subtitle, countryCode, href, meta } = req.body ?? {};
      if (!VALID_TYPES.has(String(itemType))) {
        return res.status(400).json({ message: `itemType must be one of: ${[...VALID_TYPES].join(", ")}` });
      }
      if (!itemId || typeof itemId !== "string") {
        return res.status(400).json({ message: "itemId required" });
      }
      if (!title || typeof title !== "string") {
        return res.status(400).json({ message: "title required" });
      }
      const [row] = await db
        .insert(userBookmarks)
        .values({
          userId,
          itemType:    String(itemType),
          itemId:      itemId.slice(0, 200),
          title:       title.slice(0, 300),
          subtitle:    typeof subtitle === "string" ? subtitle.slice(0, 300) : null,
          countryCode: typeof countryCode === "string" ? countryCode.toUpperCase().slice(0, 8) : null,
          href:        typeof href === "string" ? href.slice(0, 500) : null,
          meta:        meta && typeof meta === "object" ? meta : null,
        })
        .onConflictDoUpdate({
          target: [userBookmarks.userId, userBookmarks.itemType, userBookmarks.itemId],
          // Refresh title / subtitle / href / meta on re-save so updates aren't lost.
          set: {
            title:       title.slice(0, 300),
            subtitle:    typeof subtitle === "string" ? subtitle.slice(0, 300) : null,
            countryCode: typeof countryCode === "string" ? countryCode.toUpperCase().slice(0, 8) : null,
            href:        typeof href === "string" ? href.slice(0, 500) : null,
            meta:        meta && typeof meta === "object" ? meta : null,
          },
        })
        .returning();
      res.json({ ok: true, bookmark: row });
    } catch (err: any) {
      if (isMissingTable(err)) {
        return res.status(503).json({ message: "Bookmarks feature is being deployed — try again in a few minutes." });
      }
      console.error("[bookmarks][create]", err?.message);
      res.status(500).json({ message: "Failed to save bookmark" });
    }
  });

  // ── Delete by row ID ────────────────────────────────────────────────────
  app.delete("/api/bookmarks/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const id = String(req.params.id || "");
      await db
        .delete(userBookmarks)
        .where(and(eq(userBookmarks.userId, userId), eq(userBookmarks.id, id)));
      res.json({ ok: true });
    } catch (err: any) {
      if (isMissingTable(err)) return res.json({ ok: true });
      console.error("[bookmarks][delete]", err?.message);
      res.status(500).json({ message: "Failed to remove bookmark" });
    }
  });

  // ── Delete by underlying item (idempotent unsave from cards) ───────────
  app.delete("/api/bookmarks/by-item", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const itemType = String(req.body?.itemType ?? "").trim();
      const itemId   = String(req.body?.itemId ?? "").trim();
      if (!VALID_TYPES.has(itemType) || !itemId) {
        return res.status(400).json({ message: "itemType and itemId required" });
      }
      await db
        .delete(userBookmarks)
        .where(and(
          eq(userBookmarks.userId, userId),
          eq(userBookmarks.itemType, itemType),
          eq(userBookmarks.itemId, itemId),
        ));
      res.json({ ok: true });
    } catch (err: any) {
      if (isMissingTable(err)) return res.json({ ok: true });
      console.error("[bookmarks][delete-by-item]", err?.message);
      res.status(500).json({ message: "Failed to remove bookmark" });
    }
  });

  console.log("[bookmarks] Routes registered: /api/bookmarks (list/check/create/delete)");
}
