"use strict";
/**
 * Shared types for the Universal Payment Gateway layer.
 *
 * Adding a new gateway (Stripe, Flutterwave, IntaSend, Pesapal, etc.):
 *   1. Implement PaymentGateway
 *   2. Call paymentRegistry.register("gatewayName", new YourGateway())
 *   3. Done — no changes needed in routes or existing services
 */
Object.defineProperty(exports, "__esModule", { value: true });
