/**
 * PayPal health watch (2026-11).
 *
 * Investigation on 17 Nov 2026: 113 PayPal orders since July, 0 paid. Every
 * order was created fine in live mode and then stayed "CREATED" (the buyer
 * never approved it), so each one quietly became "Failed" after the recovery
 * poller gave up. Nobody was told. This watches for that pattern and raises
 * one admin notification per day while it continues.
 */
import { pool } from "../db";

export interface PayPalHealth {
  status: "ok" | "no_approvals" | "quiet";
  orders72h: number;
  paid72h: number;
  ordersAllTime: number;
  paidAllTime: number;
  lastPaidAt: string | null;
  message: string;
}

const PAID = `status IN ('success','completed','paid')`;

/** PURE decision (unit-tested). */
export function judge(orders72h: number, paid72h: number, ordersAll: number, paidAll: number, lastPaidAt: string | null): PayPalHealth {
  const base = { orders72h, paid72h, ordersAllTime: ordersAll, paidAllTime: paidAll, lastPaidAt };
  if (orders72h >= 3 && paid72h === 0) {
    return {
      ...base, status: "no_approvals",
      message: paidAll === 0
        ? `PayPal has never completed a payment: ${ordersAll} orders created, 0 paid. ${orders72h} in the last 3 days, all left unapproved at PayPal. Check the PayPal business account for limitations and test a real payment.`
        : `${orders72h} PayPal orders in the last 3 days and none approved. Last PayPal payment: ${lastPaidAt?.slice(0, 10)}. Check the PayPal account and test a real payment.`,
    };
  }
  if (orders72h === 0) return { ...base, status: "quiet", message: "No PayPal orders in the last 3 days." };
  return { ...base, status: "ok", message: `${paid72h} of ${orders72h} PayPal orders paid in the last 3 days.` };
}

export async function paypalHealth(): Promise<PayPalHealth> {
  const { rows: [r] } = await pool.query(
    `SELECT count(*) FILTER (WHERE created_at > now() - interval '72 hours')::int o72,
            count(*) FILTER (WHERE created_at > now() - interval '72 hours' AND ${PAID})::int p72,
            count(*)::int oall, count(*) FILTER (WHERE ${PAID})::int pall,
            max(created_at) FILTER (WHERE ${PAID}) last_paid
       FROM payments WHERE method = 'paypal'`);
  return judge(r?.o72 ?? 0, r?.p72 ?? 0, r?.oall ?? 0, r?.pall ?? 0, r?.last_paid ? new Date(r.last_paid).toISOString() : null);
}

export async function checkPayPalHealthAndNotify(): Promise<void> {
  try {
    const h = await paypalHealth();
    if (h.status !== "no_approvals") return;
    const { notifyFinanceAdmins } = await import("./finance-notify");
    await notifyFinanceAdmins({
      kind: "review", title: "PayPal payments are not completing", body: h.message,
      dedupeKey: `paypal-health-${new Date().toISOString().slice(0, 10)}`,
    });
    console.warn(`[PayPalHealth] ${h.message}`);
  } catch (err: any) {
    console.warn("[PayPalHealth] check failed:", err?.message);
  }
}
