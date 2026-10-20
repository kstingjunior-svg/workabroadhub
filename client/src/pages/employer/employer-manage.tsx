/**
 * /employer/companies/:id/manage — single-company manage view.
 *
 * 2026-06 Phase 4: three tabs — Profile, Jobs, Applications.
 * The "Post a job" + "Edit profile" actions open modals inline.
 *
 * Server-side, every endpoint re-checks the user is an admin of this
 * company via isCompanyAdmin() — never trust the client to send a
 * companyId they shouldn't have access to.
 */
import { useEffect, useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import {
  ArrowLeft, BadgeCheck, Briefcase, Building2, Loader2, Users, Plus,
  Edit3, ExternalLink, Globe, Phone, Mail, MapPin, CheckCircle2, XCircle,
  Clock, Eye, MessageCircle, Trophy, X, Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { CompanyLogo } from "@/components/kenya-careers-company-logo";
import { VacancyFormModal, ROLE_CATEGORY_LABEL } from "@/components/vacancy-form-modal";

interface Company {
  id: string; name: string; slug: string | null; logoUrl: string | null;
  industry: string | null; address: string | null; county: string | null;
  contactName: string | null; phone: string | null; email: string | null;
  description: string | null; website: string | null;
  verified: boolean; status: string;
  institutionType?: string; schoolLevels?: string[] | null; town?: string | null;
  registrationNumber?: string | null; verificationStatus?: "verified" | "pending" | "suspended";
}
interface Branch {
  id: string; name: string; county: string | null; town: string | null;
  location: string | null; managerName: string | null; contactPhone: string | null;
}
interface Job {
  id: string; title: string; department: string | null; vacancies: number;
  employmentType: string | null;
  salaryMin: number | null; salaryMax: number | null;
  county: string | null; town: string | null;
  experienceLevel: string | null; category: string | null;
  deadline: string | null; status: string; createdAt: string;
  isSeed: boolean; applicationCount: number;
  branch: { id: string; name: string } | null;
  // 2026-10 School Recruitment Portal
  viewCount?: number; expired?: boolean; publishedAt?: string | null;
  responsibilities?: string | null; requirements?: string | null; credentials?: string | null;
  roleCategory?: string | null; subjects?: string[] | null; teachingLevel?: string | null;
  tscRequired?: boolean | null; startDate?: string | null; accommodation?: boolean | null;
  applicationMethod?: string | null; applicationContact?: string | null;
}
type JobFilter = "all" | "open" | "draft" | "paused" | "expired" | "closed";
const JOB_STATUS_META: Record<string, { label: string; cls: string }> = {
  open:    { label: "Published", cls: "border-emerald-300 text-emerald-700 bg-emerald-50" },
  draft:   { label: "Draft",     cls: "border-slate-300 text-slate-700 bg-slate-50" },
  paused:  { label: "Paused",    cls: "border-amber-300 text-amber-800 bg-amber-50" },
  expired: { label: "Expired",   cls: "border-orange-300 text-orange-800 bg-orange-50" },
  closed:  { label: "Closed",    cls: "border-rose-300 text-rose-700 bg-rose-50" },
};
const effectiveStatus = (j: { status: string; expired?: boolean }) => (j.status === "open" && j.expired ? "expired" : j.status);
interface Application {
  id: string; status: string; appliedAt: string;
  applicantName: string; email: string; phone: string;
  county: string | null; education: string | null; yearsExperience: number | null;
  cvUrl: string | null; certificatesUrl: string | null; coverNote: string | null;
  jobId: string; jobTitle: string;
}

type Tab = "jobs" | "applications" | "profile";

const STATUS_META: Record<string, { label: string; icon: any; cls: string }> = {
  submitted:    { label: "Submitted",    icon: Clock,        cls: "border-blue-300 text-blue-700 bg-blue-50" },
  under_review: { label: "Under review", icon: Eye,          cls: "border-indigo-300 text-indigo-700 bg-indigo-50" },
  shortlisted:  { label: "Shortlisted",  icon: CheckCircle2, cls: "border-emerald-300 text-emerald-700 bg-emerald-50" },
  interview:    { label: "Interview",    icon: MessageCircle, cls: "border-violet-300 text-violet-700 bg-violet-50" },
  hired:        { label: "Hired",        icon: Trophy,       cls: "border-amber-300 text-amber-700 bg-amber-50" },
  rejected:     { label: "Not selected", icon: XCircle,      cls: "border-muted-foreground/30 text-muted-foreground bg-muted/40" },
};

const KENYA_COUNTIES = [
  "Baringo", "Bomet", "Bungoma", "Busia", "Elgeyo-Marakwet", "Embu", "Garissa",
  "Homa Bay", "Isiolo", "Kajiado", "Kakamega", "Kericho", "Kiambu", "Kilifi",
  "Kirinyaga", "Kisii", "Kisumu", "Kitui", "Kwale", "Laikipia", "Lamu",
  "Machakos", "Makueni", "Mandera", "Marsabit", "Meru", "Migori", "Mombasa",
  "Murang'a", "Nairobi", "Nakuru", "Nandi", "Narok", "Nyamira", "Nyandarua",
  "Nyeri", "Samburu", "Siaya", "Taita-Taveta", "Tana River", "Tharaka-Nithi",
  "Trans Nzoia", "Turkana", "Uasin Gishu", "Vihiga", "Wajir", "West Pokot",
];

const JOB_CATEGORIES = ["retail","hospitality","healthcare","construction","transport","security","cleaning","education","logistics","other"];

function formatSalary(min: number | null, max: number | null): string | null {
  if (!min && !max) return null;
  if (min && max && min !== max) return `KES ${min.toLocaleString()}–${max.toLocaleString()}`;
  return `KES ${(min ?? max)!.toLocaleString()}+`;
}

export default function EmployerManage() {
  const [, params] = useRoute<{ id: string }>("/employer/companies/:id/manage");
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("jobs");
  const [data, setData] = useState<{ company: Company; branches: Branch[]; jobs: Job[]; applications: Application[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [postJobOpen, setPostJobOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [jobFilter, setJobFilter] = useState<JobFilter>("all");
  const [appJobFilter, setAppJobFilter] = useState<string>("all");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [savingAppId, setSavingAppId] = useState<string | null>(null);
  const { toast } = useToast();

  async function load() {
    if (!params?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/employer/companies/${params.id}`, { credentials: "include" });
      if (res.status === 401) { navigate("/login?redirect=" + encodeURIComponent(window.location.pathname)); return; }
      if (res.status === 403) { setError("You don't have access to this company. Ask the company owner to grant you access."); setLoading(false); return; }
      if (res.status === 404) { setError("Company not found."); setLoading(false); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (err: any) {
      setError(err?.message || "Could not load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [params?.id]);

  async function updateApplicationStatus(appId: string, status: string) {
    setSavingAppId(appId);
    try {
      const res = await fetch(`/api/employer/applications/${appId}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({ variant: "destructive", title: "Update failed", description: body?.message });
        return;
      }
      toast({ title: "Updated", description: `Application set to ${status}.` });
      await load();
    } finally {
      setSavingAppId(null);
    }
  }

  async function setJobStatus(jobId: string, status: "open" | "paused" | "closed" | "draft") {
    const prompts: Record<string, string> = {
      closed: "Close this vacancy? It will stop accepting applications (you can reopen it later).",
      paused: "Pause this vacancy? It will be hidden from candidates until you resume it.",
    };
    if (prompts[status] && !confirm(prompts[status])) return;
    const res = await fetch(`/api/employer/jobs/${jobId}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      toast({ title: body?.message ?? "Updated" });
      await load();
    } else {
      toast({ variant: "destructive", title: "Couldn't update", description: body?.message });
    }
  }

  async function uploadLogo(file: File) {
    if (!data) return;
    if (file.size > 1024 * 1024) { toast({ variant: "destructive", title: "Logo too large", description: "Use an image under 1 MB." }); return; }
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append("logo", file);
      const res = await fetch(`/api/employer/companies/${data.company.id}/logo`, { method: "POST", credentials: "include", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast({ variant: "destructive", title: "Upload failed", description: body?.message }); return; }
      toast({ title: "Logo updated" });
      await load();
    } finally { setUploadingLogo(false); }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background px-4 py-10 max-w-2xl mx-auto">
        <Link href="/employer/dashboard">
          <Button variant="ghost" size="sm" className="mb-4"><ArrowLeft className="h-4 w-4 mr-1.5" /> Back to dashboard</Button>
        </Link>
        <Card><CardContent className="p-8 text-center">
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Link href="/employer/dashboard"><Button>Back to dashboard</Button></Link>
        </CardContent></Card>
      </div>
    );
  }

  const { company, branches, jobs, applications } = data;

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-700 text-white px-4 pt-4 pb-8">
        <div className="max-w-4xl mx-auto">
          <Link href="/employer/dashboard">
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/10 -ml-2 mb-3">
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Dashboard
            </Button>
          </Link>
          <div className="flex items-start gap-3">
            <CompanyLogo name={company.name} logoUrl={company.logoUrl} size="lg" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold leading-tight">{company.name}</h1>
                {company.verified && (
                  <Badge className="bg-emerald-500/30 text-emerald-100 border-emerald-400/30">
                    <BadgeCheck className="h-3 w-3 mr-0.5" /> Verified
                  </Badge>
                )}
                {company.status === "pending" && (
                  <Badge className="bg-amber-500/30 text-amber-100 border-amber-400/30">
                    Pending verification
                  </Badge>
                )}
              </div>
              <p className="text-sm text-slate-300 mt-0.5">{[company.industry, company.county].filter(Boolean).join(" · ") || "—"}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 mt-4">
        {company.verificationStatus === "pending" && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 p-4 text-sm" role="status">
            <p className="font-semibold">Pending verification</p>
            <p className="mt-0.5">We're checking that {company.name} is genuine (usually within 1 business day). You can complete your profile and prepare vacancies now — they'll go live automatically once you're verified.</p>
          </div>
        )}
        {company.verificationStatus === "suspended" && (
          <div className="mb-4 rounded-xl border border-rose-300 bg-rose-50 text-rose-900 p-4 text-sm" role="alert">
            This account is suspended. Please contact support@workabroadhub.tech.
          </div>
        )}
        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-4">
          <Button variant={tab === "jobs" ? "default" : "outline"} size="sm" onClick={() => setTab("jobs")}>
            <Briefcase className="h-4 w-4 mr-1.5" /> Jobs ({jobs.length})
          </Button>
          <Button variant={tab === "applications" ? "default" : "outline"} size="sm" onClick={() => setTab("applications")}>
            <Users className="h-4 w-4 mr-1.5" /> Applications ({applications.length})
          </Button>
          <Button variant={tab === "profile" ? "default" : "outline"} size="sm" onClick={() => setTab("profile")}>
            <Building2 className="h-4 w-4 mr-1.5" /> Profile
          </Button>
          <Link href={`/kenya-careers/company/${company.slug ?? company.id}`}>
            <Button variant="ghost" size="sm">
              View public page <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>

        {/* ── JOBS TAB ─────────────────────────────────── */}
        {tab === "jobs" && (() => {
          const counts: Record<string, number> = { all: jobs.length };
          jobs.forEach((j) => { const st = effectiveStatus(j); counts[st] = (counts[st] ?? 0) + 1; });
          const shown = jobs.filter((j) => jobFilter === "all" || effectiveStatus(j) === jobFilter);
          const isSchoolCo = company.institutionType === "school";
          return (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter vacancies">
                {(["all", "open", "draft", "paused", "expired", "closed"] as JobFilter[]).map((k) => (
                  <button key={k} role="tab" aria-selected={jobFilter === k} onClick={() => setJobFilter(k)}
                    className={`text-xs px-3 py-2 rounded-full border transition ${jobFilter === k ? "bg-slate-900 text-white border-slate-900" : "bg-background hover:bg-muted"}`}>
                    {k === "all" ? "All" : JOB_STATUS_META[k].label} ({counts[k] ?? 0})
                  </button>
                ))}
              </div>
              <Button onClick={() => { setEditingJob(null); setPostJobOpen(true); }} className="h-11 bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="btn-new-vacancy">
                <Plus className="h-4 w-4 mr-1.5" /> {isSchoolCo ? "Post a vacancy" : "Post a job"}
              </Button>
            </div>
            {shown.length === 0 && (
              <Card><CardContent className="p-8 text-center text-muted-foreground">
                <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>{jobs.length === 0 ? `No vacancies yet. Tap "${isSchoolCo ? "Post a vacancy" : "Post a job"}" to add your first one.` : "No vacancies in this view."}</p>
              </CardContent></Card>
            )}
            {shown.map((j) => {
              const st = effectiveStatus(j);
              const meta = JOB_STATUS_META[st] ?? JOB_STATUS_META.open;
              return (
              <Card key={j.id} className={st === "closed" ? "opacity-70" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="font-semibold text-sm">{j.title}</h3>
                        {j.isSeed && <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50">Sample (pre-loaded)</Badge>}
                        <Badge variant="outline" className={`text-[10px] ${meta.cls}`}>{meta.label}</Badge>
                        {st === "open" && company.verificationStatus !== "verified" && (
                          <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-800 bg-amber-50">Goes live after verification</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                        {j.roleCategory && <span>{ROLE_CATEGORY_LABEL[j.roleCategory] ?? j.roleCategory}</span>}
                        {j.subjects && j.subjects.length > 0 && <span>{j.subjects.join(", ")}</span>}
                        {(j.county || j.town) && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{[j.town, j.county].filter(Boolean).join(", ")}</span>}
                        {j.deadline && <span>Deadline {new Date(j.deadline).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}</span>}
                        {formatSalary(j.salaryMin, j.salaryMax) && <span className="font-semibold text-emerald-700">{formatSalary(j.salaryMin, j.salaryMax)}</span>}
                      </div>
                      <div className="flex gap-4 mt-2 text-xs">
                        <span><strong>{j.viewCount ?? 0}</strong> view{(j.viewCount ?? 0) === 1 ? "" : "s"}</span>
                        <span><strong>{j.applicationCount}</strong> applicant{j.applicationCount === 1 ? "" : "s"}</span>
                        {j.applicationMethod && j.applicationMethod !== "platform" && <span className="text-muted-foreground">Applies by {j.applicationMethod === "email" ? "email" : "your website"}</span>}
                      </div>
                    </div>
                  </div>
                  {!j.isSeed && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      <Button size="sm" variant="outline" className="h-9" onClick={() => { setEditingJob(j); setPostJobOpen(true); }}>
                        <Edit3 className="h-3.5 w-3.5 mr-1" /> Edit
                      </Button>
                      {j.status === "draft" && <Button size="sm" className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setJobStatus(j.id, "open")}>Publish</Button>}
                      {j.status === "open" && !j.expired && <Button size="sm" variant="outline" className="h-9" onClick={() => setJobStatus(j.id, "paused")}>Pause</Button>}
                      {j.status === "paused" && <Button size="sm" variant="outline" className="h-9" onClick={() => setJobStatus(j.id, "open")}>Resume</Button>}
                      {(j.status === "open" || j.status === "paused" || j.status === "draft") && (
                        <Button size="sm" variant="outline" className="h-9 text-rose-700 border-rose-300 hover:bg-rose-50" onClick={() => setJobStatus(j.id, "closed")}>Close (filled)</Button>
                      )}
                      {j.status === "closed" && <Button size="sm" variant="outline" className="h-9" onClick={() => { setEditingJob(j); setPostJobOpen(true); }}>Re-advertise</Button>}
                      {j.applicationCount > 0 && <Button size="sm" variant="ghost" className="h-9" onClick={() => { setAppJobFilter(j.id); setTab("applications"); }}>View applicants</Button>}
                    </div>
                  )}
                  {j.expired && j.status === "open" && <p className="text-xs text-orange-700 mt-2">The deadline has passed — candidates can no longer apply. Edit the deadline to re-open it, or close it.</p>}
                </CardContent>
              </Card>
              );
            })}
          </div>
          );
        })()}

        {/* ── APPLICATIONS TAB ─────────────────────────── */}
        {tab === "applications" && (
          <div className="space-y-3">
            {applications.length > 0 && (
              <div className="flex items-center gap-2">
                <label htmlFor="app-filter" className="text-sm text-muted-foreground">Vacancy</label>
                <select id="app-filter" value={appJobFilter} onChange={(e) => setAppJobFilter(e.target.value)} className="h-10 text-sm border rounded-md px-3 bg-background max-w-full">
                  <option value="all">All vacancies ({applications.length})</option>
                  {jobs.filter((j) => j.applicationCount > 0).map((j) => <option key={j.id} value={j.id}>{j.title} ({j.applicationCount})</option>)}
                </select>
              </div>
            )}
            {applications.length === 0 && (
              <Card><CardContent className="p-8 text-center text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>No applications yet. Post real jobs to start receiving applicants.</p>
              </CardContent></Card>
            )}
            {applications.filter((a) => appJobFilter === "all" || a.jobId === appJobFilter).map((a) => {
              const meta = STATUS_META[a.status] ?? STATUS_META.submitted;
              const Icon = meta.icon;
              return (
                <Card key={a.id} data-testid={`employer-app-${a.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm">{a.applicantName}</h3>
                        <p className="text-xs text-muted-foreground">
                          {a.email} · {a.phone}
                          {a.county && ` · ${a.county}`}
                          {a.education && ` · ${a.education}`}
                          {a.yearsExperience != null && ` · ${a.yearsExperience} yr${a.yearsExperience === 1 ? "" : "s"} exp`}
                        </p>
                      </div>
                      <Badge variant="outline" className={`shrink-0 ${meta.cls}`}>
                        <Icon className="h-3 w-3 mr-0.5" /> {meta.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      Applied for <strong>{a.jobTitle}</strong> · {new Date(a.appliedAt).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                    {a.coverNote && (
                      <p className="text-xs italic bg-muted/30 rounded p-2 mb-2">"{a.coverNote}"</p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {a.cvUrl && (
                        <Button asChild size="sm" variant="outline">
                          <a href={a.cvUrl} target="_blank" rel="noopener noreferrer">Open CV <ExternalLink className="h-3 w-3 ml-1" /></a>
                        </Button>
                      )}
                      {a.certificatesUrl && (
                        <Button asChild size="sm" variant="outline">
                          <a href={a.certificatesUrl} target="_blank" rel="noopener noreferrer">Certificates <ExternalLink className="h-3 w-3 ml-1" /></a>
                        </Button>
                      )}
                      <select
                        value={a.status}
                        disabled={savingAppId === a.id}
                        onChange={(e) => updateApplicationStatus(a.id, e.target.value)}
                        className="text-xs border rounded-md px-2 py-1 bg-background"
                      >
                        {Object.keys(STATUS_META).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                      </select>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* ── PROFILE TAB ──────────────────────────────── */}
        {tab === "profile" && (
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="font-semibold">Company profile</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">What jobseekers see on your public page.</p>
                </div>
                <Button onClick={() => setEditProfileOpen(true)} size="sm" variant="outline">
                  <Edit3 className="h-3.5 w-3.5 mr-1.5" /> Edit profile
                </Button>
              </div>

              <div className="flex items-center gap-3 mb-4">
                <CompanyLogo name={company.name} logoUrl={company.logoUrl} size="lg" />
                <div>
                  <label className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 cursor-pointer min-h-[44px]">
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
                      onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadLogo(file); e.target.value = ""; }} disabled={uploadingLogo} />
                    {uploadingLogo ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</> : (company.logoUrl ? "Change logo" : "Upload logo")}
                  </label>
                  <p className="text-xs text-muted-foreground">JPG, PNG or WebP, under 1 MB.</p>
                </div>
              </div>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Verification</dt>
                  <dd className="mt-0.5">
                    {company.verificationStatus === "verified"
                      ? <span className="inline-flex items-center gap-1 text-emerald-700"><BadgeCheck className="h-4 w-4" /> Verified by WorkAbroad Hub</span>
                      : company.verificationStatus === "suspended" ? <span className="text-rose-700">Suspended</span>
                      : <span className="text-amber-700">Registered — pending verification</span>}
                  </dd>
                </div>
                {company.registrationNumber && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Registration number</dt>
                    <dd className="mt-0.5">{company.registrationNumber}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs text-muted-foreground">Description</dt>
                  <dd className="mt-0.5">{company.description || <em className="text-muted-foreground">Not set</em>}</dd>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-xs text-muted-foreground">Industry</dt>
                    <dd className="mt-0.5">{company.industry || <em className="text-muted-foreground">—</em>}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">HQ County</dt>
                    <dd className="mt-0.5">{company.county || <em className="text-muted-foreground">—</em>}</dd>
                  </div>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Website</dt>
                  <dd className="mt-0.5">
                    {company.website ? (
                      <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-emerald-700 dark:text-emerald-300 underline inline-flex items-center gap-1">
                        <Globe className="h-3 w-3" /> {company.website}
                      </a>
                    ) : <em className="text-muted-foreground">Not set</em>}
                  </dd>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-xs text-muted-foreground">Contact phone</dt>
                    <dd className="mt-0.5 flex items-center gap-1.5">
                      {company.phone ? <><Phone className="h-3 w-3 text-muted-foreground" /> {company.phone}</> : <em className="text-muted-foreground">—</em>}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Contact email</dt>
                    <dd className="mt-0.5 flex items-center gap-1.5">
                      {company.email ? <><Mail className="h-3 w-3 text-muted-foreground" /> {company.email}</> : <em className="text-muted-foreground">—</em>}
                    </dd>
                  </div>
                </div>
              </dl>

              <hr className="my-5" />

              <h3 className="font-semibold text-sm mb-2">Branches ({branches.length})</h3>
              {branches.length === 0 ? (
                <p className="text-xs text-muted-foreground">No branches yet.</p>
              ) : (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {branches.map((b) => (
                    <li key={b.id} className="text-sm border rounded-md p-2">
                      <p className="font-medium">{b.name}</p>
                      <p className="text-xs text-muted-foreground">{[b.town, b.county].filter(Boolean).join(", ") || "—"}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── MODALS ───────────────────────────────────── */}
      <VacancyFormModal
        open={postJobOpen}
        onClose={() => { setPostJobOpen(false); setEditingJob(null); }}
        onSaved={() => { load(); setTab("jobs"); }}
        companyId={company.id}
        companyName={company.name}
        isSchool={company.institutionType === "school"}
        pendingVerification={company.verificationStatus !== "verified"}
        schoolLevels={company.schoolLevels ?? []}
        branches={branches}
        defaultCounty={company.county ?? ""}
        defaultTown={company.town ?? ""}
        initial={editingJob}
      />
      <EditProfileModal
        open={editProfileOpen}
        onClose={() => setEditProfileOpen(false)}
        company={company}
        onSaved={() => { setEditProfileOpen(false); load(); }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Edit Profile modal
// ─────────────────────────────────────────────────────────────────────────────
interface EditProfileModalProps {
  open: boolean; onClose: () => void;
  company: Company;
  onSaved: () => void;
}
function EditProfileModal({ open, onClose, company, onSaved }: EditProfileModalProps) {
  const [description, setDescription] = useState(company.description ?? "");
  const [website, setWebsite] = useState(company.website ?? "");
  const [logoUrl, setLogoUrl] = useState(company.logoUrl ?? "");
  const [industry, setIndustry] = useState(company.industry ?? "");
  const [county, setCounty] = useState(company.county ?? "");
  const [address, setAddress] = useState(company.address ?? "");
  const [phone, setPhone] = useState(company.phone ?? "");
  const [email, setEmail] = useState(company.email ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Reset when company changes
  useEffect(() => {
    setDescription(company.description ?? "");
    setWebsite(company.website ?? "");
    setLogoUrl(company.logoUrl ?? "");
    setIndustry(company.industry ?? "");
    setCounty(company.county ?? "");
    setAddress(company.address ?? "");
    setPhone(company.phone ?? "");
    setEmail(company.email ?? "");
  }, [company.id]);

  async function submit() {
    setSubmitting(true); setError(null);
    try {
      const res = await fetch(`/api/employer/companies/${company.id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, website, logoUrl, industry, county, address, phone, email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body?.message || `Failed (${res.status}).`); return; }
      toast({ title: "Profile updated" });
      onSaved();
    } catch (err: any) {
      setError(err?.message || "Could not save.");
    } finally { setSubmitting(false); }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="relative bg-background w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <button className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted text-muted-foreground" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
        <div className="p-5 sm:p-6">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1"><Edit3 className="h-3 w-3" /> Edit company profile</p>
          <h2 className="font-bold text-lg leading-tight mb-4">{company.name}</h2>

          <div className="space-y-3">
            <div>
              <label htmlFor="ep-desc" className="text-sm font-medium block mb-1">Description</label>
              <Textarea id="ep-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value.slice(0, 2000))} placeholder="A short paragraph about your company" />
              <p className="text-[10px] text-muted-foreground text-right mt-0.5">{description.length} / 2000</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ep-ind" className="text-sm font-medium block mb-1">Industry</label>
                <Input id="ep-ind" value={industry} onChange={(e) => setIndustry(e.target.value.slice(0, 80))} placeholder="Retail" />
              </div>
              <div>
                <label htmlFor="ep-county" className="text-sm font-medium block mb-1">HQ county</label>
                <select id="ep-county" value={county} onChange={(e) => setCounty(e.target.value)} className="w-full text-sm border rounded-md px-3 py-2 bg-background">
                  <option value="">—</option>
                  {KENYA_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="ep-website" className="text-sm font-medium block mb-1">Website</label>
              <Input id="ep-website" type="url" value={website} onChange={(e) => setWebsite(e.target.value.slice(0, 240))} placeholder="https://yourcompany.co.ke" />
            </div>

            <div>
              <label htmlFor="ep-logo" className="text-sm font-medium block mb-1">Logo URL</label>
              <Input id="ep-logo" type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value.slice(0, 500))} placeholder="https://yourcompany.co.ke/logo.png" />
              <p className="text-[10px] text-muted-foreground mt-0.5">Paste a link to your logo (PNG/JPG). Until set, we show your company initials in a colored circle.</p>
            </div>

            <div>
              <label htmlFor="ep-addr" className="text-sm font-medium block mb-1">HQ address</label>
              <Input id="ep-addr" value={address} onChange={(e) => setAddress(e.target.value.slice(0, 500))} placeholder="123 Mombasa Road, Nairobi" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ep-phone" className="text-sm font-medium block mb-1">Contact phone</label>
                <Input id="ep-phone" value={phone} onChange={(e) => setPhone(e.target.value.slice(0, 40))} placeholder="0700 000 000" />
              </div>
              <div>
                <label htmlFor="ep-email" className="text-sm font-medium block mb-1">Contact email</label>
                <Input id="ep-email" type="email" value={email} onChange={(e) => setEmail(e.target.value.slice(0, 160))} placeholder="hr@yourcompany.co.ke" />
              </div>
            </div>

            {error && <div className="text-sm text-rose-700 bg-rose-50 rounded-md p-2">{error}</div>}

            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={submit} disabled={submitting}>
              {submitting ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…</> : "Save changes"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
