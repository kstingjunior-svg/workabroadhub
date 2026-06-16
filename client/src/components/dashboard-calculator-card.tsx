/**
 * Dashboard widget — "Calculate what you'd really keep" CTA.
 *
 * Rotates the headline daily across the supported destinations to keep the
 * dashboard feeling fresh on repeat visits.
 *
 * 2026-06 retention #6.
 */
import { useMemo } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Calculator, ArrowRight } from "lucide-react";

const TEASERS = [
  { flag: "🇦🇪", country: "UAE",          example: "AED 6,000/mo → KES 165K saved/year" },
  { flag: "🇸🇦", country: "Saudi Arabia", example: "SAR 5,000/mo → KES 145K saved/year" },
  { flag: "🇬🇧", country: "United Kingdom", example: "£2,400/mo → KES 220K sent home" },
  { flag: "🇨🇦", country: "Canada",       example: "CAD 5,500/mo → KES 280K saved/year" },
  { flag: "🇦🇺", country: "Australia",    example: "AUD 5,500/mo → KES 250K sent home" },
  { flag: "🇶🇦", country: "Qatar",        example: "QAR 5,500/mo → KES 170K saved/year" },
  { flag: "🇩🇪", country: "Germany",      example: "€2,500/mo → KES 200K sent home" },
];

export function DashboardCalculatorCard() {
  // Pick the day's teaser deterministically — same teaser within a session,
  // fresh one each day the user returns.
  const teaser = useMemo(() => {
    const day = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
    return TEASERS[day % TEASERS.length];
  }, []);

  return (
    <Link href="/calculator">
      <Card
        className="mb-4 cursor-pointer hover:shadow-md transition-all overflow-hidden bg-gradient-to-br from-teal-500/10 via-emerald-500/10 to-cyan-500/10 border-teal-200 dark:border-teal-900"
        data-testid="card-calculator"
      >
        <CardContent className="p-4 flex items-center gap-3">
          <div className="shrink-0 p-2.5 rounded-full bg-teal-100 dark:bg-teal-900/30">
            <Calculator className="h-5 w-5 text-teal-700 dark:text-teal-300" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300 mb-0.5">
              What's actually left at month-end?
            </div>
            <div className="font-bold text-sm mb-0.5 line-clamp-1">
              {teaser.flag} Run the numbers for {teaser.country}
            </div>
            <div className="text-[11px] text-muted-foreground line-clamp-2">
              The agencies stop at "{teaser.example.split(" → ")[0]}". We don't.
              See what's left after rent, food, transport, and sending money home — before you sign anything.
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </CardContent>
      </Card>
    </Link>
  );
}
