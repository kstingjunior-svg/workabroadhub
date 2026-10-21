/**
 * Admin payment alerts (2026-10).
 *
 * Every verified payment creates one row in finance_admin_notifications
 * (dedupe_key = payment id, so retried callbacks never double-alert). The
 * admin Finance dashboard shows them with an unread count. Optional email
 * copy goes to FINANCE_ALERT_EMAIL only if that env var is set — nothing is
 * claimed to be sent otherwise.
 */
import { pool } from "../db";
import { orderRef, resolvePurpose } from "./finance-ledger";

export interface FinanceNotice {
  kind: "payment" | "subscription" | "unmatched" | "refund_request" | "duplicate" | "review";
  title: string;
  body: string;
  paymentId?: string | null;
  amount?: number | null;
  dedupeKey?: string | null;
}

export async function notifyFinanceAdmins(n: FinanceNotice): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO finance_admin_notifications (kind, title, body, payment_id, order_ref, amount, dedupe_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (dedupe_key) DO NOTHING`,
      [n.kind, n.title, n.body, n.paymentId ?? null, n.paymentId ? orderRef(n.paymentId) : null, n.amount ?? null, n.dedupeKey ?? null],
    );
  } catch (err: any) {
    console.warn("[finance-notify] insert failed:", err?.message);
  }
}

async function labelFor(kind: string, key: string | null): Promise<string> {
  if (!key) return "Unknown purpose";
  try {
    if (kind === "subscription") {
      const { rows } = await pool.query(`SELECT plan_name FROM plans WHERE plan_id = $1 LIMIT 1`, [key]);
      if (rows[0]?.plan_name) return String(rows[0].plan_name);
    } else {
      const { rows } = await pool.query(`SELECT name FROM services WHERE id = $1 OR slug = $1 OR code = $1 LIMIT 1`, [key]);
      if (rows[0]?.name) return String(rows[0].name);
    }
  } catch { /* fall through */ }
  return key.replace(/^tool_/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Alert admins about a verified payment. Reads the payment back so the
 * message reflects what's actually recorded (purpose from order/plan, never
 * from the amount). Safe to call many times for the same payment.
 */
export async function alertVerifiedPayment(paymentId: string): Promise<void> {
  try {
    const { rows: [p] } = await pool.query(
      `SELECT p.id, p.amount, p.status, p.plan_id, p.service_id, p.service_name, p.receipt_norm, p.method,
              p.reconciliation_status, p.created_at, fin_meta(p.metadata) AS meta,
              u.email, nullif(trim(coalesce(u.first_name,'') || ' ' || coalesce(u.last_name,'')), '') AS name,
              so.service_slug, so.status AS order_status,
              us.start_date, us.end_date, us.status AS sub_status
         FROM payments p
         LEFT JOIN users u ON u.id::text = p.user_id
         LEFT JOIN service_orders so ON so.id::text = coalesce(fin_meta(p.metadata)->>'serviceOrderId', fin_meta(p.metadata)->>'orderId')
         LEFT JOIN LATERAL (SELECT start_date, end_date, status FROM user_subscriptions s WHERE s.payment_id = p.id::text ORDER BY created_at DESC LIMIT 1) us ON true
        WHERE p.id::text = $1`, [paymentId],
    );
    if (!p || !["success", "completed"].includes(p.status)) return;
    if (!["matched", "manually_matched", "unmatched"].includes(String(p.reconciliation_status))) return;

    const purpose = resolvePurpose({ planId: p.plan_id, serviceId: p.service_id, metadata: p.meta, orderSlug: p.service_slug });
    const label = p.service_name && purpose.kind !== "subscription" ? String(p.service_name) : await labelFor(purpose.kind, purpose.key);
    const who = p.name || p.email || "Guest / unlinked";
    const when = new Date(p.created_at).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" });
    const lines = [
      `Customer: ${who}`,
      `${purpose.kind === "subscription" ? "Plan" : "Service"}: ${label}`,
      `Amount received: KES ${Number(p.amount).toLocaleString()}`,
      `Method: ${p.method === "mpesa" ? "M-Pesa" : p.method}`,
      `M-Pesa receipt: ${p.receipt_norm ?? "—"}`,
      `Order: ${orderRef(p.id)}`,
    ];
    if (purpose.kind === "subscription") {
      lines.push(`Subscription: ${p.sub_status ?? "pending activation"}`);
      if (p.start_date) lines.push(`Start: ${new Date(p.start_date).toLocaleDateString("en-KE")}`);
      if (p.end_date) lines.push(`Expiry: ${new Date(p.end_date).toLocaleDateString("en-KE")}`);
    } else if (p.order_status) {
      lines.push(`Service status: ${p.order_status === "completed" ? "Delivered" : "Awaiting delivery"}`);
    }
    lines.push(`Time: ${when}`);
    const unmatched = p.reconciliation_status === "unmatched";
    await notifyFinanceAdmins({
      kind: unmatched ? "unmatched" : purpose.kind === "subscription" ? "subscription" : "payment",
      title: unmatched ? "UNMATCHED PAYMENT — needs reconciliation" : purpose.kind === "subscription" ? "NEW SUBSCRIPTION PAYMENT" : "NEW PAYMENT RECEIVED",
      body: lines.join("\n"),
      paymentId: p.id, amount: Number(p.amount), dedupeKey: `pay:${p.id}`,
    });

    const to = process.env.FINANCE_ALERT_EMAIL;
    if (to) {
      const { sendEmail } = await import("../email");
      sendEmail({ to, subject: `${unmatched ? "Unmatched" : "New"} payment · KES ${Number(p.amount).toLocaleString()} · ${label}`, html: `<pre style="font-family:inherit">${lines.join("\n").replace(/</g, "&lt;")}</pre>`, text: lines.join("\n") }).catch(() => {});
    }
  } catch (err: any) {
    console.warn("[finance-notify] alertVerifiedPayment failed:", err?.message);
  }
}

/* ── Sweep: alert on every newly verified payment, whatever path confirmed it ── */
let sweepTimer: NodeJS.Timeout | null = null;
export function startFinanceAlertSweep(): void {
  if (sweepTimer) return;
  const run = async () => {
    try {
      const { rows } = await pool.query<{ id: string }>(
        `SELECT p.id FROM payments p
          WHERE p.status IN ('success','completed')
            AND p.reconciliation_status IN ('matched','manually_matched','unmatched')
            AND coalesce(p.updated_at, p.created_at) > NOW() - INTERVAL '6 hours'
            AND NOT EXISTS (SELECT 1 FROM finance_admin_notifications n WHERE n.dedupe_key = 'pay:' || p.id::text)
          ORDER BY p.created_at ASC LIMIT 100`,
      );
      for (const r of rows) await alertVerifiedPayment(String(r.id));
      // Write-from-scratch orders confirm in their own table.
      const { rows: wfs } = await pool.query(
        `SELECT d.id, d.mpesa_amount, d.mpesa_receipt, d.doc_type, d.status, d.paid_at, u.email
           FROM write_from_scratch_drafts d LEFT JOIN users u ON u.id::text = d.user_id
          WHERE d.mpesa_receipt IS NOT NULL AND coalesce(d.paid_at, d.created_at) > NOW() - INTERVAL '6 hours'
            AND NOT EXISTS (SELECT 1 FROM finance_admin_notifications n WHERE n.dedupe_key = 'wfs:' || d.id::text)
          LIMIT 50`,
      );
      for (const d of wfs) {
        await notifyFinanceAdmins({
          kind: "payment", title: "NEW PAYMENT RECEIVED", paymentId: String(d.id), amount: Number(d.mpesa_amount ?? 0),
          dedupeKey: `wfs:${d.id}`,
          body: [`Customer: ${d.email ?? "—"}`, `Service: Write from scratch (${d.doc_type ?? "document"})`,
                 `Amount received: KES ${Number(d.mpesa_amount ?? 0).toLocaleString()}`, `Method: M-Pesa`,
                 `M-Pesa receipt: ${d.mpesa_receipt}`, `Order: ${orderRef(String(d.id))}`,
                 `Service status: ${d.status === "generated" ? "Delivered" : "Awaiting delivery"}`].join("\n"),
        });
      }
    } catch (err: any) {
      console.warn("[finance-notify] sweep failed:", err?.message);
    }
  };
  setTimeout(run, 45_000);
  sweepTimer = setInterval(run, 60_000);
  sweepTimer.unref?.();
}
