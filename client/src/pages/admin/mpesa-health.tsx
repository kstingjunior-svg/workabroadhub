/**
 * /admin/mpesa-health — readable M-Pesa pipeline status page.
 *
 * Calls /api/admin/mpesa/health, renders the JSON as cards. Auto-refreshes
 * every 30 s. Same auth/session as the rest of the admin UI so the founder
 * doesn't have to think about cookies.
 *
 * Built when founder hit the raw JSON URL in a logged-out tab and got
 * "Authentication required."
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Activity,
  ShieldCheck, Clock, TrendingUp, Loader2, Wallet, Eye, Trash2,
} from "lucide-react";

interface HealthResponse {
  verdict: "healthy" | "degraded" | "broken";
  issues: string[];
  recommendations: string[];
  config: {
    environment:        string;
    shortcode:          string | null;
    callbackBaseUrl:    string | null;
    consumerKey:        boolean;
    consumerSecret:     boolean;
    passKey:            boolean;
    initiatorName:      boolean;
    securityCredential: boolean;
  };
  token: {
    status:        "valid" | "expiring_soon" | "expired" | "not_fetched" | "error";
    ttlSeconds:    number;
    obtainedAt:    string | null;
    expiresAt:     string | null;
    environment:   string;
    lastError:     string | null;
  };
  circuitBreaker: { mpesaStkOpen: boolean; mpesaB2COpen: boolean };
  reconciler: {
    lastRunAt:        string | null;
    lastSuccessAt:    string | null;
    lastError:        string | null;
    totalPulled:      number;
    totalReconciled:  number;
    runCount:         number;
    isRunning:        boolean;
  };
  volume: Record<string, {
    initiated: number; success: number; failed: number; pending: number;
    successRatePct: number | null;
  }>;
  stuck: { count: number; oldestAgeMins: number };
  recentPayments: Array<{
    id: string; amount: number; status: string;
    mpesaCode: string | null; serviceId: string | null; ageMins: number;
  }>;
  generatedAt: string;
}

const VERDICT_META = {
  healthy:  { color: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-100", icon: CheckCircle2, label: "M-Pesa is healthy" },
  degraded: { color: "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100",                icon: AlertTriangle, label: "Degraded — needs attention" },
  broken:   { color: "bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700 text-rose-900 dark:text-rose-100",                      icon: XCircle, label: "M-Pesa is broken" },
};

export default function MpesaHealthPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isFetching, refetch, error } = useQuery<HealthResponse>({
    queryKey: ["/api/admin/mpesa/health"],
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  // 2026-06: bulk-expire historical stuck payments. The reconciler can
  // only recover payments from the last ~24h (Daraja's Pull API limit);
  // anything older is an unrecoverable orphan polluting the dashboard.
  const cleanupStuck = useMutation({
    mutationFn: async (olderThanMinutes: number) => {
      const res = await apiRequest("POST", "/api/admin/mpesa/cleanup-stuck", { olderThanMinutes });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Stuck payments cleared",
        description: data.message,
        duration: 8000,
      });
      qc.invalidateQueries({ queryKey: ["/api/admin/mpesa/health"] });
    },
    onError: (err: any) => {
      toast({ title: "Cleanup failed", description: err?.message, variant: "destructive" });
    },
  });

  return (
    <AdminLayout title="M-Pesa Health">
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <a className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                <ArrowLeft className="h-3 w-3" /> Admin
              </a>
            </Link>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Activity className="h-5 w-5 text-emerald-600" /> M-Pesa Health
              </h1>
              <p className="text-xs text-muted-foreground">
                Real-time pipeline status. Refreshes every 30 s.
              </p>
            </div>
          </div>
          <Button onClick={() => refetch()} disabled={isFetching} variant="outline" size="sm" data-testid="button-refresh-mpesa-health">
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {error && (
          <Card className="border-rose-300 bg-rose-50 dark:bg-rose-950/30">
            <CardContent className="p-4 text-sm text-rose-700 dark:text-rose-300">
              Couldn't load health endpoint: {(error as any)?.message || "unknown error"}
            </CardContent>
          </Card>
        )}

        {!data && !error && (
          <Card><CardContent className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</CardContent></Card>
        )}

        {data && (
          <>
            {/* Verdict banner */}
            {(() => {
              const meta = VERDICT_META[data.verdict];
              const Icon = meta.icon;
              return (
                <Card className={`border-2 ${meta.color}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <Icon className="h-8 w-8 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <h2 className="text-xl font-bold">{meta.label}</h2>
                        <p className="text-xs opacity-80 mt-0.5">
                          Last checked {new Date(data.generatedAt).toLocaleString("en-KE")}
                        </p>
                        {data.issues.length > 0 && (
                          <ul className="mt-3 text-sm space-y-1.5">
                            {data.issues.map((issue, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className="font-bold shrink-0">·</span>
                                <span>{issue}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {data.recommendations.length > 0 && (
                          <div className="mt-3 text-xs opacity-90">
                            <p className="font-bold mb-1">What to do:</p>
                            <ol className="space-y-1 list-decimal list-inside">
                              {data.recommendations.map((rec, i) => <li key={i}>{rec}</li>)}
                            </ol>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Volume / success rate */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(["last_1h", "last_24h", "last_7d"] as const).map((win) => {
                const v = data.volume[win];
                if (!v) return null;
                const label = win === "last_1h" ? "Last 1 hour" : win === "last_24h" ? "Last 24 hours" : "Last 7 days";
                const rate = v.successRatePct;
                const rateColor =
                  rate === null ? "text-muted-foreground" :
                  rate >= 70    ? "text-emerald-600 dark:text-emerald-400" :
                  rate >= 50    ? "text-amber-600 dark:text-amber-400" :
                                  "text-rose-600 dark:text-rose-400";
                return (
                  <Card key={win}>
                    <CardContent className="p-4">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold">{label}</p>
                      <div className="flex items-baseline gap-2 mt-2">
                        <span className={`text-3xl font-bold tabular-nums ${rateColor}`}>
                          {rate === null ? "—" : `${rate}%`}
                        </span>
                        <span className="text-xs text-muted-foreground">success rate</span>
                      </div>
                      <div className="grid grid-cols-4 gap-1 mt-3 text-[10px] text-muted-foreground">
                        <div><div className="font-bold text-foreground tabular-nums">{v.initiated}</div>Started</div>
                        <div><div className="font-bold text-emerald-600 tabular-nums">{v.success}</div>Paid</div>
                        <div><div className="font-bold text-rose-600 tabular-nums">{v.failed}</div>Failed</div>
                        <div><div className="font-bold text-amber-600 tabular-nums">{v.pending}</div>Pending</div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Configuration + Token + Circuit + Reconciler */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-bold mb-2 flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4" /> Configuration
                  </h3>
                  <div className="text-xs space-y-1.5">
                    <div className="flex justify-between"><span>Environment</span><Badge variant="outline" className="text-[10px]">{data.config.environment}</Badge></div>
                    <div className="flex justify-between"><span>Shortcode</span><span className="font-mono">{data.config.shortcode || "—"}</span></div>
                    <div className="flex justify-between"><span>Callback URL</span><span className="font-mono text-[10px] truncate ml-2 max-w-[200px]">{data.config.callbackBaseUrl || "—"}</span></div>
                    {[
                      ["consumerKey", "MPESA_CONSUMER_KEY"],
                      ["consumerSecret", "MPESA_CONSUMER_SECRET"],
                      ["passKey", "MPESA_PASSKEY"],
                      ["initiatorName", "MPESA_INITIATOR_NAME"],
                      ["securityCredential", "MPESA_SECURITY_CREDENTIAL"],
                    ].map(([key, label]) => (
                      <div key={key} className="flex justify-between">
                        <span className="font-mono text-[10px]">{label}</span>
                        <span className={(data.config as any)[key] ? "text-emerald-600" : "text-rose-600"}>
                          {(data.config as any)[key] ? "✓ set" : "✗ missing"}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-bold mb-2 flex items-center gap-1.5">
                    <Clock className="h-4 w-4" /> OAuth Token & Circuit
                  </h3>
                  <div className="text-xs space-y-1.5">
                    <div className="flex justify-between"><span>Token status</span>
                      <Badge className={`text-[10px] ${data.token.status === "valid" ? "bg-emerald-100 text-emerald-800" : data.token.status === "expiring_soon" ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800"}`}>
                        {data.token.status}
                      </Badge>
                    </div>
                    <div className="flex justify-between"><span>TTL</span><span className="tabular-nums">{data.token.ttlSeconds}s</span></div>
                    <div className="flex justify-between"><span>Last error</span><span className="text-rose-600 truncate max-w-[180px]">{data.token.lastError || "—"}</span></div>
                    <hr className="border-border my-1.5" />
                    <div className="flex justify-between"><span>STK circuit</span><span className={data.circuitBreaker.mpesaStkOpen ? "text-rose-600 font-bold" : "text-emerald-600"}>{data.circuitBreaker.mpesaStkOpen ? "✗ OPEN" : "✓ closed"}</span></div>
                    <div className="flex justify-between"><span>B2C circuit</span><span className={data.circuitBreaker.mpesaB2COpen ? "text-rose-600 font-bold" : "text-emerald-600"}>{data.circuitBreaker.mpesaB2COpen ? "✗ OPEN" : "✓ closed"}</span></div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Reconciler + Stuck */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-bold mb-2 flex items-center gap-1.5">
                    <RefreshCw className="h-4 w-4" /> Reconciler
                  </h3>
                  <div className="text-xs space-y-1.5">
                    <div className="flex justify-between"><span>Last run</span><span className="tabular-nums">{data.reconciler.lastRunAt ? new Date(data.reconciler.lastRunAt).toLocaleTimeString("en-KE") : "—"}</span></div>
                    <div className="flex justify-between"><span>Last success</span><span className="tabular-nums">{data.reconciler.lastSuccessAt ? new Date(data.reconciler.lastSuccessAt).toLocaleTimeString("en-KE") : "—"}</span></div>
                    <div className="flex justify-between"><span>Total reconciled</span><span className="tabular-nums font-bold">{data.reconciler.totalReconciled}</span></div>
                    <div className="flex justify-between"><span>Last error</span><span className="text-rose-600 truncate max-w-[180px]">{data.reconciler.lastError || "—"}</span></div>
                  </div>
                </CardContent>
              </Card>

              <Card className={data.stuck.count >= 3 ? "border-rose-300 dark:border-rose-700 bg-rose-50/40 dark:bg-rose-950/20" : ""}>
                <CardContent className="p-4">
                  <h3 className="text-sm font-bold mb-2 flex items-center gap-1.5">
                    <Wallet className="h-4 w-4" /> Stuck payments
                  </h3>
                  <div className="text-xs space-y-1.5">
                    <div className="flex justify-between"><span>Pending &gt;5 min</span><span className={`tabular-nums font-bold text-base ${data.stuck.count > 0 ? "text-amber-600" : "text-emerald-600"}`}>{data.stuck.count}</span></div>
                    <div className="flex justify-between"><span>Oldest age</span><span className="tabular-nums">{data.stuck.oldestAgeMins} min{data.stuck.oldestAgeMins >= 1440 && ` (${Math.round(data.stuck.oldestAgeMins / 1440)} days)`}</span></div>
                    <p className="text-[11px] text-muted-foreground pt-1 border-t border-border mt-2">
                      Stuck = M-Pesa callback never arrived. Reconciler sweeps these every 5 min — but only payments under 24h old (Daraja Pull API limit).
                    </p>
                    {/* 2026-06: cleanup button — only shows if there's anything
                        beyond the recoverable 24h window worth clearing. */}
                    {data.stuck.oldestAgeMins >= 1440 && (
                      <div className="pt-2 mt-2 border-t border-border">
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full text-xs border-amber-400 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300"
                          onClick={() => {
                            const ok = window.confirm(
                              `Mark all M-Pesa payments older than 24 hours as failed?\n\n` +
                              `These ${data.stuck.count} payment(s) can never be recovered (Daraja's Pull API only goes back 24h). ` +
                              `Clearing them gives you a clean baseline for the success-rate metrics.\n\n` +
                              `Payment + audit history is preserved — only the status flips from pending to failed.`
                            );
                            if (ok) cleanupStuck.mutate(1440);
                          }}
                          disabled={cleanupStuck.isPending}
                          data-testid="button-cleanup-stuck"
                        >
                          {cleanupStuck.isPending
                            ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Clearing…</>
                            : <><Trash2 className="h-3 w-3 mr-1.5" /> Clear historical orphans (&gt;24h)</>}
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent payments */}
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-bold mb-3 flex items-center gap-1.5">
                  <Eye className="h-4 w-4" /> Last 5 M-Pesa payments
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="py-1.5 pr-2">Age</th>
                        <th className="py-1.5 px-2">Amount</th>
                        <th className="py-1.5 px-2">Status</th>
                        <th className="py-1.5 px-2">Service</th>
                        <th className="py-1.5 pl-2">M-Pesa code</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentPayments.map((p) => (
                        <tr key={p.id} className="border-b last:border-0">
                          <td className="py-1.5 pr-2 text-muted-foreground">{p.ageMins} min</td>
                          <td className="py-1.5 px-2 font-bold tabular-nums">KES {p.amount.toLocaleString()}</td>
                          <td className="py-1.5 px-2">
                            <Badge className={`text-[9px] ${["success", "completed", "paid"].includes(p.status.toLowerCase()) ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" : p.status.toLowerCase() === "failed" ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200" : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"}`}>
                              {p.status}
                            </Badge>
                          </td>
                          <td className="py-1.5 px-2 truncate max-w-[160px] text-muted-foreground">{p.serviceId || "—"}</td>
                          <td className="py-1.5 pl-2 font-mono">{p.mpesaCode || "—"}</td>
                        </tr>
                      ))}
                      {data.recentPayments.length === 0 && (
                        <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">No M-Pesa payments yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
