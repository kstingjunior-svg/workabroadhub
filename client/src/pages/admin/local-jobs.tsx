/**
 * /admin/local-jobs — Super Admin local jobs publisher (2026-11).
 * Post a job in seconds for any employer (no employer account needed, never
 * charged), preview + scam checks, drafts, manage/renew/archive, employers,
 * applications, reports, categories, live stats, CSV export.
 * Every action is re-checked on the server (SUPER_ADMIN only).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { KENYA_COUNTIES } from "@/lib/school-constants";
import {
  Loader2, Plus, Eye, Save, X, ExternalLink, Download, RefreshCw, Archive, Trash2, PauseCircle, PlayCircle,
  CalendarPlus, Pencil, ShieldAlert, Phone, MessageCircle, BadgeCheck,
} from "lucide-react";

async function getJson<T = any>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: "include" });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(b?.message || `Request failed (${r.status})`), { status: r.status });
  return b as T;
}
async function send<T = any>(method: string, url: string, data?: unknown): Promise<T> {
  const r = await apiRequest(method, url, data);
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(b?.message || `Request failed (${r.status})`), { status: r.status, body: b });
  return b as T;
}
const d8 = (s: any) => (s ? new Date(s).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", year: "numeric" }) : "—");
const kes = (n: any) => (n == null || n === "" ? "" : `KES ${Number(n).toLocaleString("en-KE")}`);
const input = "w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm";
const TYPES = [["full_time", "Full-time"], ["part_time", "Part-time"], ["contract", "Contract"], ["temporary", "Temporary"], ["casual", "Casual"], ["internship", "Internship"]];
const PERIODS = [["month", "per month"], ["week", "per week"], ["day", "per day"], ["hour", "per hour"], ["job", "per job"], ["year", "per year"]];
const SOURCES = [["admin_on_behalf", "Posted on behalf of employer"], ["admin", "Posted by WorkAbroadHub Admin"], ["employer", "Posted by employer"]];
const VERIFY = [["admin_posted", "Admin posted (not yet verified)"], ["contact_confirmed", "Contact details confirmed"], ["verified", "Verified employer"], ["pending", "Verification pending"]];
const STATUS_STYLE: Record<string, string> = {
  live: "bg-emerald-100 text-emerald-800", draft: "bg-slate-200 text-slate-700", paused: "bg-amber-100 text-amber-800",
  expired: "bg-rose-100 text-rose-800", archived: "bg-slate-200 text-slate-600", closed: "bg-slate-200 text-slate-600",
};

type F = Record<string, any>;
const EMPTY: F = {
  title: "", employerName: "", description: "", vacancies: "1", category: "", employmentType: "full_time",
  salaryMin: "", salaryMax: "", salaryPeriod: "month", county: "Nairobi", town: "", estate: "", workplaceLocation: "",
  minQualification: "", experienceText: "", genderRequirement: "", workingHours: "", deadline: "", expiresAt: "",
  contactPerson: "", contactPhone: "", whatsappPhone: "", altContact: "", instructions: "", contactAuthorized: true,
  source: "admin_on_behalf", verificationStatus: "admin_posted", verificationNote: "",
};
const jobToForm = (j: any): F => ({
  ...EMPTY, title: j.title ?? "", employerName: j.company_name ?? "", companyId: j.company_id, description: j.description ?? j.responsibilities ?? "",
  vacancies: String(j.vacancies ?? 1), category: j.category ?? "", employmentType: j.employment_type ?? "full_time",
  salaryMin: j.salary_min ?? "", salaryMax: j.salary_max ?? "", salaryPeriod: j.salary_period ?? "month", county: j.county ?? "",
  town: j.town ?? "", estate: j.estate ?? "", workplaceLocation: j.workplace_location ?? "", minQualification: j.min_qualification ?? "",
  experienceText: j.experience_text ?? "", genderRequirement: j.gender_requirement ?? "", workingHours: j.working_hours ?? "",
  deadline: j.deadline ? String(j.deadline).slice(0, 10) : "", expiresAt: j.expires_at ? String(j.expires_at).slice(0, 10) : "",
  contactPerson: j.contact_person ?? "", contactPhone: j.contact_phone ? `0${String(j.contact_phone).slice(3)}` : "",
  whatsappPhone: j.whatsapp_phone ? `0${String(j.whatsapp_phone).slice(3)}` : "", altContact: j.alt_contact ?? "",
  instructions: j.instructions ?? "", contactAuthorized: !!j.contact_authorized, source: j.source ?? "admin_on_behalf",
  verificationStatus: j.verification_status ?? "admin_posted", verificationNote: j.verification_note ?? "",
});
const jobState = (j: any) => (j.is_live ? "live" : j.status === "open" ? "expired" : j.status);

type Tab = "dashboard" | "post" | "jobs" | "employers" | "applications" | "reports" | "categories";

export default function AdminLocalJobs() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [editing, setEditing] = useState<any | null>(null);
  const access = useQuery({ queryKey: ["/api/admin/lj/me"], queryFn: () => getJson("/api/admin/lj/me"), retry: false });

  const tabs: [Tab, string][] = [["dashboard", "Dashboard"], ["post", editing ? "Edit job" : "Post a job"], ["jobs", "Manage jobs"], ["employers", "Employers"], ["applications", "Applications"], ["reports", "Reports"], ["categories", "Categories"]];
  if (access.isLoading) return <AdminLayout title="Local Jobs"><div className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></div></AdminLayout>;
  if (access.error) return <AdminLayout title="Local Jobs"><div className="p-6 text-rose-700">{String((access.error as Error).message)}</div></AdminLayout>;

  return (
    <AdminLayout title="Local Jobs">
      <div className="p-3 sm:p-6 space-y-4 max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Kenyan Local Jobs</h1>
            <p className="text-sm text-slate-500">Publish jobs for any employer in seconds — no employer account, no fee, no subscription.</p>
          </div>
          <Button size="lg" className="bg-emerald-600 hover:bg-emerald-700 text-base" onClick={() => { setEditing(null); setTab("post"); }} data-testid="button-lj-post">
            <Plus className="h-5 w-5 mr-1.5" /> POST A JOB
          </Button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {tabs.map(([t, l]) => (
            <Button key={t} size="sm" variant={tab === t ? "default" : "outline"} onClick={() => setTab(t)} className="shrink-0">{l}</Button>
          ))}
          <a href="/kenya-careers" target="_blank" rel="noreferrer" className="shrink-0"><Button size="sm" variant="ghost"><ExternalLink className="h-3.5 w-3.5 mr-1" />Public page</Button></a>
        </div>
        {tab === "dashboard" && <Dashboard onTab={setTab} />}
        {tab === "post" && <PostForm editing={editing} onDone={() => { setEditing(null); setTab("jobs"); }} onCancel={() => { setEditing(null); setTab("jobs"); }} />}
        {tab === "jobs" && <JobsList onEdit={(j) => { setEditing(j); setTab("post"); }} />}
        {tab === "employers" && <Employers />}
        {tab === "applications" && <Applications />}
        {tab === "reports" && <Reports />}
        {tab === "categories" && <Categories />}
      </div>
    </AdminLayout>
  );
}

function Dashboard({ onTab }: { onTab: (t: Tab) => void }) {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/admin/lj/overview"], queryFn: () => getJson("/api/admin/lj/overview"), refetchInterval: 20_000 });
  if (isLoading || !data) return <Loader2 className="h-5 w-5 animate-spin" />;
  const tiles: [string, any, Tab?][] = [
    ["Active vacancies (live jobs)", data.active, "jobs"], ["Total positions available", data.positions], ["Total published jobs", data.published_total, "jobs"],
    ["Drafts", data.drafts, "jobs"], ["Expired", data.expired, "jobs"], ["Deactivated", data.deactivated, "jobs"],
    ["Employer contacts opened", data.reveals], ["Call taps", data.calls], ["WhatsApp enquiries", data.whatsapp],
    ["Jobs posted by admin", data.by_admin], ["Jobs posted by employers", data.by_employers], ["Flagged by scam checks", data.flagged, "jobs"],
    ["Open user reports", data.openReports, "reports"], ["Employer claims awaiting approval", data.pendingEmployerClaims],
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {tiles.map(([l, n, t]) => (
        <Card key={l} className={t ? "cursor-pointer hover:border-emerald-400" : ""} onClick={() => t && onTab(t)}>
          <CardContent className="p-4"><div className="text-xs text-slate-500">{l}</div><div className="text-2xl font-bold">{Number(n ?? 0).toLocaleString()}</div></CardContent>
        </Card>
      ))}
      <p className="col-span-full text-xs text-slate-400">Updates every 20 seconds from the database. {data.contacts_7d} call/WhatsApp taps in the last 7 days.</p>
    </div>
  );
}

function Field({ label, hint, children, wide }: { label: string; hint?: string; children: any; wide?: boolean }) {
  return <label className={`text-sm block ${wide ? "sm:col-span-2" : ""}`}><span className="font-medium">{label}</span>{hint && <span className="text-slate-400 font-normal"> — {hint}</span>}{children}</label>;
}

function PostForm({ editing, onDone, onCancel }: { editing: any | null; onDone: () => void; onCancel: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [f, setF] = useState<F>(editing ? jobToForm(editing) : EMPTY);
  const [preview, setPreview] = useState<any | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [errField, setErrField] = useState<string | null>(null);
  useEffect(() => { setF(editing ? jobToForm(editing) : EMPTY); setPreview(null); }, [editing]);
  const set = (k: string, v: any) => { setF((p) => ({ ...p, [k]: v })); setPreview(null); };
  const cats = useQuery<any>({ queryKey: ["/api/admin/lj/categories"], queryFn: () => getJson("/api/admin/lj/categories") });
  const body = (extra: any = {}) => ({ ...f, vacancies: Number(f.vacancies) || 1, salaryMin: f.salaryMin === "" ? null : Number(f.salaryMin), salaryMax: f.salaryMax === "" ? null : Number(f.salaryMax), ...extra });
  const fail = (e: any) => { setErrField(e?.body?.field ?? null); toast({ title: "Not saved", description: e.message, variant: "destructive" }); };

  async function doPreview() {
    setBusy("preview");
    try { setPreview(await send("POST", "/api/admin/lj/check", body({ id: editing?.id }))); setErrField(null); window.scrollTo({ top: 0, behavior: "smooth" }); }
    catch (e: any) { fail(e); } finally { setBusy(null); }
  }
  async function save(publish: boolean, override = false) {
    setBusy(publish ? "publish" : "draft");
    try {
      if (editing) {
        await send("PUT", `/api/admin/lj/jobs/${editing.id}`, body());
        if (publish && editing.status !== "open") await send("POST", `/api/admin/lj/jobs/${editing.id}/action`, { action: "publish", overrideRisk: override });
        if (!publish && editing.status === "open") await send("POST", `/api/admin/lj/jobs/${editing.id}/action`, { action: "draft" });
        toast({ title: publish ? "Saved — job is live" : "Saved as draft" });
      } else {
        const r = await send<any>("POST", "/api/admin/lj/jobs", body({ publish, overrideRisk: override }));
        toast({ title: publish ? "Job is live" : "Draft saved", description: publish ? "It's on the public jobs page now and counted in the totals." : "Only admins can see it." });
        if (publish) window.open(`/kenya-careers/job/${r.job.id}`, "_blank");
      }
      qc.invalidateQueries({ queryKey: ["/api/admin/lj/jobs"] }); qc.invalidateQueries({ queryKey: ["/api/admin/lj/overview"] });
      setF(EMPTY); setPreview(null); onDone();
    } catch (e: any) {
      if (e?.body?.code === "RISK" && confirm(`${e.message}\n\nPublish anyway?`)) return save(publish, true);
      fail(e);
    } finally { setBusy(null); }
  }
  const cls = (k: string) => `${input} ${errField === k ? "border-rose-500 ring-1 ring-rose-400" : ""}`;

  return (
    <div className="space-y-4">
      {preview && <PreviewCard f={f} check={preview} cats={cats.data?.categories ?? []} />}
      <Card><CardContent className="p-4 sm:p-5 space-y-5">
        <section className="grid sm:grid-cols-2 gap-3">
          <h3 className="sm:col-span-2 font-semibold">The job</h3>
          <Field label="Job title *" wide><input className={cls("title")} value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Shop attendant" data-testid="lj-title" /></Field>
          <Field label="Employer / business name *"><input className={cls("employerName")} value={f.employerName} onChange={(e) => set("employerName", e.target.value)} placeholder="e.g. Mama Njeri Supermarket" data-testid="lj-employer" disabled={!!editing} /></Field>
          <Field label="Category *">
            <select className={cls("category")} value={f.category} onChange={(e) => set("category", e.target.value)} data-testid="lj-category">
              <option value="">Choose…</option>
              {(cats.data?.categories ?? []).filter((c: any) => c.active).map((c: any) => <option key={c.slug} value={c.slug}>{c.icon} {c.label}</option>)}
            </select>
          </Field>
          <Field label="Job description *" hint="duties, what the person will do" wide><textarea rows={5} className={cls("description")} value={f.description} onChange={(e) => set("description", e.target.value)} data-testid="lj-description" /></Field>
          <Field label="Number of vacancies"><input className={input} inputMode="numeric" value={f.vacancies} onChange={(e) => set("vacancies", e.target.value.replace(/\D/g, ""))} /></Field>
          <Field label="Employment type"><select className={input} value={f.employmentType} onChange={(e) => set("employmentType", e.target.value)}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <div className="sm:col-span-2 grid grid-cols-3 gap-2">
            <Field label="Salary from (KES)"><input className={cls("salaryMin")} inputMode="numeric" value={f.salaryMin} onChange={(e) => set("salaryMin", e.target.value.replace(/\D/g, ""))} /></Field>
            <Field label="Salary to (KES)"><input className={input} inputMode="numeric" value={f.salaryMax} onChange={(e) => set("salaryMax", e.target.value.replace(/\D/g, ""))} /></Field>
            <Field label="Paid"><select className={input} value={f.salaryPeriod} onChange={(e) => set("salaryPeriod", e.target.value)}>{PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          </div>
        </section>

        <section className="grid sm:grid-cols-2 gap-3">
          <h3 className="sm:col-span-2 font-semibold">Where</h3>
          <Field label="County *"><select className={cls("county")} value={f.county} onChange={(e) => set("county", e.target.value)}>{KENYA_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
          <Field label="Town"><input className={input} value={f.town} onChange={(e) => set("town", e.target.value)} placeholder="e.g. Ruiru" /></Field>
          <Field label="Estate / neighbourhood"><input className={input} value={f.estate} onChange={(e) => set("estate", e.target.value)} placeholder="e.g. Kahawa Wendani" /></Field>
          <Field label="Exact workplace location"><input className={input} value={f.workplaceLocation} onChange={(e) => set("workplaceLocation", e.target.value)} placeholder="e.g. Next to Wendani Total petrol station" /></Field>
        </section>

        <section className="grid sm:grid-cols-2 gap-3">
          <h3 className="sm:col-span-2 font-semibold">Requirements & hours</h3>
          <Field label="Minimum qualifications"><input className={input} value={f.minQualification} onChange={(e) => set("minQualification", e.target.value)} placeholder="e.g. KCSE" /></Field>
          <Field label="Experience required"><input className={input} value={f.experienceText} onChange={(e) => set("experienceText", e.target.value)} placeholder="e.g. 1 year" /></Field>
          <Field label="Working hours"><input className={input} value={f.workingHours} onChange={(e) => set("workingHours", e.target.value)} placeholder="e.g. Mon–Sat, 7am–7pm" /></Field>
          <Field label="Gender requirement" hint="only if lawful & genuinely necessary"><input className={input} value={f.genderRequirement} onChange={(e) => set("genderRequirement", e.target.value)} placeholder="Leave blank if none" /></Field>
          <Field label="Application deadline"><input type="date" className={cls("deadline")} value={f.deadline} onChange={(e) => set("deadline", e.target.value)} /></Field>
          <Field label="Hide from site after" hint="optional expiry date"><input type="date" className={cls("expiresAt")} value={f.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} /></Field>
        </section>

        <section className="grid sm:grid-cols-2 gap-3 rounded-lg border border-emerald-200 dark:border-emerald-900 p-3">
          <h3 className="sm:col-span-2 font-semibold">Employer contact</h3>
          <Field label="Contact person"><input className={input} value={f.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} /></Field>
          <Field label="Telephone (for the Call button)"><input className={cls("contactPhone")} value={f.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} placeholder="07XX XXX XXX" data-testid="lj-phone" /></Field>
          <Field label="WhatsApp number" hint="blank = same as telephone"><input className={cls("whatsappPhone")} value={f.whatsappPhone} onChange={(e) => set("whatsappPhone", e.target.value)} placeholder="07XX XXX XXX" /></Field>
          <Field label="Alternative contact"><input className={input} value={f.altContact} onChange={(e) => set("altContact", e.target.value)} placeholder="e.g. email, or second number" /></Field>
          <Field label="Additional instructions" hint="how to apply" wide><textarea rows={2} className={input} value={f.instructions} onChange={(e) => set("instructions", e.target.value)} placeholder="e.g. Call between 8am and 5pm. Walk in with your ID." /></Field>
          <label className="sm:col-span-2 text-sm inline-flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={f.contactAuthorized} onChange={(e) => set("contactAuthorized", e.target.checked)} data-testid="lj-authorized" />
            <span><b>The employer agreed to have these contact details published.</b> If unticked, Call/WhatsApp buttons stay hidden and job seekers only see the instructions.</span>
          </label>
        </section>

        <section className="grid sm:grid-cols-2 gap-3">
          <h3 className="sm:col-span-2 font-semibold">Source & verification</h3>
          <Field label="Job source"><select className={input} value={f.source} onChange={(e) => set("source", e.target.value)}>{SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Verification"><select className={input} value={f.verificationStatus} onChange={(e) => set("verificationStatus", e.target.value)}>{VERIFY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="How were the employer's details confirmed?" hint="required for 'confirmed' or 'verified'" wide><input className={cls("verificationNote")} value={f.verificationNote} onChange={(e) => set("verificationNote", e.target.value)} placeholder="e.g. Called the owner on 0722… on 23 Nov; visited the shop" /></Field>
        </section>

        <div className="flex flex-wrap gap-2 sticky bottom-0 bg-white/95 dark:bg-slate-950/95 py-2">
          <Button type="button" variant="outline" onClick={doPreview} disabled={!!busy} data-testid="lj-preview">{busy === "preview" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Eye className="h-4 w-4 mr-1" />}Preview</Button>
          <Button type="button" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => save(true)} disabled={!!busy} data-testid="lj-publish">{busy === "publish" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-1" />}Publish now</Button>
          <Button type="button" variant="outline" onClick={() => save(false)} disabled={!!busy} data-testid="lj-draft">{busy === "draft" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}Save draft</Button>
          <Button type="button" variant="ghost" onClick={() => { setF(EMPTY); setPreview(null); onCancel(); }}><X className="h-4 w-4 mr-1" />Cancel</Button>
        </div>
      </CardContent></Card>
    </div>
  );
}

function PreviewCard({ f, check, cats }: { f: F; check: any; cats: any[] }) {
  const cat = cats.find((c) => c.slug === f.category);
  const pay = f.salaryMin || f.salaryMax ? `${kes(f.salaryMin)}${f.salaryMax ? ` – ${kes(f.salaryMax)}` : ""} ${PERIODS.find((p) => p[0] === f.salaryPeriod)?.[1] ?? ""}` : "Pay not stated";
  return (
    <Card className="border-emerald-300"><CardContent className="p-4 space-y-2">
      <div className="text-xs font-semibold uppercase text-emerald-700">Preview — how job seekers will see it</div>
      {check.labels?.length > 0 && (
        <div className="rounded-md bg-amber-50 border border-amber-300 p-2 text-sm text-amber-900 flex gap-2"><ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" /><div><b>Check before publishing:</b> {check.labels.join(" · ")}</div></div>
      )}
      {!check.located && <div className="text-xs text-amber-700">We couldn't place this town/estate on the map — it will appear in county searches but not in "near me". Use a well-known town name.</div>}
      <div className="text-lg font-bold">{f.title}</div>
      <div className="text-sm text-slate-600">{f.employerName} · {[f.estate, f.town, f.county].filter(Boolean).join(", ")}</div>
      <div className="text-sm">{cat ? `${cat.icon} ${cat.label}` : ""} · {TYPES.find((t) => t[0] === f.employmentType)?.[1]} · {f.vacancies || 1} vacanc{Number(f.vacancies) === 1 ? "y" : "ies"} · {pay}</div>
      <p className="text-sm whitespace-pre-line">{f.description}</p>
      <div className="flex flex-wrap gap-2 pt-1">
        {f.contactAuthorized && check.contactPhone && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 text-white text-xs px-3 py-1"><Phone className="h-3.5 w-3.5" />Call {check.contactPhone}</span>}
        {f.contactAuthorized && (check.whatsappPhone || check.contactPhone) && <span className="inline-flex items-center gap-1 rounded-full bg-green-500 text-white text-xs px-3 py-1"><MessageCircle className="h-3.5 w-3.5" />WhatsApp {check.whatsappPhone || check.contactPhone}</span>}
        {!f.contactAuthorized && <span className="text-xs text-slate-500">No Call/WhatsApp buttons (contact not authorised).</span>}
      </div>
    </CardContent></Card>
  );
}

function JobsList({ onEdit }: { onEdit: (j: any) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [flt, setFlt] = useState<F>({ status: "all", source: "all", county: "all", category: "all", q: "", from: "", to: "" });
  const qs = useMemo(() => new URLSearchParams(Object.entries(flt).filter(([, v]) => v && v !== "all") as any).toString(), [flt]);
  const { data, isLoading, refetch, isFetching } = useQuery<any>({ queryKey: ["/api/admin/lj/jobs", qs], queryFn: () => getJson(`/api/admin/lj/jobs?${qs}`) });
  const cats = useQuery<any>({ queryKey: ["/api/admin/lj/categories"], queryFn: () => getJson("/api/admin/lj/categories") });
  async function act(id: string, action: string, extra: any = {}) {
    try {
      await send("POST", `/api/admin/lj/jobs/${id}/action`, { action, ...extra });
      toast({ title: "Done" });
      qc.invalidateQueries({ queryKey: ["/api/admin/lj/jobs"] }); qc.invalidateQueries({ queryKey: ["/api/admin/lj/overview"] });
    } catch (e: any) {
      if (e?.body?.code === "RISK" && confirm(`${e.message}\n\nPublish anyway?`)) return act(id, action, { ...extra, overrideRisk: true });
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }
  }
  return (
    <div className="space-y-3">
      <Card><CardContent className="p-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        <input className={`${input} col-span-2`} placeholder="Search title, employer, town, phone" value={flt.q} onChange={(e) => setFlt({ ...flt, q: e.target.value })} />
        <select className={input} value={flt.status} onChange={(e) => setFlt({ ...flt, status: e.target.value })}>
          {[["all", "All statuses"], ["active", "Live"], ["draft", "Drafts"], ["paused", "Deactivated"], ["expired", "Expired"], ["archived", "Archived"], ["flagged", "Flagged"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className={input} value={flt.source} onChange={(e) => setFlt({ ...flt, source: e.target.value })}><option value="all">Any source</option><option value="admin">Posted by admin</option><option value="employer">Posted by employers</option></select>
        <select className={input} value={flt.county} onChange={(e) => setFlt({ ...flt, county: e.target.value })}><option value="all">All counties</option>{KENYA_COUNTIES.map((c) => <option key={c}>{c}</option>)}</select>
        <select className={input} value={flt.category} onChange={(e) => setFlt({ ...flt, category: e.target.value })}><option value="all">All categories</option>{(cats.data?.categories ?? []).map((c: any) => <option key={c.slug} value={c.slug}>{c.label}</option>)}</select>
        <input type="date" className={input} value={flt.from} onChange={(e) => setFlt({ ...flt, from: e.target.value })} title="Posted from" />
        <input type="date" className={input} value={flt.to} onChange={(e) => setFlt({ ...flt, to: e.target.value })} title="Posted to" />
        <div className="col-span-2 sm:col-span-4 lg:col-span-8 flex gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} />Refresh</Button>
          <a href={`/api/admin/lj/export.csv?${qs}`}><Button size="sm" variant="outline"><Download className="h-3.5 w-3.5 mr-1" />Export CSV</Button></a>
          <span className="text-xs text-slate-500 self-center">{data?.jobs?.length ?? 0} jobs</span>
        </div>
      </CardContent></Card>
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (data?.jobs ?? []).length === 0 ? <p className="text-sm text-slate-500">No jobs match.</p> : (
        <div className="space-y-2">
          {data.jobs.map((j: any) => {
            const st = jobState(j);
            return (
              <Card key={j.id}><CardContent className="p-3 sm:p-4 flex flex-col lg:flex-row gap-3 justify-between">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[st] ?? "bg-slate-100"}`}>{st}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">{j.source === "employer" ? "by employer" : j.source === "admin" ? "by WAH admin" : "on behalf of employer"}</span>
                    {j.employer_verified && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 inline-flex items-center gap-1"><BadgeCheck className="h-3 w-3" />verified</span>}
                    {j.company_no_account && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">employer has no account</span>}
                    <span className="font-semibold">{j.title}</span>
                  </div>
                  <div className="text-xs text-slate-500">{j.company_name} · {[j.estate, j.town, j.county].filter(Boolean).join(", ")} · {j.vacancies} vacanc{j.vacancies === 1 ? "y" : "ies"}</div>
                  <div className="text-xs text-slate-500">Posted {d8(j.published_at ?? j.created_at)} · deadline {d8(j.deadline)} · hides {d8(j.expires_at)} · {j.view_count ?? 0} views · {j.reveals} contacts · {j.calls} calls · {j.whatsapps} WhatsApp · {j.applications} applications</div>
                  {j.risk_labels?.length > 0 && <div className="text-xs text-amber-700 inline-flex items-center gap-1"><ShieldAlert className="h-3.5 w-3.5" />{j.risk_labels.join(" · ")}</div>}
                </div>
                <div className="flex flex-wrap gap-1.5 shrink-0 items-start">
                  {st === "live" && <a href={`/kenya-careers/job/${j.id}`} target="_blank" rel="noreferrer"><Button size="sm" variant="outline"><ExternalLink className="h-3.5 w-3.5" /></Button></a>}
                  <Button size="sm" variant="outline" onClick={() => onEdit(j)}><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Button>
                  {(st === "draft" || st === "paused" || st === "archived") && <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => act(j.id, "publish")}><PlayCircle className="h-3.5 w-3.5 mr-1" />Publish</Button>}
                  {st === "live" && <Button size="sm" variant="outline" onClick={() => act(j.id, "deactivate")}><PauseCircle className="h-3.5 w-3.5 mr-1" />Deactivate</Button>}
                  {st !== "draft" && <Button size="sm" variant="outline" onClick={() => { const d = prompt("Renew for how many days?", "30"); if (d) act(j.id, "renew", { days: Number(d) }); }}><CalendarPlus className="h-3.5 w-3.5 mr-1" />Renew</Button>}
                  <Button size="sm" variant="outline" onClick={() => { const d = prompt("Hide from the site after (YYYY-MM-DD). Leave empty for no expiry.", j.expires_at ? String(j.expires_at).slice(0, 10) : ""); if (d !== null) act(j.id, "set_expiry", { expiresAt: d }); }}>Expiry</Button>
                  {st !== "archived" && <Button size="sm" variant="outline" onClick={() => act(j.id, "archive")}><Archive className="h-3.5 w-3.5 mr-1" />Archive</Button>}
                  <Button size="sm" variant="outline" className="text-rose-700" onClick={() => { if (confirm("Delete this job permanently? (Archive keeps it if you might need it.)")) act(j.id, "delete"); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </CardContent></Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Employers() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/admin/lj/employers", q], queryFn: () => getJson(`/api/admin/lj/employers?q=${encodeURIComponent(q)}`) });
  async function verify(e: any, on: boolean) {
    const note = on ? prompt("How did you verify this employer? (e.g. 'Visited the shop 23 Nov', 'Business permit seen')") : "";
    if (on && !note) return;
    try { await send("PATCH", `/api/admin/lj/employers/${e.id}`, { verified: on, verificationNote: note || undefined }); toast({ title: on ? "Marked verified" : "Verification removed" }); qc.invalidateQueries({ queryKey: ["/api/admin/lj/employers"] }); }
    catch (err: any) { toast({ title: "Failed", description: err.message, variant: "destructive" }); }
  }
  return (
    <div className="space-y-2">
      <input className={input} placeholder="Search employers" value={q} onChange={(e) => setQ(e.target.value)} />
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (data?.employers ?? []).map((e: any) => (
        <Card key={e.id}><CardContent className="p-3 flex flex-col sm:flex-row justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold">{e.name} {e.verified_at && <BadgeCheck className="inline h-4 w-4 text-emerald-600" />}</div>
            <div className="text-xs text-slate-500">{[e.town, e.county].filter(Boolean).join(", ") || "—"} · {e.phone ? `0${String(e.phone).slice(-9)}` : "no phone"} · {e.has_account ? "has employer account" : e.created_by_admin ? "listed by admin (no account)" : "no account"} · {e.open_jobs}/{e.jobs} jobs open · {e.status}</div>
            {e.verification_note && <div className="text-xs text-emerald-700">Verified: {e.verification_note}</div>}
          </div>
          <div className="flex gap-1.5 shrink-0">
            {e.verified_at ? <Button size="sm" variant="outline" onClick={() => verify(e, false)}>Remove verified</Button> : <Button size="sm" variant="outline" onClick={() => verify(e, true)}><BadgeCheck className="h-3.5 w-3.5 mr-1" />Mark verified</Button>}
          </div>
        </CardContent></Card>
      ))}
    </div>
  );
}

function Applications() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/admin/lj/applications"], queryFn: () => getJson("/api/admin/lj/applications") });
  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  const rows = data?.applications ?? [];
  return rows.length === 0 ? <p className="text-sm text-slate-500">No applications yet. (Most job seekers will call or WhatsApp the employer directly — see the contact counts on each job.)</p> : (
    <div className="space-y-2">{rows.map((a: any) => (
      <Card key={a.id}><CardContent className="p-3 text-sm"><b>{a.applicant_name ?? "Applicant"}</b> → {a.title} at {a.company_name} · {a.status} · {d8(a.created_at)} · {a.phone ?? ""} {a.email ?? ""}</CardContent></Card>
    ))}</div>
  );
}

function Reports() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/admin/lj/reports"], queryFn: () => getJson("/api/admin/lj/reports") });
  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  const rows = data?.reports ?? [];
  return rows.length === 0 ? <p className="text-sm text-slate-500">No reports from job seekers.</p> : (
    <div className="space-y-2">{rows.map((r: any) => (
      <Card key={r.id}><CardContent className="p-3 text-sm"><b>{r.reason}</b> — {r.title ?? "deleted job"} ({r.company_name ?? "—"}) · {d8(r.created_at)} · {r.status ?? "new"}{r.details ? <div className="text-slate-600 mt-1">{r.details}</div> : null}</CardContent></Card>
    ))}</div>
  );
}

function Categories() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [label, setLabel] = useState("");
  const [icon, setIcon] = useState("💼");
  const { data } = useQuery<any>({ queryKey: ["/api/admin/lj/categories"], queryFn: () => getJson("/api/admin/lj/categories") });
  async function add() {
    try { await send("POST", "/api/admin/lj/categories", { label, icon }); setLabel(""); toast({ title: "Category added" }); qc.invalidateQueries({ queryKey: ["/api/admin/lj/categories"] }); }
    catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
  }
  return (
    <div className="space-y-3">
      <Card><CardContent className="p-3 flex gap-2">
        <input className={`${input} w-16`} value={icon} onChange={(e) => setIcon(e.target.value)} />
        <input className={input} placeholder="New category, e.g. Car wash attendants" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Button onClick={add} disabled={label.trim().length < 2}><Plus className="h-4 w-4 mr-1" />Add</Button>
      </CardContent></Card>
      <div className="flex flex-wrap gap-2">{(data?.categories ?? []).map((c: any) => <span key={c.slug} className="text-sm rounded-full border px-3 py-1">{c.icon} {c.label}</span>)}</div>
    </div>
  );
}
