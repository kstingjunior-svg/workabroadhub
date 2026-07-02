import { describe, it, expect } from "vitest";
import {
  fingerprint,
  versionedFingerprint,
  FINGERPRINT_VERSION,
} from "../../../server/sync/fingerprint";
import type { NormalizedAgency } from "../../../server/sync/types";

const sample: NormalizedAgency = {
  agencyName:    "ABC LIMITED",
  licenseNumber: "PVT-DLULXGQX",
  country:       "KE",
  serviceType:   "gulf_and_domestic",
  email:         "abc@example.com",
  website:       "https://abc.example.com",
  phone:         "254722000000",
  issueDate:     "2025-08-24",
  expiryDate:    "2026-08-24",
  statusSource:  "verified",
};

describe("fingerprint()", () => {
  it("returns a 64-character lowercase hex sha256", () => {
    const fp = fingerprint(sample);
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic — same input always yields the same output", () => {
    const fp1 = fingerprint(sample);
    const fp2 = fingerprint(sample);
    const fp3 = fingerprint({ ...sample }); // structurally equal copy
    expect(fp1).toBe(fp2);
    expect(fp1).toBe(fp3);
  });

  it("differs when any tracked field changes", () => {
    const fp0 = fingerprint(sample);

    const tweaks: Partial<NormalizedAgency>[] = [
      { agencyName:    "ABC LTD" },
      { licenseNumber: "PVT-OTHER" },
      { country:       "UG" },
      { serviceType:   "domestic" },
      { email:         "other@example.com" },
      { website:       "https://other.example.com" },
      { phone:         "254722111111" },
      { issueDate:     "2025-08-25" },
      { expiryDate:    "2027-08-24" },
      { statusSource:  "suspended" },
    ];

    for (const tweak of tweaks) {
      const fp = fingerprint({ ...sample, ...tweak });
      expect(fp, `tweak=${JSON.stringify(tweak)}`).not.toBe(fp0);
    }
  });

  it("treats null and empty string identically (intentional by spec)", () => {
    const withNull  = { ...sample, email: null };
    const withEmpty = { ...sample, email: "" } as unknown as NormalizedAgency;
    expect(fingerprint(withNull)).toBe(fingerprint(withEmpty));
  });

  it("rejects non-string field values with a clear error", () => {
    const bad = { ...sample, agencyName: 123 } as unknown as NormalizedAgency;
    expect(() => fingerprint(bad)).toThrow(/unexpected field type/);
  });
});

describe("versionedFingerprint()", () => {
  it("prefixes with v<FINGERPRINT_VERSION>:", () => {
    const v = versionedFingerprint(sample);
    expect(v.startsWith(`v${FINGERPRINT_VERSION}:`)).toBe(true);
    expect(v.split(":")[1]).toBe(fingerprint(sample));
  });
});
