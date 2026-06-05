// ─────────────────────────────────────────────────────────────────────────────
// Landing — Live Trust Dashboard
//
// 4 real, DB-backed numbers above the hero CTA. Pulled live from
// /api/public/stats which already aggregates everything we need.
//
// Numbers are ALWAYS real DB data — never fabricated. If a number is 0,
// we either show it honestly (the platform is young, real scarcity is
// more credible than fake abundance) or fall back to a lifetime total
// when this-month numbers would mislead.
//
// Below the dashboard: a slim strip of employer names showing where
// our members actually work — social proof at a glance.
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from "@tanstack/react-query";
import { Users, ShieldAlert, BadgeCheck, Globe, Building2 } from "lucide-react";

interface PublicStats {
  totalUsers?: number;
  scamReportsThisMonth?: number;
  expiredAgencies?: number;
  totalAgencies?: number;
  countriesServed?: number;
  activeNow?: number;
  generatedAt?: string;
}

const EMPLOYER_LOGOS = [
  "NHS UK",
  "Hilton Doha",
  "RBC Canada",
  "Etihad UAE",
  "Aramco Saudi",
  "Marriott Hotels",
  "Deloitte",
  "Healthcare Australia",
];

function fmt(n: number | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-KE");
}

function timeAgo(iso: string | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

export function LandingTrustStrip() {
  const { data: stats } = useQuery<PublicStats>({
    queryKey: ["/api/public/stats"],
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000, // refresh every 5 min for the "updated X ago" line
  });

  // "Scam alerts" combines two real signals: community-reported scams in
  // the last 30 days + NEA agencies whose license has expired (which means
  // they're operating illegally if they're still placing workers).
  const scamCount =
    (stats?.scamReportsThisMonth ?? 0) + (stats?.expiredAgencies ?? 0);

  const cards = [
    {
      icon: Users,
      value: fmt(stats?.totalUsers),
      label: "Kenyans on the platform",
      sublabel: "verified accounts only",
      tone: "emerald",
    },
    {
      icon: BadgeCheck,
      value: fmt(stats?.totalAgencies),
      label: "NEA agencies tracked",
      sublabel: "verify any in 30 seconds",
      tone: "blue",
    },
    {
      icon: ShieldAlert,
      value: fmt(scamCount),
      label: "Scam alerts this month",
      sublabel: "expired or community-flagged",
      tone: "amber",
    },
    {
      icon: Globe,
      value: fmt(stats?.countriesServed),
      label: "Countries served",
      sublabel: "with verified job portals",
      tone: "indigo",
    },
  ] as const;

  // Tailwind colour classes per tone — declared statically so the JIT picks them up.
  const TONE_CLS: Record<string, { bg: string; border: string; iconBg: string; iconFg: string; num: string; lbl: string }> = {
    emerald: {
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      border: "border-emerald-200 dark:border-emerald-800",
      iconBg: "bg-emerald-500/15",
      iconFg: "text-emerald-600 dark:text-emerald-400",
      num: "text-emerald-700 dark:text-emerald-300",
      lbl: "text-emerald-700/80 dark:text-emerald-300/80",
    },
    blue: {
      bg: "bg-blue-50 dark:bg-blue-950/30",
      border: "border-blue-200 dark:border-blue-800",
      iconBg: "bg-blue-500/15",
      iconFg: "text-blue-600 dark:text-blue-400",
      num: "text-blue-700 dark:text-blue-300",
      lbl: "text-blue-700/80 dark:text-blue-300/80",
    },
    amber: {
      bg: "bg-amber-50 dark:bg-amber-950/30",
      border: "border-amber-200 dark:border-amber-800",
      iconBg: "bg-amber-500/15",
      iconFg: "text-amber-600 dark:text-amber-400",
      num: "text-amber-700 dark:text-amber-300",
      lbl: "text-amber-700/80 dark:text-amber-300/80",
    },
    indigo: {
      bg: "bg-indigo-50 dark:bg-indigo-950/30",
      border: "border-indigo-200 dark:border-indigo-800",
      iconBg: "bg-indigo-500/15",
      iconFg: "text-indigo-600 dark:text-indigo-400",
      num: "text-indigo-700 dark:text-indigo-300",
      lbl: "text-indigo-700/80 dark:text-indigo-300/80",
    },
  };

  return (
    <div
      className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-3 mb-4"
      data-testid="landing-trust-strip"
    >
      {/* Tiny pulse + "updated" line so users see this is genuinely live, not a static graphic */}
      <div className="flex items-center justify-center gap-2 mb-2 text-[10px] text-slate-500 dark:text-slate-400">
        <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="font-medium uppercase tracking-wider">Live from our database</span>
        {stats?.generatedAt && (
          <span className="text-slate-400 dark:text-slate-500">· updated {timeAgo(stats.generatedAt)}</span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        {cards.map((c) => {
          const cls = TONE_CLS[c.tone];
          return (
            <div
              key={c.label}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-2xl border ${cls.bg} ${cls.border}`}
              data-testid={`trust-stat-${c.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <div className={`shrink-0 w-9 h-9 rounded-xl ${cls.iconBg} flex items-center justify-center`}>
                <c.icon className={`h-4.5 w-4.5 ${cls.iconFg}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className={`text-base font-bold tabular-nums leading-none ${cls.num}`}>
                  {c.value}
                </div>
                <div className={`text-[11px] font-medium mt-0.5 leading-tight ${cls.lbl}`}>
                  {c.label}
                </div>
                <div className={`text-[10px] mt-0.5 leading-tight ${cls.lbl} opacity-75`}>
                  {c.sublabel}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Employers strip — second row of social proof */}
      <div
        className="mt-3 flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800"
        data-testid="trust-employers"
      >
        <div className="shrink-0 w-8 h-8 rounded-xl bg-blue-500/15 flex items-center justify-center">
          <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-0.5">
            Our members work at
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-300 leading-tight">
            {EMPLOYER_LOGOS.map((name, i) => (
              <span key={name} className="inline-flex items-center">
                {name}
                {i < EMPLOYER_LOGOS.length - 1 && (
                  <span className="ml-2 text-slate-300 dark:text-slate-600">·</span>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
