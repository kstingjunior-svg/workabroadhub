import { describe, it, expect } from "vitest";
import {
  computeConfidenceScore,
  gradeFor,
  CONFIDENCE_SCORE_VERSION,
} from "../../../server/sync/confidence";
import type { DataQualityReport } from "../../../server/sync/quality-report";
import type { SafetyVerdict } from "../../../server/sync/safety";
import type { ProviderHealth } from "../../../server/sync/types";

function mkQuality(
  totals: Partial<DataQualityReport["totals"]> = {},
): DataQualityReport {
  return {
    version: 1,
    runId: "r1",
    providerSlug: "nea-ke",
    totals: {
      fetched: 100, validated: 100, quarantined: 0,
      created: 0, updated: 0, unchanged: 100, deleted: 0,
      ...totals,
    },
    quarantine: { ratePct: 0, byCode: {}, byStage: { normalize: 0, validate: 0 }, samples: [] },
    drift: { fieldChangeFrequency: {}, statusFlips: 0, samples: [] },
    safety: { anomalyScore: 0, held: false, anomalies: [] },
    versions: { normalizer: "1.0.0", fingerprint: 1 },
  } as any;
}

const HEALTHY: ProviderHealth = {
  status: "healthy", message: "ok", checkedAt: "now",
};

const CLEAN_SAFETY: SafetyVerdict = {
  anomalyScore: 0, holdRun: false, holdReason: null, anomalies: [],
};

describe("gradeFor", () => {
  it("maps known thresholds", () => {
    expect(gradeFor(95)).toBe("A");
    expect(gradeFor(80)).toBe("B");
    expect(gradeFor(65)).toBe("C");
    expect(gradeFor(45)).toBe("D");
    expect(gradeFor(10)).toBe("F");
  });
});

describe("computeConfidenceScore", () => {
  it("gives ~100 for a perfect run", () => {
    const r = computeConfidenceScore({
      quality: mkQuality(),
      safety:  CLEAN_SAFETY,
      drift:   null,
      health:  HEALTHY,
      durationMs: 500,
      expectedDurationMs: null,
    });
    expect(r.version).toBe(CONFIDENCE_SCORE_VERSION);
    expect(r.grade).toBe("A");
    expect(r.score).toBeGreaterThanOrEqual(95);
    expect(r.topDeductions).toEqual([]);
  });

  it("docks heavily when the safety gate held", () => {
    const safety: SafetyVerdict = {
      anomalyScore: 95, holdRun: true,
      holdReason: "Anomaly score 95 exceeded ceiling 70.",
      anomalies: [],
    };
    const r = computeConfidenceScore({
      quality: mkQuality({ quarantined: 0 }),
      safety,
      drift:   null,
      health:  HEALTHY,
      durationMs: 1000,
    });
    expect(r.grade).toBe("D"); // 0×0.2 weight removes 20 points
    expect(r.topDeductions[0]).toMatch(/Safety gate/);
  });

  it("docks for high quarantine rate", () => {
    const r = computeConfidenceScore({
      quality: mkQuality({ fetched: 100, validated: 70, quarantined: 30 }),
      safety:  CLEAN_SAFETY,
      drift:   null,
      health:  HEALTHY,
      durationMs: 500,
    });
    expect(r.score).toBeLessThan(85);
    expect(r.topDeductions[0]).toMatch(/Validity/);
  });

  it("docks for critical drift findings", () => {
    const drift: any = {
      version: 1, providerSlug: "nea-ke",
      current: { hash: "B" } as any,
      prior:   { hash: "A" } as any,
      matchesPrior: false,
      findings: [
        { kind: "type_changed", key: "expiryDate", severity: "critical", message: "x" },
        { kind: "key_removed",  key: "email",      severity: "critical", message: "x" },
      ],
      worstSeverity: "critical",
    };
    const r = computeConfidenceScore({
      quality: mkQuality(),
      safety:  CLEAN_SAFETY,
      drift,
      health:  HEALTHY,
      durationMs: 500,
    });
    expect(r.score).toBeLessThan(95);
    expect(r.topDeductions.some((s) => /Schema drift/.test(s))).toBe(true);
  });

  it("docks for degraded health", () => {
    const r = computeConfidenceScore({
      quality: mkQuality(),
      safety:  CLEAN_SAFETY,
      drift:   null,
      health:  { status: "degraded", message: "slow", checkedAt: "now" },
      durationMs: 500,
    });
    expect(r.factors.find((f) => f.key === "health")!.score).toBe(50);
    expect(r.score).toBeLessThan(98);
  });

  it("docks for performance regression vs baseline", () => {
    const r = computeConfidenceScore({
      quality: mkQuality(),
      safety:  CLEAN_SAFETY,
      drift:   null,
      health:  HEALTHY,
      durationMs: 4000,
      expectedDurationMs: 1000,
    });
    const perf = r.factors.find((f) => f.key === "performance")!;
    expect(perf.score).toBeLessThan(60);
  });
});
