import { describe, it, expect } from "vitest";
import { safePayPalUrl } from "../../server/paypal";

describe("safePayPalUrl (PayPal full-page checkout return URLs)", () => {
  it("keeps our own host and adds extra params", () => {
    const u = new URL(safePayPalUrl("https://workabroadhub.tech/payment?plan=pro", "/payment", { paypalReturn: "1", pid: "abc" }));
    expect(u.host).toBe("workabroadhub.tech");
    expect(u.pathname).toBe("/payment");
    expect(u.searchParams.get("plan")).toBe("pro");
    expect(u.searchParams.get("paypalReturn")).toBe("1");
    expect(u.searchParams.get("pid")).toBe("abc");
  });

  it("never redirects to a foreign host (no open redirect)", () => {
    const u = new URL(safePayPalUrl("https://evil.example.com/steal?x=1", "/payment"));
    expect(u.host).toBe("workabroadhub.tech");
    expect(u.pathname).toBe("/steal");
  });

  it("rejects protocol-relative and javascript URLs", () => {
    expect(new URL(safePayPalUrl("//evil.example.com/x", "/payment")).host).toBe("workabroadhub.tech");
    expect(new URL(safePayPalUrl("javascript:alert(1)", "/payment")).host).toBe("workabroadhub.tech");
  });

  it("forces https for public hosts and falls back on empty input", () => {
    expect(safePayPalUrl("http://workabroadhub.onrender.com/payment", "/payment").startsWith("https://workabroadhub.onrender.com/")).toBe(true);
    expect(new URL(safePayPalUrl(undefined, "/scout-jobs/post")).pathname).toBe("/scout-jobs/post");
  });
});
