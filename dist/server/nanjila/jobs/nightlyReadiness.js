"use strict";
/**
 * Nanjila — nightly readiness snapshot job.
 *
 * Populates nanjila_readiness_snapshots for every active user, once a day.
 * Real-time reads on the Trust Dashboard hit the snapshot table (sub-5ms);
 * compute happens here, at night, off the request path.
 *
 * Architecture:
 *
 *   ┌─────────────────────────────┐
 *   │ Cron (03:00 EAT / 00:00 UTC)│
 *   └──────────────┬──────────────┘
 *                  │ enqueue "nightly-sweep"
 *                  ▼
 *   ┌─────────────────────────────┐
 *   │ Sweep job (1 per night)     │
 *   │ - Queries active users      │
 *   │ - Enqueues one "user-       │
 *   │   readiness" job per user   │
 *   └──────────────┬──────────────┘
 *                  │
 *                  ▼
 *   ┌─────────────────────────────┐   x N users
 *   │ User readiness job          │
 *   │ - computeReadinessReport    │
 *   │ - persistReadinessSnapshot  │
 *   └─────────────────────────────┘
 *
 * Each user is a discrete unit of work — one user's failure never affects
 * another user's snapshot. Retries are per-user with exponential backoff.
 *
 * Gated on NANJILA_READINESS_JOB_ENABLED. Off by default; when off, this
 * module doesn't touch Redis or run any cron. When on, requires REDIS_URL.
 *
 * See OS_EVOLUTION_PLAN.md §14 (Feature 9) and §16 Phase A.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.startReadinessWorker = startReadinessWorker;
exports.scheduleNightlyReadiness = scheduleNightlyReadiness;
exports.triggerReadinessSweepNow = triggerReadinessSweepNow;
exports.refreshReadinessForUser = refreshReadinessForUser;
exports.readinessQueueStats = readinessQueueStats;
const bullmq_1 = require("bullmq");
const redis_1 = require("../../lib/redis");
const db_1 = require("../../db");
const readiness_1 = require("../trust/readiness");
const feature_flags_1 = require("../feature-flags");
// ─────────────────────────────────────────────────────────────────────────────
// Queue setup
// ─────────────────────────────────────────────────────────────────────────────
const QUEUE_NAME = "nanjila-readiness";
const NIGHTLY_JOB_ID = "nanjila-readiness-nightly-sweep";
/**
 * Cadence: 03:00 EAT (Kenya) = 00:00 UTC. Off-hours for Kenyan users, gives
 * plenty of slack for a full sweep before morning traffic returns.
 */
const NIGHTLY_CRON = "0 0 * * *";
/**
 * Hard cap on how many users we score per sweep. Guards against a runaway
 * query in edge cases (accidental all-users backfill). Set high enough for
 * real active-user scale; anything past this is intentional and should use
 * the admin manual-trigger with a specific range.
 */
const MAX_USERS_PER_SWEEP = 20000;
// Only construct the queue when the feature flag is on. This keeps the module
// import-side-effect free on cold boot when readiness is disabled.
let _queue = null;
function getQueue() {
    if (!_queue) {
        _queue = new bullmq_1.Queue(QUEUE_NAME, { connection: redis_1.redisConnection });
    }
    return _queue;
}
// ─────────────────────────────────────────────────────────────────────────────
// Worker
// ─────────────────────────────────────────────────────────────────────────────
let _worker = null;
/**
 * Start the BullMQ worker that processes readiness jobs. Idempotent — safe
 * to call multiple times; second call is a no-op.
 *
 * Handles two job names:
 *   • nightly-sweep:  fetches active users, enqueues one per user.
 *   • user-readiness: computes + persists for a single user.
 */
function startReadinessWorker() {
    if (_worker)
        return _worker;
    if (!feature_flags_1.NanjilaFlags.readinessJobEnabled) {
        console.log("[Nanjila/Readiness] NANJILA_READINESS_JOB_ENABLED=false — worker not started.");
        return null;
    }
    _worker = new bullmq_1.Worker(QUEUE_NAME, async (job) => {
        if (job.name === "nightly-sweep") {
            return await runNightlySweep();
        }
        if (job.name === "user-readiness") {
            return await runUserReadiness(job.data?.userId);
        }
        throw new Error(`[Nanjila/Readiness] Unknown job name: ${job.name}`);
    }, {
        connection: redis_1.redisConnection,
        concurrency: 8,
        // Rate limit to protect DB — 20 user snapshots per second max
        limiter: { max: 20, duration: 1000 },
    });
    _worker.on("failed", (job, err) => {
        console.error(`[Nanjila/Readiness] Job ${job?.name} (${job?.id}) failed after ${job?.attemptsMade ?? 0} attempt(s):`, err.message);
    });
    _worker.on("completed", (job, result) => {
        if (job.name === "nightly-sweep") {
            console.log(`[Nanjila/Readiness] Sweep complete — queued ${result?.queued ?? 0} users`);
        }
    });
    console.log("[Nanjila/Readiness] BullMQ worker started (concurrency=8, rate=20/s)");
    return _worker;
}
// ─────────────────────────────────────────────────────────────────────────────
// Scheduling
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Set up the recurring nightly sweep. Idempotent — BullMQ's repeat scheduler
 * uses a stable jobId, so re-registration is a no-op.
 */
async function scheduleNightlyReadiness() {
    if (!feature_flags_1.NanjilaFlags.readinessJobEnabled) {
        console.log("[Nanjila/Readiness] scheduleNightlyReadiness skipped — flag off");
        return;
    }
    try {
        await getQueue().add("nightly-sweep", { scheduled: true }, {
            repeat: { pattern: NIGHTLY_CRON },
            jobId: NIGHTLY_JOB_ID,
            removeOnComplete: 20,
            removeOnFail: 20,
        });
        console.log(`[Nanjila/Readiness] Nightly sweep scheduled — cron "${NIGHTLY_CRON}"`);
    }
    catch (err) {
        console.error("[Nanjila/Readiness] scheduleNightlyReadiness failed:", err?.message);
    }
}
/**
 * Manual admin trigger — enqueues a sweep to run RIGHT NOW.
 * Wired to the admin endpoint (Batch 3).
 */
async function triggerReadinessSweepNow() {
    const job = await getQueue().add("nightly-sweep", { scheduled: false, manual: true }, { jobId: `manual-${Date.now()}` });
    return { jobId: String(job.id ?? "") };
}
/**
 * Manual per-user trigger — recompute one user's snapshot now.
 * Useful when we just updated a user's CV or profile and want the score
 * to reflect the change immediately.
 */
async function refreshReadinessForUser(userId) {
    const job = await getQueue().add("user-readiness", { userId, manual: true }, { jobId: `manual-user-${userId}-${Date.now()}`, attempts: 3, backoff: { type: "exponential", delay: 5000 } });
    return { jobId: String(job.id ?? "") };
}
// ─────────────────────────────────────────────────────────────────────────────
// Job handlers
// ─────────────────────────────────────────────────────────────────────────────
async function runNightlySweep() {
    const started = Date.now();
    // "Active" users are those with any activity in the last 60 days OR who
    // have a career profile (deliberate long-tail — someone who signed up and
    // set up their profile deserves a snapshot even without recent activity).
    //
    // Falls back to ALL users when the activity signal is empty (fresh
    // deployments where analytics_events hasn't accumulated yet).
    const { rows: activeRows } = await db_1.pool.query(`SELECT DISTINCT u.id AS user_id
       FROM users u
      WHERE u.id IN (
              SELECT user_id FROM analytics_events
               WHERE created_at > NOW() - INTERVAL '60 days'
                 AND user_id IS NOT NULL
              UNION
              SELECT user_id FROM user_career_profiles
               WHERE user_id IS NOT NULL
              UNION
              SELECT user_id FROM user_job_applications
               WHERE user_id IS NOT NULL
                 AND created_at > NOW() - INTERVAL '90 days'
            )
      ORDER BY user_id
      LIMIT $1`, [MAX_USERS_PER_SWEEP]).catch((err) => {
        console.warn("[Nanjila/Readiness] Active-user query failed, falling back to all users:", err?.message);
        return { rows: [] };
    });
    let candidates = activeRows;
    if (candidates.length === 0) {
        const { rows: allRows } = await db_1.pool.query(`SELECT id AS user_id FROM users ORDER BY id LIMIT $1`, [MAX_USERS_PER_SWEEP]);
        candidates = allRows;
    }
    const queue = getQueue();
    let queued = 0;
    for (const c of candidates) {
        try {
            await queue.add("user-readiness", { userId: c.user_id }, {
                attempts: 3,
                backoff: { type: "exponential", delay: 10000 },
                removeOnComplete: 100,
                removeOnFail: 100,
            });
            queued++;
        }
        catch (err) {
            console.warn(`[Nanjila/Readiness] enqueue failed for user=${c.user_id}:`, err?.message);
        }
    }
    const elapsed = Date.now() - started;
    console.log(`[Nanjila/Readiness] Sweep enqueued ${queued}/${candidates.length} users in ${elapsed}ms`);
    return { queued, totalCandidates: candidates.length };
}
async function runUserReadiness(userId) {
    if (!userId)
        throw new Error("[Nanjila/Readiness] user-readiness job missing userId");
    const report = await (0, readiness_1.computeReadinessReport)(userId);
    await (0, readiness_1.persistReadinessSnapshot)(report);
    return {
        userId,
        overallScore: report.overallMigrationReadiness.score,
        writtenSnapshot: true,
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// Introspection (for admin dashboard)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Return current queue counts. Called by the admin flags endpoint (Batch 3).
 */
async function readinessQueueStats() {
    const q = getQueue();
    const [waiting, active, completed, failed, delayed] = await Promise.all([
        q.getWaitingCount().catch(() => 0),
        q.getActiveCount().catch(() => 0),
        q.getCompletedCount().catch(() => 0),
        q.getFailedCount().catch(() => 0),
        q.getDelayedCount().catch(() => 0),
    ]);
    return { waiting, active, completed, failed, delayed };
}
