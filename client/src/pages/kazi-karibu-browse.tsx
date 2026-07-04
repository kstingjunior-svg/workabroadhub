/**
 * /kazi-karibu/browse — Browse live posts with county + category filters.
 * Public — anyone can browse without signing in.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Briefcase, MapPin, Loader2, Filter, ChevronRight, X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KAZI_KARIBU_CATEGORIES } from "@shared/kazi-karibu";

interface KaziKaribuPost {
  id: string;
  category: string;
  county: string;
  sub_county: string | null;
  title: string;
  description: string;
  budget_min_kes: number | null;
  budget_max_kes: number | null;
  budget_period: string | null;
  duration: string | null;
  poster_display_name: string | null;
  is_boosted: boolean;
  published_at: string;
}

// 47 Kenyan counties — for the filter dropdown. Simplified to a set the user
// can click through; matches what county field allows on submit.
const KENYAN_COUNTIES = [
  "Nairobi","Mombasa","Kisumu","Nakuru","Uasin Gishu","Kiambu","Kajiado","Machakos",
  "Kilifi","Kwale","Meru","Nyeri","Muranga","Kirinyaga","Embu","Tharaka Nithi",
  "Laikipia","Nyandarua","Trans Nzoia","Bungoma","Kakamega","Vihiga","Busia",
  "Siaya","Kisii","Nyamira","Migori","Homa Bay","Bomet","Kericho","Nandi",
  "Elgeyo Marakwet","Baringo","West Pokot","Turkana","Samburu","Isiolo","Marsabit",
  "Wajir","Mandera","Garissa","Tana River","Lamu","Taita Taveta","Makueni","Kitui","Narok",
];

function formatBudget(p: KaziKaribuPost): string {
  const min = p.budget_min_kes;
  const max = p.budget_max_kes;
  const period = p.budget_period;
  if (!min && !max) return "Negotiable";
  const periodLabel =
    period === "hour"    ? "/hour"    :
    period === "day"     ? "/day"     :
    period === "month"   ? "/month"   :
    period === "project" ? " flat"    : "";
  if (min && max && min !== max) {
    return `KES ${min.toLocaleString()}–${max.toLocaleString()}${periodLabel}`;
  }
  const single = min ?? max;
  return `KES ${single!.toLocaleString()}${periodLabel}`;
}

function timeAgo(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const mins = Math.floor((now - then) / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function KaziKaribuBrowse() {
  const [location] = useLocation();
  const params = useMemo(() => new URLSearchParams(location.split("?")[1] ?? ""), [location]);
  const [posts, setPosts] = useState<KaziKaribuPost[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState(params.get("category") ?? "");
  const [county, setCounty] = useState(params.get("county") ?? "");

  useEffect(() => {
    document.title = "Browse jobs — Kazi Karibu · WorkAbroad Hub";
  }, []);

  useEffect(() => {
    let ok = true;
    setLoading(true);
    const qs = new URLSearchParams();
    if (category) qs.set("category", category);
    if (county)   qs.set("county", county);
    qs.set("limit", "48");
    (async () => {
      try {
        const r = await fetch(`/api/kazi-karibu/posts?${qs}`);
        if (r.status === 404) { if (ok) { setPosts([]); setTotal(0); } return; }
        const body = await r.json();
        if (ok) { setPosts(body.posts ?? []); setTotal(body.total ?? 0); }
      } catch { if (ok) { setPosts([]); setTotal(0); } }
      finally { if (ok) setLoading(false); }
    })();
    return () => { ok = false; };
  }, [category, county]);

  const activeFilterCount = (category ? 1 : 0) + (county ? 1 : 0);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Browse jobs</h1>
              <p className="text-sm text-slate-500 mt-1">
                {loading ? "Loading…" : `${total} job${total === 1 ? "" : "s"} live`}
                {activeFilterCount > 0 && ` · ${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"} applied`}
              </p>
            </div>
            <Link href="/kazi-karibu/post">
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
                Post a job <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Filter className="h-4 w-4 text-slate-500" />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="text-sm border border-slate-300 dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-900"
            data-testid="filter-category"
          >
            <option value="">All categories</option>
            {KAZI_KARIBU_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          <select
            value={county}
            onChange={(e) => setCounty(e.target.value)}
            className="text-sm border border-slate-300 dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-900"
            data-testid="filter-county"
          >
            <option value="">All counties</option>
            {KENYAN_COUNTIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {activeFilterCount > 0 && (
            <button
              onClick={() => { setCategory(""); setCounty(""); }}
              className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1"
              data-testid="btn-clear-filters"
            >
              <X className="h-3 w-3" /> Clear filters
            </button>
          )}
        </div>

        {/* ── List ─────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          </div>
        ) : posts.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Briefcase className="h-10 w-10 text-slate-400 mx-auto mb-3" />
              <p className="text-slate-600 dark:text-slate-300 mb-1">No jobs match those filters right now.</p>
              <p className="text-sm text-slate-500">Try widening your search, or post a job yourself.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {posts.map((post) => (
              <Link key={post.id} href={`/kazi-karibu/job/${post.id}`}>
                <Card
                  className="cursor-pointer hover:border-emerald-400 hover:shadow-md transition h-full"
                  data-testid={`post-${post.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="text-xs uppercase font-semibold text-slate-500 dark:text-slate-400">
                        {KAZI_KARIBU_CATEGORIES.find(c => c.id === post.category)?.label ?? post.category}
                      </div>
                      {post.is_boosted && (
                        <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px]">Boosted</Badge>
                      )}
                    </div>
                    <div className="font-semibold text-slate-900 dark:text-white mb-1 line-clamp-2">{post.title}</div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mb-3 line-clamp-2">{post.description}</p>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {post.sub_county ? `${post.sub_county}, ${post.county}` : post.county}
                      </span>
                      <span className="text-slate-400">{timeAgo(post.published_at)}</span>
                    </div>
                    <div className="mt-2 text-sm text-emerald-700 dark:text-emerald-300 font-semibold">
                      {formatBudget(post)}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
