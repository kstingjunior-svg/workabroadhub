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
 *  2. If starts with "0" → replace with the country's dialli