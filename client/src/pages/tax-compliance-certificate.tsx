// ─────────────────────────────────────────────────────────────────────────────
// KRA Tax Compliance Certificate (TCC) — iTax step-by-step guide.
//
// What this page does:
//   - Walks any Kenyan through downloading a Tax Compliance Certificate
//     (TCC) via iTax (itax.kra.go.ke).
//   - Required for nearly every embassy visa application, every Kenyan
//     government job application, all tenders, and many private-sector
//     employer onboarding checks.
//   - KRA government fee is KES 0 — completely free. We charge for the
//     guide because iTax is genuinely confusing and most people give up.
//
// Validity: 12 months from issue. Apply 1-3 months before you need it.
//
// Same Pro paywall as other government-doc assistants
// (passport / student visa / good conduct / visa application).
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  CheckCircle2, ArrowRight, ExternalLink, Crown,
  FileText, AlertCircle, Sparkles, Calendar,
} from "lucide-react";

interface UserPlan {
  planId: string | null;
}

const ITAX_URL = "https://itax.kra.go.ke";
const KRA_HELP_URL = "https://www.kra.go.ke";

const REQUIRED_INFO = [
  "Your KRA PIN (the 11-character one starting with A or P)",
  "iTax password (or use 'Forgot Password' to reset via the email tied to your PIN)",
  "All filed tax returns up to last income year (Nil returns count — file them first if missed)",
  "Any outstanding KRA balances cleared (even KES 1 owed blocks issuance)",
  "A working email — KRA sends the PDF certificate to your registered address",
];

const ACCEPTED_USES = [
  "Embassy visa applications — UK, Canada, Australia, USA, UAE, Schengen, China",
  "Every Kenyan government job application (mandatory)",
  "Government tenders + procurement bidding",
  "Liquor licence renewals",
  "Construction & professional licence applications",
  "Cooperative / Sacco loan applications",
  "Employer onboarding for many large private firms",
  "Property transfers (some counties require it)",
];

const STEPS = [
  {
    n: 1,
    title: "Get your KRA PIN ready",
    body: "You need your 11-character PIN (starts with A for individuals, P for companies). If you don't know it, go to iTax → 'PIN Checker' and enter your National ID — your PIN shows up instantly. If you've never had a PIN, register one first at iTax → 'New PIN Registration' (also free).",
    cta: { label: "Open iTax", href: ITAX_URL },
  },
  {
    n: 2,
    title: "Sign in to iTax",
    body: "Visit itax.kra.go.ke. Click 'Login'. Enter your PIN + password. If you've forgotten the password, click 'Forgot Password' → KRA emails a reset link to the address tied to your PIN. If that email is wrong/dead, you'll need to visit a Huduma Centre to update it.",
  },
  {
    n: 3,
    title: "Check your filing status — file all missed returns FIRST",
    body: "Before TCC can be issued, every tax obligation tied to your PIN must be up to date. From the iTax dashboard, click 'Returns' → 'View Filed Returns'. If you see gaps, file Nil Returns for the missing years (takes 2 minutes per year, also free). Common gaps: forgetting Nil Returns from years you were a student or unemployed.",
  },
  {
    n: 4,
    title: "Confirm no outstanding balance",
    body: "Go to 'My Ledger' → 'General Ledger'. The current balance must be ZERO (or a credit). Even KES 1 owing will block the TCC. If you owe, generate a payment slip → pay via M-Pesa Paybill 572572 → wait for the payment to reflect (10 minutes to 24 hours).",
  },
  {
    n: 5,
    title: "Apply for the certificate",
    body: "From the iTax menu, click 'Certificates' → 'Apply for Tax Compliance Certificate (TCC)'. Pick the purpose: 'General' (most common — covers visa, job, tender), 'Liquor', 'Procurement', etc. Click 'Submit'.",
  },
  {
    n: 6,
    title: "Wait for the auto-check",
    body: "iTax runs an automatic audit — usually same day, sometimes up to 5 working days if there's anything unusual on your ledger. You'll get an SMS + email the moment the decision is made. The status shows on iTax → 'Certificates' → 'View Certificates'.",
  },
  {
    n: 7,
    title: "Download the PDF certificate",
    body: "Once approved, the certificate appears in iTax → 'Certificates' → 'View'. Click 'Download'. The PDF has a QR code embassies and employers scan to verify authenticity directly with KRA — so the digital version is fully accepted, no need to visit a KRA office.",
    cta: { label: "Sample issuance check", href: "https://itax.kra.go.ke/KRA-Portal/serviceCenter.htm" },
  },
  {
    n: 8,
    title: "Use it before it expires",
    body: "The TCC is valid for 12 months from the issue date. Use it for visa applications, job applications, etc. within that window. If your embassy or employer requires it to be ≤3 months old (rare but happens — UK Tier 2 sometimes does), wait until closer to the application date before downloading.",
  },
];

function TaxComplianceCertificatePaywall() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      <div className="rounded-3xl bg-gradient-to-br from-emerald-700 via-emerald-600 to-cyan-600 p-6 sm:p-8 text-white shadow-xl">
        <div className="text-5xl mb-3">📑</div>
        <h1 className="text-2xl sm:text-3xl font-extrabold mb-2">
          Tax Compliance Certificate Guide
        </h1>
        <p className="text-sm sm:text-base text-white/90 leading-snug mb-5">
          Download your KRA TCC via iTax — the one certificate every embassy
          and every Kenyan government job application asks for. Government
          fee: KES 0. Most Kenyans give up because iTax is confusing — we
          walk you through it.
        </p>

        <div className="rounded-2xl bg-white/15 backdrop-blur-sm p-4 mb-5">
          <h2 className="font-bold text-sm uppercase tracking-wider mb-2 opacity-90">
            What's inside
          </h2>
          <ul className="space-y-1.5 text-sm">
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> Exact iTax click-by-click walkthrough (8 steps)</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> How to file missed Nil Returns (the #1 blocker)</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> How to clear KES-1-balance situations</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> Password recovery if iTax email is dead</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> Where TCC is accepted (visas, jobs, tenders, licences)</li>
            <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> Common rejection reasons + fixes</li>
          </ul>
        </div>

        <div className="rounded-xl bg-black/25 p-3 text-sm mb-5">
          <div className="font-bold mb-0.5">KES 4,500 / year — or KES 1,000 / month</div>
          <div className="text-xs text-white/85 leading-snug">
            Same Pro plan also unlocks passport, good conduct, student visa,
            work visa, work permit assistance, recruitment agency verification, WhatsApp
            support and job alerts.
          </div>
        </div>

        <Link
          href="/pricing"
          className="inline-flex items-center gap-2 bg-white text-emerald-700 font-bold px-5 py-3 rounded-2xl hover:bg-emerald-50 transition-colors shadow-lg"
          data-testid="tcc-paywall-upgrade"
        >
          <Crown className="h-5 w-5" />
          Get personal advisor guidance — see plans
          <ArrowRight className="h-4 w-4" />
        </Link>

        <p className="mt-4 text-[11px] text-white/75 leading-snug">
          The KRA TCC itself is FREE — government fee is KES 0. You pay only
          our KES 4,500 Pro plan for the guide. If you owe KRA back-taxes,
          you'll have to clear those on iTax separately.
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

export default function TaxComplianceCertificate() {
  const { user } = useAuth();

  const { data: userPlan } = useQuery<UserPlan>({
    queryKey: ["/api/user/plan"],
    enabled: !!user,
    staleTime: 60_000,
  });

  const isPaidTier =
    !!userPlan && ["pro", "monthly", "trial"].includes(userPlan.planId ?? "");

  if (!user || !isPaidTier) {
    return <TaxComplianceCertificatePaywall />;
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-6 sm:py-10">
        {/* 2026-07: Play Store compliance — clarify we're not a government
            portal, and the actual application goes through the official one. */}
        <div className="mb-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          <strong>Note:</strong> Applications are completed through the official government portals. WorkAbroad Hub provides step-by-step guidance only — we do not process, submit, or approve any government application.
        </div>
      {/* Hero */}
      <div className="rounded-3xl bg-gradient-to-br from-emerald-700 via-emerald-600 to-cyan-600 p-6 sm:p-8 text-white shadow-xl mb-6">
        <div className="flex items-start gap-4">
          <div className="text-5xl shrink-0">📑</div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold mb-1 leading-tight">
              Tax Compliance Certificate Guide (KRA TCC)
            </h1>
            <p className="text-sm sm:text-base text-white/90 leading-snug">
              Follow these 8 steps in iTax. Most Kenyans complete the whole
              process in 20-40 minutes (assuming returns are filed). Embassy
              and employer-friendly PDF, free from KRA.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
          <div className="rounded-xl bg-white/15 px-3 py-2">
            <div className="text-white/70 uppercase tracking-wider text-[10px]">Cost (gov)</div>
            <div className="font-bold text-sm">KES 0</div>
          </div>
          <div className="rounded-xl bg-white/15 px-3 py-2">
            <div className="text-white/70 uppercase tracking-wider text-[10px]">Time</div>
            <div className="font-bold text-sm">Same-day to 5d</div>
          </div>
          <div className="rounded-xl bg-white/15 px-3 py-2">
            <div className="text-white/70 uppercase tracking-wider text-[10px]">Validity</div>
            <div className="font-bold text-sm">12 months</div>
          </div>
          <div className="rounded-xl bg-white/15 px-3 py-2">
            <div className="text-white/70 uppercase tracking-wider text-[10px]">Where</div>
            <div className="font-bold text-sm">iTax (online)</div>
          </div>
        </div>
      </div>

      {/* Highlight: it's free */}
      <section className="mb-6 rounded-2xl border-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 p-5">
        <div className="flex items-start gap-3">
          <Sparkles className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-bold text-lg text-emerald-900 dark:text-emerald-200 mb-1">
              KRA charges KES 0 for this certificate.
            </h2>
            <p className="text-sm text-emerald-800 dark:text-emerald-200 leading-snug">
              If anyone asks you to "pay them KES 2,000 to get your TCC fast"
              — that's a scam. KRA never accepts cash for TCC. Your only
              actual cost is clearing any KRA back-taxes you actually owe.
            </p>
          </div>
        </div>
      </section>

      {/* Required info */}
      <section className="mb-6 rounded-2xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-950/20 p-5">
        <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
          <FileText className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
          Have these ready before you start
        </h2>
        <ul className="space-y-2 text-sm">
          {REQUIRED_INFO.map((info, i) => (
            <li key={i} className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-700 dark:text-emerald-300" />
              <span>{info}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Where it's accepted */}
      <section className="mb-6 rounded-2xl border border-cyan-200 dark:border-cyan-900/40 bg-cyan-50/60 dark:bg-cyan-950/20 p-5">
        <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-cyan-700 dark:text-cyan-300" />
          When you'll need it
        </h2>
        <ul className="space-y-2 text-sm">
          {ACCEPTED_USES.map((u, i) => (
            <li key={i} className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-cyan-700 dark:text-cyan-300" />
              <span>{u}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Timing tip */}
      <section className="mb-6 rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 p-5">
        <h2 className="font-bold text-lg mb-3 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-amber-600" />
          When to apply
        </h2>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug mb-2">
          TCC is valid 12 months. Apply 1–3 months before you need it for an
          embassy or job. Don't apply 9 months early — by the time you submit,
          the certificate may be flagged as stale by a strict embassy.
        </p>
        <p className="text-xs text-gray-600 dark:text-gray-400 leading-snug">
          Pro tip: UK Tier 2 / Skilled Worker applications sometimes ask for
          a TCC issued within the last 3 months. Time the download to match
          your visa appointment date.
        </p>
      </section>

      {/* Steps */}
      <section className="mb-8">
        <h2 className="font-bold text-xl mb-4">The 8 steps</h2>
        <ol className="space-y-3">
          {STEPS.map((step) => (
            <li
              key={step.n}
              className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 shadow-sm"
              data-testid={`tcc-step-${step.n}`}
            >
              <div className="flex items-start gap-3">
                <div className="shrink-0 h-9 w-9 rounded-full bg-gradient-to-br from-emerald-600 to-cyan-600 text-white flex items-center justify-center font-extrabold text-sm shadow-sm">
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
                      className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 text-sm font-semibold mt-2 underline underline-offset-2"
                    >
                      {step.cta.label} <ExternalLink className="h-3.5 w-3.5" />
                    </a>
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
          Why TCC applications get rejected
        </h2>
        <ul className="space-y-2 text-sm">
          <li className="flex items-start gap-2">
            <span className="mt-0.5">•</span>
            <span><b>Missed Nil Returns.</b> Even years where you earned nothing need a Nil Return on file. Most rejections are because the filer skipped years they were a student.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5">•</span>
            <span><b>Cents-level balance owing.</b> A KES 1 balance from interest accrued years ago is enough to block TCC. Check 'My Ledger' before applying.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5">•</span>
            <span><b>Old returns filed under wrong tax obligation.</b> If you registered VAT or PAYE you no longer need, KRA still expects filings. Either file Nil for each, or deregister the obligation via iTax.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5">•</span>
            <span><b>Mismatched PIN details.</b> If your name on iTax doesn't match your National ID exactly, update it first via iTax → 'Amend PIN Details'.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5">•</span>
            <span><b>Paying a broker.</b> Anyone asking for cash to "speed up" your TCC is a fraudster. KRA charges KES 0. Report at <Link href="/scam-checker" className="text-red-700 dark:text-red-300 underline">/scam-checker</Link>.</span>
          </li>
        </ul>
      </section>

      {/* Big CTA */}
      <section className="rounded-3xl bg-gradient-to-br from-emerald-700 via-emerald-600 to-cyan-600 p-6 text-white shadow-lg text-center">
        <h2 className="text-xl sm:text-2xl font-extrabold mb-2">Ready to download?</h2>
        <p className="text-sm text-white/90 mb-4 leading-snug">
          Open iTax now. Keep this guide open in another tab and follow the
          8 steps in order. If your returns are clean, you'll have your TCC
          PDF in under 30 minutes — completely free.
        </p>
        <a
          href={ITAX_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-white text-emerald-700 font-bold px-6 py-3 rounded-2xl hover:bg-emerald-50 transition-colors shadow-md"
          data-testid="tcc-start-itax"
        >
          Open iTax <ExternalLink className="h-4 w-4" />
        </a>
        <div className="mt-4 text-[11px] text-white/75">
          Stuck on iTax? Ask Nanjila — she'll walk you through it line by line.
        </div>
      </section>
    </main>
  );
}
