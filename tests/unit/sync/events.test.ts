import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  EventBuffer,
  EVENT_SCHEMA_VERSION,
  emitAgencyCreated,
  emitAgencyQuarantined,
  emitAgencyUpdated,
  emitProviderHealthChanged,
  emitSynchronizationCompleted,
  emitSynchronizationFailed,
  emitSynchronizationStarted,
  type SyncEvent,
} from "../../../server/sync/events";

describe("EVENT_SCHEMA_VERSION", () => {
  it("is exposed as a numeric constant ≥ 1", () => {
    expect(EVENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
  });
});

describe("EventBuffer — accumulation + ordering", () => {
  let buf: EventBuffer;
  beforeEach(() => { buf = new EventBuffer(); });

  it("starts empty", () => {
    expect(buf.size()).toBe(0);
    expect(buf.peek()).toHaveLength(0);
  });

  it("preserves emission order", () => {
    emitSynchronizationStarted(buf, {
      runId: "r1", providerId: "p1", correlationId: "c1",
      mode: "manual", triggeredBy: "u1",
    });
    emitAgencyCreated(buf, {
      runId: "r1", providerId: "p1",
      agencyId: "a1", licenseNumber: "PVT-1",
      fingerprint: "fp1", agency: {} as any,
    });
    const peek = buf.peek();
    expect(peek).toHaveLength(2);
    expect(peek[0].type).toBe("SynchronizationStarted");
    expect(peek[1].type).toBe("AgencyCreated");
  });

  it("each event carries a v: 1 schema version", () => {
    emitSynchronizationCompleted(buf, {
      runId: "r1", providerId: "p1", correlationId: "c1",
      counts: { fetched: 0, created: 0, updated: 0, unchanged: 0, deleted: 0, quarantined: 0 },
      durationMs: 1,
    });
    expect((buf.peek()[0] as any).v).toBe(1);
  });
});

describe("EventBuffer — sibling event emission", () => {
  let buf: EventBuffer;
  beforeEach(() => { buf = new EventBuffer(); });

  it("emitAgencyUpdated also emits a FingerprintChanged sibling", () => {
    emitAgencyUpdated(buf, {
      runId: "r1", providerId: "p1",
      agencyId: "a1", licenseNumber: "PVT-1",
      oldFingerprint: "oldfp", newFingerprint: "newfp",
      fieldChanges: { email: { from: "a@x", to: "b@x" } },
    });
    const types = buf.peek().map((e) => e.type);
    expect(types).toContain("AgencyUpdated");
    expect(types).toContain("FingerprintChanged");
    const fp = buf.peek().find((e) => e.type === "FingerprintChanged") as any;
    expect(fp.before).toBe("oldfp");
    expect(fp.after).toBe("newfp");
  });

  it("emitAgencyQuarantined emits a stage-specific sibling event", () => {
    emitAgencyQuarantined(buf, {
      runId: "r1", providerId: "p1",
      licenseNumber: "PVT-1",
      rawPayload: { agencyName: "X" },
      stage: "normalize",
      reasons: [{ path: "(normalize)", code: "invalid_format", message: "boom" }],
    });
    const types = buf.peek().map((e) => e.type);
    expect(types).toContain("AgencyQuarantined");
    expect(types).toContain("NormalizationFailed");
  });

  it("validate-stage quarantine emits ValidationFailed not NormalizationFailed", () => {
    emitAgencyQuarantined(buf, {
      runId: "r1", providerId: "p1",
      licenseNumber: "PVT-1",
      rawPayload: { agencyName: "X" },
      stage: "validate",
      reasons: [{ path: "expiryDate", code: "required", message: "missing expiry" }],
    });
    const types = buf.peek().map((e) => e.type);
    expect(types).toContain("AgencyQuarantined");
    expect(types).toContain("ValidationFailed");
    expect(types).not.toContain("NormalizationFailed");
  });
});

describe("EventBuffer — flush()", () => {
  let buf: EventBuffer;
  beforeEach(() => { buf = new EventBuffer(); });

  it("flush is a no-op on an empty buffer", async () => {
    const fakeClient = { query: vi.fn() };
    await buf.flush(fakeClient as any);
    expect(fakeClient.query).not.toHaveBeenCalled();
  });

  it("flush writes one INSERT for all events and clears the buffer", async () => {
    emitSynchronizationStarted(buf, {
      runId: "r1", providerId: "p1", correlationId: "c1",
      mode: "manual", triggeredBy: "u1",
    });
    emitProviderHealthChanged(buf, {
      providerId: "p1", before: "healthy", after: "degraded",
      message: "probe failed", consecutiveFailures: 1,
    });
    expect(buf.size()).toBe(2);

    const queryCalls: any[] = [];
    const fakeClient = {
      query: vi.fn(async (sql: string, params: any[]) => {
        queryCalls.push({ sql, params });
        return { rows: [] };
      }),
    };

    await buf.flush(fakeClient as any);
    expect(fakeClient.query).toHaveBeenCalledTimes(1);
    expect(queryCalls[0].sql).toContain("INSERT INTO sync_events");
    // Parallel arrays for UNNEST — 7 of them. First one is the event-type array.
    expect(Array.isArray(queryCalls[0].params[0])).toBe(true);
    expect(queryCalls[0].params[0]).toEqual(["SynchronizationStarted", "ProviderHealthChanged"]);
    // Buffer cleared on success.
    expect(buf.size()).toBe(0);
  });

  it("preserves the buffer on transactional failure (caller retries)", async () => {
    emitSynchronizationFailed(buf, {
      runId: "r1", providerId: "p1", correlationId: "c1",
      reason: "exception", errorMessage: "test",
    });
    const fakeClient = {
      query: vi.fn(async () => { throw new Error("DB blew up"); }),
    };
    await expect(buf.flush(fakeClient as any)).rejects.toThrow("DB blew up");
    // Buffer NOT cleared — caller's retry path can replay.
    expect(buf.size()).toBe(1);
  });
});

describe("emitProviderHealthChanged — correlation_id is null", () => {
  it("health-transition events have no correlation_id (they can occur outside runs)", async () => {
    const buf = new EventBuffer();
    emitProviderHealthChanged(buf, {
      providerId: "p1", before: "healthy", after: "broken",
      message: "service down", consecutiveFailures: 5,
    });
    const queryCalls: any[] = [];
    const fakeClient = {
      query: vi.fn(async (_sql: string, params: any[]) => {
        queryCalls.push(params);
        return { rows: [] };
      }),
    };
    await buf.flush(fakeClient as any);
    // params[2] is the correlation_ids array
    expect(queryCalls[0][2]).toEqual([null]);
    // params[3] is the provider_ids array
    expect(queryCalls[0][3]).toEqual(["p1"]);
    // params[4] is the subject_types array
    expect(queryCalls[0][4]).toEqual(["provider"]);
  });
});
