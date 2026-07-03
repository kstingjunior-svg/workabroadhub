import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NanjilaFlags } from "../../../server/nanjila/feature-flags";

const ENV_KEYS = [
  "NANJILA_ORCHESTRATOR_ENABLED",
  "NANJILA_ORCHESTRATOR_ROLLOUT_PCT",
  "NANJILA_MEMORY_ENABLED",
  "NANJILA_JOB_SCORE_ENABLED",
];

describe("NanjilaFlags", () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) original[k] = process.env[k];
    for (const k of ENV_KEYS) delete process.env[k];
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
  });

  it("defaults every feature flag to false", () => {
    expect(NanjilaFlags.orchestratorEnabled).toBe(false);
    expect(NanjilaFlags.memoryEnabled).toBe(false);
    expect(NanjilaFlags.jobScoreEnabled).toBe(false);
  });

  it("accepts 'true' / '1' / 'yes' / 'on' as true", () => {
    for (const v of ["true", "1", "yes", "on", "TRUE", "On"]) {
      process.env.NANJILA_ORCHESTRATOR_ENABLED = v;
      expect(NanjilaFlags.orchestratorEnabled).toBe(true);
    }
  });

  it("accepts 'false' / '0' / 'no' / 'off' as false", () => {
    for (const v of ["false", "0", "no", "off"]) {
      process.env.NANJILA_ORCHESTRATOR_ENABLED = v;
      expect(NanjilaFlags.orchestratorEnabled).toBe(false);
    }
  });

  it("clamps rollout percentage to 0..100", () => {
    process.env.NANJILA_ORCHESTRATOR_ROLLOUT_PCT = "-10";
    expect(NanjilaFlags.orchestratorRolloutPct).toBe(0);
    process.env.NANJILA_ORCHESTRATOR_ROLLOUT_PCT = "150";
    expect(NanjilaFlags.orchestratorRolloutPct).toBe(100);
    process.env.NANJILA_ORCHESTRATOR_ROLLOUT_PCT = "42";
    expect(NanjilaFlags.orchestratorRolloutPct).toBe(42);
  });

  it("userInBucket is deterministic for the same user", () => {
    const a = NanjilaFlags.userInBucket("user-123", 50);
    const b = NanjilaFlags.userInBucket("user-123", 50);
    expect(a).toBe(b);
  });

  it("userInBucket returns true at 100% for any user", () => {
    expect(NanjilaFlags.userInBucket("user-anyone", 100)).toBe(true);
  });

  it("userInBucket returns false at 0%", () => {
    expect(NanjilaFlags.userInBucket("user-anyone", 0)).toBe(false);
  });

  it("userInBucket approximates the target percentage across many users", () => {
    let inside = 0;
    const N = 1000;
    for (let i = 0; i < N; i++) {
      if (NanjilaFlags.userInBucket(`user-${i}`, 30)) inside++;
    }
    // Should be roughly 30% (allow +/- 5%)
    expect(inside / N).toBeGreaterThan(0.25);
    expect(inside / N).toBeLessThan(0.35);
  });
});
