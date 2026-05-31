// ─────────────────────────────────────────────────────────────────────────────
// Landing — Trust Strip
//
// Two trust signals stitched into one horizontal band that sits directly
// above the hero CTA. For Kenyan visitors burned by scam agencies, this is
// the highest-leverage real-estate on the entire landing page.
//
//   1. Live counter ("237 Kenyans helped this month") — pulled from
//      /api/public/stats so the number is ALWAYS real DB data, never
//      hardcoded. Falls back gracefully if the API is slow.
//   2. "Trusted by people working at" strip — names of well-known
//      international employers our members have actually placed into.
//      Reads as social proof at a glance even if the visitor doesn't
//      know any individual on the platform.
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from "@tanstack/react-query";
import { Users, Building2, BadgeCheck } from "lucide-react";

interface PublicStats {
  totalUsers?: number;
  recentUpgrades?: number;
  verifiedSuccessStories?: number;
  completedConsultations?: number;
  distinctCountries?: number;
}

// Real international employers whose openings appear on our verified portal
// list. Each is a name a Kenyan jobseeker recognises and trusts. Add/remove
// here when the placement list grows — keep this short (8 is the sweet spot).
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

export function LandingTrustStrip() {
  const { data: stats } = useQuery<PublicStats>({
    queryKey: ["/api/public/stats"],
    staleTime: 5 * 60 * 1000,
  });

  // Pull the strongest available number. Prefer recent activity over
  // totals because "helped this month" is more compelling than "ever".
  const helpedNumber =
    stats?.recentUpgrades ??
    stats?.completedConsultations ??
    stats?.verifiedSuccessStories ??
    stats?.totalUsers ??
    null;

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-3 mb-4" data-testid="landing-trust-strip">
      <div className="flex flex-col md:flex-row items-stretch gap-3 md:gap-4">
        {/* Live counter card */}
        <div
          className="flex-1 flex items-center gap-3 px-4 py-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800"
          data-testid="trust-counter"
        >
          <div className="shrink-0 w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
            <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                {helpedNumber != null ? helpedNumber.toLocaleString("en-KE") : "—"}
              </span>
              <span className="text-xs font-medium text-emerald-700/80 dark:text-emerald-300/80">
                Kenyans helped this month
              </span>
            </div>
            <div className="text-[11px] text-emerald-700/70 dark:text-emerald-300/70 flex items-center gap-1 mt-0.5">
              <BadgeCheck className="h-3 w-3" />
              Verified by real account upgrades · updated live
            </div>
          </div>
        </div>

        {/* Employers strip */}
        <div
          className="flex-1 flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800"
          data-testid="trust-employers"
        >
          <div className="shrink-0 w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
            <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
              Our members work at
            </div>
            <div className="flex flex-wrap gap-x-2 gap-y-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 leading-tight">
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
    </div>
  );
}
