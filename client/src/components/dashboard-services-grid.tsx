/**
 * Dashboard Services Grid — marketplace-style cards with PRICES visible.
 *
 * Anchored low (FREE / KES 99) so the value ladder leads naturally to
 * higher-ticket services. Each card has its own direct CTA — no menu
 * digging, no decision paralysis.
 */
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Sparkles, Zap, FileText, Globe2 } from "lucide-react";

interface ServiceCard {
  slug: string;
  emoji: string;
  name: string;
  desc: string;
  price: number;          // 0 means free
  badge?: "Popular" | "Best Value" | "Fastest" | "New";
  bgColor: string;        // tailwind class
  textColor: string;
  socialProof?: string;   // e.g. "Bought 47 times this week"
  /**
   * Price anchor — tangible reframe of the cost. Either:
   *   • A comparison to typical Kenyan equivalents ("≈ 1 mandazi/day")
   *   • A comparison to what others charge ("Career coach: KES 8,000")
   * Both reduce sticker-shock and reinforce value. Shown directly under price.
   */
  priceAnchor?: string;
}

const SERVICES: ServiceCard[] = [
  {
    slug: "cv_check",
    emoji: "🩺",
    name: "CV Health Check",
    desc: "See what recruiters & ATS think of your CV. Instant score.",
    price: 0,
    badge: "Fastest",
    bgColor: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800",
    textColor: "text-green-700 dark:text-green-300",
  },
  {
    slug: "cv_fix_lite",
    emoji: "✨",
    name: "CV Fix Lite",
    desc: "Grammar, formatting & structure cleaned up. 3 minutes.",
    price: 99,
    bgColor: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
    textColor: "text-blue-700 dark:text-blue-300",
    socialProof: "Most affordable",
    priceAnchor: "≈ 1 mandazi · Typist: KES 1,500",
  },
  {
    slug: "cover_letter",
    emoji: "✉️",
    name: "Cover Letter",
    desc: "Custom letter for any job you apply to. Tailored, instant.",
    price: 149,
    bgColor: "bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800",
    textColor: "text-purple-700 dark:text-purple-300",
    priceAnchor: "≈ 2 mandazi · Writer: KES 2,000",
  },
  {
    slug: "ats_cv_optimization",
    emoji: "🎯",
    name: "Recruiter-Friendly CV",
    desc: "Get past the gatekeepers. We tune your CV with the words recruiters search for.",
    price: 499,
    badge: "Popular",
    bgColor: "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700",
    textColor: "text-amber-700 dark:text-amber-300",
    socialProof: "🔥 Most ordered",
    priceAnchor: "Career coach: KES 5,000+ · You save KES 4,501",
  },
  {
    slug: "cv_rewrite",
    emoji: "🌍",
    name: "Country CV Rewrite",
    desc: "Restyled for UK, Canada, UAE, Germany, AU formats.",
    price: 699,
    badge: "Best Value",
    bgColor: "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800",
    textColor: "text-rose-700 dark:text-rose-300",
    priceAnchor: "Country agent: KES 8,000+ · You save KES 7,300",
  },
  {
    slug: "linkedin_optimization",
    emoji: "💼",
    name: "LinkedIn Profile",
    desc: "Headline, summary, skills — done so recruiters reach out.",
    price: 3000,
    bgColor: "bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800",
    textColor: "text-sky-700 dark:text-sky-300",
    priceAnchor: "LinkedIn pro: KES 25,000 · You save KES 22,000",
  },
  {
    slug: "sop_writing",
    emoji: "🎓",
    name: "SOP / Personal Statement",
    desc: "For university & scholarship applications. 800-1000 words.",
    price: 999,
    bgColor: "bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800",
    textColor: "text-indigo-700 dark:text-indigo-300",
    priceAnchor: "SOP consultant: KES 15,000 · You save KES 14,000",
  },
  {
    slug: "motivation_letter",
    emoji: "📨",
    name: "Motivation Letter",
    desc: "Formal letter for EU jobs & scholarships. Done in minutes.",
    price: 699,
    bgColor: "bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800",
    textColor: "text-teal-700 dark:text-teal-300",
    priceAnchor: "EU letter consultant: KES 6,000 · You save KES 5,300",
  },
];

function priceLabel(price: number): string {
  return price === 0 ? "FREE" : `KES ${price.toLocaleString()}`;
}

export function DashboardServicesGrid() {
  return (
    <section className="mb-6" aria-label="Career services">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" /> Career Services
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pay by M-Pesa. Delivered in minutes. Download as Word or PDF.
          </p>
        </div>
        <Link
          href="/services"
          className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
        >
          See all →
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {SERVICES.map((s) => {
          // Free service routes to its tool page; paid services go to the order flow
          const target =
            s.slug === "cv_check" ? "/tools/ats-cv-checker" : `/services/order/${s.slug}`;
          return (
            <Link
              key={s.slug}
              href={target}
              className={`group relative block rounded-xl border p-3 sm:p-4 hover:shadow-md hover:scale-[1.02] transition-all ${s.bgColor}`}
              data-testid={`service-card-${s.slug}`}
            >
              {s.badge && (
                <span className="absolute -top-2 right-3 text-[9px] font-bold bg-amber-500 text-white px-2 py-0.5 rounded-full shadow-sm">
                  {s.badge.toUpperCase()}
                </span>
              )}
              <div className="text-2xl mb-1.5">{s.emoji}</div>
              <h3 className="font-bold text-sm leading-tight mb-1 text-foreground">
                {s.name}
              </h3>
              <p className="text-[11px] text-muted-foreground leading-snug mb-2 line-clamp-2">
                {s.desc}
              </p>
              <div className="flex items-baseline justify-between">
                <span className={`text-base font-bold ${s.textColor}`}>{priceLabel(s.price)}</span>
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  <Zap className="h-2.5 w-2.5" /> 3 min
                </span>
              </div>
              {/* Price anchor — tangible Kenyan reframe of cost
                  ("≈ 1 mandazi" / "Career coach: KES 5,000+ · You save…").
                  Killed sticker-shock + reinforces value vs alternatives. */}
              {s.priceAnchor && (
                <p className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-1 font-semibold leading-tight">
                  {s.priceAnchor}
                </p>
              )}
              {s.socialProof && (
                <p className="text-[10px] text-muted-foreground mt-1 italic">{s.socialProof}</p>
              )}
            </Link>
          );
        })}
      </div>

      <p className="text-[11px] text-center text-muted-foreground mt-3 flex items-center justify-center gap-1.5 flex-wrap">
        <span>💳 M-Pesa Paybill 4153025</span>
        <span>•</span>
        <span>⚡ In your inbox in minutes</span>
        <span>•</span>
        <span>📥 Word & PDF download</span>
      </p>
    </section>
  );
}
