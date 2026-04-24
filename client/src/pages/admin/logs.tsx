import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  UserPlus, CreditCard, CheckCircle2, ArrowUpCircle, XCircle, RefreshCw, Search, Filter, Info, Download
} from "lucide-react";
import type { ActivityLog } from "@shared/schema";

const EVENT_META: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  signup:          { label: "Signup",           icon: UserPlus,       color: "text-blue-600",   bg: "bg-blue-100 dark:bg-blue-900/30" },
  payment_started: { label: "Payment Started",  icon: CreditCard,     color: "text-amber-600",  bg: "bg-amber-100 dark:bg-amber-900/30" },
  payment_success: { label: "Payment Success",  icon: CheckCircle2,   color: "text-green-600",  bg: "bg-green-100 dark:bg-green-900/30" },
  payment_failed:  { label: "Payment Failed",   icon: XCircle,        color: "text-red-600",    bg: "bg-red-100 dark:bg-red-900/30" },
  user_upgraded:   { label: "User Upgraded",    icon: ArrowUpCircle,  color: "text-purple-600", bg: "bg-purple-100 dark:bg-purple-900/30" },
  error:           { label: "Error",            icon: XCircle,        color: "text-red-600",    bg: "bg-red-100 dark:bg-red-900/30" },
};

function EventBadge({ event }: { event: string }) {
  const m = EVENT_META[event] ?? { label: event, icon: Info, color: "text-gray-600", bg: "bg-gray-100" };
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${m.bg} ${m.color}`}>
      <Icon className="h-3 w-3" />
      {m.label}
    </span>
  );
}

function MetaCell({ meta }: { meta: any }) {
  if (!meta) return <span className="text-muted-foreground text-xs">—</span>;
  const entries = Object.entries(meta).filter(([, v]) => v !== null && v !== undefined);
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([k, v]) => (
        <span key={k} className="inline-flex items-center gap-0.5 text-xs bg-muted/60 rounded px-1.5 py-0.5">
          <span className="text-muted-foreground">{k}:</span>
          <span className="font-mono truncate max-w-[120px]">{String(v)}</span>
        </span>
      ))}
    </div>
  );
}

export default function AdminLogsPage() {
  const [filterEvent, setFilterEvent] = useState("all");
  const [filterEmail, setFilterEmail] = useState("");
  const [emailSearch, setEmailSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (filterEvent !== "all") params.set("event", filterEvent);
  if (filterEmail) params.set("email", filterEmail);
  params.set("limit", "200");

  const { data, isLoading, refetch, isFetching } = useQuery<{ logs: ActivityLog[]; total: number }>({
    queryKey: ["/api/admin/activity-logs", filterEvent, filterEmail],
    queryFn: async () => {
      const res = await fetch(`/api/admin/activity-logs?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch logs");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const logs = data?.logs ?? [];

  // Summary counts
  const counts = logs.reduce((acc, l) => {
    acc[l.event] = (acc[l.event] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleEmailSearch = () => setFilterEmail(emailSearch.trim());

  const exportCsv = () => {
    const header = "id,event,userId,email,ip,createdAt,meta\n";
    const rows = logs.map(l =>
      [l.id, l.event, l.userId ?? "", l.email ?? "", l.ip ?? "", l.createdAt?.toString() ?? "", JSON.stringify(l.meta ?? {})].join(",")
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-logs-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout title="Activity Logs">
      <div className="space-y-5">
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Object.entries(EVENT_META).map(([key, m]) => {
            const Icon = m.icon;
            return (
              <button
                key={key}
                data-testid={`card-log-${key}`}
                onClick={() => setFilterEvent(filterEvent === key ? "all" : key)}
                className={`rounded-lg border p-3 text-left transition-all hover:shadow-md ${filterEvent === key ? "ring-2 ring-primary border-primary" : ""}`}
              >
                <div className={`inline-flex items-center justify-center w-8 h-8 rounded-full ${m.bg} mb-1.5`}>
                  <Icon className={`h-4 w-4 ${m.color}`} />
                </div>
                <p className="text-xs text-muted-foreground leading-tight">{m.label}</p>
                <p className="text-xl font-bold mt-0.5">{counts[key] ?? 0}</p>
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm">Filters</CardTitle>
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-logs" className="gap-1">
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={exportCsv} data-testid="button-export-logs" className="gap-1">
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Select value={filterEvent} onValueChange={setFilterEvent}>
                <SelectTrigger data-testid="select-log-event" className="w-44">
                  <SelectValue placeholder="All events" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All events</SelectItem>
                  {Object.entries(EVENT_META).map(([k, m]) => (
                    <SelectItem key={k} value={k}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex gap-2 flex-1 min-w-[200px]">
                <Input
                  data-testid="input-log-email"
                  placeholder="Filter by email…"
                  value={emailSearch}
                  onChange={e => setEmailSearch(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleEmailSearch()}
                  className="flex-1"
                />
                <Button variant="secondary" size="icon" onClick={handleEmailSearch} data-testid="button-search-logs">
                  <Search className="h-4 w-4" />
                </Button>
                {filterEmail && (
                  <Button variant="ghost" size="sm" onClick={() => { setFilterEmail(""); setEmailSearch(""); }} data-testid="button-clear-email-filter">
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Logs table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {isLoading ? "Loading…" : `${logs.length} log${logs.length !== 1 ? "s" : ""}${filterEvent !== "all" ? ` · ${EVENT_META[filterEvent]?.label}` : ""}${filterEmail ? ` · email contains "${filterEmail}"` : ""}`}
            </CardTitle>
            <CardDescription className="text-xs">Latest 200 entries — auto-refreshes every 30 seconds</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : logs.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground text-sm">
                No activity logs found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                      <th className="px-4 py-2 text-left font-medium">Event</th>
                      <th className="px-4 py-2 text-left font-medium">Email</th>
                      <th className="px-4 py-2 text-left font-medium">User ID</th>
                      <th className="px-4 py-2 text-left font-medium">IP</th>
                      <th className="px-4 py-2 text-left font-medium">Details</th>
                      <th className="px-4 py-2 text-left font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <>
                        <tr
                          key={log.id}
                          data-testid={`row-log-${log.id}`}
                          className="border-b hover:bg-muted/20 cursor-pointer"
                          onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                        >
                          <td className="px-4 py-2.5">
                            <EventBadge event={log.event} />
                          </td>
                          <td className="px-4 py-2.5 text-xs">
                            {log.email ? (
                              <span className="truncate max-w-[160px] block">{log.email}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="font-mono text-xs text-muted-foreground truncate max-w-[80px] block">
                              {log.userId ? log.userId.slice(0, 8) + "…" : "—"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{log.ip || "—"}</td>
                          <td className="px-4 py-2.5 max-w-[260px]">
                            <MetaCell meta={log.meta} />
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                            {log.createdAt
                              ? new Date(log.createdAt).toLocaleString("en-KE", { dateStyle: "short", timeStyle: "medium" })
                              : "—"}
                          </td>
                        </tr>
                        {expanded === log.id && (
                          <tr key={`${log.id}-expand`} className="bg-muted/30">
                            <td colSpan={6} className="px-6 py-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                <div><span className="text-muted-foreground">Full ID: </span><span className="font-mono">{log.id}</span></div>
                                {log.userId && <div><span className="text-muted-foreground">User ID: </span><span className="font-mono">{log.userId}</span></div>}
                                {log.ip && <div><span className="text-muted-foreground">IP: </span><span className="font-mono">{log.ip}</span></div>}
                                {log.meta && (
                                  <div className="col-span-2">
                                    <span className="text-muted-foreground">Meta: </span>
                                    <pre className="inline bg-muted rounded px-2 py-1 font-mono text-xs whitespace-pre-wrap break-all">
                                      {JSON.stringify(log.meta, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
