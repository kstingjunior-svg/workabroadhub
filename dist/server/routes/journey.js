"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerJourneyRoutes = registerJourneyRoutes;
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const schema_1 = require("@shared/schema");
const country_journey_steps_1 = require("@shared/country-journey-steps");
const replitAuth_1 = require("../replit_integrations/auth/replitAuth");
function getUserId(req) {
    return req.user?.claims?.sub ?? req.user?.id ?? req.session?.customUserId;
}
function validCountryCode(code) {
    const c = (code || "").toUpperCase();
    return country_journey_steps_1.SUPPORTED_JOURNEY_COUNTRIES.some((x) => x.code === c);
}
function registerJourneyRoutes(app) {
    // ── List all journeys for the current user ────────────────────────────────
    app.get("/api/journey", replitAuth_1.isAuthenticated, async (req, res) => {
        try {
            const userId = getUserId(req);
            if (!userId)
                return res.status(401).json({ message: "Unauthorized" });
            const rows = await db_1.db
                .select()
                .from(schema_1.userCountryJourneys)
                .where((0, drizzle_orm_1.eq)(schema_1.userCountryJourneys.userId, userId));
            // Enrich with progress percentage so the home dashboard widget can render
            // "75% complete · 9 of 12 steps" without doing the math client-side.
            const enriched = rows.map((r) => {
                const allSteps = (0, country_journey_steps_1.getJourneySteps)(r.countryCode);
                const completed = Array.isArray(r.completedSteps) ? r.completedSteps : [];
                const total = allSteps.length;
                const done = completed.length;
                return {
                    ...r,
                    totalSteps: total,
                    completedCount: done,
                    progressPercent: total > 0 ? Math.round((done / total) * 100) : 0,
                };
            });
            res.json(enriched);
        }
        catch (err) {
            console.error("[journey][list]", err?.message);
            res.status(500).json({ message: "Failed to load journeys" });
        }
    });
    // ── Get full state for ONE country (the /journey/:country page) ───────────
    app.get("/api/journey/:countryCode", replitAuth_1.isAuthenticated, async (req, res) => {
        try {
            const userId = getUserId(req);
            if (!userId)
                return res.status(401).json({ message: "Unauthorized" });
            const code = (req.params.countryCode || "").toUpperCase();
            if (!validCountryCode(code)) {
                return res.status(400).json({ message: `Country "${code}" not supported yet.` });
            }
            const steps = (0, country_journey_steps_1.getJourneySteps)(code);
            const country = country_journey_steps_1.SUPPORTED_JOURNEY_COUNTRIES.find((c) => c.code === code);
            const [row] = await db_1.db
                .select()
                .from(schema_1.userCountryJourneys)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userCountryJourneys.userId, userId), (0, drizzle_orm_1.eq)(schema_1.userCountryJourneys.countryCode, code)))
                .limit(1);
            const completed = Array.isArray(row?.completedSteps) ? row.completedSteps : [];
            res.json({
                country,
                steps: steps.map((s) => ({ ...s, completed: completed.includes(s.key) })),
                progress: {
                    totalSteps: steps.length,
                    completedCount: completed.length,
                    progressPercent: steps.length > 0 ? Math.round((completed.length / steps.length) * 100) : 0,
                },
                stage: row?.stage ?? null,
                startedAt: row?.startedAt ?? null,
                lastTouchedAt: row?.lastTouchedAt ?? null,
            });
        }
        catch (err) {
            console.error("[journey][get]", err?.message);
            res.status(500).json({ message: "Failed to load journey" });
        }
    });
    // ── Start a journey (creates the row if it doesn't exist) ─────────────────
    app.post("/api/journey/:countryCode/start", replitAuth_1.isAuthenticated, async (req, res) => {
        try {
            const userId = getUserId(req);
            if (!userId)
                return res.status(401).json({ message: "Unauthorized" });
            const code = (req.params.countryCode || "").toUpperCase();
            if (!validCountryCode(code)) {
                return res.status(400).json({ message: `Country "${code}" not supported yet.` });
            }
            // ON CONFLICT DO NOTHING means re-starting is a no-op rather than wiping progress
            await db_1.db
                .insert(schema_1.userCountryJourneys)
                .values({
                userId,
                countryCode: code,
                completedSteps: [],
                stage: schema_1.JOURNEY_STAGES.PREPARING,
            })
                .onConflictDoNothing({ target: [schema_1.userCountryJourneys.userId, schema_1.userCountryJourneys.countryCode] });
            // Always update lastTouchedAt so the home widget bumps to the top
            await db_1.db
                .update(schema_1.userCountryJourneys)
                .set({ lastTouchedAt: new Date(), updatedAt: new Date() })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userCountryJourneys.userId, userId), (0, drizzle_orm_1.eq)(schema_1.userCountryJourneys.countryCode, code)));
            res.json({ ok: true });
        }
        catch (err) {
            console.error("[journey][start]", err?.message);
            res.status(500).json({ message: "Failed to start journey" });
        }
    });
    // ── Toggle a single step's completion ─────────────────────────────────────
    app.post("/api/journey/:countryCode/steps/:stepKey", replitAuth_1.isAuthenticated, async (req, res) => {
        try {
            const userId = getUserId(req);
            if (!userId)
                return res.status(401).json({ message: "Unauthorized" });
            const code = (req.params.countryCode || "").toUpperCase();
            const stepKey = String(req.params.stepKey || "");
            if (!validCountryCode(code)) {
                return res.status(400).json({ message: `Country "${code}" not supported yet.` });
            }
            const validKeys = new Set((0, country_journey_steps_1.getJourneySteps)(code).map((s) => s.key));
            if (!validKeys.has(stepKey)) {
                return res.status(400).json({ message: `Step "${stepKey}" is not part of the ${code} journey.` });
            }
            // Fetch existing — auto-create the row if it doesn't exist, so the user
            // doesn't have to call /start explicitly before ticking their first step.
            const [existing] = await db_1.db
                .select()
                .from(schema_1.userCountryJourneys)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userCountryJourneys.userId, userId), (0, drizzle_orm_1.eq)(schema_1.userCountryJourneys.countryCode, code)))
                .limit(1);
            const prior = Array.isArray(existing?.completedSteps) ? existing.completedSteps : [];
            // Body { done: true|false } controls toggle direction; default = flip
            const desired = typeof req.body?.done === "boolean"
                ? req.body.done
                : !prior.includes(stepKey);
            const next = desired
                ? Array.from(new Set([...prior, stepKey]))
                : prior.filter((k) => k !== stepKey);
            if (existing) {
                await db_1.db
                    .update(schema_1.userCountryJourneys)
                    .set({ completedSteps: next, lastTouchedAt: new Date(), updatedAt: new Date() })
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userCountryJourneys.userId, userId), (0, drizzle_orm_1.eq)(schema_1.userCountryJourneys.countryCode, code)));
            }
            else {
                await db_1.db.insert(schema_1.userCountryJourneys).values({
                    userId,
                    countryCode: code,
                    completedSteps: next,
                    stage: schema_1.JOURNEY_STAGES.PREPARING,
                });
            }
            res.json({ ok: true, completedSteps: next, done: desired });
        }
        catch (err) {
            console.error("[journey][toggle]", err?.message);
            res.status(500).json({ message: "Failed to update step" });
        }
    });
    // ── Update stage (preparing / applying / interview / hired / departed) ────
    app.post("/api/journey/:countryCode/stage", replitAuth_1.isAuthenticated, async (req, res) => {
        try {
            const userId = getUserId(req);
            if (!userId)
                return res.status(401).json({ message: "Unauthorized" });
            const code = (req.params.countryCode || "").toUpperCase();
            const stage = String(req.body?.stage || "");
            const validStages = Object.values(schema_1.JOURNEY_STAGES);
            if (!validStages.includes(stage)) {
                return res.status(400).json({ message: `Stage must be one of: ${validStages.join(", ")}` });
            }
            const result = await db_1.db
                .update(schema_1.userCountryJourneys)
                .set({ stage, lastTouchedAt: new Date(), updatedAt: new Date() })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userCountryJourneys.userId, userId), (0, drizzle_orm_1.eq)(schema_1.userCountryJourneys.countryCode, code)))
                .returning();
            if (result.length === 0) {
                // No journey row yet — create one
                await db_1.db.insert(schema_1.userCountryJourneys).values({
                    userId,
                    countryCode: code,
                    completedSteps: [],
                    stage,
                });
            }
            res.json({ ok: true, stage });
        }
        catch (err) {
            console.error("[journey][stage]", err?.message);
            res.status(500).json({ message: "Failed to update stage" });
        }
    });
    // ── Abandon a journey ─────────────────────────────────────────────────────
    app.delete("/api/journey/:countryCode", replitAuth_1.isAuthenticated, async (req, res) => {
        try {
            const userId = getUserId(req);
            if (!userId)
                return res.status(401).json({ message: "Unauthorized" });
            const code = (req.params.countryCode || "").toUpperCase();
            await db_1.db
                .delete(schema_1.userCountryJourneys)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userCountryJourneys.userId, userId), (0, drizzle_orm_1.eq)(schema_1.userCountryJourneys.countryCode, code)));
            res.json({ ok: true });
        }
        catch (err) {
            console.error("[journey][delete]", err?.message);
            res.status(500).json({ message: "Failed to delete journey" });
        }
    });
    console.log("[journey] Routes registered: GET/POST /api/journey + nested step + stage endpoints");
}
