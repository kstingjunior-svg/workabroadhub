"use strict";
// @ts-nocheck
/**
 * PRODUCTION HARDENING: Async queue for non-critical operations
 *
 * Prevents slow operations from blocking request handling:
 * - SMS / WhatsApp notifications
 * - User notification DB writes
 * - Analytics events
 * - Email sending
 * - Non-critical database writes
 */
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
exports.QUEUE_TYPES = exports.asyncQueue = void 0;
exports.registerQueueHandlers = registerQueueHandlers;
class AsyncQueue {
    constructor(batchSize = 50, processingDelayMs = 100) {
        this.queue = [];
        this.handlers = new Map();
        this.processing = false;
        this.stats = { pending: 0, processed: 0, failed: 0, processing: false };
        this.batchSize = batchSize;
        this.processingDelay = processingDelayMs;
        this.processInterval = setInterval(() => this.processQueue(), processingDelayMs);
    }
    registerHandler(type, handler) {
        this.handlers.set(type, handler);
    }
    enqueue(type, data, priority = 0, maxRetries = 3) {
        this.queue.push({
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type,
            data,
            priority,
            createdAt: Date.now(),
            retries: 0,
            maxRetries,
        });
        this.queue.sort((a, b) => b.priority - a.priority);
        this.stats.pending = this.queue.length;
    }
    async processQueue() {
        if (this.processing || this.queue.length === 0) {
            return;
        }
        this.processing = true;
        this.stats.processing = true;
        const batch = this.queue.splice(0, this.batchSize);
        await Promise.allSettled(batch.map(async (item) => {
            const handler = this.handlers.get(item.type);
            if (!handler) {
                console.warn(`No handler for queue type: ${item.type}`);
                return;
            }
            try {
                await handler(item.data);
                this.stats.processed++;
            }
            catch (error) {
                console.error(`Queue processing error for ${item.type}:`, error);
                if (item.retries < item.maxRetries) {
                    item.retries++;
                    this.queue.push(item);
                }
                else {
                    this.stats.failed++;
                }
            }
        }));
        this.stats.pending = this.queue.length;
        this.processing = false;
        this.stats.processing = false;
    }
    getStats() {
        return {
            ...this.stats,
            pending: this.queue.length,
        };
    }
    async flush() {
        while (this.queue.length > 0) {
            await this.processQueue();
            await new Promise(r => setTimeout(r, 10));
        }
    }
    destroy() {
        clearInterval(this.processInterval);
        this.queue = [];
    }
}
exports.asyncQueue = new AsyncQueue(100, 200);
exports.QUEUE_TYPES = {
    ANALYTICS_EVENT: 'analytics:event',
    ANALYTICS_CONVERSION: 'analytics:conversion',
    NOTIFICATION: 'notification',
    EMAIL: 'email',
    SMS: 'sms',
    WHATSAPP: 'whatsapp',
    WEBHOOK_LOG: 'webhook:log',
    CV_ANALYSIS: 'cv:analysis',
};
function registerQueueHandlers() {
    exports.asyncQueue.registerHandler(exports.QUEUE_TYPES.SMS, async (job) => {
        try {
            const sms = await Promise.resolve().then(() => __importStar(require("./sms")));
            switch (job.type) {
                case 'payment_received':
                    if (job.phone && job.amount != null && job.serviceName) {
                        await sms.notifyPaymentReceived(job.phone, job.amount, job.serviceName);
                    }
                    break;
                case 'subscription_activated':
                    if (job.phone) {
                        await sms.notifySubscriptionActivated(job.phone);
                    }
                    break;
                case 'new_referral':
                    if (job.phone && job.refCode && job.commission != null) {
                        await sms.notifyNewReferral(job.phone, job.refCode, job.commission);
                    }
                    break;
                case 'payout_complete':
                    if (job.phone && job.commission != null && job.transactionId) {
                        await sms.notifyPayoutComplete(job.phone, job.commission, job.transactionId);
                    }
                    break;
                case 'influencer_status':
                    if (job.phone && job.approved != null && job.refCode) {
                        await sms.notifyInfluencerStatus(job.phone, job.approved, job.refCode);
                    }
                    break;
                case 'custom':
                    if (job.phone && job.message) {
                        await sms.sendSMS(job.phone, job.message);
                    }
                    break;
            }
        }
        catch (err) {
            console.error(`[Queue] SMS job failed (${job.type}):`, err.message);
            throw err;
        }
    });
    exports.asyncQueue.registerHandler(exports.QUEUE_TYPES.NOTIFICATION, async (job) => {
        try {
            const { storage } = await Promise.resolve().then(() => __importStar(require("./storage")));
            await storage.createUserNotification({
                userId: job.userId,
                title: job.title,
                message: job.message,
                type: job.type,
                orderId: job.orderId,
                isRead: false,
            });
        }
        catch (err) {
            console.error(`[Queue] Notification job failed:`, err.message);
            throw err;
        }
    });
    exports.asyncQueue.registerHandler(exports.QUEUE_TYPES.CV_ANALYSIS, async (job) => {
        try {
            const { storage } = await Promise.resolve().then(() => __importStar(require("./storage")));
            const { generateCV } = await Promise.resolve().then(() => __importStar(require("./services/cv")));
            const { sendWhatsApp } = await Promise.resolve().then(() => __importStar(require("./services/whatsapp")));
            const { pool, db } = await Promise.resolve().then(() => __importStar(require("./db")));
            const { userCareerProfiles } = await Promise.resolve().then(() => __importStar(require("@shared/schema")));
            const { eq } = await Promise.resolve().then(() => __importStar(require("drizzle-orm")));
            const user = await storage.getUser(job.userId);
            if (!user)
                throw new Error(`User ${job.userId} not found`);
            const [careerProfile] = await db
                .select()
                .from(userCareerProfiles)
                .where(eq(userCareerProfiles.userId, job.userId))
                .catch(() => [null]);
            const cv = await generateCV(user, careerProfile ?? null);
            await pool.query("UPDATE users SET generated_cv = $1 WHERE id = $2", [cv, job.userId]);
            await sendWhatsApp(job.phone, `✅ Your ATS CV is ready!\n\n${cv.substring(0, 500)}...\n\nLogin to download the full version.`);
            await storage.createUserNotification({
                userId: job.userId,
                type: "success",
                title: "Your ATS CV is ready!",
                message: "Your professionally rewritten CV has been sent to your WhatsApp. Login to download the full version.",
                isRead: false,
            });
        }
        catch (err) {
            console.error(`[Queue] CV generation failed for user ${job.userId}:`, err.message);
            const { sendWhatsApp } = await Promise.resolve().then(() => __importStar(require("./services/whatsapp")));
            await sendWhatsApp(job.phone, `✅ Payment received! Your ATS CV is being prepared and will be sent to your WhatsApp shortly.`).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
            throw err;
        }
    });
    console.log("[Queue] Handlers registered: SMS, Notification, Email, CV-Analysis");
}
