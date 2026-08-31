/**
 * /hub/tracker — Journey progress dashboard.
 *
 * One horizontal rail per active journey. Completed stones = sage green,
 * current step glows apricot orange, future stones = dust gray. Clicking a
 * stone reveals per-step actions. Personal greeting reflects the joined
 * user_journeys data ("6 steps into Germany and 2 into Canada").
 */
import { useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePageSeo } from "@/hooks/use-page-seo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, ArrowRight, Check, Circle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

interface Journey {
  id: string;
  country_slug: string; country_name: string; flag_emoji: string; iso2: string;
  visa_name: string; traveler_friendly_name: string; visa_code: string;
  status: string;
  current_step_order: number;
  steps_completed: Record<string, { doneAt: string }>;
  suitability_score: number | null;
  target_submit_date: string | null;
  total_steps: string;
  updated_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  exploring:              "still exploring",
  gathering_docs:         "gathering your documents",
  credentials_in_review:  "credentials being reviewed",
  language_test_booked:   "language test booked",
  job_search:             "searching for a role",
  submitted:              "we've submitted — waiting on the consulate",
  biometrics_done:        "biometrics done, waiting on decision",
  decision_pending:       "decision pending",
  approved:               "approved — congratulations",
  refused:                "refused (let's talk)",
  appealing:              "appealing the decision",
  paused:                 "paused",
};

export default function HubTracker() {
  usePageSeo({
    title:       "Your Journey Tracker — WorkAbroadHub",
    description: "Track every step of your work-abroad journey. See where you are with each country, what's next, and what's due when.",
    path:        "/hub/tracker",
  });

  const { user, isLoading: authLoading } = useAuth() as any;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery<{ journeys: Journey[] }>({
    queryKey: ["/api/hub/journeys"],
    enabled: !!user,
    staleTime: 30_000,
  });

  const stepMutation = useMutation({
    mutationFn: async ({ journeyId, stepOrder, done }: { journeyId: string; stepOrder: number; done: boolean }) => {
      const res = await fetch(`/api/hub/journeys/${journeyId}/step`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepOrder, done }),
      });
      if (!res.ok) throw new Error("Could not update step.");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/hub/journeys"] }),
    onError: (e: any) => toast({ title: "Not saved", description: e?.message ?? "Try again", variant: "destructive" }),
  });

  const greeting = useMemo(() => {
    const journeys = data?.journeys ?? [];
    if (journeys.length === 0) return null;
    const summaries = journeys.slice(0, 3).map((j) => {
      const done = Object.keys(j.steps_completed ?? {}).length;
      return `${done} step${done === 1 ? "" : "s"} into your ${j.country_name} journey`;
    });
    const first = user?.firstName ?? "there";
    if (journeys.length === 1) return `Welcome back, ${first} — you're ${summaries[0]}.`;
    if (journeys.length === 2) return `Welcome back, ${first} — you're ${summaries[0]} and ${summaries[1].replace(" your ", " your ").replace("journey", "backup plan")}.`;
    return `Welcome back, ${first} — you have ${journeys.length} journeys in motion.`;
  }, [data, user]);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div>;
  if (!user) {
    // Redirect anon users to sign in, then bounce back to the tracker
    try { localStorage.setItem("auth_redirect", "/hub/tracker"); } catch {}
    navigate("/?redirect=/hub/tracker");
    return null;
  }

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #FEF9F1 0%, #FEFBF6 100%)" }}>
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-12 pb-6">
        <div className="text-xs font-semibold tracking-widest text-orange-700 uppercase mb-2">Your Journey Tracker</div>
        <h1 className="text-3xl sm:text-4xl font-serif font-bold text-slate-800" style={{ fontFamily: "Georgia, serif" }}>
          {greeting ?? `Welcome, ${user?.firstName ?? "traveler"}`}
        </h1>
        {!greeting && (
          <p className="mt-3 text-slate-600 leading-relaxed max-w-2xl">
            You haven't started a journey yet. Pick a country to begin — we'll track every step so you always know exactly what's next.
          </p>
        )}
      </section>

      {isLoading && (
        <div className="text-center py-10 text-slate-500"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading your journeys…</div>
      )}

      {!isLoading && (data?.journeys ?? []).length === 0 && (
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-12">
          <Card className="rounded-3xl border-0 shadow-md">
            <CardContent className="p-8 text-center">
              <div className="text-5xl mb-3">🌍</div>
              <h2 className="text-xl font-bold text-slate-800">No journeys yet</h2>
              <p className="text-slate-600 mt-2">Head to the Hub, pick a country you're curious about, and hit "Start my journey" on the country page.</p>
              <Link href="/hub">
                <Button className="mt-5 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white gap-2">
                  Explore the Hub <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </section>
      )}

      {(data?.journeys ?? []).map((j) => {
        const total = Number(j.total_steps);
        const stones = Array.from({ length: total }, (_, i) => i + 1);
        const doneMap = j.steps_completed ?? {};
        const doneCount = Object.keys(doneMap).length;
        const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
        const targetDate = j.target_submit_date ? new Date(j.target_submit_date) : null;
        const daysLeft = targetDate ? Math.round((targetDate.getTime() - Date.now()) / (86400_000)) : null;

        return (
          <section key={j.id} className="max-w-5xl mx-auto px-4 sm:px-6 pb-8" data-testid={`hub-journey-${j.country_slug}`}>
            <Card className="rounded-3xl border-0 shadow-md overflow-hidden">
              <CardContent className="p-6 sm:p-8">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="text-4xl">{j.flag_emoji}</div>
                    <div>
                      <h3 className="text-xl font-bold text-slate-800">{j.country_name}</h3>
                      <div className="text-sm text-slate-500 mt-0.5">{j.traveler_friendly_name}</div>
                      <div className="text-xs mt-2">
                        <span className="text-slate-500">Status:</span>{" "}
                        <span className="font-medium text-slate-700">{STATUS_LABELS[j.status] ?? j.status}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-emerald-700">{pct}%</div>
                    <div className="text-xs text-slate-500 uppercase tracking-wider">{doneCount} of {total} done</div>
                    {daysLeft !== null && (
                      <div className={`mt-2 text-xs font-medium ${daysLeft < 0 ? "text-red-600" : daysLeft < 14 ? "text-orange-700" : "text-slate-600"}`}>
                        {daysLeft < 0 ? `Target date passed ${Math.abs(daysLeft)} days ago` : `${daysLeft} days until your target`}
                      </div>
                    )}
                  </div>
                </div>

                {/* River-stone rail */}
                <div className="mt-6 flex items-center gap-1.5 overflow-x-auto py-3">
                  {stones.map((n) => {
                    const done = !!doneMap[String(n)];
                    const current = !done && n === j.current_step_order;
                    return (
                      <button
                        key={n}
                        onClick={() => stepMutation.mutate({ journeyId: j.id, stepOrder: n, done: !done })}
                        title={done ? `Step ${n} — done` : current ? `Step ${n} — current` : `Step ${n} — mark done`}
                        className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center transition ${
                          done
                            ? "bg-emerald-500 text-white hover:bg-emerald-600"
                            : current
                              ? "bg-orange-500 text-white ring-4 ring-orange-200 animate-pulse"
                              : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                        }`}
                        data-testid={`hub-stone-${j.country_slug}-${n}`}
                      >
                        {done ? <Check className="h-4 w-4" /> : <span className="text-xs font-bold">{n}</span>}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Link href={`/hub/countries/${j.country_slug}`}>
                    <Button variant="outline" className="rounded-2xl gap-2 text-sm">
                      Open full journey <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                  {j.suitability_score != null && (
                    <span className="text-xs text-slate-500">Suitability score: <span className="font-semibold text-slate-700">{j.suitability_score}%</span></span>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>
        );
      })}

      {(data?.journeys ?? []).length > 0 && (
        <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-12">
          <div className="text-center">
            <Link href="/hub">
              <Button variant="outline" className="rounded-2xl border-orange-300 text-orange-700 hover:bg-orange-50 gap-2">
                Add another country to explore <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
