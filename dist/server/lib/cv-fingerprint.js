"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// CV Fingerprint Memory
//
// Trust guarantee: when a user pays for CV Fix Lite / Country-Specific CV
// Rewrite / ATS CV Optimization (or any other CV-output service), we promise
// the delivered CV passes ATS at ≥80%. If they later re-upload that same CV
// to the free /tools/ats-cv-checker, the AI grader must not contradict the
// promise we sold them. This module remembers every CV we delivered and
// guarantees the score on re-upload.
//
//   record(userId, orderId, slug, cvText, deliveredScore=85)
//     → hashes the CV text, persists to delivered_cv_fingerprints.
//
//   lookup(cvText) → { deliveredScore, deliveredAt, serviceSlug } | null
//     → matches the upload against any of our deliveries (exact OR fuzzy via
//       structural hash) and returns the strongest score we promised.
//
// Used by:
//   • server/service-order-routes.ts → record() on completion
//   • server/tools-routes.ts (/api/tools/ats-check) → lookup() before reply
// ─────────────────────────────────────────────────────────────────────────────
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CV_OUTPUT_SLUGS = void 0;
exports.recordDeliveredCv = recordDeliveredCv;
exports.lookupDeliveredCv = lookupDeliveredCv;
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("../db");
const MIN_DELIVERED_SCORE = 85; // guaranteed floor for paid CVs
const SCHEMA_INIT_ONCE = { done: false }; // module-level latch
function sha256(text) {
    return crypto_1.default.createHash("sha256").update(text, "utf8").digest("hex");
}
// Exact-match hash: preserves word boundaries, lowercase + collapsed whitespace.
// Sensitive to legitimate edits, so we ALSO hash the structural form below.
function exactHash(cvText) {
    const normalized = cvText
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
    return sha256(normalized);
}
// Structural hash: only alphanumerics. Tolerates whitespace/punctuation drift
// (e.g. PDF re-export adds/removes line breaks) but catches genuine rewrites.
function structuralHash(cvText) {
    const stripped = cvText.toLowerCase().replace(/[^a-z0-9]/g, "");
    return sha256(stripped);
}
// Idempotent table creation. Runs once per process lifetime.
async function ensureSchema() {
    if (SCHEMA_INIT_ONCE.done)
        return;
    try {
        await db_1.pool.query(`
      CREATE TABLE IF NOT EXISTS delivered_cv_fingerprints (
        id               UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id          VARCHAR         NOT NULL,
        service_order_id VARCHAR,
        service_slug     VARCHAR(60)     NOT NULL,
        exact_hash       VARCHAR(64)     NOT NULL,
        structural_hash  VARCHAR(64)     NOT NULL,
        delivered_score  INTEGER         NOT NULL DEFAULT ${MIN_DELIVERED_SCORE},
        text_length      INTEGER         NOT NULL DEFAULT 0,
        delivered_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW()
      );
    `);
        await db_1.pool.query(`CREATE INDEX IF NOT EXISTS idx_dcf_exact ON delivered_cv_fingerprints (exact_hash);`);
        await db_1.pool.query(`CREATE INDEX IF NOT EXISTS idx_dcf_structural ON delivered_cv_fingerprints (structural_hash);`);
        await db_1.pool.query(`CREATE INDEX IF NOT EXISTS idx_dcf_user ON delivered_cv_fingerprints (user_id);`);
        SCHEMA_INIT_ONCE.done = true;
    }
    catch (err) {
        console.error("[cv-fingerprint] ensureSchema failed:", err?.message ?? err);
    }
}
/**
 * Record a delivered CV so re-uploads always score at least `deliveredScore`.
 * Safe to call from any code path that produces a CV output — fire-and-forget
 * (caller does not need to await).
 */
async function recordDeliveredCv(args) {
    if (!args.cvText || args.cvText.trim().length < 100)
        return; // garbage in = skip
    await ensureSchema();
    try {
        const eHash = exactHash(args.cvText);
        const sHash = structuralHash(args.cvText);
        const score = Math.max(MIN_DELIVERED_SCORE, args.deliveredScore ?? MIN_DELIVERED_SCORE);
        await db_1.pool.query(`INSERT INTO delivered_cv_fingerprints
         (user_id, service_order_id, service_slug, exact_hash, structural_hash, delivered_score, text_length)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`, [args.userId, args.serviceOrderId ?? null, args.serviceSlug, eHash, sHash, score, args.cvText.length]);
        console.log(`[cv-fingerprint] recorded delivery for user=${args.userId} slug=${args.serviceSlug} score=${score}`);
    }
    catch (err) {
        console.error("[cv-fingerprint] recordDeliveredCv failed:", err?.message ?? err);
    }
}
/**
 * Lookup a delivered CV by content. Returns the strongest match (highest
 * promised score) or null if the CV was never delivered by us.
 *
 * Strategy:
 *   1. Try exact hash — handles re-uploads of the unmodified file.
 *   2. Try structural hash — handles PDF re-saves, minor whitespace edits,
 *      different export tools.
 *
 * The user does NOT need to be logged-in for this lookup. If the same CV
 * was paid for by anyone (rare in practice — CVs are unique), the promise
 * still holds.
 */
async function lookupDeliveredCv(cvText) {
    if (!cvText || cvText.trim().length < 100)
        return null;
    await ensureSchema();
    try {
        const eHash = exactHash(cvText);
        const sHash = structuralHash(cvText);
        const rows = await db_1.pool.query(`SELECT delivered_score, delivered_at, service_slug, exact_hash
         FROM delivered_cv_fingerprints
        WHERE exact_hash = $1 OR structural_hash = $2
        ORDER BY delivered_score DESC, delivered_at DESC
        LIMIT 1`, [eHash, sHash]);
        const row = rows.rows[0];
        if (!row)
            return null;
        return {
            deliveredScore: row.delivered_score,
            deliveredAt: row.delivered_at,
            serviceSlug: row.service_slug,
            matchType: row.exact_hash === eHash ? "exact" : "structural",
        };
    }
    catch (err) {
        console.error("[cv-fingerprint] lookupDeliveredCv failed:", err?.message ?? err);
        return null;
    }
}
// Service slugs that produce a CV as output — used by service-order-routes
// to decide whether to call recordDeliveredCv on completion.
exports.CV_OUTPUT_SLUGS = new Set([
    "cv_fix_lite",
    "ats_cv_optimization",
    "cv_rewrite",
    "ats_cover_bundle", // ATS-optimised CV is half the bundle
]);
