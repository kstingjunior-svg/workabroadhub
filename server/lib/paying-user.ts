/**
 * 2026-10 (Tony: "do it" — let paying customers in).
 *
 * 720 customers who paid (May–Aug, before email verification existed) were
 * never email-verified, so the verification wall stopped them at sign-in
 * and on every API call — none had signed in for 30+ days. Anyone with a
 * successful payment has proven they're a real customer, so they are now
 * EXEMPT from the hard email-verification wall (they still see the soft
 * "confirm your email" banner, and plan/entitlement checks still apply).
 */
import { pool } from "../db";

const TTL_MS = 60_000;
const cache = new Map<string, { paid: boolean; at: number }>();

export async function hasSuccessfulPayment(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.paid;
  try {
    const { rowCount } = await pool.query(
      `SELECT 1 FROM payments WHERE user_id = $1 AND status IN ('success','completed') LIMIT 1`,
      [userId],
    );
    const paid = (rowCount ?? 0) > 0;
    cache.set(userId, { paid, at: Date.now() });
    if (cache.size > 5000) {
      const k = cache.keys().next().value;
      if (k) cache.delete(k);
    }
    return paid;
  } catch {
    return false; // fail closed → normal verification rules apply
  }
}
