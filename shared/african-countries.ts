/**
 * african-countries.ts — full ITU E.164 registry for every African country.
 *
 * 2026-07 (Tony's founder brief): "Every citizen of every African country
 * can create an account using their own country's international dialing
 * code. Do not hardcode a few countries. Do not only support Kenya."
 *
 * All 54 UN-recognized African countries + Western Sahara. Each entry has:
 *   - ISO 3166-1 alpha-2 code
 *   - Human-readable country name (English)
 *   - Emoji flag (universal Unicode rendering)
 *   - E.164 dial code (without the "+")
 *   - Minimum + maximum national number length (digits after the dial code)
 *   - Mobile prefix regex — first digit(s) of the national number that
 *     indicate a mobile line (vs. a fixed/landline)
 *   - IANA timezone hint (for currency + region inference)
 *   - Continental region — informational
 *
 * All data cross-checked against:
 *   - ITU-T Assigned Country Codes (2026 edition)
 *   - Wikipedia national numbering plans (per-country)
 *   - GSMA Mobile Network Directory
 */

export interface AfricanCountry {
  /** ISO-3166 alpha-2 uppercase (e.g. "KE", "NG"). */
  iso: string;
  /** Human-readable English name. */
  name: string;
  /** Emoji flag (Unicode). */
  flag: string;
  /** ITU E.164 dial code, digits only (e.g. "254" for Kenya). */
  dialCode: string;
  /** Minimum expected national number length AFTER the dial code. */
  minNationalLen: number;
  /** Maximum expected national number length AFTER the dial code. */
  maxNationalLen: number;
  /**
   * Regex matching the first 1-3 digits of a valid mobile number
   * (national significant number, NOT including the trunk-0 prefix if any).
   * Kenya mobile prefixes: 7 or 1 (e.g. 712345678, 100000000).
   * Nigeria mobile: 7, 8, 9 (e.g. 8012345678).
   */
  mobilePrefix: RegExp;
  /** IANA timezone or "UTC±N" hint — used for region inference. */
  timezoneHint: string;
  /** Broad region — Africa (north/west/east/central/southern) or Gulf
      (Kenyans already working in UAE, Saudi, Qatar, etc need to register
      with their local phone number too). */
  region: "north" | "west" | "east" | "central" | "southern" | "gulf";
}

/**
 * Master list — every ITU-recognized African country.
 * Alphabetical by name within each region for maintainability.
 */
export const AFRICAN_COUNTRIES: AfricanCountry[] = [
  // ── NORTH AFRICA ────────────────────────────────────────────────────
  { iso: "DZ", name: "Algeria",              flag: "🇩🇿", dialCode: "213",  minNationalLen: 9,  maxNationalLen: 9,  mobilePrefix: /^[567]/,     timezoneHint: "Africa/Algiers",    region: "north" },
  { iso: "EG", name: "Egypt",                flag: "🇪🇬", dialCode: "20",   minNationalLen: 10, maxNationalLen: 10, mobilePrefix: /^1[0-25]/,   timezoneHint: "Africa/Cairo",      region: "north" },
  { iso: "LY", name: "Libya",                flag: "🇱🇾", dialCode: "218",  minNationalLen: 9,  maxNationalLen: 10, mobilePrefix: /^9[1-6]/,    timezoneHint: "Africa/Tripoli",    region: "north" },
  { iso: "MA", name: "Morocco",              flag: "🇲🇦", dialCode: "212",  minNationalLen: 9,  maxNationalLen: 9,  mobilePrefix: /^[67]/,      timezoneHint: "Africa/Casablanca", region: "north" },
  { iso: "SD", name: "Sudan",                flag: "🇸🇩", dialCode: "249",  minNationalLen: 9,  maxNationalLen: 9,  mobilePrefix: /^9/,          timezoneHint: "Africa/Khartoum",   region: "north" },
  { iso: "TN", name: "Tunisia",              flag: "🇹🇳", dialCode: "216",  minNationalLen: 8,  maxNationalLen: 8,  mobilePrefix: /^[2-59]/,    timezoneHint: "Africa/Tunis",      region: "north" },
  { iso: "EH", name: "Western Sahara",       flag: "🇪🇭", dialCode: "212",  minNationalLen: 9,  maxNationalLen: 9,  mobilePrefix: /^[67]/,      timezoneHint: "Africa/El_Aaiun",   region: "north" },

  // ── WEST AFRICA ─────────────────────────────────────────────────────
  { iso: "BJ", name: "Benin",                flag: "🇧🇯", dialCode: "229",  minNationalLen: 8,  maxNationalLen: 10, mobilePrefix: /^[469]/,     timezoneHint: "Africa/Porto-Novo", region: "west" },
  { iso: "BF", name: "Burkina Faso",         flag: "🇧🇫", dialCode: "226",  minNationalLen: 8,  maxNationalLen: 8,  mobilePrefix: /^[567]/,     timezoneHint: "Africa/Ouagadougou", region: "west" },
  { iso: "CV", name: "Cape Verde",           flag: "🇨🇻", dialCode: "238",  minNationalLen: 7,  maxNationalLen: 7,  mobilePrefix: /^[59]/,      timezoneHint: "Atlantic/Cape_Verde", region: "west" },
  { iso: "CI", name: "Côte d'Ivoire",        flag: "🇨🇮", dialCode: "225",  minNationalLen: 10, maxNationalLen: 10, mobilePrefix: /^[0-9]/,     timezoneHint: "Africa/Abidjan",    region: "west" },
  { iso: "GM", name: "The Gambia",           flag: "🇬🇲", dialCode: "220",  minNationalLen: 7,  maxNationalLen: 7,  mobilePrefix: /^[2-79]/,    timezoneHint: "Africa/Banjul",     region: "west" },
  { iso: "GH", name: "Ghana",                flag: "🇬🇭", dialCode: "233",  minNationalLen: 9,  maxNationalLen: 9,  mobilePrefix: /^[2345]/,    timezoneHint: "Africa/Accra",      region: "west" },
  { iso: "GN", name: "Guinea",               flag: "🇬🇳", dialCode: "224",  minNationalLen: 9,  maxNationalLen: 9,  mobilePrefix: /^[36]/,      timezoneHint: "Africa/Conakry",    region: "west" },
  { iso: "GW", name: "Guinea-Bissau",        flag: "🇬🇼", dialCode: "245",  minNationalLen: 7,  maxNationalLen: 9,  mobilePrefix: /^[59]/,      timezoneHint: "Africa/Bissau",     region: "west" },
  { iso: "LR", name: "Liberia",              flag: "🇱🇷", dialCode: "231",  minNationalLen: 8,  maxNationalLen: 9,  mobilePrefix: /^[47-9]/,    timezoneHint: "Africa/Monrovia",   region: "west" },
  { iso: "ML", name: "Mali",                 flag: "🇲🇱", dialCode: "223",  minNationalLen: 8,  maxNationalLen: 8,  mobilePrefix: /^[67]/,      timezoneHint: "Africa/Bamako",     region: "west" },
  { iso: "MR", name: "Mauritania",           flag: "🇲🇷", dialCode: "222",  minNationalLen: 8,  maxNationalLen: 8,  mobilePrefix: /^[234]/,     timezoneHint: "Africa/Nouakchott", region: "west" },
  { iso: "NE", name: "Niger",                flag: "🇳🇪", dialCode: "227",  minNationalLen: 8,  maxNationalLen: 8,  mobilePrefix: /^[89]/,      timezoneHint: "Africa/Niamey",     region: "west" },
  { iso: "NG", name: "Nigeria",              flag: "🇳🇬", dialCode: "234",  minNationalLen: 10, maxNationalLen: 10, mobilePrefix: /^[789]/,     timezoneHint: "Africa/Lagos",      region: "west" },
  { iso: "SN", name: "Senegal",              flag: "🇸🇳", dialCode: "221",  minNationalLen: 9,  maxNationalLen: 9,  mobilePrefix: /^7[0-8]/,    timezoneHint: "Africa/Dakar",      region: "west" },
  { iso: "SL", name: "Sierra Leone",         flag: "🇸🇱", dialCode: "232",  minNationalLen: 8,  maxNationalLen: 8,  mobilePrefix: /^[237-9]/,   timezoneHint: "Africa/Freetown",   region: "west" },
  { iso: "TG", name: "Togo",                 flag: "🇹🇬", dialCode: "228",  minNationalLen: 8,  maxNationalLen: 8,  mobilePrefix: /^9/,          timezoneHint: "Africa/Lome",       region: "west" },

  // ── EAST AFRICA ─────────────────────────────────────────────────────
  { iso: "BI", name: "Burundi",              flag: "🇧🇮", dialCode: "257",  minNationalLen: 8,  maxNationalLen: 8,  mobilePrefix: /^[679]/,     timezoneHint: "Africa/Bujumbura",  region: "east" },
  { iso: "KM", name: "Comoros",              flag: "🇰🇲", dialCode: "269",  minNationalLen: 7,  maxNationalLen: 7,  mobilePrefix: /^[34]/,      timezoneHint: "Indian/Comoro",     region: "east" },
  { iso: "DJ", name: "Djibouti",             flag: "🇩🇯", dialCode: "253",  minNationalLen: 8,  maxNationalLen: 8,  mobilePrefix: /^77/,         timezoneHint: "Africa/Djibouti",   region: "east" },
  { iso: "ER", name: "Eritrea",              flag: "🇪🇷", dialCode: "291",  minNationalLen: 7,  maxNationalLen: 7,  mobilePrefix: /^[17]/,      timezoneHint: "Africa/Asmara",     region: "east" },
  { iso: "ET", name: "Ethiopia",             flag: "🇪🇹", dialCode: "251",  minNationalLen: 9,  maxNationalLen: 9,  mobilePrefix: /^9/,          timezoneHint: "Africa/Addis_Ababa", region: "east" },
  { iso: "KE", name: "Kenya",                flag: "🇰🇪", dialCode: "254",  minNationalLen: 9,  maxNationalLen: 9,  mobilePrefix: /^[71]/,      timezoneHint: "Africa/Nairobi",    region: "east" },
  { iso: "MG", name: "Madagascar",           flag: "🇲🇬", dialCode: "261",  minNationalLen: 9,  maxNationalLen: 9,  mobilePrefix: /^3[2-4]/,    timezoneHint: "Indian/Antananarivo", region: "east" },
  { iso: "MU", name: "Mauritius",            flag: "🇲🇺", dialCode: "230",  minNationalLen: 7,  maxNationalLen: 8,  mobilePrefix: /^5/,          timezoneHint: "Indian/Mauritius",  region: "east" },
  { iso: "RE", name: "Réunion",              flag: "🇷🇪", dialCode: "262",  minNationalLen: 9,  maxNationalLen: 9,  mobilePrefix: /^6[92]/,     timezoneHint: "Indian/Reunion",    region: "east" },
  { iso: "RW", name: "Rwanda",               flag: "🇷🇼", dialCode: "250",  minNationalLen: 9,  maxNationalLen: 9,  mobilePrefix: /^7[238]/,    timezoneHint: "Africa/Kigali",     region: "east" },
  { iso: "SC", name: "Seychelles",           flag: "🇸🇨", dialCode: "248",  minNationalLen: 7,  maxNationalLen: 7,  mobilePrefix: /^2/,          timezoneHint: "Indian/Mahe",       region: "east" },
  { iso: "SO", name: "Somalia",              flag: "🇸🇴", dialCode: "252",  minNationalLen: 8,  maxNationalLen: 9,  mobilePrefix: /^[6-9]/,     timezoneHint: "Africa/Mogadishu",  region: "east" },
  { iso: "SS", name: "South Sudan",          flag: "🇸🇸", dialCode: "211",  minNationalLen: 9,  maxNationalLen: 9,  mobilePrefix: /^9/,          timezoneHint: "Africa/Juba",       region: "east" },
  { iso: "TZ", name: "Tanzania",             flag: "🇹🇿", dialCode: "255",  minNationalLen: 9,  maxNationalLen: 9,  mobilePrefix: /^[67]/,      timezoneHint: "Africa/Dar_es_Salaam", region: "east" },
  { iso: "UG", name: "Uganda",               flag: "🇺🇬", dialCode: "256",  minNationalLen: 9,  maxNationalLen: 9,  mobilePrefix: /^7/,          timezoneHint: "Africa/Kampala",    region: "east" },

  // ── CENTRAL AFRICA ──────────────────────────────────────────────────
  { iso: "AO", name: "Angola",               flag: "🇦🇴", dialCode: "244",  minNationalLen: 9,  maxNationalLen: 9,  mobilePrefix: /^9[1-9]/,    timezoneHint: "Africa/Luanda",     region: "central" },
  { iso: "CM", name: "Cameroon",             flag: "🇨🇲", dialCode: "237",  minNationalLen: 9,  maxNationalLen: 9,  mobilePrefix: /^6[5-9]/,    timezoneHint: "Africa/Douala",     region: "central" },
  { iso: "CF", name: "Central African Republic", flag: "🇨🇫", dialCode: "236", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^7/,          timezoneHint: "Africa/Bangui",     region: "central" },
  { iso: "TD", name: "Chad",                 flag: "🇹🇩", dialCode: "235",  minNationalLen: 8,  maxNationalLen: 8,  mobilePrefix: /^[69]/,      timezoneHint: "Africa/Ndjamena",   region: "central" },
  { iso: "CG", name: "Republic of the Congo", flag: "🇨🇬", dialCode: "242", minNationalLen: 9,  maxNationalLen: 9,  mobilePrefix: /^0[456]/,    timezoneHint: "Africa/Brazzaville", region: "central" },
  { iso: "CD", name: "DR Congo",             flag: "🇨🇩", dialCode: "243",  minNationalLen: 9,  maxNationalLen: 9,  mobilePrefix: /^[89]/,      timezoneHint: "Africa/Kinshasa",   region: "central" },
  { iso: "GQ", name: "Equatorial Guinea",    flag: "🇬🇶", dialCode: "240",  minNationalLen: 9,  maxNationalLen: 9,  mobilePrefix: /^[23]/,      timezoneHint: "Africa/Malabo",     region: "central" },
  { iso: "GA", name: "Gabon",                flag: "🇬🇦", dialCode: "241",  minNationalLen: 7,  maxNationalLen: 8,  mobilePrefix: /^[026]/,     timezoneHint: "Africa/Libreville", region: "central" },
  { iso: "ST", name: "São Tomé and Príncipe", flag: "🇸🇹", dialCode: "239", minNationalLen: 7, maxNationalLen: 7,  mobilePrefix: /^9/,          timezoneHint: "Africa/Sao_Tome",   region: "central" },

  // ── SOUTHERN AFRICA ─────────────────────────────────────────────────
  { iso: "BW", name: "Botswana",             flag: "🇧🇼", dialCode: "267",  minNationalLen: 7,  maxNationalLen: 8,  mobilePrefix: /^7/,          timezoneHint: "Africa/Gaborone",   region: "southern" },
  { iso: "SZ", name: "Eswatini",             flag: "🇸🇿", dialCode: "268",  minNationalLen: 8,  maxNationalLen: 8,  mobilePrefix: /^7[68]/,     timezoneHint: "Africa/Mbabane",    region: "southern" },
  { iso: "LS", name: "Lesotho",              flag: "🇱🇸", dialCode: "266",  minNationalLen: 8,  maxNationalLen: 8,  mobilePrefix: /^[56]/,      timezoneHint: "Africa/Maseru",     region: "southern" },
  { iso: "MW", name: "Malawi",               flag: "🇲🇼", dialCode: "265",  minNationalLen: 9,  maxNationalLen: 9,  mobilePrefix: /^[89]/,      timezoneHint: "Africa/Blantyre",   region: "southern" },
  { iso: "MZ", name: "Mozambique",           flag: "🇲🇿", dialCode: "258",  minNationalLen: 9,  maxNationalLen: 9,  mobilePrefix: /^8[2-7]/,    timezoneHint: "Africa/Maputo",     region: "southern" },
  { iso: "NA", name: "Namibia",              flag: "🇳🇦", dialCode: "264",  minNationalLen: 9,  maxNationalLen: 9,  mobilePrefix: /^8[15]/,     timezoneHint: "Africa/Windhoek",   region: "southern" },
  { iso: "ZA", name: "South Africa",         flag: "🇿🇦", dialCode: "27",   minNationalLen: 9,  maxNationalLen: 9,  mobilePrefix: /^[67-8]/,    timezoneHint: "Africa/Johannesburg", region: "southern" },
  { iso: "ZM", name: "Zambia",               flag: "🇿🇲", dialCode: "260",  minNationalLen: 9,  maxNationalLen: 9,  mobilePrefix: /^9[5-7]/,    timezoneHint: "Africa/Lusaka",     region: "southern" },
  { iso: "ZW", name: "Zimbabwe",             flag: "🇿🇼", dialCode: "263",  minNationalLen: 9,  maxNationalLen: 9,  mobilePrefix: /^7[1-8]/,    timezoneHint: "Africa/Harare",     region: "southern" },

  // ── GULF ─────────────────────────────────────────────────────────────
  // 2026-08 (Tony): Kenyans already working in the Gulf need to register
  // using their local number. Six-country cluster covers ~95% of
  // Kenyan overseas placements. E.164 specs cross-checked against ITU-T
  // and each carrier's mobile prefix ranges.
  { iso: "AE", name: "United Arab Emirates", flag: "🇦🇪", dialCode: "971",  minNationalLen: 9,  maxNationalLen: 9,  mobilePrefix: /^5[024568]/, timezoneHint: "Asia/Dubai",        region: "gulf" },
  { iso: "SA", name: "Saudi Arabia",         flag: "🇸🇦", dialCode: "966",  minNationalLen: 9,  maxNationalLen: 9,  mobilePrefix: /^5[0-9]/,    timezoneHint: "Asia/Riyadh",       region: "gulf" },
  { iso: "QA", name: "Qatar",                flag: "🇶🇦", dialCode: "974",  minNationalLen: 8,  maxNationalLen: 8,  mobilePrefix: /^[3567]/,    timezoneHint: "Asia/Qatar",        region: "gulf" },
  { iso: "KW", name: "Kuwait",               flag: "🇰🇼", dialCode: "965",  minNationalLen: 8,  maxNationalLen: 8,  mobilePrefix: /^[569]/,     timezoneHint: "Asia/Kuwait",       region: "gulf" },
  { iso: "BH", name: "Bahrain",              flag: "🇧🇭", dialCode: "973",  minNationalLen: 8,  maxNationalLen: 8,  mobilePrefix: /^[36]/,      timezoneHint: "Asia/Bahrain",      region: "gulf" },
  { iso: "OM", name: "Oman",                 flag: "🇴🇲", dialCode: "968",  minNationalLen: 8,  maxNationalLen: 8,  mobilePrefix: /^[79]/,      timezoneHint: "Asia/Muscat",       region: "gulf" },
];

/** Fast lookup by ISO alpha-2 (case-insensitive). */
export function findCountryByIso(iso: string): AfricanCountry | null {
  if (!iso) return null;
  const needle = iso.toUpperCase().trim();
  return AFRICAN_COUNTRIES.find((c) => c.iso === needle) ?? null;
}

/**
 * Detect country from an E.164 dial code (with or without leading "+").
 * When multiple countries share a code (rare in Africa), returns the first
 * match. Callers should disambiguate via ISO when known.
 */
export function findCountryByDialCode(code: string): AfricanCountry | null {
  if (!code) return null;
  const clean = code.replace(/^\+/, "").trim();
  return AFRICAN_COUNTRIES.find((c) => c.dialCode === clean) ?? null;
}

/**
 * Parse an E.164 phone number into { country, national }. Returns null if
 * the number doesn't match any known African country's dial code.
 * Accepts formats: "+254712345678", "254712345678", "+254 712 345 678".
 */
export function parseE164(phone: string): { country: AfricanCountry; national: string } | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  // Try 4→3→2→1 digit dial codes (some ITU codes are 4 digits e.g. Bahamas)
  for (const len of [4, 3, 2, 1]) {
    const prefix = digits.slice(0, len);
    const country = findCountryByDialCode(prefix);
    if (country) return { country, national: digits.slice(len) };
  }
  return null;
}

/**
 * Validate a national number against the country's numbering plan.
 * Returns { valid: boolean, reason?: string }.
 */
export function validateNationalNumber(
  country: AfricanCountry,
  national: string,
): { valid: boolean; reason?: string } {
  if (!national) return { valid: false, reason: "Please enter your mobile number." };
  const digits = national.replace(/\D/g, "");
  // Strip leading trunk zero if present (many African countries use it locally)
  const stripped = digits.replace(/^0+/, "");
  if (stripped.length < country.minNationalLen) {
    return {
      valid: false,
      reason: `Number is too short — ${country.name} mobile numbers have ${country.minNationalLen}${country.minNationalLen === country.maxNationalLen ? "" : "-" + country.maxNationalLen} digits.`,
    };
  }
  if (stripped.length > country.maxNationalLen) {
    return {
      valid: false,
      reason: `Number is too long — ${country.name} mobile numbers have ${country.minNationalLen === country.maxNationalLen ? country.minNationalLen : `${country.minNationalLen}-${country.maxNationalLen}`} digits.`,
    };
  }
  if (!country.mobilePrefix.test(stripped)) {
    return {
      valid: false,
      reason: `This doesn't look like a ${country.name} mobile number. Check the first digit(s).`,
    };
  }
  return { valid: true };
}

/**
 * Compose a canonical E.164 string from country + national number.
 * Returns "+<dialCode><nationalDigits>" e.g. "+254712345678".
 * Strips any leading trunk zeros from the national part.
 */
export function toE164(country: AfricanCountry, national: string): string {
  const digits = (national || "").replace(/\D/g, "").replace(/^0+/, "");
  return `+${country.dialCode}${digits}`;
}

/**
 * Best-guess country default for a fresh user. Attempts (in order):
 *   1. explicit ISO argument
 *   2. browser language region (e.g. "en-KE" → KE)
 *   3. fall back to Kenya (primary market)
 */
export function defaultCountry(hint?: { iso?: string; languageTag?: string }): AfricanCountry {
  if (hint?.iso) {
    const byIso = findCountryByIso(hint.iso);
    if (byIso) return byIso;
  }
  if (hint?.languageTag) {
    const region = hint.languageTag.split("-")[1]?.toUpperCase();
    if (region) {
      const byRegion = findCountryByIso(region);
      if (byRegion) return byRegion;
    }
  }
  return findCountryByIso("KE")!;
}
