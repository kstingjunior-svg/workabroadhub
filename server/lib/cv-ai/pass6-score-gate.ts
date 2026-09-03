// ─────────────────────────────────────────────────────────────────────────────
// Pass 6 — Score Gate
//
// The trust promise. Every generated CV must beat the input by MIN_LIFT
// points on the same ATS engine we sell to users. If it doesn't, we
// regenerate with a diagnostic-driven prompt (up to MAX_RETRIES). If we
// still can't beat it, we surface an honest message rather than fake
// numbers — the input CV is already strong, upsell to expert review.
//
// This pass has NO creativity. It's a pure loop:
//
//   for attempt in 1..MAX_RETRIES:
//     rewrite = compose(facts, style, hardModeDiagnostic?)
//     outputScore = ats.score(rewrite)
//     if outputScore >= inputScore + MIN_LIFT: return rewrite
//     hardModeDiagnostic = diagnose(inputScore, outputScore, missingKeywords)
//   return honest_fallback(bestAttempt)
//
// Cost: on happy path, zero (uses Pass 4's output directly). On retries,
// N × Composer cost. Cap the loop to keep spend bounded.
// ─────────────────────────────────────────────────────────────────────────────

import type { EnrichedFacts, StyleSpec, AtsScore, GenerationResult } from "./types";
import { composeCv } from "./pass4-composer";

/** Minimum score improvement we promise the user. */
export const MIN_LIFT = 15;

/** How many times Pass 4 is allowed to retry before we give up honestly. */
export const MAX_RETRIES = 3;

/**
 * Score a CV using the same engine the /tools/ats-cv-checker route uses.
 * Injected as a dependency so we don't couple pipeline to the current
 * route file layout — tests can pass a stub, Next.js port can pass a fresh
 * wrapper.
 */
export type AtsScorer = (cvText: string, jd?: string) => Promise<AtsScore>;

export interface ScoreGateInput {
  facts: EnrichedFacts;
  style: StyleSpec;
  inputCvText: string;        // original source CV — for input score baseline
  jdText?: string;
  score: AtsScorer;
}

export async function runScoreGate(input: ScoreGateInput): Promise<GenerationResult> {
  const { facts, style, inputCvText, jdText, score } = input;

  const inputScore = await score(inputCvText, jdText);

  let bestAttempt: { md: string; score: AtsScore } | null = null;
  let styleForAttempt = style;
  let retries = 0;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    const md = await composeCv(facts, styleForAttempt);
    const scored = await score(md, jdText);

    // Track the best attempt we've seen, in case we exhaust retries and
    // need to hand the user something (still probably better than input).
    if (!bestAttempt || scored.score > bestAttempt.score.score) {
      bestAttempt = { md, score: scored };
    }

    if (scored.score >= inputScore.score + MIN_LIFT) {
      return {
        cvMarkdown: md,
        inputScore,
        outputScore: scored,
        improvement: scored.score - inputScore.score,
        retries,
        styleSpec: styleForAttempt,
        facts,
      };
    }

    // Regenerate with a diagnostic hint. Do NOT overwrite the original
    // style — only augment banned-phrases and inject a hard-mode signal
    // into the JD keyword list so the Composer emphasises them.
    if (attempt <= MAX_RETRIES) {
      retries++;
      styleForAttempt = deriveHardMode(styleForAttempt, inputScore, scored);
    }
  }

  // Retries exhausted. Return the best we managed, but flag honestly.
  // The caller (UI) should show a "your CV is already strong, N-point
  // lift" banner and offer the human-review upsell rather than pretending
  // we hit the promise.
  return {
    cvMarkdown: bestAttempt!.md,
    inputScore,
    outputScore: bestAttempt!.score,
    improvement: bestAttempt!.score.score - inputScore.score,
    retries,
    styleSpec: styleForAttempt,
    facts,
  };
}

/**
 * Build a hard-mode style spec by pulling weaknesses out of the score
 * diagnostic and promoting them into the Composer's must-include set.
 */
function deriveHardMode(
  style: StyleSpec,
  inputScore: AtsScore,
  attemptScore: AtsScore,
): StyleSpec {
  const missingNow = new Set([
    ...(attemptScore.missingKeywords ?? []),
    ...(inputScore.missingKeywords ?? []),
  ]);

  // If we already had a JD, extend its injection list with the missing
  // keywords the ATS engine flagged. If we didn't, synthesise a minimal
  // JD spec so the Composer treats these as mandatory.
  const nextJd = style.jd
    ? {
        ...style.jd,
        keywordsForInjection: dedupe([
          ...style.jd.keywordsForInjection,
          ...missingNow,
        ]),
      }
    : {
        mustHaveHardSkills: Array.from(missingNow),
        niceToHaveHardSkills: [],
        softSignals: [],
        tone: "formal" as const,
        employerArchetype: "unknown" as const,
        seniorityMarkers: [],
        keywordsForInjection: Array.from(missingNow),
      };

  return {
    ...style,
    jd: nextJd,
    // Add a synthetic banned phrase forcing the Composer away from
    // whatever it produced last time (weak Summary is the usual culprit).
    bannedPhrases: dedupe([
      ...style.bannedPhrases,
      ...(attemptScore.weaknesses ?? [])
        .filter((w) => w.toLowerCase().includes("summary"))
        .map(() => "results-driven"),
    ]),
  };
}

function dedupe<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}
