// ─────────────────────────────────────────────────────────────────────────────
// Uniqueness gate + persistence
//
// The "no two CVs look alike" promise, made measurable.
//
// After a generation completes, embed the CV with OpenAI
// text-embedding-3-small, cosine-compare against the last N CVs in the
// same (industry, seniority_band) bucket, and:
//
//   • similar >= 0.85 → flag `uniquenessWarning: true` on the response,
//                       log it, save with the warning. We do NOT retry —
//                       the trust promise is score, not uniqueness. But
//                       we surface the fact so we can see how often it
//                       fires and iterate on Composer prompts if needed.
//   • similar <  0.85 → pass, save normally.
//
// Save is fire-and-forget from the caller's perspective — a failure to
// write the audit row must NOT block the user from receiving their CV.
//
// Cost: text-embedding-3-small is ~$0.02 per 1M tokens. A CV is ~500-1000
// tokens. So ~$0.00002 per embedding. Trivial.
// ─────────────────────────────────────────────────────────────────────────────

import { openai } from "../openai";
import { pool } from "../../db";
import { isVectorEnabled } from "./db-bootstrap";
import type { GenerationResult, StyleSpec } from "./types";

const SIMILARITY_THRESHOLD = 0.85;
const NEIGHBOUR_LOOKUP_LIMIT = 100;

export interface UniquenessResult {
  /** false = a near-duplicate was found in the bucket; true = clean. */
  isUnique: boolean;
  /** Highest cosine similarity we found in the neighbour set (0-1). */
  closestSim: number;
  /** id of the closest neighbour, if any. */
  closestId: string | null;
  /** How many rows we compared against. */
  neighbourCount: number;
}

/**
 * Embed the CV text using OpenAI's small embedding model.
 * Returns null on any failure (rate limit, timeout, etc.) — the caller
 * should treat null as "uniqueness disabled" and continue.
 */
async function embed(text: string): Promise<number[] | null> {
  try {
    const res = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text.slice(0, 8000),
    });
    return res.data[0]?.embedding ?? null;
  } catch (err: any) {
    try {
      const { reportRejection } = await import("../sentry");
      reportRejection(err, "cv-ai/embed");
    } catch {}
    return null;
  }
}

/** pgvector expects the literal "[0.1,0.2,...]" text format. */
function toPgVector(v: number[]): string {
  return "[" + v.map((n) => n.toString()).join(",") + "]";
}

/**
 * Check whether a candidate CV is sufficiently different from recent
 * generations in the same industry+seniority bucket. Never throws —
 * on error, returns { isUnique: true } to fail open (better to serve a
 * possibly-duplicate CV than to block a paying user on a Postgres hiccup).
 */
export async function checkUniqueness(input: {
  cvMarkdown: string;
  industry: string;
  seniorityBand: string;
}): Promise<UniquenessResult & { embedding: number[] | null }> {
  const failOpen = {
    isUnique: true,
    closestSim: 0,
    closestId: null,
    neighbourCount: 0,
    embedding: null,
  };

  if (!isVectorEnabled()) return failOpen;

  const emb = await embed(input.cvMarkdown);
  if (!emb) return failOpen;

  try {
    // Compare against the last NEIGHBOUR_LOOKUP_LIMIT rows in the same
    // bucket. Cosine distance operator is `<=>`; similarity = 1 - distance.
    const { rows } = await pool.query<{ id: string; sim: number }>(
      `SELECT id, 1 - (embedding <=> $1::vector) AS sim
         FROM cv_generations
        WHERE industry = $2
          AND seniority_band = $3
          AND embedding IS NOT NULL
        ORDER BY created_at DESC
        LIMIT $4`,
      [toPgVector(emb), input.industry, input.seniorityBand, NEIGHBOUR_LOOKUP_LIMIT],
    );

    let closest = 0;
    let closestId: string | null = null;
    for (const r of rows) {
      const sim = Number(r.sim);
      if (sim > closest) { closest = sim; closestId = r.id; }
    }

    return {
      isUnique: closest < SIMILARITY_THRESHOLD,
      closestSim: closest,
      closestId,
      neighbourCount: rows.length,
      embedding: emb,
    };
  } catch (err: any) {
    try {
      const { reportRejection } = await import("../sentry");
      reportRejection(err, "cv-ai/uniqueness-check");
    } catch {}
    return { ...failOpen, embedding: emb };
  }
}

/**
 * Persist a completed generation for future uniqueness comparisons +
 * admin auditing. Fire-and-forget — never throws to the caller. If the
 * write fails, we lose the audit row but the user still gets their CV.
 */
export async function saveGeneration(args: {
  userId?: string | null;
  sourceHash: string;
  jdHash?: string | null;
  result: GenerationResult;
  hitTarget: boolean;
  generationMs: number;
  embedding: number[] | null;
}): Promise<void> {
  const { userId, sourceHash, jdHash, result, hitTarget, generationMs, embedding } = args;
  const style: StyleSpec = result.styleSpec;

  try {
    if (embedding && isVectorEnabled()) {
      await pool.query(
        `INSERT INTO cv_generations
          (user_id, source_hash, jd_hash, industry, seniority_band,
           voice, structure, region, input_score, output_score,
           improvement, retries, hit_target, cv_markdown,
           generation_ms, embedding)
         VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::vector)`,
        [
          userId ?? null, sourceHash, jdHash ?? null, style.industry, style.seniorityBand,
          style.voice, style.structure, style.region,
          result.inputScore.score, result.outputScore.score,
          result.improvement, result.retries, hitTarget, result.cvMarkdown,
          generationMs, toPgVector(embedding),
        ],
      );
    } else {
      await pool.query(
        `INSERT INTO cv_generations
          (user_id, source_hash, jd_hash, industry, seniority_band,
           voice, structure, region, input_score, output_score,
           improvement, retries, hit_target, cv_markdown, generation_ms)
         VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          userId ?? null, sourceHash, jdHash ?? null, style.industry, style.seniorityBand,
          style.voice, style.structure, style.region,
          result.inputScore.score, result.outputScore.score,
          result.improvement, result.retries, hitTarget, result.cvMarkdown,
          generationMs,
        ],
      );
    }
  } catch (err: any) {
    console.warn(`[cv-ai/saveGeneration] persist failed: ${err?.message}`);
    try {
      const { reportRejection } = await import("../sentry");
      reportRejection(err, "cv-ai/save-generation");
    } catch {}
  }
}

export { SIMILARITY_THRESHOLD };
