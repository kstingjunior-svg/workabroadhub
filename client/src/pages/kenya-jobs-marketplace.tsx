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
import { LocalJobContactButtons, ljUnlockJob } from "@/components/local-job-contact";
import { NearbyJobsExplorer } from "@/components/nearby-jobs-explorer";
import type { MapPoint } from "@/components/jobs-map";
import { formatKm } from "@/lib/geo";
import { KENYA_COUNTIES } from "@/lib/school-constants";
import { usePageSeo } from "@/hooks/use-page-seo";

const ClassicKenyaCareers = lazy(() => import("@/pages/kenya-careers"));

type Job = {
  id: string; title: string; description: string | null; vacancies: number; employmentType: string; category: string;
  salaryMin: number | null; salaryMax: number | null; salaryPeriod: string | null; county: string | null; town: string | null; estate: string | null;
  deadline: string | null; postedAt: string; badge: string; canCall: boolean; canWhatsApp: boolean; distanceKm: number | null;
  employer: { name: string; verified: boolean };
  lat?: number | null; lng?: number | null; locationMode?: string; serviceRadiusKm?: number | null;
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
    description: "Find local jobs near your estate or town in Kenya: shop attendants, drivers, waiters, security, cleaners and more. See the distance, view on a map, call or WhatsApp the employer.",
  });
  const cats = useQuery<any>({ queryKey: ["/api/lj/categories"], queryFn: () => getJson("/api/lj/categories"), refetchInterval: 60_000 });
  const catList = useMemo(() => (cats.data?.categories ?? []).map((c: any) => ({ id: c.slug, label: `${c.icon ?? ""} ${c.label}${c.jobs ? ` (${c.jobs})` : ""}` })), [cats.data]);
  const catLabel = (slug: string) => cats.data?.categories?.find((c: any) => c.slug === slug)?.label ?? slug;
  const [, navigate] = useLocation();
  const renderCard = (j: Job, d: string | null) => <JobCard j={{ ...j, distanceLabel: d } as any} cat={catLabel(j.category)} onOpen={() => navigate(`/kenya-careers/job/${j.id}`)} />;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-6xl mx-auto px-4 pt-16 sm:pt-8 pb-10 space-y-8">
        <NearbyJobsExplorer<Job> source="lj" categories={catList} defaultRadius={25}
          initialQuery={initial.get("search") ?? initial.get("q") ?? ""} initialCategory={initial.get("category") ?? "all"}
          title="Find Jobs Near You" subtitle="Real vacancies from shops, businesses and families across Kenya. See how far each job is and call or WhatsApp the employer directly."
          renderCard={renderCard} toPoint={ljToPoint} />

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

const ljToPoint = (j: Job): MapPoint | null => (j.lat == null || j.lng == null ? null : {
  id: j.id, lat: Number(j.lat), lng: Number(j.lng), title: j.title, employer: j.employer.name,
  place: [j.estate, j.town, j.county].filter(Boolean).join(", "), vacancies: j.vacancies, distance: formatKm(j.distanceKm),
  href: `/kenya-careers/job/${j.id}`,
});

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
        <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{[j.estate, j.town, j.county].filter(Boolean).join(", ")}{(j as any).distanceLabel ? ` · ${(j as any).distanceLabel}` : ""}{j.locationMode === "service_area" ? ` · covers ${j.serviceRadiusKm} km` : ""}</span>
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
        <LocalJobContactButtons jobId={j.id} canCall={j.canCall} canWhatsApp={j.canWhatsApp} size="sm" job={ljUnlockJob(j)} />
        <button onClick={onOpen} className="h-9 px-3 text-sm rounded-full border border-slate-300 dark:border-slate-700 hover:border-emerald-500" data-testid={`btn-view-${j.id}`}>View job details</button>
      </div>
    </article>
  );
}
