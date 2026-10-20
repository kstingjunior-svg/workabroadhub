/**
 * /kenya-careers — Kenya Careers landing page (Phase 1)
 *
 * 2026-10 redesign (Tony's reference): dark "Explore Kenya's Top Employers"
 * hero with the shared section nav, employer directory (search, county,
 * industry, chips, 12-per-page grid with Follow / View profile), then live
 * jobs. Employers that haven't joined are labelled "Invitation listing";
 * job counts are live postings only (no sample jobs).
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
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  Briefcase, MapPin, Building2, Search, Loader2, BadgeCheck, ChevronRight, ChevronLeft, ChevronDown,
  Users, Inbox, Bell, Lock, SlidersHorizontal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { KenyaSectionNav, NairobiSkyline, BackgroundCurves } from "@/components/kenya-jobs-hub";
import { KenyaCareersNotifySheet } from "@/components/kenya-careers-notify-sheet";
import { SchoolRecruitmentBanner } from "@/components/school-recruitment-banner";
import { SCHOOL_LEVELS, SCHOOL_OWNERSHIP, TEACHING_SUBJECTS } from "@/lib/school-constants";

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
  subjects?: string[] | null;     // 2026-10: teacher vacancies
  tscRequired?: boolean | null;
  company: { id: string; name: string; slug: string | null; industry: string | null; verified: boolean; institutionType?: string };
  branch: { id: string; name: string } | null;
}

interface Stats {
  totalJobs: number;
  totalEmployers: number;
  totalCounties: number;
  totalVacancies: number;
  liveJobs?: number;
  listedEmployers?: number;   // directory incl. invitation listings
  listedCounties?: number;
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
  listingType?: "verified" | "registered" | "invited";
  counties?: string[];
  institutionType?: string;
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
  // 2026-10: accept ?search= and ?county= from the dashboard Kenyan Jobs hub search bar.
  const initialParams = (() => { try { return new URLSearchParams(window.location.search); } catch { return new URLSearchParams(); } })();
  const initialSearch = (initialParams.get("search") ?? "").trim().slice(0, 80);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [search,      setSearch]      = useState(initialSearch);
  const [county,      setCounty]      = useState<string>((initialParams.get("county") ?? "").trim().slice(0, 40) || "all");
  const [category,    setCategory]    = useState<string>("all");
  const [companyId,   setCompanyId]   = useState<string>("all");
  // 2026-10: "Teaching jobs at schools" filter (also via ?institution=school).
  const [schoolType, setSchoolType] = useState<string>("all");
  const [subject, setSubject] = useState<string>("all");
  const [schoolsOnly, setSchoolsOnly] = useState<boolean>(() => {
    try { return new URLSearchParams(window.location.search).get("institution") === "school"; } catch { return false; }
  });
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
          industries: Array.isArray(f.industries) ? f.industries : [],
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
    if (schoolsOnly)          params.set("institution", "school");
    if (schoolsOnly && schoolType !== "all") params.set("schoolType", schoolType);
    if (schoolsOnly && subject !== "all")    params.set("subject", subject);
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
          subjects:        Array.isArray(raw?.subjects) ? raw.subjects.map(String) : null,
          tscRequired:     raw?.tscRequired ?? null,
          company: {
            id:       String(raw?.company?.id ?? ""),
            name:     String(raw?.company?.name ?? "Employer"),
            slug:     raw?.company?.slug ?? null,
            industry: raw?.company?.industry ?? null,
            verified: !!raw?.company?.verified,
            institutionType: raw?.company?.institutionType ?? "company",
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
  }, [county, category, companyId, search, schoolsOnly, schoolType, subject]);

  const hasAnyFilter = useMemo(
    () => county !== "all" || category !== "all" || companyId !== "all" || !!search || schoolsOnly,
    [county, category, companyId, search, schoolsOnly],
  );

  function clearFilters() {
    setCounty("all"); setCategory("all"); setCompanyId("all");
    setSearchInput(""); setSearch(""); setSchoolsOnly(false); setSchoolType("all"); setSubject("all");
  }

  // ── 2026-10 employer directory (Tony's "Explore Kenya's Top Employers") ──
  const [dirInput, setDirInput]       = useState("");
  const [dirSearch, setDirSearch]     = useState("");
  const [dirCounty, setDirCounty]     = useState("all");
  const [dirIndustry, setDirIndustry] = useState("all");
  const [dirChip, setDirChip]         = useState("all");
  const [dirPage, setDirPage]         = useState(1);
  const [follow, setFollow]           = useState<{ id: string; name: string; invited: boolean } | null>(null);
  const [followed, setFollowed]       = useState<Set<string>>(() => new Set());
  // 12 per page (3×4 / 2×6), 6 on phones so the list isn't endless.
  const [pageSize, setPageSize] = useState(() => (typeof window !== "undefined" && window.innerWidth < 640 ? 6 : DIR_PAGE_SIZE));
  useEffect(() => {
    const onResize = () => setPageSize(window.innerWidth < 640 ? 6 : DIR_PAGE_SIZE);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const jobsRef      = useRef<HTMLElement>(null);
  const jobSearchRef = useRef<HTMLInputElement>(null);
  const directoryRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDirSearch(dirInput.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [dirInput]);
  useEffect(() => { setDirPage(1); }, [dirSearch, dirCounty, dirIndustry, dirChip]);

  const industryOptions = useMemo(() => {
    const set = new Set<string>(filters?.industries ?? []);
    employers.forEach((e) => e.industry && set.add(e.industry));
    return Array.from(set).sort();
  }, [filters, employers]);

  const filteredEmployers = useMemo(() => {
    const chip = DIRECTORY_CHIPS.find((c) => c.key === dirChip);
    return employers.filter((e) => {
      const ind = (e.industry ?? "").toLowerCase();
      if (dirSearch && !e.name.toLowerCase().includes(dirSearch) && !ind.includes(dirSearch)) return false;
      if (dirCounty !== "all" && !(e.counties ?? []).includes(dirCounty) && e.county !== dirCounty) return false;
      if (dirIndustry !== "all" && e.industry !== dirIndustry) return false;
      if (chip && chip.match && !chip.match(ind, e.institutionType)) return false;
      return true;
    });
  }, [employers, dirSearch, dirCounty, dirIndustry, dirChip]);

  const hiringEmployers  = filteredEmployers.filter((e) => e.listingType !== "invited");
  const invitedEmployers = filteredEmployers.filter((e) => e.listingType === "invited");
  const invitedTotal     = employers.filter((e) => e.listingType === "invited").length;
  const pageCount        = Math.max(1, Math.ceil(invitedEmployers.length / pageSize));
  const pageSafe         = Math.min(dirPage, pageCount);
  const invitedPage      = invitedEmployers.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);
  const dirFiltered      = !!dirSearch || dirCounty !== "all" || dirIndustry !== "all" || dirChip !== "all";

  function focusJobs() {
    jobsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => jobSearchRef.current?.focus({ preventScroll: true }), 350);
  }
  function scrollToDirectory() {
    directoryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const nEmployers = stats ? (stats.listedEmployers ?? stats.totalEmployers) : null;
  const nCounties  = stats ? (stats.listedCounties ?? stats.totalCounties) : null;
  const nJobs      = stats ? (stats.liveJobs ?? stats.totalJobs) : null;

  return (
    <div
      className="dark min-h-screen bg-[#050b1f] text-white pb-16"
      style={{ backgroundImage: "radial-gradient(1200px 520px at 85% -5%, rgba(37,99,235,0.16), transparent 60%), radial-gradient(900px 600px at -10% 40%, rgba(16,185,129,0.07), transparent 60%)" }}
    >
      <div className="relative">
        <BackgroundCurves />
        <KenyaSectionNav onFindJobs={focusJobs} />

        {/* ── HERO ─────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden border-b border-white/[0.06]" data-testid="kc-hero">
          {/* Skyline (right on desktop, faded backdrop on mobile) */}
          <div className="absolute inset-y-0 right-0 w-full lg:w-[52%]" aria-hidden="true">
            <NairobiSkyline />
            <FlagSwoosh />
            <div className="absolute inset-0 bg-gradient-to-r from-[#050b1f] via-[#050b1f]/70 lg:via-[#050b1f]/25 to-[#050b1f]/40 lg:to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#050b1f]/70 via-transparent to-transparent" />
          </div>

          <div className="relative max-w-[1280px] mx-auto px-4 sm:px-8 pt-7 sm:pt-9 pb-6 sm:pb-8">
            <span className="inline-flex items-center gap-2.5 rounded-full bg-[#0c1a3f]/90 ring-1 ring-blue-400/20 px-4 py-2 text-[11px] sm:text-[13px] font-semibold tracking-[0.12em] text-slate-100">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_2px_rgba(52,211,153,0.6)]" aria-hidden="true" />
              NOW HIRING ACROSS KENYA
            </span>
            <h1 className="mt-4 font-['Plus_Jakarta_Sans',sans-serif] font-extrabold tracking-[-0.03em] leading-[1.06] text-[32px] sm:text-[44px] lg:text-[54px]">
              Explore Kenya&rsquo;s{" "}
              <span className="bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-300 bg-clip-text text-transparent">Top Employers</span>
            </h1>
            <p className="mt-2 max-w-[640px] text-[15px] sm:text-[18px] lg:text-[20px] text-slate-200">
              Discover employers, follow companies, and get notified when real vacancies go live.
            </p>

            {invitedTotal > 0 && (
              <div className="mt-5 flex items-start gap-4 max-w-[640px] rounded-2xl bg-[#0b1d3d]/85 ring-1 ring-cyan-400/20 px-5 py-4 backdrop-blur" data-testid="kc-invite-notice">
                <Bell className="h-7 w-7 shrink-0 text-sky-400" aria-hidden="true" />
                <p className="text-[14px] sm:text-[16px] leading-snug text-slate-100">
                  Some employers are invitation listings. Follow an employer to get notified when verified vacancies are posted.
                </p>
              </div>
            )}

            <div className="mt-5 grid grid-cols-3 max-w-[640px] divide-x divide-white/10" aria-live="polite" data-testid="kc-stats">
              <HeroStat icon={<Building2 className="h-6 w-6 text-sky-400" aria-hidden="true" />} n={nEmployers} label={nEmployers === 1 ? "employer" : "employers"} />
              <HeroStat icon={<Briefcase className="h-6 w-6 text-emerald-400" aria-hidden="true" />} n={nJobs} label={nJobs === 1 ? "job" : "jobs"} />
              <HeroStat icon={<MapPin className="h-6 w-6 text-sky-400" aria-hidden="true" />} n={nCounties} label={nCounties === 1 ? "county" : "counties"} />
            </div>
          </div>
        </section>
      </div>

      <div className="relative max-w-[1280px] mx-auto px-4 sm:px-8">
        {/* ── EMPLOYER SEARCH ──────────────────────────────────────────── */}
        <form
          role="search"
          onSubmit={(e) => { e.preventDefault(); setDirSearch(dirInput.trim().toLowerCase()); scrollToDirectory(); }}
          className="mt-5 grid grid-cols-1 md:grid-cols-[1.9fr_1fr_1fr_auto] gap-3 rounded-2xl bg-[#0a1430]/80 ring-1 ring-white/[0.07] p-2.5 sm:p-3"
          data-testid="kc-employer-search"
        >
          <label className="flex items-center gap-4 rounded-xl bg-[#0b1736] ring-1 ring-white/[0.07] px-5 h-[60px] focus-within:ring-blue-500/60">
            <Search className="h-5 w-5 shrink-0 text-slate-300" aria-hidden="true" />
            <span className="flex-1 min-w-0">
              <span className="sr-only">Search employers by name or industry</span>
              <input
                value={dirInput}
                onChange={(e) => setDirInput(e.target.value.slice(0, 80))}
                placeholder="Search employers by name or industry"
                className="w-full bg-transparent text-[15px] text-white placeholder:text-slate-300 outline-none"
                aria-label="Search employers by name or industry"
                data-testid="kc-employer-search-input"
              />
              <span className="block text-[12px] text-slate-500 truncate">e.g. Naivas, Bank, Hospital, Retail</span>
            </span>
          </label>
          <SelectBox icon={<MapPin className="h-5 w-5 text-sky-400" aria-hidden="true" />} label="County" value={dirCounty} onChange={setDirCounty} testId="kc-employer-county"
            options={[{ v: "all", l: "All counties" }, ...(filters?.counties ?? []).map((c) => ({ v: c, l: c }))]} />
          <SelectBox icon={<Building2 className="h-5 w-5 text-sky-400" aria-hidden="true" />} label="Industry" value={dirIndustry} onChange={setDirIndustry} testId="kc-employer-industry"
            options={[{ v: "all", l: "All industries" }, ...industryOptions.map((i) => ({ v: i, l: i }))]} />
          <button type="submit" className="inline-flex items-center justify-center gap-2.5 h-[60px] px-8 rounded-xl bg-gradient-to-r from-blue-600 to-emerald-500 text-[17px] font-semibold shadow-[0_10px_30px_-10px_rgba(16,185,129,0.6)] hover:brightness-110 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300" data-testid="kc-employer-filter-btn">
            <SlidersHorizontal className="h-5 w-5" aria-hidden="true" /> Filter
          </button>
        </form>

        {/* Industry chips */}
        <div className="mt-4 -mx-4 px-4 sm:mx-0 sm:px-0 flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none]" role="tablist" aria-label="Filter employers by industry">
          {DIRECTORY_CHIPS.map((c) => (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={dirChip === c.key}
              onClick={() => setDirChip(c.key)}
              className={`shrink-0 h-10 px-5 rounded-full text-[14px] font-medium transition ring-1 ${dirChip === c.key ? "bg-blue-600 ring-blue-400 text-white shadow-[0_6px_18px_-6px_rgba(37,99,235,0.8)]" : "bg-[#0a1430] ring-white/10 text-slate-200 hover:ring-white/25"}`}
              data-testid={`kc-chip-${c.key}`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* ── EMPLOYERS HIRING (registered / verified) ─────────────────── */}
        <section ref={directoryRef} className="mt-7 scroll-mt-4" aria-labelledby="kc-dir-heading">
          {hiringEmployers.length > 0 && (
            <div className="mb-8">
              <SectionHeading id="kc-dir-heading" title="Employers on Kenya Careers" sub="Organisations that have joined and post their vacancies here."
                right={`${hiringEmployers.length} ${hiringEmployers.length === 1 ? "employer" : "employers"}`} />
              <div className="mt-4 grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6 gap-3">
                {hiringEmployers.map((e) => (
                  <EmployerCard key={e.id} e={e} followed={followed.has(e.id)} onFollow={() => setFollow({ id: e.id, name: e.name, invited: e.listingType === "invited" })} />
                ))}
              </div>
            </div>
          )}

          {/* ── EMPLOYERS WE'RE INVITING ─────────────────────────────── */}
          {(invitedEmployers.length > 0 || (hiringEmployers.length === 0 && employers.length > 0)) && (
            <div>
              <SectionHeading id={hiringEmployers.length ? undefined : "kc-dir-heading"} title="Employers we're inviting" sub="These organisations have not yet partnered with the platform."
                right={`Not yet partners · ${invitedEmployers.length} invited`} />
              {invitedEmployers.length === 0 ? (
                <p className="mt-4 rounded-2xl bg-[#0a1430] ring-1 ring-white/10 p-6 text-center text-sm text-slate-300">
                  No employers match those filters.{" "}
                  {dirFiltered && <button type="button" className="text-sky-400 underline" onClick={() => { setDirInput(""); setDirSearch(""); setDirCounty("all"); setDirIndustry("all"); setDirChip("all"); }}>Clear filters</button>}
                </p>
              ) : (
                <div className="mt-4 grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6 gap-3" data-testid="kc-invited-grid">
                  {invitedPage.map((e) => (
                    <EmployerCard key={e.id} e={e} followed={followed.has(e.id)} onFollow={() => setFollow({ id: e.id, name: e.name, invited: e.listingType === "invited" })} />
                  ))}
                </div>
              )}
              {pageCount > 1 && <Pager page={pageSafe} count={pageCount} onPage={(n) => { setDirPage(n); scrollToDirectory(); }} />}
            </div>
          )}

          {employers.length === 0 && (
            <p className="rounded-2xl bg-[#0a1430] ring-1 ring-white/10 p-6 text-center text-sm text-slate-300">
              No employers listed yet.
            </p>
          )}
        </section>

        {/* ── SCHOOL BANNER ────────────────────────────────────────────── */}
        <div className="mt-10">
          <SchoolRecruitmentBanner
            onBrowse={() => {
              setSchoolsOnly(true);
              setTimeout(() => focusJobs(), 50);
            }}
          />
        </div>

        {/* ── LIVE JOBS ────────────────────────────────────────────────── */}
        <section ref={jobsRef} id="kc-filters" className="mt-10 scroll-mt-4" aria-labelledby="kc-jobs-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="kc-jobs-heading" className="flex items-center gap-3 text-[24px] sm:text-[28px] font-bold tracking-tight">
                <span className="h-7 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" /> Jobs
              </h2>
              <p className="mt-0.5 text-sm text-slate-400">Live vacancies posted by employers and schools. Counted only once an employer publishes them.</p>
            </div>
            <Link href="/kenya-careers/my-applications" className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-400 hover:underline" data-testid="link-my-applications">
              <Inbox className="h-4 w-4" aria-hidden="true" /> My applications
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden="true" />
              <input
                ref={jobSearchRef}
                type="search"
                placeholder="Search jobs, departments or company name…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full h-12 rounded-xl bg-[#0b1736] ring-1 ring-white/10 pl-11 pr-4 text-[15px] text-white placeholder:text-slate-400 outline-none focus:ring-blue-500/60"
                data-testid="kenya-careers-search"
                aria-label="Search jobs"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSchoolsOnly((v) => !v)}
                className={`text-sm rounded-lg px-3 h-9 ring-1 transition ${schoolsOnly ? "bg-emerald-600 text-white ring-emerald-500" : "bg-[#0a1430] ring-white/10 text-slate-200 hover:ring-white/25"}`}
                data-testid="filter-schools"
              >
                🎓 Teaching jobs at schools
              </button>
              {schoolsOnly && (
                <>
                  <select value={schoolType} onChange={(e) => setSchoolType(e.target.value)} aria-label="School type" className={JOB_SELECT} data-testid="filter-school-type">
                    <option value="all">All school types</option>
                    <optgroup label="Level">
                      {SCHOOL_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                    </optgroup>
                    <optgroup label="Ownership">
                      {SCHOOL_OWNERSHIP.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </optgroup>
                  </select>
                  <select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" className={JOB_SELECT} data-testid="filter-subject">
                    <option value="all">All subjects</option>
                    {TEACHING_SUBJECTS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </>
              )}
              <select value={county} onChange={(e) => setCounty(e.target.value)} aria-label="County" className={JOB_SELECT} data-testid="filter-county">
                <option value="all">All counties</option>
                {filters?.counties.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {(filters?.categories.length ?? 0) > 0 && (
                <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className={JOB_SELECT} data-testid="filter-category">
                  <option value="all">All categories</option>
                  {filters?.categories.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c] ?? c}</option>)}
                </select>
              )}
              {(filters?.companies.length ?? 0) > 0 && (
                <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} aria-label="Employer" className={JOB_SELECT} data-testid="filter-company">
                  <option value="all">All employers</option>
                  {filters?.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              {hasAnyFilter && (
                <button type="button" onClick={clearFilters} className="text-sm text-sky-400 hover:underline px-2">Clear filters</button>
              )}
            </div>

            <div className="text-xs text-slate-400" aria-live="polite">
              {loading
                ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Loading jobs…</span>
                : `${total} ${total === 1 ? "job" : "jobs"}`}
            </div>
          </div>

          <div className="mt-3 space-y-3">
            {error && (
              <div className="rounded-xl bg-rose-950/40 ring-1 ring-rose-800 p-4 text-sm text-rose-200">{error}</div>
            )}

            {!loading && jobs.length === 0 && !error && (
              <div className="rounded-2xl bg-[#0a1430] ring-1 ring-white/10 p-8 text-center" data-testid="empty-state">
                <Briefcase className="h-10 w-10 mx-auto mb-3 text-slate-500" aria-hidden="true" />
                {hasAnyFilter ? (
                  <>
                    <p className="font-semibold">{emptySuggestions?.message ?? "No jobs match those filters yet."}</p>
                    {emptySuggestions && emptySuggestions.suggestedCounties.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Counties with jobs</p>
                        <div className="flex flex-wrap gap-2 justify-center">
                          {emptySuggestions.suggestedCounties.map((c) => (
                            <button key={c.county} onClick={() => setCounty(c.county)}
                              className="text-xs px-3 py-1.5 rounded-full ring-1 ring-emerald-700 bg-emerald-900/30 text-emerald-200 hover:bg-emerald-900/50"
                              data-testid={`suggest-county-${c.county}`}>
                              {c.county} · {c.jobCount} job{c.jobCount === 1 ? "" : "s"}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <button type="button" onClick={clearFilters} className="mt-4 text-sm text-sky-400 hover:underline">Clear all filters</button>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-semibold">No jobs posted yet</p>
                    <p className="mt-1 text-sm text-slate-400 max-w-md mx-auto">
                      Vacancies appear here the moment an employer or school publishes them. Follow an employer above and we'll email you when they post.
                    </p>
                  </>
                )}
              </div>
            )}

            {jobs.map((j) => (
              <Link key={j.id} href={`/kenya-careers/job/${j.id}`}
                className="block rounded-2xl bg-[#0a1430] ring-1 ring-white/10 hover:ring-emerald-500/60 transition p-4"
                data-testid={`local-job-card-${j.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <h3 className="font-semibold text-base leading-tight">{j.title}</h3>
                      {timeAgo(j.createdAt) === "today" && (
                        <span className="text-[9px] font-bold bg-emerald-900/50 text-emerald-200 px-1.5 py-0.5 rounded uppercase tracking-wide ring-1 ring-emerald-700">New today</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-slate-300">
                      <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="font-medium">{j.company.name}</span>
                      {j.company.verified && <BadgeCheck className="h-3.5 w-3.5 text-emerald-400" aria-label="Verified employer" />}
                    </div>
                    {j.branch && <div className="text-xs text-slate-400 mt-0.5">{j.branch.name}</div>}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-slate-400">
                      {(j.county || j.town) && (
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden="true" />{[j.town, j.county].filter(Boolean).join(", ")}</span>
                      )}
                      {j.employmentType && (
                        <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" aria-hidden="true" />{EMPLOYMENT_LABEL[j.employmentType] ?? j.employmentType}</span>
                      )}
                      {j.vacancies > 1 && (
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" aria-hidden="true" />{j.vacancies} positions</span>
                      )}
                      {j.experienceLevel && j.experienceLevel !== "any" && <span>{EXPERIENCE_LABEL[j.experienceLevel] ?? j.experienceLevel}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-2.5">
                      {formatSalary(j.salaryMin, j.salaryMax) && (
                        <span className="text-xs font-semibold text-emerald-300">{formatSalary(j.salaryMin, j.salaryMax)}</span>
                      )}
                      {j.category && <Badge variant="outline" className="text-[10px] border-white/15 text-slate-200">{CATEGORY_LABEL[j.category] ?? j.category}</Badge>}
                      {j.company.institutionType === "school" && <Badge variant="outline" className="text-[10px] border-emerald-600 text-emerald-300">School</Badge>}
                      {j.tscRequired && <Badge variant="outline" className="text-[10px] border-white/15 text-slate-200">TSC required</Badge>}
                    </div>
                    {j.subjects && j.subjects.length > 0 && (
                      <p className="text-[11px] text-slate-400 mt-1.5 line-clamp-1">Subjects: {j.subjects.join(" · ")}</p>
                    )}
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-500 shrink-0 mt-1" aria-hidden="true" />
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ── EMPLOYER CTA ─────────────────────────────────────────────── */}
        <section className="mt-10 rounded-2xl p-[1px] bg-gradient-to-r from-blue-600/60 via-blue-500/30 to-emerald-500/60">
          <div className="rounded-[15px] bg-[#0b1d4a] p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold">Hiring in Kenya?</h3>
              <p className="text-sm text-slate-300">Post your vacancies free and reach 14,000+ registered job-seekers.</p>
            </div>
            <Link href="/kenya-careers/employers" className="inline-flex items-center gap-2 h-12 px-6 rounded-xl bg-gradient-to-r from-blue-600 to-emerald-500 font-semibold whitespace-nowrap hover:brightness-110" data-testid="link-employers-page">
              <Briefcase className="h-5 w-5" aria-hidden="true" /> Post a Job
            </Link>
          </div>
        </section>
      </div>

      {follow && (
        <KenyaCareersNotifySheet
          open={!!follow}
          onClose={() => setFollow(null)}
          onSubscribed={() => { const id = follow.id; setFollowed((s) => new Set(s).add(id)); }}
          companyId={follow.id}
          companyName={follow.name}
          invited={follow.invited}
        />
      )}
    </div>
  );
}

/* ── Directory helpers ─────────────────────────────────────────────────── */

const DIR_PAGE_SIZE = 12;
const JOB_SELECT = "text-sm rounded-lg h-9 px-3 bg-[#0a1430] ring-1 ring-white/10 text-slate-200 outline-none focus:ring-blue-500/60";

const DIRECTORY_CHIPS: { key: string; label: string; match?: (industry: string, institutionType?: string) => boolean }[] = [
  { key: "all",          label: "All employers" },
  { key: "retail",       label: "Retail",        match: (i) => i.includes("retail") || i.includes("supermarket") },
  { key: "banking",      label: "Banking",       match: (i) => i.includes("bank") || i.includes("finance") },
  { key: "healthcare",   label: "Healthcare",    match: (i) => i.includes("health") || i.includes("hospital") },
  { key: "hospitality",  label: "Hospitality",   match: (i) => i.includes("hospitality") || i.includes("hotel") },
  { key: "telecom",      label: "Telecom",       match: (i) => i.includes("telecom") },
  { key: "security",     label: "Security",      match: (i) => i.includes("security") },
  { key: "manufacturing",label: "Manufacturing", match: (i) => i.includes("manufactur") },
  { key: "education",    label: "Education",     match: (i, t) => t === "school" || i.includes("educat") },
  { key: "transport",    label: "Transport",     match: (i) => i.includes("transport") || i.includes("logistic") },
  { key: "energy",       label: "Energy",        match: (i) => i.includes("energy") || i.includes("fuel") },
  { key: "construction", label: "Construction",  match: (i) => i.includes("construct") },
  { key: "ngo",          label: "NGOs & Government", match: (i) => i.includes("ngo") || i.includes("government") || i.includes("public") },
];

const AVATAR_COLOURS = [
  "from-emerald-500 to-emerald-700", "from-rose-500 to-red-700", "from-blue-500 to-blue-700",
  "from-fuchsia-600 to-rose-800", "from-green-500 to-teal-700", "from-teal-600 to-emerald-800",
  "from-red-500 to-rose-600", "from-amber-500 to-orange-700", "from-slate-400 to-slate-600",
  "from-indigo-500 to-violet-700", "from-sky-500 to-indigo-700", "from-pink-400 to-rose-500",
];
function avatarColour(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLOURS[h % AVATAR_COLOURS.length];
}

function HeroStat({ icon, n, label }: { icon: React.ReactNode; n: number | null; label: string }) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 px-3 sm:px-5 first:pl-0">
      <span className="grid h-11 w-11 sm:h-12 sm:w-12 shrink-0 place-items-center rounded-xl bg-[#0d1b40] ring-1 ring-white/[0.07]">{icon}</span>
      <div className="leading-tight">
        {n === null
          ? <span className="block h-6 w-10 rounded bg-white/10 animate-pulse" />
          : <p className="text-[22px] sm:text-[26px] font-bold">{n.toLocaleString()}</p>}
        <p className="text-[13px] sm:text-[15px] text-slate-300">{label}</p>
      </div>
    </div>
  );
}

function SelectBox({ icon, label, value, onChange, options, testId }: {
  icon: React.ReactNode; label: string; value: string; onChange: (v: string) => void;
  options: { v: string; l: string }[]; testId: string;
}) {
  return (
    <label className="relative flex items-center gap-4 rounded-xl bg-[#0b1736] ring-1 ring-white/[0.07] px-5 h-[60px] focus-within:ring-blue-500/60">
      {icon}
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] text-slate-300">{label}</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none bg-transparent text-[15px] text-white outline-none pr-6 cursor-pointer"
          aria-label={label}
          data-testid={testId}
        >
          {options.map((o) => <option key={o.v} value={o.v} className="text-slate-900">{o.l}</option>)}
        </select>
      </span>
      <ChevronDown className="pointer-events-none absolute right-5 h-5 w-5 text-slate-300" aria-hidden="true" />
    </label>
  );
}

function SectionHeading({ id, title, sub, right }: { id?: string; title: string; sub: string; right: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <div>
        <h2 id={id} className="flex items-center gap-3 text-[24px] sm:text-[30px] font-bold tracking-tight">
          <span className="h-8 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" /> {title}
        </h2>
        <p className="mt-0.5 pl-[18px] text-[14px] sm:text-[15px] text-slate-300">{sub}</p>
      </div>
      <span className="text-[13px] sm:text-[14px] text-slate-400">{right}</span>
    </div>
  );
}

function EmployerCard({ e, followed, onFollow }: { e: Employer; followed: boolean; onFollow: () => void }) {
  const invited = e.listingType === "invited";
  const profile = `/kenya-careers/company/${e.slug ?? e.id}`;
  return (
    <article className="flex flex-col rounded-2xl bg-[#0a1430] ring-1 ring-white/10 hover:ring-blue-500/40 transition p-3.5" data-testid={`featured-employer-${e.slug ?? e.id}`}>
      <div className="flex items-start gap-3">
        {e.logoUrl ? (
          <img src={e.logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover bg-white" loading="lazy" />
        ) : (
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${avatarColour(e.name)} text-[22px] font-bold text-white`} aria-hidden="true">
            {e.name.trim().charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold leading-tight line-clamp-2">{e.name}</h3>
          {e.industry && <p className="text-[12px] text-slate-400 leading-tight mt-0.5">{e.industry}</p>}
          <span className={`mt-1.5 inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10.5px] font-medium ring-1 ${
            e.listingType === "verified" ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/40"
            : invited ? "bg-amber-500/10 text-amber-300 ring-amber-500/40"
            : "bg-sky-500/10 text-sky-300 ring-sky-500/40"}`}>
            {e.listingType === "verified" ? <><BadgeCheck className="h-3 w-3" aria-hidden="true" /> Verified employer</>
              : invited ? <><Lock className="h-3 w-3" aria-hidden="true" /> Invitation listing</>
              : <>Registered employer</>}
          </span>
        </div>
      </div>
      <p className="mt-2.5 flex items-center gap-1.5 text-[12px] text-slate-200">
        {invited
          ? <><Bell className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" /> Get notified when they join</>
          : <><Briefcase className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" /> {e.jobCount} open {e.jobCount === 1 ? "job" : "jobs"}</>}
      </p>
      <div className="mt-auto pt-3 grid grid-cols-[auto_1fr] gap-2">
        <button
          type="button"
          onClick={onFollow}
          disabled={followed}
          className="h-9 px-4 rounded-lg bg-emerald-700/90 hover:bg-emerald-600 disabled:bg-emerald-900/60 disabled:text-emerald-200 ring-1 ring-emerald-500/50 text-[13px] font-semibold transition"
          aria-label={followed ? `Following ${e.name}` : `Follow ${e.name}`}
          data-testid={`follow-employer-${e.slug ?? e.id}`}
        >
          {followed ? "Following" : "Follow"}
        </button>
        <Link href={profile} className="h-9 grid place-items-center rounded-lg bg-[#0f2150] hover:bg-[#15296a] ring-1 ring-blue-400/30 text-[13px] font-semibold transition whitespace-nowrap" data-testid={`view-employer-${e.slug ?? e.id}`}>
          View profile
        </Link>
      </div>
    </article>
  );
}

function Pager({ page, count, onPage }: { page: number; count: number; onPage: (n: number) => void }) {
  const nums: (number | "…")[] = [];
  for (let i = 1; i <= count; i++) {
    if (i === 1 || i === count || Math.abs(i - page) <= 1 || (page <= 2 && i <= 3)) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  const btn = "h-9 min-w-9 px-2 grid place-items-center rounded-lg text-[14px] ring-1 transition";
  return (
    <nav className="mt-6 flex items-center justify-center gap-2" aria-label="Employer pages">
      <button type="button" className={`${btn} ring-white/10 bg-[#0a1430] disabled:opacity-40`} disabled={page === 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      {nums.map((n, i) => n === "…"
        ? <span key={`e${i}`} className="px-1 text-slate-400">…</span>
        : <button key={n} type="button" onClick={() => onPage(n)} aria-current={n === page ? "page" : undefined}
            className={`${btn} ${n === page ? "bg-blue-600 ring-blue-400 text-white" : "bg-[#0a1430] ring-white/10 text-slate-200 hover:ring-white/25"}`}>{n}</button>)}
      <button type="button" className={`${btn} ring-white/10 bg-[#0a1430] disabled:opacity-40`} disabled={page === count} onClick={() => onPage(page + 1)} aria-label="Next page">
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </nav>
  );
}

function FlagSwoosh() {
  // Kenyan-flag ribbon sweeping across the bottom-right of the skyline.
  return (
    <svg viewBox="0 0 600 300" preserveAspectRatio="none" className="absolute bottom-0 right-0 h-[70%] w-[70%]" aria-hidden="true">
      <path d="M600 40 C 520 120, 470 210, 380 300 L 600 300 Z" fill="#000" opacity="0.85" />
      <path d="M600 70 C 530 150, 490 225, 420 300 L 600 300 Z" fill="#fff" opacity="0.9" />
      <path d="M600 84 C 534 160, 498 232, 434 300 L 600 300 Z" fill="#b91c1c" />
      <path d="M600 150 C 560 200, 535 250, 500 300 L 600 300 Z" fill="#fff" opacity="0.9" />
      <path d="M600 164 C 566 210, 545 256, 516 300 L 600 300 Z" fill="#15803d" />
    </svg>
  );
}
