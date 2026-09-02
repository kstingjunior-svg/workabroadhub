"use strict";
/**
 * Sync Engine — fingerprint (Milestone 1).
 *
 * Deterministic content hash of a NormalizedAgency. The fingerprint drives
 * the diff algorithm: identical fingerprints across runs are no-ops; a
 * mismatch is an update.
 *
 * Field order is FROZEN by this module. If the order changes (or if a new
 * field is added to the tuple), bump FINGERPRINT_VERSION so that every
 * stored fingerprint becomes stale, the diff engine sees them all as
 * changed, and the snapshot retains a record of the prior shape.
 *
 * The fingerprint is sha-256 hex of a canonical pipe-joined tuple. We
 * deliberately do NOT use JSON.stringify — that algorithm is order-sensitive
 * but ALSO whitespace-sensitive across runtimes, which would make
 * cross-environment comparisons fragile.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FINGERPRINT_VERSION = void 0;
exports.fingerprint = fingerprint;
exports.versionedFingerprint = versionedFingerprint;
const node_crypto_1 = __importDefault(require("node:crypto"));
/**
 * Bump this when the FIELD_ORDER changes shape. Append-only over time so
 * older fingerprints can be reconstructed if anyone wants to time-travel
 * a comparison.
 *
 * v1 (2026-06, M1): initial — agencyName, licenseNumber, country, serviceType,
 *                   email, website, phone, issueDate, expiryDate, statusSource
 */
exports.FINGERPRINT_VERSION = 1;
/**
 * The frozen tuple. Order matters; changing it MUST bump FINGERPRINT_VERSION.
 * Nullable fields use the empty string in the tuple so missing-vs-empty is
 * indistinguishable at the hash level (intentional; a provider switching
 * from null to "" should not cause a diff).
 */
const FIELD_ORDER = [
    "agencyName",
    "licenseNumber",
    "country",
    "serviceType",
    "email",
    "website",
    "phone",
    "issueDate",
    "expiryDate",
    "statusSource",
];
/**
 * Compute the fingerprint for a NormalizedAgency.
 *
 * Output format: 64-char lowercase hex sha-256. The caller may want to
 * prefix this with `v${FINGERPRINT_VERSION}:` when persisting; we leave
 * that decision to the storage layer (M2) to keep this module pure.
 */
function fingerprint(agency) {
    const tuple = FIELD_ORDER.map((field) => fieldToCanonicalString(agency[field])).join("|");
    return node_crypto_1.default.createHash("sha256").update(tuple, "utf8").digest("hex");
}
/**
 * Variant that includes the version prefix in the output. Use this when
 * writing to sync_records.record_fingerprint so a later FINGERPRINT_VERSION
 * bump can detect stale rows.
 */
function versionedFingerprint(agency) {
    return `v${exports.FINGERPRINT_VERSION}:${fingerprint(agency)}`;
}
// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function fieldToCanonicalString(value) {
    if (value == null)
        return "";
    if (typeof value === "string")
        return value;
    if (typeof value === "number" || typeof value === "boolean")
        return String(value);
    // Anything else is a bug — NormalizedAgency only has strings + null. Fail
    // loud so it's caught in tests, not in production fingerprint drift.
    throw new TypeError(`[fingerprint] unexpected field type: ${typeof value} (${String(value).slice(0, 64)}). ` +
        `NormalizedAgency must contain only string | null.`);
}
