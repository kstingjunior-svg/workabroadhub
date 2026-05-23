"use strict";
/**
 * PRODUCTION HARDENING: In-memory caching layer
 * Reduces database load for read-heavy data
 *
 * For 10,000+ users, this provides:
 * - Sub-millisecond response times for cached data
 * - Reduced database connection usage
 * - Protection against traffic spikes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CACHE_TTL = exports.CACHE_KEYS = exports.cache = void 0;
exports.withCache = withCache;
class InMemoryCache {
    constructor(maxSize = 2000) {
        this.cache = new Map();
        this.stats = { hits: 0, misses: 0, size: 0, memoryUsage: 0, hitRate: "0%" };
        this.maxSize = maxSize;
        this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
    }
    get(key) {
        const entry = this.cache.get(key);
        if (!entry) {
            this.stats.misses++;
            return null;
        }
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            this.stats.misses++;
            return null;
        }
        entry.hits++;
        entry.lastAccessedAt = Date.now();
        this.stats.hits++;
        return entry.value;
    }
    set(key, value, ttlMs = 300000) {
        if (this.cache.size >= this.maxSize) {
            this.evictLRU();
        }
        this.cache.set(key, {
            value,
            expiresAt: Date.now() + ttlMs,
            hits: 0,
            lastAccessedAt: Date.now(),
        });
        this.stats.size = this.cache.size;
    }
    invalidate(pattern) {
        let count = 0;
        for (const key of this.cache.keys()) {
            if (key.includes(pattern)) {
                this.cache.delete(key);
                count++;
            }
        }
        this.stats.size = this.cache.size;
        return count;
    }
    invalidateAll() {
        this.cache.clear();
        this.stats.size = 0;
    }
    evictLRU() {
        let lruKey = null;
        let minLastAccessed = Infinity;
        for (const [key, entry] of this.cache.entries()) {
            if (entry.lastAccessedAt < minLastAccessed) {
                minLastAccessed = entry.lastAccessedAt;
                lruKey = key;
            }
        }
        if (lruKey) {
            this.cache.delete(lruKey);
        }
    }
    cleanup() {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expiresAt) {
                this.cache.delete(key);
            }
        }
        this.stats.size = this.cache.size;
    }
    getStats() {
        const total = this.stats.hits + this.stats.misses;
        return {
            ...this.stats,
            size: this.cache.size,
            memoryUsage: process.memoryUsage().heapUsed,
            hitRate: total > 0 ? `${Math.round((this.stats.hits / total) * 100)}%` : "0%",
        };
    }
    destroy() {
        clearInterval(this.cleanupInterval);
        this.cache.clear();
    }
}
exports.cache = new InMemoryCache(2000);
exports.CACHE_KEYS = {
    COUNTRIES: 'countries:all',
    COUNTRIES_WITH_DETAILS: 'countries:details',
    COUNTRY: (code) => `country:${code}`,
    SERVICES: 'services:all',
    NEA_AGENCIES: (search, status, page) => `nea-agencies:${search}:${status}:${page}`,
    NEA_AGENCIES_BLACKLIST: 'nea-agencies:blacklist-ids',
    AGENCIES: (search, status) => `agencies:${search}:${status}`,
    AGENCY: (id) => `agency:${id}`,
    AGENCY_JOBS: (agencyId) => `agency-jobs:${agencyId}`,
    STUDENT_VISAS: 'student_visas:all',
    APPLICATION_PACKS: 'application_packs:all',
    USER_SUBSCRIPTION: (userId) => `subscription:${userId}`,
    COUNTRY_INSIGHTS: (code) => `insights:${code}`,
    ADVISORS: 'advisors:all',
    SUCCESS_STORIES: 'success_stories:all',
    VIDEO_TESTIMONIALS: 'video_testimonials:all',
    JOB_COUNTS: 'job-counts:all',
    JOB_COUNT: (code) => `job-counts:${code}`,
    GOVERNMENT_STATUS: 'government:status',
    VISA_SPONSORSHIP_JOBS: (page, country) => `visa-jobs:${page}:${country}`,
    LICENSE_FEES: 'license-renewal:fees',
};
exports.CACHE_TTL = {
    COUNTRIES: 10 * 60 * 1000, // 10 min — rarely changes
    SERVICES: 30 * 1000, // 30 sec — price accuracy critical
    NEA_AGENCIES: 5 * 60 * 1000, // 5 min — public search
    NEA_AGENCIES_BLACKLIST: 2 * 60 * 1000, // 2 min — security-sensitive
    AGENCIES: 2 * 60 * 1000, // 2 min — changes more often
    USER_DATA: 60 * 1000, // 1 min — user-specific
    STATIC_DATA: 15 * 60 * 1000, // 15 min — near-static content
    JOB_COUNTS: 5 * 60 * 1000, // 5 min
    GOVERNMENT_STATUS: 30 * 1000, // 30 sec — downtime-sensitive
    VISA_JOBS: 10 * 60 * 1000, // 10 min
    LICENSE_FEES: 30 * 60 * 1000, // 30 min — rarely changes
};
async function withCache(key, ttlMs, fetchFn) {
    const cached = exports.cache.get(key);
    if (cached !== null) {
        return cached;
    }
    const value = await fetchFn();
    exports.cache.set(key, value, ttlMs);
    return value;
}
