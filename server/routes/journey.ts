/**
 * Country Journey API — per-user, per-country progress tracking.
 *
 * Endpoints
 *   GET  /api/journey                                 — list ALL of a user's active journeys
 *   GET  /api/journey/:countryCode                    — full state for ONE country (incl. step list)
 *   POST /api/journey/:countryCode/start              — begin a journey (creates row)
 *   POST /api/journey/:countryCode/steps/:stepKey     — toggle completion of a single step
 *   POST /api/journey/:countryCode/stage              — update stage label (preparing/applying/...)
 *   DELETE /api/journey/:countryCode                  — abandon a journey
 *
 * 2026-06: retention feature #1 — gives users a concrete "to do" list every
 * time they sign in, and the satisfaction of ticking items off. Drives daily
 * check-ins.
 */
import type { Express, Request, Response } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { userCountryJourneys, JOURNEY_STAGES } from "@shared/schema";
import {
  getJourneySteps,
  SUPPORTED_JOURNEY_COUNTRIES,
} from "@shared/country-journey-steps";
import { isAuthenticated } from "../replit_integrations/auth/replitAuth";

function getUserId(req: any): string | undefined {
  return req.user?.claims?.sub ?? req.user?.id ?? req.session?.customUserId;
}

function validCountryCode(code: string): boolean {
  const c = (code || "").toUpperCase();
  return SUPPORTED_JOURNEY_COUNTRIES.some((x) => x.code === c);
}

export function registerJourneyRoutes(app: Express): void {
  // ── List all journeys for the current user ────────────────────────────────
  app.get("/api/journey", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const rows = await db
        .select()
        .from(userCountryJourneys)
        .where(eq(userCountryJourneys.userId, userId));
      // Enrich with progress percentage so the home dashboard widget can render
      // "75% complete · 9 of 12 steps" without doing the math client-side.
      const enriched = rows.map((r) => {
        const allSteps = getJourneySteps(r.countryCode);
        const completed = Array.isArray(r.completedSteps) ? (r.completedSteps as string[]) : [];
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
    } catch (err: any) {
      console.error("[journey][list]", err?.message);
      res.status(500).json({ message: "Failed to load journeys" });
    }
  });

  // ── Get full state for ONE country (the /journey/:country page) ───────────
  app.get("/api/journey/:countryCode", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const code = (req.params.countryCode || "").toUpperCase();
      if (!validCountryCode(code)) {
        return res.status(400).json({ message: `Country "${code}" not supported yet.` });
      }
      const steps = getJourneySteps(code);
      const country = SUPPORTED_JOURNEY_COUNTRIES.find((c) => c.code === code);
      const [row] = await db
        .select()
        .from(userCountryJourneys)
        .where(and(
          eq(userCountryJourneys.userId, userId),
          eq(userCountryJourneys.countryCode, code),
        ))
        .limit(1);
      const completed = Array.isArray(row?.completedSteps) ? (row!.completedSteps as string[]) : [];
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
    } catch (err: any) {
      console.error("[journey][get]", err?.message);
      res.status(500).json({ message: "Failed to load journey" });
    }
  });

  // ── Start a journey (creates the row if it doesn't exist) ─────────────────
  app.post("/api/journey/:countryCode/start", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const code = (req.params.countryCode || "").toUpperCase();
      if (!validCountryCode(code)) {
        return res.status(400).json({ message: `Country "${code}" not supported yet.` });
      }
      // ON CONFLICT DO NOTHING means re-starting is a no-op rather than wiping progress
      await db
        .insert(userCountryJourneys)
        .values({
          userId,
          countryCode: code,
          completedSteps: [],
          stage: JOURNEY_STAGES.PREPARING,
        })
        .onConflictDoNothing({ target: [userCountryJourneys.userId, userCountryJourneys.countryCode] });
      // Always update lastTouchedAt so the home widget bumps to the top
      await db
        .update(userCountryJourneys)
        .set({ lastTouchedAt: new Date(), updatedAt: new Date() })
        .where(and(
          eq(userCountryJourneys.userId, userId),
          eq(userCountryJourneys.countryCode, code),
        ));
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[journey][start]", err?.message);
      res.status(500).json({ message: "Failed to start journey" });
    }
  });

  // ── Toggle a single step's completion ─────────────────────────────────────
  app.post("/api/journey/:countryCode/steps/:stepKey", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const code = (req.params.countryCode || "").toUpperCase();
      const stepKey = String(req.params.stepKey || "");
      if (!validCountryCode(code)) {
        return res.status(400).json({ message: `Country "${code}" not supported yet.` });
      }
      const validKeys = new Set(getJourneySteps(code).map((s) => s.key));
      if (!validKeys.has(stepKey)) {
        return res.status(400).json({ message: `Step "${stepKey}" is not part of the ${code} journey.` });
      }
      // Fetch existing — auto-create the row if it doesn't exist, so the user
      // doesn't have to call /start explicitly before ticking their first step.
      const [existing] = await db
        .select()
        .from(userCountryJourneys)
        .where(and(
          eq(userCountryJourneys.userId, userId),
          eq(userCountryJourneys.countryCode, code),
        ))
        .limit(1);
      const prior: string[] = Array.isArray(existing?.completedSteps) ? (existing!.completedSteps as string[]) : [];
      // Body { done: true|false } controls toggle direction; default = flip
      const desired = typeof req.body?.done === "boolean"
        ? req.body.done
        : !prior.includes(stepKey);
      const next = desired
        ? Array.from(new Set([...prior, stepKey]))
        : prior.filter((k) => k !== stepKey);
      if (existing) {
        await db
          .update(userCountryJourneys)
          .set({ completedSteps: next, lastTouchedAt: new Date(), updatedAt: new Date() })
          .where(and(
            eq(userCountryJourneys.userId, userId),
            eq(userCountryJourneys.countryCode, code),
          ));
      } else {
        await db.insert(userCountryJourneys).values({
          userId,
          countryCode: code,
          completedSteps: next,
          stage: JOURNEY_STAGES.PREPARING,
        });
      }
      res.json({ ok: true, completedSteps: next, done: desired });
    } catch (err: any) {
      console.error("[journey][toggle]", err?.message);
      res.status(500).json({ message: "Failed to update step" });
    }
  });

  // ── Update stage (preparing / applying / interview / hired / departed) ────
  app.post("/api/journey/:countryCode/stage", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const code = (req.params.countryCode || "").toUpperCase();
      const stage = String(req.body?.stage || "");
      const validStages = Object.values(JOURNEY_STAGES) as string[];
      if (!validStages.includes(stage)) {
        return res.status(400).json({ message: `Stage must be one of: ${validStages.join(", ")}` });
      }
      const result = await db
        .update(userCountryJourneys)
        .set({ stage, lastTouchedAt: new Date(), updatedAt: new Date() })
        .where(and(
          eq(userCountryJourneys.userId, userId),
          eq(userCountryJourneys.countryCode, code),
        ))
        .returning();
      if (result.length === 0) {
        // No journey row yet — create one
        await db.insert(userCountryJourneys).values({
          userId,
          countryCode: code,
          completedSteps: [],
          stage,
        });
      }
      res.json({ ok: true, stage });
    } catch (err: any) {
      console.error("[journey][stage]", err?.message);
      res.status(500).json({ message: "Failed to update stage" });
    }
  });

  // ── Abandon a journey ─────────────────────────────────────────────────────
  app.delete("/api/journey/:countryCode", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const code = (req.params.countryCode || "").toUpperCase();
      await db
        .delete(userCountryJourneys)
        .where(and(
          eq(userCountryJourneys.userId, userId),
          eq(userCountryJourneys.countryCode, code),
        ));
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[journey][delete]", err?.message);
      res.status(500).json({ message: "Failed to delete journey" });
    }
  });

  console.log("[journey] Routes registered: GET/POST /api/journey + nested step + stage endpoints");
}
