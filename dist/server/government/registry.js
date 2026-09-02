"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.governmentRegistry = void 0;
const nea_adapter_1 = require("./nea-adapter");
const circuit_breaker_1 = require("../circuit-breaker");
const storage_1 = require("../storage");
class GovernmentAdapterRegistry {
    constructor() {
        this.adapters = new Map();
        this.circuitBreakers = new Map();
        this.configs = new Map();
        this.resyncInProgress = new Set();
        this.registerBuiltInAdapters();
    }
    registerBuiltInAdapters() {
        this.registerAdapter(new nea_adapter_1.NeaKenyaAdapter());
    }
    registerAdapter(adapter) {
        this.adapters.set(adapter.code, adapter);
        const cb = new circuit_breaker_1.CircuitBreaker(`gov-${adapter.code}`, {
            failureThreshold: 3,
            successThreshold: 2,
            timeout: 30000,
            resetTimeout: 120000,
        });
        cb.onStateChange((_name, _oldState, newState) => {
            this.handleCircuitStateChange(adapter.code, newState).catch(err => {
                console.error(`[GovRegistry] Failed to handle circuit state change for ${adapter.code}:`, err);
            });
        });
        this.circuitBreakers.set(adapter.code, cb);
        console.log(`[GovRegistry] Registered adapter: ${adapter.code} (${adapter.name})`);
    }
    async handleCircuitStateChange(code, newState) {
        if (newState === "OPEN") {
            console.log(`[GovRegistry] Circuit OPEN for ${code} — activating fallback mode`);
            await storage_1.storage.setIntegrationFallbackMode(code, true, "Circuit breaker tripped: government API unavailable");
            await storage_1.storage.createDowntimeEvent({
                integrationCode: code,
                eventType: "outage_start",
                reason: "Circuit breaker tripped to OPEN state",
                triggeredBy: "circuit_breaker",
            });
            await storage_1.storage.createDowntimeEvent({
                integrationCode: code,
                eventType: "fallback_activated",
                reason: "Automatic fallback due to circuit breaker OPEN",
                triggeredBy: "circuit_breaker",
            });
        }
        else if (newState === "CLOSED") {
            console.log(`[GovRegistry] Circuit CLOSED for ${code} — deactivating fallback mode, triggering re-sync`);
            const integration = await storage_1.storage.getGovernmentIntegrationByCode(code);
            const downtimeStart = integration?.fallbackActivatedAt;
            const durationMs = downtimeStart ? Date.now() - new Date(downtimeStart).getTime() : undefined;
            await storage_1.storage.setIntegrationFallbackMode(code, false);
            await storage_1.storage.createDowntimeEvent({
                integrationCode: code,
                eventType: "outage_end",
                reason: "Circuit breaker recovered to CLOSED state",
                triggeredBy: "circuit_breaker",
                durationMs: durationMs || undefined,
            });
            await storage_1.storage.createDowntimeEvent({
                integrationCode: code,
                eventType: "fallback_deactivated",
                reason: "Automatic recovery — government API available",
                triggeredBy: "circuit_breaker",
            });
            this.triggerResync(code).catch(err => {
                console.error(`[GovRegistry] Re-sync failed for ${code}:`, err);
            });
        }
    }
    async triggerResync(code) {
        if (this.resyncInProgress.has(code)) {
            console.log(`[GovRegistry] Re-sync already in progress for ${code}`);
            return { total: 0, synced: 0, mismatched: 0, errors: 0 };
        }
        this.resyncInProgress.add(code);
        const results = { total: 0, synced: 0, mismatched: 0, errors: 0 };
        try {
            const pendingOverrides = await storage_1.storage.getPendingSyncOverrides(code);
            results.total = pendingOverrides.length;
            console.log(`[GovRegistry] Starting re-sync for ${code}: ${results.total} pending overrides`);
            const adapter = this.adapters.get(code);
            if (!adapter) {
                console.error(`[GovRegistry] No adapter for re-sync: ${code}`);
                return results;
            }
            for (const override of pendingOverrides) {
                try {
                    const verification = await adapter.verifyLicense(override.licenseNumber);
                    const officialStatus = verification.status;
                    const manualStatus = override.manualLicenseStatus;
                    if (officialStatus === manualStatus) {
                        await storage_1.storage.updateManualOverride(override.id, {
                            syncStatus: "synced",
                            syncRequired: false,
                            syncResult: { officialStatus, verifiedAt: verification.verifiedAt, match: true },
                        });
                        results.synced++;
                    }
                    else {
                        await storage_1.storage.updateManualOverride(override.id, {
                            syncStatus: "mismatch",
                            syncResult: { officialStatus, manualStatus, verifiedAt: verification.verifiedAt, match: false },
                            mismatchNotes: `Official status: ${officialStatus}, Manual override: ${manualStatus}`,
                        });
                        results.mismatched++;
                    }
                }
                catch (err) {
                    console.error(`[GovRegistry] Re-sync error for license ${override.licenseNumber}:`, err.message);
                    await storage_1.storage.updateManualOverride(override.id, {
                        syncResult: { error: err.message, attemptedAt: new Date().toISOString() },
                    });
                    results.errors++;
                }
            }
            console.log(`[GovRegistry] Re-sync complete for ${code}: ${results.synced} synced, ${results.mismatched} mismatched, ${results.errors} errors`);
            return results;
        }
        finally {
            this.resyncInProgress.delete(code);
        }
    }
    isResyncInProgress(code) {
        return this.resyncInProgress.has(code);
    }
    async initializeAdapter(code, config) {
        const adapter = this.adapters.get(code);
        if (!adapter) {
            throw new Error(`No adapter registered for code: ${code}`);
        }
        this.configs.set(code, config);
        await adapter.initialize(config);
        console.log(`[GovRegistry] Initialized adapter: ${code}`);
    }
    getAdapter(code) {
        return this.adapters.get(code);
    }
    getCircuitBreaker(code) {
        return this.circuitBreakers.get(code);
    }
    getConfig(code) {
        return this.configs.get(code);
    }
    listAdapters() {
        const result = [];
        Array.from(this.adapters.entries()).forEach(([code, adapter]) => {
            const cb = this.circuitBreakers.get(code);
            result.push({
                code,
                name: adapter.name,
                initialized: this.configs.has(code),
                circuitState: cb ? cb.getStats().state : "UNKNOWN",
            });
        });
        return result;
    }
    getAllCircuitBreakerStats() {
        const stats = {};
        Array.from(this.circuitBreakers.entries()).forEach(([code, cb]) => {
            stats[code] = cb.getStats();
        });
        return stats;
    }
}
exports.governmentRegistry = new GovernmentAdapterRegistry();
