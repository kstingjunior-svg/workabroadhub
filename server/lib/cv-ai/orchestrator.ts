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

import { extractFacts } from "./pass1-extractor";
import { enrichFacts } from "./pass2-enricher";
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
}

export async function generateCv(input: GenerateInput): Promise<GenerationResult> {
  const { cvText, jdText } = input;
  const region = input.region ?? "KE";
  const industry = input.industry ?? "general";

  // ── Pass 1: Extractor ─────────────────────────────────────────────────
  const facts: CvFacts = await extractFacts(cvText);

  // ── Pass 2: Enricher ──────────────────────────────────────────────────
  // Real Enricher: turns weak achievements into stronger candidates
  // (outcome_reframed, quantified_estimate) without inventing facts.
  // This is the single biggest quality lever in the pipeline — before
  // this landed, verbatim-only enrichment meant the score gate almost
  // always fell short of the +15 promise on any CV that wasn't already
  // quantified. Concurrency-bounded so a 6-role senior CV doesn't fire
  // 48 parallel OpenAI calls.
  const enriched: EnrichedFacts = await enrichFacts({ facts, concurrency: 4 });

  // ── Pass 3 placeholder: deterministic sensible defaults ───────────────
  // Real Style selector will hash (userId, generationN) into a permutation
  // table and parse the JD into a JdSpec. Until then, pick sane defaults
  // from what we can infer.
  const seniority = inferSeniority(facts);
  const style: StyleSpec = {
    voice: seniority === "exec" ? "formal-classic" : "punchy-modern",
    structure: facts.roles.length >= 3 ? "chronological" : "skills-forward",
    sectionOrder: [
      "Summary",
      "Experience",
      "Skills",
      "Education",
      "Certifications",
      "Languages",
    ],
    region,
    seniorityBand: seniority,
    industry,
    bannedPhrases: DEFAULT_BANNED_PHRASES,
    // No JD parsing yet — leave jd undefined so Composer skips tailoring.
    // When Pass 3 lands, parse jdText into JdSpec and attach here.
  };

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

// ─── Placeholders that live here until their real passes land ────────────

function inferSeniority(facts: CvFacts): StyleSpec["seniorityBand"] {
  // Rough: years since earliest role start.
  const starts = facts.roles
    .map((r) => Date.parse(r.start))
    .filter((n) => !isNaN(n));
  if (!starts.length) return "mid";
  const earliestYear = new Date(Math.min(...starts)).getFullYear();
  const years = new Date().getFullYear() - earliestYear;
  const titles = facts.roles.map((r) => r.title.toLowerCase()).join(" ");

  if (/(chief|c\w+o|vp|vice president|founder|director|head of)/.test(titles)) return "exec";
  if (years >= 10) return "lead";
  if (years >= 5) return "senior";
  if (years >= 2) return "mid";
  return "entry";
}

/**
 * Global banned-phrase set. Per-industry additions come from the future
 * cv_banned_phrases table (Postgres). Everything here is an LLM tell or
 * corporate mush that has zero information density in a real CV.
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
