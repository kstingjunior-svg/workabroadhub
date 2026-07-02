import { describe, it, expect } from "vitest";
import {
  generateDataQualityReport,
  DATA_QUALITY_REPORT_VERSION,
} from "../../../server/sync/quality-report";
import type { ChangeSet } from "../../../server/sync/diff";
import type { CurrentAgencyRow } from "../../../server/sync/storage";
import type {
  QuarantinedRecord,
  ValidatedRecord,
} from "../../../server/sync/types";

function mkValidated(lic: string): ValidatedRecord {
  return {
    raw: { licenseNumber: lic },
    agency: {
      agencyName: `${lic} LTD`, licenseNumber: lic, country: "KE",
      serviceType: "gulf_and_domestic", email: null, website: null, phone: null,
      issueDate: null, expiryDate: "2027-01-01", statusSource: "verified",
    },
    fingerprint: `fp-${lic}`,
    normalizerVersion: "1.0.0",
  };
}

function mkQuarantined(lic: string, code: any, stage: "normalize" | "validate" = "validate"): QuarantinedRecord {
  return {
    raw: { licenseNumber: lic },
    partial: null,
    reasons: [{
      path: stage === "normalize" ? "(normalize)" : "expiryDate",
      code,
      message: "test",
    }],
    normalizerVersion: stage === "normalize" ? null : "1.0.0",
  };
}

function mkBefore(lic: string): CurrentAgencyRow {
  return {
    id: `id-${lic}`,
    agencyName: `${lic} LTD`,
    licenseNumber: lic,
    country: "KE",
    serviceType: "gulf_and_domestic",
    email: null, website: null, phone: null,
    issueDate: null, expiryDate: "2027-01-01",
    statusSource: "verified",
    providerRecordFp: `fp-${lic}`,
  };
}

describe("generateDataQualityReport", () => {
  it("emits a versioned report with totals + breakdowns", () => {
    const validated   = [mkValidated("A"), mkValidated("B")];
    const quarantined = [mkQuarantined("Q1", "required"), mkQuarantined("Q2", "required"), mkQuarantined("Q3", "invalid_format")];
    const changes: ChangeSet = {
      created:   [{ licenseNumber: "A", agency: validated[0].agency, fingerprint: validated[0].fingerprint }],
      updated:   [{ licenseNumber: "B", agencyId: "id-B", agency: validated[1].agency, fingerprint: validated[1].fingerprint,
                    fieldChanges: { email: { from: null, to: "x@example.com" } } }],
      unchanged: [],
      deleted:   [],
    };

    const report = generateDataQualityReport({
      runId: "r1",
      providerSlug: "nea-ke",
      fetched: 5,
      validated, quarantined,
      changes,
      counts: { created: 1, updated: 1, unchanged: 0, deleted: 0, total: 2 },
      normalizerVersion: "1.0.0",
      fingerprintVersion: 1,
      safety: { anomalyScore: 35, held: false, anomalies: [] },
    });

    expect(report.version).toBe(DATA_QUALITY_REPORT_VERSION);
    expect(report.totals.fetched).toBe(5);
    expect(report.totals.validated).toBe(2);
    expect(report.totals.quarantined).toBe(3);
    expect(report.totals.created).toBe(1);
    expect(report.totals.updated).toBe(1);

    // Quarantine breakdown
    expect(report.quarantine.byCode.required).toBe(2);
    expect(report.quarantine.byCode.invalid_format).toBe(1);
    expect(report.quarantine.ratePct).toBe(60); // 3 of 5 = 60%
    expect(report.quarantine.samples.length).toBeLessThanOrEqual(10);

    // Drift breakdown — one email change in this run
    expect(report.drift.fieldChangeFrequency.email).toBe(1);
    expect(report.drift.statusFlips).toBe(0);

    // Versions trail
    expect(report.versions.normalizer).toBe("1.0.0");
    expect(report.versions.fingerprint).toBe(1);
  });

  it("classifies stage correctly using the (normalize) path marker", () => {
    const quarantined = [
      mkQuarantined("Q1", "invalid_format", "normalize"),
      mkQuarantined("Q2", "invalid_format", "normalize"),
      mkQuarantined("Q3", "required",       "validate"),
    ];
    const report = generateDataQualityReport({
      runId: "r1", providerSlug: "nea-ke",
      fetched: 10,
      validated: [], quarantined,
      changes: { created: [], updated: [], unchanged: [], deleted: [] },
      counts:  { created: 0, updated: 0, unchanged: 0, deleted: 0, total: 0 },
      normalizerVersion: "1.0.0", fingerprintVersion: 1,
      safety: { anomalyScore: 0, held: false, anomalies: [] },
    });
    expect(report.quarantine.byStage).toEqual({ normalize: 2, validate: 1 });
  });

  it("propagates safety anomalies into the report", () => {
    const report = generateDataQualityReport({
      runId: "r1", providerSlug: "nea-ke",
      fetched: 100, validated: [], quarantined: [],
      changes: { created: [], updated: [], unchanged: [], deleted: [] },
      counts:  { created: 0, updated: 0, unchanged: 0, deleted: 0, total: 0 },
      normalizerVersion: "1.0.0", fingerprintVersion: 1,
      safety: {
        anomalyScore: 95, held: true,
        anomalies: [{
          type: "mass_delete", severity: "critical",
          metricValue: 80, threshold: 20,
          message: "huge delete",
          sampleData: [],
        }],
      },
    });
    expect(report.safety.held).toBe(true);
    expect(report.safety.anomalyScore).toBe(95);
    expect(report.safety.anomalies).toHaveLength(1);
    expect(report.safety.anomalies[0].type).toBe("mass_delete");
  });

  it("caps drift samples at TOP_N (10)", () => {
    const changes: ChangeSet = {
      created: [], unchanged: [], deleted: [],
      updated: Array.from({ length: 20 }, (_, i) => ({
        licenseNumber: `LIC-${i}`, agencyId: `id-${i}`,
        agency: mkValidated(`LIC-${i}`).agency, fingerprint: `fp-${i}`,
        fieldChanges: { agencyName: { from: "OLD", to: "NEW" }, email: { from: null, to: "x@x" } },
      })),
    };
    const report = generateDataQualityReport({
      runId: "r1", providerSlug: "nea-ke",
      fetched: 20, validated: [], quarantined: [],
      changes,
      counts: { created: 0, updated: 20, unchanged: 0, deleted: 0, total: 20 },
      normalizerVersion: "1.0.0", fingerprintVersion: 1,
      safety: { anomalyScore: 0, held: false, anomalies: [] },
    });
    expect(report.drift.samples.length).toBe(10);
  });
});
