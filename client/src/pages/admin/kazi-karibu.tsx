/**
 * /admin/kazi-karibu — post Kazi Karibu jobs on an employer's behalf,
 * manage every post (edit / extend / remove) and clear the review queue.
 * (2026-11) Admin-posted jobs go live immediately and count in all totals.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, ExternalLink, CheckCircle2, XCircle, CalendarPlus, Pencil, Trash2 } from "lucide-react";
import { KAZI_KARIBU_CATEGORIES, KAZI_KARIBU_DURATIONS } from "@shared/kazi-karibu";
import { KENYA_COUNTIES } from "@/lib/school-constants";
import { LocationPicker } from "@/components/location-picker";
import type { PickedLocation } from "@/lib/geo";

async function getJson<T = any>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "include" });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || b?.message || `Request failed (${r.status})`);
  return b as T;
}
async function send<T = any>(method: string, url: string, data?: unknown): Promise<T> {
  const r = await apiRequest(method, url, data);
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || b?.message || `Request failed (${r.status})`);
  return b as T;
}
const dt = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "short" }) : "—");
const catLabel = (id: string) => KAZI_KARIBU_CATEGORIES.find((c) => c.id === id)?.label ?? id;

type Form = {
  title: string; category: string; county: string; subCounty: string; description: string;
  budgetMinKes: string; budgetMaxKes: string; budgetPeriod: string; duration: string;
  employerName: string; contactName: string; contactPhone: string; contactEmail: string;
  howToApply: string; showContact: boolean; daysLive: string; sourceNote: string;
};
const EMPTY: Form = {
  title: "", category: "", county: "Nairobi", subCounty: "", description: "",
  budgetMinKes: "", budgetMaxKes: "", budgetPeriod: "month", duration: "permanent",
  employerName: "", contactName: "", contactPhone: "", contactEmail: "",
  howToApply: "", showContact: true, daysLive: "14", sourceNote: "",
};

const STATE_STYLE: Record<string, string> = {
  live: "bg-emerald-100 text-emerald-800", held: "bg-amber-100 text-amber-800",
  pending_moderation: "bg-amber-100 text-amber-800", removed: "bg-slate-200 text-slate-700",
  rejected: "bg-rose-100 text-rose-800", expired: "bg-slate-200 text-slate-700", awaiting_payment: "bg-sky-100 text-sky-800",
};

const input = "w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm";

export default function AdminKaziKaribu() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<Form>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | "live" | "held">("all");
  const [loc, setLoc] = useState<PickedLocation | null>(null);
  const set = (k: keyof Form, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const { data, isLoading, error } = useQuery<{ counts: { live: number; waiting: number; drafts: number }; posts: any[] }>({
    queryKey: ["/api/admin/kazi-karibu/posts"],
    queryFn: () => getJson("/api/admin/kazi-karibu/posts"),
  });
  const posts = useMemo(() => (data?.posts ?? []).filter((p) =>
    filter === "all" ? true : filter === "live" ? p.is_live : ["held", "pending_moderation"].includes(p.moderation_state)), [data, filter]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["/api/admin/kazi-karibu/posts"] });

  const payload = () => ({
    ...form,
    budgetMinKes: form.budgetMinKes ? Number(form.budgetMinKes) : null,
    budgetMaxKes: form.budgetMaxKes ? Number(form.budgetMaxKes) : null,
    budgetPeriod: form.budgetMinKes || form.budgetMaxKes ? form.budgetPeriod : null,
    daysLive: Number(form.daysLive) || 14,
    location: loc ?? undefined,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await send("PATCH", `/api/admin/kazi-karibu/posts/${editingId}`, { action: "edit", ...payload() });
        toast({ title: "Job updated" });
      } else {
        const r = await send<{ post: { id: string } }>("POST", "/api/admin/kazi-karibu/posts", payload());
        toast({ title: "Job is live", description: "It now shows on Kazi Karibu and counts in the job totals." });
        window.open(`/kazi-karibu/job/${r.post.id}`, "_blank");
      }
      setForm((f) => ({ ...EMPTY, county: f.county, category: f.category }));
      setEditingId(null); setLoc(null);
      refresh();
    } catch (err: any) {
      toast({ title: "Couldn't save", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  }

  async function act(id: string, action: string, extra: any = {}) {
    try {
      if (action === "approve" || action === "reject") {
        await send("POST", `/api/admin/kazi-karibu/posts/${id}/decide`, { decision: action, narrative: action === "reject" ? "Rejected by admin" : "Approved by admin" });
      } else {
        await send("PATCH", `/api/admin/kazi-karibu/posts/${id}`, { action, ...extra });
      }
      toast({ title: "Done" });
      refresh();
    } catch (err: any) { toast({ title: "Failed", description: err.message, variant: "destructive" }); }
  }

  function edit(p: any) {
    setEditingId(p.id);
    setLoc(p.lat != null ? { mode: p.location_mode === "service_area" ? "service_area" : "workplace", lat: Number(p.lat), lng: Number(p.lng), placeId: p.place_id ?? null,
      formattedAddress: p.formatted_address ?? null, county: p.county ?? null, town: p.town ?? null, estate: p.estate ?? null, street: p.street ?? null,
      serviceRadiusKm: p.service_radius_km != null ? Number(p.service_radius_km) : null } : null);
    setForm({
      title: p.title ?? "", category: p.category ?? "", county: p.county ?? "", subCounty: p.sub_county ?? "",
      description: p.description ?? "", budgetMinKes: p.budget_min_kes ?? "", budgetMaxKes: p.budget_max_kes ?? "",
      budgetPeriod: p.budget_period ?? "month", duration: p.duration ?? "", employerName: p.employer_name ?? "",
      contactName: p.contact_name ?? "", contactPhone: p.contact_phone ?? "", contactEmail: p.contact_email ?? "",
      howToApply: p.how_to_apply ?? "", showContact: p.poster_shows_phone !== false, daysLive: "14", sourceNote: p.source_note ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <AdminLayout title="Kazi Karibu">
      <div className="p-4 sm:p-6 space-y-5 max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Kazi Karibu jobs</h1>
            <p className="text-sm text-slate-500">Post jobs for employers yourself. They go live straight away, show the employer's contact, and count in every job total.</p>
          </div>
          <a href="/kazi-karibu" target="_blank" rel="noreferrer" className="text-sm text-emerald-700 underline inline-flex items-center gap-1">Open Kazi Karibu <ExternalLink className="h-3.5 w-3.5" /></a>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[["Live now", data?.counts.live], ["Waiting for review", data?.counts.waiting], ["Unfinished drafts", data?.counts.drafts]].map(([l, n]) => (
            <Card key={String(l)}><CardContent className="p-4"><div className="text-xs text-slate-500">{l}</div><div className="text-2xl font-bold">{n ?? "…"}</div></CardContent></Card>
          ))}
        </div>

        <Card>
          <CardContent className="p-4 sm:p-5">
            <form onSubmit={submit} className="space-y-4" data-testid="form-kk-admin-post">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-lg">{editingId ? "Edit job" : "Post a job"}</h2>
                {editingId && <Button type="button" variant="ghost" onClick={() => { setEditingId(null); setForm(EMPTY); }}>Cancel edit</Button>}
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="sm:col-span-2 text-sm">Job title *
                  <input className={input} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. House help needed in Kilimani" required data-testid="input-kk-title" />
                </label>
                <label className="text-sm">Category *
                  <select className={input} value={form.category} onChange={(e) => set("category", e.target.value)} required data-testid="select-kk-category">
                    <option value="">Choose…</option>
                    {KAZI_KARIBU_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
                  </select>
                </label>
                <label className="text-sm">Employer / business name
                  <input className={input} value={form.employerName} onChange={(e) => set("employerName", e.target.value)} placeholder="e.g. Java House Westlands (optional)" />
                </label>
                <div className="sm:col-span-2 text-sm">
                  <div className="font-medium mb-1">Where is the work? * <span className="text-slate-400 font-normal">— search, then drag the pin to the exact spot</span></div>
                  <LocationPicker value={loc} onChange={(v) => { setLoc(v); if (v) setForm((f) => ({ ...f, county: v.county ?? f.county, subCounty: f.subCounty || v.estate || v.town || "" })); }} />
                </div>
                <label className="text-sm">County *
                  <select className={input} value={form.county} onChange={(e) => set("county", e.target.value)} required>
                    {KENYA_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="text-sm">Area / estate
                  <input className={input} value={form.subCounty} onChange={(e) => set("subCounty", e.target.value)} placeholder="e.g. Kilimani" />
                </label>
                <label className="sm:col-span-2 text-sm">Description * <span className="text-slate-400">(at least 30 characters — duties, hours, requirements)</span>
                  <textarea className={input} rows={5} value={form.description} onChange={(e) => set("description", e.target.value)} required data-testid="input-kk-description" />
                </label>
                <div className="grid grid-cols-3 gap-2 sm:col-span-2">
                  <label className="text-sm">Pay from (KES)
                    <input className={input} inputMode="numeric" value={form.budgetMinKes} onChange={(e) => set("budgetMinKes", e.target.value.replace(/\D/g, ""))} />
                  </label>
                  <label className="text-sm">Pay to (KES)
                    <input className={input} inputMode="numeric" value={form.budgetMaxKes} onChange={(e) => set("budgetMaxKes", e.target.value.replace(/\D/g, ""))} />
                  </label>
                  <label className="text-sm">Per
                    <select className={input} value={form.budgetPeriod} onChange={(e) => set("budgetPeriod", e.target.value)}>
                      <option value="hour">hour</option><option value="day">day</option><option value="month">month</option><option value="project">job / project</option>
                    </select>
                  </label>
                </div>
                <label className="text-sm">Type of work
                  <select className={input} value={form.duration} onChange={(e) => set("duration", e.target.value)}>
                    <option value="">Not specified</option>
                    {KAZI_KARIBU_DURATIONS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                </label>
                <label className="text-sm">Days live
                  <select className={input} value={form.daysLive} onChange={(e) => set("daysLive", e.target.value)}>
                    {["7", "14", "30", "60"].map((d) => <option key={d} value={d}>{d} days</option>)}
                  </select>
                </label>
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-3">
                <div className="text-sm font-semibold">Employer contact <span className="font-normal text-slate-500">— shown to signed-in applicants instead of your details. Add at least one.</span></div>
                <div className="grid sm:grid-cols-3 gap-3">
                  <label className="text-sm">Contact name
                    <input className={input} value={form.contactName} onChange={(e) => set("contactName", e.target.value)} placeholder="e.g. Mrs Wanjiru" />
                  </label>
                  <label className="text-sm">Phone
                    <input className={input} value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} placeholder="07XX XXX XXX" data-testid="input-kk-phone" />
                  </label>
                  <label className="text-sm">Email
                    <input className={input} type="email" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} />
                  </label>
                </div>
                <label className="text-sm block">How to apply <span className="text-slate-400">(optional — e.g. "Send CV on WhatsApp", "Walk in Mon–Fri 9am")</span>
                  <textarea className={input} rows={2} value={form.howToApply} onChange={(e) => set("howToApply", e.target.value)} />
                </label>
                <label className="text-sm inline-flex items-center gap-2">
                  <input type="checkbox" checked={form.showContact} onChange={(e) => set("showContact", e.target.checked)} />
                  Show the phone/email to signed-in applicants (untick to collect interest only)
                </label>
                <label className="text-sm block">Private note (only admins see this)
                  <input className={input} value={form.sourceNote} onChange={(e) => set("sourceNote", e.target.value)} placeholder="e.g. Found on WhatsApp group, called employer 23 Nov" />
                </label>
              </div>

              <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700" data-testid="button-kk-publish">
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                {editingId ? "Save changes" : "Publish job now"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          {(["all", "live", "held"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {f === "all" ? "All posts" : f === "live" ? "Live" : "Waiting for review"}
            </Button>
          ))}
        </div>

        {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : error ? <p className="text-rose-600 text-sm">{String((error as Error).message)}</p> : posts.length === 0 ? (
          <p className="text-sm text-slate-500">No posts here yet.</p>
        ) : (
          <div className="space-y-2">
            {posts.map((p) => (
              <Card key={p.id}>
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-start gap-3 justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATE_STYLE[p.is_live ? "live" : p.moderation_state] ?? "bg-slate-100"}`}>
                        {p.is_live ? "live" : p.moderation_state === "live" ? "expired" : p.moderation_state.replace(/_/g, " ")}
                      </span>
                      {p.posted_by_admin && <span className="text-xs px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">posted by admin</span>}
                      <span className="font-semibold">{p.title}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {catLabel(p.category)} · {p.sub_county ? `${p.sub_county}, ` : ""}{p.county}
                      {p.employer_name ? ` · ${p.employer_name}` : ""} · contact: {p.contact_phone || p.contact_email || p.poster_phone || p.poster_email || "—"}
                    </div>
                    <div className="text-xs text-slate-500">
                      Published {dt(p.published_at)} · ends {dt(p.expires_at)} · {p.interests} interested · {p.contact_views} contact views
                    </div>
                    {p.latest_note && !p.is_live && <div className="text-xs text-amber-700 mt-1">Note: {p.latest_note}</div>}
                  </div>
                  <div className="flex flex-wrap gap-1.5 shrink-0">
                    {p.is_live && <a href={`/kazi-karibu/job/${p.id}`} target="_blank" rel="noreferrer"><Button size="sm" variant="outline"><ExternalLink className="h-3.5 w-3.5 mr-1" />View</Button></a>}
                    {["held", "pending_moderation"].includes(p.moderation_state) && (<>
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => act(p.id, "approve")}><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => act(p.id, "reject")}><XCircle className="h-3.5 w-3.5 mr-1" />Reject</Button>
                    </>)}
                    <Button size="sm" variant="outline" onClick={() => edit(p)}><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Button>
                    {p.moderation_state !== "removed" && <Button size="sm" variant="outline" onClick={() => act(p.id, p.is_live ? "extend" : "relist", { days: 14 })}><CalendarPlus className="h-3.5 w-3.5 mr-1" />{p.is_live ? "+14 days" : "Relist"}</Button>}
                    {p.moderation_state !== "removed" && <Button size="sm" variant="outline" className="text-rose-700" onClick={() => { if (confirm("Remove this job from Kazi Karibu?")) act(p.id, "remove"); }}><Trash2 className="h-3.5 w-3.5 mr-1" />Remove</Button>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
