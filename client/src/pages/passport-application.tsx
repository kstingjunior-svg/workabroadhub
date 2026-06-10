// ─────────────────────────────────────────────────────────────────────────────
// Passport Application — Kenya (eCitizen + Directorate of Immigration).
//
// What this page does:
//   - Walks any Kenyan through the EXACT step-by-step passport application
//     process via eCitizen (ecitizen.go.ke) and Immigration Services.
//   - Shows current fees, processing times, document checklist, and a
//     direct "Start on eCitizen" button.
//   - Gated behind Pro tier (KES 4,500/yr or KES 600/mo) — same paywall as
//     /student-visas. Free users see a teaser + upgrade CTA.
//
// Why we charge:
//   Pro tier unlocks all government-process step-by-step assistants:
//     - Visa application (UK, Canada, Australia, etc.)
//     - Student visa (USA, Canada, UK, AU, UAE, Germany)
//     - Passport application (this page)
//     - Work permit assistance (Kenyan migrants)
//   The KES 600/mo or 4,500/yr fee covers the curation + step-by-step
//   guidance. The government fees go directly to eCitizen, not to us.
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  CheckCircle2, ArrowRight, ExternalLink, Lock, Crown,
  FileText, CreditCard, Calendar, MapPin, Clock, AlertCircle,
} from "lucide-react";

interface UserPlan {
  planId: string | null;
}

const ECITIZEN_URL = "https://accounts.ecitizen.go.ke/en";
const IMMIGRATION_PASSPORT_URL = "https://immigration.ecitizen.go.ke";

// Exact passport fees as of 2026 (KES) — published by Directorate of
// Immigration Services. These get refreshed only when the government does.
const PASSPORT_FEES = [
  { label: "Ordinary Passport — 34 pages (Class A)", price: "KES 7,500", note: "Most common — work, study, holiday" },
  { label: "Ordinary Passport — 50 pages (Class B)", price: "KES 9,500", note: "Frequent travellers" },
  { label: "Ordinary Passport — 66 pages (Class C)", price: "KES 12,500", note: "Heavy travellers, multiple visas" },
  { label: "Diplomatic Passport (50 page)",           price: "KES 15,000", note: "Government officials only" },
  { label: "Mutilated Passport replacement",          price: "KES 20,000", note: "Penalty fee for damaged passport" },
  { label: "Lost Passport replacement",               price: "KES 20,000", note: "Penalty fee for lost passport" },
];

const REQUIRED_DOCUMENTS = [
  "Original National ID (and a clear scan)",
  "Recent coloured passport-size photo (white background, ears + forehead visible, no smile, no jewellery)",
  "Birth certificate (original + copy)",
  "Recommender's National ID (a Kenyan citizen who has known you 2+ years)",
  "If married & changing name: marriage certificate",
  "If renewing: previous passport (cancelled and returned)",
  "Parents' IDs (if you are under 18)",
];

const STEPS = [
  {
    n: 1,
    title: "Create or sign in to your eCitizen account",
    body: "Visit ecitizen.go.ke. If you don't have an account, register using your National ID number, full names exactly as they appear on your ID, your phone number and a working email. eCitizen will text and email you a verification code — enter it to activate.",
    cta: { label: "Open eCitizen", href: ECITIZEN_URL },
  },
  {
    n: 2,
    title: "Open the Directorate of Immigration Services",
    body: "From the eCitizen dashboard, click 'Directorate of Immigration Services'. You'll see options for passport, visa, foreigners, etc. Click 'Make Application' under 'Kenyan Passport'.",
  },
  {
    n: 3,
    title: "Pick the right passport class",
    body: "For 99% of Kenyans applying for travel or work abroad, choose the 34-page Class A ordinary passport at KES 7,500. Class B (50 pages) is worth the extra KES 2,000 if you'll get many visa stamps. Don't pick Diplomatic unless you genuinely qualify — they'll reject it.",
  },
  {
    n: 4,
    title: "Fill in the application form (carefully — typos cost weeks)",
    body: "Use names EXACTLY as on your National ID. Use the exact spelling and order. Add your parents' details, marital status, place of birth, occupation. Add a recommender (any Kenyan adult who has known you 2+ years — friend, pastor, employer). They'll need to confirm their phone is reachable.",
  },
  {
    n: 5,
    title: "Upload your photo and supporting documents",
    body: "Recent coloured photo — white background, no smile, no glasses, no head covering (unless religious). Upload a clear scan of your National ID (front + back), birth certificate, and any supporting docs. eCitizen accepts JPG or PDF, max 1 MB per file.",
  },
  {
    n: 6,
    title: "Pay the fee with M-Pesa (or card)",
    body: "On the payment screen, choose M-Pesa, Airtel Money, RTGS or Card. Enter your Safaricom number → you get an STK push on your phone → enter PIN → done. Save the receipt PDF — you'll print it.",
    cta: { label: "M-Pesa supported", href: undefined },
  },
  {
    n: 7,
    title: "Print the application form + payment receipt",
    body: "After payment, eCitizen generates a PDF application form. Print it. Print the payment receipt. You need both at your biometric appointment. If you don't own a printer, any cyber café will print for ~KES 50.",
  },
  {
    n: 8,
    title: "Book your biometric appointment",
    body: "Choose your nearest Immigration office: Nyayo House (Nairobi), Kisumu, Mombasa, Eldoret, Embu, or Kisii. Book the earliest available slot — they fill up fast. You can re-schedule once for free if needed.",
  },
  {
    n: 9,
    title: "Show up for biometrics (fingerprints + photo)",
    body: "Bring: printed application, printed receipt, original ID + birth certificate, original passport (if renewing), and KES 200 cash for the file folder (sold at the office). They take fingerprints, a fresh photo, and your signature. Arrive 30 min early.",
  },
  {
    n: 10,
    title: "Track and collect your passport",
    body: "Standard processing: 10 working days from biometrics. You'll get an SMS when ready. Collect at the same office where you did biometrics — bring your National ID. Optional: pay KES 200 for delivery via Posta if you can't pick up.",
  },
];

function PassportPaywall() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      <div className="rounded-3xl bg-gradient-to-br from-rose-600 via-red-600 to-amber-500 p-6 sm:p-8 text-white shadow-xl">
        <div className="text-5xl mb-3">🛂</div>
        <h1 className="text-2xl sm:text-3xl font-extrabold mb-2">
          Kenyan Passport Application
        </h1>
        <p className="text-sm sm:text-base text-white/90 leading-snug mb-5">
          Step-by-step eCitizen passport application — every form, every document,
          every fee, every appointment booking, every collection step. So you can
          do it yourself without paying an agent KES 5,000+ extra.
        </p>

        <div className="rounded-2xl bg-white/15 backdrop-blur-sm p-4 mb-5">
          <h2 className="font-bold text-sm uppercase tracking-wider mb-2 opacity-90">
            What's inside
          </h2>
          <ul className="space-y-1.5 text-sm">
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> Exact eCitizen click-by-click walkthrough (10 steps)</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> Document checklist with example formats</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> Current fees: Class A KES 7,500 / Class B 9,500 / Class C 12,500</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> Photo specs (so you don't get rejected)</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> Common rejection reasons + how to avoid them</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> Biometric appointment booking tips</li>
          </ul>
        </div>

        <div className="rounded-xl bg-black/20 p-3 text-sm mb-5">
          <div className="font-bold mb-0.5">KES 4,500 / year — or KES 600 / month</div>
          <div className="text-xs text-white/80 leading-snug">
            Same Pro plan also unlocks visa application, student visa, work
            permit assistant, NEA verification, WhatsApp support and job alerts.
          </div>
        </div>

        <Link
          href="/pricing"
          className="inline-flex items-center gap-2 bg-white text-rose-700 font-bold px-5 py-3 rounded-2xl hover:bg-rose-50 transition-colors shadow-lg"
          data-testid="passport-paywall-upgrade"
        >
          <Crown className="h-5 w-5" />
          Unlock passport guide — see plans
          <ArrowRight className="h-4 w-4" />
        </Link>

        <p className="mt-4 text-[11px] text-white/70 leading-snug">
          The KES 4,500 covers our Pro plan. Government passport fees
          (KES 7,500+) are paid separately on eCitizen — that money goes to the
          Kenya Government, not to us.
        </p>
      </div>

      <div className="mt-6 text-center">
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2">
          ← Back to dashboard
        </Link>
      </div>
    </main>
  );
}

export default function PassportApplication() {
  const { user } = useAuth();

  const { data: userPlan } = useQuery<UserPlan>({
    queryKey: ["/api/user/plan"],
    enabled: !!user,
    staleTime: 60_000,
  });

  const isPaidTier =
    !!userPlan && ["pro", "monthly", "trial"].includes(userPlan.planId ?? "");

  if (!user || !isPaidTier) {
    return <PassportPaywall />;
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-6 sm:py-10">
      {/* Hero */}
      <div className="rounded-3xl bg-gradient-to-br from-rose-600 via-red-600 to-amber-500 p-6 sm:p-8 text-white shadow-xl mb-6">
        <div className="flex items-start gap-4">
          <div className="text-5xl shrink-0">🛂</div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold mb-1 leading-tight">
              Apply for your Kenyan Passport
            </h1>
            <p className="text-sm sm:text-base text-white/90 leading-snug">
              Follow these 10 steps exactly. You'll be done with the online
              portion in under an hour, biometrics in one office visit, and
              collection in ~10 working days.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
          <div className="rounded-xl bg-white/15 px-3 py-2">
            <div className="text-white/70 uppercase tracking-wider text-[10px]">Process</div>
            <div className="font-bold text-sm">Online + 1 visit</div>
          </div>
          <div className="rounded-xl bg-white/15 px-3 py-2">
            <div className="text-white/70 uppercase tracking-wider text-[10px]">Cost (gov)</div>
            <div className="font-bold text-sm">KES 7,500+</div>
          </div>
          <div className="rounded-xl bg-white/15 px-3 py-2">
            <div className="text-white/70 uppercase tracking-wider text-[10px]">Time</div>
            <div className="font-bold text-sm">~10 work days</div>
          </div>
          <div className="rounded-xl bg-white/15 px-3 py-2">
            <div className="text-white/70 uppercase tracking-wider text-[10px]">Validity</div>
            <div className="font-bold text-sm">10 years</div>
          </div>
        </div>
      </div>

      {/* Required documents */}
      <section className="mb-6 rounded-2xl border border-rose-200 bg-rose-50/60 dark:bg-rose-950/20 dark:border-rose-900/40 p-5">
        <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
          <FileText className="h-5 w-5 text-rose-600" />
          Gather these documents first
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
          Have everything scanned and ready before you start — eCitizen times
          out after 20 minutes of inactivity.
        </p>
        <ul className="space-y-2 text-sm">
          {REQUIRED_DOCUMENTS.map((doc, i) => (
            <li key={i} className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-rose-600" />
              <span>{doc}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Fees table */}
      <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-900/40 p-5">
        <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-amber-600" />
          Government fees (paid on eCitizen)
        </h2>
        <div className="space-y-2">
          {PASSPORT_FEES.map((f, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="font-semibold text-sm">{f.label}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 leading-snug">{f.note}</div>
              </div>
              <div className="shrink-0 font-bold text-amber-700 dark:text-amber-300 whitespace-nowrap text-sm">
                {f.price}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
          Fees update when the government changes them. Pay only on eCitizen —
          do not pay anyone outside the portal claiming to "speed up" your
          application. That is fraud.
        </p>
      </section>

      {/* Steps */}
      <section className="mb-8">
        <h2 className="font-bold text-xl mb-4">The 10 steps</h2>
        <ol className="space-y-3">
          {STEPS.map((step) => (
            <li
              key={step.n}
              className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 shadow-sm"
              data-testid={`passport-step-${step.n}`}
            >
              <div className="flex items-start gap-3">
                <div className="shrink-0 h-9 w-9 rounded-full bg-gradient-to-br from-rose-600 to-amber-500 text-white flex items-center justify-center font-extrabold text-sm shadow-sm">
                  {step.n}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-base mb-1 leading-tight">{step.title}</h3>
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug">
                    {step.body}
                  </p>
                  {step.cta?.href && (
                    <a
                      href={step.cta.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-300 text-sm font-semibold mt-2 underline underline-offset-2"
                    >
                      {step.cta.label} <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {step.cta && !step.cta.href && (
                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 text-xs font-semibold mt-2">
                      ✓ {step.cta.label}
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Common rejection reasons */}
      <section className="mb-8 rounded-2xl border border-red-200 dark:border-red-900/40 bg-red-50/60 dark:bg-red-950/20 p-5">
        <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-600" />
          Avoid these mistakes (they cause 90% of rejections)
        </h2>
        <ul className="space-y-2 text-sm">
          <li className="flex items-start gap-2">
            <span className="mt-0.5">•</span>
            <span><b>Name mismatch.</b> The names on your application must EXACTLY match your National ID — same spelling, same order, no shortcuts.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5">•</span>
            <span><b>Wrong photo.</b> No glasses, no smile, no head covering (unless religious), white background, ears + forehead visible.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5">•</span>
            <span><b>Skipping the recommender.</b> The recommender must be reachable on the phone they listed. If immigration can't reach them, your file stalls.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5">•</span>
            <span><b>Paying a broker.</b> Anyone outside eCitizen claiming to speed up your application is a fraudster. Report them at <Link href="/scam-checker" className="text-red-700 dark:text-red-300 underline">/scam-checker</Link>.</span>
          </li>
        </ul>
      </section>

      {/* Big CTA */}
      <section className="rounded-3xl bg-gradient-to-br from-rose-600 via-red-600 to-amber-500 p-6 text-white shadow-lg text-center">
        <h2 className="text-xl sm:text-2xl font-extrabold mb-2">Ready to apply?</h2>
        <p className="text-sm text-white/90 mb-4 leading-snug">
          Open eCitizen now. Keep this guide open in another tab and follow the
          10 steps in order. Don't skip ahead — they cross-validate everything.
        </p>
        <a
          href={IMMIGRATION_PASSPORT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-white text-rose-700 font-bold px-6 py-3 rounded-2xl hover:bg-rose-50 transition-colors shadow-md"
          data-testid="passport-start-ecitizen"
        >
          Start on eCitizen <ExternalLink className="h-4 w-4" />
        </a>
        <div className="mt-4 text-[11px] text-white/75">
          Stuck on any step? Ask Nanjila — she'll walk you through it line by line.
        </div>
      </section>
    </main>
  );
}
