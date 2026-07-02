import { describe, it, expect, vi } from "vitest";
import {
  captureSnapshot,
  MemorySnapshotStore,
  restoreSnapshot,
} from "../../../server/sync/snapshot";
import type { QuarantinedRecord, ValidatedRecord } from "../../../server/sync/types";

function makeValidated(lic: string): ValidatedRecord {
  return {
    raw:               { agencyName: `${lic} LTD`, licenseNumber: lic, expiryDate: "24/08/2026" },
    agency: {
      agencyName:    `${lic} LTD`,
      licenseNumber: lic,
      country:       "KE",
      serviceType:   "gulf_and_domestic",
      email:         null, website: null, phone: null,
      issueDate:     null, expiryDate: "2026-08-24",
      statusSource:  "verified",
    },
    fingerprint:       `fp-${lic}`,
    normalizerVersion: "1.0.0",
  };
}

function makeQuarantined(lic: string): QuarantinedRecord {
  return {
    raw: { agencyName: `${lic}-Q`, licenseNumber: lic, expiryDate: "BAD" },
    partial: null,
    reasons: [{ path: "expiryDate", code: "invalid_format", message: "bad date" }],
    normalizerVersion: "1.0.0",
  };
}

describe("captureSnapshot + restoreSnapshot", () => {
  it("round-trips records cleanly through the memory store", async () => {
    const store = new MemorySnapshotStore();
    const insertedRow: any[] = [];
    const fakeClient = {
      query: vi.fn(async (sql: string, params: any[]) => {
        if (sql.includes("INSERT INTO sync_snapshots")) {
          insertedRow.push(params);
          return { rows: [{ id: "snap-123" }] };
        }
        if (sql.includes("SELECT storage_uri")) {
          return {
            rows: [{
              storage_uri: insertedRow[0][3],
              checksum:    insertedRow[0][4],
              size_bytes:  insertedRow[0][5],
            }],
          };
        }
        return { rows: [] };
      }),
    };

    const validated   = [makeValidated("PVT-1"), makeValidated("PVT-2")];
    const quarantined = [makeQuarantined("BAD-1")];

    const captured = await captureSnapshot(store, {
      runId:        "run-1",
      providerId:   "prov-1",
      providerSlug: "nea-ke",
      validated,
      quarantined,
      normalizerVersion:  "1.0.0",
      fingerprintVersion: 1,
    }, fakeClient as any);

    expect(captured.snapshotId).toBe("snap-123");
    expect(captured.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(captured.sizeBytes).toBeGreaterThan(0);
    expect(captured.recordCount).toBe(3);
    expect(store.size()).toBe(1);

    const restored = await restoreSnapshot(store, "snap-123", fakeClient as any);
    expect(restored.header.runId).toBe("run-1");
    expect(restored.header.providerSlug).toBe("nea-ke");
    expect(restored.header.recordCount.total).toBe(3);
    expect(restored.validated).toHaveLength(2);
    expect(restored.quarantined).toHaveLength(1);
    expect(restored.validated[0].agency.licenseNumber).toBe("PVT-1");
    expect(restored.quarantined[0].reasons[0].code).toBe("invalid_format");
  });
});

describe("restoreSnapshot — integrity checks", () => {
  it("rejects when the checksum doesn't match", async () => {
    const store = new MemorySnapshotStore();
    const fakeClient = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("INSERT")) return { rows: [{ id: "snap-X" }] };
        if (sql.includes("SELECT storage_uri")) {
          return {
            rows: [{
              storage_uri: "sync-snapshots/x/y.jsonl.gz",
              checksum:    "0000000000000000000000000000000000000000000000000000000000000000",
              size_bytes:  10,
            }],
          };
        }
        return { rows: [] };
      }),
    };
    // Put a payload with the right size but wrong checksum
    await store.put("sync-snapshots/x/y.jsonl.gz", Buffer.alloc(10, 0x42));
    await expect(
      restoreSnapshot(store, "snap-X", fakeClient as any),
    ).rejects.toThrow(/checksum mismatch/);
  });

  it("rejects when the size doesn't match", async () => {
    const store = new MemorySnapshotStore();
    const fakeClient = {
      query: vi.fn(async () => ({
        rows: [{
          storage_uri: "u",
          checksum:    "x",
          size_bytes:  9999,
        }],
      })),
    };
    await store.put("u", Buffer.alloc(10));
    await expect(
      restoreSnapshot(store, "snap-X", fakeClient as any),
    ).rejects.toThrow(/size mismatch/);
  });
});
