/**
 * Auto-format a phone number as the user types.
 *
 * Rules (applied in order):
 *  1. Strip all whitespace and non-digit characters (including "+")
 *  2. If starts with "0"  → replace with "254"  (07XXXXXXXX → 254XXXXXXXX)
 *  3. Cap at 12 digits    → 254 + 9-digit number
 *
 * Examples:
 *   "0712 345 678"     → "254712345678"
 *   "+254712345678"    → "254712345678"
 *   "254712345678"     → "254712345678"
 *   "07"               → "254"  (partial, still typing)
 *   "712345678"        → "712345678"  (non-Kenyan, pass through)
 */
export function formatPhone(raw: string): string {
  let v = raw.replace(/[^\d]/g, "");
  if (v.startsWith("0")) {
    v = "254" + v.slice(1);
  }
  return v.slice(0, 12);
}
