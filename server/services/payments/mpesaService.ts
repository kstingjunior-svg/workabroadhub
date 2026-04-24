/**
 * M-Pesa Gateway — wraps the existing server/mpesa.ts STK Push implementation.
 *
 * This service is intentionally thin: all heavy lifting (OAuth, circuit breaker,
 * duplicate guards, audit logs) lives in server/mpesa.ts and stays unchanged.
 */

import type { PaymentGateway, CreatePaymentRequest, GatewayResponse } from "./types";
import { normalizePhone } from "../../utils/phone";

class MpesaGateway implements PaymentGateway {
  readonly name = "mpesa" as const;

  async createPayment(req: CreatePaymentRequest): Promise<GatewayResponse> {
    const { orderId, amount, phone, description } = req;

    if (!phone) {
      return {
        success: false,
        paymentMethod: "mpesa",
        orderId,
        status: "failed",
        error: "Phone number is required for M-Pesa payments",
      };
    }

    const normalizedPhone = normalizePhone(phone);

    try {
      const { stkPush } = await import("../../mpesa");
      const accountRef = `WAH-${orderId.substring(0, 8).toUpperCase()}`;
      const mpesaRes = await stkPush(normalizedPhone, amount, description, accountRef);

      return {
        success: true,
        paymentMethod: "mpesa",
        orderId,
        status: "awaiting_payment",
        gatewayRef: mpesaRes.CheckoutRequestID,
        message: "M-Pesa STK Push sent. Enter your PIN to confirm.",
        raw: mpesaRes,
      };
    } catch (err: any) {
      const errCode = err.response?.data?.errorCode || "";
      const errMsg  = err.response?.data?.errorMessage || err.message || "Unknown M-Pesa error";

      const isShortcodeError = errCode === "400.002.02" ||
        errMsg.toLowerCase().includes("invalid businessshortcode");
      const isPhoneError = errCode === "400.002.05" ||
        errMsg.toLowerCase().includes("invalid msisdn");

      return {
        success: false,
        paymentMethod: "mpesa",
        orderId,
        status: "failed",
        error: isShortcodeError
          ? "M-Pesa shortcode configuration error. Please contact support."
          : isPhoneError
          ? "The phone number is not registered for M-Pesa. Please check and try again."
          : `M-Pesa error: ${errMsg}`,
        raw: err.response?.data,
      };
    }
  }
}

export const mpesaGateway = new MpesaGateway();
export default MpesaGateway;
