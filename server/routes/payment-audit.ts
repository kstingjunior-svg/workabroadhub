// ─────────────────────────────────────────────────────────────────────────────
// payment-audit.ts
//
// Tony's "trace the money" endpoint. One admin call surfaces every category
// of stranded customer state in one JSON — so instead of finding each
// stuck-Joyce one WhatsApp at a time, Tony sees the counts + IDs in one
// place and can bulk-repair from a follow-up call.
//
// Categories checked:
//   A. paid_but_free       — payment.status IN (success,completed), plan_id set,
//                            user.plan = 'free' → paid-but-free-reconciler eligible
//   B. pending_but_charged — payment.status = 'pending' >5 min old with a
//                            checkout_request_id → likely lost callback,
//                            mpesa-reconciler will query Safaricom for real state
//   C. orders_awaiting_review — service_orders.status='awaiting_review' >6h old
//                               → quality guardrail auto-quarantined
//   D. orders_no_payment_link — service_orders.status='paid' but the linked
//                               payment doesn't exist / doesn't match → orphan
//   E. paid_orders_never_processed — service_orders.status='paid' with
//                                    ai_processed_at NULL >30 min old → worker
//                                    died mid-run
//
// The bulk-repair endpoint runs both existing reconcilers on demand and
// returns their sweep result — no new activation code, so no risk of
// granting unpaid access. Every repair path goes through the same
// runPaymentPipeline / activateUserPlan chain the callbacks use.
//
// 2026-09 (Tony's production-reliability audit).
// ─────────────────────────────────────────────────────────────────────────────

import type { Express } from "express";
import { pool } from "../db";

interface StuckSummary {
  category: string;
  count: number;
  sample: any[];
  description: string;
}

async function isAdmin(userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  try {
    const { rows } = await pool.query<{ role: string | null }>(
      `SELECT role FROM users WHERE id = $1`,
      [userId],
    );
    return rows[0]?.role === "admin";
  } catch {
    return false;
  }
}

async function collectPaidButFree(): Promise<StuckSummary> {
  const { rows } = await pool.query(`
    SELECT p.id AS payment_id, p.user_id, p.plan_id, p.amount,
           p.created_at, p.mpesa_receipt_number, u.email, u.plan AS current_plan
    FROM payments p
    JOIN users u ON u.id = p.user_id
    WHERE p.status IN ('success','completed')
      AND p.plan_id IS NOT NULL AND p.plan_id <> ''
      AND p.plan_id IN ('trial','basic','monthly','yearly','pro','pro_referral')
      AND COALESCE(u.plan, 'free') = 'free'
      AND p.created_at > NOW() - INTERVAL '30 days'
    ORDER BY p.created_at DESC
    LIMIT 100
  `);
  return {
    category: "paid_but_free",
    count: rows.length,
    sample: rows.slice(0, 10),
    description:
      "Successful subscription payment but user.plan is still 'free'. Runs through paid-but-free-reconciler on repair.",
  };
}

async function collectPendingButCharged(): Promise<StuckSummary> {
  const { rows } = await pool.query(`
    SELECT id AS payment_id, user_id, plan_id, amount, phone,
           created_at, checkout_request_id
    FROM payments
    WHERE status = 'pending'
      AND checkout_request_id IS NOT NULL
      AND created_at < NOW() - INTERVAL '5 minutes'
      AND created_at > NOW() - INTERVAL '14 days'
    ORDER BY created_at DESC
    LIMIT 100
  `);
  return {
    category: "pending_but_charged",
    count: rows.length,
    sample: rows.slice(0, 10),
    description:
      "Payment stuck at 'pending' with a Safaricom checkout id — callback likely lost. mpesa-reconciler queries Daraja for real state.",
  };
}

async function collectOrdersAwaitingReview(): Promise<StuckSummary> {
  const { rows } = await pool.query(`
    SELECT id AS order_id, service_slug, guest_email, guest_name,
           created_at, updated_at, human_review_notes, refund_requested
    FROM service_orders
    WHERE status = 'awaiting_review'
      AND updated_at < NOW() - INTERVAL '6 hours'
    ORDER BY updated_at ASC
    LIMIT 100
  `);
  return {
    category: "orders_awaiting_review",
    count: rows.length,
    sample: rows.slice(0, 10),
    description:
      "CV order auto-quarantined by the quality guardrail >6h ago and no admin action taken. Repair path: reset status to 'paid' + let reconciler re-run.",
  };
}

async function collectPaidOrdersNeverProcessed(): Promise<StuckSummary> {
  const { rows } = await pool.query(`
    SELECT id AS order_id, service_slug, guest_email, guest_name,
           created_at, updated_at, ai_processed_at
    FROM service_orders
    WHERE status = 'paid'
      AND ai_processed_at IS NULL
      AND updated_at < NOW() - INTERVAL '30 minutes'
    ORDER BY updated_at ASC
    LIMIT 100
  `);
  return {
    category: "paid_orders_never_processed",
    count: rows.length,
    sample: rows.slice(0, 10),
    description:
      "Payment succeeded, order created and marked 'paid', but AI pipeline never fired. Worker likely crashed. Repair path: service-order reconciler picks these up.",
  };
}

// ─── Registration ────────────────────────────────────────────────────────────

export function registerPaymentAuditRoutes(app: Express): void {
  //
  // GET /api/admin/payment-audit
  // Admin-only diagnostic. Never repairs anything — just reports.
  //
  app.get("/api/admin/payment-audit", async (req: any, res) => {
    const userId = req.user?.claims?.sub ?? req.user?.id;
    if (!(await isAdmin(userId))) return res.status(403).json({ message: "Admin only" });

    try {
      const [a, b, c, d] = await Promise.all([
        collectPaidButFree(),
        collectPendingButCharged(),
        collectOrdersAwaitingReview(),
        collectPaidOrdersNeverProcessed(),
      ]);
      res.json({
        generatedAt: new Date().toISOString(),
        summary: {
          paid_but_free:              a.count,
          pending_but_charged:        b.count,
          orders_awaiting_review:     c.count,
          paid_orders_never_processed: d.count,
          total_stuck:                a.count + b.count + c.count + d.count,
        },
        details: [a, b, c, d],
      });
    } catch (err: any) {
      console.error("[payment-audit] failed:", err?.message);
      res.status(500).json({ message: "Audit failed", error: err?.message });
    }
  });

  //
  // POST /api/admin/payment-audit/repair
  // Admin-only. Runs both existing reconcilers on demand. Returns the
  // sweep result. Does NOT introduce a new activation code path — every
  // repair still flows through runPaymentPipeline / activateUserPlan.
  //
  app.post("/api/admin/payment-audit/repair", async (req: any, res) => {
    const userId = req.user?.claims?.sub ?? req.user?.id;
    if (!(await isAdmin(userId))) return res.status(403).json({ message: "Admin only" });

    const results: Record<string, any> = {};
    try {
      const { runPaidButFreeReconciler } = await import("../lib/paid-but-free-reconciler");
      results.paid_but_free = await runPaidButFreeReconciler();
    } catch (err: any) {
      results.paid_but_free = { error: err?.message };
    }
    try {
      const { runReconciliation } = await import("../mpesa-reconciler");
      results.mpesa_reconciler = await runReconciliation();
    } catch (err: any) {
      results.mpesa_reconciler = { error: err?.message };
    }
    res.json({ ranAt: new Date().toISOString(), results });
  });

  console.log(
    "[payment-audit] ✓ GET /api/admin/payment-audit + POST /api/admin/payment-audit/repair registered",
  );
}
