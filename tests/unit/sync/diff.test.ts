import { describe, it, expect } from "vitest";
import { computeDiff, countChanges } from "../../../server/sync/diff";
import type { CurrentAgencyRow } from "../../../server/sync/storage";
import type { NormalizedAgency, ValidatedRecord } from "../../../server/sync/types";

function mkCurrent(overrides: Partial<CurrentAgencyRow>): CurrentAgencyRow {
  return {
    id:                 "uuid-existing",
    agencyName:         "OLDNAME LTD",
    licenseNumber:      "PVT-EXIST",
    country:            "KE",
    serviceType:        "gulf_and_domestic",
    email:              "old@example.com",
    website:            null,
    phone:              null,
    issueDate:          null,
    expiryDate:         "2027-01-01",
    statusSource:       "verified",
    providerRecordFp:   "fp-OLD",
    ...overrides,
  };
}

function mkValidated(overrides: Partial<NormalizedAgency> & { fingerprint?: string; raw?: any }): ValidatedRecord {
  const { fingerprint = "fp-NEW", raw = {}, ...agencyOver } = overrides;
  return {
    raw,
    agency: {
      agencyName:    "NEWNAME LTD",
      licenseNumber: "PVT-EXIST",
      country:       "KE",
      serviceType:   "gulf_and_domestic",
      email:         null,
      website:       null,
      phone:         null,
      issueDate:     null,
      expiryDate:    "2027-01-01",
      statusSource:  "verified",
      ...agencyOver,
    } as NormalizedAgency,
    fingerprint,
    normalizerVersion: "1.0.0",
  };
}

describe("computeDiff() — base cases", () => {
  it("classifies a new licence as created", () => {
    const current = new Map<string, CurrentAgencyRow>();
    const cs = computeDiff(current, [mkValidated({ licenseNumber: "PVT-NEW" })]);
    expect(cs.created).toHaveLength(1);
    expect(cs.updated).toHaveLength(0);
    expect(cs.unchanged).toHaveLength(0);
    expect(cs.deleted).toHaveLength(0);
    expect(cs.created[0].licenseNumber).toBe("PVT-NEW");
  });

  it("classifies an unchanged fingerprint as unchanged (zero updates)", () => {
    const current = new Map<string, CurrentAgencyRow>([
      ["PVT-EXIST", mkCurrent({ providerRecordFp: "fp-SAME" })],
    ]);
    const validated = [mkValidated({ fingerprint: "fp-SAME" })];
    const cs = computeDiff(current, validated);
    expect(cs.unchanged).toHaveLength(1);
    expect(cs.unchanged[0].agencyId).toBe("uuid-existing");
    expect(cs.updated).toHaveLength(0);
    expect(cs.created).toHaveLength(0);
  });

  it("classifies a fingerprint mismatch as updated AND computes field deltas", () => {
    const current = new Map([
      ["PVT-EXIST", mkCurrent({ providerRecordFp: "fp-OLD", agencyName: "OLDNAME LTD", email: "old@example.com" })],
    ]);
    const validated = [
      mkValidated({ fingerprint: "fp-NEW", agencyName: "NEWNAME LTD", email: "new@example.com" }),
    ];
    const cs = computeDiff(current, validated);
    expect(cs.updated).toHaveLength(1);
    const u = cs.updated[0];
    expect(u.fieldChanges.agencyName).toEqual({ from: "OLDNAME LTD", to: "NEWNAME LTD" });
    expect(u.fieldChanges.email).toEqual({ from: "old@example.com", to: "new@example.com" });
    // Unchanged fields are absent from fieldChanges.
    expect(u.fieldChanges.expiryDate).toBeUndefined();
  });

  it("classifies a DB row absent from this run as deleted", () => {
    const current = new Map([
      ["PVT-EXIST", mkCurrent()],
      ["PVT-OTHER", mkCurrent({ id: "uuid-other", licenseNumber: "PVT-OTHER" })],
    ]);
    const validated = [mkValidated({ licenseNumber: "PVT-EXIST", fingerprint: "fp-OLD" })];
    const cs = computeDiff(current, validated);
    expect(cs.deleted).toHaveLength(1);
    expect(cs.deleted[0].licenseNumber).toBe("PVT-OTHER");
    expect(cs.deleted[0].agencyId).toBe("uuid-other");
    expect(cs.deleted[0].before.statusSource).toBe("verified");
  });
});

describe("computeDiff() — counts + invariants", () => {
  it("counts add up to created + (current rows)", () => {
    const current = new Map<string, CurrentAgencyRow>([
      ["A", mkCurrent({ id: "id-A", licenseNumber: "A", providerRecordFp: "fpA" })],
      ["B", mkCurrent({ id: "id-B", licenseNumber: "B", providerRecordFp: "fpB" })],
      ["C", mkCurrent({ id: "id-C", licenseNumber: "C", providerRecordFp: "fpC" })],
    ]);
    const validated = [
      mkValidated({ licenseNumber: "A", fingerprint: "fpA" }),   // unchanged
      mkValidated({ licenseNumber: "B", fingerprint: "fpB-NEW" }),// updated
      mkValidated({ licenseNumber: "D", fingerprint: "fpD" }),   // created
      // C is absent → deleted
    ];
    const cs = computeDiff(current, validated);
    const counts = countChanges(cs);
    expect(counts.created).toBe(1);
    expect(counts.updated).toBe(1);
    expect(counts.unchanged).toBe(1);
    expect(counts.deleted).toBe(1);
    // total iterations across the four bins
    expect(counts.total).toBe(4);
  });

  it("is deterministic — same inputs produce same outputs", () => {
    const current = new Map([
      ["A", mkCurrent({ id: "id-A", licenseNumber: "A", providerRecordFp: "fpA" })],
    ]);
    const validated = [
      mkValidated({ licenseNumber: "A", fingerprint: "fpA-NEW" }),
    ];
    const a = JSON.stringify(computeDiff(current, validated), mapReplacer);
    const b = JSON.stringify(computeDiff(current, validated), mapReplacer);
    expect(a).toBe(b);
  });

  it("treats null/empty/identical values as no-change in fieldChanges", () => {
    const current = new Map([
      ["A", mkCurrent({ id: "id-A", licenseNumber: "A", providerRecordFp: "fp-OLD", email: null, website: null })],
    ]);
    const validated = [
      mkValidated({ licenseNumber: "A", fingerprint: "fp-NEW", email: null, website: null }),
    ];
    const cs = computeDiff(current, validated);
    expect(cs.updated).toHaveLength(1);
    expect(cs.updated[0].fieldChanges.email).toBeUndefined();
    expect(cs.updated[0].fieldChanges.website).toBeUndefined();
  });
});

function mapReplacer(_k: string, v: any) {
  if (v instanceof Map) return Array.from(v.entries());
  return v;
}
