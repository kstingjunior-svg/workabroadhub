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
  Briefcase, MapPin, Building2, Search, Loader2, BadgeCheck, ChevronRight, Users, Globe2, Inbox,
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
  isSeed: boolean;   // 2026-06 SAFETY: true = sample listing, applications disabled
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
  counties:   string[];     // ALL 47 Kenyan counties (canonical IEBC list)
  categories: string[];
  industries: string[];
  companies:  { id: string; name: string; industry: string | null; jobCount: number }[];
}

// 2026-06 Phase 3a: empty-state suggestions when a filter has 0 results.
interface EmptySuggestions {
  message: string;
  suggestedCounties:  { county: string; jobCount: number }[];
  suggestedEmployers: { id: string; name: string; industry: string | null; jobCount: number }[];
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

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const ms = Date.now() - t;
  const days = Math.floor(ms / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/**
 * Safe JSON fetch. Returns null on ANY failure — non-2xx, non-JSON body,
 * network error, parse failure. Caller treats null as "endpoint not
 * available" and renders the empty state. Critical for Phase 1 because the
 * server-side routes may not be deployed everywhere yet, in which case the
 * SPA catch-all returns the HTML shell with 200 — which would normally make
 * `r.json()` throw a SyntaxError that escapes and crashes the page.
 */
async function safeJson<T = any>(url: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.toLowerCase().includes("application/json")) return null;
    return await res.json();
  } catch {
    return null;
  }
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
  // Phase 3a: empty-state suggestions when 0 results
  const [emptySuggestions, setEmptySuggestions] = useState<EmptySuggestions | null>(null);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // One-shot static fetches (stats, filters, employers). All wrapped in
  // safeJson so an undeployed endpoint (which would return the SPA shell as
  // HTML with 200) never crashes the page — it just leaves the side-strip
  // empty and the dropdowns showing only the "All …" defaults.
  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    (async () => {
      const [s, f, e] = await Promise.all([
        safeJson<Stats>("/api/local-jobs/stats", ac.signal),
        safeJson<Filters>("/api/local-jobs/filters", ac.signal),
        safeJson<{ companies?: Employer[] }>("/api/local-jobs/companies", ac.signal),
      ]);
      if (cancelled) return;
      if (s) setStats(s);
      if (f) {
        // Defensive — coerce missing keys to [] so downstream .map() can't throw.
        setFilters({
          counties:   Array.isArray(f.counties)   ? f.counties   : [],
          categories: Array.isArray(f.categories) ? f.categories : [],
          companies:  Array.isArray(f.companies)  ? f.companies  : [],
        });
      }
      if (e && Array.isArray(e.companies)) setEmployers(e.companies);
    })();
    return () => { cancelled = true; ac.abort(); };
  }, []);

  // Re-fetch jobs whenever filters change. Also routed through safeJson so an
  // unexpected response shape can't bubble out.
  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setEmptySuggestions(null);
    const params = new URLSearchParams();
    if (county     !== "all") params.set("county",    county);
    if (category   !== "all") params.set("category",  category);
    if (companyId  !== "all") params.set("companyId", companyId);
    if (search)               params.set("search",    search);
    const url = `/api/local-jobs?${params.toString()}`;
    (async () => {
      const data = await safeJson<{ jobs?: unknown[]; total?: number }>(url, ac.signal);
      if (cancelled) return;
      if (!data) {
        setError("Could not load jobs right now. Please refresh in a moment.");
        setJobs([]);
        setTotal(0);
      } else {
        // Coerce every job to a safe shape — missing nested fields can't throw
        // during the render pass below.
        const rawJobs = Array.isArray(data.jobs) ? data.jobs : [];
        const safeJobs: Job[] = rawJobs.map((raw: any) => ({
          id:              String(raw?.id ?? Math.random()),
          title:           String(raw?.title ?? "Untitled job"),
          department:      raw?.department ?? null,
          vacancies:       Number(raw?.vacancies ?? 1),
          employmentType:  raw?.employmentType ?? null,
          salaryMin:       raw?.salaryMin ?? null,
          salaryMax:       raw?.salaryMax ?? null,
          county:          raw?.county ?? null,
          town:            raw?.town ?? null,
          experienceLevel: raw?.experienceLevel ?? null,
          category:        raw?.category ?? null,
          deadline:        raw?.deadline ?? null,
          createdAt:       String(raw?.createdAt ?? new Date().toISOString()),
          // 2026-06 SAFETY: default to true if the server didn't tell us
          // (old shell, missing column). Safer to flag an unknown job as
          // sample than to misrepresent it as a real opening.
          isSeed:          raw?.isSeed !== false,
          company: {
            id:       String(raw?.company?.id ?? ""),
            name:     String(raw?.company?.name ?? "Employer"),
            slug:     raw?.company?.slug ?? null,
            industry: raw?.company?.industry ?? null,
            verified: !!raw?.company?.verified,
          },
          branch: raw?.branch && raw?.branch?.id
            ? { id: String(raw.branch.id), name: String(raw.branch.name ?? "") }
            : null,
        }));
        setJobs(safeJobs);
        setTotal(Number(data.total ?? safeJobs.length));

        // Phase 3a: when the result set is empty, fetch suggestions so the
        // user sees "no jobs in Garissa yet — try Nairobi (37 jobs) or
        // Mombasa (12 jobs)" instead of a dead end.
        if (safeJobs.length === 0) {
          const suggUrl = `/api/local-jobs/empty-suggestions?${params.toString()}`;
          const sugg = await safeJson<EmptySuggestions>(suggUrl, ac.signal);
          if (!cancelled && sugg) setEmptySuggestions(sugg);
        }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; ac.abort(); };
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
            See what jobs at Kenya's top employers — Naivas, Quickmart, Carrefour, Java House,
            hospitals and more — typically look like. Be the first to know when they post real openings.
          </p>
          {/* 2026-06 SAFETY: honest disclosure in the hero. Every listing is
              labelled "Sample" until the employer onboards. No misrepresentation. */}
          <p className="text-emerald-100/90 text-xs mt-2 max-w-md mx-auto">
            All current listings are samples — we're onboarding employers now. Tap "Notify me" on any role to be alerted when real applications open.
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
        {/* 2026-06 Phase 2: quick link to "My applications" so signed-in users
            can track what they've sent. The link is harmless for anonymous
            users — server will route them to /login. */}
        <div className="mt-4 flex justify-end">
          <Link href="/kenya-careers/my-applications">
            <Button variant="ghost" size="sm" className="text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20" data-testid="link-my-applications">
              <Inbox className="h-4 w-4 mr-1.5" /> My applications
            </Button>
          </Link>
        </div>

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
            <Card data-testid="empty-state">
              <CardContent className="p-6 text-center">
                <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium text-foreground mb-1">
                  {emptySuggestions?.message ?? "No jobs matching those filters yet."}
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  Try a nearby county or a different employer — new jobs land every week.
                </p>

                {/* Nearby counties with jobs */}
                {emptySuggestions && emptySuggestions.suggestedCounties.length > 0 && (
                  <div className="mb-4 text-left">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 text-center">
                      Counties currently hiring
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {emptySuggestions.suggestedCounties.map((c) => (
                        <button
                          key={c.county}
                          onClick={() => setCounty(c.county)}
                          className="text-xs px-3 py-1.5 rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
                          data-testid={`suggest-county-${c.county}`}
                        >
                          {c.county} <span className="opacity-70">· {c.jobCount} job{c.jobCount === 1 ? "" : "s"}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Related employers */}
                {emptySuggestions && emptySuggestions.suggestedEmployers.length > 0 && (
                  <div className="mb-2 text-left">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 text-center">
                      Employers hiring now
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {emptySuggestions.suggestedEmployers.map((e) => (
                        <button
                          key={e.id}
                          onClick={() => { setCompanyId(e.id); setCounty("all"); }}
                          className="text-xs px-3 py-1.5 rounded-full border bg-card hover:border-emerald-400 transition-colors"
                          data-testid={`suggest-employer-${e.id}`}
                        >
                          {e.name}
                          {e.jobCount > 0 && <span className="opacity-70"> · {e.jobCount} open</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {hasAnyFilter && (
                  <Button variant="link" size="sm" onClick={clearFilters} className="mt-3">
                    Clear all filters
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
                        {/* 2026-06 SAFETY: every seeded job carries this badge so
                            visitors can see at a glance that this isn't a verified
                            employer posting. Real employer postings (Phase 4) will
                            have isSeed=false and won't show this badge. */}
                        {j.isSeed ? (
                          <span
                            className="text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 px-1.5 py-0.5 rounded uppercase tracking-wide ring-1 ring-amber-300 dark:ring-amber-800"
                            data-testid={`badge-sample-${j.id}`}
                            title="This is a sample listing — the employer hasn't been onboarded yet"
                          >
                            Sample listing
                          </span>
                        ) : (
                          timeAgo(j.createdAt) === "today" && (
                            <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 px-1.5 py-0.5 rounded uppercase tracking-wide ring-1 ring-emerald-200 dark:ring-emerald-800">
                              New today
                            </span>
                          )
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
