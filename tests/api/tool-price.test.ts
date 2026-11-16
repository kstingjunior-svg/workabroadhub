import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { TOOL_SCAN_PRICE_KES } from "../../server/tools/tool-pay";
import { kesToUsd } from "../../server/paypal";

describe("screening tool price (2026-11: KES 300)", () => {
  it("server charges KES 300 per check", () => {
    expect(TOOL_SCAN_PRICE_KES).toBe(300);
  });
  it("client shows the same price", () => {
    const src = readFileSync("client/src/hooks/use-tool-payment.tsx", "utf8");
    expect(src).toMatch(/export const TOOL_SCAN_PRICE_KES = 300;/);
  });
  it("PayPal converts to about USD 2.31 and back within tolerance", () => {
    const usd = kesToUsd(300);
    expect(usd).toBe(2.31);
    expect(Math.abs(Math.round(usd * 130) - 300)).toBeLessThanOrEqual(5);
  });
});
