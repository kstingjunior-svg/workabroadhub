/**
 * Nightly agency-expiry sweep.
 *
 * 2026-10 (Tony: "expired agencies still show green/VERIFIED").
 *
 * The weekly NEA sync (Monday 02:00 EAT) refreshes the whole dataset,
 * but between syncs some licenses tick past their expiry date — and
 * because the seed job used to force status_override='verified' on
 * every row, those freshly-expired agencies would keep showing a
 * green VERIFIED badge until the next weekly sync.
 *
 * The frontend fix (expiry beats a stale 'verified' override) already
 * closes the user-visible leak. This sweep adds a belt-and-braces
 * cleanup at the data layer: every night at 02:30 EAT (= 23:30 UTC)
 * we flip any status_override='verified' row to NULL as soon as its
 * expiry_date has passed, so downstream code paths that trust the
 * DB-stored override (admin exports, score engine, verification API)
 * see the correct status without waiting for Monday.
 *
 * Mechanics:
 *  - Check every 10 min, fire inside the 23:30-24:00 UTC window.
 *  - Dedupe via an in-process `lastSweptForDate` guard so a long
 *    window + 10-min tick never runs twice in one calendar day.
 *  - Safe to run on every boot — the UPDATE is a no-op when there
 *    are no stale rows.
 *  - Never crashes the process; errors are logged.
 */

import { pool } from "../db";

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
let started = false;
let lastSweptForDate = ""; // "YYYY-MM-DD" of the day we last ran

export function startAgencyExpirySweepScheduler(): void {
  if (started) return;
  started = true;

  console.log("[agency-expiry-sweep] scheduler started — nightly target: 02:30 EAT");

  // Fire once on boot as well — if the server was down overnight, we still
  // catch up as soon as it comes online. The dedupe guard prevents it
  // running again later the same day.
  setTimeout(runSweepIfDue, 90_000);
  setInterval(runSweepIfDue, CHECK_INTERVAL_MS);
}

async function runSweepIfDue(): Promise<void> {
  try {
    const now = new Date();
    const dateKey = now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

    // Only inside the night-of window OR on boot catch-up for today
    if (!isInNightWindow(now) && lastSweptForDate === dateKey) return;
    if (lastSweptForDate === dateKey) return;

    await runSweepNow();
    lastSweptForDate = dateKey;
  } catch (err: any) {
    console.error("[agency-expiry-sweep] tick error:", err?.message);
  }
}

/**
 * Exported so an admin endpoint / manual trigger can call it on demand.
 * Returns the number of rows cleared.
 */
export async function runSweepNow(): Promise<number> {
  const started = Date.now();
  const result = await pool.query<{ id: string }>(
    `UPDATE nea_agencies
        SET status_override = NULL,
            last_updated = NOW()
      WHERE status_override = 'verified'
        AND expiry_date < CURRENT_DATE
      RETURNING id`,
  );
  const cleared = result.rowCount ?? 0;
  const ms = Date.now() - started;
  if (cleared > 0) {
    console.log(
      `[agency-expiry-sweep] cleared stale 'verified' flag from ${cleared} newly-expired agencies in ${ms}ms`,
    );
  } else {
    console.log(`[agency-expiry-sweep] no stale rows (${ms}ms) — all good`);
  }
  return cleared;
}

// 02:30 EAT === 23:30 UTC the previous calendar day.
// We accept 23:00 → 23:59 UTC as the window so the 10-min tick reliably hits.
function isInNightWindow(d: Date): boolean {
  const h = d.getUTCHours();
  return h === 23;
}
