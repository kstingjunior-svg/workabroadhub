/**
 * Dashboard widget — surfaces a user's most-recently-touched journey at the
 * top of the dashboard with progress, next step, and a quick "continue" CTA.
 *
 * If the user has no journey yet, shows a soft prompt to start one. If they
 * have multiple, shows the most recent.
 *
 * 2026-06 retention #1.
 */
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Globe, ArrowRight, Trophy, Sparkles } from "lucide-react";

interface JourneySummary {
  id: string;
  countryCode: string;
  stage: string;
  completedSteps: string[];
  startedAt: string | null;
  lastTouchedAt: string | null;
  totalSteps: number;
  completedCount: number;
  progressPercent: number;
}

const COUNTRY_FLAG: Record<string, string> = {
  AE: "🇦🇪", SA: "🇸🇦", QA: "🇶🇦", BH: "🇧🇭",
  GB: "🇬🇧", CA: "🇨🇦", AU: "🇦🇺", DE: "🇩🇪", US: "🇺🇸",
};
const COUNTRY_NAME: Record<string, string> = {
  AE: "UAE", SA: "Saudi Arabia", QA: "Qatar", BH: "Bahrain",
  GB: "United Kingdom", CA: "Canada", AU: "Australia", DE: "Germany", US: "USA",
};
const STAGE_BADGE: Record<string, { label: string; emoji: string }> = {
  preparing: { label: "Preparing",       emoji: "📋" },
  applying:  { label: "Applying",        emoji: "✉️" },
  interview: { label: "Interview Stage", emoji: "💬" },
  hired:     { label: "Hired",           emoji: "🎉" },
  departed:  { label: "Departed",        emoji: "✈️" },
};

export function DashboardJourneyCard() {
  const { user } = useAuth();
  const { data: journeys = [] } = useQuery<JourneySummary[]>({
    queryKey: ["/api/journey"],
    enabled: !!user,
    staleTime: 60_000,
    // Don't retry — if the table is missing on the server we just hide the
    // widget rather than spamming a failing endpoint.
    retry: false,
  });

  // Sort newest-touched first, take the top one
  const active = [...journeys]
    .sort((a, b) => new Date(b.lastTouchedAt ?? 0).getTime() - new Date(a.lastTouchedAt ?? 0).getTime())[0];

  // No journey yet — soft prompt
  if (!active) {
    return (
      <Link href="/journey">
        <Card
          className="mb-4 cursor-pointer hover:shadow-md transition-all border-dashed border-2 border-primary/30 hover:border-primary/60"
          data-testid="card-journey-empty"
        >
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-full bg-primary/10 shrink-0">
              <Globe className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm">Start your journey roadmap</div>
              <div className="text-xs text-muted-foreground line-clamp-1">
                Pick a target country — we'll show you every step from passport to plane ticket.
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardContent>
        </Card>
      </Link>
    );
  }

  const flag = COUNTRY_FLAG[active.countryCode] ?? "🌍";
  const name = COUNTRY_NAME[active.countryCode] ?? active.countryCode;
  const stageInfo = STAGE_BADGE[active.stage] ?? STAGE_BADGE.preparing;
  const isComplete = active.progressPercent === 100;

  return (
    <Link href={`/journey/${active.countryCode}`}>
      <Card
        className="mb-4 cursor-pointer hover:shadow-md transition-all overflow-hidden"
        data-testid="card-journey-active"
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="text-3xl shrink-0">{flag}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-bold text-base">{name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {stageInfo.emoji} {stageInfo.label}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {isComplete
                  ? <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 font-semibold"><Trophy className="h-3 w-3" /> Roadmap complete</span>
                  : <>{active.completedCount} of {active.totalSteps} steps done</>
                }
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>

          {/* Progress bar */}
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 via-blue-500 to-indigo-500 transition-all duration-500"
              style={{ width: `${active.progressPercent}%` }}
              data-testid="journey-progress-bar"
            />
          </div>
          <div className="flex justify-between items-baseline mt-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">progress</span>
            <span className="text-sm font-bold tabular-nums">{active.progressPercent}%</span>
          </div>

          {!isComplete && (
            <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">
              <Sparkles className="h-3 w-3" /> Continue where you left off
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
