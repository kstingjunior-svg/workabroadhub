import { describe, it, expect } from "vitest";
import {
  PerformanceRecorder,
  PERFORMANCE_REPORT_VERSION,
} from "../../../server/sync/performance";

describe("PerformanceRecorder", () => {
  it("records phases via withPhase + computes totalMs", async () => {
    const rec = new PerformanceRecorder();
    await rec.withPhase("fetch", async () => { await sleep(5); });
    await rec.withPhase("normalize", async () => { await sleep(5); });
    const r = rec.finalize();
    expect(r.version).toBe(PERFORMANCE_REPORT_VERSION);
    expect(r.phases.map((p) => p.phase)).toEqual(["fetch", "normalize"]);
    expect(r.totalMs).toBeGreaterThanOrEqual(10);
    for (const p of r.phases) expect(p.errorMessage).toBeUndefined();
  });

  it("records the phase even if its function throws, then re-throws", async () => {
    const rec = new PerformanceRecorder();
    await expect(
      rec.withPhase("apply_transaction", async () => { throw new Error("boom"); }),
    ).rejects.toThrow("boom");
    const r = rec.finalize();
    expect(r.phases).toHaveLength(1);
    expect(r.phases[0].errorMessage).toBe("boom");
  });

  it("flags exceedsExpected when totalMs > 2× expectedMs", async () => {
    const rec = new PerformanceRecorder();
    await rec.withPhase("fetch", async () => { await sleep(30); });
    const r = rec.finalize({ expectedMs: 10 });
    expect(r.exceedsExpected).toBe(true);
    expect(r.expectedMs).toBe(10);
  });

  it("sums atomicBlockMs across multiple apply_transaction calls", async () => {
    const rec = new PerformanceRecorder();
    await rec.withPhase("apply_transaction", async () => { await sleep(5); });
    await rec.withPhase("apply_transaction", async () => { await sleep(5); });
    const r = rec.finalize();
    expect(r.atomicBlockMs).toBeGreaterThanOrEqual(10);
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
