"use strict";
/**
 * phone-e164.ts — server-side E.164 phone helpers.
 *
 * 2026-07 (Tony's founder brief): every African citizen must be able to
 * register. This module is the SINGLE authority for phone parsing +
 * validation on the server. Every endpoint that touches phones should
 * use `normalizeAndValidateE164()` — never home-grown regex.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeAndValidateE164 = normalizeAndValidateE164;
exports.isValidAfricanE164 = isValidAfricanE164;
exports.supportedIsoCodes = supportedIsoCodes;
const african_countries_1 = require("@shared/african-countries");
/**
 * Take any phone input from the client and normalize to E.164, validating
 * against the country's numbering plan.
 *
 * Preferred call shape (from new PhoneInput):
 *   normalizeAndValidateE164({ e164: "+254712345678" })
 *   normalizeAndValidateE164({ countryIso: "KE", national: "712345678" })
 *
 * Backward-compat shape (legacy .phone column):
 *   normalizeAndValidateE164({ raw: "0712345678", assumeCountry: "KE" })
 */
function normalizeAndValidateE164(input) {
    // Path 1: full E.164 already provided
    if (input.e164) {
        const parsed = (0, african_countries_1.parseE164)(input.e164);
        if (!parsed) {
            return {
                ok: false,
                error: "unknown_country",
                message: "That country code isn't recognized as an African country. Please pick your country from the dropdown.",
            };
        }
        const check = (0, african_countries_1.validateNationalNumber)(parsed.country, parsed.national);
        if (!check.valid) {
            return {
                ok: false,
                error: "invalid_national",
                message: check.reason ?? "Please enter a valid mobile number.",
            };
        }
        return successFor(parsed.country, parsed.national);
    }
    // Path 2: country ISO + national number
    if (input.countryIso && input.national) {
        const country = (0, african_countries_1.findCountryByIso)(input.countryIso);
        if (!country) {
            return {
                ok: false,
                error: "unknown_country",
                message: `We don't yet support ${input.countryIso.toUpperCase()} — please pick your country from the dropdown.`,
            };
        }
        const check = (0, african_countries_1.validateNationalNumber)(country, input.national);
        if (!check.valid) {
            return {
                ok: false,
                error: "invalid_national",
                message: check.reason ?? "Please enter a valid mobile number.",
            };
        }
        // Strip trunk zero + normalize
        const stripped = input.national.replace(/\D/g, "").replace(/^0+/, "");
        return successFor(country, stripped);
    }
    // Path 3: legacy raw string + best-effort country guess
    if (input.raw) {
        const digits = input.raw.replace(/\D/g, "");
        // Try parsing as E.164 first — if the raw already starts with a known dial code
        if (digits.length >= 8) {
            const parsed = (0, african_countries_1.parseE164)(`+${digits}`);
            if (parsed) {
                const check = (0, african_countries_1.validateNationalNumber)(parsed.country, parsed.national);
                if (check.valid)
                    return successFor(parsed.country, parsed.national);
            }
        }
        // Fall back to assumeCountry (default: Kenya)
        const country = (0, african_countries_1.findCountryByIso)(input.assumeCountry || "KE") ?? (0, african_countries_1.findCountryByIso)("KE");
        const stripped = digits.replace(/^0+/, "");
        const check = (0, african_countries_1.validateNationalNumber)(country, stripped);
        if (!check.valid) {
            return {
                ok: false,
                error: "invalid_national",
                message: check.reason ?? "Please enter a valid mobile number.",
            };
        }
        return successFor(country, stripped);
    }
    return {
        ok: false,
        error: "empty_input",
        message: "Please enter your mobile number.",
    };
}
function successFor(country, national) {
    const stripped = national.replace(/\D/g, "").replace(/^0+/, "");
    return {
        ok: true,
        e164: (0, african_countries_1.toE164)(country, stripped),
        countryIso: country.iso,
        countryName: country.name,
        dialCode: country.dialCode,
        national: stripped,
        region: country.region,
    };
}
/** Cheap check — is this phone number already E.164 for a known African country? */
function isValidAfricanE164(phone) {
    const parsed = (0, african_countries_1.parseE164)(phone);
    if (!parsed)
        return false;
    return (0, african_countries_1.validateNationalNumber)(parsed.country, parsed.national).valid;
}
/** Convenience — list ISO codes we support (for docs / dropdown fallbacks). */
function supportedIsoCodes() {
    return african_countries_1.AFRICAN_COUNTRIES.map((c) => c.iso);
}
