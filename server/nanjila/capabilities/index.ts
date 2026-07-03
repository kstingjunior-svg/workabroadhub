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

import { pool } from "../../db";
import type { UserEntitlement } from "./types";
import { checkPaymentCapability } from "./checkPayment";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface CapabilityDefinition<Input = any, Output = any> {
  slug:              string;
  label:             string;
  description:       string;
  inputSchema:       object;
  outputSchema:      object;
  requiresAuth:      boolean;
  requiresPaid:      boolean;
  requiresAdmin:     boolean;
  /**
   * Handler runs when the model requests this capability. Receives the
   * validated input plus the invoking user's entitlement context.
   */
  handler: (input: Input, ctx: CapabilityContext) => Promise<Output>;
}

export interface CapabilityContext {
  userId:      string | null;
  entitlement: UserEntitlement;
  /** Correlation id (typically the conversation id) for tracing. */
  traceId:     string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Static registry — every capability the system knows about
// ─────────────────────────────────────────────────────────────────────────────
//
// Order here is insertion order; the manifest is generated in the same
// order for prompt stability.

const ALL_CAPABILITIES: CapabilityDefinition[] = [
  checkPaymentCapability,
  // Add new capabilities here as Phase B-D lands.
];

// ─────────────────────────────────────────────────────────────────────────────
// Runtime manifest — reflects the enabled state in nanjila_capabilities
// ─────────────────────────────────────────────────────────────────────────────

interface RuntimeManifestEntry {
  definition: CapabilityDefinition;
  enabled:    boolean;
}

let manifestCache: {
  entries:   Map<string, RuntimeManifestEntry>;
  fetchedAt: number;
} | null = null;

const MANIFEST_CACHE_TTL_MS = 60 * 1000; // 1 minute

/**
 * Load (and cache) the current manifest state from the DB. The DB is the
 * source of truth for enabled/disabled — the static registry defines
 * available slugs and handlers.
 */
async function loadManifest(): Promise<Map<string, RuntimeManifestEntry>> {
  const now = Date.now();
  if (manifestCache && (now - manifestCache.fetchedAt) < MANIFEST_CACHE_TTL_MS) {
    return manifestCache.entries;
  }

  const entries = new Map<string, RuntimeManifestEntry>();
  try {
    const { rows } = await pool.query<{ slug: string; enabled: boolean }>(
      `SELECT slug, enabled FROM nanjila_capabilities`,
    );
    const dbState = new Map(rows.map((r) => [r.slug, r.enabled]));
    for (const def of ALL_CAPABILITIES) {
      const enabled = dbState.get(def.slug) === true;
      entries.set(def.slug, { definition: def, enabled });
    }
  } catch (err: any) {
    console.warn("[Nanjila/Capabilities] loadManifest failed, defaulting to disabled:", err?.message);
    for (const def of ALL_CAPABILITIES) {
      entries.set(def.slug, { definition: def, enabled: false });
    }
  }

  manifestCache = { entries, fetchedAt: now };
  return entries;
}

/** Force a manifest refresh (called by admin toggles). */
export function invalidateManifest(): void {
  manifestCache = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — used by the orchestrator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return the list of capability definitions available to a specific user.
 * Filters out disabled capabilities and any the user isn't entitled to.
 */
export async function availableCapabilities(
  entitlement: UserEntitlement,
): Promise<CapabilityDefinition[]> {
  const manifest = await loadManifest();
  const out: CapabilityDefinition[] = [];
  for (const { definition, enabled } of manifest.values()) {
    if (!enabled) continue;
    if (definition.requiresAuth && !entitlement.authenticated) continue;
    if (definition.requiresPaid && !entitlement.paid) continue;
    if (definition.requiresAdmin && !entitlement.admin) continue;
    out.push(definition);
  }
  return out;
}

/**
 * Look up a capability by slug. Returns null when disabled, missing, or the
 * caller is not entitled.
 */
export async function resolveCapability(
  slug:         string,
  entitlement:  UserEntitlement,
): Promise<CapabilityDefinition | null> {
  const manifest = await loadManifest();
  const entry = manifest.get(slug);
  if (!entry || !entry.enabled) return null;
  const def = entry.definition;
  if (def.requiresAuth && !entitlement.authenticated) return null;
  if (def.requiresPaid && !entitlement.paid) return null;
  if (def.requiresAdmin && !entitlement.admin) return null;
  return def;
}

/**
 * Invoke a capability with its declared context. Records latency into
 * nanjila_capabilities.avg_latency_ms for scheduler decisions.
 */
export async function invokeCapability<Input, Output>(
  def:    CapabilityDefinition<Input, Output>,
  input:  Input,
  ctx:    CapabilityContext,
): Promise<Output> {
  const start = Date.now();
  try {
    const result = await def.handler(input, ctx);
    const elapsed = Date.now() - start;
    // Best-effort — never block on the latency write.
    updateAvgLatency(def.slug, elapsed).catch(() => {});
    return result;
  } catch (err) {
    const elapsed = Date.now() - start;
    updateAvgLatency(def.slug, elapsed).catch(() => {});
    throw err;
  }
}

async function updateAvgLatency(slug: string, latencyMs: number): Promise<void> {
  await pool.query(
    `UPDATE nanjila_capabilities
        SET avg_latency_ms = COALESCE(
              ROUND((COALESCE(avg_latency_ms, $2) * 0.9) + ($2 * 0.1))::int,
              $2
            ),
            updated_at = NOW()
      WHERE slug = $1`,
    [slug, latencyMs],
  );
}
