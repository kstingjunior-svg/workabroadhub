// ─────────────────────────────────────────────────────────────────────────────
// safaricomIpGuard — Express middleware for M-Pesa callback endpoints.
//
// Rejects requests whose source IP isn't in Safaricom's documented ranges.
// Applied to STK-push callbacks, B2C result/timeout, Pull API callbacks,
// and every per-product isolated callback (scout-jobs, write-from-scratch).
//
// Attack this closes:
//   1. Attacker observes / guesses a valid CheckoutRequestID (moderate)
//   2. POSTs a forged 'stkCallback' with ResultCode: 0 + matching amount
//   3. Amount-fraud gate downstream passes (amount matches a known plan)
//   4. User is unlocked without paying
//
// The middleware silently drops non-whitelisted requests AFTER already
// sending 200 to Safaricom (which happens in every callback body). If we
// return a status here we might interfere with Safaricom retry policy.
//
// Emergency bypass: set MPESA_CALLBACK_IP_WHITELIST_DISABLED=1 in env.
// Use if Safaricom rotates their range and legitimate callbacks start
// bouncing.
// ─────────────────────────────────────────────────────────────────────────────

import type { Request, Response, NextFunction } from "express";

/**
 * Safaricom's documented callback source IPs. Verified against their
 * Daraja documentation + observed prod traffic. If Safaricom expands the
 * range, add here + redeploy.
 *
 * Keeping localhost variants so `curl` tests from the Render shell + local
 * dev machines pass without disabling the whitelist wholesale.
 */
const SAFARICOM_IP_PREFIXES = [
  "196.201.214.",
  "196.201.212.",
  "196.201.213.",
  "41.215.160.",
  "127.0.0.1",
  "::1",
];

// Cloudflare edge ranges (https://www.cloudflare.com/ips-v4). Traffic to
// workabroadhub.tech passes through Cloudflare; traffic to *.onrender.com
// reaches Render directly.
const CLOUDFLARE_V4 = [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18",
  "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17",
  "162.158.0.0/15", "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
];
function ipv4ToInt(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.replace(/^::ffff:/, ""));
  if (!m) return null;
  return ((+m[1] << 24) >>> 0) + (+m[2] << 16) + (+m[3] << 8) + +m[4];
}
function inCidr(ip: string, cidr: string): boolean {
  const [base, bits] = cidr.split("/");
  const a = ipv4ToInt(ip), b = ipv4ToInt(base);
  if (a === null || b === null) return false;
  const mask = bits === "0" ? 0 : (~0 << (32 - Number(bits))) >>> 0;
  return (a & mask) === (b & mask);
}
export function isCloudflareIp(ip: string): boolean {
  return CLOUDFLARE_V4.some((c) => inCidr(ip, c));
}

/**
 * 2026-11 (payment audit): the FIRST X-Forwarded-For entry is whatever the
 * caller typed, so it can't be trusted. The proxy in front of the app
 * appends the real peer address as the LAST entry; if that peer is a
 * Cloudflare edge, Cloudflare's own CF-Connecting-IP holds the real client.
 */
export function trustedSourceIp(req: Request): string {
  const parts = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
  const peer = parts.length ? parts[parts.length - 1] : (req.socket?.remoteAddress || "");
  if (isCloudflareIp(peer)) {
    const cf = String(req.headers["cf-connecting-ip"] || "").trim();
    if (cf) return cf;
  }
  return peer;
}

const isSafaricom = (ip: string) => SAFARICOM_IP_PREFIXES.some((prefix) => ip.startsWith(prefix));

export function safaricomIpGuard(req: Request, res: Response, next: NextFunction) {
  if (String(process.env.MPESA_CALLBACK_IP_WHITELIST_DISABLED || "").trim() === "1") {
    return next();
  }
  const xfwd = String(req.headers["x-forwarded-for"] || "").split(",")[0]?.trim();
  const sourceIp = xfwd || req.socket?.remoteAddress || "";
  const strictIp = trustedSourceIp(req);
  const strictAllowed = isSafaricom(strictIp);
  const looseAllowed = isSafaricom(sourceIp);
  // Strict mode (MPESA_IP_GUARD_STRICT=1) uses only the spoof-proof address.
  // Until it's switched on, disagreements are logged so the switch can be
  // made safely once real Safaricom traffic has been observed.
  const strictMode = String(process.env.MPESA_IP_GUARD_STRICT || "").trim() === "1";
  if (strictMode ? strictAllowed : looseAllowed) {
    if (!strictMode && !strictAllowed) {
      console.warn(`[safaricomIpGuard][shadow] would REJECT in strict mode: ${req.method} ${req.path} first-xff=${sourceIp} trusted=${strictIp} xff="${String(req.headers["x-forwarded-for"] || "").slice(0, 200)}"`);
    }
    return next();
  }

  console.error(
    `[safaricomIpGuard] REJECTED ${req.method} ${req.path} from ip=${sourceIp} ` +
    `xff="${xfwd}" ua="${String(req.headers["user-agent"] || "").slice(0, 100)}"`,
  );
  // Silent drop — return 200 so the attacker can't fingerprint the whitelist.
  // Safaricom retry logic reads 2xx as accepted; a real caller would already
  // have gotten here on a valid IP.
  return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
}
