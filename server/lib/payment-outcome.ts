/**
 * Plain-English payment outcomes for admin screens (2026-11).
 *
 * Tony: "investigate why do we have so many fails". Most red "Failed" rows
 * were customers who walked away, cancelled, or one person retrying a phone
 * that M-Pesa could not reach — not system faults. This turns the raw
 * status + Safaricom / PayPal reason into a label that says what happened
 * and whose side it was on.
 */
import { pool } from "../db";

export type OutcomeKind = "paid" | "pending" | "customer" | "phone" | "system" | "abandoned" | "other";

export interface Outcome { kind: OutcomeKind; label: string }

const PAID = new Set(["success", "completed", "paid"]);
const PENDING = new Set(["pending", "processing", "awaiting_payment", "awaiting_paybill", "retry_available"]);

export function classifyOutcome(status: string | null | undefined, failReason: string | null | undefined, method?: string | null): Outcome {
  const st = String(status ?? "").toLowerCase();
  const r = String(failReason ?? "").toLowerCase();
  if (PAID.has(st)) return { kind: "paid", label: "Paid" };
  if (st === "refunded") return { kind: "other", label: "Refunded" };
  if (st === "awaiting_paybill") return { kind: "pending", label: "Waiting for Paybill" };
  if (r.includes("paypal_recovery_exhausted") || (method === "paypal" && st === "failed" && !r)) return { kind: "abandoned", label: "PayPal not approved by buyer" };
  if (r.includes("instrument_declined")) return { kind: "customer", label: "PayPal card declined" };
  if (r.includes("cancelled by user")) return { kind: "customer", label: "Cancelled by customer" };
  if (r.includes("insufficient")) return { kind: "customer", label: "Not enough M-Pesa balance" };
  if (r.includes("no response from user")) return { kind: "customer", label: "PIN not entered" };
  if (r.includes("initiator information is invalid")) return { kind: "customer", label: "Wrong PIN" };
  if (r.includes("cannot be reached") || r.includes("ds timeout")) return { kind: "phone", label: "Phone unreachable" };
  if (r.includes("no callback") || r.includes("timed out")) return { kind: "phone", label: "No answer from M-Pesa" };
  if (r.includes("error occurred while sending push") || r.includes("stk_rejected") || r.includes("system")) return { kind: "system", label: "Safaricom error" };
  if (PENDING.has(st)) return { kind: "pending", label: st === "retry_available" ? "Can retry" : "In progress" };
  if (st === "failed") return { kind: "other", label: r ? "Failed" : "Failed (no reason given)" };
  return { kind: "other", label: st || "Unknown" };
}

/**
 * Customer-level view: people (phone for M-Pesa, account or payment for
 * PayPal) who tried to pay vs people who paid, plus why the rest didn't.
 */
export async function paymentFunnel(days = 7) {
  const { rows } = await pool.query(
    `SELECT method, status, fail_reason,
            CASE WHEN method = 'mpesa' AND coalesce(phone,'') <> '' THEN 'ph:' || right(regexp_replace(phone,'\\D','','g'), 9)
                 WHEN user_id IS NOT NULL AND user_id NOT LIKE 'guest%' THEN 'u:' || user_id
                 ELSE 'p:' || id::text END AS who
       FROM payments WHERE created_at > now() - make_interval(days => $1)`, [days]);
  const byMethod: Record<string, { attempts: number; people: Set<string>; paid: Set<string>; reasons: Record<string, number> }> = {};
  for (const r of rows) {
    const m = (byMethod[r.method] ??= { attempts: 0, people: new Set(), paid: new Set(), reasons: {} });
    m.attempts++;
    m.people.add(r.who);
    const o = classifyOutcome(r.status, r.fail_reason, r.method);
    if (o.kind === "paid") m.paid.add(r.who);
    else m.reasons[o.label] = (m.reasons[o.label] ?? 0) + 1;
  }
  return {
    days,
    methods: Object.entries(byMethod).map(([method, m]) => ({
      method, attempts: m.attempts, people: m.people.size, peoplePaid: m.paid.size,
      reasons: Object.entries(m.reasons).map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n),
    })),
  };
}
