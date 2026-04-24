import { IGovernmentAdapter, GovernmentAdapterConfig } from "./types";
import { NeaKenyaAdapter } from "./nea-adapter";
import { CircuitBreaker } from "../circuit-breaker";
import { storage } from "../storage";

class GovernmentAdapterRegistry {
  private adapters: Map<string, IGovernmentAdapter> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private configs: Map<string, GovernmentAdapterConfig> = new Map();
  private resyncInProgress: Set<string> = new Set();

  constructor() {
    this.registerBuiltInAdapters();
  }

  private registerBuiltInAdapters(): void {
    this.registerAdapter(new NeaKenyaAdapter());
  }

  registerAdapter(adapter: IGovernmentAdapter): void {
    this.adapters.set(adapter.code, adapter);
    const cb = new CircuitBreaker(`gov-${adapter.code}`, {
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

  private async handleCircuitStateChange(code: string, newState: string): Promise<void> {
    if (newState === "OPEN") {
      console.log(`[GovRegistry] Circuit OPEN for ${code} — activating fallback mode`);
      await storage.setIntegrationFallbackMode(code, true, "Circuit breaker tripped: government API unavailable");
      await storage.createDowntimeEvent({
        integrationCode: code,
        eventType: "outage_start",
        reason: "Circuit breaker tripped to OPEN state",
        triggeredBy: "circuit_breaker",
      });
      await storage.createDowntimeEvent({
        integrationCode: code,
        eventType: "fallback_activated",
        reason: "Automatic fallback due to circuit breaker OPEN",
        triggeredBy: "circuit_breaker",
      });
    } else if (newState === "CLOSED") {
      console.log(`[GovRegistry] Circuit CLOSED for ${code} — deactivating fallback mode, triggering re-sync`);
      const integration = await storage.getGovernmentIntegrationByCode(code);
      const downtimeStart = integration?.fallbackActivatedAt;
      const durationMs = downtimeStart ? Date.now() - new Date(downtimeStart).getTime() : undefined;
      await storage.setIntegrationFallbackMode(code, false);
      await storage.createDowntimeEvent({
        integrationCode: code,
        eventType: "outage_end",
        reason: "Circuit breaker recovered to CLOSED state",
        triggeredBy: "circuit_breaker",
        durationMs: durationMs || undefined,
      });
      await storage.createDowntimeEvent({
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

  async triggerResync(code: string): Promise<{ total: number; synced: number; mismatched: number; errors: number }> {
    if (this.resyncInProgress.has(code)) {
      console.log(`[GovRegistry] Re-sync already in progress for ${code}`);
      return { total: 0, synced: 0, mismatched: 0, errors: 0 };
    }

    this.resyncInProgress.add(code);
    const results = { total: 0, synced: 0, mismatched: 0, errors: 0 };

    try {
      const pendingOverrides = await storage.getPendingSyncOverrides(code);
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
            await storage.updateManualOverride(override.id, {
              syncStatus: "synced",
              syncRequired: false,
              syncResult: { officialStatus, verifiedAt: verification.verifiedAt, match: true },
            });
            results.synced++;
          } else {
            await storage.updateManualOverride(override.id, {
              syncStatus: "mismatch",
              syncResult: { officialStatus, manualStatus, verifiedAt: verification.verifiedAt, match: false },
              mismatchNotes: `Official status: ${officialStatus}, Manual override: ${manualStatus}`,
            });
            results.mismatched++;
          }
        } catch (err: any) {
          console.error(`[GovRegistry] Re-sync error for license ${override.licenseNumber}:`, err.message);
          await storage.updateManualOverride(override.id, {
            syncResult: { error: err.message, attemptedAt: new Date().toISOString() },
          });
          results.errors++;
        }
      }

      console.log(`[GovRegistry] Re-sync complete for ${code}: ${results.synced} synced, ${results.mismatched} mismatched, ${results.errors} errors`);
      return results;
    } finally {
      this.resyncInProgress.delete(code);
    }
  }

  isResyncInProgress(code: string): boolean {
    return this.resyncInProgress.has(code);
  }

  async initializeAdapter(code: string, config: GovernmentAdapterConfig): Promise<void> {
    const adapter = this.adapters.get(code);
    if (!adapter) {
      throw new Error(`No adapter registered for code: ${code}`);
    }
    this.configs.set(code, config);
    await adapter.initialize(config);
    console.log(`[GovRegistry] Initialized adapter: ${code}`);
  }

  getAdapter(code: string): IGovernmentAdapter | undefined {
    return this.adapters.get(code);
  }

  getCircuitBreaker(code: string): CircuitBreaker | undefined {
    return this.circuitBreakers.get(code);
  }

  getConfig(code: string): GovernmentAdapterConfig | undefined {
    return this.configs.get(code);
  }

  listAdapters(): Array<{ code: string; name: string; initialized: boolean; circuitState: string }> {
    const result: Array<{ code: string; name: string; initialized: boolean; circuitState: string }> = [];
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

  getAllCircuitBreakerStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    Array.from(this.circuitBreakers.entries()).forEach(([code, cb]) => {
      stats[code] = cb.getStats();
    });
    return stats;
  }
}

export const governmentRegistry = new GovernmentAdapterRegistry();
