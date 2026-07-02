import { describe, it, expect } from "vitest";
import {
  nextHealthState,
  performHealthProbe,
  type HealthState,
} from "../../../server/sync/health";
import type { ProviderHealth, SyncProvider } from "../../../server/sync/types";

// ─────────────────────────────────────────────────────────────────────────────
// nextHealthState — pure state machine
// ─────────────────────────────────────────────────────────────────────────────

describe("nextHealthState", () => {
  it("transitions healthy → healthy on success", () => {
    const r = nextHealthState({ status: "healthy", consecutiveFailures: 0 }, { ok: true });
    expect(r).toEqual({ status: "healthy", consecutiveFailures: 0 });
  });

  it("transitions healthy → degraded on first failure", () => {
    const r = nextHealthState({ status: "healthy", consecutiveFailures: 0 }, {
      ok: false, errorMessage: "boom",
    });
    expect(r.status).toBe("degraded");
    expect(r.consecutiveFailures).toBe(1);
  });

  it("transitions degraded → broken after 5 consecutive failures", () => {
    let state: HealthState = { status: "healthy", consecutiveFailures: 0 };
    for (let i = 0; i < 5; i++) {
      state = nextHealthState(state, { ok: false, errorMessage: "x" });
    }
    expect(state.status).toBe("broken");
    expect(state.consecutiveFailures).toBe(5);
  });

  it("recovers immediately to healthy on a single success", () => {
    let state: HealthState = { status: "broken", consecutiveFailures: 5 };
    state = nextHealthState(state, { ok: true });
    expect(state).toEqual({ status: "healthy", consecutiveFailures: 0 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// performHealthProbe — wraps adapter healthCheck() with timeout
// ─────────────────────────────────────────────────────────────────────────────

function makeProvider(opts: {
  result?:  ProviderHealth;
  throws?:  string;
  hangsMs?: number;
}): SyncProvider {
  return {
    slug: "test", displayName: "Test", country: "KE",
    metadata: () => ({
      slug: "test", displayName: "Test", country: "KE",
      upstreamUrl: "x", isStatic: true, adapterVersion: "v0",
      capabilities: {
        supportsPagination: false, supportsIncrementalSync: false,
        supportsWebhooks: false, supportsFiltering: false, supportsSearch: false,
        supportsUpstreamSnapshots: false, supportsHealthProbe: false,
      },
    }),
    healthCheck: async () => {
      if (opts.throws) throw new Error(opts.throws);
      if (opts.hangsMs) await new Promise((r) => setTimeout(r, opts.hangsMs));
      return opts.result ?? {
        status: "healthy", message: "ok", checkedAt: new Date().toISOString(),
      };
    },
    fetchRecords: async function* () {},
    normalize: (raw) => raw as any,
  };
}

describe("performHealthProbe", () => {
  it("returns ok=true on a healthy result", async () => {
    const p = makeProvider({ result: { status: "healthy", message: "ok", checkedAt: "now" } });
    const r = await performHealthProbe(p);
    expect(r.ok).toBe(true);
    expect(r.result?.status).toBe("healthy");
  });

  it("returns ok=false when the adapter says broken", async () => {
    const p = makeProvider({ result: { status: "broken", message: "down", checkedAt: "now" } });
    const r = await performHealthProbe(p);
    expect(r.ok).toBe(false);
  });

  it("returns ok=false on exception, with the message captured", async () => {
    const p = makeProvider({ throws: "network unreachable" });
    const r = await performHealthProbe(p);
    expect(r.ok).toBe(false);
    expect(r.errorMessage).toContain("network unreachable");
  });

  it("times out without hanging the caller", async () => {
    const p = makeProvider({ hangsMs: 500 });
    const r = await performHealthProbe(p, 50);
    expect(r.ok).toBe(false);
    expect(r.errorMessage).toMatch(/timed out/);
  });
});
