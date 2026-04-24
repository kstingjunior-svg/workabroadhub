/**
 * PRODUCTION HARDENING: In-memory caching layer
 * Reduces database load for read-heavy data
 * 
 * For 10,000+ users, this provides:
 * - Sub-millisecond response times for cached data
 * - Reduced database connection usage
 * - Protection against traffic spikes
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  hits: number;
  lastAccessedAt: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  memoryUsage: number;
  hitRate: string;
}

class InMemoryCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private stats: CacheStats = { hits: 0, misses: 0, size: 0, memoryUsage: 0, hitRate: "0%" };
  private cleanupInterval: NodeJS.Timeout;
  private maxSize: number;
  
  constructor(maxSize = 2000) {
    this.maxSize = maxSize;
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  get<T>(key: string): T | null {
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
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number = 300000): void {
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

  invalidate(pattern: string): number {
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

  invalidateAll(): void {
    this.cache.clear();
    this.stats.size = 0;
  }

  private evictLRU(): void {
    let lruKey: string | null = null;
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

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
    this.stats.size = this.cache.size;
  }

  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      size: this.cache.size,
      memoryUsage: process.memoryUsage().heapUsed,
      hitRate: total > 0 ? `${Math.round((this.stats.hits / total) * 100)}%` : "0%",
    };
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.cache.clear();
  }
}

export const cache = new InMemoryCache(2000);

export const CACHE_KEYS = {
  COUNTRIES: 'countries:all',
  COUNTRIES_WITH_DETAILS: 'countries:details',
  COUNTRY: (code: string) => `country:${code}`,
  SERVICES: 'services:all',
  NEA_AGENCIES: (search: string, status: string, page: number) => `nea-agencies:${search}:${status}:${page}`,
  NEA_AGENCIES_BLACKLIST: 'nea-agencies:blacklist-ids',
  AGENCIES: (search: string, status: string) => `agencies:${search}:${status}`,
  AGENCY: (id: string) => `agency:${id}`,
  AGENCY_JOBS: (agencyId: string) => `agency-jobs:${agencyId}`,
  STUDENT_VISAS: 'student_visas:all',
  APPLICATION_PACKS: 'application_packs:all',
  USER_SUBSCRIPTION: (userId: string) => `subscription:${userId}`,
  COUNTRY_INSIGHTS: (code: string) => `insights:${code}`,
  ADVISORS: 'advisors:all',
  SUCCESS_STORIES: 'success_stories:all',
  VIDEO_TESTIMONIALS: 'video_testimonials:all',
  JOB_COUNTS: 'job-counts:all',
  JOB_COUNT: (code: string) => `job-counts:${code}`,
  GOVERNMENT_STATUS: 'government:status',
  VISA_SPONSORSHIP_JOBS: (page: number, country: string) => `visa-jobs:${page}:${country}`,
  LICENSE_FEES: 'license-renewal:fees',
} as const;

export const CACHE_TTL = {
  COUNTRIES: 10 * 60 * 1000,         // 10 min — rarely changes
  SERVICES: 30 * 1000,                 // 30 sec — price accuracy critical
  NEA_AGENCIES: 5 * 60 * 1000,        // 5 min — public search
  NEA_AGENCIES_BLACKLIST: 2 * 60 * 1000, // 2 min — security-sensitive
  AGENCIES: 2 * 60 * 1000,            // 2 min — changes more often
  USER_DATA: 60 * 1000,               // 1 min — user-specific
  STATIC_DATA: 15 * 60 * 1000,        // 15 min — near-static content
  JOB_COUNTS: 5 * 60 * 1000,          // 5 min
  GOVERNMENT_STATUS: 30 * 1000,       // 30 sec — downtime-sensitive
  VISA_JOBS: 10 * 60 * 1000,          // 10 min
  LICENSE_FEES: 30 * 60 * 1000,       // 30 min — rarely changes
} as const;

export async function withCache<T>(
  key: string,
  ttlMs: number,
  fetchFn: () => Promise<T>
): Promise<T> {
  const cached = cache.get<T>(key);
  if (cached !== null) {
    return cached;
  }
  
  const value = await fetchFn();
  cache.set(key, value, ttlMs);
  return value;
}
