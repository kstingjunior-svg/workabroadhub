"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdapter = getAdapter;
exports.getReminderTierForDays = getReminderTierForDays;
exports.buildReminderMessage = buildReminderMessage;
exports.getChannelsForPreference = getChannelsForPreference;
exports.sendWithFallback = sendWithFallback;
// @ts-nocheck
const sms_1 = require("./sms");
const whatsapp_1 = require("./services/whatsapp");
const schema_1 = require("@shared/schema");
const smsAdapter = {
    channel: schema_1.NOTIFICATION_CHANNELS.SMS,
    async send(to, message) {
        try {
            const result = await (0, sms_1.sendSMS)(to, message);
            return {
                success: result.success,
                channel: schema_1.NOTIFICATION_CHANNELS.SMS,
                providerSid: result.sid,
                error: result.error,
            };
        }
        catch (error) {
            return { success: false, channel: schema_1.NOTIFICATION_CHANNELS.SMS, error: error.message };
        }
    },
};
const whatsappAdapter = {
    channel: schema_1.NOTIFICATION_CHANNELS.WHATSAPP,
    async send(to, message) {
        try {
            const result = await (0, whatsapp_1.sendWhatsApp)(to, message);
            return {
                success: result.success,
                channel: schema_1.NOTIFICATION_CHANNELS.WHATSAPP,
                providerSid: result.sid,
                error: result.error,
            };
        }
        catch (error) {
            return { success: false, channel: schema_1.NOTIFICATION_CHANNELS.WHATSAPP, error: error.message };
        }
    },
};
const emailAdapter = {
    channel: schema_1.NOTIFICATION_CHANNELS.EMAIL,
    async send(_to, _message) {
        console.log(`[EmailAdapter] Email sending not configured. Would send to: ${_to}`);
        return {
            success: false,
            channel: schema_1.NOTIFICATION_CHANNELS.EMAIL,
            error: "Email provider not configured. Set up SMTP or SendGrid to enable email notifications.",
        };
    },
};
const adapters = {
    [schema_1.NOTIFICATION_CHANNELS.SMS]: smsAdapter,
    [schema_1.NOTIFICATION_CHANNELS.WHATSAPP]: whatsappAdapter,
    [schema_1.NOTIFICATION_CHANNELS.EMAIL]: emailAdapter,
};
function getAdapter(channel) {
    return adapters[channel] || smsAdapter;
}
function getReminderTierForDays(daysRemaining) {
    if (daysRemaining === -7)
        return schema_1.REMINDER_TIERS.DAYS_AFTER_7;
    if (daysRemaining === 0)
        return schema_1.REMINDER_TIERS.ON_EXPIRY;
    if (daysRemaining === 7)
        return schema_1.REMINDER_TIERS.DAYS_7;
    if (daysRemaining === 30)
        return schema_1.REMINDER_TIERS.DAYS_30;
    if (daysRemaining === 60)
        return schema_1.REMINDER_TIERS.DAYS_60;
    return null;
}
function buildReminderMessage(agencyName, licenseNumber, expiryDate, daysRemaining, tier) {
    const dateStr = expiryDate.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
    });
    switch (tier) {
        case schema_1.REMINDER_TIERS.DAYS_60:
            return `📋 License Renewal Notice: Your agency license (No. ${licenseNumber}) for ${agencyName} expires in 60 days on ${dateStr}. Plan your renewal early to avoid service interruption. Visit NEA portal to renew.`;
        case schema_1.REMINDER_TIERS.DAYS_30:
            return `⚠️ License Expiry Reminder: Your agency license (No. ${licenseNumber}) for ${agencyName} expires in 30 days on ${dateStr}. Renew now to avoid suspension. Visit NEA portal or contact NEA at +254 20 2625 244.`;
        case schema_1.REMINDER_TIERS.DAYS_7:
            return `🚨 URGENT License Expiry: Your agency license (No. ${licenseNumber}) for ${agencyName} expires in 7 days on ${dateStr}. Renew immediately to avoid suspension and legal penalties. Contact NEA: +254 20 2625 244.`;
        case schema_1.REMINDER_TIERS.ON_EXPIRY:
            return `❌ LICENSE EXPIRED TODAY: Your agency license (No. ${licenseNumber}) for ${agencyName} has expired today (${dateStr}). Operating without a valid license is illegal. Renew immediately at the NEA portal or contact NEA: +254 20 2625 244.`;
        case schema_1.REMINDER_TIERS.DAYS_AFTER_7:
            return `🔴 FINAL NOTICE - License Overdue: Your agency license (No. ${licenseNumber}) for ${agencyName} expired 7 days ago on ${dateStr}. Your agency listing has been flagged. Renew urgently to restore your status. Contact NEA: +254 20 2625 244.`;
        default:
            return `License reminder for ${agencyName} (No. ${licenseNumber}). Expiry: ${dateStr}. Days remaining: ${daysRemaining}.`;
    }
}
function getChannelsForPreference(pref) {
    const channels = [];
    if (pref.preferredChannel === schema_1.NOTIFICATION_CHANNELS.SMS && pref.enableSms) {
        channels.push(schema_1.NOTIFICATION_CHANNELS.SMS);
    }
    else if (pref.preferredChannel === schema_1.NOTIFICATION_CHANNELS.WHATSAPP && pref.enableWhatsapp) {
        channels.push(schema_1.NOTIFICATION_CHANNELS.WHATSAPP);
    }
    else if (pref.preferredChannel === schema_1.NOTIFICATION_CHANNELS.EMAIL && pref.enableEmail) {
        channels.push(schema_1.NOTIFICATION_CHANNELS.EMAIL);
    }
    if (pref.enableSms && !channels.includes(schema_1.NOTIFICATION_CHANNELS.SMS)) {
        channels.push(schema_1.NOTIFICATION_CHANNELS.SMS);
    }
    if (pref.enableWhatsapp && !channels.includes(schema_1.NOTIFICATION_CHANNELS.WHATSAPP)) {
        channels.push(schema_1.NOTIFICATION_CHANNELS.WHATSAPP);
    }
    if (pref.enableEmail && !channels.includes(schema_1.NOTIFICATION_CHANNELS.EMAIL)) {
        channels.push(schema_1.NOTIFICATION_CHANNELS.EMAIL);
    }
    return channels.length > 0 ? channels : [schema_1.NOTIFICATION_CHANNELS.SMS];
}
async function sendWithFallback(channels, recipient, message) {
    for (const channel of channels) {
        const adapter = getAdapter(channel);
        const result = await adapter.send(recipient, message);
        if (result.success) {
            return result;
        }
        console.log(`[LicenseReminder] ${channel} failed, trying next channel...`);
    }
    return {
        success: false,
        channel: channels[channels.length - 1] || schema_1.NOTIFICATION_CHANNELS.SMS,
        error: "All notification channels failed",
    };
}
