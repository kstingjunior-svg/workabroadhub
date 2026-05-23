"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cvQueue = void 0;
exports.startCvWorker = startCvWorker;
// @ts-nocheck
const bullmq_1 = require("bullmq");
const redis_1 = require("./redis");
const QUEUE_NAME = "cv-generation";
exports.cvQueue = new bullmq_1.Queue(QUEUE_NAME, { connection: redis_1.redisConnection });
function startCvWorker() {
    const worker = new bullmq_1.Worker(QUEUE_NAME, async (job) => {
        const { userId, phone } = job.data;
        const { storage } = await Promise.resolve().then(() => __importStar(require("../storage")));
        const { generateCV } = await Promise.resolve().then(() => __importStar(require("../services/cv")));
        const { sendWhatsApp } = await Promise.resolve().then(() => __importStar(require("../services/whatsapp")));
        const { pool } = await Promise.resolve().then(() => __importStar(require("../db")));
        const { db } = await Promise.resolve().then(() => __importStar(require("../db")));
        const { userCareerProfiles } = await Promise.resolve().then(() => __importStar(require("@shared/schema")));
        const { eq } = await Promise.resolve().then(() => __importStar(require("drizzle-orm")));
        const user = await storage.getUser(userId);
        if (!user)
            throw new Error(`User ${userId} not found`);
        const [careerProfile] = await db
            .select()
            .from(userCareerProfiles)
            .where(eq(userCareerProfiles.userId, userId))
            .catch(() => [null]);
        const cv = await generateCV(user, careerProfile ?? null);
        await pool.query("UPDATE users SET generated_cv = $1 WHERE id = $2", [cv, userId]);
        await sendWhatsApp(phone, `✅ Your ATS CV is ready!\n\n${cv.substring(0, 500)}...\n\nLogin to download the full version.`);
        await storage.createUserNotification({
            userId,
            type: "success",
            title: "Your ATS CV is ready!",
            message: "Your professionally rewritten CV has been sent to your WhatsApp. Login to download the full version.",
            isRead: false,
        });
        console.log(`[CvQueue] CV delivered for user ${userId}`);
    }, {
        connection: redis_1.redisConnection,
        attempts: 3,
        backoff: { type: "exponential", delay: 10000 },
    });
    worker.on("failed", async (job, err) => {
        if (!job)
            return;
        const { phone } = job.data;
        console.error(`[CvQueue] Job ${job.id} failed after ${job.attemptsMade} attempt(s):`, err.message);
        if (job.attemptsMade >= 3) {
            const { sendWhatsApp } = await Promise.resolve().then(() => __importStar(require("../services/whatsapp")));
            await sendWhatsApp(phone, `✅ Payment received! Your ATS CV is being prepared and will be sent to your WhatsApp shortly.`).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        }
    });
    worker.on("completed", (job) => {
        console.log(`[CvQueue] Job ${job.id} completed ✓`);
    });
    console.log("[CvQueue] BullMQ worker started (Upstash Redis, 3 retries, exponential backoff)");
    return worker;
}
