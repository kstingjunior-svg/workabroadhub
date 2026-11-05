/**
 * /admin/verifyx — VerifyX command centre (2026-11).
 *
 * Volumes, outcomes, latency, model cost, review queue (disputes, auto-flags),
 * request inspector with full evidence + audit trail, and official-source
 * health (operational / degraded / unavailable / awaiting authorization).
 * A source is never shown as live unless its last sync succeeded.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Search, ExternalLink } from "lucide-react";
import { STATUS_META, type EvidenceStatus } from "@/components/verifyx-report";

const dt = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" }) : "—");
const label = (s: string | null | undefined) => (s ? String(s).replace(/_/g, " ") : "—");

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

const CONNECTOR_STYLE: Record<string, string> = {
  operational: "bg-emerald-100 text-emerald-800", degraded: "bg-amber-100 text-amber-800",
  unavailable: "bg-rose-100 text-rose-800", awaiting_authorization: "bg-slate-100 text-slate-700", not_built: "bg-slate-100 text-slate-500",
};
const OUTCOME_STYLE: Record<string, string> = {
  discrepancies_found: "bg-rose-100 text-rose-800", needs_attention: "bg-amber-100 text-amber-800",
  no_discrepancies_found: "bg-sky-100 text-sky-800", insufficient_information: "bg-slate-100 text-slate-700",
  error: "bg-rose-50 text-rose-700", processing: "bg-slate-100 text-slate-600",
};
function Pill({ v, map }: { v: string | null | undefined; map: Record<string, string> }) {
  return <span className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ${map[String(v)] ?? "bg-slate-100 text-slate-600"}`}>{label(v)}</span>;
}
function Stat({ k, v, sub }: { k: string; v: any; sub?: string }) {
  return (
    <Card><CardContent className="pt-4 pb-4">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{k}</p>
      <p className="text-xl font-bold text-slate-900 dark:text-white">{v ?? "—"}</p>
      {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
    </CardContent></Card>
  );
}

type Tab = "overview" | "requests" | "reviews" | "sources";

export default function AdminVerifyX() {
  const [tab, setTab] = useState<Tab>("overview");
  const [inspect, setInspect] = useState<string | null>(null);
  return (
    <AdminLayout title="VerifyX — Document Verification">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(["overview", "requests", "reviews", "sources"] as Tab[]).map((t) => (
            <Button key={t} size="sm" variant={tab === t ? "default" : "outline"} onClick={() => setTab(t)} data-testid={`tab-${t}`}>{label(t)}</Button>
          ))}
        </div>
        {tab === "overview" && <Overview />}
        {tab === "requests" && <Requests onInspect={setInspect} />}
        {tab === "reviews" && <Reviews onInspect={setInspect} />}
        {tab === "sources" && <Sources />}
      </div>
      <Inspector id={inspect} onClose={() => setInspect(null)} />
    </AdminLayout>
  );
}

function Overview() {
  const [days, setDays] = useState(30);
  const q = useQuery({ queryKey: ["/api/admin/verifyx/overview", days], queryFn: () => getJson(`/api/admin/verifyx/overview?days=${days}`) });
  const d: any = q.data;
  if (q.isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  if (q.error) return <p className="text-sm text-rose-600">{(q.error as Error).message}</p>;
  const t = d?.totals ?? {};
  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center text-xs">
        Period:
        {[7, 30, 90].map((n) => <Button key={n} size="sm" variant={days === n ? "default" : "outline"} onClick={() => setDays(n)}>{n}d</Button>)}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat k="Documents screened" v={t.n} sub={`${t.errors ?? 0} failed`} />
        <Stat k="Avg / p95 time" v={t.avg_latency_ms != null ? `${(t.avg_latency_ms / 1000).toFixed(1)}s` : "—"} sub={t.p95_latency_ms != null ? `p95 ${(t.p95_latency_ms / 1000).toFixed(1)}s` : undefined} />
        <Stat k="Est. model cost" v={t.cost_usd != null ? `$${Number(t.cost_usd).toFixed(2)}` : "—"} sub={t.n ? `≈ $${(Number(t.cost_usd ?? 0) / t.n).toFixed(3)} / check (estimate)` : undefined} />
        <Stat k="Open reviews" v={d?.reviews?.open ?? 0} sub={`${d?.reviews?.disputes ?? 0} disputes · ${d?.requestsWithCorrections ?? 0} with user corrections`} />
        <Stat k="Reviewer false positives" v={d?.reviews?.false_positives ?? 0} sub={`false negatives ${d?.reviews?.false_negatives ?? 0} · corrected ${d?.reviews?.corrected ?? 0}`} />
        <Stat k="Blocked unsupported claims" v={d?.rejectedFindings ?? 0} sub="findings rejected by the evidence validator" />
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-4 space-y-1">
          <p className="text-sm font-semibold">By tool</p>
          {(d?.byTool ?? []).map((r: any) => <p key={r.tool} className="text-xs flex justify-between"><span>{label(r.tool)}</span><span>{r.n}</span></p>)}
          <p className="text-sm font-semibold pt-2">By outcome</p>
          {(d?.byOutcome ?? []).map((r: any) => <p key={r.outcome} className="text-xs flex justify-between"><Pill v={r.outcome} map={OUTCOME_STYLE} /><span>{r.n}</span></p>)}
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4 space-y-1">
          <p className="text-sm font-semibold">By country</p>
          {(d?.byCountry ?? []).map((r: any) => <p key={r.country} className="text-xs flex justify-between"><span>{r.country}</span><span>{r.n}</span></p>)}
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4 space-y-1">
          <p className="text-sm font-semibold">Findings by status</p>
          {(d?.findingsByStatus ?? []).map((r: any) => (
            <p key={r.status} className="text-xs flex justify-between"><span>{STATUS_META[r.status as EvidenceStatus]?.label ?? r.status}</span><span>{r.n}</span></p>
          ))}
          <p className="text-sm font-semibold pt-2">Top risk codes</p>
          {(d?.topRiskCodes ?? []).map((r: any) => <p key={r.code + r.status} className="text-xs flex justify-between"><span>{label(r.code)}</span><span>{r.n}</span></p>)}
        </CardContent></Card>
      </div>
      <p className="text-[11px] text-slate-500">No accuracy percentage is shown until a labelled evaluation set exists. Reviewer decisions (false positives / negatives) are the current ground truth.</p>
    </div>
  );
}

function Requests({ onInspect }: { onInspect: (id: string) => void }) {
  const [ref, setRef] = useState("");
  const [outcome, setOutcome] = useState("");
  const url = `/api/admin/verifyx/requests?${new URLSearchParams({ ...(ref ? { q: ref } : {}), ...(outcome ? { outcome } : {}) })}`;
  const q = useQuery({ queryKey: [url], queryFn: () => getJson(url) });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative"><Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-slate-400" />
          <Input className="pl-7 h-9 w-56" placeholder="Reference VX-…" value={ref} onChange={(e) => setRef(e.target.value.trim())} /></div>
        <select className="h-9 rounded-md border px-2 text-sm bg-white dark:bg-slate-900" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
          <option value="">All outcomes</option>
          {Object.keys(OUTCOME_STYLE).slice(0, 4).map((o) => <option key={o} value={o}>{label(o)}</option>)}
        </select>
      </div>
      {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-slate-500"><th className="p-2">When</th><th>Ref</th><th>Tool</th><th>Country</th><th>Outcome</th><th>Time</th><th>Reviews</th><th></th></tr></thead>
            <tbody>
              {((q.data as any)?.requests ?? []).map((r: any) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2 whitespace-nowrap">{dt(r.created_at)}</td>
                  <td className="font-mono">{r.reference_no}</td>
                  <td>{label(r.tool)}</td>
                  <td>{r.country_code ?? "—"}</td>
                  <td><Pill v={r.outcome ?? r.status} map={OUTCOME_STYLE} />{r.purged_at && <span className="ml-1 text-slate-400">(purged)</span>}</td>
                  <td>{r.latency_ms ? `${(r.latency_ms / 1000).toFixed(1)}s` : "—"}</td>
                  <td>{r.open_reviews || ""}</td>
                  <td><Button size="sm" variant="outline" onClick={() => onInspect(r.id)}>Inspect</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Reviews({ onInspect }: { onInspect: (id: string) => void }) {
  const [status, setStatus] = useState("open");
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useQuery({ queryKey: ["/api/admin/verifyx/reviews", status], queryFn: () => getJson(`/api/admin/verifyx/reviews?status=${status}`) });
  async function decide(id: number, body: any) {
    try {
      await send("POST", `/api/admin/verifyx/reviews/${id}`, body);
      toast({ title: "Saved", description: "Decision recorded in the audit log." });
      qc.invalidateQueries({ queryKey: ["/api/admin/verifyx/reviews"] });
    } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
  }
  return (
    <div className="space-y-3">
      <div className="flex gap-2">{["open", "resolved", "all"].map((s) => <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>{s}</Button>)}</div>
      <p className="text-[11px] text-slate-500">A reviewer decision is a WorkAbroadHub review. Never present it to customers as government verification. Use “needs government confirmation” when only the issuing authority can settle it.</p>
      {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : ((q.data as any)?.reviews ?? []).map((c: any) => (
        <Card key={c.id}><CardContent className="pt-3 pb-3 space-y-2 text-xs">
          <div className="flex flex-wrap justify-between gap-2">
            <span><b>#{c.id}</b> · {label(c.kind)} · <span className="font-mono">{c.reference_no}</span> · {label(c.tool)} · {c.country_code ?? "—"} · <Pill v={c.outcome} map={OUTCOME_STYLE} /></span>
            <span className="text-slate-500">{dt(c.created_at)} · {label(c.status)}{c.decision ? ` · ${label(c.decision)}` : ""}</span>
          </div>
          {c.user_message && <p className="rounded bg-slate-50 dark:bg-slate-900 p-2">“{c.user_message}”</p>}
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onClick={() => onInspect(c.request_id)}>Inspect evidence</Button>
            {c.status !== "resolved" && <>
              <Button size="sm" variant="outline" onClick={() => decide(c.id, { status: "in_review" })}>Start review</Button>
              <Button size="sm" variant="outline" onClick={() => decide(c.id, { decision: "upheld", falsePositive: false })}>Findings upheld</Button>
              <Button size="sm" variant="outline" onClick={() => { const notes = prompt("What was wrong with the finding?") ?? ""; decide(c.id, { decision: "corrected", falsePositive: true, notes }); }}>False positive</Button>
              <Button size="sm" variant="outline" onClick={() => { const notes = prompt("What did the report miss?") ?? ""; decide(c.id, { decision: "corrected", falseNegative: true, notes }); }}>Missed issue</Button>
              <Button size="sm" variant="outline" onClick={() => decide(c.id, { decision: "needs_government_confirmation" })}>Needs government confirmation</Button>
            </>}
            {c.status === "resolved" && <Button size="sm" variant="outline" onClick={() => decide(c.id, { status: "open" })}>Reopen</Button>}
          </div>
          {c.decision_notes && <p className="text-slate-600">Notes: {c.decision_notes}</p>}
        </CardContent></Card>
      ))}
    </div>
  );
}

function Sources() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["/api/admin/verifyx/sources"], queryFn: () => getJson("/api/admin/verifyx/sources") });
  const d: any = q.data;
  async function run(id: string) {
    setBusy(id);
    try { const r = await send("POST", `/api/admin/verifyx/sources/${id}/sync`); toast({ title: "Done", description: JSON.stringify(r) }); qc.invalidateQueries({ queryKey: ["/api/admin/verifyx/sources"] }); }
    catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
    finally { setBusy(null); }
  }
  async function change(id: number, status: string) {
    try { await send("POST", `/api/admin/verifyx/changes/${id}`, { status }); qc.invalidateQueries({ queryKey: ["/api/admin/verifyx/sources"] }); }
    catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
  }
  async function rule(r: any, status: string) {
    try { await send("POST", `/api/admin/verifyx/rules/${encodeURIComponent(r.rule_id)}/${r.version}`, { status }); qc.invalidateQueries({ queryKey: ["/api/admin/verifyx/sources"] }); }
    catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
  }
  if (q.isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("uk_sponsor_register")}>{busy === "uk_sponsor_register" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}Sync UK sponsor register</Button>
        <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("ke_nea_register")}>Refresh NEA status</Button>
        <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("guidance")}>Check guidance pages for changes</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-slate-500"><th className="p-2">Country</th><th>Source</th><th>Capability</th><th>Connector</th><th>Last success</th><th>Rows</th><th>Last error</th></tr></thead>
          <tbody>
            {(d?.sources ?? []).map((s: any) => (
              <tr key={s.id} className="border-t align-top">
                <td className="p-2">{s.country}</td>
                <td><a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:underline inline-flex items-center gap-1">{s.title}<ExternalLink className="h-3 w-3" /></a><div className="text-slate-500">{s.authority}</div></td>
                <td>{label(s.capability)}</td>
                <td><Pill v={s.connector_status} map={CONNECTOR_STYLE} /></td>
                <td className="whitespace-nowrap">{dt(s.last_success_at)}</td>
                <td>{s.row_count ?? ""}</td>
                <td className="text-rose-700 max-w-[16rem] break-words">{s.last_error ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Card><CardContent className="pt-4 pb-4 space-y-2">
        <p className="text-sm font-semibold">Detected changes on official pages (human review)</p>
        {(d?.changes ?? []).length === 0 && <p className="text-xs text-slate-500">None yet.</p>}
        {(d?.changes ?? []).map((c: any) => (
          <div key={c.id} className="text-xs flex flex-wrap justify-between gap-2 border-t pt-2">
            <span>{dt(c.detected_at)} · {c.source_id} · {c.summary}</span>
            <span className="flex gap-1 items-center"><Pill v={c.review_status} map={{ pending: "bg-amber-100 text-amber-800", accepted: "bg-emerald-100 text-emerald-800", dismissed: "bg-slate-100 text-slate-600" }} />
              {c.review_status === "pending" && <><Button size="sm" variant="outline" onClick={() => change(c.id, "accepted")}>Rules updated</Button><Button size="sm" variant="outline" onClick={() => change(c.id, "dismissed")}>No impact</Button></>}
            </span>
          </div>
        ))}
      </CardContent></Card>
      <Card><CardContent className="pt-4 pb-4 space-y-2">
        <p className="text-sm font-semibold">Rule registry (versioned, time-aware)</p>
        {(d?.rules ?? []).map((r: any) => (
          <div key={r.rule_id + r.version} className="text-xs border-t pt-2 space-y-1">
            <div className="flex flex-wrap justify-between gap-2"><span className="font-mono">{r.rule_id} v{r.version}</span>
              <span className="flex gap-1 items-center"><Pill v={r.review_status} map={{ approved: "bg-emerald-100 text-emerald-800", pending_review: "bg-amber-100 text-amber-800", rejected: "bg-rose-100 text-rose-800" }} />
                <Button size="sm" variant="outline" onClick={() => rule(r, "approved")}>Approve citation</Button>
                <Button size="sm" variant="outline" onClick={() => rule(r, "rejected")}>Reject</Button></span></div>
            <p>{r.rule_text}</p>
            <p className="text-slate-500">Effective {r.effective_from ?? "—"} → {r.effective_to ?? "open"} · retrieved {r.retrieved_at?.slice?.(0, 10)} · source {r.source_id}{r.reviewed_at ? ` · reviewed ${dt(r.reviewed_at)}` : ""}</p>
          </div>
        ))}
        <p className="text-[11px] text-slate-500">Unreviewed rules can only raise “potential risk indicators”, never confirmed discrepancies.</p>
      </CardContent></Card>
      <Card><CardContent className="pt-4 pb-4 space-y-1">
        <p className="text-sm font-semibold">Recent syncs</p>
        {(d?.syncs ?? []).map((s: any) => <p key={s.id} className="text-xs">{dt(s.started_at)} · {s.source_id} · <b>{s.status}</b>{s.rows ? ` · ${s.rows} rows` : ""}{s.error ? ` · ${s.error}` : ""}</p>)}
      </CardContent></Card>
    </div>
  );
}

function Inspector({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useQuery({ queryKey: ["/api/admin/verifyx/requests", id], queryFn: () => getJson(`/api/admin/verifyx/requests/${id}`), enabled: !!id });
  const d: any = q.data;
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Request {d?.request?.reference_no ?? ""}</DialogTitle></DialogHeader>
        {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : d && (
          <div className="space-y-3 text-xs">
            <p>{label(d.request.tool)} · {dt(d.request.created_at)} · <Pill v={d.request.outcome ?? d.request.status} map={OUTCOME_STYLE} /> · engine {d.request.engine_version} · retention until {dt(d.request.retention_expires_at)}{d.request.purged_at ? " · PURGED" : ""}</p>
            {d.report?.headline && <p className="text-sm font-semibold">{d.report.headline}</p>}
            {(d.report?.findings ?? []).map((f: any) => (
              <div key={f.id} className="border rounded p-2 space-y-0.5">
                <p><b>{f.id}</b> · {STATUS_META[f.status as EvidenceStatus]?.label ?? f.status} · {f.title} <span className="text-slate-400">({f.method}{f.downgradedFrom ? `, downgraded from ${label(f.downgradedFrom)}` : ""})</span></p>
                {f.documentSays && <p>Document: {f.documentSays}</p>}
                {f.evidenceSays && <p>Evidence: {f.evidenceSays}</p>}
                {f.uncertainty && <p className="text-slate-500">Limits: {f.uncertainty}</p>}
                {f.source && <p className="text-slate-500">Source: {f.source.authority} {f.source.retrievedAt ? `(${f.source.retrievedAt.slice(0, 10)})` : ""} {f.source.ruleId ?? ""}</p>}
              </div>
            ))}
            {d.rejectedFindings?.length > 0 && <div><p className="font-semibold">Blocked by evidence validator</p>{d.rejectedFindings.map((r: any, i: number) => <p key={i}>{r.code}: {r.reason}</p>)}</div>}
            <div><p className="font-semibold">Extracted fields</p>{d.fields.map((f: any) => <p key={f.field}>{f.field}: {f.value ?? "—"} {f.confidence != null ? `(${f.confidence})` : ""}{f.user_corrected ? " ✎ user" : ""}</p>)}</div>
            {d.corrections.length > 0 && <div><p className="font-semibold">User corrections</p>{d.corrections.map((c: any) => <p key={c.id}>{dt(c.created_at)} · {c.field}: “{c.old_value ?? ""}” → “{c.new_value === "__confirmed__" ? "(confirmed)" : c.new_value ?? ""}”</p>)}</div>}
            <div><p className="font-semibold">Audit trail</p>{d.auditTrail.map((a: any, i: number) => <p key={i}>{dt(a.at)} · {a.actor_kind} · {a.action}</p>)}</div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
