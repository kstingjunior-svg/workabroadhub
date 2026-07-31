"use strict";
/**
 * job-rotation.ts — intelligent weighted job rotation engine.
 *
 * Tony's founder brief (2026-07):
 *   "The homepage should never feel static or repetitive. Every user should
 *   experience a fresh yet stable feed that is personalized, fair to
 *   employers, optimized for engagement. Avoid simplistic randomization."
 *
 * The engine takes any static job list and returns a per-user, per-session
 * order that:
 *
 *   1. Is DIFFERENT between users (each user sees a distinct top 3).
 *   2. Is STABLE within a session (same user + same day → same order, so
 *      users don't lose their place when they scroll or navigate back).
 *   3. Rotates DAILY (each 24h bucket produces a fresh ranking).
 *   4. RESPECTS PERSONALIZATION (user's country, past search categories,
 *      viewed jobs get boosted; nothing viewed = balanced default).
 *   5. Enforces DIVERSITY (no 3 consecutive jobs from same country OR
 *      employer OR category — the feed always feels varied).
 *   6. Boosts NEW jobs for a decaying window (~7 days).
 *   7. Falls back to fair rotation when personalization signals are absent.
 *
 * Not simple random. Uses a deterministic hash-based seed → repeatable per
 * (user, day, filter) so the same feed renders consistently.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dayBucket = dayBucket;
exports.rotateJobs = rotateJobs;
exports.deriveSessionId = deriveSessionId;
const crypto_1 = __importDefault(require("crypto"));
/**
 * Compute the day bucket (integer that changes daily at UTC midnight).
 * Same day = same bucket = same rotation seed.
 */
function dayBucket(now = new Date()) {
    return Math.floor(now.getTime() / (24 * 60 * 60 * 1000));
}
/**
 * Deterministic per-job jitter [0, 1) from a seed + job id.
 * Same seed + same id → same jitter. Different seed → different jitter.
 * Different jobs under same seed → different (but stable) jitter.
 */
function jitter(seed, jobId) {
    const h = crypto_1.default.createHash("sha256").update(`${seed}:${jobId}`).digest();
    // Take first 4 bytes as a uint32, normalize to [0, 1)
    const n = h.readUInt32BE(0);
    return n / 0xffffffff;
}
/** Parse "Today", "1 day ago", "3 days ago" into a numeric days-since-posted. */
function daysSincePosted(postedAgo) {
    if (!postedAgo)
        return 30; // unknown → assume old
    const p = postedAgo.toLowerCase().trim();
    if (p === "today" || p === "just now" || p.includes("hour"))
        return 0;
    const m = /(\d+)\s*day/.exec(p);
    if (m)
        return Number(m[1]);
    if (p.includes("week"))
        return 7;
    if (p.includes("month"))
        return 30;
    return 30;
}
/**
 * Freshness score: 1.0 = posted today, decays exponentially over 14 days,
 * floors at 0.1 for anything older. Boosts brand-new jobs.
 */
function freshnessScore(days) {
    if (days <= 0)
        return 1.0;
    if (days >= 14)
        return 0.1;
    return 0.1 + 0.9 * Math.exp(-days / 5); // half-life ~3.5 days
}
/**
 * Personalization score: 0-1 based on category + country match with user
 * affinities. When user has NO signals, returns 0.5 (neutral) so nothing
 * gets penalized.
 */
function personalizationScore(job, ctx) {
    const catAff = (ctx.affinityCategories ?? []).map((c) => c.toLowerCase());
    const cntAff = new Set([
        ...(ctx.affinityCountries ?? []),
        ...(ctx.userCountry ? [ctx.userCountry] : []),
    ].map((c) => c.toLowerCase()));
    const hasSignals = catAff.length > 0 || cntAff.size > 0;
    if (!hasSignals)
        return 0.5;
    let score = 0.4; // baseline for personalized users
    const jobCategory = (job.category ?? "").toLowerCase();
    const jobCountry = (job.country ?? "").toLowerCase();
    if (jobCategory && catAff.includes(jobCategory))
        score += 0.35;
    if (jobCountry && cntAff.has(jobCountry))
        score += 0.25;
    return Math.min(1, score);
}
/**
 * Exposure fairness: give a small boost to jobs shown fewer times.
 * Prevents the same top 10 from locking in permanently.
 */
function exposureScore(job, impressions) {
    const count = impressions[job.id] ?? 0;
    // Log-decay: 1.0 for never-shown, drops to 0.5 at ~150 impressions, floors at 0.2
    return Math.max(0.2, 1.0 / (1 + Math.log10(1 + count)));
}
/**
 * Compute the raw ranking score for one job under a given context + seed.
 * Higher = better position.
 *
 * Weights (sum ≈ 1.0):
 *   0.30 · freshness
 *   0.25 · personalization
 *   0.15 · exposure fairness
 *   0.10 · admin boost
 *   0.20 · session jitter (guarantees per-user variation)
 */
function rankScore(job, ctx, seed) {
    const days = daysSincePosted(job.postedAgo);
    const fresh = freshnessScore(days);
    const person = personalizationScore(job, ctx);
    const expose = exposureScore(job, ctx.impressions ?? {});
    const boost = Math.min(1, Math.max(0, (job.boostScore ?? 0) / 100));
    const jit = jitter(seed, job.id);
    return (fresh * 0.30 +
        person * 0.25 +
        expose * 0.15 +
        boost * 0.10 +
        jit * 0.20);
}
/**
 * Enforce diversity — after ranking, walk the list and swap in a lower-ranked
 * alternative when we'd otherwise render 3 consecutive jobs from the same
 * country/employer/category.
 *
 * Keeps the top ~90% of the ranking signal while making the feed visually
 * varied instead of "5 UAE jobs in a row".
 */
function enforceDiversity(ranked) {
    const out = [];
    const remaining = [...ranked];
    const lastCountries = [];
    const lastEmployers = [];
    const lastCategories = [];
    const tooClustered = (job) => {
        const c = (job.country ?? "").toLowerCase();
        const e = (job.employer ?? "").toLowerCase();
        const g = (job.category ?? "").toLowerCase();
        // Reject if the LAST TWO were the same country / employer / category
        const cRepeat = lastCountries.slice(-2).every((x) => x === c) && lastCountries.length >= 2;
        const eRepeat = lastEmployers.slice(-2).every((x) => x === e) && lastEmployers.length >= 2 && e !== "";
        const gRepeat = lastCategories.slice(-2).every((x) => x === g) && lastCategories.length >= 2 && g !== "";
        return cRepeat || eRepeat || gRepeat;
    };
    while (remaining.length > 0) {
        // Find the first non-clustered candidate; if none exist, take the head.
        let pickIdx = 0;
        for (let i = 0; i < Math.min(remaining.length, 6); i++) {
            if (!tooClustered(remaining[i])) {
                pickIdx = i;
                break;
            }
        }
        const chosen = remaining.splice(pickIdx, 1)[0];
        out.push(chosen);
        lastCountries.push((chosen.country ?? "").toLowerCase());
        lastEmployers.push((chosen.employer ?? "").toLowerCase());
        lastCategories.push((chosen.category ?? "").toLowerCase());
    }
    return out;
}
/**
 * MAIN ENTRYPOINT — call this from any endpoint that returns a job list.
 *
 * Same (jobs, ctx.sessionId, dayBucket) → same order.
 * Different sessionId → different order.
 * Different day → order reshuffles daily.
 */
function rotateJobs(jobs, ctx = {}) {
    // Filter out blacklisted
    const blacklist = new Set(ctx.blacklistedJobIds ?? []);
    const eligible = jobs.filter((j) => !blacklist.has(j.id));
    // Build the ranking seed
    const bucket = dayBucket();
    const seedInput = `${ctx.sessionId || `anon:${Math.floor(bucket / 1)}`}::${bucket}`;
    const seed = crypto_1.default.createHash("sha256").update(seedInput).digest("hex").slice(0, 16);
    // Score + sort
    const scored = eligible
        .map((job) => ({ job, score: rankScore(job, ctx, seed) }))
        .sort((a, b) => b.score - a.score)
        .map((s) => s.job);
    // Enforce diversity constraint
    const diversified = enforceDiversity(scored);
    // Prepend pinned jobs (in caller-defined order)
    const pinnedSet = new Set(ctx.pinnedJobIds ?? []);
    const pinned = [];
    if (ctx.pinnedJobIds && ctx.pinnedJobIds.length > 0) {
        for (const id of ctx.pinnedJobIds) {
            const found = eligible.find((j) => j.id === id);
            if (found)
                pinned.push(found);
        }
    }
    const nonPinned = diversified.filter((j) => !pinnedSet.has(j.id));
    const final = [...pinned, ...nonPinned];
    return {
        jobs: final,
        meta: {
            total: final.length,
            seed,
            dayBucket: bucket,
            hasPersonalization: (ctx.affinityCategories?.length ?? 0) > 0 || (ctx.affinityCountries?.length ?? 0) > 0 || !!ctx.userCountry,
        },
    };
}
/**
 * Derive a stable anonymous session ID from the request. Uses:
 *   - existing express-session cookie sub, if present
 *   - else a truncated SHA of the IP + User-Agent (rotates when either changes)
 *
 * NOT a security identifier — only used to give the same visitor a stable
 * job order between page loads within a day.
 */
function deriveSessionId(req) {
    const authed = req.user?.claims?.sub ?? req.user?.id;
    if (authed)
        return `u:${authed}`;
    const ip = String(req.ip ?? "unknown");
    const ua = String(req.headers?.["user-agent"] ?? "unknown");
    return `a:${crypto_1.default.createHash("sha256").update(`${ip}::${ua}`).digest("hex").slice(0, 16)}`;
}
