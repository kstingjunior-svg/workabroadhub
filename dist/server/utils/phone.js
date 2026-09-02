"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePhone = normalizePhone;
exports.isPhoneLike = isPhoneLike;
/**
 * Normalize a phone number to E.164-style digits (no leading +).
 *
 * 2026-07: added South Africa (+27) support alongside Kenya (+254) so SA
 * signups work. A leading "0" is now interpreted per the country hint —
 * defaulting to Kenya when omitted so all pre-existing call sites keep
 * their original behaviour.
 *
 * Rules applied in order:
 *  1. Strip all whitespace
 *  2. Strip a leading "+" sign
 *  3. If it already starts with a known country prefix (254, 27), keep it
 *  4. Otherwise a leading "0" becomes the country's prefix (Kenya default)
 *
 * Examples:
 *   "0722123456"      → "254722123456"                (default country = KE)
 *   "+27821234567"    → "27821234567"                 (SA, prefix preserved)
 *   "0821234567", "ZA" → "27821234567"                 (SA, leading 0 hint)
 *   "254722123456"    → "254722123456"                (already normalised)
 *   "722123456"       → "722123456"                   (unknown, no change)
 */
function normalizePhone(raw, country = "KE") {
    const stripped = raw.replace(/\s+/g, "").replace(/^\+/, "");
    if (stripped.startsWith("254"))
        return stripped;
    if (stripped.startsWith("27"))
        return stripped;
    const prefix = country === "ZA" ? "27" : "254";
    return stripped.replace(/^0/, prefix);
}
/**
 * Returns true when the input looks like a phone number rather than an email.
 * A simple heuristic: emails always contain "@".
 */
function isPhoneLike(input) {
    return !input.trim().includes("@");
}
