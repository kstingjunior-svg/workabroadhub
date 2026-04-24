import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";
import { DollarSign, TrendingUp, CreditCard, Percent } from "lucide-react";

type StatsData = {
  revenueByType:   { type: string; total: number; count: number }[];
  revenueByDay:    { date: string; total: number }[];
  statusBreakdown: { status: string; count: number; total: number }[];
  totalRevenue:    number;
};

const TYPE_LABELS: Record<string, string> = {
  subscription:  "Subscriptions",
  cv_service:    "CV Service",
  consultation:  "Consultation",
  visa_guide:    "Visa Guide",
  job_post:      "Job Post",
  other:         "Other",
};

const CHART_COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8", "#82CA9D"];

const STATUS_FILL: Record<string, string> = {
  completed:        "#10b981",
  success:          "#10b981",
  pending:          "#f59e0b",
  awaiting_payment: "#8b5cf6",
  retry_available:  "#f97316",
  failed:           "#ef4444",
  refunded:         "#6b7280",
};

async function fetchStats(period: string): Promise<StatsData> {
  let url = "/api/admin/payments/stats";
  if (period !== "all") {
    const days = parseInt(period, 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    url += `?startDate=${startDate.toISOString().split("T")[0]}`;
  }
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch revenue stats");
  return res.json();
}

export default function AdminRevenue() {
  const [period, setPeriod] = useState("30");

  const { data, isLoading } = useQuery<StatsData>({
    queryKey: ["admin-revenue", period],
    queryFn: () => fetchStats(period),
    staleTime: 1000 * 60 * 2,
  });

  const totalTxns  = data?.revenueByType.reduce((s, r) => s + r.count, 0) ?? 0;
  const topService = [...(data?.revenueByType ?? [])].sort((a, b) => b.total - a.total)[0];

  const successCount = (data?.statusBreakdown ?? [])
    .filter(s => s.status === "completed" || s.status === "success")
    .reduce((s, r) => s + r.count, 0);
  const totalStatusCount = (data?.statusBreakdown ?? []).reduce((s, r) => s + r.count, 0);
  const successRate = totalStatusCount > 0 ? Math.round((successCount / totalStatusCount) * 100) : 0;

  const formattedTypeData = (data?.revenueByType ?? []).map(d => ({
    ...d,
    name: TYPE_LABELS[d.type] ?? d.type,
  }));

  const formattedStatusData = (data?.statusBreakdown ?? []).map(d => ({
    name:  d.status.replace(/_/g, " "),
    value: d.count,
    fill:  STATUS_FILL[d.status] ?? "#94a3b8",
  }));

  return (
    <AdminLayout title="Revenue Dashboard">
      <div className="space-y-6">

        {/* Header + period selector */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Revenue Dashboard</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Completed payments · Amounts in KES</p>
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40 h-9 text-sm" data-testid="select-revenue-period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: "Total Revenue",
              value: isLoading ? "—" : `KES ${(data?.totalRevenue ?? 0).toLocaleString()}`,
              sub:   "Successful payments only",
              icon:  DollarSign,
              testId: "kpi-revenue-total",
            },
            {
              label: "Transactions",
              value: isLoading ? "—" : totalTxns.toLocaleString(),
              sub:   "All payment types",
              icon:  CreditCard,
              testId: "kpi-revenue-txns",
            },
            {
              label: "Top Service",
              value: isLoading ? "—" : (topService ? TYPE_LABELS[topService.type] ?? topService.type : "N/A"),
              sub:   "By revenue",
              icon:  TrendingUp,
              testId: "kpi-revenue-top",
            },
            {
              label: "Success Rate",
              value: isLoading ? "—" : `${successRate}%`,
              sub:   "Completed payments",
              icon:  Percent,
              testId: "kpi-revenue-rate",
            },
          ].map(({ label, value, sub, icon: Icon, testId }) => (
            <Card key={label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{label}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid={testId}>
                  {isLoading ? <span className="animate-pulse text-muted-foreground text-base">Loading…</span> : value}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Bar + Pie */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card data-testid="card-revenue-by-type">
            <CardHeader>
              <CardTitle className="text-sm">Revenue by Service Type</CardTitle>
              <CardDescription className="text-xs">Completed payments grouped by category</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-[300px] animate-pulse bg-muted rounded-lg" />
              ) : formattedTypeData.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-16">No data for this period</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={formattedTypeData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis
                      tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                      tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40}
                    />
                    <Tooltip
                      formatter={(v: number) => [`KES ${v.toLocaleString()}`, "Revenue"]}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="total" fill="#0088FE" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-status-breakdown">
            <CardHeader>
              <CardTitle className="text-sm">Payment Status Breakdown</CardTitle>
              <CardDescription className="text-xs">Transaction counts by status</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-[300px] animate-pulse bg-muted rounded-lg" />
              ) : formattedStatusData.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-16">No data for this period</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={formattedStatusData}
                      cx="50%" cy="50%"
                      outerRadius={90}
                      labelLine={false}
                      label={({ name, percent }) =>
                        percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : ""
                      }
                      dataKey="value"
                    >
                      {formattedStatusData.map((entry, i) => (
                        <Cell key={`cell-${i}`} fill={entry.fill ?? CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => [v, "Transactions"]} contentStyle={{ fontSize: 12 }} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Line chart — revenue trend */}
        <Card data-testid="card-revenue-trend">
          <CardHeader>
            <CardTitle className="text-sm">Revenue Trend</CardTitle>
            <CardDescription className="text-xs">Daily completed revenue — last 30 days (fixed window)</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-[300px] animate-pulse bg-muted rounded-lg" />
            ) : (data?.revenueByDay ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-16">No completed payments in the last 30 days</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data!.revenueByDay} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={d => d.slice(5)}
                    tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                    tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40}
                  />
                  <Tooltip
                    formatter={(v: number) => [`KES ${v.toLocaleString()}`, "Revenue"]}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    type="monotone" dataKey="total"
                    stroke="#0088FE" strokeWidth={2}
                    dot={false} name="KES"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

      </div>
    </AdminLayout>
  );
}
