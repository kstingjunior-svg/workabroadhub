import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runFoundation } from "../../../server/sync/engine";
import { neaKeProvider } from "../../../server/sync/providers/nea-ke";
import { NEA_KE_RECORD_COUNT } from "../../../server/sync/providers/data/nea-ke-records";
import { _setNowProviderForTests } from "../../../server/sync/validation";
import type {
  FetchOpts,
  NormalizedAgency,
  ProviderHealth,
  ProviderMetadata,
  ProviderRecord,
  SyncProvider,
  ValidationResult,
} from "../../../server/sync/types";

// Freeze the validation clock so expiry-window rules behave deterministically.
const FROZEN_NOW = Date.parse("2026-06-26T00:00:00Z");
beforeEach(() => _setNowProviderForTests(() => FROZEN_NOW));
afterEach(()  => _setNowProviderForTests(() => Date.now()));

describe("runFoundation() — happy path against NEA-KE", () => {
  it("processes all 581 records and produces a valid run result", async () => {
    const result = await runFoundation(neaKeProvider);

    expect(result.providerSlug).toBe("nea-ke");
    expect(result.correlationId).toMatch(/^[0-9a-f]{8}-/);
    expect(result.fetched).toBe(NEA_KE_RECORD_COUNT);

    // The vast majority should validate cleanly; a few quarantines are
    // acceptable (the source has one date-shaped licence and a couple of
    // numeric ones — those fall through to the NEA-prefix matchers).
    expect(result.validated.length).toBeGreaterThan(NEA_KE_RECORD_COUNT * 0.99);
    expect(result.quarantined.length).toBeLessThan(NEA_KE_RECORD_COUNT * 0.02);

    expect(result.fingerprintsByLicense.size).toBe(result.validated.length);
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.stageDurations.rawImport).toBeGreaterThanOrEqual(0);
    expect(result.stageDurations.normalize).toBeGreaterThanOrEqual(0);
    expect(result.stageDurations.validate).toBeGreaterThanOrEqual(0);
    expect(result.stageDurations.fingerprint).toBeGreaterThanOrEqual(0);

    // ADR-0002: pinned versions present
    expect(result.normalizerVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(result.fingerprintVersion).toBeGreaterThanOrEqual(1);
  });

  it("preserves raw payloads alongside normalized ones (Raw Import stage)", async () => {
    const result = await runFoundation(neaKeProvider, { limit: 3 });
    for (const v of result.validated) {
      expect(v.raw).toBeDefined();
      expect(v.normalizerVersion).toMatch(/^\d+\.\d+\.\d+$/);
      // Raw should retain provider-specific fields the normalized form drops.
      expect((v.raw as any).serviceType).toBeDefined();
    }
  });

  it("raw payload is a deep clone — adapter mutation cannot corrupt it", async () => {
    // The engine deep-clones via structuredClone before normalize(). If we
    // mutate the raw inside the validated record, the next run is unaffected.
    const result = await runFoundation(neaKeProvider, { limit: 1 });
    const v = result.validated[0];
    expect(v).toBeDefined();
    // Mutating the captured raw must not throw and must not affect another run.
    (v.raw as any).agencyName = "MUTATED";
    const result2 = await runFoundation(neaKeProvider, { limit: 1 });
    expect((result2.validated[0].raw as any).agencyName).not.toBe("MUTATED");
  });

  it("populates fingerprintsByLicense with versioned hex digests", async () => {
    const result = await runFoundation(neaKeProvider, { limit: 5 });
    expect(result.validated.length).toBeGreaterThan(0);
    for (const [lic, fp] of result.fingerprintsByLicense.entries()) {
      expect(lic).toMatch(/^[A-Z]/);
      expect(fp).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("honors opts.limit", async () => {
    const result = await runFoundation(neaKeProvider, { limit: 25 });
    expect(result.fetched).toBe(25);
    expect(result.validated.length + result.quarantined.length).toBe(25);
  });

  it("is deterministic — two runs of the same input produce the same fingerprints", async () => {
    const a = await runFoundation(neaKeProvider, { limit: 50 });
    const b = await runFoundation(neaKeProvider, { limit: 50 });
    expect([...a.fingerprintsByLicense.entries()].sort())
      .toEqual([...b.fingerprintsByLicense.entries()].sort());
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A synthetic provider for negative-path testing. Returns records the engine
// would reject so we can exercise the quarantine path without polluting NEA.
// ─────────────────────────────────────────────────────────────────────────────

class MockProvider implements SyncProvider {
  readonly slug = "mock";
  readonly displayName = "Mock";
  readonly country = "KE";

  constructor(
    private records: ProviderRecord[],
    private opts: { throwOnNormalize?: boolean } = {},
  ) {}

  metadata(): ProviderMetadata {
    return {
      slug: this.slug, displayName: this.displayName, country: this.country,
      upstreamUrl: "https://example.com", isStatic: true, adapterVersion: "v0.0.1",
      capabilities: {
        supportsPagination: false, supportsIncrementalSync: false,
        supportsWebhooks: false, supportsFiltering: false, supportsSearch: false,
        supportsUpstreamSnapshots: false, supportsHealthProbe: false,
      },
    };
  }
  async healthCheck(): Promise<ProviderHealth> {
    return { status: "healthy", message: "ok", checkedAt: new Date().toISOString() };
  }
  async *fetchRecords(_opts?: FetchOpts) {
    yield this.records;
  }
  normalize(raw: ProviderRecord): NormalizedAgency {
    if (this.opts.throwOnNormalize) throw new Error("simulated normalize crash");
    const r = raw as any;
    return {
      agencyName:    String(r.agencyName ?? ""),
      licenseNumber: String(r.licenseNumber ?? ""),
      country:       "KE",
      serviceType:   "unspecified",
      email:         null,
      website:       null,
      phone:         null,
      issueDate:     null,
      expiryDate:    String(r.expiryDate ?? ""),
      statusSource:  "verified",
    };
  }
  validate(_record: NormalizedAgency): ValidationResult {
    return { ok: true, value: _record }; // pass-through; base schema does the work
  }
}

describe("runFoundation() — quarantine paths", () => {
  it("quarantines records that fail base-schema validation", async () => {
    const mock = new MockProvider([
      // Bad: agencyName empty, expiryDate empty → both required failures
      { agencyName: "", licenseNumber: "PVT-1", expiryDate: "" },
      // Bad: licence has illegal character
      { agencyName: "X LTD", licenseNumber: "PVT@123", expiryDate: "2027-01-01" },
    ]);
    const result = await runFoundation(mock);

    expect(result.fetched).toBe(2);
    expect(result.validated).toHaveLength(0);
    expect(result.quarantined).toHaveLength(2);
    expect(result.quarantined[0].reasons.length).toBeGreaterThan(0);
    expect(result.quarantined[0].partial).not.toBeNull();
  });

  it("recovers gracefully when normalize() throws", async () => {
    const mock = new MockProvider([{ agencyName: "X", licenseNumber: "Y", expiryDate: "2027-01-01" }],
                                  { throwOnNormalize: true });
    const result = await runFoundation(mock);

    expect(result.validated).toHaveLength(0);
    expect(result.quarantined).toHaveLength(1);
    expect(result.quarantined[0].partial).toBeNull();
    expect(result.quarantined[0].reasons[0].message).toContain("normalize() threw");
  });

  it("aborts cleanly when the signal is fired mid-run", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runFoundation(neaKeProvider, { signal: controller.signal }),
    ).rejects.toThrow(/aborted/);
  });
});

describe("runFoundation() — correlationId", () => {
  it("accepts a caller-provided correlationId for trace stitching", async () => {
    const result = await runFoundation(neaKeProvider, { limit: 1, correlationId: "trace-abc-123" });
    expect(result.correlationId).toBe("trace-abc-123");
  });

  it("generates a UUID when none is provided", async () => {
    const result = await runFoundation(neaKeProvider, { limit: 1 });
    expect(result.correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
