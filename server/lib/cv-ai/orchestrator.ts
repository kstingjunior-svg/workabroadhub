// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator — stitch the six passes together into one call.
//
// Callers (HTTP routes, cron jobs, tests) do not need to know about the
// pipeline shape. They pass in a raw CV + optional JD; they get back a
// GenerationResult.
//
// Passes actually invoked today: 1 (Extractor), 4 (Composer via
// runScoreGate), 6 (Score gate). Passes 2/3/5 have placeholder inlines
// below — swap them out for real modules as they land, no orchestrator
// change needed.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from "crypto";
import { extractFacts } from "./pass1-extractor";
import { enrichFacts } from "./pass2-enricher";
import { parseJd, selectStyle, buildStyleSeed } from "./pass3-style-jd";
import { runScoreGate } from "./pass6-score-gate";
import type {
  CvFacts, EnrichedFacts, StyleSpec, GenerationResult,
} from "./types";

export interface GenerateInput {
  /** Raw CV text (already extracted from PDF/DOCX by the caller). */
  cvText: string;
  /** Optional job description to tailor toward. */
  jdText?: string;
  /** Region controls CV conventions (photo, DOB, page count). */
  region?: StyleSpec["region"];
  /** Free-form industry label (drives per-industry banned phrases). */
  industry?: string;
  /**
   * Optional stable user identifier — passed to the style seed so
   * regenerations of the same source CV by the same user produce the same
   * voice/structure. Two different users on the same source still get
   * different styles.
   */
  userId?: string;
  /**
   * Which regeneration this is (0 = first, 1 = user hit "regenerate").
   * Bumping this rotates the style seed so the user can request a
   * genuinely different voice by clicking "try again".
   */
  generationN?: number;
}

export async function generateCv(input: GenerateInput): Promise<GenerationResult> {
  const { cvText, jdText } = input;
  const region = input.region ?? "KE";
  const industry = input.industry ?? "general";

  // ── Pass 1: Extractor ─────────────────────────────────────────────────
  const facts: CvFacts = await extractFacts(cvText);

  // ── Pass 3a: JD parser ────────────────────────────────────────────────
  // Run in parallel with the Enricher below since both are independent
  // — cuts total latency by ~2s on JD-tailored requests.
  const jdPromise = parseJd(jdText ?? "");

  // ── Pass 2: Enricher ──────────────────────────────────────────────────
  // Turns weak achievements into stronger candidates
  // (outcome_reframed, quantified_estimate) without inventing facts.
  // Concurrency-bounded so a 6-role senior CV doesn't fire 48 parallel
  // OpenAI calls.
  const [enriched, jd] = await Promise.all([
    enrichFacts({ facts, concurrency: 4 }),
    jdPromise,
  ]);

  // ── Pass 3b: Style selector ───────────────────────────────────────────
  // Deterministic + stochastic. Same user+source → same voice
  // (consistent regenerations). Different users → different voices
  // (uniqueness). Bump generationN to give the same user a fresh voice.
  const sourceHash = crypto
    .createHash("sha256")
    .update(cvText)
    .digest("hex")
    .slice(0, 16);
  const seed = input.userId
    ? buildStyleSeed(input.userId, sourceHash, input.generationN ?? 0)
    : undefined;
  const style: StyleSpec = selectStyle({
    facts, jd, region, industry, seed,
  });

  // ── Pass 4 + 6: Composer under Score-gate loop ────────────────────────
  const result = await runScoreGate({
    facts: enriched,
    style,
    inputCvText: cvText,
    jdText,
    // score defaults to server/lib/cv-ai/ats-scorer.ts — the same engine
    // the free /api/tools/ats-check uses.
  });

  return result;
}

// ─── Shared constants ────────────────────────────────────────────────────

/**
 * Global banned-phrase set. Per-industry additions come from
 * pass3-style-jd.ts INDUSTRY_BANNED. Eventually promote both to a
 * Postgres table (cv_banned_phrases) so admins can edit without a
 * deploy. Everything here is an LLM tell or corporate mush that has
 * zero information density in a real CV.
 */
export const DEFAULT_BANNED_PHRASES: string[] = [
  "results-driven",
  "detail-oriented",
  "team player",
  "hard-working",
  "self-starter",
  "go-getter",
  "think outside the box",
  "passionate about",
  "dynamic professional",
  "seasoned professional",
  "proven track record",
  "responsible for",
  "duties included",
  "utilize",
  "leverage",
  "synergize",
  "spearheaded",
  "curated",
  "in charge of",
  "worked on",
  "helped with",
];
