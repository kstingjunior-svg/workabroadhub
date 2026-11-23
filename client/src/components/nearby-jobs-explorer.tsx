/**
 * Location-first job discovery (2026-11) — shared by Kazi Karibu and the
 * Kenyan Jobs section. Type an estate/town/street or use your current
 * location, pick a radius, see real jobs around you with true distances,
 * as a list or on a map. Counters are live from the database.
 * Your coordinates go to our server in request bodies only and are never stored.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Crosshair, List, Map as MapIcon, Loader2, Search, X, MapPin } from "lucide-react";
import { LocationSearch } from "@/components/location-search";
import { JobsMap, type MapPoint } from "@/components/jobs-map";
import { getCurrentPosition, reverseGeocode, formatKm } from "@/lib/geo";

export type Origin = { lat: number; lng: number; label: string };
type Source = "lj" | "kk";
const EP: Record<Source, { search: string; stats: string; key: "jobs" | "posts" }> = {
  lj: { search: "/api/lj/search", stats: "/api/lj/stats-near", key: "jobs" },
  kk: { search: "/api/kazi-karibu/search", stats: "/api/kazi-karibu/stats-near", key: "posts" },
};
const RADII: [number | null, string][] = [[1, "1 km"], [5, "5 km"], [10, "10 km"], [25, "25 km"], [50, "50 km"], [null, "Anywhere in Kenya"]];
const post = async (url: string, body: any) => {
  const r = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.message || b?.error || `Request failed (${r.status})`);
  return b;
};

export function NearbyJobsExplorer<T extends { id: string }>({
  source, categories = [], defaultRadius = 10, renderCard, toPoint, title = "Find work near you", subtitle, initialQuery = "", initialCategory = "all", hero = true,
}: {
  source: Source; categories?: { id: string; label: string }[]; defaultRadius?: number | null;
  renderCard: (item: T, distance: string | null) => ReactNode; toPoint: (item: T) => MapPoint | null;
  title?: string; subtitle?: string; initialQuery?: string; initialCategory?: string; hero?: boolean;
}) {
  const ep = EP[source];
  const [q, setQ] = useState(initialQuery);
  const [qApplied, setQApplied] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [radius, setRadius] = useState<number | null>(defaultRadius);
  const [sort, setSort] = useState<string>("nearest");
  const [view, setView] = useState<"list" | "map">("list");
  const [gps, setGps] = useState<"idle" | "asking" | "denied" | "error">("idle");
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);

  useEffect(() => { if (!origin && sort === "nearest") setSort("newest"); if (origin && sort === "newest") setSort("nearest"); }, [origin]); // eslint-disable-line

  const filters = useMemo(() => ({
    q: qApplied || undefined, category, sort,
    origin: origin ? { lat: origin.lat, lng: origin.lng, label: origin.label } : undefined,
    radiusKm: origin ? (radius ?? "any") : "any",
  }), [qApplied, category, sort, origin, radius]);

  const stats = useQuery<any>({
    queryKey: [ep.stats, origin?.lat, origin?.lng, radius],
    queryFn: () => post(ep.stats, { origin: filters.origin, radiusKm: filters.radiusKm }),
    refetchInterval: 20_000, refetchOnWindowFocus: true,
  });
  const PAGE = 20;
  const results = useInfiniteQuery<any>({
    queryKey: [ep.search, filters],
    queryFn: ({ pageParam }) => post(ep.search, { ...filters, limit: PAGE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, all) => { const got = all.reduce((n, p) => n + (p[ep.key]?.length ?? 0), 0); return got < last.total ? got : undefined; },
    refetchInterval: 30_000, refetchOnWindowFocus: true,
  });
  const items: T[] = (results.data?.pages ?? []).flatMap((p: any) => p[ep.key] ?? []);
  const total: number = results.data?.pages?.[0]?.total ?? 0;
  const points = useMemo(() => items.map(toPoint).filter(Boolean) as MapPoint[], [items, toPoint]);

  async function useMyLocation() {
    setGps("asking"); setGpsMsg(null);
    try {
      const p = await getCurrentPosition();
      let label = "your location";
      try { const r = await reverseGeocode(p.lat, p.lng); label = r.estate ?? r.town ?? r.name ?? label; } catch (e: any) { setGpsMsg(e.message); }
      setOrigin({ lat: p.lat, lng: p.lng, label: label === "your location" ? label : `you (near ${label})` });
      setGps("idle");
    } catch (e: any) {
      setGps(e.code === "DENIED" ? "denied" : "error");
      setGpsMsg(e.code === "DENIED" ? "No problem — type your estate or town below instead." : `${e.message} Type your area below instead.`);
      setTimeout(() => document.querySelector<HTMLInputElement>('[data-testid="location-search-input"]')?.focus(), 50);
    }
  }
  const s = stats.data;
  const counters: [string, any][] = [
    [origin ? `In my area${radius ? ` (${radius} km)` : ""}` : "Jobs in my area", origin ? s?.sel : "—"],
    ["Within 5 km", origin ? s?.km5 : "—"], ["Within 10 km", origin ? s?.km10 : "—"], ["Within 25 km", origin ? s?.km25 : "—"],
    ["Active jobs in Kenya", s?.total],
  ];

  return (
    <div className="space-y-4">
      {hero && (
        <div className="rounded-2xl bg-gradient-to-br from-[#062a1f] via-[#0b3b2c] to-[#0f172a] p-4 sm:p-6 text-white">
          <h2 className="text-2xl sm:text-3xl font-extrabold !text-white" style={{ color: "#fff" }}>{title}</h2>
          {subtitle && <p className="text-slate-200 mt-1">{subtitle}</p>}
          <div className="mt-4 space-y-2">
            <button type="button" onClick={useMyLocation} className="w-full sm:w-auto h-14 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-base inline-flex items-center justify-center gap-2 tracking-wide" data-testid="btn-use-my-location">
              {gps === "asking" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Crosshair className="h-5 w-5" />} USE MY CURRENT LOCATION
            </button>
            {gpsMsg && <p className="text-sm text-amber-200" data-testid="gps-message">{gpsMsg}</p>}
            <div className="grid gap-2 sm:grid-cols-[1.2fr_1fr]">
              <LocationSearch onSelect={(p) => (p.types ?? []).includes("country") ? setOrigin(null) : setOrigin({ lat: p.lat, lng: p.lng, label: p.name })} placeholder="Or type your estate, town or street — e.g. Githurai 45" />
              <form onSubmit={(e) => { e.preventDefault(); setQApplied(q.trim()); }} className="flex items-center gap-2 bg-white rounded-xl px-3 h-14 text-slate-900">
                <Search className="h-5 w-5 text-slate-400 shrink-0" />
                <input value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => setQApplied(q.trim())} placeholder="What work? e.g. house help, driver" className="w-full outline-none text-base bg-transparent" data-testid="explorer-q" />
              </form>
            </div>
          </div>
        </div>
      )}

      {origin && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200 px-3 py-1.5"><MapPin className="h-4 w-4" />Searching around <b>{origin.label}</b>
            <button onClick={() => setOrigin(null)} aria-label="Clear location" className="ml-1"><X className="h-4 w-4" /></button></span>
        </div>
      )}

      {/* Radius + sort + view */}
      <div className="flex flex-wrap items-center gap-2">
        {origin && RADII.map(([r, l]) => (
          <button key={l} onClick={() => setRadius(r)} className={`h-10 px-3.5 rounded-full text-sm border ${radius === r ? "bg-emerald-600 text-white border-emerald-600" : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"}`} data-testid={`radius-${r ?? "any"}`}>{r ? `Within ${l}` : l}</button>
        ))}
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="h-10 rounded-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm" aria-label="Sort" data-testid="sort">
          {origin && <option value="nearest">Nearest first</option>}
          <option value="newest">Newest first</option><option value="vacancies">Most vacancies</option><option value="salary">Highest pay</option>
        </select>
        {categories.length > 0 && (
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-10 rounded-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm max-w-[200px]" aria-label="Category">
            <option value="all">All work</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        )}
        <div className="ml-auto inline-flex rounded-full border border-slate-300 dark:border-slate-700 overflow-hidden">
          <button onClick={() => setView("list")} className={`h-10 px-4 text-sm inline-flex items-center gap-1.5 ${view === "list" ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : ""}`} data-testid="view-list"><List className="h-4 w-4" />List</button>
          <button onClick={() => setView("map")} className={`h-10 px-4 text-sm inline-flex items-center gap-1.5 ${view === "map" ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : ""}`} data-testid="view-map"><MapIcon className="h-4 w-4" />Map</button>
        </div>
      </div>

      {/* Live counters */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {counters.map(([l, n], i) => (
          <div key={l} className={`rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 ${i === 4 ? "col-span-2 sm:col-span-1" : ""}`}>
            <div className="text-xs text-slate-500">{l}</div>
            <div className="text-2xl font-extrabold" data-testid={`counter-${i}`}>{n == null ? <Loader2 className="h-5 w-5 animate-spin" /> : typeof n === "number" ? n.toLocaleString() : n}</div>
          </div>
        ))}
      </div>

      <div className="text-sm text-slate-500">{results.isLoading ? "Searching…" : `${total} job${total === 1 ? "" : "s"}${origin ? (radius ? ` within ${radius} km of ${origin.label}` : ` — nearest to ${origin.label} first`) : ""}`}</div>

      {view === "map" ? (
        <div className="space-y-2">
          <JobsMap points={points} user={origin} radiusKm={origin ? radius : null} height="min(70vh, 560px)" />
          {points.length < items.length && <p className="text-xs text-slate-500">{items.length - points.length} job(s) don't have a map location yet and only show in the list.</p>}
        </div>
      ) : results.isLoading ? <div className="py-10 text-center"><Loader2 className="h-6 w-6 animate-spin inline" /></div>
        : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-slate-500">
            No jobs {origin && radius ? `within ${radius} km of ${origin.label}` : "match"} yet.{origin && radius && radius < 50 ? " Try a bigger distance." : ""} New jobs are added daily.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">{items.map((it: any) => <div key={it.id}>{renderCard(it, formatKm(it.distanceKm ?? it.distance_km))}</div>)}</div>
        )}
      {view === "list" && results.hasNextPage && (
        <button onClick={() => results.fetchNextPage()} className="w-full h-12 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold" disabled={results.isFetchingNextPage}>
          {results.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin inline" /> : "Show more jobs"}
        </button>
      )}
    </div>
  );
}
