import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { SeoHead, buildArticleSchema, buildFaqSchema } from "@/components/seo-head";
import { trackPageView } from "@/lib/analytics";
import {
  Download,
  ArrowLeft,
  CheckCircle,
  FileText,
  Loader2,
} from "lucide-react";

const CV_FAQS = [
  { q: "Why do I need a different CV format for each country?", a: "Each country has different CV conventions. UK employers expect a 2-page CV with no photo and a personal statement. Canadian employers use a 'resume' format with quantified achievements. UAE employers often expect a photo and nationality. Australian CVs are similar to UK but sometimes longer. Using the wrong format can immediately disqualify your application." },
  { q: "Are these CV templates ATS-compatible?", a: "Yes. All our templates use clean, simple formatting with no tables, text boxes, or graphics that confuse ATS systems. They use standard section headings (Work Experience, Education, Skills) that ATS software recognises." },
  { q: "What format are the CV templates provided in?", a: "Templates are provided in text format ready to copy into Word or Google Docs. This allows you to easily edit them while maintaining ATS-friendly formatting." },
  { q: "Do I need to sign up to download CV templates?", a: "No sign-up is required to download CV templates. They are completely free. However, creating a free account allows you to track your applications and access our paid career services." },
  { q: "Which CV template should I use for a nursing job in the UK?", a: "Use the UK CV template, which follows the NHS application format. Include your NMC registration number (if already registered) or your pending registration status. Highlight your clinical experience, any English language test results (IELTS/OET), and include referees from your current employer." },
];

interface Template {
  id: string;
  name: string;
  country: string;
  flag: string;
  description: string;
  category: string;
  format: string;
}

function TemplateCard({ template }: { template: Template }) {
  const { toast } = useToast();
  const [downloaded, setDownloaded] = useState(false);

  const { mutate: download, isPending } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/templates/download/${template.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${template.id}-workabroadhub.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      setDownloaded(true);
      toast({ title: "Download started", description: `${template.name} is downloading.` });
      setTimeout(() => setDownloaded(false), 5000);
    },
    onError: () => {
      toast({ title: "Download failed", description: "Please try again.", variant: "destructive" });
    },
  });

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow" data-testid={`card-template-${template.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 bg-purple-50 dark:bg-purple-900/20 rounded-xl flex items-center justify-center text-2xl shrink-0">
            {template.flag}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className="font-semibold text-sm" data-testid={`text-template-name-${template.id}`}>{template.name}</h3>
              <Badge variant="outline" className="text-[10px] shrink-0">{template.format}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-1">{template.country}</p>
            <Badge variant="secondary" className="text-[10px] mb-2">{template.category}</Badge>
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">{template.description}</p>

            <Button
              size="sm"
              className={`h-8 text-xs gap-1.5 w-full ${downloaded ? "bg-green-600 hover:bg-green-700" : ""}`}
              onClick={() => download()}
              disabled={isPending}
              data-testid={`button-download-${template.id}`}
            >
              {isPending ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />Downloading…</>
              ) : downloaded ? (
                <><CheckCircle className="h-3.5 w-3.5" />Downloaded!</>
              ) : (
                <><Download className="h-3.5 w-3.5" />Download Template</>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CVTemplates() {
  const { data: templates, isLoading } = useQuery<Template[]>({
    queryKey: ["/api/templates"],
    staleTime: 300000,
  });

  useEffect(() => {
    trackPageView("cv_templates");
  }, []);

  const seoSchemas = [
    buildArticleSchema({
      title: "Free CV Templates for UK, Canada, Dubai & Australia Jobs",
      description: "Download free country-specific CV templates formatted exactly how employers in UK, Canada, UAE, and Australia expect.",
      url: "https://workabroadhub.tech/tools/cv-templates",
    }),
    buildFaqSchema(CV_FAQS),
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      <SeoHead
        title="Free CV Templates for UK, Canada, Dubai & Australia Jobs | WorkAbroad Hub"
        description="Download free country-specific CV templates formatted exactly how employers in UK, Canada, UAE, and Australia expect. Ready to use for overseas job applications."
        keywords="free CV template, UK CV template, Canada resume template, Dubai CV template, Australia CV template, overseas job CV, international CV format, ATS CV template Kenya"
        canonicalPath="/tools/cv-templates"
        schemas={seoSchemas}
      />

      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-500 px-4 pt-10 pb-6 text-white">
        <Link href="/tools">
          <button className="flex items-center gap-1 text-purple-100 text-sm mb-4 hover:text-white" data-testid="link-back-tools">
            <ArrowLeft className="h-4 w-4" /> Tools
          </button>
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-white/20 rounded-xl flex items-center justify-center">
            <Download className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold" data-testid="text-page-title">Free CV Templates</h1>
            <p className="text-purple-100 text-xs">Country-specific, employer-ready formats</p>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 mt-4 space-y-4">
        {/* Info bar */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3 flex items-start gap-2">
          <FileText className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-800 dark:text-blue-300">
            These templates are formatted to match the expectations of employers in each country. Customise with your own experience before applying.
          </p>
        </div>

        {/* Templates grid */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardContent className="p-4 flex gap-3">
                  <div className="h-12 w-12 bg-muted rounded-xl animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4 animate-pulse" />
                    <div className="h-3 bg-muted rounded w-1/2 animate-pulse" />
                    <div className="h-8 bg-muted rounded animate-pulse" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {(templates ?? []).map((t) => (
              <TemplateCard key={t.id} template={t} />
            ))}
          </div>
        )}

        {/* Upgrade CTA */}
        <Card className="bg-gradient-to-br from-blue-50 to-teal-50 dark:from-blue-900/20 dark:to-teal-900/20 border-blue-200 dark:border-blue-700">
          <CardContent className="p-5 text-center space-y-2">
            <p className="text-sm font-semibold">Need a professionally written CV?</p>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-xs mx-auto">
              Our consultants write ATS-optimised CVs tailored for specific countries and roles. Trusted by 500+ Kenyans now working abroad.
            </p>
            <Link href="/services">
              <Button size="sm" className="mt-1" data-testid="button-cv-writing-service">
                Get Professional CV Writing
              </Button>
            </Link>
          </CardContent>
        </Card>

        <p className="text-xs text-center text-muted-foreground pb-2">
          Templates are provided as starting points only. Always customise for each specific job application.
        </p>

        {/* FAQ Section */}
        <div className="space-y-3 pt-2" data-testid="faq-section-templates">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-purple-500" />
            <p className="text-sm font-semibold">Frequently Asked Questions</p>
          </div>
          {CV_FAQS.map((faq, i) => (
            <details key={i} className="group rounded-lg border border-border bg-card" data-testid={`faq-item-template-${i}`}>
              <summary className="flex items-center justify-between cursor-pointer p-3 text-xs font-semibold select-none marker:hidden list-none">
                {faq.q}
                <CheckCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-2 opacity-0 group-open:opacity-100 transition-opacity" />
              </summary>
              <div className="px-3 pb-3 text-xs text-muted-foreground leading-relaxed">{faq.a}</div>
            </details>
          ))}
        </div>

        {/* Internal links */}
        <div className="pb-4">
          <p className="text-xs text-muted-foreground font-semibold mb-2">Related tools & services</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/tools/ats-cv-checker"><span className="text-xs text-blue-600 dark:text-blue-400 underline underline-offset-2">ATS CV Checker</span></Link>
            <span className="text-xs text-muted-foreground">·</span>
            <Link href="/tools/visa-sponsorship-jobs"><span className="text-xs text-blue-600 dark:text-blue-400 underline underline-offset-2">Visa Sponsorship Jobs</span></Link>
            <span className="text-xs text-muted-foreground">·</span>
            <Link href="/services"><span className="text-xs text-blue-600 dark:text-blue-400 underline underline-offset-2">Professional CV Writing</span></Link>
            <span className="text-xs text-muted-foreground">·</span>
            <a href="/api/login"><span className="text-xs text-blue-600 dark:text-blue-400 underline underline-offset-2">Sign Up Free</span></a>
          </div>
        </div>
      </div>
    </div>
  );
}
