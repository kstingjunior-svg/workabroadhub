/**
 * NEAIMS sync orchestrator.
 *
 * Public entry point: `runNeaimsSync(opts)`.
 *
 * Sequence:
 *   1. Insert a "running" row in nea_sync_runs so we always have a record,
 *      even if the process crashes.
 *   2. Fetch verified + invalid buckets from NEAIMS via the HTTP client.
 *   3. Normalize each bucket (drop junk, map status → status_override).
 *   4. Merge, dedupe by license_number (verified wins over expired).
 *   5. Open a Postgres transaction:
 *        a. UPSERT every clean row into nea_agencies (ON CONFLICT UPDATE).
 *        b. Mark rows NOT in this batch (that aren't already unlisted) as
 *           status_override='unlisted'. Soft delete — preserves user claims
 *           / reports / ratings.
 *      Commit or roll back atomically.
 *   6. Update the nea_sync_runs row with counts + status.
 *
 * Concurrency:
 *   • The sync grabs a Postgres advisory lock so two runs (schedule +
 *     admin-triggered at the same moment) can't step on each other.
 *   • If the lock is already held, the second run exits early with status
 *     'skipped_locked'.
 *
 * 2026-07-06.
 */

import { pool } from "../db";
import { fetchNeaimsAgencies, NeaimsClientError } from "./neaimsClient";
import {
  normalizeNeaimsBatch,
  dedupeByLicenseNumber,
  type NormalizedAgency,
} from "./neaimsNormalize";

/**
 * Arbitrary constant — same value used every run so pg_try_advisory_lock
 * blocks concurrent syncs. Picked from /dev/urandom, no significance.
 */
const NEAIMS_SYNC_LOCK_KEY = 4127_301_502;

export interface SyncOptions {
  /** 'schedule' | 'admin' | 'boot' — logged for audit. */
  triggeredBy:       "schedule" | "admin" | "boot";
  /** Filled when an admin manually triggers via the dashboard. */
  triggeredByUserId?: string | null;
}

export interface SyncResult {
  runId:      number | null;
  status:     "succeeded" | "partial" | "failed" | "skipped_locked";
  message:    string;
  durationMs: number;
  counts: {
    verifiedFetched:     number;
    expiredFetched:      number;
    deregisteredFetched: number;
    pendingFetched:      number;
    rawTotal:            number;
    skippedJunk:         number;
    cleanTotal:          number;
    inserted:            number;
    updated:             number;
    markedUnlisted:      number;
  };
  /** Human-readable breakdown of why rows were dropped. */
  skipReasons?: Record<string, number>;
}

/**
 * Run one full sync. Never throws — errors are captured in the result and
 * logged. Callers (schedule / admin route) should treat the returned
 * `status` as authoritative.
 */
export async function runNeaimsSync(opts: SyncOptions): Promise<SyncResult> {
  const t0 = Date.now();
  const counts: SyncResult["counts"] = {
    verifiedFetched:     0,
    expiredFetched:      0,
    deregisteredFetched: 0,
    pendingFetched:      0,
    rawTotal:            0,
    skippedJunk:         0,
    cleanTotal:          0,
    inserted:            0,
    updated:             0,
    markedUnlisted:      0,
  };
  let runId: number | null = null;

  // ── Advisory lock — bail if another sync is running ──────────────────────
  const lockRes = await pool.query<{ locked: boolean }>(
    `SELECT pg_try_advisory_lock($1::bigint) AS locked`,
    [NEAIMS_SYNC_LOCK_KEY],
  );
  if (!lockRes.rows[0]?.locked) {
    console.log(`[NEAIMS sync] Skipping — another run holds the advisory lock.`);
    return {
      runId: null,
      status: "skipped_locked",
      message: "Another NEAIMS sync is already in progress",
      durationMs: Date.now() - t0,
      counts,
    };
  }

  try {
    // ── 1. Insert 'running' row ────────────────────────────────────────────
    try {
      const { rows } = await pool.query<{ id: number }>(
        `INSERT INTO nea_sync_runs (triggered_by, triggered_by_user_id, status)
         VALUES ($1, $2, 'running')
         RETURNING id`,
        [opts.triggeredBy, opts.triggeredByUserId ?? null],
      );
      runId = rows[0].id;
    } catch (err: any) {
      // If we can't even insert the log row, the DB is probably down. Bail
      // loudly rather than silently syncing without a log.
      console.error("[NEAIMS sync] Could not insert nea_sync_runs row:", err?.message);
      throw err;
    }

    console.log(`[NEAIMS sync] Starting run ${runId} (triggered_by=${opts.triggeredBy})`);

    // ── 2. Fetch both buckets ──────────────────────────────────────────────
    let verifiedRows: Awaited<ReturnType<typeof fetchNeaimsAgencies>>;
    let invalidRows:  Awaited<ReturnType<typeof fetchNeaimsAgencies>>;
    try {
      // Sequential rather than parallel — NEAIMS is a public gov endpoint,
      // don't want to look like a scraper hitting it twice at once.
      verifiedRows = await fetchNeaimsAgencies(true);
      invalidRows  = await fetchNeaimsAgencies(false);
    } catch (err: any) {
      const code = err instanceof NeaimsClientError ? err.code : "FETCH_UNKNOWN";
      await finishRun(runId, "failed", counts, {
        error_message: err?.message ?? String(err),
        error_code:    code,
        duration_ms:   Date.now() - t0,
      });
      return {
        runId,
        status:  "failed",
        message: `Fetch failed: ${err?.message ?? err}`,
        durationMs: Date.now() - t0,
        counts,
      };
    }

    counts.verifiedFetched = verifiedRows.length;
    counts.rawTotal = verifiedRows.length + invalidRows.length;

    // Categorise invalid rows by their instStatus so the log breaks down
    // where they came from.
    for (const r of invalidRows) {
      if (r.instStatus === "LICENSE_EXPIRED")      counts.expiredFetched++;
      else if (r.instStatus === "LICENSE_DEREGISTERED") counts.deregisteredFetched++;
      else if (r.instStatus === "LICENSE_PENDING") counts.pendingFetched++;
    }

    // ── 3. Normalize ───────────────────────────────────────────────────────
    const verifiedNorm = normalizeNeaimsBatch(verifiedRows, "verified");
    const invalidNorm  = normalizeNeaimsBatch(invalidRows,  "invalid");
    counts.skippedJunk = verifiedNorm.skippedJunk + invalidNorm.skippedJunk;

    // Combine drop-reason maps for the return value.
    const skipReasons: Record<string, number> = {};
    for (const [reason, n] of verifiedNorm.skipReasons) skipReasons[reason] = (skipReasons[reason] ?? 0) + n;
    for (const [reason, n] of invalidNorm.skipReasons)  skipReasons[reason] = (skipReasons[reason] ?? 0) + n;

    // ── 4. Dedupe (verified wins over expired for same license number) ────
    const merged = dedupeByLicenseNumber([...verifiedNorm.clean, ...invalidNorm.clean]);
    counts.cleanTotal = merged.length;

    if (merged.length === 0) {
      // Sanity check — if NEAIMS ever returns zero clean rows, something's
      // broken. Don't wipe our DB by marking every row unlisted.
      await finishRun(runId, "failed", counts, {
        error_message: "Zero clean rows after normalization — refusing to unlist all agencies",
        error_code:    "ZERO_ROWS",
        duration_ms:   Date.now() - t0,
      });
      return {
        runId,
        status:  "failed",
        message: "Zero clean rows returned from NEAIMS. Refusing to touch DB.",
        durationMs: Date.now() - t0,
        counts,
        skipReasons,
      };
    }

    // ── 5. Apply to DB in a transaction ────────────────────────────────────
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 5a. UPSERT every clean row.
      // Do it in one INSERT ... VALUES (...), (...) ... statement with the
      // parameters flattened, so it's a single round-trip per batch of ~500.
      const BATCH = 500;
      let inserted = 0;
      let updated  = 0;
      for (let i = 0; i < merged.length; i += BATCH) {
        const slice = merged.slice(i, i + BATCH);
        const { inserted: ins, updated: upd } = await upsertBatch(client, slice);
        inserted += ins;
        updated  += upd;
      }
      counts.inserted = inserted;
      counts.updated  = updated;

      // 5b. Mark orphans as unlisted.
      const licenseNumbers = merged.map(r => r.licenseNumber);
      const orphanResult = await client.query(
        `UPDATE nea_agencies
            SET status_override = 'unlisted',
                last_updated    = NOW(),
                updated_by      = 'neaims-sync'
          WHERE license_number NOT IN (SELECT unnest($1::text[]))
            AND status_override IS DISTINCT FROM 'unlisted'`,
        [licenseNumbers],
      );
      counts.markedUnlisted = orphanResult.rowCount ?? 0;

      await client.query("COMMIT");
    } catch (err: any) {
      await client.query("ROLLBACK").catch(() => {});
      await finishRun(runId, "failed", counts, {
        error_message: err?.message ?? String(err),
        error_code:    "DB_TRANSACTION",
        duration_ms:   Date.now() - t0,
      });
      return {
        runId,
        status:  "failed",
        message: `DB transaction failed: ${err?.message ?? err}`,
        durationMs: Date.now() - t0,
        counts,
        skipReasons,
      };
    } finally {
      client.release();
    }

    // ── 6. Finalise the log row ────────────────────────────────────────────
    const finalStatus = counts.skippedJunk > 0 ? "partial" : "succeeded";
    await finishRun(runId, finalStatus, counts, {
      duration_ms: Date.now() - t0,
    });

    const message =
      `NEAIMS sync ${finalStatus}: ` +
      `${counts.inserted} inserted, ${counts.updated} updated, ` +
      `${counts.markedUnlisted} unlisted, ${counts.skippedJunk} junk skipped`;
    console.log(`[NEAIMS sync] Run ${runId} ${finalStatus} — ${message}`);

    return {
      runId,
      status:  finalStatus,
      message,
      durationMs: Date.now() - t0,
      counts,
      skipReasons,
    };
  } finally {
    // Always release the advisory lock, even on unexpected throw.
    await pool.query(
      `SELECT pg_advisory_unlock($1::bigint)`,
      [NEAIMS_SYNC_LOCK_KEY],
    ).catch(err => console.warn("[NEAIMS sync] Failed to release advisory lock:", err?.message));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * UPSERT a batch of normalized rows into nea_agencies. Returns split counts
 * for inserted vs updated so the log is accurate.
 *
 * Uses the "xmax=0 means inserted" Postgres trick to distinguish the two.
 */
async function upsertBatch(
  client: import("pg").PoolClient,
  batch:  NormalizedAgency[],
): Promise<{ inserted: number; updated: number }> {
  if (batch.length === 0) return { inserted: 0, updated: 0 };

  // Build a parameterised VALUES list. Nine columns per row.
  const cols = 9;
  const values: any[] = [];
  const placeholders: string[] = [];
  batch.forEach((r, idx) => {
    const base = idx * cols;
    placeholders.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, ` +
      `$${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`,
    );
    values.push(
      r.agencyName,
      r.licenseNumber,
      r.email,
      r.serviceType,
      r.issueDate,
      r.expiryDate,
      r.statusOverride,   // null / 'expired' / 'revoked'
      // last_updated → NOW() in SQL (can't parameterise it usefully with defaults)
      new Date(),
      "neaims-sync",       // updated_by
    );
  });

  const sql = `
    INSERT INTO nea_agencies (
      agency_name, license_number, email, service_type,
      issue_date, expiry_date, status_override, last_updated, updated_by
    )
    VALUES ${placeholders.join(", ")}
    ON CONFLICT (license_number) DO UPDATE SET
      agency_name     = EXCLUDED.agency_name,
      email           = EXCLUDED.email,
      service_type    = EXCLUDED.service_type,
      issue_date      = EXCLUDED.issue_date,
      expiry_date     = EXCLUDED.expiry_date,
      status_override = EXCLUDED.status_override,
      last_updated    = NOW(),
      updated_by      = 'neaims-sync'
    RETURNING (xmax = 0) AS was_inserted
  `;

  const res = await client.query<{ was_inserted: boolean }>(sql, values);
  let inserted = 0;
  let updated  = 0;
  for (const row of res.rows) {
    if (row.was_inserted) inserted++;
    else                  updated++;
  }
  return { inserted, updated };
}

/**
 * Update the nea_sync_runs row when a run finishes (or fails). Never throws
 * — a log-write failure at the end shouldn't mask the real result.
 */
async function finishRun(
  runId:  number,
  status: SyncResult["status"],
  counts: SyncResult["counts"],
  extra:  { duration_ms: number; error_message?: string; error_code?: string },
): Promise<void> {
  try {
    await pool.query(
      `UPDATE nea_sync_runs SET
         finished_at          = NOW(),
         status               = $2,
         verified_fetched     = $3,
         expired_fetched      = $4,
         deregistered_fetched = $5,
         pending_fetched      = $6,
         raw_total            = $7,
         skipped_junk         = $8,
         clean_total          = $9,
         inserted             = $10,
         updated              = $11,
         marked_unlisted      = $12,
         duration_ms          = $13,
         error_message        = $14,
         error_code           = $15
       WHERE id = $1`,
      [
        runId,
        status,
        counts.verifiedFetched,
        counts.expiredFetched,
        counts.deregisteredFetched,
        counts.pendingFetched,
        counts.rawTotal,
        counts.skippedJunk,
        counts.cleanTotal,
        counts.inserted,
        counts.updated,
        counts.markedUnlisted,
        extra.duration_ms,
        extra.error_message ?? null,
        extra.error_code    ?? null,
      ],
    );
  } catch (err: any) {
    console.error(`[NEAIMS sync] Failed to write final log row for run ${runId}:`, err?.message);
  }
}
