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
  Inbox, ExternalLink, RefreshCcw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

type Tab = "companies" | "jobs" | "applications";

const APPLICATION_STATUSES = ["submitted", "under_review", "shortlisted", "interview", "hired", "rejected"];

export default function KenyaCareersAdmin() {
  const [tab, setTab] = useState<Tab>("companies");
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
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
      </div>
    </div>
  );
}
