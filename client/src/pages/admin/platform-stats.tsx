/**
 * /admin/platform-stats — every platform number with its definition and source
 * (2026-11, AUTHENTIC DATA POLICY). Data: GET /api/admin/platform-stats,
 * GET /api/admin/data-integrity, GET /api/admin/freemium-funnel. Admin only (server-enforced).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const RANGES = [["today", "Today"], ["7d", "Last 7 days"], ["30d", "Last 30 days"], ["90d", "Last 90 days"]] as const;
const fmt = (n: any) => (n == null ? "—" : typeof n === "number" ? n.toLocaleString("en-KE") : String(n));
const getJson = async (u: string) => { const r = await fetch(u, { credentials: "include" }); if (!r.ok) throw new Error(`${r.status}`); return r.json(); };

function Stat({ label, value, def }: { label: string; value: any; def?: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-bold">{fmt(value)}</div>
      {def && <div className="mt-1 text-[11px] leading-snug text-slate-500">{def}</div>}
    </CardContent></Card>
  );
}

export default function AdminPlatformStats() {
  const [range, setRange] = useState<string>("7d");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const qs = from ? `from=${from}${to ? `&to=${to}` : ""}` : `range=${range}`;
  const s = useQuery<any>({ queryKey: ["/api/admin/platform-stats", qs], queryFn: () => getJson(`/api/admin/platform-stats?${qs}`) });
  const integ = useQuery<any>({ queryKey: ["/api/admin/data-integrity"], queryFn: () => getJson("/api/admin/data-integrity") });
  const days = range === "today" ? 1 : range === "30d" ? 30 : range === "90d" ? 90 : 7;
  const funnel = useQuery<any>({ queryKey: ["/api/admin/freemium-funnel", days], queryFn: () => getJson(`/api/admin/freemium-funnel?days=${days}`) });
  const d = s.data; const defs = d?.definitions ?? {};
  const pub = d?.publicNow ?? {};

  return (
    <AdminLayout title="Platform statistics">
      <div className="p-3 sm:p-6 space-y-5 max-w-6xl">
        <div>
          <h1 className="text-2xl font-bold">Platform statistics</h1>
          <p className="text-sm text-slate-500">Every number here comes from the database with a written definition. Staff and test accounts are excluded; each payment receipt is counted once.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {RANGES.map(([k, l]) => (
            <Button key={k} size="sm" variant={!from && range === k ? "default" : "outline"} onClick={() => { setFrom(""); setTo(""); setRange(k); }}>{l}</Button>
          ))}
          <span className="text-xs text-slate-500 ml-2">Custom:</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 rounded border px-2 text-sm bg-transparent" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 rounded border px-2 text-sm bg-transparent" />
          {d?.label && <span className="text-xs text-slate-500">Showing: {d.label}</span>}
        </div>
        {s.isError && <div className="text-rose-600 text-sm">Could not load statistics ({String((s.error as Error).message)}).</div>}

        <section>
          <h2 className="font-semibold mb-2">Members (now)</h2>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Stat label="Registered members" value={d?.members?.registered_total} def={defs.registeredMembers} />
            <Stat label="Verified members" value={d?.members?.verified_total} def={defs.verifiedMembers} />
            <Stat label="Active subscribers" value={pub.activeSubscribers} def={defs.activeSubscribers} />
            <Stat label="New registrations (range)" value={d?.members?.new_registrations} def="Real members created in the selected range." />
          </div>
          <div className="mt-2 text-xs text-slate-500">Excluded: {fmt(d?.members?.deleted_total)} deleted · {fmt(d?.members?.internal_or_test_total)} staff/test accounts.</div>
        </section>

        <section>
          <h2 className="font-semibold mb-2">Subscriptions & payments (range)</h2>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Stat label="New paying members" value={d?.newPaying?.new_paying_members} def={defs.newPayingMembers7d?.replace("last 7 days", "selected range")} />
            <Stat label="Verified plan payments (unique receipts)" value={d?.newPaying?.verified_plan_payments_unique} />
            <Stat label="Verified plan revenue (KES, deduplicated)" value={d?.newPaying?.verified_plan_revenue_kes} />
            <Stat label="Monthly / Yearly / Trial" value={`${fmt(d?.newPaying?.monthly)} / ${fmt(d?.newPaying?.yearly)} / ${fmt(d?.newPaying?.trial)}`} />
          </div>
          <Card className="mt-3"><CardContent className="p-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-500"><th>All payments by outcome</th><th>Rows</th><th>Unique receipts</th><th>Gross of rows (KES)</th></tr></thead>
              <tbody>{(d?.payments ?? []).map((r: any) => (
                <tr key={r.bucket} className="border-t"><td className="py-1">{r.bucket.replaceAll("_", " ")}</td><td>{fmt(r.rows)}</td><td>{fmt(r.unique_receipts)}</td><td>{fmt(Number(r.gross_rows_kes))}</td></tr>
              ))}</tbody>
            </table>
            <p className="mt-2 text-[11px] text-slate-500">Pending, failed and cancelled payments never count as revenue or upgrades. If "Rows" is higher than "Unique receipts", duplicate records exist — see Data integrity.</p>
          </CardContent></Card>
          <div className="mt-2 text-xs text-slate-500">Active subscribers by plan: {(d?.activeSubscribersByPlan ?? []).map((r: any) => `${r.plan} ${r.active}`).join(" · ") || "—"}</div>
        </section>

        <section>
          <h2 className="font-semibold mb-2">Activity (range)</h2>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {(d?.toolUsage ?? []).slice(0, 8).map((t: any) => <Stat key={t.tool_name} label={t.tool_name.replaceAll("_", " ")} value={t.uses} def="Completed uses (recorded after a successful result)." />)}
            {(d?.jobs ?? []).map((j: any) => <Stat key={j.src} label={`${j.src.replace("_", " ")} — live / published in range`} value={`${fmt(j.live)} / ${fmt(j.published_in_range)}`} />)}
          </div>
        </section>

        <section>
          <h2 className="font-semibold mb-2">Agencies (NEA register)</h2>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Stat label="On current register" value={pub.agenciesOnRegister} def={defs.agenciesOnRegister} />
            <Stat label="Expired (on register)" value={pub.agenciesExpiredOnRegister} def={defs.agenciesExpiredOnRegister} />
            <Stat label="Revoked (on register)" value={pub.agenciesRevokedOnRegister} def={defs.agenciesRevokedOnRegister} />
            <Stat label="No longer listed by NEA" value={pub.agenciesNoLongerListed} def={defs.agenciesNoLongerListed} />
          </div>
          <div className="mt-2 text-xs text-slate-500">Register last checked: {pub.agencyDataCheckedAt ? new Date(pub.agencyDataCheckedAt).toLocaleString("en-KE") : "—"}</div>
        </section>

        <section>
          <h2 className="font-semibold mb-2">Upgrade funnel (last {days} days)</h2>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {Object.entries(funnel.data?.events ?? {}).map(([k, v]) => <Stat key={k} label={k.replaceAll("_", " ")} value={v} />)}
          </div>
        </section>

        <section>
          <h2 className="font-semibold mb-2">Data integrity</h2>
          <Card><CardContent className="p-4 space-y-2">
            {(integ.data?.checks ?? []).map((c: any) => (
              <div key={c.label} className="flex items-start justify-between gap-3 text-sm border-b last:border-0 pb-2">
                <div><div className="font-medium">{c.label}</div><div className="text-xs text-slate-500">{c.hint}</div></div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${c.count === 0 ? "bg-emerald-100 text-emerald-800" : c.count == null ? "bg-slate-100 text-slate-700" : "bg-amber-100 text-amber-800"}`}>{c.count == null ? "error" : c.count === 0 ? "OK" : fmt(c.count)}</span>
              </div>
            ))}
          </CardContent></Card>
        </section>
      </div>
    </AdminLayout>
  );
}
