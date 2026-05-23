"use strict";
/**
 * Location Detector Middleware
 *
 * Detects user country from IP address and attaches it to req.userCountry.
 * Uses ipapi.co (free, up to 30,000 req/month, no API key needed).
 * Results are cached in-memory for 10 minutes per IP to avoid rate limits.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.locationDetector = locationDetector;
exports.detectCountry = detectCountry;
const cache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
function evictExpired() {
    const now = Date.now();
    for (const [ip, entry] of cache.entries()) {
        if (entry.expiresAt < now)
            cache.delete(ip);
    }
}
setInterval(evictExpired, 5 * 60 * 1000);
// ─── IP Extraction ────────────────────────────────────────────────────────────
function extractIp(req) {
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) {
        // x-forwarded-for can be a comma-separated list; take the first real IP
        const first = forwarded.split(",")[0].trim();
        if (first)
            return first;
    }
    return req.socket?.remoteAddress || req.ip || "unknown";
}
const LOCAL_IPS = new Set(["::1", "127.0.0.1", "::ffff:127.0.0.1", "unknown"]);
// ─── Geolocation Lookup ───────────────────────────────────────────────────────
async function lookupCountry(ip) {
    const now = Date.now();
    // Return cached entry
    const cached = cache.get(ip);
    if (cached && cached.expiresAt > now)
        return cached;
    // Local / loopback IPs — treat as Kenya (dev environment)
    if (LOCAL_IPS.has(ip)) {
        const entry = {
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
        if (!res.ok)
            throw new Error(`ipapi.co returned ${res.status}`);
        const data = await res.json();
        if (data.error)
            throw new Error("ipapi.co returned error");
        const entry = {
            country: (data.country_code || "XX").toUpperCase(),
            countryName: data.country_name || "Unknown",
            continent: data.continent_code || "XX",
            expiresAt: now + CACHE_TTL_MS,
        };
        cache.set(ip, entry);
        return entry;
    }
    catch {
        // Fail gracefully — default to "unknown" so the fallback payment method (card) applies
        const entry = {
            country: "XX",
            countryName: "Unknown",
            continent: "XX",
            expiresAt: now + 60000, // Short TTL for failures
        };
        cache.set(ip, entry);
        return entry;
    }
}
async function locationDetector(req, _res, next) {
    const ip = extractIp(req);
    req.userIp = ip;
    try {
        const geo = await lookupCountry(ip);
        req.userCountry = geo.country;
        req.userCountryName = geo.countryName;
        req.userContinent = geo.continent;
    }
    catch {
        req.userCountry = "XX";
        req.userCountryName = "Unknown";
        req.userContinent = "XX";
    }
    next();
}
// Export for use in specific routes (not as global middleware to avoid rate limits)
async function detectCountry(req) {
    const ip = extractIp(req);
    const geo = await lookupCountry(ip);
    return { country: geo.country, countryName: geo.countryName, continent: geo.continent };
}
