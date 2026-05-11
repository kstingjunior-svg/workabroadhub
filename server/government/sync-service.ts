// @ts-nocheck
import { governmentRegistry } from "./registry";
import { GovernmentSyncJob, GovernmentLicenseStatus } from "./types";
import { asyncQueue, QUEUE_TYPES } from "../queue";
import { db } from "../db";
import { governmentSyncLogs, governmentFeatureFlags, governmentIntegrations } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";
import { storage } from "../storage";

const GOV_SYNC_QUEUE_TYPE = "gov:sync";

export class GovernmentSyncService {
  private initialized = false;

  initialize(): void {
    if (this.initialized) return;

    asyncQueue.registerHandler(GOV_SYNC_QUEUE_TYPE, async (job: GovernmentSyncJob) => {
      await this.processJob(job);
    });

    this.initialized = true;
    console.log("[GovSync] Service initialized with queue handler");
  }

  async isFeatureEnabled(flagKey: string): Promise<boolean> {
    const [flag] = await db
      .select()
      .from(governmentFeatureFlags)
      .where(eq(governmentFeatureFlags.key, flagKey))
      .limit(1);
    return flag?.enabled ?? false;
  }

  async enqueueVerification(integrationCode: string, licenseNumber: string, triggeredBy?: string): Promise<string> {
    const requestId = crypto.randomUUID();
    const job: GovernmentSyncJob = {
      integrationCode,
      action: "verify",
      licenseNumber,
      triggeredBy,
      requestId,
    };

    await this.createSyncLog(job);
    asyncQueue.enqueue(GOV_SYNC_QUEUE_TYPE, job, 1, 3);
    return requestId;
  }

  async enqueueStatusCheck(integrationCode: string, licenseNumber: string, triggeredBy?: string): Promise<string> {
    const requestId = crypto.randomUUID();
    const job: GovernmentSyncJob = {
      integrationCode,
      action: "status",
      licenseNumber,
      triggeredBy,
      requestId,
    };

    await this.createSyncLog(job);
    asyncQueue.enqueue(GOV_SYNC_QUEUE_TYPE, job, 1, 3);
    return requestId;
  }

  async enqueueRenewalSubmission(
    integrationCode: string,
    licenseNumber: string,
    agencyId: string,
    paymentReference: string,
    licenseDetails: Record<string, any>,
    triggeredBy?: string
  ): Promise<string> {
    const requestId = crypto.randomUUID();
    const job: GovernmentSyncJob = {
      integrationCode,
      action: "renewal",
      licenseNumber,
      agencyId,
      paymentReference,
      licenseDetails,
      triggeredBy,
      requestId,
    };

    await this.createSyncLog(job);
    asyncQueue.enqueue(GOV_SYNC_QUEUE_TYPE, job, 2, 3);
    return requestId;
  }

  async enqueueReceiptFetch(integrationCode: string, licenseNumber: string, triggeredBy?: string): Promise<string> {
    const requestId = crypto.randomUUID();
    const job: GovernmentSyncJob = {
      integrationCode,
      action: "receipt",
      licenseNumber,
      triggeredBy,
      requestId,
    };

    await this.createSyncLog(job);
    asyncQueue.enqueue(GOV_SYNC_QUEUE_TYPE, job, 0, 3);
    return requestId;
  }

  private async isIntegrationInFallback(code: string): Promise<boolean> {
    const [integration] = await db.select().from(governmentIntegrations)
      .where(eq(governmentIntegrations.code, code)).limit(1);
    return integration?.fallbackMode ?? false;
  }

  private async processJob(job: GovernmentSyncJob): Promise<void> {
    const startTime = Date.now();

    if (await this.isIntegrationInFallback(job.integrationCode)) {
      console.log(`[GovSync] Skipping job for ${job.integrationCode} — fallback mode active`);
      await this.updateSyncLog(job.requestId, {
        status: "skipped",
        errorMessage: "Fallback mode active — automatic sync paused",
        durationMs: Date.now() - startTime,
      });
      return;
    }

    const adapter = governmentRegistry.getAdapter(job.integrationCode);
    const circuitBreaker = governmentRegistry.getCircuitBreaker(job.integrationCode);

    if (!adapter) {
      await this.updateSyncLog(job.requestId, {
        status: "error",
        errorMessage: `No adapter for: ${job.integrationCode}`,
        durationMs: Date.now() - startTime,
      });
      return;
    }

    const config = governmentRegistry.getConfig(job.integrationCode);

    try {
      let result: any;
      const executeAction = async () => {
        switch (job.action) {
          case "verify":
            return adapter.verifyLicense(job.licenseNumber);
          case "status":
            return adapter.fetchLicenseStatus(job.licenseNumber);
          case "renewal":
            return adapter.submitRenewal(job.paymentReference || "", {
              licenseNumber: job.licenseNumber,
              agencyId: job.agencyId || "",
              ...job.licenseDetails,
            } as any);
          case "receipt":
            return adapter.fetchRenewalReceipt(job.licenseNumber);
          default:
            throw new Error(`Unknown action: ${job.action}`);
        }
      };

      if (circuitBreaker) {
        result = await circuitBreaker.execute(executeAction);
      } else {
        result = await executeAction();
      }

      await this.updateSyncLog(job.requestId, {
        status: "success",
        normalizedStatus: (result as any)?.status || null,
        responsePayload: result,
        rawGovernmentResponse: (result as any)?.rawResponse || null,
        durationMs: Date.now() - startTime,
      });
    } catch (error: any) {
      console.error(`[GovSync] Job failed: ${job.action} for ${job.licenseNumber}:`, error.message);
      await this.updateSyncLog(job.requestId, {
        status: "error",
        errorMessage: error.message,
        durationMs: Date.now() - startTime,
      });
      throw error;
    }
  }

  private async createSyncLog(job: GovernmentSyncJob): Promise<void> {
    const config = governmentRegistry.getConfig(job.integrationCode);
    await db.insert(governmentSyncLogs).values({
      integrationId: config?.integrationId || job.integrationCode,
      integrationCode: job.integrationCode,
      action: job.action,
      licenseNumber: job.licenseNumber,
      agencyId: job.agencyId,
      requestId: job.requestId,
      status: "pending",
      requestPayload: job.licenseDetails || {},
      triggeredBy: job.triggeredBy,
    });
  }

  private async updateSyncLog(
    requestId: string,
    updates: {
      status: string;
      normalizedStatus?: string | null;
      responsePayload?: any;
      rawGovernmentResponse?: any;
      errorMessage?: string;
      durationMs: number;
    }
  ): Promise<void> {
    await db
      .update(governmentSyncLogs)
      .set({
        status: updates.status,
        normalizedStatus: updates.normalizedStatus,
        responsePayload: updates.responsePayload,
        rawGovernmentResponse: updates.rawGovernmentResponse,
        errorMessage: updates.errorMessage,
        durationMs: updates.durationMs,
        completedAt: new Date(),
      })
      .where(eq(governmentSyncLogs.requestId, requestId));
  }

  /**
   * On server startup, check for integrations stuck in fallbackMode=true.
   * If the government API is reachable again, deactivate fallback and trigger resync.
   * Also schedules a periodic probe every 10 minutes for any integration still in fallback.
   */
  async startupReconciliation(): Promise<void> {
    try {
      const integrations = await storage.getGovernmentIntegrations();
      const stuck = integrations.filter(i => i.enabled && i.fallbackMode);
      if (stuck.length === 0) return;

      console.log(`[GovSync] Startup reconciliation: ${stuck.length} integration(s) in fallback mode — probing...`);

      for (const integration of stuck) {
        await this.probeAndRecover(integration.code);
      }

      // Schedule periodic recovery probes every 10 min for anything still in fallback
      const PROBE_INTERVAL = 10 * 60 * 1000;
      setInterval(async () => {
        try {
          const current = await storage.getGovernmentIntegrations();
          const stillFallback = current.filter(i => i.enabled && i.fallbackMode);
          for (const integration of stillFallback) {
            await this.probeAndRecover(integration.code);
          }
        } catch (err: any) {
          console.error("[GovSync] Periodic fallback probe error:", err.message);
        }
      }, PROBE_INTERVAL);
    } catch (err: any) {
      console.error("[GovSync] startupReconciliation error:", err.message);
    }
  }

  private async probeAndRecover(code: string): Promise<void> {
    try {
      const adapter = governmentRegistry.getAdapter(code);
      if (!adapter) return;

      // Probe the government API — if checkHealth is available use it, otherwise treat as healthy
      const healthy = await (adapter as any).checkHealth?.().catch(() => ({ healthy: false })) ?? { healthy: true };

      if (healthy?.healthy !== false) {
        // API appears reachable — deactivate fallback and trigger resync
        const integration = await storage.getGovernmentIntegrationByCode(code);
        if (integration?.fallbackMode) {
          console.log(`[GovSync] Startup probe: ${code} is reachable — deactivating fallback mode`);
          await storage.setIntegrationFallbackMode(code, false);
          await storage.createDowntimeEvent({
            integrationCode: code,
            eventType: "fallback_deactivated",
            reason: "Recovered on server startup — API probe successful",
            triggeredBy: "startup_reconciliation",
          });
          governmentRegistry.triggerResync(code).catch(err =>
            console.error(`[GovSync] Startup resync failed for ${code}:`, err.message)
          );
        }
      }
    } catch (err: any) {
      // API still unreachable — leave fallback mode active
      console.log(`[GovSync] Probe failed for ${code} (still down): ${err.message}`);
    }
  }

  async retrySyncJob(requestId: string, triggeredBy?: string): Promise<string> {
    const [log] = await db
      .select()
      .from(governmentSyncLogs)
      .where(eq(governmentSyncLogs.requestId, requestId))
      .limit(1);

    if (!log) {
      throw new Error(`Sync log not found: ${requestId}`);
    }

    const newRequestId = crypto.randomUUID();
    const job: GovernmentSyncJob = {
      integrationCode: log.integrationCode,
      action: log.action as any,
      licenseNumber: log.licenseNumber || "",
      agencyId: log.agencyId || undefined,
      licenseDetails: log.requestPayload as any,
      triggeredBy: triggeredBy || "admin_retry",
      requestId: newRequestId,
    };

    await this.createSyncLog(job);
    asyncQueue.enqueue(GOV_SYNC_QUEUE_TYPE, job, 2, 3);
    return newRequestId;
  }
}

export const governmentSyncService = new GovernmentSyncService();
