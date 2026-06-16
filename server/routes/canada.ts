/**
 * Canada Express Entry + Jobs API
 *
 * Endpoints
 *   GET  /api/canada/programs          — full program list (FSW, CEC, FST, PNP, AIP, RNIP, caregiver)
 *   GET  /api/canada/fees              — fee schedule (CAD + KES)
 *   GET  /api/canada/noc               — NOC 2021 occupations with category filter
 *   GET  /api/canada/eca-providers     — designated ECA providers
 *   GET  /api/canada/portals           — verified job portals (with category filter)
 *   GET  /api/canada/draws             — recent Express Entry draws (seed data, cacheable)
 *   POST /api/canada/crs               — server-side CRS calculator (mirrors client math, used by
 *                                          /api/me/canada-snapshot for the dashboard widget)
 *
 * All routes are public read (no auth) and aggressively cached at the edge —
 * content is static between deploys.
 *
 * 2026-06 retention feature: Canada Express Entry hub.
 */
import type { Express, Response, RequestHandler } from "express";
import {
  CANADA_PROGRAMS,
  CANADA_FEES,
  cadToKes,
  estimateCanadaTotalCAD,
  NOC_OCCUPATIONS,
  NOC_CATEGORIES,
  ECA_PROVIDERS,
  CANADA_JOB_PORTALS,
  RECENT_DRAWS_SEED,
  CRS_AGE,
  CRS_EDUCATION,
  crsFirstLangPointsPerAbility,
  crsSecondLangPointsPerAbility,
  CRS_SECOND_LANG_MAX_TOTAL,
  crsCanadianWorkPoints,
  crsTransferabilityPoints,
  CRS_ADDITIONAL,
  EducationLevel,
} from "@shared/canada-immigration";
import { requireAnyPaidPlan } from "../middleware/requirePlan";
import { isAuthenticated } from "../replit_integrations/auth/replitAuth";

interface CrsInputs {
  age: number;
  maritalStatus: "single" | "married";
  spouseImmigratingWithYou: boolean;
  education: EducationLevel;
  firstLangClb: number;                  // average across L/S/R/W abilities for simplicity
  secondLangClb?: number;
  canadianWorkYears: number;
  foreignWorkYears: number;
  hasProvincialNomination: boolean;
  hasArrangedJobOffer: boolean;          // any TEER 0/1/2/3 = 50pts
  arrangedJobIsSeniorManager: boolean;   // TEER 0 major group 00 = 200pts
  siblingInCanada: boolean;
  canadianStudyCredential: "none" | "one_two_year" | "three_plus_or_graduate";
  frenchClb: number;                     // 0 if no French
  englishClb: number;                    // 0 if French is primary; used for bonus calc
}

function calculateCrs(input: CrsInputs): { total: number; breakdown: Record<string, number> } {
  const withSpouse = input.maritalStatus === "married" && input.spouseImmigratingWithYou;
  const ageRow = CRS_AGE[Math.min(45, Math.max(17, Math.floor(input.age)))] ?? { single: 0, withSpouse: 0 };
  const eduRow = CRS_EDUCATION[input.education];

  const agePts = withSpouse ? ageRow.withSpouse : ageRow.single;
  const eduPts = withSpouse ? eduRow.withSpouse : eduRow.single;

  // First language: same CLB across all 4 abilities → ×4 (best-case simplification)
  const firstLangPerAbility = crsFirstLangPointsPerAbility(input.firstLangClb, withSpouse);
  const firstLangPts = firstLangPerAbility * 4;

  // Second language: only counted if user enters one. Per ability × 4, capped at 22.
  const secondLangPts = input.secondLangClb && input.secondLangClb >= 5
    ? Math.min(
        withSpouse ? CRS_SECOND_LANG_MAX_TOTAL.withSpouse : CRS_SECOND_LANG_MAX_TOTAL.single,
        crsSecondLangPointsPerAbility(input.secondLangClb, withSpouse) * 4,
      )
    : 0;

  const canWorkPts = crsCanadianWorkPoints(input.canadianWorkYears, withSpouse);

  // Skill transferability
  const transferPts = crsTransferabilityPoints({
    education: input.education,
    firstLangAvgClb: input.firstLangClb,
    foreignWorkYears: input.foreignWorkYears,
    canadianWorkYears: input.canadianWorkYears,
  });

  // Additional points
  let additional = 0;
  if (input.hasProvincialNomination) additional += CRS_ADDITIONAL.PNP_NOMINATION;
  if (input.hasArrangedJobOffer) {
    additional += input.arrangedJobIsSeniorManager
      ? CRS_ADDITIONAL.ARRANGED_EMPLOYMENT_TEER_0_MG_00
      : CRS_ADDITIONAL.ARRANGED_EMPLOYMENT_OTHER;
  }
  if (input.siblingInCanada) additional += CRS_ADDITIONAL.SIBLING_IN_CANADA;
  if (input.canadianStudyCredential === "one_two_year") additional += CRS_ADDITIONAL.CANADIAN_STUDY_1_OR_2_YEAR;
  if (input.canadianStudyCredential === "three_plus_or_graduate") additional += CRS_ADDITIONAL.CANADIAN_STUDY_3_PLUS_OR_GRADUATE;
  // French bonus
  if (input.frenchClb >= 7) {
    additional += input.englishClb >= 5
      ? CRS_ADDITIONAL.FRENCH_CLB_7_PLUS_ENGLISH_CLB_5_PLUS
      : CRS_ADDITIONAL.FRENCH_CLB_7_PLUS_ENGLISH_CLB_4_OR_LESS;
  }

  const total = agePts + eduPts + firstLangPts + secondLangPts + canWorkPts + transferPts + additional;

  return {
    total,
    breakdown: {
      age: agePts,
      education: eduPts,
      firstLanguage: firstLangPts,
      secondLanguage: secondLangPts,
      canadianWork: canWorkPts,
      skillTransferability: transferPts,
      additional,
    },
  };
}

export function registerCanadaRoutes(app: Express): void {
  // 2026-06: Canada hub is Pro-only — all 4 paid tiers (trial KES 99,
  // basic/monthly KES 1,000, yearly KES 4,500, pro_referral) pass.
  // Free users get 403 with an upgrade_required payload that the client
  // translates into a paywall card.
  const paid: RequestHandler[] = [isAuthenticated as any, requireAnyPaidPlan];

  // Authed-but-not-paywalled: still need to know who you are so we can read
  // your plan; the per-endpoint paid[] array below adds the pay-gate.
  // Browser cache: keep short on Pro-gated routes (10s) so plan upgrades
  // surface quickly; CDN cache disabled because responses depend on auth.
  const CACHE_CONTROL = "private, max-age=10";

  app.get("/api/canada/programs", paid, (_req, res: Response) => {
    res.setHeader("Cache-Control", CACHE_CONTROL);
    res.json({
      programs: CANADA_PROGRAMS,
      totalEstimatedCAD: estimateCanadaTotalCAD(),
      totalEstimatedKES: cadToKes(estimateCanadaTotalCAD()),
    });
  });

  app.get("/api/canada/fees", paid, (_req, res: Response) => {
    res.setHeader("Cache-Control", CACHE_CONTROL);
    res.json({
      fees: CANADA_FEES.map((f) => ({
        ...f,
        amountKES: cadToKes(f.amountCAD),
      })),
      totalRequiredCAD: estimateCanadaTotalCAD(),
      totalRequiredKES: cadToKes(estimateCanadaTotalCAD()),
      conversionRate: "1 CAD ≈ 109 KES",
    });
  });

  app.get("/api/canada/noc", paid, (req, res: Response) => {
    const category = String(req.query.category || "").toLowerCase();
    res.setHeader("Cache-Control", CACHE_CONTROL);
    const list = category
      ? NOC_OCCUPATIONS.filter((n) => n.category === category)
      : NOC_OCCUPATIONS;
    res.json({
      categories: NOC_CATEGORIES,
      occupations: list,
      total: list.length,
    });
  });

  app.get("/api/canada/eca-providers", paid, (_req, res: Response) => {
    res.setHeader("Cache-Control", CACHE_CONTROL);
    res.json({
      providers: ECA_PROVIDERS.map((p) => ({
        ...p,
        feeKES: cadToKes(p.feeCAD),
      })),
    });
  });

  app.get("/api/canada/portals", paid, (req, res: Response) => {
    const category = String(req.query.category || "").toLowerCase();
    res.setHeader("Cache-Control", CACHE_CONTROL);
    const list = category
      ? CANADA_JOB_PORTALS.filter((p) => p.category === category)
      : CANADA_JOB_PORTALS;
    res.json({
      portals: list,
      total: list.length,
    });
  });

  app.get("/api/canada/draws", paid, (_req, res: Response) => {
    // 60s edge cache — short enough to pick up new draws when we update the seed
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=600");

    // Sort newest first and add a relative-date hint
    const sorted = [...RECENT_DRAWS_SEED].sort((a, b) => b.date.localeCompare(a.date));
    const now = Date.now();
    res.json({
      draws: sorted.map((d) => {
        const daysAgo = Math.floor((now - new Date(d.date).getTime()) / 86400_000);
        return {
          ...d,
          daysAgo,
          relative: daysAgo <= 0 ? "today" : daysAgo === 1 ? "yesterday" : `${daysAgo} days ago`,
        };
      }),
      disclaimer: "Approximate baseline data — confirm latest rounds at canada.ca",
    });
  });

  app.post("/api/canada/crs", paid, (req: any, res: Response) => {
    try {
      const body = req.body || {};

      // Validate + coerce — every numeric input has a sensible default
      const inputs: CrsInputs = {
        age: Math.max(17, Math.min(60, Number(body.age) || 30)),
        maritalStatus: body.maritalStatus === "married" ? "married" : "single",
        spouseImmigratingWithYou: Boolean(body.spouseImmigratingWithYou),
        education: (body.education as EducationLevel) || "bachelor",
        firstLangClb: Math.max(0, Math.min(12, Number(body.firstLangClb) || 7)),
        secondLangClb: body.secondLangClb !== undefined && body.secondLangClb !== null
          ? Math.max(0, Math.min(12, Number(body.secondLangClb)))
          : undefined,
        canadianWorkYears: Math.max(0, Math.min(10, Number(body.canadianWorkYears) || 0)),
        foreignWorkYears: Math.max(0, Math.min(20, Number(body.foreignWorkYears) || 0)),
        hasProvincialNomination: Boolean(body.hasProvincialNomination),
        hasArrangedJobOffer: Boolean(body.hasArrangedJobOffer),
        arrangedJobIsSeniorManager: Boolean(body.arrangedJobIsSeniorManager),
        siblingInCanada: Boolean(body.siblingInCanada),
        canadianStudyCredential: ["none", "one_two_year", "three_plus_or_graduate"].includes(body.canadianStudyCredential)
          ? body.canadianStudyCredential
          : "none",
        frenchClb: Math.max(0, Math.min(12, Number(body.frenchClb) || 0)),
        englishClb: Math.max(0, Math.min(12, Number(body.englishClb) || 0)),
      };

      const result = calculateCrs(inputs);

      // Reference cutoffs from seed draws
      const sortedDraws = [...RECENT_DRAWS_SEED].sort((a, b) => b.date.localeCompare(a.date));
      const recentByProgram: Record<string, number> = {};
      for (const d of sortedDraws) {
        if (!(d.programType in recentByProgram)) recentByProgram[d.programType] = d.crsCutoff;
      }

      // Naive "are you likely to get an ITA" verdict
      const lowestRecentCutoff = Math.min(...sortedDraws.map((d) => d.crsCutoff));
      let verdict: "likely" | "borderline" | "long_shot";
      if (result.total >= 540) verdict = "likely";
      else if (result.total >= lowestRecentCutoff) verdict = "borderline";
      else verdict = "long_shot";

      res.json({
        ...result,
        inputs,
        verdict,
        recentByProgram,
        lowestRecentCutoff,
        boostSuggestions: buildBoostSuggestions(inputs, result.total),
      });
    } catch (err: any) {
      console.error("[canada/crs]", err?.message);
      res.status(400).json({ message: "Invalid CRS inputs" });
    }
  });

  console.log("[canada] Routes registered: programs, fees, noc, eca-providers, portals, draws, crs");
}

function buildBoostSuggestions(input: CrsInputs, currentScore: number): Array<{ action: string; potentialGain: string; effort: "low" | "medium" | "high" }> {
  const suggestions: Array<{ action: string; potentialGain: string; effort: "low" | "medium" | "high" }> = [];

  // Language: biggest lever for most Kenyans
  if (input.firstLangClb < 9) {
    suggestions.push({
      action: `Retake IELTS and aim for CLB ${input.firstLangClb < 7 ? "7" : input.firstLangClb < 9 ? "9" : "10"}+ in all 4 abilities`,
      potentialGain: input.firstLangClb < 7 ? "+60 to +90 pts" : input.firstLangClb < 9 ? "+25 to +40 pts" : "+15 pts",
      effort: "medium",
    });
  }

  // Provincial nomination — huge win
  if (!input.hasProvincialNomination) {
    suggestions.push({
      action: "Apply to a Provincial Nominee Program (Saskatchewan SINP, Manitoba MPNP, Alberta AAIP all open without a job offer)",
      potentialGain: "+600 pts (guaranteed ITA)",
      effort: "high",
    });
  }

  // French (game-changer if you can do it)
  if (input.frenchClb < 7) {
    suggestions.push({
      action: "Learn French to CLB 7+ (TEF Canada test) — French-speaker draws have CRS cutoffs as low as 380",
      potentialGain: "+50 pts + access to French-only draws",
      effort: "high",
    });
  }

  // Foreign work experience matters via transferability
  if (input.foreignWorkYears < 3) {
    suggestions.push({
      action: `Gain ${3 - Math.floor(input.foreignWorkYears)} more years of skilled work experience in your NOC`,
      potentialGain: "+25 to +50 pts via skill transferability",
      effort: "high",
    });
  }

  // Master's vs bachelor's
  if (input.education === "bachelor") {
    suggestions.push({
      action: "Complete a Master's degree (in Kenya or online from a recognized university)",
      potentialGain: "+15 pts (bachelor → master)",
      effort: "high",
    });
  }

  // Sibling shortcut
  if (!input.siblingInCanada) {
    suggestions.push({
      action: "Check if you have a sibling who is a Canadian PR or citizen (+15 pts)",
      potentialGain: "+15 pts",
      effort: "low",
    });
  }

  return suggestions.slice(0, 6);
}
