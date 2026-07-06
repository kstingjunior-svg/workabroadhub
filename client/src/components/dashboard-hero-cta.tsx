/**
 * Dashboard Hero CTA — "What do you need today?"
 *
 * Three big clickable cards at the top of the dashboard. Designed for
 * low-education Kenyan audience: simple words, big targets, clear price
 * anchors, instant routing to a specific action page.
 */
import { Link } from "wouter";
import { FileText, Globe, ShieldCheck, ArrowRight } from "lucide-react";

export function DashboardHeroCTA() {
  return (
    <section className="mb-6" aria-label="Quick service entry">
      <div className="text-center mb-4">
        <h2 className="text-xl sm:text-2xl font-bold text-foreground">
          What do you need today?
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Pick one — we'll take you straight there.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {/* 1. CV / Documents */}
        <Link
          href="/services"
          className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-white p-5 hover:shadow-xl hover:scale-[1.02] transition-all"
          data-testid="hero-cta-cv"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <FileText className="h-6 w-6" />
            </div>
            <span className="text-[10px] font-bold bg-white/20 px-2 py-1 rounded-full">FROM KES 99</span>
          </div>
          <h3 className="text-lg sm:text-xl font-bold mb-1">📝 Fix my CV</h3>
          <p className="text-sm text-white/90 mb-3 leading-snug">
            Recruiter-friendly CV, cover letter, SOP — in your inbox in minutes.
          </p>
          <div className="inline-flex items-center gap-1 text-sm font-semibold opacity-90 group-hover:opacity-100">
            Let's do this <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </div>
        </Link>

        {/* 2. Find a job */}
        <Link
          href="/global-opportunities"
          className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white p-5 hover:shadow-xl hover:scale-[1.02] transition-all"
          data-testid="hero-cta-jobs"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Globe className="h-6 w-6" />
            </div>
            <span className="text-[10px] font-bold bg-white/20 px-2 py-1 rounded-full">9 COUNTRIES</span>
          </div>
          <h3 className="text-lg sm:text-xl font-bold mb-1">🌍 Find me a job</h3>
          <p className="text-sm text-white/90 mb-3 leading-snug">
            UK, Canada, UAE, Australia, Saudi & more — employers who'll sponsor your visa.
          </p>
          <div className="inline-flex items-center gap-1 text-sm font-semibold opacity-90 group-hover:opacity-100">
            Find your next role <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </div>
        </Link>

        {/* 3. Verify Agency */}
        <Link
          href="/verify"
          className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 text-white p-5 hover:shadow-xl hover:scale-[1.02] transition-all"
          data-testid="hero-cta-verify"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <span className="text-[10px] font-bold bg-white/20 px-2 py-1 rounded-full">FREE</span>
          </div>
          <h3 className="text-lg sm:text-xl font-bold mb-1">🛡️ Is this agency legit?</h3>
          <p className="text-sm text-white/90 mb-3 leading-snug">
            Check any recruiter against 1,200+ NEAIMS-verified agencies before paying.
          </p>
          <div className="inline-flex items-center gap-1 text-sm font-semibold opacity-90 group-hover:opacity-100">
            Verify now <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </div>
        </Link>
      </div>
    </section>
  );
}
