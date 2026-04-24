import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminLayout from "@/components/admin-layout";
import { queryClient } from "@/lib/queryClient";
import {
  BarChart3,
  TrendingUp,
  Users,
  MousePointer,
  ArrowRight,
  Activity,
  Smartphone,
  Monitor,
  Tablet,
  RefreshCcw,
  DollarSign,
  CheckCircle,
  XCircle,
  Clock,
  Download,
  Globe,
  Wifi,
  WifiOff,
  CreditCard,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConversionFunnel { step: string; count: number; conversionRate: number }
interface TopPage { page: string; views: number }
interface DeviceBreakdown { device: string; count: number; percentage: number }
interface AnalyticsDashboard {
  summary: { totalEvents: number; uniqueSessions: number; totalPageViews: number; avgEventsPerSession: number };
  conversionFunnel: ConversionFunnel[];
  topPages: TopPage[];
  deviceBreakdown: DeviceBreakdown[];
  recentActivity: number;
}

interface RevenueMetrics {
  totalRevenue: number;
  revenueToday: number;
  revenueThisWeek: number;
  revenueThisMonth: number;
  averageOrderValue: number;
  totalSuccessfulPayments: number;
  currency: string;
}

interface MethodStat { method: string; count: number; successCount: number; revenue: number; percentage: number }
interface PaymentPerformance {
  successfulPayments: number;
  failedPayments: number;
  pendingPayments: number;
  retryAvailablePayments: number;
  totalPayments: number;
  successRate: number;
  methodBreakdown: MethodStat[];
}

interface CountryStat { country: string; countryName: string; paymentCount: number; totalRevenue: number }

interface RecentTransaction {
  id: string;
  amount: number;
  amountKes: number;
  currency: string;
  method: string;
  status: string;
  createdAt: string;
}

// ─── Helper: Format KES ───────────────────────────────────────────────────────

const fmtKes = (n: number) =>
  `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// ─── Helper: Status badge ─────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    success: { label: "Success", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
    failed: { label: "Failed", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
    pending: { label: "Pending", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300" },
    awaiting_payment: { label: "Awaiting", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
    expired: { label: "Expired", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
    retry_available: { label: "Retry", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
    refunded: { label: "Refunded", className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
  };
  const s = map[status] ?? { label: status, className: "bg-gray-100 text-gray-600" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.className}`}>{s.label}</span>;
}

// ─── Method icon ──────────────────────────────────────────────────────────────

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    mpesa: "text-green-600 bg-green-50 dark:bg-green-900/20",
    paypal: "text-blue-600 bg-blue-50 dark:bg-blue-900/20",
    card: "text-gray-600 bg-gray-50 dark:bg-gray-800",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${colors[method] ?? colors.card}`}>
      {method === "mpesa" ? "M-Pesa" : method === "paypal" ? "PayPal" : method}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminAnalytics() {
  const [timeRange, setTimeRange] = useState("7d");
  const [tab, setTab] = useState("revenue");
  const [wsConnected, setWsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // ── Existing analytics queries ──────────────────────────────────────────────
  const { data: analytics, isLoading: analyticsLoading, refetch: refetchAnalytics, isFetching: analyticsFetching } =
    useQuery<AnalyticsDashboard>({
      queryKey: [`/api/admin/analytics/dashboard?period=${timeRange}`],
      refetchInterval: 30000,
    });

  // ── Revenue analytics queries ───────────────────────────────────────────────
  const { data: revenue, isLoading: revLoading, refetch: refetchRevenue } =
    useQuery<RevenueMetrics>({
      queryKey: ["/api/admin/analytics/revenue"],
      refetchInterval: 60000,
    });

  const { data: paymentPerf, isLoading: perfLoading, refetch: refetchPerf } =
    useQuery<PaymentPerformance>({
      queryKey: ["/api/admin/analytics/payments"],
      refetchInterval: 60000,
    });

  const { data: countries, isLoading: countriesLoading } =
    useQuery<CountryStat[]>({
      queryKey: ["/api/admin/analytics/countries"],
      refetchInterval: 120000,
    });

  const { data: recentTxns, isLoading: txnsLoading, refetch: refetchTxns } =
    useQuery<RecentTransaction[]>({
      queryKey: ["/api/admin/analytics/recent-transactions"],
      refetchInterval: 30000,
    });

  // ── Step 8: WebSocket for real-time updates ─────────────────────────────────
  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${proto}://${window.location.host}/ws/analytics`;

    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => setWsConnected(true);

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === "payment_confirmed" || msg.type === "payment_failed") {
            setLastUpdate(new Date());
            refetchRevenue();
            refetchPerf();
            refetchTxns();
            queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics/revenue"] });
            queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics/payments"] });
            queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics/recent-transactions"] });
          }
          if (msg.type === "new_user") {
            setLastUpdate(new Date());
            queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics/funnel"] });
            queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics/performance"] });
          }
        } catch {}
      };

      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
        reconnectTimer = setTimeout(connect, 5000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, []);

  // ── Step 9: CSV Export ──────────────────────────────────────────────────────
  const handleExport = (type: "revenue" | "all") => {
    window.open(`/api/admin/analytics/export?type=${type}`, "_blank");
  };

  // ── Helper: Funnel ──────────────────────────────────────────────────────────
  const getFunnelStepLabel = (step: string) => {
    const labels: Record<string, string> = {
      landing_view: "Landing Page View", signup: "Sign Up",
      payment_started: "Payment Started", payment_completed: "Payment Completed",
      dashboard_access: "Dashboard Access", job_link_click: "Job Link Click",
      service_order: "Service Order",
    };
    return labels[step] || step;
  };

  const getDeviceIcon = (device: string) => {
    if (device.toLowerCase() === "mobile") return <Smartphone className="h-4 w-4" />;
    if (device.toLowerCase() === "tablet") return <Tablet className="h-4 w-4" />;
    return <Monitor className="h-4 w-4" />;
  };

  const methodColors: Record<string, string> = {
    mpesa: "bg-green-500",
    paypal: "bg-blue-500",
    card: "bg-gray-400",
  };

  const totalMethodCount = paymentPerf?.methodBreakdown.reduce((s, m) => s + m.count, 0) || 1;

  return (
    <AdminLayout title="Analytics Dashboard">
      <div className="space-y-6">
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-analytics-title">Analytics Dashboard</h1>
            <p className="text-muted-foreground">Revenue metrics, payment performance and user behavior</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* WS status indicator */}
            <span
              className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium ${
                wsConnected
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                  : "bg-gray-100 text-gray-500 dark:bg-gray-800"
              }`}
              data-testid="badge-ws-status"
            >
              {wsConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {wsConnected ? "Live" : "Offline"}
            </span>
            {lastUpdate && (
              <span className="text-xs text-muted-foreground hidden sm:block">
                Updated {lastUpdate.toLocaleTimeString()}
              </span>
            )}
            {/* Export buttons */}
            <Button variant="outline" size="sm" onClick={() => handleExport("revenue")} data-testid="button-export-revenue">
              <Download className="h-4 w-4 mr-1" />
              Export Revenue
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport("all")} data-testid="button-export-all">
              <Download className="h-4 w-4 mr-1" />
              All Payments
            </Button>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[140px]" data-testid="select-time-range">
                <SelectValue placeholder="Time range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => { refetchRevenue(); refetchPerf(); refetchTxns(); refetchAnalytics(); }}
              disabled={revLoading || analyticsLoading}
              data-testid="button-refresh-analytics"
            >
              <RefreshCcw className={`h-4 w-4 ${(revLoading || analyticsFetching) ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-2 w-full sm:w-auto">
            <TabsTrigger value="revenue" data-testid="tab-revenue">
              <DollarSign className="h-4 w-4 mr-1.5" />
              Revenue
            </TabsTrigger>
            <TabsTrigger value="behavior" data-testid="tab-behavior">
              <Activity className="h-4 w-4 mr-1.5" />
              User Behavior
            </TabsTrigger>
          </TabsList>

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* REVENUE TAB (Step 7)                                            */}
          {/* ════════════════════════════════════════════════════════════════ */}
          <TabsContent value="revenue" className="space-y-6 mt-4">

            {/* Step 3: Revenue overview cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Total Revenue", value: revenue?.totalRevenue, icon: DollarSign, color: "green" },
                { label: "This Month", value: revenue?.revenueThisMonth, icon: TrendingUp, color: "blue" },
                { label: "This Week", value: revenue?.revenueThisWeek, icon: BarChart3, color: "purple" },
                { label: "Today", value: revenue?.revenueToday, icon: Activity, color: "amber" },
              ].map(({ label, value, icon: Icon, color }) => (
                <Card key={label}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">{label}</p>
                        {revLoading ? (
                          <Skeleton className="h-8 w-24 mt-1" />
                        ) : (
                          <p className={`text-xl font-bold text-${color}-600 dark:text-${color}-400`} data-testid={`text-${label.toLowerCase().replace(/\s/g, "-")}`}>
                            {fmtKes(value ?? 0)}
                          </p>
                        )}
                      </div>
                      <div className={`h-10 w-10 rounded-full bg-${color}-100 dark:bg-${color}-900/30 flex items-center justify-center`}>
                        <Icon className={`h-5 w-5 text-${color}-600 dark:text-${color}-400`} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* AOV + successful payments */}
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Avg. Order Value</p>
                  {revLoading ? <Skeleton className="h-8 w-20 mt-1" /> : (
                    <p className="text-2xl font-bold" data-testid="text-aov">{fmtKes(revenue?.averageOrderValue ?? 0)}</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Paid Orders</p>
                  {revLoading ? <Skeleton className="h-8 w-20 mt-1" /> : (
                    <p className="text-2xl font-bold text-green-600" data-testid="text-paid-orders">{revenue?.totalSuccessfulPayments ?? 0}</p>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              {/* Step 4 + 6: Payment performance + method breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Payment Performance
                  </CardTitle>
                  <CardDescription>Success rate and status breakdown</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {perfLoading ? (
                    <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
                  ) : (
                    <>
                      {/* Success rate ring */}
                      <div className="flex items-center gap-4">
                        <div className="relative h-16 w-16 shrink-0">
                          <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
                            <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted" />
                            <circle
                              cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="6"
                              strokeDasharray={`${2 * Math.PI * 26}`}
                              strokeDashoffset={`${2 * Math.PI * 26 * (1 - (paymentPerf?.successRate ?? 0) / 100)}`}
                              strokeLinecap="round"
                              className="text-green-500 transition-all duration-700"
                            />
                          </svg>
                          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">
                            {paymentPerf?.successRate ?? 0}%
                          </span>
                        </div>
                        <div className="space-y-1 text-sm">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            <span>{paymentPerf?.successfulPayments ?? 0} successful</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-red-500" />
                            <span>{paymentPerf?.failedPayments ?? 0} failed</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-yellow-500" />
                            <span>{paymentPerf?.pendingPayments ?? 0} pending</span>
                          </div>
                        </div>
                      </div>

                      {/* Step 6: Method distribution */}
                      <div>
                        <p className="text-sm font-medium mb-3">Payment Method Distribution</p>
                        <div className="space-y-2">
                          {(paymentPerf?.methodBreakdown ?? []).map((m) => (
                            <div key={m.method} className="space-y-1" data-testid={`method-row-${m.method}`}>
                              <div className="flex justify-between text-xs">
                                <span className="font-medium capitalize">{m.method === "mpesa" ? "M-Pesa" : m.method === "paypal" ? "PayPal" : m.method}</span>
                                <span className="text-muted-foreground">{m.count} ({m.percentage}%)</span>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${methodColors[m.method] ?? "bg-gray-400"}`}
                                  style={{ width: `${m.percentage}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Step 5: Country table */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5" />
                    Country Analytics
                  </CardTitle>
                  <CardDescription>Traffic grouped by user country</CardDescription>
                </CardHeader>
                <CardContent>
                  {countriesLoading ? (
                    <div className="space-y-2">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
                  ) : countries && countries.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Country</th>
                            <th className="text-right py-2 font-medium text-muted-foreground">Sessions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {countries.slice(0, 10).map((c, i) => (
                            <tr key={c.country} className="border-b last:border-0 hover:bg-muted/30" data-testid={`row-country-${i}`}>
                              <td className="py-2 pr-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-base">{c.country}</span>
                                  <span className="font-medium">{c.countryName}</span>
                                </div>
                              </td>
                              <td className="py-2 text-right tabular-nums">{c.paymentCount.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Globe className="h-12 w-12 mx-auto mb-3 opacity-40" />
                      <p>No country data yet</p>
                      <p className="text-xs mt-1">Data appears as users visit from different locations</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Recent Transactions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Recent Transactions
                </CardTitle>
                <CardDescription>Last 20 payment events</CardDescription>
              </CardHeader>
              <CardContent>
                {txnsLoading ? (
                  <div className="space-y-2">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : recentTxns && recentTxns.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 pr-3 font-medium text-muted-foreground">ID</th>
                          <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Method</th>
                          <th className="text-right py-2 pr-3 font-medium text-muted-foreground">Amount</th>
                          <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Status</th>
                          <th className="text-left py-2 font-medium text-muted-foreground">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentTxns.map((t, i) => (
                          <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30" data-testid={`row-txn-${i}`}>
                            <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{t.id.slice(0, 8)}…</td>
                            <td className="py-2 pr-3"><MethodBadge method={t.method} /></td>
                            <td className="py-2 pr-3 text-right tabular-nums font-medium">
                              {t.currency !== "KES" ? `$${t.amount} (${fmtKes(t.amountKes)})` : fmtKes(t.amount)}
                            </td>
                            <td className="py-2 pr-3"><StatusBadge status={t.status} /></td>
                            <td className="py-2 text-muted-foreground">
                              {new Date(t.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Activity className="h-12 w-12 mx-auto mb-3 opacity-40" />
                    <p>No transactions yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* USER BEHAVIOR TAB (existing content)                            */}
          {/* ════════════════════════════════════════════════════════════════ */}
          <TabsContent value="behavior" className="space-y-6 mt-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Total Events", value: analytics?.summary?.totalEvents, key: "text-total-events", color: "blue", Icon: Activity },
                { label: "Unique Sessions", value: analytics?.summary?.uniqueSessions, key: "text-unique-sessions", color: "green", Icon: Users },
                { label: "Page Views", value: analytics?.summary?.totalPageViews, key: "text-page-views", color: "purple", Icon: MousePointer },
                { label: "Active Now", value: analytics?.recentActivity, key: "text-active-users", color: "amber", Icon: TrendingUp },
              ].map(({ label, value, key, color, Icon }) => (
                <Card key={key}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">{label}</p>
                        {analyticsLoading ? <Skeleton className="h-8 w-20 mt-1" /> : (
                          <p className="text-2xl font-bold" data-testid={key}>{(value ?? 0).toLocaleString()}</p>
                        )}
                      </div>
                      <div className={`h-10 w-10 rounded-full bg-${color}-100 dark:bg-${color}-900 flex items-center justify-center`}>
                        <Icon className={`h-5 w-5 text-${color}-600 dark:text-${color}-400`} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />Conversion Funnel</CardTitle>
                  <CardDescription>User journey through key conversion steps</CardDescription>
                </CardHeader>
                <CardContent>
                  {analyticsLoading ? (
                    <div className="space-y-4">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
                  ) : analytics?.conversionFunnel && analytics.conversionFunnel.length > 0 ? (
                    <div className="space-y-3">
                      {analytics.conversionFunnel.map((step, index) => {
                        const maxCount = Math.max(...analytics.conversionFunnel.map(s => s.count), 1);
                        const widthPercent = (step.count / maxCount) * 100;
                        return (
                          <div key={step.step} className="space-y-1">
                            <div className="flex justify-between items-center text-sm">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{getFunnelStepLabel(step.step)}</span>
                                {index > 0 && <Badge variant="outline" className="text-xs">{step.conversionRate.toFixed(1)}%</Badge>}
                              </div>
                              <span className="text-muted-foreground">{(step.count ?? 0).toLocaleString()}</span>
                            </div>
                            <div className="h-6 bg-muted rounded-md overflow-hidden">
                              <div className="h-full bg-primary/80 rounded-md transition-all duration-500" style={{ width: `${widthPercent}%` }} />
                            </div>
                            {index < analytics.conversionFunnel.length - 1 && (
                              <div className="flex justify-center py-1"><ArrowRight className="h-4 w-4 text-muted-foreground" /></div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No conversion data yet</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><MousePointer className="h-5 w-5" />Top Pages</CardTitle>
                    <CardDescription>Most visited pages by view count</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {analyticsLoading ? (
                      <div className="space-y-3">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
                    ) : analytics?.topPages && analytics.topPages.length > 0 ? (
                      <div className="space-y-2">
                        {analytics.topPages.slice(0, 8).map((page, index) => (
                          <div key={page.page} className="flex justify-between items-center py-2 px-3 rounded-md bg-muted/50" data-testid={`row-top-page-${index}`}>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-muted-foreground w-6">#{index + 1}</span>
                              <span className="text-sm font-medium truncate max-w-[180px]">{page.page}</span>
                            </div>
                            <Badge variant="secondary">{(page.views ?? 0).toLocaleString()}</Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-muted-foreground"><p>No page view data yet</p></div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Monitor className="h-5 w-5" />Device Breakdown</CardTitle>
                    <CardDescription>User devices accessing the platform</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {analyticsLoading ? (
                      <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
                    ) : analytics?.deviceBreakdown && analytics.deviceBreakdown.length > 0 ? (
                      <div className="space-y-3">
                        {analytics.deviceBreakdown.map((device) => (
                          <div key={device.device} className="flex items-center gap-3" data-testid={`device-${device.device.toLowerCase()}`}>
                            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">{getDeviceIcon(device.device)}</div>
                            <div className="flex-1">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-sm font-medium capitalize">{device.device}</span>
                                <span className="text-sm text-muted-foreground">{device.percentage.toFixed(1)}%</span>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${device.percentage}%` }} />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-muted-foreground"><p>No device data yet</p></div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
