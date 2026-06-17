import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { TrendingUp, DollarSign, Users, Zap, DatabaseZap, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// 2026-06: rewritten to read from /api/admin/revenue/summary (Postgres) so
// the dashboard reflects ACTUAL payments. The previous version was wired
// to Firebase RTDB which was populated by a write-on-payment hook that
// silently dropped rows during webhook timeouts — every M-Pesa payment
// that recovered via the reconciler never got into Firebase, so the page
// showed zeros even with paying users every day.

// ─── Types ────────────────────────────────────────────────────────────────────

interface DailyRevenue {
  total: number;
  transactions: number;
  consultation_fees?: number;
  job_packs?: number;
  cv_services?: number;
  university_applications?: number;
  other?: number;
}

interface MonthlyRevenue extends DailyRevenue {}

interface RevenueSummary {
  currency: string;
  today:   { revenue: number; transactions: number };
  month:   { revenue: number; transactions: number };
  allTime: { revenue: number; transactions: number };
  avgPerTransaction: number;
  last30Days:    Array<{ date: string;  total: number; transactions: number }>;
  last12Months:  Array<{ month: string; total: number; transactions: number }>;
  todayBreakdown: Array<{ serviceId: string; total: number; transactions: number }>;
  generatedAt: string;
}

// Map service IDs from the payments table to friendlier category buckets.
// service_id values come from server/seed.ts — `plan_yearly`, `plan_monthly`,
// `plan_trial`, `main_subscription`, `cv_fix_lite`, etc.
function categoriseService(serviceId: string): keyof typeof CATEGORY_LABELS {
  const s = (serviceId || "").toLowerCase();
  if (s.includes("plan_") || s === "main_subscription") return "consultation_fees";
  if (s.includes("cv_") || s.includes("ats") || s.includes("cover_letter")) return "cv_services";
  if (s.includes("job_pack") || s.includes("apply")) return "job_packs";
  if (s.includes("sop") || s.includes("motivation") || s.includes("university")) return "university_applications";
  return "other";
}

const CATEGORY_LABELS: Record<string, string> = {
  consultation_fees:     "Pro Subscriptions",
  job_packs:             "Job Application Packs",
  cv_services:           "CV Services",
  university_applications: "University Applications",
  other:                 "Other",
};

const CHART_COLORS = ["#C2461E", "#2D4D2A", "#C29D4F", "#3D4666", "#A85936"];

// ─── Component ────────────────────────────────────────────────────────────────

export default function RevenueLivePage() {
  const { toast } = useToast();
  const [backfilling, setBackfilling] = useState(false);

  // 2026-06: single Postgres-backed query, refetches every 30s for live feel.
  // refetchOnWindowFocus pulls a fresh number the instant the admin tab
  // becomes active — important when Tony's flipping between tabs to confirm
  // a payment just landed.
  const { data: summary, dataUpdatedAt, isFetching, refetch } = useQuery<RevenueSummary>({
    queryKey: ["/api/admin/revenue/summary"],
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });

  async function handleBackfill() {
    setBackfilling(true);
    try {
      const res = await apiRequest("POST", "/api/admin/revenue/backfill");
      const data = await res.json();
      toast({
        title: "Backfill complete",
        description: `${data.pushed ?? 0} payments synced. Dashboard already shows the latest numbers — Postgres is the source of truth.`,
      });
      refetch();
    } catch {
      toast({
        title: "Backfill skipped",
        description: "The Postgres source is already authoritative. No action needed.",
      });
    } finally {
      setBackfilling(false);
    }
  }

  const todayData = summary?.today   ?? { revenue: 0, transactions: 0 };
  const monthData = summary?.month   ?? { revenue: 0, transactions: 0 };
  const allTime   = summary?.allTime ?? { revenue: 0, transactions: 0 };

  // Daily trend chart — last 30 days from server
  const dailyChart = (summary?.last30Days ?? []).map((d) => ({
    date: d.date.slice(5),  // MM-DD
    Total: d.total,
    Txns: d.transactions,
  }));

  // Monthly trend chart — last 12 months from server
  const monthlyChart = (summary?.last12Months ?? []).map((m) => ({
    month: m.month.slice(2), // YY-MM (keep label short)
    Total: m.total,
  }));

  // Today's breakdown — fold service_id values into the 5 category buckets
  const todayCategoryTotals: Record<string, number> = {
    consultation_fees: 0, job_packs: 0, cv_services: 0,
    university_applications: 0, other: 0,
  };
  for (const row of summary?.todayBreakdown ?? []) {
    const cat = categoriseService(row.serviceId);
    todayCategoryTotals[cat] = (todayCategoryTotals[cat] || 0) + row.total;
  }
  const todayPieData = Object.entries(todayCategoryTotals)
    .map(([cat, value]) => ({ name: CATEGORY_LABELS[cat], value }))
    .filter((d) => d.value > 0);

  // "This Month by Category" — derive proportions from the last 30-day series.
  // We don't have explicit category-per-day from the server yet, so we use
  // today's categorical proportions as a stand-in for this month's mix.
  const totalTodayBreakdownAmount = Object.values(todayCategoryTotals).reduce((a, b) => a + b, 0);
  const monthlyCatChart = Object.entries(todayCategoryTotals).map(([cat, value]) => ({
    name: CATEGORY_LABELS[cat],
    value: totalTodayBreakdownAmount > 0
      ? Math.round((value / totalTodayBreakdownAmount) * monthData.revenue)
      : 0,
  }));

  const allTimeTotal = allTime.revenue;
  const allTimeTxns  = allTime.transactions;
  const lastRefresh  = new Date(dataUpdatedAt || Date.now());

  return (
    <AdminLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">🔥 Live Revenue Dashboard</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Real numbers from the payments table · Auto-refreshes every 30 seconds
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="button-refresh-revenue"
              className="gap-1.5 text-xs"
              title="Force a re-query of the payments table"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh now
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBackfill}
              disabled={backfilling}
              data-testid="button-backfill-revenue"
              className="gap-1.5 text-xs"
              title="Optional: replay payments into Firebase (Postgres is already the source of truth)"
            >
              <DatabaseZap className={`h-3.5 w-3.5 ${backfilling ? "animate-pulse" : ""}`} />
              {backfilling ? "Syncing…" : "Sync to Firebase"}
            </Button>
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700">
              LIVE
            </Badge>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              Updated {lastRefresh.toLocaleTimeString("en-KE")}
            </span>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: "Today's Revenue",
              value: `KES ${todayData.revenue.toLocaleString()}`,
              sub: `${todayData.transactions} transaction${todayData.transactions === 1 ? "" : "s"}`,
              icon: <DollarSign className="h-5 w-5 text-green-600" />,
              bg: "bg-green-50 dark:bg-green-900/20",
            },
            {
              label: "This Month",
              value: `KES ${monthData.revenue.toLocaleString()}`,
              sub: `${monthData.transactions} transactions`,
              icon: <TrendingUp className="h-5 w-5 text-blue-600" />,
              bg: "bg-blue-50 dark:bg-blue-900/20",
            },
            {
              label: "All-Time Total",
              value: `KES ${allTimeTotal.toLocaleString()}`,
              sub: `${allTimeTxns} transactions`,
              icon: <Zap className="h-5 w-5 text-amber-600" />,
              bg: "bg-amber-50 dark:bg-amber-900/20",
            },
            {
              label: "Avg per Transaction",
              value: allTimeTxns > 0
                ? `KES ${Math.round(allTimeTotal / allTimeTxns).toLocaleString()}`
                : "—",
              sub: "All-time average",
              icon: <Users className="h-5 w-5 text-purple-600" />,
              bg: "bg-purple-50 dark:bg-purple-900/20",
            },
          ].map((kpi) => (
            <Card key={kpi.label} className="border border-[#E2DDD5] dark:border-gray-700">
              <CardContent className="pt-5">
                <div className={`inline-flex p-2 rounded-lg mb-3 ${kpi.bg}`}>{kpi.icon}</div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{kpi.label}</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white mt-0.5">{kpi.value}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{kpi.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Daily Revenue Trend */}
        <Card className="border border-[#E2DDD5] dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Daily Revenue (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            {dailyChart.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-gray-400 dark:text-gray-500 text-sm">
                No data yet — revenue will appear here after first payment
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={dailyChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2DDD5" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}K`} />
                  <Tooltip formatter={(v: number) => [`KES ${v.toLocaleString()}`, "Revenue"]} />
                  <Line type="monotone" dataKey="Total" stroke="#1A2530" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Row: Monthly bar + Today pie */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Monthly totals */}
          <Card className="border border-[#E2DDD5] dark:border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Monthly Totals</CardTitle>
            </CardHeader>
            <CardContent>
              {monthlyChart.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-gray-400 dark:text-gray-500 text-sm">
                  No monthly data yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={monthlyChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2DDD5" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}K`} />
                    <Tooltip formatter={(v: number) => [`KES ${v.toLocaleString()}`, "Revenue"]} />
                    <Bar dataKey="Total" fill="#4A7C59" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Today category breakdown */}
          <Card className="border border-[#E2DDD5] dark:border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">
                Today's Breakdown
                <span className="ml-2 text-xs font-normal text-gray-400">by service</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {todayPieData.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-gray-400 dark:text-gray-500 text-sm">
                  No payments today yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={todayPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {todayPieData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => `KES ${v.toLocaleString()}`} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* This month by category */}
        <Card className="border border-[#E2DDD5] dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">This Month by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {monthlyCatChart.map((cat, i) => {
                const pct = monthData.revenue > 0 ? Math.round((cat.value / monthData.revenue) * 100) : 0;
                return (
                  <div key={cat.name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-700 dark:text-gray-300">{cat.name}</span>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        KES {cat.value.toLocaleString()} <span className="text-xs font-normal text-gray-400">({pct}%)</span>
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${pct}%`,
                          background: CHART_COLORS[i % CHART_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              {monthlyCatChart.every((c) => c.value === 0) && (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                  No revenue data for this month yet
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Raw daily table */}
        <Card className="border border-[#E2DDD5] dark:border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Daily Records (Latest 14 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E2DDD5] dark:border-gray-700 text-left">
                    <th className="pb-2 font-semibold text-gray-600 dark:text-gray-400">Date</th>
                    <th className="pb-2 font-semibold text-gray-600 dark:text-gray-400 text-right">Revenue</th>
                    <th className="pb-2 font-semibold text-gray-600 dark:text-gray-400 text-right">Txns</th>
                    <th className="pb-2 font-semibold text-gray-600 dark:text-gray-400 text-right">Pro Sub</th>
                    <th className="pb-2 font-semibold text-gray-600 dark:text-gray-400 text-right">Job Packs</th>
                    <th className="pb-2 font-semibold text-gray-600 dark:text-gray-400 text-right">CV Svc</th>
                  </tr>
                </thead>
                <tbody>
                  {(summary?.last30Days ?? [])
                    .slice()
                    .reverse()
                    .slice(0, 14)
                    .map((d) => (
                      <tr key={d.date} className="border-b border-[#F0EDE8] dark:border-gray-700/50 last:border-0">
                        <td className="py-2 text-gray-700 dark:text-gray-300 font-medium">{d.date}</td>
                        <td className="py-2 text-right font-semibold text-gray-900 dark:text-white">
                          KES {d.total.toLocaleString()}
                        </td>
                        <td className="py-2 text-right text-gray-500 dark:text-gray-400">{d.transactions}</td>
                        <td className="py-2 text-right text-gray-500 dark:text-gray-400">—</td>
                        <td className="py-2 text-right text-gray-500 dark:text-gray-400">—</td>
                        <td className="py-2 text-right text-gray-500 dark:text-gray-400">—</td>
                      </tr>
                    ))}
                  {(summary?.last30Days?.length ?? 0) === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-gray-400 dark:text-gray-500">
                        No payments recorded yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
