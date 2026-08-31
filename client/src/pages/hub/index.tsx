/**
 * /hub — Global Work Visa Hub homepage.
 *
 * Warm, welcoming top-of-funnel. Two-question search ("dream job" + "destination")
 * that fires the AI plan generator, plus a scrollable grid of country cards. No
 * jargon, no bureaucracy — the whole page should feel like walking into a
 * friendly consultant's office.
 */
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePageSeo } from "@/hooks/use-page-seo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, MapPin, Sparkles, ArrowRight, Globe } from "lucide-react";

interface HubCountry {
  slug: string;
  name: string;
  iso2: string;
  flag_emoji: string;
  region: string;
  welcome_tagline: string;
  ease_score: number;
  avg_salary_kes_monthly: number;
  pathway_count: string;
}

interface PlanResponse {
  plan: {
    suitabilityScore: number;
    recommendedCountrySlug: string;
    recommendedCountryName: string;
    narrativePlan: string;
    topThreeCountries: Array<{ slug: string; name: string; flag: string; whyThisFits: string; matchScore: number }>;
    gapsToClose: Array<{ item: string; whyItMatters: string; howLong: string }>;
  };
  signedIn: boolean;
}

export default function HubHomepage() {
  usePageSeo({
    title:       "Work Abroad Visa Hub — the kind, human way to plan your move | WorkAbroadHub",
    description: "Tell us your dream job and where you'd like to land. Get a personalized migration plan for Germany, Canada, Australia, New Zealand, UAE, or Sweden — with your visa suitability score and the exact next steps.",
    path:        "/hub",
    keywords:    ["work visa kenya", "germany opportunity card kenya", "canada express entry kenya", "australia skilled visa kenya", "uae work permit kenya"],
  });

  const [, navigate] = useLocation();
  const [occupation, setOccupation]         = useState("");
  const [destination, setDestination]       = useState("");
  const [plan, setPlan]                     = useState<PlanResponse["plan"] | null>(null);

  const { data, isLoading } = useQuery<{ countries: HubCountry[] }>({
    queryKey: ["/api/hub/countries"],
    staleTime: 5 * 60_000,
  });
  const countries = data?.countries ?? [];

  const planMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/hub/plan", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occupation: occupation.trim(),
          targetCountrySlug: destination.trim() || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.message ?? "We couldn't build your plan right now.");
      return j as PlanResponse;
    },
    onSuccess: (r) => setPlan(r.plan),
  });

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #FEF9F1 0%, #F1F6FB 60%, #FEF9F1 100%)" }}>
      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-14 sm:pt-20 pb-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-orange-500" />
          <span className="text-xs font-semibold tracking-widest text-orange-700 uppercase">Global Work Visa Hub</span>
        </div>
        <h1 className="text-4xl sm:text-6xl font-serif font-bold tracking-tight text-slate-800" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
          Where does your journey begin?
        </h1>
        <p className="mt-5 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Tell us your dream job and where you'd like to land. We'll walk with you from your first question to your first day at work abroad — no bureaucracy, no jargon.
        </p>
      </section>

      {/* Search card */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-10">
        <Card className="rounded-3xl border-0 shadow-xl shadow-orange-100/40">
          <CardContent className="p-6 sm:p-8 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Your dream job</label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                  placeholder="e.g. I'm a registered nurse from Nairobi"
                  className="pl-11 h-12 rounded-2xl border-slate-200 focus:border-orange-400"
                  data-testid="hub-input-occupation"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Where would you like to land? <span className="text-slate-400 normal-case font-normal">— optional</span></label>
              <div className="relative">
                <Globe className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="e.g. Germany, or leave blank and we'll suggest"
                  className="pl-11 h-12 rounded-2xl border-slate-200 focus:border-orange-400"
                  data-testid="hub-input-destination"
                />
              </div>
            </div>
            <Button
              onClick={() => planMutation.mutate()}
              disabled={planMutation.isPending || occupation.trim().length < 2}
              className="w-full h-12 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-semibold text-base shadow-lg shadow-orange-200/50 gap-2"
              data-testid="hub-button-plan"
            >
              {planMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Building your plan…</> : <>Show me my options <ArrowRight className="h-4 w-4" /></>}
            </Button>
            {planMutation.isError && (
              <p className="text-sm text-red-600 text-center">
                {(planMutation.error as Error)?.message}
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      {/* AI plan result */}
      {plan && (
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-12">
          <Card className="rounded-3xl border-emerald-200 bg-gradient-to-br from-emerald-50 to-white shadow-lg" data-testid="hub-plan-result">
            <CardContent className="p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="rounded-full bg-emerald-500 text-white text-lg font-bold h-14 w-14 flex items-center justify-center">
                  {plan.suitabilityScore}
                </div>
                <div>
                  <div className="text-xs font-semibold tracking-widest text-emerald-700 uppercase">Your Suitability Score</div>
                  <div className="text-lg font-bold text-slate-800">
                    You match {plan.suitabilityScore}% of what {plan.recommendedCountryName} is looking for
                  </div>
                </div>
              </div>
              <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{plan.narrativePlan}</p>

              {plan.gapsToClose.length > 0 && (
                <div className="mt-6 space-y-2">
                  <div className="text-xs font-semibold tracking-widest text-slate-500 uppercase">Here's what would take you to 100%</div>
                  {plan.gapsToClose.map((g, i) => (
                    <div key={i} className="rounded-2xl bg-white border border-slate-100 p-4">
                      <div className="font-semibold text-slate-800">{g.item}</div>
                      <div className="text-sm text-slate-600 mt-1">{g.whyItMatters}</div>
                      <div className="text-xs text-orange-700 font-medium mt-1">Typically {g.howLong}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 flex gap-3">
                <Link href={`/hub/countries/${plan.recommendedCountrySlug}`}>
                  <Button className="rounded-2xl bg-slate-800 hover:bg-slate-900 text-white gap-2" data-testid="hub-cta-country">
                    See the full {plan.recommendedCountryName} journey <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {plan.topThreeCountries.length > 0 && (
            <div className="mt-6">
              <div className="text-xs font-semibold tracking-widest text-slate-500 uppercase mb-3 px-1">Other countries that fit you</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {plan.topThreeCountries.map((t) => (
                  <Link key={t.slug} href={`/hub/countries/${t.slug}`}>
                    <Card className="rounded-2xl border-slate-100 hover:border-orange-300 transition cursor-pointer h-full">
                      <CardContent className="p-4">
                        <div className="text-3xl mb-2">{t.flag}</div>
                        <div className="font-bold text-slate-800">{t.name}</div>
                        <div className="text-xs text-emerald-700 font-semibold mt-1">Match: {t.matchScore}%</div>
                        <div className="text-sm text-slate-600 mt-2 leading-snug">{t.whyThisFits}</div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Country grid — always visible */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>Explore countries</h2>
          <span className="text-xs text-slate-500">{countries.length} welcoming Kenyans right now</span>
        </div>
        {isLoading ? (
          <div className="py-12 text-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading countries…</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {countries.map((c) => (
              <Link key={c.slug} href={`/hub/countries/${c.slug}`}>
                <Card
                  className="rounded-3xl border-0 shadow-md hover:shadow-2xl transition-all duration-300 cursor-pointer h-full overflow-hidden group"
                  data-testid={`hub-country-card-${c.slug}`}
                >
                  <div className="h-2" style={{ background: "linear-gradient(90deg, #fdba74 0%, #fcd34d 100%)" }} />
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="text-5xl leading-none group-hover:scale-110 transition-transform origin-left">{c.flag_emoji}</div>
                      <Badge className="bg-emerald-100 text-emerald-800 border-0 rounded-full font-medium text-xs">
                        Doors open here
                      </Badge>
                    </div>
                    <h3 className="text-xl font-bold text-slate-800">{c.name}</h3>
                    <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                      <MapPin className="h-3 w-3" /> {c.region}
                    </div>
                    <p className="text-sm text-slate-600 mt-3 leading-relaxed line-clamp-3 min-h-[3.75rem]">{c.welcome_tagline}</p>
                    <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                      <span>{c.pathway_count} pathway{Number(c.pathway_count) === 1 ? "" : "s"}</span>
                      <span className="text-orange-700 font-semibold group-hover:translate-x-1 transition-transform">Explore →</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Warm footer */}
      <section className="bg-white/60 border-t border-orange-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 text-center">
          <p className="text-slate-600 leading-relaxed">
            This isn't paperwork. It's a plan. We'll walk with you from your first question to your first day at work abroad.
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <Link href="/hub/tracker">
              <Button variant="outline" className="rounded-2xl border-orange-300 text-orange-700 hover:bg-orange-50 gap-2">
                Open my journey tracker <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
