/**
 * "Our Promise" — friendly reframe of the legal disclaimer.
 *
 * The current page has a defensive yellow alert box screaming
 * "WorkAbroad Hub is NOT a recruitment agency." Useful information
 * but emotionally cold and defensive. This version turns it into a
 * warm "promise" card that says the same thing in a way that builds
 * trust instead of triggering doubt.
 *
 * Three soft-shadow bullet rows, slate-gray text, emerald accents.
 * Lives between the hero and the testimonial section.
 */
import { CheckCircle2, HandHeart, Compass } from "lucide-react";

const PROMISES = [
  {
    icon: HandHeart,
    title: "We're not a recruitment agency.",
    body: "We don't charge placement fees, process visas, or interview anyone. We give you the tools to do those things safely yourself.",
  },
  {
    icon: CheckCircle2,
    title: "We verify before we recommend.",
    body: "Every agency we mention is checked against the live NEA registry. Every portal we link to is hand-picked from official employer sites — not directories.",
  },
  {
    icon: Compass,
    title: "We guide, you decide.",
    body: "Personal WhatsApp consultation, country-specific CV templates, and scam-detection tools. You're always the one who applies — directly, on the real employer's site.",
  },
];

export function LandingOurPromise() {
  return (
    <section className="py-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-emerald-50/40 to-white dark:from-emerald-950/10 dark:to-gray-950">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white dark:bg-gray-900 text-emerald-700 dark:text-emerald-300 text-xs font-bold uppercase tracking-wide shadow-sm border border-emerald-200 dark:border-emerald-900/50">
            💛 Our Promise
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mt-3">
            We work for you — not for agencies.
          </h2>
        </div>

        <div className="space-y-3">
          {PROMISES.map((p, i) => (
            <div
              key={i}
              className="flex items-start gap-4 p-5 rounded-2xl bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 shadow-sm"
              data-testid={`promise-${i}`}
            >
              <div className="shrink-0 w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
                <p.icon className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-base text-gray-900 dark:text-white mb-1">{p.title}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{p.body}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-center text-gray-500 dark:text-gray-500 mt-6 italic">
          WorkAbroad Hub is a Kenya-based career consultation and verification service. The KES 4,500 fee covers personalized guidance and resource access — not job placement.
        </p>
      </div>
    </section>
  );
}
