# ADR 0002 — Raw Import, Versioned Normalization, Provider Capabilities

**Status:** Accepted
**Date:** 2026-06-29
**Milestone:** Pre-M2 architectural improvements
**Authors:** WorkAbroadHub engineering
**Supersedes:** part of ADR 0001 §D-4 (NormalizedAgency contract narrowed)

## Context

ADR 0001 took the foundation engine through Fetch → Normalize → Validate →
Fingerprint and stopped there. Three architectural gaps surfaced after the
M1 smoke pass that we agreed to close before M2 layers Diff + Apply:

1. **Raw payloads were not preserved.** sync_records.raw_payload was
   intended to hold the post-normalize JSON; this conflates "what the
   source said" with "what our normalizer produced" and forecloses on
   future re-normalization without re-scraping.
2. **No normalizer version stamp.** A change to any normalize helper
   (e.g. tightening normalizeLicenseNumber) silently invalidates every
   stored fingerprint with no way to detect or recover except a full
   re-sync.
3. **Provider capabilities were implicit.** ProviderMetadata had isStatic
   and adapterVersion but nothing machine-readable about what modes a
   provider supports. M3+ scheduler/dashboard would need to grep README
   prose to decide whether to invoke incremental sync, webhooks, etc.

## Decisions

### D-1. Raw Import becomes an explicit pipeline stage

**Decision.** Insert a new stage **before** Normalize that takes a deep
clone of the provider's raw payload via `structuredClone`. The cloned raw
is carried alongside the normalized agency through every downstream stage
and lands on disk in `sync_records.raw_payload`. The post-normalize form
goes to a new column `sync_records.normalized_payload`.

**Rationale.**

- **Adversarial-adapter safety.** A buggy or hostile adapter could mutate
  the raw object during normalize(). The deep clone guarantees the raw
  the engine persists is the byte-for-byte response that arrived.
- **Recoverability.** With (raw, normalizer_version) on every row, a
  future code change to any normalize helper can be re-applied to
  historic data without re-fetching from the provider. Critical when
  the provider doesn't support time travel.
- **Audit completeness.** Compliance reviews and "show me what NEA said
  on 2026-08-15" queries answer from the database, not from "we'd have
  to scrape again."

**Rejected alternatives.**

- **Store JSON-stringified raw on the normalized record.** Couples
  raw shape to the wire format of normalized; one is a contract with
  the source, the other with us. Mixing them complicates schema
  versioning.
- **Hash the raw and store only the hash.** Saves bytes, loses
  recoverability. The whole point of Raw Import is that we can
  re-derive on demand.

**Consequence.**

- New migration 0007 adds `sync_records.normalized_payload jsonb` and
  shifts `raw_payload`'s semantics to "exact provider response".
- ValidatedRecord and QuarantinedRecord types both carry `raw` at the
  TypeScript level.
- Deep-clone cost on the 581-record NEA-KE dataset measured at <1ms
  (rawImport bucket on the smoke run). Acceptable.

### D-2. Normalizer is versioned via NORMALIZER_VERSION

**Decision.** Add a `NORMALIZER_VERSION` constant to `normalize.ts`
(initial value `1.0.0`). Format is SemVer-like; MAJOR bumps imply
incompatible behaviour, MINOR/PATCH are refinements. Every validated
sync_record stamps the version that produced it; every sync_run pins
both `normalizer_version` and `fingerprint_version` at run start.

**Rationale.**

- **Auditability.** "Which normalizer produced this row?" is
  a single column lookup.
- **Migration tractability.** A M-future re-normalisation sweep is
  `SELECT * FROM sync_records WHERE provider_id = $1 AND
  normalizer_version < $current` followed by re-derive from the
  stored raw payload. Doesn't require any new schema work.
- **Behavioral diff debugging.** When a fingerprint flickers
  unexpectedly, the version stamp on the affected rows tells us
  whether the cause was an upstream data change or a normalizer
  code change.

**Rejected alternatives.**

- **Git SHA of normalize.ts.** Coupling to VCS history makes
  cross-deploy comparisons brittle (rebase changes SHAs) and the
  rule about "bump on shape change" is more accurate than "bump on
  any change."
- **Hash of the normalize module's compiled bytecode.** Triggers on
  non-behavioural changes (comments, formatting). Same problem as
  git SHAs in worse form.

**Consequence.**

- Migration 0007 adds `sync_records.normalizer_version` and
  `sync_runs.{normalizer_version, fingerprint_version}`.
- Anyone touching normalize.ts is responsible for considering whether
  the behaviour changed. The version log block at the top of
  normalize.ts is the audit trail.
- Pairs naturally with D-1: with raw + version, we can always
  re-derive; without one of them, we can't.

### D-3. Provider capabilities are declared explicitly via ProviderCapabilities

**Decision.** Add a `ProviderCapabilities` interface with seven boolean
flags: supportsPagination, supportsIncrementalSync, supportsWebhooks,
supportsFiltering, supportsSearch, supportsUpstreamSnapshots,
supportsHealthProbe. Every provider's `metadata()` returns capabilities.

**Rationale.**

- **Decoupling.** The scheduler (M4), admin UI (M6), and engine no
  longer need to know which provider they're talking to in order to
  decide what's safe to call. They interrogate capabilities.
- **Honesty contract.** An adapter that lies about a capability
  causes the engine to invoke an unsupported mode and fail loudly,
  which is exactly the right outcome (vs. silent skip).
- **Documentation by code.** Listing the capabilities forces every
  adapter author to enumerate "what does this provider actually do?"
  before writing any code.

**Rejected alternatives.**

- **Runtime feature detection (try the call, catch the error).**
  Optimistic-call patterns are noisy in logs and slow (an aborted
  webhook registration round-trips the network) and produce
  confusing audit trails.
- **Free-form `features: string[]`.** Allows typos; defers the
  contract to humans reading docs.
- **Per-capability subclass interfaces (IncrementalSyncProvider,
  WebhookProvider, etc.).** TypeScript intersection types work but
  the M3+ scheduler would need narrowing everywhere. Boolean flags
  on a single interface are simpler and equally type-safe at the
  call sites.

**Consequence.**

- ProviderMetadata gains a required `capabilities` field. The
  NEA-KE adapter declares its capabilities as a static-replay
  source: pagination true, everything else false.
- M3 webhooks work, M4 scheduler, and M-future search/filter
  features can ship as engine work without touching adapter code,
  provided the adapter sets the right flag.
- Tests assert that every adapter declares all seven flags
  (compile-time guarantee already; runtime tests verify the values
  are honest).

## Interplay with M1 decisions

- **ADR 0001 §D-1 (Fingerprint algorithm)** remains unchanged. The
  fingerprint version still gates fingerprint comparability; the new
  normalizer version gates normalization comparability. They're
  orthogonal axes.
- **ADR 0001 §D-3 (Quarantine over throw)** is reinforced: quarantined
  records now also carry the normalizer version that produced their
  partial form (or null if normalize threw). Future re-normalisation
  can also re-attempt quarantined rows.
- **ADR 0001 §D-7 (Engine result shape)** is extended additively:
  `FoundationRunResult` gains `normalizerVersion`, `fingerprintVersion`,
  and `stageDurations.rawImport`. Existing consumers continue to work.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Adapter author forgets to bump NORMALIZER_VERSION after a behavior change | Lint rule or pre-push hook in M-future; manual review for M2 |
| Deep clone overhead becomes a budget concern at 100k records | Smoke shows ~5μs per record; budget at 1k/run is ~5ms. Reserve evaluation for M-N |
| ProviderCapabilities lies (provider says supportsWebhooks but doesn't) | Engine invokes the unsupported mode and fails loudly; not silent |
| Snapshot files grow because we now persist raw + normalized | M3 will introduce retention policy; not a v1 concern |

## References

- ADR 0001 — the M1 foundation this builds on.
- SRS §6 (Domain Model), §17 (Record Fingerprinting), §44 (Future
  Extension Strategy).
- `migrations/0007_sync_engine_raw_and_versioning.sql` — schema deltas.
- `server/sync/normalize.ts` — NORMALIZER_VERSION definition + version log.
- `server/sync/types.ts` — ProviderCapabilities, ValidatedRecord
  (with raw), QuarantinedRecord (with raw).
- `server/sync/engine.ts` — Raw Import stage implementation.
- `server/sync/providers/nea-ke.ts` — first adapter declaring
  capabilities.
