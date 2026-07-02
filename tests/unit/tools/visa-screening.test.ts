import { describe, it, expect } from "vitest";
import {
  screenVisa,
  parseMrz,
  mrzCheckDigit,
  VISA_SCREENING_VERSION,
  type ParsedVisaFields,
  type MrzParseResult,
} from "../../../server/tools/visa-screening";

// ─────────────────────────────────────────────────────────────────────────────
// mrzCheckDigit — ICAO 9303 test vectors
// ─────────────────────────────────────────────────────────────────────────────

describe("mrzCheckDigit", () => {
  it("computes check digit for the ICAO reference example L898902C<", () => {
    // From ICAO Doc 9303 Part 4 Section 4.9 (widely cited test vector).
    expect(mrzCheckDigit("L898902C<")).toBe("3");
  });

  it("treats '<' as zero", () => {
    // Just '<' repeated should always yield 0.
    expect(mrzCheckDigit("<<<<<<<")).toBe("0");
  });

  it("handles alphabetic input via A=10 mapping", () => {
    // 'A' → 10 → 10 * 7 = 70 → 70 % 10 = 0
    expect(mrzCheckDigit("A")).toBe("0");
    // 'B' → 11 → 11 * 7 = 77 → 77 % 10 = 7
    expect(mrzCheckDigit("B")).toBe("7");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseMrz — presence, decoding, checksum validation
// ─────────────────────────────────────────────────────────────────────────────

describe("parseMrz", () => {
  it("returns present:false when no MRZ signal is in the text", () => {
    const r = parseMrz("Visa granted to John Doe. Expires 2030-01-01.");
    expect(r.present).toBe(false);
    expect(r.checksumValid).toBeNull();
  });

  it("decodes a valid Type-V MRZ and marks checksum PASS", () => {
    // Build a synthetic MRZ that will pass all three check digits.
    // We construct fields, compute check digits, and concatenate.
    const docNum   = "AB1234567";     // 9 chars
    const dob      = "800101";        // 1980-01-01
    const expiry   = "301231";        // 2030-12-31
    const nat      = "KEN";
    const l1 = "V<KEN" + "DOE<<JOHN".padEnd(39, "<");           // 44 chars
    const l2 =
      docNum + mrzCheckDigit(docNum) +
      nat +
      dob + mrzCheckDigit(dob) +
      "M" +
      expiry + mrzCheckDigit(expiry) +
      "<<<<<<<<<<<<<<<<";                                        // padding
    const trimmedL2 = l2.padEnd(44, "<");

    const r = parseMrz(`Some visible text\n${l1}\n${trimmedL2}\n`);
    expect(r.present).toBe(true);
    expect(r.documentType).toBe("V");
    expect(r.issuingState).toBe("KEN");
    expect(r.documentNumber).toBe(docNum);
    expect(r.nationality).toBe("KEN");
    expect(r.checksumValid).toBe(true);
  });

  it("marks the MRZ as checksum-FAILED when a digit is edited", () => {
    // Same synthetic MRZ but corrupt one check digit.
    const docNum   = "AB1234567";
    const dob      = "800101";
    const expiry   = "301231";
    const badDocCheck = "9"; // definitely wrong; the real one is not 9 for most inputs
    const l1 = "V<KEN" + "DOE<<JOHN".padEnd(39, "<");
    const l2 = (
      docNum + badDocCheck +
      "KEN" +
      dob + mrzCheckDigit(dob) +
      "M" +
      expiry + mrzCheckDigit(expiry) +
      "<<<<<<<<<<<<<<<<"
    ).padEnd(44, "<");

    const r = parseMrz(`${l1}\n${l2}\n`);
    expect(r.present).toBe(true);
    // Depending on random luck '9' might accidentally match — this synthetic
    // test picked a number that we know doesn't match for AB1234567.
    if (mrzCheckDigit(docNum) === badDocCheck) {
      // Skip if our "bad" happened to match; test is still meaningful in general.
      return;
    }
    expect(r.checksumValid).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// screenVisa — end-to-end scoring paths
// ─────────────────────────────────────────────────────────────────────────────

function baseParsed(over: Partial<ParsedVisaFields> = {}): ParsedVisaFields {
  return {
    visaNumber:     "123456789",
    issuingCountry: "UAE",
    holderName:     "John Doe",
    visaType:       "Employment",
    issueDate:      "2025-01-01",
    expiryDate:     "2027-01-01",
    ...over,
  };
}

function baseMrz(over: Partial<MrzParseResult> = {}): MrzParseResult {
  return {
    present:        true,
    raw:            "V<UAE...\n123456789...",
    documentType:   "V",
    issuingState:   "UAE",
    holderName:     "DOE JOHN",
    documentNumber: "123456789",
    nationality:    "UAE",
    dob:            "800101",
    sex:            "M",
    expiry:         "270101",
    checksumValid:  true,
    checkDetails:   "all PASS",
    ...over,
  };
}

const CLEAN_OCR = "Visa employment permit issued by UAE. Number 123456789. Expires 2027-01-01.";
const NOT_VISA_OCR = "Grocery receipt: 1kg sugar, 2 loaves bread. Total 250.";

describe("screenVisa — clean happy path", () => {
  it("returns riskBand='low' on a clean visa with valid MRZ", () => {
    const r = screenVisa({
      ocrText:  CLEAN_OCR,
      parsed:   baseParsed(),
      mrz:      baseMrz(),
      aiVision: {
        notes: "Looks consistent.",
        anomalyFlags: [],
        visionConfidence: 90,
      },
      today: new Date("2026-06-01"),
    });
    expect(r.version).toBe(VISA_SCREENING_VERSION);
    expect(r.riskBand).toBe("low");
    expect(r.riskScore).toBeLessThan(31);
    expect(r.aiVisionUsed).toBe(true);
  });
});

describe("screenVisa — critical findings", () => {
  it("flags mrz_checksum_failed and pushes into medium/high", () => {
    const r = screenVisa({
      ocrText: CLEAN_OCR,
      parsed:  baseParsed(),
      mrz:     baseMrz({ checksumValid: false, checkDetails: "document-check FAIL" }),
      aiVision: null,
      today: new Date("2026-06-01"),
    });
    expect(r.findings.some((f) => f.code === "mrz_checksum_failed")).toBe(true);
    expect(r.riskScore).toBeGreaterThanOrEqual(30);
  });

  it("flags dates_reversed when issue > expiry", () => {
    const r = screenVisa({
      ocrText: CLEAN_OCR,
      parsed:  baseParsed({ issueDate: "2028-01-01", expiryDate: "2027-01-01" }),
      mrz:     baseMrz(),
      aiVision: null,
      today: new Date("2026-06-01"),
    });
    expect(r.findings.some((f) => f.code === "dates_reversed")).toBe(true);
  });

  it("flags issued_in_future for issue dates > today", () => {
    const r = screenVisa({
      ocrText: CLEAN_OCR,
      parsed:  baseParsed({ issueDate: "2030-01-01" }),
      mrz:     baseMrz(),
      aiVision: null,
      today: new Date("2026-06-01"),
    });
    expect(r.findings.some((f) => f.code === "issued_in_future")).toBe(true);
  });

  it("flags already_expired if expiry < today", () => {
    const r = screenVisa({
      ocrText: CLEAN_OCR,
      parsed:  baseParsed({ expiryDate: "2020-01-01" }),
      mrz:     baseMrz(),
      aiVision: null,
      today: new Date("2026-06-01"),
    });
    expect(r.findings.some((f) => f.code === "already_expired")).toBe(true);
  });

  it("flags not_visa_like when OCR text has no visa vocabulary", () => {
    const r = screenVisa({
      ocrText:  NOT_VISA_OCR,
      parsed:   baseParsed({ visaNumber: null, issueDate: null, expiryDate: null }),
      mrz:      { ...baseMrz(), present: false, checksumValid: null, raw: null, documentType: null, issuingState: null, checkDetails: "no MRZ" },
      aiVision: null,
      today: new Date("2026-06-01"),
    });
    expect(r.findings.some((f) => f.code === "not_visa_like")).toBe(true);
    expect(r.riskBand).not.toBe("low");
  });
});

describe("screenVisa — AI vision integration", () => {
  it("classifies tampering keywords as critical", () => {
    const r = screenVisa({
      ocrText: CLEAN_OCR,
      parsed:  baseParsed(),
      mrz:     baseMrz(),
      aiVision: {
        notes: "Some issues.",
        anomalyFlags: ["visible edit around expiry date field", "clone pattern in stamp"],
        visionConfidence: 25,
      },
      today: new Date("2026-06-01"),
    });
    const critFlags = r.findings.filter((f) => f.severity === "critical");
    expect(critFlags.length).toBeGreaterThan(0);
    // Low vision confidence adds a separate finding.
    expect(r.findings.some((f) => f.code === "vision_low_confidence")).toBe(true);
    expect(r.riskBand).toBe("high");
  });

  it("does not surface findings when vision reports no anomalies", () => {
    const r = screenVisa({
      ocrText: CLEAN_OCR,
      parsed:  baseParsed(),
      mrz:     baseMrz(),
      aiVision: {
        notes: "Clean.",
        anomalyFlags: [],
        visionConfidence: 92,
      },
      today: new Date("2026-06-01"),
    });
    const visionFindings = r.findings.filter((f) => f.code.startsWith("vision"));
    expect(visionFindings).toHaveLength(0);
  });
});

describe("screenVisa — MRZ ↔ visible cross-check", () => {
  it("flags mrz_visible_expiry_mismatch when they disagree", () => {
    const r = screenVisa({
      ocrText: CLEAN_OCR,
      parsed:  baseParsed({ expiryDate: "2027-01-01" }),
      mrz:     baseMrz({ expiry: "300101" }), // 2030-01-01 — 3 years off
      aiVision: null,
      today: new Date("2026-06-01"),
    });
    expect(r.findings.some((f) => f.code === "mrz_visible_expiry_mismatch")).toBe(true);
  });
});
