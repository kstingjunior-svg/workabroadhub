"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVapidPublicKey = getVapidPublicKey;
exports.sendPushNotification = sendPushNotification;
exports.broadcastNotification = broadcastNotification;
exports.generateVapidKeys = generateVapidKeys;
const web_push_1 = __importDefault(require("web-push"));
const storage_1 = require("../storage");
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:support@workabroad.hub";
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    web_push_1.default.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}
function getVapidPublicKey() {
    return VAPID_PUBLIC_KEY;
}
async function sendPushNotification(subscription, payload) {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
        console.warn("VAPID keys not configured, skipping push notification");
        return false;
    }
    const pushSubscription = {
        endpoint: subscription.endpoint,
        keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
        },
    };
    try {
        await web_push_1.default.sendNotification(pushSubscription, JSON.stringify({
            title: payload.title,
            body: payload.body,
            url: payload.url || "/",
            icon: payload.icon || "/icon-192.png",
            badge: "/icon-72.png",
        }));
        return true;
    }
    catch (error) {
        console.error("Push notification failed:", error);
        if (error.statusCode === 410 || error.statusCode === 404) {
            return false;
        }
        return false;
    }
}
async function broadcastNotification(payload, countryId) {
    const subscriptions = await storage_1.storage.getActivePushSubscriptions();
    let sent = 0;
    let failed = 0;
    for (const sub of subscriptions) {
        const success = await sendPushNotification({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, payload);
        if (success) {
            sent++;
        }
        else {
            failed++;
            await storage_1.storage.deactivatePushSubscription(sub.id);
        }
    }
    return { sent, failed };
}
function generateVapidKeys() {
    const keys = web_push_1.default.generateVAPIDKeys();
    return {
        publicKey: keys.publicKey,
        privateKey: keys.privateKey,
    };
}
