/**
 * School Recruitment banner for the Kenya Careers page (2026-10).
 * Built as a real responsive component (no promo image as background).
 * The school building is inline SVG — crisp on any screen, zero network cost.
 */
import { Link } from "wouter";
import { ArrowRight, CheckCircle2 } from "lucide-react";

function SchoolIllustration({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 220" className={className} role="img" aria-label="Illustration of a school building">
      <defs>
        <linearGradient id="srb-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e0f2fe" />
          <stop offset="1" stopColor="#f0fdf4" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="320" height="220" rx="20" fill="url(#srb-sky)" />
      <circle cx="262" cy="46" r="18" fill="#fdba74" opacity="0.85" />
      {/* ground */}
      <rect x="0" y="182" width="320" height="38" fill="#bbf7d0" />
      <path d="M0 186 Q80 176 160 186 T320 184 V220 H0 Z" fill="#86efac" opacity="0.6" />
      {/* trees */}
      <circle cx="38" cy="150" r="22" fill="#22c55e" /><rect x="35" y="160" width="6" height="26" fill="#78350f" />
      <circle cx="286" cy="152" r="20" fill="#16a34a" /><rect x="283" y="162" width="6" height="24" fill="#78350f" />
      {/* main block */}
      <rect x="70" y="96" width="180" height="90" rx="4" fill="#ffffff" stroke="#1e3a8a" strokeWidth="2.5" />
      {/* roof */}
      <path d="M60 100 L160 52 L260 100 Z" fill="#1d4ed8" />
      <path d="M60 100 L160 52 L260 100" fill="none" stroke="#1e3a8a" strokeWidth="2.5" strokeLinejoin="round" />
      {/* clock / crest */}
      <circle cx="160" cy="80" r="11" fill="#fff" stroke="#1e3a8a" strokeWidth="2" />
      <path d="M160 74 V80 L164 83" stroke="#1e3a8a" strokeWidth="2" strokeLinecap="round" fill="none" />
      {/* flag */}
      <line x1="160" y1="52" x2="160" y2="26" stroke="#334155" strokeWidth="2" />
      <rect x="160" y="26" width="22" height="5" fill="#111827" />
      <rect x="160" y="31" width="22" height="2" fill="#ffffff" />
      <rect x="160" y="33" width="22" height="5" fill="#b91c1c" />
      <rect x="160" y="38" width="22" height="2" fill="#ffffff" />
      <rect x="160" y="40" width="22" height="5" fill="#15803d" />
      {/* windows */}
      {[88, 118, 190, 220].map((x) => (
        <g key={x}>
          <rect x={x} y="112" width="20" height="18" rx="2" fill="#bfdbfe" stroke="#1e3a8a" strokeWidth="1.5" />
          <rect x={x} y="146" width="20" height="18" rx="2" fill="#bfdbfe" stroke="#1e3a8a" strokeWidth="1.5" />
        </g>
      ))}
      {/* door */}
      <rect x="146" y="140" width="28" height="46" rx="3" fill="#f97316" />
      <circle cx="168" cy="165" r="1.8" fill="#7c2d12" />
      {/* steps */}
      <rect x="138" y="186" width="44" height="5" fill="#cbd5e1" />
      {/* books */}
      <g transform="translate(244 160)">
        <rect x="0" y="12" width="30" height="7" rx="1.5" fill="#2563eb" />
        <rect x="3" y="5" width="26" height="7" rx="1.5" fill="#16a34a" />
        <rect x="1" y="-2" width="28" height="7" rx="1.5" fill="#f97316" />
      </g>
    </svg>
  );
}

export function SchoolRecruitmentBanner({ onBrowse }: { onBrowse?: () => void }) {
  const benefits = [
    "Reach qualified candidates",
    "Create a school employer profile",
    "Publish teaching and non-teaching vacancies",
    "Manage applications in one place",
  ];
  return (
    <section
      aria-labelledby="srb-heading"
      className="relative overflow-hidden rounded-2xl border border-blue-100 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm"
      data-testid="school-recruitment-banner"
    >
      <div className="grid md:grid-cols-[1.25fr_1fr] gap-6 p-5 sm:p-7 items-center">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-emerald-700 dark:text-emerald-400">FOR SCHOOLS IN KENYA</p>
          <h2 id="srb-heading" className="mt-1.5 text-2xl sm:text-3xl font-bold tracking-tight text-blue-950 dark:text-white">
            Post Your Job Vacancies
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
            Reach qualified teachers, school administrators, support staff, and education professionals across Kenya.
          </p>
          <ul className="mt-4 grid sm:grid-cols-2 gap-x-4 gap-y-2">
            {benefits.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
                {b}
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-col sm:flex-row gap-2.5">
            <Link href="/kenya-careers/schools" className="inline-flex items-center justify-center gap-1.5 h-12 px-5 rounded-full bg-blue-700 hover:bg-blue-800 text-white font-semibold text-[15px] shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2" data-testid="btn-post-school-vacancy">
              Post a School Vacancy <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={onBrowse}
              className="inline-flex items-center justify-center h-12 px-5 rounded-full border border-emerald-600 text-emerald-700 dark:text-emerald-300 font-semibold text-[15px] hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
              data-testid="btn-browse-school-jobs"
            >
              Browse School Jobs
            </button>
          </div>
        </div>
        <div className="hidden sm:block">
          <SchoolIllustration className="w-full h-auto max-w-sm mx-auto drop-shadow-sm" />
        </div>
      </div>
      <div className="h-1 w-full bg-gradient-to-r from-blue-600 via-emerald-500 to-orange-400" aria-hidden="true" />
    </section>
  );
}

export { SchoolIllustration };
