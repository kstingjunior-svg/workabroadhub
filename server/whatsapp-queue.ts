/**
 * WhatsApp Queue Processor — Production-grade auto-sender
 *
 * Table: whatsapp_queue
 *   status:      pending → sent | failed
 *   retry_count: 0..MAX_RETRIES
 *
 * Rules:
 *   • Poll every 1 minute for pending messages
 *   • Retry up to MAX_RETRIES times on Twilio failure
 *   • Spam guard: max 1 message sent per phone per 12 hours
 *   • Dedup on enqueue: max 1 pending per (phone, source) per 24 hours
 *   • Abandonment scanner every 15 min (abandoned payments + applications)
 *   • All sends and failures are logged with full context
 */

import { db }  from "./db";
import { pool } from "./db";
import { whatsappQueue } from "@shared/schema";
import { and, eq, lte, sql } from "drizzle-orm";
import { sendWhatsApp } from "./services/whatsapp";

// ── Config ───────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS      = 1  * 60 * 1000;   // send queue: every 1 min
const SCAN_INTERVAL_MS      = 15 * 60 * 1000;   // abandonment scan: every 15 min
const MAX_RETRIES           = 3;                 // give up after this many Twilio failures
const SPAM_WINDOW_HOURS     = 12;                // max 1 sent message per phone per window
const DEDUP_WINDOW_HOURS    = 24;                // max 1 pending per (phone,source) per window
const PAYMENT_ABANDON_HOURS = 2;                 // hours until a pending payment = abandoned
const APP_ABANDON_HOURS     = 24;                // hours until a 'submitted' application = abandoned
const BATCH_SIZE            = 20;                // rows per poll cycle

const BASE_URL = "https://workabroadhub.tech";

// ── Message builders ──────────────────────────────────────────────────────────

/** Payment abandonment — deep link goes directly to the /pay checkout page. */
function msgPaymentAbandon(serviceCode: string, userId: string): string {
  const link = `${BASE_URL}/pay?service=${serviceCode}&user=${userId}`;
  return (
    `🔥 You're one step away from securing your job abroad!\n\n` +
    `Complete your application instantly:\n` +
    `👉 ${link}\n\n` +
    `⚡ Takes less than 30 seconds`
  );
}

/** Application abandonment — deep link goes to the general site for re-engagement. */
function msgApplicationAbandon(jobTitle: string, userId: string): string {
  const link = `${BASE_URL}/?user=${userId}`;
  return (
    `🔥 You're one step away from securing your job abroad!\n\n` +
    `You were checking *${jobTitle}* — complete your application instantly:\n` +
    `👉 ${link}\n\n` +
    `⚡ Takes less than 30 seconds`
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Enqueue a WhatsApp message for delivery.
 *
 * Silently skips if a pending row for (phone, source) already exists
 * within DEDUP_WINDOW_HOURS — prevents double-queuing.
 *
 * @param phone    Kenya E.164 without "+", e.g. "254712345678"
 * @param message  Plain-text WhatsApp body
 * @param opts.source   Dedup/analytics tag (default "manual")
 * @param opts.delayMs  Fire after this many ms (default 0 = immediate)
 */
export async function enqueue(
  phone:   string,
  message: string,
  opts: { source?: string; delayMs?: number } = {}
): Promise<void> {
  const source    = opts.source  ?? "manual";
  const delayMs   = opts.delayMs ?? 0;
  const sendAfter = new Date(Date.now() + delayMs);

  try {
    const dedupCutoff = new Date(Date.now() - DEDUP_WINDOW_HOURS * 3600_000);
    const dup = await pool.query(
      `SELECT id FROM whatsapp_queue
       WHERE phone = $1 AND source = $2 AND status = 'pending'
         AND created_at > $3
       LIMIT 1`,
      [phone, source, dedupCutoff]
    );
    if (dup.rowCount && dup.rowCount > 0) {
      console.log(`[WaQueue] enqueue skip — dup pending (${source}) for ${phone}`);
      return;
    }

    await db.insert(whatsappQueue).values({
      phone, message, source, status: "pending", sendAfter,
    });
    console.log(`[WaQueue] ✉  Enqueued (${source}) → ${phone} | fire at ${sendAfter.toISOString()}`);
  } catch (err: any) {
    console.error(`[WaQueue] enqueue() error for ${phone}:`, err.message);
  }
}

// ── Spam guard ────────────────────────────────────────────────────────────────

/** Returns true if this phone already received a sent message within SPAM_WINDOW_HOURS. */
async function isSpamBlocked(phone: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - SPAM_WINDOW_HOURS * 3600_000);
  const res = await pool.query(
    `SELECT id FROM whatsapp_queue
     WHERE phone = $1 AND status = 'sent' AND sent_at > $2
     LIMIT 1`,
    [phone, cutoff]
  );
  return (res.rowCount ?? 0) > 0;
}

// ── Queue processor ───────────────────────────────────────────────────────────

async function processQueue(): Promise<void> {
  const start = Date.now();
  try {
    const now = new Date();

    // Fetch pending rows whose send_after has elapsed, ordered oldest-first
    const { rows } = await pool.query<{
      id: string; phone: string; message: string;
      source: string; retry_count: number;
    }>(
      `SELECT id, phone, message, source, retry_count
       FROM whatsapp_queue
       WHERE status = 'pending' AND send_after <= $1
       ORDER BY send_after ASC
       LIMIT $2`,
      [now, BATCH_SIZE]
    );

    if (rows.length === 0) return;

    console.log(`[WaQueue] Processing ${rows.length} pending message(s)…`);
    let sent = 0, skipped = 0, failed = 0;

    for (const row of rows) {
      // ── Spam guard ──────────────────────────────────────────────────────
      if (await isSpamBlocked(row.phone)) {
        // Re-schedule 12h from now so it doesn't keep blocking the queue
        const reschedule = new Date(Date.now() + SPAM_WINDOW_HOURS * 3600_000);
        await pool.query(
          `UPDATE whatsapp_queue SET send_after = $1 WHERE id = $2`,
          [reschedule, row.id]
        );
        console.log(`[WaQueue] ⏭  Spam-blocked ${row.phone} — rescheduled to ${reschedule.toISOString()}`);
        skipped++;
        continue;
      }

      // ── Attempt send ────────────────────────────────────────────────────
      try {
        await sendWhatsApp(row.phone, row.message);

        await pool.query(
          `UPDATE whatsapp_queue
           SET status = 'sent', sent = true, sent_at = NOW()
           WHERE id = $1`,
          [row.id]
        );
        console.log(`[WaQueue] ✓  Sent (${row.source}) → ${row.phone}`);
        sent++;
      } catch (err: any) {
        const newRetries = row.retry_count + 1;
        const giveUp    = newRetries >= MAX_RETRIES;

        if (giveUp) {
          await pool.query(
            `UPDATE whatsapp_queue
             SET status = 'failed', failed = true,
                 retry_count = $1, error_msg = $2
             WHERE id = $3`,
            [newRetries, String(err.message).slice(0, 500), row.id]
          );
          console.error(
            `[WaQueue] ✗  Permanently failed (${row.source}) → ${row.phone} ` +
            `after ${newRetries} attempt(s): ${err.message}`
          );
        } else {
          // Exponential back-off: 5 min × 2^attempt
          const backoffMs = 5 * 60_000 * Math.pow(2, row.retry_count);
          const retryAt   = new Date(Date.now() + backoffMs);
          await pool.query(
            `UPDATE whatsapp_queue
             SET retry_count = $1, send_after = $2, error_msg = $3
             WHERE id = $4`,
            [newRetries, retryAt, String(err.message).slice(0, 500), row.id]
          );
          console.warn(
            `[WaQueue] ⚠  Retry ${newRetries}/${MAX_RETRIES} (${row.source}) → ${row.phone} ` +
            `— next attempt at ${retryAt.toISOString()}: ${err.message}`
          );
        }
        failed++;
      }
    }

    const elapsed = Date.now() - start;
    console.log(
      `[WaQueue] Cycle complete — sent: ${sent}, skipped: ${skipped}, ` +
      `failed/retry: ${failed} (${elapsed} ms)`
    );
  } catch (err: any) {
    console.error(`[WaQueue] processQueue() crashed (${Date.now() - start} ms):`, err.message);
  }
}

// ── Abandonment scanner ───────────────────────────────────────────────────────

async function scanAbandonedPayments(): Promise<void> {
  try {
    const { rows } = await pool.query<{
      phone: string;
      user_id: string;
      service_code: string;
    }>(
      `SELECT DISTINCT ON (u.phone)
              u.phone,
              u.id                                               AS user_id,
              COALESCE(s.code, 'cv_writing')                     AS service_code
       FROM payments p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN services s ON s.id = p.service_id
       WHERE p.status = 'pending'
         AND p.created_at < NOW() - INTERVAL '${PAYMENT_ABANDON_HOURS} hours'
         AND p.created_at > NOW() - INTERVAL '48 hours'
         AND u.phone IS NOT NULL AND u.phone <> ''
         AND NOT EXISTS (
           SELECT 1 FROM payments p2
           WHERE p2.user_id = p.user_id AND p2.status = 'success'
             AND p2.created_at > p.created_at
         )
         AND NOT EXISTS (
           SELECT 1 FROM whatsapp_queue wq
           WHERE wq.phone = u.phone AND wq.source = 'abandoned_payment'
             AND wq.created_at > NOW() - INTERVAL '${DEDUP_WINDOW_HOURS} hours'
         )
       ORDER BY u.phone, p.created_at DESC
       LIMIT 50`
    );

    for (const { phone, user_id, service_code } of rows) {
      const msg = msgPaymentAbandon(service_code, user_id);
      await enqueue(phone, msg, { source: "abandoned_payment" });
    }
    if (rows.length > 0) {
      console.log(`[WaQueue] 🔍 Abandoned payments: queued ${rows.length} re-engagement(s)`);
    }
  } catch (err: any) {
    console.error("[WaQueue] scanAbandonedPayments() error:", err.message);
  }
}

async function scanAbandonedApplications(): Promise<void> {
  try {
    const { rows } = await pool.query<{
      phone: string;
      user_id: string;
      job_title: string;
    }>(
      `SELECT DISTINCT ON (u.phone)
              u.phone,
              u.id                                               AS user_id,
              COALESCE(a.job_title, 'this position')             AS job_title
       FROM user_job_applications a
       JOIN users u ON u.id = a.user_id
       WHERE a.status = 'submitted'
         AND a.created_at < NOW() - INTERVAL '${APP_ABANDON_HOURS} hours'
         AND a.created_at > NOW() - INTERVAL '72 hours'
         AND u.phone IS NOT NULL AND u.phone <> ''
         AND NOT EXISTS (
           SELECT 1 FROM whatsapp_queue wq
           WHERE wq.phone = u.phone AND wq.source = 'abandoned_application'
             AND wq.created_at > NOW() - INTERVAL '${DEDUP_WINDOW_HOURS} hours'
         )
       ORDER BY u.phone, a.created_at DESC
       LIMIT 50`
    );

    for (const { phone, user_id, job_title } of rows) {
      const msg = msgApplicationAbandon(job_title, user_id);
      await enqueue(phone, msg, { source: "abandoned_application" });
    }
    if (rows.length > 0) {
      console.log(`[WaQueue] 🔍 Abandoned applications: queued ${rows.length} re-engagement(s)`);
    }
  } catch (err: any) {
    console.error("[WaQueue] scanAbandonedApplications() error:", err.message);
  }
}

async function runAbandonment(): Promise<void> {
  await scanAbandonedPayments();
  await scanAbandonedApplications();
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

export function startWhatsappQueueProcessor(): void {
  console.log(
    "[WaQueue] Processor started — " +
    `send poll: every 1 min | max retries: ${MAX_RETRIES} | ` +
    `spam window: ${SPAM_WINDOW_HOURS}h | abandonment scan: every 15 min`
  );

  // First run 60 s after boot so the DB pool is fully warmed up
  setTimeout(() => {
    processQueue();
    runAbandonment();

    setInterval(processQueue,    POLL_INTERVAL_MS);
    setInterval(runAbandonment,  SCAN_INTERVAL_MS);
  }, 60_000);
}
