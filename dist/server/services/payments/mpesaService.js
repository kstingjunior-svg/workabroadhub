"use strict";
/**
 * M-Pesa Gateway — wraps the existing server/mpesa.ts STK Push implementation.
 *
 * This service is intentionally thin: all heavy lifting (OAuth, circuit breaker,
 * duplicate guards, audit logs) lives in server/mpesa.ts and stays unchanged.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mpesaGateway = void 0;
const phone_1 = require("../../utils/phone");
class MpesaGateway {
    constructor() {
        this.name = "mpesa";
    }
    async createPayment(req) {
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
        const normalizedPhone = (0, phone_1.normalizePhone)(phone);
        try {
            const { stkPush } = await Promise.resolve().then(() => __importStar(require("../../mpesa")));
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
        }
        catch (err) {
            const errCode = err.response?.data?.errorCode || "";
            const errMsg = err.response?.data?.errorMessage || err.message || "Unknown M-Pesa error";
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
exports.mpesaGateway = new MpesaGateway();
exports.default = MpesaGateway;
