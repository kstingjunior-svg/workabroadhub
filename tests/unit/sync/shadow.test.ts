import { describe, it, expect } from "vitest";
import {
  generateShadowVerificationReport,
  SHADOW_VERIFICATION_REPORT_VERSION,
} from "../../../server/sync/shadow";
import type { RunSyncRc1Result } from "../../../server/sync/sync-runner-rc1";

function mkResult(overrides: Partial<RunSyncRc1Result> = {}): RunSyncRc1Result {
  return {
    runId: "r1",
    correlationId: "c1",
    status: "succeeded",
    foundation: {
      validated: [], quarantined: [], raw: [],
      fetched: 100,
      durationMs: 500,
      normalizerVersion: "1.0.0",
      fingerprintVersion: 1,
      correlationId: "c1",
    } as any,
    diff: { created: 1, updated: 1, unchanged: 95, deleted: 3, total: 5 },
    apply: null,
    safety: { anomalyScore: 5, holdRun: false, holdReason: null, anomalies: [] },
    snapshot: null,
    qualityReport: {
      version: 1, runId: "r1", providerSlug: "nea-ke",
      totals: { fetched: 100, validated: 97, quarantined: 3, created: 1, updated: 1, unchanged: 95, deleted: 3 },
      quarantine: { ratePct: 3, byCode: {}, byStage: { normalize: 0, validate: 3 }, samples: [] },
      drift: { fieldChangeFrequency: {}, statusFlips: 0, samples: [] },
      safety: { anomalyScore: 5, held: false, anomalies: [] },
      versions: { normalizer: "1.0.0", fingerprint: 1 },
    } as any,
    ...overrides,
  };
}

describe("generateShadowVerificationReport", () => {
  it("recommends promote_to_live on a clean shadow run", () => {
    const r = generateShadowVerificationReport(mkResult(), "nea-ke");
    expect(r.version).toBe(SHADOW_VERIFICATION_REPORT_VERSION);
    expect(r.recommendation).toBe("promote_to_live");
  });

  it("recommends do_not_promote when the safety gate would have held", () => {
    const r = generateShadowVerificationReport(
      mkResult({
        safety: { anomalyScore: 95, holdRun: true, holdReason: "test", anomalies: [] as any },
      }),
      "nea-ke",
    );
    expect(r.recommendation).toBe("do_not_promote");
    expect(r.reasonNotes[0]).toMatch(/HELD/);
  });

  it("recommends investigate_then_retry on moderate quarantine", () => {
    const r = generateShadowVerificationReport(
      mkResult({
        qualityReport: {
          ...mkResult().qualityReport,
          totals: { fetched: 100, validated: 92, quarantined: 8, created: 0, updated: 0, unchanged: 92, deleted: 0 },
          quarantine: { ratePct: 8, byCode: {}, byStage: { normalize: 0, validate: 8 }, samples: [] },
        } as any,
      }),
      "nea-ke",
    );
    expect(r.recommendation).toBe("investigate_then_retry");
  });

  it("recommends do_not_promote when delete ratio ≥ 30%", () => {
    const r = generateShadowVerificationReport(
      mkResult({
        diff: { created: 0, updated: 0, unchanged: 60, deleted: 40, total: 40 },
        foundation: { ...mkResult().foundation, fetched: 100 } as any,
      }),
      "nea-ke",
    );
    expect(r.recommendation).toBe("do_not_promote");
  });
});
