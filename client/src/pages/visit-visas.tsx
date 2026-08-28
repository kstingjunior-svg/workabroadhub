/**
 * /visit-visas — Visit/tourist visa hub for every country WorkAbroad Hub
 * covers.
 *
 * 2026-08 (Tony's request): "add visit visa guidance + portals for the
 * countries we've covered". This is a public page (no auth required — Tony
 * wants the top-of-funnel to be as high-visibility as possible for SEO;
 * users who want the full career package come back and sign up).
 *
 * Data shape per country:
 *   • flag + name
 *   • visa type name (B1/B2, Schengen C, Standard Visitor, etc.)
 *   • cost (local currency + approx KES)
 *   • processing time
 *   • max stay + typical validity
 *   • where to apply from Nairobi (embassy / VFS Global / TLScontact / e-visa)
 *   • official government application URL
 *   • real Kenya-specific gotcha (financial proof, biometrics, etc.)
 *
 * All URLs are official government or officially-outsourced visa-application
 * centres — no aggregators, no scams. If any URL rots or an embassy moves,
 * update this file directly (it's the single source of truth for the page).
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { usePageSeo } from "@/hooks/use-page-seo";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Globe,
  ExternalLink,
  Search,
  MapPin,
  Clock,
  DollarSign,
  AlertTriangle,
  ShieldCheck,
  ArrowRight,
  BookOpen,
  Landmark,
} from "lucide-react";

// ─── Data ─────────────────────────────────────────────────────────────────

interface VisitVisa {
  slug:        string;
  name:        string;
  flag:        string;
  visaType:    string;
  cost:        string;        // local currency + approx KES
  processing:  string;
  maxStay:     string;
  validity:    string;
  applyFrom:   string;        // Where in Nairobi / how
  officialUrl: string;
  officialLabel: string;
  vfsUrl?:     string;        // Optional VFS/TLScontact URL
  vfsLabel?:   string;
  gotcha:      string;        // The one thing Kenyans always trip on
  difficulty:  "Easy" | "Medium" | "Hard";
}

// Verified as of 2026-08. Costs are in local currency; KES equivalents are
// approximate and will drift with FX — the number is a decision-support
// figure, not a quote. Every "applyFrom" line is grounded in current
// embassy / VFS Global / TLScontact operations in Nairobi.
const COUNTRIES: VisitVisa[] = [
  {
    slug:          "usa",
    name:          "United States",
    flag:          "🇺🇸",
    visaType:      "B1/B2 Visitor Visa (Business / Tourism)",
    cost:          "USD 185 (≈ KES 24,000)",
    processing:    "Interview wait: 6–12 months (Nairobi is heavily backlogged)",
    maxStay:       "Up to 6 months per entry (decided by CBP officer at airport)",
    validity:      "Typically 10 years multi-entry once approved",
    applyFrom:     "US Embassy Nairobi — United Nations Avenue, Gigiri. In-person interview required.",
    officialUrl:   "https://ke.usembassy.gov/visas/",
    officialLabel: "US Embassy Nairobi — Visas",
    vfsUrl:        "https://www.ustraveldocs.com/ke/",
    vfsLabel:      "US Travel Docs (appointment booking + fees)",
    gotcha:        "You'll need strong ties to Kenya (job, property, family) — the officer decides in <2 minutes and default answer is 'no'. Bring bank statements, employment letter, land title, and return ticket.",
    difficulty:    "Hard",
  },
  {
    slug:          "canada",
    name:          "Canada",
    flag:          "🇨🇦",
    visaType:      "Temporary Resident Visa (TRV) — Visitor",
    cost:          "CAD 100 + CAD 85 biometrics (≈ KES 21,000 total)",
    processing:    "4–8 weeks (varies with season)",
    maxStay:       "Up to 6 months per entry",
    validity:      "Up to 10 years multi-entry (subject to passport expiry)",
    applyFrom:     "Apply online at IRCC. Biometrics at VFS Global Nairobi (ABC Place, Waiyaki Way, Westlands).",
    officialUrl:   "https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada.html",
    officialLabel: "IRCC — Visit Canada (Official)",
    vfsUrl:        "https://visa.vfsglobal.com/ken/en/can",
    vfsLabel:      "VFS Global Kenya — Canada",
    gotcha:        "Proof of funds is the #1 refusal reason. Show at least 6 months of stable bank statements — no sudden large deposits (looks like a loan). CAD 2,500/month of stay is the informal floor.",
    difficulty:    "Medium",
  },
  {
    slug:          "uk",
    name:          "United Kingdom",
    flag:          "🇬🇧",
    visaType:      "Standard Visitor Visa",
    cost:          "£127 (≈ KES 21,000) for 6 months; £480 for 2 years multi-entry",
    processing:    "3–6 weeks (priority: 5 working days for +£500)",
    maxStay:       "Up to 6 months per entry",
    validity:      "6 months / 2 / 5 / 10 years multi-entry available",
    applyFrom:     "Apply online at gov.uk. Biometrics + document submission at VFS Global Nairobi (Rose Avenue, off Ngong Road).",
    officialUrl:   "https://www.gov.uk/standard-visitor",
    officialLabel: "gov.uk — Standard Visitor Visa (Official)",
    vfsUrl:        "https://www.vfsglobal.co.uk/ke/en",
    vfsLabel:      "VFS Global Kenya — UK Visas",
    gotcha:        "UKVI wants to see you WILL leave. Return flight ticket, KES 250k+ in bank, employer letter with salary + leave dates, and property/family ties in Kenya. First-time applicants: apply for 6 months, not 2 years — refusal rate is lower.",
    difficulty:    "Medium",
  },
  {
    slug:          "australia",
    name:          "Australia",
    flag:          "🇦🇺",
    visaType:      "Visitor Visa (subclass 600)",
    cost:          "AUD 195 base (≈ KES 17,000); higher for business stream",
    processing:    "4–6 weeks (median); some cases 3–4 months",
    maxStay:       "3, 6 or 12 months (case-by-case)",
    validity:      "Usually 12 months multi-entry",
    applyFrom:     "Apply online at ImmiAccount. Biometrics at VFS Global Nairobi (ABC Place, Waiyaki Way).",
    officialUrl:   "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/visitor-600",
    officialLabel: "Home Affairs — Visitor Visa 600 (Official)",
    vfsUrl:        "https://visa.vfsglobal.com/ken/en/aus",
    vfsLabel:      "VFS Global Kenya — Australia",
    gotcha:        "Australia asks for medical exam (Bupa Medical Nairobi, ~KES 12k) for stays >3 months or if you look 'high-risk'. Also requires health insurance covering the full stay.",
    difficulty:    "Medium",
  },
  {
    slug:          "uae",
    name:          "United Arab Emirates",
    flag:          "🇦🇪",
    visaType:      "Tourist Visa (30 / 60 days)",
    cost:          "AED 350–650 (≈ KES 12,000–22,000) via airline/hotel; direct GDRFA cheaper",
    processing:    "2–5 working days",
    maxStay:       "30 or 60 days per entry",
    validity:      "60 days from issue to enter",
    applyFrom:     "Easiest: apply through Emirates or Etihad when you book your flight. Or apply directly at GDRFA / ICP online — no embassy visit needed.",
    officialUrl:   "https://icp.gov.ae/en/services/tourist-entry-permits/",
    officialLabel: "ICP UAE — Tourist Entry Permits (Official)",
    vfsUrl:        "https://www.emirates.com/ke/english/help/visa-passport-information/",
    vfsLabel:      "Emirates — Visa Service (easiest for Kenyans)",
    gotcha:        "The UAE is one of the easiest visas for Kenyans — almost no refusals for genuine tourists. Book flights + apply through Emirates/Etihad and skip the paperwork mess entirely.",
    difficulty:    "Easy",
  },
  {
    slug:          "schengen-europe",
    name:          "Europe (Schengen — 27 countries)",
    flag:          "🇪🇺",
    visaType:      "Schengen Short-Stay Visa (C-visa)",
    cost:          "€90 (≈ KES 13,500)",
    processing:    "15–30 calendar days (up to 45 in busy season)",
    maxStay:       "90 days within any 180-day period",
    validity:      "Depends on approval — single, multi-entry, up to 5 years",
    applyFrom:     "Apply at the embassy of your MAIN destination (where you'll spend most days). Most embassies use TLScontact or VFS Global in Nairobi.",
    officialUrl:   "https://home-affairs.ec.europa.eu/policies/schengen-borders-and-visa/visa-policy_en",
    officialLabel: "EU Commission — Schengen Visa (Official)",
    vfsUrl:        "https://ke.tlscontact.com/",
    vfsLabel:      "TLScontact Kenya (handles France, Germany, Netherlands + more)",
    gotcha:        "You MUST apply at the embassy of your first/main destination. Applying at 'the easiest' embassy is fraud and gets refused. Book flights AFTER you get the visa, not before.",
    difficulty:    "Medium",
  },
  {
    slug:          "turkey",
    name:          "Turkey",
    flag:          "🇹🇷",
    visaType:      "e-Visa (Sticker Visa)",
    cost:          "USD 50 (≈ KES 6,500) — Kenyan passport holders",
    processing:    "Usually instant; up to 24 hours",
    maxStay:       "30 days per entry",
    validity:      "180 days from issue (multiple entries)",
    applyFrom:     "100% online — no embassy visit, no VFS. Apply at the official Turkish government e-Visa portal only.",
    officialUrl:   "https://www.evisa.gov.tr/en/",
    officialLabel: "Republic of Türkiye — Official e-Visa Portal",
    gotcha:        "ONLY use evisa.gov.tr — dozens of scam sites charge KES 5,000+ for the same e-visa and forge the sticker. Cost is USD 50 exactly, paid by card. Print two copies.",
    difficulty:    "Easy",
  },
  {
    slug:          "luxembourg",
    name:          "Luxembourg",
    flag:          "🇱🇺",
    visaType:      "Schengen Short-Stay Visa (via Belgium)",
    cost:          "€90 (≈ KES 13,500)",
    processing:    "15–30 calendar days",
    maxStay:       "90 days within any 180-day period",
    validity:      "As per Schengen approval",
    applyFrom:     "Luxembourg has NO embassy in Kenya. Belgium's embassy in Nairobi processes Luxembourg-primary visas via TLScontact.",
    officialUrl:   "https://luxembourg.public.lu/en/moving-luxembourg/short-term-stay/visa.html",
    officialLabel: "Luxembourg Government — Short-Term Stay Visa (Official)",
    vfsUrl:        "https://ke.tlscontact.com/",
    vfsLabel:      "TLScontact Nairobi (Belgium handles Luxembourg applications)",
    gotcha:        "Luxembourg is tiny — if it's not your primary destination, apply through the embassy of wherever you're spending the most days instead. Applications judged strictly on financial proof.",
    difficulty:    "Medium",
  },
  {
    slug:          "ireland",
    name:          "Ireland",
    flag:          "🇮🇪",
    visaType:      "Short-Stay 'C' Visa (Tourist / Visit)",
    cost:          "€60 single-entry, €100 multi-entry (≈ KES 9,000–15,000)",
    processing:    "4–8 weeks",
    maxStay:       "Up to 90 days per entry",
    validity:      "3 months from issue for single-entry",
    applyFrom:     "Apply online at Irish Immigration Service. Biometrics + docs submitted at VFS Global Nairobi (Rose Avenue).",
    officialUrl:   "https://www.irishimmigration.ie/coming-to-visit-ireland/",
    officialLabel: "Irish Immigration Service — Visit Ireland (Official)",
    vfsUrl:        "https://visas.vfsglobal.com/ken/en/irl",
    vfsLabel:      "VFS Global Kenya — Ireland",
    gotcha:        "Ireland is NOT in Schengen — you need a separate Irish visa even if you have a Schengen visa. UK Short-Stay visa CANNOT be used for Ireland. Apply for the correct one.",
    difficulty:    "Medium",
  },
  {
    slug:          "netherlands",
    name:          "Netherlands",
    flag:          "🇳🇱",
    visaType:      "Schengen Short-Stay Visa (Dutch consulate)",
    cost:          "€90 (≈ KES 13,500)",
    processing:    "15 calendar days (up to 45 in high season)",
    maxStay:       "90 days within any 180-day period",
    validity:      "As per Schengen approval",
    applyFrom:     "Netherlands Embassy Nairobi (Riverside Drive) — applications submitted via VFS Global.",
    officialUrl:   "https://www.netherlandsworldwide.nl/countries/kenya/travel-and-residence/applying-for-a-short-stay-schengen-visa-in-kenya",
    officialLabel: "Netherlands Worldwide — Visa from Kenya (Official)",
    vfsUrl:        "https://visa.vfsglobal.com/ken/en/nld",
    vfsLabel:      "VFS Global Kenya — Netherlands",
    gotcha:        "The Dutch consulate is strict on 'travel history' — first-time European travelers are often refused. Build travel history via easier visas first (UAE, Turkey, South Africa) before applying.",
    difficulty:    "Medium",
  },
  {
    slug:          "new-zealand",
    name:          "New Zealand",
    flag:          "🇳🇿",
    visaType:      "Visitor Visa",
    cost:          "NZD 246 (≈ KES 20,000) + biometrics",
    processing:    "4–6 weeks (median); can extend to 8 weeks",
    maxStay:       "Up to 9 months per entry",
    validity:      "Typically single-entry; multi-entry available on request",
    applyFrom:     "Apply online via Immigration NZ. Biometrics at VFS Global Nairobi.",
    officialUrl:   "https://www.immigration.govt.nz/new-zealand-visas/apply-for-a-visa/about-visa/visitor-visa",
    officialLabel: "Immigration NZ — Visitor Visa (Official)",
    vfsUrl:        "https://visa.vfsglobal.com/ken/en/nzl",
    vfsLabel:      "VFS Global Kenya — New Zealand",
    gotcha:        "NZ requires an ACCEPTABLE STANDARD OF HEALTH exam for stays >6 months. Also expect strict evidence of return — flight booking + minimum NZD 1,000/month of stay in bank.",
    difficulty:    "Medium",
  },
  {
    slug:          "poland",
    name:          "Poland",
    flag:          "🇵🇱",
    visaType:      "Schengen Short-Stay Visa (Polish consulate)",
    cost:          "€90 (≈ KES 13,500)",
    processing:    "15 calendar days (up to 45 in high season)",
    maxStay:       "90 days within any 180-day period",
    validity:      "As per Schengen approval",
    applyFrom:     "Embassy of Poland Nairobi. Applications submitted through VFS Global.",
    officialUrl:   "https://www.gov.pl/web/kenya-en/visa",
    officialLabel: "Poland Embassy Kenya — Visa (Official)",
    vfsUrl:        "https://visa.vfsglobal.com/ken/en/pol",
    vfsLabel:      "VFS Global Kenya — Poland",
    gotcha:        "Poland is often the CHEAPEST Schengen embassy to approach for genuine short trips (low fraud pressure vs Germany/France). But you must actually visit Poland as your main destination — inspectors do check.",
    difficulty:    "Medium",
  },
  {
    slug:          "kuwait",
    name:          "Kuwait",
    flag:          "🇰🇼",
    visaType:      "Visit Visa (Tourist / Family)",
    cost:          "KWD 3–5 (≈ KES 1,300–2,200)",
    processing:    "1–3 weeks (must be sponsored by Kuwaiti resident or hotel)",
    maxStay:       "30 days per entry (extendable up to 90 days)",
    validity:      "30 days from issue to enter",
    applyFrom:     "Kenya passport holders CANNOT get visa-on-arrival or e-visa. You need a sponsor (resident, hotel, or company) in Kuwait to apply on your behalf at Kuwait's MOI. Kuwait Embassy Nairobi handles some cases directly.",
    officialUrl:   "https://evisa.moi.gov.kw/evisa/",
    officialLabel: "Kuwait Ministry of Interior — Official e-Visa Portal",
    gotcha:        "Kuwait doesn't do easy tourism visas — you basically need someone there to sponsor you. If you have family working in Kuwait, they can arrange it. Otherwise this is one of the harder Gulf visas.",
    difficulty:    "Hard",
  },
  {
    slug:          "oman",
    name:          "Oman",
    flag:          "🇴🇲",
    visaType:      "eVisa (Tourist)",
    cost:          "OMR 5 for 10-day / OMR 20 for 30-day (≈ KES 1,700–7,000)",
    processing:    "24–72 hours (mostly instant)",
    maxStay:       "10 or 30 days per entry",
    validity:      "Enter within 30 days of issue",
    applyFrom:     "100% online — no embassy visit needed. Apply at the Royal Oman Police eVisa portal.",
    officialUrl:   "https://evisa.rop.gov.om/en/home",
    officialLabel: "Royal Oman Police — Official eVisa Portal",
    gotcha:        "One of the easiest Gulf visas for Kenyans. Only use evisa.rop.gov.om — scam sites charge 3–5× more. You'll need a return ticket + hotel booking uploaded before payment.",
    difficulty:    "Easy",
  },
  {
    slug:          "lithuania",
    name:          "Lithuania",
    flag:          "🇱🇹",
    visaType:      "Schengen Short-Stay Visa (via Latvia embassy)",
    cost:          "€90 (≈ KES 13,500)",
    processing:    "15–30 calendar days",
    maxStay:       "90 days within any 180-day period",
    validity:      "As per Schengen approval",
    applyFrom:     "Lithuania has NO embassy in Kenya. Latvia's embassy handles Baltic (Lithuania + Latvia + Estonia) visa applications, routed through VFS Global Nairobi.",
    officialUrl:   "https://www.urm.lt/default/en/lithuanian-consular-services",
    officialLabel: "Lithuania Ministry of Foreign Affairs — Consular Services (Official)",
    vfsUrl:        "https://visa.vfsglobal.com/ken/en/lva",
    vfsLabel:      "VFS Global Kenya — Latvia (processes Lithuania visas)",
    gotcha:        "If you're only visiting Lithuania it's usually simpler to apply for a Latvia-issued Schengen visa via VFS in Nairobi. If Lithuania isn't your main destination, apply through your primary country's embassy instead.",
    difficulty:    "Medium",
  },
];

const DIFFICULTY_STYLES: Record<VisitVisa["difficulty"], string> = {
  Easy:   "text-green-700 bg-green-50 dark:bg-green-900/30 dark:text-green-300 border-green-200",
  Medium: "text-yellow-700 bg-yellow-50 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-200",
  Hard:   "text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-300 border-red-200",
};

// ─── Component ────────────────────────────────────────────────────────────

export default function VisitVisasPage() {
  usePageSeo({
    title:       "Visit Visa Guide for Kenyans (2026) — 15 Countries · Official Portals & Nairobi Application Centres",
    description: "Complete visit-visa guide for Kenyan passport holders. Costs, processing times, and official portals for USA, UK, Canada, Australia, UAE, Schengen and more — plus exact Nairobi VFS / TLScontact addresses.",
    path:        "/visit-visas",
    keywords:    [
      "visit visa kenya", "tourist visa kenya", "schengen visa kenya",
      "US B1 B2 visa kenya", "UK visitor visa kenya", "canada TRV kenya",
      "VFS Nairobi", "TLScontact Nairobi", "kenya passport visa",
    ],
  });

  const [query, setQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<"all" | "Easy" | "Medium" | "Hard">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return COUNTRIES.filter((c) => {
      if (difficultyFilter !== "all" && c.difficulty !== difficultyFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.visaType.toLowerCase().includes(q) ||
        c.applyFrom.toLowerCase().includes(q)
      );
    });
  }, [query, difficultyFilter]);

  return (
    <div className="min-h-screen bg-background">
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
          <div className="flex items-center gap-2 mb-4">
            <Link href="/">
              <span className="text-blue-100/80 hover:text-white text-sm cursor-pointer">Home</span>
            </Link>
            <span className="text-blue-100/50">/</span>
            <span className="text-sm">Visit Visas</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-4">
            Visit-visa guide for every country we cover
          </h1>
          <p className="text-blue-100/90 max-w-3xl text-base sm:text-lg leading-relaxed">
            Real official portals, real Nairobi application centres, real costs.
            No agents, no upsells — everything below is a link direct to a
            government website or the official visa-application centre for
            Kenyan passport holders.
          </p>

          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <Badge className="bg-white/10 text-white border-white/20 gap-1">
              <ShieldCheck className="h-3 w-3" /> {COUNTRIES.length} countries covered
            </Badge>
            <Badge className="bg-white/10 text-white border-white/20 gap-1">
              <Landmark className="h-3 w-3" /> Only .gov / VFS / TLScontact links
            </Badge>
            <Badge className="bg-white/10 text-white border-white/20 gap-1">
              <MapPin className="h-3 w-3" /> Nairobi application-centre info
            </Badge>
          </div>
        </div>
      </section>

      {/* ── Search + filter ─────────────────────────────────────────────── */}
      <section className="border-b bg-muted/30 sticky top-0 z-30 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search country, visa type, or centre (VFS, TLScontact…)"
              className="pl-9"
              data-testid="input-visit-visa-search"
            />
          </div>
          <div className="flex gap-2">
            {(["all", "Easy", "Medium", "Hard"] as const).map((d) => (
              <Button
                key={d}
                variant={difficultyFilter === d ? "default" : "outline"}
                size="sm"
                onClick={() => setDifficultyFilter(d)}
                data-testid={`filter-difficulty-${d}`}
              >
                {d === "all" ? "All" : d}
              </Button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Country accordion list ──────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-16">
            No countries match that search. Try clearing the filter.
          </p>
        ) : (
          <Accordion type="multiple" className="space-y-3">
            {filtered.map((c) => (
              <AccordionItem
                key={c.slug}
                value={c.slug}
                className="border rounded-xl px-4 sm:px-5 data-[state=open]:bg-muted/30"
                data-testid={`visa-card-${c.slug}`}
              >
                <AccordionTrigger className="hover:no-underline py-4">
                  <div className="flex-1 flex items-center gap-3 sm:gap-4 text-left">
                    <div className="text-3xl sm:text-4xl leading-none">{c.flag}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-base sm:text-lg leading-tight">{c.name}</div>
                      <div className="text-xs sm:text-sm text-muted-foreground truncate">
                        {c.visaType}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`hidden sm:inline-flex ${DIFFICULTY_STYLES[c.difficulty]} border font-medium text-xs`}
                    >
                      {c.difficulty}
                    </Badge>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="pt-2 pb-5 space-y-4">
                  {/* Key stats row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div className="p-3 rounded-lg bg-background border">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                        <DollarSign className="h-3.5 w-3.5" /> Cost
                      </div>
                      <div className="font-semibold">{c.cost}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-background border">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                        <Clock className="h-3.5 w-3.5" /> Processing
                      </div>
                      <div className="font-semibold">{c.processing}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-background border">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                        <BookOpen className="h-3.5 w-3.5" /> Max stay
                      </div>
                      <div className="font-semibold">{c.maxStay}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-background border">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                        <Globe className="h-3.5 w-3.5" /> Validity
                      </div>
                      <div className="font-semibold">{c.validity}</div>
                    </div>
                  </div>

                  {/* Where to apply from Kenya */}
                  <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900">
                    <div className="flex items-center gap-2 text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
                      <MapPin className="h-4 w-4" /> Where to apply from Nairobi
                    </div>
                    <p className="text-sm text-blue-900/90 dark:text-blue-100/90 leading-relaxed">
                      {c.applyFrom}
                    </p>
                  </div>

                  {/* Gotcha */}
                  <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
                    <div className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-100 mb-1">
                      <AlertTriangle className="h-4 w-4" /> The one thing to watch for
                    </div>
                    <p className="text-sm text-amber-900/90 dark:text-amber-100/90 leading-relaxed">
                      {c.gotcha}
                    </p>
                  </div>

                  {/* Portals */}
                  <div className="grid sm:grid-cols-2 gap-3">
                    <a
                      href={c.officialUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-4 rounded-lg border-2 border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition group"
                      data-testid={`portal-official-${c.slug}`}
                    >
                      <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 dark:text-emerald-200 mb-1">
                        <ShieldCheck className="h-3.5 w-3.5" /> OFFICIAL GOVERNMENT
                      </div>
                      <div className="font-semibold text-sm mb-1 flex items-center justify-between gap-2">
                        <span>{c.officialLabel}</span>
                        <ExternalLink className="h-4 w-4 opacity-60 group-hover:opacity-100" />
                      </div>
                      <div className="text-xs text-muted-foreground break-all">{c.officialUrl}</div>
                    </a>

                    {c.vfsUrl && (
                      <a
                        href={c.vfsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-4 rounded-lg border-2 border-indigo-500/40 bg-indigo-50/50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition group"
                        data-testid={`portal-vfs-${c.slug}`}
                      >
                        <div className="flex items-center gap-2 text-xs font-semibold text-indigo-800 dark:text-indigo-200 mb-1">
                          <Landmark className="h-3.5 w-3.5" /> APPLICATION CENTRE (KENYA)
                        </div>
                        <div className="font-semibold text-sm mb-1 flex items-center justify-between gap-2">
                          <span>{c.vfsLabel}</span>
                          <ExternalLink className="h-4 w-4 opacity-60 group-hover:opacity-100" />
                        </div>
                        <div className="text-xs text-muted-foreground break-all">{c.vfsUrl}</div>
                      </a>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </section>

      {/* ── Cross-sell to work-visa services ─────────────────────────────── */}
      <section className="bg-gradient-to-br from-slate-900 to-blue-950 text-white py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center space-y-4">
          <h2 className="text-2xl sm:text-3xl font-bold">
            Planning to WORK abroad, not just visit?
          </h2>
          <p className="text-blue-100/80 max-w-2xl mx-auto">
            Visit visas are for tourism and short trips. If you're looking for
            long-term overseas employment, our career-consultation service
            covers verified job portals, visa-sponsoring employers, CV
            optimisation and 1-on-1 WhatsApp guidance for every country above.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <Link href="/services">
              <Button size="lg" className="bg-white text-blue-950 hover:bg-blue-50 gap-2">
                Explore career services <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/tools/visa-sponsorship-jobs">
              <Button size="lg" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10 gap-2">
                Visa-sponsoring jobs
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Disclaimer footer ───────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 text-xs sm:text-sm text-muted-foreground">
        <p className="leading-relaxed">
          <strong>Disclaimer:</strong> Visa fees, processing times and centre
          locations change without notice. Always verify the current fee and
          submission address on the official government portal linked above
          before travelling to any application centre in Nairobi. WorkAbroad
          Hub is not a visa agent — we do not collect passports, we do not
          submit applications on your behalf, and we never charge for visa
          information. If any link on this page is out of date, please email{" "}
          <a href="mailto:support@workabroadhub.tech" className="text-blue-600 hover:underline">
            support@workabroadhub.tech
          </a>{" "}
          and we'll fix it within 24 hours.
        </p>
      </section>
    </div>
  );
}
