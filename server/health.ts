/**
 * PRODUCTION HARDENING: Comprehensive Health Check System
 * 
 * Provides:
 * - Basic health check for load balancers
 * - Detailed health check for monitoring
 * - Component-level health status
 * - Performance metrics
 */

import { db, getPoolStats, pool } from "./db";
import { cache } from "./cache";
import { asyncQueue } from "./queue";
import { getAllCircuitBreakerStats } from "./circuit-breaker";
import { redisConnection } from "./lib/redis";
import { sql } from "drizzle-orm";

export type HealthStatus = "healthy" | "degraded" | "unhealthy";

interface ComponentHealth {
  status: HealthStatus;
  latency?: number;
  message?: string;
  details?: Record<string, any>;
}

interface HealthCheckResult {
  status: HealthStatus;
  timestamp: string;
  uptime: number;
  version: string;
  components: {
    database: ComponentHealth;
    cache: ComponentHealth;
    queue: ComponentHealth;
    circuitBreakers: ComponentHealth;
    memory: ComponentHealth;
    redis: ComponentHealth;
    vapidKeys: ComponentHealth;
    stuckPayments: ComponentHealth;
    orphanSubscriptions: ComponentHealth;
  };
  metrics?: {
    requestsPerMinute?: number;
    averageResponseTime?: number;
    errorRate?: number;
  };
}

async function checkDatabase(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    const latency = Date.now() - start;
    const poolStats = getPoolStats();
    
    let status: HealthStatus = "healthy";
    let message = "Database connected";
    
    if (poolStats.waitingClients > 10) {
      status = "degraded";
      message = `High connection wait queue: ${poolStats.waitingClients}`;
    }
    
    return {
      status,
      latency,
      message,
      details: {
        pool: poolStats,
      },
    };
  } catch (error: any) {
    return {
      status: "unhealthy",
      latency: Date.now() - start,
      message: `Database error: ${error.message}`,
    };
  }
}

function checkCache(): ComponentHealth {
  try {
    const stats = cache.getStats();
    const hitRate = stats.hits + stats.misses > 0
      ? (stats.hits / (stats.hits + stats.misses)) * 100
      : 0;
    
    return {
      status: "healthy",
      message: `Cache operational, ${stats.size} entries, ${hitRate.toFixed(1)}% hit rate`,
      details: stats,
    };
  } catch (error: any) {
    return {
      status: "unhealthy",
      message: `Cache error: ${error.message}`,
    };
  }
}

function checkQueue(): ComponentHealth {
  try {
    const stats = asyncQueue.getStats();
    
    let status: HealthStatus = "healthy";
    let message = `Queue operational, ${stats.pending} pending`;
    
    if (stats.pending > 1000) {
      status = "degraded";
      message = `High queue backlog: ${stats.pending} pending`;
    }
    
    if (stats.failed > 100) {
      status = "degraded";
      message = `High failure rate: ${stats.failed} failed`;
    }
    
    return {
      status,
      message,
      details: stats,
    };
  } catch (error: any) {
    return {
      status: "unhealthy",
      message: `Queue error: ${error.message}`,
    };
  }
}

function checkCircuitBreakers(): ComponentHealth {
  try {
    const stats = getAllCircuitBreakerStats();
    const openCircuits = Object.entries(stats)
      .filter(([_, s]) => s.state === "OPEN")
      .map(([name]) => name);
    
    let status: HealthStatus = "healthy";
    let message = "All circuit breakers closed";
    
    if (openCircuits.length > 0) {
      status = "degraded";
      message = `Open circuit breakers: ${openCircuits.join(", ")}`;
    }
    
    return {
      status,
      message,
      details: stats,
    };
  } catch (error: any) {
    return {
      status: "unhealthy",
      message: `Circuit breaker error: ${error.message}`,
    };
  }
}

function checkMemory(): ComponentHealth {
  const memUsage = process.memoryUsage();
  const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
  const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
  const rssMB = memUsage.rss / 1024 / 1024;
  
  const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
  
  let status: HealthStatus = "healthy";
  let message = `Heap: ${heapUsedMB.toFixed(1)}MB / ${heapTotalMB.toFixed(1)}MB`;
  
  // In development, Node.js heap can fluctuate significantly
  // Only mark unhealthy if RSS exceeds 1GB (more reliable indicator)
  if (rssMB > 1024) {
    status = "unhealthy";
    message = `Critical memory usage: RSS ${rssMB.toFixed(0)}MB`;
  } else if (heapUsagePercent > 95) {
    status = "degraded";
    message = `High heap usage: ${heapUsagePercent.toFixed(1)}%`;
  }
  
  return {
    status,
    message,
    details: {
      heapUsed: heapUsedMB.toFixed(1) + "MB",
      heapTotal: heapTotalMB.toFixed(1) + "MB",
      rss: rssMB.toFixed(1) + "MB",
      external: (memUsage.external / 1024 / 1024).toFixed(1) + "MB",
      heapUsagePercent: heapUsagePercent.toFixed(1) + "%",
    },
  };
}

async function checkRedis(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    const pong = await redisConnection.ping();
    const latency = Date.now() - start;
    if (pong !== "PONG") {
      return { status: "unhealthy", latency, message: `Unexpected Redis response: ${pong}` };
    }
    return { status: "healthy", latency, message: "Redis connected" };
  } catch (err: any) {
    return { status: "unhealthy", latency: Date.now() - start, message: `Redis error: ${err?.message}` };
  }
}

function checkVapidKeys(): ComponentHealth {
  const pub  = Boolean(process.env.VAPID_PUBLIC_KEY);
  const priv = Boolean(process.env.VAPID_PRIVATE_KEY);
  if (pub && priv) return { status: "healthy",   message: "VAPID keys configured — push notifications enabled" };
  if (!pub && !priv) return { status: "unhealthy", message: "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY both missing" };
  return {
    status: "unhealthy",
    message: `Missing: ${!pub ? "VAPID_PUBLIC_KEY" : "VAPID_PRIVATE_KEY"}`,
  };
}

async function checkStuckPayments(): Promise<ComponentHealth> {
  try {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM payments WHERE status = 'retry_available'`,
    );
    const count = parseInt(rows[0]?.count ?? "0", 10);
    if (count === 0) return { status: "healthy", message: "No stuck payments", details: { retryAvailable: 0 } };
    const status: HealthStatus = count >= 5 ? "unhealthy" : "degraded";
    console.error(`[HEALTH] ${count} payment(s) stuck in retry_available`, { timestamp: new Date().toISOString() });
    return { status, message: `${count} payment(s) stuck in retry_available`, details: { retryAvailable: count } };
  } catch (err: any) {
    return { status: "unhealthy", message: `Payment check failed: ${err?.message}` };
  }
}

async function checkOrphanSubscriptions(): Promise<ComponentHealth> {
  try {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM user_subscriptions
       WHERE status = 'active'
         AND user_id NOT IN (SELECT id FROM users)`,
    );
    const count = parseInt(rows[0]?.count ?? "0", 10);
    if (count === 0) return { status: "healthy", message: "No orphan subscriptions" };
    console.error(`[HEALTH] ${count} orphan active subscription(s) with no matching user`, { timestamp: new Date().toISOString() });
    return { status: "degraded", message: `${count} active subscription(s) with no matching user`, details: { orphanCount: count } };
  } catch (err: any) {
    return { status: "unhealthy", message: `Subscription check failed: ${err?.message}` };
  }
}

export async function getDetailedHealth(): Promise<HealthCheckResult> {
  const [
    database, cacheHealth, queueHealth, circuitBreakers, memory,
    redis, vapidKeys, stuckPayments, orphanSubscriptions,
  ] = await Promise.all([
    checkDatabase(),
    Promise.resolve(checkCache()),
    Promise.resolve(checkQueue()),
    Promise.resolve(checkCircuitBreakers()),
    Promise.resolve(checkMemory()),
    checkRedis(),
    Promise.resolve(checkVapidKeys()),
    checkStuckPayments(),
    checkOrphanSubscriptions(),
  ]);

  const components = {
    database, cache: cacheHealth, queue: queueHealth, circuitBreakers, memory,
    redis, vapidKeys, stuckPayments, orphanSubscriptions,
  };

  const statuses = Object.values(components).map(c => c.status);
  let overallStatus: HealthStatus = "healthy";
  if (statuses.includes("unhealthy")) {
    overallStatus = "unhealthy";
  } else if (statuses.includes("degraded")) {
    overallStatus = "degraded";
  }

  if (overallStatus !== "healthy") {
    const unhealthy = Object.entries(components)
      .filter(([, v]) => v.status !== "healthy")
      .map(([k, v]) => `${k}=${v.status}(${v.message})`);
    console.error("[HEALTH] System unhealthy:", { checks: unhealthy, timestamp: new Date().toISOString() });
  }

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || "1.0.0",
    components,
  };
}

export async function getBasicHealth(): Promise<{ status: string; timestamp: number }> {
  try {
    await db.execute(sql`SELECT 1`);
    return { status: "ok", timestamp: Date.now() };
  } catch {
    return { status: "error", timestamp: Date.now() };
  }
}

export async function isReady(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

export async function isLive(): Promise<boolean> {
  return true;
}
