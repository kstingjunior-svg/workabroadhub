/**
 * Landing — "For Licensed Agencies" (2026-11 light redesign, Tony's mock-up).
 *
 * Breakpoints (Tailwind, mobile-first):
 *   base   < 640px   stacked: text → CTA (kept high) → profile card → features → stats
 *   sm ≥ 640px       feature cards 3-up
 *   lg ≥ 1024px      two columns: pitch + CTA left, profile preview + stats right
 *
 * Numbers are live (same endpoints as the licence checker), never typed in.
 * The profile card is a PREVIEW of what an agency gets — no invented agency,
 * job counts, clients or ratings.
 */
import { Link } from "wouter";
import { ArrowRight, BadgeCheck, BarChart3, Building2, Globe2, ShieldCheck, TrendingUp } from "lucide-react";

interface Props {
  agencyTotal: string;
  agencyValid: string;
  agencyExpired: string;
  countries: number;
}

const FEATURES = [
  { icon: BadgeCheck, title: "Verified Badge", body: "A blue Verified Partner badge job-seekers see when they check your licence." },
  { icon: TrendingUp, title: "Priority Listing", body: "Appear higher in the agency directory and get seen first." },
  { icon: BarChart3, title: "Analytics", body: "Track profile views and clicks from job-seekers." },
];

export function LandingAgencyCta({ agencyTotal, agencyValid, agencyExpired, countries }: Props) {
  return (
    <section className="relative overflow-hidden py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-50 via-cyan-50/40 to-white dark:from-slate-950 dark:via-cyan-950/10 dark:to-slate-950 border-y border-slate-200 dark:border-slate-800" data-testid="landing-agency-cta">
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-teal-300/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl" />

      <div className="relative max-w-6xl mx-auto grid gap-10 lg:grid-cols-2 lg:items-center">
        {/* Pitch */}
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-teal-200 dark:border-teal-800 bg-white/80 dark:bg-slate-900 px-3 py-1 text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">
            <Building2 className="h-3.5 w-3.5" /> For Licensed Agencies
          </span>
          <h2 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
            Get found by <span className="text-teal-600 dark:text-teal-400">Kenyan job seekers</span> actively browsing.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
            Stand out from <strong className="text-slate-900 dark:text-white">{agencyExpired} expired-licence agencies</strong>. Get a verified badge,
            priority placement among <strong className="text-slate-900 dark:text-white">{agencyValid} active listings</strong>, and direct contact from Kenyan job-seekers.
          </p>

          <div className="mt-7 flex flex-col sm:flex-row sm:items-center gap-3">
            <Link href="/agency-portal" data-testid="button-hero-agency-claim"
              className="inline-flex items-center justify-center gap-2 min-h-[56px] px-7 rounded-2xl bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white text-lg font-extrabold shadow-lg shadow-teal-500/30 transition">
              Claim my agency profile <ArrowRight className="h-5 w-5" />
            </Link>
            <span className="inline-flex items-center justify-center rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-200 px-4 py-2 text-sm font-bold">Free to list</span>
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
            <ShieldCheck className="h-4 w-4 text-teal-600" />
            Free to list <span className="text-slate-300">•</span> Verification in 24h <span className="text-slate-300">•</span> Verified Partner from KES 5,000/month
          </p>
        </div>

        {/* Profile preview + features + stats */}
        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 backdrop-blur p-5 sm:p-6 shadow-xl shadow-slate-900/5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="h-12 w-12 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-500 text-white flex items-center justify-center shadow-md"><Building2 className="h-6 w-6" /></span>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-teal-600 dark:text-teal-400">Premium agency profile · preview</p>
                  <p className="text-lg font-extrabold text-slate-900 dark:text-white">Your Agency Name</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Licensed recruitment agency · Kenya</p>
                </div>
              </div>
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-blue-600 text-white px-2.5 py-1 text-[11px] font-bold"><BadgeCheck className="h-3.5 w-3.5" /> Verified Partner</span>
            </div>
            <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800 text-sm text-slate-700 dark:text-slate-300">
              <li className="py-2.5 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-teal-600" /> Licence checked against Kenya's NEA register</li>
              <li className="py-2.5 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-teal-600" /> Priority placement in the agency directory</li>
              <li className="py-2.5 flex items-center gap-2"><Globe2 className="h-4 w-4 text-teal-600" /> Seen by Kenyans looking for work abroad</li>
            </ul>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
                <f.icon className="h-6 w-6 text-teal-600 dark:text-teal-400" />
                <p className="mt-2 font-bold text-slate-900 dark:text-white">{f.title}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 flex items-center gap-3 shadow-sm">
              <span className="h-11 w-11 rounded-full bg-teal-50 dark:bg-teal-950/40 text-teal-600 flex items-center justify-center"><Building2 className="h-5 w-5" /></span>
              <div><p className="text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">{agencyTotal}</p><p className="text-xs text-slate-500 dark:text-slate-400">Agencies listed</p></div>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 flex items-center gap-3 shadow-sm">
              <span className="h-11 w-11 rounded-full bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 flex items-center justify-center"><Globe2 className="h-5 w-5" /></span>
              <div><p className="text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">{countries}</p><p className="text-xs text-slate-500 dark:text-slate-400">Countries covered</p></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
