"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.governmentSyncService = exports.GovernmentSyncService = void 0;
// @ts-nocheck
const registry_1 = require("./registry");
const queue_1 = require("../queue");
const db_1 = require("../db");
const schema_1 = require("@shared/schema");
const drizzle_orm_1 = require("drizzle-orm");
const crypto_1 = __importDefault(require("crypto"));
const storage_1 = require("../storage");
const GOV_SYNC_QUEUE_TYPE = "gov:sync";
class GovernmentSyncService {
    constructor() {
        this.initialized = false;
    }
    initialize() {
        if (this.initialized)
            return;
        queue_1.asyncQueue.registerHandler(GOV_SYNC_QUEUE_TYPE, async (job) => {
            await this.processJob(job);
        });
        this.initialized = true;
        console.log("[GovSync] Service initialized with queue handler");
    }
    async isFeatureEnabled(flagKey) {
        const [flag] = await db_1.db
            .select()
            .from(schema_1.governmentFeatureFlags)
            .where((0, drizzle_orm_1.eq)(schema_1.governmentFeatureFlags.key, flagKey))
            .limit(1);
        return flag?.enabled ?? false;
    }
    async enqueueVerification(integrationCode, licenseNumber, triggeredBy) {
        const requestId = crypto_1.default.randomUUID();
        const job = {
            integrationCode,
            action: "verify",
            licenseNumber,
            triggeredBy,
            requestId,
        };
        await this.createSyncLog(job);
        queue_1.asyncQueue.enqueue(GOV_SYNC_QUEUE_TYPE, job, 1, 3);
        return requestId;
    }
    async enqueueStatusCheck(integrationCode, licenseNumber, triggeredBy) {
        const requestId = crypto_1.default.randomUUID();
        const job = {
            integrationCode,
            action: "status",
            licenseNumber,
            triggeredBy,
            requestId,
        };
        await this.createSyncLog(job);
        queue_1.asyncQueue.enqueue(GOV_SYNC_QUEUE_TYPE, job, 1, 3);
        return requestId;
    }
    async enqueueRenewalSubmission(integrationCode, licenseNumber, agencyId, paymentReference, licenseDetails, triggeredBy) {
        const requestId = crypto_1.default.randomUUID();
        const job = {
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
        queue_1.asyncQueue.enqueue(GOV_SYNC_QUEUE_TYPE, job, 2, 3);
        return requestId;
    }
    async enqueueReceiptFetch(integrationCode, licenseNumber, triggeredBy) {
        const requestId = crypto_1.default.randomUUID();
        const job = {
            integrationCode,
            action: "receipt",
            licenseNumber,
            triggeredBy,
            requestId,
        };
        await this.createSyncLog(job);
        queue_1.asyncQueue.enqueue(GOV_SYNC_QUEUE_TYPE, job, 0, 3);
        return requestId;
    }
    async isIntegrationInFallback(code) {
        const [integration] = await db_1.db.select().from(schema_1.governmentIntegrations)
            .where((0, drizzle_orm_1.eq)(schema_1.governmentIntegrations.code, code)).limit(1);
        return integration?.fallbackMode ?? false;
    }
    async processJob(job) {
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
        const adapter = registry_1.governmentRegistry.getAdapter(job.integrationCode);
        const circuitBreaker = registry_1.governmentRegistry.getCircuitBreaker(job.integrationCode);
        if (!adapter) {
            await this.updateSyncLog(job.requestId, {
                status: "error",
                errorMessage: `No adapter for: ${job.integrationCode}`,
                durationMs: Date.now() - startTime,
            });
            return;
        }
        const config = registry_1.governmentRegistry.getConfig(job.integrationCode);
        try {
            let result;
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
                        });
                    case "receipt":
                        return adapter.fetchRenewalReceipt(job.licenseNumber);
                    default:
                        throw new Error(`Unknown action: ${job.action}`);
                }
            };
            if (circuitBreaker) {
                result = await circuitBreaker.execute(executeAction);
            }
            else {
                result = await executeAction();
            }
            await this.updateSyncLog(job.requestId, {
                status: "success",
                normalizedStatus: result?.status || null,
                responsePayload: result,
                rawGovernmentResponse: result?.rawResponse || null,
                durationMs: Date.now() - startTime,
            });
        }
        catch (error) {
            console.error(`[GovSync] Job failed: ${job.action} for ${job.licenseNumber}:`, error.message);
            await this.updateSyncLog(job.requestId, {
                status: "error",
                errorMessage: error.message,
                durationMs: Date.now() - startTime,
            });
            throw error;
        }
    }
    async createSyncLog(job) {
        const config = registry_1.governmentRegistry.getConfig(job.integrationCode);
        await db_1.db.insert(schema_1.governmentSyncLogs).values({
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
    async updateSyncLog(requestId, updates) {
        await db_1.db
            .update(schema_1.governmentSyncLogs)
            .set({
            status: updates.status,
            normalizedStatus: updates.normalizedStatus,
            responsePayload: updates.responsePayload,
            rawGovernmentResponse: updates.rawGovernmentResponse,
            errorMessage: updates.errorMessage,
            durationMs: updates.durationMs,
            completedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema_1.governmentSyncLogs.requestId, requestId));
    }
    /**
     * On server startup, check for integrations stuck in fallbackMode=true.
     * If the government API is reachable again, deactivate fallback and trigger resync.
     * Also schedules a periodic probe every 10 minutes for any integration still in fallback.
     */
    async startupReconciliation() {
        try {
            const integrations = await storage_1.storage.getGovernmentIntegrations();
            const stuck = integrations.filter(i => i.enabled && i.fallbackMode);
            if (stuck.length === 0)
                return;
            console.log(`[GovSync] Startup reconciliation: ${stuck.length} integration(s) in fallback mode — probing...`);
            for (const integration of stuck) {
                await this.probeAndRecover(integration.code);
            }
            // Schedule periodic recovery probes every 10 min for anything still in fallback
            const PROBE_INTERVAL = 10 * 60 * 1000;
            setInterval(async () => {
                try {
                    const current = await storage_1.storage.getGovernmentIntegrations();
                    const stillFallback = current.filter(i => i.enabled && i.fallbackMode);
                    for (const integration of stillFallback) {
                        await this.probeAndRecover(integration.code);
                    }
                }
                catch (err) {
                    console.error("[GovSync] Periodic fallback probe error:", err.message);
                }
            }, PROBE_INTERVAL);
        }
        catch (err) {
            console.error("[GovSync] startupReconciliation error:", err.message);
        }
    }
    async probeAndRecover(code) {
        try {
            const adapter = registry_1.governmentRegistry.getAdapter(code);
            if (!adapter)
                return;
            // Probe the government API — if checkHealth is available use it, otherwise treat as healthy
            const healthy = await adapter.checkHealth?.().catch(() => ({ healthy: false })) ?? { healthy: true };
            if (healthy?.healthy !== false) {
                // API appears reachable — deactivate fallback and trigger resync
                const integration = await storage_1.storage.getGovernmentIntegrationByCode(code);
                if (integration?.fallbackMode) {
                    console.log(`[GovSync] Startup probe: ${code} is reachable — deactivating fallback mode`);
                    await storage_1.storage.setIntegrationFallbackMode(code, false);
                    await storage_1.storage.createDowntimeEvent({
                        integrationCode: code,
                        eventType: "fallback_deactivated",
                        reason: "Recovered on server startup — API probe successful",
                        triggeredBy: "startup_reconciliation",
                    });
                    registry_1.governmentRegistry.triggerResync(code).catch(err => console.error(`[GovSync] Startup resync failed for ${code}:`, err.message));
                }
            }
        }
        catch (err) {
            // API still unreachable — leave fallback mode active
            console.log(`[GovSync] Probe failed for ${code} (still down): ${err.message}`);
        }
    }
    async retrySyncJob(requestId, triggeredBy) {
        const [log] = await db_1.db
            .select()
            .from(schema_1.governmentSyncLogs)
            .where((0, drizzle_orm_1.eq)(schema_1.governmentSyncLogs.requestId, requestId))
            .limit(1);
        if (!log) {
            throw new Error(`Sync log not found: ${requestId}`);
        }
        const newRequestId = crypto_1.default.randomUUID();
        const job = {
            integrationCode: log.integrationCode,
            action: log.action,
            licenseNumber: log.licenseNumber || "",
            agencyId: log.agencyId || undefined,
            licenseDetails: log.requestPayload,
            triggeredBy: triggeredBy || "admin_retry",
            requestId: newRequestId,
        };
        await this.createSyncLog(job);
        queue_1.asyncQueue.enqueue(GOV_SYNC_QUEUE_TYPE, job, 2, 3);
        return newRequestId;
    }
}
exports.GovernmentSyncService = GovernmentSyncService;
exports.governmentSyncService = new GovernmentSyncService();
