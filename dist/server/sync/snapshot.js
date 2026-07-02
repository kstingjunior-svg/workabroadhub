"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemorySnapshotStore = void 0;
exports.captureSnapshot = captureSnapshot;
exports.restoreSnapshot = restoreSnapshot;
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_zlib_1 = require("node:zlib");
const node_util_1 = require("node:util");
const gzip = (0, node_util_1.promisify)(node_zlib_1.gzip);
const gunzip = (0, node_util_1.promisify)(node_zlib_1.gunzip);
// ─────────────────────────────────────────────────────────────────────────────
// Snapshot file format (v1)
// ─────────────────────────────────────────────────────────────────────────────
const SNAPSHOT_FORMAT_VERSION = 1;
/**
 * In-memory store — fast, deterministic, used by tests and dev. Never used
 * in production: server restart loses everything.
 */
class MemorySnapshotStore {
    constructor() {
        this.store = new Map();
    }
    async put(uri, bytes) {
        this.store.set(uri, Buffer.from(bytes));
        return uri;
    }
    async get(uri) {
        const v = this.store.get(uri);
        if (!v)
            throw new Error(`[snapshot] not found: ${uri}`);
        return Buffer.from(v);
    }
    async delete(uri) {
        this.store.delete(uri);
    }
    /** Test helper. */
    size() {
        return this.store.size;
    }
}
exports.MemorySnapshotStore = MemorySnapshotStore;
// ─────────────────────────────────────────────────────────────────────────────
// captureSnapshot — engine calls this after validation, before apply
// ─────────────────────────────────────────────────────────────────────────────
async function captureSnapshot(store, input, client) {
    const header = {
        v: SNAPSHOT_FORMAT_VERSION,
        format: "wah-sync-snapshot",
        runId: input.runId,
        providerSlug: input.providerSlug,
        providerId: input.providerId,
        capturedAt: new Date().toISOString(),
        recordCount: {
            validated: input.validated.length,
            quarantined: input.quarantined.length,
            total: input.validated.length + input.quarantined.length,
        },
        normalizerVersion: input.normalizerVersion,
        fingerprintVersion: input.fingerprintVersion,
    };
    // Build the JSONL document line-by-line. Header first.
    const lines = [JSON.stringify(header)];
    for (const v of input.validated) {
        const line = {
            kind: "validated",
            raw: v.raw,
            agency: v.agency,
            fingerprint: v.fingerprint,
            normalizerVersion: v.normalizerVersion,
        };
        lines.push(JSON.stringify(line));
    }
    for (const q of input.quarantined) {
        const line = {
            kind: "quarantined",
            raw: q.raw,
            partial: q.partial,
            reasons: q.reasons,
            normalizerVersion: q.normalizerVersion,
        };
        lines.push(JSON.stringify(line));
    }
    // Gzip the document.
    const plain = Buffer.from(lines.join("\n") + "\n", "utf8");
    const gzipped = await gzip(plain);
    const checksum = node_crypto_1.default.createHash("sha256").update(gzipped).digest("hex");
    const uri = `sync-snapshots/${input.providerSlug}/${input.runId}.jsonl.gz`;
    const storedUri = await store.put(uri, gzipped);
    // Insert the sync_snapshots row inside the caller's transaction.
    const { rows } = await client.query(`INSERT INTO sync_snapshots
       (provider_id, run_id, captured_at, record_count, storage_uri, checksum, size_bytes)
     VALUES ($1, $2, NOW(), $3, $4, $5, $6)
     RETURNING id`, [
        input.providerId, input.runId,
        header.recordCount.total, storedUri, checksum, gzipped.length,
    ]);
    return {
        snapshotId: rows[0].id,
        storageUri: storedUri,
        checksum,
        sizeBytes: gzipped.length,
        recordCount: header.recordCount.total,
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// restoreSnapshot — load a previously-captured snapshot back into memory
// ─────────────────────────────────────────────────────────────────────────────
async function restoreSnapshot(store, snapshotId, client) {
    // Look up the storage URI + expected checksum.
    const { rows } = await client.query(`SELECT storage_uri, checksum, size_bytes
       FROM sync_snapshots
      WHERE id = $1
      LIMIT 1`, [snapshotId]);
    if (rows.length === 0) {
        throw new Error(`[snapshot] sync_snapshots row not found for id ${snapshotId}`);
    }
    const { storage_uri, checksum, size_bytes } = rows[0];
    // Fetch + verify integrity.
    const gzipped = await store.get(storage_uri);
    if (gzipped.length !== size_bytes) {
        throw new Error(`[snapshot] size mismatch for ${storage_uri}: expected ${size_bytes}, got ${gzipped.length}`);
    }
    const actualChecksum = node_crypto_1.default.createHash("sha256").update(gzipped).digest("hex");
    if (actualChecksum !== checksum) {
        throw new Error(`[snapshot] checksum mismatch for ${storage_uri}: expected ${checksum}, got ${actualChecksum}`);
    }
    // Decompress + parse line-by-line.
    const plain = (await gunzip(gzipped)).toString("utf8");
    const rawLines = plain.split("\n").filter((l) => l.length > 0);
    if (rawLines.length === 0) {
        throw new Error(`[snapshot] empty document at ${storage_uri}`);
    }
    const header = JSON.parse(rawLines[0]);
    if (header.format !== "wah-sync-snapshot") {
        throw new Error(`[snapshot] unrecognised format: ${header.format}`);
    }
    if (header.v !== SNAPSHOT_FORMAT_VERSION) {
        // Forward-compat: if we ever bump the format, add a migration step here.
        throw new Error(`[snapshot] unsupported snapshot format version: ${header.v}`);
    }
    const validated = [];
    const quarantined = [];
    for (let i = 1; i < rawLines.length; i++) {
        const line = JSON.parse(rawLines[i]);
        if (line.kind === "validated") {
            validated.push({
                raw: line.raw,
                agency: line.agency,
                fingerprint: line.fingerprint,
                normalizerVersion: line.normalizerVersion,
            });
        }
        else if (line.kind === "quarantined") {
            quarantined.push({
                raw: line.raw,
                partial: line.partial,
                reasons: line.reasons,
                normalizerVersion: line.normalizerVersion,
            });
        }
    }
    // Verify counts against the header.
    if (validated.length !== header.recordCount.validated) {
        throw new Error(`[snapshot] validated count drift: header said ${header.recordCount.validated}, ` +
            `got ${validated.length}`);
    }
    if (quarantined.length !== header.recordCount.quarantined) {
        throw new Error(`[snapshot] quarantined count drift: header said ${header.recordCount.quarantined}, ` +
            `got ${quarantined.length}`);
    }
    return { header, validated, quarantined };
}
