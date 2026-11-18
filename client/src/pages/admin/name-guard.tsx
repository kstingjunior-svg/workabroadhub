/**
 * /admin/name-guard — Name Guard management (2026-11).
 * Stats, review queue (correct false positives), dictionary, whitelist,
 * restrictions and audit log. Admin-only on the server.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, ShieldAlert, Flag, Ban, CheckCircle2 } from "lucide-react";

async function getJson<T = any>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "include" });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.message || `Request failed (${r.status})`);
  return b as T;
}
async function send<T = any>(method: string, url: string, data?: unknown): Promise<T> {
  const r = await apiRequest(method, url, data);
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.message || `Request failed (${r.status})`);
  return b as T;
}
const dt = (s: string) => new Date(s).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" });
const label = (s: string | null | undefined) => (s ? String(s).replace(/_/g, " ") : "—");
const DECISION_STYLE: Record<string, string> = { accept: "bg-emerald-100 text-emerald-800", reject: "bg-rose-100 text-rose-800", review: "bg-amber-100 text-amber-800" };

type Tab = "overview" | "review" | "events" | "terms" | "allow" | "blocks" | "audit";

export default function AdminNameGuard() {
  const [tab, setTab] = useState<Tab>("overview");
  const tabs: [Tab, string][] = [["overview", "Overview"], ["review", "Review queue"], ["events", "All checks"], ["terms", "Dictionary"], ["allow", "Whitelist"], ["blocks", "Restrictions"], ["audit", "Audit log"]];
  return (
    <AdminLayout title="Name Guard">
      <div className="p-4 sm:p-6 space-y-4 max-w-6xl">
        <div>
          <h1 className="text-2xl font-bold">Name Guard</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">Screens names at sign-up for offensive language and random text. Unfamiliar names are never blocked — they're flagged here for review. "Name screened" is not identity verification.</p>
        </div>
        <div className="flex flex-wrap gap-1 border-b">
          {tabs.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === k ? "border-violet-600 text-violet-700" : "border-transparent text-slate-500"}`} data-testid={`tab-ng-${k}`}>{l}</button>
          ))}
        </div>
        {tab === "overview" && <Overview />}
        {tab === "review" && <Events filter="review=open" reviewMode />}
        {tab === "events" && <Events filter="" />}
        {tab === "terms" && <Terms />}
        {tab === "allow" && <Allow />}
        {tab === "blocks" && <Blocks />}
        {tab === "audit" && <Audit />}
      </div>
    </AdminLayout>
  );
}

function Stat({ icon: Icon, k, v, sub, tone }: { icon: any; k: string; v: any; sub?: string; tone: string }) {
  return (
    <Card><CardContent className="pt-4 pb-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300"><span className={`h-7 w-7 rounded-lg flex items-center justify-center ${tone}`}><Icon className="h-4 w-4" /></span>{k}</div>
      <p className="mt-2 text-2xl font-extrabold tabular-nums">{v ?? "—"}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </CardContent></Card>
  );
}

function Overview() {
  const q = useQuery<any>({ queryKey: ["/api/admin/name-guard/overview"], queryFn: () => getJson("/api/admin/name-guard/overview") });
  if (q.isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  if (q.error) return <p className="text-rose-700 text-sm">{(q.error as Error).message}</p>;
  const d = q.data; const t = d.totals ?? {};
  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat icon={CheckCircle2} tone="bg-emerald-100 text-emerald-700" k="Names checked at sign-up" v={t.checked} sub={`${t.accepted ?? 0} accepted · last ${d.days} days`} />
        <Stat icon={Ban} tone="bg-rose-100 text-rose-700" k="Rejected" v={t.rejected} sub={`${t.rejected_at_submit ?? 0} at submit, rest while typing`} />
        <Stat icon={Flag} tone="bg-amber-100 text-amber-700" k="Flagged for review" v={t.flagged} sub={`${t.open_reviews ?? 0} still open`} />
        <Stat icon={ShieldAlert} tone="bg-violet-100 text-violet-700" k="Repeat abusers" v={d.repeatClients} sub={`${d.blocks?.active ?? 0} restricted right now`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card><CardContent className="pt-4 pb-4 space-y-2">
          <h2 className="font-bold">Rejection reasons</h2>
          {(d.rejectCategories ?? []).length === 0 ? <p className="text-sm text-slate-500">None yet.</p> : d.rejectCategories.map((c: any) => (
            <div key={c.category} className="flex justify-between text-sm"><span>{label(c.category)}</span><b className="tabular-nums">{c.n}</b></div>))}
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4 space-y-2">
          <h2 className="font-bold">Most detected expressions</h2>
          {(d.topTerms ?? []).length === 0 ? <p className="text-sm text-slate-500">None yet.</p> : d.topTerms.map((x: any) => (
            <div key={x.term + x.language} className="flex justify-between text-sm"><span className="font-mono">{x.term} <span className="text-xs text-slate-500">({x.language})</span></span><b className="tabular-nums">{x.n}</b></div>))}
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-4 space-y-2 text-sm">
          <h2 className="font-bold">Health &amp; statuses</h2>
          <div className="flex justify-between"><span>False positives corrected</span><b>{t.false_positives_corrected ?? 0}</b></div>
          <div className="flex justify-between"><span>AI screening failures</span><b>{t.ai_failures ?? 0}</b></div>
          <div className="flex justify-between"><span>Users: name screened</span><b>{d.users?.screened ?? 0}</b></div>
          <div className="flex justify-between"><span>Users: name flagged</span><b>{d.users?.flagged ?? 0}</b></div>
          <div className="flex justify-between"><span>Users: identity verified</span><b>{d.users?.identity_verified ?? 0}</b></div>
          <p className="text-xs text-slate-500">Name screening ≠ identity verification. Identity is only set after a real ID check.</p>
        </CardContent></Card>
      </div>
    </div>
  );
}

function Events({ filter, reviewMode = false }: { filter: string; reviewMode?: boolean }) {
  const qc = useQueryClient(); const { toast } = useToast();
  const [decision, setDecision] = useState("");
  const url = `/api/admin/name-guard/events?${filter}${decision ? `&decision=${decision}` : ""}`;
  const q = useQuery<any>({ queryKey: [url], queryFn: () => getJson(url) });
  async function act(id: number, action: string) {
    try { await send("POST", `/api/admin/name-guard/events/${id}`, { action }); toast({ title: "Saved" }); qc.invalidateQueries(); }
    catch (e: any) { toast({ title: "Not saved", description: e.message, variant: "destructive" }); }
  }
  return (
    <div className="space-y-2">
      {!reviewMode && (
        <select className="border rounded p-1.5 text-sm bg-white dark:bg-slate-900" value={decision} onChange={(e) => setDecision(e.target.value)}>
          <option value="">All decisions</option><option value="reject">Rejected</option><option value="review">Flagged</option><option value="accept">Accepted</option>
        </select>
      )}
      {reviewMode && <p className="text-sm text-slate-600">These people were allowed to register, but the name looked unusual or matched a word that can be offensive. "Allow" whitelists it (fixes a false positive); "Confirm" keeps it flagged.</p>}
      {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (q.data?.events ?? []).length === 0 ? <p className="text-sm text-slate-500 py-6">Nothing here.</p> : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900 text-left text-xs text-slate-500"><tr>
              <th className="p-2">When</th><th className="p-2">Name</th><th className="p-2">Decision</th><th className="p-2">Why</th><th className="p-2">Where</th><th className="p-2" />
            </tr></thead>
            <tbody className="divide-y">
              {q.data.events.map((e: any) => (
                <tr key={e.id}>
                  <td className="p-2 whitespace-nowrap text-xs">{dt(e.at)}</td>
                  <td className="p-2 font-mono break-all max-w-[220px]">{e.name_text ?? <span className="text-slate-400">(not stored)</span>}</td>
                  <td className="p-2"><span className={`rounded px-2 py-0.5 text-xs font-semibold ${DECISION_STYLE[e.decision]}`}>{e.decision}</span>{e.review_status && e.review_status !== "open" ? <span className="ml-1 text-xs text-slate-500">({e.review_status})</span> : null}</td>
                  <td className="p-2 text-xs text-slate-600">
                    {label(e.category)}
                    {(e.reason_codes?.lexicon ?? []).length ? ` · word: ${e.reason_codes.lexicon.map((h: any) => `${h.term} (${h.language})`).join(", ")}` : ""}
                    {(e.reason_codes?.hard ?? []).length ? ` · ${e.reason_codes.hard.map(label).join(", ")}` : ""}
                    {(e.reason_codes?.soft ?? []).length ? ` · ${e.reason_codes.soft.map(label).join(", ")}` : ""}
                    {e.ai ? ` · AI: ${label(e.ai.category)} ${Math.round((e.ai.confidence ?? 0) * 100)}%` : e.ai_error ? " · AI unavailable" : ""}
                  </td>
                  <td className="p-2 text-xs">{e.context} · {e.client}</td>
                  <td className="p-2 whitespace-nowrap">
                    {e.decision !== "accept" && e.name_text && e.review_status !== "allowed" && <Button size="sm" variant="outline" onClick={() => act(e.id, "allow")}>Allow (false positive)</Button>}
                    {e.review_status === "open" && <Button size="sm" variant="ghost" onClick={() => act(e.id, "confirm_reject")}>Confirm</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Terms() {
  const qc = useQueryClient(); const { toast } = useToast();
  const q = useQuery<any>({ queryKey: ["/api/admin/name-guard/terms"], queryFn: () => getJson("/api/admin/name-guard/terms") });
  const [f, setF] = useState({ term: "", language: "sw", category: "insult", severity: "block", mode: "word" });
  async function add() {
    try { await send("POST", "/api/admin/name-guard/terms", f); setF({ ...f, term: "" }); toast({ title: "Added" }); qc.invalidateQueries({ queryKey: ["/api/admin/name-guard/terms"] }); }
    catch (e: any) { toast({ title: "Not added", description: e.message, variant: "destructive" }); }
  }
  async function patch(id: number, body: any) {
    try { await send("PATCH", `/api/admin/name-guard/terms/${id}`, body); qc.invalidateQueries({ queryKey: ["/api/admin/name-guard/terms"] }); }
    catch (e: any) { toast({ title: "Not saved", description: e.message, variant: "destructive" }); }
  }
  const sel = "border rounded p-1.5 text-sm bg-white dark:bg-slate-900";
  return (
    <div className="space-y-3">
      <Card><CardContent className="pt-4 pb-4 flex flex-wrap gap-2 items-end">
        <input className={`${sel} flex-1 min-w-[160px]`} placeholder="Word or phrase" value={f.term} onChange={(e) => setF({ ...f, term: e.target.value })} data-testid="input-ng-term" />
        <select className={sel} value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })}>
          <option value="en">English</option><option value="sw">Kiswahili</option><option value="sheng">Sheng</option><option value="ki">Kikuyu</option><option value="luo">Dholuo</option><option value="luy">Luhya</option><option value="kam">Kamba</option><option value="kal">Kalenjin</option><option value="ar">Arabic</option><option value="other">Other</option>
        </select>
        <select className={sel} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
          {["profanity", "sexual", "insult", "slur", "hate", "abusive_phrase", "spam"].map((c) => <option key={c} value={c}>{label(c)}</option>)}
        </select>
        <select className={sel} value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })}><option value="block">Block</option><option value="review">Flag for review</option></select>
        <select className={sel} value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}><option value="word">Whole word</option><option value="phrase">Phrase</option><option value="contains">Anywhere (5+ letters)</option></select>
        <Button onClick={add} disabled={!f.term.trim()}>Add</Button>
      </CardContent></Card>
      <p className="text-xs text-slate-500">Use "Whole word" for short words (so "kuma" doesn't block "Kumar"). Use "Flag for review" when a word is also a real name somewhere.</p>
      {q.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
        <div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900 text-left text-xs text-slate-500"><tr><th className="p-2">Term</th><th className="p-2">Language</th><th className="p-2">Category</th><th className="p-2">Match</th><th className="p-2">Action</th><th className="p-2">Active</th></tr></thead>
          <tbody className="divide-y">{(q.data?.terms ?? []).map((t: any) => (
            <tr key={t.id} className={t.active ? "" : "opacity-50"}>
              <td className="p-2 font-mono">{t.term}</td><td className="p-2">{t.language}</td><td className="p-2">{label(t.category)}</td><td className="p-2">{t.mode}</td>
              <td className="p-2"><select className={sel} value={t.severity} onChange={(e) => patch(t.id, { severity: e.target.value })}><option value="block">Block</option><option value="review">Flag</option></select></td>
              <td className="p-2"><input type="checkbox" checked={t.active} onChange={(e) => patch(t.id, { active: e.target.checked })} /></td>
            </tr>))}</tbody>
        </table></div>
      )}
    </div>
  );
}

function Allow() {
  const qc = useQueryClient(); const { toast } = useToast();
  const q = useQuery<any>({ queryKey: ["/api/admin/name-guard/allow"], queryFn: () => getJson("/api/admin/name-guard/allow") });
  const [text, setText] = useState(""); const [note, setNote] = useState("");
  async function add() {
    try { await send("POST", "/api/admin/name-guard/allow", { text, note }); setText(""); setNote(""); qc.invalidateQueries({ queryKey: ["/api/admin/name-guard/allow"] }); toast({ title: "Whitelisted" }); }
    catch (e: any) { toast({ title: "Not saved", description: e.message, variant: "destructive" }); }
  }
  async function remove(id: number) { await send("DELETE", `/api/admin/name-guard/allow/${id}`); qc.invalidateQueries({ queryKey: ["/api/admin/name-guard/allow"] }); }
  return (
    <div className="space-y-3">
      <Card><CardContent className="pt-4 pb-4 flex flex-wrap gap-2">
        <input className="border rounded p-1.5 text-sm flex-1 min-w-[180px] bg-white dark:bg-slate-900" placeholder="A full name, or a single word that is a real name" value={text} onChange={(e) => setText(e.target.value)} />
        <input className="border rounded p-1.5 text-sm flex-1 min-w-[180px] bg-white dark:bg-slate-900" placeholder="Why (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button onClick={add} disabled={!text.trim()}>Whitelist</Button>
      </CardContent></Card>
      <p className="text-xs text-slate-500">A whitelisted full name is always accepted. A whitelisted single word is ignored by the dictionary everywhere (e.g. a surname that is also a slang word).</p>
      {(q.data?.allow ?? []).map((a: any) => (
        <div key={a.id} className="flex items-center justify-between border rounded p-2 text-sm"><span><b>{a.display}</b>{a.note ? <span className="text-slate-500"> · {a.note}</span> : null}</span><Button size="sm" variant="ghost" onClick={() => remove(a.id)}>Remove</Button></div>
      ))}
    </div>
  );
}

function Blocks() {
  const qc = useQueryClient();
  const q = useQuery<any>({ queryKey: ["/api/admin/name-guard/blocks"], queryFn: () => getJson("/api/admin/name-guard/blocks") });
  async function lift(client: string) { await send("POST", "/api/admin/name-guard/blocks/lift", { client }); qc.invalidateQueries({ queryKey: ["/api/admin/name-guard/blocks"] }); }
  async function extend(client: string) { await send("POST", "/api/admin/name-guard/blocks/add", { client, minutes: 24 * 60, reason: "persistent abuse — extended by admin" }); qc.invalidateQueries({ queryKey: ["/api/admin/name-guard/blocks"] }); }
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-600">Automatic, temporary pauses for a client (identified only by a hashed network address) after 5+ rejected names in 30 minutes. Nobody is blacklisted permanently.</p>
      {(q.data?.blocks ?? []).length === 0 ? <p className="text-sm text-slate-500 py-6">No restrictions.</p> : q.data.blocks.map((b: any) => {
        const active = new Date(b.until).getTime() > Date.now();
        return (
          <div key={b.client_full} className="flex flex-wrap items-center gap-3 border rounded p-2 text-sm">
            <span className="font-mono">{b.client}</span>
            <span className={active ? "text-rose-700 font-semibold" : "text-slate-500"}>{active ? `until ${dt(b.until)}` : "expired"}</span>
            <span className="text-slate-600 flex-1">{b.reason} · {b.rejects} rejected · {b.created_by}</span>
            {active ? <Button size="sm" variant="outline" onClick={() => lift(b.client_full)}>Lift</Button> : null}
            <Button size="sm" variant="ghost" onClick={() => extend(b.client_full)}>Restrict 24 h</Button>
          </div>
        );
      })}
    </div>
  );
}

function Audit() {
  const q = useQuery<any>({ queryKey: ["/api/admin/name-guard/audit"], queryFn: () => getJson("/api/admin/name-guard/audit") });
  return (
    <div className="space-y-1 text-sm">
      {(q.data?.log ?? []).length === 0 ? <p className="text-slate-500 py-6">No admin actions yet.</p> : q.data.log.map((l: any, i: number) => (
        <div key={i} className="border-b py-1.5"><span className="text-xs text-slate-500">{dt(l.at)}</span> · <b>{label(l.action)}</b> · <span className="text-slate-600 break-all">{JSON.stringify(l.detail)}</span></div>
      ))}
      <ShieldCheck className="h-4 w-4 text-slate-300" />
    </div>
  );
}
