/**
 * /journey — Country Journey Checklist page.
 *
 * Picks a target country, shows the step-by-step roadmap from "thinking about
 * working abroad" → "you've landed and registered with the embassy."
 * Each step has a checkbox the user can tick off. Progress saves per user
 * per country and surfaces on the dashboard as a progress card.
 *
 * 2026-06 retention #1.
 */
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Globe, CheckCircle2, Circle, Clock, Lightbulb, Trophy,
  Briefcase, FileText, Plane, Wallet, Building2, Sparkles, ArrowRight,
} from "lucide-react";
import { SUPPORTED_JOURNEY_COUNTRIES, getJourneySteps, type JourneyStep } from "@shared/country-journey-steps";
import { PreDepartureSection } from "@/components/pre-departure-section";

interface JourneyStepDisplay {
  key: string;
  title: string;
  description: string;
  proTip?: string;
  estimatedDuration?: string;
  category: "documents" | "skills" | "agency" | "application" | "financial" | "departure";
  ctaLink?: string;
  ctaLabel?: string;
  completed: boolean;
}

interface JourneyResponse {
  country: { code: string; name: string; flag: string } | undefined;
  steps: JourneyStepDisplay[];
  progress: { totalSteps: number; completedCount: number; progressPercent: number };
  stage: string | null;
  departureDate: string | null;
  startedAt: string | null;
  lastTouchedAt: string | null;
}

const CATEGORY_META: Record<JourneyStepDisplay["category"], { icon: any; label: string; color: string }> = {
  documents:   { icon: FileText,   label: "Documents",    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  skills:      { icon: Sparkles,   label: "Skills",       color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
  agency:      { icon: Building2,  label: "Agency",       color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  application: { icon: Briefcase,  label: "Application",  color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
  financial:   { icon: Wallet,     label: "Financial",    color: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300" },
  departure:   { icon: Plane,      label: "Departure",    color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300" },
};

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  preparing: { label: "Preparing",       color: "bg-blue-100 text-blue-800" },
  applying:  { label: "Applying",        color: "bg-amber-100 text-amber-800" },
  interview: { label: "Interview Stage", color: "bg-purple-100 text-purple-800" },
  hired:     { label: "Hired! 🎉",       color: "bg-emerald-100 text-emerald-800" },
  departed:  { label: "Departed ✈️",     color: "bg-cyan-100 text-cyan-800" },
};

export default function JourneyPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const params = useParams<{ country?: string }>();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const countryCode = (params.country || "").toUpperCase();
  const hasCountry = countryCode && SUPPORTED_JOURNEY_COUNTRIES.some((c) => c.code === countryCode);

  // ── Country picker view (when no country selected) ──────────────────────
  if (!authLoading && !user) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <Globe className="h-10 w-10 mx-auto mb-3 text-primary" />
            <h2 className="text-xl font-bold mb-2">Sign in to start your journey</h2>
            <p className="text-sm text-muted-foreground mb-4">
              We'll save your progress so you can pick up exactly where you left off.
            </p>
            <Button onClick={() => navigate("/?redirect=" + encodeURIComponent("/journey"))}>
              Sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!hasCountry) {
    return <CountryPicker />;
  }

  return <JourneyDetail countryCode={countryCode} />;
}

// ─── Country picker — shown when /journey is hit with no slug ─────────────

function CountryPicker() {
  const [, navigate] = useLocation();
  const { data: existingJourneys = [] } = useQuery<Array<{ countryCode: string; progressPercent: number; completedCount: number; totalSteps: number; stage: string }>>({
    queryKey: ["/api/journey"],
  });
  const progressByCountry = useMemo(() => {
    const m = new Map<string, { progressPercent: number; completedCount: number; totalSteps: number; stage: string }>();
    for (const j of existingJourneys) m.set(j.countryCode, j);
    return m;
  }, [existingJourneys]);

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-6">
          <Globe className="h-10 w-10 mx-auto mb-3 text-primary" />
          <h1 className="text-2xl font-bold mb-1">Choose your destination</h1>
          <p className="text-sm text-muted-foreground">
            Pick a country and we'll show you the step-by-step roadmap to land a job there.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {SUPPORTED_JOURNEY_COUNTRIES.map((c) => {
            const prog = progressByCountry.get(c.code);
            return (
              <button
                key={c.code}
                onClick={() => navigate(`/journey/${c.code}`)}
                className="text-left rounded-xl border bg-card p-4 hover:shadow-md hover:border-primary/40 transition-all"
                data-testid={`country-card-${c.code}`}
              >
                <div className="text-3xl mb-2">{c.flag}</div>
                <div className="font-bold text-sm">{c.name}</div>
                {prog ? (
                  <div className="mt-2 space-y-1">
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 transition-all"
                        style={{ width: `${prog.progressPercent}%` }}
                      />
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {prog.completedCount}/{prog.totalSteps} · {STAGE_LABELS[prog.stage]?.label || prog.stage}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-[11px] text-muted-foreground">Tap to start</div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Detail view for one country ──────────────────────────────────────────

function JourneyDetail({ countryCode }: { countryCode: string }) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // 2026-06 RESILIENCE FIX: the journey roadmap content is LOCAL — it lives
  // in shared/country-journey-steps.ts. We should be able to render the steps
  // even if the server is down, the journey table doesn't exist, or auth
  // glitches. The server only adds:
  //   - which steps the user has ticked off
  //   - the stage label
  //   - the started/lastTouched timestamps
  // So we build the page from local data first, then OVERLAY whatever the
  // server gives us. Worst case: user sees an empty progress bar but full
  // step list — they can still read every step and tap them to mark complete.
  const localCountry = SUPPORTED_JOURNEY_COUNTRIES.find((c) => c.code === countryCode);
  const localSteps = getJourneySteps(countryCode);

  const { data: serverData, isLoading } = useQuery<JourneyResponse>({
    queryKey: [`/api/journey/${countryCode}`],
    retry: false, // server unreachable? show local steps, don't hammer the endpoint
  });

  // Merge server state (which steps are completed) with local content (the
  // steps themselves). If the server didn't respond, every step is unchecked
  // but the user can STILL tap to complete (we send to server on click; if
  // that fails, the optimistic update keeps the UI consistent locally).
  const completedKeys = new Set(
    (serverData?.steps ?? []).filter((s) => s.completed).map((s) => s.key),
  );
  const mergedSteps: JourneyStepDisplay[] = localSteps.map((s) => ({
    ...s,
    completed: completedKeys.has(s.key),
  }));
  const completedCount = mergedSteps.filter((s) => s.completed).length;

  const data: JourneyResponse = {
    country: localCountry,
    steps: mergedSteps,
    progress: {
      totalSteps: mergedSteps.length,
      completedCount,
      progressPercent: mergedSteps.length > 0
        ? Math.round((completedCount / mergedSteps.length) * 100)
        : 0,
    },
    stage: serverData?.stage ?? null,
    departureDate: serverData?.departureDate ?? null,
    startedAt: serverData?.startedAt ?? null,
    lastTouchedAt: serverData?.lastTouchedAt ?? null,
  };

  const toggleStep = useMutation({
    mutationFn: async ({ stepKey, done }: { stepKey: string; done: boolean }) => {
      const res = await apiRequest("POST", `/api/journey/${countryCode}/steps/${stepKey}`, { done });
      return res.json();
    },
    onMutate: async ({ stepKey, done }) => {
      // Optimistic update so the checkbox feels instant — no waiting for the round-trip.
      await queryClient.cancelQueries({ queryKey: [`/api/journey/${countryCode}`] });
      const prev = queryClient.getQueryData<JourneyResponse>([`/api/journey/${countryCode}`]);
      if (prev) {
        const nextSteps = prev.steps.map((s) =>
          s.key === stepKey ? { ...s, completed: done } : s
        );
        const completedCount = nextSteps.filter((s) => s.completed).length;
        queryClient.setQueryData<JourneyResponse>([`/api/journey/${countryCode}`], {
          ...prev,
          steps: nextSteps,
          progress: {
            ...prev.progress,
            completedCount,
            progressPercent: prev.progress.totalSteps > 0
              ? Math.round((completedCount / prev.progress.totalSteps) * 100)
              : 0,
          },
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData([`/api/journey/${countryCode}`], ctx.prev);
      toast({ title: "Couldn't save", description: "Tap again — your network may have blipped.", variant: "destructive" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/journey"] });
    },
  });

  const updateStage = useMutation({
    mutationFn: async (stage: string) => {
      const res = await apiRequest("POST", `/api/journey/${countryCode}/stage`, { stage });
      return res.json();
    },
    onSuccess: (_, stage) => {
      queryClient.invalidateQueries({ queryKey: [`/api/journey/${countryCode}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/journey"] });
      toast({ title: `Updated to ${STAGE_LABELS[stage]?.label || stage}` });
    },
  });

  // We only show the "no roadmap" screen if the country code itself is
  // unrecognised — local content guarantees we always have steps when the
  // code IS in SUPPORTED_JOURNEY_COUNTRIES.
  if (!localCountry || mergedSteps.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground mb-4">
              We don't have a roadmap for this country yet.
            </p>
            <Button onClick={() => navigate("/journey")}>Pick another</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stageInfo = data.stage && STAGE_LABELS[data.stage];

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Header */}
        <button
          onClick={() => navigate("/journey")}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          ← All countries
        </button>

        <Card className="overflow-hidden border-2 border-primary/20">
          <CardContent className="p-5">
            <div className="flex items-start gap-4 mb-4">
              <div className="text-5xl">{data.country?.flag}</div>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold leading-tight">{data.country?.name}</h1>
                <p className="text-sm text-muted-foreground mb-2">
                  Your roadmap to working in {data.country?.name}
                </p>
                {stageInfo && (
                  <Badge className={stageInfo.color}>{stageInfo.label}</Badge>
                )}
              </div>
            </div>

            {/* Big progress bar */}
            <div className="space-y-2">
              <div className="flex justify-between items-baseline text-sm">
                <span className="font-semibold">
                  {data.progress.completedCount} of {data.progress.totalSteps} steps complete
                </span>
                <span className="text-2xl font-bold text-primary tabular-nums">
                  {data.progress.progressPercent}%
                </span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 via-blue-500 to-indigo-500 transition-all duration-500"
                  style={{ width: `${data.progress.progressPercent}%` }}
                  data-testid="progress-bar"
                />
              </div>
              {data.progress.progressPercent === 100 && (
                <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300 mt-2">
                  <Trophy className="h-4 w-4" />
                  <strong>All steps done.</strong> Time to celebrate ✨
                </div>
              )}
            </div>

            {/* Stage selector */}
            <div className="mt-5 pt-4 border-t">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                What stage are you at?
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(STAGE_LABELS).map(([key, info]) => (
                  <button
                    key={key}
                    onClick={() => updateStage.mutate(key)}
                    disabled={updateStage.isPending || data.stage === key}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                      data.stage === key
                        ? "border-primary bg-primary text-primary-foreground font-semibold"
                        : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid={`stage-${key}`}
                  >
                    {info.label}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Steps list */}
        <div className="space-y-3">
          {data.steps.map((step, idx) => {
            const meta = CATEGORY_META[step.category];
            const Icon = meta.icon;
            return (
              <Card
                key={step.key}
                className={`transition-all ${step.completed ? "bg-emerald-50/40 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-800" : ""}`}
                data-testid={`step-card-${step.key}`}
              >
                <CardContent className="p-4 flex items-start gap-3">
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleStep.mutate({ stepKey: step.key, done: !step.completed })}
                    className="mt-0.5 shrink-0"
                    aria-label={step.completed ? "Mark incomplete" : "Mark complete"}
                    data-testid={`step-toggle-${step.key}`}
                  >
                    {step.completed
                      ? <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                      : <Circle className="h-6 w-6 text-muted-foreground hover:text-foreground transition-colors" />
                    }
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-muted-foreground">{String(idx + 1).padStart(2, "0")}</span>
                      <h3 className={`font-bold text-base leading-tight ${step.completed ? "line-through text-muted-foreground" : ""}`}>
                        {step.title}
                      </h3>
                    </div>

                    <p className={`text-sm leading-relaxed mb-2 ${step.completed ? "text-muted-foreground" : "text-foreground/85"}`}>
                      {step.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Badge variant="outline" className={`text-[10px] gap-1 ${meta.color}`}>
                        <Icon className="h-3 w-3" />
                        {meta.label}
                      </Badge>
                      {step.estimatedDuration && step.estimatedDuration !== "—" && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <Clock className="h-3 w-3" />
                          {step.estimatedDuration}
                        </Badge>
                      )}
                    </div>

                    {step.proTip && (
                      <div className="flex items-start gap-1.5 text-xs bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded p-2">
                        <Lightbulb className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <span className="text-amber-900 dark:text-amber-200">{step.proTip}</span>
                      </div>
                    )}

                    {step.ctaLink && step.ctaLabel && !step.completed && (
                      <button
                        onClick={() => navigate(step.ctaLink!)}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                        data-testid={`step-cta-${step.key}`}
                      >
                        {step.ctaLabel} <ArrowRight className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Retention #7: pre-departure checklist appears once the user marks
            their stage as "hired" or "departed". Hidden otherwise so it
            doesn't clutter the page for users still in the prep phase. */}
        <PreDepartureSection
          countryCode={countryCode}
          countryName={localCountry?.name ?? countryCode}
          countryFlag={localCountry?.flag ?? "🌍"}
          stage={data.stage}
          departureDate={data.departureDate}
          completedKeys={new Set(data.steps.filter((s) => s.completed).map((s) => s.key))}
        />
      </div>
    </div>
  );
}
