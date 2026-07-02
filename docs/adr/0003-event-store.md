# ADR 0003 — Event Store as Canonical Audit Trail

**Status:** Accepted
**Date:** 2026-06-29
**Milestone:** Pre-M3 architectural enhancement
**Authors:** WorkAbroadHub engineering
**Supersedes:** part of ADR 0001 §D-7 — the engine result remains the
short-lived in-memory shape, but the canonical persisted audit trail moves
from "agency_change_log only" to "sync_events with agency_change_log as a
projection."

## Context

After M2 we have an end-to-end pipeline that writes:

1. **sync_runs** — per-run summary row.
2. **sync_records** — per-record raw + normalized payload.
3. **agency_change_log** — per-mutation audit (created / updated / deleted /
   rolled_back).
4. **nea_agencies** — the current-state read model.

This works for "show me changes to agency X" queries but has three structural
gaps:

- **Non-mutation events are invisible.** A quarantine, a normalization
  failure, a held-for-review safety gate trip, a provider health
  transition — none of these have a home in `agency_change_log`
  (which is keyed on agency_id and assumes a mutation actually happened).
- **The audit log is coupled to the mutation path.** Anything we want
  to add to the audit chain has to either land in agency_change_log
  (and pollute its schema) or live somewhere bespoke.
- **Replay and reconciliation are awkward.** Reconstructing "what
  did sync run X do?" requires joining sync_runs + sync_records +
  agency_change_log + sync_anomalies and inferring sequence.

Tony's directive: introduce an **immutable, append-only Event Store**
that captures every meaningful occurrence in the synchronization engine.
Twelve initial event types listed in the M3 brief.

## Decisions

### D-1. Event Store is the canonical audit trail; agency_change_log becomes a read-model projection

**Decision.** A new `sync_events` table holds every event. Twelve initial
event types (extensible via versioning). Every sync run writes a stream
of events — the engine's apply path emits both events AND the
agency_change_log rows in the same transaction; the change-log rows are
treated as a denormalized projection of the
`AgencyCreated / AgencyUpdated / AgencyRemoved / AgencyRestored` subset,
optimized for the "per-agency mutation history" query.

**Rationale.**

- **Single audit truth.** Every meaningful occurrence is in one place.
- **Open extensibility.** Adding a new event type (e.g.
  `SnapshotCaptured`, `RollbackInitiated`) is one TypeScript variant
  and one event-emitter call — no schema migration.
- **Reconciliation friendliness.** `SELECT * FROM sync_events WHERE
  correlation_id = $1 ORDER BY occurred_at` reconstructs an entire
  run's behaviour, including its quarantines, anomalies, and health
  state transitions.
- **Backwards compatibility.** Code that reads agency_change_log
  (admin UI in M6, public history endpoint M5) keeps working
  unchanged. The projection is maintained synchronously by the
  apply stage, so it stays consistent.

**Rejected alternatives.**

- **Use agency_change_log as the only audit log.** Forces every
  event type to be retro-fitted into an agency-keyed schema. A
  `NormalizationFailed` event has no agency_id (we couldn't even
  produce a candidate); making agency_id nullable defeats the
  schema's intent.
- **One table per event type.** TypeScript's tagged union handles
  the polymorphism; SQL tables don't. Joining 12 tables per run
  is operationally painful.
- **Kafka / external event bus.** Overkill for our scale
  (≤10k events/run, ≤10 providers); adds a new infrastructure
  failure mode. Postgres is a perfectly good event store at this size.

**Consequence.**

- Migration 0008 adds the `sync_events` table.
- The M2 apply path stays the same shape but now also emits events
  via an `EventBuffer` flushed at COMMIT time.
- The legacy agency_change_log keeps its current writers — it's
  not retired, it's now explicitly a read model.

### D-2. Event schema is versioned per-type via a `v` field

**Decision.** Every event in the TypeScript discriminated union carries
a `v: 1` field. The `event_version` column on `sync_events` mirrors it
so SQL queries can filter by event version. Schema evolution rule:

- **Additive changes** (new optional field): no version bump.
- **Breaking changes** (field rename, semantic change, removal):
  add a new variant `{ type: "AgencyCreated"; v: 2; … }` while
  keeping the v:1 variant. Readers handle both.

**Rationale.** A single `EVENT_SCHEMA_VERSION` global is too coarse
— bumping it invalidates every consumer for the sake of one event's
change. Per-event version lets us evolve incrementally without
breaking historic replay.

**Rejected alternatives.**

- **No versioning.** Would force same-shape-forever, which loses
  the whole audit-trail benefit on the day we need to change anything.
- **JSON Schema URIs in each payload.** Too much ceremony for the
  marginal win over a simple integer field.

### D-3. Events are emitted via a per-run `EventBuffer`, flushed at COMMIT

**Decision.** Engine instantiates one `EventBuffer` per run. Every
emission accumulates an event object in memory. At the end of the
apply transaction (after the agency writes but inside the same
`withTransaction` block), the buffer flushes all collected events in
one batch INSERT. A failure rolls back BOTH the agency writes AND
the event writes.

**Rationale.**

- **Atomicity.** Events and the changes they describe live or die
  together. We never end up with "I see SynchronizationCompleted
  but no agency rows" or vice versa.
- **Performance.** One round-trip per run instead of N round-trips
  per event. At the 581-record NEA-KE size, we'd otherwise stream
  ~1200 events through Postgres serially.
- **Ordering.** All events for a run go in with monotonically
  increasing `occurred_at`; the buffer preserves emission order so
  consumers see a coherent timeline.

**Rejected alternatives.**

- **Emit each event immediately.** Adds N round-trips per run;
  partial-failure recovery becomes "did we emit half the events?";
  ordering across concurrent runs gets racy.
- **Use Postgres LISTEN/NOTIFY.** That's a transport for
  notifying consumers, not a persistence mechanism. We can layer
  NOTIFY on top of `sync_events` later (M6 admin dashboard wants
  live updates) without changing this decision.

### D-4. Twelve initial event types as a TypeScript discriminated union

**Decision.** Per Tony's brief, the initial set:

| Event type                  | When emitted                                             | Subject       |
|----------------------------|----------------------------------------------------------|---------------|
| `SynchronizationStarted`    | Run row created; before fetch                            | run           |
| `SynchronizationCompleted`  | Run finished cleanly (apply succeeded)                   | run           |
| `SynchronizationFailed`     | Run threw or held-for-review without apply               | run           |
| `AgencyCreated`             | New agency row written                                   | agency        |
| `AgencyUpdated`             | Existing agency row's fingerprint changed                | agency        |
| `AgencyRemoved`             | Agency absent from source — status_source flipped        | agency        |
| `AgencyRestored`            | Previously-removed agency reappears                      | agency        |
| `AgencyQuarantined`         | Record failed normalization OR base/provider validation  | (license_no)  |
| `NormalizationFailed`       | Adapter normalize() threw                                | (license_no)  |
| `ValidationFailed`          | Zod/provider validate() returned ok:false                | (license_no)  |
| `FingerprintChanged`        | Sub-type of AgencyUpdated; emitted *additionally*        | agency        |
| `ProviderHealthChanged`     | sync_providers.health transitioned                       | provider      |

Some overlap is deliberate:

- `AgencyQuarantined` is the umbrella; consumers filtering for
  "everything that didn't make it" can match on it alone.
- `NormalizationFailed` and `ValidationFailed` are emitted IN
  ADDITION because consumers wanting per-stage attribution shouldn't
  have to parse the `reasons` array of an umbrella event.
- `FingerprintChanged` is a side-channel for fingerprint-diff-only
  consumers (M-future: a fingerprint heatmap dashboard), so they
  don't have to inspect every `AgencyUpdated.fieldChanges`.

The duplication is cheap (events are small JSON blobs) and the
specificity buys consumer-side simplicity.

### D-5. `subject_type` + `subject_id` are nullable and partially indexed

**Decision.** The `sync_events` row carries `subject_type` (enum:
`agency` | `run` | `provider` | `license` | null) and `subject_id`
(varchar). Both nullable. Partial indexes per subject_type so
queries like "all events for agency X" are fast.

**Rationale.** Events have natural subjects, but the subject differs
by event type — a run-level event subjects the run, an agency-level
event subjects the agency. Encoding this explicitly avoids "find
the agency_id by inspecting the payload" queries.

`subject_type = "license"` is used when we have a licence_number but
no agency_id yet (e.g. AgencyQuarantined before a row exists).

## Interplay with prior ADRs

- **ADR 0001 §D-7 (Engine result shape).** Unchanged at the
  in-memory level. The engine result continues to be a transient
  Map+arrays object. The Event Store is the persistent
  serialization of "what the run did."
- **ADR 0002 §D-1 (Raw Import stage).** Strengthened. The raw
  payload now appears in three places: `sync_records.raw_payload`
  (per-record archive), `AgencyQuarantined.rawPayload` (per-event
  audit), and the captured snapshot (per-run archive). Triple
  redundancy is intentional — each serves a different reader.
- **ADR 0002 §D-2 (Versioned normalizer).** Composed with this ADR:
  `SynchronizationCompleted.normalizerVersion` records which
  normalizer produced the run. Combined with `event_version`
  (event schema) and `fingerprintVersion` (fingerprint algo), the
  Event Store carries a complete versioning provenance.

## Risks and mitigations

| Risk                                                            | Mitigation                                                                |
|----------------------------------------------------------------|---------------------------------------------------------------------------|
| Buffer grows unbounded on a 1M-record run                       | Hard cap of 1M events per run; if hit, emit `SynchronizationFailed`        |
| Schema-evolution discipline slips (developer forgets `v:`)      | TypeScript discriminated union forces explicit `v` on every variant       |
| Events double-write on apply retry                              | Apply is transactional; retries replay the transaction (no double-emit)   |
| `sync_events` table grows fast                                  | Partition by month or implement retention in M-future; flag for revisit at 10M rows |
| Projection drift (agency_change_log out of sync with events)    | Both written in the same transaction; if one fails the other rolls back   |

## References

- ADR 0001, ADR 0002.
- SRS §27 (Error handling), §44 (Future extensibility).
- `migrations/0008_sync_engine_event_store_and_snapshots.sql` — schema delta.
- `server/sync/events.ts` — twelve event type discriminated union.
- `server/sync/sync-runner.ts` — emission call sites.
