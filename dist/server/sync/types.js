"use strict";
/**
 * Sync Engine — public types (Milestone 1).
 *
 * One source of truth for every type the engine, adapters, validation,
 * fingerprint, and (future) storage layer share. By keeping these
 * platform-agnostic (no Drizzle, no Express, no DB types) we let the
 * pipeline be unit-tested without spinning up Postgres.
 *
 * The naming convention is deliberate:
 *   • Raw*       — pre-normalization shape, provider-specific
 *   • Normalized* — post-normalization, canonical shape
 *   • Validated* — Normalized + passed Zod (M1)
 *   • Persisted* — Validated + assigned a fingerprint + agency_id (M2)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENCY_STATUSES = exports.SERVICE_TYPES = void 0;
// ─────────────────────────────────────────────────────────────────────────────
// Closed-set enums. The values here are the canonical strings written to the
// DB; adapters map their provider-specific vocabularies into these.
// ─────────────────────────────────────────────────────────────────────────────
exports.SERVICE_TYPES = [
    "domestic", // Domestic worker recruitment (KE -> Gulf, etc.)
    "gulf", // Gulf-focused agency
    "gulf_and_domestic", // NEA's "BOTH LOCAL & INTERNATIONAL LICENSE"
    "skilled", // Skilled labour / professional staffing
    "medical", // Healthcare-specific
    "education", // Student / au-pair / scholarship
    "unspecified", // Provider didn't classify
];
exports.AGENCY_STATUSES = [
    "verified", // Active licence per the source
    "suspended", // Active but under suspension
    "expired", // Licence expiry passed per the source
    "revoked", // Permanently revoked per the source
    "unknown", // Source didn't disclose
];
