/**
 * "Continue where you left off" — the dashboard's smartest anchor.
 *
 * Calls /api/me/continue which picks the SINGLE highest-priority unfinished
 * action across the user's state (in-progress interview, paid CV order
 * generating, partially-done journey, etc.) and renders a one-tap CTA.
 *
 * Hides itself entirely if there's nothing to continue.
 *
 * Sits at the TOP of the dashboard so returning users see "you were at
 * question 3 of your UAE nurse interview" before anything else.
 *
 * 2026-06 retention #4.
 */
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import {
  Briefcase, Mic, Globe, Trophy, Sparkles, Clock, Download, ArrowRight,
} from "lucide-react";

interface ContinueResponse {
  continue: null | {
    kind: string;
    href: string;
    headline: string;
    subhead: string;
    icon: "briefcase" | "mic" | "globe" | "trophy" | "sparkles" | "clock" | "download";
    accent: "emerald" | "blue" | "amber" | "rose" | "indigo" | "cyan";
    progressPercent?: number;
  };
  totalCandidates?: number;
}

const ICONS = {
  briefcase: Briefcase,
  mic: Mic,
  globe: Globe,
  trophy: Trophy,
  sparkles: Sparkles,
  clock: Clock,
  download: Download,
} as const;

const ACCENT_STYLES: Record<string, { card: string; iconBg: string; iconColor: string; bar: string; label: string }> = {
  emerald: {
    card: "bg-gradient-to-br from-emerald-500/10 via-teal-500/10 to-cyan-500/10 border-emerald-200 dark:border-emerald-900",
    iconBg: "bg-emerald-100 dark:bg-emerald-900/30",
    iconColor: "text-emerald-700 dark:text-emerald-300",
    bar: "bg-gradient-to-r from-emerald-500 to-teal-500",
    label: "text-emerald-700 dark:text-emerald-300",
  },
  blue: {
    card: "bg-gradient-to-br from-blue-500/10 via-sky-500/10 to-cyan-500/10 border-blue-200 dark:border-blue-900",
    iconBg: "bg-blue-100 dark:bg-blue-900/30",
    iconColor: "text-blue-700 dark:text-blue-300",
    bar: "bg-gradient-to-r from-blue-500 to-cyan-500",
    label: "text-blue-700 dark:text-blue-300",
  },
  amber: {
    card: "bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-yellow-500/10 border-amber-200 dark:border-amber-900",
    iconBg: "bg-amber-100 dark:bg-amber-900/30",
    iconColor: "text-amber-700 dark:text-amber-300",
    bar: "bg-gradient-to-r from-amber-500 to-orange-500",
    label: "text-amber-700 dark:text-amber-300",
  },
  rose: {
    card: "bg-gradient-to-br from-rose-500/10 via-pink-500/10 to-fuchsia-500/10 border-rose-200 dark:border-rose-900",
    iconBg: "bg-rose-100 dark:bg-rose-900/30",
    iconColor: "text-rose-700 dark:text-rose-300",
    bar: "bg-gradient-to-r from-rose-500 to-pink-500",
    label: "text-rose-700 dark:text-rose-300",
  },
  indigo: {
    card: "bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-violet-500/10 border-indigo-200 dark:border-indigo-900",
    iconBg: "bg-indigo-100 dark:bg-indigo-900/30",
    iconColor: "text-indigo-700 dark:text-indigo-300",
    bar: "bg-gradient-to-r from-indigo-500 to-purple-500",
    label: "text-indigo-700 dark:text-indigo-300",
  },
  cyan: {
    card: "bg-gradient-to-br from-cyan-500/10 via-sky-500/10 to-blue-500/10 border-cyan-200 dark:border-cyan-900",
    iconBg: "bg-cyan-100 dark:bg-cyan-900/30",
    iconColor: "text-cyan-700 dark:text-cyan-300",
    bar: "bg-gradient-to-r from-cyan-500 to-sky-500",
    label: "text-cyan-700 dark:text-cyan-300",
  },
};

export function DashboardContinueCard() {
  const { user } = useAuth();
  const { data } = useQuery<ContinueResponse>({
    queryKey: ["/api/me/continue"],
    enabled: !!user,
    staleTime: 30_000,
    // Don't retry — if the endpoint fails the card just hides
    retry: false,
  });

  const c = data?.continue;
  if (!c) return null;

  const Icon = ICONS[c.icon] ?? Sparkles;
  const styles = ACCENT_STYLES[c.accent] ?? ACCENT_STYLES.blue;
  const showProgress = typeof c.progressPercent === "number";

  return (
    <Link href={c.href}>
      <Card
        className={`mb-4 cursor-pointer hover:shadow-lg transition-all overflow-hidden ${styles.card}`}
        data-testid="card-continue"
      >
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className={`shrink-0 p-2.5 rounded-full ${styles.iconBg}`}>
              <Icon className={`h-5 w-5 ${styles.iconColor}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-[10px] font-semibold uppercase tracking-wider mb-0.5 ${styles.label}`}>
                Continue where you left off
              </div>
              <div className="font-bold text-sm mb-0.5 line-clamp-1">{c.headline}</div>
              <div className="text-xs text-muted-foreground line-clamp-1">{c.subhead}</div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>

          {showProgress && (
            <div className="mt-3">
              <div className="h-1.5 bg-background/60 rounded-full overflow-hidden">
                <div
                  className={`h-full ${styles.bar} transition-all`}
                  style={{ width: `${c.progressPercent}%` }}
                  data-testid="continue-progress"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
