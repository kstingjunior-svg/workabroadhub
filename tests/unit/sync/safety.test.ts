import { describe, it, expect } from "vitest";
import {
  evaluateSafety,
  DEFAULT_SAFETY_CONFIG,
  type SafetyInputs,
} from "../../../server/sync/safety";
import type { ChangeSet } from "../../../server/sync/diff";
import type { CurrentAgencyRow } from "../../../server/sync/storage";

function emptyChanges(): ChangeSet {
  return { created: [], updated: [], unchanged: [], deleted: [] };
}

function emptyCounts() {
  return { created: 0, updated: 0, unchanged: 0, deleted: 0, total: 0 };
}

function mkBefore(lic: string): CurrentAgencyRow {
  return {
    id:                 `id-${lic}`,
    agencyName:         `${lic} LTD`,
    licenseNumber:      lic,
    country:            "KE",
    serviceType:        "gulf_and_domestic",
    email:              null, website: null, phone: null,
    issueDate:          null, expiryDate: "2027-01-01",
    statusSource:       "verified",
    providerRecordFp:   `fp-${lic}`,
  };
}

describe("evaluateSafety — healthy run", () => {
  it("returns holdRun=false on a clean diff", () => {
    const v = evaluateSafety({
      changes: emptyChanges(),
      counts:  emptyCounts(),
      fetchedCount: 100,
      quarantinedCount: 0,
      currentCount: 100,
    });
    expect(v.holdRun).toBe(false);
    expect(v.anomalies).toHaveLength(0);
    expect(v.anomalyScore).toBe(0);
    expect(v.holdReason).toBeNull();
  });
});

describe("evaluateSafety — mass_delete", () => {
  it("trips on deletes > deletePct threshold", () => {
    const changes: ChangeSet = {
      ...emptyChanges(),
      deleted: Array.from({ length: 30 }, (_, i) => ({
        licenseNumber: `D${i}`, agencyId: `id-D${i}`, before: mkBefore(`D${i}`),
      })),
    };
    const v = evaluateSafety({
      changes,
      counts: { ...emptyCounts(), deleted: 30, total: 30 },
      fetchedCount: 100,
      quarantinedCount: 0,
      currentCount: 100, // 30% deletes vs 20% threshold
    });
    expect(v.anomalies.some((a) => a.type === "mass_delete")).toBe(true);
    const a = v.anomalies.find((a) => a.type === "mass_delete")!;
    expect(a.metricValue).toBe(30);
    expect(a.threshold).toBe(DEFAULT_SAFETY_CONFIG.deletePct);
    expect(a.sampleData).toHaveLength(10); // capped at TOP_N
  });
});

describe("evaluateSafety — schema_drift", () => {
  it("trips on validation failure rate > validationFailurePct", () => {
    const v = evaluateSafety({
      changes: emptyChanges(),
      counts: emptyCounts(),
      fetchedCount: 100,
      quarantinedCount: 10, // 10% vs 5% threshold
      currentCount: 100,
    });
    expect(v.anomalies.some((a) => a.type === "schema_drift")).toBe(true);
  });
});

describe("evaluateSafety — low_record_count", () => {
  it("trips when fetched < threshold pct of recent average", () => {
    const v = evaluateSafety({
      changes: emptyChanges(),
      counts: emptyCounts(),
      fetchedCount: 50,
      quarantinedCount: 0,
      currentCount: 100,
      recentFetchedCounts: [100, 105, 95], // avg = 100; 50 = 50% < 80% threshold
    });
    expect(v.anomalies.some((a) => a.type === "low_record_count")).toBe(true);
  });

  it("does not trip when no recent history is supplied", () => {
    const v = evaluateSafety({
      changes: emptyChanges(),
      counts: emptyCounts(),
      fetchedCount: 50,
      quarantinedCount: 0,
      currentCount: 100,
    });
    expect(v.anomalies.some((a) => a.type === "low_record_count")).toBe(false);
  });
});

describe("evaluateSafety — composite score + hold decision", () => {
  it("holdRun=true when anomalyScore exceeds the ceiling", () => {
    // Combine mass_delete (warn = 35) + schema_drift (warn = 35) = 70.
    // Default ceiling is 70 — exactly equal does NOT hold (gate is >).
    // Push it over with one more anomaly.
    const v = evaluateSafety({
      changes: {
        ...emptyChanges(),
        deleted: Array.from({ length: 50 }, (_, i) => ({
          licenseNumber: `D${i}`, agencyId: `id-D${i}`, before: mkBefore(`D${i}`),
        })),
      },
      counts: { ...emptyCounts(), deleted: 50, total: 50 },
      fetchedCount: 100,
      quarantinedCount: 80, // critical schema_drift (60) + critical mass_delete (60) = 100
      currentCount: 100,
    });
    expect(v.anomalyScore).toBeGreaterThan(70);
    expect(v.holdRun).toBe(true);
    expect(v.holdReason).toContain("Anomaly score");
  });

  it("honours custom per-provider config", () => {
    // With a relaxed deletePct=90, the 30% delete is fine.
    const v = evaluateSafety({
      changes: {
        ...emptyChanges(),
        deleted: Array.from({ length: 30 }, (_, i) => ({
          licenseNumber: `D${i}`, agencyId: `id-D${i}`, before: mkBefore(`D${i}`),
        })),
      },
      counts: { ...emptyCounts(), deleted: 30, total: 30 },
      fetchedCount: 100,
      quarantinedCount: 0,
      currentCount: 100,
      config: { deletePct: 90 },
    });
    expect(v.anomalies.find((a) => a.type === "mass_delete")).toBeUndefined();
  });
});
