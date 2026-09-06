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

export function safaricomIpGuard(req: Request, res: Response, next: NextFunction) {
  if (String(process.env.MPESA_CALLBACK_IP_WHITELIST_DISABLED || "").trim() === "1") {
    return next();
  }
  const xfwd = String(req.headers["x-forwarded-for"] || "").split(",")[0]?.trim();
  const sourceIp = xfwd || req.socket?.remoteAddress || "";
  const allowed = SAFARICOM_IP_PREFIXES.some((prefix) => sourceIp.startsWith(prefix));
  if (allowed) return next();

  console.error(
    `[safaricomIpGuard] REJECTED ${req.method} ${req.path} from ip=${sourceIp} ` +
    `xff="${xfwd}" ua="${String(req.headers["user-agent"] || "").slice(0, 100)}"`,
  );
  // Silent drop — return 200 so the attacker can't fingerprint the whitelist.
  // Safaricom retry logic reads 2xx as accepted; a real caller would already
  // have gotten here on a valid IP.
  return res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
}
