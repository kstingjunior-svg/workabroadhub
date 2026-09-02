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
exports.runServiceOrderReconciler = runServiceOrderReconciler;
exports.startServiceOrderReconciler = startServiceOrderReconciler;
exports.stopServiceOrderReconciler = stopServiceOrderReconciler;
/**
 * Service-Order reconciler — closes the silent gap between a successful M-Pesa
 * payment and an untriggered service order (CV Revamp, Offer Verify, etc.).
 *
 * 2026-08: root cause of "I paid but nothing happened" complaints was traced
 * to `cv-fix-lite-instant-pay.tsx` sending `orderId` instead of `serviceOrderId`
 * in the payment initiation body. Server writes `payment.metadata` from
 * `req.body.serviceOrderId`, so the id got dropped, so paymentPipeline Step 3b
 * (`meta?.serviceOrderId`) was undefined, so `onPaymentSuccessForServiceOrder`
 * never fired. Result: payment succeeded, user was charged, no CV was produced.
 *
 * The client bug is now fixed (commit b5102e6) but the same class of failure
 * — dropped metadata, silent try/catch, callback timeout, server crash between
 * confirmation and Step 3b — is not hypothetical. This reconciler is the
 * permanent safety net so no paying customer can be stranded > 5 minutes.
 *
 * What this does, every 5 minutes:
 *   1. Find payments where:
 *      - status IN ('success','completed')
 *      - matched = false
 *      - service_id IS NOT NULL and NOT in canonical plan tiers
 *        (so it's a service purchase, not a subscription)
 *      - Older than 3 min (settle delay — don't fight in-flight pipelines)
 *      - Younger than 7 days
 *   2. For each, look up the user's most recent pending service_order that
 *      matches on service_slug and was created within a 15-min window of
 *      the payment. If found → link + flip order to 'paid' + trigger AI.
 *      If not found → leave the payment matched=true so we don't re-scan it,
 *      but log the orphan for manual reconciliation.
 *   3. Cap at 50 recoveries per sweep to bound DB load.
 *
 * Idempotency:
 *   - After a successful link, payment.matched=true so the next sweep skips it.
 *   - onPaymentSuccessForServiceOrder is idempotent (it checks order.status
 *     and short-circuits if the order is already 'completed').
 */
const db_1 = require("../db");
const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
const SETTLE_DELAY_MIN = 3; // ignore payments less than 3 min old
const MAX_LOOKBACK_DAYS = 7;
const MATCH_WINDOW_SEC = 900; // 15 min between payment and order
const RECOVERY_BATCH_CAP = 50;
// Canonical subscription tiers — these are handled by paid-but-free-reconciler,
// not by us. Anything else in `payments.service_id` is a service purchase.
const PLAN_TIERS = new Set([
    "trial", "basic", "monthly", "yearly", "pro", "pro_referral",
]);
let _timer = null;
let _running = false;
async function runServiceOrderReconciler() {
    const start = Date.now();
    let scanned = 0;
    let linked = 0;
    let orphaned = 0;
    let errors = 0;
    try {
        // Build the exclusion clause for plan tiers safely.
        const tierList = Array.from(PLAN_TIERS).map(t => `'${t}'`).join(",");
        const { rows } = await db_1.pool.query(`
      SELECT
        p.id         AS payment_id,
        p.user_id    AS user_id,
        p.phone      AS phone,
        p.service_id AS service_id,
        p.amount     AS amount,
        p.created_at AS created_at,
        p.mpesa_code AS mpesa_code,
        p.metadata::text AS metadata
      FROM payments p
      WHERE p.status IN ('success', 'completed')
        AND (p.matched = false OR p.matched IS NULL)
        AND p.service_id IS NOT NULL
        AND p.service_id <> ''
        AND p.service_id NOT IN (${tierList})
        AND p.created_at < NOW() - INTERVAL '${SETTLE_DELAY_MIN} minutes'
        AND p.created_at > NOW() - INTERVAL '${MAX_LOOKBACK_DAYS} days'
      ORDER BY p.created_at ASC
      LIMIT ${RECOVERY_BATCH_CAP}
    `);
        scanned = rows.length;
        if (scanned === 0) {
            return { scanned: 0, linked: 0, orphaned: 0, errors: 0, durationMs: Date.now() - start };
        }
        console.warn(`[service-order-reconciler] Found ${scanned} unmatched service payments`);
        const { onPaymentSuccessForServiceOrder } = await Promise.resolve().then(() => __importStar(require("../service-order-routes")));
        for (const row of rows) {
            try {
                // Resolve user_id — prefer payment.user_id, fall back to phone lookup
                let userId = row.user_id;
                if (!userId && row.phone) {
                    const { rows: uRows } = await db_1.pool.query(`SELECT id FROM users WHERE phone = $1 LIMIT 1`, [row.phone]);
                    userId = uRows[0]?.id ?? null;
                }
                if (!userId) {
                    console.warn(`[service-order-reconciler] Skip paymentId=${row.payment_id} — no user resolvable ` +
                        `(phone=${row.phone} mpesa=${row.mpesa_code})`);
                    // Mark matched to avoid re-scanning; needs manual attention
                    await db_1.pool.query(`UPDATE payments SET matched = true, needs_review = true WHERE id = $1`, [row.payment_id]).catch(() => { });
                    orphaned++;
                    continue;
                }
                // First preference: metadata may already carry the intended serviceOrderId
                let orderId = null;
                if (row.metadata) {
                    try {
                        const meta = JSON.parse(row.metadata);
                        if (meta?.serviceOrderId && typeof meta.serviceOrderId === "string") {
                            orderId = meta.serviceOrderId;
                        }
                    }
                    catch { /* fall through */ }
                }
                // Fallback: find the most recent pending order for this user + service
                // within the 15-min window either side of the payment
                if (!orderId) {
                    const { rows: oRows } = await db_1.pool.query(`SELECT id, status, created_at
             FROM service_orders
             WHERE user_id = $1
               AND LOWER(service_slug) = LOWER($2)
               AND status IN ('pending_payment', 'processing', 'failed')
               AND (output_text IS NULL OR output_text = '')
               AND ABS(EXTRACT(EPOCH FROM (created_at - $3::timestamptz))) < ${MATCH_WINDOW_SEC}
             ORDER BY ABS(EXTRACT(EPOCH FROM (created_at - $3::timestamptz))) ASC
             LIMIT 1`, [userId, row.service_id, row.created_at]);
                    orderId = oRows[0]?.id ?? null;
                }
                if (!orderId) {
                    console.warn(`[service-order-reconciler] ORPHAN paymentId=${row.payment_id} userId=${userId} ` +
                        `service=${row.service_id} amount=${row.amount} mpesa=${row.mpesa_code} — ` +
                        `no matching pending order within ${MATCH_WINDOW_SEC}s window. Marking review.`);
                    await db_1.pool.query(`UPDATE payments SET matched = true, matched_user_id = $2, needs_review = true WHERE id = $1`, [row.payment_id, userId]).catch(() => { });
                    orphaned++;
                    continue;
                }
                console.warn(`[service-order-reconciler] LINK paymentId=${row.payment_id} → orderId=${orderId} ` +
                    `userId=${userId} service=${row.service_id} amount=${row.amount}`);
                // Link the payment to the user + mark matched (score 90 = auto-linked)
                await db_1.pool.query(`UPDATE payments
           SET matched = true, matched_user_id = $2, match_score = 90, processed = true
           WHERE id = $1`, [row.payment_id, userId]);
                // Flip the order to 'paid' if it isn't already terminal
                await db_1.pool.query(`UPDATE service_orders
           SET status = 'paid', paid_at = COALESCE(paid_at, NOW()), updated_at = NOW()
           WHERE id = $1 AND status IN ('pending_payment', 'processing', 'failed')`, [orderId]);
                // Fire AI generation — idempotent, short-circuits if already completed
                onPaymentSuccessForServiceOrder(orderId).then(() => {
                    console.warn(`[service-order-reconciler] ✓ AI triggered for orderId=${orderId}`);
                }).catch((err) => {
                    console.error(`[service-order-reconciler] AI trigger FAILED for orderId=${orderId}: ${err?.message}`);
                });
                linked++;
                // Small breather — avoid bursting the DB / OpenAI
                await new Promise((r) => setTimeout(r, 200));
            }
            catch (err) {
                errors++;
                console.error(`[service-order-reconciler] recovery threw for paymentId=${row.payment_id}: ${err?.message}`);
            }
        }
        return { scanned, linked, orphaned, errors, durationMs: Date.now() - start };
    }
    catch (err) {
        console.error("[service-order-reconciler] sweep failed:", err?.message);
        return { scanned, linked, orphaned, errors: errors + 1, durationMs: Date.now() - start };
    }
}
function startServiceOrderReconciler() {
    if (_timer)
        return;
    console.log(`[service-order-reconciler] Started — running every ${SWEEP_INTERVAL_MS / 60000} min`);
    // First run 2 min after boot — give the DB / migrations time to settle.
    setTimeout(async () => {
        if (_running)
            return;
        _running = true;
        try {
            const r = await runServiceOrderReconciler();
            if (r.scanned > 0 || r.linked > 0 || r.orphaned > 0 || r.errors > 0) {
                console.warn(`[service-order-reconciler] First sweep: scanned=${r.scanned} linked=${r.linked} ` +
                    `orphaned=${r.orphaned} errors=${r.errors} (${r.durationMs}ms)`);
            }
        }
        finally {
            _running = false;
        }
    }, 2 * 60000);
    _timer = setInterval(async () => {
        if (_running)
            return;
        _running = true;
        try {
            const r = await runServiceOrderReconciler();
            if (r.linked > 0 || r.orphaned > 0 || r.errors > 0) {
                console.warn(`[service-order-reconciler] Sweep: scanned=${r.scanned} linked=${r.linked} ` +
                    `orphaned=${r.orphaned} errors=${r.errors} (${r.durationMs}ms)`);
            }
        }
        catch (err) {
            console.error("[service-order-reconciler] tick failed:", err?.message);
        }
        finally {
            _running = false;
        }
    }, SWEEP_INTERVAL_MS);
}
function stopServiceOrderReconciler() {
    if (_timer) {
        clearInterval(_timer);
        _timer = null;
        console.log("[service-order-reconciler] Stopped");
    }
}
