// ─────────────────────────────────────────────────────────────────────────────
// HELB Clearance Certificate — Higher Education Loans Board (helb.co.ke).
//
// What this page does:
//   - Step-by-step guide to getting a HELB Compliance / Clearance Certificate.
//   - Required for: ALL Kenyan civil-service job applications, most county
//     and parastatal positions, many corporate onboarding processes, and
//     some embassy verifications (UK and Canada do check).
//   - Required even if you never took a loan — HELB issues a "No Loan"
//     certificate confirming the same; KES 1,000 fee applies regardless.
//
// Fees (as of 2026):
//   - HELB clearance government fee: KES 1,000
//   - Plus any outstanding loan balance you owe HELB
//
// Validity: 1 year from issue date.
//
// Same Pro paywall as the other government-doc assistants.
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  CheckCircle2, ArrowRight, ExternalLink, Crown,
  FileText, CreditCard, AlertCircle, GraduationCap, Calendar,
} from "lucide-react";

interface UserPlan {
  planId: string | null;
}

const HELB_URL = "https://www.helb.co.ke";
const HELB_PORTAL_URL = "https://helbportal.helb.co.ke";

const REQUIRED_INFO = [
  "Your HELB number (or use HELB Number Checker on the portal with your National ID)",
  "HELB portal password (use 'Forgot Password' with your registered email if needed)",
  "M-Pesa-active Safaricom number for paying the KES 1,000 clearance fee",
  "If you owe a loan balance: M-Pesa float to clear it before applying",
  "Your university name and graduation year (asked during the form)",
];

const ACCEPTED_USES = [
  "Every Kenyan civil-service job application (mandatory)",
  "TSC (Teachers Service Commission) recruitment",
  "Parastatal jobs (KPLC, KRA, KCB, banks, NSE-listed firms)",
  "County government recruitments",
  "Corporate employer onboarding (many require it)",
  "UK and Canadian embassy applicant verification (occasional)",
  "Postgraduate / scholarship applications",
];

const STEPS = [
  {
    n: 1,
    title: "Find your HELB number (if you don't know it)",
    body: "Go to helb.co.ke → click 'Student Portal' → 'HELB Number Checker'. Enter your National ID. The system returns your HELB number (starts with HELB/). Even if you NEVER took a loan, you have a HELB number from when you applied — you still need clearance.",
    cta: { label: "Open HELB", href: HELB_URL },
  },
  {
    n: 2,
    title: "Sign in to the HELB portal",
    body: "Go to helbportal.helb.co.ke. Enter HELB number + password. Lost password? Click 'Forgot Password' → HELB emails a reset link to the address tied to your account. If that email is dead, you'll need to visit HELB head office (Anniversary Towers, University Way, Nairobi).",
  },
  {
    n: 3,
    title: "Check your loan status",
    body: "From the dashboard, click 'My Loan' → 'Statement of Account'. The page shows total disbursed, interest, total payable, and outstanding balance. Print or save the statement — you'll need the exact balance for M-Pesa payment.",
  },
  {
    n: 4,
    title: "Clear your loan balance (if any)",
    body: "If you owe ANY amount, pay via M-Pesa: Paybill 200800, Account = your HELB number. Pay the EXACT outstanding amount (or slightly more — overpayments get refunded). Save the M-Pesa SMS. Allow 1-3 hours for HELB to reflect the payment on the portal.",
  },
  {
    n: 5,
    title: "Confirm zero balance",
    body: "Refresh your 'Statement of Account' page. The outstanding balance must show KES 0.00. If it still shows the old balance after 3 hours, send the M-Pesa SMS screenshot to compliance@helb.co.ke with your HELB number — they'll reconcile manually.",
  },
  {
    n: 6,
    title: "Apply for the Compliance Certificate",
    body: "On the portal, click 'Compliance Certificate' → 'Apply for New'. Pick the purpose: 'Employment' is most common (covers job applications, embassy verifications, employer onboarding). 'Graduate School' is for postgrad applications. Click Submit.",
  },
  {
    n: 7,
    title: "Pay the KES 1,000 clearance fee",
    body: "After submission, the portal generates an invoice with a paybill reference. Pay KES 1,000 via M-Pesa: Paybill 200800, Account = your HELB number with prefix 'HC' (some forms specify; follow the on-screen instruction exactly). Save the M-Pesa SMS.",
    cta: { label: "M-Pesa supported", href: undefined },
  },
  {
    n: 8,
    title: "Wait for processing",
    body: "Typical turnaround: 2-5 working days. You'll get an email + SMS when the certificate is ready. During busy periods (December-January when civil service hires en masse), it can take up to 2 weeks. Check status by logging into the portal → 'My Compliance Certificates'.",
  },
  {
    n: 9,
    title: "Download the PDF certificate",
    body: "When status = 'Issued', the portal shows a 'Download Certificate' button. The PDF has a verification QR code that employers and embassies scan to confirm authenticity directly with HELB. Save a copy locally AND email it to yourself — losing the file means re-applying (and paying again).",
  },
  {
    n: 10,
    title: "Use before it expires (1 year validity)",
    body: "HELB Compliance Certificate is valid 12 months from issue. Most employers accept it for the full year. Some recruiters require a fresh one within 90 days — check the job posting. Don't apply 9 months before you need it; time the download to within 2-4 months of when you'll submit.",
  },
];

function HelbClearancePaywall() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      <div className="rounded-3xl bg-gradient-to-br from-amber-700 via-orange-600 to-red-600 p-6 sm:p-8 text-white shadow-xl">
        <div className="text-5xl mb-3">🎓</div>
        <h1 className="text-2xl sm:text-3xl font-extrabold mb-2">
          HELB Compliance Certificate
        </h1>
        <p className="text-sm sm:text-base text-white/90 leading-snug mb-5">
          Required for every Kenyan civil-service application — and for many
          corporate jobs too. Even if you never took a loan, you still need
          the HELB "No Loan" clearance. We walk you through the helb.co.ke
          portal so you don't get stuck on the lost-password loop.
        </p>

        <div className="rounded-2xl bg-white/15 backdrop-blur-sm p-4 mb-5">
          <h2 className="font-bold text-sm uppercase tracking-wider mb-2 opacity-90">
            What's inside
          </h2>
          <ul className="space-y-1.5 text-sm">
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> HELB portal click-by-click walkthrough (10 steps)</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> How to find your HELB number with just your ID</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> M-Pesa payment instructions (Paybill 200800)</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> Lost-password recovery without visiting HELB HQ</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> What to do when balance won't reconcile</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> Timing tips for embassy + civil service submissions</li>
          </ul>
        </div>

        <div className="rounded-xl bg-black/25 p-3 text-sm mb-5">
          <div className="font-bold mb-0.5">KES 4,500 / year — or KES 1,000 / month</div>
          <div className="text-xs text-white/85 leading-snug">
            Same Pro plan also unlocks passport, KRA TCC, good conduct,
            student visa, work visa, work permit assistance, NEAIMS verification,
            WhatsApp support and job alerts.
          </div>
        </div>

        <Link
          href="/pricing"
          className="inline-flex items-center gap-2 bg-white text-amber-800 font-bold px-5 py-3 rounded-2xl hover:bg-amber-50 transition-colors shadow-lg"
          data-testid="helb-paywall-upgrade"
        >
          <Crown className="h-5 w-5" />
          Unlock guide — see plans
          <ArrowRight className="h-4 w-4" />
        </Link>

        <p className="mt-4 text-[11px] text-white/75 leading-snug">
          The KES 4,500 covers our Pro plan. The HELB KES 1,000 clearance fee
          plus any outstanding loan balance you owe are paid separately on
          the HELB portal — that money goes to HELB, not to us.
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

export default function HelbClearance() {
  const { user } = useAuth();

  const { data: userPlan } = useQuery<UserPlan>({
    queryKey: ["/api/user/plan"],
    enabled: !!user,
    staleTime: 60_000,
  });

  const isPaidTier =
    !!userPlan && ["pro", "monthly", "trial"].includes(userPlan.planId ?? "");

  if (!user || !isPaidTier) {
    return <HelbClearancePaywall />;
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-6 sm:py-10">
      {/* Hero */}
      <div className="rounded-3xl bg-gradient-to-br from-amber-700 via-orange-600 to-red-600 p-6 sm:p-8 text-white shadow-xl mb-6">
        <div className="flex items-start gap-4">
          <div className="text-5xl shrink-0">🎓</div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold mb-1 leading-tight">
              HELB Compliance Certificate
            </h1>
            <p className="text-sm sm:text-base text-white/90 leading-snug">
              Apply via the HELB portal in 10 clear steps. Most Kenyans who
              have no outstanding balance get their certificate in 3-5
              working days.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
          <div className="rounded-xl bg-white/15 px-3 py-2">
            <div className="text-white/70 uppercase tracking-wider text-[10px]">Cost (gov)</div>
            <div className="font-bold text-sm">KES 1,000</div>
          </div>
          <div className="rounded-xl bg-white/15 px-3 py-2">
            <div className="text-white/70 uppercase tracking-wider text-[10px]">Time</div>
            <div className="font-bold text-sm">3–5 work days</div>
          </div>
          <div className="rounded-xl bg-white/15 px-3 py-2">
            <div className="text-white/70 uppercase tracking-wider text-[10px]">Validity</div>
            <div className="font-bold text-sm">12 months</div>
          </div>
          <div className="rounded-xl bg-white/15 px-3 py-2">
            <div className="text-white/70 uppercase tracking-wider text-[10px]">Where</div>
            <div className="font-bold text-sm">helb.co.ke</div>
          </div>
        </div>
      </div>

      {/* Even if you never took a loan callout */}
      <section className="mb-6 rounded-2xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-5">
        <div className="flex items-start gap-3">
          <GraduationCap className="h-6 w-6 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-bold text-lg text-amber-900 dark:text-amber-200 mb-1">
              "But I never took a HELB loan..."
            </h2>
            <p className="text-sm text-amber-800 dark:text-amber-200 leading-snug">
              You still need a HELB Compliance Certificate. HELB issues a
              "No Loan" clearance confirming you owe nothing. The KES 1,000
              fee applies whether you owe or don't. Most civil-service
              recruiters will reject your application without it.
            </p>
          </div>
        </div>
      </section>

      {/* Required info */}
      <section className="mb-6 rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 p-5">
        <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
          <FileText className="h-5 w-5 text-amber-700 dark:text-amber-300" />
          Have these ready before you start
        </h2>
        <ul className="space-y-2 text-sm">
          {REQUIRED_INFO.map((info, i) => (
            <li key={i} className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" />
              <span>{info}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Where it's accepted */}
      <section className="mb-6 rounded-2xl border border-orange-200 dark:border-orange-900/40 bg-orange-50/60 dark:bg-orange-950/20 p-5">
        <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-orange-700 dark:text-orange-300" />
          When you'll need it
        </h2>
        <ul className="space-y-2 text-sm">
          {ACCEPTED_USES.map((u, i) => (
            <li key={i} className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-orange-700 dark:text-orange-300" />
              <span>{u}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Fee breakdown */}
      <section className="mb-6 rounded-2xl border border-red-200 dark:border-red-900/40 bg-red-50/60 dark:bg-red-950/20 p-5">
        <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-red-600" />
          What it actually costs
        </h2>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-4 py-3">
            <div>
              <div className="font-semibold text-sm">HELB clearance fee</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Paid via M-Pesa Paybill 200800</div>
            </div>
            <div className="font-bold text-red-700 dark:text-red-300 whitespace-nowrap text-sm">KES 1,000</div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-4 py-3">
            <div>
              <div className="font-semibold text-sm">Outstanding loan balance</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Only if you actually borrowed (varies)</div>
            </div>
            <div className="font-bold text-red-700 dark:text-red-300 whitespace-nowrap text-sm">As owed</div>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
          HELB doesn't accept cash payments at the office for clearance —
          everything is M-Pesa via Paybill 200800. Brokers offering to
          "expedite" your certificate are scammers.
        </p>
      </section>

      {/* Timing tip */}
      <section className="mb-6 rounded-2xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/60 dark:bg-blue-950/20 p-5">
        <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-blue-600" />
          When to apply
        </h2>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug">
          HELB clearance is valid 12 months. Apply 2-4 months before you need
          it for a job submission. December-January are the busiest months
          (civil service en-masse hires) — add 1-2 weeks to expected turnaround.
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
              data-testid={`helb-step-${step.n}`}
            >
              <div className="flex items-start gap-3">
                <div className="shrink-0 h-9 w-9 rounded-full bg-gradient-to-br from-amber-700 to-red-600 text-white flex items-center justify-center font-extrabold text-sm shadow-sm">
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
                      className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-300 text-sm font-semibold mt-2 underline underline-offset-2"
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
          Avoid these mistakes
        </h2>
        <ul className="space-y-2 text-sm">
          <li className="flex items-start gap-2">
            <span className="mt-0.5">•</span>
            <span><b>Forgotten password loop.</b> If your HELB-registered email is dead, you can't reset by email. Visit Anniversary Towers Nairobi with your National ID to update the email first.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5">•</span>
            <span><b>Applying with balance.</b> Even KES 1 of accrued interest blocks the clearance. Pay an extra KES 10 to be safe — overpayments are refunded.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5">•</span>
            <span><b>Wrong account number on M-Pesa.</b> Account must be your HELB number, NOT your National ID. Triple-check before sending.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5">•</span>
            <span><b>Paying a broker.</b> Anyone on WhatsApp / Facebook claiming to "process HELB clearance for KES 3,000" is a fraudster. Report at <Link href="/scam-checker" className="text-red-700 dark:text-red-300 underline">/scam-checker</Link>.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5">•</span>
            <span><b>Letting it expire.</b> Re-applying = pay KES 1,000 again. Time your application to your actual submission deadline.</span>
          </li>
        </ul>
      </section>

      {/* Big CTA */}
      <section className="rounded-3xl bg-gradient-to-br from-amber-700 via-orange-600 to-red-600 p-6 text-white shadow-lg text-center">
        <h2 className="text-xl sm:text-2xl font-extrabold mb-2">Ready to apply?</h2>
        <p className="text-sm text-white/90 mb-4 leading-snug">
          Open the HELB portal now. Keep this guide open in another tab and
          follow the 10 steps in order. Most users finish in 30 minutes
          (assuming no outstanding loan) and have the certificate within a week.
        </p>
        <a
          href={HELB_PORTAL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-white text-amber-800 font-bold px-6 py-3 rounded-2xl hover:bg-amber-50 transition-colors shadow-md"
          data-testid="helb-start-portal"
        >
          Open HELB Portal <ExternalLink className="h-4 w-4" />
        </a>
        <div className="mt-4 text-[11px] text-white/75">
          Stuck on the portal? Ask Nanjila — she'll walk you through it.
        </div>
      </section>
    </main>
  );
}
