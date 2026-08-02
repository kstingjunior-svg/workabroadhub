"use strict";
/**
 * PayPal Payment Gateway — WorkAbroad Hub
 * =========================================
 * Clean implementation using environment variables only.
 * NO credentials are hardcoded here.
 *
 * Required secrets (set in Replit Secrets):
 *   PAYPAL_CLIENT_ID     — your PayPal app Client ID
 *   PAYPAL_CLIENT_SECRET — your PayPal app Client Secret
 *
 * Mode toggle (set as env var):
 *   PAYPAL_ENV=sandbox   ← use this for testing (PayPal Developer sandbox)
 *   PAYPAL_ENV=live      ← use this for real payments in production
 *
 * Exchange rate:
 *   PAYPAL_KES_RATE=130  ← KES per 1 USD (update as needed)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.paypalClient = void 0;
exports.getPayPalFlatFeeKes = getPayPalFlatFeeKes;
exports.isPayPalConfigured = isPayPalConfigured;
exports.paypalMode = paypalMode;
exports.paypalClientId = paypalClientId;
exports.kesToUsd = kesToUsd;
exports.createPayPalOrder = createPayPalOrder;
exports.capturePayPalOrder = capturePayPalOrder;
exports.getPayPalOrder = getPayPalOrder;
const checkout_server_sdk_1 = __importDefault(require("@paypal/checkout-server-sdk"));
// ─── Config ──────────────────────────────────────────────────────────────────
const PAYPAL_MODE = (process.env.PAYPAL_ENV || "sandbox").toLowerCase();
const KES_TO_USD_RATE = Number(process.env.PAYPAL_KES_RATE) || 130;
/**
 * 2026-08 (Tony's founder decision): PayPal payers are non-Kenyan users
 * (diaspora, international clients). They pay a single flat fee that
 * unlocks the whole portal + services, instead of paying per-item like
 * M-Pesa users.
 *
 * KES 4,500 ≈ USD 35 at the current rate, roughly equivalent to a
 * one-year Pro subscription. The exact amount can be tuned by setting
 * PAYPAL_FLAT_FEE_KES env var.
 *
 * This is enforced at the createPayPalOrder() boundary so every code
 * path (services, subscriptions, scout jobs, write-from-scratch)
 * automatically applies it — impossible to bypass by adding new callers.
 */
const PAYPAL_FLAT_FEE_KES = Number(process.env.PAYPAL_FLAT_FEE_KES) || 4500;
function getPayPalFlatFeeKes() { return PAYPAL_FLAT_FEE_KES; }
// ─── Client factory ──────────────────────────────────────────────────────────
// Never cache the client — tokens expire. Always call this fresh per request.
function buildClient() {
    const clientId = (process.env.PAYPAL_CLIENT_ID || "").trim();
    const clientSecret = (process.env.PAYPAL_CLIENT_SECRET || "").trim();
    if (!clientId || !clientSecret) {
        throw new Error("PayPal credentials missing. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in Secrets.");
    }
    const environment = PAYPAL_MODE === "live"
        ? new checkout_server_sdk_1.default.core.LiveEnvironment(clientId, clientSecret)
        : new checkout_server_sdk_1.default.core.SandboxEnvironment(clientId, clientSecret);
    return new checkout_server_sdk_1.default.core.PayPalHttpClient(environment);
}
// ─── Helpers ─────────────────────────────────────────────────────────────────
function isPayPalConfigured() {
    return !!((process.env.PAYPAL_CLIENT_ID || "").trim() &&
        (process.env.PAYPAL_CLIENT_SECRET || "").trim());
}
function paypalMode() {
    return PAYPAL_MODE === "live" ? "live" : "sandbox";
}
function paypalClientId() {
    return (process.env.PAYPAL_CLIENT_ID || "").trim();
}
/**
 * Convert KES amount to USD for PayPal.
 * Minimum charge: $1.00 USD (PayPal requirement).
 */
function kesToUsd(amountKes) {
    const usd = amountKes / KES_TO_USD_RATE;
    return Math.max(1, Math.round(usd * 100) / 100);
}
// ─── Order creation ───────────────────────────────────────────────────────────
async function createPayPalOrder(amountKes, description, internalRef) {
    const client = buildClient();
    // ── FLAT-FEE OVERRIDE ──────────────────────────────────────────────
    // Tony's rule (2026-08): PayPal payers always pay the flat fee for
    // full-portal access, regardless of which product they clicked.
    // Log the requested vs. effective amount so we can audit anyone who
    // was undercharged before this change landed.
    const requestedKes = amountKes;
    const effectiveKes = PAYPAL_FLAT_FEE_KES;
    if (requestedKes !== effectiveKes) {
        console.log(`[PayPal] Flat-fee override: caller requested KES ${requestedKes} → charged KES ${effectiveKes} for full-portal access.`);
    }
    const amountUSD = kesToUsd(effectiveKes);
    // Rewrite the description so the PayPal checkout page tells the
    // buyer exactly what they're paying for.
    const flatFeeDescription = `WorkAbroad Hub — Full portal access (${description})`.slice(0, 127);
    const request = new checkout_server_sdk_1.default.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
        intent: "CAPTURE",
        purchase_units: [
            {
                reference_id: internalRef.slice(0, 256),
                custom_id: internalRef.slice(0, 256), // echoed back on PAYMENT.CAPTURE.COMPLETED
                amount: {
                    currency_code: "USD",
                    value: amountUSD.toFixed(2),
                },
                description: flatFeeDescription,
            },
        ],
        application_context: {
            brand_name: "WorkAbroad Hub",
            locale: "en-US",
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
        },
    });
    const response = await client.execute(request);
    const order = response.result;
    const approvalUrl = order.links?.find((l) => l.rel === "approve")?.href ?? "";
    console.log(`[PayPal] Order created: ${order.id} | KES ${effectiveKes} ≈ $${amountUSD} | mode: ${PAYPAL_MODE}`);
    return { id: order.id, status: order.status, approvalUrl };
}
// ─── Payment capture ──────────────────────────────────────────────────────────
async function capturePayPalOrder(paypalOrderId) {
    const client = buildClient();
    const request = new checkout_server_sdk_1.default.orders.OrdersCaptureRequest(paypalOrderId);
    request.requestBody({});
    const response = await client.execute(request);
    const order = response.result;
    const capture = order.purchase_units?.[0]?.payments?.captures?.[0] ?? {};
    console.log(`[PayPal] Payment captured: ${order.id} | status: ${order.status} | txn: ${capture.id}`);
    return {
        id: order.id,
        status: order.status,
        transactionId: capture.id ?? "",
        payerEmail: order.payer?.email_address ?? "",
        amountUSD: capture.amount?.value ?? "0",
    };
}
// ─── Order details lookup (for post-capture verification) ────────────────────
async function getPayPalOrder(paypalOrderId) {
    const client = buildClient();
    const request = new checkout_server_sdk_1.default.orders.OrdersGetRequest(paypalOrderId);
    const response = await client.execute(request);
    const order = response.result;
    const capture = order.purchase_units?.[0]?.payments?.captures?.[0] ?? {};
    console.log(`[PayPal][Verify] Order ${order.id} status=${order.status} capture=${capture.id} captureStatus=${capture.status}`);
    return {
        id: order.id,
        status: order.status,
        captureId: capture.id ?? "",
        captureStatus: capture.status ?? "",
        amountUSD: capture.amount?.value ?? "0",
        currencyCode: capture.amount?.currency_code ?? "USD",
        payerEmail: order.payer?.email_address ?? "",
        payerId: order.payer?.payer_id ?? "",
    };
}
// Legacy stub — kept so any stray imports don't break
exports.paypalClient = null;
