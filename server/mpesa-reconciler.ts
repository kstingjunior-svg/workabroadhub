import { db } from "./db";
import { sql } from "drizzle-orm";
import { storage } from "./storage";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
const LOOKBACK_MINUTES = 90; // look back 90 minutes per poll
const SHORTCODE = (process.env.MPESA_SHORTCODE || "4153025").trim();

let reconcilerTimer: NodeJS.Timeout | null = null;
let isRunning = false;

// ── RECONCILER STATE (for admin debug panel) ──────────────────────────────────
export interface ReconcilerState {
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  totalPulled: number;
  totalStored: number;
  totalReconciled: number;
  runCount: number;
  isRunning: boolean;
}

const _state: ReconcilerState = {
  lastRunAt: null,
  lastSuccessAt: null,
  lastError: null,
  totalPulled: 0,
  totalStored: 0,
  totalReconciled: 0,
  runCount: 0,
  isRunning: false,
};

export function getReconcilerState(): ReconcilerState {
  return { ..._state, isRunning };
}

function fmtDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function getLastOffset(): Promise<number> {
  const result = await db.execute(sql`SELECT last_offset FROM mpesa_pull_config WHERE short_code = ${SHORTCODE} LIMIT 1`);
  const row = (result as any).rows?.[0] ?? (Array.isArray(result) ? result[0] : result);
  return Number(row?.last_offset || 0);
}

async function saveOffset(offset: number): Promise<void> {
  await db.execute(sql`
    INSERT INTO mpesa_pull_config (short_code, last_pull_at, last_offset)
    VALUES (${SHORTCODE}, NOW(), ${offset})
    ON CONFLICT (short_code) DO UPDATE SET last_pull_at = NOW(), last_offset = ${offset}
  `);
}

async function storePulledTransaction(tx: any): Promise<boolean> {
  try {
    const transId = tx.TransID || tx.TransactionID || tx.transactionId;
    if (!transId) return false;
    await db.execute(sql`
      INSERT INTO mpesa_pull_transactions
        (transaction_id, bill_ref_number, transaction_type, trans_amount, business_short_code,
         msisdn, first_name, middle_name, last_name, trans_time, invoice_number,
         org_account_balance, third_party_trans_id)
      VALUES (
        ${transId},
        ${tx.BillRefNumber || tx.AccountReference || null},
        ${tx.TransactionType || null},
        ${parseInt(tx.TransAmount || tx.Amount || "0", 10)},
        ${tx.BusinessShortCode || SHORTCODE},
        ${tx.MSISDN || null},
        ${tx.FirstName || null},
        ${tx.MiddleName || null},
        ${tx.LastName || null},
        ${tx.TransTime ? new Date(tx.TransTime.replace(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6')) : null},
        ${tx.InvoiceNumber || null},
        ${parseInt(tx.OrgAccountBalance || "0", 10)},
        ${tx.ThirdPartyTransID || null}
      )
      ON CONFLICT (transaction_id) DO NOTHING
    `);
    return true;
  } catch (err: any) {
    if (!err.message?.includes("unique")) {
      console.error("[Reconciler] Error storing transaction:", err.message);
    }
    return false;
  }
}

async function reconcileTransaction(tx: any): Promise<void> {
  const transId = tx.TransID || tx.TransactionID || tx.transactionId;
  const billRef = (tx.BillRefNumber || tx.AccountReference || "").toString().toUpperCase().trim();
  const amount = parseInt(tx.TransAmount || tx.Amount || "0", 10);

  if (!billRef) return;

  // Check if already reconciled
  const checkResult = await db.execute(sql`
    SELECT reconciled FROM mpesa_pull_transactions WHERE transaction_id = ${transId} LIMIT 1
  `);
  const existing = (checkResult as any).rows?.[0] ?? (Array.isArray(checkResult) ? checkResult[0] : null);
  if (existing?.reconciled) return;

  // Find matching pending manual payment order
  // Match by: account ref (first 8 chars of order ID == billRef) OR by amount + status
  const pendingOrders = await storage.getServiceOrders({ status: "pending_payment" });
  const manualOrders = pendingOrders.filter(o =>
    o.paymentMethod === "manual_mpesa" || o.paymentMethod === "card" || !o.paymentMethod
  );

  let matchedOrder = manualOrders.find(o =>
    o.id.substring(0, 8).toUpperCase() === billRef
  );

  // If no direct match, try matching by amount (if only one order with that amount)
  if (!matchedOrder) {
    const amountMatches = manualOrders.filter(o => o.amount === amount);
    if (amountMatches.length === 1) {
      matchedOrder = amountMatches[0];
    }
  }

  if (!matchedOrder) {
    // ── Fallback: try to match a retry_available Pro plan payment ─────────────
    // The Pull API is for C2B (Paybill) flows. STK-Push Pro payments won't appear
    // here normally — but if the shortcode is also a C2B Paybill shortcode AND
    // the user manually paid, the MSISDN + amount can identify the payment.
    const phone = (tx.MSISDN || "").toString().trim().replace(/^\+/, "");
    if (phone && amount > 0) {
      try {
        const retryPayments = await storage.getPaymentsByStatus("retry_available");
        const matchedPayment = retryPayments.find((p: any) => {
          if (p.method !== "mpesa") return false;
          if (Number(p.amount) !== amount) return false;
          // Match phone from metadata
          let metaPhone = "";
          try { metaPhone = JSON.parse(p.metadata || "{}").phone || ""; } catch {}
          metaPhone = metaPhone.toString().replace(/^\+/, "").replace(/^0/, "254");
          return metaPhone && metaPhone === phone;
        });

        if (matchedPayment) {
          console.log(`[Reconciler] ✓ Matched retry_available payment ${matchedPayment.id} via Pull API — TransID: ${transId}, KES ${amount}, phone: ${phone}`);
          const expiresAt = new Date(Date.now() + 360 * 24 * 60 * 60 * 1000);
          await storage.updatePayment(matchedPayment.id, {
            status: "success",
            mpesaReceiptNumber: transId,
            transactionRef: transId,
            verificationStatus: "verified",
            verificationNote: `Auto-reconciled via M-Pesa Pull API. TransID: ${transId}, Amount: KES ${amount}`,
          });
          await storage.activateUserPlan(matchedPayment.userId, matchedPayment.planId || "pro", matchedPayment.id, expiresAt);
          await storage.updateUserStage(matchedPayment.userId, "paid").catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
          storage.createUserNotification({
            userId: matchedPayment.userId, type: "success",
            title: "Pro Plan Activated",
            message: `Your M-Pesa payment was confirmed via reconciliation (${transId}). Pro plan active — expires ${expiresAt.toLocaleDateString("en-KE")}.`,
          }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
          const { sendProActivationEmail } = await import("./email");
          const user = await storage.getUserById(matchedPayment.userId).catch(() => null);
          if (user?.email) sendProActivationEmail(user.email, user.firstName, expiresAt, transId).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
          await db.execute(sql`UPDATE mpesa_pull_transactions SET reconciled = TRUE, reconciled_at = NOW() WHERE transaction_id = ${transId}`);
          return;
        }
      } catch (fbErr: any) {
        console.warn(`[Reconciler] Payments-table fallback error: ${fbErr.message}`);
      }
    }
    return; // No match found anywhere
  }

  // Auto-confirm the matched service order
  await storage.updateServiceOrder(matchedOrder.id, {
    status: "processing",
    paymentMethod: "manual_mpesa",
    paymentRef: transId,
    adminNotes: `Auto-reconciled via M-Pesa Pull API. TransID: ${transId}, Amount: KES ${amount}, BillRef: ${billRef}`,
  });

  // Mark transaction as reconciled
  await db.execute(sql`
    UPDATE mpesa_pull_transactions
    SET reconciled = TRUE, reconciled_order_id = ${matchedOrder.id}, reconciled_at = NOW()
    WHERE transaction_id = ${transId}
  `);

  console.log(`[Reconciler] ✓ Order ${matchedOrder.id} auto-confirmed — TransID: ${transId}, KES ${amount}`);

  // Notify user via WhatsApp/SMS
  try {
    const user = await storage.getUserById(matchedOrder.userId);
    if (user?.phone) {
      const { notifyPaymentReceived } = await import("./sms");
      await notifyPaymentReceived(user.phone, amount, matchedOrder.serviceName || "Career Service");
    }
  } catch (smsErr) {
    console.error("[Reconciler] SMS notify failed:", smsErr);
  }
}

export async function runReconciliation(): Promise<{ pulled: number; stored: number; reconciled: number; errors: string[] }> {
  const errors: string[] = [];
  let pulled = 0, stored = 0, reconciled = 0;
  const nowIso = new Date().toISOString();

  _state.lastRunAt = nowIso;
  _state.runCount++;

  try {
    const { pullTransactions } = await import("./mpesa");
    const now = new Date();
    const from = new Date(now.getTime() - LOOKBACK_MINUTES * 60 * 1000);
    const offset = await getLastOffset();

    const startDate = fmtDate(from);
    const endDate = fmtDate(now);
    console.log(`[Reconciler] Pulling transactions ${startDate} → ${endDate} (offset ${offset})`);

    const transactions = await pullTransactions(SHORTCODE, startDate, endDate, offset);
    pulled = transactions.length;

    for (const tx of transactions) {
      const isNew = await storePulledTransaction(tx);
      if (isNew) {
        stored++;
        try {
          await reconcileTransaction(tx);
          reconciled++;
        } catch (err: any) {
          errors.push(`Reconcile error for ${tx.TransID}: ${err.message}`);
        }
      }
    }

    await saveOffset(offset + pulled);

    _state.lastSuccessAt = new Date().toISOString();
    _state.lastError = errors.length > 0 ? errors[0] : null;
    _state.totalPulled += pulled;
    _state.totalStored += stored;
    _state.totalReconciled += reconciled;

    console.log(`[Reconciler] Done: pulled=${pulled} stored=${stored} reconciled=${reconciled}`);
  } catch (err: any) {
    const msg = err.response?.data?.errorMessage || err.message || "Unknown error";
    console.error("[Reconciler] Pull failed:", msg);
    errors.push(msg);
    _state.lastError = msg;
  }

  return { pulled, stored, reconciled, errors };
}

export async function getRecentPulledTransactions(limit: number = 50): Promise<any[]> {
  const result = await db.execute(sql`
    SELECT * FROM mpesa_pull_transactions
    ORDER BY pulled_at DESC
    LIMIT ${limit}
  `);
  return (result as any).rows ?? (Array.isArray(result) ? result : []);
}

export async function getPullConfig(): Promise<any> {
  const result = await db.execute(sql`
    SELECT * FROM mpesa_pull_config WHERE short_code = ${SHORTCODE} LIMIT 1
  `);
  const row = (result as any).rows?.[0] ?? (Array.isArray(result) ? result[0] : null);
  return row || { shortCode: SHORTCODE, registered: false };
}

export function startReconcilerScheduler(): void {
  if (reconcilerTimer) return;
  console.log(`[Reconciler] Scheduler started — polling every ${POLL_INTERVAL_MS / 60000} minutes`);

  // Run first poll after 2 minutes (let server fully start)
  setTimeout(async () => {
    if (!isRunning) {
      isRunning = true;
      try { await runReconciliation(); } catch {} finally { isRunning = false; }
    }
  }, 2 * 60 * 1000);

  reconcilerTimer = setInterval(async () => {
    if (isRunning) return;
    isRunning = true;
    try { await runReconciliation(); } catch {} finally { isRunning = false; }
  }, POLL_INTERVAL_MS);
}

export function stopReconcilerScheduler(): void {
  if (reconcilerTimer) {
    clearInterval(reconcilerTimer);
    reconcilerTimer = null;
    console.log("[Reconciler] Scheduler stopped");
  }
}
