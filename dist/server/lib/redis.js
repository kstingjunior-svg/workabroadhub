"use strict";
// ─────────────────────────────────────────────────────────────────────────────
// Redis client — tolerant of missing REDIS_URL.
//
// 2026-06 scaling work: previously this file THREW on import when REDIS_URL
// wasn't set, which crashed local dev and any deploy without Redis. Bull
// queues (jobQueue/cvQueue/appQueue) need Redis to actually run, but the
// CACHE layer (server/lib/cache.ts) should degrade to in-memory when Redis
// is unavailable rather than break the entire app.
//
// We now export:
//   - redisConnection  : a real ioredis client when REDIS_URL is set, or a
//                        minimal stub that no-ops gracefully when not.
//   - isRedisEnabled() : true when we successfully connected at boot.
//   - redisClient      : same as redisConnection but typed as the optional
//                        client for new code paths (cache.ts uses this).
//
// Behaviour for downstream code:
//   - The Bull queues read REDIS_URL directly and will still error loudly
//     if it's missing at the time they enqueue / process a job.
//   - The cache layer NEVER throws; it just bypasses on stub mode.
// ─────────────────────────────────────────────────────────────────────────────
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisClient = exports.redisConnection = void 0;
exports.isRedisEnabled = isRedisEnabled;
const ioredis_1 = __importDefault(require("ioredis"));
const RAW_URL = (process.env.REDIS_URL || "").trim();
const HAS_REDIS = RAW_URL.length > 0;
// Use TLS only when the URL is rediss:// (Upstash, Render Managed Redis TLS).
// Plain redis:// (e.g. local Docker) should NOT use TLS or the handshake fails.
const useTls = /^rediss:\/\//i.test(RAW_URL);
function makeRealClient() {
    return new ioredis_1.default(RAW_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy: (times) => Math.min(times * 200, 3000),
        ...(useTls ? { tls: {} } : {}),
    });
}
function makeStubClient() {
    const stub = {
        status: "end",
        isStub: true,
        async get() { return null; },
        async set() { return "OK"; },
        async setex() { return "OK"; },
        async del() { return 0; },
        async ping() { throw new Error("Redis not configured"); },
        async incr() { return 0; },
        async expire() { return 0; },
        async mget() { return []; },
        async keys() { return []; },
        async quit() { return "OK"; },
        on() { return stub; },
        off() { return stub; },
        once() { return stub; },
        duplicate() { return stub; },
    };
    return stub;
}
exports.redisConnection = HAS_REDIS
    ? makeRealClient()
    : makeStubClient();
if (HAS_REDIS) {
    exports.redisConnection.on("connect", () => {
        console.log("[Redis] connected");
    });
    exports.redisConnection.on("error", (err) => {
        if (!exports.redisConnection._errorLoggedRecently) {
            console.error("[Redis] error:", err.message);
            exports.redisConnection._errorLoggedRecently = true;
            setTimeout(() => {
                exports.redisConnection._errorLoggedRecently = false;
            }, 30000);
        }
    });
}
else {
    console.warn("[Redis] REDIS_URL is not set. Cache layer will use in-memory fallback. " +
        "Bull job queues will fail at enqueue time until REDIS_URL is provisioned.");
}
function isRedisEnabled() {
    return HAS_REDIS && exports.redisConnection?.status !== "end";
}
exports.redisClient = exports.redisConnection;
exports.default = exports.redisConnection;
