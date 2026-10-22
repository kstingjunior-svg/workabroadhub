/**
 * International phone numbers (2026-10).
 *
 * Tony: "anytime somebody gets to another country and gets a local number,
 * they must be able to change it and keep using our services." The profile
 * used to accept ONLY Kenyan numbers (254 + 9 digits). This module accepts
 * any valid international number while keeping Kenya as the default for
 * local formats (07…, 01…).
 *
 * Storage format (unchanged, so login / payments keep working):
 *   users.phone            digits incl. country code, no "+"  e.g. 96565662953
 *   users.phone_number_e164 "+96565662953"
 *   users.country_iso / dial_code / national_number
 *
 * Shared by server and client so validation is identical on both sides.
 */

export interface DialCountry { iso: string; name: string; code: string; flag: string; min: number; max: number }

/** Destinations our users actually travel to first, then the rest of the world. */
export const DIAL_COUNTRIES: DialCountry[] = [
  { iso: "KE", name: "Kenya",                code: "254", flag: "🇰🇪", min: 9,  max: 9 },
  { iso: "AE", name: "United Arab Emirates", code: "971", flag: "🇦🇪", min: 8,  max: 9 },
  { iso: "SA", name: "Saudi Arabia",         code: "966", flag: "🇸🇦", min: 8,  max: 9 },
  { iso: "QA", name: "Qatar",                code: "974", flag: "🇶🇦", min: 8,  max: 8 },
  { iso: "KW", name: "Kuwait",               code: "965", flag: "🇰🇼", min: 8,  max: 8 },
  { iso: "OM", name: "Oman",                 code: "968", flag: "🇴🇲", min: 8,  max: 8 },
  { iso: "BH", name: "Bahrain",              code: "973", flag: "🇧🇭", min: 8,  max: 8 },
  { iso: "JO", name: "Jordan",               code: "962", flag: "🇯🇴", min: 8,  max: 9 },
  { iso: "LB", name: "Lebanon",              code: "961", flag: "🇱🇧", min: 7,  max: 8 },
  { iso: "GB", name: "United Kingdom",       code: "44",  flag: "🇬🇧", min: 9,  max: 10 },
  { iso: "US", name: "United States / Canada", code: "1", flag: "🇺🇸", min: 10, max: 10 },
  { iso: "DE", name: "Germany",              code: "49",  flag: "🇩🇪", min: 6,  max: 12 },
  { iso: "AU", name: "Australia",            code: "61",  flag: "🇦🇺", min: 9,  max: 9 },
  { iso: "IE", name: "Ireland",              code: "353", flag: "🇮🇪", min: 7,  max: 9 },
  { iso: "PL", name: "Poland",               code: "48",  flag: "🇵🇱", min: 9,  max: 9 },
  { iso: "NL", name: "Netherlands",          code: "31",  flag: "🇳🇱", min: 9,  max: 9 },
  { iso: "FR", name: "France",               code: "33",  flag: "🇫🇷", min: 9,  max: 9 },
  { iso: "IT", name: "Italy",                code: "39",  flag: "🇮🇹", min: 6,  max: 11 },
  { iso: "ES", name: "Spain",                code: "34",  flag: "🇪🇸", min: 9,  max: 9 },
  { iso: "PT", name: "Portugal",             code: "351", flag: "🇵🇹", min: 9,  max: 9 },
  { iso: "BE", name: "Belgium",              code: "32",  flag: "🇧🇪", min: 8,  max: 9 },
  { iso: "CH", name: "Switzerland",          code: "41",  flag: "🇨🇭", min: 9,  max: 9 },
  { iso: "AT", name: "Austria",              code: "43",  flag: "🇦🇹", min: 6,  max: 13 },
  { iso: "SE", name: "Sweden",               code: "46",  flag: "🇸🇪", min: 7,  max: 9 },
  { iso: "NO", name: "Norway",               code: "47",  flag: "🇳🇴", min: 8,  max: 8 },
  { iso: "DK", name: "Denmark",              code: "45",  flag: "🇩🇰", min: 8,  max: 8 },
  { iso: "FI", name: "Finland",              code: "358", flag: "🇫🇮", min: 6,  max: 10 },
  { iso: "GR", name: "Greece",               code: "30",  flag: "🇬🇷", min: 10, max: 10 },
  { iso: "CY", name: "Cyprus",               code: "357", flag: "🇨🇾", min: 8,  max: 8 },
  { iso: "MT", name: "Malta",                code: "356", flag: "🇲🇹", min: 8,  max: 8 },
  { iso: "RO", name: "Romania",              code: "40",  flag: "🇷🇴", min: 9,  max: 9 },
  { iso: "CZ", name: "Czechia",              code: "420", flag: "🇨🇿", min: 9,  max: 9 },
  { iso: "HU", name: "Hungary",              code: "36",  flag: "🇭🇺", min: 8,  max: 9 },
  { iso: "HR", name: "Croatia",              code: "385", flag: "🇭🇷", min: 8,  max: 9 },
  { iso: "LT", name: "Lithuania",            code: "370", flag: "🇱🇹", min: 8,  max: 8 },
  { iso: "LV", name: "Latvia",               code: "371", flag: "🇱🇻", min: 8,  max: 8 },
  { iso: "EE", name: "Estonia",              code: "372", flag: "🇪🇪", min: 7,  max: 8 },
  { iso: "SK", name: "Slovakia",             code: "421", flag: "🇸🇰", min: 9,  max: 9 },
  { iso: "SI", name: "Slovenia",             code: "386", flag: "🇸🇮", min: 8,  max: 8 },
  { iso: "BG", name: "Bulgaria",             code: "359", flag: "🇧🇬", min: 8,  max: 9 },
  { iso: "LU", name: "Luxembourg",           code: "352", flag: "🇱🇺", min: 6,  max: 11 },
  { iso: "IS", name: "Iceland",              code: "354", flag: "🇮🇸", min: 7,  max: 7 },
  { iso: "NZ", name: "New Zealand",          code: "64",  flag: "🇳🇿", min: 8,  max: 10 },
  { iso: "JP", name: "Japan",                code: "81",  flag: "🇯🇵", min: 9,  max: 10 },
  { iso: "KR", name: "South Korea",          code: "82",  flag: "🇰🇷", min: 8,  max: 10 },
  { iso: "CN", name: "China",                code: "86",  flag: "🇨🇳", min: 11, max: 11 },
  { iso: "SG", name: "Singapore",            code: "65",  flag: "🇸🇬", min: 8,  max: 8 },
  { iso: "MY", name: "Malaysia",             code: "60",  flag: "🇲🇾", min: 9,  max: 10 },
  { iso: "HK", name: "Hong Kong",            code: "852", flag: "🇭🇰", min: 8,  max: 8 },
  { iso: "IN", name: "India",                code: "91",  flag: "🇮🇳", min: 10, max: 10 },
  { iso: "TR", name: "Türkiye",              code: "90",  flag: "🇹🇷", min: 10, max: 10 },
  { iso: "IL", name: "Israel",               code: "972", flag: "🇮🇱", min: 8,  max: 9 },
  { iso: "EG", name: "Egypt",                code: "20",  flag: "🇪🇬", min: 9,  max: 10 },
  { iso: "UG", name: "Uganda",               code: "256", flag: "🇺🇬", min: 9,  max: 9 },
  { iso: "TZ", name: "Tanzania",             code: "255", flag: "🇹🇿", min: 9,  max: 9 },
  { iso: "RW", name: "Rwanda",               code: "250", flag: "🇷🇼", min: 9,  max: 9 },
  { iso: "ET", name: "Ethiopia",             code: "251", flag: "🇪🇹", min: 9,  max: 9 },
  { iso: "SO", name: "Somalia",              code: "252", flag: "🇸🇴", min: 7,  max: 9 },
  { iso: "SS", name: "South Sudan",          code: "211", flag: "🇸🇸", min: 9,  max: 9 },
  { iso: "NG", name: "Nigeria",              code: "234", flag: "🇳🇬", min: 10, max: 10 },
  { iso: "GH", name: "Ghana",                code: "233", flag: "🇬🇭", min: 9,  max: 9 },
  { iso: "ZA", name: "South Africa",         code: "27",  flag: "🇿🇦", min: 9,  max: 9 },
];

const BY_CODE = [...DIAL_COUNTRIES].sort((a, b) => b.code.length - a.code.length);

export interface ParsedPhone {
  digits: string;        // country code + national, no "+"
  e164: string;          // "+…"
  iso: string | null;    // null = valid length but unlisted country code
  dialCode: string;
  national: string;
}

export type PhoneParseResult = { ok: true; value: ParsedPhone } | { ok: false; error: string };

/**
 * Parse what a user typed.
 *  - "+965 6566 2953", "00965…"  → international
 *  - "0712 345 678", "712345678" → Kenya (default)
 *  - "254712345678", "96565662953" → already includes a country code
 */
export function parseIntlPhone(raw: string | null | undefined, defaultIso = "KE"): PhoneParseResult {
  const s = String(raw ?? "").trim();
  if (!s) return { ok: false, error: "Enter a phone number." };
  const hasPlus = s.startsWith("+") || s.startsWith("00");
  let d = s.replace(/[^\d]/g, "");
  if (s.startsWith("00")) d = d.slice(2);
  if (!d) return { ok: false, error: "Enter a phone number." };

  const home = DIAL_COUNTRIES.find((c) => c.iso === defaultIso) ?? DIAL_COUNTRIES[0];
  // Local formats (no +): 07…/01… or 9-digit Kenyan subscriber numbers.
  if (!hasPlus) {
    if (d.startsWith("0")) d = home.code + d.slice(1);
    else if (d.length === home.max && !BY_CODE.some((c) => d.startsWith(c.code) && d.length - c.code.length >= c.min)) d = home.code + d;
  }
  if (d.length < 8 || d.length > 15) {
    return { ok: false, error: "That number is too short or too long. Include your country code, e.g. +965 6566 2953." };
  }
  const country = BY_CODE.find((c) => d.startsWith(c.code));
  if (country) {
    const national = d.slice(country.code.length).replace(/^0+/, "");
    if (national.length < country.min || national.length > country.max) {
      return { ok: false, error: `A ${country.name} number has ${country.min === country.max ? country.min : `${country.min}–${country.max}`} digits after +${country.code}.` };
    }
    const digits = country.code + national;
    return { ok: true, value: { digits, e164: `+${digits}`, iso: country.iso, dialCode: country.code, national } };
  }
  // Unlisted code: accept a plausible E.164 number when the user typed "+".
  if (!hasPlus) return { ok: false, error: "Add your country code with a + in front, e.g. +965 6566 2953." };
  return { ok: true, value: { digits: d, e164: `+${d}`, iso: null, dialCode: "", national: d } };
}
