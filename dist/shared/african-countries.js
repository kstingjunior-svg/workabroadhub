"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AFRICAN_COUNTRIES = void 0;
exports.findCountryByIso = findCountryByIso;
exports.findCountryByDialCode = findCountryByDialCode;
exports.parseE164 = parseE164;
exports.validateNationalNumber = validateNationalNumber;
exports.toE164 = toE164;
exports.defaultCountry = defaultCountry;
/**
 * Master list — every ITU-recognized African country.
 * Alphabetical by name within each region for maintainability.
 */
exports.AFRICAN_COUNTRIES = [
    // ── NORTH AFRICA ────────────────────────────────────────────────────
    { iso: "DZ", name: "Algeria", flag: "🇩🇿", dialCode: "213", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^[567]/, timezoneHint: "Africa/Algiers", region: "north" },
    { iso: "EG", name: "Egypt", flag: "🇪🇬", dialCode: "20", minNationalLen: 10, maxNationalLen: 10, mobilePrefix: /^1[0-25]/, timezoneHint: "Africa/Cairo", region: "north" },
    { iso: "LY", name: "Libya", flag: "🇱🇾", dialCode: "218", minNationalLen: 9, maxNationalLen: 10, mobilePrefix: /^9[1-6]/, timezoneHint: "Africa/Tripoli", region: "north" },
    { iso: "MA", name: "Morocco", flag: "🇲🇦", dialCode: "212", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^[67]/, timezoneHint: "Africa/Casablanca", region: "north" },
    { iso: "SD", name: "Sudan", flag: "🇸🇩", dialCode: "249", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^9/, timezoneHint: "Africa/Khartoum", region: "north" },
    { iso: "TN", name: "Tunisia", flag: "🇹🇳", dialCode: "216", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^[2-59]/, timezoneHint: "Africa/Tunis", region: "north" },
    { iso: "EH", name: "Western Sahara", flag: "🇪🇭", dialCode: "212", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^[67]/, timezoneHint: "Africa/El_Aaiun", region: "north" },
    // ── WEST AFRICA ─────────────────────────────────────────────────────
    { iso: "BJ", name: "Benin", flag: "🇧🇯", dialCode: "229", minNationalLen: 8, maxNationalLen: 10, mobilePrefix: /^[469]/, timezoneHint: "Africa/Porto-Novo", region: "west" },
    { iso: "BF", name: "Burkina Faso", flag: "🇧🇫", dialCode: "226", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^[567]/, timezoneHint: "Africa/Ouagadougou", region: "west" },
    { iso: "CV", name: "Cape Verde", flag: "🇨🇻", dialCode: "238", minNationalLen: 7, maxNationalLen: 7, mobilePrefix: /^[59]/, timezoneHint: "Atlantic/Cape_Verde", region: "west" },
    { iso: "CI", name: "Côte d'Ivoire", flag: "🇨🇮", dialCode: "225", minNationalLen: 10, maxNationalLen: 10, mobilePrefix: /^[0-9]/, timezoneHint: "Africa/Abidjan", region: "west" },
    { iso: "GM", name: "The Gambia", flag: "🇬🇲", dialCode: "220", minNationalLen: 7, maxNationalLen: 7, mobilePrefix: /^[2-79]/, timezoneHint: "Africa/Banjul", region: "west" },
    { iso: "GH", name: "Ghana", flag: "🇬🇭", dialCode: "233", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^[2345]/, timezoneHint: "Africa/Accra", region: "west" },
    { iso: "GN", name: "Guinea", flag: "🇬🇳", dialCode: "224", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^[36]/, timezoneHint: "Africa/Conakry", region: "west" },
    { iso: "GW", name: "Guinea-Bissau", flag: "🇬🇼", dialCode: "245", minNationalLen: 7, maxNationalLen: 9, mobilePrefix: /^[59]/, timezoneHint: "Africa/Bissau", region: "west" },
    { iso: "LR", name: "Liberia", flag: "🇱🇷", dialCode: "231", minNationalLen: 8, maxNationalLen: 9, mobilePrefix: /^[47-9]/, timezoneHint: "Africa/Monrovia", region: "west" },
    { iso: "ML", name: "Mali", flag: "🇲🇱", dialCode: "223", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^[67]/, timezoneHint: "Africa/Bamako", region: "west" },
    { iso: "MR", name: "Mauritania", flag: "🇲🇷", dialCode: "222", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^[234]/, timezoneHint: "Africa/Nouakchott", region: "west" },
    { iso: "NE", name: "Niger", flag: "🇳🇪", dialCode: "227", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^[89]/, timezoneHint: "Africa/Niamey", region: "west" },
    { iso: "NG", name: "Nigeria", flag: "🇳🇬", dialCode: "234", minNationalLen: 10, maxNationalLen: 10, mobilePrefix: /^[789]/, timezoneHint: "Africa/Lagos", region: "west" },
    { iso: "SN", name: "Senegal", flag: "🇸🇳", dialCode: "221", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^7[0-8]/, timezoneHint: "Africa/Dakar", region: "west" },
    { iso: "SL", name: "Sierra Leone", flag: "🇸🇱", dialCode: "232", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^[237-9]/, timezoneHint: "Africa/Freetown", region: "west" },
    { iso: "TG", name: "Togo", flag: "🇹🇬", dialCode: "228", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^9/, timezoneHint: "Africa/Lome", region: "west" },
    // ── EAST AFRICA ─────────────────────────────────────────────────────
    { iso: "BI", name: "Burundi", flag: "🇧🇮", dialCode: "257", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^[679]/, timezoneHint: "Africa/Bujumbura", region: "east" },
    { iso: "KM", name: "Comoros", flag: "🇰🇲", dialCode: "269", minNationalLen: 7, maxNationalLen: 7, mobilePrefix: /^[34]/, timezoneHint: "Indian/Comoro", region: "east" },
    { iso: "DJ", name: "Djibouti", flag: "🇩🇯", dialCode: "253", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^77/, timezoneHint: "Africa/Djibouti", region: "east" },
    { iso: "ER", name: "Eritrea", flag: "🇪🇷", dialCode: "291", minNationalLen: 7, maxNationalLen: 7, mobilePrefix: /^[17]/, timezoneHint: "Africa/Asmara", region: "east" },
    { iso: "ET", name: "Ethiopia", flag: "🇪🇹", dialCode: "251", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^9/, timezoneHint: "Africa/Addis_Ababa", region: "east" },
    { iso: "KE", name: "Kenya", flag: "🇰🇪", dialCode: "254", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^[71]/, timezoneHint: "Africa/Nairobi", region: "east" },
    { iso: "MG", name: "Madagascar", flag: "🇲🇬", dialCode: "261", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^3[2-4]/, timezoneHint: "Indian/Antananarivo", region: "east" },
    { iso: "MU", name: "Mauritius", flag: "🇲🇺", dialCode: "230", minNationalLen: 7, maxNationalLen: 8, mobilePrefix: /^5/, timezoneHint: "Indian/Mauritius", region: "east" },
    { iso: "RE", name: "Réunion", flag: "🇷🇪", dialCode: "262", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^6[92]/, timezoneHint: "Indian/Reunion", region: "east" },
    { iso: "RW", name: "Rwanda", flag: "🇷🇼", dialCode: "250", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^7[238]/, timezoneHint: "Africa/Kigali", region: "east" },
    { iso: "SC", name: "Seychelles", flag: "🇸🇨", dialCode: "248", minNationalLen: 7, maxNationalLen: 7, mobilePrefix: /^2/, timezoneHint: "Indian/Mahe", region: "east" },
    { iso: "SO", name: "Somalia", flag: "🇸🇴", dialCode: "252", minNationalLen: 8, maxNationalLen: 9, mobilePrefix: /^[6-9]/, timezoneHint: "Africa/Mogadishu", region: "east" },
    { iso: "SS", name: "South Sudan", flag: "🇸🇸", dialCode: "211", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^9/, timezoneHint: "Africa/Juba", region: "east" },
    { iso: "TZ", name: "Tanzania", flag: "🇹🇿", dialCode: "255", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^[67]/, timezoneHint: "Africa/Dar_es_Salaam", region: "east" },
    { iso: "UG", name: "Uganda", flag: "🇺🇬", dialCode: "256", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^7/, timezoneHint: "Africa/Kampala", region: "east" },
    // ── CENTRAL AFRICA ──────────────────────────────────────────────────
    { iso: "AO", name: "Angola", flag: "🇦🇴", dialCode: "244", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^9[1-9]/, timezoneHint: "Africa/Luanda", region: "central" },
    { iso: "CM", name: "Cameroon", flag: "🇨🇲", dialCode: "237", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^6[5-9]/, timezoneHint: "Africa/Douala", region: "central" },
    { iso: "CF", name: "Central African Republic", flag: "🇨🇫", dialCode: "236", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^7/, timezoneHint: "Africa/Bangui", region: "central" },
    { iso: "TD", name: "Chad", flag: "🇹🇩", dialCode: "235", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^[69]/, timezoneHint: "Africa/Ndjamena", region: "central" },
    { iso: "CG", name: "Republic of the Congo", flag: "🇨🇬", dialCode: "242", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^0[456]/, timezoneHint: "Africa/Brazzaville", region: "central" },
    { iso: "CD", name: "DR Congo", flag: "🇨🇩", dialCode: "243", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^[89]/, timezoneHint: "Africa/Kinshasa", region: "central" },
    { iso: "GQ", name: "Equatorial Guinea", flag: "🇬🇶", dialCode: "240", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^[23]/, timezoneHint: "Africa/Malabo", region: "central" },
    { iso: "GA", name: "Gabon", flag: "🇬🇦", dialCode: "241", minNationalLen: 7, maxNationalLen: 8, mobilePrefix: /^[026]/, timezoneHint: "Africa/Libreville", region: "central" },
    { iso: "ST", name: "São Tomé and Príncipe", flag: "🇸🇹", dialCode: "239", minNationalLen: 7, maxNationalLen: 7, mobilePrefix: /^9/, timezoneHint: "Africa/Sao_Tome", region: "central" },
    // ── SOUTHERN AFRICA ─────────────────────────────────────────────────
    { iso: "BW", name: "Botswana", flag: "🇧🇼", dialCode: "267", minNationalLen: 7, maxNationalLen: 8, mobilePrefix: /^7/, timezoneHint: "Africa/Gaborone", region: "southern" },
    { iso: "SZ", name: "Eswatini", flag: "🇸🇿", dialCode: "268", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^7[68]/, timezoneHint: "Africa/Mbabane", region: "southern" },
    { iso: "LS", name: "Lesotho", flag: "🇱🇸", dialCode: "266", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^[56]/, timezoneHint: "Africa/Maseru", region: "southern" },
    { iso: "MW", name: "Malawi", flag: "🇲🇼", dialCode: "265", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^[89]/, timezoneHint: "Africa/Blantyre", region: "southern" },
    { iso: "MZ", name: "Mozambique", flag: "🇲🇿", dialCode: "258", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^8[2-7]/, timezoneHint: "Africa/Maputo", region: "southern" },
    { iso: "NA", name: "Namibia", flag: "🇳🇦", dialCode: "264", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^8[15]/, timezoneHint: "Africa/Windhoek", region: "southern" },
    { iso: "ZA", name: "South Africa", flag: "🇿🇦", dialCode: "27", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^[67-8]/, timezoneHint: "Africa/Johannesburg", region: "southern" },
    { iso: "ZM", name: "Zambia", flag: "🇿🇲", dialCode: "260", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^9[5-7]/, timezoneHint: "Africa/Lusaka", region: "southern" },
    { iso: "ZW", name: "Zimbabwe", flag: "🇿🇼", dialCode: "263", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^7[1-8]/, timezoneHint: "Africa/Harare", region: "southern" },
    // ── GULF ─────────────────────────────────────────────────────────────
    // 2026-08 (Tony): Kenyans already working in the Gulf need to register
    // using their local number. Six-country cluster covers ~95% of
    // Kenyan overseas placements. E.164 specs cross-checked against ITU-T
    // and each carrier's mobile prefix ranges.
    { iso: "AE", name: "United Arab Emirates", flag: "🇦🇪", dialCode: "971", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^5[024568]/, timezoneHint: "Asia/Dubai", region: "gulf" },
    { iso: "SA", name: "Saudi Arabia", flag: "🇸🇦", dialCode: "966", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^5[0-9]/, timezoneHint: "Asia/Riyadh", region: "gulf" },
    { iso: "QA", name: "Qatar", flag: "🇶🇦", dialCode: "974", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^[3567]/, timezoneHint: "Asia/Qatar", region: "gulf" },
    { iso: "KW", name: "Kuwait", flag: "🇰🇼", dialCode: "965", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^[569]/, timezoneHint: "Asia/Kuwait", region: "gulf" },
    { iso: "BH", name: "Bahrain", flag: "🇧🇭", dialCode: "973", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^[36]/, timezoneHint: "Asia/Bahrain", region: "gulf" },
    { iso: "OM", name: "Oman", flag: "🇴🇲", dialCode: "968", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^[79]/, timezoneHint: "Asia/Muscat", region: "gulf" },
    // ── EUROPE ───────────────────────────────────────────────────────────
    // 2026-08 (Tony): global expansion. Diaspora professionals working
    // anywhere should be able to register with their local number.
    // mobilePrefix regex uses /^\d/ where local carrier data varies —
    // length validation catches the common typos, phone-code OTP catches
    // the rest.
    { iso: "GB", name: "United Kingdom", flag: "🇬🇧", dialCode: "44", minNationalLen: 9, maxNationalLen: 10, mobilePrefix: /^7/, timezoneHint: "Europe/London", region: "europe" },
    { iso: "IE", name: "Ireland", flag: "🇮🇪", dialCode: "353", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^8[3-9]/, timezoneHint: "Europe/Dublin", region: "europe" },
    { iso: "FR", name: "France", flag: "🇫🇷", dialCode: "33", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^[67]/, timezoneHint: "Europe/Paris", region: "europe" },
    { iso: "DE", name: "Germany", flag: "🇩🇪", dialCode: "49", minNationalLen: 10, maxNationalLen: 11, mobilePrefix: /^1[5-7]/, timezoneHint: "Europe/Berlin", region: "europe" },
    { iso: "NL", name: "Netherlands", flag: "🇳🇱", dialCode: "31", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^6/, timezoneHint: "Europe/Amsterdam", region: "europe" },
    { iso: "BE", name: "Belgium", flag: "🇧🇪", dialCode: "32", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^4[5-9]/, timezoneHint: "Europe/Brussels", region: "europe" },
    { iso: "LU", name: "Luxembourg", flag: "🇱🇺", dialCode: "352", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^6[269]/, timezoneHint: "Europe/Luxembourg", region: "europe" },
    { iso: "CH", name: "Switzerland", flag: "🇨🇭", dialCode: "41", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^7[5-9]/, timezoneHint: "Europe/Zurich", region: "europe" },
    { iso: "AT", name: "Austria", flag: "🇦🇹", dialCode: "43", minNationalLen: 10, maxNationalLen: 11, mobilePrefix: /^6[5-9]/, timezoneHint: "Europe/Vienna", region: "europe" },
    { iso: "IT", name: "Italy", flag: "🇮🇹", dialCode: "39", minNationalLen: 9, maxNationalLen: 10, mobilePrefix: /^3/, timezoneHint: "Europe/Rome", region: "europe" },
    { iso: "ES", name: "Spain", flag: "🇪🇸", dialCode: "34", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^[67]/, timezoneHint: "Europe/Madrid", region: "europe" },
    { iso: "PT", name: "Portugal", flag: "🇵🇹", dialCode: "351", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^9[1236]/, timezoneHint: "Europe/Lisbon", region: "europe" },
    { iso: "GR", name: "Greece", flag: "🇬🇷", dialCode: "30", minNationalLen: 10, maxNationalLen: 10, mobilePrefix: /^69/, timezoneHint: "Europe/Athens", region: "europe" },
    { iso: "PL", name: "Poland", flag: "🇵🇱", dialCode: "48", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^[5-8]/, timezoneHint: "Europe/Warsaw", region: "europe" },
    { iso: "CZ", name: "Czechia", flag: "🇨🇿", dialCode: "420", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^[67]/, timezoneHint: "Europe/Prague", region: "europe" },
    { iso: "SK", name: "Slovakia", flag: "🇸🇰", dialCode: "421", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^9/, timezoneHint: "Europe/Bratislava", region: "europe" },
    { iso: "HU", name: "Hungary", flag: "🇭🇺", dialCode: "36", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^[27]/, timezoneHint: "Europe/Budapest", region: "europe" },
    { iso: "RO", name: "Romania", flag: "🇷🇴", dialCode: "40", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^7/, timezoneHint: "Europe/Bucharest", region: "europe" },
    { iso: "BG", name: "Bulgaria", flag: "🇧🇬", dialCode: "359", minNationalLen: 8, maxNationalLen: 9, mobilePrefix: /^8[7-9]/, timezoneHint: "Europe/Sofia", region: "europe" },
    { iso: "HR", name: "Croatia", flag: "🇭🇷", dialCode: "385", minNationalLen: 8, maxNationalLen: 9, mobilePrefix: /^9/, timezoneHint: "Europe/Zagreb", region: "europe" },
    { iso: "SI", name: "Slovenia", flag: "🇸🇮", dialCode: "386", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^[34]/, timezoneHint: "Europe/Ljubljana", region: "europe" },
    { iso: "RS", name: "Serbia", flag: "🇷🇸", dialCode: "381", minNationalLen: 8, maxNationalLen: 10, mobilePrefix: /^6/, timezoneHint: "Europe/Belgrade", region: "europe" },
    { iso: "BA", name: "Bosnia and Herzegovina", flag: "🇧🇦", dialCode: "387", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^6/, timezoneHint: "Europe/Sarajevo", region: "europe" },
    { iso: "ME", name: "Montenegro", flag: "🇲🇪", dialCode: "382", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^6[7-9]/, timezoneHint: "Europe/Podgorica", region: "europe" },
    { iso: "MK", name: "North Macedonia", flag: "🇲🇰", dialCode: "389", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^7/, timezoneHint: "Europe/Skopje", region: "europe" },
    { iso: "AL", name: "Albania", flag: "🇦🇱", dialCode: "355", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^6/, timezoneHint: "Europe/Tirane", region: "europe" },
    { iso: "XK", name: "Kosovo", flag: "🇽🇰", dialCode: "383", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^4/, timezoneHint: "Europe/Belgrade", region: "europe" },
    { iso: "TR", name: "Turkey", flag: "🇹🇷", dialCode: "90", minNationalLen: 10, maxNationalLen: 10, mobilePrefix: /^5/, timezoneHint: "Europe/Istanbul", region: "europe" },
    { iso: "CY", name: "Cyprus", flag: "🇨🇾", dialCode: "357", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^9/, timezoneHint: "Asia/Nicosia", region: "europe" },
    { iso: "MT", name: "Malta", flag: "🇲🇹", dialCode: "356", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^[79]/, timezoneHint: "Europe/Malta", region: "europe" },
    { iso: "DK", name: "Denmark", flag: "🇩🇰", dialCode: "45", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^[2-9]/, timezoneHint: "Europe/Copenhagen", region: "europe" },
    { iso: "SE", name: "Sweden", flag: "🇸🇪", dialCode: "46", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^7[0236]/, timezoneHint: "Europe/Stockholm", region: "europe" },
    { iso: "NO", name: "Norway", flag: "🇳🇴", dialCode: "47", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^[49]/, timezoneHint: "Europe/Oslo", region: "europe" },
    { iso: "FI", name: "Finland", flag: "🇫🇮", dialCode: "358", minNationalLen: 9, maxNationalLen: 10, mobilePrefix: /^4[0-9]|^50/, timezoneHint: "Europe/Helsinki", region: "europe" },
    { iso: "IS", name: "Iceland", flag: "🇮🇸", dialCode: "354", minNationalLen: 7, maxNationalLen: 7, mobilePrefix: /^[678]/, timezoneHint: "Atlantic/Reykjavik", region: "europe" },
    { iso: "EE", name: "Estonia", flag: "🇪🇪", dialCode: "372", minNationalLen: 7, maxNationalLen: 8, mobilePrefix: /^5/, timezoneHint: "Europe/Tallinn", region: "europe" },
    { iso: "LV", name: "Latvia", flag: "🇱🇻", dialCode: "371", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^2/, timezoneHint: "Europe/Riga", region: "europe" },
    { iso: "LT", name: "Lithuania", flag: "🇱🇹", dialCode: "370", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^6/, timezoneHint: "Europe/Vilnius", region: "europe" },
    { iso: "RU", name: "Russia", flag: "🇷🇺", dialCode: "7", minNationalLen: 10, maxNationalLen: 10, mobilePrefix: /^9/, timezoneHint: "Europe/Moscow", region: "europe" },
    { iso: "UA", name: "Ukraine", flag: "🇺🇦", dialCode: "380", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^[6-9]/, timezoneHint: "Europe/Kyiv", region: "europe" },
    { iso: "BY", name: "Belarus", flag: "🇧🇾", dialCode: "375", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^[2-4]/, timezoneHint: "Europe/Minsk", region: "europe" },
    { iso: "MD", name: "Moldova", flag: "🇲🇩", dialCode: "373", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^[67]/, timezoneHint: "Europe/Chisinau", region: "europe" },
    { iso: "GE", name: "Georgia", flag: "🇬🇪", dialCode: "995", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^5/, timezoneHint: "Asia/Tbilisi", region: "europe" },
    { iso: "AM", name: "Armenia", flag: "🇦🇲", dialCode: "374", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^[49]/, timezoneHint: "Asia/Yerevan", region: "europe" },
    { iso: "AZ", name: "Azerbaijan", flag: "🇦🇿", dialCode: "994", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^[45]/, timezoneHint: "Asia/Baku", region: "europe" },
    // ── ASIA ─────────────────────────────────────────────────────────────
    { iso: "CN", name: "China", flag: "🇨🇳", dialCode: "86", minNationalLen: 11, maxNationalLen: 11, mobilePrefix: /^1/, timezoneHint: "Asia/Shanghai", region: "asia" },
    { iso: "JP", name: "Japan", flag: "🇯🇵", dialCode: "81", minNationalLen: 10, maxNationalLen: 10, mobilePrefix: /^[789]0/, timezoneHint: "Asia/Tokyo", region: "asia" },
    { iso: "KR", name: "South Korea", flag: "🇰🇷", dialCode: "82", minNationalLen: 9, maxNationalLen: 10, mobilePrefix: /^1/, timezoneHint: "Asia/Seoul", region: "asia" },
    { iso: "TW", name: "Taiwan", flag: "🇹🇼", dialCode: "886", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^9/, timezoneHint: "Asia/Taipei", region: "asia" },
    { iso: "HK", name: "Hong Kong", flag: "🇭🇰", dialCode: "852", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^[569]/, timezoneHint: "Asia/Hong_Kong", region: "asia" },
    { iso: "MO", name: "Macao", flag: "🇲🇴", dialCode: "853", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^6/, timezoneHint: "Asia/Macau", region: "asia" },
    { iso: "MN", name: "Mongolia", flag: "🇲🇳", dialCode: "976", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^[89]/, timezoneHint: "Asia/Ulaanbaatar", region: "asia" },
    { iso: "VN", name: "Vietnam", flag: "🇻🇳", dialCode: "84", minNationalLen: 9, maxNationalLen: 10, mobilePrefix: /^[35789]/, timezoneHint: "Asia/Ho_Chi_Minh", region: "asia" },
    { iso: "TH", name: "Thailand", flag: "🇹🇭", dialCode: "66", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^[689]/, timezoneHint: "Asia/Bangkok", region: "asia" },
    { iso: "KH", name: "Cambodia", flag: "🇰🇭", dialCode: "855", minNationalLen: 8, maxNationalLen: 9, mobilePrefix: /^[1-9]/, timezoneHint: "Asia/Phnom_Penh", region: "asia" },
    { iso: "LA", name: "Laos", flag: "🇱🇦", dialCode: "856", minNationalLen: 8, maxNationalLen: 10, mobilePrefix: /^2[0-9]/, timezoneHint: "Asia/Vientiane", region: "asia" },
    { iso: "MM", name: "Myanmar", flag: "🇲🇲", dialCode: "95", minNationalLen: 8, maxNationalLen: 10, mobilePrefix: /^9/, timezoneHint: "Asia/Yangon", region: "asia" },
    { iso: "MY", name: "Malaysia", flag: "🇲🇾", dialCode: "60", minNationalLen: 9, maxNationalLen: 10, mobilePrefix: /^1/, timezoneHint: "Asia/Kuala_Lumpur", region: "asia" },
    { iso: "SG", name: "Singapore", flag: "🇸🇬", dialCode: "65", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^[89]/, timezoneHint: "Asia/Singapore", region: "asia" },
    { iso: "ID", name: "Indonesia", flag: "🇮🇩", dialCode: "62", minNationalLen: 9, maxNationalLen: 12, mobilePrefix: /^8/, timezoneHint: "Asia/Jakarta", region: "asia" },
    { iso: "PH", name: "Philippines", flag: "🇵🇭", dialCode: "63", minNationalLen: 10, maxNationalLen: 10, mobilePrefix: /^9/, timezoneHint: "Asia/Manila", region: "asia" },
    { iso: "BN", name: "Brunei", flag: "🇧🇳", dialCode: "673", minNationalLen: 7, maxNationalLen: 7, mobilePrefix: /^[78]/, timezoneHint: "Asia/Brunei", region: "asia" },
    { iso: "TL", name: "Timor-Leste", flag: "🇹🇱", dialCode: "670", minNationalLen: 7, maxNationalLen: 8, mobilePrefix: /^7/, timezoneHint: "Asia/Dili", region: "asia" },
    { iso: "IN", name: "India", flag: "🇮🇳", dialCode: "91", minNationalLen: 10, maxNationalLen: 10, mobilePrefix: /^[6-9]/, timezoneHint: "Asia/Kolkata", region: "asia" },
    { iso: "PK", name: "Pakistan", flag: "🇵🇰", dialCode: "92", minNationalLen: 10, maxNationalLen: 10, mobilePrefix: /^3/, timezoneHint: "Asia/Karachi", region: "asia" },
    { iso: "BD", name: "Bangladesh", flag: "🇧🇩", dialCode: "880", minNationalLen: 10, maxNationalLen: 10, mobilePrefix: /^1/, timezoneHint: "Asia/Dhaka", region: "asia" },
    { iso: "LK", name: "Sri Lanka", flag: "🇱🇰", dialCode: "94", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^7/, timezoneHint: "Asia/Colombo", region: "asia" },
    { iso: "NP", name: "Nepal", flag: "🇳🇵", dialCode: "977", minNationalLen: 10, maxNationalLen: 10, mobilePrefix: /^9/, timezoneHint: "Asia/Kathmandu", region: "asia" },
    { iso: "BT", name: "Bhutan", flag: "🇧🇹", dialCode: "975", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^1[67]/, timezoneHint: "Asia/Thimphu", region: "asia" },
    { iso: "MV", name: "Maldives", flag: "🇲🇻", dialCode: "960", minNationalLen: 7, maxNationalLen: 7, mobilePrefix: /^[79]/, timezoneHint: "Indian/Maldives", region: "asia" },
    { iso: "AF", name: "Afghanistan", flag: "🇦🇫", dialCode: "93", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^7/, timezoneHint: "Asia/Kabul", region: "asia" },
    { iso: "IR", name: "Iran", flag: "🇮🇷", dialCode: "98", minNationalLen: 10, maxNationalLen: 10, mobilePrefix: /^9/, timezoneHint: "Asia/Tehran", region: "asia" },
    { iso: "IQ", name: "Iraq", flag: "🇮🇶", dialCode: "964", minNationalLen: 10, maxNationalLen: 10, mobilePrefix: /^7/, timezoneHint: "Asia/Baghdad", region: "asia" },
    { iso: "IL", name: "Israel", flag: "🇮🇱", dialCode: "972", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^5/, timezoneHint: "Asia/Jerusalem", region: "asia" },
    { iso: "PS", name: "Palestine", flag: "🇵🇸", dialCode: "970", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^5/, timezoneHint: "Asia/Gaza", region: "asia" },
    { iso: "JO", name: "Jordan", flag: "🇯🇴", dialCode: "962", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^7/, timezoneHint: "Asia/Amman", region: "asia" },
    { iso: "SY", name: "Syria", flag: "🇸🇾", dialCode: "963", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^9/, timezoneHint: "Asia/Damascus", region: "asia" },
    { iso: "LB", name: "Lebanon", flag: "🇱🇧", dialCode: "961", minNationalLen: 7, maxNationalLen: 8, mobilePrefix: /^[37]/, timezoneHint: "Asia/Beirut", region: "asia" },
    { iso: "YE", name: "Yemen", flag: "🇾🇪", dialCode: "967", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^7/, timezoneHint: "Asia/Aden", region: "asia" },
    { iso: "KZ", name: "Kazakhstan", flag: "🇰🇿", dialCode: "7", minNationalLen: 10, maxNationalLen: 10, mobilePrefix: /^7/, timezoneHint: "Asia/Almaty", region: "asia" },
    { iso: "UZ", name: "Uzbekistan", flag: "🇺🇿", dialCode: "998", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^[89]/, timezoneHint: "Asia/Tashkent", region: "asia" },
    { iso: "TM", name: "Turkmenistan", flag: "🇹🇲", dialCode: "993", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^6/, timezoneHint: "Asia/Ashgabat", region: "asia" },
    { iso: "KG", name: "Kyrgyzstan", flag: "🇰🇬", dialCode: "996", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^[57]/, timezoneHint: "Asia/Bishkek", region: "asia" },
    { iso: "TJ", name: "Tajikistan", flag: "🇹🇯", dialCode: "992", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^9/, timezoneHint: "Asia/Dushanbe", region: "asia" },
    // ── AMERICAS ─────────────────────────────────────────────────────────
    // NANP (+1) covers USA/Canada/many Caribbean — one entry each,
    // parseE164 returns first match. Users pick their country explicitly.
    { iso: "US", name: "United States", flag: "🇺🇸", dialCode: "1", minNationalLen: 10, maxNationalLen: 10, mobilePrefix: /^\d/, timezoneHint: "America/New_York", region: "americas" },
    { iso: "CA", name: "Canada", flag: "🇨🇦", dialCode: "1", minNationalLen: 10, maxNationalLen: 10, mobilePrefix: /^\d/, timezoneHint: "America/Toronto", region: "americas" },
    { iso: "MX", name: "Mexico", flag: "🇲🇽", dialCode: "52", minNationalLen: 10, maxNationalLen: 10, mobilePrefix: /^\d/, timezoneHint: "America/Mexico_City", region: "americas" },
    { iso: "BR", name: "Brazil", flag: "🇧🇷", dialCode: "55", minNationalLen: 10, maxNationalLen: 11, mobilePrefix: /^\d/, timezoneHint: "America/Sao_Paulo", region: "americas" },
    { iso: "AR", name: "Argentina", flag: "🇦🇷", dialCode: "54", minNationalLen: 10, maxNationalLen: 11, mobilePrefix: /^9?/, timezoneHint: "America/Argentina/Buenos_Aires", region: "americas" },
    { iso: "CL", name: "Chile", flag: "🇨🇱", dialCode: "56", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^9/, timezoneHint: "America/Santiago", region: "americas" },
    { iso: "CO", name: "Colombia", flag: "🇨🇴", dialCode: "57", minNationalLen: 10, maxNationalLen: 10, mobilePrefix: /^3/, timezoneHint: "America/Bogota", region: "americas" },
    { iso: "PE", name: "Peru", flag: "🇵🇪", dialCode: "51", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^9/, timezoneHint: "America/Lima", region: "americas" },
    { iso: "VE", name: "Venezuela", flag: "🇻🇪", dialCode: "58", minNationalLen: 10, maxNationalLen: 10, mobilePrefix: /^4/, timezoneHint: "America/Caracas", region: "americas" },
    { iso: "EC", name: "Ecuador", flag: "🇪🇨", dialCode: "593", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^9/, timezoneHint: "America/Guayaquil", region: "americas" },
    { iso: "UY", name: "Uruguay", flag: "🇺🇾", dialCode: "598", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^9/, timezoneHint: "America/Montevideo", region: "americas" },
    { iso: "PY", name: "Paraguay", flag: "🇵🇾", dialCode: "595", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^9/, timezoneHint: "America/Asuncion", region: "americas" },
    { iso: "BO", name: "Bolivia", flag: "🇧🇴", dialCode: "591", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^[67]/, timezoneHint: "America/La_Paz", region: "americas" },
    { iso: "GY", name: "Guyana", flag: "🇬🇾", dialCode: "592", minNationalLen: 7, maxNationalLen: 7, mobilePrefix: /^6/, timezoneHint: "America/Guyana", region: "americas" },
    { iso: "SR", name: "Suriname", flag: "🇸🇷", dialCode: "597", minNationalLen: 7, maxNationalLen: 7, mobilePrefix: /^[678]/, timezoneHint: "America/Paramaribo", region: "americas" },
    { iso: "PA", name: "Panama", flag: "🇵🇦", dialCode: "507", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^6/, timezoneHint: "America/Panama", region: "americas" },
    { iso: "CR", name: "Costa Rica", flag: "🇨🇷", dialCode: "506", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^[678]/, timezoneHint: "America/Costa_Rica", region: "americas" },
    { iso: "NI", name: "Nicaragua", flag: "🇳🇮", dialCode: "505", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^[578]/, timezoneHint: "America/Managua", region: "americas" },
    { iso: "HN", name: "Honduras", flag: "🇭🇳", dialCode: "504", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^[389]/, timezoneHint: "America/Tegucigalpa", region: "americas" },
    { iso: "SV", name: "El Salvador", flag: "🇸🇻", dialCode: "503", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^[67]/, timezoneHint: "America/El_Salvador", region: "americas" },
    { iso: "GT", name: "Guatemala", flag: "🇬🇹", dialCode: "502", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^[345]/, timezoneHint: "America/Guatemala", region: "americas" },
    { iso: "BZ", name: "Belize", flag: "🇧🇿", dialCode: "501", minNationalLen: 7, maxNationalLen: 7, mobilePrefix: /^6/, timezoneHint: "America/Belize", region: "americas" },
    { iso: "CU", name: "Cuba", flag: "🇨🇺", dialCode: "53", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^5/, timezoneHint: "America/Havana", region: "americas" },
    { iso: "DO", name: "Dominican Republic", flag: "🇩🇴", dialCode: "1", minNationalLen: 10, maxNationalLen: 10, mobilePrefix: /^\d/, timezoneHint: "America/Santo_Domingo", region: "caribbean" },
    { iso: "HT", name: "Haiti", flag: "🇭🇹", dialCode: "509", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^[34]/, timezoneHint: "America/Port-au-Prince", region: "caribbean" },
    { iso: "JM", name: "Jamaica", flag: "🇯🇲", dialCode: "1", minNationalLen: 10, maxNationalLen: 10, mobilePrefix: /^\d/, timezoneHint: "America/Jamaica", region: "caribbean" },
    { iso: "PR", name: "Puerto Rico", flag: "🇵🇷", dialCode: "1", minNationalLen: 10, maxNationalLen: 10, mobilePrefix: /^\d/, timezoneHint: "America/Puerto_Rico", region: "caribbean" },
    { iso: "TT", name: "Trinidad and Tobago", flag: "🇹🇹", dialCode: "1", minNationalLen: 10, maxNationalLen: 10, mobilePrefix: /^\d/, timezoneHint: "America/Port_of_Spain", region: "caribbean" },
    { iso: "BB", name: "Barbados", flag: "🇧🇧", dialCode: "1", minNationalLen: 10, maxNationalLen: 10, mobilePrefix: /^\d/, timezoneHint: "America/Barbados", region: "caribbean" },
    { iso: "BS", name: "Bahamas", flag: "🇧🇸", dialCode: "1", minNationalLen: 10, maxNationalLen: 10, mobilePrefix: /^\d/, timezoneHint: "America/Nassau", region: "caribbean" },
    // ── OCEANIA ──────────────────────────────────────────────────────────
    { iso: "AU", name: "Australia", flag: "🇦🇺", dialCode: "61", minNationalLen: 9, maxNationalLen: 9, mobilePrefix: /^4/, timezoneHint: "Australia/Sydney", region: "oceania" },
    { iso: "NZ", name: "New Zealand", flag: "🇳🇿", dialCode: "64", minNationalLen: 8, maxNationalLen: 10, mobilePrefix: /^2/, timezoneHint: "Pacific/Auckland", region: "oceania" },
    { iso: "PG", name: "Papua New Guinea", flag: "🇵🇬", dialCode: "675", minNationalLen: 8, maxNationalLen: 8, mobilePrefix: /^7/, timezoneHint: "Pacific/Port_Moresby", region: "oceania" },
    { iso: "FJ", name: "Fiji", flag: "🇫🇯", dialCode: "679", minNationalLen: 7, maxNationalLen: 7, mobilePrefix: /^[7-9]/, timezoneHint: "Pacific/Fiji", region: "oceania" },
    { iso: "SB", name: "Solomon Islands", flag: "🇸🇧", dialCode: "677", minNationalLen: 5, maxNationalLen: 7, mobilePrefix: /^[78]/, timezoneHint: "Pacific/Guadalcanal", region: "oceania" },
    { iso: "VU", name: "Vanuatu", flag: "🇻🇺", dialCode: "678", minNationalLen: 5, maxNationalLen: 7, mobilePrefix: /^[578]/, timezoneHint: "Pacific/Efate", region: "oceania" },
    { iso: "WS", name: "Samoa", flag: "🇼🇸", dialCode: "685", minNationalLen: 5, maxNationalLen: 7, mobilePrefix: /^7/, timezoneHint: "Pacific/Apia", region: "oceania" },
    { iso: "TO", name: "Tonga", flag: "🇹🇴", dialCode: "676", minNationalLen: 5, maxNationalLen: 7, mobilePrefix: /^[78]/, timezoneHint: "Pacific/Tongatapu", region: "oceania" },
];
/** Fast lookup by ISO alpha-2 (case-insensitive). */
function findCountryByIso(iso) {
    if (!iso)
        return null;
    const needle = iso.toUpperCase().trim();
    return exports.AFRICAN_COUNTRIES.find((c) => c.iso === needle) ?? null;
}
/**
 * Detect country from an E.164 dial code (with or without leading "+").
 * When multiple countries share a code (rare in Africa), returns the first
 * match. Callers should disambiguate via ISO when known.
 */
function findCountryByDialCode(code) {
    if (!code)
        return null;
    const clean = code.replace(/^\+/, "").trim();
    return exports.AFRICAN_COUNTRIES.find((c) => c.dialCode === clean) ?? null;
}
/**
 * Parse an E.164 phone number into { country, national }. Returns null if
 * the number doesn't match any known African country's dial code.
 * Accepts formats: "+254712345678", "254712345678", "+254 712 345 678".
 */
function parseE164(phone) {
    if (!phone)
        return null;
    const digits = phone.replace(/[^\d]/g, "");
    // Try 4→3→2→1 digit dial codes (some ITU codes are 4 digits e.g. Bahamas)
    for (const len of [4, 3, 2, 1]) {
        const prefix = digits.slice(0, len);
        const country = findCountryByDialCode(prefix);
        if (country)
            return { country, national: digits.slice(len) };
    }
    return null;
}
/**
 * Validate a national number against the country's numbering plan.
 * Returns { valid: boolean, reason?: string }.
 */
function validateNationalNumber(country, national) {
    if (!national)
        return { valid: false, reason: "Please enter your mobile number." };
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
function toE164(country, national) {
    const digits = (national || "").replace(/\D/g, "").replace(/^0+/, "");
    return `+${country.dialCode}${digits}`;
}
/**
 * Best-guess country default for a fresh user. Attempts (in order):
 *   1. explicit ISO argument
 *   2. browser language region (e.g. "en-KE" → KE)
 *   3. fall back to Kenya (primary market)
 */
function defaultCountry(hint) {
    if (hint?.iso) {
        const byIso = findCountryByIso(hint.iso);
        if (byIso)
            return byIso;
    }
    if (hint?.languageTag) {
        const region = hint.languageTag.split("-")[1]?.toUpperCase();
        if (region) {
            const byRegion = findCountryByIso(region);
            if (byRegion)
                return byRegion;
        }
    }
    return findCountryByIso("KE");
}
