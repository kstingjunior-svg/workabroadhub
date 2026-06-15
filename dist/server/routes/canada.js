"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCanadaRoutes = registerCanadaRoutes;
const canada_immigration_1 = require("@shared/canada-immigration");
function calculateCrs(input) {
    const withSpouse = input.maritalStatus === "married" && input.spouseImmigratingWithYou;
    const ageRow = canada_immigration_1.CRS_AGE[Math.min(45, Math.max(17, Math.floor(input.age)))] ?? { single: 0, withSpouse: 0 };
    const eduRow = canada_immigration_1.CRS_EDUCATION[input.education];
    const agePts = withSpouse ? ageRow.withSpouse : ageRow.single;
    const eduPts = withSpouse ? eduRow.withSpouse : eduRow.single;
    // First language: same CLB across all 4 abilities → ×4 (best-case simplification)
    const firstLangPerAbility = (0, canada_immigration_1.crsFirstLangPointsPerAbility)(input.firstLangClb, withSpouse);
    const firstLangPts = firstLangPerAbility * 4;
    // Second language: only counted if user enters one. Per ability × 4, capped at 22.
    const secondLangPts = input.secondLangClb && input.secondLangClb >= 5
        ? Math.min(withSpouse ? canada_immigration_1.CRS_SECOND_LANG_MAX_TOTAL.withSpouse : canada_immigration_1.CRS_SECOND_LANG_MAX_TOTAL.single, (0, canada_immigration_1.crsSecondLangPointsPerAbility)(input.secondLangClb, withSpouse) * 4)
        : 0;
    const canWorkPts = (0, canada_immigration_1.crsCanadianWorkPoints)(input.canadianWorkYears, withSpouse);
    // Skill transferability
    const transferPts = (0, canada_immigration_1.crsTransferabilityPoints)({
        education: input.education,
        firstLangAvgClb: input.firstLangClb,
        foreignWorkYears: input.foreignWorkYears,
        canadianWorkYears: input.canadianWorkYears,
    });
    // Additional points
    let additional = 0;
    if (input.hasProvincialNomination)
        additional += canada_immigration_1.CRS_ADDITIONAL.PNP_NOMINATION;
    if (input.hasArrangedJobOffer) {
        additional += input.arrangedJobIsSeniorManager
            ? canada_immigration_1.CRS_ADDITIONAL.ARRANGED_EMPLOYMENT_TEER_0_MG_00
            : canada_immigration_1.CRS_ADDITIONAL.ARRANGED_EMPLOYMENT_OTHER;
    }
    if (input.siblingInCanada)
        additional += canada_immigration_1.CRS_ADDITIONAL.SIBLING_IN_CANADA;
    if (input.canadianStudyCredential === "one_two_year")
        additional += canada_immigration_1.CRS_ADDITIONAL.CANADIAN_STUDY_1_OR_2_YEAR;
    if (input.canadianStudyCredential === "three_plus_or_graduate")
        additional += canada_immigration_1.CRS_ADDITIONAL.CANADIAN_STUDY_3_PLUS_OR_GRADUATE;
    // French bonus
    if (input.frenchClb >= 7) {
        additional += input.englishClb >= 5
            ? canada_immigration_1.CRS_ADDITIONAL.FRENCH_CLB_7_PLUS_ENGLISH_CLB_5_PLUS
            : canada_immigration_1.CRS_ADDITIONAL.FRENCH_CLB_7_PLUS_ENGLISH_CLB_4_OR_LESS;
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
function registerCanadaRoutes(app) {
    // Cache for 5 minutes browser, 1 hour edge — content is static between deploys.
    const CACHE_CONTROL = "public, max-age=300, s-maxage=3600";
    app.get("/api/canada/programs", (_req, res) => {
        res.setHeader("Cache-Control", CACHE_CONTROL);
        res.json({
            programs: canada_immigration_1.CANADA_PROGRAMS,
            totalEstimatedCAD: (0, canada_immigration_1.estimateCanadaTotalCAD)(),
            totalEstimatedKES: (0, canada_immigration_1.cadToKes)((0, canada_immigration_1.estimateCanadaTotalCAD)()),
        });
    });
    app.get("/api/canada/fees", (_req, res) => {
        res.setHeader("Cache-Control", CACHE_CONTROL);
        res.json({
            fees: canada_immigration_1.CANADA_FEES.map((f) => ({
                ...f,
                amountKES: (0, canada_immigration_1.cadToKes)(f.amountCAD),
            })),
            totalRequiredCAD: (0, canada_immigration_1.estimateCanadaTotalCAD)(),
            totalRequiredKES: (0, canada_immigration_1.cadToKes)((0, canada_immigration_1.estimateCanadaTotalCAD)()),
            conversionRate: "1 CAD ≈ 109 KES",
        });
    });
    app.get("/api/canada/noc", (req, res) => {
        const category = String(req.query.category || "").toLowerCase();
        res.setHeader("Cache-Control", CACHE_CONTROL);
        const list = category
            ? canada_immigration_1.NOC_OCCUPATIONS.filter((n) => n.category === category)
            : canada_immigration_1.NOC_OCCUPATIONS;
        res.json({
            categories: canada_immigration_1.NOC_CATEGORIES,
            occupations: list,
            total: list.length,
        });
    });
    app.get("/api/canada/eca-providers", (_req, res) => {
        res.setHeader("Cache-Control", CACHE_CONTROL);
        res.json({
            providers: canada_immigration_1.ECA_PROVIDERS.map((p) => ({
                ...p,
                feeKES: (0, canada_immigration_1.cadToKes)(p.feeCAD),
            })),
        });
    });
    app.get("/api/canada/portals", (req, res) => {
        const category = String(req.query.category || "").toLowerCase();
        res.setHeader("Cache-Control", CACHE_CONTROL);
        const list = category
            ? canada_immigration_1.CANADA_JOB_PORTALS.filter((p) => p.category === category)
            : canada_immigration_1.CANADA_JOB_PORTALS;
        res.json({
            portals: list,
            total: list.length,
        });
    });
    app.get("/api/canada/draws", (_req, res) => {
        // 60s edge cache — short enough to pick up new draws when we update the seed
        res.setHeader("Cache-Control", "public, max-age=60, s-maxage=600");
        // Sort newest first and add a relative-date hint
        const sorted = [...canada_immigration_1.RECENT_DRAWS_SEED].sort((a, b) => b.date.localeCompare(a.date));
        const now = Date.now();
        res.json({
            draws: sorted.map((d) => {
                const daysAgo = Math.floor((now - new Date(d.date).getTime()) / 86400000);
                return {
                    ...d,
                    daysAgo,
                    relative: daysAgo <= 0 ? "today" : daysAgo === 1 ? "yesterday" : `${daysAgo} days ago`,
                };
            }),
            disclaimer: "Approximate baseline data — confirm latest rounds at canada.ca",
        });
    });
    app.post("/api/canada/crs", (req, res) => {
        try {
            const body = req.body || {};
            // Validate + coerce — every numeric input has a sensible default
            const inputs = {
                age: Math.max(17, Math.min(60, Number(body.age) || 30)),
                maritalStatus: body.maritalStatus === "married" ? "married" : "single",
                spouseImmigratingWithYou: Boolean(body.spouseImmigratingWithYou),
                education: body.education || "bachelor",
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
            const sortedDraws = [...canada_immigration_1.RECENT_DRAWS_SEED].sort((a, b) => b.date.localeCompare(a.date));
            const recentByProgram = {};
            for (const d of sortedDraws) {
                if (!(d.programType in recentByProgram))
                    recentByProgram[d.programType] = d.crsCutoff;
            }
            // Naive "are you likely to get an ITA" verdict
            const lowestRecentCutoff = Math.min(...sortedDraws.map((d) => d.crsCutoff));
            let verdict;
            if (result.total >= 540)
                verdict = "likely";
            else if (result.total >= lowestRecentCutoff)
                verdict = "borderline";
            else
                verdict = "long_shot";
            res.json({
                ...result,
                inputs,
                verdict,
                recentByProgram,
                lowestRecentCutoff,
                boostSuggestions: buildBoostSuggestions(inputs, result.total),
            });
        }
        catch (err) {
            console.error("[canada/crs]", err?.message);
            res.status(400).json({ message: "Invalid CRS inputs" });
        }
    });
    console.log("[canada] Routes registered: programs, fees, noc, eca-providers, portals, draws, crs");
}
function buildBoostSuggestions(input, currentScore) {
    const suggestions = [];
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
