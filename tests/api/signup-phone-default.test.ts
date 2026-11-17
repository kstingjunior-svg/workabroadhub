/** 2026-11 sign-up complaint: Kenyan visitors were preselected to 🇺🇸 +1. */
import { describe, it, expect } from "vitest";
import { defaultCountry, countryForTimeZone, looksLikeKenyanMobile, parseE164, validateNationalNumber } from "../../shared/african-countries";

describe("phone country default", () => {
  it("a Kenyan phone reporting en-US gets Kenya, not the US", () => {
    expect(defaultCountry({ languageTag: "en-US", timeZone: "Africa/Nairobi" }).iso).toBe("KE");
  });
  it("en-US with no time zone falls back to Kenya", () => {
    expect(defaultCountry({ languageTag: "en-US" }).iso).toBe("KE");
  });
  it("time zone picks the right country abroad", () => {
    expect(defaultCountry({ languageTag: "en-US", timeZone: "Asia/Dubai" }).iso).toBe("AE");
    expect(defaultCountry({ languageTag: "en-US", timeZone: "America/Chicago" }).iso).toBe("US");
    expect(countryForTimeZone("Africa/Kampala")?.iso).toBe("UG");
  });
  it("a real non-default language region still works", () => {
    expect(defaultCountry({ languageTag: "en-NG" }).iso).toBe("NG");
  });
  it("Kenyan numbers typed the local way are recognised and valid under Kenya", () => {
    expect(looksLikeKenyanMobile("0712345678")).toBe(true);
    expect(looksLikeKenyanMobile("0112345678")).toBe(true);
    expect(looksLikeKenyanMobile("07123456789")).toBe(false);
    const ke = defaultCountry({ timeZone: "Africa/Nairobi" });
    expect(validateNationalNumber(ke, "0712345678").valid).toBe(true);
  });
  it("pasted +254 numbers resolve to Kenya", () => {
    expect(parseE164("254712345678")?.country.iso).toBe("KE");
  });
});
