"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendWhatsApp = sendWhatsApp;
const twilio_1 = __importDefault(require("twilio"));
// Restored Batch H: the migration replaced this file with a stub that no
// longer exported sendWhatsApp, breaking imports in 5 modules
// (ai/router.ts, license-notification-service.ts, schedulers/reEngagement.ts,
// wa-followup-scheduler.ts, whatsapp-queue.ts).
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = (0, twilio_1.default)(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    console.log("[WhatsApp] Twilio client initialized");
}
else {
    console.warn("[WhatsApp] Twilio credentials missing. WhatsApp features disabled.");
}
const fromRaw = (process.env.TWILIO_WHATSAPP_NUMBER ?? "+14155238886").trim();
const FROM = `whatsapp:${fromRaw.replace(/^whatsapp:/i, "")}`;
async function sendWhatsApp(phone, message) {
    if (!twilioClient) {
        console.warn(`[WhatsApp] Skipped send to ${phone} \u2014 Twilio not configured.`);
        return;
    }
    const normalized = phone
        .trim()
        .replace(/^whatsapp:/i, "")
        .replace(/^\+/, "");
    const to = `whatsapp:+${normalized}`;
    try {
        await twilioClient.messages.create({ from: FROM, to, body: message });
        console.log(`[WhatsApp] Sent to ${to}`);
    }
    catch (err) {
        console.error(`[WhatsApp] Send failed to ${to}:`, err?.message ?? err);
    }
}
exports.default = twilioClient;
