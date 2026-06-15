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

const TTL_MS = 30_000;

interface Entry {
  user: any;
  expiresAt: number;
}

const cache = new Map<string, Entry>();

export function getCachedAuthUser(userId: string): any | null {
  const e = cache.get(userId);
  if (!e) return null;
  if (e.expiresAt < Date.now()) {
    cache.delete(userId);
    return null;
  }
  return e.user;
}

export function setCachedAuthUser(userId: string, user: any): void {
  cache.set(userId, { user, expiresAt: Date.now() + TTL_MS });
}

export function invalidateAuthUserCache(userId: string): void {
  cache.delete(userId);
}

export function clearAllAuthUserCache(): void {
  cache.clear();
}
