import type { IStorage } from "./storage";
import { REMINDER_TIERS, NOTIFICATION_CHANNELS } from "@shared/schema";
import type { NeaAgency, ReminderTier, NotificationChannel } from "@shared/schema";
import {
  getReminderTierForDays,
  buildReminderMessage,
  getChannelsForPreference,
  sendWithFallback,
  getAdapter,
} from "./license-notification-service";

interface LicenseStatusResult {
  expired: Array<{ id: string; agencyName: string; licenseNumber: string; daysOverdue: number }>;
  expiringSoon: Array<{ id: string; agencyName: string; licenseNumber: string; daysRemaining: number }>;
  expiring60: Array<{ id: string; agencyName: string; licenseNumber: string; daysRemaining: number }>;
  expiring90: Array<{ id: string; agencyName: string; licenseNumber: string; daysRemaining: number }>;
  valid: number;
  total: number;
  checkedAt: Date;
  remindersSent: number;
  remindersFailed: number;
}

let lastCheckResult: LicenseStatusResult | null = null;
let checkInterval: ReturnType<typeof setInterval> | null = null;

const REMINDER_TRIGGER_DAYS = [60, 30, 7, 0, -7];

export async function checkLicenseStatuses(storage: IStorage): Promise<LicenseStatusResult> {
  const agencies = await storage.getNeaAgencies();
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  const result: LicenseStatusResult = {
    expired: [],
    expiringSoon: [],
    expiring60: [],
    expiring90: [],
    valid: 0,
    total: agencies.length,
    checkedAt: now,
    remindersSent: 0,
    remindersFailed: 0,
  };

  const agenciesToRemind: Array<{ agency: NeaAgency; daysRemaining: number; tier: ReminderTier }> = [];

  for (const agency of agencies) {
    const expiryDate = new Date(agency.expiryDate);
    const diffMs = expiryDate.getTime() - now.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (daysRemaining < 0) {
      result.expired.push({
        id: agency.id,
        agencyName: agency.agencyName,
        licenseNumber: agency.licenseNumber,
        daysOverdue: Math.abs(daysRemaining),
      });
    } else if (daysRemaining <= 30) {
      result.expiringSoon.push({
        id: agency.id,
        agencyName: agency.agencyName,
        licenseNumber: agency.licenseNumber,
        daysRemaining,
      });
    } else if (daysRemaining <= 60) {
      result.expiring60.push({
        id: agency.id,
        agencyName: agency.agencyName,
        licenseNumber: agency.licenseNumber,
        daysRemaining,
      });
    } else if (daysRemaining <= 90) {
      result.expiring90.push({
        id: agency.id,
        agencyName: agency.agencyName,
        licenseNumber: agency.licenseNumber,
        daysRemaining,
      });
    } else {
      result.valid++;
    }

    const tier = getReminderTierForDays(daysRemaining);
    if (tier) {
      agenciesToRemind.push({ agency, daysRemaining, tier });
    }
  }

  lastCheckResult = result;

  console.log(
    `[LicenseChecker] Daily check complete: ${result.total} agencies, ` +
    `${result.expired.length} expired, ${result.expiringSoon.length} expiring ≤30d, ` +
    `${result.expiring60.length} expiring 31-60d, ${result.expiring90.length} expiring 61-90d, ` +
    `${result.valid} valid`
  );

  if (agenciesToRemind.length > 0) {
    console.log(`[LicenseChecker] ${agenciesToRemind.length} agencies need reminders today`);
    await processReminders(agenciesToRemind, storage, todayStr);
  }

  console.log(
    `[LicenseChecker] Reminders: ${result.remindersSent} sent, ${result.remindersFailed} failed`
  );

  return result;
}

async function processReminders(
  agencies: Array<{ agency: NeaAgency; daysRemaining: number; tier: ReminderTier }>,
  storage: IStorage,
  todayStr: string
): Promise<void> {
  const result = lastCheckResult!;

  for (const { agency, daysRemaining, tier } of agencies) {
    try {
      const alreadySent = await storage.checkReminderAlreadySent(agency.id, tier, todayStr);
      if (alreadySent) {
        continue;
      }

      const pref = await storage.getAgencyNotificationPreference(agency.id);

      if (pref && !pref.remindersEnabled) {
        continue;
      }

      const contactPhone = pref?.contactPhone || agency.email;
      if (!contactPhone) {
        continue;
      }

      const expiryDate = new Date(agency.expiryDate);
      const message = buildReminderMessage(
        agency.agencyName,
        agency.licenseNumber,
        expiryDate,
        daysRemaining,
        tier
      );

      const channels: NotificationChannel[] = pref
        ? getChannelsForPreference(pref)
        : [NOTIFICATION_CHANNELS.SMS];

      const sendResult = await sendWithFallback(channels, contactPhone, message);

      await storage.createLicenseReminderLog({
        agencyId: agency.id,
        agencyName: agency.agencyName,
        licenseNumber: agency.licenseNumber,
        reminderTier: tier,
        channel: sendResult.channel,
        recipientAddress: contactPhone,
        messageContent: message,
        status: sendResult.success ? "sent" : "failed",
        providerSid: sendResult.providerSid || null,
        errorMessage: sendResult.error || null,
        expiryDate: expiryDate,
        daysRemaining,
        retryCount: 0,
        lastRetryAt: null,
        sentAt: sendResult.success ? new Date() : null,
      });

      if (sendResult.success) {
        result.remindersSent++;
      } else {
        result.remindersFailed++;
        console.log(
          `[LicenseChecker] Failed to notify ${agency.agencyName} (${tier}): ${sendResult.error}`
        );
      }
    } catch (error: any) {
      result.remindersFailed++;
      console.error(
        `[LicenseChecker] Error processing reminder for ${agency.agencyName}:`,
        error.message
      );

      try {
        await storage.createLicenseReminderLog({
          agencyId: agency.id,
          agencyName: agency.agencyName,
          licenseNumber: agency.licenseNumber,
          reminderTier: tier,
          channel: "sms",
          recipientAddress: "unknown",
          messageContent: "",
          status: "failed",
          providerSid: null,
          errorMessage: error.message,
          expiryDate: new Date(agency.expiryDate),
          daysRemaining,
          retryCount: 0,
          lastRetryAt: null,
          sentAt: null,
        });
      } catch {
      }
    }
  }
}

export async function retryFailedReminder(
  logId: string,
  storage: IStorage
): Promise<{ success: boolean; error?: string }> {
  const log = await storage.getLicenseReminderLogById(logId);
  if (!log) {
    return { success: false, error: "Reminder log not found" };
  }

  if (log.status === "sent") {
    return { success: false, error: "Reminder was already sent successfully" };
  }

  try {
    const adapter = getAdapter(log.channel as NotificationChannel);
    const result = await adapter.send(log.recipientAddress, log.messageContent);

    await storage.updateLicenseReminderLog(logId, {
      status: result.success ? "sent" : "failed",
      providerSid: result.providerSid || null,
      errorMessage: result.error || null,
      retryCount: (log.retryCount || 0) + 1,
      lastRetryAt: new Date(),
      sentAt: result.success ? new Date() : null,
    });

    return { success: result.success, error: result.error };
  } catch (error: any) {
    await storage.updateLicenseReminderLog(logId, {
      status: "failed",
      errorMessage: error.message,
      retryCount: (log.retryCount || 0) + 1,
      lastRetryAt: new Date(),
    });
    return { success: false, error: error.message };
  }
}

export function getLastCheckResult(): LicenseStatusResult | null {
  return lastCheckResult;
}

export function startLicenseChecker(storage: IStorage): void {
  if (checkInterval) {
    clearInterval(checkInterval);
  }

  setTimeout(() => {
    checkLicenseStatuses(storage).catch(err => {
      console.error("[LicenseChecker] Initial check failed:", err);
    });
  }, 10000);

  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  checkInterval = setInterval(() => {
    checkLicenseStatuses(storage).catch(err => {
      console.error("[LicenseChecker] Scheduled check failed:", err);
    });
  }, TWENTY_FOUR_HOURS);

  console.log("[LicenseChecker] Daily license check scheduler started (every 24h)");
}

export function stopLicenseChecker(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    console.log("[LicenseChecker] License check scheduler stopped");
  }
}
