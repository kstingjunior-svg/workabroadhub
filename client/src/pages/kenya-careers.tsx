/**
 * /kenya-careers — Kenya Careers landing page (Phase 1)
 *
 * 2026-06: founder asked for a local-employer recruitment portal alongside
 * the existing visa-sponsored overseas jobs. This page is the public
 * entry point: hero with live stats, filter bar (county / category /
 * search), Featured Employers strip, and the job list.
 *
 * Phase 1 is read-only — the Apply CTA on each card routes through to the
 * job detail page where it shows a "Coming soon" placeholder. Phase 2 will
 * wire up the actual application form + CV upload.
 *
 * Strictly isolated from the overseas jobs board: separate URL, separate
 * API (/api/local-jobs/*), separate DB tables.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Briefcase, MapPin, Building2, Search, Loader2, BadgeCheck, ChevronRight, Users, Globe2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Job {
  id: string;
  title: string;
  department: string | null;
  vacancies: number;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  county: string | null;
  town: string | null;
  experienceLevel: string | null;
  category: string | null;
  deadline: string | null;
  createdAt: string;
  company: { id: string; name: string; slug: string | null; industry: string | null; verified: boolean };
  branch: { id: string; name: string } | null;
}

interface Stats {
  totalJobs: number;
  totalEmployers: number;
  totalCounties: number;
  totalVacancies: number;
}

interface Filters {
  counties:   string[];
  categories: string[];
  companies:  { id: string; name: string }[];
}

interface Employer {
  id: string;
  name: string;
  slug: string | null;
  industry: string | null;
  county: string | null;
  logoUrl: string | null;
  verified: boolean;
  jobCount: number;
}

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

function formatSalary(min: number | null, max: number | null): string | null {
  if (!min && !max) return null;
  if (min && max && min !== max) return `KES ${min.toLocaleString()}–${max.toLocaleString()}`;
  return `KES ${(min ?? max)!.toLocaleString()}+`;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function KenyaCareers() {
  const [stats,      setStats]      = useState<Stats | null>(null);
  const [filters,    setFilters]    = useState<Filters | null>(null);
  const [employers,  setEmployers]  = useState<Employer[]>([]);
  const [jobs,       setJobs]       = useState<Job[]>([]);
  const [total,      setTotal]      = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);

  // Filter state
  const [searchInput, setSearchInput] = useState("");
  const [search,      setSearch]      = useState("");
  const [county,      setCounty]      = useState<string>("all");
  const [category,    setCategory]    = useState<string>("all");
  const [companyId,   setCompanyId]   = useState<string>("all");

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // One-shot static fetches (stats, filters, employers)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, f, e] = await Promise.all([
          fetch("/api/local-jobs/stats").then((r) => r.json()),
          fetch("/api/local-jobs/filters").then((r) => r.json()),
          fetch("/api/local-jobs/companies").then((r) => r.json()),
        ]);
        if (cancelled) return;
        setStats(s);
        setFilters(f);
        setEmployers(e.companies ?? []);
      } catch (err: any) {
        // non-fatal — page still renders
        console.warn("[KenyaCareers] stats/filters fetch failed:", err?.message);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Re-fetch jobs whenever filters change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (county     !== "all") params.set("county",    county);
    if (category   !== "all") params.set("category",  category);
    if (companyId  !== "all") params.set("companyId", companyId);
    if (search)               params.set("search",    search);
    const url = `/api/local-jobs?${params.toString()}`;
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => {
        if (cancelled) return;
        setJobs(data.jobs ?? []);
        setTotal(data.total ?? 0);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || "Could not load jobs.");
        setJobs([]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [county, category, companyId, search]);

  const hasAnyFilter = useMemo(
    () => county !== "all" || category !== "all" || companyId !== "all" || !!search,
    [county, category, companyId, search],
  );

  function clearFilters() {
    setCounty("all"); setCategory("all"); setCompanyId("all");
    setSearchInput(""); setSearch("");
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* ── HERO ───────────────────────────────────────────────────────── */}
      <section className="relative bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 text-white pt-12 pb-10 px-4 overflow-hidden">
        <div className="absolute -top-20 -left-20 w-80 h-80 bg-white/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -right-12 w-72 h-72 bg-white/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-3xl mx-auto text-center space-y-4">
          <Badge className="bg-white/20 text-white border-white/30 text-xs font-semibold uppercase tracking-widest px-3 py-1">
            <Globe2 className="h-3.5 w-3.5 mr-1.5" /> Now hiring across Kenya
          </Badge>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold leading-tight tracking-tight">
            Kenya Careers
          </h1>
          <p className="text-emerald-50 text-base md:text-lg max-w-xl mx-auto">
            Real jobs from Naivas, Quickmart, Carrefour, Java House, hospitals and more —
            right here in Kenya. No visa needed.
          </p>

          {stats && (
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm pt-2 text-emerald-50">
              <span><strong className="text-white">{stats.totalJobs}</strong> open positions</span>
              <span className="opacity-50">·</span>
              <span><strong className="text-white">{stats.totalEmployers}</strong> employers</span>
              <span className="opacity-50">·</span>
              <span><strong className="text-white">{stats.totalCounties}</strong> counties</span>
              {stats.totalVacancies > 0 && (
                <>
                  <span className="opacity-50">·</span>
                  <span><strong className="text-white">{stats.totalVacancies}</strong> vacancies</span>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4">
        {/* ── FEATURED EMPLOYERS STRIP ─────────────────────────────────── */}
        {employers.length > 0 && (
          <section className="mt-6">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Featured employers
              </h2>
              <span className="text-xs text-muted-foreground">{employers.length} on the platform</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {employers.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setCompanyId(companyId === e.id ? "all" : e.id)}
                  data-testid={`featured-employer-${e.slug ?? e.id}`}
                  className={`p-3 rounded-xl border text-left transition-all hover:border-emerald-400 hover:bg-emerald-50/40 dark:hover:bg-emerald-900/10 ${
                    companyId === e.id
                      ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 ring-2 ring-emerald-200 dark:ring-emerald-800"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="font-semibold text-xs leading-tight line-clamp-2">{e.name}</span>
                    {e.verified && (
                      <BadgeCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" aria-label="Verified employer" />
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {e.jobCount} open · {e.industry ?? "—"}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── FILTERS ──────────────────────────────────────────────────── */}
        <section className="mt-6 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search jobs, departments or company name…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
              data-testid="kenya-careers-search"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={county}
              onChange={(e) => setCounty(e.target.value)}
              className="text-sm border rounded-md px-3 py-1.5 bg-background"
              data-testid="filter-county"
            >
              <option value="all">All counties</option>
              {filters?.counties.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="text-sm border rounded-md px-3 py-1.5 bg-background"
              data-testid="filter-category"
            >
              <option value="all">All categories</option>
              {filters?.categories.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABEL[c] ?? c}</option>
              ))}
            </select>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="text-sm border rounded-md px-3 py-1.5 bg-background"
              data-testid="filter-company"
            >
              <option value="all">All employers</option>
              {filters?.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {hasAnyFilter && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8">
                Clear filters
              </Button>
            )}
          </div>

          <div className="text-xs text-muted-foreground">
            {loading
              ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Loading jobs…</span>
              : `${total} ${total === 1 ? "job" : "jobs"} found`}
          </div>
        </section>

        {/* ── JOB LIST ─────────────────────────────────────────────────── */}
        <section className="mt-4 space-y-3">
          {error && (
            <Card className="border-rose-200 bg-rose-50 dark:bg-rose-900/10">
              <CardContent className="p-4 text-sm text-rose-700 dark:text-rose-300">{error}</CardContent>
            </Card>
          )}

          {!loading && jobs.length === 0 && !error && (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>No jobs matching those filters yet.</p>
                {hasAnyFilter && (
                  <Button variant="link" size="sm" onClick={clearFilters} className="mt-1">
                    Clear filters and try again
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {jobs.map((j) => (
            <Link key={j.id} href={`/kenya-careers/job/${j.id}`}>
              <Card
                data-testid={`local-job-card-${j.id}`}
                className="cursor-pointer hover:border-emerald-400 hover:shadow-sm transition-all"
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        <h3 className="font-semibold text-base leading-tight">{j.title}</h3>
                        {timeAgo(j.createdAt) === "today" && (
                          <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 px-1.5 py-0.5 rounded uppercase tracking-wide ring-1 ring-emerald-200 dark:ring-emerald-800">
                            New today
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5" />
                        <span className="font-medium">{j.company.name}</span>
                        {j.company.verified && (
                          <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" aria-label="Verified employer" />
                        )}
                      </div>
                      {j.branch && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {j.branch.name}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
                        {(j.county || j.town) && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {[j.town, j.county].filter(Boolean).join(", ")}
                          </span>
                        )}
                        {j.employmentType && (
                          <span className="flex items-center gap-1">
                            <Briefcase className="h-3 w-3" />
                            {EMPLOYMENT_LABEL[j.employmentType] ?? j.employmentType}
                          </span>
                        )}
                        {j.vacancies > 1 && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {j.vacancies} positions
                          </span>
                        )}
                        {j.experienceLevel && j.experienceLevel !== "any" && (
                          <span>{EXPERIENCE_LABEL[j.experienceLevel] ?? j.experienceLevel}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-2.5">
                        {formatSalary(j.salaryMin, j.salaryMax) && (
                          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                            {formatSalary(j.salaryMin, j.salaryMax)}
                          </span>
                        )}
                        {j.category && (
                          <Badge variant="outline" className="text-[10px]">
                            {CATEGORY_LABEL[j.category] ?? j.category}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </section>

        {/* ── EMPLOYER CTA ─────────────────────────────────────────────── */}
        <section className="mt-8">
          <Card className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border-emerald-200 dark:border-emerald-800">
            <CardContent className="p-5 text-center">
              <h3 className="font-semibold text-base mb-1">Hiring for your business?</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Employer accounts are launching soon. Email <a href="mailto:hello@workabroadhub.tech" className="text-emerald-700 dark:text-emerald-300 font-medium underline">hello@workabroadhub.tech</a> to be listed first.
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
