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
import { pool } from "../db";

// 2026-08 (Tony's "users pay and aren't let in" fresh report):
// Cut from 15 min → 2 min. A stuck paying user complaining on WhatsApp
// waits at most 2 min before we auto-recover them (usually much less —
// they'll typically be caught within seconds of the next sweep). The
// settle delay drops from 5 min → 60 seconds so we don't chase a payment
// pipeline that's still legitimately mid-run, but we don't wait forever.
const SWEEP_INTERVAL_MS  = 2 * 60 * 1000;    // every 2 minutes
const SETTLE_DELAY_MIN   = 1;                // ignore payments less than 1 min old
const MAX_LOOKBACK_DAYS  = 7;                // don't reactivate week-old payments
const RECOVERY_BATCH_CAP = 50;

let _timer: NodeJS.Timeout | null = null;
let _running = false;

interface SweepResult {
  scanned:    number;
  recovered:  number;
  errors:     number;
  durationMs: number;
}

interface StuckPaymentRow {
  payment_id:  string;
  user_id:     string;
  plan_id:     string;
  service_id:  string | null;
  amount:      number;
  mpesa_receipt: string | null;
  current_plan: string;
}

export async function runPaidButFreeReconciler(): Promise<SweepResult> {
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
    // 2026-06 SAFETY: only scan payments whose plan_id is in the canonical
    // tier set. Historical payments with `plan_id = 'cv_fix_lite'` (from the
    // old buggy initiation code) must NOT be picked up — they're service
    // purchases, not subscriptions, and re-running the pipeline against them
    // would be a no-op anyway (the pipeline now rejects non-canonical plans).
    const { rows } = await pool.query<StuckPaymentRow>(`
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
        AND p.plan_id IN ('trial', 'basic', 'monthly', 'yearly', 'pro', 'pro_referral')
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

    const { storage } = await import("../storage");
    const { runPaymentPipeline } = await import("../services/paymentPipeline");

    for (const row of rows) {
      try {
        const payment = await storage.getPaymentById(row.payment_id);
        const user    = await storage.getUserById(row.user_id);
        if (!payment || !user) {
          console.warn(`[paid-but-free] Skip ${row.payment_id} — payment or user vanished`);
          continue;
        }

        console.warn(
          `[paid-but-free] RECOVER paymentId=${row.payment_id} userId=${row.user_id} ` +
          `email=${user.email} KES=${row.amount} plan=${row.plan_id} receipt=${row.mpesa_receipt ?? "none"}`,
        );

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
          console.warn(
            `[paid-but-free] ✓ Recovered userId=${row.user_id} → plan=${verify.plan}`,
          );
        } else {
          errors++;
          console.error(
            `[paid-but-free] ✗ Pipeline ran but plan STILL 'free' for userId=${row.user_id}. ` +
            `DB-level failure (RLS / constraint / trigger?). Manual fix needed: ` +
            `UPDATE users SET plan='${row.plan_id}' WHERE id='${row.user_id}';`,
          );
        }
      } catch (err: any) {
        errors++;
        console.error(`[paid-but-free] recovery threw for paymentId=${row.payment_id}: ${err?.message}`);
      }

      // Tiny breather between recoveries — avoid bursting the DB
      await new Promise((r) => setTimeout(r, 100));
    }

    return { scanned, recovered, errors, durationMs: Date.now() - start };
  } catch (err: any) {
    console.error("[paid-but-free] sweep failed:", err?.message);
    return { scanned, recovered, errors: errors + 1, durationMs: Date.now() - start };
  }
}

/**
 * 2026-08 (Tony's "users pay and aren't let in" fix): user-triggered version.
 * Called from POST /api/payments/recover-mine. Runs the SAME recovery logic
 * against the calling user's own recent payments only — bypasses the 2-min
 * sweep so a stuck user gets unblocked the instant they check.
 *
 * Returns { recovered: boolean, plan: string, message: string } so the
 * client can decide whether to reload and refresh the auth cache.
 */
export async function recoverMyPayment(userId: string): Promise<{ recovered: boolean; plan: string; scanned: number; message: string }> {
  if (!userId) return { recovered: false, plan: "free", scanned: 0, message: "Missing user id." };

  const { rows } = await pool.query<StuckPaymentRow>(`
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
    WHERE p.user_id = $1
      AND p.status IN ('success', 'completed')
      AND p.plan_id IS NOT NULL
      AND p.plan_id <> ''
      AND p.plan_id IN ('trial', 'basic', 'monthly', 'yearly', 'pro', 'pro_referral')
      AND p.created_at > NOW() - INTERVAL '24 hours'
      AND COALESCE(u.plan, 'free') = 'free'
    ORDER BY p.created_at DESC
    LIMIT 5
  `, [userId]);

  if (rows.length === 0) {
    // Either they haven't paid recently, or they're already activated.
    const { rows: uRows } = await pool.query<{ plan: string }>(`SELECT COALESCE(plan,'free') AS plan FROM users WHERE id = $1`, [userId]);
    const currentPlan = uRows[0]?.plan ?? "free";
    return {
      recovered: false,
      plan: currentPlan,
      scanned: 0,
      message: currentPlan === "free"
        ? "We don't see any recent successful payment on your account. If you just paid, wait 30 seconds and try again — or message us on WhatsApp with your M-Pesa code."
        : `Your plan is already active: ${currentPlan}. Try refreshing the page.`,
    };
  }

  const { storage } = await import("../storage");
  const { runPaymentPipeline } = await import("../services/paymentPipeline");
  const row = rows[0]; // most recent stuck payment

  try {
    const payment = await storage.getPaymentById(row.payment_id);
    const user    = await storage.getUserById(row.user_id);
    if (!payment || !user) {
      return { recovered: false, plan: "free", scanned: 1, message: "Payment record moved. Please contact support." };
    }

    console.warn(`[paid-but-free][manual] RECOVER userId=${userId} paymentId=${row.payment_id} plan=${row.plan_id}`);
    await runPaymentPipeline({
      payment, user,
      method: "mpesa",
      transactionId: row.mpesa_receipt || row.payment_id,
      planId: row.plan_id,
    });

    const verify = await storage.getUserById(userId);
    if (verify?.plan && verify.plan !== "free") {
      return { recovered: true, plan: verify.plan, scanned: 1, message: `Your ${verify.plan} plan is now active. Refresh the page.` };
    }
    return {
      recovered: false, plan: "free", scanned: 1,
      message: "We tried to activate your plan but the database rejected the update. Our team has been alerted — please message us on WhatsApp with your M-Pesa code and we'll fix it manually.",
    };
  } catch (err: any) {
    console.error(`[paid-but-free][manual] failed for userId=${userId}: ${err?.message}`);
    return { recovered: false, plan: "free", scanned: 1, message: "Something went wrong. Please message us on WhatsApp with your M-Pesa code." };
  }
}

export function startPaidButFreeReconciler(): void {
  if (_timer) return;
  console.log(`[paid-but-free] Started — running every ${SWEEP_INTERVAL_MS / 60_000} min`);

  // First run 3 min after boot — give the DB / migrations time to settle.
  setTimeout(async () => {
    if (_running) return;
    _running = true;
    try {
      const r = await runPaidButFreeReconciler();
      if (r.scanned > 0 || r.recovered > 0 || r.errors > 0) {
        console.warn(
          `[paid-but-free] First sweep: scanned=${r.scanned} recovered=${r.recovered} errors=${r.errors} (${r.durationMs}ms)`,
        );
      }
    } finally {
      _running = false;
    }
  }, 3 * 60_000);

  _timer = setInterval(async () => {
    if (_running) return;
    _running = true;
    try {
      const r = await runPaidButFreeReconciler();
      if (r.recovered > 0 || r.errors > 0) {
        console.warn(
          `[paid-but-free] Sweep: scanned=${r.scanned} recovered=${r.recovered} errors=${r.errors} (${r.durationMs}ms)`,
        );
      }
    } catch (err: any) {
      console.error("[paid-but-free] tick failed:", err?.message);
    } finally {
      _running = false;
    }
  }, SWEEP_INTERVAL_MS);
}

export function stopPaidButFreeReconciler(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    console.log("[paid-but-free] Stopped");
  }
}
