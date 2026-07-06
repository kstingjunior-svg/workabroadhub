/**
 * "How It Works" 3-step strip — sits directly under the hero on the
 * landing page. Three icon-led steps: Verify → Prepare → Apply Safely.
 *
 * Strategic role:
 *   Reduces decision paralysis by showing the platform is a simple,
 *   structured 3-step path. Reinforces the "verify-first" framing
 *   established by the hero CTA. Ends with a social-proof line
 *   ("147 verified job seekers guided last month") so the strip
 *   doubles as trust signal + process map.
 */
import { Shield, FileText, Send, Star } from "lucide-react";

// 2026-06: rewritten to sound like a Kenyan friend, not a faceless startup.
// No "AI", no "ATS" jargon, no "Simple 3-step process" template-speak.
const STEPS = [
  {
    n: 1,
    icon: Shield,
    title: "Check the agency first",
    body: "Before you pay anyone a single shilling — search them here. Live NEAIMS registry, blacklist, fake-licence warnings. Free, takes 10 seconds.",
    accent: "from-emerald-500 to-teal-500",
    chipColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  {
    n: 2,
    icon: FileText,
    title: "Get your CV recruiter-friendly",
    body: "Country-specific CV templates, document checklists, cover letters that get read. From KES 99 (about the price of two mandazi).",
    accent: "from-amber-500 to-orange-500",
    chipColor: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  },
  {
    n: 3,
    icon: Send,
    title: "Apply — without the middlemen",
    body: "Apply straight through the employer or a verified portal link. No 'facilitation fees.' No agency cut. No surprises.",
    accent: "from-blue-500 to-indigo-500",
    chipColor: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  },
];

export function LandingHowItWorks() {
  return (
    <section
      id="how-it-works"
      className="py-16 px-4 sm:px-6 lg:px-8 bg-white dark:bg-gray-950"
      aria-label="How WorkAbroad Hub works"
    >
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold uppercase tracking-wide">
            We've been where you are
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mt-4 leading-tight">
            So you want to work abroad? Let's get you there.
          </h2>
          <p className="text-base text-gray-600 dark:text-gray-400 mt-2 max-w-xl mx-auto">
            We've broken it down so even your mum could follow it. No agent meetings. No mystery fees. Just the order we did it ourselves.
          </p>
        </div>

        {/* 3 step cards */}
        <div className="grid sm:grid-cols-3 gap-4 sm:gap-6">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="relative rounded-2xl bg-gradient-to-br from-slate-50 to-white dark:from-gray-900 dark:to-gray-950 border border-slate-200 dark:border-gray-800 p-6 shadow-sm hover:shadow-md transition-shadow"
              data-testid={`hiw-step-${s.n}`}
            >
              {/* big number watermark */}
              <span
                aria-hidden
                className={`absolute top-4 right-5 text-5xl font-black bg-gradient-to-br ${s.accent} bg-clip-text text-transparent opacity-30 select-none leading-none`}
              >
                {s.n}
              </span>

              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${s.chipColor}`}>
                <s.icon className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{s.title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>

        {/* Social proof footer — 5 stars + count */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 text-sm text-gray-600 dark:text-gray-400 text-center">
          <div className="flex items-center gap-0.5" aria-label="5 star rating">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
            ))}
          </div>
          <span>
            <strong className="text-gray-900 dark:text-white">147+ verified</strong> Kenyan job seekers guided last month
          </span>
        </div>
      </div>
    </section>
  );
}
