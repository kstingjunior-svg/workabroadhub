/**
 * /admin/finance — Payments & Financial Reconciliation (2026-10).
 *
 * Every confirmed payment answers: what exactly did the customer pay for,
 * and was it delivered? Data: /api/admin/finance/* (server/routes/finance-admin.ts).
 * Gross revenue counts verified M-Pesa money only; duplicates, admin grants
 * and unverified customer-typed receipts are shown but never counted.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Bell, Download, Loader2, RefreshCw, Search, AlertTriangle, CheckCircle2, Undo2, Link2 } from "lucide-react";

const KES = (n: number | null | undefined) => `KES ${Number(n ?? 0).toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
const dt = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" }) : "—");

async function getJson<T = any>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "include" });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.message || `Request failed (${r.status})`);
  return body as T;
}
async function send<T = any>(method: string, url: string, data?: unknown): Promise<T> {
  const r = await apiRequest(method, url, data);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.message || `Request failed (${r.status})`);
  return body as T;
}

const DELIVERY_STYLE: Record<string, string> = {
  delivered: "bg-emerald-100 text-emerald-800", active: "bg-emerald-100 text-emerald-800", expired: "bg-slate-100 text-slate-700",
  awaiting_delivery: "bg-amber-100 text-amber-800", processing: "bg-sky-100 text-sky-800", not_activated: "bg-rose-100 text-rose-800",
  delivery_failed: "bg-rose-100 text-rose-800", unattributed: "bg-orange-100 text-orange-800", refunded: "bg-violet-100 text-violet-800",
  pending_payment: "bg-slate-100 text-slate-600", unverified: "bg-slate-100 text-slate-600",
};
const RECON_STYLE: Record<string, string> = {
  matched: "bg-emerald-50 text-emerald-700", manually_matched: "bg-emerald-50 text-emerald-700", unmatched: "bg-orange-100 text-orange-800",
  unverified_receipt: "bg-rose-100 text-rose-800", duplicate: "bg-slate-100 text-slate-600", admin_grant: "bg-indigo-50 text-indigo-700",
  test: "bg-slate-100 text-slate-600", not_confirmed: "bg-slate-50 text-slate-500",
};
const label = (s: string | null | undefined) => (s ? s.replace(/_/g, " ") : "—");
function Pill({ v, map }: { v: string | null | undefined; map: Record<string, string> }) {
  return <span className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ${map[String(v)] ?? "bg-slate-100 text-slate-600"}`}>{label(v)}</span>;
}

type Tab = "overview" | "register" | "unmatched" | "refunds" | "alerts";

export default function AdminFinance() {
  const [tab, setTab] = useState<Tab>("overview");
  const [traceId, setTraceId] = useState<string | null>(null);
  const summary = useQuery({ queryKey: ["/api/admin/finance/summary"], queryFn: () => getJson("/api/admin/finance/summary"), refetchInterval: 60_000 });
  const s: any = summary.data;

  return (
    <AdminLayout title="Finance & Reconciliation">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {(["overview", "register", "unmatched", "refunds", "alerts"] as Tab[]).map((t) => (
            <Button key={t} size="sm" variant={tab === t ? "default" : "outline"} onClick={() => setTab(t)} data-testid={`fin-tab-${t}`}>
              {t === "overview" ? "Overview" : t === "register" ? "Payment register" : t === "unmatched" ? `Unmatched${s ? ` (${s.unmatched.count + s.unverifiedReceipts.count})` : ""}` : t === "refunds" ? `Refunds${s?.refunds?.open ? ` (${s.refunds.open})` : ""}` : (
                <span className="inline-flex items-center gap-1"><Bell className="h-3.5 w-3.5" /> Alerts{s?.unreadAlerts ? <Badge className="ml-1 h-4 px-1 text-[10px]">{s.unreadAlerts}</Badge> : null}</span>
              )}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => summary.refetch()} className="ml-auto"><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
        </div>

        {tab === "overview" && <Overview s={s} loading={summary.isLoading} error={summary.error as any} onService={(k) => { setTab("register"); setTimeout(() => window.dispatchEvent(new CustomEvent("fin:service", { detail: k })), 0); }} />}
        {tab === "register" && <Register onOpen={setTraceId} services={s?.byService ?? []} />}
        {tab === "unmatched" && <Unmatched onOpen={setTraceId} />}
        {tab === "refunds" && <Refunds onOpen={setTraceId} />}
        {tab === "alerts" && <Alerts onOpen={setTraceId} />}
      </div>
      <Trace id={traceId} onClose={() => setTraceId(null)} />
    </AdminLayout>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────── */
function Stat({ title, value, sub, tone }: { title: string; value: string; sub?: string; tone?: "warn" | "bad" | "good" }) {
  const t = tone === "bad" ? "border-rose-200" : tone === "warn" ? "border-amber-200" : tone === "good" ? "border-emerald-200" : "";
  return (
    <Card className={t}><CardContent className="p-4">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="text-xl font-semibold mt-1">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </CardContent></Card>
  );
}
function Overview({ s, loading, error, onService }: { s: any; loading: boolean; error: Error | null; onService: (k: string) => void }) {
  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (error) return <Card><CardContent className="p-6 text-rose-700">{error.message}</CardContent></Card>;
  if (!s) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat title="Gross verified collections" value={KES(s.gross)} sub={`${s.grossCount.toLocaleString()} payments`} tone="good" />
        <Stat title="Completed refunds" value={KES(s.refunded)} sub={`${s.refunds.completed} refunds`} />
        <Stat title="Net collections" value={KES(s.net)} tone="good" />
        <Stat title="Today / 7 days / month" value={KES(s.today)} sub={`${KES(s.week)} · ${KES(s.month)}`} />
        <Stat title="Awaiting delivery" value={String(s.awaitingDelivery)} sub="paid, not yet delivered / activated" tone={s.awaitingDelivery ? "warn" : undefined} />
        <Stat title="Unmatched Paybill money" value={KES(s.unmatched.kes)} sub={`${s.unmatched.count} payments to reconcile`} tone={s.unmatched.count ? "warn" : undefined} />
        <Stat title="Unverified customer receipts" value={KES(s.unverifiedReceipts.kes)} sub={`${s.unverifiedReceipts.count} — not counted as revenue`} tone={s.unverifiedReceipts.count ? "bad" : undefined} />
        <Stat title="Refunds open" value={String(s.refunds.open)} sub={`${KES(s.refunds.outstandingKes)} approved, not yet paid`} tone={s.refunds.open ? "warn" : undefined} />
        <Stat title="Pending (7 days)" value={String(s.pending)} />
        <Stat title="Failed (30 days)" value={String(s.failed30d)} />
        <Stat title="Duplicate rows (excluded)" value={String(s.duplicates.count)} sub={`${KES(s.duplicates.kes)} would have been double-counted`} />
        <Stat title="Admin grants (no money)" value={String(s.adminGrants)} />
      </div>
      <Card><CardContent className="p-0">
        <div className="px-4 py-3 border-b"><p className="font-semibold">Revenue by service & plan</p><p className="text-xs text-muted-foreground">Attributed verified payments only. Click a row to see its payments.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground"><tr className="text-left"><th className="px-4 py-2">Service / plan</th><th>Type</th><th className="text-right">Payments</th><th className="text-right">Revenue</th><th className="text-right pr-4">Not yet delivered</th></tr></thead>
            <tbody>
              {s.byService.map((r: any) => (
                <tr key={`${r.kind}:${r.key}`} className="border-t hover:bg-muted/40 cursor-pointer" onClick={() => r.key && onService(r.key)}>
                  <td className="px-4 py-2 font-medium">{r.label}</td>
                  <td className="text-xs">{r.kind}</td>
                  <td className="text-right">{r.count.toLocaleString()}</td>
                  <td className="text-right">{KES(r.kes)}</td>
                  <td className={`text-right pr-4 ${r.undelivered ? "text-amber-700 font-medium" : "text-muted-foreground"}`}>{r.undelivered}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent></Card>
      <p className="text-xs text-muted-foreground">{s.notes}</p>
    </div>
  );
}

/* ── Register ─────────────────────────────────────────────────────────── */
function Register({ onOpen, services }: { onOpen: (id: string) => void; services: any[] }) {
  const [f, setF] = useState<Record<string, string>>({ paymentStatus: "confirmed" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => { const h = (e: any) => { setF((x) => ({ ...x, service: String(e.detail) })); setPage(1); }; window.addEventListener("fin:service", h); return () => window.removeEventListener("fin:service", h); }, []);
  useEffect(() => { const t = setTimeout(() => { setF((x) => ({ ...x, search })); setPage(1); }, 300); return () => clearTimeout(t); }, [search]);
  const qs = useMemo(() => { const p = new URLSearchParams(); Object.entries(f).forEach(([k, v]) => v && p.set(k, v)); p.set("page", String(page)); return p.toString(); }, [f, page]);
  const q = useQuery({ queryKey: ["/api/admin/finance/register", qs], queryFn: () => getJson(`/api/admin/finance/register?${qs}`) });
  const d: any = q.data;
  const set = (k: string) => (e: any) => { setF((x) => ({ ...x, [k]: e.target.value })); setPage(1); };
  const sel = "h-9 rounded-md border bg-background px-2 text-sm";
  return (
    <Card><CardContent className="p-4 space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative w-full sm:w-72"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8 h-9" placeholder="Customer, receipt, order (WA-…), service" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <select className={sel} value={f.service ?? ""} onChange={set("service")}><option value="">All services & plans</option>{services.map((s: any) => <option key={s.key} value={s.key ?? ""}>{s.label}</option>)}</select>
        <select className={sel} value={f.paymentStatus ?? ""} onChange={set("paymentStatus")}><option value="">Any payment status</option><option value="confirmed">Confirmed</option><option value="pending">Pending</option><option value="failed">Failed</option></select>
        <select className={sel} value={f.recon ?? ""} onChange={set("recon")}><option value="">Any reconciliation</option>{["matched", "manually_matched", "unmatched", "unverified_receipt", "duplicate", "admin_grant", "test"].map((x) => <option key={x} value={x}>{label(x)}</option>)}</select>
        <select className={sel} value={f.delivery ?? ""} onChange={set("delivery")}><option value="">Any delivery</option>{["awaiting_delivery", "processing", "delivered", "delivery_failed", "not_activated", "active", "expired", "refunded", "unverified"].map((x) => <option key={x} value={x}>{label(x)}</option>)}</select>
        <select className={sel} value={f.refund ?? ""} onChange={set("refund")}><option value="">Any refund</option><option value="none">No refund</option>{["requested", "approved", "processing", "completed", "rejected", "failed"].map((x) => <option key={x} value={x}>{x}</option>)}</select>
        <Input type="date" className="h-9 w-auto" value={f.from ?? ""} onChange={set("from")} aria-label="From" />
        <Input type="date" className="h-9 w-auto" value={f.to ?? ""} onChange={set("to")} aria-label="To" />
        <a className="ml-auto" href={`/api/admin/finance/register?${qs}&format=csv`}><Button size="sm" variant="outline"><Download className="h-4 w-4 mr-1" /> CSV</Button></a>
      </div>
      {q.isLoading ? <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
        : q.error ? <p className="text-rose-700 text-sm">{(q.error as Error).message}</p>
        : (
          <>
            <p className="text-xs text-muted-foreground">{d.total.toLocaleString()} rows · verified revenue in view {KES(d.filteredRevenue)}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground"><tr className="text-left">{["Date", "Customer", "Service / plan", "Order", "M-Pesa receipt", "Amount", "Payment", "Reconciliation", "Delivery", "Refund", ""].map((h) => <th key={h} className="py-2 pr-3 whitespace-nowrap">{h}</th>)}</tr></thead>
                <tbody>
                  {d.rows.map((r: any) => (
                    <tr key={`${r.source}:${r.paymentId}`} className="border-t align-top">
                      <td className="py-2 pr-3 whitespace-nowrap text-xs">{dt(r.date)}</td>
                      <td className="py-2 pr-3 max-w-[180px]"><div className="truncate">{r.customerName || r.customerEmail || <span className="text-muted-foreground">Guest / unlinked</span>}</div>{r.customerName && r.customerEmail && <div className="text-[11px] text-muted-foreground truncate">{r.customerEmail}</div>}</td>
                      <td className="py-2 pr-3">{r.purpose}<div className="text-[11px] text-muted-foreground">{r.purposeKind}</div></td>
                      <td className="py-2 pr-3 font-mono text-xs">{r.orderRef}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{r.receipt || "—"}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{KES(r.amount)}</td>
                      <td className="py-2 pr-3 text-xs">{label(r.paymentStatus)}</td>
                      <td className="py-2 pr-3"><Pill v={r.reconciliation} map={RECON_STYLE} /></td>
                      <td className="py-2 pr-3"><Pill v={r.delivery} map={DELIVERY_STYLE} /></td>
                      <td className="py-2 pr-3 text-xs">{r.refundStatus ?? "—"}</td>
                      <td className="py-2"><Button size="sm" variant="ghost" onClick={() => onOpen(r.paymentId)}>View</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span className="text-xs self-center">Page {page} of {Math.max(1, Math.ceil(d.total / d.pageSize))}</span>
              <Button size="sm" variant="outline" disabled={page * d.pageSize >= d.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </>
        )}
    </CardContent></Card>
  );
}

/* ── Unmatched queue ──────────────────────────────────────────────────── */
function Unmatched({ onOpen }: { onOpen: (id: string) => void }) {
  const q = useQuery({ queryKey: ["/api/admin/finance/unmatched"], queryFn: () => getJson("/api/admin/finance/unmatched") });
  const rows: any[] = (q.data as any)?.rows ?? [];
  if (q.isLoading) return <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (q.error) return <p className="text-rose-700 text-sm">{(q.error as Error).message}</p>;
  return (
    <Card><CardContent className="p-4 space-y-2">
      <p className="text-sm text-muted-foreground">Verified money we can't attribute yet, customer-typed receipts never confirmed by Safaricom, and receipt claims awaiting verification. Nothing here is assigned to a service until you match it with evidence.</p>
      {rows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nothing to reconcile. 🎉</p> : (
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground"><tr className="text-left">{["Date", "Receipt", "Amount", "Account ref / payer", "Why not matched", "Suggested customer", ""].map((h) => <th key={h} className="py-2 pr-3">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-t align-top">
              <td className="py-2 pr-3 text-xs whitespace-nowrap">{dt(r.created_at)}</td>
              <td className="py-2 pr-3 font-mono text-xs">{r.receipt_norm || "—"}<div><Pill v={r.reconciliation_status} map={RECON_STYLE} /></div></td>
              <td className="py-2 pr-3 whitespace-nowrap">{KES(r.amount)}</td>
              <td className="py-2 pr-3 text-xs">{r.account_ref || "—"}{r.payer_first_name ? <div className="text-muted-foreground">{r.payer_first_name}</div> : null}{r.claimant_email ? <div className="text-muted-foreground">claimed by {r.claimant_email}</div> : null}</td>
              <td className="py-2 pr-3 text-xs max-w-[260px]">{r.unmatched_reason || "—"}</td>
              <td className="py-2 pr-3 text-xs">{r.suggested_email ? <>{r.suggested_email}<div className="text-muted-foreground">via {label(r.suggested_via)}</div></> : "—"}</td>
              <td className="py-2"><Button size="sm" variant="outline" onClick={() => onOpen(r.id)}><Link2 className="h-3.5 w-3.5 mr-1" /> Reconcile</Button></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </CardContent></Card>
  );
}

/* ── Refunds ──────────────────────────────────────────────────────────── */
function Refunds({ onOpen }: { onOpen: (id: string) => void }) {
  const q = useQuery({ queryKey: ["/api/admin/finance/refunds"], queryFn: () => getJson("/api/admin/finance/refunds") });
  const rows: any[] = (q.data as any)?.rows ?? [];
  if (q.isLoading) return <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  return (
    <Card><CardContent className="p-4">
      <p className="text-sm text-muted-foreground mb-2">Open a payment (Register → View) to start a refund. A refund is only "completed" once you enter the M-Pesa transaction that returned the money.</p>
      {rows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No refund requests yet.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground"><tr className="text-left">{["Requested", "Customer", "Paid for", "Paid", "Refund", "Status", "Reason", ""].map((h) => <th key={h} className="py-2 pr-3">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-t align-top">
              <td className="py-2 pr-3 text-xs whitespace-nowrap">{dt(r.created_at)}</td>
              <td className="py-2 pr-3 text-xs">{r.customer_email ?? "—"}</td>
              <td className="py-2 pr-3 text-xs">{r.service_name || r.order_slug || r.plan_id || r.service_id || "—"}<div className="font-mono text-muted-foreground">{r.order_ref}</div></td>
              <td className="py-2 pr-3 whitespace-nowrap">{KES(r.paid_amount)}</td>
              <td className="py-2 pr-3 whitespace-nowrap">{KES(r.amount)}</td>
              <td className="py-2 pr-3"><Badge variant="outline">{r.status}</Badge>{r.refund_ref ? <div className="font-mono text-[11px] mt-1">{r.refund_ref}</div> : null}</td>
              <td className="py-2 pr-3 text-xs max-w-[240px]">{r.reason}</td>
              <td className="py-2"><Button size="sm" variant="ghost" onClick={() => onOpen(r.payment_id)}>Open</Button></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </CardContent></Card>
  );
}

/* ── Alerts ───────────────────────────────────────────────────────────── */
function Alerts({ onOpen }: { onOpen: (id: string) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["/api/admin/finance/notifications"], queryFn: () => getJson("/api/admin/finance/notifications"), refetchInterval: 30_000 });
  const d: any = q.data;
  async function readAll() { await send("POST", "/api/admin/finance/notifications/read", {}); qc.invalidateQueries({ queryKey: ["/api/admin/finance/notifications"] }); qc.invalidateQueries({ queryKey: ["/api/admin/finance/summary"] }); }
  if (q.isLoading) return <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  return (
    <Card><CardContent className="p-4 space-y-2">
      <div className="flex items-center justify-between"><p className="text-sm">{d?.unread ?? 0} unread</p>{d?.unread ? <Button size="sm" variant="outline" onClick={readAll}>Mark all read</Button> : null}</div>
      {(d?.rows ?? []).length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No alerts yet. New verified payments appear here within a minute.</p> :
        (d.rows as any[]).map((n) => (
          <div key={n.id} className={`rounded-lg border p-3 ${n.is_read ? "opacity-70" : "border-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20"}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-sm">{n.kind === "unmatched" || n.kind === "review" ? <AlertTriangle className="inline h-4 w-4 mr-1 text-amber-600" /> : <CheckCircle2 className="inline h-4 w-4 mr-1 text-emerald-600" />}{n.title}</p>
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">{dt(n.created_at)}</span>
            </div>
            <pre className="mt-1 whitespace-pre-wrap font-sans text-xs text-muted-foreground">{n.body}</pre>
            {n.payment_id && <Button size="sm" variant="link" className="px-0 h-auto" onClick={() => onOpen(n.payment_id)}>Open payment {n.order_ref}</Button>}
          </div>
        ))}
    </CardContent></Card>
  );
}

/* ── Trace drawer: customer → order → M-Pesa → delivery → refunds → audit ── */
function Trace({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["/api/admin/finance/payments", id], queryFn: () => getJson(`/api/admin/finance/payments/${id}`), enabled: !!id });
  const d: any = q.data; const l = d?.ledger;
  const [busy, setBusy] = useState(false);
  const [refund, setRefund] = useState({ amount: "", reason: "" });
  const [match, setMatch] = useState({ email: "", targetType: "attempt", targetId: "", planId: "monthly", evidence: "", safaricomReceipt: "" });
  const [deliv, setDeliv] = useState({ evidence: "" });
  const [rStep, setRStep] = useState<Record<string, { ref: string; note: string }>>({});

  const refresh = () => { qc.invalidateQueries({ queryKey: ["/api/admin/finance/payments", id] }); qc.invalidateQueries({ queryKey: ["/api/admin/finance/summary"] }); qc.invalidateQueries({ queryKey: ["/api/admin/finance/unmatched"] }); qc.invalidateQueries({ queryKey: ["/api/admin/finance/refunds"] }); qc.invalidateQueries({ queryKey: ["/api/admin/finance/register"] }); };
  async function act(fn: () => Promise<any>, ok: string) {
    setBusy(true);
    try { const r = await fn(); toast({ title: ok, description: r?.message || r?.note }); refresh(); }
    catch (e: any) { toast({ title: "Not done", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  }
  const [cust, setCust] = useState<any>(null);
  async function findCustomer() {
    try { setCust(await getJson(`/api/admin/finance/customer?email=${encodeURIComponent(match.email.trim())}`)); }
    catch (e: any) { setCust(null); toast({ title: "Customer not found", description: e.message, variant: "destructive" }); }
  }
  async function doMatch() {
    if (!cust?.user?.id) throw new Error("Look up the customer first.");
    if (match.targetType !== "plan" && !match.targetId) throw new Error("Pick what this payment was for.");
    const target = match.targetType === "plan" ? { type: "plan", planId: match.planId } : match.targetType === "order" ? { type: "order", orderId: match.targetId } : { type: "attempt", paymentId: match.targetId };
    return send("POST", `/api/admin/finance/unmatched/${id}/match`, { userId: cust.user.id, target, confirmPlan: match.targetType === "plan", evidence: match.evidence, safaricomReceipt: match.safaricomReceipt });
  }
  const needsMatch = l && (["unmatched", "unverified_receipt"].includes(l.reconciliation_status) || d?.payment?.status === "pending_manual_verification");
  const canRefund = l && ["success", "completed"].includes(l.payment_status) && ["matched", "manually_matched"].includes(l.reconciliation_status);

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Payment trace {l ? <span className="font-mono text-sm ml-2">{l.orderRef}</span> : null}</DialogTitle></DialogHeader>
        {q.isLoading || !l ? <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
          <div className="space-y-4 text-sm">
            <div className="grid sm:grid-cols-2 gap-3">
              <Card><CardContent className="p-3 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">WHO PAID</p>
                <p>{l.customer_name || "—"}</p><p className="text-xs">{l.customer_email || "Guest / unlinked"}</p>
                <p className="text-[11px] text-muted-foreground font-mono">{l.user_id || "—"}</p>
              </CardContent></Card>
              <Card><CardContent className="p-3 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">WHAT FOR</p>
                <p className="font-medium">{l.purpose}</p>
                <p className="text-xs">{l.purpose_kind} · order <span className="font-mono">{l.orderRef}</span></p>
                {l.sub_status && <p className="text-xs">Subscription {l.sub_status}: {dt(l.sub_start)} → {dt(l.sub_end)}</p>}
              </CardContent></Card>
              <Card><CardContent className="p-3 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">M-PESA</p>
                <p className="text-lg font-semibold">{KES(l.amount)}</p>
                <p className="text-xs">Receipt <span className="font-mono">{l.receipt || "—"}</span> · {label(l.payment_status)}</p>
                <p className="text-xs">Paid {dt(l.created_at)}</p>
                <div className="flex gap-1"><Pill v={l.reconciliation_status} map={RECON_STYLE} /></div>
                {l.unmatched_reason && <p className="text-xs text-amber-700">{l.unmatched_reason}</p>}
                {d.payment?.phone_masked && <p className="text-[11px] text-muted-foreground">Phone {d.payment.phone_masked}</p>}
              </CardContent></Card>
              <Card><CardContent className="p-3 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">DELIVERY</p>
                <Pill v={l.delivery} map={DELIVERY_STYLE} />
                {d.order && <p className="text-xs">Order status: {d.order.status}{d.order.completed_at ? ` · ${dt(d.order.completed_at)}` : ""}{d.order.generated_at ? ` · ${dt(d.order.generated_at)}` : ""}</p>}
                {d.order?.first_downloaded_at && <p className="text-xs">Customer downloaded {dt(d.order.first_downloaded_at)}</p>}
                {d.order?.has_output === false && <p className="text-xs text-amber-700">No output saved yet</p>}
                {d.payment?.delivery_evidence && <p className="text-xs">Evidence: {d.payment.delivery_evidence}</p>}
                {canRefund && l.source === "payments" && !d.order && !["delivered", "active", "expired"].includes(l.delivery) && (
                  <div className="flex gap-1 pt-1">
                    <Input className="h-8 text-xs" placeholder="Delivery evidence (doc link / email sent)" value={deliv.evidence} onChange={(e) => setDeliv({ evidence: e.target.value })} />
                    <Button size="sm" disabled={busy} onClick={() => act(() => send("POST", `/api/admin/finance/payments/${id}/delivery`, { status: "delivered", evidence: deliv.evidence }), "Marked delivered")}>Mark delivered</Button>
                  </div>
                )}
              </CardContent></Card>
            </div>

            {d.sameReceipt?.length > 0 && (
              <Card className="border-amber-200"><CardContent className="p-3">
                <p className="text-xs font-semibold text-amber-800">SAME M-PESA RECEIPT ON OTHER ROWS</p>
                {d.sameReceipt.map((x: any) => <p key={x.id} className="text-xs font-mono">{x.id.slice(0, 8)} · {x.user_id} · {KES(x.amount)} · {x.status} · {x.reconciliation_status}</p>)}
              </CardContent></Card>
            )}

            {needsMatch && (
              <Card className="border-orange-200"><CardContent className="p-3 space-y-2">
                <p className="text-xs font-semibold text-orange-800">RECONCILE — link to a customer and what they bought (never by amount)</p>
                <div className="flex gap-2">
                  <Input className="h-8 text-xs" placeholder="Customer's account email" value={match.email} onChange={(e) => { setMatch({ ...match, email: e.target.value }); setCust(null); }} />
                  <Button size="sm" variant="outline" onClick={findCustomer}>Find</Button>
                </div>
                {cust && (
                  <div className="space-y-2">
                    <p className="text-xs">Customer: <strong>{cust.user.email}</strong> (current plan {cust.user.plan ?? "free"})</p>
                    <select className="h-8 w-full rounded-md border bg-background px-2 text-xs" value={match.targetType === "plan" ? `plan:${match.planId}` : match.targetId ? `${match.targetType}:${match.targetId}` : ""}
                      onChange={(e) => { const [t, ...rest] = e.target.value.split(":"); const v = rest.join(":"); setMatch(t === "plan" ? { ...match, targetType: "plan", planId: v, targetId: "" } : { ...match, targetType: t, targetId: v }); }}>
                      <option value="">What did this payment pay for?</option>
                      {cust.attempts.map((a: any) => <option key={a.id} value={`attempt:${a.id}`}>Unpaid attempt · {a.service_name || a.plan_id || a.service_id} · KES {a.amount} · {dt(a.created_at)}</option>)}
                      {cust.orders.map((o: any) => <option key={o.id} value={`order:${o.id}`}>Order awaiting payment · {o.service_name || o.service_slug} · KES {o.amount ?? "?"} · {dt(o.created_at)}</option>)}
                      <option value="plan:monthly">Monthly plan — confirmed with the customer</option>
                      <option value="plan:pro">Yearly plan — confirmed with the customer</option>
                    </select>
                  </div>
                )}
                {(l.reconciliation_status === "unverified_receipt" || d.payment?.status === "pending_manual_verification") && (
                  <Input className="h-8 text-xs" placeholder="Receipt as shown in the M-Pesa org portal / statement (proof)" value={match.safaricomReceipt} onChange={(e) => setMatch({ ...match, safaricomReceipt: e.target.value })} />
                )}
                <Input className="h-8 text-xs" placeholder="Evidence (e.g. customer sent M-Pesa SMS; phone matches)" value={match.evidence} onChange={(e) => setMatch({ ...match, evidence: e.target.value })} />
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" disabled={busy} onClick={() => act(doMatch, "Reconciled")}>Link payment</Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => { const note = prompt("Why is this a duplicate?"); if (note) act(() => send("POST", `/api/admin/finance/unmatched/${id}/resolve`, { action: "duplicate", note }), "Marked duplicate"); }}>Mark duplicate</Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => { const note = prompt("Why is this a test payment?"); if (note) act(() => send("POST", `/api/admin/finance/unmatched/${id}/resolve`, { action: "test", note }), "Marked test"); }}>Mark test</Button>
                </div>
              </CardContent></Card>
            )}

            <Card><CardContent className="p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">REFUNDS</p>
              {d.refunds.length === 0 && <p className="text-xs text-muted-foreground">None.</p>}
              {d.refunds.map((r: any) => (
                <div key={r.id} className="rounded border p-2 space-y-1">
                  <p className="text-xs"><Badge variant="outline">{r.status}</Badge> {KES(r.amount)} · {dt(r.created_at)} · {r.reason}</p>
                  {r.refund_ref && <p className="text-xs font-mono">Ref {r.refund_ref}{r.completed_at ? ` · paid ${dt(r.completed_at)}` : ""}</p>}
                  {["requested", "approved", "processing", "failed"].includes(r.status) && (
                    <div className="flex flex-wrap gap-1 items-center">
                      {r.status === "requested" && <><Button size="sm" disabled={busy} onClick={() => act(() => send("PATCH", `/api/admin/finance/refunds/${r.id}`, { status: "approved" }), "Approved")}>Approve</Button>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => { const note = prompt("Reason for rejecting?"); if (note) act(() => send("PATCH", `/api/admin/finance/refunds/${r.id}`, { status: "rejected", note }), "Rejected"); }}>Reject</Button></>}
                      {["approved", "processing", "failed"].includes(r.status) && <>
                        <Input className="h-8 w-44 text-xs" placeholder="M-Pesa refund transaction ref" value={rStep[r.id]?.ref ?? ""} onChange={(e) => setRStep({ ...rStep, [r.id]: { ref: e.target.value, note: rStep[r.id]?.note ?? "" } })} />
                        <Button size="sm" disabled={busy} onClick={() => act(() => send("PATCH", `/api/admin/finance/refunds/${r.id}`, { status: "completed", refundRef: rStep[r.id]?.ref }), "Refund recorded")}><Undo2 className="h-3.5 w-3.5 mr-1" /> Money returned</Button>
                        {r.status !== "failed" && <Button size="sm" variant="outline" disabled={busy} onClick={() => { const note = prompt("Why did the refund fail?"); if (note) act(() => send("PATCH", `/api/admin/finance/refunds/${r.id}`, { status: "failed", note }), "Marked failed"); }}>Failed</Button>}
                      </>}
                    </div>
                  )}
                </div>
              ))}
              {canRefund && !d.refunds.some((r: any) => r.status === "requested") && (
                <div className="flex flex-wrap gap-1 items-center pt-1">
                  <Input className="h-8 w-28 text-xs" type="number" placeholder="Amount" value={refund.amount} onChange={(e) => setRefund({ ...refund, amount: e.target.value })} />
                  <Input className="h-8 flex-1 min-w-[180px] text-xs" placeholder="Reason (e.g. service not delivered)" value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} />
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => send("POST", "/api/admin/finance/refunds", { paymentId: id, amount: Number(refund.amount), reason: refund.reason }), "Refund case opened")}>Open refund case</Button>
                </div>
              )}
            </CardContent></Card>

            <Card><CardContent className="p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-1">AUDIT TRAIL</p>
              {d.audit.length === 0 ? <p className="text-xs text-muted-foreground">No changes recorded.</p> :
                d.audit.map((a: any) => <p key={a.id} className="text-xs"><span className="text-muted-foreground">{dt(a.created_at)}</span> · {label(a.action)} · {a.actor_id ? `by ${a.actor_id.slice(0, 8)}` : "system"}{a.note ? ` — ${a.note}` : ""}</p>)}
            </CardContent></Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
