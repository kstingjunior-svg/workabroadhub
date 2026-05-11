// @ts-nocheck
/**
 * AI Usage Statistics — Redis-backed counters
 * ─────────────────────────────────────────────
 * Tracks real OpenAI token usage, job counts, and cumulative generation
 * time using Upstash Redis hash keys keyed by calendar date (EAT UTC+3).
 *
 * Key schema:  ai:stats:YYYY-MM-DD
 * Fields:
 *   tokens_in       — total prompt tokens today
 *   tokens_out      — total completion tokens today
 *   jobs_completed  — jobs that reached materials_ready today
 *   jobs_failed     — jobs that exhausted all retries today
 *   total_ms        — cumulative generation time in milliseconds today
 *
 * All writes are fire-and-forget (best-effort); failures never block the worker.
 */

import { redisConnection } from "./redis";

// ── Date key (EAT = UTC+3) ────────────────────────────────────────────────────

function todayKey(): string {
  const now = new Date(Date.now() + 3 * 60 * 60 * 1000); // UTC+3
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `ai:stats:${y}-${m}-${d}`;
}

// Keep keys for 8 days (the endpoint can serve a 7-day window)
const TTL_SECONDS = 8 * 24 * 60 * 60;

// ── Writes (fire-and-forget) ──────────────────────────────────────────────────

/** Called from the AI service with the actual token counts from OpenAI response. */
export async function trackTokenUsage(
  promptTokens: number,
  completionTokens: number,
): Promise<void> {
  const key = todayKey();
  try {
    await redisConnection.hincrby(key, "tokens_in",  promptTokens);
    await redisConnection.hincrby(key, "tokens_out", completionTokens);
    await redisConnection.expire(key, TTL_SECONDS);
  } catch (err: any) {
    console.warn("[AiStats] trackTokenUsage failed:", err?.message);
  }
}

/** Called by the worker when a job completes successfully. */
export async function trackJobCompleted(elapsedMs: number): Promise<void> {
  const key = todayKey();
  try {
    await redisConnection.hincrby(key, "jobs_completed", 1);
    await redisConnection.hincrby(key, "total_ms",       elapsedMs);
    await redisConnection.expire(key, TTL_SECONDS);
  } catch (err: any) {
    console.warn("[AiStats] trackJobCompleted failed:", err?.message);
  }
}

/** Called by the failure handler after all retries are exhausted. */
export async function trackJobFailed(): Promise<void> {
  const key = todayKey();
  try {
    await redisConnection.hincrby(key, "jobs_failed", 1);
    await redisConnection.expire(key, TTL_SECONDS);
  } catch (err: any) {
    console.warn("[AiStats] trackJobFailed failed:", err?.message);
  }
}

// ── Read ──────────────────────────────────────────────────────────────────────

export interface DailyAiStats {
  tokensIn:       number;
  tokensOut:      number;
  jobsCompleted:  number;
  jobsFailed:     number;
  totalMs:        number;
}

export async function readDailyStats(dateKey?: string): Promise<DailyAiStats> {
  const key = dateKey ?? todayKey();
  try {
    const raw = await redisConnection.hgetall(key);
    return {
      tokensIn:      Number(raw?.tokens_in      ?? 0),
      tokensOut:     Number(raw?.tokens_out     ?? 0),
      jobsCompleted: Number(raw?.jobs_completed ?? 0),
      jobsFailed:    Number(raw?.jobs_failed    ?? 0),
      totalMs:       Number(raw?.total_ms       ?? 0),
    };
  } catch (err: any) {
    console.warn("[AiStats] readDailyStats failed:", err?.message);
    return { tokensIn: 0, tokensOut: 0, jobsCompleted: 0, jobsFailed: 0, totalMs: 0 };
  }
}

// ── GPT-4o cost estimate ──────────────────────────────────────────────────────
// Pricing as of 2025-Q4: $2.50 / 1M input tokens, $10.00 / 1M output tokens

const COST_PER_1M_IN  = 2.50;
const COST_PER_1M_OUT = 10.00;

export function estimateCostUsd(tokensIn: number, tokensOut: number): number {
  return (
    (tokensIn  / 1_000_000) * COST_PER_1M_IN  +
    (tokensOut / 1_000_000) * COST_PER_1M_OUT
  );
}
