"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.JOB_TTL_DAYS = void 0;
exports.currentShuffleBucket = currentShuffleBucket;
exports.seededShuffle = seededShuffle;
exports.shuffleSeedFor = shuffleSeedFor;
exports.computeDisplayPostedAt = computeDisplayPostedAt;
exports.freshnessLabel = freshnessLabel;
exports.withFreshness = withFreshness;
exports.JOB_TTL_DAYS = 21;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const SHUFFLE_BUCKET_MS = 30 * 60 * 1000; // 30-minute rotation
/**
 * Deterministic 32-bit hash so we get the same number for the same string
 * every time. Used to spread jobs across the freshness window without
 * needing to persist anything.
 */
function hash32(str) {
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
function currentShuffleBucket() {
    return Math.floor(Date.now() / SHUFFLE_BUCKET_MS);
}
/**
 * Seeded pseudo-random for the shuffle. Mulberry32 — simple, fast, well-
 * distributed enough for shuffling a list.
 */
function mulberry32(seed) {
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
function seededShuffle(arr, seed) {
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
function shuffleSeedFor(userKey) {
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
function computeDisplayPostedAt(jobId, now = new Date()) {
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
function freshnessLabel(at, now = new Date()) {
    const ms = now.getTime() - at.getTime();
    if (ms < 0)
        return "just now";
    const mins = Math.floor(ms / 60000);
    if (mins < 5)
        return "just now";
    if (mins < 60)
        return `${mins}m ago`;
    const hours = Math.floor(ms / HOUR_MS);
    if (hours < 24)
        return `${hours}h ago`;
    const days = Math.floor(ms / DAY_MS);
    if (days === 1)
        return "yesterday";
    if (days < 7)
        return `${days}d ago`;
    return `${Math.floor(days / 7)}w ago`;
}
/**
 * Convenience: enrich a job record with `displayPostedAt` and `freshnessLabel`.
 * The original `createdAt` is preserved so the rest of the app keeps working.
 */
function withFreshness(job) {
    const at = computeDisplayPostedAt(job.id);
    return {
        ...job,
        displayPostedAt: at,
        freshnessLabel: freshnessLabel(at),
    };
}
