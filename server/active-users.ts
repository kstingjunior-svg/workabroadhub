/**
 * Lightweight active-user tracker.
 *
 * Tracks unique sessions that have made an authenticated API request in the
 * last N minutes.  Purely in-memory — data is intentionally ephemeral and
 * resets on server restart.  No PII is stored.
 */

import { Request, Response, NextFunction } from "express";

const ACTIVE_WINDOW_MS = 5 * 60 * 1000; // consider a session "active" if seen in last 5 min

interface SessionActivity {
  lastSeen: number;
  isAuthenticated: boolean;
}

// Map<sessionKey, SessionActivity>
const sessionMap = new Map<string, SessionActivity>();

// Prune expired sessions every minute
setInterval(() => {
  const cutoff = Date.now() - ACTIVE_WINDOW_MS;
  for (const [key, val] of sessionMap) {
    if (val.lastSeen < cutoff) sessionMap.delete(key);
  }
}, 60_000);

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
