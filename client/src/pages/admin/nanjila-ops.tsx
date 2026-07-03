/**
 * /admin/nanjila-ops — Live capacity dashboard for WorkAbroad Hub.
 *
 * Auto-refreshes every 3 seconds. Shows:
 *   • Process (memory / CPU / event loop lag)
 *   • Database (pool state + slow queries)
 *   • BullMQ queues (waiting / active / failed)
 *   • AI (calls per minute / hour, estimated cost, active conversations)
 *   • Bottleneck warnings surfaced prominently
 *
 * Answers the operational question: "how loaded is the app right now?"
 *
 * Admin-only. Reads from GET /api/admin/nanjila/concurrency.
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Cpu,
  Database,
  Layers,
  ArrowLeft,
  RefreshCw,
  XCircle,
  Info,
  MessageCircle,
  Zap,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types (mirror server/nanjila/ops/concurrency.ts ConcurrencySnapshot)
// ─────────────────────────────────────────────────────────────────────────────

type Severity = "info" | "warning" | "critical";

interface ConcurrencySnapshot {
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
    name: string; waiting: number; active: number;
    completed: number; failed: number; delayed: number; reachable: boolean;
  }>;
  ai: {
    openaiCallsLastMinute: number;
    openaiCallsLastHour:   number;
    estimatedCostLastHourCents: number;
    activeNanjilaConversations: number;
    conversationsLastHour: number;
  };
  bottlenecks: Array<{ severity: Severity; message: string }>;
  errors: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const REFRESH_MS = 3000;

export default function NanjilaOpsDashboard() {
  const { data, isLoading, isError, refetch, dataUpdatedAt } =
    useQuery<ConcurrencySnapshot>({
      queryKey: ["/api/admin/nanjila/concurrency"],
      queryFn:  async () => {
        const res = await fetch("/api/admin/nanjila/concurrency", {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      },
      refetchInterval:    REFRESH_MS,
      refetchIntervalInBackground: true,
      staleTime:          0,
    });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Link href="/admin">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" /> Admin
          </Button>
        </Link>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Activity className="h-8 w-8 text-indigo-500" />
              Live Capacity
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Auto-refreshes every {REFRESH_MS / 1000}s ·{" "}
              {dataUpdatedAt
                ? `Last updated ${new Date(dataUpdatedAt).toLocaleTimeString()}`
                : "Loading..."}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh now
          </Button>
        </div>

        {isError && (
          <Card className="border-red-300 bg-red-50 dark:bg-red-950/30 mb-6">
            <CardContent className="p-4 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
              <XCircle className="h-5 w-5" />
              Failed to load capacity snapshot. Retrying automatically.
            </CardContent>
          </Card>
        )}

        {isLoading && !data && (
          <Card>
            <CardContent className="p-10 text-center text-muted-foreground">
              Loading…
            </CardContent>
          </Card>
        )}

        {data && (
          <div className="space-y-6">
            {/* Bottleneck banners */}
            {data.bottlenecks.length > 0 && (
              <div className="space-y-2">
                {data.bottlenecks.map((b, i) => (
                  <BottleneckBanner key={i} severity={b.severity} message={b.message} />
                ))}
              </div>
            )}
            {data.bottlenecks.length === 0 && (
              <Card className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20">
                <CardContent className="p-4 text-sm text-green-800 dark:text-green-300 flex items-center gap-2">
                  <CheckCircle className="h-5 w-5" />
                  All metrics within normal thresholds.
                </CardContent>
              </Card>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              {/* Process */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Cpu className="h-5 w-5 text-blue-500" /> Process
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <MetricRow label="Uptime" value={formatUptime(data.process.uptimeSeconds)} />
                  <MetricRow
                    label="Heap"
                    value={`${data.process.memory.heapUsedMb} / ${data.process.memory.heapTotalMb} MB`}
                    warning={data.process.memory.heapUsedMb / Math.max(1, data.process.memory.heapTotalMb) > 0.9}
                  />
                  <MetricRow label="RSS" value={`${data.process.memory.rssMb} MB`} />
                  <MetricRow label="CPU (user)"   value={`${(data.process.cpu.userMs / 1000).toFixed(1)} s`} />
                  <MetricRow label="CPU (system)" value={`${(data.process.cpu.systemMs / 1000).toFixed(1)} s`} />
                  <MetricRow
                    label="Event loop (p95)"
                    value={`${data.process.eventLoopLagMs.p95} ms`}
                    warning={data.process.eventLoopLagMs.p95 > 20}
                    critical={data.process.eventLoopLagMs.p95 > 100}
                  />
                  <MetricRow label="Node version" value={data.process.nodeVersion} muted />
                </CardContent>
              </Card>

              {/* Database */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Database className="h-5 w-5 text-green-500" /> Postgres pool
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <MetricRow label="Total connections" value={String(data.database.poolTotal)} />
                  <MetricRow label="Idle"      value={String(data.database.poolIdle)} />
                  <MetricRow
                    label="In flight"
                    value={String(data.database.poolInFlight)}
                    warning={data.database.poolTotal > 0 && data.database.poolInFlight / data.database.poolTotal > 0.8}
                  />
                  <MetricRow
                    label="Waiting"
                    value={String(data.database.poolWaiting)}
                    warning={data.database.poolWaiting > 0}
                    critical={data.database.poolWaiting > 5}
                  />
                  <MetricRow
                    label="Slow queries (>5s)"
                    value={String(data.database.slowQueriesLast5Min)}
                    warning={data.database.slowQueriesLast5Min > 0}
                  />
                </CardContent>
              </Card>

              {/* AI */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Zap className="h-5 w-5 text-amber-500" /> AI activity
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <MetricRow
                    label="OpenAI calls / minute"
                    value={`${data.ai.openaiCallsLastMinute} / 500 cap`}
                    warning={data.ai.openaiCallsLastMinute > 250}
                    critical={data.ai.openaiCallsLastMinute > 400}
                  />
                  <MetricRow label="OpenAI calls / hour" value={String(data.ai.openaiCallsLastHour)} />
                  <MetricRow
                    label="Est. cost / hour"
                    value={`KES ${(data.ai.estimatedCostLastHourCents / 100).toFixed(2)}`}
                  />
                  <MetricRow
                    label="Active Nanjila chats"
                    value={String(data.ai.activeNanjilaConversations)}
                  />
                  <MetricRow
                    label="Conversations / hour"
                    value={String(data.ai.conversationsLastHour)}
                  />
                </CardContent>
              </Card>

              {/* Queues */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Layers className="h-5 w-5 text-purple-500" /> Queues
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-3">
                  {data.queues.length === 0 && (
                    <div className="text-muted-foreground italic">No queues detected.</div>
                  )}
                  {data.queues.map((q) => (
                    <div key={q.name} className="border-b border-slate-200 dark:border-slate-800 pb-3 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">{q.name}</span>
                        {q.reachable ? (
                          <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" /> connected
                          </span>
                        ) : (
                          <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <XCircle className="h-3 w-3" /> not reachable
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-5 gap-1 text-xs">
                        <QueueStat label="waiting"   value={q.waiting}   warn={q.waiting > 500} />
                        <QueueStat label="active"    value={q.active} />
                        <QueueStat label="completed" value={q.completed} />
                        <QueueStat label="failed"    value={q.failed}    warn={q.failed > 20} />
                        <QueueStat label="delayed"   value={q.delayed} />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Errors */}
            {data.errors.length > 0 && (
              <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
                <CardContent className="p-4">
                  <div className="font-semibold text-amber-900 dark:text-amber-200 mb-2 flex items-center gap-2">
                    <Info className="h-4 w-4" /> Partial-data warnings
                  </div>
                  <ul className="text-xs space-y-1 text-amber-800 dark:text-amber-300 list-disc pl-6">
                    {data.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Interpretation aid */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" /> How to read this
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-2">
                <p>
                  <strong>Event loop p95 &lt; 20 ms</strong> means Node is responsive. Above 100 ms means users will feel it.
                </p>
                <p>
                  <strong>Postgres waiting &gt; 0</strong> means requests are queued for a connection. Rare, and usually spikes briefly.
                </p>
                <p>
                  <strong>OpenAI calls / minute over 400</strong> means you're near the 500 RPM tier-1 rate limit. Upgrade OpenAI tier to expand.
                </p>
                <p>
                  <strong>Queue failed &gt; 20</strong> warrants a look at BullMQ dead-letter tail.
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small components
// ─────────────────────────────────────────────────────────────────────────────

function MetricRow({
  label, value, warning, critical, muted,
}: {
  label: string; value: string; warning?: boolean; critical?: boolean; muted?: boolean;
}) {
  const color =
    critical ? "text-red-600 dark:text-red-400 font-semibold" :
    warning  ? "text-amber-600 dark:text-amber-400 font-semibold" :
    muted    ? "text-slate-400 dark:text-slate-500" :
               "text-slate-900 dark:text-slate-100";
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-600 dark:text-slate-400">{label}</span>
      <span className={`font-mono text-sm ${color}`}>{value}</span>
    </div>
  );
}

function QueueStat({
  label, value, warn,
}: { label: string; value: number; warn?: boolean }) {
  const color = warn ? "text-amber-600 dark:text-amber-400" : "text-slate-700 dark:text-slate-300";
  return (
    <div className="text-center">
      <div className={`font-mono font-semibold ${color}`}>{value}</div>
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
    </div>
  );
}

function BottleneckBanner({ severity, message }: { severity: Severity; message: string }) {
  const styles =
    severity === "critical" ? "border-red-300 bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-300"
    : severity === "warning" ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300"
    : "border-slate-300 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300";
  const icon = severity === "critical" ? <XCircle className="h-4 w-4" />
             : severity === "warning"  ? <AlertTriangle className="h-4 w-4" />
             : <Info className="h-4 w-4" />;
  return (
    <div className={`border rounded-md p-3 text-sm flex items-start gap-2 ${styles}`}>
      {icon}
      <span>{message}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  if (seconds < 60)     return `${seconds}s`;
  if (seconds < 3600)   return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  if (seconds < 86400)  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}
