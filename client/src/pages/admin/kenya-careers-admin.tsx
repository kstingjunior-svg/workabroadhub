/**
 * /admin/kenya-careers — Phase 2.5 moderation dashboard.
 *
 * Founder asked for the basic admin controls before the full employer
 * dashboard ships in Phase 3:
 *   • Close (or re-open) a fake / spam job
 *   • Suspend (or re-approve) an employer
 *   • Review applications and change their status
 *
 * Loaded from admin only — server returns 403 to non-admins via the existing
 * isUserAdmin check. The UI is intentionally minimal — three tabs (Companies,
 * Jobs, Applications) with inline status-change buttons. Phase 3 will swap
 * this for the proper employer-side dashboard.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft, BadgeCheck, Loader2, ShieldCheck, ShieldAlert, Building2, Briefcase,
  Inbox, ExternalLink, RefreshCcw, Plus, X, Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface CompanyRow {
  id: string; name: string; industry: string | null; county: string | null;
  status: string; verified_at: string | null; job_count: number;
}
interface JobRow {
  id: string; title: string; county: string | null; town: string | null;
  status: string; vacancies: number; created_at: string;
  company_id: string; company_name: string; company_status: string;
}
interface ApplicationRow {
  id: string; status: string; applied_at: string;
  applicant_name: string; email: string; phone: string;
  applicant_county: string | null; highest_education: string | null;
  years_experience: number | null;
  cv_url: string | null; certificates_url: string | null;
  cover_note: string | null;
  job_id: string; job_title: string; company_name: string;
}

type Tab = "companies" | "jobs" | "applications" | "claims";

interface ClaimRow {
  id: string; company_id: string; company_name: string;
  claimant_name: string; claimant_email: string; claimant_phone: string | null;
  role_at_company: string | null; message: string | null;
  evidence_url: string | null; status: string; created_at: string;
}

const APPLICATION_STATUSES = ["submitted", "under_review", "shortlisted", "interview", "hired", "rejected"];

export default function KenyaCareersAdmin() {
  const [tab, setTab] = useState<Tab>("companies");
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [addJobOpen, setAddJobOpen] = useState(false);
  const { toast } = useToast();

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/local-jobs/overview", { credentials: "include" });
      if (res.status === 401 || res.status === 403) {
        setError("Admin access required.");
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCompanies(data.companies ?? []);
      setJobs(data.jobs ?? []);
      setApplications(data.applications ?? []);
      setClaims(data.claims ?? []);
    } catch (err: any) {
      setError(err?.message || "Could not load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function updateCompany(id: string, status: string) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/local-jobs/companies/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || `HTTP ${res.status}`);
      }
      toast({ title: "Company updated", description: `Status set to ${status}.` });
      await load();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Update failed", description: err?.message });
    } finally {
      setSavingId(null);
    }
  }

  async function updateJob(id: string, status: string) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/local-jobs/jobs/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || `HTTP ${res.status}`);
      }
      toast({ title: "Job updated", description: `Status set to ${status}.` });
      await load();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Update failed", description: err?.message });
    } finally {
      setSavingId(null);
    }
  }

  async function updateApplication(id: string, status: string) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/local-jobs/applications/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || `HTTP ${res.status}`);
      }
      toast({ title: "Application updated", description: `Status set to ${status}.` });
      await load();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Update failed", description: err?.message });
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      <div className="bg-gradient-to-br from-slate-900 to-slate-700 text-white px-4 pt-4 pb-6">
        <div className="max-w-5xl mx-auto">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/10 -ml-2 mb-2">
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to admin
            </Button>
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold">Kenya Careers — moderation</h1>
          <p className="text-sm text-slate-300 mt-0.5">
            Approve / suspend employers, close fake jobs, update application statuses.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 mt-4">
        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-4">
          <Button variant={tab === "companies" ? "default" : "outline"} size="sm" onClick={() => setTab("companies")}>
            <Building2 className="h-4 w-4 mr-1.5" /> Companies ({companies.length})
          </Button>
          <Button variant={tab === "jobs" ? "default" : "outline"} size="sm" onClick={() => setTab("jobs")}>
            <Briefcase className="h-4 w-4 mr-1.5" /> Jobs ({jobs.length})
          </Button>
          <Button variant={tab === "applications" ? "default" : "outline"} size="sm" onClick={() => setTab("applications")}>
            <Inbox className="h-4 w-4 mr-1.5" /> Applications ({applications.length})
          </Button>
          <Button variant={tab === "claims" ? "default" : "outline"} size="sm" onClick={() => setTab("claims")}>
            <ShieldCheck className="h-4 w-4 mr-1.5" /> Claims ({claims.filter((c) => c.status === "pending").length})
          </Button>
          <Button variant="ghost" size="sm" onClick={load}><RefreshCcw className="h-4 w-4 mr-1.5" /> Reload</Button>
        </div>

        {loading && (
          <div className="py-12 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        )}

        {error && (
          <Card className="border-rose-200 bg-rose-50 dark:bg-rose-900/10">
            <CardContent className="p-4 text-sm text-rose-700 dark:text-rose-300">{error}</CardContent>
          </Card>
        )}

        {/* Companies */}
        {!loading && !error && tab === "companies" && (
          <div className="space-y-2">
            {companies.length === 0 && (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No companies yet.</CardContent></Card>
            )}
            {companies.map((c) => (
              <Card key={c.id} data-testid={`admin-company-${c.id}`}>
                <CardContent className="p-4 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="font-semibold text-sm">{c.name}</h3>
                      {c.verified_at && <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />}
                      <Badge variant="outline" className={
                        c.status === "approved"  ? "border-emerald-300 text-emerald-700 bg-emerald-50" :
                        c.status === "suspended" ? "border-rose-300 text-rose-700 bg-rose-50" :
                        "border-amber-300 text-amber-700 bg-amber-50"
                      }>
                        {c.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {[c.industry, c.county].filter(Boolean).join(" · ")} · {c.job_count} job{c.job_count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {c.status !== "approved" && (
                      <Button size="sm" variant="outline" disabled={savingId === c.id}
                        onClick={() => updateCompany(c.id, "approved")}>
                        <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Approve
                      </Button>
                    )}
                    {c.status !== "suspended" && (
                      <Button size="sm" variant="outline" className="text-rose-700 border-rose-300 hover:bg-rose-50"
                        disabled={savingId === c.id}
                        onClick={() => updateCompany(c.id, "suspended")}>
                        <ShieldAlert className="h-3.5 w-3.5 mr-1" /> Suspend
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Jobs */}
        {!loading && !error && tab === "jobs" && (
          <div className="space-y-2">
            {/* Add Real Job button — bypasses the seed flag so this job
                accepts real applications and routes them to the employer. */}
            <div className="flex justify-end -mt-2 mb-2">
              <Button
                onClick={() => setAddJobOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                size="sm"
                data-testid="btn-open-add-job"
              >
                <Plus className="h-4 w-4 mr-1.5" /> Add a real job
              </Button>
            </div>

            {jobs.length === 0 && (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No jobs yet.</CardContent></Card>
            )}
            {jobs.map((j) => (
              <Card key={j.id} data-testid={`admin-job-${j.id}`}>
                <CardContent className="p-4 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Link href={`/kenya-careers/job/${j.id}`}>
                        <h3 className="font-semibold text-sm hover:underline cursor-pointer">{j.title}</h3>
                      </Link>
                      <Badge variant="outline" className={
                        j.status === "open"   ? "border-emerald-300 text-emerald-700 bg-emerald-50" :
                        j.status === "closed" ? "border-rose-300 text-rose-700 bg-rose-50" :
                        "border-muted-foreground/30"
                      }>
                        {j.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {j.company_name}
                      {(j.county || j.town) && ` · ${[j.town, j.county].filter(Boolean).join(", ")}`}
                      {` · ${j.vacancies} position${j.vacancies === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {j.status === "open" ? (
                      <Button size="sm" variant="outline" className="text-rose-700 border-rose-300 hover:bg-rose-50"
                        disabled={savingId === j.id}
                        onClick={() => updateJob(j.id, "closed")}>
                        Close
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" disabled={savingId === j.id}
                        onClick={() => updateJob(j.id, "open")}>
                        Re-open
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Applications */}
        {!loading && !error && tab === "applications" && (
          <div className="space-y-2">
            {applications.length === 0 && (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No applications yet.</CardContent></Card>
            )}
            {applications.map((a) => (
              <Card key={a.id} data-testid={`admin-app-${a.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm">{a.applicant_name}</h3>
                      <p className="text-xs text-muted-foreground">{a.email} · {a.phone}</p>
                    </div>
                    <Badge variant="outline" className="shrink-0">{a.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    Applied to <strong>{a.job_title}</strong> at <strong>{a.company_name}</strong>
                    {a.applicant_county && ` · from ${a.applicant_county}`}
                    {a.highest_education && ` · ${a.highest_education}`}
                    {a.years_experience !== null && ` · ${a.years_experience} yr${a.years_experience === 1 ? "" : "s"} experience`}
                  </p>
                  {a.cover_note && (
                    <p className="text-xs italic text-foreground/80 bg-muted/30 rounded p-2 mb-2">"{a.cover_note}"</p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {a.cv_url && (
                      <Button asChild size="sm" variant="outline">
                        <a href={a.cv_url} target="_blank" rel="noopener noreferrer">
                          CV <ExternalLink className="h-3 w-3 ml-1" />
                        </a>
                      </Button>
                    )}
                    {a.certificates_url && (
                      <Button asChild size="sm" variant="outline">
                        <a href={a.certificates_url} target="_blank" rel="noopener noreferrer">
                          Certs <ExternalLink className="h-3 w-3 ml-1" />
                        </a>
                      </Button>
                    )}
                    <select
                      value={a.status}
                      disabled={savingId === a.id}
                      onChange={(e) => updateApplication(a.id, e.target.value)}
                      className="text-xs border rounded-md px-2 py-1 bg-background"
                      data-testid={`admin-app-status-${a.id}`}
                    >
                      {APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Claims tab — Phase 4 employer verification queue. Approve grants
            the claimant company-admin access automatically. */}
        {!loading && !error && tab === "claims" && (
          <div className="space-y-2">
            {claims.length === 0 && (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No claims yet.</CardContent></Card>
            )}
            {claims.map((cl) => (
              <Card key={cl.id} data-testid={`admin-claim-${cl.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm">{cl.company_name}</h3>
                      <p className="text-xs text-muted-foreground">
                        Claimant: <strong>{cl.claimant_name}</strong> · {cl.claimant_email}
                        {cl.claimant_phone && ` · ${cl.claimant_phone}`}
                        {cl.role_at_company && ` · ${cl.role_at_company}`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Submitted {new Date(cl.created_at).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                    <Badge variant="outline" className={
                      cl.status === "approved" ? "border-emerald-300 text-emerald-700 bg-emerald-50" :
                      cl.status === "rejected" ? "border-rose-300 text-rose-700 bg-rose-50" :
                      "border-amber-300 text-amber-700 bg-amber-50"
                    }>
                      {cl.status}
                    </Badge>
                  </div>
                  {cl.message && (
                    <p className="text-xs italic bg-muted/30 rounded p-2 mb-2">"{cl.message}"</p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {cl.evidence_url && (
                      <Button asChild size="sm" variant="outline">
                        <a href={cl.evidence_url} target="_blank" rel="noopener noreferrer">
                          View license/cert <ExternalLink className="h-3 w-3 ml-1" />
                        </a>
                      </Button>
                    )}
                    {cl.status === "pending" && (
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        disabled={savingId === cl.id}
                        onClick={async () => {
                          setSavingId(cl.id);
                          try {
                            const res = await fetch(`/api/admin/local-jobs/claims/${cl.id}/approve`, {
                              method: "POST", credentials: "include",
                            });
                            const body = await res.json().catch(() => ({}));
                            if (!res.ok) {
                              toast({ variant: "destructive", title: "Approval failed", description: body?.message });
                            } else {
                              toast({ title: "Approved", description: "Claimant now has employer access." });
                              await load();
                            }
                          } finally { setSavingId(null); }
                        }}
                      >
                        <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Approve + grant access
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add Real Job modal — bypasses seed gate. Companies dropdown drawn
          from the already-loaded admin overview state. */}
      <AddRealJobModal
        open={addJobOpen}
        onClose={() => setAddJobOpen(false)}
        companies={companies}
        onJobCreated={() => { setAddJobOpen(false); load(); }}
      />
    </div>
  );
}

// ─── Add Real Job modal ──────────────────────────────────────────────────────
// Posts to /api/admin/local-jobs/jobs which creates a job with is_seed=false.
// That means applications will ACTUALLY route to the named employer (i.e.
// they show up in the employer's incoming applications when Phase 4 ships,
// and in the meantime they're visible to Tony in /admin/kenya-careers).

interface AddRealJobModalProps {
  open: boolean;
  onClose: () => void;
  companies: CompanyRow[];
  onJobCreated: () => void;
}

function AddRealJobModal({ open, onClose, companies, onJobCreated }: AddRealJobModalProps) {
  const [companyId, setCompanyId] = useState("");
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [vacancies, setVacancies] = useState("1");
  const [employmentType, setEmploymentType] = useState("full_time");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [requirements, setRequirements] = useState("");
  const [responsibilities, setResponsibilities] = useState("");
  const [deadline, setDeadline] = useState("");
  const [county, setCounty] = useState("");
  const [town, setTown] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("any");
  const [category, setCategory] = useState("other");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  function reset() {
    setCompanyId(""); setTitle(""); setDepartment(""); setVacancies("1");
    setEmploymentType("full_time"); setSalaryMin(""); setSalaryMax("");
    setRequirements(""); setResponsibilities(""); setDeadline("");
    setCounty(""); setTown(""); setExperienceLevel("any"); setCategory("other");
    setError(null); setSubmitting(false);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/local-jobs/jobs", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId, title, department, vacancies: Number(vacancies),
          employmentType, salaryMin: salaryMin ? Number(salaryMin) : null,
          salaryMax: salaryMax ? Number(salaryMax) : null,
          requirements, responsibilities, deadline,
          county, town, experienceLevel, category,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.message || `Create failed (${res.status}).`);
        return;
      }
      toast({ title: "Real job published", description: body?.message || "Applications will route to the employer." });
      reset();
      onJobCreated();
    } catch (err: any) {
      setError(err?.message || "Could not create job.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={() => { reset(); onClose(); }}
    >
      <div
        className="relative bg-background w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="add-real-job-modal"
      >
        <button
          className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted text-muted-foreground"
          onClick={() => { reset(); onClose(); }}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-5 sm:p-6">
          <div className="mb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Add a verified real job
            </p>
            <h2 className="font-bold text-lg leading-tight">New job posting</h2>
            <p className="text-xs text-muted-foreground mt-1">
              This job is created with <code>is_seed=false</code> — applications will be real, applicants will route to the employer.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="ar-company" className="text-sm font-medium block mb-1">Company *</label>
              <select
                id="ar-company"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="w-full text-sm border rounded-md px-3 py-2 bg-background"
              >
                <option value="">Select…</option>
                {companies.filter((c) => c.status === "approved").map((c) => (
                  <option key={c.id} value={c.id}>{c.name} {c.industry ? `· ${c.industry}` : ""}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ar-title" className="text-sm font-medium block mb-1">Job title *</label>
              <Input id="ar-title" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 200))} placeholder="e.g. Cashier" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ar-dept" className="text-sm font-medium block mb-1">Department</label>
                <Input id="ar-dept" value={department} onChange={(e) => setDepartment(e.target.value.slice(0, 120))} placeholder="e.g. Front End" />
              </div>
              <div>
                <label htmlFor="ar-vacs" className="text-sm font-medium block mb-1">Vacancies</label>
                <Input id="ar-vacs" type="number" min={1} max={999} value={vacancies} onChange={(e) => setVacancies(e.target.value.replace(/\D/g, "").slice(0, 3) || "1")} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ar-type" className="text-sm font-medium block mb-1">Type</label>
                <select id="ar-type" value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} className="w-full text-sm border rounded-md px-3 py-2 bg-background">
                  <option value="full_time">Full-time</option>
                  <option value="part_time">Part-time</option>
                  <option value="contract">Contract</option>
                  <option value="internship">Internship</option>
                  <option value="casual">Casual</option>
                </select>
              </div>
              <div>
                <label htmlFor="ar-exp" className="text-sm font-medium block mb-1">Experience</label>
                <select id="ar-exp" value={experienceLevel} onChange={(e) => setExperienceLevel(e.target.value)} className="w-full text-sm border rounded-md px-3 py-2 bg-background">
                  <option value="any">Any level</option>
                  <option value="entry">Entry</option>
                  <option value="mid">Mid</option>
                  <option value="senior">Senior</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ar-min" className="text-sm font-medium block mb-1">Salary min (KES)</label>
                <Input id="ar-min" type="number" min={0} value={salaryMin} onChange={(e) => setSalaryMin(e.target.value.replace(/\D/g, ""))} placeholder="20000" />
              </div>
              <div>
                <label htmlFor="ar-max" className="text-sm font-medium block mb-1">Salary max (KES)</label>
                <Input id="ar-max" type="number" min={0} value={salaryMax} onChange={(e) => setSalaryMax(e.target.value.replace(/\D/g, ""))} placeholder="30000" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ar-county" className="text-sm font-medium block mb-1">County</label>
                <Input id="ar-county" value={county} onChange={(e) => setCounty(e.target.value.slice(0, 60))} placeholder="Nairobi" />
              </div>
              <div>
                <label htmlFor="ar-town" className="text-sm font-medium block mb-1">Town / area</label>
                <Input id="ar-town" value={town} onChange={(e) => setTown(e.target.value.slice(0, 80))} placeholder="Westlands" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ar-cat" className="text-sm font-medium block mb-1">Category</label>
                <select id="ar-cat" value={category} onChange={(e) => setCategory(e.target.value)} className="w-full text-sm border rounded-md px-3 py-2 bg-background">
                  {["retail","hospitality","healthcare","construction","transport","security","cleaning","education","logistics","other"].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="ar-deadline" className="text-sm font-medium block mb-1">Deadline</label>
                <Input id="ar-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              </div>
            </div>

            <div>
              <label htmlFor="ar-resp" className="text-sm font-medium block mb-1">Responsibilities</label>
              <Textarea id="ar-resp" rows={3} value={responsibilities} onChange={(e) => setResponsibilities(e.target.value)} placeholder="What the person will do day-to-day…" />
            </div>

            <div>
              <label htmlFor="ar-req" className="text-sm font-medium block mb-1">Requirements</label>
              <Textarea id="ar-req" rows={3} value={requirements} onChange={(e) => setRequirements(e.target.value)} placeholder="Qualifications, certifications, experience…" />
            </div>

            {error && (
              <div className="text-sm text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/20 rounded-md p-2">
                {error}
              </div>
            )}

            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={submit}
              disabled={submitting || !companyId || !title.trim()}
              data-testid="btn-submit-add-job"
            >
              {submitting
                ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Publishing…</>
                : <><Sparkles className="h-4 w-4 mr-1.5" /> Publish real job</>}
            </Button>
            <p className="text-[11px] text-center text-muted-foreground">
              This job will accept real applications. Applicants pay KES 99/1000/4500 and submit CVs that route to the employer.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
