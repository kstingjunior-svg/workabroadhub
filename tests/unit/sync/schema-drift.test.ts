import { describe, it, expect } from "vitest";
import {
  signSchema,
  detectSchemaDrift,
  SCHEMA_DRIFT_REPORT_VERSION,
} from "../../../server/sync/schema-drift";

const baseRecord = {
  licenseNumber: "NEA-1",
  agencyName:    "ACME LTD",
  email:         "a@x.com",
  expiryDate:    "2027-01-01",
};

describe("signSchema", () => {
  it("captures keys, mode types, presence", () => {
    const sig = signSchema([baseRecord, baseRecord, { ...baseRecord, email: null }]);
    expect(sig.version).toBe(SCHEMA_DRIFT_REPORT_VERSION);
    expect(sig.keys.sort()).toEqual(["agencyName", "email", "expiryDate", "licenseNumber"]);
    expect(sig.byKey.licenseNumber.modeType).toBe("string");
    expect(sig.byKey.email.nullSharePct).toBeGreaterThan(0);
  });

  it("produces deterministic hashes", () => {
    const a = signSchema([baseRecord, baseRecord]);
    const b = signSchema([baseRecord, baseRecord]);
    expect(a.hash).toBe(b.hash);
  });

  it("hash differs when a key's mode type changes", () => {
    const a = signSchema([baseRecord]);
    const b = signSchema([{ ...baseRecord, licenseNumber: 12345 as unknown as string }]);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe("detectSchemaDrift", () => {
  it("returns empty findings when there's no prior signature", () => {
    const report = detectSchemaDrift({
      providerSlug: "nea-ke",
      rawSample: [baseRecord],
      priorSignature: null,
    });
    expect(report.prior).toBeNull();
    expect(report.findings).toEqual([]);
    expect(report.worstSeverity).toBeNull();
  });

  it("emits info for a new key, critical for a removed key", () => {
    const prior = signSchema([baseRecord]);
    const report = detectSchemaDrift({
      providerSlug: "nea-ke",
      rawSample: [{ agencyName: "ACME LTD", licenseNumber: "NEA-1", newField: "x" }],
      priorSignature: prior,
    });
    expect(report.findings.some((f) => f.kind === "key_added" && f.key === "newField")).toBe(true);
    expect(report.findings.some((f) => f.kind === "key_removed" && f.key === "email")).toBe(true);
    expect(report.worstSeverity).toBe("critical");
  });

  it("flags type_changed without double-flagging removed/added", () => {
    const prior = signSchema([baseRecord]);
    const report = detectSchemaDrift({
      providerSlug: "nea-ke",
      rawSample: [{ ...baseRecord, licenseNumber: 99 as unknown as string }],
      priorSignature: prior,
    });
    const tc = report.findings.find((f) => f.kind === "type_changed");
    expect(tc).toBeTruthy();
    expect(tc?.fromType).toBe("string");
    expect(tc?.toType).toBe("number");
    expect(report.findings.filter((f) => f.kind === "key_removed")).toHaveLength(0);
  });

  it("detects case_changed and treats it as a single warning, not add+remove", () => {
    const prior = signSchema([{ License_Number: "X", AgencyName: "A" }]);
    const report = detectSchemaDrift({
      providerSlug: "nea-ke",
      rawSample: [{ license_number: "X", agencyName: "A" }],
      priorSignature: prior,
    });
    const cases = report.findings.filter((f) => f.kind === "case_changed");
    expect(cases.length).toBe(2); // both keys re-cased
    expect(report.findings.filter((f) => f.kind === "key_added")).toHaveLength(0);
    expect(report.findings.filter((f) => f.kind === "key_removed")).toHaveLength(0);
  });

  it("flags presence_dropped when threshold crossed", () => {
    const prior = signSchema([baseRecord, baseRecord, baseRecord, baseRecord]);
    // Build a sample where email is present in only 10% of rows (1 of 10).
    const sample: any[] = Array.from({ length: 10 }, (_, i) => ({
      licenseNumber: `L-${i}`,
      agencyName: `A-${i}`,
      expiryDate: "2027-01-01",
      ...(i === 0 ? { email: "x@x.com" } : {}),
    }));
    const report = detectSchemaDrift({
      providerSlug: "nea-ke",
      rawSample: sample,
      priorSignature: prior,
    });
    const drop = report.findings.find((f) => f.kind === "presence_dropped" && f.key === "email");
    expect(drop).toBeTruthy();
  });
});
