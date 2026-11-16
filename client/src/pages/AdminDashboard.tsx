/**
 * Admin home — plain-English overview (2026-11 rewrite).
 *
 * Tony: "how can I read this surely". The old page mixed a cached revenue
 * figure that didn't match Finance, an unreadable white funnel chart built
 * from a sparse event table, and two tables that were always empty. This
 * page reads ONE endpoint (/api/admin/overview) whose revenue definition is
 * the same as Finance → Overview, and explains every number in words.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import { Link } from "wouter";
import AdminLayout from "@/components/admin-layout";
import { Loader2, Wallet, Users, Crown, Radio, ArrowRight, AlertTriangle } from "lucide-react";

interface Overview {
  revenue: { today: number; todayPayments: number; week: number; month: number; monthPayments: number; allTime: number };
  users: { total: number; today: number; week: number };
  activePlans: { total: number; monthly: number; yearly: number; trial: number };
  onlineNow: number;
  funnel30d: { signedUp: number; verified: number; triedToPay: number; paid: number };
  recentPayments: { at: string; customer: string; amount: number; currency: string; method: string; receipt: string | null; what: string; unmatched: boolean }[];
  topSellers30d: { what: string; count: number; kes: number }[];
  generatedAt: string;
}

const kes = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—");
function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short" });
}

function Card({ icon: Icon, label, value, sub, tone }: { icon: any; label: string; value: string; sub: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
        <span className={`h-8 w-8 rounded-lg flex items-center justify-center ${tone}`}><Icon className="h-4 w-4" /></span>
        {label}
      </div>
      <p className="mt-3 text-3xl font-extrabold text-slate-900 dark:text-white tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{sub}</p>
    </div>
  );
}

export default function AdminDashboard() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery<Overview>({ queryKey: ["/api/admin/overview"], refetchInterval: 60_000 });
  const [banner, setBanner] = useState<string | null>(null);

  // Live "new payment" nudge (admin-only socket room) → refresh the numbers.
  useEffect(() => {
    const socket = io();
    socket.on("new_payment", (d: { amount?: number }) => {
      setBanner(`New payment received: KES ${(d?.amount ?? 0).toLocaleString("en-KE")}`);
      setTimeout(() => setBanner(null), 6000);
      setTimeout(() => qc.invalidateQueries({ queryKey: ["/api/admin/overview"] }), 3000);
    });
    return () => { socket.disconnect(); };
  }, [qc]);

  return (
    <AdminLayout title="Admin Dashboard">
      <div className="p-4 sm:p-6 space-y-6 max-w-6xl">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Today at a glance</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Money is <strong>verified payments only</strong> — the same numbers as Finance &amp; Reconciliation. Kenya time. Refreshes every minute.
          </p>
        </div>

        {banner && <div className="rounded-xl bg-emerald-600 text-white px-4 py-3 font-semibold" data-testid="banner-payment">💰 {banner}</div>}

        {isLoading && <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>}
        {error && <div className="rounded-xl bg-rose-50 text-rose-800 p-4">Couldn't load the overview: {(error as Error).message}</div>}

        {data && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card icon={Wallet} tone="bg-emerald-100 text-emerald-700" label="Money in today"
                value={kes(data.revenue.today)}
                sub={`${data.revenue.todayPayments} payment${data.revenue.todayPayments === 1 ? "" : "s"} · this month ${kes(data.revenue.month)}`} />
              <Card icon={Users} tone="bg-blue-100 text-blue-700" label="New sign-ups today"
                value={data.users.today.toLocaleString("en-KE")}
                sub={`${data.users.week.toLocaleString("en-KE")} this week · ${data.users.total.toLocaleString("en-KE")} accounts in total`} />
              <Card icon={Crown} tone="bg-amber-100 text-amber-700" label="People on a paid plan"
                value={data.activePlans.total.toLocaleString("en-KE")}
                sub={`${data.activePlans.monthly} Monthly · ${data.activePlans.yearly} Yearly${data.activePlans.trial ? ` · ${data.activePlans.trial} old trial` : ""}`} />
              <Card icon={Radio} tone="bg-violet-100 text-violet-700" label="Signed-in users online now"
                value={data.onlineNow.toLocaleString("en-KE")}
                sub="active in the last 10 minutes" />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Money summary */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
                <h2 className="font-bold text-slate-900 dark:text-white">Money summary</h2>
                <dl className="mt-3 divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {[
                    ["Today", kes(data.revenue.today)],
                    ["Last 7 days", kes(data.revenue.week)],
                    ["This month", `${kes(data.revenue.month)} (${data.revenue.monthPayments} payments)`],
                    ["All time", kes(data.revenue.allTime)],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between py-2.5"><dt className="text-slate-600 dark:text-slate-400">{k}</dt><dd className="font-bold text-slate-900 dark:text-white tabular-nums">{v}</dd></div>
                  ))}
                </dl>
                <Link href="/admin/finance" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline">Full finance report <ArrowRight className="h-4 w-4" /></Link>
              </div>

              {/* Funnel as plain bars */}
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
                <h2 className="font-bold text-slate-900 dark:text-white">From sign-up to paying — last 30 days</h2>
                <p className="text-xs text-slate-500 mt-0.5">People who created an account in the last 30 days, and how far they got.</p>
                <div className="mt-4 space-y-3">
                  {[
                    { label: "Created an account", n: data.funnel30d.signedUp, base: data.funnel30d.signedUp, color: "bg-indigo-500" },
                    { label: "Confirmed their email", n: data.funnel30d.verified, base: data.funnel30d.signedUp, color: "bg-blue-500" },
                    { label: "Started a payment", n: data.funnel30d.triedToPay, base: data.funnel30d.signedUp, color: "bg-amber-500" },
                    { label: "Paid", n: data.funnel30d.paid, base: data.funnel30d.signedUp, color: "bg-emerald-500" },
                  ].map((s) => (
                    <div key={s.label}>
                      <div className="flex justify-between text-sm"><span className="text-slate-700 dark:text-slate-300">{s.label}</span><span className="font-bold tabular-nums text-slate-900 dark:text-white">{s.n.toLocaleString("en-KE")} <span className="font-normal text-slate-500">({pct(s.n, s.base)})</span></span></div>
                      <div className="mt-1 h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className={`h-full ${s.color}`} style={{ width: `${s.base ? Math.max(1.5, (s.n / s.base) * 100) : 0}%` }} /></div>
                    </div>
                  ))}
                </div>
                {data.funnel30d.triedToPay > 0 && (
                  <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
                    {pct(data.funnel30d.paid, data.funnel30d.triedToPay)} of people who started a payment finished it.
                  </p>
                )}
              </div>
            </div>

            {/* Recent payments */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h2 className="font-bold text-slate-900 dark:text-white">Latest payments</h2>
                <Link href="/admin/finance" className="text-sm font-semibold text-emerald-700 hover:underline">See all</Link>
              </div>
              {data.recentPayments.length === 0 ? (
                <p className="p-5 text-sm text-slate-500">No verified payments yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.recentPayments.map((p, i) => (
                    <li key={i} className="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" data-testid={`row-payment-${i}`}>
                      <span className="font-bold tabular-nums text-slate-900 dark:text-white w-28">{kes(p.amount)}</span>
                      <span className="flex-1 min-w-[180px] text-slate-800 dark:text-slate-200">{p.what} <span className="text-slate-500">· {p.customer}</span></span>
                      <span className="text-xs text-slate-500">{p.method === "paypal" ? "PayPal" : "M-Pesa"}{p.receipt ? ` · ${p.receipt}` : ""}</span>
                      {p.unmatched && <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> needs matching</span>}
                      <span className="text-xs text-slate-500 w-20 text-right">{ago(p.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Top sellers */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
              <h2 className="font-bold text-slate-900 dark:text-white">What sold in the last 30 days</h2>
              <div className="mt-3 space-y-2">
                {data.topSellers30d.map((t) => {
                  const max = Math.max(...data.topSellers30d.map((x) => x.kes), 1);
                  return (
                    <div key={t.what}>
                      <div className="flex justify-between text-sm"><span className="text-slate-700 dark:text-slate-300">{t.what} <span className="text-slate-500">× {t.count}</span></span><span className="font-bold tabular-nums text-slate-900 dark:text-white">{kes(t.kes)}</span></div>
                      <div className="mt-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${(t.kes / max) * 100}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="text-xs text-slate-500">Updated {new Date(data.generatedAt).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}.</p>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
