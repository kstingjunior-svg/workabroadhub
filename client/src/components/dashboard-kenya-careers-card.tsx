/**
 * Dashboard Kenya Careers card.
 *
 * 2026-06: Phase 1 entry-point on the main dashboard. Sits below the
 * Visa-Sponsored Jobs card so users see the natural pair: "Looking abroad?
 * Look here. Want local Kenyan jobs? Look here too."
 *
 * Pulls live stats from /api/local-jobs/stats so the card always reflects
 * what's actually open right now. Falls back gracefully if the endpoint
 * 404s (older deploys without Phase 1 wired).
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Briefcase, MapPin, BadgeCheck, ChevronRight, Building2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface Stats {
  totalJobs: number;
  totalEmployers: number;
  totalCounties: number;
}

export function DashboardKenyaCareersCard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/local-jobs/stats")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (!cancelled && data) setStats(data); })
      .catch(() => { /* silent — card still renders without stats */ });
    return () => { cancelled = true; };
  }, []);

  return (
    <Link href="/kenya-careers">
      <Card
        data-testid="dashboard-kenya-careers-card"
        className="cursor-pointer overflow-hidden border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-emerald-900/20 dark:via-gray-900 dark:to-teal-900/20 hover:shadow-md transition-all"
      >
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                  <Briefcase className="h-5 w-5" />
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-1.5 py-0.5 rounded">
                  New · Local
                </span>
              </div>

              <h3 className="font-semibold text-base leading-tight">Kenya Careers</h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Real jobs in Kenya — Naivas, Quickmart, Carrefour, Java House, hospitals.
                No visa needed. Browse free.
              </p>

              {stats && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    <strong className="text-foreground">{stats.totalEmployers}</strong> employers
                  </span>
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-3 w-3" />
                    <strong className="text-foreground">{stats.totalJobs}</strong> jobs
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    <strong className="text-foreground">{stats.totalCounties}</strong> counties
                  </span>
                  <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                    <BadgeCheck className="h-3 w-3" />
                    Verified employers
                  </span>
                </div>
              )}
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
