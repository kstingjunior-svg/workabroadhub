// ─────────────────────────────────────────────────────────────────────────────
// Pass 3 — Style spec + JD parser
//
// Two responsibilities, one module because they feed each other:
//
//   parseJd(jdText)          → JdSpec | null      (LLM extraction)
//   selectStyle(facts, jd?)  → StyleSpec          (deterministic + stochastic)
//
// The JD parser is what makes the "tailored to a specific role" promise
// real. Before this landed, a pasted JD was passed to Composer as free
// text and Composer's rules referenced STYLE.jd.keywordsForInjection —
// which was always undefined, so tailoring silently no-op'd.
//
// The style selector produces the uniqueness the marketing promises.
// Same user + same source CV → same style (consistent regenerations).
// Different users in the same industry → different styles (never two CVs
// that look alike). Achieved with a stable hash + permutation tables.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from "crypto";
import { openai } from "../openai";
import { DEFAULT_BANNED_PHRASES } from "./orchestrator";
import type {
  CvFacts, StyleSpec, JdSpec, VoiceProfile, StructureProfile,
} from "./types";

// ═════════════════════════════════════════════════════════════════════════════
// JD parser
// ═════════════════════════════════════════════════════════════════════════════

const JD_SYSTEM_PROMPT = `
You extract structured requirements from a job description. Return one JSON
object matching this exact schema:

{
  "mustHaveHardSkills":   [string, ...],  // technologies/tools/certs the JD
                                          //   explicitly requires — 3-12 items
  "niceToHaveHardSkills": [string, ...],  // preferred but not required — 0-8
  "softSignals":          [string, ...],  // "ownership", "async comms",
                                          //   "customer obsession" — 0-8
  "tone":                 "formal" | "casual" | "technical" | "creative",
  "employerArchetype":    "startup" | "enterprise" | "gov" | "agency" | "nonprofit" | "unknown",
  "seniorityMarkers":     [string, ...],  // e.g. "lead a team of 5", "senior IC",
                                          //   "10+ years", "reports to CTO" — 0-5
  "keywordsForInjection": [string, ...]   // the ~8-15 words/phrases the
                                          //   CV should weave in naturally
}

RULES
1. Extract exact wording where possible. If the JD says "SRE", write "SRE",
   not "DevOps Engineer".
2. keywordsForInjection is your MOST IMPORTANT output. Pick the terms a
   hiring manager would ctrl-F for. Prefer nouns and named tools over
   verbs. Cap at 15.
3. If the pasted text is NOT a job description (a CV, a cover letter, a
   generic essay), return {"error": "NOT_A_JD"}.
4. Never invent skills the JD doesn't mention.
`.trim();

/**
 * Parse a raw JD string into a structured spec.
 * Returns null when the input is too short or clearly not a JD — the
 * caller (orchestrator) then runs the pipeline in untailored mode.
 */
export async function parseJd(jdText: string): Promise<JdSpec | null> {
  const trimmed = String(jdText ?? "").trim();
  if (trimmed.length < 40) return null;

  try {
    const completion = await openai.chat.completions.create(
      {
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: JD_SYSTEM_PROMPT },
          { role: "user", content: `Parse this JD.\n\n---\n\n${trimmed.slice(0, 8000)}` },
        ],
      },
      { timeout: 20_000 } as any,
    );
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    if (parsed?.error === "NOT_A_JD") return null;
    if (!Array.isArray(parsed?.keywordsForInjection) || parsed.keywordsForInjection.length === 0) {
      return null;
    }

    return {
      mustHaveHardSkills:   asStrArr(parsed.mustHaveHardSkills, 12),
      niceToHaveHardSkills: asStrArr(parsed.niceToHaveHardSkills, 8),
      softSignals:          asStrArr(parsed.softSignals, 8),
      tone:                 asTone(parsed.tone),
      employerArchetype:    asArchetype(parsed.employerArchetype),
      seniorityMarkers:     asStrArr(parsed.seniorityMarkers, 5),
      keywordsForInjection: asStrArr(parsed.keywordsForInjection, 15),
    };
  } catch (err: any) {
    try {
      const { reportRejection } = await import("../sentry");
      reportRejection(err, "cv-ai/jd-parser");
    } catch {}
    return null;   // untailored mode is a safe fallback
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Style selector
// ═════════════════════════════════════════════════════════════════════════════

/** Section-order permutations. Same 6 sections, different reasonable orders. */
const SECTION_ORDER_VARIANTS: string[][] = [
  ["Summary", "Experience", "Skills", "Education", "Certifications", "Languages"],
  ["Summary", "Skills", "Experience", "Education", "Certifications", "Languages"],
  ["Summary", "Experience", "Education", "Skills", "Certifications", "Languages"],
  ["Summary", "Experience", "Skills", "Certifications", "Education", "Languages"],
  ["Summary", "Skills", "Experience", "Certifications", "Education", "Languages"],
  ["Summary", "Experience", "Education", "Certifications", "Skills", "Languages"],
];

const VOICE_VARIANTS: VoiceProfile[] = [
  "formal-classic",
  "punchy-modern",
  "narrative-driven",
  "technical-terse",
  "achievement-first",
];

const STRUCTURE_VARIANTS: StructureProfile[] = [
  "chronological",
  "hybrid",
  "skills-forward",
];

/**
 * Per-industry banned phrases. Kept small — the global DEFAULT_BANNED_PHRASES
 * list handles most clichés; these are the industry-specific tells.
 * Eventually promote to a Postgres table (cv_banned_phrases).
 */
const INDUSTRY_BANNED: Record<string, string[]> = {
  software: ["rockstar developer", "ninja", "code monkey", "10x engineer"],
  finance:  ["seasoned banker", "financial guru", "market maven"],
  healthcare: ["dedicated caregiver", "patient advocate", "healing hands"],
  marketing: ["growth hacker", "brand evangelist", "thought leader"],
  sales: ["closer", "hunter", "farmer", "quota crusher"],
  general: [],
};

export interface SelectStyleInput {
  facts: CvFacts;
  jd?: JdSpec | null;
  region: StyleSpec["region"];
  industry: string;
  /** Optional stable seed — hash(userId + generationN) — so regenerations
   * for the same user give the same style, but different users differ. */
  seed?: string;
}

export function selectStyle(input: SelectStyleInput): StyleSpec {
  const { facts, jd, region, industry } = input;
  const seed = input.seed ?? crypto.randomBytes(8).toString("hex");

  // Cheap deterministic RNG from the seed — 3 draws from a rotating hash.
  const [voiceIdx, structureIdx, sectionIdx] = drawIndices(seed, [
    VOICE_VARIANTS.length,
    STRUCTURE_VARIANTS.length,
    SECTION_ORDER_VARIANTS.length,
  ]);

  const seniority = inferSeniority(facts);
  const industryKey = normalizeIndustry(industry);

  // Voice tweaks based on hard signals — the stochastic pick can be
  // overridden when the situation demands it.
  let voice: VoiceProfile = VOICE_VARIANTS[voiceIdx]!;
  if (seniority === "exec") voice = "formal-classic";
  else if (jd?.tone === "casual") voice = "punchy-modern";
  else if (jd?.tone === "technical" && seniority !== "entry") voice = "technical-terse";

  // Structure: chronological when there's a clear timeline; skills-forward
  // for early-career or big-gap CVs where chronology hurts.
  let structure: StructureProfile = STRUCTURE_VARIANTS[structureIdx]!;
  if (facts.roles.length < 2) structure = "skills-forward";
  else if (seniority === "entry" && jd) structure = "hybrid";

  const bannedPhrases = dedupe([
    ...DEFAULT_BANNED_PHRASES,
    ...(INDUSTRY_BANNED[industryKey] ?? []),
  ]);

  return {
    voice,
    structure,
    sectionOrder: SECTION_ORDER_VARIANTS[sectionIdx]!,
    region,
    seniorityBand: seniority,
    industry: industryKey,
    bannedPhrases,
    jd: jd ?? undefined,
  };
}

/**
 * Build a stable seed for regenerations of the same source CV by the
 * same user. Pass this to selectStyle() so the user sees consistent voice
 * across retries, but two different users get different voices even from
 * the same industry.
 */
export function buildStyleSeed(userId: string, sourceHash: string, generationN = 0): string {
  return crypto
    .createHash("sha256")
    .update(`${userId}|${sourceHash}|${generationN}`)
    .digest("hex")
    .slice(0, 16);
}

// ═════════════════════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════════════════════

function asStrArr(x: any, cap: number): string[] {
  if (!Array.isArray(x)) return [];
  return x.filter((v) => typeof v === "string" && v.trim().length > 0).slice(0, cap);
}
function asTone(x: any): JdSpec["tone"] {
  return ["formal", "casual", "technical", "creative"].includes(x) ? x : "formal";
}
function asArchetype(x: any): JdSpec["employerArchetype"] {
  return ["startup", "enterprise", "gov", "agency", "nonprofit"].includes(x) ? x : "unknown";
}
function dedupe<T>(xs: T[]): T[] { return Array.from(new Set(xs)); }

function drawIndices(seed: string, sizes: number[]): number[] {
  // Rotate a sha256 digest per draw so each index is independent from
  // the others but stable given the seed.
  return sizes.map((n, i) => {
    const h = crypto.createHash("sha256").update(`${seed}|${i}`).digest();
    return h.readUInt32BE(0) % n;
  });
}

function inferSeniority(facts: CvFacts): StyleSpec["seniorityBand"] {
  const starts = facts.roles
    .map((r) => Date.parse(r.start))
    .filter((n) => !isNaN(n));
  const titles = facts.roles.map((r) => r.title.toLowerCase()).join(" ");
  if (/(chief|c\w+o|vp|vice president|founder|director|head of)/.test(titles)) return "exec";
  if (!starts.length) return "mid";
  const years = new Date().getFullYear() - new Date(Math.min(...starts)).getFullYear();
  if (years >= 10) return "lead";
  if (years >= 5) return "senior";
  if (years >= 2) return "mid";
  return "entry";
}

function normalizeIndustry(raw: string): string {
  const s = String(raw || "general").trim().toLowerCase();
  if (/(software|dev|engineer|tech|it|programming)/.test(s)) return "software";
  if (/(finance|bank|invest|account|fintech)/.test(s)) return "finance";
  if (/(health|medic|nurse|clinic|hospital|pharma)/.test(s)) return "healthcare";
  if (/(market|brand|growth|advert|content)/.test(s)) return "marketing";
  if (/(sales|bd|business dev|account exec)/.test(s)) return "sales";
  return "general";
}
