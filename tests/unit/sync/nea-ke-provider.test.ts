import { describe, it, expect } from "vitest";
import { neaKeProvider } from "../../../server/sync/providers/nea-ke";
import { NEA_KE_RECORDS, NEA_KE_RECORD_COUNT } from "../../../server/sync/providers/data/nea-ke-records";
import type { ProviderRecord } from "../../../server/sync/types";

describe("NeaKeProvider — metadata + identity", () => {
  it("exposes the canonical slug + country", () => {
    expect(neaKeProvider.slug).toBe("nea-ke");
    expect(neaKeProvider.country).toBe("KE");
    expect(neaKeProvider.displayName).toBe("Kenya National Employment Authority");
  });

  it("declares itself static (M1) with the expected adapter version", () => {
    const m = neaKeProvider.metadata();
    expect(m.isStatic).toBe(true);
    expect(m.adapterVersion).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(m.upstreamUrl).toContain("nea.go.ke");
  });

  it("declares its capabilities honestly (ADR-0002)", () => {
    const m = neaKeProvider.metadata();
    expect(m.capabilities.supportsPagination).toBe(true);
    expect(m.capabilities.supportsIncrementalSync).toBe(false);
    expect(m.capabilities.supportsWebhooks).toBe(false);
    expect(m.capabilities.supportsFiltering).toBe(false);
    expect(m.capabilities.supportsSearch).toBe(false);
    expect(m.capabilities.supportsUpstreamSnapshots).toBe(false);
    expect(m.capabilities.supportsHealthProbe).toBe(false);
  });
});

describe("NeaKeProvider — health check", () => {
  it("reports healthy when the dataset is present", async () => {
    const h = await neaKeProvider.healthCheck();
    expect(h.status).toBe("healthy");
    expect(h.message).toContain(String(NEA_KE_RECORD_COUNT));
  });
});

describe("NeaKeProvider — fetchRecords streaming", () => {
  it("yields the full dataset in 100-record pages by default", async () => {
    let pageCount = 0;
    let recordCount = 0;
    for await (const page of neaKeProvider.fetchRecords()) {
      pageCount++;
      recordCount += page.length;
      // All pages but the last must be 100; the last may be smaller.
      // (No assertion on exact size — just that the page is non-empty.)
      expect(page.length).toBeGreaterThan(0);
      expect(page.length).toBeLessThanOrEqual(100);
    }
    expect(recordCount).toBe(NEA_KE_RECORD_COUNT);
    expect(pageCount).toBe(Math.ceil(NEA_KE_RECORD_COUNT / 100));
  });

  it("respects opts.limit", async () => {
    let recordCount = 0;
    for await (const page of neaKeProvider.fetchRecords({ limit: 50 })) {
      recordCount += page.length;
    }
    expect(recordCount).toBe(50);
  });

  it("stops yielding when opts.signal is aborted", async () => {
    const controller = new AbortController();
    let received = 0;
    const iterator = neaKeProvider.fetchRecords({ signal: controller.signal })[Symbol.asyncIterator]();
    const first = await iterator.next();
    received += (first.value as ProviderRecord[]).length;
    controller.abort();
    const second = await iterator.next();
    // After abort, the generator returns done immediately.
    expect(second.done).toBe(true);
    expect(received).toBeGreaterThan(0);
  });
});

describe("NeaKeProvider — normalize()", () => {
  it("maps all known fields to the canonical shape", () => {
    const raw = NEA_KE_RECORDS[0] as unknown as ProviderRecord;
    const norm = neaKeProvider.normalize(raw);

    expect(norm.country).toBe("KE");
    expect(norm.statusSource).toBe("verified");
    expect(norm.agencyName).toMatch(/^[A-Z]/);  // uppercased
    expect(norm.licenseNumber).toMatch(/^[A-Z]/); // uppercased
    expect(norm.expiryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("leaves issueDate null (M1 — portal doesn't expose it)", () => {
    const raw = NEA_KE_RECORDS[0] as unknown as ProviderRecord;
    const norm = neaKeProvider.normalize(raw);
    expect(norm.issueDate).toBeNull();
  });

  it("leaves website/phone null (portal doesn't expose them)", () => {
    const raw = NEA_KE_RECORDS[0] as unknown as ProviderRecord;
    const norm = neaKeProvider.normalize(raw);
    expect(norm.website).toBeNull();
    expect(norm.phone).toBeNull();
  });

  it("maps service type from NEA's free-text vocabulary", () => {
    const both = neaKeProvider.normalize({
      agencyName: "X", licenseNumber: "PVT-1", email: null,
      serviceType: "BOTH LOCAL & INTERNATIONAL LICENSE",
      issueDate: "2025-01-01", expiryDate: "2026-01-01",
    } as unknown as ProviderRecord);
    expect(both.serviceType).toBe("gulf_and_domestic");

    const na = neaKeProvider.normalize({
      agencyName: "X", licenseNumber: "PVT-1", email: null,
      serviceType: "N/A",
      issueDate: null, expiryDate: "2026-01-01",
    } as unknown as ProviderRecord);
    expect(na.serviceType).toBe("unspecified");
  });

  it("is deterministic — same input always produces the same output", () => {
    const raw = NEA_KE_RECORDS[10] as unknown as ProviderRecord;
    const a = neaKeProvider.normalize(raw);
    const b = neaKeProvider.normalize({ ...raw });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("NeaKeProvider — validate()", () => {
  it("accepts canonical NEA licence shapes", () => {
    for (const lic of [
      "PVT-DLULXGQX",
      "PVT/2016/008225",
      "CPR/2011/53972",
      "CR-A31G73V",
      "REF/NEA/FE&LE/S/042",
      "C.91675",
      "C152732",
      "284",
    ]) {
      const result = neaKeProvider.validate({
        agencyName: "X", licenseNumber: lic, country: "KE", serviceType: "gulf_and_domestic",
        email: null, website: null, phone: null, issueDate: null, expiryDate: "2027-01-01",
        statusSource: "verified",
      });
      expect(result.ok, `licence=${lic}`).toBe(true);
    }
  });

  it("rejects licence numbers outside the NEA prefix set", () => {
    const result = neaKeProvider.validate({
      agencyName: "X", licenseNumber: "FAKE-123", country: "KE", serviceType: "gulf_and_domestic",
      email: null, website: null, phone: null, issueDate: null, expiryDate: "2027-01-01",
      statusSource: "verified",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons[0].path).toBe("licenseNumber");
      expect(result.reasons[0].message).toContain("NEA-KE prefix");
    }
  });
});
