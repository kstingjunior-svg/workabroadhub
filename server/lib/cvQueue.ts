// @ts-nocheck
import { Queue, Worker } from "bullmq";
import { redisConnection } from "./redis";

const QUEUE_NAME = "cv-generation";

export const cvQueue = new Queue(QUEUE_NAME, { connection: redisConnection });

export function startCvWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { userId, phone } = job.data;

      const { storage } = await import("../storage");
      const { generateCV } = await import("../services/cv");
      const { sendWhatsApp } = await import("../services/whatsapp");
      const { pool } = await import("../db");
      const { db } = await import("../db");
      const { userCareerProfiles } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      const user = await storage.getUser(userId);
      if (!user) throw new Error(`User ${userId} not found`);

      const [careerProfile] = await db
        .select()
        .from(userCareerProfiles)
        .where(eq(userCareerProfiles.userId, userId))
        .catch(() => [null]);

      const cv = await generateCV(user as any, careerProfile ?? null);

      await pool.query("UPDATE users SET generated_cv = $1 WHERE id = $2", [cv, userId]);

      await sendWhatsApp(
        phone,
        `✅ Your ATS CV is ready!\n\n${cv.substring(0, 500)}...\n\nLogin to download the full version.`
      );

      await storage.createUserNotification({
        userId,
        type: "success",
        title: "Your ATS CV is ready!",
        message: "Your professionally rewritten CV has been sent to your WhatsApp. Login to download the full version.",
        isRead: false,
      });

      console.log(`[CvQueue] CV delivered for user ${userId}`);
    },
    {
      connection: redisConnection,
      attempts: 3,
      backoff: { type: "exponential", delay: 10000 },
    }
  );

  worker.on("failed", async (job, err) => {
    if (!job) return;
    const { phone } = job.data;
    console.error(`[CvQueue] Job ${job.id} failed after ${job.attemptsMade} attempt(s):`, err.message);

    if (job.attemptsMade >= 3) {
      const { sendWhatsApp } = await import("../services/whatsapp");
      await sendWhatsApp(
        phone,
        `✅ Payment received! Your ATS CV is being prepared and will be sent to your WhatsApp shortly.`
      ).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
    }
  });

  worker.on("completed", (job) => {
    console.log(`[CvQueue] Job ${job.id} completed ✓`);
  });

  console.log("[CvQueue] BullMQ worker started (Upstash Redis, 3 retries, exponential backoff)");
  return worker;
}
