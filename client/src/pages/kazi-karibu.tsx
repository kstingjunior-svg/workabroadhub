/**
 * /kazi-karibu — Landing page (Phase 1)
 *
 * The public entry point for the individual-employer job-posting surface.
 * Hero, "How it works" strip, transparent 3-tier pricing (24h / 30d / 365d),
 * category grid, latest live posts preview, and dual CTAs for browsing +
 * posting. See docs/kazi-karibu/STRATEGY.md.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  Briefcase, MapPin, Sparkles, ShieldCheck, Clock, ChevronRight, Loader2,
  Home, Wrench, Truck, GraduationCap, Utensils, Sprout, Brush, ShieldQuestion,
  Trash2,
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
  /** 2026-07: server-computed flag — true when the current viewer posted it. */
  is_mine?: boolean;
}

const CATEGORY_ICONS: Record<string, any> = {
  house_help:        Home,
  cleaner:           Brush,
  cook_caterer:      Utensils,
  driver:            Truck,
  fundi_mason:       Wrench,
  fundi_plumber:     Wrench,
  fundi_electrician: Wrench,
  fundi_painter:     Wrench,
  fundi_carpenter:   Wrench,
  delivery_errand:   Truck,
  security_guard:    ShieldQuestion,
  gardener:          Sprout,
  tutor:             GraduationCap,
  event_promoter:    Sparkles,
};

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

export default function KaziKaribu() {
  const [posts, setPosts] = useState<KaziKaribuPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Kazi Karibu — Local jobs near you · WorkAbroad Hub";
    let ok = true;
    (async () => {
      try {
        // credentials so the session cookie rides along and the server can
        // compute is_mine for the current viewer.
        const r = await fetch("/api/kazi-karibu/posts?limit=6", { credentials: "include" });
        if (r.status === 404) { if (ok) { setPosts([]); setLoading(false); } return; }
        const body = await r.json();
        if (ok) setPosts(body.posts ?? []);
      } catch { /* silent — landing renders fine without previews */ }
      finally { if (ok) setLoading(false); }
    })();
    return () => { ok = false; };
  }, []);

  // 2026-07: inline delete from the "Latest jobs" strip. Only rendered on
  // cards where the server flagged is_mine=true. Stops propagation so the
  // enclosing card <Link> doesn't navigate to the detail page mid-click.
  async function deletePost(e: React.MouseEvent, postId: string, postTitle: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Remove "${postTitle}"? Applicants will no longer see it or be able to contact you about this post.`)) return;
    setDeletingId(postId);
    try {
      const r = await fetch(`/api/kazi-karibu/posts/${postId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (r.ok) {
        setPosts(prev => prev.filter(p => p.id !== postId));
      } else {
        const body = await r.json().catch(() => ({}));
        alert(body?.error ?? `Could not remove (${r.status})`);
      }
    } catch (err: any) {
      alert(err?.message ?? "Network error");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-white dark:from-emerald-950/20 dark:via-slate-950 dark:to-slate-950">
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 pt-12 pb-16 md:pt-20 md:pb-24">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 px-3 py-1 text-xs font-medium mb-4">
              <Sparkles className="h-3.5 w-3.5" />
              <span>New on WorkAbroad Hub</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-bold text-slate-900 dark:text-white leading-tight">
              Kazi Karibu
              <span className="block text-2xl md:text-3xl font-semibold text-emerald-700 dark:text-emerald-300 mt-2">
                Jobs you can start tomorrow
              </span>
            </h1>
            <p className="mt-5 text-lg md:text-xl text-slate-600 dark:text-slate-300 leading-relaxed">
              House helps, fundis, cooks, drivers, tutors — real posts from real Kenyans, close to home.
              Every post is phone-verified, moderated, and paid for by the poster so applicants apply free.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/kazi-karibu/browse">
                <Button size="lg" className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md" data-testid="btn-hero-browse">
                  <Briefcase className="h-5 w-5 mr-2" /> Browse jobs near you
                </Button>
              </Link>
              <Link href="/kazi-karibu/post">
                <Button size="lg" variant="outline" className="border-emerald-600 text-emerald-700 dark:text-emerald-300 dark:border-emerald-500" data-testid="btn-hero-post">
                  Post a job
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
              Applying is free. Posting starts at KES 100. First post is on us.
            </p>
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid md:grid-cols-3 gap-4">
          <Card className="border-emerald-200/60 dark:border-emerald-800/50">
            <CardContent className="p-5">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 mb-3">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Verified posters</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Every post is tied to a phone-verified Kenyan account. Fake posts get rejected before they go live.
              </p>
            </CardContent>
          </Card>
          <Card className="border-emerald-200/60 dark:border-emerald-800/50">
            <CardContent className="p-5">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 mb-3">
                <Sparkles className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Nanjila reviews each post</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Our AI moderator checks every listing for scam patterns and clarity before publication.
              </p>
            </CardContent>
          </Card>
          <Card className="border-emerald-200/60 dark:border-emerald-800/50">
            <CardContent className="p-5">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 mb-3">
                <Clock className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Free to apply, always</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Applicants never pay. Any post asking for money from the applicant is auto-rejected.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── Categories ─────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Popular categories</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {KAZI_KARIBU_CATEGORIES.map((cat) => {
            const Icon = CATEGORY_ICONS[cat.id] ?? Briefcase;
            return (
              <Link key={cat.id} href={`/kazi-karibu/browse?category=${cat.id}`}>
                <div
                  className="group cursor-pointer p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-400 dark:hover:border-emerald-600 hover:shadow-sm transition"
                  data-testid={`cat-${cat.id}`}
                >
                  <Icon className="h-6 w-6 text-emerald-600 dark:text-emerald-400 mb-2" />
                  <div className="text-sm font-medium text-slate-900 dark:text-white">{cat.label}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── Latest posts preview ───────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Latest jobs</h2>
          <Link href="/kazi-karibu/browse">
            <Button variant="ghost" size="sm" className="text-emerald-700 dark:text-emerald-300">
              See all <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          </div>
        ) : posts.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-slate-500">
              No jobs posted yet. <Link href="/kazi-karibu/post"><span className="text-emerald-700 dark:text-emerald-300 font-medium underline">Be the first to post</span></Link> — first post is free.
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {posts.map((post) => {
              const Icon = CATEGORY_ICONS[post.category] ?? Briefcase;
              return (
                <Link key={post.id} href={`/kazi-karibu/job/${post.id}`}>
                  <Card className="cursor-pointer hover:border-emerald-400 hover:shadow-md transition h-full" data-testid={`post-${post.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3 mb-2">
                        <Icon className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-900 dark:text-white line-clamp-2">{post.title}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-1">
                            <MapPin className="h-3 w-3" />
                            {post.sub_county ? `${post.sub_county}, ${post.county}` : post.county}
                          </div>
                        </div>
                        {post.is_boosted && (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-300 shrink-0">Boosted</Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm text-emerald-700 dark:text-emerald-300 font-semibold">
                          {formatBudget(post)}
                        </div>
                        {/* 2026-07: inline delete for the poster.
                            Rendered only when the server flagged is_mine=true. */}
                        {post.is_mine && (
                          <button
                            type="button"
                            onClick={(e) => deletePost(e, post.id, post.title)}
                            disabled={deletingId === post.id}
                            className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded border border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-900/20 disabled:opacity-60"
                            data-testid={`btn-delete-landing-${post.id}`}
                            aria-label="I've hired — remove this post"
                          >
                            {deletingId === post.id ? (
                              <><Loader2 className="h-3 w-3 animate-spin" /> Removing…</>
                            ) : (
                              <><Trash2 className="h-3 w-3" /> Delete</>
                            )}
                          </button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Pricing (posters only) ────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Simple posting fees</h2>
          <p className="text-slate-600 dark:text-slate-300 mt-2">
            Applicants apply free. Posters pay once per post.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-4 max-w-4xl mx-auto">
          <Card className="border-2 border-emerald-500 relative">
            <div className="absolute -top-3 left-4">
              <Badge className="bg-emerald-600 text-white">First post FREE</Badge>
            </div>
            <CardContent className="p-6">
              <div className="text-xs uppercase font-semibold text-emerald-700 mb-1">Standard</div>
              <div className="text-3xl font-bold text-slate-900 dark:text-white">KES 100</div>
              <div className="text-sm text-slate-500 mb-4">per post · 7 days live</div>
              <ul className="text-sm space-y-1.5 text-slate-700 dark:text-slate-300">
                <li>• Phone-verified poster</li>
                <li>• Automated + AI moderation</li>
                <li>• 7 days publication</li>
                <li>• Applicant profiles shared with you</li>
              </ul>
            </CardContent>
          </Card>
          <Card className="opacity-70">
            <CardContent className="p-6">
              <div className="text-xs uppercase font-semibold text-amber-600 mb-1">Boost <Badge variant="outline" className="ml-1 text-xs">Phase 2</Badge></div>
              <div className="text-3xl font-bold text-slate-900 dark:text-white">KES 500</div>
              <div className="text-sm text-slate-500 mb-4">per post · 7 days pinned</div>
              <ul className="text-sm space-y-1.5 text-slate-700 dark:text-slate-300">
                <li>• Everything in Standard</li>
                <li>• Top of category for 7 days</li>
                <li>• "Boosted" badge</li>
              </ul>
            </CardContent>
          </Card>
          <Card className="opacity-70">
            <CardContent className="p-6">
              <div className="text-xs uppercase font-semibold text-purple-600 mb-1">Verified badge <Badge variant="outline" className="ml-1 text-xs">Phase 2</Badge></div>
              <div className="text-3xl font-bold text-slate-900 dark:text-white">KES 1,000</div>
              <div className="text-sm text-slate-500 mb-4">one-time · sticks to account</div>
              <ul className="text-sm space-y-1.5 text-slate-700 dark:text-slate-300">
                <li>• ID + selfie KYC</li>
                <li>• Verified badge on every post</li>
                <li>• Higher applicant trust</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── Bottom CTA ────────────────────────────────────────────────── */}
      <section className="bg-emerald-600 dark:bg-emerald-900/40">
        <div className="max-w-4xl mx-auto px-4 py-14 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">Need help around the house or with a project?</h2>
          <p className="text-emerald-50 mb-6">Post in 2 minutes. First post is free. Applicants apply immediately.</p>
          <Link href="/kazi-karibu/post">
            <Button size="lg" className="bg-white text-emerald-700 hover:bg-emerald-50">
              Post a job now <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
