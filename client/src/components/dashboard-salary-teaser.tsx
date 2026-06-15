/**
 * Dashboard widget — surfaces a "what could you really earn abroad?" teaser
 * with three randomly-rotated salary comparisons. Tapped → opens /salary.
 *
 * Picks a single high-impact role (Nurse, Software Developer, Truck Driver,
 * etc.) and shows its top 3 destinations by KES. Rotation keeps the widget
 * feeling fresh on repeat dashboard visits.
 *
 * 2026-06 retention #2.
 */
import { useMemo } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Banknote, ArrowRight, TrendingUp } from "lucide-react";
import {
  SALARY_ROLES,
  NAIROBI_BENCHMARK_KES,
  compareRoleAcrossCountries,
} from "@shared/salary-intelligence";

const FEATURED_ROLES = [
  "nurse",
  "software_developer",
  "driver",
  "construction_skilled",
  "care_worker",
  "chef_cook",
  "teacher",
  "accountant",
];

function fmtKes(n: number): string {
  if (n >= 1_000_000) return `KES ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `KES ${(n / 1000).toFixed(0)}K`;
  return `KES ${n.toLocaleString("en-KE")}`;
}

export function DashboardSalaryTeaser() {
  // Pick a featured role deterministically per day so each user sees the
  // SAME teaser within a session but a different one each day they return.
  const today = useMemo(() => Math.floor(Date.now() / (1000 * 60 * 60 * 24)), []);
  const roleKey = FEATURED_ROLES[today % FEATURED_ROLES.length];
  const role = SALARY_ROLES.find((r) => r.key === roleKey);
  const top3 = useMemo(() => compareRoleAcrossCountries(roleKey).slice(0, 3), [roleKey]);
  const nairobi = NAIROBI_BENCHMARK_KES[roleKey] ?? null;

  if (!role || top3.length === 0) return null;

  const best = top3[0];
  const vsKenyaPct = nairobi
    ? Math.round(((best.monthlyMidKes - nairobi) / nairobi) * 100)
    : null;

  return (
    <Link href="/salary">
      <Card
        className="mb-4 cursor-pointer hover:shadow-md transition-all overflow-hidden bg-gradient-to-br from-emerald-500/10 via-blue-500/10 to-indigo-500/10 border-emerald-200 dark:border-emerald-900"
        data-testid="card-salary-teaser"
      >
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2 text-xs text-emerald-700 dark:text-emerald-400 font-semibold uppercase tracking-wider">
            <Banknote className="h-4 w-4" />
            What you could earn as a {role.label.toLowerCase()}
          </div>

          {/* Top 3 destinations strip */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {top3.map((c, idx) => (
              <div
                key={c.countryCode}
                className={`rounded-lg p-2 text-center ${
                  idx === 0
                    ? "bg-background border-2 border-emerald-300 dark:border-emerald-700"
                    : "bg-background/60 border border-border"
                }`}
              >
                <div className="text-xl">{c.countryFlag}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{c.countryName}</div>
                <div className="text-xs font-bold tabular-nums mt-0.5">
                  {fmtKes(c.monthlyMidKes)}<span className="text-[9px] text-muted-foreground font-normal">/mo</span>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom row */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              {vsKenyaPct !== null ? (
                <>
                  <TrendingUp className="h-3 w-3 text-emerald-600" />
                  <span><strong className="text-emerald-700 dark:text-emerald-400">{vsKenyaPct > 0 ? "+" : ""}{vsKenyaPct}%</strong> vs Nairobi</span>
                </>
              ) : (
                <span>All 9 destinations · 13 roles</span>
              )}
            </div>
            <div className="inline-flex items-center gap-1 font-semibold text-primary">
              Compare all <ArrowRight className="h-3 w-3" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
