// The unlock modal's price-vs-salary line must always be TRUE for the job shown.
import { describe, it, expect, vi } from "vitest";
vi.mock("@/components/ui/dialog", () => ({}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: undefined }) }));
import { priceAnchor } from "../../client/src/components/job-unlock-dialog";

describe("job unlock — honest price anchor", () => {
  it("monthly pay: percentage of one month (KES 18,000 → about 6%)", () => {
    expect(priceAnchor({ payMin: 18000, payMax: 21000, period: "month" })).toBe("about 6% of one month's pay");
    expect(priceAnchor({ payMin: 12000, period: "month" })).toBe("about 9% of one month's pay");
  });
  it("daily pay never claims 'less than a day' when it isn't", () => {
    expect(priceAnchor({ payMin: 600, payMax: 700, period: "day" })).toBe("about 2 days' pay");
    expect(priceAnchor({ payMin: 1500, period: "day" })).toBe("less than one day's pay");
  });
  it("no pay / hourly / per-project → no comparison at all", () => {
    expect(priceAnchor({ period: "month" })).toBeNull();
    expect(priceAnchor({ payMin: 300, period: "hour" })).toBeNull();
    expect(priceAnchor({ payMin: 5000, period: "project" })).toBeNull();
    expect(priceAnchor(null)).toBeNull();
  });
});
