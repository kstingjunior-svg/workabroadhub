import { sendSMS } from "./sms";
import { sendWhatsApp } from "./services/whatsapp";
import type { NeaAgency, LicenseReminderLog, AgencyNotificationPreference, ReminderTier, NotificationChannel } from "@shared/schema";
import { REMINDER_TIERS, NOTIFICATION_CHANNELS } from "@shared/schema";

export interface NotificationResult {
  success: boolean;
  channel: NotificationChannel;
  providerSid?: string;
  error?: string;
}

export interface NotificationAdapter {
  channel: NotificationChannel;
  send(to: string, message: string): Promise<NotificationResult>;
}

const smsAdapter: NotificationAdapter = {
  channel: NOTIFICATION_CHANNELS.SMS,
  async send(to: string, message: string): Promise<NotificationResult> {
    try {
      const result = await sendSMS(to, message);
      return {
        success: result.success,
        channel: NOTIFICATION_CHANNELS.SMS,
        providerSid: result.sid,
        error: result.error,
      };
    } catch (error: any) {
      return { success: false, channel: NOTIFICATION_CHANNELS.SMS, error: error.message };
    }
  },
};

const whatsappAdapter: NotificationAdapter = {
  channel: NOTIFICATION_CHANNELS.WHATSAPP,
  async send(to: string, message: string): Promise<NotificationResult> {
    try {
      const result = await sendWhatsApp(to, message);
      return {
        success: result.success,
        channel: NOTIFICATION_CHANNELS.WHATSAPP,
        providerSid: result.sid,
        error: result.error,
      };
    } catch (error: any) {
      return { success: false, channel: NOTIFICATION_CHANNELS.WHATSAPP, error: error.message };
    }
  },
};

const emailAdapter: NotificationAdapter = {
  channel: NOTIFICATION_CHANNELS.EMAIL,
  async send(_to: string, _message: string): Promise<NotificationResult> {
    console.log(`[EmailAdapter] Email sending not configured. Would send to: ${_to}`);
    return {
      success: false,
      channel: NOTIFICATION_CHANNELS.EMAIL,
      error: "Email provider not configured. Set up SMTP or SendGrid to enable email notifications.",
    };
  },
};

const adapters: Record<string, NotificationAdapter> = {
  [NOTIFICATION_CHANNELS.SMS]: smsAdapter,
  [NOTIFICATION_CHANNELS.WHATSAPP]: whatsappAdapter,
  [NOTIFICATION_CHANNELS.EMAIL]: emailAdapter,
};

export function getAdapter(channel: NotificationChannel): NotificationAdapter {
  return adapters[channel] || smsAdapter;
}

export function getReminderTierForDays(daysRemaining: number): ReminderTier | null {
  if (daysRemaining === -7) return REMINDER_TIERS.DAYS_AFTER_7;
  if (daysRemaining === 0) return REMINDER_TIERS.ON_EXPIRY;
  if (daysRemaining === 7) return REMINDER_TIERS.DAYS_7;
  if (daysRemaining === 30) return REMINDER_TIERS.DAYS_30;
  if (daysRemaining === 60) return REMINDER_TIERS.DAYS_60;
  return null;
}

export function buildReminderMessage(
  agencyName: string,
  licenseNumber: string,
  expiryDate: Date,
  daysRemaining: number,
  tier: ReminderTier
): string {
  const dateStr = expiryDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  switch (tier) {
    case REMINDER_TIERS.DAYS_60:
      return `📋 License Renewal Notice: Your agency license (No. ${licenseNumber}) for ${agencyName} expires in 60 days on ${dateStr}. Plan your renewal early to avoid service interruption. Visit NEA portal to renew.`;

    case REMINDER_TIERS.DAYS_30:
      return `⚠️ License Expiry Reminder: Your agency license (No. ${licenseNumber}) for ${agencyName} expires in 30 days on ${dateStr}. Renew now to avoid suspension. Visit NEA portal or contact NEA at +254 20 2625 244.`;

    case REMINDER_TIERS.DAYS_7:
      return `🚨 URGENT License Expiry: Your agency license (No. ${licenseNumber}) for ${agencyName} expires in 7 days on ${dateStr}. Renew immediately to avoid suspension and legal penalties. Contact NEA: +254 20 2625 244.`;

    case REMINDER_TIERS.ON_EXPIRY:
      return `❌ LICENSE EXPIRED TODAY: Your agency license (No. ${licenseNumber}) for ${agencyName} has expired today (${dateStr}). Operating without a valid license is illegal. Renew immediately at the NEA portal or contact NEA: +254 20 2625 244.`;

    case REMINDER_TIERS.DAYS_AFTER_7:
      return `🔴 FINAL NOTICE - License Overdue: Your agency license (No. ${licenseNumber}) for ${agencyName} expired 7 days ago on ${dateStr}. Your agency listing has been flagged. Renew urgently to restore your status. Contact NEA: +254 20 2625 244.`;

    default:
      return `License reminder for ${agencyName} (No. ${licenseNumber}). Expiry: ${dateStr}. Days remaining: ${daysRemaining}.`;
  }
}

export function getChannelsForPreference(pref: AgencyNotificationPreference): NotificationChannel[] {
  const channels: NotificationChannel[] = [];
  
  if (pref.preferredChannel === NOTIFICATION_CHANNELS.SMS && pref.enableSms) {
    channels.push(NOTIFICATION_CHANNELS.SMS);
  } else if (pref.preferredChannel === NOTIFICATION_CHANNELS.WHATSAPP && pref.enableWhatsapp) {
    channels.push(NOTIFICATION_CHANNELS.WHATSAPP);
  } else if (pref.preferredChannel === NOTIFICATION_CHANNELS.EMAIL && pref.enableEmail) {
    channels.push(NOTIFICATION_CHANNELS.EMAIL);
  }

  if (pref.enableSms && !channels.includes(NOTIFICATION_CHANNELS.SMS)) {
    channels.push(NOTIFICATION_CHANNELS.SMS);
  }
  if (pref.enableWhatsapp && !channels.includes(NOTIFICATION_CHANNELS.WHATSAPP)) {
    channels.push(NOTIFICATION_CHANNELS.WHATSAPP);
  }
  if (pref.enableEmail && !channels.includes(NOTIFICATION_CHANNELS.EMAIL)) {
    channels.push(NOTIFICATION_CHANNELS.EMAIL);
  }

  return channels.length > 0 ? channels : [NOTIFICATION_CHANNELS.SMS];
}

export async function sendWithFallback(
  channels: NotificationChannel[],
  recipient: string,
  message: string
): Promise<NotificationResult> {
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
    channel: channels[channels.length - 1] || NOTIFICATION_CHANNELS.SMS,
    error: "All notification channels failed",
  };
}
