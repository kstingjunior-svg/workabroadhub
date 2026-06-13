"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// Tiered cache helper — Redis primary, in-process LRU fallback.
//
// Why this exists:
//   At 3,000 concurrent users our Postgres becomes the bottleneck long before
//   Node does. Most reads in this app are highly cacheable:
//
//     /api/services       — catalogue, changes maybe once a day
//     /api/visa-jobs      — 50 hand-curated jobs, changes weekly
//     /api/countries      — country list, changes once a month
//     /api/pricing/*      — current pricing, changes when admin updates
//     /api/user/plan      — per-user, changes only on subscription event
//
// A 60-second cache on the global lists alone removes 99%+ of read traffic
// to Postgres for those endpoints under load.
//
// How it works:
//   - If REDIS_URL is configured at boot, we use ioredis for shared cache
//     across all Render instances. Hit Redis once, every instance benefits.
//   - If Redis is unavailable, we degrade to an in-process LRU Map. Still a
//     big win — same instance serves repeat requests from RAM — but cache
//     doesn't survive restarts or share between instances.
//   - cache.wrap(key, ttlSeconds, loader) handles both the read and the
//     populate path, including single-flight (same key concurrent loads
//     don't hit the loader N times).
//
// Usage:
//   import { cache } from "./lib/cache";
//
//   const services = await cache.wrap("services:all", 60, async () => {
//     return await storage.getAllServices();
//   });
//
//   // Manual bust (e.g. after admin updates pricing):
//   await cache.del("pricing:current");
//
// Safety:
//   - On Redis error, we silently fall back to the loader (no thrown errors
//     to the caller). User sees a slower response, not a 500.
//   - Stale values are NEVER served. If TTL expires and loader throws, the
//     error propagates so the caller can decide.
//   - Single-flight is per-instance — under heavy load with 0 Redis, two
//     instances may both run the loader once at expiry. Acceptable.
// ─────────────────────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.cache = void 0;
const redis_1 = require("./redis");
const LRU_MAX = 1000;
const lru = new Map();
function lruGet(key) {
    const entry = lru.get(key);
    if (!entry)
        return undefined;
    if (entry.expiresAt < Date.now()) {
        lru.delete(key);
        return undefined;
    }
    // Touch — move to most-recently-used by re-inserting
    lru.delete(key);
    lru.set(key, entry);
    return entry.value;
}
function lruSet(key, value, ttlSeconds) {
    if (lru.size >= LRU_MAX) {
        const oldest = lru.keys().next().value;
        if (oldest !== undefined)
            lru.delete(oldest);
    }
    lru.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}
function lruDel(key) {
    lru.delete(key);
}
// ── Single-flight de-duplication ─────────────────────────────────────────────
const inflight = new Map();
// ── Public API ───────────────────────────────────────────────────────────────
exports.cache = {
    /**
     * Get a value by key. Returns undefined if missing or on Redis error.
     * Never throws.
     */
    async get(key) {
        // Try Redis first
        if ((0, redis_1.isRedisEnabled)()) {
            try {
                const raw = await redis_1.redisConnection.get(key);
                if (raw == null)
                    return undefined;
                return JSON.parse(raw);
            }
            catch (err) {
                // Fall through to LRU
            }
        }
        return lruGet(key);
    },
    /**
     * Set a value by key with TTL in seconds.
     * Writes to both Redis (best-effort) and LRU.
     */
    async set(key, value, ttlSeconds) {
        lruSet(key, value, ttlSeconds);
        if ((0, redis_1.isRedisEnabled)()) {
            try {
                const payload = JSON.stringify(value);
                await redis_1.redisConnection.setex(key, Math.max(1, ttlSeconds), payload);
            }
            catch (err) {
                // LRU already populated, swallow
            }
        }
    },
    /**
     * Delete a key (e.g. after a mutation invalidates the cache).
     */
    async del(key) {
        lruDel(key);
        if ((0, redis_1.isRedisEnabled)()) {
            try {
                await redis_1.redisConnection.del(key);
            }
            catch { }
        }
    },
    /**
     * Bulk delete by exact-match prefix. Use sparingly — KEYS is O(N) on Redis.
     * Acceptable for keys like "user-plan:userId-prefix:*" during admin tasks.
     */
    async delPattern(pattern) {
        let deleted = 0;
        for (const k of Array.from(lru.keys())) {
            if (k.startsWith(pattern.replace(/\*$/, ""))) {
                lru.delete(k);
                deleted++;
            }
        }
        if ((0, redis_1.isRedisEnabled)()) {
            try {
                const keys = await redis_1.redisConnection.keys(pattern);
                if (keys && keys.length) {
                    await redis_1.redisConnection.del(...keys);
                    deleted += keys.length;
                }
            }
            catch { }
        }
        return deleted;
    },
    /**
     * The big one. Get-or-compute pattern with single-flight de-duplication.
     *
     *   const data = await cache.wrap("services:all", 60, () => storage.list());
     *
     * If the value is cached and fresh, returns it.
     * If not, calls the loader, caches the result for ttlSeconds, returns.
     * Concurrent calls for the same key will share a single loader invocation.
     */
    async wrap(key, ttlSeconds, loader) {
        // 1. Fast path — cached?
        const cached = await this.get(key);
        if (cached !== undefined)
            return cached;
        // 2. Single-flight — already loading this key?
        const existing = inflight.get(key);
        if (existing)
            return existing;
        // 3. Cold path — load + cache + return
        const promise = (async () => {
            try {
                const fresh = await loader();
                // Never cache undefined/null (would mask real misses on next call)
                if (fresh !== undefined && fresh !== null) {
                    await this.set(key, fresh, ttlSeconds);
                }
                return fresh;
            }
            finally {
                inflight.delete(key);
            }
        })();
        inflight.set(key, promise);
        return promise;
    },
    /**
     * Cache info — useful for the /api/health endpoint.
     */
    stats() {
        return {
            redisEnabled: (0, redis_1.isRedisEnabled)(),
            lruSize: lru.size,
            inflightSize: inflight.size,
        };
    },
};
exports.default = exports.cache;
