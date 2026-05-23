"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paypalGateway = void 0;
const paypal_1 = require("../../paypal");
class PayPalGatewayService {
    constructor() {
        this.name = "paypal";
    }
    async createPayment(req) {
        if (!(0, paypal_1.isPayPalConfigured)()) {
            return {
                success: false,
                paymentMethod: "paypal",
                orderId: req.orderId,
                status: "failed",
                error: "PayPal is not configured. Contact the administrator.",
            };
        }
        try {
            const order = await (0, paypal_1.createPayPalOrder)(req.amount, req.description, req.orderId);
            return {
                success: true,
                paymentMethod: "paypal",
                orderId: req.orderId,
                status: "awaiting_payment",
                gatewayRef: order.id,
                approvalUrl: order.approvalUrl,
                message: `PayPal order created — $${(0, paypal_1.kesToUsd)(req.amount).toFixed(2)} USD`,
                raw: order,
            };
        }
        catch (err) {
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
exports.paypalGateway = new PayPalGatewayService();
exports.default = PayPalGatewayService;
