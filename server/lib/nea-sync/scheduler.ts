/**
 * Weekly NEA sync cron.
 *
 * Runs every Monday at 02:00 Africa/Nairobi (server clocks are UTC, so we
 * fire at UTC=23:00 on Sunday which is 02:00 EAT). Uses a plain setInterval
 * checker so we don't need to add node-cron. The check runs every 10
 * minutes; the actual sync only fires once inside the target window and
 * only if it hasn't already run this week (dedupe via nea_sync_runs).
 *
 * If auto-fetch fails (NEAIMS is JS-rendered so this is expected — the
 * error is logged as a run row with status='error' and error_message
 * mentioning "admin paste required"). The admin dashboard's Sync History
 * makes this visible so Tony can paste the latest export manually.
 */

import { pool } from "../../db";
import { runAutoSync } from "./index";

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
let started = false;

export function startNEASyncScheduler(): void {
  if (started) return;
  started = true;

  console.log("[nea-sync] scheduler started — weekly auto-sync target: Monday 02:00 EAT");

  // Small initial delay so boot noise settles first
  setTimeout(tick, 60_000);
  setInterval(tick, CHECK_INTERVAL_MS);
}

async function tick(): Promise<void> {
  try {
    const now = new Date();
    if (!isInSyncWindow(now)) return;
    if (await syncedThisWeek()) return;

    console.log("[nea-sync] weekly window hit — starting auto-sync");
    const summary = await runAutoSync("cron");
    console.log(
      `[nea-sync] weekly sync ${summary.status}: ` +
      `+${summary.added} new, ~${summary.updated} updated, ` +
      `⏰${summary.expired} expired, ×${summary.revoked} revoked, ` +
      `active=${summary.activeAfter}, expired=${summary.expiredAfter}` +
      (summary.errorMessage ? ` | error: ${summary.errorMessage}` : ""),
    );
  } catch (err: any) {
    // Tick errors must never crash the process
    console.error("[nea-sync] scheduler tick error:", err?.message);
  }
}

// Monday 02:00 EAT === Sunday 23:00 UTC. We accept anything inside a 30-min
// window (23:00 → 23:30 UTC on Sunday) so the 10-min tick reliably catches it.
function isInSyncWindow(d: Date): boolean {
  const dayUTC  = d.getUTCDay();     // 0=Sunday
  const hourUTC = d.getUTCHours();
  const minUTC  = d.getUTCMinutes();
  if (dayUTC !== 0) return false;    // Sunday UTC = Monday EAT after 03:00 EAT... but we want early Monday EAT which is Sunday 23:xx UTC
  if (hourUTC !== 23) return false;
  return minUTC < 30;
}

async function syncedThisWeek(): Promise<boolean> {
  const { rows } = await pool.query<{ c: string }>(
    `SELECT COUNT(*)::text AS c
       FROM nea_sync_runs
      WHERE started_at > NOW() - INTERVAL '6 days'
        AND status IN ('ok', 'partial')`,
  );
  return Number(rows[0]?.c ?? 0) > 0;
}
