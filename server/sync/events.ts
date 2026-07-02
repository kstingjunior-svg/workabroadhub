/**
 * Sync Engine — Event Store (Pre-M3 enhancement, ADR-0003).
 *
 * Twelve-variant discriminated union of synchronization events. Every
 * meaningful occurrence in the engine produces an event. Events are
 * immutable, append-only, and persisted to `sync_events` in batched
 * transactional writes via `EventBuffer`.
 *
 * Design choices live in ADR-0003. Highlights:
 *   • Per-event-type `v: 1` field — breaking schema changes add a new
 *     variant rather than mutating existing ones.
 *   • EventBuffer accumulates events in memory during a run, flushes
 *     once at COMMIT inside the same transaction as the agency writes.
 *   • subject_type + subject_id let consumers filter without payload
 *     introspection.
 */

import type { PoolClient } from "pg";
import type {
  AgencyStatus,
  NormalizedAgency,
  ProviderHealth,
  ProviderRecord,
  ValidationIssue,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// EVENT_SCHEMA_VERSION — see ADR-0003 §D-2.
//
// This is the GLOBAL minimum version we promise. Per-event versions on the
// discriminated union members are independent; this constant is here for
// any consumer that wants a single "engine version" stamp on its read.
// ─────────────────────────────────────────────────────────────────────────────
export const EVENT_SCHEMA_VERSION = 1 as const;

// ─────────────────────────────────────────────────────────────────────────────
// Event shapes — discriminated union. Every variant carries `type` and `v`.
// ─────────────────────────────────────────────────────────────────────────────

export type SyncEvent =
  | SynchronizationStartedEvent
  | SynchronizationCompletedEvent
  | SynchronizationFailedEvent
  | AgencyCreatedEvent
  | AgencyUpdatedEvent
  | AgencyRemovedEvent
  | AgencyRestoredEvent
  | AgencyQuarantinedEvent
  | NormalizationFailedEvent
  | ValidationFailedEvent
  | FingerprintChangedEvent
  | ProviderHealthChangedEvent;

export interface SynchronizationStartedEvent {
  type: "SynchronizationStarted";
  v: 1;
  runId:         string;
  providerId:    string;
  correlationId: string;
  mode:          "scheduled" | "manual" | "dry_run" | "recovery";
  triggeredBy:   string;
}

export interface SynchronizationCompletedEvent {
  type: "SynchronizationCompleted";
  v: 1;
  runId:        string;
  providerId:   string;
  correlationId: string;
  counts: {
    fetched: number;
    created: number;
    updated: number;
    unchanged: number;
    deleted: number;
    quarantined: number;
  };
  durationMs: number;
}

export interface SynchronizationFailedEvent {
  type: "SynchronizationFailed";
  v: 1;
  runId:         string;
  providerId:    string;
  correlationId: string;
  /** Whether the run was held-for-review vs. crashed. */
  reason: "held_for_review" | "exception";
  errorMessage: string;
}

export interface AgencyCreatedEvent {
  type: "AgencyCreated";
  v: 1;
  runId:        string;
  providerId:   string;
  agencyId:     string;
  licenseNumber: string;
  fingerprint:  string;
  agency:       NormalizedAgency;
}

export interface AgencyUpdatedEvent {
  type: "AgencyUpdated";
  v: 1;
  runId:        string;
  providerId:   string;
  agencyId:     string;
  licenseNumber: string;
  oldFingerprint: string;
  newFingerprint: string;
  /** Per-field before/after — same shape as agency_change_log.field_changes. */
  fieldChanges: Record<string, { from: unknown; to: unknown }>;
}

export interface AgencyRemovedEvent {
  type: "AgencyRemoved";
  v: 1;
  runId:        string;
  providerId:   string;
  agencyId:     string;
  licenseNumber: string;
  /** Status the row had before being marked deleted-from-source. */
  previousStatus: AgencyStatus;
}

export interface AgencyRestoredEvent {
  type: "AgencyRestored";
  v: 1;
  runId:        string;
  providerId:   string;
  agencyId:     string;
  licenseNumber: string;
  /** Status the row had before being restored (typically "expired"). */
  previousStatus: AgencyStatus;
}

export interface AgencyQuarantinedEvent {
  type: "AgencyQuarantined";
  v: 1;
  runId:        string;
  providerId:   string;
  licenseNumber: string;
  rawPayload:   ProviderRecord;
  /** Where in the pipeline the rejection happened. */
  stage: "normalize" | "validate";
  reasons: ValidationIssue[];
}

export interface NormalizationFailedEvent {
  type: "NormalizationFailed";
  v: 1;
  runId:        string;
  providerId:   string;
  /** May be the empty string if even the licence couldn't be extracted. */
  licenseNumber: string;
  rawPayload:   ProviderRecord;
  errorMessage: string;
}

export interface ValidationFailedEvent {
  type: "ValidationFailed";
  v: 1;
  runId:        string;
  providerId:   string;
  licenseNumber: string;
  partial:      Partial<NormalizedAgency> | null;
  reasons:      ValidationIssue[];
  /** Which validator rejected — base Zod or the provider's tightener. */
  validator: "base" | "provider";
}

export interface FingerprintChangedEvent {
  type: "FingerprintChanged";
  v: 1;
  runId:        string;
  providerId:   string;
  agencyId:     string;
  licenseNumber: string;
  before: string;
  after:  string;
}

export interface ProviderHealthChangedEvent {
  type: "ProviderHealthChanged";
  v: 1;
  providerId: string;
  before: ProviderHealth["status"];
  after:  ProviderHealth["status"];
  message: string;
  /** Consecutive failure count after this transition (0 on recovery). */
  consecutiveFailures: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// EventBuffer — accumulate then flush atomically with apply transaction.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_EVENTS_PER_RUN = 1_000_000;

/**
 * Accumulates events during a run; one transactional INSERT at flush time.
 *
 * Usage:
 *   const buffer = new EventBuffer();
 *   buffer.emit({ type: "SynchronizationStarted", v: 1, … });
 *   …
 *   await buffer.flush(client);   // inside the apply transaction
 */
export class EventBuffer {
  private events: SyncEvent[] = [];

  emit(event: SyncEvent): void {
    if (this.events.length >= MAX_EVENTS_PER_RUN) {
      // Emergency vent: a run producing >1M events is broken. We swap the
      // queue for a single SynchronizationFailed and stop accumulating.
      this.events = [{
        type: "SynchronizationFailed",
        v: 1,
        runId:         (event as any).runId ?? "unknown",
        providerId:    (event as any).providerId ?? "unknown",
        correlationId: (event as any).correlationId ?? "unknown",
        reason: "exception",
        errorMessage: `Event buffer exceeded ${MAX_EVENTS_PER_RUN} events; run aborted.`,
      }];
      return;
    }
    this.events.push(event);
  }

  /** Count for tests + diagnostics. */
  size(): number {
    return this.events.length;
  }

  /** Snapshot the current buffer (defensive copy). Used by tests. */
  peek(): ReadonlyArray<SyncEvent> {
    return [...this.events];
  }

  /**
   * Persist all buffered events to sync_events in one INSERT. Must be
   * called inside an active transaction (caller's PoolClient). The buffer
   * is cleared on success; left intact on failure so a retry can re-emit.
   */
  async flush(client: PoolClient): Promise<void> {
    if (this.events.length === 0) return;

    // Build parallel arrays for UNNEST — same pattern as sync-records insert.
    const eventTypes:    string[] = [];
    const eventVersions: number[] = [];
    const correlationIds:(string | null)[] = [];
    const providerIds:   (string | null)[] = [];
    const subjectTypes:  (string | null)[] = [];
    const subjectIds:    (string | null)[] = [];
    const payloads:      string[] = [];

    for (const e of this.events) {
      eventTypes.push(e.type);
      eventVersions.push(e.v);
      correlationIds.push(extractCorrelationId(e));
      providerIds.push(extractProviderId(e));
      const [stype, sid] = extractSubject(e);
      subjectTypes.push(stype);
      subjectIds.push(sid);
      payloads.push(JSON.stringify(e));
    }

    await client.query(
      `INSERT INTO sync_events
         (event_type, event_version, correlation_id, provider_id,
          subject_type, subject_id, payload)
       SELECT et, ev, cid, pid, st, sid, p::jsonb
         FROM UNNEST(
                $1::varchar[], $2::int[], $3::varchar[], $4::varchar[],
                $5::varchar[], $6::varchar[], $7::text[]
              ) AS t(et, ev, cid, pid, st, sid, p)`,
      [
        eventTypes, eventVersions, correlationIds, providerIds,
        subjectTypes, subjectIds, payloads,
      ],
    );

    this.events = [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Subject extraction — each variant maps to (subject_type, subject_id)
// ─────────────────────────────────────────────────────────────────────────────

function extractCorrelationId(e: SyncEvent): string | null {
  if (e.type === "ProviderHealthChanged") return null; // health probes can occur outside any run
  return (e as any).correlationId ?? null;
}

function extractProviderId(e: SyncEvent): string | null {
  return (e as any).providerId ?? null;
}

function extractSubject(e: SyncEvent): [string | null, string | null] {
  switch (e.type) {
    case "SynchronizationStarted":
    case "SynchronizationCompleted":
    case "SynchronizationFailed":
      return ["run", e.runId];

    case "AgencyCreated":
    case "AgencyUpdated":
    case "AgencyRemoved":
    case "AgencyRestored":
    case "FingerprintChanged":
      return ["agency", e.agencyId];

    case "AgencyQuarantined":
    case "NormalizationFailed":
    case "ValidationFailed":
      // No agency_id exists yet; index by licence so admin can find by it.
      return ["license", e.licenseNumber];

    case "ProviderHealthChanged":
      return ["provider", e.providerId];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience emitter helpers — wrap the buffer.emit calls so call-sites in
// engine/apply/safety/health don't repeat the boilerplate or risk typos.
// Each helper preserves type safety: TypeScript will complain if you forget
// or misname a required field on the underlying event variant.
// ─────────────────────────────────────────────────────────────────────────────

export function emitSynchronizationStarted(
  buf: EventBuffer,
  payload: Omit<SynchronizationStartedEvent, "type" | "v">,
): void {
  buf.emit({ type: "SynchronizationStarted", v: 1, ...payload });
}

export function emitSynchronizationCompleted(
  buf: EventBuffer,
  payload: Omit<SynchronizationCompletedEvent, "type" | "v">,
): void {
  buf.emit({ type: "SynchronizationCompleted", v: 1, ...payload });
}

export function emitSynchronizationFailed(
  buf: EventBuffer,
  payload: Omit<SynchronizationFailedEvent, "type" | "v">,
): void {
  buf.emit({ type: "SynchronizationFailed", v: 1, ...payload });
}

export function emitAgencyCreated(
  buf: EventBuffer,
  payload: Omit<AgencyCreatedEvent, "type" | "v">,
): void {
  buf.emit({ type: "AgencyCreated", v: 1, ...payload });
}

export function emitAgencyUpdated(
  buf: EventBuffer,
  payload: Omit<AgencyUpdatedEvent, "type" | "v">,
): void {
  buf.emit({ type: "AgencyUpdated", v: 1, ...payload });
  // Sibling fingerprint event — see ADR-0003 §D-4.
  buf.emit({
    type: "FingerprintChanged",
    v: 1,
    runId:         payload.runId,
    providerId:    payload.providerId,
    agencyId:      payload.agencyId,
    licenseNumber: payload.licenseNumber,
    before:        payload.oldFingerprint,
    after:         payload.newFingerprint,
  });
}

export function emitAgencyRemoved(
  buf: EventBuffer,
  payload: Omit<AgencyRemovedEvent, "type" | "v">,
): void {
  buf.emit({ type: "AgencyRemoved", v: 1, ...payload });
}

export function emitAgencyRestored(
  buf: EventBuffer,
  payload: Omit<AgencyRestoredEvent, "type" | "v">,
): void {
  buf.emit({ type: "AgencyRestored", v: 1, ...payload });
}

export function emitAgencyQuarantined(
  buf: EventBuffer,
  payload: Omit<AgencyQuarantinedEvent, "type" | "v">,
): void {
  buf.emit({ type: "AgencyQuarantined", v: 1, ...payload });
  // Sibling stage-specific event — see ADR-0003 §D-4 (the duplication is
  // deliberate so per-stage consumers don't have to parse `reasons`).
  if (payload.stage === "normalize") {
    buf.emit({
      type: "NormalizationFailed",
      v: 1,
      runId:         payload.runId,
      providerId:    payload.providerId,
      licenseNumber: payload.licenseNumber,
      rawPayload:    payload.rawPayload,
      errorMessage:  payload.reasons[0]?.message ?? "(no reason given)",
    });
  } else {
    buf.emit({
      type: "ValidationFailed",
      v: 1,
      runId:         payload.runId,
      providerId:    payload.providerId,
      licenseNumber: payload.licenseNumber,
      partial:       null, // caller may amend; defaults to null
      reasons:       payload.reasons,
      validator:     "base",
    });
  }
}

export function emitProviderHealthChanged(
  buf: EventBuffer,
  payload: Omit<ProviderHealthChangedEvent, "type" | "v">,
): void {
  buf.emit({ type: "ProviderHealthChanged", v: 1, ...payload });
}
