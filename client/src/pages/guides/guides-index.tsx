// ─────────────────────────────────────────────────────────────────────────────
// /guides — index page listing all SEO landing guides.
// Acts both as the user-facing hub and as the SEO "topic cluster" pillar
// page that internally links to every guide (helps Google rank them).
// ─────────────────────────────────────────────────────────────────────────────

import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, BookOpen, Clock, Coins } from "lucide-react";
import { GUIDES, GUIDE_SLUGS } from "./country-guide-data";
import { usePageHead } from "@/hooks/use-page-head";

export default function GuidesIndex() {
  const canonical = "https://workabroadhub.tech/guides";
  const guideList = GUIDE_SLUGS.map((s) => GUIDES[s]);

  usePageHead({
    title: "Step-by-Step Overseas Job Guides for Kenyans — WorkAbroad Hub",
    description: "Hand-tuned 2026 guides for Kenyans applying to overseas jobs: UK NHS, Canada Express Entry, UAE hospitality, Saudi nursing, Germany Blue Card.",
    canonical,
    ogTitle: "Step-by-Step Overseas Job Guides for Kenyans",
    ogDescription: "Real costs, real timelines, real official links — for Kenyans serious about working abroad legally.",
    ogUrl: canonical,
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">

      <header className="sticky top-0 z-30 bg-white/85 dark:bg-slate-950/85 backdrop-blur-md border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="button-back-home">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Home
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        <section className="text-center max-w-2xl mx-auto">
          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 mb-3">
            <BookOpen className="h-3.5 w-3.5 mr-1" />
            For Kenyans
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-bold mb-3 tracking-tight">
            Step-by-step guides to working abroad
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
            Hand-tuned 2026 roadmaps for the overseas jobs Kenyans actually want.
            Real costs in KES, realistic timelines, and the official links that
            work from Kenya.
          </p>
        </section>

        <section className="grid sm:grid-cols-2 gap-4">
          {guideList.map((g) => (
            <Link key={g.slug} href={`/guides/${g.slug}`}>
              <Card className="hover-elevate hover:border-primary/40 transition-colors cursor-pointer h-full" data-testid={`card-guide-${g.slug}`}>
                <CardContent className="p-5 space-y-3 h-full flex flex-col">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{g.flag}</span>
                    <Badge variant="secondary" className="text-xs">{g.country}</Badge>
                  </div>
                  <h2 className="text-base font-bold leading-snug">{g.heroHeadline}</h2>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 flex-1">
                    {g.heroSubhead}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground pt-2 border-t">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {g.timeframe}</span>
                    <span className="flex items-center gap-1"><Coins className="h-3 w-3" /> {g.costEstimate.split("(")[0].trim()}</span>
                  </div>
                  <Button size="sm" className="w-full" data-testid={`button-open-guide-${g.slug}`}>
                    Read guide
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </CardContent>
              </Card>
            </Link>
          ))}
        </section>
      </main>
    </div>
  );
}
