"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPaidButFreeReconciler = runPaidButFreeReconciler;
exports.startPaidButFreeReconciler = startPaidButFreeReconciler;
exports.stopPaidButFreeReconciler = stopPaidButFreeReconciler;
/**
 * Paid-but-Free reconciler — closes the silent gap between a successful M-Pesa
 * payment and an unactivated plan.
 *
 * 2026-06: founder reported "client paid KES 99 but can't access jobs". An
 * end-to-end audit of the trial flow showed every code path is correct, but
 * `runPaymentPipeline` Step 1 (activateUserPlan + users.plan update) is wrapped
 * in a try/catch that swallows DB errors so the rest of the pipeline can keep
 * running. The intent is right — delivery + WhatsApp confirmation shouldn't
 * be blocked by a transient DB hiccup — but the user is left in a state where:
 *
 *   • payments.status = "success" / "completed"
 *   • users.plan      = "free"
 *
 * From the user's perspective: they paid, got the M-Pesa receipt, but logging
 * in still shows the upgrade modal. We've seen this on a small number of users
 * historically — this reconciler eliminates the failure mode entirely.
 *
 * What this does, every 15 minutes:
 *   1. Find payments that are status IN ('success','completed'), have a
 *      planId (so it's a subscription, not a one-off service), are <7 days
 *      old, and whose user STILL shows plan='free'.
 *   2. Re-run runPaymentPipeline for each one. The pipeline is idempotent
 *      (activateUserPlan uses ON CONFLICT DO UPDATE and skips if a fresh
 *      active subscription already exists).
 *   3. Log each recovery loudly so Tony can see it in Render logs.
 *
 * Safety:
 *   • Idempotent — re-running a fully-activated user is a no-op.
 *   • Capped at 50 recoveries per sweep to bound DB load.
 *   • Honors a 5-minute settle delay (don't try to "recover" a payment that
 *     just hit success — the pipeline is probably still mid-run).
 */
const db_1 = require("../db");
const SWEEP_INTERVAL_MS = 15 * 60 * 1000; // every 15 minutes
const SETTLE_DELAY_MIN = 5; // ignore payments less than 5 min old
const MAX_LOOKBACK_DAYS = 7; // don't reactivate week-old payments
const RECOVERY_BATCH_CAP = 50;
let _timer = null;
let _running = false;
async function runPaidButFreeReconciler() {
    const start = Date.now();
    let scanned = 0;
    let recovered = 0;
    let errors = 0;
    try {
        // Find paid users still on 'free'. We join payments → users and filter
        // for the "succeeded but never upgraded" pattern. Excludes:
        //   • Pending or failed payments
        //   • One-off service purchases (planId IS NULL)
        //   • Very recent payments (still settling — give the pipeline 5 min)
        //   • Very old payments (>7d — past the trial duration; nothing to recover)
        //   • Deactivated users
        //   • Users with a non-free plan (already recovered, or admin-upgraded)
        const { rows } = await db_1.pool.query(`
      SELECT
        p.id            AS payment_id,
        p.user_id       AS user_id,
        p.plan_id       AS plan_id,
        p.service_id    AS service_id,
        p.amount        AS amount,
        p.mpesa_receipt_number AS mpesa_receipt,
        COALESCE(u.plan, 'free') AS current_plan
      FROM payments p
      JOIN users u ON u.id = p.user_id
      WHERE p.status IN ('success', 'completed')
        AND p.plan_id IS NOT NULL
        AND p.plan_id <> ''
        AND p.created_at < NOW() - INTERVAL '${SETTLE_DELAY_MIN} minutes'
        AND p.created_at > NOW() - INTERVAL '${MAX_LOOKBACK_DAYS} days'
        AND u.is_active = true
        AND COALESCE(u.plan, 'free') = 'free'
      ORDER BY p.created_at DESC
      LIMIT ${RECOVERY_BATCH_CAP}
    `);
        scanned = rows.length;
        if (scanned === 0) {
            return { scanned: 0, recovered: 0, errors: 0, durationMs: Date.now() - start };
        }
        console.warn(`[paid-but-free] ⚠ Found ${scanned} paid users still on 'free' — attempting recovery`);
        const { storage } = await Promise.resolve().then(() => __importStar(require("../storage")));
        const { runPaymentPipeline } = await Promise.resolve().then(() => __importStar(require("../services/paymentPipeline")));
        for (const row of rows) {
            try {
                const payment = await storage.getPaymentById(row.payment_id);
                const user = await storage.getUserById(row.user_id);
                if (!payment || !user) {
                    console.warn(`[paid-but-free] Skip ${row.payment_id} — payment or user vanished`);
                    continue;
                }
                console.warn(`[paid-but-free] RECOVER paymentId=${row.payment_id} userId=${row.user_id} ` +
                    `email=${user.email} KES=${row.amount} plan=${row.plan_id} receipt=${row.mpesa_receipt ?? "none"}`);
                await runPaymentPipeline({
                    payment,
                    user,
                    method: "mpesa",
                    transactionId: row.mpesa_receipt || row.payment_id,
                    planId: row.plan_id,
                });
                // Verify the recovery actually worked — read users.plan back. If it's
                // STILL 'free' after pipeline ran, the failure is at the DB layer
                // (constraint, RLS, etc.) and we want a loud audit trail.
                const verify = await storage.getUserById(row.user_id);
                if (verify && verify.plan && verify.plan !== "free") {
                    recovered++;
                    console.warn(`[paid-but-free] ✓ Recovered userId=${row.user_id} → plan=${verify.plan}`);
                }
                else {
                    errors++;
                    console.error(`[paid-but-free] ✗ Pipeline ran but plan STILL 'free' for userId=${row.user_id}. ` +
                        `DB-level failure (RLS / constraint / trigger?). Manual fix needed: ` +
                        `UPDATE users SET plan='${row.plan_id}' WHERE id='${row.user_id}';`);
                }
            }
            catch (err) {
                errors++;
                console.error(`[paid-but-free] recovery threw for paymentId=${row.payment_id}: ${err?.message}`);
            }
            // Tiny breather between recoveries — avoid bursting the DB
            await new Promise((r) => setTimeout(r, 100));
        }
        return { scanned, recovered, errors, durationMs: Date.now() - start };
    }
    catch (err) {
        console.error("[paid-but-free] sweep failed:", err?.message);
        return { scanned, recovered, errors: errors + 1, durationMs: Date.now() - start };
    }
}
function startPaidButFreeReconciler() {
    if (_timer)
        return;
    console.log(`[paid-but-free] Started — running every ${SWEEP_INTERVAL_MS / 60000} min`);
    // First run 3 min after boot — give the DB / migrations time to settle.
    setTimeout(async () => {
        if (_running)
            return;
        _running = true;
        try {
            const r = await runPaidButFreeReconciler();
            if (r.scanned > 0 || r.recovered > 0 || r.errors > 0) {
                console.warn(`[paid-but-free] First sweep: scanned=${r.scanned} recovered=${r.recovered} errors=${r.errors} (${r.durationMs}ms)`);
            }
        }
        finally {
            _running = false;
        }
    }, 3 * 60000);
    _timer = setInterval(async () => {
        if (_running)
            return;
        _running = true;
        try {
            const r = await runPaidButFreeReconciler();
            if (r.recovered > 0 || r.errors > 0) {
                console.warn(`[paid-but-free] Sweep: scanned=${r.scanned} recovered=${r.recovered} errors=${r.errors} (${r.durationMs}ms)`);
            }
        }
        catch (err) {
            console.error("[paid-but-free] tick failed:", err?.message);
        }
        finally {
            _running = false;
        }
    }, SWEEP_INTERVAL_MS);
}
function stopPaidButFreeReconciler() {
    if (_timer) {
        clearInterval(_timer);
        _timer = null;
        console.log("[paid-but-free] Stopped");
    }
}
