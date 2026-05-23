"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSweepStats = getSweepStats;
exports.runSubscriptionExpirySweep = runSubscriptionExpirySweep;
const db_1 = require("../db");
const schema_1 = require("../../shared/schema");
const drizzle_orm_1 = require("drizzle-orm");
const supabaseClient_1 = require("../supabaseClient");
let _sweepStats = {
    lastRunAt: null,
    nextRunAt: null,
    extended: 0,
    deactivated: 0,
    errors: 0,
    totalRuns: 0,
};
function getSweepStats() { return { ..._sweepStats }; }
// ── Helpers ──────────────────────────────────────────────────────────────────
async function deactivateSubscription(sub) {
    const { error } = await supabaseClient_1.supabase
        .from("subscriptions")
        .update({ status: "expired" })
        .eq("user_id", sub.user_id)
        .eq("status", "active");
    if (error) {
        console.error(`[SubscriptionRenewal] deactivateSubscription error user_id=${sub.user_id}:`, error.message);
        return;
    }
    // Mirror to local PostgreSQL
    await db_1.db
        .update(schema_1.users)
        .set({ plan: "free", updatedAt: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.users.id, sub.user_id))
        .catch((err) => console.error(`[SubscriptionRenewal] Local DB downgrade error user_id=${sub.user_id}:`, err?.message ?? err));
    console.info(`[SubscriptionRenewal] Deactivated user_id=${sub.user_id} provider=${sub.provider}`);
}
// ── Main sweep ───────────────────────────────────────────────────────────────
async function runSubscriptionExpirySweep() {
    // Stamp next expected run (24 h from now) before we start
    const nextRun = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data: expired, error } = await supabaseClient_1.supabase
        .from("subscriptions")
        .select("*")
        .eq("status", "active")
        .lt("expires_at", new Date().toISOString());
    if (error) {
        console.error("[SubscriptionRenewal] Failed to fetch expired subscriptions:", error.message);
        _sweepStats = { ..._sweepStats, lastRunAt: new Date().toISOString(), nextRunAt: nextRun, errors: _sweepStats.errors + 1, totalRuns: _sweepStats.totalRuns + 1 };
        return { extended: 0, deactivated: 0, errors: 1 };
    }
    const rows = (expired ?? []);
    if (rows.length === 0) {
        console.log("[SubscriptionRenewal] No expired active subscriptions");
        _sweepStats = { ..._sweepStats, lastRunAt: new Date().toISOString(), nextRunAt: nextRun, totalRuns: _sweepStats.totalRuns + 1 };
        return { extended: 0, deactivated: 0, errors: 0 };
    }
    console.log(`[SubscriptionRenewal] Processing ${rows.length} expired subscription(s)`);
    let extended = 0;
    let deactivated = 0;
    let errors = 0;
    for (const sub of rows) {
        try {
            // M-Pesa, PayPal — one-time payments, no auto-renewal
            await deactivateSubscription(sub);
            deactivated++;
        }
        catch (err) {
            console.error(`[SubscriptionRenewal] Error processing user_id=${sub.user_id}:`, err?.message ?? err);
            errors++;
        }
    }
    console.log(`[SubscriptionRenewal] Sweep complete: extended=${extended} deactivated=${deactivated} errors=${errors}`);
    _sweepStats = {
        lastRunAt: new Date().toISOString(),
        nextRunAt: nextRun,
        extended: _sweepStats.extended + extended,
        deactivated: _sweepStats.deactivated + deactivated,
        errors: _sweepStats.errors + errors,
        totalRuns: _sweepStats.totalRuns + 1,
    };
    return { extended, deactivated, errors };
}
