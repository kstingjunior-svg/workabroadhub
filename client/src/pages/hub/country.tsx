/**
 * /hub/countries/:slug — Country Profile.
 *
 * Warm hero + Suitability meter + step-by-step river-stone journey. Each step
 * is a curved card that shows a plain-language description, days/cost estimates,
 * and a docs pill that expands. Bottom CTAs: start journey (creates a
 * hub_user_journeys row) or talk to Nanjila.
 */
import { useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePageSeo } from "@/hooks/use-page-seo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, CheckCircle2, Clock, Coins, FileText, ExternalLink, ChevronDown, ChevronUp, ArrowRight, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Country {
  slug: string; name: string; iso2: string; flag_emoji: string;
  region: string; welcome_tagline: string; ease_score: number;
  currency: string; avg_salary_kes_monthly: number;
  official_languages: string[]; has_shortage_list: boolean; shortage_list_url: string | null;
}

interface VisaType {
  id: string; code: string; name: string; traveler_friendly_name: string;
  category: string; traveler_benefit: string;
  processing_days_min: number; processing_days_max: number; fee_kes: number;
  employer_sponsor_required: boolean; min_salary_local: number | null;
  points_based_threshold: number | null; post_arrival_work_permit: boolean;
}

interface ChecklistStep {
  step_order: number; step_title: string; step_gentle_description: string;
  required_documents: Array<{ name: string; source?: string; note?: string }>;
  estimated_days_min: number; estimated_days_max: number; estimated_cost_kes: number;
  can_parallelize: boolean; depends_on_step_orders: number[]; external_url: string;
}

interface ProfileResponse {
  country: Country;
  visaTypes: VisaType[];
  primaryChecklist: ChecklistStep[];
}

export default function HubCountryPage() {
  const [, params] = useRoute("/hub/countries/:slug");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const slug = params?.slug ?? "";

  const [selectedVisaCode, setSelectedVisaCode] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps]       = useState<Set<number>>(new Set());

  const { data, isLoading, error } = useQuery<ProfileResponse>({
    queryKey: [`/api/hub/countries/${slug}`],
    enabled: !!slug,
    staleTime: 5 * 60_000,
  });

  const chosenVisaCode = selectedVisaCode ?? data?.visaTypes[0]?.code;
  const { data: altChecklist } = useQuery<{ steps: ChecklistStep[]; visaName: string; travelerFriendlyName: string }>({
    queryKey: [`/api/hub/countries/${slug}/visa/${chosenVisaCode}/checklist`],
    enabled: !!chosenVisaCode && chosenVisaCode !== data?.visaTypes[0]?.code,
    staleTime: 5 * 60_000,
  });

  const steps = selectedVisaCode && selectedVisaCode !== data?.visaTypes[0]?.code
    ? (altChecklist?.steps ?? [])
    : (data?.primaryChecklist ?? []);

  const startJourney = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/hub/journeys", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visaCode: chosenVisaCode }),
      });
      const j = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          const back = `/hub/countries/${slug}`;
          try { localStorage.setItem("auth_redirect", back); } catch {}
          navigate(`/?redirect=${encodeURIComponent(back)}`);
          throw new Error("Please sign in to start your journey.");
        }
        throw new Error(j?.message ?? "Could not start your journey.");
      }
      return j;
    },
    onSuccess: () => {
      toast({ title: "Journey started", description: "Every step you tick off updates your tracker." });
      navigate("/hub/tracker");
    },
    onError: (e: any) => toast({ title: "Not started yet", description: e?.message ?? "Try again", variant: "destructive" }),
  });

  usePageSeo({
    title:       data ? `${data.country.name} Work Visa Journey — step-by-step | WorkAbroadHub` : "Country journey — WorkAbroadHub",
    description: data ? `Complete journey for Kenyans moving to ${data.country.name}: visa options, step-by-step checklist, costs, and processing times. Kind, human guidance.` : "",
    path:        `/hub/countries/${slug}`,
  });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div>;
  if (error || !data) return <div className="min-h-screen flex items-center justify-center text-slate-500">This country isn't ready yet. <Link href="/hub"><a className="ml-1 underline">Back to Hub</a></Link></div>;

  const { country, visaTypes } = data;
  const chosenVisa = visaTypes.find((v) => v.code === chosenVisaCode) ?? visaTypes[0];

  const toggleStep = (n: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      next.has(n) ? next.delete(n) : next.add(n);
      return next;
    });
  };

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #FEF9F1 0%, #FEFBF6 100%)" }}>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${heroTintForIso(country.iso2)} 0%, #FEF3C7 100%)`, opacity: 0.35 }} />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-12 pb-8 sm:pt-16 sm:pb-12">
          <div className="flex items-center gap-2 text-sm text-slate-600 mb-4">
            <Link href="/hub"><a className="hover:text-orange-700">Hub</a></Link>
            <span>/</span>
            <span className="text-slate-800 font-medium">{country.name}</span>
          </div>
          <div className="flex items-start gap-4">
            <div className="text-6xl sm:text-7xl">{country.flag_emoji}</div>
            <div className="flex-1">
              <h1 className="text-3xl sm:text-5xl font-serif font-bold text-slate-800" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
                {country.name}
              </h1>
              <div className="mt-1 text-sm text-slate-500 flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5" /> {country.region}
                {country.official_languages?.length > 0 && <span>· Speaks {country.official_languages.join(", ")}</span>}
              </div>
              <p className="mt-4 text-slate-700 text-base sm:text-lg leading-relaxed max-w-2xl">
                {country.welcome_tagline}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Suitability meter + gaps */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <Card className="rounded-3xl border-0 shadow-lg overflow-hidden">
          <CardContent className="p-0">
            <div className="grid grid-cols-1 md:grid-cols-3">
              <div className="p-8 bg-gradient-to-br from-emerald-50 to-white flex flex-col items-center justify-center text-center md:border-r border-slate-100">
                <div className="relative w-32 h-32">
                  <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    <circle cx="50" cy="50" r="42" strokeWidth="10" stroke="#dcfce7" fill="none" />
                    <circle cx="50" cy="50" r="42" strokeWidth="10" stroke="#10b981" fill="none"
                      strokeDasharray={`${(country.ease_score / 100) * 264} 264`} strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="text-3xl font-bold text-emerald-700">{country.ease_score}</div>
                    <div className="text-xs text-emerald-600 uppercase tracking-wider font-semibold">Ease</div>
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-600 max-w-[14rem]">
                  Kenyans typically find {country.name} welcoming — this is the country's overall ease score.
                </p>
              </div>
              <div className="p-8 md:col-span-2 space-y-4">
                <div>
                  <div className="text-xs font-semibold tracking-widest text-slate-500 uppercase">Get a personal match score</div>
                  <p className="text-slate-700 mt-1">
                    Take 20 seconds on the <Link href="/hub"><a className="text-orange-700 underline font-medium">Hub homepage</a></Link> and we'll tell you exactly how much of {country.name}'s requirements you already meet — plus the shortest path to 100%.
                  </p>
                </div>
                {country.has_shortage_list && country.shortage_list_url && (
                  <a
                    href={country.shortage_list_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-blue-700 hover:underline"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> {country.name} publishes an official occupational shortage list — check if you're on it
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Visa pathway chips */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-4">
        <div className="text-xs font-semibold tracking-widest text-slate-500 uppercase mb-3 px-1">Pick a pathway</div>
        <div className="flex flex-wrap gap-2">
          {visaTypes.map((v) => (
            <button
              key={v.code}
              onClick={() => setSelectedVisaCode(v.code)}
              className={`px-4 py-2.5 rounded-full text-sm font-medium transition ${
                (chosenVisa?.code ?? "") === v.code
                  ? "bg-orange-500 text-white shadow"
                  : "bg-white text-slate-700 border border-slate-200 hover:border-orange-300"
              }`}
              data-testid={`hub-visa-chip-${v.code}`}
            >
              {v.traveler_friendly_name}
            </button>
          ))}
        </div>
        {chosenVisa && (
          <p className="text-sm text-slate-600 mt-4 max-w-3xl leading-relaxed">
            <span className="font-semibold text-slate-800">{chosenVisa.name} —</span> {chosenVisa.traveler_benefit}
          </p>
        )}
      </section>

      {/* Journey — river-stone timeline */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="text-xs font-semibold tracking-widest text-slate-500 uppercase mb-4 px-1">Your journey, step by step</div>
        <div className="space-y-4">
          {steps.length === 0 && (
            <div className="text-center py-8 text-slate-500">Loading steps…</div>
          )}
          {steps.map((s) => {
            const isOpen = expandedSteps.has(s.step_order);
            const canDoNow = (s.depends_on_step_orders?.length ?? 0) === 0;
            return (
              <Card
                key={s.step_order}
                className={`rounded-3xl border-0 shadow-md overflow-hidden ${canDoNow ? "" : "opacity-80"}`}
                data-testid={`hub-step-${s.step_order}`}
              >
                <CardContent className="p-0">
                  <div className="p-5 sm:p-6">
                    <div className="flex items-start gap-4">
                      <div className={`flex-shrink-0 h-12 w-12 rounded-full flex items-center justify-center font-bold text-lg ${canDoNow ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-500"}`}>
                        {s.step_order}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-bold text-slate-800">{s.step_title}</h3>
                        <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{s.step_gentle_description}</p>
                        <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
                          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-slate-400" /> {s.estimated_days_min}–{s.estimated_days_max} days</span>
                          {s.estimated_cost_kes > 0 && <span className="inline-flex items-center gap-1"><Coins className="h-3.5 w-3.5 text-slate-400" /> ~KES {s.estimated_cost_kes.toLocaleString()}</span>}
                          {s.can_parallelize && <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Can run in parallel</span>}
                          {!canDoNow && <span className="text-amber-700">Wait for step {s.depends_on_step_orders.join(", ")}</span>}
                        </div>
                        {(s.required_documents?.length ?? 0) > 0 && (
                          <button
                            onClick={() => toggleStep(s.step_order)}
                            className="mt-3 inline-flex items-center gap-1.5 text-sm text-orange-700 hover:text-orange-800 font-medium"
                            data-testid={`hub-step-docs-toggle-${s.step_order}`}
                          >
                            <FileText className="h-4 w-4" />
                            {s.required_documents.length} document{s.required_documents.length === 1 ? "" : "s"} to prepare
                            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                        )}
                      </div>
                    </div>
                    {isOpen && s.required_documents?.length > 0 && (
                      <div className="mt-4 ml-16 space-y-2">
                        {s.required_documents.map((d, i) => (
                          <div key={i} className="p-3 rounded-2xl bg-slate-50 text-sm">
                            <div className="font-medium text-slate-800">{d.name}</div>
                            {d.source && <div className="text-xs text-slate-500 mt-0.5">From: {d.source}</div>}
                            {d.note && <div className="text-xs text-slate-600 mt-0.5">{d.note}</div>}
                          </div>
                        ))}
                        {s.external_url && (
                          <a href={s.external_url} target="_blank" rel="noopener noreferrer"
                             className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline">
                            Official portal <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Footer CTA */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <Card className="rounded-3xl border-0 bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-xl">
          <CardContent className="p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
            <div>
              <div className="text-2xl font-bold" style={{ fontFamily: "Georgia, serif" }}>Ready to start your {country.name} journey?</div>
              <p className="text-white/90 mt-1">Free to start. We'll track every step and nudge you if you're falling behind pace.</p>
            </div>
            <div className="flex gap-3 flex-shrink-0">
              <Button
                onClick={() => startJourney.mutate()}
                disabled={startJourney.isPending}
                className="rounded-2xl bg-white text-orange-700 hover:bg-orange-50 font-semibold gap-2"
                data-testid="hub-start-journey"
              >
                {startJourney.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Starting…</> : <>Start my {country.name} journey <ArrowRight className="h-4 w-4" /></>}
              </Button>
              <Link href="/services">
                <Button variant="outline" className="rounded-2xl border-white/40 text-white hover:bg-white/10">
                  Talk to Nanjila
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

/** A soft pastel wash keyed to the ISO2 code, used behind the country hero. */
function heroTintForIso(iso2: string): string {
  const map: Record<string, string> = {
    DE: "#FFD7A6", CA: "#FCA5A5", AU: "#93C5FD", NZ: "#86EFAC", AE: "#FDE68A", SE: "#BFDBFE",
  };
  return map[iso2] ?? "#FFE4B5";
}
