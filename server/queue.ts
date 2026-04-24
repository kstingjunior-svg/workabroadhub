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

interface QueueItem<T = any> {
  id: string;
  type: string;
  data: T;
  priority: number;
  createdAt: number;
  retries: number;
  maxRetries: number;
}

interface QueueStats {
  pending: number;
  processed: number;
  failed: number;
  processing: boolean;
}

type Handler<T = any> = (data: T) => Promise<void>;

class AsyncQueue {
  private queue: QueueItem[] = [];
  private handlers: Map<string, Handler> = new Map();
  private processing = false;
  private stats: QueueStats = { pending: 0, processed: 0, failed: 0, processing: false };
  private processInterval: NodeJS.Timeout;
  private batchSize: number;
  private processingDelay: number;

  constructor(batchSize = 50, processingDelayMs = 100) {
    this.batchSize = batchSize;
    this.processingDelay = processingDelayMs;
    this.processInterval = setInterval(() => this.processQueue(), processingDelayMs);
  }

  registerHandler<T>(type: string, handler: Handler<T>): void {
    this.handlers.set(type, handler);
  }

  enqueue<T>(type: string, data: T, priority = 0, maxRetries = 3): void {
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

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }
    
    this.processing = true;
    this.stats.processing = true;
    
    const batch = this.queue.splice(0, this.batchSize);
    
    await Promise.allSettled(
      batch.map(async (item) => {
        const handler = this.handlers.get(item.type);
        if (!handler) {
          console.warn(`No handler for queue type: ${item.type}`);
          return;
        }
        
        try {
          await handler(item.data);
          this.stats.processed++;
        } catch (error) {
          console.error(`Queue processing error for ${item.type}:`, error);
          
          if (item.retries < item.maxRetries) {
            item.retries++;
            this.queue.push(item);
          } else {
            this.stats.failed++;
          }
        }
      })
    );
    
    this.stats.pending = this.queue.length;
    this.processing = false;
    this.stats.processing = false;
  }

  getStats(): QueueStats {
    return {
      ...this.stats,
      pending: this.queue.length,
    };
  }

  async flush(): Promise<void> {
    while (this.queue.length > 0) {
      await this.processQueue();
      await new Promise(r => setTimeout(r, 10));
    }
  }

  destroy(): void {
    clearInterval(this.processInterval);
    this.queue = [];
  }
}

export const asyncQueue = new AsyncQueue(100, 200);

export const QUEUE_TYPES = {
  ANALYTICS_EVENT: 'analytics:event',
  ANALYTICS_CONVERSION: 'analytics:conversion',
  NOTIFICATION: 'notification',
  EMAIL: 'email',
  SMS: 'sms',
  WHATSAPP: 'whatsapp',
  WEBHOOK_LOG: 'webhook:log',
  CV_ANALYSIS: 'cv:analysis',
} as const;

export interface SmsJob {
  phone: string;
  message?: string;
  type: 'payment_received' | 'subscription_activated' | 'new_referral' | 'payout_complete' | 'influencer_status' | 'custom';
  amount?: number;
  serviceName?: string;
  refCode?: string;
  commission?: number;
  transactionId?: string;
  approved?: boolean;
}

export interface NotificationJob {
  userId: string;
  title: string;
  message: string;
  type: string;
  orderId?: string;
}

export interface CvAnalysisJob {
  userId: string;
  phone: string;
}

export function registerQueueHandlers(): void {
  asyncQueue.registerHandler<SmsJob>(QUEUE_TYPES.SMS, async (job) => {
    try {
      const sms = await import("./sms");
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
    } catch (err: any) {
      console.error(`[Queue] SMS job failed (${job.type}):`, err.message);
      throw err;
    }
  });

  asyncQueue.registerHandler<NotificationJob>(QUEUE_TYPES.NOTIFICATION, async (job) => {
    try {
      const { storage } = await import("./storage");
      await storage.createUserNotification({
        userId: job.userId,
        title: job.title,
        message: job.message,
        type: job.type,
        orderId: job.orderId,
        isRead: false,
      });
    } catch (err: any) {
      console.error(`[Queue] Notification job failed:`, err.message);
      throw err;
    }
  });

  asyncQueue.registerHandler<CvAnalysisJob>(QUEUE_TYPES.CV_ANALYSIS, async (job) => {
    try {
      const { storage } = await import("./storage");
      const { generateCV } = await import("./services/cv");
      const { sendWhatsApp } = await import("./services/whatsapp");
      const { pool, db } = await import("./db");
      const { userCareerProfiles } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      const user = await storage.getUser(job.userId);
      if (!user) throw new Error(`User ${job.userId} not found`);

      const [careerProfile] = await db
        .select()
        .from(userCareerProfiles)
        .where(eq(userCareerProfiles.userId, job.userId))
        .catch(() => [null]);

      const cv = await generateCV(user as any, careerProfile ?? null);

      await pool.query("UPDATE users SET generated_cv = $1 WHERE id = $2", [cv, job.userId]);

      await sendWhatsApp(
        job.phone,
        `✅ Your ATS CV is ready!\n\n${cv.substring(0, 500)}...\n\nLogin to download the full version.`
      );

      await storage.createUserNotification({
        userId: job.userId,
        type: "success",
        title: "Your ATS CV is ready!",
        message: "Your professionally rewritten CV has been sent to your WhatsApp. Login to download the full version.",
        isRead: false,
      });

    } catch (err: any) {
      console.error(`[Queue] CV generation failed for user ${job.userId}:`, err.message);
      const { sendWhatsApp } = await import("./services/whatsapp");
      await sendWhatsApp(
        job.phone,
        `✅ Payment received! Your ATS CV is being prepared and will be sent to your WhatsApp shortly.`
      ).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
      throw err;
    }
  });

  console.log("[Queue] Handlers registered: SMS, Notification, Email, CV-Analysis");
}
