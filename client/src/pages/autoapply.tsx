/**
 * /autoapply — AutoApply Agent config + inbox for a signed-in user.
 *
 * Two states:
 *   • No agent yet → onboarding form (target countries, roles, CV, prefs)
 *   • Agent exists → dashboard: settings summary + match inbox
 *
 * All actions call /api/autoapply/* which are auth-gated. Unauthenticated
 * visitors get bounced to /login by the wrapper route in App.tsx.
 */

import { useMemo, useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, fetchCsrfToken } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePageSeo } from "@/hooks/use-page-seo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Sparkles, RefreshCw, Star, Check, X, ExternalLink, Loader2,
  MapPin, Briefcase, DollarSign, Zap, Copy, Pause, Play,
  Upload, FileText,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────
interface Agent {
  id: string;
  target_countries: string[];
  target_roles: string[];
  min_salary_kes: number | null;
  visa_sponsorship_required: boolean;
  experience_years: number | null;
  is_active: boolean;
  max_matches_per_day: number;
  last_scan_at: string | null;
  total_matches_lifetime: number;
  total_applied_lifetime: number;
}

interface Match {
  id: string;
  source: string;
  job_title: string;
  employer: string | null;
  country: string | null;
  city: string | null;
  salary_display: string | null;
  salary_kes_monthly: number | null;
  posted_at: string | null;
  apply_url: string;
  description: string | null;
  match_score: number;
  match_reasons: string[] | null;
  cover_letter: string | null;
  status: "new" | "starred" | "applied" | "dismissed";
  created_at: string;
}

interface PlanInfo {
  id:                   string;
  tier:                 "free" | "pro";
  maxMatchesPerDay:     number;
  maxCoverLettersPerDay: number;
  scanEvery:            "daily" | "weekly";
  dailyDigestEmail:     boolean;
  priorityQueue:        boolean;
  monthlyPriceKes:      number;
  trial_active?:        boolean;
  trial_ends_at?:       string | null;
  real_plan?:           string;
}

interface Quota {
  letters_used_today:      number;
  letters_daily_limit:     number;
  letters_remaining_today: number;
}

interface Offers {
  pro: PlanInfo & {
    upgradeUrl:     string;
    annualPriceKes: number;
    annualSavings:  number;
  };
  trialDays: number;
}

const COUNTRY_OPTIONS = [
  { code: "uk", label: "🇬🇧 United Kingdom" },
  { code: "canada", label: "🇨🇦 Canada" },
  { code: "usa", label: "🇺🇸 United States" },
  { code: "australia", label: "🇦🇺 Australia" },
  { code: "germany", label: "🇩🇪 Germany" },
  { code: "netherlands", label: "🇳🇱 Netherlands" },
  { code: "poland", label: "🇵🇱 Poland" },
  { code: "new-zealand", label: "🇳🇿 New Zealand" },
];

// ─── Component ────────────────────────────────────────────────────────
export default function AutoApplyPage() {
  usePageSeo({
    title:       "AutoApply Agent — AI that applies to overseas jobs while you sleep | WorkAbroad Hub",
    description: "Set your target countries and role. Every night our AI scans, matches, and drafts applications for you. Wake up to a curated inbox of overseas jobs with tailored cover letters ready to send.",
    path:        "/autoapply",
    keywords:    ["autoapply agent kenya", "ai job apply kenya", "automated job applications kenya"],
  });

  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"new" | "starred" | "applied" | "dismissed" | "all">("new");

  const { data: agentData, isLoading: agentLoading } = useQuery<{ agent: Agent | null; plan: PlanInfo; offers: Offers; quota: Quota }>({
    queryKey: ["/api/autoapply/agent"],
    staleTime: 30_000,
  });
  const agent = agentData?.agent ?? null;
  const plan  = agentData?.plan;
  const offers = agentData?.offers;
  const quota = agentData?.quota;
  const isPro = plan?.tier === "pro";
  const trialActive = !!plan?.trial_active;
  const trialDaysLeft = plan?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(plan.trial_ends_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : 0;

  const { data: matchesData } = useQuery<{ matches: Match[] }>({
    queryKey: [`/api/autoapply/matches?status=${statusFilter === "all" ? "" : statusFilter}&limit=50`],
    enabled: !!agent,
    refetchInterval: 30_000,
  });
  const matches = matchesData?.matches ?? [];

  const scanNow = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/autoapply/agent/scan-now", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "Scan failed");
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "Scan started", description: data?.message ?? "New matches in ~60s" });
      setTimeout(() => qc.invalidateQueries({ queryKey: [`/api/autoapply/matches?status=new&limit=50`] }), 60_000);
    },
    onError: (err: any) => toast({ title: "Scan failed", description: err.message, variant: "destructive" }),
  });

  const togglePause = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/autoapply/agent/pause", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: agent?.is_active }),
      });
      if (!res.ok) throw new Error("Toggle failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/autoapply/agent"] }),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Match["status"] }) => {
      const res = await fetch(`/api/autoapply/matches/${id}/status`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Status update failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/autoapply/matches?status=${statusFilter === "all" ? "" : statusFilter}&limit=50`] }),
  });

  if (agentLoading) {
    return <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin inline mr-2" /> Loading your AutoApply agent…</div>;
  }

  if (!agent) {
    return <OnboardingForm onCreated={() => qc.invalidateQueries({ queryKey: ["/api/autoapply/agent"] })} />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <section className="bg-gradient-to-br from-purple-600 via-blue-600 to-cyan-600 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl sm:text-4xl font-bold flex items-center gap-2">
                <Sparkles className="h-7 w-7" /> AutoApply Agent
                {plan && (
                  <Badge
                    className={
                      isPro
                        ? "bg-gradient-to-r from-amber-400 to-orange-500 text-white border-0 font-bold text-xs uppercase tracking-wide"
                        : "bg-white/15 border-white/25 text-white font-medium text-xs uppercase tracking-wide"
                    }
                  >
                    {isPro ? "⚡ PRO" : "FREE"}
                  </Badge>
                )}
              </h1>
              <p className="text-blue-100/90 mt-1 text-sm">
                Hunting {agent.target_roles.length} role{agent.target_roles.length !== 1 ? "s" : ""} across {agent.target_countries.length} {agent.target_countries.length === 1 ? "country" : "countries"}
                {agent.last_scan_at ? ` · Last scan ${timeAgo(agent.last_scan_at)}` : " · No scans yet"}
                {plan && (
                  <span className="text-blue-200/70"> · {plan.maxMatchesPerDay} matches/day cap</span>
                )}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                className="bg-white/10 border-white/20 text-white hover:bg-white/20 gap-2"
                onClick={() => togglePause.mutate()}
                disabled={togglePause.isPending}
              >
                {agent.is_active ? <><Pause className="h-4 w-4" /> Pause</> : <><Play className="h-4 w-4" /> Resume</>}
              </Button>
              <Button
                className="bg-white text-blue-950 hover:bg-blue-50 gap-2"
                onClick={() => scanNow.mutate()}
                disabled={scanNow.isPending}
              >
                {scanNow.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Scanning…</> : <><RefreshCw className="h-4 w-4" /> Scan now</>}
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile label="Total matches" value={agent.total_matches_lifetime} />
            <StatTile label="Applied" value={agent.total_applied_lifetime} />
            <StatTile label="Daily cap" value={agent.max_matches_per_day} />
            <StatTile label="Status" value={agent.is_active ? "Active" : "Paused"} />
          </div>
        </div>
      </section>

      {/* Filter chips */}
      <section className="border-b bg-muted/30 sticky top-0 z-30 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex gap-2 flex-wrap">
          {(["new", "starred", "applied", "dismissed", "all"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={statusFilter === f ? "default" : "outline"}
              onClick={() => setStatusFilter(f)}
              data-testid={`filter-${f}`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>
      </section>

      {/* ─── TRIAL banner ─ Pro tier via 7-day free trial ─────────────
           Shown to trial users so they see the countdown urgency. */}
      {trialActive && plan && offers && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <Card className="border-2 border-purple-400/50 bg-gradient-to-r from-purple-50 via-blue-50 to-cyan-50 dark:from-purple-950/30 dark:via-blue-950/20 dark:to-cyan-950/30">
            <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row gap-3 sm:items-center">
              <div className="text-3xl">🎁</div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-900 dark:text-white">
                  Free Pro trial active — {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} left
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">
                  You&apos;re enjoying all Pro features: {plan.maxMatchesPerDay} matches/day, AI cover letters, and morning digest email.
                  {trialDaysLeft <= 2 && (
                    <b className="text-purple-700 dark:text-purple-300"> Upgrade now to keep everything after the trial ends.</b>
                  )}
                </p>
              </div>
              <a href={offers.pro.upgradeUrl}>
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-400 hover:to-blue-400 text-white border-0 shadow-lg whitespace-nowrap gap-1"
                  data-testid="btn-autoapply-trial-upgrade"
                >
                  <Sparkles className="h-4 w-4" /> Keep Pro — KES {offers.pro.monthlyPriceKes.toLocaleString()}/mo
                </Button>
              </a>
            </CardContent>
          </Card>
        </section>
      )}

      {/* ─── Quota indicator ─ For Pro users near the letter cap ──────── */}
      {isPro && !trialActive && quota && quota.letters_daily_limit > 0 && quota.letters_remaining_today <= 3 && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/20">
            <CardContent className="p-3 flex items-center gap-3 text-sm">
              <Zap className="h-4 w-4 text-amber-600 shrink-0" />
              <div className="flex-1">
                <b>{quota.letters_used_today}/{quota.letters_daily_limit} AI cover letters used today.</b>{" "}
                {quota.letters_remaining_today === 0
                  ? <span className="text-amber-700 dark:text-amber-300">Daily quota reached — resets at midnight EAT. New matches after that will get letters drafted automatically.</span>
                  : <span className="text-muted-foreground">{quota.letters_remaining_today} letter{quota.letters_remaining_today === 1 ? "" : "s"} remaining today.</span>
                }
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* ─── FREE-tier upgrade card (post-trial or never-trialled) ─────
           Shown only to genuine free users (NOT trial users, they see the
           trial banner instead). Includes both monthly and annual pricing. */}
      {!isPro && !trialActive && offers && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <Card className="border-2 border-amber-400/50 bg-gradient-to-r from-amber-50 via-orange-50 to-yellow-50 dark:from-amber-950/30 dark:via-orange-950/20 dark:to-yellow-950/30">
            <CardContent className="p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row gap-4 sm:items-start">
                <div className="text-4xl sm:text-5xl">⚡</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                      Upgrade to Pro
                    </h3>
                    <span className="text-xs font-semibold text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/40 px-2 py-0.5 rounded-full uppercase tracking-wide">
                      From KES {offers.pro.monthlyPriceKes.toLocaleString()}/mo
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-snug">
                    You&apos;re on the Free plan — {plan?.maxMatchesPerDay} matches per week, no AI cover letters.
                    Pro unlocks <b>{offers.pro.maxMatchesPerDay} matches/day</b>, <b>{offers.pro.maxCoverLettersPerDay} AI-drafted cover letters daily</b>, and the <b>morning digest email</b>.
                  </p>
                  <ul className="mt-2 text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
                    <li>✓ 10× more matches surfaced every day (not per week)</li>
                    <li>✓ Tailored AI cover letter drafted for every top match</li>
                    <li>✓ Morning email digest at 6am — never miss a fresh posting</li>
                    <li>✓ Priority scan queue (your agent runs first)</li>
                  </ul>
                </div>
              </div>

              {/* Two pricing options: monthly + annual (annual saves ~17%) */}
              <div className="mt-4 grid sm:grid-cols-2 gap-3">
                <a href={offers.pro.upgradeUrl} className="block">
                  <div className="border rounded-lg p-4 hover:border-orange-400 bg-white dark:bg-slate-900 transition-all">
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">Monthly</div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">
                      KES {offers.pro.monthlyPriceKes.toLocaleString()}
                      <span className="text-sm text-muted-foreground font-normal">/mo</span>
                    </div>
                    <Button size="sm" variant="outline" className="w-full mt-3">
                      Choose monthly
                    </Button>
                  </div>
                </a>
                <a href={`${offers.pro.upgradeUrl}?plan=annual`} className="block">
                  <div className="border-2 border-orange-500 rounded-lg p-4 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/40 dark:to-amber-950/30 relative">
                    <div className="absolute -top-2 right-3 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-md uppercase">
                      Save {Math.round((offers.pro.annualSavings / (offers.pro.monthlyPriceKes * 12)) * 100)}%
                    </div>
                    <div className="text-xs font-semibold text-orange-700 dark:text-orange-300 uppercase mb-1">Annual (best value)</div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white">
                      KES {offers.pro.annualPriceKes.toLocaleString()}
                      <span className="text-sm text-muted-foreground font-normal">/year</span>
                    </div>
                    <div className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                      = KES {Math.round(offers.pro.annualPriceKes / 12).toLocaleString()}/mo · save KES {offers.pro.annualSavings.toLocaleString()}
                    </div>
                    <Button size="sm" className="w-full mt-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white">
                      Choose annual
                    </Button>
                  </div>
                </a>
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Match list */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-3">
        {matches.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            {statusFilter === "new"
              ? "No new matches yet. Your agent scans overnight — check back in the morning, or hit \"Scan now\"."
              : `No ${statusFilter} matches yet.`}
          </Card>
        ) : (
          matches.map((m) => (
            <MatchCard
              key={m.id}
              match={m}
              isPro={isPro}
              upgradeUrl={offers?.pro.upgradeUrl ?? "/services"}
              proPrice={offers?.pro.monthlyPriceKes ?? 1500}
              onStatus={(s) => setStatus.mutate({ id: m.id, status: s })}
            />
          ))
        )}
      </section>

      {/* ─── ToS-required attribution for the Adzuna free tier ─────────
          Adzuna Developer Terms §5 require any product using their API
          to display a "Powered by Adzuna" credit visible to end-users.
          Placed here (page footer + on every Adzuna-sourced match card)
          so we're compliant in both the aggregate and the individual
          record view. */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-10 pt-2 text-center">
        <p className="text-xs text-muted-foreground">
          Job data powered by{" "}
          <a
            href="https://www.adzuna.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline font-medium"
          >
            Adzuna
          </a>
          . WorkAbroad Hub is not affiliated with Adzuna Ltd.
        </p>
      </section>
    </div>
  );
}

// ─── Match card ───────────────────────────────────────────────────────
interface MatchCardProps {
  match:      Match;
  onStatus:   (s: Match["status"]) => void;
  isPro:      boolean;
  upgradeUrl: string;
  proPrice:   number;
}

function MatchCard({ match, onStatus, isPro, upgradeUrl, proPrice }: MatchCardProps) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);

  const copyLetter = () => {
    if (!match.cover_letter) return;
    navigator.clipboard.writeText(match.cover_letter);
    toast({ title: "Cover letter copied", description: "Paste it into the employer's application form." });
  };

  const scoreBadge = match.match_score >= 80 ? "bg-green-100 text-green-800 border-green-200" :
                     match.match_score >= 60 ? "bg-blue-100 text-blue-800 border-blue-200" :
                     "bg-amber-100 text-amber-800 border-amber-200";

  return (
    <Card className="hover:shadow-lg transition-shadow" data-testid={`match-card-${match.id}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-lg leading-tight">{match.job_title}</h3>
            <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
              {match.employer && <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" /> {match.employer}</span>}
              {match.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {match.city}</span>}
              {match.country && <Badge variant="outline" className="text-xs">{match.country.toUpperCase()}</Badge>}
            </div>
          </div>
          <Badge className={`${scoreBadge} border font-semibold`}>{match.match_score}% match</Badge>
        </div>

        {(match.salary_display || match.salary_kes_monthly) && (
          <div className="text-emerald-700 dark:text-emerald-400 font-semibold text-sm mb-2 flex items-center gap-1">
            <DollarSign className="h-4 w-4" />
            {match.salary_display}
            {match.salary_kes_monthly && <span className="text-muted-foreground font-normal ml-1">(~KES {match.salary_kes_monthly.toLocaleString()}/mo)</span>}
          </div>
        )}

        {match.match_reasons && match.match_reasons.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {match.match_reasons.map((r, i) => (
              <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                ✓ {r}
              </span>
            ))}
          </div>
        )}

        {expanded && match.description && (
          <div className="text-sm text-muted-foreground bg-muted/40 rounded p-3 mb-3 max-h-40 overflow-y-auto whitespace-pre-wrap">
            {match.description.slice(0, 1200)}{match.description.length > 1200 ? "…" : ""}
          </div>
        )}

        {expanded && match.cover_letter && (
          <div className="border rounded-lg p-3 mb-3 bg-purple-50/50 dark:bg-purple-950/20">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-semibold text-purple-800 dark:text-purple-300">AI-DRAFTED COVER LETTER</span>
              <Button size="sm" variant="ghost" onClick={copyLetter} className="h-7 gap-1 text-xs">
                <Copy className="h-3 w-3" /> Copy
              </Button>
            </div>
            <div className="text-sm whitespace-pre-wrap text-slate-700 dark:text-slate-200 max-h-64 overflow-y-auto">
              {match.cover_letter}
            </div>
          </div>
        )}

        {/* 2026-08 Phase 2 paywall: if the user is on the free tier AND
            they've expanded a card that has NO cover letter (because free
            plan skipped generating one), show the upgrade prompt right
            where the letter would be. High-context conversion moment. */}
        {expanded && !match.cover_letter && !isPro && (
          <div className="border-2 border-dashed border-amber-400 rounded-lg p-4 mb-3 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 text-center space-y-2">
            <div className="text-2xl">🔒</div>
            <div className="text-sm font-semibold text-slate-900 dark:text-white">
              AI cover letter — Pro feature
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto">
              Pro drafts a tailored 220-word cover letter for every match, written in the exact
              tone recruiters in this country expect. Copy, paste, done — no writing from scratch.
            </p>
            <a href={upgradeUrl}>
              <Button size="sm" className="bg-gradient-to-r from-amber-500 to-orange-500 text-white gap-1 mt-2">
                <Sparkles className="h-3 w-3" /> Unlock for KES {proPrice.toLocaleString()}/mo
              </Button>
            </a>
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-center">
          <a href={match.apply_url} target="_blank" rel="noopener noreferrer">
            <Button size="sm" className="gap-1"><ExternalLink className="h-3 w-3" /> Apply on employer site</Button>
          </a>
          <Button size="sm" variant="outline" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Hide details" : "Show details + cover letter"}
          </Button>
          {match.status !== "applied" && (
            <Button size="sm" variant="outline" className="gap-1 text-emerald-700" onClick={() => onStatus("applied")}>
              <Check className="h-3 w-3" /> Mark applied
            </Button>
          )}
          {match.status !== "starred" && (
            <Button size="sm" variant="outline" className="gap-1 text-amber-700" onClick={() => onStatus("starred")}>
              <Star className="h-3 w-3" /> Star
            </Button>
          )}
          {match.status !== "dismissed" && (
            <Button size="sm" variant="ghost" className="gap-1 text-muted-foreground ml-auto" onClick={() => onStatus("dismissed")}>
              <X className="h-3 w-3" /> Dismiss
            </Button>
          )}
        </div>

        {/* Per-card attribution — Adzuna ToS §5. Keep tiny + visible. */}
        <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-muted-foreground/70 flex items-center gap-1">
          {match.source === "adzuna" && (
            <>
              Job data via{" "}
              <a
                href="https://www.adzuna.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                Adzuna
              </a>
            </>
          )}
          {match.source !== "adzuna" && <>Source: {match.source}</>}
          {match.posted_at && (
            <span className="ml-auto">
              Posted {timeAgo(match.posted_at)}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Stat tile ────────────────────────────────────────────────────────
function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-white/10 border border-white/20 p-3">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-blue-100/70">{label}</div>
    </div>
  );
}

// ─── Onboarding form (shown when no agent exists) ─────────────────────
function OnboardingForm({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast();
  const [countries, setCountries] = useState<string[]>([]);
  const [rolesInput, setRolesInput] = useState("");
  const [minSalary, setMinSalary] = useState<string>("");
  const [experienceYrs, setExperienceYrs] = useState<string>("");
  const [visaReq, setVisaReq] = useState(true);
  const [cvText, setCvText] = useState("");

  // 2026-08 (Tony's UX ask): upload OR paste. Uploading a PDF/DOCX auto-
  // extracts the text into the same cvText state — user can still tweak
  // before submitting. Falls back gracefully if extraction is thin (scanned
  // image PDF, etc.) by leaving the paste box empty and showing a toast.
  const cvFileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingCv, setUploadingCv] = useState(false);
  const [uploadedCvName, setUploadedCvName] = useState<string | null>(null);

  async function handleCvFile(file: File) {
    if (!file) return;
    setUploadingCv(true);
    setUploadedCvName(null);
    try {
      const fd = new FormData();
      fd.append("cv", file);
      // Attach CSRF manually — apiRequest JSON-encodes the body, so we can't
      // use it for multipart uploads. fetchCsrfToken is a no-op after the
      // first call (result is cached).
      const csrf = await fetchCsrfToken();
      const res = await fetch("/api/util/extract-cv-text", {
        method: "POST",
        credentials: "include",
        headers: csrf ? { "X-CSRF-Token": csrf } : {},
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.text || data.text.length < 50) {
        toast({
          title: "Couldn't read this file",
          description: data?.message || "It may be a scanned image PDF. Try a text-based PDF or paste manually.",
          variant: "destructive",
        });
        return;
      }
      setCvText(data.text);
      setUploadedCvName(file.name);
      toast({
        title: "CV loaded",
        description: `Extracted ${data.text.length.toLocaleString()} characters from ${file.name}. Review below and edit if needed.`,
      });
    } catch (e: any) {
      toast({
        title: "Upload failed",
        description: e?.message || "Network error. Please try again or paste manually.",
        variant: "destructive",
      });
    } finally {
      setUploadingCv(false);
    }
  }

  const roles = useMemo(() => rolesInput.split(",").map((r) => r.trim()).filter(Boolean), [rolesInput]);

  const create = useMutation({
    mutationFn: async () => {
      // 2026-08 (Tony's "Invalid or missing CSRF token" report on Activate):
      // was using raw fetch() which does NOT attach the X-CSRF-Token header.
      // Switched to apiRequest which handles CSRF token fetch + attachment
      // automatically (see client/src/lib/queryClient.ts). All other mutating
      // calls in the app go through apiRequest for exactly this reason.
      const res = await apiRequest("POST", "/api/autoapply/agent", {
        target_countries: countries,
        target_roles:     roles,
        min_salary_kes:   minSalary ? Number(minSalary) : null,
        experience_years: experienceYrs ? Number(experienceYrs) : null,
        visa_sponsorship_required: visaReq,
        cv_text:          cvText,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "AutoApply agent created", description: "Your first scan runs in ~5 minutes." });
      onCreated();
    },
    onError: (err: any) => {
      // 2026-08 (Tony's "Setup failed — [object Object]" report): apiRequest
      // sometimes throws an Error whose .message is a non-string (e.g. an
      // upstream validator returned { message: {...} }). Rendering that in a
      // toast gave the user "[object Object]" instead of anything useful.
      // Extract the best string we can from a mix of possible shapes.
      const raw = err?.body?.message ?? err?.message ?? err?.body?.error ?? err;
      const description =
        typeof raw === "string"
          ? raw
          : typeof raw === "object" && raw !== null
            ? (raw.message ?? raw.error ?? JSON.stringify(raw).slice(0, 200))
            : String(raw ?? "Unknown error");
      // Log the full error object so we can diagnose in devtools if it
      // happens again.
      console.error("[autoapply] activate failed:", err, "body:", err?.body);
      toast({ title: "Setup failed", description, variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <section className="bg-gradient-to-br from-purple-600 via-blue-600 to-cyan-600 text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
          <div className="text-5xl mb-3">🤖</div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">Set up your AutoApply Agent</h1>
          <p className="text-blue-100/90 max-w-xl mx-auto">
            Every night your agent scans real overseas job boards, ranks them against your CV, and
            drafts cover letters for the top matches. Wake up to a curated inbox — ready to apply
            with one click.
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Card><CardContent className="p-6 space-y-5">

          <div>
            <Label className="text-base font-semibold">1. Target countries</Label>
            <p className="text-xs text-muted-foreground mt-1 mb-3">Pick up to 5 countries where you want to work.</p>
            <div className="flex flex-wrap gap-2">
              {COUNTRY_OPTIONS.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => setCountries((cs) => cs.includes(c.code) ? cs.filter((x) => x !== c.code) : [...cs, c.code].slice(0, 5))}
                  className={`px-3 py-1.5 rounded-full border text-sm transition ${
                    countries.includes(c.code)
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-background hover:bg-muted border-input"
                  }`}
                  data-testid={`country-${c.code}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="roles" className="text-base font-semibold">2. Target roles / job titles</Label>
            <p className="text-xs text-muted-foreground mt-1 mb-2">Comma-separated. Up to 5. Example: "registered nurse, staff nurse, ICU nurse"</p>
            <Input
              id="roles"
              value={rolesInput}
              onChange={(e) => setRolesInput(e.target.value)}
              placeholder="registered nurse, staff nurse"
              data-testid="input-roles"
            />
            {roles.length > 0 && <div className="text-xs text-muted-foreground mt-2">{roles.length} role{roles.length !== 1 ? "s" : ""} — {roles.slice(0, 3).join(" · ")}{roles.length > 3 ? "…" : ""}</div>}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="exp" className="text-base font-semibold">3. Years of experience</Label>
              <Input id="exp" type="number" min={0} max={50} value={experienceYrs} onChange={(e) => setExperienceYrs(e.target.value)} placeholder="e.g. 5" data-testid="input-exp" />
            </div>
            <div>
              <Label htmlFor="salary" className="text-base font-semibold">4. Min monthly salary (KES) — optional</Label>
              <Input id="salary" type="number" min={0} value={minSalary} onChange={(e) => setMinSalary(e.target.value)} placeholder="e.g. 250000" data-testid="input-salary" />
            </div>
          </div>

          <div className="flex items-start gap-2">
            <input
              id="visa"
              type="checkbox"
              checked={visaReq}
              onChange={(e) => setVisaReq(e.target.checked)}
              className="mt-1"
              data-testid="input-visa"
            />
            <label htmlFor="visa" className="text-sm">
              <b>I need visa sponsorship</b> — prioritise jobs that explicitly offer sponsorship for non-EU/non-Commonwealth nationals.
            </label>
          </div>

          <div>
            <Label htmlFor="cv" className="text-base font-semibold">5. Your CV</Label>
            <p className="text-xs text-muted-foreground mt-1 mb-3">Upload your Word/PDF CV OR paste the text below. Everything the agent uses to match jobs comes from here. Minimum 200 characters.</p>

            {/* Upload / drag-drop area — auto-extracts text into the box below */}
            <div
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const f = e.dataTransfer.files?.[0];
                if (f) void handleCvFile(f);
              }}
              onClick={() => cvFileInputRef.current?.click()}
              className="border-2 border-dashed border-input hover:border-primary/50 rounded-lg p-4 text-center cursor-pointer transition mb-3 bg-muted/30"
              data-testid="cv-drop-zone"
            >
              <input
                ref={cvFileInputRef}
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleCvFile(f);
                  // Reset so re-uploading the same file re-triggers
                  e.target.value = "";
                }}
                data-testid="input-cv-file"
              />
              {uploadingCv ? (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Reading your CV…
                </div>
              ) : uploadedCvName ? (
                <div className="flex items-center justify-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                  <FileText className="h-4 w-4" />
                  <span className="font-medium truncate max-w-xs">{uploadedCvName}</span>
                  <span className="text-xs text-muted-foreground">— tap to replace</span>
                </div>
              ) : (
                <>
                  <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">Click to upload your CV, or drag & drop</p>
                  <p className="text-xs text-muted-foreground mt-1">PDF or Word (.docx), up to 5 MB</p>
                </>
              )}
            </div>

            <div className="relative my-3">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center text-[10px] uppercase tracking-wider"><span className="bg-background px-2 text-muted-foreground">or paste the text</span></div>
            </div>

            <Textarea
              id="cv"
              value={cvText}
              onChange={(e) => { setCvText(e.target.value); setUploadedCvName(null); }}
              placeholder="Paste your CV here..."
              rows={10}
              className="font-mono text-xs"
              data-testid="input-cv"
            />
            <div className="text-xs text-muted-foreground mt-1 text-right">{cvText.length.toLocaleString()} chars {cvText.length < 200 && `— need ${200 - cvText.length} more`}</div>
          </div>

          <Button
            size="lg"
            className="w-full gap-2"
            onClick={() => create.mutate()}
            disabled={create.isPending || countries.length === 0 || roles.length === 0 || cvText.length < 200}
            data-testid="btn-create-agent"
          >
            {create.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Setting up…</> : <><Sparkles className="h-4 w-4" /> Activate my AutoApply Agent</>}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            🔒 Your CV never leaves WorkAbroad Hub. Applications are prepared but always submitted by you — never automatically without your review.
          </p>
        </CardContent></Card>
      </section>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
