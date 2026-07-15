/**
 * Final CTA section — the closing argument before the footer.
 *
 * Combines: urgency badge ("Limited slots this week"), benefit recap,
 * dual payment-method buttons (M-Pesa + Card), and a one-line clarity
 * statement about what the user gets immediately.
 *
 * Strategic role: this is the page's last chance to convert. Visitors
 * who scrolled this far are warm — they need a clear, low-friction
 * push with social proof and concrete value, not more arguments.
 */
import { Sparkles, MessageCircle, CreditCard, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";

interface LandingFinalCtaProps {
  /** Called when user clicks "Start now". Lets the parent open the signup modal. */
  onStartClick?: () => void;
}

export function LandingFinalCta({ onStartClick }: LandingFinalCtaProps) {
  return (
    <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white dark:bg-gray-950">
      <div className="max-w-4xl mx-auto">
        <div
          className="rounded-3xl bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-emerald-950/40 dark:via-gray-900 dark:to-teal-950/40 border border-emerald-200 dark:border-emerald-900/40 shadow-xl shadow-emerald-100 dark:shadow-emerald-950/20 p-8 sm:p-12 text-center"
          data-testid="landing-final-cta"
        >
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 text-xs font-bold uppercase tracking-wide animate-pulse">
            <Sparkles className="h-3 w-3" />
            Limited consultation slots this week
          </span>

          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mt-5 leading-tight">
            Ready to work abroad — <span className="text-emerald-700 dark:text-emerald-400">safely</span>?
          </h2>

          <p className="text-base sm:text-lg text-gray-700 dark:text-gray-300 mt-3 max-w-2xl mx-auto leading-relaxed">
            Skip fake agencies. Get verified portals, recruitment agency licence checker, CV templates, and 1-on-1 WhatsApp guidance — at{" "}
            <strong className="text-gray-900 dark:text-white">your own pace</strong>.
          </p>

          {/* 2026-06: surface all 4 tiers so users see Free + KES 99 + KES 1,000
              + KES 4,500 BEFORE they get the M-Pesa STK prompt. Founder feedback:
              too many cancellations because only the KES 4,500 figure was
              visible on the landing CTA. */}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-2xl mx-auto text-[11px]">
            <div className="rounded-xl bg-white/70 dark:bg-gray-900/50 border border-emerald-200 dark:border-emerald-900/40 px-3 py-2">
              <div className="font-bold text-base text-gray-900 dark:text-white">Free</div>
              <div className="text-gray-500 dark:text-gray-400">Browse & preview</div>
            </div>
            <div className="rounded-xl bg-white/70 dark:bg-gray-900/50 border border-emerald-200 dark:border-emerald-900/40 px-3 py-2">
              <div className="font-bold text-base text-gray-900 dark:text-white">KES 99</div>
              <div className="text-gray-500 dark:text-gray-400">1 Day full access</div>
            </div>
            <div className="rounded-xl bg-blue-50 dark:bg-blue-950/40 border-2 border-blue-400 dark:border-blue-600 px-3 py-2 ring-2 ring-blue-200/40 dark:ring-blue-900/30">
              <div className="font-bold text-base text-blue-700 dark:text-blue-300">KES 1,000</div>
              <div className="text-gray-700 dark:text-gray-300">1 Month — popular</div>
            </div>
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 px-3 py-2">
              <div className="font-bold text-base text-amber-700 dark:text-amber-300">KES 4,500</div>
              <div className="text-gray-700 dark:text-gray-300">1 Year · save 7,500</div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center items-center">
            <button
              onClick={onStartClick}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-7 py-4 rounded-xl text-base shadow-lg shadow-emerald-600/30 transition-colors"
              data-testid="final-cta-start"
            >
              <MessageCircle className="h-5 w-5" />
              Start free — choose your plan
            </button>
            <Link
              href="/pricing"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white dark:bg-gray-800 hover:bg-slate-50 dark:hover:bg-gray-700 text-emerald-700 dark:text-emerald-300 font-semibold px-6 py-4 rounded-xl text-base border-2 border-emerald-200 dark:border-emerald-900/40 transition-colors"
              data-testid="final-cta-pricing"
            >
              <CreditCard className="h-5 w-5" />
              See all 4 plans
            </Link>
          </div>

          {/* What you get NOW */}
          <div className="mt-7 inline-flex items-start gap-2 px-4 py-3 rounded-xl bg-white/70 dark:bg-gray-900/50 text-left text-sm text-gray-700 dark:text-gray-300 max-w-2xl mx-auto">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              <strong className="text-gray-900 dark:text-white">What you get immediately:</strong> live agency licence verification, 30+ verified portals, 6 country-specific CV templates, and a 30-minute 1-on-1 WhatsApp session with an advisor.
            </span>
          </div>

          <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-5 italic max-w-xl mx-auto">
            WorkAbroad Hub is not a recruitment agency. We provide verification tools and consultation. All job applications are made directly by you on official employer websites.
          </p>
        </div>
      </div>
    </section>
  );
}
