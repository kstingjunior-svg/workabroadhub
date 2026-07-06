// ─────────────────────────────────────────────────────────────────────────────
// Certificate of Good Conduct — Kenya DCI (Directorate of Criminal
// Investigations) Police Clearance Certificate.
//
// What this page does:
//   - Step-by-step eCitizen + DCI application for a Certificate of Good
//     Conduct (also called Police Clearance Certificate).
//   - Required for: most work-abroad visas, NHIF/SHIF clearance jobs,
//     banking, security, child-related work, government, adoption,
//     and most employer onboarding processes.
//   - Same paywall as /passport-application and /student-visas — Pro
//     tier (KES 4,500/yr or KES 1,000/mo) unlocks the full guide.
//
// Fee structure (as of 2026):
//   - Government fee: KES 1,050 (eCitizen)
//   - Fingerprint slip at DCI office: KES 50–100
//   - Optional Posta delivery: KES 200–300
// Total government cost: about KES 1,100–1,500.
//
// Processing time: 2 weeks typical (can be longer in busy periods).
// Validity: 6 months (most embassies require ≤6-month-old certificate).
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  CheckCircle2, ArrowRight, ExternalLink, Crown,
  FileText, CreditCard, AlertCircle, ShieldCheck,
} from "lucide-react";

interface UserPlan {
  planId: string | null;
}

const ECITIZEN_URL = "https://accounts.ecitizen.go.ke/en";
const DCI_URL = "https://dci.ecitizen.go.ke";

const REQUIRED_DOCUMENTS = [
  "Original National ID (and a photocopy)",
  "eCitizen-printed application form (printed after payment)",
  "eCitizen-printed payment receipt",
  "Soft pencil + black pen at the DCI office (some require it)",
  "Small cash (KES 100–200) for fingerprint slip fee",
  "If applying from abroad: notarised fingerprint slip from local police",
];

const STEPS = [
  {
    n: 1,
    title: "Sign in to eCitizen",
    body: "Open ecitizen.go.ke. If you don't have an account, register with your National ID and a working phone. Verify your email and phone before continuing.",
    cta: { label: "Open eCitizen", href: ECITIZEN_URL },
  },
  {
    n: 2,
    title: "Open the DCI (Directorate of Criminal Investigations) module",
    body: "On the eCitizen dashboard, scroll to 'Directorate of Criminal Investigations'. Click it and you'll see options including 'Police Clearance Certificate' — that's the official name for Certificate of Good Conduct.",
  },
  {
    n: 3,
    title: "Click 'Apply for Police Clearance Certificate'",
    body: "Select 'Make Application'. The form opens — most of your details are auto-filled from your eCitizen profile. Confirm everything matches your National ID exactly. Mismatched names are the #1 rejection reason.",
  },
  {
    n: 4,
    title: "Fill in the application purpose",
    body: "Select your reason: 'Employment', 'Travel/Visa', 'Adoption', 'Personal record', or 'Other'. Be honest — DCI doesn't gatekeep purpose, but inconsistent answers across applications can flag you. Confirm the address where you can be contacted if needed.",
  },
  {
    n: 5,
    title: "Pay KES 1,050 with M-Pesa",
    body: "On the payment screen, choose M-Pesa. You can pay either through the eCitizen STK push OR manually via Paybill 222222, Account = your National ID number. STK push is faster. Save the M-Pesa SMS confirmation.",
    cta: { label: "M-Pesa supported", href: undefined },
  },
  {
    n: 6,
    title: "Print the application form + payment receipt",
    body: "eCitizen generates a PDF invoice with a barcode + the application form. Print BOTH. The barcode is what DCI scans at the office. If you have no printer, any cyber café will print for ~KES 50.",
  },
  {
    n: 7,
    title: "Go to the nearest DCI office for fingerprinting",
    body: "DCI HQ Mazingira House (Kiambu Road, Nairobi) is the main one — open Mon–Fri 8am–4pm. Counties have CID offices (Mombasa, Kisumu, Eldoret, Nakuru, etc.). Bring: original ID + photocopy, printed application, KES 100–200 cash for the fingerprint slip.",
  },
  {
    n: 8,
    title: "Get fingerprinted (10 fingers + palms)",
    body: "The DCI officer takes your 10 fingerprints and palm prints on a special slip. They scan your barcode to attach your prints to your eCitizen application. Confirm the officer enters your CORRECT eCitizen reference — wrong reference = your file stalls forever.",
  },
  {
    n: 9,
    title: "Wait for processing",
    body: "Standard time is about 2 weeks. Embassies require the cert to be ≤6 months old, so apply at most 5 months before you'll need it. Check status by logging back into eCitizen → DCI → 'My Applications'. Status moves from 'Pending Fingerprints' → 'Processing' → 'Ready'.",
  },
  {
    n: 10,
    title: "Download (or collect) your certificate",
    body: "When status = 'Ready', download the PDF directly from eCitizen — it has a QR code embassies and employers scan to verify. You can also collect a stamped paper copy at the same DCI office that took your prints. For visa applications, the eCitizen-downloaded PDF is accepted by most embassies.",
    cta: { label: "Verify a certificate", href: "https://dci.ecitizen.go.ke" },
  },
];

const ACCEPTED_USES = [
  "Work-abroad visa applications (UK, Canada, Australia, USA, UAE, Schengen — all require it)",
  "Work permit applications (most countries require ≤6-month-old certificate)",
  "New job onboarding — banks, government, schools, NGOs",
  "Driver / matatu sacco compliance",
  "Adoption process",
  "Volunteer placements abroad",
  "Re-entry into Kenya after long stay abroad",
];

function GoodConductPaywall() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      <div className="rounded-3xl bg-gradient-to-br from-slate-800 via-slate-700 to-blue-700 p-6 sm:p-8 text-white shadow-xl">
        <div className="text-5xl mb-3">🛡️</div>
        <h1 className="text-2xl sm:text-3xl font-extrabold mb-2">
          Certificate of Good Conduct
        </h1>
        <p className="text-sm sm:text-base text-white/90 leading-snug mb-5">
          Apply for your DCI Police Clearance Certificate via eCitizen — the
          one document almost every visa, work permit, and serious employer
          asks for. We walk you through the 10 steps so you don't miss the
          biometric appointment.
        </p>

        <div className="rounded-2xl bg-white/15 backdrop-blur-sm p-4 mb-5">
          <h2 className="font-bold text-sm uppercase tracking-wider mb-2 opacity-90">
            What's inside
          </h2>
          <ul className="space-y-1.5 text-sm">
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> Exact eCitizen click-by-click walkthrough (10 steps)</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> Document + cash checklist for the DCI office</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> Current fee: KES 1,050 government + ~KES 150 slip</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> DCI office addresses + opening hours (Nairobi + counties)</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> Common rejection reasons + how to avoid them</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> Validity timing tips for embassy submission</li>
          </ul>
        </div>

        <div className="rounded-xl bg-black/30 p-3 text-sm mb-5">
          <div className="font-bold mb-0.5">KES 4,500 / year — or KES 1,000 / month</div>
          <div className="text-xs text-white/80 leading-snug">
            Same Pro plan also unlocks passport, visa, student visa, work
            permit assistance, NEAIMS verification, WhatsApp support and job alerts.
          </div>
        </div>

        <Link
          href="/pricing"
          className="inline-flex items-center gap-2 bg-white text-slate-800 font-bold px-5 py-3 rounded-2xl hover:bg-slate-100 transition-colors shadow-lg"
          data-testid="good-conduct-paywall-upgrade"
        >
          <Crown className="h-5 w-5" />
          Unlock guide — see plans
          <ArrowRight className="h-4 w-4" />
        </Link>

        <p className="mt-4 text-[11px] text-white/70 leading-snug">
          The KES 4,500 covers our Pro plan. The government KES 1,050 fee is
          paid separately on eCitizen — that money goes to DCI, not to us.
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

export default function GoodConduct() {
  const { user } = useAuth();

  const { data: userPlan } = useQuery<UserPlan>({
    queryKey: ["/api/user/plan"],
    enabled: !!user,
    staleTime: 60_000,
  });

  const isPaidTier =
    !!userPlan && ["pro", "monthly", "trial"].includes(userPlan.planId ?? "");

  if (!user || !isPaidTier) {
    return <GoodConductPaywall />;
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-6 sm:py-10">
      {/* Hero */}
      <div className="rounded-3xl bg-gradient-to-br from-slate-800 via-slate-700 to-blue-700 p-6 sm:p-8 text-white shadow-xl mb-6">
        <div className="flex items-start gap-4">
          <div className="text-5xl shrink-0">🛡️</div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold mb-1 leading-tight">
              Certificate of Good Conduct (DCI Police Clearance)
            </h1>
            <p className="text-sm sm:text-base text-white/90 leading-snug">
              Follow these 10 steps exactly. Most Kenyans complete the online
              application in 20 minutes, finish biometrics in one DCI office
              visit, and download the certificate ~2 weeks later.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
          <div className="rounded-xl bg-white/15 px-3 py-2">
            <div className="text-white/70 uppercase tracking-wider text-[10px]">Cost (gov)</div>
            <div className="font-bold text-sm">KES 1,050</div>
          </div>
          <div className="rounded-xl bg-white/15 px-3 py-2">
            <div className="text-white/70 uppercase tracking-wider text-[10px]">Time</div>
            <div className="font-bold text-sm">~2 weeks</div>
          </div>
          <div className="rounded-xl bg-white/15 px-3 py-2">
            <div className="text-white/70 uppercase tracking-wider text-[10px]">Validity</div>
            <div className="font-bold text-sm">6 months</div>
          </div>
          <div className="rounded-xl bg-white/15 px-3 py-2">
            <div className="text-white/70 uppercase tracking-wider text-[10px]">Where</div>
            <div className="font-bold text-sm">eCitizen + DCI</div>
          </div>
        </div>
      </div>

      {/* Required documents */}
      <section className="mb-6 rounded-2xl border border-slate-200 bg-slate-50/60 dark:bg-slate-900/40 dark:border-slate-700 p-5">
        <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
          <FileText className="h-5 w-5 text-slate-700 dark:text-slate-300" />
          What to bring to the DCI office
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
          DCI offices don't print or photocopy on the spot — come with
          everything already printed.
        </p>
        <ul className="space-y-2 text-sm">
          {REQUIRED_DOCUMENTS.map((doc, i) => (
            <li key={i} className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-slate-700 dark:text-slate-300" />
              <span>{doc}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Where is it accepted */}
      <section className="mb-6 rounded-2xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/60 dark:bg-blue-950/20 p-5">
        <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-blue-600" />
          When you'll need it
        </h2>
        <ul className="space-y-2 text-sm">
          {ACCEPTED_USES.map((u, i) => (
            <li key={i} className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
              <span>{u}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Fee summary */}
      <section className="mb-6 rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 p-5">
        <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-amber-600" />
          What it actually costs
        </h2>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-4 py-3">
            <div>
              <div className="font-semibold text-sm">eCitizen government fee</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Paid online by M-Pesa</div>
            </div>
            <div className="font-bold text-amber-700 dark:text-amber-300 whitespace-nowrap text-sm">KES 1,050</div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-4 py-3">
            <div>
              <div className="font-semibold text-sm">Fingerprint slip (at DCI office)</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Cash, payable on arrival</div>
            </div>
            <div className="font-bold text-amber-700 dark:text-amber-300 whitespace-nowrap text-sm">~KES 100–200</div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-4 py-3">
            <div>
              <div className="font-semibold text-sm">Optional Posta delivery</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">If you can't collect in person</div>
            </div>
            <div className="font-bold text-amber-700 dark:text-amber-300 whitespace-nowrap text-sm">~KES 200–300</div>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
          Don't pay anyone offering to "speed up" your certificate — that is
          fraud. The DCI processes applications in order received.
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
              data-testid={`good-conduct-step-${step.n}`}
            >
              <div className="flex items-start gap-3">
                <div className="shrink-0 h-9 w-9 rounded-full bg-gradient-to-br from-slate-700 to-blue-700 text-white flex items-center justify-center font-extrabold text-sm shadow-sm">
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
                      className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-300 text-sm font-semibold mt-2 underline underline-offset-2"
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
          Avoid these mistakes (they cost weeks)
        </h2>
        <ul className="space-y-2 text-sm">
          <li className="flex items-start gap-2">
            <span className="mt-0.5">•</span>
            <span><b>Name mismatch.</b> The names on the eCitizen application must EXACTLY match your National ID. Even a missing middle initial blocks the file.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5">•</span>
            <span><b>Going to DCI without printing.</b> No printed application + receipt = no fingerprinting. They will turn you away.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5">•</span>
            <span><b>Wrong reference number on slip.</b> Watch the DCI officer enter your eCitizen reference into their system. Wrong reference and your prints attach to nobody's file.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5">•</span>
            <span><b>Applying too early.</b> Certificate is valid 6 months. Apply 4–5 months before you need it, not 12 months out.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5">•</span>
            <span><b>Paying a broker.</b> Anyone outside eCitizen and DCI offices claiming to "expedite" is a fraudster. Report at <Link href="/scam-checker" className="text-red-700 dark:text-red-300 underline">/scam-checker</Link>.</span>
          </li>
        </ul>
      </section>

      {/* Big CTA */}
      <section className="rounded-3xl bg-gradient-to-br from-slate-800 via-slate-700 to-blue-700 p-6 text-white shadow-lg text-center">
        <h2 className="text-xl sm:text-2xl font-extrabold mb-2">Ready to apply?</h2>
        <p className="text-sm text-white/90 mb-4 leading-snug">
          Open eCitizen now. Keep this guide open in another tab and follow the
          10 steps in order. Allow 20 minutes for the online portion, plus one
          DCI office visit for biometrics.
        </p>
        <a
          href={DCI_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-white text-slate-800 font-bold px-6 py-3 rounded-2xl hover:bg-slate-100 transition-colors shadow-md"
          data-testid="good-conduct-start-ecitizen"
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
