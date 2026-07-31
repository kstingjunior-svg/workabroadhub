/**
 * phone-e164.ts — server-side E.164 phone helpers.
 *
 * 2026-07 (Tony's founder brief): every African citizen must be able to
 * register. This module is the SINGLE authority for phone parsing +
 * validation on the server. Every endpoint that touches phones should
 * use `normalizeAndValidateE164()` — never home-grown regex.
 */

import {
  AFRICAN_COUNTRIES,
  findCountryByIso,
  parseE164,
  toE164,
  validateNationalNumber,
  type AfricanCountry,
} from "@shared/african-countries";

export interface NormalizedPhone {
  ok: true;
  e164: string;                  // "+254712345678"
  countryIso: string;            // "KE"
  countryName: string;           // "Kenya"
  dialCode: string;              // "254"
  national: string;              // "712345678"
  region: AfricanCountry["region"];
}

export interface PhoneValidationFailure {
  ok: false;
  error: string;                 // machine key
  message: string;               // user-facing warm copy
}

export type NormalizePhoneResult = NormalizedPhone | PhoneValidationFailure;

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
export function normalizeAndValidateE164(input: {
  e164?: string | null;
  countryIso?: string | null;
  national?: string | null;
  raw?: string | null;
  assumeCountry?: string | null;
}): NormalizePhoneResult {
  // Path 1: full E.164 already provided
  if (input.e164) {
    const parsed = parseE164(input.e164);
    if (!parsed) {
      return {
        ok: false,
        error: "unknown_country",
        message: "That country code isn't recognized as an African country. Please pick your country from the dropdown.",
      };
    }
    const check = validateNationalNumber(parsed.country, parsed.national);
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
    const country = findCountryByIso(input.countryIso);
    if (!country) {
      return {
        ok: false,
        error: "unknown_country",
        message: `We don't yet support ${input.countryIso.toUpperCase()} — please pick your country from the dropdown.`,
      };
    }
    const check = validateNationalNumber(country, input.national);
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
      const parsed = parseE164(`+${digits}`);
      if (parsed) {
        const check = validateNationalNumber(parsed.country, parsed.national);
        if (check.valid) return successFor(parsed.country, parsed.national);
      }
    }
    // Fall back to assumeCountry (default: Kenya)
    const country = findCountryByIso(input.assumeCountry || "KE") ?? findCountryByIso("KE")!;
    const stripped = digits.replace(/^0+/, "");
    const check = validateNationalNumber(country, stripped);
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

function successFor(country: AfricanCountry, national: string): NormalizedPhone {
  const stripped = national.replace(/\D/g, "").replace(/^0+/, "");
  return {
    ok: true,
    e164: toE164(country, stripped),
    countryIso: country.iso,
    countryName: country.name,
    dialCode: country.dialCode,
    national: stripped,
    region: country.region,
  };
}

/** Cheap check — is this phone number already E.164 for a known African country? */
export function isValidAfricanE164(phone: string): boolean {
  const parsed = parseE164(phone);
  if (!parsed) return false;
  return validateNationalNumber(parsed.country, parsed.national).valid;
}

/** Convenience — list ISO codes we support (for docs / dropdown fallbacks). */
export function supportedIsoCodes(): string[] {
  return AFRICAN_COUNTRIES.map((c) => c.iso);
}
