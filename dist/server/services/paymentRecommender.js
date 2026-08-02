"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMpesaCountry = isMpesaCountry;
exports.getAlternativeMethod = getAlternativeMethod;
exports.getRecommendedPaymentMethod = getRecommendedPaymentMethod;
const paypal_1 = require("../paypal");
/**
 * M-Pesa footprint = Kenya + Tanzania + Uganda. These are the ONLY three
 * countries where M-Pesa is the natural choice; everywhere else it's
 * either not offered or so rare it's not worth showing first.
 *
 * Tony's rule (2026-08): users whose PHONE prefix says they're in one of
 * these three see M-Pesa above PayPal. Everyone else sees PayPal first
 * (flat KES 4,500 flat fee for full-portal access). This works even if
 * the user is currently sitting in a different country — a Kenyan in
 * Dubai who registered with +254 still gets M-Pesa first because that's
 * still the money they have.
 */
const MPESA_COUNTRIES = new Set(["KE", "TZ", "UG"]);
function isMpesaCountry(iso) {
    return !!iso && MPESA_COUNTRIES.has(iso.toUpperCase());
}
function getAlternativeMethod(failedMethod, country) {
    // Any M-Pesa country falls back to M-Pesa on failure — Safaricom /
    // Vodacom / MTN outages are usually short and the user has no card.
    if (isMpesaCountry(country))
        return "mpesa";
    return failedMethod === "mpesa" ? "paypal" : "mpesa";
}
function getRecommendedPaymentMethod(userCountry, userHistory, userCountryName = "Unknown") {
    const paypalEnabled = (0, paypal_1.isPayPalConfigured)();
    const isMpesa = isMpesaCountry(userCountry);
    // ── M-Pesa countries (KE / TZ / UG) ─────────────────────────────────
    // M-Pesa suggested first (this is the money they have on their phone).
    // PayPal shown as secondary — useful if their line is off-network or
    // if they want to pay with a friend/family member's card abroad.
    if (isMpesa) {
        const available = ["mpesa"];
        if (paypalEnabled)
            available.push("paypal");
        return {
            recommended: "mpesa",
            available,
            country: userCountry,
            countryName: userCountryName,
            fromHistory: false,
            alternativeOnFailure: paypalEnabled ? "paypal" : "mpesa",
            isKenyaUser: userCountry === "KE",
        };
    }
    // ── Everyone else — PayPal first ────────────────────────────────────
    // M-Pesa is still LISTED (someone paying on behalf of a Kenyan friend,
    // or a diaspora user with a Kenyan M-Pesa line, might use it), but
    // PayPal is the default because that's what actually works on Visa,
    // Mastercard, Apple Pay etc worldwide.
    const available = [];
    if (paypalEnabled)
        available.push("paypal");
    available.push("mpesa");
    // Check payment history — a returning user's last successful method
    // wins over the geo default (best predictor of what will work again).
    const lastSuccessful = userHistory
        .filter((p) => p.status === "success")
        .sort((a, b) => new Date(b.createdAt ?? 0).getTime() -
        new Date(a.createdAt ?? 0).getTime())[0];
    const historyMethod = lastSuccessful?.paymentMethod;
    let recommended;
    let fromHistory = false;
    if (historyMethod && available.includes(historyMethod)) {
        recommended = historyMethod;
        fromHistory = true;
    }
    else {
        recommended = paypalEnabled ? "paypal" : "mpesa";
    }
    return {
        recommended,
        available,
        country: userCountry,
        countryName: userCountryName,
        fromHistory,
        alternativeOnFailure: recommended === "paypal" ? "mpesa" : (paypalEnabled ? "paypal" : "mpesa"),
        isKenyaUser: false,
    };
}
