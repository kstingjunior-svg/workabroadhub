/**
 * Location Detector Middleware
 *
 * Detects user country from IP address and attaches it to req.userCountry.
 * Uses ipapi.co (free, up to 30,000 req/month, no API key needed).
 * Results are cached in-memory for 10 minutes per IP to avoid rate limits.
 */

import type { Request, Response, NextFunction } from "express";

// ─── In-Memory Cache ──────────────────────────────────────────────────────────

interface CacheEntry {
  country: string;
  countryName: string;
  continent: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function evictExpired() {
  const now = Date.now();
  for (const [ip, entry] of cache.entries()) {
    if (entry.expiresAt < now) cache.delete(ip);
  }
}
setInterval(evictExpired, 5 * 60 * 1000);

// ─── IP Extraction ────────────────────────────────────────────────────────────

function extractIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"] as string | undefined;
  if (forwarded) {
    // x-forwarded-for can be a comma-separated list; take the first real IP
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress || req.ip || "unknown";
}

const LOCAL_IPS = new Set(["::1", "127.0.0.1", "::ffff:127.0.0.1", "unknown"]);

// ─── Geolocation Lookup ───────────────────────────────────────────────────────

async function lookupCountry(ip: string): Promise<CacheEntry> {
  const now = Date.now();

  // Return cached entry
  const cached = cache.get(ip);
  if (cached && cached.expiresAt > now) return cached;

  // Local / loopback IPs — treat as Kenya (dev environment)
  if (LOCAL_IPS.has(ip)) {
    const entry: CacheEntry = {
      country: "KE",
      countryName: "Kenya",
      continent: "Africa",
      expiresAt: now + CACHE_TTL_MS,
    };
    cache.set(ip, entry);
    return entry;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: controller.signal,
      headers: { "Accept": "application/json", "User-Agent": "WorkAbroadHub/1.0" },
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`ipapi.co returned ${res.status}`);
    const data = await res.json() as {
      country_code?: string;
      country_name?: string;
      continent_code?: string;
      error?: boolean;
    };

    if (data.error) throw new Error("ipapi.co returned error");

    const entry: CacheEntry = {
      country: (data.country_code || "XX").toUpperCase(),
      countryName: data.country_name || "Unknown",
      continent: data.continent_code || "XX",
      expiresAt: now + CACHE_TTL_MS,
    };
    cache.set(ip, entry);
    return entry;
  } catch {
    // Fail gracefully — default to "unknown" so the fallback payment method (card) applies
    const entry: CacheEntry = {
      country: "XX",
      countryName: "Unknown",
      continent: "XX",
      expiresAt: now + 60_000, // Short TTL for failures
    };
    cache.set(ip, entry);
    return entry;
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      userCountry?: string;
      userCountryName?: string;
      userContinent?: string;
      userIp?: string;
    }
  }
}

export async function locationDetector(req: Request, _res: Response, next: NextFunction) {
  const ip = extractIp(req);
  req.userIp = ip;

  try {
    const geo = await lookupCountry(ip);
    req.userCountry = geo.country;
    req.userCountryName = geo.countryName;
    req.userContinent = geo.continent;
  } catch {
    req.userCountry = "XX";
    req.userCountryName = "Unknown";
    req.userContinent = "XX";
  }

  next();
}

// Export for use in specific routes (not as global middleware to avoid rate limits)
export async function detectCountry(req: Request): Promise<{ country: string; countryName: string; continent: string }> {
  const ip = extractIp(req);
  const geo = await lookupCountry(ip);
  return { country: geo.country, countryName: geo.countryName, continent: geo.continent };
}
