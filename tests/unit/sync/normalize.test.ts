import { describe, it, expect } from "vitest";
import {
  collapseWhitespace,
  normalizeAgencyName,
  normalizeLicenseNumber,
  normalizeEmail,
  normalizeWebsite,
  normalizePhoneNumber,
  normalizeServiceType,
  normalizeStatusSource,
  normalizeDate,
  normalizeCountryCode,
} from "../../../server/sync/normalize";

describe("collapseWhitespace", () => {
  it("collapses internal runs to one space and trims", () => {
    expect(collapseWhitespace("  ABC   LTD\t\n LIMITED  ")).toBe("ABC LTD LIMITED");
  });
  it("handles empty/whitespace input", () => {
    expect(collapseWhitespace("   ")).toBe("");
  });
});

describe("normalizeAgencyName", () => {
  it("uppercases and collapses", () => {
    expect(normalizeAgencyName("Accountability Tours & Travel Ltd"))
      .toBe("ACCOUNTABILITY TOURS & TRAVEL LTD");
  });
  it("survives null/undefined", () => {
    expect(normalizeAgencyName(null)).toBe("");
    expect(normalizeAgencyName(undefined)).toBe("");
  });
});

describe("normalizeLicenseNumber", () => {
  it("strips leading colons (NEA portal :PVT-... case)", () => {
    expect(normalizeLicenseNumber(":PVT-RXU2253Y")).toBe("PVT-RXU2253Y");
  });
  it("uppercases lowercase variants", () => {
    expect(normalizeLicenseNumber("pvt-mkukadj")).toBe("PVT-MKUKADJ");
    expect(normalizeLicenseNumber("Pvt-mkukadj")).toBe("PVT-MKUKADJ");
  });
  it("converts space-separated to hyphen-separated (PVT V7U28Y8 case)", () => {
    expect(normalizeLicenseNumber("PVT V7U28Y8")).toBe("PVT-V7U28Y8");
  });
  it("collapses double hyphens", () => {
    expect(normalizeLicenseNumber("PVT- 6LU569")).toBe("PVT-6LU569");
  });
  it("preserves numeric-only licences", () => {
    expect(normalizeLicenseNumber("284")).toBe("284");
  });
});

describe("normalizeEmail", () => {
  it("returns canonical lowercase email", () => {
    expect(normalizeEmail("Info@Example.COM")).toBe("info@example.com");
  });
  it("picks first plausible email from slash-separated list", () => {
    expect(normalizeEmail("a@example.com/b@example.com"))
      .toBe("a@example.com");
  });
  it("returns null on missing @ (typo: 'beettravelagenciesltdgmail.com')", () => {
    expect(normalizeEmail("beettravelagenciesltdgmail.com")).toBeNull();
  });
  it("returns null on empty/whitespace", () => {
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});

describe("normalizeWebsite", () => {
  it("adds https:// when missing scheme", () => {
    expect(normalizeWebsite("example.com")).toBe("https://example.com");
  });
  it("strips trailing slash for stable form", () => {
    expect(normalizeWebsite("https://example.com/")).toBe("https://example.com");
  });
  it("returns null for malformed hosts", () => {
    expect(normalizeWebsite("not a url")).toBeNull();
    expect(normalizeWebsite("http://")).toBeNull();
  });
});

describe("normalizePhoneNumber", () => {
  it("normalises Kenyan 0X to 254X", () => {
    expect(normalizePhoneNumber("0722000000")).toBe("254722000000");
  });
  it("strips leading +", () => {
    expect(normalizePhoneNumber("+254722000000")).toBe("254722000000");
  });
  it("returns null for too-short numbers", () => {
    expect(normalizePhoneNumber("1234")).toBeNull();
  });
  it("returns null for null input", () => {
    expect(normalizePhoneNumber(null)).toBeNull();
  });
});

describe("normalizeServiceType", () => {
  it("maps NEA's 'BOTH LOCAL & INTERNATIONAL LICENSE' to gulf_and_domestic", () => {
    expect(normalizeServiceType("BOTH LOCAL & INTERNATIONAL LICENSE"))
      .toBe("gulf_and_domestic");
  });
  it("maps 'BOTH LOCAL & INTERNATIONAL RENEWAL LICENSE' identically", () => {
    expect(normalizeServiceType("BOTH LOCAL & INTERNATIONAL RENEWAL LICENSE"))
      .toBe("gulf_and_domestic");
  });
  it("maps 'LOCAL LICENSE' to domestic", () => {
    expect(normalizeServiceType("LOCAL LICENSE")).toBe("domestic");
  });
  it("treats 'N/A' / blank / null as unspecified", () => {
    expect(normalizeServiceType("N/A")).toBe("unspecified");
    expect(normalizeServiceType("")).toBe("unspecified");
    expect(normalizeServiceType(null)).toBe("unspecified");
  });
  it("maps obvious medical labels", () => {
    expect(normalizeServiceType("Medical Recruitment")).toBe("medical");
    expect(normalizeServiceType("Nursing Agency"))    .toBe("medical");
  });
});

describe("normalizeStatusSource", () => {
  it("maps 'Verified' to verified", () => {
    expect(normalizeStatusSource("Verified")).toBe("verified");
  });
  it("falls back to unknown — NEVER 'verified' by default", () => {
    expect(normalizeStatusSource(null)).toBe("unknown");
    expect(normalizeStatusSource("???")).toBe("unknown");
  });
  it("maps suspended/expired/revoked variants", () => {
    expect(normalizeStatusSource("Suspended (admin)")).toBe("suspended");
    expect(normalizeStatusSource("Expired"))          .toBe("expired");
    expect(normalizeStatusSource("Revoked"))          .toBe("revoked");
    expect(normalizeStatusSource("Cancelled"))        .toBe("revoked");
  });
});

describe("normalizeDate", () => {
  it("accepts day-first DD/MM/YYYY (NEA portal format)", () => {
    expect(normalizeDate("24/08/2026")).toBe("2026-08-24");
    expect(normalizeDate("3/9/2026"))  .toBe("2026-09-03");
  });
  it("accepts ISO YYYY-MM-DD as-is", () => {
    expect(normalizeDate("2026-08-24")).toBe("2026-08-24");
  });
  it("rejects impossible calendar dates", () => {
    expect(normalizeDate("30/02/2026")).toBeNull(); // Feb 30
    expect(normalizeDate("32/01/2026")).toBeNull(); // day 32
    expect(normalizeDate("01/13/2026")).toBeNull(); // month 13
  });
  it("returns null for empty/null", () => {
    expect(normalizeDate("")).toBeNull();
    expect(normalizeDate(null)).toBeNull();
  });
  it("accepts Date instances", () => {
    expect(normalizeDate(new Date("2026-08-24T00:00:00Z"))).toBe("2026-08-24");
  });
});

describe("normalizeCountryCode", () => {
  it("accepts ISO alpha-2 codes", () => {
    expect(normalizeCountryCode("KE")).toBe("KE");
    expect(normalizeCountryCode("gb")).toBe("GB"); // uppercased
  });
  it("rejects non-2-letter / unknown shapes", () => {
    expect(normalizeCountryCode("KEN")).toBeNull();
    expect(normalizeCountryCode("K"))  .toBeNull();
    expect(normalizeCountryCode(""))   .toBeNull();
  });
});
