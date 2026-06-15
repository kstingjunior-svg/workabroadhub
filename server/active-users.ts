/**
 * Lightweight active-user tracker.
 *
 * Tracks unique sessions that have made an authenticated API request in the
 * last N minutes.  Purely in-memory — data is intentionally ephemeral and
 * resets on server restart.  No PII is stored.
 */

import { Request, Response, NextFunction } from "express";

// 2026-06 STABILITY FIX: 10 minute window (was 5 min). On Kenyan 3G mobile
// networks, users routinely have 1-3 min connectivity gaps. A 5-min window
// dropped them from the count in bursts (180 → 25 cliffs in the admin
// dashboard). 10 min is forgiving enough to ride out a typical mobile blip
// while still expiring genuinely-gone users in a reasonable time.
const ACTIVE_WINDOW_MS = 10 * 60 * 1000;

interface SessionActivity {
  lastSeen: number;
  isAuthenticated: boolean;
}

// Map<sessionKey, SessionActivity>
const sessionMap = new Map<string, SessionActivity>();

// Prune expired sessions every 30 seconds. More frequent pruning + a wider
// window means the count smoothly decays as users actually leave, rather
// than dropping in jumpy 60-sec batches.
setInterval(() => {
  const cutoff = Date.now() - ACTIVE_WINDOW_MS;
  let pruned = 0;
  for (const [key, val] of sessionMap) {
    if (val.lastSeen < cutoff) {
      sessionMap.delete(key);
      pruned++;
    }
  }
  // If we ever prune >50 sessions in one pass, log it — that pattern indicates
  // something pathological (mass network outage, deploy event, etc.) that
  // would cause the "sudden drop" the founder reported.
  if (pruned > 50) {
    console.warn(`[active-users] mass prune: ${pruned} sessions expired in one pass. remaining=${sessionMap.size}`);
  }
}, 30_000);

/**
 * Express middleware — call this after session middleware so req.session exists.
 * Tracks any request that carries a session cookie.
 */
export function trackActiveUser(req: Request, _res: Response, next: NextFunction): void {
  const raw = req.headers.cookie ?? "";
  const m = raw.match(/connect\.sid=s%3A([^;.%]+)/);
  if (m && m[1]) {
    const key = `sid:${m[1]}`;
    const isAuth = !!(req as any).session?.userId || !!(req as any).user;
    sessionMap.set(key, { lastSeen: Date.now(), isAuthenticated: isAuth });
  }
  next();
}

/** Returns counts of total and authenticated active sessions. */
export function getActiveUserCounts(): { total: number; authenticated: number } {
  const cutoff = Date.now() - ACTIVE_WINDOW_MS;
  let total = 0;
  let authenticated = 0;
  for (const val of sessionMap.values()) {
    if (val.lastSeen >= cutoff) {
      total++;
      if (val.isAuthenticated) authenticated++;
    }
  }
  return { total, authenticated };
}
