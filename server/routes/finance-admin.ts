/**
 * Admin Finance & Reconciliation API (2026-10).
 *
 *   GET   /api/admin/finance/summary            totals, revenue by service, queues
 *   GET   /api/admin/finance/register           searchable/filterable ledger (+ ?format=csv)
 *   GET   /api/admin/finance/payments/:id       full trace: customer → order → M-Pesa → delivery → refunds → audit
 *   GET   /api/admin/finance/unmatched          verified money we can't attribute yet
 *   POST  /api/admin/finance/unmatched/:id/match    link to a customer + an existing order/plan (evidence required)
 *   POST  /api/admin/finance/unmatched/:id/resolve  label as duplicate / test (no deletion)
 *   POST  /api/admin/finance/payments/:id/delivery  record manual delivery with evidence
 *   POST  /api/admin/finance/refunds            open a refund case for a payment
 *   PATCH /api/admin/finance/refunds/:id        approve / reject / processing / complete(ref) / fail
 *   GET   /api/admin/finance/notifications      admin alerts + unread count
 *   POST  /api/admin/finance/notifications/read
 *   POST  /api/refunds/request                  customer asks for a refund on THEIR payment
 *   GET   /api/me/payments                      customer's own payment & order history
 *
 * Revenue = confirmed payments whose reconciliation_status is matched,
 * manually_matched or unmatched. Duplicates, admin grants and unverified
 * customer-typed receipts are shown but never counted as money received.
 * Purpose comes from recorded plan/service/order references, never from the
 * amount. Delivery is derived from the fulfilment record, not from payment.
 */
import type { Express, Request, Response } from "express";
import { pool } from "../db";
import {
  canTransitionRefund, validateRefundAmount, validateRefundCompletion, orderRef, PLAN_IDS,
} from "../lib/finance-ledger";
import { notifyFinanceAdmins } from "../lib/finance-notify";

/* ── auth ─────────────────────────────────────────────────────────────── */

function sessionUserId(req: any): string | null {
  const id = req.user?.claims?.sub ?? req.user?.id ?? req.session?.customUserId ?? null;
  return id ? String(id) : null;
}
async function isFinanceAdmin(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const { rows } = await pool.query(`SELECT is_admin, role FROM users WHERE id = $1`, [userId]).catch(() => ({ rows: [] as any[] }));
  const u = rows[0];
  return !!u && (u.is_admin === true || ["admin", "ADMIN", "SUPER_ADMIN"].includes(String(u.role ?? "")));
}
function adminOnly(handler: (req: any, res: Response, adminId: string) => Promise<any>) {
  return async (req: any, res: Response) => {
    const uid = sessionUserId(req);
    if (!uid) return res.status(401).json({ message: "Please sign in." });
    if (!(await isFinanceAdmin(uid))) return res.status(403).json({ message: "Admin only." });
    try { await handler(req, res, uid); }
    catch (err: any) {
      console.error(`[finance-admin] ${req.method} ${req.path}:`, err?.message);
      res.status(500).json({ message: "Something went wrong. Nothing was changed." });
    }
  };
}
async function audit(entity: string, entityId: string, action: string, actorId: string | null, note: string | null, before: any, after: any) {
  await pool.query(
    `INSERT INTO finance_audit_log (entity, entity_id, action, actor_id, note, before, after) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [entity, entityId, action, actorId, note, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null],
  );
}

/* ── SQL building blocks (purpose & delivery from records, never amount) ── */

const PLAN_LIST = Array.from(PLAN_IDS).map((p) => `'${p}'`).join(",");
export const PURPOSE_KEY_SQL = `(CASE
  WHEN l.source = 'wfs' THEN 'write_from_scratch'
  WHEN l.plan_id IN (${PLAN_LIST}) THEN l.plan_id
  WHEN l.service_id LIKE 'plan\\_%' AND substr(l.service_id, 6) IN (${PLAN_LIST}) THEN substr(l.service_id, 6)
  WHEN l.order_slug IS NOT NULL THEN l.order_slug
  WHEN coalesce(l.service_id,'') <> '' THEN l.service_id
  ELSE NULL END)`;
export const PURPOSE_KIND_SQL = `(CASE
  WHEN l.source = 'wfs' THEN 'service'
  WHEN l.plan_id IN (${PLAN_LIST}) OR (l.service_id LIKE 'plan\\_%' AND substr(l.service_id, 6) IN (${PLAN_LIST})) THEN 'subscription'
  WHEN l.service_id LIKE 'tool\\_%' THEN 'tool'
  WHEN l.order_slug IS NOT NULL OR coalesce(l.service_id,'') <> '' THEN 'service'
  ELSE 'unknown' END)`;
export const DELIVERY_SQL = `(CASE
  WHEN l.payment_status NOT IN ('success','completed') THEN 'pending_payment'
  WHEN l.reconciliation_status IN ('unmatched','unverified_receipt') THEN 'unattributed'
  WHEN l.refund_status = 'completed' THEN 'refunded'
  WHEN l.source = 'wfs' THEN CASE WHEN l.order_status = 'generated' THEN 'delivered' WHEN l.order_status = 'failed' THEN 'delivery_failed' ELSE 'awaiting_delivery' END
  WHEN ${PURPOSE_KIND_SQL} = 'subscription' THEN CASE
       WHEN l.sub_status = 'active' AND (l.sub_end IS NULL OR l.sub_end > now()) THEN 'active'
       WHEN l.sub_status IS NOT NULL THEN 'expired'
       ELSE 'not_activated' END
  WHEN l.order_status IS NOT NULL THEN CASE l.order_status
       WHEN 'completed' THEN 'delivered' WHEN 'delivered' THEN 'delivered'
       WHEN 'failed' THEN 'delivery_failed'
       WHEN 'processing' THEN 'processing' WHEN 'awaiting_review' THEN 'processing'
       ELSE 'awaiting_delivery' END
  WHEN l.delivery_status IN ('consumed','delivered') AND ${PURPOSE_KIND_SQL} = 'tool' THEN 'delivered'
  WHEN l.delivered_at IS NOT NULL THEN 'delivered'
  ELSE 'unverified' END)`;

async function loadCatalog(): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const [plans, services] = await Promise.all([
    pool.query(`SELECT plan_id, plan_name FROM plans`).catch(() => ({ rows: [] as any[] })),
    pool.query(`SELECT id, slug, code, name FROM services`).catch(() => ({ rows: [] as any[] })),
  ]);
  for (const p of plans.rows) m.set(String(p.plan_id), String(p.plan_name));
  for (const s of services.rows) for (const k of [s.id, s.slug, s.code]) if (k) m.set(String(k), String(s.name));
  m.set("write_from_scratch", m.get("write_from_scratch") ?? "Write From Scratch");
  return m;
}
function labelOf(cat: Map<string, string>, key: string | null, fallbackName?: string | null): string {
  if (!key) return fallbackName || "Unknown purpose";
  return cat.get(key) ?? cat.get(`plan_${key}`) ?? fallbackName ?? key.replace(/^tool_/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const REVENUE_SQL = `l.payment_status IN ('success','completed') AND l.reconciliation_status IN ('matched','manually_matched','unmatched')`;

/* ── register filters ─────────────────────────────────────────────────── */

function buildRegisterWhere(q: Record<string, any>) {
  const conds: string[] = ["1=1"]; const params: any[] = [];
  const p = (v: any) => { params.push(v); return `$${params.length}`; };
  const s = (v: any) => String(v ?? "").trim();
  if (s(q.from)) conds.push(`l.created_at >= ${p(s(q.from))}::date`);
  if (s(q.to)) conds.push(`l.created_at < (${p(s(q.to))}::date + 1)`);
  const ps = s(q.paymentStatus);
  if (ps === "confirmed") conds.push(`l.payment_status IN ('success','completed')`);
  else if (ps === "failed") conds.push(`l.payment_status IN ('failed','cancelled','expired','timeout','reversed')`);
  else if (ps === "pending") conds.push(`l.payment_status NOT IN ('success','completed','failed','cancelled','expired','timeout','reversed')`);
  if (s(q.recon)) conds.push(`l.reconciliation_status = ${p(s(q.recon))}`);
  if (s(q.service)) conds.push(`${PURPOSE_KEY_SQL} = ${p(s(q.service))}`);
  if (s(q.kind)) conds.push(`${PURPOSE_KIND_SQL} = ${p(s(q.kind))}`);
  if (s(q.delivery)) conds.push(`${DELIVERY_SQL} = ${p(s(q.delivery))}`);
  if (s(q.refund) === "none") conds.push(`l.refund_status IS NULL`);
  else if (s(q.refund)) conds.push(`l.refund_status = ${p(s(q.refund))}`);
  if (s(q.method)) conds.push(`l.method = ${p(s(q.method))}`);
  if (s(q.search)) {
    const raw = s(q.search).slice(0, 80);
    const t = p(`%${raw.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
    const ref = raw.toUpperCase().replace(/^WA-/, "");
    const r = p(ref.length >= 6 ? `${ref.toLowerCase()}%` : "~none~");
    conds.push(`(coalesce(l.customer_email,'') ILIKE ${t} OR coalesce(l.customer_name,'') ILIKE ${t}
      OR coalesce(l.receipt,'') ILIKE ${t} OR coalesce(l.service_name,'') ILIKE ${t} OR coalesce(l.order_slug,'') ILIKE ${t}
      OR replace(l.payment_id,'-','') LIKE ${r} OR replace(l.order_id,'-','') LIKE ${r})`);
  }
  return { where: conds.join(" AND "), params };
}

/* ── routes ───────────────────────────────────────────────────────────── */

export function registerFinanceAdminRoutes(app: Express): void {

  app.get("/api/admin/finance/summary", adminOnly(async (req, res) => {
    const cat = await loadCatalog();
    const [totals, bySvc, queues, refunds] = await Promise.all([
      pool.query(`
        SELECT
          coalesce(sum(amount) FILTER (WHERE ${REVENUE_SQL}),0)::numeric AS gross,
          count(*) FILTER (WHERE ${REVENUE_SQL}) AS gross_n,
          coalesce(sum(amount) FILTER (WHERE ${REVENUE_SQL} AND l.created_at >= date_trunc('day', now() AT TIME ZONE 'Africa/Nairobi') AT TIME ZONE 'Africa/Nairobi'),0) AS today,
          coalesce(sum(amount) FILTER (WHERE ${REVENUE_SQL} AND l.created_at >= now() - interval '7 days'),0) AS week,
          coalesce(sum(amount) FILTER (WHERE ${REVENUE_SQL} AND l.created_at >= date_trunc('month', now() AT TIME ZONE 'Africa/Nairobi') AT TIME ZONE 'Africa/Nairobi'),0) AS month,
          count(*) FILTER (WHERE l.payment_status NOT IN ('success','completed','failed','cancelled','expired','timeout','reversed') AND l.created_at > now() - interval '7 days') AS pending_n,
          count(*) FILTER (WHERE l.payment_status IN ('failed','cancelled','expired','timeout') AND l.created_at > now() - interval '30 days') AS failed_30d,
          count(*) FILTER (WHERE l.reconciliation_status = 'unmatched' AND l.payment_status IN ('success','completed')) AS unmatched_n,
          coalesce(sum(amount) FILTER (WHERE l.reconciliation_status = 'unmatched' AND l.payment_status IN ('success','completed')),0) AS unmatched_kes,
          count(*) FILTER (WHERE l.reconciliation_status = 'unverified_receipt') AS unverified_n,
          coalesce(sum(amount) FILTER (WHERE l.reconciliation_status = 'unverified_receipt'),0) AS unverified_kes,
          count(*) FILTER (WHERE l.reconciliation_status = 'duplicate') AS duplicate_n,
          coalesce(sum(amount) FILTER (WHERE l.reconciliation_status = 'duplicate'),0) AS duplicate_kes,
          count(*) FILTER (WHERE l.reconciliation_status = 'admin_grant') AS grant_n,
          count(*) FILTER (WHERE ${REVENUE_SQL} AND ${DELIVERY_SQL} IN ('awaiting_delivery','processing','delivery_failed','not_activated')) AS awaiting_n,
          count(*) FILTER (WHERE ${REVENUE_SQL} AND ${DELIVERY_SQL} IN ('delivered','active','expired')) AS delivered_n
        FROM finance_ledger l`),
      pool.query(`
        SELECT ${PURPOSE_KEY_SQL} AS key, ${PURPOSE_KIND_SQL} AS kind, max(l.service_name) AS name,
               count(*) AS n, sum(l.amount)::numeric AS kes,
               count(*) FILTER (WHERE ${DELIVERY_SQL} IN ('awaiting_delivery','processing','delivery_failed','not_activated')) AS undelivered
          FROM finance_ledger l WHERE ${REVENUE_SQL} AND l.reconciliation_status <> 'unmatched'
         GROUP BY 1, 2 ORDER BY kes DESC NULLS LAST`),
      pool.query(`SELECT count(*) FILTER (WHERE NOT is_read) AS unread FROM finance_admin_notifications`),
      pool.query(`
        SELECT count(*) FILTER (WHERE status IN ('requested','approved','processing')) AS open_n,
               coalesce(sum(amount) FILTER (WHERE status IN ('approved','processing')),0) AS outstanding_kes,
               count(*) FILTER (WHERE status = 'completed') AS done_n,
               coalesce(sum(amount) FILTER (WHERE status = 'completed'),0) AS refunded_kes
          FROM refund_requests`),
    ]);
    const t = totals.rows[0]; const r = refunds.rows[0];
    res.json({
      gross: Number(t.gross), grossCount: Number(t.gross_n),
      refunded: Number(r.refunded_kes), net: Number(t.gross) - Number(r.refunded_kes),
      today: Number(t.today), week: Number(t.week), month: Number(t.month),
      pending: Number(t.pending_n), failed30d: Number(t.failed_30d),
      unmatched: { count: Number(t.unmatched_n), kes: Number(t.unmatched_kes) },
      unverifiedReceipts: { count: Number(t.unverified_n), kes: Number(t.unverified_kes) },
      duplicates: { count: Number(t.duplicate_n), kes: Number(t.duplicate_kes) },
      adminGrants: Number(t.grant_n),
      awaitingDelivery: Number(t.awaiting_n), delivered: Number(t.delivered_n),
      refunds: { open: Number(r.open_n), outstandingKes: Number(r.outstanding_kes), completed: Number(r.done_n), refundedKes: Number(r.refunded_kes) },
      unreadAlerts: Number(queues.rows[0]?.unread ?? 0),
      byService: bySvc.rows.map((x: any) => ({
        key: x.key, kind: x.kind, label: labelOf(cat, x.key, x.name), count: Number(x.n), kes: Number(x.kes), undelivered: Number(x.undelivered),
      })),
      notes: "Gross = verified M-Pesa money (attributed + unmatched). Excludes duplicates, admin grants and unverified customer-typed receipts.",
    });
  }));

  app.get("/api/admin/finance/register", adminOnly(async (req, res) => {
    const cat = await loadCatalog();
    const { where, params } = buildRegisterWhere(req.query);
    const csv = req.query.format === "csv";
    const limit = csv ? 20000 : Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));
    const page = Math.max(1, Number(req.query.page) || 1);
    const [list, count] = await Promise.all([
      pool.query(`
        SELECT l.*, ${PURPOSE_KEY_SQL} AS purpose_key, ${PURPOSE_KIND_SQL} AS purpose_kind, ${DELIVERY_SQL} AS delivery
          FROM finance_ledger l WHERE ${where}
         ORDER BY l.created_at DESC LIMIT ${limit} OFFSET ${csv ? 0 : (page - 1) * limit}`, params),
      pool.query(`SELECT count(*)::int AS n, coalesce(sum(amount) FILTER (WHERE ${REVENUE_SQL}),0)::numeric AS kes FROM finance_ledger l WHERE ${where}`, params),
    ]);
    const rows = list.rows.map((l: any) => ({
      source: l.source, paymentId: l.payment_id, orderId: l.order_id, orderRef: orderRef(l.order_id),
      date: l.created_at, customerId: l.user_id, customerName: l.customer_name, customerEmail: l.customer_email,
      purposeKey: l.purpose_key, purposeKind: l.purpose_kind, purpose: labelOf(cat, l.purpose_key, l.service_name),
      receipt: l.receipt, amount: Number(l.amount), currency: l.currency, method: l.method,
      paymentStatus: l.payment_status, reconciliation: l.reconciliation_status, unmatchedReason: l.unmatched_reason,
      delivery: l.delivery, refundStatus: l.refund_status, refunded: Number(l.refunded_amount ?? 0),
      subscription: l.sub_status ? { status: l.sub_status, start: l.sub_start, end: l.sub_end } : null,
    }));
    if (csv) {
      const head = ["Date", "Customer", "Customer ID", "Service/Plan", "Kind", "Order", "M-Pesa receipt", "Amount", "Currency", "Method", "Payment status", "Reconciliation", "Delivery", "Refund status", "Refunded"];
      const esc = (v: any) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const lines = [head.join(",")].concat(rows.map((r) => [
        new Date(r.date).toISOString(), r.customerName || r.customerEmail || "", r.customerId || "", r.purpose, r.purposeKind, r.orderRef,
        r.receipt || "", r.amount, r.currency, r.method, r.paymentStatus, r.reconciliation, r.delivery, r.refundStatus || "", r.refunded,
      ].map(esc).join(",")));
      await audit("export", "register", "csv_export", sessionUserId(req), `rows=${rows.length}`, null, req.query);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="workabroadhub-payments-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(lines.join("\n"));
    }
    res.json({ rows, total: count.rows[0].n, filteredRevenue: Number(count.rows[0].kes), page, pageSize: limit });
  }));

  app.get("/api/admin/finance/payments/:id", adminOnly(async (req, res) => {
    const id = String(req.params.id);
    const cat = await loadCatalog();
    const { rows: [l] } = await pool.query(
      `SELECT l.*, ${PURPOSE_KEY_SQL} AS purpose_key, ${PURPOSE_KIND_SQL} AS purpose_kind, ${DELIVERY_SQL} AS delivery
         FROM finance_ledger l WHERE l.payment_id = $1 LIMIT 1`, [id]);
    if (!l) return res.status(404).json({ message: "Payment not found." });
    const [raw, order, refunds, auditRows, sameReceipt] = await Promise.all([
      l.source === "payments"
        ? pool.query(`SELECT id, status, amount, plan_id, service_id, service_name, checkout_request_id, transaction_ref, receipt_norm,
                             created_at, updated_at, callback_received_at, verified_at, verification_note, needs_review,
                             reconciliation_status, unmatched_reason, reconciled_at, reconciled_by, delivery_status, delivered_at, delivery_evidence,
                             fin_meta(metadata) - 'phone' AS meta, CASE WHEN phone IS NULL THEN NULL WHEN phone ~ '^[0-9a-f]{64}$' THEN 'hashed' ELSE '•••' || right(phone, 3) END AS phone_masked
                        FROM payments WHERE id::text = $1`, [id])
        : Promise.resolve({ rows: [] as any[] }),
      l.order_slug && l.source === "payments"
        ? pool.query(`SELECT id, service_slug, service_name, status, created_at, paid_at, completed_at, user_notified_at, first_downloaded_at, download_count,
                             left(coalesce(error_message,''), 600) AS error_tail, (output_text IS NOT NULL) AS has_output
                        FROM service_orders WHERE id::text = $1`, [l.order_id])
        : l.source === "wfs"
          ? pool.query(`SELECT id, doc_type, status, created_at, paid_at, generated_at, (output_body IS NOT NULL) AS has_output FROM write_from_scratch_drafts WHERE id::text = $1`, [id])
          : Promise.resolve({ rows: [] as any[] }),
      pool.query(`SELECT * FROM refund_requests WHERE payment_id = $1 ORDER BY created_at DESC`, [id]),
      pool.query(`SELECT id, action, actor_id, note, before, after, created_at FROM finance_audit_log WHERE entity_id = $1 ORDER BY created_at DESC LIMIT 50`, [id]),
      l.receipt ? pool.query(`SELECT id, user_id, amount, status, reconciliation_status, created_at FROM payments WHERE receipt_norm = $1 AND id::text <> $2`, [l.receipt, id]) : Promise.resolve({ rows: [] as any[] }),
    ]);
    res.json({
      ledger: { ...l, orderRef: orderRef(l.order_id), purpose: labelOf(cat, l.purpose_key, l.service_name) },
      payment: raw.rows[0] ?? null, order: order.rows[0] ?? null,
      refunds: refunds.rows, audit: auditRows.rows, sameReceipt: sameReceipt.rows,
    });
  }));

  app.get("/api/admin/finance/unmatched", adminOnly(async (_req, res) => {
    const { rows } = await pool.query(`
      SELECT p.id, p.amount, p.created_at, p.receipt_norm, p.reconciliation_status, p.unmatched_reason,
             fin_meta(p.metadata)->>'billRefNumber' AS account_ref, fin_meta(p.metadata)->>'firstName' AS payer_first_name,
             fin_meta(p.metadata)->>'resolvedUserId' AS suggested_user_id, fin_meta(p.metadata)->>'resolvedVia' AS suggested_via,
             su.email AS suggested_email,
             p.user_id, u.email AS claimant_email, p.plan_id, p.service_id
        FROM payments p
        LEFT JOIN users su ON su.id::text = fin_meta(p.metadata)->>'resolvedUserId'
        LEFT JOIN users u ON u.id::text = p.user_id
       WHERE (p.status IN ('success','completed') AND p.reconciliation_status IN ('unmatched','unverified_receipt'))
          OR p.status = 'pending_manual_verification'
       ORDER BY p.created_at DESC LIMIT 500`);
    res.json({ rows: rows.map((r: any) => ({ ...r, orderRef: orderRef(r.id) })) });
  }));

  /**
   * Link an unmatched payment to a customer AND to what they bought.
   * target: { type: 'order', orderId }  — an existing service order of that customer
   *         { type: 'attempt', paymentId } — that customer's own unpaid payment attempt (plan or service)
   *         { type: 'plan', planId }      — only with explicit admin confirmation of the plan purchased
   * evidence: free text (e.g. "customer emailed M-Pesa SMS; phone hash matches")
   */
  app.post("/api/admin/finance/unmatched/:id/match", adminOnly(async (req, res, adminId) => {
    const id = String(req.params.id);
    const userId = String(req.body?.userId ?? "").trim();
    const evidence = String(req.body?.evidence ?? "").trim();
    const target = req.body?.target ?? {};
    if (!userId) return res.status(400).json({ message: "Choose the customer this payment belongs to." });
    if (evidence.length < 10) return res.status(400).json({ message: "Describe the evidence for this match (at least 10 characters)." });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: [p] } = await client.query(`SELECT * FROM payments WHERE id::text = $1 FOR UPDATE`, [id]);
      if (!p) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Payment not found." }); }
      const confirmed = ["success", "completed"].includes(p.status);
      const queuedClaim = p.status === "pending_manual_verification";
      if (!(confirmed && ["unmatched", "unverified_receipt"].includes(p.reconciliation_status)) && !queuedClaim) {
        await client.query("ROLLBACK"); return res.status(409).json({ message: `This payment is already ${p.reconciliation_status}.` });
      }
      if (queuedClaim || p.reconciliation_status === "unverified_receipt") {
        // A customer-typed receipt can only be approved by pointing at the real Safaricom record.
        const proof = String(req.body?.safaricomReceipt ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (proof.length < 10) { await client.query("ROLLBACK"); return res.status(400).json({ message: "Enter the receipt as shown in the M-Pesa org portal / statement to confirm this claim." }); }
      }
      const { rows: [u] } = await client.query(`SELECT id, email FROM users WHERE id = $1`, [userId]);
      if (!u) { await client.query("ROLLBACK"); return res.status(400).json({ message: "Customer not found." }); }

      let planId: string | null = null; let serviceId: string | null = null; let orderId: string | null = null; let attemptId: string | null = null;
      if (target.type === "order") {
        const { rows: [o] } = await client.query(`SELECT id, user_id, service_slug, service_id, amount, status FROM service_orders WHERE id::text = $1`, [String(target.orderId ?? "")]);
        if (!o || String(o.user_id) !== userId) { await client.query("ROLLBACK"); return res.status(400).json({ message: "That order doesn't belong to this customer." }); }
        orderId = String(o.id); serviceId = o.service_slug ?? o.service_id;
      } else if (target.type === "attempt") {
        const { rows: [a] } = await client.query(`SELECT id, user_id, plan_id, service_id, amount, status FROM payments WHERE id::text = $1`, [String(target.paymentId ?? "")]);
        if (!a || String(a.user_id) !== userId || ["success", "completed"].includes(a.status)) { await client.query("ROLLBACK"); return res.status(400).json({ message: "Pick an unpaid attempt that belongs to this customer." }); }
        attemptId = String(a.id); planId = a.plan_id; serviceId = a.service_id;
      } else if (target.type === "plan") {
        if (!PLAN_IDS.has(String(target.planId)) || req.body?.confirmPlan !== true) {
          await client.query("ROLLBACK"); return res.status(400).json({ message: "Confirm which plan the customer bought (we never assume it from the amount)." });
        }
        planId = String(target.planId); serviceId = `plan_${planId}`;
      } else {
        await client.query("ROLLBACK"); return res.status(400).json({ message: "Choose what this payment was for: an order, an unpaid attempt, or a plan." });
      }
      if (planId && p.plan_id && p.plan_id !== planId && queuedClaim) {
        await client.query("ROLLBACK"); return res.status(400).json({ message: `The customer claimed this for plan "${p.plan_id}".` });
      }

      const before = { user_id: p.user_id, plan_id: p.plan_id, service_id: p.service_id, status: p.status, reconciliation_status: p.reconciliation_status };
      const meta = { ...(safeJson(p.metadata)), ...(orderId ? { serviceOrderId: orderId } : {}), ...(attemptId ? { linkedAttemptId: attemptId } : {}), manualMatch: { by: adminId, at: new Date().toISOString(), evidence } };
      await client.query(
        `UPDATE payments SET user_id = $2, plan_id = coalesce($3, plan_id), service_id = coalesce($4, service_id),
                status = CASE WHEN status = 'pending_manual_verification' THEN 'success' ELSE status END,
                reconciliation_status = 'manually_matched', reconciled_at = NOW(), reconciled_by = $5,
                unmatched_reason = NULL, matched = true, matched_user_id = $2, needs_review = false,
                metadata = $6, verification_note = $7, updated_at = NOW()
          WHERE id::text = $1`,
        [id, userId, planId, serviceId, adminId, JSON.stringify(meta), `Manually matched by admin: ${evidence}`.slice(0, 500)],
      );
      if (attemptId) await client.query(`UPDATE payments SET status = 'superseded', updated_at = NOW(), verification_note = $2 WHERE id::text = $1`, [attemptId, `Paid via Paybill payment ${id}`]);
      if (orderId) await client.query(`UPDATE service_orders SET status = CASE WHEN status IN ('pending_payment','pending') THEN 'paid' ELSE status END, paid_at = coalesce(paid_at, NOW()), payment_id = coalesce(payment_id, $2), updated_at = NOW() - interval '5 minutes' WHERE id::text = $1`, [orderId, id]);
      await client.query(
        `INSERT INTO finance_audit_log (entity, entity_id, action, actor_id, note, before, after) VALUES ('payment', $1, 'manual_match', $2, $3, $4, $5)`,
        [id, adminId, evidence, JSON.stringify(before), JSON.stringify({ user_id: userId, planId, serviceId, orderId, attemptId })],
      );
      await client.query("COMMIT");

      // Grant the entitlement the customer actually bought (outside the txn; idempotent).
      if (planId) {
        const { storage } = await import("../storage");
        const { planExpiry } = await import("../utils/plans");
        const existing = await pool.query(`SELECT 1 FROM user_subscriptions WHERE payment_id = $1`, [id]);
        if (!existing.rowCount) await storage.activateUserPlan(userId, planId, id, planExpiry(planId));
      }
      res.json({ ok: true, message: orderId ? "Linked. The order is now marked paid and will be processed." : planId ? `Linked and ${planId} plan activated.` : "Linked." });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally { client.release(); }
  }));

  // Customer lookup for reconciliation: exact email → their unpaid attempts & open orders.
  app.get("/api/admin/finance/customer", adminOnly(async (req, res) => {
    const email = String(req.query.email ?? "").trim().toLowerCase();
    if (!email.includes("@")) return res.status(400).json({ message: "Enter the customer's full email." });
    const { rows: [u] } = await pool.query(`SELECT id, email, first_name, last_name, plan FROM users WHERE lower(email) = $1 LIMIT 1`, [email]);
    if (!u) return res.status(404).json({ message: "No account with that exact email." });
    const [attempts, orders] = await Promise.all([
      pool.query(`SELECT id, amount, plan_id, service_id, service_name, status, created_at FROM payments
                   WHERE user_id = $1 AND status NOT IN ('success','completed','superseded') ORDER BY created_at DESC LIMIT 20`, [u.id]),
      pool.query(`SELECT id, service_slug, service_name, amount, status, created_at FROM service_orders
                   WHERE user_id = $1 AND status IN ('pending_payment','pending') ORDER BY created_at DESC LIMIT 20`, [u.id]),
    ]);
    res.json({ user: u, attempts: attempts.rows, orders: orders.rows });
  }));

  app.post("/api/admin/finance/unmatched/:id/resolve", adminOnly(async (req, res, adminId) => {
    const id = String(req.params.id);
    const action = String(req.body?.action ?? "");
    const note = String(req.body?.note ?? "").trim();
    if (!["duplicate", "test"].includes(action)) return res.status(400).json({ message: "Action must be duplicate or test." });
    if (note.length < 5) return res.status(400).json({ message: "Add a short note explaining why." });
    const { rows: [p] } = await pool.query(`SELECT reconciliation_status, status FROM payments WHERE id::text = $1`, [id]);
    if (!p) return res.status(404).json({ message: "Payment not found." });
    await pool.query(`UPDATE payments SET reconciliation_status = $2, unmatched_reason = $3, reconciled_at = NOW(), reconciled_by = $4, needs_review = false WHERE id::text = $1`,
      [id, action, `Admin: ${note}`.slice(0, 500), adminId]);
    await audit("payment", id, `resolve_${action}`, adminId, note, p, { reconciliation_status: action });
    res.json({ ok: true });
  }));

  app.post("/api/admin/finance/payments/:id/delivery", adminOnly(async (req, res, adminId) => {
    const id = String(req.params.id);
    const status = String(req.body?.status ?? "");
    const evidence = String(req.body?.evidence ?? "").trim();
    if (!["delivered", "processing", "delivery_failed"].includes(status)) return res.status(400).json({ message: "Status must be delivered, processing or delivery_failed." });
    if (status === "delivered" && evidence.length < 5) return res.status(400).json({ message: "Add delivery evidence (document link, file name, email sent…)." });
    const { rows: [p] } = await pool.query(`SELECT status, delivery_status, delivered_at FROM payments WHERE id::text = $1`, [id]);
    if (!p) return res.status(404).json({ message: "Payment not found." });
    if (!["success", "completed"].includes(p.status)) return res.status(409).json({ message: "Only confirmed payments can be marked delivered." });
    await pool.query(`UPDATE payments SET delivery_status = $2, delivered_at = CASE WHEN $2 = 'delivered' THEN NOW() ELSE delivered_at END, delivery_evidence = $3, updated_at = NOW() WHERE id::text = $1`,
      [id, status, evidence || null]);
    await audit("payment", id, `delivery_${status}`, adminId, evidence || null, p, { delivery_status: status });
    res.json({ ok: true });
  }));

  /* refunds */
  async function refundableBalance(paymentId: string) {
    const { rows: [l] } = await pool.query(`SELECT amount, payment_status, reconciliation_status, user_id, order_id FROM finance_ledger WHERE payment_id = $1 LIMIT 1`, [paymentId]);
    if (!l) return null;
    const { rows: [c] } = await pool.query(`SELECT coalesce(sum(amount),0)::numeric AS committed FROM refund_requests WHERE payment_id = $1 AND status IN ('approved','processing','completed')`, [paymentId]);
    return { ledger: l, paid: Number(l.amount), committed: Number(c.committed) };
  }

  app.post("/api/admin/finance/refunds", adminOnly(async (req, res, adminId) => {
    const paymentId = String(req.body?.paymentId ?? "");
    const reason = String(req.body?.reason ?? "").trim();
    const amount = Number(req.body?.amount);
    if (reason.length < 5) return res.status(400).json({ message: "Give the reason for the refund." });
    const b = await refundableBalance(paymentId);
    if (!b) return res.status(404).json({ message: "Payment not found." });
    if (!["success", "completed"].includes(b.ledger.payment_status) || !["matched", "manually_matched"].includes(b.ledger.reconciliation_status)) {
      return res.status(409).json({ message: "Only verified, attributed payments can be refunded." });
    }
    const v = validateRefundAmount(b.paid, b.committed, amount);
    if (!v.ok) return res.status(400).json({ message: (v as any).error });
    const { rows: open } = await pool.query(`SELECT id FROM refund_requests WHERE payment_id = $1 AND status = 'requested'`, [paymentId]);
    if (open.length) return res.status(409).json({ message: "There is already an open refund request for this payment.", refundId: open[0].id });
    const { rows: [r] } = await pool.query(
      `INSERT INTO refund_requests (payment_id, user_id, reason, status, amount, order_ref, requested_by, created_at, updated_at)
       VALUES ($1, $2, $3, 'requested', $4, $5, $6, NOW(), NOW()) RETURNING *`,
      [paymentId, b.ledger.user_id, reason, amount, orderRef(b.ledger.order_id), adminId]);
    await audit("refund", r.id, "refund_requested", adminId, reason, null, r);
    res.json({ ok: true, refund: r });
  }));

  app.patch("/api/admin/finance/refunds/:id", adminOnly(async (req, res, adminId) => {
    const id = String(req.params.id);
    const to = String(req.body?.status ?? "");
    const note = String(req.body?.note ?? "").trim() || null;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows: [r] } = await client.query(`SELECT * FROM refund_requests WHERE id = $1 FOR UPDATE`, [id]);
      if (!r) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Refund not found." }); }
      if (!canTransitionRefund(r.status, to)) { await client.query("ROLLBACK"); return res.status(409).json({ message: `Can't move a refund from ${r.status} to ${to}.` }); }
      if (to === "approved") {
        const { rows: [c] } = await client.query(`SELECT coalesce(sum(amount),0)::numeric AS committed FROM refund_requests WHERE payment_id = $1 AND status IN ('approved','processing','completed') AND id <> $2`, [r.payment_id, id]);
        const { rows: [l] } = await client.query(`SELECT amount FROM finance_ledger WHERE payment_id = $1 LIMIT 1`, [r.payment_id]);
        const v = validateRefundAmount(Number(l?.amount ?? 0), Number(c.committed), Number(r.amount));
        if (!v.ok) { await client.query("ROLLBACK"); return res.status(400).json({ message: (v as any).error }); }
      }
      if (to === "completed") {
        const v = validateRefundCompletion(req.body?.refundRef);
        if (!v.ok) { await client.query("ROLLBACK"); return res.status(400).json({ message: (v as any).error }); }
      }
      if (to === "failed" && !note) { await client.query("ROLLBACK"); return res.status(400).json({ message: "Say why the refund failed." }); }
      const { rows: [after] } = await client.query(
        `UPDATE refund_requests SET status = $2, updated_at = NOW(),
                admin_notes = coalesce($3, admin_notes),
                approved_by = CASE WHEN $2 = 'approved' THEN $4 ELSE approved_by END,
                approved_at = CASE WHEN $2 = 'approved' THEN NOW() ELSE approved_at END,
                reviewed_by = $4, reviewed_at = NOW(),
                refund_ref = CASE WHEN $2 = 'completed' THEN upper(trim($5)) ELSE refund_ref END,
                refund_method = CASE WHEN $2 = 'completed' THEN coalesce($6, 'mpesa_manual') ELSE refund_method END,
                evidence = CASE WHEN $2 = 'completed' THEN coalesce($7, evidence) ELSE evidence END,
                failure_reason = CASE WHEN $2 = 'failed' THEN $3 ELSE failure_reason END,
                completed_at = CASE WHEN $2 = 'completed' THEN NOW() ELSE completed_at END,
                processed_at = CASE WHEN $2 IN ('completed','failed') THEN NOW() ELSE processed_at END
          WHERE id = $1 RETURNING *`,
        [id, to, note, adminId, req.body?.refundRef ?? null, req.body?.refundMethod ?? null, req.body?.evidence ?? null]);
      if (to === "completed") await client.query(`UPDATE payments SET refund_requested = true, updated_at = NOW() WHERE id::text = $1`, [r.payment_id]);
      await client.query(`INSERT INTO finance_audit_log (entity, entity_id, action, actor_id, note, before, after) VALUES ('refund', $1, $2, $3, $4, $5, $6)`,
        [id, `refund_${to}`, adminId, note, JSON.stringify(r), JSON.stringify(after)]);
      await client.query("COMMIT");
      res.json({ ok: true, refund: after, note: to === "completed" && req.body?.revokeAccess !== true ? "Access was not changed. Revoke it from the customer's account if the refund policy requires." : undefined });
    } catch (e: any) {
      await client.query("ROLLBACK").catch(() => {});
      if (e?.code === "23505") return res.status(409).json({ message: "That refund reference is already used on another refund." });
      throw e;
    } finally { client.release(); }
  }));

  app.get("/api/admin/finance/refunds", adminOnly(async (_req, res) => {
    const { rows } = await pool.query(`
      SELECT r.*, l.amount AS paid_amount, l.receipt, l.customer_email, l.service_name, l.order_slug, l.plan_id, l.service_id, l.source
        FROM refund_requests r LEFT JOIN finance_ledger l ON l.payment_id = r.payment_id
       ORDER BY (r.status IN ('requested','approved','processing')) DESC, r.created_at DESC LIMIT 300`);
    res.json({ rows });
  }));

  app.get("/api/admin/finance/notifications", adminOnly(async (req, res) => {
    const unreadOnly = req.query.unread === "1";
    const { rows } = await pool.query(
      `SELECT * FROM finance_admin_notifications ${unreadOnly ? "WHERE NOT is_read" : ""} ORDER BY created_at DESC LIMIT 100`);
    const { rows: [c] } = await pool.query(`SELECT count(*)::int AS n FROM finance_admin_notifications WHERE NOT is_read`);
    res.json({ unread: c.n, rows });
  }));
  app.post("/api/admin/finance/notifications/read", adminOnly(async (req, res) => {
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String).slice(0, 500) : [];
    if (ids.length) await pool.query(`UPDATE finance_admin_notifications SET is_read = true WHERE id::text = ANY($1)`, [ids]);
    else await pool.query(`UPDATE finance_admin_notifications SET is_read = true WHERE NOT is_read`);
    res.json({ ok: true });
  }));

  /* customer side */
  app.post("/api/refunds/request", async (req: any, res: Response) => {
    const uid = sessionUserId(req);
    if (!uid) return res.status(401).json({ message: "Please sign in." });
    try {
      const paymentId = String(req.body?.paymentId ?? "");
      const reason = String(req.body?.reason ?? "").trim().slice(0, 2000);
      if (reason.length < 10) return res.status(400).json({ message: "Tell us briefly why you'd like a refund." });
      const { rows: [l] } = await pool.query(`SELECT * FROM finance_ledger WHERE payment_id = $1 AND user_id = $2 LIMIT 1`, [paymentId, uid]);
      if (!l) return res.status(404).json({ message: "Payment not found on your account." });   // never reveals other customers' payments
      if (!["success", "completed"].includes(l.payment_status)) return res.status(409).json({ message: "This payment wasn't completed, so there's nothing to refund." });
      const { rows: open } = await pool.query(`SELECT id, status FROM refund_requests WHERE payment_id = $1 AND status IN ('requested','approved','processing')`, [paymentId]);
      if (open.length) return res.status(409).json({ message: "You already have a refund request open for this payment." });
      const { rows: [r] } = await pool.query(
        `INSERT INTO refund_requests (payment_id, user_id, reason, status, amount, order_ref, requested_by, created_at, updated_at)
         VALUES ($1, $2, $3, 'requested', $4, $5, $2, NOW(), NOW()) RETURNING id, status, created_at`,
        [paymentId, uid, reason, Number(l.amount), orderRef(l.order_id)]);
      await audit("refund", r.id, "refund_requested_by_customer", uid, reason, null, { paymentId });
      notifyFinanceAdmins({ kind: "refund_request", paymentId, amount: Number(l.amount), dedupeKey: `refund:${r.id}`,
        title: "REFUND REQUEST", body: `Customer: ${l.customer_email ?? uid}\nPayment: ${orderRef(l.order_id)} · KES ${Number(l.amount).toLocaleString()} · ${l.service_name ?? l.plan_id ?? l.service_id ?? ""}\nReason: ${reason}` }).catch(() => {});
      res.json({ ok: true, refund: r, message: "Refund request received. We'll review it and email you." });
    } catch (err: any) {
      console.error("[POST /api/refunds/request]", err?.message);
      res.status(500).json({ message: "Could not submit the request." });
    }
  });

  app.get("/api/me/payments", async (req: any, res: Response) => {
    const uid = sessionUserId(req);
    if (!uid) return res.status(401).json({ message: "Please sign in." });
    try {
      const cat = await loadCatalog();
      const { rows } = await pool.query(
        `SELECT l.payment_id, l.order_id, l.amount, l.currency, l.payment_status, l.receipt, l.created_at, l.service_name, l.refund_status,
                ${PURPOSE_KEY_SQL} AS purpose_key, ${PURPOSE_KIND_SQL} AS purpose_kind, ${DELIVERY_SQL} AS delivery, l.sub_end
           FROM finance_ledger l
          WHERE l.user_id = $1 AND l.reconciliation_status NOT IN ('duplicate')
          ORDER BY l.created_at DESC LIMIT 100`, [uid]);
      res.setHeader("Cache-Control", "private, no-store");
      res.json({ rows: rows.map((r: any) => ({
        paymentId: r.payment_id, orderRef: orderRef(r.order_id), amount: Number(r.amount), currency: r.currency,
        status: ["success", "completed"].includes(r.payment_status) ? "paid" : r.payment_status === "pending_manual_verification" ? "verifying" : r.payment_status,
        receipt: r.receipt, date: r.created_at, item: labelOf(cat, r.purpose_key, r.service_name), kind: r.purpose_kind,
        delivery: r.delivery, refundStatus: r.refund_status, accessUntil: r.sub_end,
      })) });
    } catch (err: any) {
      console.error("[GET /api/me/payments]", err?.message);
      res.status(500).json({ message: "Could not load your payments." });
    }
  });
}

function safeJson(s: any): Record<string, any> {
  try { const v = typeof s === "string" ? JSON.parse(s) : s; return v && typeof v === "object" ? v : {}; } catch { return {}; }
}
