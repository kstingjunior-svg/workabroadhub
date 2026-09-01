"use strict";
/**
 * validateKenyanPhone — single source of truth for M-Pesa-eligible phones.
 *
 * 2026-08 (Tony's stuck-payments audit): Erick Kivisu's +96560022904 was
 * being accepted at the /api/pay endpoint even though M-Pesa STK Push only
 * works on Safaricom Kenya numbers. Daraja returned ResponseCode 0 for each
 * push (accepted for delivery) but the callback never fires because the
 * destination isn't on the M-Pesa network — leaving 3 permanently-stuck
 * "STK Sent, Awaiting Confirmation" rows in admin.
 *
 * This is a strict validator: only Safaricom Kenya prefixes (07xxxxxxxx or
 * 011xxxxxxxx, i.e. 254[71]xxxxxxxx). Airtel, Telkom, and any foreign
 * numbers are rejected with a message that steers the user to PayPal.
 *
 * Returns:
 *   { ok: true,  normalized: "2547XXXXXXXX" }   — safe to send to Daraja
 *   { ok: false, reason: "..." }                — HTTP 400-friendly message
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateKenyanPhone = validateKenyanPhone;
const KENYA_SAFARICOM_REGEX = /^254(7|1)\d{8}$/;
function validateKenyanPhone(rawPhone) {
    if (!rawPhone || typeof rawPhone !== "string") {
        return { ok: false, reason: "Please enter your Safaricom phone number." };
    }
    // Strip everything non-numeric (spaces, +, -, brackets, unicode digits, etc.)
    const digits = rawPhone.replace(/\D/g, "");
    // Common Kenyan formats normalize to 254XXXXXXXXX
    let normalized;
    if (digits.length === 10 && digits.startsWith("0")) {
        // 07XXXXXXXX or 01XXXXXXXX → 254XXXXXXXXX
        normalized = "254" + digits.slice(1);
    }
    else if (digits.length === 12 && digits.startsWith("254")) {
        // Already in international format
        normalized = digits;
    }
    else if (digits.length === 9 && /^(7|1)\d{8}$/.test(digits)) {
        // Bare 7XXXXXXXX or 1XXXXXXXX (no leading 0 or 254)
        normalized = "254" + digits;
    }
    else {
        // Anything else — including foreign country codes — is not Kenyan Safaricom.
        return {
            ok: false,
            reason: "M-Pesa STK Push only works on Safaricom Kenya numbers (07XXX or 011XXX). " +
                "If you're paying from outside Kenya, please choose PayPal at checkout instead.",
        };
    }
    if (!KENYA_SAFARICOM_REGEX.test(normalized)) {
        // Wrong network prefix (Airtel 073X-075X, Telkom 077X etc.) — Airtel Money and
        // T-Kash CAN'T pay a Paybill via STK Push on Daraja, only Safaricom.
        return {
            ok: false,
            reason: "M-Pesa STK Push only works on Safaricom lines (07XX or 011XX numbers issued by Safaricom). " +
                "If you're on Airtel Money or T-Kash, use the Paybill option or pay via PayPal.",
        };
    }
    return { ok: true, normalized };
}
