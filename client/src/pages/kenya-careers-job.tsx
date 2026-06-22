/**
 * /kenya-careers/job/:id — Local job detail page (Phase 1)
 *
 * 2026-06: shows a single local-jobs listing with the full job description,
 * company info, branch location and an Apply button. Phase 1 the Apply
 * button shows a "Coming soon" sheet — Phase 2 will swap that for the
 * actual application form + CV upload.
 *
 * Loaded by `/kenya-careers/job/:id`. Public — no auth required.
 */
import { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import {
  Briefcase, MapPin, Building2, ArrowLeft, BadgeCheck, Calendar, Users,
  Loader2, ExternalLink, ChevronRight, GraduationCap, Sparkles, AlertCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { KenyaCareersApplySheet } from "@/components/kenya-careers-apply-sheet";

interface JobDetail {
  id: string;
  title: string;
  department: string | null;
  vacancies: number;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  requirements: string | null;
  responsibilities: string | null;
  deadline: string | null;
  county: string | null;
  town: string | null;
  experienceLevel: string | null;
  category: string | null;
  status: string;
  createdAt: string;
  company: {
    id: string;
    name: string;
    slug: string | null;
    industry: string | null;
    description: string | null;
    website: string | null;
    verified: boolean;
    county: string | null;
  };
  branch: {
    id: string;
    name: string;
    county: string | null;
    town: string | null;
    location: string | null;
  } | null;
}

const EMPLOYMENT_LABEL: Record<string, string> = {
  full_time:  "Full-time",
  part_time:  "Part-time",
  contract:   "Contract",
  internship: "Internship",
  casual:     "Casual",
};

const EXPERIENCE_LABEL: Record<string, string> = {
  entry:  "Entry level",
  mid:    "Mid level",
  senior: "Senior",
  any:    "Any level",
};

const CATEGORY_LABEL: Record<string, string> = {
  retail:       "Retail",
  hospitality:  "Hospitality",
  healthcare:   "Healthcare",
  construction: "Construction",
  transport:    "Transport",
  security:     "Security",
  cleaning:     "Cleaning",
  education:    "Education",
  logistics:    "Logistics",
  other:        "Other",
};

function formatSalary(min: number | null, max: number | null): string | null {
  if (!min && !max) return null;
  if (min && max && min !== max) return `KES ${min.toLocaleString()} – ${max.toLocaleString()}`;
  return `KES ${(min ?? max)!.toLocaleString()}+`;
}

function formatDeadline(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  const dateStr = d.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
  if (days <= 0) return `Closed (${dateStr})`;
  if (days === 1) return `Closes tomorrow — ${dateStr}`;
  if (days <= 7) return `Closes in ${days} days — ${dateStr}`;
  return `Apply by ${dateStr}`;
}

export default function KenyaCareersJob() {
  const [, params] = useRoute<{ id: string }>("/kenya-careers/job/:id");
  const [job,     setJob]     = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!params?.id) return;
    let cancelled = false;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const r = await fetch(`/api/local-jobs/${params.id}`, { signal: ac.signal });
        if (r.status === 404) {
          if (!cancelled) { setError("This job is no longer available."); setLoading(false); }
          return;
        }
        if (!r.ok) {
          if (!cancelled) { setError(`Could not load this job (HTTP ${r.status}).`); setLoading(false); }
          return;
        }
        const ct = r.headers.get("content-type") || "";
        if (!ct.toLowerCase().includes("application/json")) {
          if (!cancelled) { setError("Could not load this job right now."); setLoading(false); }
          return;
        }
        const data = await r.json();
        if (cancelled) return;
        // Coerce to a safe shape so missing nested fields can't throw in the
        // render below.
        setJob({
          id:              String(data?.id ?? params.id),
          title:           String(data?.title ?? "Untitled job"),
          department:      data?.department ?? null,
          vacancies:       Number(data?.vacancies ?? 1),
          employmentType:  data?.employmentType ?? null,
          salaryMin:       data?.salaryMin ?? null,
          salaryMax:       data?.salaryMax ?? null,
          requirements:    data?.requirements ?? null,
          responsibilities: data?.responsibilities ?? null,
          deadline:        data?.deadline ?? null,
          county:          data?.county ?? null,
          town:            data?.town ?? null,
          experienceLevel: data?.experienceLevel ?? null,
          category:        data?.category ?? null,
          status:          String(data?.status ?? "open"),
          createdAt:       String(data?.createdAt ?? new Date().toISOString()),
          company: {
            id:          String(data?.company?.id ?? ""),
            name:        String(data?.company?.name ?? "Employer"),
            slug:        data?.company?.slug ?? null,
            industry:    data?.company?.industry ?? null,
            description: data?.company?.description ?? null,
            website:     data?.company?.website ?? null,
            verified:    !!data?.company?.verified,
            county:      data?.company?.county ?? null,
          },
          branch: data?.branch && data?.branch?.id ? {
            id:       String(data.branch.id),
            name:     String(data.branch.name ?? ""),
            county:   data.branch.county ?? null,
            town:     data.branch.town ?? null,
            location: data.branch.location ?? null,
          } : null,
        });
        setLoading(false);
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || "Could not load this job.");
        setLoading(false);
      }
    })();
    return () => { cancelled = true; ac.abort(); };
  }, [params?.id]);

  function handleApplyClick() {
    // 2026-06 Phase 2: opens the apply sheet which handles all 4 user states
    // (anonymous → signin, free → upgrade, paid → form, hit-daily-limit →
    // higher-tier upsell). Tier check happens server-side in /apply-status.
    setApplyOpen(true);
  }

  // Suppress unused warning for the toast hook — kept in case of future inline notifications.
  void toast;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading job…
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="min-h-screen bg-background px-4 py-10">
        <div className="max-w-2xl mx-auto">
          <Link href="/kenya-careers">
            <Button variant="ghost" size="sm" className="mb-4"><ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Kenya Careers</Button>
          </Link>
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-10 w-10 text-rose-500 mx-auto mb-3" />
              <h2 className="font-semibold mb-1">Job unavailable</h2>
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <Link href="/kenya-careers"><Button>Browse other jobs</Button></Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const salary    = formatSalary(job.salaryMin, job.salaryMax);
  const deadline  = formatDeadline(job.deadline);
  const closed    = job.status !== "open" || (job.deadline && new Date(job.deadline) < new Date());

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header ribbon */}
      <div className="bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 text-white px-4 pt-4 pb-6">
        <div className="max-w-3xl mx-auto">
          <Link href="/kenya-careers">
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/10 -ml-2">
              <ArrowLeft className="h-4 w-4 mr-1.5" /> All Kenya Careers
            </Button>
          </Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 -mt-3">
        {/* Main job card */}
        <Card className="shadow-md">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex-1 min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold leading-tight">{job.title}</h1>
                <div className="flex items-center gap-1.5 mt-1.5 text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{job.company.name}</span>
                  {job.company.verified && (
                    <span className="inline-flex items-center gap-0.5 text-emerald-700 dark:text-emerald-300 text-xs font-semibold ml-1">
                      <BadgeCheck className="h-3.5 w-3.5" />
                      Verified
                    </span>
                  )}
                </div>
              </div>
              {closed && <Badge variant="outline" className="border-rose-300 text-rose-700 shrink-0">Closed</Badge>}
            </div>

            {/* Meta strip */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground mt-3">
              {(job.county || job.town) && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {[job.town, job.county].filter(Boolean).join(", ")}
                </span>
              )}
              {job.employmentType && (
                <span className="flex items-center gap-1.5">
                  <Briefcase className="h-3.5 w-3.5" />
                  {EMPLOYMENT_LABEL[job.employmentType] ?? job.employmentType}
                </span>
              )}
              {job.vacancies > 1 && (
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  {job.vacancies} positions
                </span>
              )}
              {job.experienceLevel && job.experienceLevel !== "any" && (
                <span className="flex items-center gap-1.5">
                  <GraduationCap className="h-3.5 w-3.5" />
                  {EXPERIENCE_LABEL[job.experienceLevel] ?? job.experienceLevel}
                </span>
              )}
              {deadline && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {deadline}
                </span>
              )}
            </div>

            {/* Highlight strip — salary + category */}
            {(salary || job.category) && (
              <div className="flex flex-wrap gap-2 mt-4">
                {salary && (
                  <span className="inline-flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 text-sm font-semibold px-3 py-1.5 rounded-md ring-1 ring-emerald-200 dark:ring-emerald-800">
                    {salary}
                  </span>
                )}
                {job.category && (
                  <Badge variant="outline" className="text-xs">
                    {CATEGORY_LABEL[job.category] ?? job.category}
                  </Badge>
                )}
                {job.department && (
                  <Badge variant="outline" className="text-xs">
                    {job.department}
                  </Badge>
                )}
              </div>
            )}

            {/* Apply button — Phase 1 placeholder */}
            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                size="lg"
                onClick={handleApplyClick}
                disabled={!!closed}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                data-testid="btn-apply-local-job"
              >
                <Sparkles className="h-4 w-4 mr-1.5" />
                {closed ? "Applications closed" : "Apply for this job"}
              </Button>
              {job.company.website && (
                <Button asChild variant="outline" size="lg">
                  <a href={job.company.website} target="_blank" rel="noopener noreferrer">
                    Visit {job.company.name} <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  </a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Responsibilities */}
        {job.responsibilities && (
          <Card className="mt-4">
            <CardContent className="p-5">
              <h2 className="font-semibold mb-2">What you'll do</h2>
              <p className="text-sm whitespace-pre-line leading-relaxed text-foreground/90">{job.responsibilities}</p>
            </CardContent>
          </Card>
        )}

        {/* Requirements */}
        {job.requirements && (
          <Card className="mt-4">
            <CardContent className="p-5">
              <h2 className="font-semibold mb-2">What you'll need</h2>
              <p className="text-sm whitespace-pre-line leading-relaxed text-foreground/90">{job.requirements}</p>
            </CardContent>
          </Card>
        )}

        {/* Branch */}
        {job.branch && (
          <Card className="mt-4">
            <CardContent className="p-5">
              <h2 className="font-semibold mb-2 flex items-center gap-1.5">
                <MapPin className="h-4 w-4" /> Where you'll be based
              </h2>
              <p className="text-sm font-medium">{job.branch.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {[job.branch.town, job.branch.county].filter(Boolean).join(", ")}
              </p>
              {job.branch.location && (
                <p className="text-xs text-muted-foreground mt-1">{job.branch.location}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* About the company */}
        {job.company.description && (
          <Card className="mt-4">
            <CardContent className="p-5">
              <h2 className="font-semibold mb-2">About {job.company.name}</h2>
              <p className="text-sm leading-relaxed text-foreground/90">{job.company.description}</p>
              {job.company.website && (
                <a
                  href={job.company.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-2 text-sm text-emerald-700 dark:text-emerald-300 font-medium underline"
                >
                  Visit website <ChevronRight className="h-3 w-3" />
                </a>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Phase 2: Apply sheet — handles all 4 user states (anon/free/paid/limit). */}
      <KenyaCareersApplySheet
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        jobId={job.id}
        jobTitle={job.title}
        companyName={job.company.name}
        companyVerified={job.company.verified}
      />
    </div>
  );
}
