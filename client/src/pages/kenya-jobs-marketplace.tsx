/**
 * /kenya-careers — "Find Jobs Near You" (2026-11 redesign).
 * Kenyan local jobs marketplace: search, location (GPS optional or typed),
 * live counters, categories, counties/towns, today's jobs, and job cards
 * with direct Call / WhatsApp to the employer. Browsing never needs an
 * account; contacting an employer needs a free sign-in.
 *
 * The previous employer-directory page is still reachable for teaching
 * jobs (?institution=school) and from "Employers directory".
 */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Search, MapPin, Crosshair, Loader2, BadgeCheck, Clock, Users, Briefcase, CalendarDays, ChevronRight, X, Building2, School } from "lucide-react";
import { LocalJobContactButtons } from "@/components/local-job-contact";
import { KENYA_COUNTIES } from "@/lib/school-constants";
import { usePageSeo } from "@/hooks/use-page-seo";

const ClassicKenyaCareers = lazy(() => import("@/pages/kenya-careers"));

type Job = {
  id: string; title: string; description: string | null; vacancies: number; employmentType: string; category: string;
  salaryMin: number | null; salaryMax: number | null; salaryPeriod: string | null; county: string | null; town: string | null; estate: string | null;
  deadline: string | null; postedAt: string; badge: string; canCall: boolean; canWhatsApp: boolean; distanceKm: number | null;
  employer: { name: string; verified: boolean };
};
const TYPE_LABEL: Record<string, string> = { full_time: "Full-time", part_time: "Part-time", contract: "Contract", temporary: "Temporary", casual: "Casual", internship: "Internship" };
const PERIOD: Record<string, string> = { month: "/month", week: "/week", day: "/day", hour: "/hour", job: "/job", year: "/year" };
const BADGE: Record<string, [string, string]> = {
  verified: ["Verified employer", "bg-emerald-100 text-emerald-800"],
  contact_confirmed: ["Contact confirmed", "bg-sky-100 text-sky-800"],
  admin_posted: ["Listed by WorkAbroadHub", "bg-slate-100 text-slate-700"],
  pending: ["Verification pending", "bg-amber-50 text-amber-800"],
};
const POPULAR_TOWNS = ["Nairobi CBD", "Westlands", "Ruiru", "Thika", "Kahawa Wendani", "Kasarani", "Embakasi", "Kitengela", "Rongai", "Mombasa CBD", "Nakuru", "Eldoret", "Kisumu", "Kakamega", "Machakos", "Nyeri"];

function ago(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${Math.max(1, m)} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24); return d === 1 ? "yesterday" : `${d} days ago`;
}
const pay = (j: Job) => (j.salaryMin || j.salaryMax ? `KES ${Number(j.salaryMin ?? j.salaryMax).toLocaleString("en-KE")}${j.salaryMax && j.salaryMin && j.salaryMax !== j.salaryMin ? `–${Number(j.salaryMax).toLocaleString("en-KE")}` : ""}${PERIOD[j.salaryPeriod ?? ""] ?? ""}` : null);
const getJson = async (u: string) => { const r = await fetch(u, { credentials: "include" }); if (!r.ok) throw new Error(String(r.status)); return r.json(); };

export default function KenyaJobsMarketplace() {
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  if (params.get("institution") || params.get("classic") === "1") {
    return <Suspense fallback={<div className="p-10 text-center"><Loader2 className="h-6 w-6 animate-spin inline" /></div>}><ClassicKenyaCareers /></Suspense>;
  }
  return <Marketplace initial={params} />;
}

function Marketplace({ initial }: { initial: URLSearchParams }) {
  usePageSeo({
    title: "Jobs Near You in Kenya — Call or WhatsApp Employers Directly | WorkAbroad Hub",
    description: "Find local jobs near you in Kenya: shop attendants, drivers, waiters, security, cleaners and more. Free to browse. Call or WhatsApp the employer directly.",
  });
  const [, navigate] = useLocation();
  const [q, setQ] = useState(initial.get("search") ?? initial.get("q") ?? "");
  const [qApplied, setQApplied] = useState(q);
  const [county, setCounty] = useState(initial.get("county") ?? "all");
  const [category, setCategory] = useState(initial.get("category") ?? "all");
  const [place, setPlace] = useState(initial.get("place") ?? "");
  const [placeApplied, setPlaceApplied] = useState(initial.get("place") ?? "");
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsState, setGpsState] = useState<"idle" | "asking" | "denied">("idle");
  const [todayOnly, setTodayOnly] = useState(false);
  const [radius, setRadius] = useState(25);

  const locParams = useMemo(() => {
    const p = new URLSearchParams();
    if (gps) { p.set("lat", String(gps.lat)); p.set("lng", String(gps.lng)); }
    else if (placeApplied) p.set("place", placeApplied);
    return p;
  }, [gps, placeApplied]);
  const nearMode = !!gps || !!placeApplied;

  const stats = useQuery<any>({
    queryKey: ["/api/lj/stats", locParams.toString(), radius],
    queryFn: () => getJson(`/api/lj/stats?${locParams}&radius=${radius}`),
    refetchInterval: 15_000, refetchOnWindowFocus: true,
  });
  const cats = useQuery<any>({ queryKey: ["/api/lj/categories"], queryFn: () => getJson("/api/lj/categories"), refetchInterval: 60_000 });

  const listQs = useMemo(() => {
    const p = new URLSearchParams(locParams);
    if (qApplied) p.set("q", qApplied);
    if (county !== "all") p.set("county", county);
    if (category !== "all") p.set("category", category);
    if (todayOnly) p.set("today", "1");
    if (nearMode) { p.set("near", "1"); p.set("radius", String(radius)); }
    p.set("limit", "60");
    return p.toString();
  }, [locParams, qApplied, county, category, todayOnly, nearMode, radius]);
  const jobs = useQuery<any>({ queryKey: ["/api/lj/jobs", listQs], queryFn: () => getJson(`/api/lj/jobs?${listQs}`), refetchInterval: 30_000 });
  const recent = useQuery<any>({ queryKey: ["/api/lj/jobs", "recent"], queryFn: () => getJson(`/api/lj/jobs?limit=6`), refetchInterval: 30_000 });

  function useMyLocation() {
    if (!navigator.geolocation) { setGpsState("denied"); return; }
    setGpsState("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setPlace(""); setPlaceApplied(""); setGpsState("idle"); },
      () => setGpsState("denied"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
    );
  }
  function search(e?: React.FormEvent) {
    e?.preventDefault();
    setQApplied(q.trim());
    if (place.trim()) { setPlaceApplied(place.trim()); setGps(null); }
    document.getElementById("lj-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function pickTown(t: string) { setPlace(t); setPlaceApplied(t); setGps(null); document.getElementById("lj-results")?.scrollIntoView({ behavior: "smooth" }); }
  const clearLocation = () => { setGps(null); setPlace(""); setPlaceApplied(""); };

  const s = stats.data;
  const statTiles: [string, any, any][] = [
    ["Jobs available", s?.total, Briefcase], ["Posted today", s?.today, Clock], ["This week", s?.week, CalendarDays],
    [nearMode ? `Near ${s?.nearLabel ?? "you"}` : "Jobs near you", nearMode ? s?.near : "—", MapPin], ["Open positions", s?.vacancies, Users],
  ];
  const list: Job[] = jobs.data?.jobs ?? [];
  const catLabel = (slug: string) => cats.data?.categories?.find((c: any) => c.slug === slug)?.label ?? slug;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Hero */}
      <section className="bg-gradient-to-br from-[#062a1f] via-[#0b3b2c] to-[#0f172a] text-white">
        <div className="max-w-6xl mx-auto px-4 pt-20 pb-10 sm:pt-14 sm:pb-14">
          <p className="text-emerald-300 text-sm font-semibold tracking-wide">KENYAN LOCAL JOBS</p>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight mt-1 !text-white" style={{ color: "#fff" }}>Find Jobs Near You</h1>
          <p className="mt-2 text-slate-200 text-base sm:text-lg max-w-2xl">Real vacancies from shops, businesses and families across Kenya. Free to browse — call or WhatsApp the employer directly.</p>
          <form onSubmit={search} className="mt-6 grid gap-2 sm:grid-cols-[1.3fr_1fr_auto] bg-white/10 backdrop-blur rounded-2xl p-2">
            <label className="flex items-center gap-2 bg-white rounded-xl px-3 h-14 text-slate-900">
              <Search className="h-5 w-5 text-slate-400 shrink-0" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Job title, e.g. shop attendant, driver" className="w-full outline-none text-base bg-transparent" data-testid="lj-search" />
            </label>
            <label className="flex items-center gap-2 bg-white rounded-xl px-3 h-14 text-slate-900">
              <MapPin className="h-5 w-5 text-slate-400 shrink-0" />
              <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Your area, e.g. Kahawa Wendani" list="lj-places" className="w-full outline-none text-base bg-transparent" data-testid="lj-place" />
              <datalist id="lj-places">{POPULAR_TOWNS.map((t) => <option key={t} value={t} />)}</datalist>
            </label>
            <button type="submit" className="h-14 px-7 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-base" data-testid="lj-search-btn">Search</button>
          </form>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <button type="button" onClick={useMyLocation} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 hover:bg-white/20 px-4 py-2" data-testid="lj-gps">
              {gpsState === "asking" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />} Use my location
            </button>
            {gpsState === "denied" && <span className="text-amber-200">Location not shared — type your area instead.</span>}
            {nearMode && (
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1.5">
                Showing jobs within
                <select value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="bg-transparent font-semibold outline-none">
                  {[5, 10, 25, 50, 100].map((r) => <option key={r} value={r} className="text-slate-900">{r} km</option>)}
                </select>
                of {gps ? "your location" : jobs.data?.origin?.label ?? placeApplied}
                <button type="button" onClick={clearLocation} aria-label="Clear location"><X className="h-4 w-4" /></button>
              </span>
            )}
            {placeApplied && !gps && jobs.data && !jobs.data.origin && <span className="text-amber-200">We don't know "{placeApplied}" yet — try a nearby town.</span>}
          </div>
        </div>
      </section>

      {/* Live counters */}
      <section className="max-w-6xl mx-auto px-4 -mt-6">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {statTiles.map(([l, n, Icon], i) => (
            <div key={l} className={`rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 shadow-sm ${i === 4 ? "col-span-2 sm:col-span-1" : ""}`}>
              <div className="flex items-center gap-1.5 text-xs text-slate-500"><Icon className="h-3.5 w-3.5" />{l}</div>
              <div className="text-2xl font-extrabold text-slate-900 dark:text-white" data-testid={`lj-stat-${i}`}>{n == null ? <Loader2 className="h-5 w-5 animate-spin" /> : typeof n === "number" ? n.toLocaleString() : n}</div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 mt-1">Live from our database · updates automatically</p>
      </section>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">
        {/* Categories */}
        <section>
          <h2 className="text-lg font-bold mb-3">Popular categories</h2>
          <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap">
            <button onClick={() => setCategory("all")} className={`shrink-0 rounded-full px-4 py-2 text-sm border ${category === "all" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"}`}>All jobs</button>
            {(cats.data?.categories ?? []).filter((c: any) => c.slug !== "other").map((c: any) => (
              <button key={c.slug} onClick={() => setCategory(c.slug)} className={`shrink-0 rounded-full px-4 py-2 text-sm border ${category === c.slug ? "bg-emerald-600 text-white border-emerald-600" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"}`}>
                {c.icon} {c.label}{c.jobs ? <span className="ml-1 opacity-70">({c.jobs})</span> : null}
              </button>
            ))}
          </div>
        </section>

        {/* Results */}
        <section id="lj-results" className="scroll-mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="text-lg font-bold">
              {nearMode ? "Jobs near you" : todayOnly ? "Jobs posted today" : category !== "all" ? catLabel(category) : "Latest jobs"}
              <span className="text-slate-400 font-normal text-sm ml-2">{jobs.data ? `${jobs.data.total} found` : ""}</span>
            </h2>
            <div className="flex gap-2">
              <select value={county} onChange={(e) => setCounty(e.target.value)} className="h-10 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm" aria-label="County">
                <option value="all">All counties</option>{KENYA_COUNTIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <button onClick={() => setTodayOnly(!todayOnly)} className={`h-10 rounded-lg px-3 text-sm border ${todayOnly ? "bg-emerald-600 text-white border-emerald-600" : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"}`}>Today</button>
            </div>
          </div>
          {jobs.isLoading ? <div className="py-10 text-center"><Loader2 className="h-6 w-6 animate-spin inline" /></div>
            : list.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-slate-500">
                No jobs match yet{nearMode ? " near this location — try a bigger distance" : ""}. New vacancies are added every day.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">{list.map((j) => <JobCard key={j.id} j={j} cat={catLabel(j.category)} onOpen={() => navigate(`/kenya-careers/job/${j.id}`)} />)}</div>
            )}
        </section>

        {/* Recently added (when filtered) */}
        {(nearMode || category !== "all" || qApplied || county !== "all" || todayOnly) && (recent.data?.jobs?.length ?? 0) > 0 && (
          <section>
            <h2 className="text-lg font-bold mb-3">Recently added across Kenya</h2>
            <div className="grid gap-3 sm:grid-cols-2">{recent.data.jobs.map((j: Job) => <JobCard key={j.id} j={j} cat={catLabel(j.category)} onOpen={() => navigate(`/kenya-careers/job/${j.id}`)} />)}</div>
          </section>
        )}

        {/* Browse by town / county */}
        <section className="grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="text-lg font-bold mb-3">Browse by town</h2>
            <div className="flex flex-wrap gap-2">{POPULAR_TOWNS.map((t) => <button key={t} onClick={() => pickTown(t)} className="rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm hover:border-emerald-500">{t}</button>)}</div>
          </div>
          <div>
            <h2 className="text-lg font-bold mb-3">Browse by county</h2>
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">{KENYA_COUNTIES.map((c) => <button key={c} onClick={() => { setCounty(c); document.getElementById("lj-results")?.scrollIntoView({ behavior: "smooth" }); }} className="rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm hover:border-emerald-500">{c}</button>)}</div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3 text-sm">
          <Link href="/kenya-careers/employers"><div className="rounded-xl bg-white dark:bg-slate-900 border p-4 flex items-center gap-3 cursor-pointer hover:border-emerald-500"><Building2 className="h-5 w-5 text-emerald-600" /><div><b>Hiring?</b> Post your vacancy</div><ChevronRight className="ml-auto h-4 w-4" /></div></Link>
          <Link href="/kenya-careers?institution=school"><div className="rounded-xl bg-white dark:bg-slate-900 border p-4 flex items-center gap-3 cursor-pointer hover:border-emerald-500"><School className="h-5 w-5 text-emerald-600" /><div>Teaching & school jobs</div><ChevronRight className="ml-auto h-4 w-4" /></div></Link>
          <Link href="/kenya-careers?classic=1"><div className="rounded-xl bg-white dark:bg-slate-900 border p-4 flex items-center gap-3 cursor-pointer hover:border-emerald-500"><Briefcase className="h-5 w-5 text-emerald-600" /><div>Employers directory</div><ChevronRight className="ml-auto h-4 w-4" /></div></Link>
        </section>
        <p className="text-xs text-slate-500">Never pay anyone to get a job. Genuine employers don't charge registration, interview or training fees. Report a suspicious listing from the job page.</p>
      </div>
    </div>
  );
}

function JobCard({ j, cat, onOpen }: { j: Job; cat: string; onOpen: () => void }) {
  const [label, cls] = BADGE[j.badge] ?? BADGE.pending;
  const p = pay(j);
  return (
    <article className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex flex-col gap-2" data-testid={`lj-card-${j.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold text-base leading-snug cursor-pointer hover:underline" onClick={onOpen}>{j.title}</h3>
          <div className="text-sm text-slate-600 dark:text-slate-300 truncate">{j.employer.name}</div>
        </div>
        <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${cls}`}>{j.badge === "verified" && <BadgeCheck className="h-3 w-3" />}{label}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
        <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{[j.estate, j.town, j.county].filter(Boolean).join(", ")}{j.distanceKm != null ? ` · ${j.distanceKm} km` : ""}</span>
        {p && <span className="font-semibold text-emerald-700 dark:text-emerald-400">{p}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5 text-xs">
        <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5">{cat}</span>
        <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5">{TYPE_LABEL[j.employmentType] ?? j.employmentType}</span>
        <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5">{j.vacancies} vacanc{j.vacancies === 1 ? "y" : "ies"}</span>
        <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5">Posted {ago(j.postedAt)}</span>
        {j.deadline && <span className="rounded-full bg-amber-50 text-amber-800 px-2 py-0.5">Apply by {new Date(j.deadline).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-1 mt-auto">
        <LocalJobContactButtons jobId={j.id} canCall={j.canCall} canWhatsApp={j.canWhatsApp} size="sm" />
        <button onClick={onOpen} className="h-9 px-3 text-sm rounded-full border border-slate-300 dark:border-slate-700 hover:border-emerald-500" data-testid={`btn-view-${j.id}`}>View job details</button>
      </div>
    </article>
  );
}
