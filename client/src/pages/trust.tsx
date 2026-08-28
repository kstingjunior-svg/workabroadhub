/**
 * /trust — a public, high-visibility trust & verification page.
 *
 * 2026-08 (Tony's Google-AI-Overview problem): searches for
 * "workabroadhub scam" and "workabroadhub legit" surface an AI Overview
 * scraped from a Kenyan "scam exposer" Instagram post because there's
 * no strong first-party page addressing legitimacy. This page fixes
 * that by giving Google a clear, verifiable, structured trust signal
 * page to prefer over third-party rumours.
 *
 * Also linked from the footer + About page + FAQ.
 */

import { Link } from "wouter";
import { usePageSeo } from "@/hooks/use-page-seo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck, MapPin, Mail, Phone, User, Building2, ExternalLink,
  CheckCircle2, XCircle, ArrowRight, FileText, Landmark,
} from "lucide-react";

export default function TrustPage() {
  usePageSeo({
    title:       "Is WorkAbroad Hub Legit? Trust, Verification & Founder Details | WorkAbroad Hub",
    description: "Verify WorkAbroad Hub is legit. Founder identity, Nairobi office details, business registration, what we are (career service) and what we're NOT (recruitment agency).",
    path:        "/trust",
    keywords:    [
      "is workabroadhub legit",
      "workabroadhub verification",
      "workabroadhub trust",
      "workabroadhub scam",
      "workabroadhub review",
      "workabroad hub about",
    ],
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
          <div className="flex items-center gap-2 text-sm mb-3 text-emerald-100/80">
            <Link href="/"><span className="hover:text-white cursor-pointer">Home</span></Link>
            <span>/</span>
            <span>Trust &amp; Verification</span>
          </div>
          <div className="text-6xl mb-4">🛡️</div>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-4 leading-tight">
            Is WorkAbroad Hub legit?
          </h1>
          <p className="text-lg sm:text-xl text-emerald-50 max-w-2xl leading-relaxed">
            Direct, honest answer with everything you need to verify us yourself in under 60 seconds.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/15 border border-white/20">
            <ShieldCheck className="h-4 w-4" />
            <span className="text-sm font-medium">Yes — and here's the proof.</span>
          </div>
        </div>
      </section>

      {/* TL;DR */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <Card className="border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20">
          <CardContent className="p-6">
            <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" /> The 30-second summary
            </h2>
            <ul className="space-y-2 text-sm sm:text-base leading-relaxed">
              <li className="flex gap-2"><span className="text-emerald-600">✓</span><span>WorkAbroad Hub is a real, operating career-tech platform based in Nairobi, Kenya.</span></li>
              <li className="flex gap-2"><span className="text-emerald-600">✓</span><span>Founded and operated by <strong>Antony Macloud</strong> — publicly named, publicly reachable.</span></li>
              <li className="flex gap-2"><span className="text-emerald-600">✓</span><span>We are a <strong>career-consultation service</strong>, NOT a recruitment agency and NOT a NEA-licensed placement firm.</span></li>
              <li className="flex gap-2"><span className="text-emerald-600">✓</span><span>All our free tools work without payment or account. Verify us before you spend a shilling.</span></li>
              <li className="flex gap-2"><span className="text-emerald-600">✓</span><span>Pricing is transparent, published, and starts at <strong>KES 99</strong> for CV rewrites.</span></li>
              <li className="flex gap-2"><span className="text-emerald-600">✓</span><span>We never charge placement fees, never guarantee jobs, and never handle your salary.</span></li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* Founder card */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <h2 className="text-2xl font-bold mb-4">The founder</h2>
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              <div className="h-24 w-24 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-3xl shrink-0">
                AM
              </div>
              <div className="flex-1 min-w-0 space-y-3">
                <div>
                  <h3 className="text-xl font-bold">Antony Macloud</h3>
                  <p className="text-sm text-muted-foreground">Founder &amp; Software Developer · Nairobi, Kenya</p>
                </div>
                <p className="text-sm leading-relaxed">
                  I built WorkAbroad Hub because I saw too many Kenyans get scammed by fake recruiters
                  and too many capable professionals fail overseas applications through avoidable CV
                  and visa mistakes. Everything on this platform is what I would recommend to my own
                  family. If you have any concern about the service, email me directly.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Badge variant="outline" className="gap-1"><Mail className="h-3 w-3" /> support@workabroadhub.tech</Badge>
                  <Badge variant="outline" className="gap-1"><MapPin className="h-3 w-3" /> Nairobi, Kenya</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* What we are / are NOT */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <h2 className="text-2xl font-bold mb-4">What we are — and what we&apos;re NOT</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="border-emerald-200 dark:border-emerald-800">
            <CardContent className="p-5 space-y-3">
              <h3 className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> What we ARE
              </h3>
              <ul className="text-sm space-y-2">
                <li>• A career-tech platform based in Nairobi</li>
                <li>• Free CV, scam &amp; visa verification tools</li>
                <li>• Curated database of verified overseas job portals</li>
                <li>• Paid career services from KES 99 (CV, cover, SoP, LinkedIn, coaching)</li>
                <li>• A public directory of Kenya&apos;s 2,600+ NEA-registered recruitment agencies</li>
                <li>• A community reporting wall for recruitment fraud</li>
              </ul>
            </CardContent>
          </Card>
          <Card className="border-red-200 dark:border-red-800">
            <CardContent className="p-5 space-y-3">
              <h3 className="font-bold text-red-700 dark:text-red-400 flex items-center gap-2">
                <XCircle className="h-4 w-4" /> What we&apos;re NOT
              </h3>
              <ul className="text-sm space-y-2">
                <li>• NOT a NEA-licensed recruitment agency</li>
                <li>• NOT affiliated with any government body</li>
                <li>• NOT a job-placement service — we don&apos;t place people in jobs</li>
                <li>• NOT charging placement fees, salary cuts, or activation charges</li>
                <li>• NOT guaranteeing jobs, visas, or interviews</li>
                <li>• NOT selling your data or spamming your contacts</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Verify us checklist */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <h2 className="text-2xl font-bold mb-4">Verify us yourself — in under 60 seconds</h2>
        <div className="space-y-3">
          {[
            {
              icon: User,
              title: "Founder is publicly named",
              body: "Antony Macloud, Nairobi. Named in the site meta tags, in the humans.txt file, and in the schema.org structured data. Search my name — I'm a real person.",
              action: { href: "/humans.txt", label: "View humans.txt" },
            },
            {
              icon: Building2,
              title: "Business registration exists",
              body: "WorkAbroad Hub operates under Exovia Connect, a registered Kenyan business. Email support@workabroadhub.tech for the registration certificate.",
              action: null,
            },
            {
              icon: FileText,
              title: "Pricing is fully transparent",
              body: "Every service and its exact price is on our Pricing page. No hidden fees, no upsells after payment.",
              action: { href: "/pricing", label: "View pricing" },
            },
            {
              icon: Landmark,
              title: "We link to real government portals",
              body: "Every 'verify with government' link on our site (eCitizen, NEA, DCI) is a real .go.ke portal. Click any of them — you'll land on genuine Kenyan government sites.",
              action: { href: "/nea-agencies", label: "Try NEA verifier" },
            },
            {
              icon: ShieldCheck,
              title: "Free tools work without payment",
              body: "Try our ATS CV Checker, Job Scam Detector, or Offer Letter Verifier. All free, no account needed. If they were fake we'd force payment upfront.",
              action: { href: "/tools", label: "See free tools" },
            },
          ].map((item, i) => (
            <Card key={i}>
              <CardContent className="p-5 flex gap-4 items-start">
                <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                  <item.icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{item.body}</p>
                  {item.action && (
                    <Link href={item.action.href}>
                      <span className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline mt-2 cursor-pointer">
                        {item.action.label} <ArrowRight className="h-3 w-3" />
                      </span>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Common concerns */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <h2 className="text-2xl font-bold mb-4">Common concerns, honestly answered</h2>
        <div className="space-y-3">
          <details className="border rounded-lg p-4 group">
            <summary className="cursor-pointer font-semibold list-none flex justify-between items-center">
              <span>&ldquo;Google&apos;s AI Overview called you a scam.&rdquo;</span>
              <span className="text-muted-foreground text-xl group-open:rotate-45 transition-transform">+</span>
            </summary>
            <div className="text-sm text-muted-foreground mt-3 leading-relaxed space-y-2">
              <p>
                Google&apos;s AI Overview summarises whatever pages currently rank for a query. For newer
                domains without much first-party content on legitimacy, it can scrape opinions from
                Instagram &ldquo;exposer&rdquo; accounts and treat them as fact. This page + our{" "}
                <Link href="/blog/is-workabroadhub-legit-honest-answer"><span className="text-blue-600 hover:underline cursor-pointer">blog post on the same topic</span></Link>{" "}
                give Google verifiable first-party information to weigh instead. We&apos;re also happy for
                anyone to send us evidence of specific complaints so we can address them.
              </p>
            </div>
          </details>

          <details className="border rounded-lg p-4 group">
            <summary className="cursor-pointer font-semibold list-none flex justify-between items-center">
              <span>&ldquo;Are you a NEA-licensed recruitment agency?&rdquo;</span>
              <span className="text-muted-foreground text-xl group-open:rotate-45 transition-transform">+</span>
            </summary>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
              No, and we don&apos;t claim to be. We are a career-consultation service. If you want a
              NEA-licensed recruitment agency to represent you, verify one directly from Kenya&apos;s
              register at{" "}
              <Link href="/nea-agencies"><span className="text-blue-600 hover:underline cursor-pointer">our NEA directory</span></Link>{" "}
              or on the official{" "}
              <a href="https://neaims.go.ke/EmploymentAgencyList.aspx" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                NEAIMS portal
              </a>.
            </p>
          </details>

          <details className="border rounded-lg p-4 group">
            <summary className="cursor-pointer font-semibold list-none flex justify-between items-center">
              <span>&ldquo;Do you guarantee I&apos;ll get an overseas job?&rdquo;</span>
              <span className="text-muted-foreground text-xl group-open:rotate-45 transition-transform">+</span>
            </summary>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
              Absolutely not. Nobody legitimate can. We provide the tools and information to
              maximise your chances — a strong ATS-optimised CV, correct visa guidance, verified
              employer lists, and honest country-by-country pathways. But the actual offer comes
              from an employer, not from us. Anyone promising a guaranteed overseas job is
              scamming you.
            </p>
          </details>

          <details className="border rounded-lg p-4 group">
            <summary className="cursor-pointer font-semibold list-none flex justify-between items-center">
              <span>&ldquo;How do you make money if you&apos;re not a recruiter?&rdquo;</span>
              <span className="text-muted-foreground text-xl group-open:rotate-45 transition-transform">+</span>
            </summary>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
              We charge for career services — CV rewrites (KES 99), cover letters (KES 149), SoP
              writing (KES 249), and consultation packages (KES 4,500 one-time). We don&apos;t take
              a cut of anyone&apos;s future salary, don&apos;t collect placement fees, and don&apos;t receive
              kickbacks from recruitment agencies. It&apos;s a standard freemium software model: free
              tools attract users, and a small percentage pay for premium services.
            </p>
          </details>

          <details className="border rounded-lg p-4 group">
            <summary className="cursor-pointer font-semibold list-none flex justify-between items-center">
              <span>&ldquo;What if I have a complaint?&rdquo;</span>
              <span className="text-muted-foreground text-xl group-open:rotate-45 transition-transform">+</span>
            </summary>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
              Email <a href="mailto:support@workabroadhub.tech" className="text-blue-600 hover:underline">support@workabroadhub.tech</a>{" "}
              or use our{" "}
              <Link href="/contact"><span className="text-blue-600 hover:underline cursor-pointer">contact form</span></Link>. We respond within 24 hours to
              every legitimate query. If a service didn&apos;t deliver value, we refund — see our{" "}
              <Link href="/refund-policy"><span className="text-blue-600 hover:underline cursor-pointer">refund policy</span></Link>.
            </p>
          </details>
        </div>
      </section>

      {/* Contact CTA */}
      <section className="bg-slate-900 text-white py-12 px-4 sm:px-6 lg:px-8 mt-10">
        <div className="max-w-3xl mx-auto text-center space-y-3">
          <h2 className="text-2xl font-bold">Still have questions?</h2>
          <p className="text-blue-100/80">Email the founder directly. Every serious enquiry gets a reply.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <a href="mailto:support@workabroadhub.tech">
              <Button size="lg" className="bg-white text-blue-950 hover:bg-blue-50 gap-2">
                <Mail className="h-4 w-4" /> support@workabroadhub.tech
              </Button>
            </a>
            <Link href="/tools/ats-cv-checker">
              <Button size="lg" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10">
                Try a free tool first
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
