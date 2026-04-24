import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  CheckCircle2,
  ExternalLink,
  AlertTriangle,
  Calendar,
  Globe,
  Users,
  FileText,
  Star,
  Shield,
  ArrowRight,
  Flag,
  Clock,
  BookOpen,
  ChevronRight,
  Landmark,
  TrendingUp,
  Sparkles,
  Award,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

// ─── SEO Meta ────────────────────────────────────────────────────────────────
const SEO_TITLE = "USA Green Card (DV Lottery) Guide 2025 | WorkAbroad Hub";
const SEO_DESCRIPTION =
  "Complete guide to the USA Diversity Visa (DV) Lottery Green Card program. Eligibility, application steps, important dates, and official links. Free resource for Kenyan and African applicants.";

// ─── Data ────────────────────────────────────────────────────────────────────
const eligibilityRequirements = [
  {
    title: "Country of Birth",
    description:
      "You must be a native of an eligible country. Most African countries including Kenya, Uganda, Tanzania, Ethiopia, Ghana, and many others are eligible. Countries that sent more than 50,000 immigrants to the US in the past 5 years are excluded (e.g. Nigeria in some years, Mexico, China, India).",
    icon: Globe,
    status: "check",
  },
  {
    title: "Education or Work Experience",
    description:
      "You must have at least a high school education or its equivalent (completion of 12-year primary and secondary education), OR two years of work experience within the past five years in an occupation requiring at least two years of training or experience.",
    icon: BookOpen,
    status: "check",
  },
  {
    title: "No Criminal Record",
    description:
      "Applicants must be admissible under US immigration law. Certain criminal convictions, health conditions, and security concerns may make you ineligible.",
    icon: Shield,
    status: "check",
  },
  {
    title: "Age",
    description:
      "There is no minimum or maximum age requirement, but you must meet the education or work experience requirement which practically means you need to be at least 18 in most cases.",
    icon: Calendar,
    status: "info",
  },
  {
    title: "Spouse & Children",
    description:
      "Your spouse and unmarried children under 21 can be included on your application and will receive green cards if you are selected.",
    icon: Users,
    status: "check",
  },
];

const applicationSteps = [
  {
    step: 1,
    title: "Check Registration Period",
    description:
      "The DV Lottery registration window typically opens in October each year for about 30 days. DV-2026 entries were accepted from October 2–November 5, 2024. Watch for DV-2027 opening around October 2025.",
    icon: Calendar,
    tip: "Set a reminder — missing the window means waiting a full year.",
  },
  {
    step: 2,
    title: "Prepare Your Documents",
    description:
      "Gather recent digital photos meeting US visa photo standards (2×2 inches, white background, plain expression), your passport details, and information on your education/work history.",
    icon: FileText,
    tip: "Photo errors are the most common reason for disqualification — follow the official photo requirements exactly.",
  },
  {
    step: 3,
    title: "Submit Your Entry Online",
    description:
      "Go to dvprogram.state.gov and complete the Electronic Diversity Visa Entry Form (E-DV). The entry is completely free. You will receive a unique confirmation number — save it carefully.",
    icon: Globe,
    tip: "Only ONE entry per person is allowed. Submitting more than one entry disqualifies you.",
  },
  {
    step: 4,
    title: "Check Your Results",
    description:
      "Results are published on dvprogram.state.gov starting in May of the following year. You need your confirmation number and other personal details to check. Results are NOT sent by email or letter.",
    icon: Star,
    tip: "Beware of scammers who email claiming you won. The US government never notifies winners by email.",
  },
  {
    step: 5,
    title: "If Selected — Submit DS-260",
    description:
      "Selected applicants (and family members) must complete the DS-260 Immigrant Visa Application online through the Consular Electronic Application Center (CEAC). You'll need police certificates, medical exam results, and financial support documents.",
    icon: FileText,
    tip: "Being selected is not a guarantee of a green card. You still need to pass the interview and medical exam.",
  },
  {
    step: 6,
    title: "Attend Visa Interview",
    description:
      "If your case number is current (there are limited visas), you'll be scheduled for an interview at a US Embassy or Consulate. Bring all original documents. If approved, your visa stamp allows you to travel to the US and receive your green card.",
    icon: Landmark,
    tip: "All 55,000 DV visas must be issued by September 30 each fiscal year. Cases not processed by then are cancelled.",
  },
];

const importantDates = [
  {
    event: "DV-2026 Registration",
    dates: "October 2 – November 5, 2024",
    status: "closed",
    note: "Closed",
  },
  {
    event: "DV-2026 Results Available",
    dates: "May 2025",
    status: "active",
    note: "Check now at dvprogram.state.gov",
  },
  {
    event: "DV-2026 Visa Deadline",
    dates: "September 30, 2026",
    status: "upcoming",
    note: "All interviews must be completed by this date",
  },
  {
    event: "DV-2027 Registration (Estimated)",
    dates: "October 2025",
    status: "upcoming",
    note: "Watch the official site for announcement",
  },
];

const faqs = [
  {
    q: "Is the DV Lottery really free?",
    a: "Yes. Submitting your entry to the DV Lottery at dvprogram.state.gov is completely free. Any website that charges you to enter is a scam. The only costs you will pay are the official visa application fees ($330 per person) if you are selected and proceed with the visa process.",
  },
  {
    q: "What are my chances of being selected?",
    a: "Approximately 22–28 million entries are received each year for 55,000 available visas. Selection is random. However, since only eligible countries can apply, some nationalities have better odds than others. African applicants generally have favorable odds because many African countries are on the eligible list.",
  },
  {
    q: "Can I apply while already in the US on a different visa?",
    a: "Yes. You can enter the DV Lottery regardless of your current immigration status. However, if you are selected, you will still need to go through the full immigrant visa process.",
  },
  {
    q: "What happens if I submit more than one entry?",
    a: "You will be automatically disqualified. The system is designed to detect duplicate entries. Submit only once.",
  },
  {
    q: "Does my spouse count as a separate entry?",
    a: "No. Spouses can each submit their own separate entry if both are eligible. If either spouse is selected, the other and your children can be included. You should both enter since this doubles your chance of selection.",
  },
  {
    q: "How will I know if I'm selected?",
    a: "You check your results yourself at dvprogram.state.gov using your confirmation number. The US government NEVER emails you to say you won. Any email claiming you won the lottery is a scam.",
  },
  {
    q: "Is Kenya an eligible country?",
    a: "Yes. Kenya is currently an eligible country for the DV Lottery. Most sub-Saharan African countries qualify. Always verify on the official program instructions each year as eligibility can change.",
  },
];

const conversionServices = [
  {
    title: "ATS CV Checker",
    description: "Optimise your CV to pass US employer screening systems before you get there.",
    href: "/tools/ats-cv-checker",
    badge: "Free Tool",
    badgeColor: "bg-green-100 text-green-700",
    icon: FileText,
  },
  {
    title: "Country-Specific CV Rewrite",
    description: "Get a professionally rewritten CV tailored for the US job market by our experts.",
    href: "/services",
    badge: "Career Service",
    badgeColor: "bg-blue-100 text-blue-700",
    icon: Star,
  },
  {
    title: "Interview Coaching",
    description: "1-on-1 coaching to prepare you for US employer and embassy interviews.",
    href: "/services",
    badge: "Career Service",
    badgeColor: "bg-blue-100 text-blue-700",
    icon: Users,
  },
  {
    title: "Pro Plan — Unlimited Access",
    description: "Unlock all tools, AI job matching, WhatsApp consultations and priority support.",
    href: "/pricing",
    badge: "KES 4,500",
    badgeColor: "bg-purple-100 text-purple-700",
    icon: Sparkles,
  },
];

// ─── Component ───────────────────────────────────────────────────────────────
export default function GreenCardPage() {
  const { user } = useAuth();

  return (
    <>
      {/* SEO */}
      <title>{SEO_TITLE}</title>
      <meta name="description" content={SEO_DESCRIPTION} />
      <meta name="keywords" content="green card application, DV lottery, USA visa lottery, diversity visa, green card Kenya, DV-2026, DV-2027, US permanent residency, green card Africa" />
      <meta property="og:title" content={SEO_TITLE} />
      <meta property="og:description" content={SEO_DESCRIPTION} />
      <meta property="og:type" content="article" />
      <meta name="robots" content="index, follow" />

      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <div className="bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-700 text-white">
          <div className="max-w-4xl mx-auto px-4 py-12 md:py-20">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-blue-200 text-sm mb-6" aria-label="Breadcrumb">
              <Link href="/">
                <span className="hover:text-white transition-colors cursor-pointer">Home</span>
              </Link>
              <ChevronRight className="h-3 w-3" />
              <span className="text-white font-medium">Green Card Guide</span>
            </nav>

            <div className="flex items-center gap-3 mb-4">
              <div className="bg-white/20 p-3 rounded-xl">
                <Flag className="h-7 w-7 text-white" />
              </div>
              <Badge className="bg-white/20 text-white border-white/30 text-sm px-3 py-1">
                USA Diversity Visa (DV) Lottery
              </Badge>
            </div>

            <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-4">
              USA Green Card Guide
              <span className="block text-blue-200 text-2xl md:text-3xl font-medium mt-2">
                DV Lottery 2025 / 2026 — Complete Overview
              </span>
            </h1>

            <p className="text-blue-100 text-lg md:text-xl max-w-2xl leading-relaxed mb-8">
              The Diversity Visa (DV) Lottery gives 55,000 people each year the chance to live and work permanently in the United States. 
              This guide covers everything you need to know — eligibility, how to apply, and the key dates to watch.
            </p>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4 max-w-xl">
              {[
                { label: "Visas Available", value: "55,000", icon: Award },
                { label: "Countries Eligible", value: "160+", icon: Globe },
                { label: "Entry Cost", value: "FREE", icon: TrendingUp },
              ].map((stat) => (
                <div key={stat.label} className="bg-white/10 rounded-xl p-3 text-center">
                  <stat.icon className="h-5 w-5 mx-auto mb-1 text-blue-200" />
                  <div className="text-xl font-bold">{stat.value}</div>
                  <div className="text-xs text-blue-200">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Disclaimer Banner ─────────────────────────────────────────── */}
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-sm text-amber-800 font-medium" role="note">
              <strong>Disclaimer:</strong> This platform is not affiliated with the US government or the DV Lottery program. 
              This guide is for informational purposes only. Always verify details on the official US government website at{" "}
              <a
                href="https://dvprogram.state.gov"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-amber-900"
              >
                dvprogram.state.gov
              </a>.
            </p>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-10 space-y-12">

          {/* ── What is the DV Lottery ──────────────────────────────────── */}
          <section aria-labelledby="what-is-dv">
            <h2 id="what-is-dv" className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
              <Globe className="h-6 w-6 text-blue-600" />
              What is the Green Card Lottery?
            </h2>
            <Card>
              <CardContent className="p-6 space-y-4 text-gray-700 dark:text-gray-300 leading-relaxed">
                <p>
                  The <strong>Diversity Immigrant Visa Program</strong> — commonly called the Green Card Lottery or DV Lottery — 
                  is a US government program that makes up to <strong>55,000 immigrant visas (green cards)</strong> available 
                  each fiscal year to people from countries with historically low immigration rates to the United States.
                </p>
                <p>
                  A green card grants you <strong>Lawful Permanent Resident (LPR)</strong> status in the United States, 
                  meaning you can live, work, and study in the US indefinitely. After holding a green card for five years 
                  (three years if married to a US citizen), you can apply for US citizenship.
                </p>
                <p>
                  The program is run by the US Department of State. Selection is done by a <strong>random computer drawing</strong> 
                  — there is no exam, no essay, and no way to improve your chances beyond submitting a valid entry during the 
                  registration window.
                </p>
                <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mt-4">
                  <p className="text-blue-800 dark:text-blue-200 text-sm font-medium">
                    🔑 Key fact: Selection gives you a chance to apply for a visa — it does not guarantee a green card. 
                    You still need to pass a medical exam, background check, and embassy interview.
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ── Eligibility ────────────────────────────────────────────── */}
          <section aria-labelledby="eligibility">
            <h2 id="eligibility" className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
              Eligibility Requirements
            </h2>
            <div className="space-y-4">
              {eligibilityRequirements.map((req) => (
                <Card key={req.title} className="border-l-4 border-l-green-500">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded-lg flex-shrink-0">
                        <req.icon className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{req.title}</h3>
                        <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">{req.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* ── Application Steps ──────────────────────────────────────── */}
          <section aria-labelledby="application-steps">
            <h2 id="application-steps" className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
              <FileText className="h-6 w-6 text-blue-600" />
              Application Steps
            </h2>
            <div className="space-y-4">
              {applicationSteps.map((s) => (
                <Card key={s.step}>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg">
                        {s.step}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-gray-900 dark:text-white">{s.title}</h3>
                        </div>
                        <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed mb-3">{s.description}</p>
                        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                          <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                          <p className="text-amber-800 dark:text-amber-200 text-xs font-medium">{s.tip}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* ── Official Apply Button ──────────────────────────────────── */}
          <section className="text-center py-6">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-8 text-white">
              <Flag className="h-12 w-12 mx-auto mb-4 opacity-90" />
              <h2 className="text-2xl font-bold mb-2">Ready to Enter the DV Lottery?</h2>
              <p className="text-blue-100 mb-6 max-w-md mx-auto">
                The official entry is at dvprogram.state.gov. It is completely free. 
                Do not pay any third party to submit your application.
              </p>
              <a
                href="https://dvprogram.state.gov"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="button-apply-official"
              >
                <Button
                  size="lg"
                  className="bg-white text-blue-700 hover:bg-blue-50 font-bold px-8 py-3 text-base shadow-lg"
                >
                  Apply on Official Website
                  <ExternalLink className="ml-2 h-5 w-5" />
                </Button>
              </a>
              <p className="text-blue-200 text-xs mt-4">
                Opens dvprogram.state.gov — official US Department of State website
              </p>
            </div>
          </section>

          {/* ── Important Dates ────────────────────────────────────────── */}
          <section aria-labelledby="important-dates">
            <h2 id="important-dates" className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
              <Calendar className="h-6 w-6 text-purple-600" />
              Important Dates
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {importantDates.map((d) => (
                <Card key={d.event} className={
                  d.status === "closed"
                    ? "border-gray-200 opacity-70"
                    : d.status === "active"
                    ? "border-green-400 ring-1 ring-green-400"
                    : "border-blue-200"
                }>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white text-sm">{d.event}</p>
                        <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">{d.dates}</p>
                        <p className={`text-xs font-medium mt-1 ${
                          d.status === "active" ? "text-green-600" :
                          d.status === "closed" ? "text-gray-400" :
                          "text-blue-600"
                        }`}>{d.note}</p>
                      </div>
                      <Badge variant="outline" className={
                        d.status === "active" ? "border-green-500 text-green-700 bg-green-50" :
                        d.status === "closed" ? "border-gray-300 text-gray-400" :
                        "border-blue-400 text-blue-700 bg-blue-50"
                      }>
                        {d.status === "active" ? "Active" : d.status === "closed" ? "Closed" : "Upcoming"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* ── FAQ ───────────────────────────────────────────────────── */}
          <section aria-labelledby="faq">
            <h2 id="faq" className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-teal-600" />
              Frequently Asked Questions
            </h2>
            <Card>
              <CardContent className="p-0">
                <Accordion type="single" collapsible className="w-full">
                  {faqs.map((faq, i) => (
                    <AccordionItem key={i} value={`faq-${i}`}>
                      <AccordionTrigger className="px-6 text-left font-medium text-gray-900 dark:text-white hover:no-underline">
                        {faq.q}
                      </AccordionTrigger>
                      <AccordionContent className="px-6 pb-4 text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                        {faq.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          </section>

          {/* ── Scam Warning ──────────────────────────────────────────── */}
          <section>
            <Card className="border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-red-700 dark:text-red-400 flex items-center gap-2 text-lg">
                  <Shield className="h-5 w-5" />
                  Protect Yourself from DV Lottery Scams
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-red-700 dark:text-red-300 text-sm">
                  The DV Lottery attracts many scammers. Protect yourself:
                </p>
                <ul className="space-y-2">
                  {[
                    "The US government NEVER emails you to notify you of selection. Check results yourself at dvprogram.state.gov.",
                    "The entry is completely FREE. Never pay anyone to submit your application.",
                    "There is no way to increase your chances of winning — it is a random draw.",
                    "Beware of 'agents' who claim they can guarantee selection. They cannot.",
                    "Check our Job Scam Checker tool to verify any overseas job offer you receive after winning.",
                  ].map((point) => (
                    <li key={point} className="flex items-start gap-2 text-sm text-red-700 dark:text-red-300">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-red-500" />
                      {point}
                    </li>
                  ))}
                </ul>
                <div className="pt-2">
                  <Link href="/tools/job-scam-checker">
                    <Button variant="outline" size="sm" className="border-red-300 text-red-700 hover:bg-red-100" data-testid="button-scam-checker-green-card">
                      Check a Suspicious Job Offer
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ── Conversion Section ────────────────────────────────────── */}
          <section aria-labelledby="conversion">
            <div className="border-t pt-10">
              <div className="text-center mb-8">
                <Badge className="bg-blue-100 text-blue-700 mb-3">Boost Your Chances Once You Arrive</Badge>
                <h2 id="conversion" className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                  Prepare for the US Job Market
                </h2>
                <p className="text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
                  Getting a green card is only the first step. Let us help you land a great job once you're in the US 
                  with professional CV writing, interview coaching, and AI-powered career tools.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {conversionServices.map((svc) => (
                  <Link key={svc.title} href={svc.href}>
                    <Card
                      className="cursor-pointer hover:shadow-md transition-shadow border hover:border-blue-300 h-full"
                      data-testid={`card-service-${svc.title.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <CardContent className="p-5 h-full flex flex-col">
                        <div className="flex items-start justify-between mb-3">
                          <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg">
                            <svc.icon className="h-5 w-5 text-blue-600" />
                          </div>
                          <Badge className={`text-xs ${svc.badgeColor}`}>{svc.badge}</Badge>
                        </div>
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{svc.title}</h3>
                        <p className="text-gray-500 dark:text-gray-400 text-sm flex-1">{svc.description}</p>
                        <div className="flex items-center gap-1 mt-3 text-blue-600 text-sm font-medium">
                          Get started <ArrowRight className="h-4 w-4" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>

              {!user && (
                <div className="mt-6 text-center">
                  <p className="text-gray-500 text-sm mb-3">Create a free account to access all career tools</p>
                  <a href="/api/login">
                    <Button
                      className="bg-blue-600 hover:bg-blue-700 text-white px-8"
                      data-testid="button-signup-green-card"
                    >
                      Get Started — Free
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </a>
                </div>
              )}
            </div>
          </section>

          {/* ── Disclaimer Footer ─────────────────────────────────────── */}
          <section className="bg-gray-100 dark:bg-gray-900 rounded-xl p-5 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            <p className="font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Important Disclaimer
            </p>
            <p>
              WorkAbroad Hub is not affiliated with, endorsed by, or connected to the United States government, 
              the US Department of State, or the Diversity Visa Lottery program. The information on this page 
              is provided for general informational purposes only and may not reflect the most current program details. 
              Always refer to the official US Department of State website at{" "}
              <a
                href="https://dvprogram.state.gov"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-blue-600 hover:text-blue-700"
              >
                dvprogram.state.gov
              </a>{" "}
              and{" "}
              <a
                href="https://travel.state.gov"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-blue-600 hover:text-blue-700"
              >
                travel.state.gov
              </a>{" "}
              for authoritative and up-to-date information. Use of this page does not create an 
              attorney-client or consultant relationship.
            </p>
          </section>

        </div>
      </div>
    </>
  );
}
