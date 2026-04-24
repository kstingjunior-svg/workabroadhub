/**
 * DDoS Protection & Advanced Security Middleware
 *
 * Layers implemented (in order of enforcement):
 *  1. Hard IP Block     — instant 403 for banned IPs (tiered bans: 10m / 1h / 24h)
 *  2. Bot Detection     — block missing/obviously-scripted User-Agents
 *  3. Request Spike     — per-IP sliding window; auto-ban on flood patterns
 *  4. Under-Attack Mode — global circuit breaker; tightens all rules during attacks
 *  5. Geo-Restriction   — Kenya-first; challenge/block high-risk country traffic
 *  6. Slowloris Guard   — hard request timeout to kill slow-drip connections
 *  7. Dynamic Rate      — suspicious IPs (high risk score) get 10x tighter limits
 */

import { Request, Response, NextFunction } from "express";
import { storage } from "../storage";

// Lightweight event tracker — writes directly to storage, avoids circular import with security.ts
function logThreatEvent(eventType: string, ip: string, endpoint: string, ua: string, meta?: Record<string, unknown>): void {
  storage.createSecurityEvent({
    eventType,
    riskPoints: eventType === "ddos_flood" ? 50 : eventType === "bot_detected" ? 20 : eventType === "bot_no_ua" ? 15 : 10,
    ipAddress: ip,
    userId: null,
    endpoint,
    userAgent: ua,
    metadata: meta ?? null,
  }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type BanTier = "minor" | "moderate" | "severe";

interface BanRecord {
  blockedUntil: Date;
  tier: BanTier;
  reason: string;
  bannedAt: Date;
  hitCount: number; // how many times this IP has been re-hit while banned
}

interface RequestWindow {
  timestamps: number[]; // epoch ms of recent requests
  firstSeen: number;
  warnCount: number;    // how many times we've warned this IP
}

interface GeoCache {
  country: string | null;
  countryCode: string | null;
  cachedAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL STATE (in-memory, cleared on restart — intentional for ephemeral bans)
// ─────────────────────────────────────────────────────────────────────────────

const ipBanStore = new Map<string, BanRecord>();
const requestWindows = new Map<string, RequestWindow>();
const geoCache = new Map<string, GeoCache>();
const dynamicRiskCache = new Map<string, { score: number; cachedAt: number }>();

// Under-Attack Mode state
let underAttackMode = false;
let attackModeActivatedAt: Date | null = null;
let globalRequestCount = 0; // requests in current 10s window
let lastWindowReset = Date.now();
const ATTACK_MODE_RPS_THRESHOLD = 500; // >500 req/10s = under attack
const ATTACK_MODE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes after last spike

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const BAN_DURATIONS: Record<BanTier, number> = {
  minor:    10 * 60 * 1000,   // 10 minutes
  moderate: 60 * 60 * 1000,   // 1 hour
  severe:   24 * 60 * 60 * 1000, // 24 hours
};

// Requests per 10-second window before escalating bans
// NOTE: Admin panel fires 10-15 concurrent API calls per page load — thresholds must be high enough
// to not trigger on legitimate admin usage while still catching actual floods
const SPIKE_THRESHOLDS = {
  warn:     100, // warn in logs
  minor:    200, // 10-min ban
  moderate: 350, // 1-hr ban
  severe:   600, // 24-hr ban
};

// Known bot/scanner User-Agent substrings (lowercase).
// IMPORTANT: Only include patterns that are unambiguously malicious tools.
// Do NOT add patterns that appear in legitimate mobile/desktop apps (axios, fetch, etc.).
const BOT_UA_PATTERNS = [
  "python-requests", "python-urllib",   // Python scripting tools
  "libwww-perl",                         // Perl scripting tool
  "masscan", "nmap", "zgrab",            // Network scanners
  "nikto", "sqlmap",                     // Exploit scanners
  "headlesschrome", "phantomjs",         // Headless browsers used for scraping
  "selenium", "webdriver",               // Automated browser testing tools (abuse vectors)
  // NOTE: "curl/", "wget/", "scrapy", "puppeteer", "playwright", "axios/0.", "node-fetch",
  // "okhttp", "go-http-client", "got/" have been removed — they appear in legitimate
  // mobile apps, React Native clients, server-to-server requests, and M-Pesa callbacks.
];

// Geo-restriction: Kenya = fully allowed; these countries = challenge in attack mode; others = allowed but logged
const HIGH_RISK_COUNTRIES = new Set([
  "CN", "RU", "KP", "IR", "SY", "NG", "GH", // high bot/fraud traffic
]);
const GEO_CACHE_TTL_MS = 30 * 60 * 1000; // cache geo lookups for 30 minutes
const GEO_TIMEOUT_MS = 1500;              // don't block requests waiting on slow geo API

// Slowloris: hard timeout on request handling
const REQUEST_TIMEOUT_MS = 30_000; // 30 seconds

// Dynamic rate: how long to cache a risk score lookup
const RISK_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const HIGH_RISK_SCORE_THRESHOLD = 60;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return (typeof forwarded === "string" ? forwarded : forwarded[0])
      .split(",")[0]
      .trim();
  }
  return req.socket?.remoteAddress ?? "unknown";
}

function isPrivateIp(ip: string): boolean {
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("172.16.") ||
    ip.startsWith("172.17.") ||
    ip.startsWith("172.18.") ||
    ip.startsWith("172.19.") ||
    ip.startsWith("172.2") ||
    ip.startsWith("172.3") ||
    ip === "unknown"
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 1: IP BAN STORE
// ─────────────────────────────────────────────────────────────────────────────

export function banIp(ip: string, tier: BanTier, reason: string): void {
  const existing = ipBanStore.get(ip);
  const durationMs = BAN_DURATIONS[tier];
  const now = new Date();

  ipBanStore.set(ip, {
    blockedUntil: new Date(Date.now() + durationMs),
    tier,
    reason,
    bannedAt: now,
    hitCount: (existing?.hitCount ?? 0) + 1,
  });

  const durationLabel = tier === "minor" ? "10 minutes" : tier === "moderate" ? "1 hour" : "24 hours";
  console.warn(`[DDoS] IP BANNED [${tier.toUpperCase()}] ${ip} for ${durationLabel} — ${reason}`);

  // Log ban as a security event so the scanner picks it up
  logThreatEvent("ip_banned", ip, "", "", { tier, reason, durationMs });
}

export function unbanIp(ip: string): boolean {
  return ipBanStore.delete(ip);
}

export function isIpBanned(ip: string): BanRecord | null {
  const record = ipBanStore.get(ip);
  if (!record) return null;
  if (record.blockedUntil <= new Date()) {
    ipBanStore.delete(ip);
    return null;
  }
  return record;
}

export function getBannedIps(): Array<{ ip: string } & BanRecord> {
  const now = new Date();
  const result: Array<{ ip: string } & BanRecord> = [];
  for (const [ip, record] of ipBanStore) {
    if (record.blockedUntil > now) {
      result.push({ ip, ...record });
    } else {
      ipBanStore.delete(ip); // prune expired
    }
  }
  return result;
}

// Middleware: block banned IPs immediately (runs before anything else)
// Webhook routes that must NEVER be blocked by DDoS layers.
// Safaricom callbacks arrive from their servers — no User-Agent, fixed IPs,
// and they retry automatically which looks like a spike to the detector.
function isWebhookRoute(path: string): boolean {
  return (
    path.startsWith("/api/mpesa/") ||
    path.startsWith("/api/paypal/") ||
    path === "/api/callback"
  );
}

export function ipBlockMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = getClientIp(req);
  if (isPrivateIp(ip)) return next(); // never block internal traffic

  // Admin routes are protected by isAuthenticated + isAdmin — let auth handle them
  if (req.path.startsWith("/api/admin")) return next();

  // Payment gateway webhooks must never be blocked by IP bans —
  // Safaricom/PayPal IPs should never be banned
  if (isWebhookRoute(req.path)) return next();

  const ban = isIpBanned(ip);
  if (ban) {
    ban.hitCount++;
    const remainingSecs = Math.ceil((ban.blockedUntil.getTime() - Date.now()) / 1000);
    res.setHeader("Retry-After", String(remainingSecs));
    res.status(403).json({
      message: "Access temporarily restricted. Please try again later.",
      retryAfter: remainingSecs,
    });
    return;
  }
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 2: BOT DETECTION
// ─────────────────────────────────────────────────────────────────────────────

export function botDetectionMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Only inspect API routes — static assets don't need this
  if (!req.path.startsWith("/api")) return next();

  const ip = getClientIp(req);
  if (isPrivateIp(ip)) return next();

  // Payment gateway callbacks (Safaricom, PayPal) come from servers with no/minimal
  // User-Agent — skip bot detection entirely for webhook routes
  if (isWebhookRoute(req.path)) return next();

  const ua = (req.headers["user-agent"] || "").toLowerCase().trim();

  // Reject (but don't ban) requests with completely missing User-Agent.
  // Real browsers always send a UA. Banning the whole IP is too aggressive because
  // one misconfigured client would block everyone behind the same NAT.
  if (!ua) {
    logThreatEvent("bot_no_ua", ip, req.path, "", { method: req.method });
    res.status(403).json({ message: "Request blocked: missing User-Agent." });
    return;
  }

  // Block: known exploit/scanner tools — these are never legitimate user traffic.
  const matchedBot = BOT_UA_PATTERNS.find(pattern => ua.includes(pattern));
  if (matchedBot) {
    logThreatEvent("bot_detected", ip, req.path, ua, { matchedPattern: matchedBot, method: req.method });
    // Only ban on definite attack tools, not ambiguous agents
    banIp(ip, "minor", `Attack tool UA detected: ${matchedBot}`);
    res.status(403).json({ message: "Automated requests are not allowed." });
    return;
  }

  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 3: PER-IP REQUEST SPIKE DETECTION
// ─────────────────────────────────────────────────────────────────────────────

export function spikeDetectionMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith("/api")) return next();

  // Admin routes are already guarded by isAuthenticated + isAdmin — no spike-limit needed
  if (req.path.startsWith("/api/admin")) return next();

  // Safaricom retries callbacks up to 3 times — don't let that trigger a spike ban
  if (isWebhookRoute(req.path)) return next();

  const ip = getClientIp(req);
  if (isPrivateIp(ip)) return next();

  const now = Date.now();
  const windowMs = 10_000; // 10-second sliding window

  let window = requestWindows.get(ip);
  if (!window) {
    window = { timestamps: [], firstSeen: now, warnCount: 0 };
    requestWindows.set(ip, window);
  }

  // Prune timestamps older than 10 seconds
  window.timestamps = window.timestamps.filter(t => now - t < windowMs);
  window.timestamps.push(now);

  const count = window.timestamps.length;

  if (count >= SPIKE_THRESHOLDS.severe) {
    banIp(ip, "severe", `Request flood: ${count} requests in 10s`);
    logThreatEvent("ddos_flood", ip, req.path, req.headers["user-agent"] ?? "", { count, tier: "severe" });
    requestWindows.delete(ip);
    res.status(429).json({ message: "Too many requests. You have been temporarily blocked." });
    return;
  }

  if (count >= SPIKE_THRESHOLDS.moderate) {
    banIp(ip, "moderate", `Request flood: ${count} requests in 10s`);
    logThreatEvent("ddos_flood", ip, req.path, req.headers["user-agent"] ?? "", { count, tier: "moderate" });
    requestWindows.delete(ip);
    res.status(429).json({ message: "Too many requests. Please slow down." });
    return;
  }

  if (count >= SPIKE_THRESHOLDS.minor) {
    banIp(ip, "minor", `Request flood: ${count} requests in 10s`);
    logThreatEvent("ddos_flood", ip, req.path, req.headers["user-agent"] ?? "", { count, tier: "minor" });
    requestWindows.delete(ip);
    res.status(429).json({ message: "Too many requests. Please wait and try again." });
    return;
  }

  if (count >= SPIKE_THRESHOLDS.warn && window.warnCount === 0) {
    window.warnCount++;
    console.warn(`[DDoS] Spike warning: IP ${ip} sent ${count} requests in 10s`);
    logThreatEvent("rate_limit_hit", ip, req.path, req.headers["user-agent"] ?? "", { count, tier: "warn" });
  }

  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 4: UNDER-ATTACK MODE (Global Circuit Breaker)
// ─────────────────────────────────────────────────────────────────────────────

export function underAttackModeMiddleware(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();

  // Reset the global counter every 10 seconds
  if (now - lastWindowReset > 10_000) {
    const rps10s = globalRequestCount;
    globalRequestCount = 0;
    lastWindowReset = now;

    if (rps10s >= ATTACK_MODE_RPS_THRESHOLD) {
      if (!underAttackMode) {
        underAttackMode = true;
        attackModeActivatedAt = new Date();
        console.error(`[DDoS] UNDER ATTACK MODE ACTIVATED — ${rps10s} requests in last 10s`);
        logThreatEvent("under_attack_activated", "server", "/", "", { rps10s });
      }
    } else if (underAttackMode && attackModeActivatedAt) {
      const elapsed = now - attackModeActivatedAt.getTime();
      if (elapsed > ATTACK_MODE_COOLDOWN_MS) {
        underAttackMode = false;
        attackModeActivatedAt = null;
        console.log("[DDoS] Under Attack Mode DEACTIVATED — traffic normalized");
      }
    }
  }

  globalRequestCount++;

  // In attack mode: reject requests without a valid browser UA immediately
  if (underAttackMode && req.path.startsWith("/api")) {
    const ip = getClientIp(req);
    if (!isPrivateIp(ip)) {
      const ua = req.headers["user-agent"] || "";
      const looksLikeBrowser = /mozilla|chrome|safari|firefox|edge|opera/i.test(ua);
      if (!looksLikeBrowser) {
        res.status(503).json({
          message: "Server is under high load. Please try again shortly.",
          underAttack: true,
        });
        return;
      }
    }
  }

  // Expose attack mode state on all responses (useful for monitoring)
  if (underAttackMode) {
    res.setHeader("X-Under-Attack", "1");
  }

  next();
}

export function getUnderAttackState(): { active: boolean; activatedAt: Date | null; globalRps: number } {
  return {
    active: underAttackMode,
    activatedAt: attackModeActivatedAt,
    globalRps: Math.round(globalRequestCount / ((Date.now() - lastWindowReset) / 1000) || 0),
  };
}

export function setUnderAttackMode(active: boolean): void {
  underAttackMode = active;
  attackModeActivatedAt = active ? new Date() : null;
  console.warn(`[DDoS] Under Attack Mode manually ${active ? "ACTIVATED" : "DEACTIVATED"}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 5: GEO-RESTRICTION (Kenya-First)
// ─────────────────────────────────────────────────────────────────────────────

async function lookupGeo(ip: string): Promise<{ country: string | null; countryCode: string | null }> {
  const cached = geoCache.get(ip);
  if (cached && Date.now() - cached.cachedAt < GEO_CACHE_TTL_MS) {
    return { country: cached.country, countryCode: cached.countryCode };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEO_TIMEOUT_MS);

    const res = await fetch(`https://ipapi.co/${ip}/json/`, {
      signal: controller.signal,
      headers: { "Accept": "application/json", "User-Agent": "WorkAbroadHub/1.0" },
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as any;

    const result = { country: data.country_name ?? null, countryCode: data.country_code ?? null };
    geoCache.set(ip, { ...result, cachedAt: Date.now() });
    return result;
  } catch {
    // Geo lookup failed — fail open (don't block the request)
    return { country: null, countryCode: null };
  }
}

export function geoRestrictionMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Only apply to API routes; only when attack mode is active (avoid latency in normal mode)
  if (!req.path.startsWith("/api") || !underAttackMode) return next();

  const ip = getClientIp(req);
  if (isPrivateIp(ip)) return next();

  // Non-blocking: look up geo in background, only act if we have a cached result
  const cached = geoCache.get(ip);
  if (cached && Date.now() - cached.cachedAt < GEO_CACHE_TTL_MS) {
    const code = cached.countryCode;
    if (code && code !== "KE" && HIGH_RISK_COUNTRIES.has(code)) {
      logThreatEvent("geo_blocked", ip, req.path, req.headers["user-agent"] ?? "", { countryCode: code, country: cached.country });
      res.status(403).json({ message: "Access not available in your region during high-traffic periods." });
      return;
    }
  } else {
    // Pre-warm the cache for next request (async, non-blocking)
    lookupGeo(ip).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
  }

  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 6: SLOWLORIS GUARD (Request Timeout)
// ─────────────────────────────────────────────────────────────────────────────

export function slowlorisGuardMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Set a hard timeout on the underlying socket for this request
  req.socket?.setTimeout(REQUEST_TIMEOUT_MS);

  // Also set a response deadline — if we haven't finished in 30s, kill it
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      res.status(408).json({ message: "Request timeout." });
    }
    req.socket?.destroy();
  }, REQUEST_TIMEOUT_MS);

  res.on("finish", () => clearTimeout(timer));
  res.on("close", () => clearTimeout(timer));

  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 7: DYNAMIC RATE LIMITING FOR HIGH-RISK IPs
// ─────────────────────────────────────────────────────────────────────────────

// In-memory per-IP request counter for the dynamic limiter (1-minute windows)
const dynamicWindowStore = new Map<string, { count: number; windowStart: number }>();
const DYNAMIC_WINDOW_MS = 60_000; // 1 minute
const DYNAMIC_LIMIT_NORMAL = 60;  // 60 req/min for normal IPs (matches global 100/15min)
const DYNAMIC_LIMIT_HIGH_RISK = 6; // 6 req/min for high-risk IPs (10x tighter)

export function dynamicRateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith("/api")) return next();

  // Admin routes are protected by auth — don't restrict them with IP-based rate limiting
  if (req.path.startsWith("/api/admin")) return next();

  // Payment gateway webhooks must never be throttled by dynamic rate limiting
  if (isWebhookRoute(req.path)) return next();

  const ip = getClientIp(req);
  if (isPrivateIp(ip)) return next();

  // Check cached risk score (avoids hitting DB on every request)
  const riskEntry = dynamicRiskCache.get(ip);
  const isHighRisk = riskEntry &&
    Date.now() - riskEntry.cachedAt < RISK_CACHE_TTL_MS &&
    riskEntry.score >= HIGH_RISK_SCORE_THRESHOLD;

  if (!isHighRisk) return next(); // only apply to flagged IPs

  const now = Date.now();
  let window = dynamicWindowStore.get(ip);

  if (!window || now - window.windowStart > DYNAMIC_WINDOW_MS) {
    window = { count: 0, windowStart: now };
    dynamicWindowStore.set(ip, window);
  }

  window.count++;
  const limit = DYNAMIC_LIMIT_HIGH_RISK;

  if (window.count > limit) {
    const retryAfter = Math.ceil((DYNAMIC_WINDOW_MS - (now - window.windowStart)) / 1000);
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({ message: "Request rate exceeded. Please slow down." });
    return;
  }

  next();
}

// Called by the security scanner to update risk score cache
export function updateIpRiskCache(ip: string, score: number): void {
  dynamicRiskCache.set(ip, { score, cachedAt: Date.now() });
}

// ─────────────────────────────────────────────────────────────────────────────
// MAINTENANCE: Prune stale in-memory entries every 10 minutes
// ─────────────────────────────────────────────────────────────────────────────

setInterval(() => {
  const now = Date.now();

  // Prune expired IP bans
  for (const [ip, record] of ipBanStore) {
    if (record.blockedUntil.getTime() < now) ipBanStore.delete(ip);
  }

  // Prune stale request windows (no activity in 60s)
  for (const [ip, window] of requestWindows) {
    if (now - (window.timestamps[window.timestamps.length - 1] ?? 0) > 60_000) {
      requestWindows.delete(ip);
    }
  }

  // Prune expired geo cache
  for (const [ip, entry] of geoCache) {
    if (now - entry.cachedAt > GEO_CACHE_TTL_MS) geoCache.delete(ip);
  }

  // Prune expired dynamic rate windows
  for (const [ip, window] of dynamicWindowStore) {
    if (now - window.windowStart > DYNAMIC_WINDOW_MS * 2) dynamicWindowStore.delete(ip);
  }

  // Prune expired risk score cache
  for (const [ip, entry] of dynamicRiskCache) {
    if (now - entry.cachedAt > RISK_CACHE_TTL_MS) dynamicRiskCache.delete(ip);
  }
}, 10 * 60 * 1000);

// ─────────────────────────────────────────────────────────────────────────────
// COMBINED MIDDLEWARE STACK (apply all layers in order)
// ─────────────────────────────────────────────────────────────────────────────

export function applyDdosProtection(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Layer 6: Slowloris guard (first — sets socket timeout immediately)
  slowlorisGuardMiddleware(req, res, () => {
    // Layer 4: Under-attack mode check (global circuit breaker)
    underAttackModeMiddleware(req, res, () => {
      // Layer 1: Hard IP block (banned IPs get instant 403)
      ipBlockMiddleware(req, res, () => {
        // Layer 7: Dynamic rate limit for high-risk IPs
        dynamicRateLimitMiddleware(req, res, () => {
          // Layer 2: Bot detection
          botDetectionMiddleware(req, res, () => {
            // Layer 3: Per-IP spike detection
            spikeDetectionMiddleware(req, res, () => {
              // Layer 5: Geo-restriction (only acts on cached results — non-blocking)
              geoRestrictionMiddleware(req, res, next);
            });
          });
        });
      });
    });
  });
}
