import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin-layout";

interface Payment {
  phone?: string;
  amount?: number;
  mpesa_code?: string;
  status?: string;
}

interface Stats {
  users: number;
  revenue: number;
  active_pro: number;
  payments: Payment[];
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/stats", { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        setStats(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Admin fetch error:", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <AdminLayout title="Supabase Stats">
        <div className="p-6 text-lg">Loading dashboard...</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Supabase Stats">
      <div className="p-6 space-y-6">

        <h1 className="text-2xl font-bold">Admin Dashboard</h1>

        {/* STATS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          <div className="p-4 bg-white shadow rounded dark:bg-card">
            <h2 className="text-gray-500">Users</h2>
            <p className="text-2xl font-bold">{stats?.users ?? 0}</p>
          </div>

          <div className="p-4 bg-white shadow rounded dark:bg-card">
            <h2 className="text-gray-500">Revenue (KES)</h2>
            <p className="text-2xl font-bold">{stats?.revenue ?? 0}</p>
          </div>

          <div className="p-4 bg-white shadow rounded dark:bg-card">
            <h2 className="text-gray-500">Active PRO</h2>
            <p className="text-2xl font-bold">{stats?.active_pro ?? 0}</p>
          </div>

        </div>

        {/* PAYMENTS TABLE */}
        <div className="bg-white shadow rounded p-4 dark:bg-card">
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
                <tr key={i} className="border-b">
                  <td className="p-2">{p.phone ?? "—"}</td>
                  <td className="p-2">{p.amount ?? "—"}</td>
                  <td className="p-2">{p.mpesa_code ?? "—"}</td>
                  <td className="p-2">{p.status ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </AdminLayout>
  );
}
