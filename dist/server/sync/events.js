"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventBuffer = exports.EVENT_SCHEMA_VERSION = void 0;
exports.emitSynchronizationStarted = emitSynchronizationStarted;
exports.emitSynchronizationCompleted = emitSynchronizationCompleted;
exports.emitSynchronizationFailed = emitSynchronizationFailed;
exports.emitAgencyCreated = emitAgencyCreated;
exports.emitAgencyUpdated = emitAgencyUpdated;
exports.emitAgencyRemoved = emitAgencyRemoved;
exports.emitAgencyRestored = emitAgencyRestored;
exports.emitAgencyQuarantined = emitAgencyQuarantined;
exports.emitProviderHealthChanged = emitProviderHealthChanged;
// ─────────────────────────────────────────────────────────────────────────────
// EVENT_SCHEMA_VERSION — see ADR-0003 §D-2.
//
// This is the GLOBAL minimum version we promise. Per-event versions on the
// discriminated union members are independent; this constant is here for
// any consumer that wants a single "engine version" stamp on its read.
// ─────────────────────────────────────────────────────────────────────────────
exports.EVENT_SCHEMA_VERSION = 1;
// ─────────────────────────────────────────────────────────────────────────────
// EventBuffer — accumulate then flush atomically with apply transaction.
// ─────────────────────────────────────────────────────────────────────────────
const MAX_EVENTS_PER_RUN = 1000000;
/**
 * Accumulates events during a run; one transactional INSERT at flush time.
 *
 * Usage:
 *   const buffer = new EventBuffer();
 *   buffer.emit({ type: "SynchronizationStarted", v: 1, … });
 *   …
 *   await buffer.flush(client);   // inside the apply transaction
 */
class EventBuffer {
    constructor() {
        this.events = [];
    }
    emit(event) {
        if (this.events.length >= MAX_EVENTS_PER_RUN) {
            // Emergency vent: a run producing >1M events is broken. We swap the
            // queue for a single SynchronizationFailed and stop accumulating.
            this.events = [{
                    type: "SynchronizationFailed",
                    v: 1,
                    runId: event.runId ?? "unknown",
                    providerId: event.providerId ?? "unknown",
                    correlationId: event.correlationId ?? "unknown",
                    reason: "exception",
                    errorMessage: `Event buffer exceeded ${MAX_EVENTS_PER_RUN} events; run aborted.`,
                }];
            return;
        }
        this.events.push(event);
    }
    /** Count for tests + diagnostics. */
    size() {
        return this.events.length;
    }
    /** Snapshot the current buffer (defensive copy). Used by tests. */
    peek() {
        return [...this.events];
    }
    /**
     * Persist all buffered events to sync_events in one INSERT. Must be
     * called inside an active transaction (caller's PoolClient). The buffer
     * is cleared on success; left intact on failure so a retry can re-emit.
     */
    async flush(client) {
        if (this.events.length === 0)
            return;
        // Build parallel arrays for UNNEST — same pattern as sync-records insert.
        const eventTypes = [];
        const eventVersions = [];
        const correlationIds = [];
        const providerIds = [];
        const subjectTypes = [];
        const subjectIds = [];
        const payloads = [];
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
        await client.query(`INSERT INTO sync_events
         (event_type, event_version, correlation_id, provider_id,
          subject_type, subject_id, payload)
       SELECT et, ev, cid, pid, st, sid, p::jsonb
         FROM UNNEST(
                $1::varchar[], $2::int[], $3::varchar[], $4::varchar[],
                $5::varchar[], $6::varchar[], $7::text[]
              ) AS t(et, ev, cid, pid, st, sid, p)`, [
            eventTypes, eventVersions, correlationIds, providerIds,
            subjectTypes, subjectIds, payloads,
        ]);
        this.events = [];
    }
}
exports.EventBuffer = EventBuffer;
// ─────────────────────────────────────────────────────────────────────────────
// Subject extraction — each variant maps to (subject_type, subject_id)
// ─────────────────────────────────────────────────────────────────────────────
function extractCorrelationId(e) {
    if (e.type === "ProviderHealthChanged")
        return null; // health probes can occur outside any run
    return e.correlationId ?? null;
}
function extractProviderId(e) {
    return e.providerId ?? null;
}
function extractSubject(e) {
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
function emitSynchronizationStarted(buf, payload) {
    buf.emit({ type: "SynchronizationStarted", v: 1, ...payload });
}
function emitSynchronizationCompleted(buf, payload) {
    buf.emit({ type: "SynchronizationCompleted", v: 1, ...payload });
}
function emitSynchronizationFailed(buf, payload) {
    buf.emit({ type: "SynchronizationFailed", v: 1, ...payload });
}
function emitAgencyCreated(buf, payload) {
    buf.emit({ type: "AgencyCreated", v: 1, ...payload });
}
function emitAgencyUpdated(buf, payload) {
    buf.emit({ type: "AgencyUpdated", v: 1, ...payload });
    // Sibling fingerprint event — see ADR-0003 §D-4.
    buf.emit({
        type: "FingerprintChanged",
        v: 1,
        runId: payload.runId,
        providerId: payload.providerId,
        agencyId: payload.agencyId,
        licenseNumber: payload.licenseNumber,
        before: payload.oldFingerprint,
        after: payload.newFingerprint,
    });
}
function emitAgencyRemoved(buf, payload) {
    buf.emit({ type: "AgencyRemoved", v: 1, ...payload });
}
function emitAgencyRestored(buf, payload) {
    buf.emit({ type: "AgencyRestored", v: 1, ...payload });
}
function emitAgencyQuarantined(buf, payload) {
    buf.emit({ type: "AgencyQuarantined", v: 1, ...payload });
    // Sibling stage-specific event — see ADR-0003 §D-4 (the duplication is
    // deliberate so per-stage consumers don't have to parse `reasons`).
    if (payload.stage === "normalize") {
        buf.emit({
            type: "NormalizationFailed",
            v: 1,
            runId: payload.runId,
            providerId: payload.providerId,
            licenseNumber: payload.licenseNumber,
            rawPayload: payload.rawPayload,
            errorMessage: payload.reasons[0]?.message ?? "(no reason given)",
        });
    }
    else {
        buf.emit({
            type: "ValidationFailed",
            v: 1,
            runId: payload.runId,
            providerId: payload.providerId,
            licenseNumber: payload.licenseNumber,
            partial: null, // caller may amend; defaults to null
            reasons: payload.reasons,
            validator: "base",
        });
    }
}
function emitProviderHealthChanged(buf, payload) {
    buf.emit({ type: "ProviderHealthChanged", v: 1, ...payload });
}
