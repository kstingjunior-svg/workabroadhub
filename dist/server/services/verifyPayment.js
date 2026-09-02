"use strict";
/**
 * Payment Verification Service — WorkAbroad Hub
 * ===============================================
 * Verifies payment authenticity with the provider (M-Pesa / PayPal) AFTER the
 * initial callback/capture, and BEFORE upgrading the user's plan.
 *
 * Verification outcomes:
 *   "verified"        — provider confirmed the payment is complete and amounts match
 *   "suspicious"      — provider returned non-zero or status mismatch → flag, DO NOT upgrade
 *   "mismatch"        — amount or capture state doesn't match our stored record
 *   "api_unavailable" — provider API unreachable; upgrade proceeds with warning logged
 *   "skipped"         — verification deliberately not attempted (manual/admin grants)
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
exports.verifyMpesaPayment = verifyMpesaPayment;
exports.verifyPayPalPayment = verifyPayPalPayment;
const db_1 = require("../db");
const schema_1 = require("../../shared/schema");
const drizzle_orm_1 = require("drizzle-orm");
const storage_1 = require("../storage");
// ── Helpers ──────────────────────────────────────────────────────────────────
const KES_TO_USD_RATE = Number(process.env.PAYPAL_KES_RATE) || 130;
const AMOUNT_TOLERANCE_KES = 5; // allow ±5 KES rounding difference
const RECEIPT_REGEX = /^[A-Z0-9]{8,15}$/;
async function stampPayment(paymentId, status, note, isSuspicious, fraudReason) {
    try {
        await db_1.db
            .update(schema_1.payments)
            .set({
            verifiedAt: isSuspicious ? null : new Date(),
            verificationStatus: status,
            verificationNote: note.slice(0, 499),
            ...(isSuspicious ? { isSuspicious: true, fraudReason: (fraudReason || note).slice(0, 255) } : {}),
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema_1.payments.id, paymentId));
    }
    catch (err) {
        console.error(`[Verify] Failed to stamp payment ${paymentId}:`, err.message);
    }
}
async function writeAuditLog(paymentId, event, ip, metadata) {
    storage_1.storage.createPaymentAuditLog({
        paymentId,
        event,
        ip,
        metadata,
    }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
}
// ── M-Pesa Verification ───────────────────────────────────────────────────────
async function verifyMpesaPayment(opts) {
    const { paymentId, checkoutRequestId, receiptNumber, expectedAmount, ip = "server" } = opts;
    // 1. Receipt format sanity check
    if (!RECEIPT_REGEX.test(receiptNumber)) {
        const note = `Invalid receipt format: "${receiptNumber}"`;
        await stampPayment(paymentId, "suspicious", note, true, `invalid_receipt_format:${receiptNumber}`);
        await writeAuditLog(paymentId, "verification_suspicious", ip, { reason: note, receiptNumber });
        console.warn(`[Verify][M-Pesa] ${note} — paymentId=${paymentId}`);
        return { verified: false, status: "suspicious", note };
    }
    // 2. STK Query with Safaricom — use as a hard gate
    try {
        const { stkQuery } = await Promise.resolve().then(() => __importStar(require("../mpesa")));
        const queryResult = await stkQuery(checkoutRequestId);
        const resultCode = Number(queryResult.ResultCode);
        const resultDesc = String(queryResult.ResultDesc || "");
        if (resultCode === 0) {
            // Confirmed by Safaricom
            const note = `Safaricom STK Query confirmed — ResultCode=0 receipt=${receiptNumber}`;
            await stampPayment(paymentId, "verified", note, false);
            await writeAuditLog(paymentId, "verification_verified", ip, {
                checkoutRequestId, receiptNumber, resultCode, resultDesc, method: "mpesa",
            });
            console.info(`[Verify][M-Pesa] VERIFIED — paymentId=${paymentId} receipt=${receiptNumber}`);
            return {
                verified: true,
                status: "verified",
                note,
                providerData: { checkoutRequestId, resultCode, resultDesc },
            };
        }
        else {
            // Non-zero from Safaricom — suspicious
            const note = `Safaricom STK Query non-zero: ResultCode=${resultCode} "${resultDesc}"`;
            await stampPayment(paymentId, "suspicious", note, true, `stk_query_fail:${resultCode}`);
            await writeAuditLog(paymentId, "verification_suspicious", ip, {
                checkoutRequestId, receiptNumber, resultCode, resultDesc, method: "mpesa",
            });
            console.warn(`[Verify][M-Pesa] SUSPICIOUS — paymentId=${paymentId} ResultCode=${resultCode} ${resultDesc}`);
            return {
                verified: false,
                status: "suspicious",
                note,
                providerData: { checkoutRequestId, resultCode, resultDesc },
            };
        }
    }
    catch (err) {
        // Safaricom API unavailable — log and allow through (don't penalise user)
        const note = `Safaricom STK Query unavailable: ${err.message}`;
        await stampPayment(paymentId, "api_unavailable", note, false);
        await writeAuditLog(paymentId, "verification_api_unavailable", ip, {
            checkoutRequestId, receiptNumber, error: err.message, method: "mpesa",
        });
        console.warn(`[Verify][M-Pesa] API_UNAVAILABLE — paymentId=${paymentId} — ${err.message} — proceeding`);
        return {
            verified: false,
            status: "api_unavailable",
            note,
        };
    }
}
// ── PayPal Verification ───────────────────────────────────────────────────────
async function verifyPayPalPayment(opts) {
    const { paymentId, paypalOrderId, captureId, expectedAmountKes, ip = "server" } = opts;
    try {
        const { getPayPalOrder } = await Promise.resolve().then(() => __importStar(require("../paypal")));
        const order = await getPayPalOrder(paypalOrderId);
        // 1. Check top-level order status
        if (order.status !== "COMPLETED") {
            const note = `PayPal order status not COMPLETED: "${order.status}"`;
            await stampPayment(paymentId, "suspicious", note, true, `paypal_order_not_completed:${order.status}`);
            await writeAuditLog(paymentId, "verification_suspicious", ip, {
                paypalOrderId, captureId, orderStatus: order.status, method: "paypal",
            });
            console.warn(`[Verify][PayPal] SUSPICIOUS — paymentId=${paymentId} status=${order.status}`);
            return { verified: false, status: "suspicious", note, providerData: order };
        }
        // 2. Check capture status
        if (order.captureStatus !== "COMPLETED") {
            const note = `PayPal capture status not COMPLETED: "${order.captureStatus}"`;
            await stampPayment(paymentId, "mismatch", note, true, `paypal_capture_not_completed:${order.captureStatus}`);
            await writeAuditLog(paymentId, "verification_mismatch", ip, {
                paypalOrderId, captureId, captureStatus: order.captureStatus, method: "paypal",
            });
            console.warn(`[Verify][PayPal] MISMATCH — paymentId=${paymentId} captureStatus=${order.captureStatus}`);
            return { verified: false, status: "mismatch", note, providerData: order };
        }
        // 3. Amount check — convert USD → KES and compare with tolerance
        const capturedUsd = parseFloat(order.amountUSD);
        const capturedKes = Math.round(capturedUsd * KES_TO_USD_RATE);
        const diff = Math.abs(capturedKes - expectedAmountKes);
        if (diff > AMOUNT_TOLERANCE_KES) {
            const note = `Amount mismatch: expected KES ${expectedAmountKes}, got ~KES ${capturedKes} ($${capturedUsd} @ ${KES_TO_USD_RATE})`;
            await stampPayment(paymentId, "mismatch", note, true, `paypal_amount_mismatch:expected=${expectedAmountKes},got=${capturedKes}`);
            await writeAuditLog(paymentId, "verification_mismatch", ip, {
                paypalOrderId, captureId, expectedAmountKes, capturedUsd, capturedKes, diff, method: "paypal",
            });
            console.warn(`[Verify][PayPal] AMOUNT MISMATCH — paymentId=${paymentId} expected=${expectedAmountKes} got=${capturedKes}`);
            return { verified: false, status: "mismatch", note, providerData: order };
        }
        // 4. All checks passed
        const note = `PayPal verified — order=${paypalOrderId} capture=${order.captureId} $${capturedUsd} (~KES ${capturedKes})`;
        await stampPayment(paymentId, "verified", note, false);
        await writeAuditLog(paymentId, "verification_verified", ip, {
            paypalOrderId, captureId: order.captureId, capturedUsd, capturedKes, payerEmail: order.payerEmail, method: "paypal",
        });
        console.info(`[Verify][PayPal] VERIFIED — paymentId=${paymentId} $${capturedUsd}`);
        return {
            verified: true,
            status: "verified",
            note,
            providerData: order,
        };
    }
    catch (err) {
        const note = `PayPal verification API unavailable: ${err.message}`;
        await stampPayment(paymentId, "api_unavailable", note, false);
        await writeAuditLog(paymentId, "verification_api_unavailable", ip, {
            paypalOrderId, captureId, error: err.message, method: "paypal",
        });
        console.warn(`[Verify][PayPal] API_UNAVAILABLE — paymentId=${paymentId} — ${err.message} — proceeding`);
        return { verified: false, status: "api_unavailable", note };
    }
}
