import twilio from 'twilio';

let twilioClient: twilio.Twilio | null = null;

if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  console.log('[WhatsApp] Twilio client initialized');
} else {
  console.warn('[WhatsApp] Twilio credentials missing. WhatsApp features disabled.');
}

export default twilioClient;
