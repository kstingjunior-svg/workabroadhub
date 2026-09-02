"use strict";
/**
 * Universal Payment Router — central hub for all payment gateways.
 *
 * ADDING A NEW GATEWAY:
 *   import { myGateway } from "./myGatewayService";
 *   paymentRegistry.register(myGateway);
 *   // That's it — the new method is immediately available via POST /api/payments/create
 *
 * Supported gateways (register below):
 *   mpesa  — Safaricom Daraja STK Push
 *   (future: stripe, flutterwave, intasend, pesapal)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentRegistry = void 0;
exports.routePayment = routePayment;
exports.confirmPayment = confirmPayment;
exports.toUnifiedResponse = toUnifiedResponse;
const mpesaService_1 = require("./mpesaService");
const paypalService_1 = require("./paypalService");
const storage_1 = require("../../storage");
// ─── Gateway Registry ────────────────────────────────────────────────────────
class GatewayRegistry {
    constructor() {
        this.gateways = new Map();
    }
    register(gateway) {
        this.gateways.set(gateway.name, gateway);
        console.log(`[PaymentRouter] Registered gateway: ${gateway.name}`);
    }
    get(method) {
        return this.gateways.get(method);
    }
    list() {
        return [...this.gateways.keys()];
    }
}
exports.paymentRegistry = new GatewayRegistry();
// Register built-in gateways
exports.paymentRegistry.register(mpesaService_1.mpesaGateway);
exports.paymentRegistry.register(paypalService_1.paypalGateway);
async function resolveOrder(orderId, orderType, userId) {
    if (orderType === "service_order") {
        const order = await storage_1.storage.getServiceOrderById(orderId);
        if (!order || order.userId !== userId)
            return null;
        return {
            amount: Number(order.amount),
            status: order.status,
            userId: order.userId,
            description: order.serviceName || "Career Service",
            alreadyPaid: ["paid", "processing", "completed"].includes(order.status),
        };
    }
    if (orderType === "payment") {
        const payment = await storage_1.storage.getPaymentById(orderId);
        if (!payment || payment.userId !== userId)
            return null;
        return {
            amount: Number(payment.amount),
            status: payment.status,
            userId: payment.userId,
            description: "WorkAbroad Hub Subscription",
            alreadyPaid: payment.status === "success",
        };
    }
    if (orderType === "application_pack") {
        const pack = await storage_1.storage.getUserApplicationPackById?.(orderId);
        if (!pack || pack.userId !== userId)
            return null;
        return {
            amount: Number(pack.amount),
            status: pack.status,
            userId: pack.userId,
            description: pack.packName || "Application Pack",
            alreadyPaid: ["active", "paid"].includes(pack.status),
        };
    }
    return null;
}
// ─── Route Payment ───────────────────────────────────────────────────────────
async function routePayment(req) {
    const { paymentMethod, orderId, orderType, amount, userId } = req;
    // 1. Find gateway
    const gateway = exports.paymentRegistry.get(paymentMethod);
    if (!gateway) {
        return {
            success: false,
            paymentMethod: paymentMethod,
            orderId,
            status: "failed",
            error: `Payment method "${paymentMethod}" is not supported. Available: ${exports.paymentRegistry.list().join(", ")}`,
        };
    }
    // 2. Validate order
    try {
        const order = await resolveOrder(orderId, orderType, userId);
        if (!order) {
            return {
                success: false,
                paymentMethod: paymentMethod,
                orderId,
                status: "failed",
                error: "Order not found or access denied",
            };
        }
        // 3. Duplicate payment protection
        if (order.alreadyPaid) {
            return {
                success: false,
                paymentMethod: paymentMethod,
                orderId,
                status: "failed",
                error: "This order has already been paid",
            };
        }
        // 4. Amount validation (allow ±5% tolerance for currency rounding)
        if (Math.abs(order.amount - amount) > order.amount * 0.05) {
            return {
                success: false,
                paymentMethod: paymentMethod,
                orderId,
                status: "failed",
                error: `Amount mismatch: expected ${order.amount}, received ${amount}`,
            };
        }
        // 5. Dispatch to gateway
        const description = req.description || order.description;
        return gateway.createPayment({ ...req, description });
    }
    catch (err) {
        console.error(`[PaymentRouter] routePayment error for ${paymentMethod}:`, err.message);
        return {
            success: false,
            paymentMethod: paymentMethod,
            orderId,
            status: "failed",
            error: "An internal error occurred while processing your payment",
        };
    }
}
// ─── Confirm Payment ─────────────────────────────────────────────────────────
// Called after gateway-specific confirmation (M-Pesa callback / PayPal capture)
async function confirmPayment(req) {
    const { orderId, orderType, paymentMethod, transactionRef, amount } = req;
    try {
        // 1. Duplicate receipt protection — check the payments table
        const existingByRef = await storage_1.storage.getPaymentByTransactionRef?.(transactionRef);
        if (existingByRef && existingByRef.status === "success") {
            return { success: true, status: "success", message: "Already confirmed", duplicate: true };
        }
        // 2. Resolve order to confirm it's still in a confirmable state
        const order = await resolveOrder(orderId, orderType, req.userId || "");
        if (order?.alreadyPaid) {
            return { success: true, status: "success", message: "Order already active", duplicate: true };
        }
        // 3. Activate the correct entity
        if (orderType === "service_order") {
            await storage_1.storage.updateServiceOrder(orderId, {
                status: "paid",
                paymentRef: transactionRef,
            });
        }
        else if (orderType === "payment" && req.userId) {
            await storage_1.storage.updatePayment(orderId, {
                status: "success",
                transactionRef,
                metadata: JSON.stringify({ paymentMethod, transactionRef, confirmedVia: "paymentRouter" }),
            });
            const sub = await storage_1.storage.getUserSubscription(req.userId);
            if (!sub) {
                await storage_1.storage.createSubscription(req.userId);
            }
            else {
                await storage_1.storage.updateSubscriptionStatus(req.userId, true);
            }
        }
        else if (orderType === "application_pack") {
            await storage_1.storage.updateUserApplicationPack?.(orderId, { status: "active" });
        }
        // 4. Notify user
        if (req.userId) {
            await storage_1.storage.createUserNotification({
                userId: req.userId,
                title: "Payment Confirmed",
                message: `Your ${paymentMethod.toUpperCase()} payment (${transactionRef}) has been confirmed.`,
                type: "order_update",
            }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        }
        return {
            success: true,
            status: "success",
            message: "Payment confirmed and service activated",
        };
    }
    catch (err) {
        console.error("[PaymentRouter] confirmPayment error:", err.message);
        return {
            success: false,
            status: "failed",
            message: err.message || "Confirmation failed",
        };
    }
}
// ─── Shape unified response ──────────────────────────────────────────────────
function toUnifiedResponse(gateway) {
    return {
        paymentMethod: gateway.paymentMethod,
        orderId: gateway.orderId,
        status: gateway.status,
        gatewayRef: gateway.gatewayRef,
        redirectUrl: gateway.redirectUrl ?? null,
        message: gateway.error ?? gateway.message ?? (gateway.success ? "Payment initiated" : "Payment failed"),
    };
}
