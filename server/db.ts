import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";

// Note: `subscriptions` used to be imported here but that symbol doesn't
// exist on the schema (the real export is `userSubscriptions`). Pulling in
// an undefined name caused the Drizzle schema map to be `{ subscriptions: undefined }`,
// which sometimes broke relational query plumbing. Using a wildcard import
// gives Drizzle the entire schema in one shot and stays correct even when
// new tables are added.
import * as schema from "../shared/schema";

const { Pool } = pkg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. See .env \u2014 should be a postgres:// connection string from Supabase \u2192 Database \u2192 Connection string \u2192 Session pooler."
  );
}

const sslConfig =
  process.env.DATABASE_URL?.includes("localhost")
    ? false
    : { rejectUnauthorized: false };

// 2026-07 (production pool-exhaustion fix): tightened timeouts + bumped max.
// The old 25s statement_timeout was longer than the HTTP-side 30s window,
// which meant a hanging query held a pool slot until the LB gave up. Every
// held slot cascaded into 408 timeouts + "Cannot set headers" for the whole
// service. Now:
//   max 40                : per-instance peak (was 25 — Supabase Pro supports 100+)
//   min 5                 : keep warm connections to skip first-req handshake
//   idleTimeout 20s       : reclaim idle conns faster
//   connectionTimeout 3s  : fail fast on connect (was 5s)
//   statement_timeout 8s  : kill queries BEFORE the HTTP timeout — pool stays healthy
//   query_timeout 10s     : node-side ceiling (slightly longer than statement_timeout)
//   keepAlive             : prevents Render LB from silently dropping conns
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig,
  max: parseInt(process.env.DB_POOL_MAX || "40", 10),
  min: parseInt(process.env.DB_POOL_MIN || "5", 10),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS || "20000", 10),
  connectionTimeoutMillis: parseInt(process.env.DB_CONN_TIMEOUT_MS || "3000", 10),
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || "8000", 10),
  query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT_MS || "10000", 10),
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
});

export const db = drizzle(pool, { schema });

// Pool observability (restored Batch D).
let poolStats = {
  totalConnections: 0,
  idleConnections: 0,
  waitingClients: 0,
  lastChecked: new Date(),
};

setInterval(() => {
  poolStats = {
    totalConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    waitingClients: pool.waitingCount,
    lastChecked: new Date(),
  };
  if (pool.waitingCount > 10) {
    console.warn(
      `[DB Pool Warning] ${pool.waitingCount} clients waiting for connections`
    );
  }
}, 10000);

export function getPoolStats() {
  return {
    ...poolStats,
    totalConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    waitingClients: pool.waitingCount,
  };
}

pool.on("error", (err) => {
  console.error("Unexpected database pool error:", err);
});

pool.on("connect", () => {
  poolStats.totalConnections++;
});

// Transaction helper with deadlock retry (restored Batch D).
export async function withTransaction<T>(
  callback: (tx: any) => Promise<T>,
  retries = 3
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await db.transaction(callback as any);
    } catch (error: any) {
      const isDeadlock =
        error?.code === "40P01" ||
        error?.message?.includes("deadlock");
      const isSerializationFailure = error?.code === "40001";
      if ((isDeadlock || isSerializationFailure) && attempt < retries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 100));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Transaction failed after max retries");
}
