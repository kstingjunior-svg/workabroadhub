/** Daily admin "needs your attention" email (2026-11). */
import { describe, it, expect } from "vitest";
import { buildDigestEmail } from "../../server/lib/admin-digest";

describe("admin digest email", () => {
  const items = [
    { title: "2 payments need matching (KES 600)", detail: "Money received…", link: "https://workabroadhub.tech/admin/finance" },
    { title: "PayPal payments are not completing", detail: "113 orders, 0 paid", link: "https://workabroadhub.tech/admin/analytics", urgent: true },
  ];
  it("puts urgent items first and counts them in the subject", () => {
    const e = buildDigestEmail(items, new Date("2026-11-18T04:00:00Z"));
    expect(e.subject).toMatch(/^⚠️ 2 things need your attention/);
    expect(e.html.indexOf("PayPal")).toBeLessThan(e.html.indexOf("payments need matching"));
    expect(e.text).toMatch(/\[URGENT\] PayPal/);
  });
  it("escapes text", () => {
    const e = buildDigestEmail([{ title: "<b>x</b>", detail: "a & b", link: "https://x" }]);
    expect(e.html).not.toContain("<b>x</b>");
    expect(e.subject).toMatch(/^1 thing needs your attention/);
  });
});
