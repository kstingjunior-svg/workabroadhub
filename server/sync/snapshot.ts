/**
 * Sync Engine — Snapshot capture + storage + restoration (Milestone 3).
 *
 * Per SRS §18: every run writes a JSONL.gz snapshot of its records to
 * Supabase Storage at `sync-snapshots/{provider_slug}/{run_id}.jsonl.gz`,
 * with a `sync_snapshots` row recording the URI + sha256 checksum + size.
 *
 * Architectural decisions:
 *
 *   1. **Storage is abstracted behind SnapshotStore.** Tests use the
 *      in-memory implementation (`MemorySnapshotStore`); production wires
 *      `SupabaseSnapshotStore`. The engine code talks only to the
 *      interface, not the concrete impl.
 *
 *   2. **JSONL format, gzipped.** One JSON object per line — streamable
 *      restore, line-grep-friendly, gzip compresses near-text JSON well.
 *      Format header on line 1 carries provider/run/version stamps so a
 *      bare .jsonl.gz file is self-describing.
 *
 *   3. **Checksum is sha-256 of the gzipped bytes.** Verified on restore.
 *      Integrity errors fail loudly; we never silently use a corrupt
 *      snapshot to drive a recovery run.
 *
 *   4. **Snapshots are immutable.** Once written, never overwritten or
 *      mutated. SRS §18 retention policy ("last 30 successful runs per
 *      provider plus all held-for-review runs forever") is implemented
 *      by a future pruner job, not by overwrite.
 */

import crypto from "node:crypto";
import { gzip as gzipCb, gunzip as gunzipCb } from "node:zlib";
import { promisify } from "node:util";
import type { PoolClient } from "pg";
import type {
  NormalizedAgency,
  ProviderRecord,
  QuarantinedRecord,
  ValidatedRecord,
  ValidationIssue,
} from "./types";

const gzip   = promisify(gzipCb);
const gunzip = promisify(gunzipCb);

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot file format (v1)
// ─────────────────────────────────────────────────────────────────────────────

const SNAPSHOT_FORMAT_VERSION = 1 as const;

/** Header on line 1 — self-describes the file. */
interface SnapshotHeader {
  v: typeof SNAPSHOT_FORMAT_VERSION;
  format: "wah-sync-snapshot";
  runId:        string;
  providerSlug: string;
  providerId:   string;
  capturedAt:   string;
  /** Counts written so a reader can verify file integrity quickly. */
  recordCount: { validated: number; quarantined: number; total: number };
  normalizerVersion:  string;
  fingerprintVersion: number;
}

interface SnapshotLineValidated {
  kind: "validated";
  raw:               ProviderRecord;
  agency:            NormalizedAgency;
  fingerprint:       string;
  normalizerVersion: string;
}

interface SnapshotLineQuarantined {
  kind: "quarantined";
  raw:               ProviderRecord;
  partial:           Partial<NormalizedAgency> | null;
  reasons:           ValidationIssue[];
  normalizerVersion: string | null;
}

type SnapshotLine = SnapshotLineValidated | SnapshotLineQuarantined;

// ─────────────────────────────────────────────────────────────────────────────
// SnapshotStore — abstract storage backend
// ─────────────────────────────────────────────────────────────────────────────

export interface SnapshotStore {
  /** Write `bytes` at `uri`. Returns the canonical URI to store in DB. */
  put(uri: string, bytes: Buffer): Promise<string>;
  /** Read bytes at `uri`. Throws if missing. */
  get(uri: string): Promise<Buffer>;
  /** Optional — used by retention jobs. Not exercised in M3. */
  delete?(uri: string): Promise<void>;
}

/**
 * In-memory store — fast, deterministic, used by tests and dev. Never used
 * in production: server restart loses everything.
 */
export class MemorySnapshotStore implements SnapshotStore {
  private store = new Map<string, Buffer>();

  async put(uri: string, bytes: Buffer): Promise<string> {
    this.store.set(uri, Buffer.from(bytes));
    return uri;
  }
  async get(uri: string): Promise<Buffer> {
    const v = this.store.get(uri);
    if (!v) throw new Error(`[snapshot] not found: ${uri}`);
    return Buffer.from(v);
  }
  async delete(uri: string): Promise<void> {
    this.store.delete(uri);
  }
  /** Test helper. */
  size(): number {
    return this.store.size;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface CaptureSnapshotInput {
  runId:        string;
  providerId:   string;
  providerSlug: string;
  validated:    ReadonlyArray<ValidatedRecord>;
  quarantined:  ReadonlyArray<QuarantinedRecord>;
  normalizerVersion:  string;
  fingerprintVersion: number;
}

export interface CapturedSnapshot {
  snapshotId: string;
  storageUri: string;
  checksum:   string;
  sizeBytes:  number;
  recordCount: number;
}

export interface RestoredSnapshot {
  header:      SnapshotHeader;
  validated:   ValidatedRecord[];
  quarantined: QuarantinedRecord[];
}

// ─────────────────────────────────────────────────────────────────────────────
// captureSnapshot — engine calls this after validation, before apply
// ─────────────────────────────────────────────────────────────────────────────

export async function captureSnapshot(
  store: SnapshotStore,
  input: CaptureSnapshotInput,
  client: PoolClient,
): Promise<CapturedSnapshot> {
  const header: SnapshotHeader = {
    v:                  SNAPSHOT_FORMAT_VERSION,
    format:             "wah-sync-snapshot",
    runId:              input.runId,
    providerSlug:       input.providerSlug,
    providerId:         input.providerId,
    capturedAt:         new Date().toISOString(),
    recordCount: {
      validated:   input.validated.length,
      quarantined: input.quarantined.length,
      total:       input.validated.length + input.quarantined.length,
    },
    normalizerVersion:  input.normalizerVersion,
    fingerprintVersion: input.fingerprintVersion,
  };

  // Build the JSONL document line-by-line. Header first.
  const lines: string[] = [JSON.stringify(header)];

  for (const v of input.validated) {
    const line: SnapshotLineValidated = {
      kind:              "validated",
      raw:               v.raw,
      agency:            v.agency,
      fingerprint:       v.fingerprint,
      normalizerVersion: v.normalizerVersion,
    };
    lines.push(JSON.stringify(line));
  }
  for (const q of input.quarantined) {
    const line: SnapshotLineQuarantined = {
      kind:              "quarantined",
      raw:               q.raw,
      partial:           q.partial,
      reasons:           q.reasons,
      normalizerVersion: q.normalizerVersion,
    };
    lines.push(JSON.stringify(line));
  }

  // Gzip the document.
  const plain    = Buffer.from(lines.join("\n") + "\n", "utf8");
  const gzipped  = await gzip(plain);
  const checksum = crypto.createHash("sha256").update(gzipped).digest("hex");

  const uri      = `sync-snapshots/${input.providerSlug}/${input.runId}.jsonl.gz`;
  const storedUri = await store.put(uri, gzipped);

  // Insert the sync_snapshots row inside the caller's transaction.
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO sync_snapshots
       (provider_id, run_id, captured_at, record_count, storage_uri, checksum, size_bytes)
     VALUES ($1, $2, NOW(), $3, $4, $5, $6)
     RETURNING id`,
    [
      input.providerId, input.runId,
      header.recordCount.total, storedUri, checksum, gzipped.length,
    ],
  );

  return {
    snapshotId:  rows[0].id,
    storageUri:  storedUri,
    checksum,
    sizeBytes:   gzipped.length,
    recordCount: header.recordCount.total,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// restoreSnapshot — load a previously-captured snapshot back into memory
// ─────────────────────────────────────────────────────────────────────────────

export async function restoreSnapshot(
  store: SnapshotStore,
  snapshotId: string,
  client: PoolClient,
): Promise<RestoredSnapshot> {
  // Look up the storage URI + expected checksum.
  const { rows } = await client.query<{
    storage_uri: string; checksum: string; size_bytes: number;
  }>(
    `SELECT storage_uri, checksum, size_bytes
       FROM sync_snapshots
      WHERE id = $1
      LIMIT 1`,
    [snapshotId],
  );
  if (rows.length === 0) {
    throw new Error(`[snapshot] sync_snapshots row not found for id ${snapshotId}`);
  }
  const { storage_uri, checksum, size_bytes } = rows[0];

  // Fetch + verify integrity.
  const gzipped = await store.get(storage_uri);
  if (gzipped.length !== size_bytes) {
    throw new Error(
      `[snapshot] size mismatch for ${storage_uri}: expected ${size_bytes}, got ${gzipped.length}`,
    );
  }
  const actualChecksum = crypto.createHash("sha256").update(gzipped).digest("hex");
  if (actualChecksum !== checksum) {
    throw new Error(
      `[snapshot] checksum mismatch for ${storage_uri}: expected ${checksum}, got ${actualChecksum}`,
    );
  }

  // Decompress + parse line-by-line.
  const plain = (await gunzip(gzipped)).toString("utf8");
  const rawLines = plain.split("\n").filter((l) => l.length > 0);
  if (rawLines.length === 0) {
    throw new Error(`[snapshot] empty document at ${storage_uri}`);
  }

  const header = JSON.parse(rawLines[0]) as SnapshotHeader;
  if (header.format !== "wah-sync-snapshot") {
    throw new Error(`[snapshot] unrecognised format: ${header.format}`);
  }
  if (header.v !== SNAPSHOT_FORMAT_VERSION) {
    // Forward-compat: if we ever bump the format, add a migration step here.
    throw new Error(`[snapshot] unsupported snapshot format version: ${header.v}`);
  }

  const validated:   ValidatedRecord[]    = [];
  const quarantined: QuarantinedRecord[]  = [];

  for (let i = 1; i < rawLines.length; i++) {
    const line = JSON.parse(rawLines[i]) as SnapshotLine;
    if (line.kind === "validated") {
      validated.push({
        raw:               line.raw,
        agency:            line.agency,
        fingerprint:       line.fingerprint,
        normalizerVersion: line.normalizerVersion,
      });
    } else if (line.kind === "quarantined") {
      quarantined.push({
        raw:               line.raw,
        partial:           line.partial,
        reasons:           line.reasons,
        normalizerVersion: line.normalizerVersion,
      });
    }
  }

  // Verify counts against the header.
  if (validated.length !== header.recordCount.validated) {
    throw new Error(
      `[snapshot] validated count drift: header said ${header.recordCount.validated}, ` +
      `got ${validated.length}`,
    );
  }
  if (quarantined.length !== header.recordCount.quarantined) {
    throw new Error(
      `[snapshot] quarantined count drift: header said ${header.recordCount.quarantined}, ` +
      `got ${quarantined.length}`,
    );
  }

  return { header, validated, quarantined };
}
