// Conversion analytics must never carry personal data.
import { describe, it, expect, vi } from "vitest";
const sent: any[] = [];
vi.mock("@/lib/analytics", () => ({ trackServerEvent: (e: string, m: any) => sent.push([e, m]) }));
import { conv, CONV } from "../../client/src/lib/conversion-events";

describe("conversion events — privacy", () => {
  it("keeps only feature/plan/trigger-type keys and drops personal data", () => {
    conv(CONV.UPGRADE_PLAN, { plan: "yearly", feature: "premium job links", trigger: "locked_feature",
      // @ts-expect-error — deliberately passing forbidden keys
      phone: "0712345678", email: "a@b.com", name: "Jane", cv: "secret" });
    expect(sent.at(-1)).toEqual(["upgrade_plan_select", { plan: "yearly", feature: "premium job links", trigger: "locked_feature" }]);
  });
  it("never throws even if analytics fails", () => {
    expect(() => conv(CONV.UPGRADE_VIEW, { feature: "x".repeat(500) })).not.toThrow();
    expect(String((sent.at(-1)[1] as any).feature).length).toBeLessThanOrEqual(60);
  });
});
