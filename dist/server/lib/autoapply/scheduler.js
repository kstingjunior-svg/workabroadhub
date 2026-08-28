"use strict";
/**
 * AutoApply scheduler — background tick that runs overnight scans.
 *
 * Fires every 15 minutes; runDueScans() only picks up agents whose
 * last_scan_at is older than 20 hours (so each agent gets exactly one
 * scan per day). Times pretty naturally to Kenyan overnight hours if
 * users create agents during the day.
 *
 * V2: honour each agent's daily_report_time field so the digest arrives
 * at the user's chosen local hour (currently every scan happens at cron
 * cadence regardless of preferred hour).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.startAutoApplyScheduler = startAutoApplyScheduler;
const index_1 = require("./index");
const TICK_MS = 15 * 60 * 1000; // 15 minutes
let started = false;
function startAutoApplyScheduler() {
    if (started)
        return;
    started = true;
    const enabled = String(process.env.AUTOAPPLY_ENABLED ?? "true").toLowerCase() !== "false";
    if (!enabled) {
        console.log("[autoapply/scheduler] AUTOAPPLY_ENABLED=false — scheduler skipped");
        return;
    }
    console.log("[autoapply/scheduler] started — checking for due scans every 15 minutes");
    // Small initial delay so boot noise settles
    setTimeout(tick, 90000);
    setInterval(tick, TICK_MS);
}
async function tick() {
    try {
        const { scanned, errors } = await (0, index_1.runDueScans)();
        if (scanned > 0 || errors > 0) {
            console.log(`[autoapply/scheduler] tick: ${scanned} scanned, ${errors} errors`);
        }
    }
    catch (err) {
        console.error("[autoapply/scheduler] tick error:", err?.message);
    }
}
