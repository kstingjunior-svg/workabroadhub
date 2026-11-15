/**
 * Landing — Job-Seeker Toolkit (2026-11 redesign, Tony's mock-ups).
 *
 * Order: headline + free-CV CTA → featured free ATS card + tool grid →
 * real numbers (live from the database) → "without vs with checking".
 *
 * Honesty rules (VerifyX): tools SCREEN documents and point to the official
 * check — never "verify", "approve" or "confirm genuine". Every number is
 * real: live counts come from /api/public/live-activity; the offer-letter
 * findings are from 402 letters screened May–Jul 2026 (82 raised warning
 * signs; 34 asked the job-seeker to pay a fee or send money).
 */
import { Link } from "wouter";
import {
  ArrowRight, BadgeCheck, Briefcase, CheckCircle2, FileSearch, FileText, Globe2, FileCheck2, Mail,
  ShieldAlert, ShieldCheck, Sparkles, XCircle, Megaphone, CircleDollarSign, FileX2,
} from "lucide-react";
import { useLiveActivity } from "@/components/live-activity-feed";

// 2026-11 (Tony's 2nd mock-up): icon + title side by side, price pill,
// one-line benefit, solid coloured button. Copy stays honest — tools SCREEN
// and point to the official check; none "verifies authenticity".
const TOOLS = [
  { href: "/tools/job-scam-checker", testid: "link-tool-scam", icon: ShieldAlert, tone: "navy", price: "KES 100", title: "Check Job Scams",
    body: "Protect yourself. Spot scam signs in a job ad or agency message before you pay or engage.", cta: "Check Now" },
  { href: "/tools/visa-check", testid: "link-tool-visa-check", icon: Globe2, tone: "purple", price: "KES 100", title: "Screen a Visa",
    body: "Check the dates and details, and get the official link to confirm it.", cta: "Screen Now" },
  { href: "/tools/offer-check", testid: "link-tool-offer-check", icon: Mail, tone: "green", price: "KES 100", title: "Screen an Offer Letter",
    body: "Understand your offer. See red flags in the terms and the sender before you sign.", cta: "Screen Now" },
  { href: "/tools/visa-sponsorship-jobs", testid: "link-tool-jobs", icon: Briefcase, tone: "blue", price: null, title: "Find Visa Sponsorship Jobs",
    body: "Discover overseas jobs that offer visa sponsorship.", cta: "Search Jobs" },
  { href: "/tools/ielts-verify", testid: "link-tool-ielts-verify", icon: FileCheck2, tone: "orange", price: "KES 100", title: "Check an IELTS Result",
    body: "Screen your Test Report Form for inconsistencies, with the official way to confirm it.", cta: "Check Now" },
] as const;

const TONE: Record<string, { icon: string; pill: string; btn: string }> = {
  navy:   { icon: "bg-blue-600 text-white",    pill: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",         btn: "bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600" },
  purple: { icon: "bg-violet-600 text-white",  pill: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",   btn: "bg-violet-600 hover:bg-violet-700" },
  green:  { icon: "bg-emerald-600 text-white", pill: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300", btn: "bg-emerald-600 hover:bg-emerald-700" },
  blue:   { icon: "bg-blue-600 text-white",    pill: "bg-blue-50 text-blue-700",                                                   btn: "bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600" },
  orange: { icon: "bg-orange-500 text-white",  pill: "bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",   btn: "bg-orange-500 hover:bg-orange-600" },
};

function plus(n?: number) {
  if (!n) return "…";
  const step = n >= 1000 ? 100 : 10;
  return `${(Math.floor(n / step) * step).toLocaleString("en-KE")}+`;
}

const WITHOUT = [
  { icon: FileX2, title: "Rejected CV", body: "Your CV doesn't pass ATS filters and gets overlooked." },
  { icon: Megaphone, title: "Fake job ad", body: "The job disappears — or was never real." },
  { icon: ShieldAlert, title: "Scam warning missed", body: "Fees, data theft and suspicious requests." },
  { icon: CircleDollarSign, title: "Wasted money", body: "Lost agency fees, travel costs and false hopes." },
];
const WITH = [
  { icon: FileSearch, title: "ATS-ready CV", body: "See your score and exactly what to fix before you apply." },
  { icon: ShieldCheck, title: "Job ad screened", body: "Scam warning signs flagged before you pay anyone." },
  { icon: FileText, title: "Offer letter screened", body: "Red flags in the terms and employer, shown with evidence." },
  { icon: Globe2, title: "Visa checked", body: "Dates and details screened, plus the official link to confirm." },
];

export function LandingToolkit() {
  const { data } = useLiveActivity();
  const c = data?.counts ?? {};

  return (
    <section id="free-tools" className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-white via-emerald-50/40 to-white dark:from-slate-950 dark:via-emerald-950/10 dark:to-slate-950 border-y border-emerald-100 dark:border-emerald-900/30">
      <div className="max-w-6xl mx-auto">

        {/* Headline + primary CTA */}
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-14">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold uppercase tracking-wider">
            <ShieldCheck className="h-3.5 w-3.5" /> Check before you apply
          </span>
          <h2 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
            Stop losing overseas jobs to <span className="text-emerald-600 dark:text-emerald-400">ATS and scams</span>
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-300">
            Free ATS CV check + scam, visa &amp; offer-letter screening built for Kenyans. <strong className="text-slate-900 dark:text-white">From KES 100.</strong>
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/tools/ats-cv-checker" data-testid="link-toolkit-hero-cta"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-[52px] px-7 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base shadow-lg shadow-emerald-600/25 transition">
              <ShieldCheck className="h-5 w-5" /> Check My CV Free — 30 seconds
            </Link>
          </div>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            <strong className="text-slate-700 dark:text-slate-200">{plus(c.cvChecks)}</strong> CVs checked ·{" "}
            <strong className="text-slate-700 dark:text-slate-200">{plus((c.visaScreens ?? 0) + (c.offerScreens ?? 0))}</strong> visas &amp; offer letters screened
          </p>
        </div>

        {/* Tools — mock-up layout: featured free card + 5 tools in a 3-col grid */}
        <div className="rounded-3xl bg-slate-50/80 dark:bg-slate-900/40 border border-slate-200/70 dark:border-slate-800 p-4 sm:p-6 lg:p-8">
          <div className="text-center mb-6 sm:mb-8">
            <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">Everything you need before you apply</h3>
            <p className="mt-1 text-sm sm:text-base text-slate-500 dark:text-slate-400">Smart checks. Clear evidence. Better decisions.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Featured — always free */}
            <Link href="/tools/ats-cv-checker" data-testid="link-tool-ats"
              className="group sm:col-span-2 lg:col-span-1 rounded-2xl border-2 border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 p-5 sm:p-6 shadow-sm hover:shadow-xl transition flex flex-col">
              <div className="flex items-center gap-4">
                <span className="h-16 w-16 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-600/30"><FileSearch className="h-8 w-8" /></span>
                <div>
                  <h4 className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 leading-tight">Check ATS CV</h4>
                  <p className="text-base font-bold text-slate-700 dark:text-slate-200">— Always Free</p>
                </div>
              </div>
              <div className="my-4 h-px bg-emerald-200 dark:bg-emerald-900" />
              <p className="text-sm text-slate-700 dark:text-slate-300 flex-1">Beat the bots. See your ATS score and exactly what to fix so employers notice your CV.</p>
              <span className="mt-5 inline-flex items-center justify-center gap-2 min-h-[52px] rounded-xl bg-emerald-700 group-hover:bg-emerald-800 text-white font-bold text-base transition">
                <Sparkles className="h-5 w-5" /> Check My CV Now
              </span>
            </Link>

            {TOOLS.map((t) => {
              const tone = TONE[t.tone];
              const Icon = t.icon;
              return (
                <Link key={t.href} href={t.href} data-testid={t.testid}
                  className="group rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition flex flex-col">
                  <div className="flex items-center gap-3">
                    <span className={`h-12 w-12 rounded-full flex items-center justify-center shrink-0 ${tone.icon}`}><Icon className="h-6 w-6" /></span>
                    <h4 className="font-extrabold text-lg text-slate-900 dark:text-white leading-tight">{t.title}</h4>
                  </div>
                  {t.price && <span className={`mt-3 self-start rounded-full px-3 py-0.5 text-xs font-bold ${tone.pill}`}>{t.price}</span>}
                  <p className="mt-2 mb-4 text-sm text-slate-600 dark:text-slate-300 flex-1 leading-relaxed">{t.body}</p>
                  <span className={`self-start inline-flex items-center justify-center min-h-[44px] w-full sm:w-auto px-6 rounded-lg text-white text-sm font-bold transition ${tone.btn}`}>{t.cta}</span>
                </Link>
              );
            })}
          </div>

          {/* NEA licence strip */}
          <Link href="/nea-agencies" data-testid="link-tool-nea"
            className="group mt-4 mx-auto max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm hover:shadow-lg transition flex flex-col sm:flex-row sm:items-center gap-4">
            <span className="h-12 w-12 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center shrink-0"><ShieldCheck className="h-7 w-7" /></span>
            <div className="flex-1">
              <h4 className="font-extrabold text-lg text-slate-900 dark:text-white">Instant NEA Licence Check <span className="ml-1 align-middle rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-bold">FREE</span></h4>
              <p className="text-sm text-slate-600 dark:text-slate-300">Check any recruitment agency's licence against the NEA register in seconds — before you pay.</p>
            </div>
            <span className="inline-flex items-center justify-center min-h-[44px] px-6 rounded-lg bg-emerald-600 group-hover:bg-emerald-700 text-white text-sm font-bold transition">Check Now</span>
          </Link>
        </div>

        {/* Real numbers */}
        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { v: plus(c.cvChecks), l: "CVs checked for ATS" },
            { v: plus(c.scamChecks), l: "job-scam checks" },
            { v: plus(c.visaScreens), l: "visas & permits screened" },
            { v: plus(c.offerScreens), l: "offer letters screened" },
          ].map((s) => (
            <div key={s.l} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 text-center shadow-sm">
              <div className="text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">{s.v}</div>
              <div className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300">{s.l}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-2xl bg-slate-900 text-slate-200 p-5 sm:p-6 flex flex-col sm:flex-row gap-4 sm:items-center">
          <div className="text-4xl font-extrabold text-emerald-400 shrink-0">1 in 5</div>
          <p className="text-sm sm:text-base leading-relaxed">
            <strong className="text-white">offer letters screened showed warning signs</strong> — most often a sender email that didn't match the company,
            no named signatory, or a salary far above the going rate. <strong className="text-white">34 letters asked the job-seeker to pay a visa fee, a recruitment fee or send money.</strong>
          </p>
        </div>

        {/* Without vs with */}
        <h3 className="mt-16 text-center text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">With the right tools, you win.</h3>
        <div className="mx-auto mt-3 mb-8 h-1 w-16 rounded bg-emerald-500" />
        <div className="relative grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl overflow-hidden border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20">
            <div className="flex items-center gap-2 bg-red-600 text-white px-5 py-3 font-bold text-lg"><XCircle className="h-6 w-6" /> Without checking</div>
            {WITHOUT.map((r) => (
              <div key={r.title} className="flex gap-3 px-5 py-4 border-t border-red-100 dark:border-red-900/40 first:border-t-0">
                <span className="h-11 w-11 rounded-full bg-red-600 text-white flex items-center justify-center shrink-0"><r.icon className="h-5 w-5" /></span>
                <div><p className="font-bold text-red-700 dark:text-red-400">{r.title}</p><p className="text-sm text-slate-700 dark:text-slate-300">{r.body}</p></div>
              </div>
            ))}
          </div>
          <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-16 w-16 rounded-full bg-slate-900 text-white font-extrabold text-xl items-center justify-center ring-8 ring-white dark:ring-slate-950 z-10">VS</div>
          <div className="rounded-2xl overflow-hidden border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20">
            <div className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-3 font-bold text-lg"><CheckCircle2 className="h-6 w-6" /> After using the tools</div>
            {WITH.map((r) => (
              <div key={r.title} className="flex gap-3 px-5 py-4 border-t border-emerald-100 dark:border-emerald-900/40 first:border-t-0">
                <span className="h-11 w-11 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0"><r.icon className="h-5 w-5" /></span>
                <div><p className="font-bold text-emerald-700 dark:text-emerald-400">{r.title}</p><p className="text-sm text-slate-700 dark:text-slate-300">{r.body}</p></div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <p className="flex items-center gap-2 font-bold text-slate-900 dark:text-white"><BadgeCheck className="h-5 w-5 text-emerald-600" /> Check smarter. Apply safer. Get hired faster.</p>
          <Link href="/tools/ats-cv-checker" className="inline-flex items-center justify-center gap-2 min-h-[52px] w-full sm:w-auto px-8 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-lg shadow-emerald-600/25 transition">
            Check My CV Free — 30 seconds <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/tools" data-testid="link-all-tools" className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 hover:underline">See all tools →</Link>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xl">Screening tools show what can be checked, with evidence, and where to confirm the rest with the official authority. We don't have access to government databases. Counts are live from our records.</p>
        </div>
      </div>
    </section>
  );
}
