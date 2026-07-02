# ADR 0001 — Sync Engine Foundation

**Status:** Accepted
**Date:** 2026-06-29
**Milestone:** M1
**Authors:** WorkAbroadHub engineering

## Context

We need a provider-agnostic synchronization engine to replace the hard-coded
`ensureNeaAgenciesSeeded` boot step. M1 ships the foundation: types,
normalisation, fingerprinting, validation, the NEA-KE adapter, and the
deterministic prefix of the engine pipeline (Fetch → Normalize → Validate →
Fingerprint). No DB writes, no Diff, no Apply — those land in M2.

This ADR captures the structural decisions made during M1 so future
milestones inherit a consistent rationale instead of re-litigating choices.

## Decisions

### D-1. Fingerprint algorithm

**Decision.** SHA-256 hex of a canonical pipe-joined tuple of ten frozen
fields. Versioned via `FINGERPRINT_VERSION` (currently `1`).

**Rejected alternatives:**

- **JSON.stringify of the object.** Whitespace/order sensitive across
  runtimes; would fail cross-environment comparisons.
- **Hash of the raw provider payload.** Couples fingerprints to upstream
  formatting; any provider-side cosmetic change triggers a false update.
- **MD5/SHA-1.** Not collision-resistant for adversarial input. We don't
  have an attacker today but the cost difference is negligible.

**Consequence.** Adding a new tracked field to the tuple requires bumping
`FINGERPRINT_VERSION`. The versioned format (`v1:<hex>`) makes stored
fingerprints self-describing so an upgrade is detectable.

### D-2. Data-module colocation

**Decision.** The 581-row NEA dataset lives at
`server/sync/providers/data/nea-ke-records.ts` and is imported by both the
new adapter AND the legacy `ensureNeaAgenciesSeeded`. Single source of
truth during the M1→M8 transition.

**Rejected alternatives:**

- **Inline in the adapter file.** Couples seeding logic to data; reuse
  becomes copy-paste.
- **Loaded from disk as JSON at boot.** Adds a file-I/O failure mode
  to a step that should be deterministic.
- **Stored as a TS const inside the legacy seeder (status quo).** Leaves
  the new adapter without access; cutover requires data migration.

**Consequence.** Refreshing the seed list is one file edit; both consumers
pick up the new data on next deploy. After M8 the legacy seeder is
removed and the data file moves under `server/sync/providers/data/`
unchanged.

### D-3. Quarantine over throw

**Decision.** Validation never throws. Records that fail Zod or the
provider's own `validate()` return `{ ok: false, reasons }` and the engine
routes them to `result.quarantined`. The engine only throws on programmer
errors (adapter `normalize()` crashes, abort signal fired).

**Rejected alternatives:**

- **Throw + try/catch around each record.** Per-record exceptions are
  expensive and produce noisy stack traces in production logs.
- **Discard invalid records silently.** Forbidden by SRS §27 ("no `catch {}`
  swallowing"). The admin must be able to see what was rejected and why.

**Consequence.** The pipeline survives the worst provider in the world.
Bad data is information, not a failure mode.

### D-4. Field set in canonical NormalizedAgency

**Decision.** The canonical shape captures source-controlled fields ONLY.
Admin-controlled fields (`status_override`, `is_published`,
`claimed_by_user_id`, etc.) live on `nea_agencies` but are NOT in the
canonical type, so providers physically cannot write them through the
pipeline.

**Rejected alternatives:**

- **One flat type matching `nea_agencies`.** Lets a buggy adapter overwrite
  the admin's override. Even with code review, the abstraction wouldn't
  enforce the rule.

**Consequence.** Adapter authors literally cannot break admin overrides.
The M2 Apply stage uses the canonical type to derive UPSERT column lists
— only sync-controlled columns appear there.

### D-5. Migration strategy: hand-written SQL, not drizzle-kit auto

**Decision.** `migrations/0006_sync_engine_foundation.sql` is a hand-written,
re-runnable SQL file. Drizzle table definitions in `shared/schema.ts`
exist for TypeScript typing only.

**Rejected alternatives:**

- **`drizzle-kit generate`.** Doesn't handle the data-aware steps
  (insert NEA-KE provider row, backfill existing rows) and produces
  brittle constraint-rename SQL on Postgres.
- **`ensure-sync-tables-created.ts` (boot-time idempotent CREATE).** Works
  for additive changes but the constraint swap (drop global unique on
  `license_number`, add composite unique) is one-shot and doesn't belong
  in a boot script.

**Consequence.** The migration is reviewable as a single SQL artifact and
runs cleanly on Supabase via the SQL editor. The Drizzle types stay in
sync because they're updated in the same commit.

### D-6. Composite uniqueness on `(provider_id, license_number)`

**Decision.** The global `UNIQUE (license_number)` constraint on
`nea_agencies` is dropped and replaced with `UNIQUE (provider_id,
license_number)`.

**Rationale.** Future providers (UK Sponsors uses URNs, Canada uses
employer-IDs, NEA uses PVT-…) may have overlapping numeric namespaces.
A global unique would force artificial namespacing in a column meant
to mirror the source.

**Consequence.** Cross-provider duplicate detection (same agency licensed
in two countries) is now an application concern, not a DB constraint.
SRS §15 notes this is M-future scope.

### D-7. Engine result shape (FoundationRunResult)

**Decision.** The foundation engine returns a single immutable result
object with: correlationId, providerSlug, fetched count, validated[],
quarantined[], fingerprintsByLicense Map, durationMs, stageDurations.

**Rationale.** Callers (M2 storage, M3 anomaly detector, M6 admin UI) need
shape stability. Returning a class with methods couples consumers to the
engine; returning a plain object is freely serialisable for log shipping
and easy to extend with M2-specific fields without breaking M1 consumers.

**Consequence.** When M2 adds Diff output, it sits alongside the M1 fields
in a new `Milestone2RunResult extends FoundationRunResult` type. M1 tests
remain valid.

### D-8. Adapter-private "raw" types

**Decision.** Adapters use `ProviderRecord = Record<string, unknown>` as
the public contract. Each adapter casts the raw to its internal
provider-specific shape inside its own normalize().

**Rejected alternative.** A generic `SyncProvider<TRaw>` parameterised on
the raw shape — clean in theory, but pollutes every engine signature with
a type parameter the engine never actually uses.

**Consequence.** Adapters carry their own type discipline internally; the
engine stays untyped at the raw boundary. Tests for each adapter assert
on the normalised output, not the raw input.

## Open questions deferred to later milestones

- **Cross-provider duplicate detection** — SRS §15 noted v1 punt. M-future.
- **Webhook mode for providers that push updates** — defined in SRS §44.
  M-future after we have ≥3 scheduled providers in production.
- **In-process vs Redis rate-limit buckets** — single-instance is fine
  today; Redis-backed becomes necessary at M-scale (>1 worker instance).

## References

- SRS §6 (Domain Model), §7 (Database Design), §10 (Provider Framework),
  §13 (Data Normalization), §16 (Change Detection), §17 (Record
  Fingerprinting), §27 (Error Handling).
- `server/sync/types.ts` — type contracts.
- `migrations/0006_sync_engine_foundation.sql` — schema deltas.
- `tests/unit/sync/` — invariants asserted.
