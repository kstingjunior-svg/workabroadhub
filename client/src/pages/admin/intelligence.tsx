/**
 * /admin/intelligence — Scam Intelligence Network + risk analytics (2026-11).
 *
 * PRIVATE. Shows where the same phone / email / domain / payment account /
 * recruiter name / letter template appears in more than one scam report or
 * offer check. Nothing here is published. Customers only ever see a neutral
 * note for indicators an admin marks "confirmed" after reviewing evidence.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Network, BellRing, ShieldAlert, FileSearch, Lock } from "lucide-react";

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
const dt = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" }) : "—");

const KIND_LABEL: Record<string, string> = {
  phone: "Phone / M-Pesa", email: "Email", domain: "Domain", payment_account: "Payment account", name: "Recruiter / agency name", template: "Letter template",
};
const REVIEW_STYLE: Record<string, string> = {
  unreviewed: "bg-slate-100 text-slate-700", watch: "bg-amber-100 text-amber-800",
  confirmed: "bg-rose-100 text-rose-800", false_positive: "bg-emerald-100 text-emerald-800",
};
const REVIEW_LABEL: Record<string, string> = { unreviewed: "Not reviewed", watch: "Watching", confirmed: "Confirmed link", false_positive: "False positive" };
const RISK_ORDER = ["CRITICAL", "HIGH", "MODERATE", "LOW", "INSUFFICIENT_EVIDENCE", "BEFORE_RISK_LEVELS"];
const RISK_COLOR: Record<string, string> = {
  CRITICAL: "bg-rose-600", HIGH: "bg-rose-400", MODERATE: "bg-amber-400", LOW: "bg-emerald-500", INSUFFICIENT_EVIDENCE: "bg-slate-400", BEFORE_RISK_LEVELS: "bg-slate-200",
};
const CODE_LABEL: Record<string, string> = {
  applicant_name_mismatch: "Applicant name differs between pages", applicant_name_variant: "Applicant name written differently",
  applicant_passport_mismatch: "Two passport numbers", applicant_dob_mismatch: "Two dates of birth",
  payment_to_personal_account: "Payment to personal / mobile-money account", payment_requested: "Payment requested",
  email_reply_to_differs: "Email Reply-To differs", email_lookalike_domain: "Look-alike email domain", email_requests_payment: "Email asks for money",
  email_free_mailbox_for_company: "Company writing from free mailbox", email_domain_differs_from_employer: "Email domain ≠ employer domain",
  intel_confirmed_link: "Linked to reviewed reports",
};

function Stat({ icon: Icon, k, v, sub, tone }: { icon: any; k: string; v: any; sub?: string; tone: string }) {
  return (
    <Card><CardContent className="pt-4 pb-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
        <span className={`h-7 w-7 rounded-lg flex items-center justify-center ${tone}`}><Icon className="h-4 w-4" /></span>{k}
      </div>
      <p className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">{v ?? "—"}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </CardContent></Card>
  );
}

export default function AdminIntelligence() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<"alerts" | "links">("alerts");
  const [open, setOpen] = useState<{ kind: string; value: string } | null>(null);
  const ov = useQuery<any>({ queryKey: ["/api/admin/intel/overview"], queryFn: () => getJson("/api/admin/intel/overview"), refetchInterval: 120_000 });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const s = io();
    s.on("intel_alert", () => {
      toast({ title: "New intelligence match", description: "A new check or report shares details with earlier cases." });
      qc.invalidateQueries({ queryKey: ["/api/admin/intel/overview"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/intel/alerts"] });
    });
    return () => { s.disconnect(); };
  }, [qc, toast]);

  async function backfill() {
    setBusy(true);
    try {
      const r = await send<any>("POST", "/api/admin/intel/backfill");
      toast({ title: "Indexed", description: `${r.indexed} offer checks indexed · ${r.alerts} new matches.` });
      qc.invalidateQueries();
    } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  }

  const d = ov.data;
  const riskRows: Record<string, number> = {};
  for (const r of d?.risk ?? []) riskRows[r.level] = (riskRows[r.level] ?? 0) + r.n;
  const riskTotal = Object.values(riskRows).reduce((a, b) => a + b, 0);
  const gap = d ? d.coverage.offer_checks - d.coverage.indexed : 0;

  return (
    <AdminLayout title="Intelligence">
      <div className="p-4 sm:p-6 space-y-5 max-w-6xl">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Scam Intelligence Network</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 flex items-start gap-1.5 mt-1">
            <Lock className="h-4 w-4 mt-0.5 flex-shrink-0" />
            Private to admins. Links are allegations until you review the evidence. Nothing here is published; customers only see a neutral note for links you mark <b>Confirmed</b>.
          </p>
        </div>

        {ov.isLoading && <Loader2 className="h-6 w-6 animate-spin" />}
        {ov.error && <p className="text-rose-700 text-sm">{(ov.error as Error).message}</p>}

        {d && (
          <>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <Stat icon={BellRing} tone="bg-rose-100 text-rose-700" k="New matches" v={d.alerts.new} sub={`${d.alerts.total} matches recorded in total`} />
              <Stat icon={Network} tone="bg-violet-100 text-violet-700" k="Linked details" v={d.linked.total} sub={`${d.linked.unreviewed} not reviewed yet`} />
              <Stat icon={FileSearch} tone="bg-sky-100 text-sky-700" k="Offer checks indexed" v={`${d.coverage.indexed} / ${d.coverage.offer_checks}`} sub="checks still within retention" />
              <Stat icon={ShieldAlert} tone="bg-amber-100 text-amber-700" k="Scam reports" v={d.scamReports.total} sub={`${d.scamReports.pending} waiting for review`} />
            </div>
            {gap > 0 && (
              <div className="rounded-xl border border-sky-200 bg-sky-50 dark:bg-sky-950/30 p-3 flex flex-wrap items-center gap-3 text-sm">
                <span>{gap} earlier offer check{gap === 1 ? " is" : "s are"} not in the network yet.</span>
                <Button size="sm" onClick={backfill} disabled={busy} data-testid="button-intel-backfill">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add them now"}</Button>
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <Card><CardContent className="pt-4 pb-4 space-y-3">
                <h2 className="font-bold text-slate-900 dark:text-white">Risk levels — last {d.days} days</h2>
                {riskTotal === 0 ? <p className="text-sm text-slate-500">No document checks in this period.</p> : (
                  <>
                    <div className="flex h-4 rounded-full overflow-hidden">
                      {RISK_ORDER.filter((k) => riskRows[k]).map((k) => <div key={k} className={RISK_COLOR[k]} style={{ width: `${(riskRows[k] / riskTotal) * 100}%` }} title={`${k}: ${riskRows[k]}`} />)}
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-sm">
                      {RISK_ORDER.filter((k) => riskRows[k]).map((k) => (
                        <div key={k} className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${RISK_COLOR[k]}`} />
                          <span className="text-slate-700 dark:text-slate-300">{k === "BEFORE_RISK_LEVELS" ? "Checked before risk levels existed" : k.replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</span>
                          <b className="ml-auto tabular-nums">{riskRows[k]}</b></div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent></Card>
              <Card><CardContent className="pt-4 pb-4 space-y-2">
                <h2 className="font-bold text-slate-900 dark:text-white">Forensics, payment and email findings — last {d.days} days</h2>
                {d.forensicsFindings.length === 0 ? <p className="text-sm text-slate-500">None yet. These appear as new offer checks run on the upgraded engine.</p> :
                  d.forensicsFindings.map((f: any, i: number) => (
                    <div key={i} className="flex justify-between text-sm"><span className="text-slate-700 dark:text-slate-300">{CODE_LABEL[f.code] ?? f.code} <span className="text-xs text-slate-500">({f.status.replace(/_/g, " ")})</span></span><b className="tabular-nums">{f.n}</b></div>
                  ))}
              </CardContent></Card>
            </div>
          </>
        )}

        <div className="flex gap-2 border-b">
          {(["alerts", "links"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === t ? "border-violet-600 text-violet-700" : "border-transparent text-slate-500"}`} data-testid={`tab-intel-${t}`}>
              {t === "alerts" ? "New matches" : "All linked details"}
            </button>
          ))}
        </div>
        {tab === "alerts" ? <Alerts onOpen={setOpen} /> : <Links onOpen={setOpen} />}
      </div>
      <IndicatorDialog sel={open} onClose={() => setOpen(null)} />
    </AdminLayout>
  );
}

function Alerts({ onOpen }: { onOpen: (x: { kind: string; value: string }) => void }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState("new");
  const q = useQuery<any>({ queryKey: ["/api/admin/intel/alerts", status], queryFn: () => getJson(`/api/admin/intel/alerts?status=${status}`) });
  async function mark(id: number, st: string) {
    await send("POST", `/api/admin/intel/alerts/${id}`, { status: st });
    qc.invalidateQueries({ queryKey: ["/api/admin/intel/alerts"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/intel/overview"] });
  }
  return (
    <div className="space-y-2">
      <select className="border rounded p-1.5 text-sm bg-white dark:bg-slate-900" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="new">New</option><option value="seen">Seen</option><option value="dismissed">Dismissed</option><option value="all">All</option>
      </select>
      {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (q.data?.alerts ?? []).length === 0 ? (
        <p className="text-sm text-slate-500 py-6">No {status === "all" ? "" : status} matches.</p>
      ) : (
        <div className="space-y-2">
          {q.data.alerts.map((a: any) => (
            <Card key={a.id}><CardContent className="pt-3 pb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <div className="min-w-[220px] flex-1">
                <p className="font-semibold text-slate-900 dark:text-white">{KIND_LABEL[a.kind] ?? a.kind}: <span className="font-mono">{a.display}</span></p>
                <p className="text-xs text-slate-500">
                  New {a.source_type === "offer_check" ? `offer check ${a.reference_no ?? ""}` : "scam report"}{a.risk_level ? ` (${a.risk_level})` : ""} · matches {a.matched_reports} report{a.matched_reports === 1 ? "" : "s"} and {a.matched_checks} other check{a.matched_checks === 1 ? "" : "s"} · {dt(a.created_at)}
                </p>
              </div>
              <span className={`rounded px-2 py-0.5 text-xs font-semibold ${REVIEW_STYLE[a.review_status]}`}>{REVIEW_LABEL[a.review_status]}</span>
              <div className="flex gap-1.5">
                <Button size="sm" onClick={() => { onOpen({ kind: a.kind, value: a.value }); if (a.status === "new") mark(a.id, "seen"); }}>Review evidence</Button>
                {a.status !== "dismissed" && <Button size="sm" variant="outline" onClick={() => mark(a.id, "dismissed")}>Dismiss</Button>}
              </div>
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Links({ onOpen }: { onOpen: (x: { kind: string; value: string }) => void }) {
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const url = `/api/admin/intel/links?kind=${kind}&status=${status}`;
  const q = useQuery<any>({ queryKey: [url], queryFn: () => getJson(url) });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <select className="border rounded p-1.5 text-sm bg-white dark:bg-slate-900" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All kinds</option>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="border rounded p-1.5 text-sm bg-white dark:bg-slate-900" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any review status</option>{Object.entries(REVIEW_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (q.data?.links ?? []).length === 0 ? (
        <p className="text-sm text-slate-500 py-6">Nothing linked yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900 text-left text-xs text-slate-500"><tr>
              <th className="p-2">Detail</th><th className="p-2">Kind</th><th className="p-2 text-right">Reports</th><th className="p-2 text-right">Checks</th><th className="p-2">Review</th><th className="p-2" />
            </tr></thead>
            <tbody className="divide-y">
              {q.data.links.map((l: any) => (
                <tr key={`${l.k}:${l.v}`}>
                  <td className="p-2 font-mono break-all max-w-[260px]">{l.display ?? l.v}</td>
                  <td className="p-2 whitespace-nowrap">{KIND_LABEL[l.k] ?? l.k}</td>
                  <td className="p-2 text-right tabular-nums">{l.reports}</td>
                  <td className="p-2 text-right tabular-nums">{l.checks}</td>
                  <td className="p-2"><span className={`rounded px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${REVIEW_STYLE[l.review_status]}`}>{REVIEW_LABEL[l.review_status]}</span></td>
                  <td className="p-2"><Button size="sm" variant="outline" onClick={() => onOpen({ kind: l.k, value: l.v })}>Open</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function IndicatorDialog({ sel, onClose }: { sel: { kind: string; value: string } | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const url = sel ? `/api/admin/intel/indicator?kind=${encodeURIComponent(sel.kind)}&value=${encodeURIComponent(sel.value)}` : "";
  const q = useQuery<any>({ queryKey: [url], queryFn: () => getJson(url), enabled: !!sel });
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setNotes(""); }, [sel?.kind, sel?.value]);
  async function review(status: string) {
    if (!sel) return;
    setBusy(true);
    try {
      await send("POST", "/api/admin/intel/indicator/review", { kind: sel.kind, value: sel.value, status, notes: notes || undefined });
      toast({ title: "Saved", description: status === "confirmed" ? "Future customer reports with this detail will show a neutral review note." : "Review recorded." });
      qc.invalidateQueries();
    } catch (e: any) { toast({ title: "Not saved", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  }
  const d = q.data;
  return (
    <Dialog open={!!sel} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{d ? `${KIND_LABEL[d.kind] ?? d.kind}: ${sel?.value}` : "Loading"}</DialogTitle></DialogHeader>
        {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : d && (
          <div className="space-y-4 text-sm">
            <p className="text-xs text-slate-500">
              Review status: <b>{REVIEW_LABEL[d.review?.status ?? "unreviewed"]}</b>{d.review?.reviewed_at ? ` · ${dt(d.review.reviewed_at)}` : ""}{d.review?.notes ? ` · “${d.review.notes}”` : ""}
            </p>
            <div>
              <p className="font-semibold">Scam reports ({d.reports.length})</p>
              {d.reports.length === 0 ? <p className="text-slate-500 text-xs">None.</p> : d.reports.map((r: any) => (
                <div key={r.id} className="border rounded p-2 mt-1.5 text-xs space-y-0.5">
                  <p><b>{r.agency_name ?? "—"}</b>{r.employer_name ? ` · employer ${r.employer_name}` : ""} · {r.destination_country ?? r.country ?? "—"} · {r.status} · {dt(r.created_at)}</p>
                  {r.amount_lost ? <p>Reported loss: {r.currency ?? "KES"} {Number(r.amount_lost).toLocaleString("en-KE")}</p> : null}
                  {r.description && <p className="text-slate-600 dark:text-slate-400">{r.description}</p>}
                  <a href={`/admin/scam-reports?id=${r.id}`} className="text-violet-700 hover:underline">Open report</a>
                </div>
              ))}
            </div>
            <div>
              <p className="font-semibold">Offer checks ({d.checks.length})</p>
              {d.checks.length === 0 ? <p className="text-slate-500 text-xs">None.</p> : d.checks.map((c: any) => (
                <p key={c.id} className="text-xs mt-1">{c.reference_no} · {(c.outcome ?? "").replace(/_/g, " ")} · {c.country_code ?? "—"} · {dt(c.created_at)}</p>
              ))}
              <p className="text-[11px] text-slate-500 mt-1">Open a check in VerifyX → Requests by its reference number.</p>
            </div>
            <div className="border-t pt-3 space-y-2">
              <p className="font-semibold">Your review</p>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full border rounded p-2 bg-white dark:bg-slate-900"
                placeholder="What evidence did you look at? (required to confirm)" data-testid="input-intel-notes" />
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => review("watch")}>Watch</Button>
                <Button size="sm" className="bg-rose-600 hover:bg-rose-700" disabled={busy || sel?.kind === "name" || notes.trim().length < 15} onClick={() => review("confirmed")} data-testid="button-intel-confirm">Confirm link</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => review("false_positive")}>False positive</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => review("unreviewed")}>Reset</Button>
              </div>
              <p className="text-[11px] text-slate-500">
                Confirm only when the reports themselves support the link (e.g. payment receipts or messages from the same number). Names cannot be confirmed on their own.
                A confirmed link shows customers a neutral note — never the agency name, never “scam”.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
