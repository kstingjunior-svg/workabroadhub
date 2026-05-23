"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAlternativeMethod = getAlternativeMethod;
exports.getRecommendedPaymentMethod = getRecommendedPaymentMethod;
const paypal_1 = require("../paypal");
function getAlternativeMethod(failedMethod, country) {
    const isKenya = country === "KE";
    if (isKenya)
        return "mpesa"; // Kenya always falls back to M-Pesa
    return failedMethod === "mpesa" ? "paypal" : "mpesa";
}
function getRecommendedPaymentMethod(userCountry, userHistory, userCountryName = "Unknown") {
    const paypalEnabled = (0, paypal_1.isPayPalConfigured)();
    const isKenya = userCountry === "KE";
    // Kenya users: M-Pesa only
    if (isKenya) {
        return {
            recommended: "mpesa",
            available: ["mpesa"],
            country: userCountry,
            countryName: userCountryName,
            fromHistory: false,
            alternativeOnFailure: "mpesa",
            isKenyaUser: true,
        };
    }
    // International users: PayPal recommended (if configured), M-Pesa as fallback
    const available = [];
    if (paypalEnabled)
        available.push("paypal");
    available.push("mpesa");
    // Check payment history for preferred method
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
