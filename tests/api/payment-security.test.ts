/** 2026-11 payment/security audit — spoof-proof client IP + Safaricom guard. */
import { describe, it, expect } from "vitest";
import { trustedSourceIp, isCloudflareIp, safaricomIpGuard } from "../../server/middleware/safaricomIpGuard";

const req = (xff: string, cf?: string, socket = "10.0.0.5") =>
  ({ headers: { "x-forwarded-for": xff, ...(cf ? { "cf-connecting-ip": cf } : {}) }, socket: { remoteAddress: socket }, method: "POST", path: "/cb" }) as any;

describe("trustedSourceIp", () => {
  it("ignores a caller-supplied first X-Forwarded-For entry", () => {
    // attacker sends XFF: 196.201.214.10 directly to onrender.com; Render appends real peer
    expect(trustedSourceIp(req("196.201.214.10, 102.68.1.2"))).toBe("102.68.1.2");
  });
  it("uses CF-Connecting-IP only when the peer is a Cloudflare edge", () => {
    expect(isCloudflareIp("172.70.1.1")).toBe(true);
    expect(trustedSourceIp(req("196.201.214.10, 41.90.1.1, 172.70.1.1", "41.90.1.1"))).toBe("41.90.1.1");
    // CF-Connecting-IP header from a non-Cloudflare peer is ignored
    expect(trustedSourceIp(req("5.5.5.5", "196.201.214.10"))).toBe("5.5.5.5");
  });
  it("real Safaricom callback straight to Render passes; spoof is logged in shadow mode", () => {
    let passed = false;
    const res: any = { status: () => ({ json: () => undefined }) };
    safaricomIpGuard(req("196.201.214.10"), res, () => { passed = true; });
    expect(passed).toBe(true);
    process.env.MPESA_IP_GUARD_STRICT = "1";
    passed = false;
    safaricomIpGuard(req("196.201.214.10, 102.68.1.2"), res, () => { passed = true; });
    expect(passed).toBe(false);
    delete process.env.MPESA_IP_GUARD_STRICT;
  });
});
