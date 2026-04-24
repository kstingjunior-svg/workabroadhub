/**
 * Shared types for the Universal Payment Gateway layer.
 *
 * Adding a new gateway (Stripe, Flutterwave, IntaSend, Pesapal, etc.):
 *   1. Implement PaymentGateway
 *   2. Call paymentRegistry.register("gatewayName", new YourGateway())
 *   3. Done — no changes needed in routes or existing services
 */

export type OrderType = "payment" | "service_order" | "application_pack";
export type PaymentMethodType = "mpesa" | "paypal" | "card" | "stripe" | "flutterwave" | "intasend" | "pesapal";
export type PaymentStatus = "pending" | "awaiting_payment" | "processing" | "success" | "failed" | "expired" | "retry_available";

// ─── Inbound request ────────────────────────────────────────────────────────

export interface CreatePaymentRequest {
  orderId: string;
  orderType: OrderType;
  paymentMethod: PaymentMethodType;
  amount: number;           // always in KES (the platform's base currency)
  currency?: string;        // "KES" default; "USD" accepted — gateway converts
  description: string;
  userId: string;

  // Gateway-specific optional fields
  phone?: string;           // required for M-Pesa (format: 254XXXXXXXXX)
  amountUSD?: number;       // override for PayPal if pre-converted
  returnUrl?: string;       // for redirect-based gateways (future use)
  cancelUrl?: string;
  metadata?: Record<string, unknown>;
}

// ─── Outbound gateway response ──────────────────────────────────────────────

export interface GatewayResponse {
  success: boolean;
  paymentMethod: PaymentMethodType;
  orderId: string;
  status: PaymentStatus;

  // Reference IDs (one or more may be set depending on gateway)
  gatewayRef?: string;      // M-Pesa: CheckoutRequestID | PayPal: paypalOrderId
  internalPaymentId?: string;

  // For redirect-based flows (Pesapal, IntaSend, etc.)
  redirectUrl?: string | null;
  approvalUrl?: string | null;

  // Human-readable
  message?: string;
  error?: string;

  // Raw gateway payload (for debugging / audit)
  raw?: unknown;
}

// ─── Confirmation request ────────────────────────────────────────────────────

export interface ConfirmPaymentRequest {
  orderId: string;
  orderType: OrderType;
  paymentMethod: PaymentMethodType;
  transactionRef: string;   // M-Pesa receipt / PayPal transaction ID
  amount: number;           // confirmed amount (for mismatch detection)
  userId?: string;
}

export interface ConfirmPaymentResult {
  success: boolean;
  status: PaymentStatus;
  message: string;
  duplicate?: boolean;
}

// ─── Gateway interface ───────────────────────────────────────────────────────

export interface PaymentGateway {
  readonly name: PaymentMethodType;
  createPayment(req: CreatePaymentRequest): Promise<GatewayResponse>;
}

// ─── Unified response shape (returned by POST /api/payments/create) ──────────

export interface UnifiedPaymentResponse {
  paymentMethod: PaymentMethodType;
  orderId: string;
  status: PaymentStatus;
  gatewayRef?: string;
  redirectUrl?: string | null;
  message: string;
}
