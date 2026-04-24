import crypto from "crypto";

// CRC32 — zlib.crc32() only exists in Node 22+; this project targets Node 20.
// IEEE 802.3 polynomial, matches what PayPal's local verification expects.
const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const WEBHOOK_ID   = process.env.PAYPAL_WEBHOOK_ID ?? "";
const PAYPAL_MODE  = (process.env.PAYPAL_ENV || "sandbox").toLowerCase();
const PAYPAL_BASE  = PAYPAL_MODE === "live"
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";

// ── Access-token cache ────────────────────────────────────────────────────────
// PayPal tokens are valid for ~9 hours. Cache until 5 min before expiry.
let _cachedToken: string | null = null;
let _tokenExpiresAt = 0;

async function getPayPalAccessToken(): Promise<string> {
  if (_cachedToken && Date.now() < _tokenExpiresAt) return _cachedToken;

  const clientId     = (process.env.PAYPAL_CLIENT_ID     || "").trim();
  const clientSecret = (process.env.PAYPAL_CLIENT_SECRET || "").trim();

  if (!clientId || !clientSecret) throw new Error("PayPal credentials not configured");

  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/x-www-form-urlencoded",
      "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) throw new Error(`PayPal OAuth failed: ${res.status}`);

  const data = await res.json() as any;
  _cachedToken    = data.access_token as string;
  // expires_in is in seconds — cache until 5 min before actual expiry
  _tokenExpiresAt = Date.now() + ((data.expires_in ?? 32400) - 300) * 1000;
  return _cachedToken;
}

// ── Primary: PayPal API verification ─────────────────────────────────────────
// Recommended by PayPal — delegates all crypto to their servers.
// Handles cert rotation automatically; no local cert cache needed.
async function verifyViaPayPalAPI(
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
): Promise<boolean> {
  const accessToken = await getPayPalAccessToken();

  const res = await fetch(`${PAYPAL_BASE}/v1/notifications/verify-webhook-signature`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      transmission_id:   headers["paypal-transmission-id"],
      transmission_time: headers["paypal-transmission-time"],
      cert_url:          headers["paypal-cert-url"],
      auth_algo:         headers["paypal-auth-algo"] ?? "SHA256withRSA",
      transmission_sig:  headers["paypal-transmission-sig"],
      webhook_id:        WEBHOOK_ID,
      webhook_event:     JSON.parse(rawBody.toString("utf8")),
    }),
  });

  if (!res.ok) throw new Error(`PayPal verify-webhook-signature: ${res.status}`);
  const data = await res.json() as any;
  return data.verification_status === "SUCCESS";
}

// ── Fallback: local crypto verification ──────────────────────────────────────
// Used when the PayPal API is unreachable. Guards against accepting forged
// events during an outage on PayPal's side.
//
// Allowlist: only fetch certs from PayPal's official domains to prevent
// a manipulated certUrl header pointing to an attacker-controlled cert.
const PAYPAL_CERT_HOST_RE = /^https:\/\/api(?:\.sandbox)?\.paypal\.com\//;
const CERT_CACHE: Record<string, string> = {};

async function verifyLocally(
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
): Promise<boolean> {
  const transmissionId   = headers["paypal-transmission-id"] as string | undefined;
  const transmissionTime = headers["paypal-transmission-time"] as string | undefined;
  const certUrl          = headers["paypal-cert-url"] as string | undefined;
  const authAlgo         = (headers["paypal-auth-algo"] as string | undefined) ?? "SHA256withRSA";
  const transmissionSig  = headers["paypal-transmission-sig"] as string | undefined;

  if (!transmissionId || !transmissionTime || !certUrl || !transmissionSig) return false;

  if (!PAYPAL_CERT_HOST_RE.test(certUrl)) {
    console.error(`[PAYPAL VERIFY] Rejected cert URL outside PayPal domain: ${certUrl}`);
    return false;
  }

  let cert = CERT_CACHE[certUrl];
  if (!cert) {
    const fetchRes = await fetch(certUrl);
    if (!fetchRes.ok) return false;
    cert = await fetchRes.text();
    CERT_CACHE[certUrl] = cert;
  }

  const crc: number = crc32(rawBody);
  const message = `${transmissionId}|${transmissionTime}|${WEBHOOK_ID}|${crc}`;

  const verifier = crypto.createVerify(authAlgo);
  verifier.update(message);
  return verifier.verify(cert, Buffer.from(transmissionSig, "base64"));
}

// ── Public entry point ────────────────────────────────────────────────────────
export async function verifyPayPalWebhook(
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
): Promise<boolean> {
  if (!WEBHOOK_ID) {
    console.warn("[PAYPAL VERIFY] PAYPAL_WEBHOOK_ID not set — skipping verification (dev mode)");
    return true;
  }

  // 1. Try PayPal's own API (primary — most reliable)
  try {
    const valid = await verifyViaPayPalAPI(rawBody, headers);
    console.log(`[PAYPAL VERIFY] API verification: ${valid ? "SUCCESS" : "FAILED"}`);
    return valid;
  } catch (apiErr: any) {
    console.warn(`[PAYPAL VERIFY] API unavailable (${apiErr?.message}) — falling back to local crypto`);
  }

  // 2. Fall back to local crypto if PayPal's API is down
  try {
    const valid = await verifyLocally(rawBody, headers);
    console.log(`[PAYPAL VERIFY] Local crypto fallback: ${valid ? "SUCCESS" : "FAILED"}`);
    return valid;
  } catch (localErr: any) {
    console.error(`[PAYPAL VERIFY] Local crypto error: ${localErr?.message}`);
    return false;
  }
}
