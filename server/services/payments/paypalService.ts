import type { PaymentGateway, CreatePaymentRequest, GatewayResponse } from "./types";
import { isPayPalConfigured, createPayPalOrder, kesToUsd } from "../../paypal";

class PayPalGatewayService implements PaymentGateway {
  readonly name = "paypal" as const;

  async createPayment(req: CreatePaymentRequest): Promise<GatewayResponse> {
    if (!isPayPalConfigured()) {
      return {
        success: false,
        paymentMethod: "paypal",
        orderId: req.orderId,
        status: "failed",
        error: "PayPal is not configured. Contact the administrator.",
      };
    }

    try {
      const order = await createPayPalOrder(
        req.amount,
        req.description,
        req.orderId
      );

      return {
        success: true,
        paymentMethod: "paypal",
        orderId: req.orderId,
        status: "awaiting_payment",
        gatewayRef: order.id,
        approvalUrl: order.approvalUrl,
        message: `PayPal order created — $${kesToUsd(req.amount).toFixed(2)} USD`,
        raw: order,
      };
    } catch (err: any) {
      return {
        success: false,
        paymentMethod: "paypal",
        orderId: req.orderId,
        status: "failed",
        error: err.message ?? "PayPal order creation failed",
      };
    }
  }
}

export const paypalGateway = new PayPalGatewayService();
export default PayPalGatewayService;
