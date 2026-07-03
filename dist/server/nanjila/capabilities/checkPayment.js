"use strict";
/**
 * Nanjila — check_payment capability.
 *
 * Wraps the existing server/ai/tools/checkPayment.ts logic as a first-class
 * orchestrator capability. This is intentionally the seed capability — the
 * pattern established here is what every subsequent capability follows.
 *
 * Behaviour:
 *
 *   • With no paymentId, returns a summary of the user's recent payment
 *     activity (last 5 payments, current subscription state, any pending
 *     service orders).
 *   • With a paymentId, returns detail on that specific payment.
 *
 * The handler NEVER exposes another user's payment data. It scopes queries
 * to ctx.userId and returns "not_found" if the payment doesn't belong to
 * the invoking user.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkPaymentCapability = void 0;
const db_1 = require("../../db");
// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────
async function checkPaymentHandler(input, ctx) {
    const userId = ctx.userId;
    if (!userId) {
        return {
            ok: false,
            found: false,
            message: "I can only check payments once you're signed in.",
        };
    }
    // ── Specific-payment lookup ─────────────────────────────────────────────
    if (input.paymentId) {
        const { rows } = await db_1.pool.query(`SELECT id, user_id, status, amount, currency, method,
              COALESCE(service_name, service_id, plan_id, 'Service') AS service_label,
              paid_at, mpesa_receipt_number, mpesa_code, delivery_status,
              created_at
         FROM payments
        WHERE id = $1
          AND user_id = $2
        LIMIT 1`, [input.paymentId, userId]);
        if (rows.length === 0) {
            return {
                ok: true,
                found: false,
                message: "I couldn't find that payment on your account. Double-check the reference.",
            };
        }
        const p = rows[0];
        const receipt = p.mpesa_receipt_number ?? p.mpesa_code ?? null;
        return {
            ok: true,
            found: true,
            status: p.status,
            amount: Number(p.amount),
            currency: p.currency ?? "KES",
            method: p.method,
            serviceLabel: p.service_label,
            paidAt: p.paid_at ? new Date(p.paid_at).toISOString() : undefined,
            receipt: receipt ?? undefined,
            deliveryStatus: p.delivery_status ?? undefined,
            message: composeStatusSentence(p.status, p.service_label, receipt, p.delivery_status),
        };
    }
    // ── Recent-activity summary ─────────────────────────────────────────────
    const { rows } = await db_1.pool.query(`SELECT id, status, amount,
            COALESCE(service_name, service_id, plan_id, 'Service') AS service_label,
            paid_at, created_at
       FROM payments
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 5`, [userId]);
    return {
        ok: true,
        found: rows.length > 0,
        message: rows.length === 0
            ? "No payments on record for this account yet."
            : `Here's what I see on your most recent activity (${rows.length} record${rows.length > 1 ? "s" : ""}).`,
        recentActivity: rows.map((r) => ({
            id: r.id,
            status: r.status,
            amount: Number(r.amount),
            serviceLabel: r.service_label,
            paidAt: r.paid_at ? new Date(r.paid_at).toISOString() : null,
            createdAt: new Date(r.created_at).toISOString(),
        })),
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// Persona-safe summary sentence
// ─────────────────────────────────────────────────────────────────────────────
function composeStatusSentence(status, serviceLabel, receipt, deliveryStatus) {
    const label = serviceLabel ?? "your service";
    const rec = receipt ? ` (receipt ${receipt})` : "";
    const norm = String(status ?? "").toLowerCase();
    if (norm === "success" || norm === "completed" || norm === "paid") {
        if (deliveryStatus === "delivered")
            return `Your payment for ${label} succeeded${rec} and the service is fully delivered.`;
        if (deliveryStatus === "needs_review")
            return `Your payment for ${label} succeeded${rec}, but it's flagged for team review — I'll escalate.`;
        return `Your payment for ${label} succeeded${rec}. Delivery is ${deliveryStatus ?? "in progress"}.`;
    }
    if (norm === "failed") {
        return `That payment failed. No money was taken.`;
    }
    if (norm === "pending" || norm === "initiated" || norm === "processing") {
        return `That payment is still processing. Give it a few minutes — I can retry the check for you.`;
    }
    return `That payment's status is "${status ?? "unknown"}".`;
}
// ─────────────────────────────────────────────────────────────────────────────
// Capability definition — exported for the registry
// ─────────────────────────────────────────────────────────────────────────────
exports.checkPaymentCapability = {
    slug: "check_payment",
    label: "Check payment status",
    description: "Verify the current user's payment status. Pass a paymentId for a specific payment; leave it out for a summary of recent activity.",
    inputSchema: {
        type: "object",
        properties: {
            paymentId: { type: "string", description: "Optional payment id" },
        },
        required: [],
    },
    outputSchema: {
        type: "object",
        properties: {
            ok: { type: "boolean" },
            found: { type: "boolean" },
            status: { type: "string" },
            message: { type: "string" },
        },
    },
    requiresAuth: true,
    requiresPaid: false,
    requiresAdmin: false,
    handler: checkPaymentHandler,
};
