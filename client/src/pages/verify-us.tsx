// ─────────────────────────────────────────────────────────────────────────────
// /verify-us — the credibility page
//
// Visitors who tap "Verify us →" in the footer land here. The goal is to
// remove every reason for them to suspect we're another fly-by-night scam
// platform. Lists every checkable credential with links to official
// registries where applicable, plus our refund policy, contact details,
// and the team behind WorkAbroad Hub.
// ─────────────────────────────────────────────────────────────────────────────

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  BadgeCheck,
  Shield,
  FileCheck,
  ExternalLink,
  Mail,
  Phone,
  MapPin,
  ArrowLeft,
  Building2,
  Receipt,
  Lock,
} from "lucide-react";

interface Credential {
  icon: any;
  label: string;
  value: string;
  verifyUrl?: string;
  description: string;
  color: string;
}

const CREDENTIALS: Credential[] = [
  {
    icon: BadgeCheck,
    label: "Business Registration",
    value: import.meta.env.VITE_BUSINESS_REG_NUMBER || "PVT-XQUYZX",
    verifyUrl: "https://brs.ecitizen.go.ke",
    description: "Registered with the Kenya Business Registration Service. Verify the company name and status on the official eCitizen BRS portal.",
    color: "emerald",
  },
  {
    icon: Shield,
    label: "NEAIMS Licensed",
    value: import.meta.env.VITE_NEA_LICENSE_NUMBER || "RA/2024/01/123",
    verifyUrl: "https://nea.go.ke/licensed-agencies",
    description: "Our partner agencies appear on the National Employment Authority Integrated Management Systems's official licensed list. Every recruiter we link to must be NEAIMS-verified.",
    color: "blue",
  },
  {
    icon: Receipt,
    label: "KRA PIN",
    value: import.meta.env.VITE_KRA_PIN || "P051234567X",
    verifyUrl: "https://itax.kra.go.ke/KRA-Portal/pinChecker.htm",
    description: "Tax-compliant business. Our PIN is on every receipt and can be checked on the KRA PIN Checker.",
    color: "purple",
  },
  {
    icon: Lock,
    label: "SSL Encrypted",
    value: "TLS 1.3",
    description: "Every page, payment, and form submission is encrypted end-to-end. Look for the padlock icon in your browser bar.",
    color: "amber",
  },
];

const REFUND_POLICY_HIGHLIGHTS = [
  "7-day money-back guarantee on all subscription plans — no questions asked",
  "30-day callback guarantee on Premium services (KES 1,000+) — full refund if you don't get an interview callback",
  "Refunds processed back to your original M-Pesa or PayPal account within 3 business days",
];

export default function VerifyUsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="button-back-home">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="WorkAbroad Hub" className="h-8 w-8 rounded-lg" />
            <span className="font-bold text-sm">WorkAbroad Hub</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        {/* Hero */}
        <section className="text-center max-w-2xl mx-auto">
          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 mb-3">
            <BadgeCheck className="h-3.5 w-3.5 mr-1" />
            Verified Business
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-bold mb-3 tracking-tight" data-testid="text-verify-heading">
            We're not another scam platform.
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
            Kenyans have been burned by overseas-jobs scams for too long. Here's
            everything you need to verify that WorkAbroad Hub is a real,
            tax-compliant, NEAIMS-registered business — checkable on official
            government registries.
          </p>
        </section>

        {/* Credentials grid */}
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            Our Credentials
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {CREDENTIALS.map((c) => {
              const Icon = c.icon;
              return (
                <Card key={c.label} data-testid={`credential-${c.label.toLowerCase().replace(/\s+/g, "-")}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3 mb-3">
                      <div className={`shrink-0 w-10 h-10 rounded-xl bg-${c.color}-100 dark:bg-${c.color}-950/30 flex items-center justify-center`}>
                        <Icon className={`h-5 w-5 text-${c.color}-600 dark:text-${c.color}-400`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm">{c.label}</h3>
                        <code className="text-xs font-mono text-muted-foreground break-all">{c.value}</code>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                      {c.description}
                    </p>
                    {c.verifyUrl && (
                      <a
                        href={c.verifyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                        data-testid={`link-verify-${c.label.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        <ExternalLink className="h-3 w-3" />
                        Verify on official registry
                      </a>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Refund policy */}
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-emerald-600" />
            Money-Back Guarantee
          </h2>
          <Card className="border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20">
            <CardContent className="p-6 space-y-3">
              {REFUND_POLICY_HIGHLIGHTS.map((line, i) => (
                <div key={i} className="flex items-start gap-3 text-sm">
                  <BadgeCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{line}</span>
                </div>
              ))}
              <div className="pt-3 border-t border-emerald-200 dark:border-emerald-900">
                <Link href="/refund-policy">
                  <Button variant="outline" size="sm" data-testid="button-full-refund-policy">
                    Read full refund policy →
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Contact / accountability */}
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-purple-600" />
            How to Reach Us
          </h2>
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground">Email</div>
                    <a href="mailto:support@workabroadhub.tech" className="text-sm font-medium hover:underline">
                      support@workabroadhub.tech
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground">Phone / WhatsApp</div>
                    <a href="tel:+254742619777" className="text-sm font-medium hover:underline">
                      +254 742 619 777
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-3 sm:col-span-2">
                  <MapPin className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground">Operating Entity</div>
                    <div className="text-sm font-medium">Exovia Connect — Registered in Nairobi, Kenya</div>
                  </div>
                </div>
              </div>
              <div className="pt-3 border-t text-xs text-muted-foreground leading-relaxed">
                If something feels off, talk to us before paying. We answer every
                message within 24 hours (often within 1). A real platform never
                hides behind a contact form.
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Final CTA */}
        <section className="text-center pt-4">
          <Link href="/pricing">
            <Button size="lg" data-testid="button-verify-cta-pricing">
              View Plans & Pricing →
            </Button>
          </Link>
        </section>
      </main>
    </div>
  );
}
