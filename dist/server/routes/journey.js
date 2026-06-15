"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
/**
 * Postgres "relation does not exist" error — happens when the journey
 * migration hasn't been pushed to the live DB yet. We catch it and degrade
 * gracefully (empty list / null state) instead of 500ing.
 */
function isMissingTable(err) {
    return err?.code === "42P01"
        || /relation .* does not exist/i.test(String(err?.message || ""))
        || /user_country_journeys.*not.*exist/i.test(String(err?.message || ""));
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
            // 2026-06: if the journey table doesn't exist yet on this environment
            // (migration not pushed), respond with an empty list rather than a 500.
            // The client treats no-journeys-yet as "user can pick a country to start".
            if (isMissingTable(err)) {
                console.warn("[journey][list] user_country_journeys table missing — returning []");
                return res.json([]);
            }
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
                departureDate: row?.departureDate ?? null,
                startedAt: row?.startedAt ?? null,
                lastTouchedAt: row?.lastTouchedAt ?? null,
            });
        }
        catch (err) {
            if (isMissingTable(err)) {
                // Migration hasn't been pushed yet — render the country's roadmap as
                // if it were untouched so the page still works.
                const code = (req.params.countryCode || "").toUpperCase();
                const steps = (0, country_journey_steps_1.getJourneySteps)(code);
                const country = country_journey_steps_1.SUPPORTED_JOURNEY_COUNTRIES.find((c) => c.code === code);
                return res.json({
                    country,
                    steps: steps.map((s) => ({ ...s, completed: false })),
                    progress: { totalSteps: steps.length, completedCount: 0, progressPercent: 0 },
                    stage: null,
                    startedAt: null,
                    lastTouchedAt: null,
                });
            }
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
            if (isMissingTable(err)) {
                return res.status(503).json({ message: "Journey feature is being deployed — try again in a few minutes." });
            }
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
            // 2026-06 retention #7: pre-departure step keys are namespaced `pd_*`
            // and live in shared/pre-departure-steps.ts. We validate them against
            // that registry rather than the journey roadmap keys.
            const { getPreDepartureSteps } = await Promise.resolve().then(() => __importStar(require("@shared/pre-departure-steps")));
            const validKeys = new Set([
                ...(0, country_journey_steps_1.getJourneySteps)(code).map((s) => s.key),
                ...getPreDepartureSteps(code).map((s) => s.key),
            ]);
            if (!validKeys.has(stepKey)) {
                return res.status(400).json({ message: `Step "${stepKey}" is not part of the ${code} journey or pre-departure checklist.` });
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
            if (isMissingTable(err)) {
                return res.status(503).json({ message: "Journey feature is being deployed — try again in a few minutes." });
            }
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
            if (isMissingTable(err)) {
                return res.status(503).json({ message: "Journey feature is being deployed — try again in a few minutes." });
            }
            console.error("[journey][stage]", err?.message);
            res.status(500).json({ message: "Failed to update stage" });
        }
    });
    // ── Set departure date (Retention #7) ────────────────────────────────────
    // Body { departureDate: ISO8601 string | null }. Null clears the date.
    app.post("/api/journey/:countryCode/departure-date", replitAuth_1.isAuthenticated, async (req, res) => {
        try {
            const userId = getUserId(req);
            if (!userId)
                return res.status(401).json({ message: "Unauthorized" });
            const code = (req.params.countryCode || "").toUpperCase();
            if (!validCountryCode(code)) {
                return res.status(400).json({ message: `Country "${code}" not supported yet.` });
            }
            const rawDate = req.body?.departureDate;
            let departureDate = null;
            if (rawDate) {
                const parsed = new Date(String(rawDate));
                if (Number.isNaN(parsed.getTime())) {
                    return res.status(400).json({ message: "departureDate must be a valid ISO date" });
                }
                departureDate = parsed;
            }
            const result = await db_1.db
                .update(schema_1.userCountryJourneys)
                .set({ departureDate, lastTouchedAt: new Date(), updatedAt: new Date() })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userCountryJourneys.userId, userId), (0, drizzle_orm_1.eq)(schema_1.userCountryJourneys.countryCode, code)))
                .returning();
            if (result.length === 0) {
                // Create journey row if missing — preserves the "tap to start" UX
                await db_1.db.insert(schema_1.userCountryJourneys).values({
                    userId,
                    countryCode: code,
                    completedSteps: [],
                    stage: schema_1.JOURNEY_STAGES.HIRED,
                    departureDate,
                });
            }
            res.json({ ok: true, departureDate });
        }
        catch (err) {
            if (isMissingTable(err)) {
                return res.status(503).json({ message: "Journey feature is being deployed — try again in a few minutes." });
            }
            console.error("[journey][departure-date]", err?.message);
            res.status(500).json({ message: "Failed to set departure date" });
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
            if (isMissingTable(err)) {
                return res.status(503).json({ message: "Journey feature is being deployed — try again in a few minutes." });
            }
            console.error("[journey][delete]", err?.message);
            res.status(500).json({ message: "Failed to delete journey" });
        }
    });
    console.log("[journey] Routes registered: GET/POST /api/journey + nested step + stage endpoints");
}
