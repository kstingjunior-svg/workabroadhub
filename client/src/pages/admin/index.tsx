import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, AreaChart,
} from "recharts";
import { AnimatedNumber } from "@/components/animated-number";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin-layout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Users,
  CreditCard,
  TrendingUp,
  DollarSign,
  CheckCircle,
  Clock,
  XCircle,
  UserCheck,
  UserX,
  Calendar,
  Mail,
  Crown,
  Zap,
  Activity,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  Database,
  ChevronDown,
  ChevronUp,
  Phone,
} from "lucide-react";

function planBadge(plan: string | null | undefined) {
  const p = (plan || "free").toLowerCase();
  if (p === "pro") return (
    <Badge className="text-[10px] px-1.5 py-0 h-4 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-700 gap-0.5">
      <Crown className="h-2.5 w-2.5" /> Pro
    </Badge>
  );
  if (p === "basic") return (
    <Badge className="text-[10px] px-1.5 py-0 h-4 bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-700 gap-0.5">
      <Zap className="h-2.5 w-2.5" /> Basic
    </Badge>
  );
  return (
    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground gap-0.5">
      Free
    </Badge>
  );
}

interface SignupStats { today: number; thisWeek: number; thisMonth: number; }

interface AdminStats {
  totalUsers: number;
  totalPayments: number;
  activeSubscriptions: number;
  totalRevenue: number;
  revenueToday: number;
  signupStats?: SignupStats;
  planBreakdown?: { free: number; basic: number; pro: number };
  missingPhone?: number;
  activeUsers?: number;
  activeAuthenticatedUsers?: number;
}

interface Payment {
  id: number;
  userId: string;
  amount: number;
  status: string;
  method: string;
  phoneNumber?: string;
  mpesaReceiptNumber?: string;
  transactionRef?: string;
  planId?: string;
  userEmail?: string;
  userName?: string;
  createdAt: string;
}

interface User {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  isActive: boolean;
  isAdmin: boolean;
  createdAt?: string;
  authMethod?: string;
  plan?: string;
  planDisplay?: string;
  hasActiveSubscription?: boolean;
}

interface LiveStats {
  totalUsers: number;
  proUsers: number;
  activeNow: number;
  activeAuthenticated: number;
  timestamp: number;
}

interface IntegrityCheck {
  name: string;
  live: number;
  cached: number | null;
  diff: number | null;
  diffPct: number | null;
  status: "ok" | "warn" | "error" | "cold";
}

interface IntegrityReport {
  dbName: string;
  dbEnv: "development" | "production";
  liveUsersCount: number;
  liveProCount: number;
  liveRevenue: number;
  cachedUsersCount: number | null;
  cachedProCount: number | null;
  cachedRevenue: number | null;
  cacheAgeSeconds: number | null;
  lastUpdated: string | null;
  cacheStatus: "warm" | "stale" | "cold";
  checks: IntegrityCheck[];
  overallStatus: "ok" | "warn" | "error" | "cold";
}

export default function AdminDashboard() {
  const { toast } = useToast();

  // wsLiveStats: updated instantly by WebSocket push events (no HTTP round-trip)
  const [wsLiveStats, setWsLiveStats] = useState<LiveStats | null>(null);
  const [statsGlowing, setStatsGlowing] = useState(false);
  const [proDropdownOpen, setProDropdownOpen] = useState(false);

  // Brief card-level glow whenever a WebSocket stats push arrives
  useEffect(() => {
    if (!wsLiveStats) return;
    setStatsGlowing(true);
    const t = setTimeout(() => setStatsGlowing(false), 1000);
    return () => clearTimeout(t);
  }, [wsLiveStats?.timestamp]);

  const { data: stats, isLoading } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    refetchInterval: 60_000,
    staleTime: 50_000,
  });

  // HTTP fallback for live stats — extended to 60s since WebSocket keeps it fresh
  const { data: liveStats } = useQuery<LiveStats>({
    queryKey: ["/api/admin/stats/live"],
    refetchInterval: 60_000,
    staleTime: 55_000,
  });

  const { data: payments } = useQuery<Payment[]>({
    queryKey: ["/api/admin/payments"],
  });

  const { data: usersData } = useQuery<{ users: User[]; totalUsers: number; totalPages: number; currentPage: number }>({
    queryKey: ["/api/admin/users"],
  });

  const { data: regData } = useQuery<{ week_label: string; new_users: number }[]>({
    queryKey: ["/api/admin/stats/registrations"],
    staleTime: 1000 * 60 * 10,
  });

  // ── Pro subscribers list — fetched on demand when dropdown is opened ──────
  interface ProSubscriber {
    id: string;
    name: string | null;
    email: string;
    phone: string | null;
    startDate: string | null;
    endDate: string | null;
    amountPaid: string | null;
    paymentMethod: string | null;
  }
  const { data: proSubscribers, isLoading: proSubLoading } = useQuery<ProSubscriber[]>({
    queryKey: ["/api/admin/pro-subscribers"],
    enabled: proDropdownOpen,
    staleTime: 60_000,
  });

  // ── Data integrity check — compares cache vs live DB ─────────────────────
  const { data: integrity, refetch: refetchIntegrity } = useQuery<IntegrityReport>({
    queryKey: ["/api/admin/stats/integrity"],
    staleTime: 1000 * 60 * 2, // re-check every 2 minutes
    refetchInterval: 1000 * 60 * 2,
  });

  const refreshCacheMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/admin/stats/cache/refresh");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats/live"] });
      refetchIntegrity();
      toast({ title: "Stats cache refreshed", description: "All metrics are now up to date." });
    },
    onError: () => {
      toast({ title: "Cache refresh failed", variant: "destructive" });
    },
  });

  const toggleUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("PATCH", `/api/admin/users/${userId}/status`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "User status updated" });
    },
    onError: () => {
      toast({ title: "Failed to update user", variant: "destructive" });
    },
  });

  // ── Real-time signup notifications via WebSocket ─────────────────────────────
  const wsRef = useRef<WebSocket | null>(null);
  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${proto}://${window.location.host}/ws/analytics`;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);

          if (msg.type === "stats_update") {
            // Directly update state — no HTTP round-trip needed
            setWsLiveStats((prev) => ({
              totalUsers:         msg.totalUsers      > 0 ? msg.totalUsers         : (prev?.totalUsers         ?? 0),
              proUsers:           msg.proUsers        > 0 ? msg.proUsers           : (prev?.proUsers           ?? 0),
              activeNow:          msg.activeNow       > 0 ? msg.activeNow          : (prev?.activeNow          ?? 0),
              activeAuthenticated: msg.activeAuthenticated > 0 ? msg.activeAuthenticated : (prev?.activeAuthenticated ?? 0),
              timestamp:          msg.timestamp,
            }));
          }

          if (msg.type === "new_user") {
            // Trigger full stats refresh and show notification
            queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
            queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
            toast({
              title: "New user signed up",
              description: `${msg.firstName || msg.email} joined via ${msg.method === "replit" ? "Replit" : "email"}`,
            });
          }
        } catch {}
      };

      ws.onclose = () => {
        wsRef.current = null;
        reconnectTimer = setTimeout(connect, 6000);
      };
      ws.onerror = () => ws.close();
    }

    connect();
    return () => {
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [toast]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
      case "success":
        return (
          <Badge variant="default" className="bg-green-600 hover:bg-green-700">
            <CheckCircle className="h-3 w-3 mr-1" />
            {status}
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
            <Clock className="h-3 w-3 mr-1" />
            {status}
          </Badge>
        );
      default:
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            {status}
          </Badge>
        );
    }
  };

  const recentPayments = payments?.slice(0, 5) || [];
  const recentUsers = usersData?.users?.slice(0, 5) || [];

  return (
    <AdminLayout title="Dashboard">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-admin-title">Admin Dashboard</h1>
          <p className="text-muted-foreground">Overview of your platform metrics</p>
        </div>

        {/* ── DATA INTEGRITY BANNER ────────────────────────────────────── */}
        {integrity && (() => {
          const s = integrity.overallStatus;
          const cs = integrity.cacheStatus;
          const isDevDb = integrity.dbEnv === "development";
          const bannerColor =
            s === "error" ? "border-red-400 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300" :
            s === "warn"  ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300" :
            cs === "stale" ? "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400" :
                             "border-green-300 bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-300";
          const Icon = s === "error" ? AlertTriangle : s === "warn" ? AlertTriangle : ShieldCheck;

          return (
            <div className={`rounded-lg border px-4 py-3 flex flex-wrap items-center gap-3 text-sm ${bannerColor}`} data-testid="banner-integrity">

              {/* Left: icon + headline */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Icon className="h-4 w-4 shrink-0" />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">

                  {/* DB environment pill */}
                  <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                    isDevDb
                      ? "border-amber-400 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                      : "border-green-400 bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                  }`} data-testid="badge-db-env">
                    <Database className="h-2.5 w-2.5" />
                    {integrity.dbName} ({isDevDb ? "DEV" : "PROD"})
                  </span>

                  {/* Live counts headline */}
                  <span className="font-medium">
                    {integrity.liveUsersCount.toLocaleString()} users live
                    {isDevDb && (
                      <span className="ml-1 opacity-70 text-[11px]">— production has more</span>
                    )}
                  </span>

                  {/* Per-metric checks */}
                  {integrity.checks.map(c => (
                    <span key={c.name} className="text-[11px] flex items-center gap-0.5 opacity-80" data-testid={`check-${c.name.toLowerCase().replace(/\s+/g, "-")}`}>
                      {c.status === "ok"   && <CheckCircle className="h-3 w-3 text-green-500" />}
                      {c.status === "warn" && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                      {c.status === "error"&& <XCircle className="h-3 w-3 text-red-500" />}
                      {c.status === "cold" && <Clock className="h-3 w-3 opacity-50" />}
                      {c.name}: {c.live.toLocaleString()}
                      {c.cached !== null && c.diffPct !== null && c.diffPct > 0 && (
                        <span className="text-[10px] ml-0.5 opacity-60">(cache off {c.diffPct}%)</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>

              {/* Right: cache age + refresh button */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] opacity-70">
                  {cs === "cold"  ? "Cache cold" :
                   cs === "stale" ? `Cache stale (${Math.floor((integrity.cacheAgeSeconds ?? 0) / 60)}m ago)` :
                                    `Cache ${integrity.cacheAgeSeconds}s ago`}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[11px] px-2 gap-1"
                  onClick={() => refreshCacheMutation.mutate()}
                  disabled={refreshCacheMutation.isPending}
                  data-testid="button-refresh-cache"
                >
                  <RefreshCw className={`h-3 w-3 ${refreshCacheMutation.isPending ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </div>
          );
        })()}

        {/* ── KEY METRICS ROW (4 cards) ────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              Key Metrics
            </h2>
            <span className={`text-[10px] transition-colors duration-500 ${statsGlowing ? "text-green-500 font-semibold" : "text-muted-foreground"}`}>
              {wsLiveStats ? `Live · ${new Date(wsLiveStats.timestamp).toLocaleTimeString()}` : "Connecting…"}
            </span>
          </div>

          <div className={`grid grid-cols-2 lg:grid-cols-4 gap-4 transition-all duration-500 ${statsGlowing ? "ring-1 ring-green-400/30 rounded-xl" : ""}`}>

            {/* 1 — Total Users */}
            <Card className="border-blue-200 dark:border-blue-800">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-muted-foreground">Users</p>
                    {isLoading && !liveStats && !wsLiveStats ? (
                      <Skeleton className="h-8 w-20 mt-1" />
                    ) : (
                      <p className="text-2xl font-bold text-blue-600">
                        <AnimatedNumber
                          value={(wsLiveStats?.totalUsers || liveStats?.totalUsers || stats?.totalUsers) ?? 0}
                          className="text-blue-600"
                          data-testid="text-total-users"
                        />
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {(wsLiveStats?.activeNow || liveStats?.activeNow || stats?.activeUsers) ?? 0} active now
                    </p>
                  </div>
                  <div className="h-10 w-10 shrink-0 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center ml-2">
                    <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 2 — Pro / Paid (clickable → full-width subscriber list below) */}
            <Card
              className="border-purple-200 dark:border-purple-800 cursor-pointer hover:border-purple-400 dark:hover:border-purple-600 transition-colors select-none"
              onClick={() => setProDropdownOpen(o => !o)}
              data-testid="card-pro-subscribers-toggle"
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-muted-foreground">Pro</p>
                    {isLoading && !liveStats && !wsLiveStats ? (
                      <Skeleton className="h-8 w-12 mt-1" />
                    ) : (
                      <p className="text-2xl font-bold text-purple-600">
                        <AnimatedNumber
                          value={(wsLiveStats?.proUsers || liveStats?.proUsers || stats?.activeSubscriptions) ?? 0}
                          className="text-purple-600"
                          data-testid="text-paid-users"
                        />
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                      paid subscribers
                      {proDropdownOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </p>
                  </div>
                  <div className="h-10 w-10 shrink-0 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center ml-2">
                    <UserCheck className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 3 — Conversion Rate */}
            <Card className="border-amber-200 dark:border-amber-800">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-muted-foreground">Conv.</p>
                    {isLoading ? (
                      <Skeleton className="h-8 w-16 mt-1" />
                    ) : (() => {
                      const total = wsLiveStats?.totalUsers || liveStats?.totalUsers || stats?.totalUsers || 0;
                      const paid  = wsLiveStats?.proUsers  || liveStats?.proUsers  || stats?.activeSubscriptions || 0;
                      const rate  = total > 0 ? (paid / total) * 100 : 0;
                      return (
                        <p className="text-2xl font-bold text-amber-600">
                          <AnimatedNumber
                            value={rate}
                            decimals={1}
                            suffix="%"
                            className="text-amber-600"
                            data-testid="text-conversion-rate"
                          />
                        </p>
                      );
                    })()}
                    <p className="text-[10px] text-muted-foreground mt-0.5">paid ÷ total</p>
                  </div>
                  <div className="h-10 w-10 shrink-0 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center ml-2">
                    <TrendingUp className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 4 — Total Revenue */}
            <Card className="border-green-200 dark:border-green-800">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-muted-foreground">Revenue</p>
                    {isLoading ? (
                      <Skeleton className="h-8 w-28 mt-1" />
                    ) : (
                      <p className="text-2xl font-bold text-green-700 dark:text-green-400" data-testid="text-total-revenue">
                        KES {(stats?.totalRevenue ?? 0).toLocaleString()}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      KES {(stats?.revenueToday ?? 0).toLocaleString()} today
                    </p>
                  </div>
                  <div className="h-10 w-10 shrink-0 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center ml-2">
                    <DollarSign className="h-5 w-5 text-green-700 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>

          {/* ── Pro Subscriber List (full-width, shown when Pro card is clicked) ── */}
          {proDropdownOpen && (
            <div className="mt-3 rounded-xl border border-purple-200 dark:border-purple-800 bg-card shadow-md overflow-hidden" data-testid="panel-pro-subscribers">
              <div className="flex items-center gap-2 px-4 py-3 bg-purple-50 dark:bg-purple-950/40 border-b border-purple-100 dark:border-purple-800">
                <Crown className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-semibold text-purple-800 dark:text-purple-200">Active Pro Subscribers</span>
                {!proSubLoading && proSubscribers && (
                  <Badge className="ml-1 text-[10px] px-1.5 py-0 h-4 bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 border border-purple-200 dark:border-purple-700">
                    {proSubscribers.length} total
                  </Badge>
                )}
              </div>

              {proSubLoading ? (
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
                </div>
              ) : !proSubscribers || proSubscribers.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">No active Pro subscribers found.</p>
              ) : (
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-card border-b border-border">
                      <tr>
                        <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Name</th>
                        <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Email</th>
                        <th className="text-left px-4 py-2 font-semibold text-muted-foreground hidden sm:table-cell">Phone</th>
                        <th className="text-right px-4 py-2 font-semibold text-muted-foreground hidden md:table-cell">Amount Paid</th>
                        <th className="text-right px-4 py-2 font-semibold text-muted-foreground">Expires</th>
                        <th className="text-right px-4 py-2 font-semibold text-muted-foreground hidden lg:table-cell">Method</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {proSubscribers.map((sub, idx) => (
                        <tr key={sub.id} className="hover:bg-muted/40 transition-colors" data-testid={`row-pro-subscriber-${idx}`}>
                          <td className="px-4 py-2.5 font-medium max-w-[140px] truncate">{sub.name || "—"}</td>
                          <td className="px-4 py-2.5 text-muted-foreground max-w-[180px] truncate">
                            <a href={`mailto:${sub.email}`} className="hover:text-purple-600 transition-colors">{sub.email}</a>
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">{sub.phone || "—"}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-green-600 dark:text-green-400 hidden md:table-cell">
                            {sub.amountPaid ? `KES ${Number(sub.amountPaid).toLocaleString()}` : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground">
                            {sub.endDate
                              ? new Date(sub.endDate).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })
                              : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-right capitalize text-muted-foreground hidden lg:table-cell">
                            {sub.paymentMethod || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Registrations Over Time chart ─────────────────────────── */}
        <Card data-testid="card-reg-chart">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  Registrations Over Time
                </CardTitle>
                <CardDescription className="text-xs">New user sign-ups · last 8 weeks</CardDescription>
              </div>
              <div className="flex items-center gap-3">
                {stats?.signupStats?.thisMonth != null && (
                  <span className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-full border border-blue-100 dark:border-blue-800">
                    Last 30 days: <span className="font-bold text-blue-600 dark:text-blue-400">{stats.signupStats.thisMonth.toLocaleString()} new users</span>
                  </span>
                )}
                {regData && regData.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {regData.reduce((s, r) => s + Number(r.new_users), 0).toLocaleString()} (8 wk)
                  </span>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {!regData ? (
              <Skeleton className="h-48 w-full rounded-xl" />
            ) : regData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                No registration data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={regData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="regGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.07} />
                  <XAxis
                    dataKey="week_label"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: "12px",
                      borderRadius: "8px",
                      border: "none",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
                    }}
                    formatter={(v: number) => [v.toLocaleString(), "New users"]}
                    labelFormatter={(l) => `Week of ${l}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="new_users"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                    fill="url(#regGradient)"
                    dot={{ r: 4, fill: "#3b82f6", strokeWidth: 0 }}
                    activeDot={{ r: 6, fill: "#2563eb", strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Quick links row */}
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" asChild data-testid="link-funnel-dashboard">
            <a href="/admin/funnel" className="flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-purple-500" /> Conversion Funnel
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href="/admin/analytics" className="flex items-center gap-1.5">Analytics</a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href="/admin/plans" className="flex items-center gap-1.5">Plans</a>
          </Button>
          <Button variant="outline" size="sm" asChild data-testid="link-moderation">
            <a href="/admin/moderation" className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-teal-500" /> Moderation Queue
            </a>
          </Button>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Recent Payments
                  </CardTitle>
                  <CardDescription>Latest payment transactions</CardDescription>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <a href="/admin/payments" data-testid="link-view-all-payments">View All</a>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {recentPayments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No payments yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentPayments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                      data-testid={`row-payment-${payment.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {payment.userEmail || payment.userName || payment.phoneNumber || "Unknown"}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <span className="capitalize">{payment.method || "mpesa"}</span>
                          {payment.planId && <span>· {payment.planId}</span>}
                          <span>·</span>
                          <span>{new Date(payment.createdAt).toLocaleDateString("en-KE", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-sm">
                          KES {payment.amount.toLocaleString()}
                        </span>
                        {getStatusBadge(payment.status)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Recent Users
                  </CardTitle>
                  <CardDescription>Latest registered users</CardDescription>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <a href="/admin/users" data-testid="link-view-all-users">View All</a>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {recentUsers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No users yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentUsers.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50 gap-2"
                      data-testid={`row-user-${user.id}`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center ${
                          user.isActive
                            ? "bg-green-100 dark:bg-green-900"
                            : "bg-red-100 dark:bg-red-900"
                        }`}>
                          {user.isActive ? (
                            <UserCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
                          ) : (
                            <UserX className="h-4 w-4 text-red-600 dark:text-red-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-medium truncate">
                              {user.firstName} {user.lastName}
                            </p>
                            {planBadge(user.planDisplay || user.plan)}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                              <Mail className="h-3 w-3 shrink-0" />
                              {user.email || "No email"}
                            </p>
                          </div>
                          {user.createdAt && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              Joined {new Date(user.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                            </p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleUserMutation.mutate(user.id)}
                        disabled={toggleUserMutation.isPending}
                        className="shrink-0"
                        data-testid={`button-toggle-${user.id}`}
                      >
                        {user.isActive ? "Disable" : "Enable"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
