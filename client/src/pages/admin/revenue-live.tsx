import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import { TrendingUp, DollarSign, Users, Zap, DatabaseZap } from "lucide-react";
import {
  ref, onValue, off,
} from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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

const CATEGORY_LABELS: Record<string, string> = {
  consultation_fees:     "Pro Subscriptions",
  job_packs:             "Job Application Packs",
  cv_services:           "CV Services",
  university_applications: "University Applications",
  other:                 "Other",
};

const CHART_COLORS = ["#1A2530", "#4A7C59", "#E6A700", "#4CAF50", "#8B7A66"];

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useDailyRevenue(): Record<string, DailyRevenue> {
  const [data, setData] = useState<Record<string, DailyRevenue>>({});
  useEffect(() => {
    const r = ref(rtdb, "revenue/daily");
    const unsub = onValue(r, (snap) => setData((snap.val() as Record<string, DailyRevenue>) || {}));
    return () => off(r, "value", unsub as any);
  }, []);
  return data;
}

function useMonthlyRevenue(): Record<string, MonthlyRevenue> {
  const [data, setData] = useState<Record<string, MonthlyRevenue>>({});
  useEffect(() => {
    const r = ref(rtdb, "revenue/monthly");
    const unsub = onValue(r, (snap) => setData((snap.val() as Record<string, MonthlyRevenue>) || {}));
    return () => off(r, "value", unsub as any);
  }, []);
  return data;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RevenueLivePage() {
  const daily = useDailyRevenue();
  const monthly = useMonthlyRevenue();
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [backfilling, setBackfilling] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const t = setInterval(() => setLastRefresh(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  async function handleBackfill() {
    setBackfilling(true);
    try {
      const res = await apiRequest("POST", "/api/admin/revenue/backfill");
      const data = await res.json();
      toast({
        title: "Backfill complete",
        description: `${data.pushed} payments pushed to Firebase (${data.failed} failed). Dashboard will update in a moment.`,
      });
    } catch {
      toast({ title: "Backfill failed", description: "Check server logs for details.", variant: "destructive" });
    } finally {
      setBackfilling(false);
    }
  }

  // Today's key (local time)
  const todayKey = new Date().toISOString().slice(0, 10);
  const monthKey  = new Date().toISOString().slice(0, 7);

  const todayData = daily[todayKey] || { total: 0, transactions: 0 };
  const monthData = monthly[monthKey] || { total: 0, transactions: 0 };

  // Last 30 daily records sorted by date
  const dailyChart = Object.entries(daily)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-30)
    .map(([date, d]) => ({
      date: date.slice(5), // MM-DD
      Total: d.total || 0,
      Txns: d.transactions || 0,
    }));

  // Category breakdown for today
  const categories = ["consultation_fees", "job_packs", "cv_services", "university_applications", "other"];
  const todayPieData = categories
    .map((cat) => ({
      name: CATEGORY_LABELS[cat],
      value: (todayData as any)[cat] || 0,
    }))
    .filter((d) => d.value > 0);

  // Monthly total by category
  const monthlyCatChart = categories.map((cat) => ({
    name: CATEGORY_LABELS[cat],
    value: (monthData as any)[cat] || 0,
  }));

  // All-time total
  const allTimeTotal = Object.values(monthly).reduce((s, m) => s + (m.total || 0), 0);
  const allTimeTxns  = Object.values(monthly).reduce((s, m) => s + (m.transactions || 0), 0);

  // Monthly chart
  const monthlyChart = Object.entries(monthly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, m]) => ({ month, Total: m.total || 0 }));

  return (
    <AdminLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">🔥 Live Revenue Dashboard</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Real-time data from Firebase · Updates live
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handleBackfill}
              disabled={backfilling}
              data-testid="button-backfill-revenue"
              className="gap-1.5 text-xs"
              title="Push all historical completed payments into Firebase so the dashboard shows real numbers"
            >
              <DatabaseZap className={`h-3.5 w-3.5 ${backfilling ? "animate-pulse" : ""}`} />
              {backfilling ? "Backfilling…" : "Sync Historical Data"}
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
              value: `KES ${todayData.total.toLocaleString()}`,
              sub: `${todayData.transactions} transaction${todayData.transactions === 1 ? "" : "s"}`,
              icon: <DollarSign className="h-5 w-5 text-green-600" />,
              bg: "bg-green-50 dark:bg-green-900/20",
            },
            {
              label: "This Month",
              value: `KES ${monthData.total.toLocaleString()}`,
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
                const pct = monthData.total > 0 ? Math.round((cat.value / monthData.total) * 100) : 0;
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
                  {Object.entries(daily)
                    .sort(([a], [b]) => b.localeCompare(a))
                    .slice(0, 14)
                    .map(([date, d]) => (
                      <tr key={date} className="border-b border-[#F0EDE8] dark:border-gray-700/50 last:border-0">
                        <td className="py-2 text-gray-700 dark:text-gray-300 font-medium">{date}</td>
                        <td className="py-2 text-right font-semibold text-gray-900 dark:text-white">
                          KES {(d.total || 0).toLocaleString()}
                        </td>
                        <td className="py-2 text-right text-gray-500 dark:text-gray-400">{d.transactions || 0}</td>
                        <td className="py-2 text-right text-gray-500 dark:text-gray-400">
                          {d.consultation_fees ? `KES ${d.consultation_fees.toLocaleString()}` : "—"}
                        </td>
                        <td className="py-2 text-right text-gray-500 dark:text-gray-400">
                          {d.job_packs ? `KES ${d.job_packs.toLocaleString()}` : "—"}
                        </td>
                        <td className="py-2 text-right text-gray-500 dark:text-gray-400">
                          {d.cv_services ? `KES ${d.cv_services.toLocaleString()}` : "—"}
                        </td>
                      </tr>
                    ))}
                  {Object.keys(daily).length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-gray-400 dark:text-gray-500">
                        No daily records in Firebase yet
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
