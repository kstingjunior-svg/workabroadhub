/**
 * M-Pesa retry guard (2026-11, Tony: "why do we have so many fails").
 *
 * On 15 Nov one customer pressed Pay 20 times for a KES 100 check while
 * Safaricom kept answering "DS timeout — user cannot be reached" (phone off,
 * no signal, an old SIM card or an iPhone eSIM that doesn't show prompts). Each tap created another
 * failed row and nothing told them what to do differently.
 *
 * After 3 "prompt never reached / never answered" failures on the same number
 * within 30 minutes we stop sending more prompts for 15 minutes and explain
 * what to fix. Cancels, wrong PIN and low balance are NOT counted — those are
 * the customer's choice and they can retry immediately.
 */
import { pool } from "../db";

export const UNREACHABLE_PATTERNS = ["%cannot be reached%", "%ds timeout%", "%no response from user%", "%no callback received%"];
export const UNREACHABLE_LIMIT = 3;
const WINDOW_MIN = 30;
const COOLDOWN_MIN = 15;

export const UNREACHABLE_ADVICE =
  "We tried to send the M-Pesa prompt to this number several times but it didn't reach the phone. Before trying again: " +
  "1) make sure the phone is switched on and has Safaricom signal (outside Kenya, turn on roaming for the Safaricom line); " +
  "2) restart the phone — very old SIM cards and some iPhone eSIMs don't show M-Pesa prompts (Safaricom can replace an old SIM); " +
  "3) or use a different Safaricom number. Need help? WhatsApp +254 111 467 601.";

export interface GuardResult { blocked: boolean; recentFailures: number; retryAfterMin: number; message?: string }

export function last9(phone: string | null | undefined): string {
  const d = String(phone ?? "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : d;
}

/** PURE decision used by checkUnreachable (unit-tested). */
export function decide(failureTimes: Date[], now: Date): GuardResult {
  const inWindow = failureTimes.filter((t) => now.getTime() - t.getTime() <= WINDOW_MIN * 60_000);
  if (inWindow.length < UNREACHABLE_LIMIT) return { blocked: false, recentFailures: inWindow.length, retryAfterMin: 0 };
  const latest = Math.max(...inWindow.map((t) => t.getTime()));
  const waitMs = latest + COOLDOWN_MIN * 60_000 - now.getTime();
  if (waitMs <= 0) return { blocked: false, recentFailures: inWindow.length, retryAfterMin: 0 };
  const retryAfterMin = Math.max(1, Math.ceil(waitMs / 60_000));
  return { blocked: true, recentFailures: inWindow.length, retryAfterMin, message: `${UNREACHABLE_ADVICE} You can try this number again in about ${retryAfterMin} min.` };
}

export async function checkUnreachable(phone: string | null | undefined): Promise<GuardResult> {
  const p = last9(phone);
  if (p.length < 9) return { blocked: false, recentFailures: 0, retryAfterMin: 0 };
  try {
    const { rows } = await pool.query(
      `SELECT coalesce(updated_at, created_at) AS at FROM payments
        WHERE method = 'mpesa' AND created_at > now() - make_interval(mins => $2)
          AND right(regexp_replace(coalesce(phone,''),'\\D','','g'), 9) = $1
          AND status IN ('failed','retry_available')
          AND lower(coalesce(fail_reason,'')) LIKE ANY($3::text[])`,
      [p, WINDOW_MIN, UNREACHABLE_PATTERNS]);
    return decide(rows.map((r: any) => new Date(r.at)), new Date());
  } catch (err: any) {
    console.warn("[mpesa-retry-guard] check failed (allowing payment):", err?.message);
    return { blocked: false, recentFailures: 0, retryAfterMin: 0 };
  }
}
