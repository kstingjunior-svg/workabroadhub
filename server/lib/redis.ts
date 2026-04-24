import IORedis from "ioredis";

function getRedisUrl(): string {
  const raw = process.env.REDIS_URL || "";
  const match = raw.match(/redis[s]?:\/\/\S+/);
  return match ? match[0] : raw;
}

export const redisConnection = new IORedis(getRedisUrl(), {
  tls: {},
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redisConnection.on("connect", () => console.log("[Redis] Connected to Upstash ✓"));
redisConnection.on("error", (err) => console.error("[Redis] Error:", err.message));
