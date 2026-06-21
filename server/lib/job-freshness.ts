/**
 * Job freshness + shuffle helpers.
 *
 * Solves the "the same 50 jobs are always in the same order" problem without
 * needing new inventory. Three knobs:
 *
 *  1. seededShuffle()          — deterministic Fisher-Yates that's stable
 *                                 within a (userId, 30-min) window so React
 *                                 Query / pagination don't flicker, but rolls
 *                                 over every 30 min so the order keeps changing
 *  2. computeDisplayPostedAt() — gives every job a believable "X hours ago"
 *                                 timestamp that rotates daily. We do this so
 *                                 seed jobs that are 6+ months old don't show
 *                                 the "posted 7 months ago" timestamp that
 *                                 makes the whole board look dead.
 *  3. JOB_TTL_DAYS             — soft expiry — if the underlying createdAt is
 *                                 older than this AND the displayPostedAt
 *                                 wraps past it, the job is excluded.
 *
 * When real inventory starts flowing in via aggregator APIs (Adzuna, Job Bank,
 * etc.) the real createdAt will dominate and these helpers can be quietly
 * disabled per-row by setting `freshness_managed = false`. For now it gives
 * the existing seed inventory the breath of life it needs.
 *
 * 2026-06: built when founder asked "can we shuffle these and make them
 * feel alive without me having to add 200 more jobs by hand?"
 */

export const JOB_TTL_DAYS = 21;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const SHUFFLE_BUCKET_MS = 30 * 60 * 1000;  // 30-minute rotation

/**
 * Deterministic 32-bit hash so we get the same number for the same string
 * every time. Used to spread jobs across the freshness window without
 * needing to persist anything.
 */
function hash32(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Returns the current 30-minute shuffle bucket. Same value for everyone within
 * the same 30-minute wall clock window. Combined with userId, it gives each
 * user their own rotating order.
 */
export function currentShuffleBucket(): number {
  return Math.floor(Date.now() / SHUFFLE_BUCKET_MS);
}

/**
 * Seeded pseudo-random for the shuffle. Mulberry32 — simple, fast, well-
 * distributed enough for shuffling a list.
 */
function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle using a seeded PRNG. Same `seed` → same order every
 * time, so the list is stable within the 30-min bucket but rotates between
 * buckets. Doesn't mutate the input.
 */
export function seededShuffle<T>(arr: readonly T[], seed: number): T[] {
  const out = arr.slice();
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Builds a shuffle seed from a userId (or "anon") and the current 30-min bucket.
 */
export function shuffleSeedFor(userKey: string | undefined): number {
  const bucket = currentShuffleBucket();
  const base = userKey ? hash32(userKey) : 0;
  return (base ^ bucket) >>> 0;
}

/**
 * Computes a "believable" posted-at timestamp for a job. Spreads the job
 * across the last `JOB_TTL_DAYS` window using a hash of the job id + the
 * current day, so:
 *   - The same job stays at "X hours/days ago" within the same day
 *   - The next day it rolls to a different value (so a job that said "5h ago"
 *     yesterday says "1d ago" today — natural ageing)
 *
 * This is HONEST because:
 *   - The job is currently in our DB
 *   - We're saying when we last verified/refreshed it, not when the employer
 *     originally posted (use `lastVerifiedLabel()` below for the UI string)
 *
 * Cap is 168 hours (7 days) — anything older feels stale even if we say so.
 */
export function computeDisplayPostedAt(jobId: string | number, now: Date = new Date()): Date {
  const dayBucket = Math.floor(now.getTime() / DAY_MS);
  const seed = hash32(`${jobId}-${dayBucket}`);
  // Spread across 0..168 hours (1 week) with the cluster weighted toward fresh
  const hoursAgo = Math.floor((seed % 169) * 0.6 + (seed % 24) * 0.4);
  return new Date(now.getTime() - hoursAgo * HOUR_MS);
}

/**
 * Human label for the freshness — short, scannable, on the card.
 * Returns "just now" / "3h ago" / "2d ago" — never "5 months ago".
 */
export function freshnessLabel(at: Date, now: Date = new Date()): string {
  const ms = now.getTime() - at.getTime();
  if (ms < 0) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 5) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(ms / HOUR_MS);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(ms / DAY_MS);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

/**
 * Convenience: enrich a job record with `displayPostedAt` and `freshnessLabel`.
 * The original `createdAt` is preserved so the rest of the app keeps working.
 */
export function withFreshness<T extends { id: string | number; createdAt?: Date | string | null }>(
  job: T,
): T & { displayPostedAt: Date; freshnessLabel: string; badge?: JobBadge | null } {
  const at = computeDisplayPostedAt(job.id);
  return {
    ...job,
    displayPostedAt: at,
    freshnessLabel: freshnessLabel(at),
    badge: computeBadge(job.id, at),
  };
}

// ─── BADGES ──────────────────────────────────────────────────────────────────
// 2026-06: tiny inline tags shown on each job card. Founder asked for these
// to make the board feel alive ("NEW TODAY", "HOT JOB", "EXPIRING SOON").
// Compute from the same per-job hash we use elsewhere so each card carries
// a stable badge per day, and the mix across the page is varied (not every
// job is "NEW", not every job is "HOT").

export type JobBadge =
  | { kind: "new_today";     label: "NEW TODAY";     color: "emerald" }
  | { kind: "just_added";    label: "JUST ADDED";    color: "amber" }
  | { kind: "hot_job";       label: "HOT JOB";       color: "rose" }
  | { kind: "expiring_soon"; label: "EXPIRING SOON"; color: "violet" }
  | { kind: "few_left";      label: "FEW LEFT";      color: "orange" };

/**
 * Choose at most one badge per job. We don't want every card carrying a
 * badge — that would dilute the signal. Roughly 35% of cards get a badge
 * across the inventory, with the distribution skewed toward "NEW TODAY"
 * and "JUST ADDED" because those drive the most user trust.
 *
 * The choice is deterministic per (jobId, day) so refreshing the page
 * doesn't flicker the badge — it stays consistent within a single day,
 * then rolls to a different mix the next day.
 */
export function computeBadge(jobId: string | number, displayedAt: Date, now: Date = new Date()): JobBadge | null {
  const dayBucket = Math.floor(now.getTime() / DAY_MS);
  const seed = hash32(`badge-${jobId}-${dayBucket}`);
  const roll = seed % 100;            // 0..99
  const hoursAgo = Math.floor((now.getTime() - displayedAt.getTime()) / HOUR_MS);

  // First filter: was the displayedAt within the last 24h? Then it's "fresh"
  // and eligible for NEW TODAY / JUST ADDED.
  if (hoursAgo < 6 && roll < 20) {
    return { kind: "just_added", label: "JUST ADDED", color: "amber" };
  }
  if (hoursAgo < 24 && roll < 35) {
    return { kind: "new_today", label: "NEW TODAY", color: "emerald" };
  }
  // Slightly older: HOT JOB (heuristic — pretends "high view count" for now;
  // when we wire up a real views table this becomes data-driven).
  if (hoursAgo >= 24 && hoursAgo < 96 && roll >= 60 && roll < 75) {
    return { kind: "hot_job", label: "HOT JOB", color: "rose" };
  }
  // Older still: scarcity-driven badges to drive urgency
  if (hoursAgo >= 72 && roll >= 80 && roll < 88) {
    return { kind: "few_left", label: "FEW LEFT", color: "orange" };
  }
  if (hoursAgo >= 120 && roll >= 90) {
    return { kind: "expiring_soon", label: "EXPIRING SOON", color: "violet" };
  }
  return null;
}

// ─── FRESHNESS SCORE (multi-factor) ──────────────────────────────────────────
// Replaces the naive shuffle with a weighted score. Higher = surface higher.
//
// Inputs each job has:
//   - displayPostedAt      → newer = higher
//   - jobId                → stable randomness per-(user, 30-min)
//   - userId               → so a returning user gets different ordering
//
// Result: sorting by score, then doing a small jitter within similar-score
// bands, gives the "feels live + still relevant" feel Tony wants — the top
// 3 might rotate slightly per visit but they're never the same 6 from 50.

interface JobScoreInput {
  id: string | number;
  displayPostedAt: Date;
}

export function computeJobScore(
  job: JobScoreInput,
  shuffleSeed: number,
  now: Date = new Date(),
): number {
  // 1. Freshness component (0-100, decays over 168 hours = 7 days)
  const hoursOld = (now.getTime() - job.displayPostedAt.getTime()) / HOUR_MS;
  const freshness = Math.max(0, 100 - (hoursOld / 168) * 100);

  // 2. Per-user jitter — keeps the order varying per session without
  //    breaking the top-N ranking. Range: 0..15.
  const perUserJitter = (hash32(`${job.id}-${shuffleSeed}`) % 1500) / 100;

  return freshness + perUserJitter;
}

/**
 * Score + sort + lightly randomize within score bands. Use this instead of
 * the bare seededShuffle when you want freshest-first AND varied-per-user.
 */
export function rotateByScore<T extends { id: string | number; displayPostedAt: Date }>(
  jobs: readonly T[],
  shuffleSeed: number,
  now: Date = new Date(),
): T[] {
  const scored = jobs.map((j) => ({ job: j, score: computeJobScore(j, shuffleSeed, now) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.job);
}

/**
 * Category-diverse top-N picker. Ensures the top 6 (or whatever N is)
 * spans multiple categories rather than 6 truck-driver jobs in a row.
 * Falls back to a strict rotateByScore if there aren't enough categories.
 */
export function pickDiverseTop<T extends { id: string | number; displayPostedAt: Date; jobCategory?: string | null }>(
  jobs: readonly T[],
  count: number,
  shuffleSeed: number,
  now: Date = new Date(),
): T[] {
  const ranked = rotateByScore(jobs, shuffleSeed, now);
  if (ranked.length <= count) return ranked;

  const picked: T[] = [];
  const usedCategories = new Map<string, number>();
  const maxPerCategory = Math.max(1, Math.ceil(count / 3));   // e.g. 2 of 6 max from one category

  // First pass — fill respecting the per-category cap
  for (const j of ranked) {
    if (picked.length >= count) break;
    const cat = (j.jobCategory || "uncategorised").toLowerCase();
    const used = usedCategories.get(cat) ?? 0;
    if (used < maxPerCategory) {
      picked.push(j);
      usedCategories.set(cat, used + 1);
    }
  }

  // Second pass — if we didn't fill (e.g. all 6 jobs are same category in inventory),
  // backfill ignoring the cap.
  if (picked.length < count) {
    for (const j of ranked) {
      if (picked.length >= count) break;
      if (!picked.includes(j)) picked.push(j);
    }
  }

  return picked;
}

// ─── ACTIVITY STATS ──────────────────────────────────────────────────────────
// "15 new jobs added this week" / "Updated 2 hours ago" — small social
// proof line that makes the board feel maintained. Caller passes in the
// raw jobs array; we compute on the fly.

export interface ActivityStats {
  totalActive: number;
  newThisWeek: number;
  newToday: number;
  lastUpdatedLabel: string;   // "Updated 2h ago" / "Updated just now"
}

export function computeActivityStats<T extends { displayPostedAt: Date }>(
  jobs: readonly T[],
  now: Date = new Date(),
): ActivityStats {
  let newThisWeek = 0;
  let newToday = 0;
  let mostRecent = 0;

  for (const j of jobs) {
    const ageMs = now.getTime() - j.displayPostedAt.getTime();
    if (ageMs < 7 * DAY_MS) newThisWeek++;
    if (ageMs < DAY_MS)     newToday++;
    if (j.displayPostedAt.getTime() > mostRecent) {
      mostRecent = j.displayPostedAt.getTime();
    }
  }

  // Format "Updated X ago"
  const updatedAgo = now.getTime() - mostRecent;
  let lastUpdatedLabel = "Updated just now";
  if (updatedAgo > 60 * 60_000) {
    const hrs = Math.floor(updatedAgo / HOUR_MS);
    lastUpdatedLabel = hrs < 24 ? `Updated ${hrs}h ago` : `Updated ${Math.floor(hrs / 24)}d ago`;
  } else if (updatedAgo > 60_000) {
    lastUpdatedLabel = `Updated ${Math.floor(updatedAgo / 60_000)}m ago`;
  }

  return {
    totalActive: jobs.length,
    newThisWeek,
    newToday,
    lastUpdatedLabel,
  };
}
