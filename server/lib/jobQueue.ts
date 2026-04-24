/**
 * AI Job Queue — Bull v3
 * ──────────────────────
 * Single queue, three job types dispatched by job.data.type:
 *
 *   "ai_apply" — batch job-application generation (CV + cover letter per job)
 *   "cv_fix"   — AI CV rewrite targeting a specific role / country
 *   "visa"     — AI visa guidance for a target country
 *
 * Enqueue flow:
 *   POST /api/ai/jobs/batch-generate  →  type: "ai_apply"
 *   POST /api/ai/cv/rewrite           →  type: "cv_fix"    (async variant)
 *   POST /api/ai/service/visa_assist  →  type: "visa"      (async variant)
 *
 * Poll:
 *   GET /api/ai/jobs/status/:jobId
 *
 * Bull v3 requires three independent Redis connections
 * (client, subscriber, bclient). Each is created from REDIS_URL.
 */

import Queue from "bull";
import IORedis from "ioredis";

export const QUEUE_NAME = "jobs";

// ── Redis connection factory ────────────────────────────────────────────────
// Reference uses { redis: { host, port } } for localhost.
// Production (Upstash) requires TLS + a custom createClient factory instead.

function getRedisUrl(): string {
  const raw = process.env.REDIS_URL || "";
  const match = raw.match(/redis[s]?:\/\/\S+/);
  return match ? match[0] : raw;
}

function makeRedis(): IORedis {
  return new IORedis(getRedisUrl(), {
    tls:                  {},
    maxRetriesPerRequest: null,
    enableReadyCheck:     false,
  });
}

// ── Discriminated payload union ──────────────────────────────────────────────

export interface AIApplyPayload {
  type:    "ai_apply";
  userId:  string;
  userCV:  string;
  jobs: {
    title:                   string;
    company:                 string;
    description?:            string;
    additionalRequirements?: string;
  }[];
}

export interface CVFixPayload {
  type:           "cv_fix";
  userId:         string;
  userCV:         string;
  targetRole?:    string;
  targetCountry?: string;
}

export interface VisaPayload {
  type:       "visa";
  userId:     string;
  country:    string;
  visaType?:  string;
  question?:  string;
}

export type JobQueuePayload = AIApplyPayload | CVFixPayload | VisaPayload;

// ── Queue (producer side) ───────────────────────────────────────────────────

export const jobQueue: Queue.Queue<JobQueuePayload> = new Queue(QUEUE_NAME, {
  createClient: (type) => {
    switch (type) {
      case "client":     return makeRedis();
      case "subscriber": return makeRedis();
      case "bclient":    return makeRedis();
      default:           return makeRedis();
    }
  },
  defaultJobOptions: {
    attempts:         5,
    backoff:          { type: "exponential", delay: 3000 },
    removeOnComplete: true,
    removeOnFail:     false,
  },
});

const APP_URL = process.env.APP_URL || "https://workabroadhub.tech";

// ── Shared WhatsApp helper ───────────────────────────────────────────────────

async function notifyWhatsApp(userId: string, message: string): Promise<void> {
  try {
    const { storage } = await import("../storage");
    const user = await storage.getUserById(userId).catch(() => null);
    const phone: string =
      (user as any)?.phone ?? (user as any)?.phoneNumber ?? (user as any)?.whatsapp_number ?? "";

    if (!phone) return;

    const { sendWhatsApp } = await import("../sms");
    await sendWhatsApp(phone, message);
  } catch { /* WhatsApp not critical */ }
}

// ── Handlers ────────────────────────────────────────────────────────────────

async function handleAIApply(job: Queue.Job<AIApplyPayload>): Promise<any> {
  const { userId, userCV, jobs } = job.data;
  const { generateJobApplication } = await import("../services/jobApplicationGenerator");

  const MAX_JOBS = 5;
  const results: { job: (typeof jobs)[number]; application: any }[] = [];

  for (const item of jobs.slice(0, MAX_JOBS)) {
    const application = await generateJobApplication(
      item.title,
      item.company,
      item.description ?? "",
      userCV,
      item.additionalRequirements,
    );
    results.push({ job: item, application });
    await job.progress(Math.round((results.length / Math.min(jobs.length, MAX_JOBS)) * 100));
  }

  const { storage } = await import("../storage");

  await storage.createDelivery({
    userId,
    jobType: "ai_apply",
    content: results as any,
  }).catch(() => {});

  try {
    const { notifyApplicationReady } = await import("../websocket");
    notifyApplicationReady(userId, job.id.toString(), {
      status:       "materials_ready",
      applications: results,
    });
  } catch { /* WebSocket not critical */ }

  try {
    await storage.createUserNotification({
      userId,
      type:    "success",
      title:   "Batch Applications Ready",
      message: `Your ${results.length} application${results.length !== 1 ? "s" : ""} have been generated.`,
      isRead:  false,
    });
  } catch { /* notification not critical */ }

  const link = `${APP_URL}/dashboard`;
  await notifyWhatsApp(userId,
    `✅ Your application${results.length !== 1 ? "s are" : " is"} ready\n\nDownload here:\n${link}`,
  );

  return results;
}

async function handleCVFix(job: Queue.Job<CVFixPayload>): Promise<any> {
  const { userId, userCV, targetRole, targetCountry } = job.data;
  const { rewriteCV } = await import("../services/cvParser");

  const rewritten = await rewriteCV(userCV, targetRole, targetCountry);
  const { storage } = await import("../storage");

  await storage.createDelivery({
    userId,
    jobType: "cv_fix",
    content: { rewritten, targetRole, targetCountry } as any,
  }).catch(() => {});

  try {
    await storage.createUserNotification({
      userId,
      type:    "success",
      title:   "CV Rewrite Ready",
      message: targetRole
        ? `Your CV has been rewritten for ${targetRole}${targetCountry ? ` in ${targetCountry}` : ""}.`
        : "Your rewritten CV is ready.",
      isRead:  false,
    });
  } catch { /* notification not critical */ }

  const link = `${APP_URL}/dashboard`;
  await notifyWhatsApp(userId,
    `✅ Your CV rewrite is ready\n\nDownload here:\n${link}`,
  );

  return { rewritten };
}

async function handleVisa(job: Queue.Job<VisaPayload>): Promise<any> {
  const { userId, country, visaType, question } = job.data;

  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role:    "system",
        content: "You are a visa and immigration expert for East African professionals seeking overseas employment. " +
                 "Provide clear, practical, step-by-step guidance. Always recommend consulting official embassy resources.",
      },
      {
        role:    "user",
        content: `Country: ${country}\n` +
                 `${visaType ? `Visa type: ${visaType}\n` : ""}` +
                 `${question ?? "What are the key steps, requirements, and typical processing times for a work visa?"}`,
      },
    ],
    max_tokens:  600,
    temperature: 0.3,
  });

  const guidance = completion.choices[0]?.message?.content?.trim() ?? "";
  const { storage } = await import("../storage");

  await storage.createDelivery({
    userId,
    jobType: "visa",
    content: { country, visaType, guidance } as any,
  }).catch(() => {});

  try {
    await storage.createUserNotification({
      userId,
      type:    "info",
      title:   `Visa Guidance — ${country}`,
      message: `Your ${country} visa guidance is ready.`,
      isRead:  false,
    });
  } catch { /* notification not critical */ }

  const link = `${APP_URL}/dashboard`;
  await notifyWhatsApp(userId,
    `✅ Your ${country} visa guidance is ready\n\nDownload here:\n${link}`,
  );

  return { country, guidance };
}

// ── Worker (consumer / dispatcher) ─────────────────────────────────────────

export function startJobWorker(): void {
  jobQueue.process(
    /* concurrency */ 2,
    async (job: Queue.Job<JobQueuePayload>) => {
      try {
        if (job.data.type === "ai_apply") return await handleAIApply(job as Queue.Job<AIApplyPayload>);
        if (job.data.type === "cv_fix")   return await handleCVFix(job as Queue.Job<CVFixPayload>);
        if (job.data.type === "visa")     return await handleVisa(job as Queue.Job<VisaPayload>);

        throw new Error(`Unknown job type: ${(job.data as any).type}`);
      } catch (err) {
        throw err;
      }
    },
  );

  jobQueue.on("completed", (job) => {
    console.log(`[JobQueue] ${job.data.type} job ${job.id} completed ✓`);
  });

  jobQueue.on("failed", async (job, err) => {
    const type = job?.data?.type ?? "unknown";
    const attempts = job?.attemptsMade ?? 0;

    if (attempts >= MAX_ATTEMPTS) {
      // Permanently failed — flag for manual review (mirrors: UPDATE jobs SET status='manual_review')
      console.error(
        `[JobQueue] PERMANENT FAILURE — ${type} job ${job?.id} exhausted ${attempts} attempts. ` +
        `Flagging for manual review. Error: ${err?.message}`,
      );

      const userId: string = (job?.data as any)?.userId ?? "";

      if (userId) {
        try {
          const { storage } = await import("../storage");

          await storage.createDelivery({
            userId,
            jobType: "manual_review",
            content: {
              originalType: type,
              jobId:        String(job?.id ?? ""),
              error:        err?.message ?? "Unknown error",
              attemptsMade: attempts,
              payload:      job?.data ?? {},
            } as any,
          }).catch(() => {});

          await storage.createUserNotification({
            userId,
            type:    "error",
            title:   "Action Required — Job Failed",
            message: `Your ${type.replace("_", " ")} request could not be completed after ${attempts} attempts. Our team has been alerted and will follow up.`,
            isRead:  false,
          });

          const { sendWhatsAppAlert } = await import("../sms");
          await sendWhatsAppAlert(
            `⚠️ Manual intervention needed\n\n` +
            `Job type: ${type}\n` +
            `Job ID: ${job?.id}\n` +
            `User: ${userId}\n` +
            `Attempts: ${attempts}/${MAX_ATTEMPTS}\n` +
            `Error: ${err?.message ?? "Unknown"}`,
          );
        } catch { /* flagging not critical */ }
      }
    } else {
      console.error(`[JobQueue] ${type} job ${job?.id} failed (attempt ${attempts}/${MAX_ATTEMPTS}):`, err?.message);
    }
  });

  jobQueue.on("error", (err) => {
    console.error("[JobQueue] Queue error:", err?.message);
  });

  console.log("[JobQueue] Bull v3 worker started (concurrency=2, 3 retries) — types: ai_apply | cv_fix | visa");
}

// ── Stuck-job recovery poller ───────────────────────────────────────────────
// Mirrors reference: SELECT * FROM jobs WHERE status='failed' AND attempts < 5
// Bull stores this state in Redis; getJobs(['failed']) is the equivalent query.
// Runs every 2 minutes and re-enqueues any failed job that still has attempts
// remaining — guards against worker crashes that prevent Bull's own retry loop.

const MAX_ATTEMPTS = 5;
const RECOVERY_INTERVAL_MS = 120_000;

export function startJobRecoveryPoller(): void {
  setInterval(async () => {
    try {
      const failedJobs = await jobQueue.getJobs(["failed"]);

      for (const job of failedJobs) {
        if (job.attemptsMade < MAX_ATTEMPTS) {
          await jobQueue.add(job.data);
          console.log(
            `[JobQueue] Recovery: re-queued ${job.data.type} job ${job.id} ` +
            `(${job.attemptsMade}/${MAX_ATTEMPTS} attempts made)`,
          );
        } else {
          // Exhausted — already flagged for manual_review by the 'failed' event; skip
          console.warn(
            `[JobQueue] Recovery: skipping ${job.data.type} job ${job.id} — ` +
            `permanently failed (${job.attemptsMade}/${MAX_ATTEMPTS} attempts, manual_review)`,
          );
        }
      }
    } catch (err: any) {
      console.error("[JobQueue] Recovery poller error:", err?.message);
    }
  }, RECOVERY_INTERVAL_MS);

  console.log(`[JobQueue] Recovery poller started (${RECOVERY_INTERVAL_MS / 1000}s interval, max ${MAX_ATTEMPTS} attempts)`);
}
