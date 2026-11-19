import { describe, it, expect, vi } from "vitest";

vi.mock("../../server/db", () => ({ pool: { query: vi.fn(async () => ({ rows: [] })), connect: vi.fn() } }));

import { normalizeRoute, isClientNoise, clientKey, findSpikes, SPIKE_THRESHOLD } from "../../server/lib/failure-monitor";

describe("failure monitor — route grouping", () => {
  it("collapses ids, numbers and tokens so one broken route is one row", () => {
    expect(normalizeRoute("/api/user/documents")).toBe("/api/user/documents");
    expect(normalizeRoute("/api/shared/3a55df72-a3b4-4943-8cd4-305b16d3fef0?x=1")).toBe("/api/shared/:id");
    expect(normalizeRoute("/api/admin/users/42/orders/7")).toBe("/api/admin/users/:id/orders/:id");
    expect(normalizeRoute("/api/pay/WAH-tm_nt8PMpPOG/status")).toBe("/api/pay/:id/status");
    expect(normalizeRoute("/api/share/aB3dE5fG7hJ9kL1mN3pQ5rS7/hit")).toBe("/api/share/:token/hit");
  });
});

describe("failure monitor — client noise filter", () => {
  it("ignores network blips, deploy reloads and extensions", () => {
    expect(isClientNoise("Failed to fetch")).toBe(true);
    expect(isClientNoise("Failed to fetch dynamically imported module: https://x/assets/a.js")).toBe(true);
    expect(isClientNoise("Cannot read properties of undefined (reading 'M_ID')", "at I (chrome-extension://abc/x.js:1:1)")).toBe(true);
    expect(isClientNoise("unknown")).toBe(true);
  });
  it("keeps real crashes", () => {
    expect(isClientNoise("t.find is not a function")).toBe(false);
    expect(isClientNoise("Cannot read properties of undefined (reading 'toUpperCase')")).toBe(false);
    expect(isClientNoise("Minified React error #426")).toBe(false);
  });
  it("groups crashes by page + message", () => {
    expect(clientKey("https://workabroadhub.tech/country/uk?ref=1", "t.find is not a function"))
      .toBe("/country/uk — t.find is not a function");
  });
});

describe("failure monitor — spikes", () => {
  it("only alerts at the threshold", () => {
    const m = new Map<string, number>([["GET /api/a", SPIKE_THRESHOLD - 1], ["GET /api/b", SPIKE_THRESHOLD]]);
    expect(findSpikes(m)).toEqual(["GET /api/b"]);
  });
});
