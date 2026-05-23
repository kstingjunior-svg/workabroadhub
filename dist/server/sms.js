"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.smsTemplates = exports.messageTemplates = void 0;
exports.clearCredentialCache = clearCredentialCache;
exports.sendSMS = sendSMS;
exports.sendWhatsApp = sendWhatsApp;
exports.sendMessage = sendMessage;
exports.notifyNewReferral = notifyNewReferral;
exports.notifyPayoutComplete = notifyPayoutComplete;
exports.notifyInfluencerStatus = notifyInfluencerStatus;
exports.notifyPaymentReceived = notifyPaymentReceived;
exports.notifyPaymentFailed = notifyPaymentFailed;
exports.notifyPaymentRecovery = notifyPaymentRecovery;
exports.notifySubscriptionActivated = notifySubscriptionActivated;
exports.notifyOrderReceived = notifyOrderReceived;
exports.notifyOrderProcessing = notifyOrderProcessing;
exports.notifyOrderReady = notifyOrderReady;
exports.notifyOrderDelivered = notifyOrderDelivered;
exports.notifyApplicationStatus = notifyApplicationStatus;
exports.notifyInterviewScheduled = notifyInterviewScheduled;
exports.sendWelcomeMessage = sendWelcomeMessage;
exports.sendTestMessage = sendTestMessage;
exports.notifyAdminNewPayment = notifyAdminNewPayment;
exports.notifyComplianceTeamFraudAlert = notifyComplianceTeamFraudAlert;
exports.sendWhatsAppPaymentConfirmation = sendWhatsAppPaymentConfirmation;
exports.notifyAgencyBlacklisted = notifyAgencyBlacklisted;
exports.sendWhatsAppAlert = sendWhatsAppAlert;
// Twilio SMS and WhatsApp integration for WorkAbroad Hub
// Supports both Replit Twilio connector and direct environment variable secrets
const twilio_1 = __importDefault(require("twilio"));
let cachedCredentials = null;
function clearCredentialCache() {
    cachedCredentials = null;
}
async function getCredentials() {
    if (cachedCredentials)
        return cachedCredentials;
    // Prefer direct environment variable secrets (user-provided real credentials)
    const accountSid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
    const authToken = (process.env.TWILIO_AUTH_TOKEN || '').trim();
    const rawPhone = (process.env.TWILIO_PHONE_NUMBER || '').trim();
    const rawWhatsApp = (process.env.TWILIO_WHATSAPP_NUMBER || '').trim();
    // TWILIO_PHONE_NUMBER = WhatsApp Business sender number (e.g. +15558158771)
    // TWILIO_WHATSAPP_NUMBER = personal/consultation WhatsApp number (e.g. +254742619777)
    const senderNumber = rawPhone;
    const consultationNumber = rawWhatsApp;
    if (accountSid && authToken && accountSid.startsWith('AC')) {
        cachedCredentials = {
            accountSid,
            authToken,
            useApiKey: false,
            phoneNumber: senderNumber,
            whatsappSenderNumber: senderNumber,
            userWhatsAppNumber: consultationNumber
        };
        console.log(`Twilio: Using env credentials. Sender: ${senderNumber}`);
        return cachedCredentials;
    }
    // Fall back to Replit connector
    try {
        const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
        const xReplitToken = process.env.REPL_IDENTITY
            ? 'repl ' + process.env.REPL_IDENTITY
            : process.env.WEB_REPL_RENEWAL
                ? 'depl ' + process.env.WEB_REPL_RENEWAL
                : null;
        if (hostname && xReplitToken) {
            const connectionSettings = await fetch('https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=twilio', {
                headers: {
                    'Accept': 'application/json',
                    'X_REPLIT_TOKEN': xReplitToken
                }
            }).then(res => res.json()).then(data => data.items?.[0]);
            if (connectionSettings?.settings?.account_sid) {
                const connPhone = connectionSettings.settings.phone_number || senderNumber || rawPhone;
                cachedCredentials = {
                    accountSid: connectionSettings.settings.account_sid,
                    authToken: connectionSettings.settings.api_key_secret || connectionSettings.settings.auth_token,
                    apiKey: connectionSettings.settings.api_key,
                    useApiKey: !!connectionSettings.settings.api_key,
                    phoneNumber: connPhone,
                    whatsappSenderNumber: connPhone,
                    userWhatsAppNumber: consultationNumber || rawWhatsApp
                };
                console.log('Twilio: Using Replit connector credentials');
                return cachedCredentials;
            }
        }
    }
    catch (e) {
        // Connector not available
    }
    throw new Error('Twilio credentials not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
}
async function getTwilioClient() {
    const creds = await getCredentials();
    if (creds.useApiKey) {
        return (0, twilio_1.default)(creds.apiKey, creds.authToken, { accountSid: creds.accountSid });
    }
    return (0, twilio_1.default)(creds.accountSid, creds.authToken);
}
async function getTwilioFromPhoneNumber() {
    const { phoneNumber } = await getCredentials();
    return phoneNumber;
}
async function getWhatsAppSenderNumber() {
    const creds = await getCredentials();
    // Always use the Twilio number as the WhatsApp sender (sandbox or business number)
    return creds.whatsappSenderNumber || creds.phoneNumber;
}
// Format Kenyan phone number to E.164 format
function formatPhoneNumber(phone) {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
        cleaned = '254' + cleaned.slice(1);
    }
    else if (cleaned.startsWith('7') || cleaned.startsWith('1')) {
        cleaned = '254' + cleaned;
    }
    else if (!cleaned.startsWith('254')) {
        cleaned = '254' + cleaned;
    }
    return '+' + cleaned;
}
// Send SMS message
async function sendSMS(to, message) {
    try {
        const client = await getTwilioClient();
        const fromNumber = await getTwilioFromPhoneNumber();
        const formattedTo = formatPhoneNumber(to);
        const result = await client.messages.create({
            body: message,
            from: fromNumber,
            to: formattedTo
        });
        console.log(`SMS sent successfully to ${formattedTo}: ${result.sid}`);
        return { success: true, sid: result.sid };
    }
    catch (error) {
        console.error('Failed to send SMS:', error.message);
        let errorMsg = error.message;
        if (error.code === 21606) {
            errorMsg = "SMS not available: Your Twilio number is a WhatsApp sandbox number and cannot send SMS to this destination. Purchase an SMS-capable number from Twilio to send SMS.";
        }
        return { success: false, error: errorMsg };
    }
}
// Twilio Content Template SIDs for WhatsApp Business API
// These are used for business-initiated conversations (first message to a user)
const CONTENT_TEMPLATES = {
    appointmentReminder: 'HXdb8a70e28c36fa9628dd16e51863bf20',
    orderTracking: 'HXe303d61920406eae2f4f70e687b7e270',
    messageOptIn: 'HXd6dd6fe00c4aef80cbc5e4c6124a9c39',
    orderUpdate: 'HX6f9c017e283392e8e44fa7332748cf3f',
};
// Send WhatsApp message - tries free-form first, falls back to content template
async function sendWhatsApp(to, message, contentSid, contentVariables) {
    try {
        const client = await getTwilioClient();
        const fromNumber = await getWhatsAppSenderNumber();
        const formattedTo = formatPhoneNumber(to);
        // Build message options
        const msgOptions = {
            from: `whatsapp:${fromNumber}`,
            to: `whatsapp:${formattedTo}`
        };
        if (contentSid) {
            // Use approved content template for business-initiated messages
            msgOptions.contentSid = contentSid;
            if (contentVariables) {
                msgOptions.contentVariables = JSON.stringify(contentVariables);
            }
        }
        else {
            // Try free-form text (works within 24-hour response window)
            msgOptions.body = message;
        }
        const result = await client.messages.create(msgOptions);
        console.log(`WhatsApp sent successfully to ${formattedTo}: ${result.sid}`);
        return { success: true, sid: result.sid };
    }
    catch (error) {
        console.error('Failed to send WhatsApp:', error.message, '(code:', error.code, ')');
        // If free-form failed with 63016, retry with opt-in template
        if (!contentSid && (error.code === 63016 || error.code === 63032)) {
            console.log('Free-form message blocked. Retrying with content template...');
            try {
                const client = await getTwilioClient();
                const fromNumber = await getWhatsAppSenderNumber();
                const formattedTo = formatPhoneNumber(to);
                const now = new Date();
                const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
                const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                const result = await client.messages.create({
                    from: `whatsapp:${fromNumber}`,
                    to: `whatsapp:${formattedTo}`,
                    contentSid: CONTENT_TEMPLATES.messageOptIn
                });
                console.log(`WhatsApp sent via template to ${formattedTo}: ${result.sid}`);
                return { success: true, sid: result.sid };
            }
            catch (retryError) {
                console.error('Template retry also failed:', retryError.message);
                return {
                    success: false,
                    error: `WhatsApp Business requires approved message templates for first-time messages. Template status may still be pending approval from Meta. Error: ${retryError.message}`
                };
            }
        }
        return { success: false, error: error.message };
    }
}
// Send message via preferred channel (WhatsApp first, fallback to SMS)
async function sendMessage(to, message, preferWhatsApp = true) {
    if (preferWhatsApp) {
        const whatsappResult = await sendWhatsApp(to, message);
        if (whatsappResult.success) {
            return { ...whatsappResult, channel: 'whatsapp' };
        }
        console.log('WhatsApp failed, falling back to SMS');
    }
    const smsResult = await sendSMS(to, message);
    return { ...smsResult, channel: 'sms' };
}
// ============================================
// NOTIFICATION TEMPLATES
// ============================================
exports.messageTemplates = {
    // Referral notifications
    newReferral: (refCode, amount) => `WorkAbroad Hub: New referral recorded! Your code ${refCode} was used. You've earned KES ${amount} commission (pending approval).`,
    payoutApproved: (amount) => `WorkAbroad Hub: Your KES ${amount} referral commission has been approved! M-Pesa payment is being processed.`,
    payoutComplete: (amount, transactionId) => `WorkAbroad Hub: KES ${amount} sent to your M-Pesa. Transaction: ${transactionId}. Thank you for being a partner!`,
    influencerApproved: (refCode) => `WorkAbroad Hub: Congratulations! Your influencer application was approved. Your referral code is ${refCode}. Start earning 10% commission per signup!`,
    influencerRejected: () => `WorkAbroad Hub: Your influencer application was not approved at this time. Contact support for more information.`,
    weeklyEarnings: (total, pending, referralCount) => `WorkAbroad Hub Weekly Summary: ${referralCount} referrals, KES ${total} total earnings, KES ${pending} pending payout.`,
    // Payment notifications
    paymentReceived: (amount, service) => `WorkAbroad Hub: Payment of KES ${amount} received for ${service}. Thank you! Access your dashboard at workabroadhub.tech`,
    paymentFailed: (amount, reason) => `WorkAbroad Hub: Payment of KES ${amount} failed. Reason: ${reason}. Please try again or contact support.`,
    // Abandoned payment recovery — sent when a payment times out or fails without completion.
    paymentRecovery: () => `Hi 👋\n\nWe noticed your payment didn't complete earlier.\n\nYou can still activate your WorkAbroad PRO account now:\n\n👉 https://workabroadhub.tech\n\nIf you need help, reply here.\n\nNo agents. No scams. Just verified jobs.`,
    subscriptionActivated: () => `WorkAbroad Hub: Your subscription is now active! Access all job portals and resources at workabroadhub.tech/dashboard`,
    // Service order notifications
    orderReceived: (serviceName, orderId) => `WorkAbroad Hub: Your order for "${serviceName}" (ID: ${orderId.slice(0, 8)}) has been received. We'll notify you when it's ready.`,
    orderProcessing: (serviceName) => `WorkAbroad Hub: Your "${serviceName}" order is now being processed by our team.`,
    orderReady: (serviceName) => `WorkAbroad Hub: Great news! Your "${serviceName}" is ready for download. Check your dashboard to access it.`,
    orderDelivered: (serviceName) => `WorkAbroad Hub: Your "${serviceName}" has been delivered. Please check your email or dashboard to download.`,
    // Application tracking notifications
    applicationStatusUpdate: (company, status) => `WorkAbroad Hub: Your application to ${company} status changed to "${status}". Track all applications in your dashboard.`,
    interviewScheduled: (company, date) => `WorkAbroad Hub: Interview scheduled with ${company} on ${date}. Good luck! Prepare with our Interview Coaching service.`,
    // General notifications
    welcomeMessage: (firstName) => `Welcome to WorkAbroad Hub, ${firstName}! Start exploring verified job opportunities across 6 countries. Questions? WhatsApp us anytime.`,
    testMessage: () => `WorkAbroad Hub: This is a test message. Your Twilio integration is working correctly!`,
    // Admin notifications
    adminNewPayment: (amount, userEmail) => `[Admin] New payment: KES ${amount} from ${userEmail}`,
    adminNewUser: (userEmail) => `[Admin] New user registered: ${userEmail}`,
    adminInfluencerApplication: (name) => `[Admin] New influencer application from ${name}. Review in admin panel.`
};
// Keep backward compatibility
exports.smsTemplates = exports.messageTemplates;
// ============================================
// NOTIFICATION FUNCTIONS
// ============================================
// Referral notifications
async function notifyNewReferral(partnerPhone, refCode, commission) {
    const message = exports.messageTemplates.newReferral(refCode, commission);
    await sendMessage(partnerPhone, message);
}
async function notifyPayoutComplete(partnerPhone, amount, transactionId) {
    const message = exports.messageTemplates.payoutComplete(amount, transactionId);
    await sendMessage(partnerPhone, message);
}
async function notifyInfluencerStatus(phone, approved, refCode) {
    const message = approved && refCode
        ? exports.messageTemplates.influencerApproved(refCode)
        : exports.messageTemplates.influencerRejected();
    await sendMessage(phone, message);
}
// Payment notifications
async function notifyPaymentReceived(phone, amount, service) {
    const message = exports.messageTemplates.paymentReceived(amount, service);
    await sendMessage(phone, message);
}
async function notifyPaymentFailed(phone, amount, reason) {
    const message = exports.messageTemplates.paymentFailed(amount, reason);
    await sendMessage(phone, message);
}
// Abandoned payment recovery — call after a payment times out or is definitively failed.
// Sends once via WhatsApp (fallback to SMS) to re-engage the user and bring them back to pay.
async function notifyPaymentRecovery(phone) {
    const message = exports.messageTemplates.paymentRecovery();
    await sendMessage(phone, message).catch((err) => {
        console.warn("[PaymentRecovery] Failed to send recovery message:", err?.message || err);
    });
}
async function notifySubscriptionActivated(phone) {
    const message = exports.messageTemplates.subscriptionActivated();
    await sendMessage(phone, message);
}
// Service order notifications
async function notifyOrderReceived(phone, serviceName, orderId) {
    const message = exports.messageTemplates.orderReceived(serviceName, orderId);
    await sendMessage(phone, message);
}
async function notifyOrderProcessing(phone, serviceName) {
    const message = exports.messageTemplates.orderProcessing(serviceName);
    await sendMessage(phone, message);
}
async function notifyOrderReady(phone, serviceName) {
    const message = exports.messageTemplates.orderReady(serviceName);
    await sendMessage(phone, message);
}
async function notifyOrderDelivered(phone, serviceName) {
    const message = exports.messageTemplates.orderDelivered(serviceName);
    await sendMessage(phone, message);
}
// Application tracking
async function notifyApplicationStatus(phone, company, status) {
    const message = exports.messageTemplates.applicationStatusUpdate(company, status);
    await sendMessage(phone, message);
}
async function notifyInterviewScheduled(phone, company, date) {
    const message = exports.messageTemplates.interviewScheduled(company, date);
    await sendMessage(phone, message);
}
// Welcome message
async function sendWelcomeMessage(phone, firstName) {
    const message = exports.messageTemplates.welcomeMessage(firstName);
    await sendMessage(phone, message);
}
// Test message (for admin verification)
async function sendTestMessage(phone) {
    const message = exports.messageTemplates.testMessage();
    const results = {
        success: false
    };
    try {
        const smsResult = await sendSMS(phone, message);
        results.smsResult = smsResult;
        const whatsappResult = await sendWhatsApp(phone, message);
        results.whatsappResult = whatsappResult;
        results.success = smsResult.success || whatsappResult.success;
        return results;
    }
    catch (error) {
        results.error = error.message;
        return results;
    }
}
// Admin alert
async function notifyAdminNewPayment(adminPhone, amount, userEmail) {
    const message = exports.messageTemplates.adminNewPayment(amount, userEmail);
    await sendSMS(adminPhone, message);
}
async function notifyComplianceTeamFraudAlert(flag, rule) {
    const adminPhone = process.env.ADMIN_PHONE_NUMBER || "";
    if (!adminPhone)
        return;
    const severityLabel = (flag.severity || "medium").toUpperCase();
    const message = `🚨 [FRAUD ALERT - ${severityLabel}] ${rule.description || rule.ruleName}\n\nEntity: ${flag.entityId}\nType: ${flag.entityType}\nRule: ${rule.ruleName}\nAction Required: Review in Admin Dashboard → Fraud Detection`;
    try {
        await sendMessage(adminPhone, message);
        console.log(`[FraudAlert] Compliance team notified for flag ${flag.id}`);
    }
    catch (err) {
        console.error("[FraudAlert] Failed to send compliance alert:", err);
    }
}
/**
 * sendWhatsAppPaymentConfirmation — sends a receipt message to the user's phone
 * after a successful M-Pesa or PayPal payment. Called from the callback handlers.
 */
async function sendWhatsAppPaymentConfirmation(opts) {
    const { phone, serviceLabel, amountKes, receipt, userId, serviceCode } = opts;
    if (!phone)
        return;
    const BASE = "https://workabroadhub.tech";
    const link = serviceCode && userId ? `${BASE}/pay?service=${serviceCode}&user=${userId}` :
        userId ? `${BASE}/dashboard?user=${userId}` :
            `${BASE}/dashboard`;
    const message = `✅ *Payment Confirmed — WorkAbroad Hub*\n\n` +
        `📋 Service: *${serviceLabel}*\n` +
        `💰 Amount: *KES ${amountKes.toLocaleString()}*\n` +
        `🧾 M-Pesa Receipt: ${receipt}\n\n` +
        `Your service is now active! Access it here:\n` +
        `👉 ${link}\n\n` +
        `Questions? Reply to this message and our team will assist you 🌍`;
    try {
        await sendWhatsApp(phone, message);
        console.log(`[WhatsAppConfirm] ✓ ${phone} | service=${serviceLabel} | receipt=${receipt}`);
    }
    catch (err) {
        console.error("[WhatsAppConfirm] Failed:", err);
    }
}
async function notifyAgencyBlacklisted(agencyPhone, agencyName, reason) {
    if (!agencyPhone)
        return;
    const message = `⚠️ [WorkAbroad Hub] Notice: ${agencyName} has been flagged for compliance review.\n\nReason: ${reason}\n\nPlease contact our compliance team for resolution. Your listing has been temporarily restricted.`;
    try {
        await sendMessage(agencyPhone, message);
    }
    catch (err) {
        console.error("[FraudAlert] Failed to notify agency:", err);
    }
}
/**
 * sendWhatsAppAlert — sends a WhatsApp message to the configured admin number.
 * Reads recipient from ADMIN_PHONE_NUMBER; sender resolved via existing sendWhatsApp().
 * Safe to call fire-and-forget; logs errors without throwing.
 */
async function sendWhatsAppAlert(message) {
    const adminPhone = (process.env.ADMIN_PHONE_NUMBER ?? "").replace(/^\+/, "");
    if (!adminPhone) {
        console.warn("[sendWhatsAppAlert] ADMIN_PHONE_NUMBER not set — skipping alert");
        return;
    }
    try {
        const result = await sendWhatsApp(adminPhone, message);
        if (result.success) {
            console.log("📲 Admin WhatsApp alert sent:", result.sid);
        }
        else {
            console.error("❌ Admin WhatsApp alert failed:", result.error);
        }
    }
    catch (err) {
        console.error("❌ sendWhatsAppAlert crash:", err);
    }
}
