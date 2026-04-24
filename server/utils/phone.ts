/**
 * Normalize a Kenyan (or international) phone number to E.164-style 254XXXXXXXXX.
 *
 * Rules applied in order:
 *  1. Strip all whitespace
 *  2. Strip a leading "+" sign
 *  3. Replace a leading "0" with "254"  (e.g. 0722123456 → 254722123456)
 *
 * Examples:
 *   "0722123456"   → "254722123456"
 *   "+254722123456"→ "254722123456"
 *   "254722123456" → "254722123456"  (already normalised)
 *   "722123456"    → "722123456"     (non-Kenyan, returned as-is after whitespace strip)
 */
export function normalizePhone(raw: string): string {
  return raw
    .replace(/\s+/g, "")   // strip all whitespace
    .replace(/^\+/, "")    // strip leading +
    .replace(/^0/, "254"); // 0XX → 254XX
}

/**
 * Returns true when the input looks like a phone number rather than an email.
 * A simple heuristic: emails always contain "@".
 */
export function isPhoneLike(input: string): boolean {
  return !input.trim().includes("@");
}
