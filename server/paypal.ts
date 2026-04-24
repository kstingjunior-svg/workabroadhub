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

import paypalCheckout from "@paypal/checkout-server-sdk";

// ─── Config ──────────────────────────────────────────────────────────────────

const PAYPAL_MODE = (process.env.PAYPAL_ENV || "sandbox").toLowerCase();
const KES_TO_USD_RATE = Number(process.env.PAYPAL_KES_RATE) || 130;

// ─── Client factory ──────────────────────────────────────────────────────────
// Never cache the client — tokens expire. Always call this fresh per request.

function buildClient(): paypalCheckout.core.PayPalHttpClient {
  const clientId = (process.env.PAYPAL_CLIENT_ID || "").trim();
  const clientSecret = (process.env.PAYPAL_CLIENT_SECRET || "").trim();

  if (!clientId || !clientSecret) {
    throw new Error(
      "PayPal credentials missing. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in Secrets."
    );
  }

  const environment =
    PAYPAL_MODE === "live"
      ? new paypalCheckout.core.LiveEnvironment(clientId, clientSecret)
      : new paypalCheckout.core.SandboxEnvironment(clientId, clientSecret);

  return new paypalCheckout.core.PayPalHttpClient(environment);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function isPayPalConfigured(): boolean {
  return !!(
    (process.env.PAYPAL_CLIENT_ID || "").trim() &&
    (process.env.PAYPAL_CLIENT_SECRET || "").trim()
  );
}

export function paypalMode(): "sandbox" | "live" {
  return PAYPAL_MODE === "live" ? "live" : "sandbox";
}

export function paypalClientId(): string {
  return (process.env.PAYPAL_CLIENT_ID || "").trim();
}

/**
 * Convert KES amount to USD for PayPal.
 * Minimum charge: $1.00 USD (PayPal requirement).
 */
export function kesToUsd(amountKes: number): number {
  const usd = amountKes / KES_TO_USD_RATE;
  return Math.max(1, Math.round(usd * 100) / 100);
}

// ─── Order creation ───────────────────────────────────────────────────────────

export async function createPayPalOrder(
  amountKes: number,
  description: string,
  internalRef: string
): Promise<{ id: string; status: string; approvalUrl: string }> {
  const client = buildClient();
  const amountUSD = kesToUsd(amountKes);

  const request = new paypalCheckout.orders.OrdersCreateRequest();
  request.prefer("return=representation");
  request.requestBody({
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: internalRef.slice(0, 256),
        custom_id:    internalRef.slice(0, 256),   // echoed back on PAYMENT.CAPTURE.COMPLETED
        amount: {
          currency_code: "USD",
          value: amountUSD.toFixed(2),
        },
        description: description.slice(0, 127),
      },
    ],
    application_context: {
      brand_name: "WorkAbroad Hub",
      locale: "en-US",
      user_action: "PAY_NOW",
      shipping_preference: "NO_SHIPPING",
    },
  } as any);

  const response = await client.execute(request);
  const order = response.result as any;

  const approvalUrl =
    order.links?.find((l: any) => l.rel === "approve")?.href ?? "";

  console.log(
    `[PayPal] Order created: ${order.id} | $${amountUSD} | mode: ${PAYPAL_MODE}`
  );

  return { id: order.id, status: order.status, approvalUrl };
}

// ─── Payment capture ──────────────────────────────────────────────────────────

export async function capturePayPalOrder(paypalOrderId: string): Promise<{
  id: string;
  status: string;
  transactionId: string;
  payerEmail: string;
  amountUSD: string;
}> {
  const client = buildClient();

  const request = new paypalCheckout.orders.OrdersCaptureRequest(paypalOrderId);
  (request as any).requestBody({});

  const response = await client.execute(request);
  const order = response.result as any;

  const capture =
    order.purchase_units?.[0]?.payments?.captures?.[0] ?? {};

  console.log(
    `[PayPal] Payment captured: ${order.id} | status: ${order.status} | txn: ${capture.id}`
  );

  return {
    id: order.id,
    status: order.status,
    transactionId: capture.id ?? "",
    payerEmail: order.payer?.email_address ?? "",
    amountUSD: capture.amount?.value ?? "0",
  };
}

// ─── Order details lookup (for post-capture verification) ────────────────────

export async function getPayPalOrder(paypalOrderId: string): Promise<{
  id: string;
  status: string;
  captureId: string;
  captureStatus: string;
  amountUSD: string;
  currencyCode: string;
  payerEmail: string;
  payerId: string;
}> {
  const client = buildClient();

  const request = new paypalCheckout.orders.OrdersGetRequest(paypalOrderId);
  const response = await client.execute(request);
  const order = response.result as any;

  const capture = order.purchase_units?.[0]?.payments?.captures?.[0] ?? {};

  console.log(
    `[PayPal][Verify] Order ${order.id} status=${order.status} capture=${capture.id} captureStatus=${capture.status}`
  );

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
export const paypalClient = null;
