/**
 * Nanjila — concurrency + capacity snapshot collector.
 *
 * One function, one call: collectConcurrencySnapshot() returns everything an
 * on-call operator needs to answer "how loaded is the app right now?" in a
 * single object.
 *
 * Metrics collected:
 *
 *   process        Node runtime: uptime, memory (heap + rss), CPU, event
 *                  loop lag. From process.* built-ins — zero cost.
 *
 *   database       Postgres pool: total / idle / waiting counts from pg's
 *                  own instrumentation.
 *
 *   queues         BullMQ queue depths for every known queue: waiting,
 *                  active, completed, failed, delayed. Falls back to zero
 *                  when Redis is unavailable.
 *
 *   ai             Recent AI activity from the ai_usage table (last
 *                  minute + last hour) and from nanjila_conversations
 *                  (message counts). Approximate but useful as a signal.
 *
 *   bottlenecks    Zero or more human-readable warnings derived from the
 *                  numbers above (e.g. "DB pool waiting >0 — connection
 *                  contention"). The admin UI surfaces these prominently.
 *
 * Everything is best-effort. A failure in one metric group returns zeros
 * for that group with an explanatory note in errors[], rather than
 * failing the whole snapshot.
 *
 * Called by GET /api/admin/nanjila/concurrency.
 */

import { pool } from "../../db";
import { performance, monitorEventLoopDelay } from "node:perf_hooks";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface ConcurrencySnapshot {
  generatedAt: string;
  process: {
    uptimeSeconds:  number;
    memory:         { heapUsedMb: number; heapTotalMb: number; rssMb: number };
    cpu:            { userMs: number; systemMs: number };
    eventLoopLagMs: { mean: number; max: number; p95: number };
    nodeVersion:    string;
  };
  database: {
    poolTotal:     number;
    poolIdle:      number;
    poolWaiting:   number;
    poolInFlight:  number;
    slowQueriesLast5Min: number;
  };
  queues: Array<{
    name:      string;
    waiting:   number;
    active:    number;
    completed: number;
    failed:    number;
    delayed:   number;
    reachable: boolean;
  }>;
  ai: {
    openaiCallsLastMinute: number;
    openaiCallsLastHour:   number;
    estimatedCostLastHourCents: number;
    activeNanjilaConversations: number;
    conversationsLastHour: number;
  };
  bottlenecks: Array<{ severity: "info" | "warning" | "critical"; message: string }>;
  errors: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Event-loop lag monitor — started once at module load, sampled per snapshot
// ─────────────────────────────────────────────────────────────────────────────
//
// monitorEventLoopDelay() runs a self-updating histogram in the background at
// negligible CPU cost. We reset it on each snapshot so the numbers reflect
// the window since the last dashboard fetch (typically 3 seconds — a real
// operational signal).

const eventLoopMonitor = monitorEventLoopDelay({ resolution: 10 });
eventLoopMonitor.enable();

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function collectConcurrencySnapshot(): Promise<ConcurrencySnapshot> {
  const errors: string[] = [];

  const [dbStats, queueStats, aiStats] = await Promise.all([
    collectDatabaseStats().catch((err) => {
      errors.push(`db: ${err?.message ?? err}`);
      return zeroDb();
    }),
    collectQueueStats().catch((err) => {
      errors.push(`queues: ${err?.message ?? err}`);
      return [];
    }),
    collectAiStats().catch((err) => {
      errors.push(`ai: ${err?.message ?? err}`);
      return zeroAi();
    }),
  ]);

  const process_ = collectProcessStats();

  const bottlenecks = deriveBottlenecks(process_, dbStats, queueStats, aiStats);

  return {
    generatedAt: new Date().toISOString(),
    process:     process_,
    database:    dbStats,
    queues:      queueStats,
    ai:          aiStats,
    bottlenecks,
    errors,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Process metrics
// ─────────────────────────────────────────────────────────────────────────────

function collectProcessStats(): ConcurrencySnapshot["process"] {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  const meanNs = eventLoopMonitor.mean;
  const maxNs  = eventLoopMonitor.max;
  const p95Ns  = eventLoopMonitor.percentile(95);
  // Reset the monitor so the NEXT snapshot reflects only the window
  // between now and then.
  eventLoopMonitor.reset();

  return {
    uptimeSeconds: Math.round(process.uptime()),
    memory: {
      heapUsedMb:  Math.round(mem.heapUsed  / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      rssMb:       Math.round(mem.rss       / 1024 / 1024),
    },
    cpu: {
      userMs:   Math.round(cpu.user   / 1000),
      systemMs: Math.round(cpu.system / 1000),
    },
    eventLoopLagMs: {
      mean: nsToMs(meanNs),
      max:  nsToMs(maxNs),
      p95:  nsToMs(p95Ns),
    },
    nodeVersion: process.version,
  };
}

function nsToMs(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round((n / 1_000_000) * 100) / 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// Database pool metrics — pg exposes these directly
// ─────────────────────────────────────────────────────────────────────────────

async function collectDatabaseStats(): Promise<ConcurrencySnapshot["database"]> {
  const anyPool = pool as any;
  const total     = Number(anyPool.totalCount   ?? 0);
  const idle      = Number(anyPool.idleCount    ?? 0);
  const waiting   = Number(anyPool.waitingCount ?? 0);
  const inFlight  = Math.max(0, total - idle);

  // Cheap secondary signal: any queries running longer than 5s?
  // Uses pg_stat_activity which is available on every Postgres. If the
  // permission is denied (rare on managed hosts), skip.
  let slow = 0;
  try {
    const { rows } = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n
         FROM pg_stat_activity
        WHERE datname = current_database()
          AND state = 'active'
          AND now() - query_start > interval '5 seconds'
          AND pid <> pg_backend_pid()`,
    );
    slow = Number(rows[0]?.n ?? 0);
  } catch {
    // Silently ignore; some managed hosts restrict pg_stat_activity access.
  }

  return {
    poolTotal:    total,
    poolIdle:     idle,
    poolWaiting:  waiting,
    poolInFlight: inFlight,
    slowQueriesLast5Min: slow,
  };
}

function zeroDb(): ConcurrencySnapshot["database"] {
  return { poolTotal: 0, poolIdle: 0, poolWaiting: 0, poolInFlight: 0, slowQueriesLast5Min: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Queue metrics — enumerate known BullMQ queues
// ─────────────────────────────────────────────────────────────────────────────

const KNOWN_QUEUES: Array<{
  name:   string;
  loader: () => Promise<{ getQueue(): any } | null>;
}> = [
  {
    name: "nanjila-readiness",
    loader: async () => {
      try {
        // The readiness queue is behind a flag; we still try to look at it
        // for stats even when the worker isn't running.
        const mod = await import("../jobs/nightlyReadiness");
        // The module keeps its Queue internal; call readinessQueueStats() instead.
        return {
          async getQueue() {
            const stats = await mod.readinessQueueStats();
            return {
              getWaitingCount:   async () => stats.waiting,
              getActiveCount:    async () => stats.active,
              getCompletedCount: async () => stats.completed,
              getFailedCount:    async () => stats.failed,
              getDelayedCount:   async () => stats.delayed,
            };
          },
        };
      } catch { return null; }
    },
  },
  {
    name: "cv-generation",
    loader: async () => {
      try {
        const mod: any = await import("../../lib/cvQueue");
        return { async getQueue() { return mod.cvQueue; } };
      } catch { return null; }
    },
  },
];

async function collectQueueStats(): Promise<ConcurrencySnapshot["queues"]> {
  const out: ConcurrencySnapshot["queues"] = [];
  for (const spec of KNOWN_QUEUES) {
    try {
      const loader = await spec.loader();
      if (!loader) {
        out.push(zeroQueue(spec.name, false));
        continue;
      }
      const q = await loader.getQueue();
      if (!q) {
        out.push(zeroQueue(spec.name, false));
        continue;
      }
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        q.getWaitingCount?.().catch(() => 0)   ?? 0,
        q.getActiveCount?.().catch(() => 0)    ?? 0,
        q.getCompletedCount?.().catch(() => 0) ?? 0,
        q.getFailedCount?.().catch(() => 0)    ?? 0,
        q.getDelayedCount?.().catch(() => 0)   ?? 0,
      ]);
      out.push({
        name: spec.name,
        waiting:   Number(waiting)   || 0,
        active:    Number(active)    || 0,
        completed: Number(completed) || 0,
        failed:    Number(failed)    || 0,
        delayed:   Number(delayed)   || 0,
        reachable: true,
      });
    } catch (err: any) {
      out.push({ ...zeroQueue(spec.name, false), waiting: 0 });
    }
  }
  return out;
}

function zeroQueue(name: string, reachable: boolean): ConcurrencySnapshot["queues"][number] {
  return {
    name, waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, reachable,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AI activity — from ai_usage (if it exists) + nanjila_conversations
// ─────────────────────────────────────────────────────────────────────────────

async function collectAiStats(): Promise<ConcurrencySnapshot["ai"]> {
  // ai_usage may or may not exist depending on migration history. Guard
  // with a "table exists" query so we return zeros gracefully rather than
  // throwing on production installations without the table.
  const hasAiUsage = await tableExists("ai_usage");

  let openaiCallsLastMinute = 0;
  let openaiCallsLastHour   = 0;
  let costCentsLastHour     = 0;

  if (hasAiUsage) {
    try {
      const { rows } = await pool.query<{
        minute: string; hour: string; cost_cents: string;
      }>(`
        SELECT
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 minute')::text AS minute,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour')::text   AS hour,
          COALESCE(SUM(CASE
              WHEN created_at > NOW() - INTERVAL '1 hour'
              THEN COALESCE(cost_cents, 0)
              ELSE 0 END
            ), 0)::text AS cost_cents
        FROM ai_usage
        WHERE created_at > NOW() - INTERVAL '1 hour'
      `);
      const r = rows[0] ?? { minute: "0", hour: "0", cost_cents: "0" };
      openaiCallsLastMinute = Number(r.minute);
      openaiCallsLastHour   = Number(r.hour);
      costCentsLastHour     = Number(r.cost_cents);
    } catch {
      // Non-fatal; leave zeros.
    }
  }

  // Nanjila conversation activity — active in last 30 min, started in last hour.
  let activeConversations = 0;
  let conversationsLastHour = 0;
  try {
    const { rows } = await pool.query<{ active: string; hour: string }>(`
      SELECT
        COUNT(*) FILTER (WHERE ended_at IS NULL AND started_at > NOW() - INTERVAL '30 minutes')::text AS active,
        COUNT(*) FILTER (WHERE started_at > NOW() - INTERVAL '1 hour')::text                          AS hour
      FROM nanjila_conversations
    `);
    activeConversations   = Number(rows[0]?.active ?? 0);
    conversationsLastHour = Number(rows[0]?.hour   ?? 0);
  } catch {
    // Non-fatal — the table may not exist in dev.
  }

  return {
    openaiCallsLastMinute,
    openaiCallsLastHour,
    estimatedCostLastHourCents: costCentsLastHour,
    activeNanjilaConversations: activeConversations,
    conversationsLastHour,
  };
}

function zeroAi(): ConcurrencySnapshot["ai"] {
  return {
    openaiCallsLastMinute: 0,
    openaiCallsLastHour:   0,
    estimatedCostLastHourCents: 0,
    activeNanjilaConversations: 0,
    conversationsLastHour: 0,
  };
}

async function tableExists(name: string): Promise<boolean> {
  try {
    const { rows } = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
          WHERE table_name = $1
       ) AS exists`,
      [name],
    );
    return rows[0]?.exists === true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bottleneck derivation
// ─────────────────────────────────────────────────────────────────────────────

function deriveBottlenecks(
  proc:   ConcurrencySnapshot["process"],
  db:     ConcurrencySnapshot["database"],
  queues: ConcurrencySnapshot["queues"],
  ai:     ConcurrencySnapshot["ai"],
): ConcurrencySnapshot["bottlenecks"] {
  const out: ConcurrencySnapshot["bottlenecks"] = [];

  // ── Process ────────────────────────────────────────────────────────────
  if (proc.memory.heapUsedMb / Math.max(1, proc.memory.heapTotalMb) > 0.9) {
    out.push({
      severity: "warning",
      message:  `Heap ${proc.memory.heapUsedMb}/${proc.memory.heapTotalMb} MB — over 90% used. Watch for GC pressure.`,
    });
  }
  if (proc.eventLoopLagMs.p95 > 100) {
    out.push({
      severity: "critical",
      message:  `Event loop p95 lag ${proc.eventLoopLagMs.p95} ms — Node is CPU-bound. Users will feel it.`,
    });
  } else if (proc.eventLoopLagMs.mean > 20) {
    out.push({
      severity: "warning",
      message:  `Event loop mean lag ${proc.eventLoopLagMs.mean} ms — elevated. Investigate any long-running sync code.`,
    });
  }

  // ── Database ───────────────────────────────────────────────────────────
  if (db.poolWaiting > 0) {
    out.push({
      severity: "warning",
      message:  `Postgres pool has ${db.poolWaiting} waiter${db.poolWaiting > 1 ? "s" : ""} — connection contention. Consider raising pool size.`,
    });
  }
  if (db.slowQueriesLast5Min > 0) {
    out.push({
      severity: "warning",
      message:  `${db.slowQueriesLast5Min} query${db.slowQueriesLast5Min > 1 ? "ies" : "y"} running longer than 5s. Check pg_stat_activity.`,
    });
  }
  if (db.poolTotal > 0 && db.poolInFlight / db.poolTotal > 0.8) {
    out.push({
      severity: "info",
      message:  `Postgres pool ${db.poolInFlight}/${db.poolTotal} in flight — over 80% busy. Not blocking yet, but monitor.`,
    });
  }

  // ── Queues ─────────────────────────────────────────────────────────────
  for (const q of queues) {
    if (!q.reachable) {
      out.push({
        severity: "info",
        message:  `Queue "${q.name}" is not reachable — worker or Redis may be down.`,
      });
      continue;
    }
    if (q.failed > 20) {
      out.push({
        severity: "warning",
        message:  `Queue "${q.name}" has ${q.failed} failed jobs. Investigate the dead-letter tail.`,
      });
    }
    if (q.waiting > 500) {
      out.push({
        severity: "warning",
        message:  `Queue "${q.name}" has ${q.waiting} waiting jobs — worker is behind.`,
      });
    }
  }

  // ── AI ─────────────────────────────────────────────────────────────────
  // OpenAI tier-1 gpt-4o-mini: 500 RPM. Warn at 80%.
  if (ai.openaiCallsLastMinute > 400) {
    out.push({
      severity: "critical",
      message:  `AI calls last minute = ${ai.openaiCallsLastMinute}, close to the 500 RPM cap. Users may start hitting rate limits.`,
    });
  } else if (ai.openaiCallsLastMinute > 250) {
    out.push({
      severity: "warning",
      message:  `AI calls last minute = ${ai.openaiCallsLastMinute} — over 50% of the 500 RPM ceiling. Watch trajectory.`,
    });
  }

  return out;
}
