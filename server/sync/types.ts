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

// ─────────────────────────────────────────────────────────────────────────────
// Provider record — what an adapter yields from fetchRecords()
// Each adapter defines its own "raw" shape internally; the public type is
// intentionally permissive so the framework doesn't care what shape a
// provider returns before normalization.
// ─────────────────────────────────────────────────────────────────────────────
export type ProviderRecord = Record<string, unknown>;

// ─────────────────────────────────────────────────────────────────────────────
// Canonical agency shape — every provider normalizes to this.
// Mirrors the nea_agencies table's sync-engine-controlled columns.
// Admin-controlled columns (claimed_by_user_id, status_override, etc.) are
// NOT here because providers must never overwrite them.
// ─────────────────────────────────────────────────────────────────────────────
export interface NormalizedAgency {
  /** Full registered name, trimmed + uppercased. */
  agencyName: string;
  /** Unique within the (provider, country) scope. */
  licenseNumber: string;
  /** ISO-3166-1 alpha-2 country code, e.g. "KE". */
  country: string;
  /** Service taxonomy bucket — see SERVICE_TYPES below for the closed set. */
  serviceType: ServiceType;
  /** Lowercased, trimmed; null if missing or malformed. */
  email: string | null;
  /** Absolute URL with scheme; null if missing or malformed. */
  website: string | null;
  /** E.164 format (+254…); null if missing or unparseable. */
  phone: string | null;
  /** ISO YYYY-MM-DD; null when provider doesn't expose it. */
  issueDate: string | null;
  /** ISO YYYY-MM-DD; required (every NEA-style licence has an expiry). */
  expiryDate: string;
  /** What the source says the status is (NOT what an admin overrode it to). */
  statusSource: AgencyStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// Closed-set enums. The values here are the canonical strings written to the
// DB; adapters map their provider-specific vocabularies into these.
// ─────────────────────────────────────────────────────────────────────────────
export const SERVICE_TYPES = [
  "domestic",          // Domestic worker recruitment (KE -> Gulf, etc.)
  "gulf",              // Gulf-focused agency
  "gulf_and_domestic", // NEA's "BOTH LOCAL & INTERNATIONAL LICENSE"
  "skilled",           // Skilled labour / professional staffing
  "medical",           // Healthcare-specific
  "education",         // Student / au-pair / scholarship
  "unspecified",       // Provider didn't classify
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const AGENCY_STATUSES = [
  "verified",   // Active licence per the source
  "suspended",  // Active but under suspension
  "expired",    // Licence expiry passed per the source
  "revoked",    // Permanently revoked per the source
  "unknown",    // Source didn't disclose
] as const;
export type AgencyStatus = (typeof AGENCY_STATUSES)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Validation result — what validation.ts returns per record.
// Caller gets either the validated record or a list of structured reasons.
// We don't throw here; bad records are routed to quarantine, not crashes.
// ─────────────────────────────────────────────────────────────────────────────
export type ValidationResult =
  | { ok: true;  value: NormalizedAgency }
  | { ok: false; reasons: ValidationIssue[] };

export interface ValidationIssue {
  /** Dot path into NormalizedAgency, e.g. "expiryDate" or "email". */
  path: string;
  /** Stable enum string for machine consumers + sample logs. */
  code:
    | "required"
    | "too_long"
    | "invalid_format"
    | "out_of_range"
    | "not_in_set";
  /** Human-readable explanation for the admin UI. */
  message: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider health — surfaced on the dashboard. The engine reads this from
// healthCheck(), the storage layer (M2) persists it to sync_providers.health.
// ─────────────────────────────────────────────────────────────────────────────
export type ProviderHealth = {
  /** Coarse state. */
  status: "healthy" | "degraded" | "broken" | "unknown";
  /** Free-form, surfaced on admin dashboard. */
  message: string;
  /** Wall-clock of the check, ISO-8601. */
  checkedAt: string;
  /** Last successful fetch time, if known. */
  lastSuccessAt?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// ProviderCapabilities — explicit, machine-readable description of what
// a provider can and cannot do.
//
// 2026-06 (ADR-0002 / Improvement 3): future scheduler / admin UI / engine
// invokes only the modes a provider declares it supports. A provider that
// returns `false` for `supportsIncrementalSync` will be polled in full each
// run; one returning `true` may be invoked with a since-cursor.
//
// This is forward-looking: the M2 engine only honours `supportsPagination`
// (because we always stream pages). The remaining flags are read by future
// milestones — M3 (snapshots), M4 (scheduler/incremental), M-future
// (webhooks/search) — but recorded here so adapters codify the contract on
// day one.
// ─────────────────────────────────────────────────────────────────────────────
export interface ProviderCapabilities {
  /**
   * The adapter's fetchRecords() returns multiple non-empty pages from
   * one call. False adapters are single-page; the engine still treats
   * the result as a stream of one page.
   */
  supportsPagination: boolean;
  /**
   * fetchRecords accepts a `since` cursor in opts and returns only records
   * modified after it. Reduces bandwidth for large registries.
   * False adapters are always-full-fetch.
   */
  supportsIncrementalSync: boolean;
  /**
   * The provider exposes a push channel (webhook) that the engine can
   * register against. M-future feature; declares intent today.
   */
  supportsWebhooks: boolean;
  /**
   * fetchRecords honours FetchOpts.filter (e.g. by country, service type).
   * Useful for partial syncs in dev/staging.
   */
  supportsFiltering: boolean;
  /**
   * The adapter can resolve a single record by license_number cheaply,
   * without pulling the full dataset. Powers ad-hoc admin lookups.
   */
  supportsSearch: boolean;
  /**
   * The upstream source pins its own immutable snapshots that the
   * adapter can fetch by id. Distinct from OUR snapshots (which we
   * capture per run regardless).
   */
  supportsUpstreamSnapshots: boolean;
  /**
   * healthCheck() does a real probe (HTTP HEAD, DNS lookup, etc.).
   * Static-data adapters return false so the scheduler doesn't poll
   * a healthy "vacuously yes" too aggressively.
   */
  supportsHealthProbe: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Adapter-declared metadata. The framework uses this to render the dashboard
// without each provider needing UI code.
// ─────────────────────────────────────────────────────────────────────────────
export interface ProviderMetadata {
  /** URL-safe identifier; matches sync_providers.slug. */
  slug: string;
  /** Human label, e.g. "Kenya National Employment Authority". */
  displayName: string;
  /** ISO-3166-1 alpha-2 country code. */
  country: string;
  /** Where the data ultimately comes from — for documentation only. */
  upstreamUrl: string;
  /** Whether the adapter performs a real network call or replays static data. */
  isStatic: boolean;
  /** Adapter version; bumps invalidate stored fingerprints. */
  adapterVersion: string;
  /**
   * 2026-06 (ADR-0002): explicit capability flags. Required from every
   * adapter — be honest. Lying here causes the scheduler/engine to invoke
   * unsupported modes and fail loudly.
   */
  capabilities: ProviderCapabilities;
}

// ─────────────────────────────────────────────────────────────────────────────
// fetchRecords() options — kept minimal in M1; M2 may add cursor/since.
// ─────────────────────────────────────────────────────────────────────────────
export interface FetchOpts {
  /** Cap on records returned across the iterable. Useful for dry-runs. */
  limit?: number;
  /** Caller can pass an AbortSignal to interrupt a long fetch. */
  signal?: AbortSignal;
}

// ─────────────────────────────────────────────────────────────────────────────
// The core interface every provider implements.
// ─────────────────────────────────────────────────────────────────────────────
export interface SyncProvider {
  readonly slug:        string;
  readonly displayName: string;
  readonly country:     string;

  metadata(): ProviderMetadata;
  healthCheck(): Promise<ProviderHealth>;
  fetchRecords(opts?: FetchOpts): AsyncIterable<ProviderRecord[]>;
  normalize(raw: ProviderRecord): NormalizedAgency;
  validate?(record: NormalizedAgency): ValidationResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine result — what the M1 foundation pipeline returns.
// ─────────────────────────────────────────────────────────────────────────────
export interface FoundationRunResult {
  correlationId: string;
  providerSlug: string;
  fetched: number;
  validated: ValidatedRecord[];
  quarantined: QuarantinedRecord[];
  fingerprintsByLicense: ReadonlyMap<string, string>;
  durationMs: number;
  stageDurations: {
    rawImport: number;
    fetch: number;
    normalize: number;
    validate: number;
    fingerprint: number;
  };
  normalizerVersion: string;
  fingerprintVersion: number;
}

export interface ValidatedRecord {
  /** Raw provider payload, captured by Raw Import stage (ADR-0002). */
  raw: ProviderRecord;
  /** Canonical post-normalize agency. */
  agency: NormalizedAgency;
  /** sha256 hex of canonical tuple (no version prefix; see fingerprint.ts). */
  fingerprint: string;
  /** NORMALIZER_VERSION snapshot (ADR-0002 / Improvement 2). */
  normalizerVersion: string;
}

export interface QuarantinedRecord {
  raw: ProviderRecord;
  partial: Partial<NormalizedAgency> | null;
  reasons: ValidationIssue[];
  /** Null if normalize threw before producing any output. */
  normalizerVersion: string | null;
}
