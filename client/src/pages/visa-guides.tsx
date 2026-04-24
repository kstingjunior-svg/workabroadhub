import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Globe,
  ArrowRight,
  FileText,
  ChevronRight,
  Sparkles,
  Clock,
  DollarSign,
  Shield,
  Users,
  Star,
  Briefcase,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const SEO_TITLE = "Visa & Immigration Guides 2025 | Work Abroad Hub";
const SEO_DESCRIPTION =
  "Free comprehensive visa and immigration guides for Canada, UK, USA, Germany and UAE. Eligibility, application steps, costs, processing times and official government links.";

const countries = [
  {
    slug: "canada",
    name: "Canada",
    flag: "🇨🇦",
    gradient: "from-red-600 to-red-700",
    visaType: "Express Entry / LMIA Work Permit",
    tagline: "One of the world's most popular immigration destinations",
    processing: "2–8 months",
    minCost: "CAD 1,325",
    highlights: ["Express Entry PR pathway", "LMIA work permits", "Provincial Nominee Programs"],
    difficulty: "Medium",
    difficultyColor: "text-yellow-600 bg-yellow-50",
  },
  {
    slug: "uk",
    name: "United Kingdom",
    flag: "🇬🇧",
    gradient: "from-blue-700 to-blue-900",
    visaType: "Skilled Worker Visa",
    tagline: "Sponsored employment pathway for skilled professionals",
    processing: "3–8 weeks",
    minCost: "£719",
    highlights: ["Licensed sponsor employer required", "Salary threshold £26,200+", "Path to settlement (ILR)"],
    difficulty: "Medium",
    difficultyColor: "text-yellow-600 bg-yellow-50",
  },
  {
    slug: "usa",
    name: "United States",
    flag: "🇺🇸",
    gradient: "from-blue-600 to-indigo-700",
    visaType: "H-1B / EB-3 / DV Lottery",
    tagline: "Multiple pathways from work visas to permanent residence",
    processing: "3–6 months",
    minCost: "$460",
    highlights: ["H-1B lottery cap applies", "Employer sponsorship required", "DV Lottery: 55,000 green cards yearly"],
    difficulty: "Hard",
    difficultyColor: "text-red-600 bg-red-50",
  },
  {
    slug: "germany",
    name: "Germany",
    flag: "🇩🇪",
    gradient: "from-gray-800 to-yellow-600",
    visaType: "Job Seeker Visa / EU Blue Card",
    tagline: "Europe's largest economy actively recruiting skilled workers",
    processing: "2–8 weeks",
    minCost: "€75",
    highlights: ["6-month Job Seeker Visa available", "EU Blue Card for high earners", "Recognised qualifications essential"],
    difficulty: "Medium",
    difficultyColor: "text-yellow-600 bg-yellow-50",
  },
  {
    slug: "uae",
    name: "United Arab Emirates",
    flag: "🇦🇪",
    gradient: "from-green-600 to-emerald-700",
    visaType: "Employment / Green / Golden Visa",
    tagline: "Tax-free salaries and fast-track visa processing",
    processing: "2–4 weeks",
    minCost: "AED 2,000",
    highlights: ["Employer-sponsored work visa", "Green Visa for skilled workers", "Golden Visa (10-year) for specialists"],
    difficulty: "Easy",
    difficultyColor: "text-green-600 bg-green-50",
  },
];

const conversionCards = [
  {
    icon: FileText,
    title: "Professional CV Rewrite",
    description: "Country-specific CV tailored for your target destination's employer expectations.",
    href: "/services",
    badge: "Career Service",
  },
  {
    icon: Users,
    title: "1-on-1 Consultation",
    description: "WhatsApp consultation with our advisors to plan your visa strategy step by step.",
    href: "/services",
    badge: "Consultation",
  },
  {
    icon: Sparkles,
    title: "Pro Plan — All Tools",
    description: "AI job matching, unlimited ATS checks, cover letters and priority WhatsApp support.",
    href: "/pricing",
    badge: "KES 4,500",
  },
];

export default function VisaGuidesPage() {
  const { user } = useAuth();

  return (
    <>
      <title>{SEO_TITLE}</title>
      <meta name="description" content={SEO_DESCRIPTION} />
      <meta name="keywords" content="visa application, work visa, immigration guide, work abroad, skilled worker visa, canada visa, uk visa, usa visa, germany visa, uae visa, Kenya immigration" />
      <meta property="og:title" content={SEO_TITLE} />
      <meta property="og:description" content={SEO_DESCRIPTION} />
      <meta property="og:type" content="website" />
      <meta name="robots" content="index, follow" />

      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">

        {/* ── Hero ─────────────────────────────────────────────── */}
        <div className="bg-gradient-to-br from-blue-700 via-blue-600 to-teal-600 text-white">
          <div className="max-w-5xl mx-auto px-4 py-14 md:py-20">
            <nav className="flex items-center gap-2 text-blue-200 text-sm mb-6" aria-label="Breadcrumb">
              <Link href="/">
                <span className="hover:text-white transition-colors cursor-pointer">Home</span>
              </Link>
              <ChevronRight className="h-3 w-3" />
              <span className="text-white font-medium">Visa & Immigration Guides</span>
            </nav>

            <div className="flex items-center gap-3 mb-5">
              <div className="bg-white/20 p-3 rounded-xl">
                <Globe className="h-7 w-7 text-white" />
              </div>
              <Badge className="bg-white/20 text-white border-white/30 text-sm px-3 py-1">
                Free Resource — 5 Countries
              </Badge>
            </div>

            <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-4">
              Visa & Immigration Guides
            </h1>
            <p className="text-blue-100 text-lg md:text-xl max-w-2xl leading-relaxed mb-8">
              Step-by-step guides for the most popular work visa and immigration destinations.
              Eligibility, application steps, costs, and official government links — all in one place.
            </p>

            {/* Stats */}
            <div className="flex flex-wrap gap-6">
              {[
                { icon: Globe, label: "Countries Covered", value: "5" },
                { icon: Clock, label: "Avg Processing", value: "Weeks–Months" },
                { icon: DollarSign, label: "Entry Cost Guide", value: "Included" },
                { icon: Shield, label: "Official Links", value: "Verified" },
              ].map((s) => (
                <div key={s.label} className="flex items-center gap-2 text-blue-100">
                  <s.icon className="h-4 w-4 text-blue-300" />
                  <span className="text-sm">{s.label}: <strong className="text-white">{s.value}</strong></span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Disclaimer ───────────────────────────────────────── */}
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-start gap-3">
            <Shield className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 font-medium">
              <strong>Disclaimer:</strong> This platform is not affiliated with any embassy or government.
              All information is for guidance only. Always verify with the official government website for your target country.
            </p>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 py-12 space-y-14">

          {/* ── Country Cards ─────────────────────────────────── */}
          <section aria-labelledby="countries-heading">
            <h2 id="countries-heading" className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Choose Your Destination
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-8">
              Select a country to see the full visa guide including requirements, steps, costs and official links.
            </p>

            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {countries.map((c) => (
                <Link key={c.slug} href={`/visa/${c.slug}`}>
                  <Card
                    className="cursor-pointer hover:shadow-lg hover:scale-[1.01] transition-all duration-200 border overflow-hidden h-full"
                    data-testid={`card-visa-country-${c.slug}`}
                  >
                    {/* Colour bar */}
                    <div className={`bg-gradient-to-r ${c.gradient} h-2`} />
                    <CardContent className="p-5 flex flex-col h-full">
                      <div className="flex items-start justify-between mb-3">
                        <span className="text-4xl" role="img" aria-label={c.name}>{c.flag}</span>
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${c.difficultyColor}`}>
                          {c.difficulty}
                        </span>
                      </div>

                      <h3 className="font-bold text-gray-900 dark:text-white text-lg mb-0.5">{c.name}</h3>
                      <p className="text-xs text-blue-600 font-medium mb-2">{c.visaType}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 flex-1">{c.tagline}</p>

                      <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
                        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-2">
                          <div className="text-gray-400 mb-0.5 flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Processing
                          </div>
                          <div className="font-semibold text-gray-700 dark:text-gray-300">{c.processing}</div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-2">
                          <div className="text-gray-400 mb-0.5 flex items-center gap-1">
                            <DollarSign className="h-3 w-3" /> From
                          </div>
                          <div className="font-semibold text-gray-700 dark:text-gray-300">{c.minCost}</div>
                        </div>
                      </div>

                      <ul className="space-y-1 mb-4">
                        {c.highlights.map((h) => (
                          <li key={h} className="flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                            <Star className="h-3 w-3 text-blue-500 flex-shrink-0 mt-0.5" />
                            {h}
                          </li>
                        ))}
                      </ul>

                      <div className="flex items-center gap-1 text-blue-600 text-sm font-semibold mt-auto">
                        Read Full Guide <ArrowRight className="h-4 w-4" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>

          {/* ── Conversion: Need Help? ─────────────────────────── */}
          <section aria-labelledby="help-heading">
            <div className="bg-gradient-to-r from-blue-600 to-teal-600 rounded-2xl p-8 text-white mb-8">
              <div className="max-w-xl">
                <Badge className="bg-white/20 text-white border-white/30 mb-4">Need Help Applying?</Badge>
                <h2 id="help-heading" className="text-2xl font-bold mb-3">
                  Let Our Experts Guide You
                </h2>
                <p className="text-blue-100 mb-6">
                  Reading the guide is step one. Our consultants have helped thousands of Kenyan professionals
                  successfully navigate work visa applications. Don't go it alone.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link href="/services">
                    <Button className="bg-white text-blue-700 hover:bg-blue-50 font-bold" data-testid="button-visa-guides-services">
                      Explore Services <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                  <Link href="/pricing">
                    <Button variant="outline" className="border-white/50 text-white hover:bg-white/10" data-testid="button-visa-guides-pricing">
                      View Plans
                    </Button>
                  </Link>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {conversionCards.map((card) => (
                <Link key={card.title} href={card.href}>
                  <Card
                    className="cursor-pointer hover:shadow-md hover:border-blue-300 transition-all h-full"
                    data-testid={`card-cta-${card.title.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <CardContent className="p-5 flex flex-col h-full">
                      <div className="flex items-start justify-between mb-3">
                        <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg">
                          <card.icon className="h-5 w-5 text-blue-600" />
                        </div>
                        <Badge className="bg-blue-100 text-blue-700 text-xs">{card.badge}</Badge>
                      </div>
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{card.title}</h3>
                      <p className="text-gray-500 text-sm flex-1">{card.description}</p>
                      <div className="flex items-center gap-1 mt-3 text-blue-600 text-sm font-medium">
                        Get started <ArrowRight className="h-4 w-4" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>

            {!user && (
              <div className="mt-8 text-center">
                <p className="text-gray-500 mb-3">Create a free account to access all career tools</p>
                <a href="/api/login">
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white px-8" data-testid="button-signup-visa-guides">
                    Get Started Free <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </a>
              </div>
            )}
          </section>

          {/* ── Related Guides ────────────────────────────────── */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Related Guides</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { href: "/green-card", label: "🇺🇸 USA Green Card (DV Lottery) Guide", sub: "55,000 permanent residency visas yearly" },
                { href: "/student-visas", label: "🎓 Student Visa Guide", sub: "Study at top universities in 6 countries" },
                { href: "/nea-agencies", label: "🔍 NEA Licensed Agencies", sub: "Verify your recruitment agency before you travel" },
                { href: "/tools/job-scam-checker", label: "🛡️ Job Scam Checker", sub: "Detect fraudulent overseas job offers" },
              ].map((link) => (
                <Link key={link.href} href={link.href}>
                  <div
                    className="flex items-center justify-between p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer"
                    data-testid={`link-related-${link.href.replace(/\//g, "-")}`}
                  >
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white text-sm">{link.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{link.sub}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* ── Legal Disclaimer ──────────────────────────────── */}
          <section className="bg-gray-100 dark:bg-gray-900 rounded-xl p-5 text-sm text-gray-500 dark:text-gray-400">
            <p className="font-semibold text-gray-700 dark:text-gray-300 mb-2">Important Disclaimer</p>
            <p>
              WorkAbroad Hub is not affiliated with any embassy, consulate, or government immigration authority.
              The information on this page is for general guidance only and may not reflect the most recent policy changes.
              Always consult the official government immigration website for authoritative information before making
              any visa application. We recommend seeking professional immigration legal advice for complex cases.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
