/**
 * Country code that a leading "0" should be interpreted as when normalising.
 * Kenya is the default (unchanged historical behaviour), but South African
 * signups now also route through this file so callers set "ZA" explicitly.
 */
export type PhoneCountry = "KE" | "ZA";

const COUNTRY_TO_PREFIX: Record<PhoneCountry, string> = {
  KE: "254",
  ZA: "27",
};

/**
 * Auto-format a phone number as the user types.
 *
 * Country-aware behaviour:
 *  - KE (default): "07XX" → "2547XX...", cap at 12 digits
 *  - ZA:           "0XX"  → "27XX...",   cap at 11 digits
 *
 * Rules (applied in order):
 *  1. Strip all whitespace and non-digit characters (including "+")
 *  2. If starts with "0" → replace with the country's dialling prefix
 *  3. Cap at the country's max E.164-digit length
 *
 * Examples (KE):
 *   "0712 345 678"     → "254712345678"
 *   "+254712345678"    → "254712345678"
 *   "254712345678"     → "254712345678"
 *
 * Examples (ZA):
 *   "0821234567"       → "27821234567"
 *   "+27821234567"     → "27821234567"
 *   "27821234567"      → "27821234567"
 */
export function formatPhone(raw: string, country: PhoneCountry = "KE"): string {
  const prefix = COUNTRY_TO_PREFIX[country];
  const maxLen = country === "ZA" ? 11 : 12;
  let v = raw.replace(/[^\d]/g, "");
  if (v.startsWith("0")) {
    v = prefix + v.slice(1);
  }
  return v.slice(0, maxLen);
}

/**
 * Detect the country from an already-normalised or partial phone.
 *   "27..."  → "ZA"
 *   "254..." → "KE"
 *   anything else → null (unknown / still typing)
 */
export function detectPhoneCountry(raw: string): PhoneCountry | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.startsWith("27"))  return "ZA";
  if (digits.startsWith("254")) return "KE";
  return null;
}
