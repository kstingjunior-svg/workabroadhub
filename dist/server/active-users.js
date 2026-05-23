"use strict";
/**
 * Lightweight active-user tracker.
 *
 * Tracks unique sessions that have made an authenticated API request in the
 * last N minutes.  Purely in-memory — data is intentionally ephemeral and
 * resets on server restart.  No PII is stored.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackActiveUser = trackActiveUser;
exports.getActiveUserCounts = getActiveUserCounts;
const ACTIVE_WINDOW_MS = 5 * 60 * 1000; // consider a session "active" if seen in last 5 min
// Map<sessionKey, SessionActivity>
const sessionMap = new Map();
// Prune expired sessions every minute
setInterval(() => {
    const cutoff = Date.now() - ACTIVE_WINDOW_MS;
    for (const [key, val] of sessionMap) {
        if (val.lastSeen < cutoff)
            sessionMap.delete(key);
    }
}, 60000);
/**
 * Express middleware — call this after session middleware so req.session exists.
 * Tracks any request that carries a session cookie.
 */
function trackActiveUser(req, _res, next) {
    const raw = req.headers.cookie ?? "";
    const m = raw.match(/connect\.sid=s%3A([^;.%]+)/);
    if (m && m[1]) {
        const key = `sid:${m[1]}`;
        const isAuth = !!req.session?.userId || !!req.user;
        sessionMap.set(key, { lastSeen: Date.now(), isAuthenticated: isAuth });
    }
    next();
}
/** Returns counts of total and authenticated active sessions. */
function getActiveUserCounts() {
    const cutoff = Date.now() - ACTIVE_WINDOW_MS;
    let total = 0;
    let authenticated = 0;
    for (const val of sessionMap.values()) {
        if (val.lastSeen >= cutoff) {
            total++;
            if (val.isAuthenticated)
                authenticated++;
        }
    }
    return { total, authenticated };
}
