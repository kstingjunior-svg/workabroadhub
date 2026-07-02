import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PoolClient } from "pg";

// ─────────────────────────────────────────────────────────────────────────────
// Mock the storage layer BEFORE importing apply.ts.
// We replay the call sequence into in-memory state and assert on it.
// ─────────────────────────────────────────────────────────────────────────────

const txnLog: string[] = [];
const writtenChangeLog: any[] = [];
const upsertCalls: any[] = [];
const deletedIds: string[] = [];
const touchedIds: string[] = [];
const insertedRecords: any[] = [];

let mockMode: "happy" | "throw_mid_apply" = "happy";

vi.mock("../../../server/sync/storage", () => ({
  // Drive the transaction. On the "throw" mode, an upsert throws mid-flight
  // and we assert the rollback path.
  withTransaction: async (fn: (c: PoolClient) => Promise<unknown>) => {
    txnLog.push("BEGIN");
    try {
      const result = await fn({} as PoolClient);
      txnLog.push("COMMIT");
      return result;
    } catch (err) {
      txnLog.push("ROLLBACK");
      throw err;
    }
  },
  insertSyncRecords: async (
    _runId: string, _providerId: string, _nv: string,
    validated: any[], quarantined: any[],
  ) => {
    insertedRecords.push({ validated: validated.length, quarantined: quarantined.length });
  },
  upsertAgency: async (_providerId: string, agency: any, fp: string) => {
    upsertCalls.push({ lic: agency.licenseNumber, fp });
    if (mockMode === "throw_mid_apply" && upsertCalls.length === 2) {
      throw new Error("simulated mid-apply DB failure");
    }
    // Distinguish created vs updated by a marker in licence — tests set it.
    const wasCreated = agency.licenseNumber.startsWith("NEW-");
    return { id: `id-${agency.licenseNumber}`, wasCreated };
  },
  markAgencyDeletedFromSource: async (agencyId: string) => {
    deletedIds.push(agencyId);
  },
  touchAgencyLastSeen: async (agencyId: string) => {
    touchedIds.push(agencyId);
  },
  writeChangeLog: async (entries: any[]) => {
    writtenChangeLog.push(...entries);
  },
}));

// Import after mock is in place.
const { applyChangeSet } = await import("../../../server/sync/apply");

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

function mkAgency(over: Partial<any> = {}) {
  return {
    agencyName: "X LTD", licenseNumber: "X", country: "KE", serviceType: "gulf_and_domestic",
    email: null, website: null, phone: null, issueDate: null, expiryDate: "2027-01-01",
    statusSource: "verified", ...over,
  };
}

function mkValidated(over: any) {
  return {
    raw:               over.raw ?? {},
    agency:            mkAgency(over.agency ?? { licenseNumber: over.lic ?? "X" }),
    fingerprint:       over.fingerprint ?? "fp",
    normalizerVersion: "1.0.0",
  };
}

beforeEach(() => {
  txnLog.length = 0;
  writtenChangeLog.length = 0;
  upsertCalls.length = 0;
  deletedIds.length = 0;
  touchedIds.length = 0;
  insertedRecords.length = 0;
  mockMode = "happy";
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("applyChangeSet — happy path", () => {
  it("writes created + updated + deleted in one transaction", async () => {
    const changes = {
      created:   [{ licenseNumber: "NEW-1", agency: mkAgency({ licenseNumber: "NEW-1" }), fingerprint: "fp1" }],
      updated:   [{
        licenseNumber: "UPD-1", agencyId: "id-UPD-1",
        agency: mkAgency({ licenseNumber: "UPD-1" }), fingerprint: "fp2",
        fieldChanges: { agencyName: { from: "OLD", to: "NEW" } },
      }],
      unchanged: [{ licenseNumber: "SAME-1", agencyId: "id-SAME-1" }],
      deleted:   [{
        licenseNumber: "DEL-1", agencyId: "id-DEL-1",
        before: { id: "id-DEL-1", agencyName: "DELETED LTD", licenseNumber: "DEL-1",
                  country: "KE", serviceType: "gulf_and_domestic", email: null, website: null,
                  phone: null, issueDate: null, expiryDate: "2027-01-01",
                  statusSource: "verified", providerRecordFp: "fp-old" },
      }],
    };
    const ctx = { providerId: "p-1", runId: "r-1", performedBy: "user-1" };
    const validated = [mkValidated({ lic: "NEW-1" }), mkValidated({ lic: "UPD-1" })];
    const result = await applyChangeSet(changes as any, ctx, validated, [], "1.0.0");

    expect(txnLog).toEqual(["BEGIN", "COMMIT"]);
    expect(result.createdCount).toBe(1);
    expect(result.updatedCount).toBe(1);
    expect(result.unchangedCount).toBe(1);
    expect(result.deletedCount).toBe(1);
    expect(result.changeLogCount).toBe(3); // created + updated + deleted (unchanged has no log)

    expect(upsertCalls).toHaveLength(2);
    expect(deletedIds).toEqual(["id-DEL-1"]);
    expect(touchedIds).toEqual(["id-SAME-1"]);
    expect(insertedRecords).toHaveLength(1);
  });

  it("writes change_log with full field dict on created rows", async () => {
    const changes = {
      created: [{
        licenseNumber: "NEW-1",
        agency: mkAgency({ licenseNumber: "NEW-1", agencyName: "FRESH AGENCY LTD", email: "fresh@example.com" }),
        fingerprint: "fp1",
      }],
      updated: [], unchanged: [], deleted: [],
    };
    await applyChangeSet(changes as any, { providerId: "p-1", runId: "r-1", performedBy: "user-1" },
                        [mkValidated({ lic: "NEW-1" })], [], "1.0.0");

    expect(writtenChangeLog).toHaveLength(1);
    const entry = writtenChangeLog[0];
    expect(entry.changeType).toBe("created");
    expect(entry.fieldChanges.agencyName).toEqual({ from: null, to: "FRESH AGENCY LTD" });
    expect(entry.fieldChanges.email).toEqual({ from: null, to: "fresh@example.com" });
  });

  it("writes change_log with status_source flip on deleted rows", async () => {
    const changes = {
      created: [], updated: [], unchanged: [],
      deleted: [{
        licenseNumber: "DEL-1", agencyId: "id-DEL-1",
        before: { id: "id-DEL-1", agencyName: "DEL LTD", licenseNumber: "DEL-1",
                  country: "KE", serviceType: "gulf_and_domestic", email: null, website: null,
                  phone: null, issueDate: null, expiryDate: "2027-01-01",
                  statusSource: "verified", providerRecordFp: "fp-old" },
      }],
    };
    await applyChangeSet(changes as any, { providerId: "p-1", runId: "r-1", performedBy: "user-1" },
                        [], [], "1.0.0");

    const entry = writtenChangeLog[0];
    expect(entry.changeType).toBe("deleted");
    expect(entry.fieldChanges.status_source).toEqual({ from: "verified", to: "expired" });
    expect(entry.reason).toContain("Absent from source");
  });
});

describe("applyChangeSet — transaction safety", () => {
  it("rolls back the transaction when a mid-flight write fails", async () => {
    mockMode = "throw_mid_apply";
    const changes = {
      created: [
        { licenseNumber: "NEW-1", agency: mkAgency({ licenseNumber: "NEW-1" }), fingerprint: "fp1" },
        { licenseNumber: "NEW-2", agency: mkAgency({ licenseNumber: "NEW-2" }), fingerprint: "fp2" },
      ],
      updated: [], unchanged: [], deleted: [],
    };

    await expect(
      applyChangeSet(changes as any, { providerId: "p-1", runId: "r-1", performedBy: "u" },
                    [mkValidated({ lic: "NEW-1" }), mkValidated({ lic: "NEW-2" })], [], "1.0.0"),
    ).rejects.toThrow(/simulated mid-apply DB failure/);

    expect(txnLog).toEqual(["BEGIN", "ROLLBACK"]);
    // Even though one upsert succeeded before the failure, the rollback
    // means callers see an all-or-nothing outcome — exactly the NFR-2 promise.
  });
});

describe("applyChangeSet — idempotency", () => {
  it("re-applying the same change set produces no writes against the diff", async () => {
    // A re-run produces all-unchanged because Diff already excluded the
    // matching fingerprints. Apply should see only the unchanged bin and
    // touch last_seen_at — no upserts, no deletes, no change-log rows.
    const changes = {
      created: [], updated: [], deleted: [],
      unchanged: [
        { licenseNumber: "A", agencyId: "id-A" },
        { licenseNumber: "B", agencyId: "id-B" },
      ],
    };
    const r = await applyChangeSet(changes as any, { providerId: "p-1", runId: "r-2", performedBy: "u" },
                                   [], [], "1.0.0");
    expect(upsertCalls).toHaveLength(0);
    expect(deletedIds).toHaveLength(0);
    expect(writtenChangeLog).toHaveLength(0);
    expect(touchedIds).toEqual(["id-A", "id-B"]);
    expect(r.changeLogCount).toBe(0);
  });
});
