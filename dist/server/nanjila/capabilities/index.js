"use strict";
/**
 * Nanjila — capability manifest & registry.
 *
 * The orchestrator queries this at prompt-assembly time to build the list of
 * tools Nanjila can call for a specific user. Each capability declares:
 *
 *   • Its slug (also PK in nanjila_capabilities).
 *   • A JSON-schema for its input.
 *   • A handler function that returns a JSON-serialisable output.
 *   • Entitlement flags (auth / paid / admin).
 *
 * Adding a new capability is:
 *
 *   1. Create the handler file in server/nanjila/capabilities/<slug>.ts.
 *   2. Export a CapabilityDefinition object.
 *   3. Register it in ALL_CAPABILITIES below.
 *   4. INSERT the enabling row into nanjila_capabilities (or update its
 *      enabled column).
 *
 * The manifest is the ONLY place the orchestrator looks. Direct function
 * calls from prompts are not allowed — every action a user can trigger
 * goes through this registry.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.invalidateManifest = invalidateManifest;
exports.availableCapabilities = availableCapabilities;
exports.resolveCapability = resolveCapability;
exports.invokeCapability = invokeCapability;
const db_1 = require("../../db");
const checkPayment_1 = require("./checkPayment");
const kaziKaribuReview_1 = require("./kaziKaribuReview");
// ─────────────────────────────────────────────────────────────────────────────
// Static registry — every capability the system knows about
// ─────────────────────────────────────────────────────────────────────────────
//
// Order here is insertion order; the manifest is generated in the same
// order for prompt stability.
const ALL_CAPABILITIES = [
    checkPayment_1.checkPaymentCapability,
    kaziKaribuReview_1.kaziKaribuReviewCapability,
    // Add new capabilities here as Phase B-D lands.
];
let manifestCache = null;
const MANIFEST_CACHE_TTL_MS = 60 * 1000; // 1 minute
/**
 * Load (and cache) the current manifest state from the DB. The DB is the
 * source of truth for enabled/disabled — the static registry defines
 * available slugs and handlers.
 */
async function loadManifest() {
    const now = Date.now();
    if (manifestCache && (now - manifestCache.fetchedAt) < MANIFEST_CACHE_TTL_MS) {
        return manifestCache.entries;
    }
    const entries = new Map();
    try {
        const { rows } = await db_1.pool.query(`SELECT slug, enabled FROM nanjila_capabilities`);
        const dbState = new Map(rows.map((r) => [r.slug, r.enabled]));
        for (const def of ALL_CAPABILITIES) {
            const enabled = dbState.get(def.slug) === true;
            entries.set(def.slug, { definition: def, enabled });
        }
    }
    catch (err) {
        console.warn("[Nanjila/Capabilities] loadManifest failed, defaulting to disabled:", err?.message);
        for (const def of ALL_CAPABILITIES) {
            entries.set(def.slug, { definition: def, enabled: false });
        }
    }
    manifestCache = { entries, fetchedAt: now };
    return entries;
}
/** Force a manifest refresh (called by admin toggles). */
function invalidateManifest() {
    manifestCache = null;
}
// ─────────────────────────────────────────────────────────────────────────────
// Public API — used by the orchestrator
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Return the list of capability definitions available to a specific user.
 * Filters out disabled capabilities and any the user isn't entitled to.
 */
async function availableCapabilities(entitlement) {
    const manifest = await loadManifest();
    const out = [];
    for (const { definition, enabled } of manifest.values()) {
        if (!enabled)
            continue;
        if (definition.requiresAuth && !entitlement.authenticated)
            continue;
        if (definition.requiresPaid && !entitlement.paid)
            continue;
        if (definition.requiresAdmin && !entitlement.admin)
            continue;
        out.push(definition);
    }
    return out;
}
/**
 * Look up a capability by slug. Returns null when disabled, missing, or the
 * caller is not entitled.
 */
async function resolveCapability(slug, entitlement) {
    const manifest = await loadManifest();
    const entry = manifest.get(slug);
    if (!entry || !entry.enabled)
        return null;
    const def = entry.definition;
    if (def.requiresAuth && !entitlement.authenticated)
        return null;
    if (def.requiresPaid && !entitlement.paid)
        return null;
    if (def.requiresAdmin && !entitlement.admin)
        return null;
    return def;
}
/**
 * Invoke a capability with its declared context. Records latency into
 * nanjila_capabilities.avg_latency_ms for scheduler decisions.
 */
async function invokeCapability(def, input, ctx) {
    const start = Date.now();
    try {
        const result = await def.handler(input, ctx);
        const elapsed = Date.now() - start;
        // Best-effort — never block on the latency write.
        updateAvgLatency(def.slug, elapsed).catch(() => { });
        return result;
    }
    catch (err) {
        const elapsed = Date.now() - start;
        updateAvgLatency(def.slug, elapsed).catch(() => { });
        throw err;
    }
}
async function updateAvgLatency(slug, latencyMs) {
    await db_1.pool.query(`UPDATE nanjila_capabilities
        SET avg_latency_ms = COALESCE(
              ROUND((COALESCE(avg_latency_ms, $2) * 0.9) + ($2 * 0.1))::int,
              $2
            ),
            updated_at = NOW()
      WHERE slug = $1`, [slug, latencyMs]);
}
