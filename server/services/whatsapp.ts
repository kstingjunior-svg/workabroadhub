import twilio from "twilio";

// Restored Batch H: the migration replaced this file with a stub that no
// longer exported sendWhatsApp, breaking imports in 5 modules
// (ai/router.ts, license-notification-service.ts, schedulers/reEngagement.ts,
// wa-followup-scheduler.ts, whatsapp-queue.ts).

let twilioClient: twilio.Twilio | null = null;

if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
  console.log("[WhatsApp] Twilio client initialized");
} else {
  console.warn(
    "[WhatsApp] Twilio credentials missing. WhatsApp features disabled."
  );
}

const fromRaw = (process.env.TWILIO_WHATSAPP_NUMBER ?? "+14155238886").trim();
const FROM = `whatsapp:${fromRaw.replace(/^whatsapp:/i, "")}`;

export async function sendWhatsApp(
  phone: string,
  message: string
): Promise<void> {
  if (!twilioClient) {
    console.warn(
      `[WhatsApp] Skipped send to ${phone} \u2014 Twilio not configured.`
    );
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
  } catch (err: any) {
    console.error(
      `[WhatsApp] Send failed to ${to}:`,
      err?.message ?? err
    );
  }
}

export default twilioClient;
