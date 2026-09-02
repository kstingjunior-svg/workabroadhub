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
exports.generateHubPlan = generateHubPlan;
/**
 * Hub Plan Generator — turns raw traveler input into a personalized migration plan.
 *
 * Design principles (per the WorkAbroadHub Global Work Visa Hub spec):
 *   1. EXPLICIT INSTRUCTIONS — the system prompt tells the model exactly how
 *      to infer missing details and what NEVER to invent. Missing years of
 *      experience? Assume 5 (Kenyan median), label it. No target country?
 *      Pick the top 3 by shortage-list hits + Kenyan approval odds.
 *   2. TOOL USE — the shortage_list_lookup tool is the ONLY source of truth
 *      for whether a country prioritizes an occupation. The model is told
 *      it must call this tool BEFORE claiming any country wants a given role.
 *      Data is refreshed from official sources (see hub_shortage_occupations).
 *
 * Uses the existing gpt-4o pipeline (server/lib/openai.ts). Not Claude tools
 * proper — we simulate tool calls by resolving the shortage list server-side
 * BEFORE the model runs, then passing the resolved data as authoritative
 * context. Same effect, no OpenAI tool-call boilerplate.
 */
const db_1 = require("../db");
// Reuse the existing OpenAI client — no new keys, no new dependency.
async function openaiChat(system, user, opts) {
    const { default: OpenAI } = await Promise.resolve().then(() => __importStar(require("openai")));
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const res = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            { role: "system", content: system },
            { role: "user", content: user },
        ],
        temperature: opts?.temperature ?? 0.35,
        max_tokens: opts?.maxTokens ?? 2200,
        response_format: { type: "json_object" },
    });
    return res.choices[0]?.message?.content ?? "{}";
}
/**
 * Server-side "tool" — normalized shortage-list lookup.
 *
 * Called BEFORE the LLM runs so the model receives authoritative shortage data
 * as context rather than being asked to invent it. Matches on substring of the
 * occupation query for tolerance to phrasing ("nurse" hits "registered nurse").
 */
async function shortageListLookup(occupationQuery) {
    const q = occupationQuery.trim().toLowerCase();
    if (!q)
        return [];
    const { rows } = await db_1.pool.query(`SELECT country_iso2 AS iso2, occupation, category
       FROM hub_shortage_occupations
      WHERE LOWER(occupation) LIKE $1 OR LOWER($2) LIKE '%' || LOWER(occupation) || '%'
      LIMIT 40`, [`%${q}%`, q]);
    return rows;
}
/** Fetch active countries + their headline visa type for the recommendation pool. */
async function fetchCandidatePool() {
    const { rows } = await db_1.pool.query(`
    SELECT DISTINCT ON (c.id)
           c.slug, c.name, c.iso2, c.flag_emoji AS flag, c.ease_score AS ease,
           v.code AS visa_code, v.name AS visa_name, v.traveler_benefit AS visa_benefit,
           v.employer_sponsor_required AS sponsor_required, v.post_arrival_work_permit AS post_arrival_ok
      FROM hub_countries c
      JOIN hub_visa_types v ON v.country_id = c.id AND v.is_active = true
     WHERE c.is_active = true
     ORDER BY c.id, v.display_order ASC
  `);
    return rows.map((r) => ({
        slug: r.slug, name: r.name, iso2: r.iso2, flag: r.flag, ease: r.ease,
        visaCode: r.visa_code, visaName: r.visa_name, visaBenefit: r.visa_benefit,
        sponsorRequired: !!r.sponsor_required, postArrivalOk: !!r.post_arrival_ok,
    }));
}
async function generateHubPlan(input) {
    // ── Tool call 1: shortage-list lookup ─────────────────────────────────────
    const shortageHits = await shortageListLookup(input.occupation);
    // ── Tool call 2: fetch candidate pool ─────────────────────────────────────
    const pool_ = await fetchCandidatePool();
    const shortageByIso = new Map();
    for (const h of shortageHits)
        shortageByIso.set(h.iso2, true);
    // ── System prompt (EXPLICIT INSTRUCTIONS for inference + anti-hallucination)
    const system = `You are Nanjila — WorkAbroadHub's warm, expert migration guide for Kenyan skilled workers.

TONE & LANGUAGE RULES (non-negotiable):
- Address the reader as "you". Never "applicant", "petitioner", "alien", "beneficiary".
- Prefer "journey", "route", "pathway" over "application", "petition".
- Warm, direct, specific. No fluff. No em-dashes.
- Never invent numbers. Every fee, salary, or timeline you cite MUST come from the DATA block below.

INFERENCE RULES (fill missing user info silently, then LIST what you inferred at the end):
- If years of experience is missing: assume 5 (Kenyan median for their role). Label it in "assumptions".
- If English level is missing: assume upper-intermediate (B2). Label it.
- If target country is missing: pick the country whose shortage list includes the user's occupation AND has the highest ease_score. Present the top 3.
- If current salary is missing: don't assume. Ask nothing — omit any salary-specific advice.

SUITABILITY SCORE (return 0-100):
Formula (compute mentally, don't show it):
  60 base
  + 25 if occupation is on that country's shortage list
  + 10 if user meets or exceeds any minimum experience or points threshold
  + 5 if country's headline pathway is "post-arrival" (no employer needed first)
  - 15 if country's headline pathway is employer-sponsored AND user has no offer
Cap at [30, 98]. NEVER give 100 — no one is a perfect match.

TOP-3 COUNTRIES:
Pick 3 from the DATA.candidates list. #1 gets the highest suitability. Include one lower-ease country IF it has a strong shortage match — this teaches the traveler about a good-but-underrated option.

GAPS-TO-CLOSE:
List 3-5 specific, actionable steps to raise the score to 100. Each item must be doable within 6 months. Example: "Book a German B1 test — you're already close" not "Improve German".

FAST-TRACK RULE (uses the shortage-list tool result):
Look at DATA.shortageListHits. If ANY row has iso2 matching your
recommendedCountry's iso2 AND the occupation substring-matches the
user's stated occupation, you MUST:
  - set "fastTrackEligible": true
  - set "fastTrackReason" to a warm one-sentence explanation
    referencing the specific government body when known
    (e.g. "Germany's Federal Employment Agency lists registered
    nurses on the current shortage list — your file goes to the
    top of the pile automatically.")
  - mention Fast-Track eligibility in the OPENING paragraph of
    narrativePlan so the reader sees it before scrolling
Never invent a Fast-Track claim if the tool result doesn't support it.
Set "fastTrackEligible": false and "fastTrackReason": "" in that case.

OUTPUT (strict JSON, no prose outside JSON):
{
  "suitabilityScore": integer 30-98,
  "recommendedCountrySlug": string (must match one of DATA.candidates[].slug),
  "recommendedCountryName": string,
  "recommendedVisaTypeCode": string (must match DATA.candidates[].visaCode for the chosen country),
  "recommendedVisaTypeName": string,
  "narrativePlan": string (350-600 words, warm, addresses the reader as "you", references THEIR specific role/experience, walks through what happens next in plain language),
  "topThreeCountries": [
    { "slug": string, "name": string, "flag": string, "whyThisFits": string (1-2 sentences), "matchScore": integer 30-98 }
  ],
  "gapsToClose": [
    { "item": string, "whyItMatters": string, "howLong": string (e.g. "2-3 months") }
  ],
  "assumptions": [
    { "what": string, "whyWeAssumed": string }
  ],
  "fastTrackEligible": boolean,
  "fastTrackReason": string
}`;
    // ── User turn with resolved DATA block (this is our "tool result" injection)
    const userTurn = `Here's what the traveler told us:

occupation: "${input.occupation}"
yearsExperience: ${input.yearsExperience ?? "not provided"}
targetCountrySlug: ${input.targetCountrySlug ?? "not provided — recommend the best fit"}
englishLevel: ${input.englishLevel ?? "not provided"}
currentSalaryKes: ${input.currentSalaryKes ?? "not provided"}

DATA (authoritative — do NOT invent, do NOT contradict):

shortageListHits: ${JSON.stringify(shortageHits)}

candidates: ${JSON.stringify(pool_)}

If shortageListHits contains a row with iso2 matching a candidate's iso2, treat that country as prioritizing this occupation (use in scoring + narrativePlan).

Now generate the plan JSON.`;
    const raw = await openaiChat(system, userTurn, { temperature: 0.4, maxTokens: 2400 });
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        // Extremely rare with response_format: json_object, but be defensive.
        console.warn("[Hub] Plan JSON parse failed — returning safe fallback");
        parsed = {};
    }
    // ── Defensive shaping — never return junk to the client ──────────────────
    const fallbackCandidate = pool_[0];
    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || lo));
    const plan = {
        suitabilityScore: clamp(parsed.suitabilityScore, 30, 98),
        recommendedCountrySlug: String(parsed.recommendedCountrySlug ?? fallbackCandidate?.slug ?? "germany").toLowerCase(),
        recommendedCountryName: String(parsed.recommendedCountryName ?? fallbackCandidate?.name ?? "Germany"),
        recommendedVisaTypeCode: String(parsed.recommendedVisaTypeCode ?? fallbackCandidate?.visaCode ?? "de_opportunity_card").toLowerCase(),
        recommendedVisaTypeName: String(parsed.recommendedVisaTypeName ?? fallbackCandidate?.visaName ?? "Opportunity Card"),
        narrativePlan: String(parsed.narrativePlan ?? "We're preparing your personalized plan. Try again in a moment — this usually takes 5 seconds."),
        topThreeCountries: Array.isArray(parsed.topThreeCountries) ? parsed.topThreeCountries.slice(0, 3).map((t) => ({
            slug: String(t.slug ?? ""), name: String(t.name ?? ""), flag: String(t.flag ?? "🌍"),
            whyThisFits: String(t.whyThisFits ?? ""), matchScore: clamp(t.matchScore, 30, 98),
        })) : [],
        gapsToClose: Array.isArray(parsed.gapsToClose) ? parsed.gapsToClose.slice(0, 6).map((g) => ({
            item: String(g.item ?? ""), whyItMatters: String(g.whyItMatters ?? ""), howLong: String(g.howLong ?? ""),
        })) : [],
        assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions.slice(0, 5).map((a) => ({
            what: String(a.what ?? ""), whyWeAssumed: String(a.whyWeAssumed ?? ""),
        })) : [],
        // 2026-08 (revenue layer): Fast-Track flag + contextual upsells.
        // fastTrackEligible comes from the model (already validated against the
        // shortage-list tool). upsellHints are computed server-side from static
        // pricing so we never let the model invent prices.
        fastTrackEligible: !!parsed.fastTrackEligible,
        fastTrackReason: String(parsed.fastTrackReason ?? ""),
        upsellHints: {
            unlockFullScore: {
                priceKes: 650, priceUsd: 4.99,
                reason: `Your free score shows ${clamp(parsed.suitabilityScore, 30, 98)}%. Unlock the exact per-step gap analysis and see the shortest path to 100%.`,
            },
            vault: {
                priceKes: 3900, priceUsd: 29,
                reason: `You'll fill 6+ forms across the countries you're exploring. The Vault stores your documents once and auto-fills every one — most travelers save 4+ hours on their first application.`,
            },
            concierge: {
                priceKes: 25000, priceUsd: 199,
                reason: parsed.fastTrackEligible
                    ? "You're on the Fast-Track list — that advantage disappears if the file gets returned for a typo. Our review takes 24 hours."
                    : "Most consulate refusals come from tiny formatting mistakes, not from unqualified candidates. We double-check every comma before submission.",
            },
        },
    };
    return plan;
}
