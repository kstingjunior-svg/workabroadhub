"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircuitBreakerOpenError = void 0;
exports.getCallbackBaseUrl = getCallbackBaseUrl;
exports.getTokenStatus = getTokenStatus;
exports.isLoadTestMode = isLoadTestMode;
exports.stkPush = stkPush;
exports.stkPushForRenewal = stkPushForRenewal;
exports.stkQuery = stkQuery;
exports.testMpesaCredentials = testMpesaCredentials;
exports.b2cPayout = b2cPayout;
exports.isMpesaAvailable = isMpesaAvailable;
exports.isB2CAvailable = isB2CAvailable;
exports.registerPullUrl = registerPullUrl;
exports.pullTransactions = pullTransactions;
exports.forceTokenRefresh = forceTokenRefresh;
const axios_1 = __importDefault(require("axios"));
const moment_1 = __importDefault(require("moment"));
const circuit_breaker_1 = require("./circuit-breaker");
Object.defineProperty(exports, "CircuitBreakerOpenError", { enumerable: true, get: function () { return circuit_breaker_1.CircuitBreakerOpenError; } });
// Switch between Daraja production and sandbox via the MPESA_ENV env var.
// Acceptable values (case-insensitive): "production" | "prod" | "live"  →  api.safaricom.co.ke
//                                       anything else (or unset)         →  sandbox.safaricom.co.ke
// Alternatively, set MPESA_BASE_URL explicitly to override both.
const _mpesaEnv = (process.env.MPESA_ENV || "").trim().toLowerCase();
const _isProd = ["production", "prod", "live"].includes(_mpesaEnv);
const MPESA_BASE_URL = (process.env.MPESA_BASE_URL || "").trim() || (_isProd ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke");
console.log(`[M-Pesa] Environment: ${_isProd ? "PRODUCTION" : "SANDBOX"} | base=${MPESA_BASE_URL}`);
function getCallbackBaseUrl() {
    if (process.env.MPESA_CALLBACK_URL) {
        const url = new URL(process.env.MPESA_CALLBACK_URL);
        return `${url.protocol}//${url.host}`;
    }
    if (process.env.APP_URL)
        return process.env.APP_URL;
    // On Render, set APP_URL=https://<your-service>.onrender.com in env vars.
    // localhost fallback only triggers in dev when nothing is configured.
    return "https://localhost:5000";
}
let _tokenCache = null;
let _tokenError = null;
const TOKEN_BUFFER_MS = 90000; // refresh 90s before actual expiry
/**
 * Fetch a fresh OAuth token from Safaricom and cache it until near-expiry.
 * Pass forceRefresh=true to bypass the cache (e.g. after a 401 from Pull API).
 */
async function getOAuthToken(forceRefresh = false) {
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
        console.log("[M-Pesa] Requesting OAuth token from:", `${MPESA_BASE_URL}/oauth/v1/generate`, "| keyLen:", consumerKey.length, "| secretLen:", consumerSecret.length);
        const tokenRes = await axios_1.default.get(`${MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${auth}` }, timeout: 15000 });
        const token = tokenRes.data.access_token;
        const expiresIn = (tokenRes.data.expires_in || 3600) * 1000; // ms
        _tokenCache = { token, expiresAt: now + expiresIn, obtainedAt: now, environment: MPESA_BASE_URL };
        _tokenError = null;
        console.log(`[M-Pesa] OAuth token obtained — expires in ${Math.round(expiresIn / 60000)} min`);
        return token;
    }
    catch (err) {
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
        console.error(`[M-Pesa] OAuth token error: status=${status ?? "n/a"} body=${bodySnippet || "<empty>"}` +
            (wwwAuth ? ` | www-authenticate="${wwwAuth}"` : "") +
            ` | env=${_isProd ? "PRODUCTION" : "SANDBOX"} keyLen=${consumerKey.length} secretLen=${consumerSecret.length}` +
            ` | hint=${status === 400 ? `400 from Daraja means the consumer key/secret aren't valid for the ${_isProd ? "PRODUCTION (api.safaricom.co.ke)" : "SANDBOX (sandbox.safaricom.co.ke)"} environment. Make sure the MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET in Render belong to your Go-Live app (not a sandbox app), and that MPESA_ENV=production is set.` : ""}`);
        throw err;
    }
}
/**
 * Returns current in-memory token status for the admin debug panel.
 * Never exposes the raw token value.
 */
function getTokenStatus() {
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
function isLoadTestMode() {
    return process.env.LOAD_TEST_MODE === "true";
}
async function stkPush(phone, amount, description = "Career Consultation Fee", accountRef = "WorkAbroadHub", // Phase 1: callers pass paymentId so AccountReference = orderId
overrideCallbackUrl // Optional: override the Safaricom callback destination
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
    return circuit_breaker_1.mpesaCircuitBreaker.execute(async () => {
        const timestamp = (0, moment_1.default)().format("YYYYMMDDHHmmss");
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
        const res = await axios_1.default.post(`${MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`, {
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
        }, {
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            timeout: 30000,
        });
        console.log("[M-Pesa] STK Push response:", JSON.stringify(res.data));
        return res.data;
    });
}
async function stkPushForRenewal(phone, amount, accountRef) {
    return circuit_breaker_1.mpesaCircuitBreaker.execute(async () => {
        const timestamp = (0, moment_1.default)().format("YYYYMMDDHHmmss");
        const shortCode = (process.env.MPESA_SHORTCODE || "").trim();
        const passKey = (process.env.MPESA_PASSKEY || "").trim();
        const password = Buffer.from(shortCode + passKey + timestamp).toString("base64");
        const accessToken = await getOAuthToken();
        const formattedPhone = formatPhoneNumber(phone);
        const callbackUrl = `${getCallbackBaseUrl()}/api/mpesa/license-renewal/callback`;
        console.log("[M-Pesa] Renewal STK Push → phone:", formattedPhone, "amount:", amount, "| callback:", callbackUrl);
        const res = await axios_1.default.post(`${MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`, {
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
        }, {
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            timeout: 30000,
        });
        console.log("[M-Pesa] Renewal STK Push response:", JSON.stringify(res.data));
        return res.data;
    });
}
function formatPhoneNumber(phone) {
    let cleaned = phone.replace(/\s+/g, "").replace(/[^0-9]/g, "");
    if (cleaned.startsWith("0")) {
        cleaned = "254" + cleaned.substring(1);
    }
    else if (cleaned.startsWith("+254")) {
        cleaned = cleaned.substring(1);
    }
    else if (!cleaned.startsWith("254")) {
        cleaned = "254" + cleaned;
    }
    return cleaned;
}
async function stkQuery(checkoutRequestId) {
    // LOAD_TEST_MODE: always return success for mock checkouts
    if (isLoadTestMode() && checkoutRequestId.startsWith("mock_checkout_")) {
        console.log(`[LOAD_TEST] Mock STK Query → ${checkoutRequestId} → success`);
        return { ResultCode: 0, ResultDesc: "The service request is processed successfully." };
    }
    return circuit_breaker_1.mpesaCircuitBreaker.execute(async () => {
        const timestamp = (0, moment_1.default)().format("YYYYMMDDHHmmss");
        const shortCode = (process.env.MPESA_SHORTCODE || "").trim();
        const passKey = (process.env.MPESA_PASSKEY || "").trim();
        if (!shortCode || !passKey) {
            throw new Error("[M-Pesa] MPESA_SHORTCODE and MPESA_PASSKEY must be set");
        }
        const password = Buffer.from(shortCode + passKey + timestamp).toString("base64");
        const accessToken = await getOAuthToken();
        console.log("[M-Pesa] STK Query for CheckoutRequestID:", checkoutRequestId);
        const res = await axios_1.default.post(`${MPESA_BASE_URL}/mpesa/stkpushquery/v1/query`, {
            BusinessShortCode: shortCode,
            Password: password,
            Timestamp: timestamp,
            CheckoutRequestID: checkoutRequestId,
        }, {
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            timeout: 30000,
        });
        console.log("[M-Pesa] STK Query response:", JSON.stringify(res.data));
        return res.data;
    });
}
async function testMpesaCredentials() {
    try {
        const consumerKey = (process.env.MPESA_CONSUMER_KEY || "").trim();
        const consumerSecret = (process.env.MPESA_CONSUMER_SECRET || "").trim();
        const shortCode = process.env.MPESA_SHORTCODE || "";
        const passKey = process.env.MPESA_PASSKEY || "";
        const missing = [];
        if (!consumerKey)
            missing.push("MPESA_CONSUMER_KEY");
        if (!consumerSecret)
            missing.push("MPESA_CONSUMER_SECRET");
        if (!shortCode)
            missing.push("MPESA_SHORTCODE");
        if (!passKey)
            missing.push("MPESA_PASSKEY");
        if (missing.length > 0) {
            return { success: false, message: `Missing credentials: ${missing.join(", ")}`, environment: MPESA_BASE_URL };
        }
        const token = await getOAuthToken();
        return {
            success: true,
            message: `OAuth token obtained. Shortcode: ${shortCode}. Callback will go to: ${getCallbackBaseUrl()}`,
            environment: MPESA_BASE_URL,
        };
    }
    catch (err) {
        return {
            success: false,
            message: err.response?.data?.errorMessage || err.message || "Unknown error",
            environment: MPESA_BASE_URL,
        };
    }
}
async function b2cPayout(phone, amount, occasion = "Referral Commission") {
    return circuit_breaker_1.mpesaB2CCircuitBreaker.execute(async () => {
        const accessToken = await getOAuthToken();
        const formattedPhone = formatPhoneNumber(phone);
        const originatorConversationID = `REF${Date.now()}`;
        const res = await axios_1.default.post(`${MPESA_BASE_URL}/mpesa/b2c/v3/paymentrequest`, {
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
        }, {
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            timeout: 45000,
        });
        return { ...res.data, originatorConversationID };
    });
}
function isMpesaAvailable() {
    return !circuit_breaker_1.mpesaCircuitBreaker.isOpen();
}
function isB2CAvailable() {
    return !circuit_breaker_1.mpesaB2CCircuitBreaker.isOpen();
}
async function registerPullUrl(shortCode, callbackUrl) {
    const accessToken = await getOAuthToken();
    const res = await axios_1.default.post(`${MPESA_BASE_URL}/pulltransactions/v1/register`, {
        ShortCode: shortCode,
        RequestType: "Incremental",
        NominatedNumber: "",
        CallBackURL: callbackUrl,
    }, {
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        timeout: 30000,
    });
    console.log("[PullAPI] Register URL response:", JSON.stringify(res.data));
    return res.data;
}
async function pullTransactions(shortCode, startDate, endDate, offsetValue = 0) {
    const body = {
        ShortCode: shortCode,
        StartDate: startDate,
        EndDate: endDate,
        OffSetValue: String(offsetValue),
    };
    const doRequest = async (token) => axios_1.default.post(`${MPESA_BASE_URL}/pulltransactions/v1/query`, body, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        timeout: 30000,
    });
    let accessToken = await getOAuthToken();
    try {
        const res = await doRequest(accessToken);
        console.log("[PullAPI] Pulled", res.data?.Response?.length || 0, "transactions");
        return res.data?.Response || [];
    }
    catch (err) {
        const httpStatus = err.response?.status;
        const errMsg = (err.response?.data?.errorMessage || err.response?.data?.message || "").toLowerCase();
        const isAuthError = httpStatus === 401 || errMsg.includes("invalid access token") || errMsg.includes("access token");
        if (isAuthError) {
            console.warn("[PullAPI] Auth error — forcing token refresh and retrying…");
            accessToken = await getOAuthToken(true); // force refresh
            const res = await doRequest(accessToken);
            console.log("[PullAPI] Retry pulled", res.data?.Response?.length || 0, "transactions");
            return res.data?.Response || [];
        }
        // Re-throw as informative error
        const detail = err.response?.data?.errorMessage || err.response?.data?.message || err.message || "Unknown Pull API error";
        throw new Error(detail);
    }
}
async function forceTokenRefresh() {
    await getOAuthToken(true);
}
