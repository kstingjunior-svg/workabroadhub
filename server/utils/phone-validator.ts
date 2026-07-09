/**
 * Phone real-identity validation via Twilio Lookup v2.
 *
 * - Verifies the number is in valid E.164 format
 * - Calls Twilio Lookup to confirm the number is currently active on a carrier
 *   (catches typos, fake numbers, deactivated numbers)
 * - Caches the result for 30 days — carrier info doesn't change often
 *
 * Cost: ~$0.005 per lookup (Twilio pricing as of 2025).
 *
 * Safe degradation: if Twilio credentials are not configured OR Twilio is down,
 * we fall back to format-only validation so signups don't break entirely.
 */

import { pool } from "../db";

const E164_RE = /^\+?[1-9]\d{6,14}$/; // ITU E.164 — country code + 7..15 digits

export type PhoneValidationResult =
  | { valid: true; e164: string; carrier?: string | null; type?: string | null }
  | { valid: false; reason: "format" | "lookup_invalid" | "lookup_failed"; message: string };

interface CarrierCacheRow {
  phone: string;
  valid: boolean;
  carrier_name: string | null;
  line_type: string | null;
  checked_at: Date;
}

/**
 * Normalize a phone to E.164 (+254... or +27...). Accepts:
 *   0712345678       → +254712345678   (Kenya default)
 *   254712345678     → +254712345678
 *   +254712345678    → +254712345678
 *   0821234567 (ZA)  → +27821234567
 *   27821234567      → +27821234567
 *   +27821234567     → +27821234567
 *
 * 2026-07: added South Africa. Country hint defaults to KE so all pre-existing
 * call sites keep their current behaviour. Pass "ZA" when the signup country
 * pick tells us the user is South African.
 */
export function normalizeKenyaPhone(raw: string, country: "KE" | "ZA" = "KE"): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.startsWith("254")) return "+" + digits;
  if (digits.startsWith("27"))  return "+" + digits;
  if (digits.startsWith("0") && digits.length === 10) {
    const prefix = country === "ZA" ? "27" : "254";
    return "+" + prefix + digits.slice(1);
  }
  if (digits.length === 9) {
    const prefix = country === "ZA" ? "27" : "254";
    return "+" + prefix + digits;
  }
  if (digits.startsWith("+")) return raw;
  return raw.startsWith("+") ? raw : "+" + digits;
}

/**
 * Returns true if the format alone passes E.164.
 */
export function isValidFormat(phone: string): boolean {
  return E164_RE.test(phone);
}

/**
 * Get a cached Twilio Lookup result if recent enough.
 * Schema (created by migration): phone_lookups (phone TEXT PRIMARY KEY, valid BOOLEAN,
 * carrier_name TEXT, line_type TEXT, checked_at TIMESTAMPTZ).
 */
async function getCachedLookup(phone: string): Promise<CarrierCacheRow | null> {
  try {
    const { rows } = await pool.query<CarrierCacheRow>(
      `SELECT phone, valid, carrier_name, line_type, checked_at
       FROM phone_lookups
       WHERE phone = $1 AND checked_at > NOW() - INTERVAL '30 days'
       LIMIT 1`,
      [phone],
    );
    return rows[0] ?? null;
  } catch {
    return null; // table may not exist yet (pre-migration) — treat as cache miss
  }
}

async function cacheLookup(
  phone: string,
  valid: boolean,
  carrier: string | null,
  lineType: string | null,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO phone_lookups (phone, valid, carrier_name, line_type, checked_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (phone) DO UPDATE
         SET valid = EXCLUDED.valid,
             carrier_name = EXCLUDED.carrier_name,
             line_type = EXCLUDED.line_type,
             checked_at = NOW()`,
      [phone, valid, carrier, lineType],
    );
  } catch (err: any) {
    console.warn("[phone-validator] cache write failed:", err.message);
  }
}

/**
 * Call Twilio Lookup v2. Returns null if Twilio is not configured.
 */
async function callTwilioLookup(phone: string): Promise<
  { valid: boolean; carrier: string | null; lineType: string | null } | null
> {
  const accountSid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken = (process.env.TWILIO_AUTH_TOKEN || "").trim();
  if (!accountSid || !authToken) return null;

  try {
    const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(
      phone,
    )}?Fields=line_type_intelligence`;
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${credentials}` },
      signal: AbortSignal.timeout(7000),
    });
    if (res.status === 404) {
      // Twilio returns 404 for numbers that don't exist on any carrier
      return { valid: false, carrier: null, lineType: null };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[phone-validator] Twilio lookup non-OK status=${res.status} body=${body.slice(0, 200)}`);
      return null; // network or auth issue — treat as inconclusive
    }
    const data = (await res.json()) as any;
    const lineType = data?.line_type_intelligence?.type ?? null;
    const carrier = data?.line_type_intelligence?.carrier_name ?? null;

    // "type" possible values include: mobile, landline, fixedVoip, nonFixedVoip,
    // tollFree, premium, sharedCost, uan, voicemail, pager, unknown.
    // We treat anything Twilio resolves as valid; only an explicit 404 above is rejected.
    return { valid: true, carrier, lineType };
  } catch (err: any) {
    console.warn("[phone-validator] Twilio lookup error:", err.message);
    return null;
  }
}

export async function validatePhone(rawPhone: string): Promise<PhoneValidationResult> {
  const e164 = normalizeKenyaPhone(rawPhone || "");

  if (!isValidFormat(e164)) {
    return {
      valid: false,
      reason: "format",
      message: "Please enter a valid phone number (e.g. 0712345678 or +254712345678).",
    };
  }

  // 1) Try cache first
  const cached = await getCachedLookup(e164);
  if (cached) {
    if (!cached.valid) {
      return {
        valid: false,
        reason: "lookup_invalid",
        message: "This phone number doesn't appear to be active on any carrier. Please use your real number.",
      };
    }
    return { valid: true, e164, carrier: cached.carrier_name, type: cached.line_type };
  }

  // 2) Live Twilio Lookup
  const lookup = await callTwilioLookup(e164);

  if (lookup === null) {
    // Twilio not configured or transient failure — fail open, accept the number
    // (format already passed). This means new deployments without Twilio still work.
    return { valid: true, e164, carrier: null, type: null };
  }

  await cacheLookup(e164, lookup.valid, lookup.carrier, lookup.lineType);

  if (!lookup.valid) {
    return {
      valid: false,
      reason: "lookup_invalid",
      message: "This phone number doesn't appear to be active on any carrier. Please use your real number.",
    };
  }

  return { valid: true, e164, carrier: lookup.carrier, type: lookup.lineType };
}
