
import "dotenv/config";
// @ts-nocheck

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../shared/schema";

const { Pool } = pg;

// =======================
// 🚨 ENV CHECK
// =======================
if (!process.env.DATABASE_URL) {
  console.warn("⚠️ DATABASE_URL not set — running without DB");
}

// =======================
// 🔐 SSL CONFIG (SAFE)
// =======================
const isProduction = process.env.NODE_ENV === "production";

const sslConfig =
  isProduction
    ? { rejectUnauthorized: true }
    : process.env.DATABASE_URL?.includes("localhost")
    ? false
    : { rejectUnauthorized: false };

// =======================
// ⚙️ POOL CONFIG (SIMPLIFIED & SAFE)
// =======================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig,
  max: 10, // reduced (safer)
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// =======================
// 🔍 POOL MONITORING
// =======================
export function getPoolStats() {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
}

pool.on("error", (err) => {
  console.error("❌ Database pool error:", err);
});

// =======================
// 🚀 DRIZZLE INIT (SAFE)
// =======================
export const db = drizzle(pool, { schema });

// =======================
// 🔄 SAFE TRANSACTION WRAPPER
// =======================
export async function withTransaction<T>(
  callback: (tx: typeof db) => Promise<T>
): Promise<T> {
  try {
    return await db.transaction(callback);
  } catch (err) {
    console.error("❌ Transaction failed:", err);
    throw err;
  }
}