import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validate, _setNowProviderForTests } from "../../../server/sync/validation";
import type { NormalizedAgency } from "../../../server/sync/types";

const FROZEN_NOW = Date.parse("2026-06-26T00:00:00Z");

beforeEach(() => _setNowProviderForTests(() => FROZEN_NOW));
afterEach(()  => _setNowProviderForTests(() => Date.now()));

function makeAgency(overrides: Partial<NormalizedAgency> = {}): NormalizedAgency {
  return {
    agencyName:    "ABC LIMITED",
    licenseNumber: "PVT-ABC123",
    country:       "KE",
    serviceType:   "gulf_and_domestic",
    email:         "abc@example.com",
    website:       null,
    phone:         null,
    issueDate:     null,
    expiryDate:    "2027-06-26",
    statusSource:  "verified",
    ...overrides,
  };
}

describe("validate() — happy path", () => {
  it("accepts a clean record", () => {
    const r = validate(makeAgency());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.agencyName).toBe("ABC LIMITED");
  });

  it("accepts null for optional fields", () => {
    const r = validate(makeAgency({ email: null, website: null, phone: null, issueDate: null }));
    expect(r.ok).toBe(true);
  });
});

describe("validate() — agency name", () => {
  it("rejects empty name", () => {
    const r = validate(makeAgency({ agencyName: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons[0].path).toBe("agencyName");
  });

  it("rejects names over 200 chars", () => {
    const r = validate(makeAgency({ agencyName: "X".repeat(201) }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons[0].code).toBe("too_long");
  });
});

describe("validate() — licence number", () => {
  it("rejects empty licence", () => {
    const r = validate(makeAgency({ licenseNumber: "" }));
    expect(r.ok).toBe(false);
  });

  it("rejects characters outside the canonical set", () => {
    const r = validate(makeAgency({ licenseNumber: "PVT@123" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons[0].path).toBe("licenseNumber");
  });

  it("accepts the well-known NEA shapes", () => {
    for (const lic of ["PVT-DLULXGQX", "CPR/2011/53972", "REF/NEA/FE&LE/S/042", "C.91675", "284"]) {
      const r = validate(makeAgency({ licenseNumber: lic }));
      expect(r.ok, `licence=${lic}`).toBe(true);
    }
  });
});

describe("validate() — country", () => {
  it("rejects non-ISO codes", () => {
    expect(validate(makeAgency({ country: "KEN" })).ok).toBe(false);
    expect(validate(makeAgency({ country: "k"   })).ok).toBe(false);
  });
});

describe("validate() — dates", () => {
  it("requires expiry date", () => {
    const r = validate(makeAgency({ expiryDate: "" }));
    expect(r.ok).toBe(false);
  });

  it("rejects malformed expiry", () => {
    const r = validate(makeAgency({ expiryDate: "2026/06/26" }));
    expect(r.ok).toBe(false);
  });

  it("rejects expiry beyond ±10 years from now", () => {
    expect(validate(makeAgency({ expiryDate: "2050-01-01" })).ok).toBe(false);
    expect(validate(makeAgency({ expiryDate: "1990-01-01" })).ok).toBe(false);
  });

  it("rejects issueDate > expiryDate", () => {
    const r = validate(makeAgency({ issueDate: "2027-12-31", expiryDate: "2026-06-26" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons[0].path).toBe("issueDate");
  });

  it("accepts issueDate <= expiryDate", () => {
    expect(validate(makeAgency({ issueDate: "2025-06-26", expiryDate: "2026-06-26" })).ok).toBe(true);
    expect(validate(makeAgency({ issueDate: "2026-06-26", expiryDate: "2026-06-26" })).ok).toBe(true);
  });
});

describe("validate() — enums", () => {
  it("rejects unknown serviceType", () => {
    const r = validate(makeAgency({ serviceType: "freight" as any }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons[0].code).toBe("not_in_set");
  });

  it("rejects unknown statusSource", () => {
    const r = validate(makeAgency({ statusSource: "vouched" as any }));
    expect(r.ok).toBe(false);
  });
});
