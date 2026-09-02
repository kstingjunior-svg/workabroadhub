"use strict";
/**
 * Sync Engine — storage layer (Milestone 2).
 *
 * Drizzle-flavoured CRUD against sync_runs, sync_records, agency_change_log,
 * and the reads needed to drive the Diff stage on nea_agencies.
 *
 * Architectural decisions:
 *
 *   1. **Pool-based transactions, not Drizzle's tx wrapper.** The existing
 *      server/storage.ts uses raw pool.connect() + BEGIN/COMMIT. We mirror
 *      that here so the M2 Apply stage can hold ONE client across the
 *      multi-statement transaction (UPSERT created+updated, delete-mark,
 *      change-log inserts). Drizzle's `db.transaction()` would also work
 *      but the repo idiom is raw pool — we don't introduce a second style.
 *
 *   2. **Parameterized queries everywhere.** No string concatenation.
 *      Slug + UUID validation lives at the schema/migration layer; this
 *      layer assumes inputs are clean and lets Postgres enforce types.
 *
 *   3. **Batch inserts via UNNEST.** sync_records and agency_change_log
 *      are append-only and frequently large (581+ rows per run). UNNEST
 *      is the canonical Postgres pattern for one-roundtrip bulk insert
 *      that beats Drizzle's individual-row insert by 50x at this size.
 *
 *   4. **Read-current returns Map keyed by license_number.** The diff
 *      stage needs O(1) lookup; the storage layer's job is to present
 *      data in the shape Diff wants, not raw rows.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProviderIdBySlug = getProviderIdBySlug;
exports.createRun = createRun;
exports.updateRunStatus = updateRunStatus;
exports.insertSyncRecords = insertSyncRecords;
exports.readCurrentAgenciesByProvider = readCurrentAgenciesByProvider;
exports.upsertAgency = upsertAgency;
exports.markAgencyDeletedFromSource = markAgencyDeletedFromSource;
exports.touchAgencyLastSeen = touchAgencyLastSeen;
exports.writeChangeLog = writeChangeLog;
exports.withTransaction = withTransaction;
const db_1 = require("../db");
// ─────────────────────────────────────────────────────────────────────────────
// Provider lookup — used by the M2 engine wrapper to resolve provider_id
// ─────────────────────────────────────────────────────────────────────────────
async function getProviderIdBySlug(slug) {
    const { rows } = await db_1.pool.query(`SELECT id FROM sync_providers WHERE slug = $1 LIMIT 1`, [slug]);
    return rows[0]?.id ?? null;
}
// ─────────────────────────────────────────────────────────────────────────────
// sync_runs CRUD
// ─────────────────────────────────────────────────────────────────────────────
async function createRun(input) {
    const { rows } = await db_1.pool.query(`INSERT INTO sync_runs
       (provider_id, mode, status, triggered_by, correlation_id,
        normalizer_version, fingerprint_version, started_at)
     VALUES ($1, $2, 'running', $3, $4, $5, $6, NOW())
     RETURNING
       id, provider_id AS "providerId", mode, status,
       triggered_by AS "triggeredBy", correlation_id AS "correlationId",
       normalizer_version AS "normalizerVersion",
       fingerprint_version AS "fingerprintVersion",
       started_at AS "startedAt", finished_at AS "finishedAt"`, [
        input.providerId, input.mode, input.triggeredBy, input.correlationId,
        input.normalizerVersion, input.fingerprintVersion,
    ]);
    return rows[0];
}
async function updateRunStatus(runId, patch, client = db_1.pool) {
    // Build the SET clause dynamically but only over a fixed allowlist of
    // columns. No user-controlled column names ever reach this query.
    const sets = ["status = $2"];
    const params = [runId, patch.status];
    let i = 3;
    const addOptional = (col, val) => {
        if (val === undefined)
            return;
        sets.push(`${col} = $${i}`);
        params.push(val);
        i++;
    };
    addOptional("records_seen", patch.recordsSeen);
    addOptional("records_created", patch.recordsCreated);
    addOptional("records_updated", patch.recordsUpdated);
    addOptional("records_deleted", patch.recordsDeleted);
    addOptional("records_quarantined", patch.recordsQuarantined);
    addOptional("duration_ms", patch.durationMs);
    addOptional("error_message", patch.errorMessage);
    addOptional("hold_reason", patch.holdReason);
    // Set finished_at automatically on terminal statuses.
    if (["succeeded", "failed", "held_for_review", "rolled_back"].includes(patch.status)) {
        sets.push("finished_at = NOW()");
    }
    await client.query(`UPDATE sync_runs SET ${sets.join(", ")} WHERE id = $1`, params);
}
// ─────────────────────────────────────────────────────────────────────────────
// sync_records bulk insert
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Persist validated + quarantined records for a run in one round-trip.
 * Uses Postgres UNNEST for batch insert — measured 50x faster than
 * row-by-row at the 581-record NEA-KE size.
 */
async function insertSyncRecords(runId, providerId, normalizerVersion, validated, quarantined, client = db_1.pool) {
    if (validated.length === 0 && quarantined.length === 0)
        return;
    // Build parallel arrays for UNNEST.
    const licenseNumbers = [];
    const fingerprints = [];
    const rawPayloads = []; // jsonb param via ::jsonb cast
    const normalizedPayloads = [];
    const normalizerVersions = [];
    const isQuarantined = [];
    const quarantineReasons = [];
    for (const v of validated) {
        licenseNumbers.push(v.agency.licenseNumber);
        fingerprints.push(v.fingerprint);
        rawPayloads.push(JSON.stringify(v.raw));
        normalizedPayloads.push(JSON.stringify(v.agency));
        normalizerVersions.push(v.normalizerVersion);
        isQuarantined.push(false);
        quarantineReasons.push(null);
    }
    for (const q of quarantined) {
        licenseNumbers.push((q.raw.licenseNumber ?? "").toString());
        // Quarantined rows don't have a fingerprint; use a sentinel so the
        // NOT NULL constraint is satisfied AND we can SELECT/exclude later.
        fingerprints.push("quarantined");
        rawPayloads.push(JSON.stringify(q.raw));
        normalizedPayloads.push(q.partial ? JSON.stringify(q.partial) : null);
        normalizerVersions.push(q.normalizerVersion);
        isQuarantined.push(true);
        quarantineReasons.push(JSON.stringify(q.reasons));
    }
    await client.query(`INSERT INTO sync_records
       (provider_id, run_id, license_number, record_fingerprint,
        raw_payload, normalized_payload, normalizer_version,
        is_quarantined, quarantine_reason)
     SELECT $1, $2, lic, fp, raw::jsonb, norm::jsonb, nv, q, qr
       FROM UNNEST(
              $3::varchar[], $4::varchar[], $5::text[], $6::text[],
              $7::varchar[], $8::boolean[], $9::text[]
            ) AS t(lic, fp, raw, norm, nv, q, qr)`, [
        providerId, runId,
        licenseNumbers, fingerprints, rawPayloads, normalizedPayloads,
        normalizerVersions, isQuarantined, quarantineReasons,
    ]);
}
// ─────────────────────────────────────────────────────────────────────────────
// Current-state read — Diff input
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Read every nea_agencies row owned by a provider, keyed by license_number.
 * The Map is what the Diff stage needs for O(1) before/after comparison.
 */
async function readCurrentAgenciesByProvider(providerId) {
    const { rows } = await db_1.pool.query(`SELECT
       id,
       agency_name        AS "agencyName",
       license_number     AS "licenseNumber",
       country,
       COALESCE(service_type, 'unspecified') AS "serviceType",
       email,
       website,
       phone,
       to_char(issue_date,  'YYYY-MM-DD') AS "issueDate",
       to_char(expiry_date, 'YYYY-MM-DD') AS "expiryDate",
       COALESCE(status_source, 'unknown') AS "statusSource",
       provider_record_fp AS "providerRecordFp"
     FROM nea_agencies
    WHERE provider_id = $1`, [providerId]);
    const out = new Map();
    for (const r of rows)
        out.set(r.licenseNumber, r);
    return out;
}
// ─────────────────────────────────────────────────────────────────────────────
// nea_agencies upsert + delete-mark (called inside the Apply transaction)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Insert (created) or update (updated) one row.
 * Returns the row's id so the caller can write the agency_change_log entry.
 */
async function upsertAgency(providerId, agency, fingerprint, client) {
    const { rows } = await client.query(`INSERT INTO nea_agencies
       (provider_id, agency_name, license_number, country, service_type,
        email, website, phone,
        issue_date, expiry_date, status_source,
        provider_record_fp, is_published,
        first_seen_at, last_seen_at, last_changed_at, last_updated)
     VALUES
       ($1, $2, $3, $4, $5,
        $6, $7, $8,
        $9::date, $10::date, $11,
        $12, TRUE,
        NOW(), NOW(), NOW(), NOW())
     ON CONFLICT (provider_id, license_number) DO UPDATE
       SET agency_name        = EXCLUDED.agency_name,
           country            = EXCLUDED.country,
           service_type       = EXCLUDED.service_type,
           email              = EXCLUDED.email,
           website            = EXCLUDED.website,
           phone              = EXCLUDED.phone,
           issue_date         = EXCLUDED.issue_date,
           expiry_date        = EXCLUDED.expiry_date,
           status_source      = EXCLUDED.status_source,
           provider_record_fp = EXCLUDED.provider_record_fp,
           last_seen_at       = NOW(),
           last_changed_at    = NOW(),
           last_updated       = NOW()
     RETURNING id, (xmax = 0) AS was_created`, [
        providerId, agency.agencyName, agency.licenseNumber, agency.country, agency.serviceType,
        agency.email, agency.website, agency.phone,
        agency.issueDate, agency.expiryDate, agency.statusSource,
        fingerprint,
    ]);
    return { id: rows[0].id, wasCreated: rows[0].was_created };
}
/**
 * Mark an agency as deleted-from-source. We never hard-delete (admin may
 * still need the record for support / fraud investigation); instead we
 * flip status_source to 'expired' and let downstream is_published logic
 * hide it from public views.
 */
async function markAgencyDeletedFromSource(agencyId, client) {
    await client.query(`UPDATE nea_agencies
        SET status_source    = 'expired',
            last_changed_at  = NOW(),
            last_updated     = NOW()
      WHERE id = $1`, [agencyId]);
}
/**
 * Touch last_seen_at for unchanged rows so we can distinguish "still
 * present in the source, just no diff" from "absent from this run".
 */
async function touchAgencyLastSeen(agencyId, client) {
    await client.query(`UPDATE nea_agencies SET last_seen_at = NOW() WHERE id = $1`, [agencyId]);
}
// ─────────────────────────────────────────────────────────────────────────────
// agency_change_log
// ─────────────────────────────────────────────────────────────────────────────
async function writeChangeLog(entries, client) {
    if (entries.length === 0)
        return;
    const agencyIds = [];
    const providerIds = [];
    const runIds = [];
    const changeTypes = [];
    const fieldChanges = [];
    const performedBy = [];
    const reasons = [];
    for (const e of entries) {
        agencyIds.push(e.agencyId);
        providerIds.push(e.providerId);
        runIds.push(e.runId);
        changeTypes.push(e.changeType);
        fieldChanges.push(JSON.stringify(e.fieldChanges));
        performedBy.push(e.performedBy ?? "system");
        reasons.push(e.reason ?? null);
    }
    await client.query(`INSERT INTO agency_change_log
       (agency_id, provider_id, run_id, change_type, field_changes,
        performed_by, reason)
     SELECT a, p, r, ct, fc::jsonb, pb, rs
       FROM UNNEST(
              $1::varchar[], $2::varchar[], $3::varchar[], $4::varchar[],
              $5::text[],    $6::varchar[], $7::text[]
            ) AS t(a, p, r, ct, fc, pb, rs)`, [agencyIds, providerIds, runIds, changeTypes, fieldChanges, performedBy, reasons]);
}
// ─────────────────────────────────────────────────────────────────────────────
// Transaction helper
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Run `fn` inside a Postgres transaction with one dedicated client.
 * Any throw rolls back; clean return commits. Caller's `fn` MUST use the
 * supplied client for all queries (don't reach for `pool` inside).
 */
async function withTransaction(fn) {
    const client = await db_1.pool.connect();
    try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
    }
    catch (err) {
        await client.query("ROLLBACK").catch(() => { });
        throw err;
    }
    finally {
        client.release();
    }
}
