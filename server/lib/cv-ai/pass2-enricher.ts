// ─────────────────────────────────────────────────────────────────────────────
// Pass 2 — Enricher
//
// The single biggest quality lever in the pipeline.
//
// Weak CV achievements ("managed the team", "responsible for reports") pass
// Composer verbatim — the anti-hallucination rule forbids inventing facts.
// Result: score barely moves. The trust guarantee fails, and the user hears
// "your CV was already strong" when the real answer is "we couldn't make it
// stronger without making things up."
//
// Enricher fixes that by producing three alternatives for every weak
// achievement:
//
//   verbatim            — the original text (safe fallback)
//   outcome_reframed    — same facts, better verb + emphasis on impact
//   quantified_estimate — conservative scale inference from context
//                         (e.g. "led team" → "led 3-5 person team")
//                         Marked as [inferred] so the Composer only
//                         uses them when the user opts in.
//
// Where quantification is important but the source has zero signal, Enricher
// emits a clarifyingQuestion[] the client can show the user in-line:
// "How many customers used the dashboard you built?"
//
// Model: gpt-4o. Temperature 0.4 — enough variety, mostly grounded.
// Cost: ~$0.02-0.04 per CV depending on role count.
// ─────────────────────────────────────────────────────────────────────────────

import { openai } from "../openai";
import type {
  CvFacts, EnrichedFacts, EnrichedAchievement,
  JdSpec,
} from "./types";

const SYSTEM_PROMPT = `
You are a senior resume writer with fifteen years of placement experience.
Your ONLY job in this pass is to rewrite weak achievement bullet points
into stronger candidates without inventing facts.

INPUT
- ROLE: one role object with {title, employer, tools, achievements}.
- ACHIEVEMENT: one bullet string from the role.
- Optional TARGET_KEYWORDS: hard skills from a job description we're
  tailoring toward; work them in naturally IF the achievement genuinely
  supports them.

OUTPUT
Return JSON exactly:

{
  "rewrites": [
    { "text": string, "confidence": "verbatim" | "outcome_reframed" | "quantified_estimate" },
    ...
  ],
  "clarifyingQuestions": [string, ...]?
}

CONFIDENCE LEVELS

"verbatim"
  The original achievement, unchanged. Always include this as an option.

"outcome_reframed"
  Same facts. Zero new information. But: leading verb replaced with a
  stronger action, filler removed, outcome or purpose brought to the
  front. NEVER add numbers, percentages, dollar amounts, team sizes,
  team names, or tools that weren't in the original.
  Example:
    original:    "responsible for the customer dashboard"
    reframed:    "built and shipped the customer dashboard"
  Example:
    original:    "helped with monthly reports"
    reframed:    "produced the monthly executive reports"

"quantified_estimate"
  Only emit when the original achievement CONTAINS implicit scale that a
  reasonable reader would infer within a ±50% range. Add the number in
  brackets suffixed with the word "inferred" so the downstream composer
  can decide whether to keep it.
  Emit AT MOST ONE quantified_estimate per rewrite set. If you have any
  doubt, do not emit it — emit a clarifyingQuestion instead.
  Example (safe):
    original:    "led the platform team at a Series-B startup"
    quantified:  "led the platform team of 4-8 engineers [inferred]"
  Example (do NOT emit — no basis for inference):
    original:    "improved customer satisfaction"
    → put in clarifyingQuestions: ["What was the CSAT lift? (%)"]

CLARIFYING QUESTIONS
When an achievement clearly WOULD be more compelling with a number the
source doesn't provide, add a short, specific question. Never more than
2 questions per achievement. Never rhetorical. Always answerable in <10
words.

BANNED PHRASES — never emit any of these:
- "results-driven"        - "detail-oriented"       - "team player"
- "passionate about"      - "proven track record"    - "responsible for"
- "duties included"       - "utilize" (use "use")   - "leverage" (use "use")
- "synergize"             - "curated"                - "in charge of"
- "worked on"             - "helped with"

CRITICAL RULES
1. If you add a fact that isn't in the original, you have violated the
   contract and the pipeline will reject the output. This includes
   numbers, tools, team members, revenue, customers.
2. If the original is already strong (specific, quantified, active), the
   rewrites array can be just [{"text": <original>, "confidence": "verbatim"}].
   Do NOT invent alternatives for the sake of alternatives.
3. NEVER produce more than 3 rewrites. Verbatim + one outcome_reframed
   + optionally one quantified_estimate.
`.trim();

export interface EnrichInput {
  facts: CvFacts;
  jd?: JdSpec;
  /** Max concurrent per-achievement LLM calls. Default 4. */
  concurrency?: number;
}

/**
 * Enrich every achievement across every role in the CV.
 * Concurrency-bounded so we don't hammer OpenAI's rate limit on
 * senior candidates with 6+ roles × 8 bullets each = 48 parallel calls.
 */
export async function enrichFacts(input: EnrichInput): Promise<EnrichedFacts> {
  const { facts, jd } = input;
  const concurrency = Math.max(1, Math.min(10, input.concurrency ?? 4));

  // Flatten to (roleIndex, achievementIndex, text) so we can queue easily.
  type Job = { r: number; a: number; text: string };
  const jobs: Job[] = [];
  facts.roles.forEach((role, r) => {
    role.achievements.forEach((text, a) => jobs.push({ r, a, text }));
  });

  const results: (EnrichedAchievement | null)[][] = facts.roles.map((r) =>
    new Array(r.achievements.length).fill(null),
  );

  // Simple concurrency-limited worker pool.
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const idx = cursor++;
      const job = jobs[idx];
      if (!job) break;
      const role = facts.roles[job.r]!;
      results[job.r]![job.a] = await enrichOne(role, job.text, jd);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  return {
    ...facts,
    roles: facts.roles.map((role, r) => ({
      ...role,
      enrichedAchievements: results[r]!.map(
        (e, a) =>
          e ?? {
            // Fallback: if a single enrichment call failed (soft-fail
            // below returned null), fall back to verbatim so we never
            // lose a user's achievement.
            original: role.achievements[a]!,
            rewrites: [{ text: role.achievements[a]!, confidence: "verbatim" as const }],
          },
      ),
    })),
  };
}

async function enrichOne(
  role: CvFacts["roles"][number],
  achievement: string,
  jd?: JdSpec,
): Promise<EnrichedAchievement | null> {
  // Skip trivially short achievements — nothing to enrich.
  if (achievement.trim().length < 8) {
    return {
      original: achievement,
      rewrites: [{ text: achievement, confidence: "verbatim" }],
    };
  }

  const targetKeywords = jd?.keywordsForInjection?.slice(0, 8) ?? [];
  const userPayload = {
    ROLE: {
      title: role.title,
      employer: role.employer,
      tools: role.tools,
    },
    ACHIEVEMENT: achievement,
    ...(targetKeywords.length ? { TARGET_KEYWORDS: targetKeywords } : {}),
  };

  try {
    const completion = await openai.chat.completions.create(
      {
        model: "gpt-4o",
        temperature: 0.4,
        max_tokens: 500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
      },
      { timeout: 25_000 } as any,
    );

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);

    // Validate the shape and enforce the "always include verbatim" rule.
    const rewrites = Array.isArray(parsed.rewrites) ? parsed.rewrites : [];
    const cleaned = rewrites
      .filter(
        (r: any) =>
          typeof r?.text === "string" &&
          ["verbatim", "outcome_reframed", "quantified_estimate"].includes(r?.confidence),
      )
      .slice(0, 3);

    // Guarantee verbatim is present — Composer needs it as fallback.
    if (!cleaned.some((r: any) => r.confidence === "verbatim")) {
      cleaned.unshift({ text: achievement, confidence: "verbatim" });
    }

    return {
      original: achievement,
      rewrites: cleaned,
      clarifyingQuestions: Array.isArray(parsed.clarifyingQuestions)
        ? parsed.clarifyingQuestions
            .filter((q: any) => typeof q === "string")
            .slice(0, 2)
        : undefined,
    };
  } catch (err: any) {
    // Soft-fail — orchestrator's fallback wraps to verbatim.
    try {
      const { reportRejection } = await import("../sentry");
      reportRejection(err, "cv-ai/enricher");
    } catch { /* swallow */ }
    return null;
  }
}
