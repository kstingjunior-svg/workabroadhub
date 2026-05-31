// ─────────────────────────────────────────────────────────────────────────────
// /guides/:slug — the SEO landing pages
//
// Single renderer that drives all 5 high-intent guides from the data in
// country-guide-data.ts. Renders Schema.org FAQPage + BreadcrumbList JSON-LD
// so Google can serve our FAQs directly in the SERP (huge for CTR), and
// uses real Open Graph + Twitter Card meta so the link previews nicely
// when shared in WhatsApp / X / LinkedIn.
//
// Conversion strategy on the page itself:
//   - Trust strip (counter + employers) right under the H1
//   - Real cost + timeframe boxes ABOVE the fold
//   - 6 numbered steps (anchor-able for Google jump-links)
//   - 5 FAQs (machine-readable for Google rich results)
//   - 3 recommended PAID services — the on-page revenue line
//   - Bottom CTA: "View jobs in <country>" → /country/<slug>
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import { useRoute, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Clock,
  Coins,
  Briefcase,
  Sparkles,
  ChevronRight,
  Globe,
  HelpCircle,
} from "lucide-react";
import { LandingTrustStrip } from "@/components/landing-trust-strip";
import { GUIDES, GUIDE_SLUGS } from "./country-guide-data";
import { usePageHead } from "@/hooks/use-page-head";
import NotFound from "@/pages/not-found";

export default function GuidePage() {
  const [, params] = useRoute("/guides/:slug");
  const slug = params?.slug ?? "";
  const guide = GUIDES[slug];

  // Scroll to top on mount + on slug change.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [slug]);

  if (!guide) return <NotFound />;

  const canonical = `https://workabroadhub.tech/guides/${guide.slug}`;

  // Schema.org FAQPage — Google reads this and may show our FAQs directly
  // in SERP rich results, dramatically increasing CTR.
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": guide.faqs.map((f) => ({
      "@type": "Question",
      "name": f.q,
      "acceptedAnswer": { "@type": "Answer", "text": f.a },
    })),
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home",   "item": "https://workabroadhub.tech/" },
      { "@type": "ListItem", "position": 2, "name": "Guides", "item": "https://workabroadhub.tech/guides" },
      { "@type": "ListItem", "position": 3, "name": guide.country, "item": canonical },
    ],
  };

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": guide.pageTitle,
    "description": guide.metaDescription,
    "image": "https://workabroadhub.tech/logo.png",
    "author": { "@type": "Organization", "name": "WorkAbroad Hub" },
    "publisher": {
      "@type": "Organization",
      "name": "WorkAbroad Hub",
      "logo": { "@type": "ImageObject", "url": "https://workabroadhub.tech/logo.png" },
    },
    "datePublished": "2026-05-31",
    "dateModified": new Date().toISOString().slice(0, 10),
    "mainEntityOfPage": canonical,
  };

  usePageHead({
    title: guide.pageTitle,
    description: guide.metaDescription,
    canonical,
    ogTitle: guide.pageTitle,
    ogDescription: guide.metaDescription,
    ogUrl: canonical,
    ogImage: "https://workabroadhub.tech/logo.png",
    jsonLd: [faqLd, breadcrumbLd, articleLd],
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">

      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/85 dark:bg-slate-950/85 backdrop-blur-md border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="button-back-home">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Home
            </Button>
          </Link>
          <Link href="/guides">
            <Button variant="ghost" size="sm" data-testid="button-all-guides">
              All Guides
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8">
        {/* Breadcrumbs (visual) */}
        <nav className="text-xs text-muted-foreground flex items-center gap-1.5" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-foreground">Home</Link>
          <ChevronRight className="h-3 w-3" />
          <Link href="/guides" className="hover:text-foreground">Guides</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground font-medium">{guide.country}</span>
        </nav>

        {/* Hero */}
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-4xl">{guide.flag}</span>
            <Badge variant="outline" className="border-emerald-300 text-emerald-700 dark:text-emerald-300">
              {guide.country} · {guide.timeframe}
            </Badge>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight" data-testid="text-guide-h1">
            {guide.heroHeadline}
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
            {guide.heroSubhead}
          </p>
        </section>

        {/* Trust strip — same component that lives above the landing CTA */}
        <LandingTrustStrip />

        {/* Cost + timeframe boxes */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
            <CardContent className="p-4 flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                <Coins className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide mb-1">Real cost (KES)</div>
                <div className="text-sm font-medium leading-snug">{guide.costEstimate}</div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
            <CardContent className="p-4 flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wide mb-1">Realistic timeframe</div>
                <div className="text-sm font-medium leading-snug">{guide.timeframe}</div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Top roles */}
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-2">
            <Briefcase className="h-4 w-4" /> Top roles for Kenyans
          </h2>
          <div className="flex flex-wrap gap-2">
            {guide.topRoles.map((r) => (
              <Badge key={r} variant="secondary" className="text-xs font-medium">{r}</Badge>
            ))}
          </div>
        </section>

        {/* Steps */}
        <section>
          <h2 className="text-2xl font-bold mb-4">The step-by-step process</h2>
          <ol className="space-y-4">
            {guide.steps.map((s, i) => (
              <li
                key={i}
                id={`step-${i + 1}`}
                className="rounded-2xl border bg-card p-5 flex gap-4"
                data-testid={`guide-step-${i + 1}`}
              >
                <div className="shrink-0 w-9 h-9 rounded-full bg-primary text-primary-foreground font-bold flex items-center justify-center text-sm">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <h3 className="text-base font-bold leading-snug">{s.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* FAQs */}
        <section>
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <HelpCircle className="h-6 w-6 text-purple-600" />
            Common questions Kenyans ask
          </h2>
          <div className="space-y-3">
            {guide.faqs.map((f, i) => (
              <details
                key={i}
                className="rounded-xl border bg-card p-4 group"
                open={i === 0}
                data-testid={`guide-faq-${i + 1}`}
              >
                <summary className="cursor-pointer font-semibold text-sm flex items-start gap-2 list-none">
                  <ChevronRight className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0 transition-transform group-open:rotate-90" />
                  <span className="flex-1">{f.q}</span>
                </summary>
                <p className="text-sm text-muted-foreground leading-relaxed mt-2 ml-6">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Recommended services — on-page monetisation */}
        <section>
          <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-amber-500" />
            Services that get Kenyans to {guide.country} faster
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Tools we've built specifically for this path. All include the 30-day callback guarantee on premium services.
          </p>
          <div className="grid sm:grid-cols-3 gap-3">
            {guide.recommendedServices.map((s) => (
              <Card key={s.slug} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    <h3 className="text-sm font-bold capitalize">{s.slug.replace(/_/g, " ")}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{s.reason}</p>
                  <Link href={`/services/order/${s.slug}`}>
                    <Button size="sm" variant="outline" className="w-full mt-2" data-testid={`button-guide-service-${s.slug}`}>
                      View →
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Bottom CTA: open the country dashboard */}
        <section className="rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-blue-500/5 p-6 sm:p-8 text-center space-y-3">
          <div className="text-4xl">{guide.flag}</div>
          <h2 className="text-2xl font-bold">Ready to start applying?</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Open the {guide.country} dashboard — verified job portals, application tracker, and one-click visa guidance.
          </p>
          <Link href={`/country/${guide.countrySlug}`}>
            <Button size="lg" data-testid="button-open-country-dashboard">
              <Globe className="h-4 w-4 mr-2" />
              Open {guide.country} dashboard
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
        </section>

        {/* Other guides — internal linking helps SEO */}
        <section className="pt-4 border-t">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">More step-by-step guides for Kenyans</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {GUIDE_SLUGS.filter((s) => s !== guide.slug).map((otherSlug) => {
              const other = GUIDES[otherSlug];
              return (
                <Link key={otherSlug} href={`/guides/${otherSlug}`}>
                  <div className="flex items-center gap-3 p-3 rounded-xl border hover:border-primary/40 hover:bg-muted/40 transition-colors cursor-pointer">
                    <span className="text-2xl">{other.flag}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">{other.country}</div>
                      <div className="text-xs text-muted-foreground truncate">{other.heroHeadline}</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
