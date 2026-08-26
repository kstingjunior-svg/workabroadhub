/**
 * NEA sync orchestrator — the single public entry point.
 *
 *   • runSyncFromSource(raw, source, adminId?)
 *       Parses `raw`, diffs against DB, applies changes, logs a
 *       `nea_sync_runs` row, returns a summary.
 *
 *   • runAutoSync(triggeredBy)
 *       Attempts to auto-fetch from NEAIMS. If the fetch returns 0 rows
 *       (JavaScript-only page, blocked, or format changed), logs an
 *       'admin_paste_required' error run so the admin dashboard shows
 *       "Sync needs your attention" and the admin can then paste manually.
 *
 * The apply step uses a Postgres transaction so a mid-sync failure never
 * leaves the DB half-updated.
 */

import { pool } from "../../db";
import { parseNEASource, type ParsedAgency, type ParseResult } from "./parser";
import { diffAgencies, type DbAgency, type DiffResult } from "./differ";

// ─── Public API ───────────────────────────────────────────────────────────

export interface SyncSummary {
  runId:       string;
  status:      "ok" | "partial" | "error";
  source:      string;
  fetchedRows: number;
  added:       number;
  updated:     number;
  expired:     number;
  revoked:     number;
  unchanged:   number;
  activeAfter: number;
  expiredAfter: number;
  warnings:    string[];
  errorMessage?: string;
}

/**
 * Run a sync against the given raw source text.
 * Called by both the admin manual-paste endpoint and the cron auto-fetch.
 */
export async function runSyncFromSource(
  raw:    string,
  source: "auto_fetch" | "admin_paste" | "cron",
  triggeredBy: string | null = null,
): Promise<SyncSummary> {
  const runId = await openRun(source, triggeredBy, raw.length);

  try {
    const parseResult = parseNEASource(raw);
    if (parseResult.rows.length === 0) {
      const msg = `Parser returned 0 rows. Warnings: ${parseResult.warnings.join("; ") || "none"}`;
      await closeRun(runId, {
        status:       "error",
        errorMessage: msg,
        fetchedRows:  0,
      });
      return errorSummary(runId, source, msg);
    }

    // Snapshot current DB
    const dbRows = await loadDbAgencies();

    // Diff
    const diff = diffAgencies(parseResult.rows, dbRows);

    // Apply in a transaction
    await applyDiff(diff);

    // Post-sync counts (for the "active_after / expired_after" columns)
    const [activeAfter, expiredAfter] = await countActiveExpired();

    const summary: SyncSummary = {
      runId,
      status:       "ok",
      source,
      fetchedRows:  parseResult.rows.length,
      added:        diff.added.length,
      updated:      diff.updated.length,
      expired:      diff.expired.length,
      revoked:      diff.revoked.length,
      unchanged:    diff.unchanged,
      activeAfter,
      expiredAfter,
      warnings:     parseResult.warnings,
    };

    await closeRun(runId, {
      status:      "ok",
      fetchedRows: parseResult.rows.length,
      added:       diff.added.length,
      updated:     diff.updated.length,
      expired:     diff.expired.length,
      revoked:     diff.revoked.length,
      unchanged:   diff.unchanged,
      activeAfter,
      expiredAfter,
      notes:       parseResult.warnings.length ? parseResult.warnings.join(" | ") : null,
    });

    return summary;
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    console.error("[nea-sync] failed:", msg, err?.stack?.split("\n")[0]);
    await closeRun(runId, { status: "error", errorMessage: msg });
    return errorSummary(runId, source, msg);
  }
}

/**
 * Attempts to fetch NEAIMS directly, then runs the pipeline. Called by the
 * weekly cron. If NEAIMS returns HTML that yields 0 rows (because it's
 * JS-rendered), the run is logged as 'error' with `error_message =
 * "auto-fetch produced 0 rows — admin paste required"` so the admin
 * dashboard surfaces the issue and Tony (or another admin) can paste the
 * latest CSV export manually.
 */
export async function runAutoSync(triggeredBy: string = "cron"): Promise<SyncSummary> {
  try {
    const raw = await fetchNEAIMS();
    if (!raw || raw.trim().length < 500) {
      const runId = await openRun("auto_fetch", triggeredBy, raw?.length ?? 0);
      const msg = "auto-fetch returned empty/tiny payload — NEAIMS likely requires JS pagination. Admin paste required.";
      await closeRun(runId, { status: "error", errorMessage: msg });
      return errorSummary(runId, "auto_fetch", msg);
    }
    return runSyncFromSource(raw, triggeredBy === "cron" ? "cron" : "auto_fetch", triggeredBy);
  } catch (err: any) {
    const runId = await openRun("auto_fetch", triggeredBy, 0);
    const msg = `auto-fetch threw: ${err?.message ?? err}`;
    await closeRun(runId, { status: "error", errorMessage: msg });
    return errorSummary(runId, "auto_fetch", msg);
  }
}

// ─── Internals ────────────────────────────────────────────────────────────

const NEAIMS_URL = "https://neaims.go.ke/EmploymentAgencyList.aspx";

async function fetchNEAIMS(): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(NEAIMS_URL, {
      signal:  controller.signal,
      headers: {
        // Pretend to be a normal browser — some ASP.NET installs 403 curl UAs.
        "User-Agent":      "Mozilla/5.0 (compatible; WorkAbroadHubSync/1.0; +https://workabroadhub.tech)",
        "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-KE,en;q=0.9",
      },
    });
    if (!res.ok) throw new Error(`NEAIMS returned HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function loadDbAgencies(): Promise<DbAgency[]> {
  const { rows } = await pool.query<{
    id:               string;
    agency_name:      string;
    license_number:   string;
    email:            string | null;
    service_type:     string | null;
    issue_date:       Date | null;
    expiry_date:      Date | null;
    status_override:  string | null;
  }>(
    `SELECT id, agency_name, license_number, email, service_type,
            issue_date, expiry_date, status_override
       FROM nea_agencies`,
  );
  return rows.map((r) => ({
    id:            r.id,
    agencyName:    r.agency_name,
    licenseNumber: r.license_number,
    email:         r.email,
    serviceType:   r.service_type,
    issueDate:     r.issue_date,
    expiryDate:    r.expiry_date,
    statusOverride: r.status_override,
  }));
}

async function applyDiff(diff: DiffResult): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Inserts
    for (const a of diff.added) {
      await client.query(
        `INSERT INTO nea_agencies
           (agency_name, license_number, email, service_type,
            issue_date, expiry_date, is_published, last_updated)
         VALUES ($1, $2, $3, $4, $5, $6, true, NOW())
         ON CONFLICT (license_number) DO NOTHING`,
        [
          a.agencyName,
          a.licenseNumber,
          a.email,
          a.serviceType,
          a.issueDate ? new Date(a.issueDate) : new Date("2000-01-01"),
          a.expiryDate ? new Date(a.expiryDate) : new Date("2000-01-01"),
        ],
      );
    }

    // Updates
    for (const { parsed: a, db } of diff.updated) {
      await client.query(
        `UPDATE nea_agencies
            SET agency_name  = $2,
                email        = COALESCE($3, email),
                service_type = COALESCE($4, service_type),
                issue_date   = COALESCE($5, issue_date),
                expiry_date  = COALESCE($6, expiry_date),
                last_updated = NOW()
          WHERE id = $1`,
        [
          db.id,
          a.agencyName,
          a.email,
          a.serviceType,
          a.issueDate ? new Date(a.issueDate) : null,
          a.expiryDate ? new Date(a.expiryDate) : null,
        ],
      );
    }

    // Newly-expired (source says expired OR expiry date has passed)
    for (const d of diff.expired) {
      await client.query(
        `UPDATE nea_agencies
            SET status_override = 'expired',
                last_updated    = NOW()
          WHERE id = $1`,
        [d.id],
      );
    }

    // Revoked (present in DB, absent from source, was still active)
    for (const d of diff.revoked) {
      await client.query(
        `UPDATE nea_agencies
            SET status_override = 'revoked',
                notes           = COALESCE(notes, '') || $2,
                last_updated    = NOW()
          WHERE id = $1`,
        [d.id, ` [auto-sync] Not present in NEA export on ${new Date().toISOString().slice(0, 10)}`],
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

async function countActiveExpired(): Promise<[number, number]> {
  const { rows } = await pool.query<{ active: string; expired: string }>(
    `SELECT
       COUNT(*) FILTER (
         WHERE expiry_date > NOW()
           AND COALESCE(status_override, '') NOT IN ('expired', 'revoked', 'suspended')
       )::text AS active,
       COUNT(*) FILTER (
         WHERE expiry_date <= NOW()
            OR COALESCE(status_override, '') IN ('expired', 'revoked', 'suspended')
       )::text AS expired
     FROM nea_agencies`,
  );
  return [Number(rows[0]?.active ?? 0), Number(rows[0]?.expired ?? 0)];
}

async function openRun(
  source:      "auto_fetch" | "admin_paste" | "cron",
  triggeredBy: string | null,
  rawBytes:    number,
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO nea_sync_runs (source, status, triggered_by, raw_bytes)
     VALUES ($1, 'running', $2, $3)
     RETURNING id`,
    [source, triggeredBy, rawBytes],
  );
  return rows[0].id;
}

async function closeRun(
  id: string,
  patch: Partial<{
    status:       "ok" | "partial" | "error";
    fetchedRows:  number;
    added:        number;
    updated:      number;
    expired:      number;
    revoked:      number;
    unchanged:    number;
    activeAfter:  number;
    expiredAfter: number;
    errorMessage: string;
    notes:        string | null;
  }>,
): Promise<void> {
  await pool.query(
    `UPDATE nea_sync_runs
        SET finished_at      = NOW(),
            status           = COALESCE($2, status),
            fetched_rows     = COALESCE($3, fetched_rows),
            new_agencies     = COALESCE($4, new_agencies),
            updated_agencies = COALESCE($5, updated_agencies),
            expired_agencies = COALESCE($6, expired_agencies),
            revoked_agencies = COALESCE($7, revoked_agencies),
            unchanged        = COALESCE($8, unchanged),
            active_after     = COALESCE($9, active_after),
            expired_after    = COALESCE($10, expired_after),
            error_message    = COALESCE($11, error_message),
            notes            = COALESCE($12, notes)
      WHERE id = $1`,
    [
      id,
      patch.status ?? null,
      patch.fetchedRows ?? null,
      patch.added ?? null,
      patch.updated ?? null,
      patch.expired ?? null,
      patch.revoked ?? null,
      patch.unchanged ?? null,
      patch.activeAfter ?? null,
      patch.expiredAfter ?? null,
      patch.errorMessage ?? null,
      patch.notes ?? null,
    ],
  );
}

function errorSummary(runId: string, source: string, errorMessage: string): SyncSummary {
  return {
    runId,
    status:       "error",
    source,
    fetchedRows:  0,
    added:        0,
    updated:      0,
    expired:      0,
    revoked:      0,
    unchanged:    0,
    activeAfter:  0,
    expiredAfter: 0,
    warnings:     [],
    errorMessage,
  };
}
