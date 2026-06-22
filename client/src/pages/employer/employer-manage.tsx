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

interface Company {
  id: string; name: string; slug: string | null; logoUrl: string | null;
  industry: string | null; address: string | null; county: string | null;
  contactName: string | null; phone: string | null; email: string | null;
  description: string | null; website: string | null;
  verified: boolean; status: string;
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
}
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

  async function closeJob(jobId: string) {
    if (!confirm("Close this job to new applications?")) return;
    const res = await fetch(`/api/employer/jobs/${jobId}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });
    if (res.ok) {
      toast({ title: "Job closed" });
      await load();
    } else {
      const body = await res.json().catch(() => ({}));
      toast({ variant: "destructive", title: "Close failed", description: body?.message });
    }
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
        {tab === "jobs" && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button onClick={() => setPostJobOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <Plus className="h-4 w-4 mr-1.5" /> Post a job
              </Button>
            </div>
            {jobs.length === 0 && (
              <Card><CardContent className="p-8 text-center text-muted-foreground">
                <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>No jobs posted yet. Click "Post a job" to add your first opening.</p>
              </CardContent></Card>
            )}
            {jobs.map((j) => (
              <Card key={j.id} className={j.status === "closed" ? "opacity-60" : ""}>
                <CardContent className="p-4 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="font-semibold text-sm">{j.title}</h3>
                      {j.isSeed && (
                        <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50">Sample (pre-loaded)</Badge>
                      )}
                      <Badge variant="outline" className={`text-[10px] ${j.status === "open" ? "border-emerald-300 text-emerald-700 bg-emerald-50" : "border-rose-300 text-rose-700 bg-rose-50"}`}>
                        {j.status}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                      {j.branch && <span>{j.branch.name}</span>}
                      {(j.county || j.town) && (
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{[j.town, j.county].filter(Boolean).join(", ")}</span>
                      )}
                      {j.vacancies > 1 && <span>{j.vacancies} positions</span>}
                      {formatSalary(j.salaryMin, j.salaryMax) && (
                        <span className="font-semibold text-emerald-700">{formatSalary(j.salaryMin, j.salaryMax)}</span>
                      )}
                      <span><strong>{j.applicationCount}</strong> applicant{j.applicationCount === 1 ? "" : "s"}</span>
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col gap-1.5 items-end">
                    {j.status === "open" && !j.isSeed && (
                      <Button size="sm" variant="outline" className="text-rose-700 border-rose-300 hover:bg-rose-50" onClick={() => closeJob(j.id)}>
                        Close
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ── APPLICATIONS TAB ─────────────────────────── */}
        {tab === "applications" && (
          <div className="space-y-3">
            {applications.length === 0 && (
              <Card><CardContent className="p-8 text-center text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>No applications yet. Post real jobs to start receiving applicants.</p>
              </CardContent></Card>
            )}
            {applications.map((a) => {
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
                          <a href={a.cvUrl} target="_blank" rel="noopener noreferrer">CV <ExternalLink className="h-3 w-3 ml-1" /></a>
                        </Button>
                      )}
                      {a.certificatesUrl && (
                        <Button asChild size="sm" variant="outline">
                          <a href={a.certificatesUrl} target="_blank" rel="noopener noreferrer">Certs <ExternalLink className="h-3 w-3 ml-1" /></a>
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

              <dl className="space-y-3 text-sm">
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
      <PostJobModal
        open={postJobOpen}
        onClose={() => setPostJobOpen(false)}
        companyId={company.id}
        companyName={company.name}
        branches={branches}
        onPosted={() => { setPostJobOpen(false); load(); setTab("jobs"); }}
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
// Post Job modal — employer-scoped (uses POST /api/employer/companies/:id/jobs)
// ─────────────────────────────────────────────────────────────────────────────
interface PostJobModalProps {
  open: boolean; onClose: () => void;
  companyId: string; companyName: string;
  branches: Branch[];
  onPosted: () => void;
}
function PostJobModal({ open, onClose, companyId, companyName, branches, onPosted }: PostJobModalProps) {
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [category, setCategory] = useState("other");
  const [vacancies, setVacancies] = useState("1");
  const [employmentType, setEmploymentType] = useState("full_time");
  const [experienceLevel, setExperienceLevel] = useState("any");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [branchId, setBranchId] = useState("");
  const [county, setCounty] = useState("");
  const [town, setTown] = useState("");
  const [deadline, setDeadline] = useState("");
  const [responsibilities, setResponsibilities] = useState("");
  const [requirements, setRequirements] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  function reset() {
    setTitle(""); setDepartment(""); setCategory("other"); setVacancies("1");
    setEmploymentType("full_time"); setExperienceLevel("any");
    setSalaryMin(""); setSalaryMax(""); setBranchId(""); setCounty(""); setTown("");
    setDeadline(""); setResponsibilities(""); setRequirements("");
    setSubmitting(false); setError(null);
  }

  // Auto-fill county/town when a branch is picked
  function pickBranch(id: string) {
    setBranchId(id);
    const b = branches.find((x) => x.id === id);
    if (b) {
      if (b.county) setCounty(b.county);
      if (b.town)   setTown(b.town);
    }
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/employer/companies/${companyId}/jobs`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title, department, category, vacancies: Number(vacancies),
          employmentType, experienceLevel,
          salaryMin: salaryMin ? Number(salaryMin) : null,
          salaryMax: salaryMax ? Number(salaryMax) : null,
          branchId: branchId || null,
          county, town, deadline, responsibilities, requirements,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body?.message || `Failed (${res.status}).`); return; }
      toast({ title: "Job posted", description: body?.message });
      reset(); onPosted();
    } catch (err: any) {
      setError(err?.message || "Could not post job.");
    } finally { setSubmitting(false); }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => { reset(); onClose(); }}>
      <div className="relative bg-background w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <button className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted text-muted-foreground" onClick={() => { reset(); onClose(); }}>
          <X className="h-4 w-4" />
        </button>
        <div className="p-5 sm:p-6">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1"><Plus className="h-3 w-3" /> New job posting</p>
          <h2 className="font-bold text-lg leading-tight mb-1">Post a job at {companyName}</h2>
          <p className="text-xs text-muted-foreground mb-4">Applications go directly to you. Jobseekers pay KES 99+ to apply — high-intent only.</p>

          <div className="space-y-3">
            <div>
              <label htmlFor="pj-title" className="text-sm font-medium block mb-1">Job title *</label>
              <Input id="pj-title" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 200))} placeholder="e.g. Cashier" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pj-cat" className="text-sm font-medium block mb-1">Category *</label>
                <select id="pj-cat" value={category} onChange={(e) => setCategory(e.target.value)} className="w-full text-sm border rounded-md px-3 py-2 bg-background">
                  {JOB_CATEGORIES.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="pj-dept" className="text-sm font-medium block mb-1">Department</label>
                <Input id="pj-dept" value={department} onChange={(e) => setDepartment(e.target.value.slice(0, 120))} placeholder="e.g. Front End" />
              </div>
            </div>

            <div>
              <label htmlFor="pj-branch" className="text-sm font-medium block mb-1">Branch</label>
              <select id="pj-branch" value={branchId} onChange={(e) => pickBranch(e.target.value)} className="w-full text-sm border rounded-md px-3 py-2 bg-background">
                <option value="">No branch / HQ</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} {b.county ? `— ${b.county}` : ""}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground mt-0.5">Selecting a branch auto-fills county and town below.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pj-county" className="text-sm font-medium block mb-1">County</label>
                <select id="pj-county" value={county} onChange={(e) => setCounty(e.target.value)} className="w-full text-sm border rounded-md px-3 py-2 bg-background">
                  <option value="">—</option>
                  {KENYA_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="pj-town" className="text-sm font-medium block mb-1">Town / area</label>
                <Input id="pj-town" value={town} onChange={(e) => setTown(e.target.value.slice(0, 80))} placeholder="Westlands" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="pj-vacs" className="text-sm font-medium block mb-1">Vacancies</label>
                <Input id="pj-vacs" type="number" min={1} max={999} value={vacancies} onChange={(e) => setVacancies(e.target.value.replace(/\D/g, "").slice(0, 3) || "1")} />
              </div>
              <div>
                <label htmlFor="pj-type" className="text-sm font-medium block mb-1">Type</label>
                <select id="pj-type" value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} className="w-full text-sm border rounded-md px-3 py-2 bg-background">
                  <option value="full_time">Full-time</option>
                  <option value="part_time">Part-time</option>
                  <option value="contract">Contract</option>
                  <option value="internship">Internship</option>
                  <option value="casual">Casual</option>
                </select>
              </div>
              <div>
                <label htmlFor="pj-exp" className="text-sm font-medium block mb-1">Experience</label>
                <select id="pj-exp" value={experienceLevel} onChange={(e) => setExperienceLevel(e.target.value)} className="w-full text-sm border rounded-md px-3 py-2 bg-background">
                  <option value="any">Any</option>
                  <option value="entry">Entry</option>
                  <option value="mid">Mid</option>
                  <option value="senior">Senior</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pj-min" className="text-sm font-medium block mb-1">Salary min (KES)</label>
                <Input id="pj-min" type="number" min={0} value={salaryMin} onChange={(e) => setSalaryMin(e.target.value.replace(/\D/g, ""))} placeholder="20000" />
              </div>
              <div>
                <label htmlFor="pj-max" className="text-sm font-medium block mb-1">Salary max (KES)</label>
                <Input id="pj-max" type="number" min={0} value={salaryMax} onChange={(e) => setSalaryMax(e.target.value.replace(/\D/g, ""))} placeholder="30000" />
              </div>
            </div>

            <div>
              <label htmlFor="pj-deadline" className="text-sm font-medium block mb-1">Application deadline</label>
              <Input id="pj-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>

            <div>
              <label htmlFor="pj-resp" className="text-sm font-medium block mb-1">Responsibilities</label>
              <Textarea id="pj-resp" rows={3} value={responsibilities} onChange={(e) => setResponsibilities(e.target.value)} placeholder="What this person will do day-to-day" />
            </div>

            <div>
              <label htmlFor="pj-req" className="text-sm font-medium block mb-1">Requirements</label>
              <Textarea id="pj-req" rows={3} value={requirements} onChange={(e) => setRequirements(e.target.value)} placeholder="Qualifications, certifications, experience needed" />
            </div>

            {error && <div className="text-sm text-rose-700 bg-rose-50 rounded-md p-2">{error}</div>}

            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={submit} disabled={submitting || !title.trim()}>
              {submitting ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Posting…</> : <><Sparkles className="h-4 w-4 mr-1.5" /> Post job</>}
            </Button>
            <p className="text-[11px] text-center text-muted-foreground">This job goes live immediately and starts receiving applications.</p>
          </div>
        </div>
      </div>
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
