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

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig,
  max: parseInt(process.env.DB_POOL_MAX || "20", 10),
  min: parseInt(process.env.DB_POOL_MIN || "2", 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  statement_timeout: 30000,
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
