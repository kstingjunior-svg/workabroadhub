import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import AdminLayout from "@/components/admin-layout";
import { FunnelChart, Funnel, Tooltip, LabelList } from "recharts";

interface Payment {
  phone?: string;
  amount?: number;
  mpesa_code?: string;
  status?: string;
}

interface UserEvent {
  id?: number;
  user_id?: string;
  event?: string;
  page?: string;
  created_at?: string;
}

interface Stats {
  users: number;
  revenue: number;
  active_pro: number;
  live_users: number;
  payments: Payment[];
  events: UserEvent[];
}

interface FunnelData {
  signup: number;
  viewJobs: number;
  upgrade: number;
  payment: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [paymentBanner, setPaymentBanner] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/funnel", { credentials: "include" })
      .then(res => res.json())
      .then(setFunnel)
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/admin/stats", { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        setStats(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const socket = io();

    socket.on("user_active", () => {});

    socket.on("new_payment", (data: { amount?: number }) => {
      setStats(prev => prev ? ({ ...prev, revenue: prev.revenue + (data.amount ?? 0) }) : prev);
      setPaymentBanner(`💰 New payment received: KES ${data.amount ?? 0}`);
      setTimeout(() => setPaymentBanner(null), 5000);
    });

    socket.on("user_upgraded", () => {
      setStats(prev => prev ? ({ ...prev, active_pro: prev.active_pro + 1 }) : prev);
    });

    return () => { socket.disconnect(); };
  }, []);

  if (loading) {
    return (
      <AdminLayout title="Admin Dashboard">
        <div className="p-6 text-lg">Loading dashboard...</div>
      </AdminLayout>
    );
  }

  const funnelData = funnel ? [
    { name: "Signup",        value: funnel.signup,   fill: "#6366f1" },
    { name: "View Jobs",     value: funnel.viewJobs, fill: "#3b82f6" },
    { name: "Upgrade Click", value: funnel.upgrade,  fill: "#f59e0b" },
    { name: "Payment",       value: funnel.payment,  fill: "#10b981" },
  ] : [];

  return (
    <AdminLayout title="Admin Dashboard">
      <div className="p-6 space-y-6 bg-gray-900 text-white min-h-screen">

        {paymentBanner && (
          <div className="bg-green-600 text-white px-4 py-2 rounded font-medium" data-testid="banner-payment">
            {paymentBanner}
          </div>
        )}

        <h1 className="text-2xl font-bold">Admin Dashboard</h1>

        {/* STATS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 bg-gray-800 shadow rounded" data-testid="stat-users">
            <h2 className="text-gray-400">Users</h2>
            <p className="text-2xl font-bold text-white">{stats?.users ?? 0}</p>
          </div>
          <div className="p-4 bg-gray-800 shadow rounded" data-testid="stat-revenue">
            <h2 className="text-gray-400">Revenue (KES)</h2>
            <p className="text-2xl font-bold text-white">{stats?.revenue ?? 0}</p>
          </div>
          <div className="p-4 bg-gray-800 shadow rounded" data-testid="stat-pro">
            <h2 className="text-gray-400">Active PRO</h2>
            <p className="text-2xl font-bold text-white">{stats?.active_pro ?? 0}</p>
          </div>
          <div className="p-4 bg-gray-800 shadow rounded" data-testid="stat-live">
            <h2 className="text-gray-400">Live Now</h2>
            <p className="text-2xl font-bold text-green-400">{stats?.live_users ?? 0}</p>
          </div>
        </div>

        {/* CONVERSION FUNNEL */}
        {funnelData.length > 0 && (
          <div className="bg-white p-4 rounded shadow">
            <h2 className="text-lg font-bold mb-4 text-gray-900">Conversion Funnel</h2>
            <FunnelChart width={400} height={300}>
              <Tooltip />
              <Funnel dataKey="value" data={funnelData} isAnimationActive>
                <LabelList
                  position="right"
                  fill="#000"
                  formatter={(value: number, _entry: unknown, index: number) => {
                    if (index === 0) return `${value}`;
                    const prev = funnelData[index - 1]?.value ?? 1;
                    const percent = prev > 0 ? ((value / prev) * 100).toFixed(1) : "0.0";
                    return `${value} (${percent}%)`;
                  }}
                />
              </Funnel>
            </FunnelChart>
          </div>
        )}

        {/* PAYMENTS TABLE */}
        <div className="bg-gray-800 shadow rounded p-4">
          <h2 className="text-lg font-semibold mb-3">Recent Payments</h2>
          <table className="w-full text-left border">
            <thead>
              <tr className="border-b">
                <th className="p-2">Phone</th>
                <th className="p-2">Amount</th>
                <th className="p-2">Code</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {stats?.payments?.map((p, i) => (
                <tr key={i} className="border-b" data-testid={`row-payment-${i}`}>
                  <td className="p-2">{p.phone ?? "—"}</td>
                  <td className="p-2">{p.amount ?? "—"}</td>
                  <td className="p-2">{p.mpesa_code ?? "—"}</td>
                  <td className="p-2">{p.status ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="text-lg font-semibold mt-6">User Activity</h2>
        {stats?.events?.map((e, i) => (
          <div key={i} className="border-b p-2" data-testid={`row-event-${i}`}>
            {e.user_id} → {e.event} ({e.page})
          </div>
        ))}

      </div>
    </AdminLayout>
  );
}
