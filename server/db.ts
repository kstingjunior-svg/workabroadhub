import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Security: Database connection with SSL verification.
// Production: full certificate validation enforced (rejectUnauthorized: true).
// Dev/non-localhost: Replit's heliumdb uses a self-signed cert not in Node.js's
// default CA bundle, so cert verification is disabled. This is intentional and
// safe because: (a) dev data is non-sensitive, (b) the DB host is Replit-managed,
// (c) production always uses strict verification above.
const sslConfig = process.env.NODE_ENV === "production" 
  ? { 
      rejectUnauthorized: true,
    }
  : process.env.DATABASE_URL?.includes("localhost") 
    ? false
    : { 
        rejectUnauthorized: false, // intentional: Replit dev DB uses self-signed cert
      };

const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig,
  max: parseInt(process.env.DB_POOL_MAX || "20", 10),
  min: parseInt(process.env.DB_POOL_MIN || "2", 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  statement_timeout: 30000,
  acquireTimeoutMillis: 15000,
};

export const pool = new Pool(poolConfig);

// Pool statistics for monitoring
let poolStats = {
  totalConnections: 0,
  idleConnections: 0,
  waitingClients: 0,
  lastChecked: new Date(),
};

// Update pool stats periodically for observability
setInterval(() => {
  poolStats = {
    totalConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    waitingClients: pool.waitingCount,
    lastChecked: new Date(),
  };
  
  // Log warning if pool is under pressure
  if (pool.waitingCount > 10) {
    console.warn(`[DB Pool Warning] ${pool.waitingCount} clients waiting for connections`);
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

// Handle pool errors gracefully
pool.on("error", (err) => {
  console.error("Unexpected database pool error:", err);
});

// Handle pool connect events for monitoring
pool.on("connect", () => {
  poolStats.totalConnections++;
});

export const db = drizzle(pool, { schema });

// Transaction helper with automatic retry for deadlocks
export async function withTransaction<T>(
  callback: (tx: typeof db) => Promise<T>,
  retries = 3
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await db.transaction(callback);
    } catch (error: any) {
      const isDeadlock = error.code === '40P01' || error.message?.includes('deadlock');
      const isSerializationFailure = error.code === '40001';
      
      if ((isDeadlock || isSerializationFailure) && attempt < retries) {
        // Exponential backoff before retry
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 100));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Transaction failed after max retries');
}
