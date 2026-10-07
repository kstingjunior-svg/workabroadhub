/**
 * Email suppression list.
 *
 * 2026-10 (Tony — "the bounced-emails tab shows 15 bounces, mostly repeat
 * sends to the same dead addresses"). Every repeat-send to a known-bad
 * address hurts our sender reputation with Gmail. Fix: maintain a suppression
 * list; refuse to send to any address on it; populate it automatically from
 * provider bounce webhooks (and seeded manually from the current bounce log).
 *
 * Table: `email_suppressions` (see migration seeded via Supabase).
 *
 * Public API:
 *   - isEmailSuppressed(email): fast lookup, in-memory cached 60s.
 *   - addSuppression(email, { bounceType, source, details }): upsert.
 *   - removeSuppression(email): manual admin unblock.
 *   - listRecentSuppressions(limit): for admin UI.
 */

import { pool } from "../db";

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { suppressed: boolean; at: number }>();

function cacheGet(email: string): boolean | null {
  const row = cache.get(email);
  if (!row) return null;
  if (Date.now() - row.at > CACHE_TTL_MS) {
    cache.delete(email);
    return null;
  }
  return row.suppressed;
}

function cacheSet(email: string, suppressed: boolean): void {
  cache.set(email, { suppressed, at: Date.now() });
  // Bound cache size (LRU-ish — just evict oldest when big)
  if (cache.size > 2000) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
}

export async function isEmailSuppressed(email: string): Promise<boolean> {
  const key = String(email || "").trim().toLowerCase();
  if (!key) return false;
  const cached = cacheGet(key);
  if (cached !== null) return cached;
  try {
    const { rowCount } = await pool.query(
      `SELECT 1 FROM email_suppressions WHERE email_lower = $1 LIMIT 1`,
      [key],
    );
    const suppressed = (rowCount ?? 0) > 0;
    cacheSet(key, suppressed);
    return suppressed;
  } catch (err: any) {
    // Fail OPEN — if the suppression table is unavailable, don't block
    // all email. We'd rather send a bounce than lose every real code.
    console.warn("[email-suppressions] lookup failed:", err?.message);
    return false;
  }
}

export async function addSuppression(
  email: string,
  opts: { bounceType?: string; source?: string; details?: string; reason?: string } = {},
): Promise<void> {
  const key = String(email || "").trim().toLowerCase();
  if (!key) return;
  try {
    await pool.query(
      `INSERT INTO email_suppressions
         (email_lower, reason, bounce_type, source, details)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email_lower) DO UPDATE
         SET bounce_count   = email_suppressions.bounce_count + 1,
             last_bounce_at = NOW(),
             bounce_type    = COALESCE(EXCLUDED.bounce_type, email_suppressions.bounce_type),
             details        = COALESCE(EXCLUDED.details, email_suppressions.details)`,
      [
        key,
        opts.reason || "hard_bounce",
        opts.bounceType || null,
        opts.source || "webhook",
        opts.details || null,
      ],
    );
    // Invalidate cache so the gate picks it up immediately
    cacheSet(key, true);
    console.log(`[email-suppressions] ✓ suppressed ${key} (${opts.source || "webhook"})`);
  } catch (err: any) {
    console.warn(`[email-suppressions] insert failed for ${key}:`, err?.message);
  }
}

export async function removeSuppression(email: string): Promise<boolean> {
  const key = String(email || "").trim().toLowerCase();
  if (!key) return false;
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM email_suppressions WHERE email_lower = $1`,
      [key],
    );
    cache.delete(key);
    return (rowCount ?? 0) > 0;
  } catch (err: any) {
    console.warn(`[email-suppressions] delete failed for ${key}:`, err?.message);
    return false;
  }
}

export async function listRecentSuppressions(limit = 100): Promise<Array<{
  email: string;
  reason: string;
  bounceType: string | null;
  source: string;
  details: string | null;
  createdAt: string;
  lastBounceAt: string;
  bounceCount: number;
}>> {
  try {
    const { rows } = await pool.query(
      `SELECT email_lower, reason, bounce_type, source, details,
              created_at, last_bounce_at, bounce_count
         FROM email_suppressions
        ORDER BY last_bounce_at DESC
        LIMIT $1`,
      [limit],
    );
    return rows.map((r: any) => ({
      email: r.email_lower,
      reason: r.reason,
      bounceType: r.bounce_type,
      source: r.source,
      details: r.details,
      createdAt: r.created_at?.toISOString?.() ?? r.created_at,
      lastBounceAt: r.last_bounce_at?.toISOString?.() ?? r.last_bounce_at,
      bounceCount: r.bounce_count,
    }));
  } catch (err: any) {
    console.warn("[email-suppressions] list failed:", err?.message);
    return [];
  }
}
