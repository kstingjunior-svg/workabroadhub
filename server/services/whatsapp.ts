import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN,
);

// Strip any existing "whatsapp:" prefix then always re-add it.
// Handles env vars set as "+14155238886" OR "whatsapp:+14155238886".
const raw  = (process.env.TWILIO_WHATSAPP_NUMBER ?? "+14155238886").trim();
const FROM = `whatsapp:${raw.replace(/^whatsapp:/i, "")}`;

/**
 * Send a WhatsApp message via Twilio.
 *
 * @param phone  Recipient phone in any reasonable format:
 *               "254712345678", "+254712345678", or "whatsapp:+254712345678".
 *               The function normalises all three to "whatsapp:+254712345678".
 * @param message  Plain-text body (or Twilio-approved template string).
 */
export async function sendWhatsApp(phone: string, message: string): Promise<void> {
  const normalized = phone.trim().replace(/^whatsapp:/i, "").replace(/^\+/, "");
  const to = `whatsapp:+${normalized}`;
  try {
    await client.messages.create({ from: FROM, to, body: message });
    console.log(`[WhatsApp] Sent to ${to}`);
  } catch (err: any) {
    console.error(`[WhatsApp] Send failed to ${to}:`, err?.message ?? err);
  }
}
