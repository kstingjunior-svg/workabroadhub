/**
 * Landing — Career services (2026-11 light redesign, Tony's mock-up).
 *
 * Breakpoints (Tailwind, mobile-first):
 *   base   < 640px   single column, Free card first, full-width 52px buttons
 *   sm ≥ 640px       paid cards 2-up under the Free card
 *   lg ≥ 1024px      Free card large on the left, three paid cards in a row
 *
 * Prices and routes are the live ones: CV Health Check (free ATS checker),
 * CV Revamp KES 99 (cv_fix_lite), Write from Scratch KES 300 (own page),
 * SoP KES 999 (sop_writing). Anonymous checkout — no sign-up wall.
 */
import { Link, useLocation } from "wouter";
import { ArrowRight, Clock, FileCheck2, Gift, GraduationCap, PenLine, ShieldCheck, Star, Tag, Wand2, Zap } from "lucide-react";

const PAID = [
  {
    key: "cv_fix_lite", title: "CV Revamp", price: 99, icon: Wand2, badge: "MOST AFFORDABLE",
    blurb: "Grammar, formatting & structure cleaned up. Recruiter-ready. Word + PDF.",
    save: { label: "Typical typist", was: 1500 },
    cta: "Get my CV revamped", to: "/services/order/cv_fix_lite",
  },
  {
    key: "write_from_scratch", title: "Write from Scratch", price: 300, icon: PenLine, badge: null,
    blurb: "No CV to upload? Just tell us who you are. Covers CV/Resume, Cover Letter, Recruitment CV & Reference Letter — KES 300 each.",
    save: null,
    cta: "Choose & write from scratch", to: "/tools/write-from-scratch",
  },
  {
    key: "sop_writing", title: "SoP / Personal Statement", price: 999, icon: GraduationCap, badge: null,
    blurb: "For university & scholarship applications. Compelling, structured, tailored.",
    save: { label: "SoP consultant", was: 15000 },
    cta: "Draft my SoP", to: "/services/order/sop_writing",
  },
] as const;

const kes = (n: number) => `KES ${n.toLocaleString("en-KE")}`;

export function LandingCareerServices() {
  const [, navigate] = useLocation();

  return (
    <section id="career-services" className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-slate-50 dark:bg-slate-950 border-y border-slate-200 dark:border-slate-800">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-10">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
            Professional CV, Cover &amp; SoP — delivered in <span className="text-emerald-600 dark:text-emerald-400">3 minutes</span>
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-300">
            Pay by M-Pesa (Kenya) or PayPal (worldwide). Download as Word or PDF. No subscriptions, no upsells — pay only for what you need.
          </p>
        </div>

        <div className="grid gap-4 lg:gap-5 lg:grid-cols-[minmax(300px,1fr)_2fr] items-stretch">
          {/* FREE — dominant card */}
          <Link href="/tools/ats-cv-checker" data-testid="landing-service-card-cv-health-check"
            className="group rounded-3xl border-2 border-emerald-500 bg-gradient-to-b from-emerald-50 to-white dark:from-emerald-950/40 dark:to-slate-900 p-6 sm:p-8 shadow-lg shadow-emerald-600/10 hover:shadow-xl transition flex flex-col">
            <div className="flex items-start gap-4">
              <span className="h-16 w-16 rounded-2xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300 flex items-center justify-center shrink-0"><FileCheck2 className="h-9 w-9" /></span>
              <div>
                <h3 className="text-3xl sm:text-4xl font-extrabold uppercase leading-none text-slate-900 dark:text-white">CV Health<br /><span className="text-emerald-600 dark:text-emerald-400">Check</span></h3>
              </div>
            </div>
            <p className="mt-4 text-5xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">FREE</p>
            <div className="my-5 h-px bg-emerald-200 dark:bg-emerald-900" />
            <p className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white"><Clock className="h-6 w-6 text-emerald-600" /> 3 min</p>
            <p className="mt-3 text-base text-slate-700 dark:text-slate-300 flex-1">
              See what recruiters &amp; ATS think of your CV. Score, keyword gaps, formatting issues.
            </p>
            <span className="mt-6 inline-flex items-center justify-center gap-2 min-h-[56px] rounded-xl bg-emerald-700 group-hover:bg-emerald-800 text-white font-extrabold text-lg shadow-md transition" data-testid="btn-service-cv-health-check">
              <Gift className="h-5 w-5" /> Try it free
            </span>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-sm text-slate-600 dark:text-slate-400"><ShieldCheck className="h-4 w-4 text-emerald-600" /> No payment or card needed</p>
          </Link>

          {/* Paid cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PAID.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.key} className="relative rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm hover:shadow-lg transition flex flex-col text-center"
                  data-testid={`landing-service-card-${s.title.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
                  <span className="mx-auto h-14 w-14 rounded-full bg-emerald-600 text-white flex items-center justify-center"><Icon className="h-7 w-7" /></span>
                  <h3 className="mt-3 text-lg font-extrabold text-slate-900 dark:text-white leading-tight">{s.title}</h3>
                  {s.badge && (
                    <span className="mx-auto mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-600 text-white px-3 py-1 text-[11px] font-extrabold tracking-wide"><Star className="h-3 w-3 fill-current" /> {s.badge}</span>
                  )}
                  <div className="my-3 h-px bg-slate-200 dark:bg-slate-700" />
                  <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400">{kes(s.price)}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1"><Zap className="h-3 w-3" /> Delivered in 3 min</p>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 flex-1 leading-relaxed">{s.blurb}</p>
                  {s.save && (
                    <div className="mt-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 flex items-center gap-2 text-left">
                      <Tag className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>{s.save.label}: <span className="line-through">{kes(s.save.was)}</span> — you save <strong className="text-emerald-700 dark:text-emerald-400">{kes(s.save.was - s.price)}</strong></span>
                    </div>
                  )}
                  <button type="button" onClick={() => navigate(s.to)}
                    className="mt-4 inline-flex items-center justify-center gap-2 min-h-[48px] w-full rounded-xl border-2 border-emerald-600 text-emerald-700 dark:text-emerald-400 font-bold text-sm hover:bg-emerald-600 hover:text-white transition"
                    data-testid={`btn-service-${s.title.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
                    {s.cta} <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Trust bar */}
        <div className="mt-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          <span>📱 M-Pesa</span><span className="text-slate-300">•</span>
          <span>🅿️ PayPal</span><span className="text-slate-300">•</span>
          <span>💳 Card</span><span className="text-slate-300">•</span>
          <span>🔒 Refund within 24h if we can&apos;t deliver</span><span className="text-slate-300">•</span>
          <span>⚡ Delivered in 3 minutes</span>
        </div>
        <div className="mt-4 text-center">
          <Link href="/services" className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold hover:underline" data-testid="link-see-all-services">
            See all career services <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
