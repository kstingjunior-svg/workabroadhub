"use strict";
/**
 * Singleton in-memory cache for /api/auth/user responses.
 *
 * Extracted to its own module so any code path that updates a user record
 * (plan activation, profile edit, role change) can invalidate the cache
 * without holding a reference to the Express `app`.
 *
 * 2026-06: created after paying KES 99 trial users were still seeing the
 * "free" dashboard for up to 30 seconds (server cache) + 15 seconds (browser
 * cache) after their plan was activated. The payment pipeline now imports
 * `invalidateAuthUserCache` directly so the unlock is instant.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCachedAuthUser = getCachedAuthUser;
exports.setCachedAuthUser = setCachedAuthUser;
exports.invalidateAuthUserCache = invalidateAuthUserCache;
exports.clearAllAuthUserCache = clearAllAuthUserCache;
const TTL_MS = 30000;
const cache = new Map();
function getCachedAuthUser(userId) {
    const e = cache.get(userId);
    if (!e)
        return null;
    if (e.expiresAt < Date.now()) {
        cache.delete(userId);
        return null;
    }
    return e.user;
}
function setCachedAuthUser(userId, user) {
    cache.set(userId, { user, expiresAt: Date.now() + TTL_MS });
}
function invalidateAuthUserCache(userId) {
    cache.delete(userId);
}
function clearAllAuthUserCache() {
    cache.clear();
}
