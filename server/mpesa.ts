import axios from "axios";
import moment from "moment";
import { mpesaCircuitBreaker, mpesaB2CCircuitBreaker, CircuitBreakerOpenError } from "./circuit-breaker";

// Switch between Daraja production and sandbox via the MPESA_ENV env var.
// Acceptable values (case-insensitive): "production" | "prod" | "live"  →  api.safaricom.co.ke
//                                       anything else (or unset)         →  sandbox.safaricom.co.ke
// Alternatively, set MPESA_BASE_URL explicitly to override both.
const _mpesaEnv = (process.env.MPESA_ENV || "").trim().toLowerCase();
const _isProd = ["production", "prod", "live"].includes(_mpesaEnv);
const MPESA_BASE_URL = (process.env.MPESA_BASE_URL || "").trim() || (
  _isProd ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke"
);
console.log(`[M-Pesa] Environment: ${_isProd ? "PRODUCTION" : "SANDBOX"} | base=${MPESA_BASE_URL}`);
export function getCallbackBaseUrl(): string {
  if (process.env.MPESA_CALLBACK_URL) {
    const url = new URL(process.env.MPESA_CALLBACK_URL);
    return `${url.protocol}//${url.host}`;
  }
  if (process.env.APP_URL) return process.env.APP_URL;
  // On Render, set APP_URL=https://<your-service>.onrender.com in env vars.
  // localhost fallback only triggers in dev when nothing is configured.
  return "https://localhost:5000";
}

// ── IN-MEMORY TOKEN CACHE ─────────────────────────────────────────────────────
interface TokenCache {
  token: string;
  expiresAt: number;   // epoch ms
  obtainedAt: number;  // epoch ms
  environment: string;
}

let _tokenCache: TokenCache | null = null;
let _tokenError: string | null = null;
const TOKEN_BUFFER_MS = 90_000; // refresh 90s before actual expiry

/**
 * Fetch a fresh OAuth token from Safaricom and cache it until near-expiry.
 * Pass forceRefresh=true to bypass the cache (e.g. after a 401 from Pull API).
 */
async function getOAuthToken(forceRefresh = false): Promise<string> {
  const now = Date.now();

  // Return cached token if still valid (with buffer)
  if (!forceRefresh && _tokenCache && _tokenCache.expiresAt > now + TOKEN_BUFFER_MS) {
    return _tokenCache.token;
  }

  const consumerKey = (process.env.MPESA_CONSUMER_KEY || "").trim();
  const consumerSecret = (process.env.MPESA_CONSUMER_SECRET || "").trim();

  if (!consumerKey || !consumerSecret) {
    const err = "MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET must be set";
    _tokenError = err;
    throw new Error(`[M-Pesa] ${err}`);
  }

  try {
    // Defensive validation — Safaricom returns 400 with an empty body when
    // the key or secret contains stray whitespace or newlines, which is the
    // most common production misconfiguration. Catching it locally gives a
    // much more actionable error than the upstream "OAuth token error: 400 \"\"".
    if (/\s/.test(consumerKey) || /\s/.test(consumerSecret)) {
      const err = "MPESA_CONSUMER_KEY or MPESA_CONSUMER_SECRET contains whitespace — re-copy the value from the Daraja portal";
      _tokenError = err;
      throw new Error(`[M-Pesa] ${err}`);
    }

    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
    console.log(
      "[M-Pesa] Requesting OAuth token from:",
      `${MPESA_BASE_URL}/oauth/v1/generate`,
      "| keyLen:", consumerKey.length,
      "| secretLen:", consumerSecret.length
    );

    const tokenRes = await axios.get(
      `${MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
      { headers: { Authorization: `Basic ${auth}` }, timeout: 15000 }
    );

    const token: string = tokenRes.data.access_token;
    const expiresIn: number = (tokenRes.data.expires_in || 3600) * 1000; // ms
    _tokenCache = { token, expiresAt: now + expiresIn, obtainedAt: now, environment: MPESA_BASE_URL };
    _tokenError = null;
    console.log(`[M-Pesa] OAuth token obtained — expires in ${Math.round(expiresIn / 60000)} min`);
    return token;
  } catch (err: any) {
    // Safaricom's 400 response is often empty — surface enough context that a
    // human can act on it (status + headers + first 200 chars of body).
    const status = err.response?.status;
    const data = err.response?.data;
    const bodySnippet = typeof data === "string"
      ? data.slice(0, 200)
      : JSON.stringify(data ?? {}).slice(0, 200);
    const wwwAuth = err.response?.headers?.["www-authenticate"];
    const msg = data?.errorMessage || data?.error_description || err.message || "Token request failed";
    _tokenError = msg;
    console.error(
      `[M-Pesa] OAuth token error: status=${status ?? "n/a"} body=${bodySnippet || "<empty>"}` +
      (wwwAuth ? ` | www-authenticate="${wwwAuth}"` : "") +
      ` | env=${_isProd ? "PRODUCTION" : "SANDBOX"} keyLen=${consumerKey.length} secretLen=${consumerSecret.length}` +
      ` | hint=${status === 400 ? `400 from Daraja means the consumer key/secret aren't valid for the ${_isProd ? "PRODUCTION (api.safaricom.co.ke)" : "SANDBOX (sandbox.safaricom.co.ke)"} environment. Make sure the MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET in Render belong to your Go-Live app (not a sandbox app), and that MPESA_ENV=production is set.` : ""}`
    );
    throw err;
  }
}

/**
 * Returns current in-memory token status for the admin debug panel.
 * Never exposes the raw token value.
 */
export function getTokenStatus(): {
  status: "valid" | "expiring_soon" | "expired" | "not_fetched" | "error";
  ttlSeconds: number;
  obtainedAt: string | null;
  expiresAt: string | null;
  environment: string;
  lastError: string | null;
} {
  const now = Date.now();
  if (_tokenError && !_tokenCache) {
    return { status: "error", ttlSeconds: 0, obtainedAt: null, expiresAt: null, environment: MPESA_BASE_URL, lastError: _tokenError };
  }
  if (!_tokenCache) {
    return { status: "not_fetched", ttlSeconds: 0, obtainedAt: null, expiresAt: null, environment: MPESA_BASE_URL, lastError: _tokenError };
  }
  const ttlMs = _tokenCache.expiresAt - now;
  const ttlSeconds = Math.max(0, Math.round(ttlMs / 1000));
  const status = ttlMs > TOKEN_BUFFER_MS ? "valid" : ttlMs > 0 ? "expiring_soon" : "expired";
  return {
    status,
    ttlSeconds,
    obtainedAt: new Date(_tokenCache.obtainedAt).toISOString(),
    expiresAt: new Date(_tokenCache.expiresAt).toISOString(),
    environment: _tokenCache.environment,
    lastError: _tokenError,
  };
}

// ── LOAD TEST MOCK ────────────────────────────────────────────────────────────
// When LOAD_TEST_MODE=true the stkPush function returns a deterministic mock
// response without touching Safaricom APIs. NEVER set this in production.
export function isLoadTestMode(): boolean {
  return process.env.LOAD_TEST_MODE === "true";
}

export async function stkPush(
  phone: string,
  amount: number,
  description: string = "Career Consultation Fee",
  accountRef: string = "WorkAbroadHub",   // Phase 1: callers pass paymentId so AccountReference = orderId
  overrideCallbackUrl?: string            // Optional: override the Safaricom callback destination
) {
  // LOAD_TEST_MODE: bypass all Safaricom API calls and return mock response.
  if (isLoadTestMode()) {
    const mockId = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    console.log(`[LOAD_TEST] Mock STK Push → phone=${phone} amount=${amount} ref=${accountRef}`);
    return {
      MerchantRequestID: `mock-merchant-${mockId}`,
      CheckoutRequestID: `mock_checkout_${mockId}`,
      ResponseCode: "0",
      ResponseDescription: "Mock STK request accepted",
      CustomerMessage: "Success. Request accepted for processing",
    };
  }

  return mpesaCircuitBreaker.execute(async () => {
    const timestamp = moment().format("YYYYMMDDHHmmss");
    const shortCode = (process.env.MPESA_SHORTCODE || "").trim();
    const passKey = (process.env.MPESA_PASSKEY || "").trim();

    if (!shortCode || !passKey) {
      throw new Error("[M-Pesa] MPESA_SHORTCODE and MPESA_PASSKEY must be set");
    }

    const password = Buffer.from(shortCode + passKey + timestamp).toString("base64");
    const accessToken = await getOAuthToken();
    const formattedPhone = formatPhoneNumber(phone);

    // Always use the actual running server domain so Safaricom can reach this server.
    // getCallbackBaseUrl() uses APP_URL which is the live public URL of this server.
    // Callers may pass a custom callbackUrl override (e.g. /api/payments/mpesa/callback)
    // /api/payments/mpesa/callback is the modern handler that runs the full
    // payment pipeline (runPaymentPipeline → unlock + AI generation for service
    // orders). The legacy /api/mpesa/callback only activates Pro Plan and never
    // triggers service-order AI gen — keep all Safaricom callbacks on the new path.
    const callbackUrl = overrideCallbackUrl || `${getCallbackBaseUrl()}/api/payments/mpesa/callback`;
    console.log("[M-Pesa] STK Push → phone:", formattedPhone, "| amount:", amount, "| accountRef:", accountRef, "| callback:", callbackUrl);

    const res = await axios.post(
      `${MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`,
      {
        BusinessShortCode: shortCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: Math.round(amount),
        PartyA: formattedPhone,
        PartyB: shortCode,
        PhoneNumber: formattedPhone,
        CallBackURL: callbackUrl,
        AccountReference: accountRef,
        TransactionDesc: description,
      },
      {
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        timeout: 30000,
      }
    );

    console.log("[M-Pesa] STK Push response:", JSON.stringify(res.data));
    return res.data;
  });
}

export async function stkPushForRenewal(phone: string, amount: number, accountRef: string) {
  return mpesaCircuitBreaker.execute(async () => {
    const timestamp = moment().format("YYYYMMDDHHmmss");
    const shortCode = (process.env.MPESA_SHORTCODE || "").trim();
    const passKey = (process.env.MPESA_PASSKEY || "").trim();
    const password = Buffer.from(shortCode + passKey + timestamp).toString("base64");

    const accessToken = await getOAuthToken();
    const formattedPhone = formatPhoneNumber(phone);

    const callbackUrl = `${getCallbackBaseUrl()}/api/mpesa/license-renewal/callback`;
    console.log("[M-Pesa] Renewal STK Push → phone:", formattedPhone, "amount:", amount, "| callback:", callbackUrl);

    const res = await axios.post(
      `${MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`,
      {
        BusinessShortCode: shortCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: formattedPhone,
        PartyB: shortCode,
        PhoneNumber: formattedPhone,
        CallBackURL: callbackUrl,
        AccountReference: accountRef,
        TransactionDesc: "License Renewal Fee",
      },
      {
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        timeout: 30000,
      }
    );

    console.log("[M-Pesa] Renewal STK Push response:", JSON.stringify(res.data));
    return res.data;
  });
}

function formatPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/\s+/g, "").replace(/[^0-9]/g, "");

  if (cleaned.startsWith("0")) {
    cleaned = "254" + cleaned.substring(1);
  } else if (cleaned.startsWith("+254")) {
    cleaned = cleaned.substring(1);
  } else if (!cleaned.startsWith("254")) {
    cleaned = "254" + cleaned;
  }

  return cleaned;
}

export async function stkQuery(checkoutRequestId: string) {
  // LOAD_TEST_MODE: always return success for mock checkouts
  if (isLoadTestMode() && checkoutRequestId.startsWith("mock_checkout_")) {
    console.log(`[LOAD_TEST] Mock STK Query → ${checkoutRequestId} → success`);
    return { ResultCode: 0, ResultDesc: "The service request is processed successfully." };
  }

  return mpesaCircuitBreaker.execute(async () => {
    const timestamp = moment().format("YYYYMMDDHHmmss");
    const shortCode = (process.env.MPESA_SHORTCODE || "").trim();
    const passKey = (process.env.MPESA_PASSKEY || "").trim();

    if (!shortCode || !passKey) {
      throw new Error("[M-Pesa] MPESA_SHORTCODE and MPESA_PASSKEY must be set");
    }

    const password = Buffer.from(shortCode + passKey + timestamp).toString("base64");
    const accessToken = await getOAuthToken();

    console.log("[M-Pesa] STK Query for CheckoutRequestID:", checkoutRequestId);

    const res = await axios.post(
      `${MPESA_BASE_URL}/mpesa/stkpushquery/v1/query`,
      {
        BusinessShortCode: shortCode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      },
      {
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        timeout: 30000,
      }
    );

    console.log("[M-Pesa] STK Query response:", JSON.stringify(res.data));
    return res.data;
  });
}

export async function testMpesaCredentials(): Promise<{ success: boolean; message: string; environment: string }> {
  try {
    const consumerKey = (process.env.MPESA_CONSUMER_KEY || "").trim();
    const consumerSecret = (process.env.MPESA_CONSUMER_SECRET || "").trim();
    const shortCode = process.env.MPESA_SHORTCODE || "";
    const passKey = process.env.MPESA_PASSKEY || "";

    const missing = [];
    if (!consumerKey) missing.push("MPESA_CONSUMER_KEY");
    if (!consumerSecret) missing.push("MPESA_CONSUMER_SECRET");
    if (!shortCode) missing.push("MPESA_SHORTCODE");
    if (!passKey) missing.push("MPESA_PASSKEY");

    if (missing.length > 0) {
      return { success: false, message: `Missing credentials: ${missing.join(", ")}`, environment: MPESA_BASE_URL };
    }

    const token = await getOAuthToken();
    return {
      success: true,
      message: `OAuth token obtained. Shortcode: ${shortCode}. Callback will go to: ${getCallbackBaseUrl()}`,
      environment: MPESA_BASE_URL,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.response?.data?.errorMessage || err.message || "Unknown error",
      environment: MPESA_BASE_URL,
    };
  }
}

export interface MpesaCallbackData {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: {
        Item: Array<{
          Name: string;
          Value: string | number;
        }>;
      };
    };
  };
}

export async function b2cPayout(phone: string, amount: number, occasion: string = "Referral Commission") {
  return mpesaB2CCircuitBreaker.execute(async () => {
    const accessToken = await getOAuthToken();
    const formattedPhone = formatPhoneNumber(phone);
    const originatorConversationID = `REF${Date.now()}`;

    const res = await axios.post(
      `${MPESA_BASE_URL}/mpesa/b2c/v3/paymentrequest`,
      {
        OriginatorConversationID: originatorConversationID,
        InitiatorName: process.env.MPESA_INITIATOR_NAME || "apitest",
        SecurityCredential: process.env.MPESA_SECURITY_CREDENTIAL || "",
        CommandID: "BusinessPayment",
        Amount: amount,
        PartyA: (process.env.MPESA_SHORTCODE || "").trim(),
        PartyB: formattedPhone,
        Remarks: occasion,
        QueueTimeOutURL: `${getCallbackBaseUrl()}/api/mpesa/b2c/timeout`,
        ResultURL: `${getCallbackBaseUrl()}/api/mpesa/b2c/result`,
        Occasion: occasion,
      },
      {
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        timeout: 45000,
      }
    );

    return { ...res.data, originatorConversationID };
  });
}

export function isMpesaAvailable(): boolean {
  return !mpesaCircuitBreaker.isOpen();
}

export function isB2CAvailable(): boolean {
  return !mpesaB2CCircuitBreaker.isOpen();
}

export async function registerPullUrl(shortCode: string, callbackUrl: string): Promise<any> {
  const accessToken = await getOAuthToken();
  const res = await axios.post(
    `${MPESA_BASE_URL}/pulltransactions/v1/register`,
    {
      ShortCode: shortCode,
      RequestType: "Incremental",
      NominatedNumber: "",
      CallBackURL: callbackUrl,
    },
    {
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      timeout: 30000,
    }
  );
  console.log("[PullAPI] Register URL response:", JSON.stringify(res.data));
  return res.data;
}

export async function pullTransactions(shortCode: string, startDate: string, endDate: string, offsetValue: number = 0): Promise<any[]> {
  const body = {
    ShortCode: shortCode,
    StartDate: startDate,
    EndDate: endDate,
    OffSetValue: String(offsetValue),
  };

  const doRequest = async (token: string) =>
    axios.post(`${MPESA_BASE_URL}/pulltransactions/v1/query`, body, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      timeout: 30000,
    });

  let accessToken = await getOAuthToken();
  try {
    const res = await doRequest(accessToken);
    console.log("[PullAPI] Pulled", res.data?.Response?.length || 0, "transactions");
    return res.data?.Response || [];
  } catch (err: any) {
    const httpStatus = err.response?.status;
    const errMsg: string = (err.response?.data?.errorMessage || err.response?.data?.message || "").toLowerCase();
    const isAuthError = httpStatus === 401 || errMsg.includes("invalid access token") || errMsg.includes("access token");
    if (isAuthError) {
      console.warn("[PullAPI] Auth error — forcing token refresh and retrying…");
      accessToken = await getOAuthToken(true); // force refresh
      const res = await doRequest(accessToken);
      console.log("[PullAPI] Retry pulled", res.data?.Response?.length || 0, "transactions");
      return res.data?.Response || [];    }
    // Re-throw as informative error
    const detail = err.response?.data?.errorMessage || err.response?.data?.message || err.message || "Unknown Pull API error";
    throw new Error(detail);
  }
}

export async function forceTokenRefresh(): Promise<void> {
  await getOAuthToken(true);
}

export { CircuitBreakerOpenError };
