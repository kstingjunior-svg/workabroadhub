"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBookmarkRoutes = registerBookmarkRoutes;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const schema_1 = require("@shared/schema");
const replitAuth_1 = require("../replit_integrations/auth/replitAuth");
const VALID_TYPES = new Set(["visa_job", "agency_job", "portal", "service", "country"]);
function getUserId(req) {
    return req.user?.claims?.sub ?? req.user?.id ?? req.session?.customUserId;
}
function isMissingTable(err) {
    return err?.code === "42P01"
        || /relation .* does not exist/i.test(String(err?.message || ""));
}
function registerBookmarkRoutes(app) {
    // ── List all bookmarks for the current user ───────────────────────────
    app.get("/api/bookmarks", replitAuth_1.isAuthenticated, async (req, res) => {
        try {
            const userId = getUserId(req);
            if (!userId)
                return res.status(401).json({ message: "Unauthorized" });
            const typeFilter = String(req.query.type ?? "").trim();
            let q = db_1.db.select().from(schema_1.userBookmarks).where((0, drizzle_orm_1.eq)(schema_1.userBookmarks.userId, userId)).$dynamic();
            if (typeFilter && VALID_TYPES.has(typeFilter)) {
                q = db_1.db
                    .select()
                    .from(schema_1.userBookmarks)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userBookmarks.userId, userId), (0, drizzle_orm_1.eq)(schema_1.userBookmarks.itemType, typeFilter)))
                    .$dynamic();
            }
            const rows = await q.orderBy((0, drizzle_orm_1.desc)(schema_1.userBookmarks.createdAt));
            res.json(rows);
        }
        catch (err) {
            if (isMissingTable(err)) {
                console.warn("[bookmarks][list] table missing — returning []");
                return res.json([]);
            }
            console.error("[bookmarks][list]", err?.message);
            res.status(500).json({ message: "Failed to list bookmarks" });
        }
    });
    // ── Is a specific item bookmarked? ─────────────────────────────────────
    app.get("/api/bookmarks/check", replitAuth_1.isAuthenticated, async (req, res) => {
        try {
            const userId = getUserId(req);
            if (!userId)
                return res.status(401).json({ message: "Unauthorized" });
            const itemType = String(req.query.type ?? "").trim();
            const itemId = String(req.query.itemId ?? "").trim();
            if (!VALID_TYPES.has(itemType) || !itemId) {
                return res.status(400).json({ message: "type and itemId required" });
            }
            const [row] = await db_1.db
                .select({ id: schema_1.userBookmarks.id })
                .from(schema_1.userBookmarks)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userBookmarks.userId, userId), (0, drizzle_orm_1.eq)(schema_1.userBookmarks.itemType, itemType), (0, drizzle_orm_1.eq)(schema_1.userBookmarks.itemId, itemId)))
                .limit(1);
            res.json({ bookmarked: !!row, id: row?.id ?? null });
        }
        catch (err) {
            if (isMissingTable(err))
                return res.json({ bookmarked: false, id: null });
            console.error("[bookmarks][check]", err?.message);
            res.status(500).json({ message: "Failed to check bookmark" });
        }
    });
    // ── Create (idempotent: re-saving same item is a no-op) ────────────────
    app.post("/api/bookmarks", replitAuth_1.isAuthenticated, async (req, res) => {
        try {
            const userId = getUserId(req);
            if (!userId)
                return res.status(401).json({ message: "Unauthorized" });
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
            const [row] = await db_1.db
                .insert(schema_1.userBookmarks)
                .values({
                userId,
                itemType: String(itemType),
                itemId: itemId.slice(0, 200),
                title: title.slice(0, 300),
                subtitle: typeof subtitle === "string" ? subtitle.slice(0, 300) : null,
                countryCode: typeof countryCode === "string" ? countryCode.toUpperCase().slice(0, 8) : null,
                href: typeof href === "string" ? href.slice(0, 500) : null,
                meta: meta && typeof meta === "object" ? meta : null,
            })
                .onConflictDoUpdate({
                target: [schema_1.userBookmarks.userId, schema_1.userBookmarks.itemType, schema_1.userBookmarks.itemId],
                // Refresh title / subtitle / href / meta on re-save so updates aren't lost.
                set: {
                    title: title.slice(0, 300),
                    subtitle: typeof subtitle === "string" ? subtitle.slice(0, 300) : null,
                    countryCode: typeof countryCode === "string" ? countryCode.toUpperCase().slice(0, 8) : null,
                    href: typeof href === "string" ? href.slice(0, 500) : null,
                    meta: meta && typeof meta === "object" ? meta : null,
                },
            })
                .returning();
            res.json({ ok: true, bookmark: row });
        }
        catch (err) {
            if (isMissingTable(err)) {
                return res.status(503).json({ message: "Bookmarks feature is being deployed — try again in a few minutes." });
            }
            console.error("[bookmarks][create]", err?.message);
            res.status(500).json({ message: "Failed to save bookmark" });
        }
    });
    // ── Delete by row ID ────────────────────────────────────────────────────
    app.delete("/api/bookmarks/:id", replitAuth_1.isAuthenticated, async (req, res) => {
        try {
            const userId = getUserId(req);
            if (!userId)
                return res.status(401).json({ message: "Unauthorized" });
            const id = String(req.params.id || "");
            await db_1.db
                .delete(schema_1.userBookmarks)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userBookmarks.userId, userId), (0, drizzle_orm_1.eq)(schema_1.userBookmarks.id, id)));
            res.json({ ok: true });
        }
        catch (err) {
            if (isMissingTable(err))
                return res.json({ ok: true });
            console.error("[bookmarks][delete]", err?.message);
            res.status(500).json({ message: "Failed to remove bookmark" });
        }
    });
    // ── Delete by underlying item (idempotent unsave from cards) ───────────
    app.delete("/api/bookmarks/by-item", replitAuth_1.isAuthenticated, async (req, res) => {
        try {
            const userId = getUserId(req);
            if (!userId)
                return res.status(401).json({ message: "Unauthorized" });
            const itemType = String(req.body?.itemType ?? "").trim();
            const itemId = String(req.body?.itemId ?? "").trim();
            if (!VALID_TYPES.has(itemType) || !itemId) {
                return res.status(400).json({ message: "itemType and itemId required" });
            }
            await db_1.db
                .delete(schema_1.userBookmarks)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userBookmarks.userId, userId), (0, drizzle_orm_1.eq)(schema_1.userBookmarks.itemType, itemType), (0, drizzle_orm_1.eq)(schema_1.userBookmarks.itemId, itemId)));
            res.json({ ok: true });
        }
        catch (err) {
            if (isMissingTable(err))
                return res.json({ ok: true });
            console.error("[bookmarks][delete-by-item]", err?.message);
            res.status(500).json({ message: "Failed to remove bookmark" });
        }
    });
    console.log("[bookmarks] Routes registered: /api/bookmarks (list/check/create/delete)");
}
