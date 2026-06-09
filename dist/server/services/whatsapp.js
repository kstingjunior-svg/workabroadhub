"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp send — provider-agnostic adapter.
//
// 2026-06 upgrade: founder hit a dead-end on Meta Business Verification
// (required for Twilio's WhatsApp sender), so we added Africa's Talking as
// an alternative provider. AT is a Kenyan company that holds Meta approval
// at the platform level — we don't need to be approved ourselves.
//
// PROVIDER SELECTION ORDER (first one with credentials wins):
//   1. Africa's Talking — if AFRICASTALKING_API_KEY + USERNAME are set.
//      Endpoint: https://content.africastalking.com/whatsapp/message/send
//      Cost: ~KES 1.50 per service message in Kenya.
//      No Meta business verification needed on our side.
//   2. Twilio — if TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN are set.
//      Cost: $0.005-$0.04 per message depending on country.
//      Requires our own Meta Business Verification (currently blocked).
//   3. None → log a warning and silently skip the send. Calling code is
//      defensive about this (fire-and-forget patterns everywhere).
//
// All existing call sites (whatsapp-queue.ts, wa-followup-scheduler.ts,
// services/delivery.ts, ai/router.ts) continue to import { sendWhatsApp }
// with the exact same signature. They don't care which provider sent it.
// ─────────────────────────────────────────────────────────────────────────────
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendWhatsApp = sendWhatsApp;
const twilio_1 = __importDefault(require("twilio"));
// ─── Provider: Africa's Talking ──────────────────────────────────────────────
const AT_API_KEY = (process.env.AFRICASTALKING_API_KEY ?? "").trim();
const AT_USERNAME = (process.env.AFRICASTALKING_USERNAME ?? "").trim();
const AT_WA_NUMBER = (process.env.AFRICASTALKING_WHATSAPP_SENDER ?? "").trim();
const AT_AVAILABLE = !!(AT_API_KEY && AT_USERNAME && AT_WA_NUMBER);
async function sendViaAfricasTalking(phone, message) {
    // AT expects E.164 with the leading + (e.g. +254712345678).
    const normalized = phone.trim().replace(/^whatsapp:/i, "");
    const to = normalized.startsWith("+") ? normalized : `+${normalized}`;
    const body = {
        username: AT_USERNAME,
        waNumber: AT_WA_NUMBER.startsWith("+") ? AT_WA_NUMBER : `+${AT_WA_NUMBER}`,
        phoneNumber: to,
        bodyText: message,
    };
    const res = await fetch("https://content.africastalking.com/whatsapp/message/send", {
        method: "POST",
        headers: {
            apiKey: AT_API_KEY,
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        throw new Error(`AT WhatsApp ${res.status}: ${errBody.slice(0, 250)}`);
    }
    console.log(`[WhatsApp/AT] Sent to ${to}`);
}
// ─── Provider: Twilio ────────────────────────────────────────────────────────
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = (0, twilio_1.default)(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}
const TWILIO_FROM_RAW = (process.env.TWILIO_WHATSAPP_NUMBER ?? "+14155238886").trim();
const TWILIO_FROM = `whatsapp:${TWILIO_FROM_RAW.replace(/^whatsapp:/i, "")}`;
async function sendViaTwilio(phone, message) {
    if (!twilioClient)
        throw new Error("Twilio client not initialized");
    const normalized = phone.trim().replace(/^whatsapp:/i, "").replace(/^\+/, "");
    const to = `whatsapp:+${normalized}`;
    await twilioClient.messages.create({ from: TWILIO_FROM, to, body: message });
    console.log(`[WhatsApp/Twilio] Sent to ${to}`);
}
// ─── Boot-time provider announcement ─────────────────────────────────────────
if (AT_AVAILABLE) {
    console.log(`[WhatsApp] Provider: Africa's Talking (sender ${AT_WA_NUMBER})`);
}
else if (twilioClient) {
    console.log(`[WhatsApp] Provider: Twilio (sender ${TWILIO_FROM})`);
}
else {
    console.warn("[WhatsApp] No provider configured — sends will be skipped.");
}
// ─── Public API — same signature as before ───────────────────────────────────
async function sendWhatsApp(phone, message) {
    if (!phone || !message)
        return;
    // Try AT first if configured. If it fails AND Twilio is also available,
    // we fall through to Twilio so a transient AT outage doesn't drop messages.
    if (AT_AVAILABLE) {
        try {
            await sendViaAfricasTalking(phone, message);
            return;
        }
        catch (err) {
            if (twilioClient) {
                console.warn(`[WhatsApp/AT] Failed, falling back to Twilio: ${err?.message ?? err}`);
            }
            else {
                console.error(`[WhatsApp/AT] Send failed to ${phone}: ${err?.message ?? err}`);
                return;
            }
        }
    }
    if (twilioClient) {
        try {
            await sendViaTwilio(phone, message);
            return;
        }
        catch (err) {
            console.error(`[WhatsApp/Twilio] Send failed to ${phone}: ${err?.message ?? err}`);
            return;
        }
    }
    console.warn(`[WhatsApp] Skipped send to ${phone} — no provider configured.`);
}
// Default export preserved for callers that imported the raw Twilio client.
// New code should not depend on this — use sendWhatsApp() instead.
exports.default = twilioClient;
