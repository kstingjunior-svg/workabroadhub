// ─────────────────────────────────────────────────────────────────────────────
// Dashboard — "Today's Best Match" widget.
//
// What it shows:
//   - For Pro/Monthly/Trial users who've run /api/jobs/match-my-cv at least
//     once → their TOP semantically-matched visa-sponsorship job, with a
//     live "Apply now" link to the employer's site. Updates whenever they
//     re-run the matcher with a new CV.
//   - For signed-in users who have NOT run the matcher yet → a generic
//     featured visa-sponsorship job for today, with a CTA to run the
//     personalized matcher.
//   - For signed-in NON-paid users → the same content, but the apply link
//     is replaced with a paywall CTA ("Unlock apply with Pro Monthly").
//
// Why this matters (founder ask):
//   Creates a daily reason for Pro users to log back in (today's match
//   changes as new jobs get added). Strong retention play. Also serves as
//   a visible, daily proof-of-value for Pro Monthly subscribers.
//
// Server contract (GET /api/dashboard/best-match):
//   {
//     match: {
//       id, title, employer, country, city, salary, visaType,
//       category, applyUrl?, score, scorePct
//     } | null,
//     personalized: boolean,   // true if scored against user's stored CV
//     signedIn: boolean,
//     canApply: boolean,       // true if user is on Pro/Monthly/Trial
//   }
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Sparkles, MapPin, Briefcase, ArrowRight, Lock,
  TrendingUp, Building2, DollarSign, Star,
} from "lucide-react";

interface BestMatchJob {
  id: string;
  title: string;
  employer: string;
  country: string;
  city?: string;
  salary?: string;
  visaType?: string;
  category?: string;
  applyUrl?: string;
  score: number;
  scorePct: number;
}

interface BestMatchResponse {
  match: BestMatchJob | null;
  personalized: boolean;
  signedIn: boolean;
  canApply: boolean;
}

export function DashboardBestMatch() {
  const { data, isLoading, error } = useQuery<BestMatchResponse>({
    queryKey: ["/api/dashboard/best-match"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard/best-match", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load best match");
      return res.json();
    },
    // Best match is stable for a session — no need to refetch on every focus.
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div
        className="rounded-3xl border border-emerald-200/60 dark:border-emerald-800/40 bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-emerald-950/30 dark:via-gray-900 dark:to-teal-950/20 p-5 shadow-sm"
        data-testid="best-match-skeleton"
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="h-7 w-7 rounded-lg bg-emerald-200/60 dark:bg-emerald-800/40 animate-pulse" />
          <div className="h-4 w-40 rounded bg-emerald-200/60 dark:bg-emerald-800/40 animate-pulse" />
        </div>
        <div className="space-y-2">
          <div className="h-5 w-3/4 rounded bg-emerald-100 dark:bg-emerald-900/40 animate-pulse" />
          <div className="h-4 w-1/2 rounded bg-emerald-100 dark:bg-emerald-900/40 animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !data?.match) {
    // Soft-fail: hide the widget entirely if the endpoint errors. Better
    // than showing a confusing empty card.
    return null;
  }

  const { match, personalized, canApply } = data;

  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-emerald-200/60 dark:border-emerald-800/40 bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-emerald-950/30 dark:via-gray-900 dark:to-teal-950/20 p-5 shadow-sm hover:shadow-md transition-shadow"
      data-testid="dashboard-best-match"
    >
      {/* Decorative orb */}
      <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-emerald-200/30 dark:bg-emerald-700/20 blur-2xl pointer-events-none" />

      {/* Header strip */}
      <div className="relative flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 shrink-0 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-200 leading-tight">
              {personalized ? "Today's Best Match for You" : "Today's Featured Job"}
            </h3>
            <p className="text-[10px] text-emerald-700/80 dark:text-emerald-300/70 leading-tight">
              {personalized
                ? "Scored against your CV with AI"
                : "Try our AI matcher for a personalized result"}
            </p>
          </div>
        </div>
        {personalized && match.scorePct > 0 && (
          <span
            className="inline-flex items-center gap-1 bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full"
            data-testid="best-match-score-pct"
          >
            <Star className="h-3 w-3 fill-current" />
            {match.scorePct}% match
          </span>
        )}
      </div>

      {/* Job card */}
      <div className="relative rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0">
            <h4
              className="text-base font-bold text-gray-900 dark:text-white leading-tight mb-0.5 truncate"
              data-testid="best-match-title"
            >
              {match.title}
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-1 truncate">
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{match.employer}</span>
            </p>
          </div>
          {match.visaType && (
            <span className="shrink-0 inline-flex items-center bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold px-2 py-0.5 rounded-full">
              {match.visaType}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-gray-600 dark:text-gray-400 mb-3">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {[match.city, match.country].filter(Boolean).join(", ")}
          </span>
          {match.salary && (
            <span className="inline-flex items-center gap-1 font-medium text-gray-700 dark:text-gray-300">
              <DollarSign className="h-3.5 w-3.5" />
              {match.salary}
            </span>
          )}
          {match.category && (
            <span className="inline-flex items-center gap-1">
              <Briefcase className="h-3.5 w-3.5" />
              {match.category}
            </span>
          )}
        </div>

        {/* CTA — gated on Pro */}
        {canApply && match.applyUrl ? (
          <a
            href={match.applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-sm hover:shadow-md hover:from-emerald-700 hover:to-teal-700 transition-all"
            data-testid="best-match-apply"
          >
            Apply now <ArrowRight className="h-4 w-4" />
          </a>
        ) : (
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-xs text-gray-600 dark:text-gray-400 inline-flex items-center gap-1">
              <Lock className="h-3.5 w-3.5" />
              Apply link locked
            </div>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-semibold px-3 py-1.5 rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
              data-testid="best-match-upgrade"
            >
              Unlock with Pro <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}
      </div>

      {/* Secondary CTA — run the matcher (only if not personalized yet) */}
      {!personalized && (
        <div className="relative mt-3 text-center">
          <Link
            href="/tools/job-match"
            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 dark:hover:text-emerald-100 underline underline-offset-2"
            data-testid="best-match-run-personalizer"
          >
            <TrendingUp className="h-3 w-3" />
            Personalize this — match my CV
          </Link>
        </div>
      )}
    </div>
  );
}
