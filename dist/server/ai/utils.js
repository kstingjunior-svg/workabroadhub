"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackEvent = trackEvent;
exports.getVoice = getVoice;
exports.detectLanguage = detectLanguage;
const supabaseClient_1 = require("../supabaseClient");
async function trackEvent(userId, event, extra) {
    try {
        await supabaseClient_1.supabase.from("user_events").insert([{
                user_id: userId ? String(userId) : null,
                event,
                ...(extra?.service ? { category: extra.service } : {}),
                ...(extra?.page ? { page: extra.page } : {}),
                ...(extra?.category ? { category: extra.category } : {}),
                ...(extra?.country ? { country: extra.country } : {}),
            }]);
    }
    catch (err) {
        console.warn("[trackEvent] failed:", err.message);
    }
}
function getVoice(language) {
    if (language === "sw")
        return "Polly.Joanna"; // closest
    if (language === "ar")
        return "Polly.Zeina";
    return "Polly.Amy";
}
function detectLanguage(text) {
    const t = text.toLowerCase();
    if (t.includes("habari") ||
        t.includes("kazi") ||
        t.includes("nisaidie") ||
        t.includes("tafadhali")) {
        return "sw";
    }
    if (/[\u0600-\u06FF]/.test(text)) {
        return "ar";
    }
    return "en";
}
