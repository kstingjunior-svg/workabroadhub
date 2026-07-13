import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { trackJobLinkClick } from "@/lib/analytics";
import { useJobRedirect } from "@/hooks/use-job-redirect";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookmarkButton } from "@/components/bookmark-button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Globe,
  ArrowLeft,
  ExternalLink,
  FileText,
  Shield,
  Briefcase,
  Lock,
  BookOpen,
  Send,
  Sparkles,
  CheckCircle,
  TrendingUp,
  ClipboardList,
  Plus,
  MessageSquare,
  FileCheck,
  ArrowRight,
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { CountryWithDetails } from "@shared/schema";

// ─────────────────────────────────────────────────────────────────────────────
// CountryServicesGrid — live catalogue card grid pulled from /api/services.
// Replaces the previously hardcoded "KES 3,500" service list. Filters to the
// "CV & Documents" + coaching categories so we still show CV-relevant
// services on the country dashboard (the original handpicked 6 services
// were all from those two buckets).
// ─────────────────────────────────────────────────────────────────────────────
interface LiveService {
  slug: string;
  name: string;
  price: number;
  finalPrice?: number;
  currency?: string;
  category?: string;
  description?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// WorkPermitHero — country-specific Work Permit Assistance promo card.
// Maps the /country/{code} slug to the matching work_permit_{cc}_* service
// slugs and renders a 3-tier ladder (Light / Mid / Pro) with prices and a
// CTA per tier. Returns null for countries we don't yet have permit SKUs for
// (usa, australia, europe) so the help tab gracefully omits the section.
// ─────────────────────────────────────────────────────────────────────────────
const WORK_PERMIT_COUNTRY_MAP: Record<string, { cc: string; permitClass: string }> = {
  uk:     { cc: "uk",     permitClass: "Skilled Worker Visa (with Certificate of Sponsorship)" },
  uae:    { cc: "uae",    permitClass: "MOHRE Employment Visa + Emirates ID" },
  canada: { cc: "canada", permitClass: "LMIA / Express Entry work permit" },
  // No /country/saudi or /country/qatar pages yet — those SKUs live on /services only.
};

function WorkPermitHero({ countryCode }: { countryCode: string }) {
  const mapped = WORK_PERMIT_COUNTRY_MAP[countryCode];

  const { data: services = [] } = useQuery<LiveService[]>({
    queryKey: ["/api/services"],
    queryFn: async () => {
      const res = await fetch("/api/services", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!mapped,
  });

  if (!mapped) return null;

  const tiers = ["light", "mid", "pro"]
    .map((tier) => services.find((s) => s.slug === `work_permit_${mapped.cc}_${tier}`))
    .filter(Boolean) as LiveService[];

  if (tiers.length < 3) return null; // services not yet seeded — hide silently

  const labelFor = (slug: string) =>
    slug.endsWith("_light") ? "Quick guide" :
    slug.endsWith("_mid")   ? "Guide + form pre-fill" :
                              "Full hand-holding";

  return (
    <Card className="bg-gradient-to-br from-primary/10 via-blue-50 to-amber-50 dark:from-primary/20 dark:via-blue-950/30 dark:to-amber-950/20 border-primary/30">
      <CardContent className="p-5 sm:p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
            <FileCheck className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 border border-amber-300 mb-2 text-[11px]">
              Most-asked question
            </Badge>
            <h3 className="font-bold text-lg leading-tight">
              Need help with your {countryData[countryCode]?.name ?? "destination"} work permit?
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Three tiers of help — from a quick AI guide to full hand-holding through the {mapped.permitClass}.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          {tiers.map((t) => {
            const shown = (t.finalPrice ?? t.price);
            const isPro = t.slug.endsWith("_pro");
            return (
              <Card key={t.slug} className={`hover-elevate ${isPro ? "border-amber-400" : ""}`}>
                <CardContent className="p-4 space-y-2 h-full flex flex-col">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {labelFor(t.slug)}
                  </p>
                  <p className="text-xl font-bold">KES {shown.toLocaleString("en-KE")}</p>
                  {t.description && (
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 flex-1">
                      {t.description}
                    </p>
                  )}
                  <Link href={`/services?focus=${t.slug}`}>
                    <Button size="sm" className="w-full mt-1" variant={isPro ? "default" : "outline"}>
                      Get it
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function CountryServicesGrid() {
  const { data: services = [], isLoading } = useQuery<LiveService[]>({
    queryKey: ["/api/services"],
    queryFn: async () => {
      const res = await fetch("/api/services", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  }

  // Hand-picked subset so the dashboard stays tight — these are the
  // services Kenyans applying abroad ask about most. Keep at 6.
  const FEATURED_SLUGS = [
    "cv_fix_lite",
    "ats_cv_optimization",
    "cv_rewrite",
    "cover_letter",
    "interview_coaching",
    "linkedin_optimization",
  ];

  const featured = FEATURED_SLUGS
    .map((slug) => services.find((s) => s.slug === slug))
    .filter(Boolean) as LiveService[];

  // Fallback if seed slugs don't match (e.g. legacy DB) — show first 6 by
  // price ascending so the country page is never empty.
  const list = featured.length >= 3
    ? featured
    : [...services].sort((a, b) => a.price - b.price).slice(0, 6);

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {list.map((s) => {
        const shown = (s.finalPrice ?? s.price);
        const curr = s.currency ?? "KES";
        return (
          <Card key={s.slug} className="hover-elevate">
            <CardContent className="p-4">
              <h3 className="font-medium">{s.name}</h3>
              {s.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.description}</p>
              )}
              <Badge variant="secondary" className="mt-3">
                {curr} {shown.toLocaleString("en-KE")}
              </Badge>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

const countryData: Record<string, { name: string; flagEmoji: string }> = {
  usa: { name: "USA", flagEmoji: "🇺🇸" },
  canada: { name: "Canada", flagEmoji: "🇨🇦" },
  uae: { name: "UAE / Arab Countries", flagEmoji: "🇦🇪" },
  uk: { name: "United Kingdom", flagEmoji: "🇬🇧" },
  australia: { name: "Australia", flagEmoji: "🇦🇺" },
  europe: { name: "Europe", flagEmoji: "🇪🇺" },
};

export default function Country() {
  const [, params] = useRoute("/country/:code");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { openJob } = useJobRedirect();
  const code = params?.code || "";
  const { data: country, isLoading, error } = useQuery<CountryWithDetails>({
    queryKey: ["/api/countries", code],
    enabled: !!code,
    retry: false,
  });

  const { data: userPlan } = useQuery<{ planId: string; plan: any } | null>({
    queryKey: ["/api/user/plan"],
    retry: false,
  });

  // Admin bypass — admins always have full access regardless of plan status.
  // Server-side /api/auth/user returns isAdminBypass=true for admin users.
  // Accept all the common shapes the codebase uses for "this is an admin":
  //   • isAdmin === true
  //   • isAdminBypass === true (the explicit bypass flag)
  //   • role === "ADMIN" | "SUPER_ADMIN"
  const { user } = useAuth();
  const u = user as any;
  const isAdminUser =
    u?.isAdmin === true ||
    u?.isAdminBypass === true ||
    u?.role === "ADMIN" ||
    u?.role === "SUPER_ADMIN";

  // 2026-06 audit fix: previously only "basic" and "pro" were recognised,
  // so Pro Monthly (KES 1,000) and Trial (KES 99) subscribers couldn't unlock
  // country pages. Now consistent with the other paywall checks across
  // student-visas, passport, good-conduct, KRA TCC, HELB clearance.
  const PAID_PLAN_IDS = new Set(["basic", "pro", "monthly", "trial", "yearly"]);
  const isPaidPlan =
    isAdminUser ||
    (userPlan?.planId ? PAID_PLAN_IDS.has(userPlan.planId) : false) ||
    u?.plan === "pro" ||
    u?.plan === "monthly" ||
    u?.subscriptionStatus === "active";

  useEffect(() => {
    if (error) {
      const errorMessage = (error as any)?.message || "";
      if (errorMessage.includes("403") || errorMessage.includes("Payment required")) {
        toast({
          title: "Access Locked",
          description: "Please complete payment to access country dashboards.",
          variant: "destructive",
        });
        navigate("/payment");
      } else if (errorMessage.includes("401")) {
        toast({
          title: "Session Expired",
          description: "Please log in again.",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/?redirect=" + encodeURIComponent(window.location.pathname);
        }, 500);
      }
    }
  }, [error, navigate, toast]);

  const countryInfo = countryData[code];

  // Quick-add application tracking state
  const [trackDialogOpen, setTrackDialogOpen] = useState(false);
  const [trackingData, setTrackingData] = useState({
    portalName: "",
    portalUrl: "",
    jobTitle: "",
    company: "",
  });

  // Track job link clicks
  const trackClickMutation = useMutation({
    mutationFn: async (linkId: string) => {
      return apiRequest("POST", `/api/job-links/${linkId}/click`);
    },
  });

  // Add tracked application mutation
  const addTrackedMutation = useMutation({
    mutationFn: async (data: { userId: string; jobTitle: string; companyName: string; targetCountry: string; jobUrl: string; source: string; status: string }) => {
      return apiRequest("POST", "/api/tracked-applications", data);
    },
    onSuccess: () => {
      toast({
        title: "Application Tracked",
        description: "Added to your Application Tracker. View all tracked jobs anytime.",
      });
      setTrackDialogOpen(false);
      setTrackingData({ portalName: "", portalUrl: "", jobTitle: "", company: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/tracked-applications"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to track application. Please try again.",
        variant: "destructive",
      });
    },
  });

  const openQuickTrack = (portalName: string, portalUrl: string, e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    setTrackingData({
      portalName,
      portalUrl,
      jobTitle: "",
      company: "",
    });
    setTrackDialogOpen(true);
  };

  const handleQuickTrackSubmit = () => {
    if (!trackingData.jobTitle.trim()) {
      toast({
        title: "Job Title Required",
        description: "Please enter a job title to track.",
        variant: "destructive",
      });
      return;
    }
    addTrackedMutation.mutate({
      userId: "", // Will be set by server from session
      jobTitle: trackingData.jobTitle,
      companyName: trackingData.company || "Unknown",
      targetCountry: countryInfo?.name || code.toUpperCase(),
      jobUrl: trackingData.portalUrl,
      source: trackingData.portalName,
      status: "saved",
    });
  };

  const openJobPortal = (linkId: string, name: string) => {
    // Track click in analytics (name-only, no URL exposed to frontend)
    trackJobLinkClick(name, code || '', '');
    // Resolve URL server-side — PRO check + click logging happen in /api/go/job
    openJob(linkId, 'portal');
  };

  // Format verified date
  const formatVerifiedDate = (date: Date | string | null | undefined) => {
    if (!date) return "Verified";
    const d = new Date(date);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Verified today";
    if (diffDays === 1) return "Verified yesterday";
    if (diffDays < 7) return `Verified ${diffDays} days ago`;
    if (diffDays < 30) return `Verified ${Math.floor(diffDays / 7)} weeks ago`;
    return `Verified ${d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
  };

  // Client-side resilience: if the API errors but the user navigated to a
  // KNOWN country slug, we render the page with a synthetic empty payload
  // instead of locking them out. This way an admin / Pro user is NEVER
  // blocked from a country dashboard even when the backend is mid-deploy
  // or has a stale DB row. Only the 403 paywall keeps its dedicated
  // lock screen (real subscription gate).
  const errMsg = (error as any)?.message || "";
  const isPaywall = errMsg.includes("403") || errMsg.includes("Payment required");

  if (error && isPaywall) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <Lock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Required</h2>
            <p className="text-muted-foreground mb-6">
              Please complete payment to unlock access to country dashboards.
            </p>
            <div className="space-y-3">
              <Link href="/payment">
                <Button className="w-full" data-testid="button-unlock-access">
                  Talk to an Advisor
                </Button>
              </Link>
              <Link href="/">
                <Button variant="outline" className="w-full" data-testid="button-go-back">
                  Go Back
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // If the API errored on a known country, fall through with a synthetic
  // empty country object so the rest of the page renders. The "Apply on
  // Platforms" tab will show its existing empty state ("Job portals are
  // being updated...") which is far better UX than a lock screen.
  const effectiveCountry: any = country ?? (
    countryInfo && error
      ? {
          id: `synthetic-${code}`,
          name: countryInfo.name,
          code,
          flagEmoji: countryInfo.flagEmoji,
          isActive: true,
          guides: [],
          jobLinks: [],
          scamAlerts: [],
        }
      : null
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center h-16 gap-4">
              <Skeleton className="h-9 w-9" />
              <Skeleton className="h-6 w-48" />
            </div>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Skeleton className="h-32 w-full mb-6" />
          <Skeleton className="h-64 w-full" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="icon" data-testid="button-back">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                <span className="text-3xl">{countryInfo?.flagEmoji}</span>
                <span className="font-semibold text-lg">{countryInfo?.name || "Country"} Dashboard</span>
              </div>
            </div>
            <Link href="/">
              <Button variant="outline" size="sm" data-testid="button-all-countries">
                <Globe className="h-4 w-4 mr-2" />
                All Countries
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Community Q&A Forum banner */}
        <Link href={`/forum/${code}`}>
          <div
            className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 to-cyan-500/5 px-4 py-3 hover:bg-primary/10 transition-colors cursor-pointer"
            data-testid="banner-community-forum"
          >
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <MessageSquare className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {countryInfo?.name || "Country"} Community Q&amp;A
                </p>
                <p className="text-xs text-muted-foreground">
                  Ask questions &amp; share experience with fellow job seekers
                </p>
              </div>
            </div>
            <span className="text-xs font-medium text-primary shrink-0">Join →</span>
          </div>
        </Link>

        <Tabs defaultValue="before" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 h-auto p-2 bg-gradient-to-r from-slate-50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 rounded-2xl shadow-lg border-2 border-indigo-200 dark:border-indigo-700 ring-4 ring-indigo-100/50 dark:ring-indigo-900/30">
            <TabsTrigger 
              value="before" 
              data-testid="tab-before"
              className="flex items-center gap-2 py-3 px-2 text-xs sm:text-sm font-semibold rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-500 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all duration-200"
            >
              <BookOpen className="h-4 w-4" />
              <span className="hidden sm:inline">Before You Apply</span>
              <span className="sm:hidden">Prepare</span>
            </TabsTrigger>
            <TabsTrigger 
              value="apply" 
              data-testid="tab-apply"
              className="flex items-center gap-2 py-3 px-2 text-xs sm:text-sm font-semibold rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-teal-500 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all duration-200"
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Apply on Platforms</span>
              <span className="sm:hidden">Apply</span>
            </TabsTrigger>
            <TabsTrigger 
              value="help" 
              data-testid="tab-help"
              className="flex items-center gap-2 py-3 px-2 text-xs sm:text-sm font-semibold rounded-lg data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all duration-200"
            >
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">Need Help?</span>
              <span className="sm:hidden">Help</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="before" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Briefcase className="h-5 w-5 text-primary" />
                    Before You Apply
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-line">
                    {effectiveCountry?.guides?.find((g: any) => g.section === "before_apply")?.content || 
                      "Technical skills relevant to your industry, English proficiency, and cultural adaptability are generally required for most positions."}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <FileText className="h-5 w-5 text-primary" />
                    CV Format Tips
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-line">
                    {effectiveCountry?.guides?.find((g: any) => g.section === "cv_tips")?.content || 
                      "Use a clean, professional format. Include contact information, professional summary, work experience with achievements, education, and relevant skills. Keep it concise (1-2 pages)."}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card className="border-destructive/20 bg-destructive/5">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg text-destructive">
                  <Shield className="h-5 w-5" />
                  Visa Warnings & Scam Alerts
                </CardTitle>
                <CardDescription>
                  Stay safe from common overseas job scams
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {effectiveCountry?.guides?.find((g: any) => g.section === "visa_warning")?.content || 
                    "Always apply for visas through official government channels only. Never pay for visa processing through unofficial agents. Legitimate employers will never ask for payment to hire you."}
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="apply" className="space-y-6">
            {!isPaidPlan ? (
              /* ── Free-plan upgrade wall ── */
              <Card className="border-2 border-dashed border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5" data-testid="portals-upgrade-wall">
                <CardContent className="p-8 text-center space-y-5">
                  <div className="flex items-center justify-center w-16 h-16 mx-auto rounded-full bg-primary/10">
                    <Lock className="h-8 w-8 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <Badge className="bg-primary/10 text-primary border border-primary/20 mb-2">BASIC / PRO Plan Required</Badge>
                    <h3 className="text-xl font-bold">Job Portals Are a Paid Feature</h3>
                    <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
                      Access curated, verified job portals for {countryInfo?.name || "this country"} — hand-picked official platforms where international employers actively hire. Available on BASIC and PRO plans.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto text-left">
                    {["Verified job portals per country", "Application tracker", "AI Bulk Apply", "WhatsApp consultation"].map(f => (
                      <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CheckCircle className="h-3.5 w-3.5 text-primary shrink-0" />
                        {f}
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                    <Link href="/pricing">
                      <Button className="gap-2 w-full sm:w-auto" data-testid="button-upgrade-portals">
                        <TrendingUp className="h-4 w-4" />
                        Upgrade to PRO
                      </Button>
                    </Link>
                    <Link href="/payment">
                      <Button variant="outline" className="gap-2 w-full sm:w-auto" data-testid="button-pay-portals">
                        Pay Now
                      </Button>
                    </Link>
                  </div>
                  <p className="text-xs text-muted-foreground">One-time payment. Instant access. No hidden fees.</p>
                </CardContent>
              </Card>
            ) : (
              /* ── Paid plan: show portals ── */
              <>
                <Card className="bg-muted/30">
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">
                      Click on any portal below to open it in a new tab. All links are verified official job platforms.
                      Remember: We do not guarantee employment — these are third-party platforms where you apply directly.
                    </p>
                  </CardContent>
                </Card>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {effectiveCountry?.jobLinks && effectiveCountry.jobLinks.length > 0 ? (
                    effectiveCountry.jobLinks.map((link: any) => (
                      <Card
                        key={link.id}
                        className="hover-elevate cursor-pointer"
                        onClick={() => openJobPortal(link.id, link.name)}
                        data-testid={`job-link-${link.id}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-2 flex-1">
                              <h3 className="font-medium">{link.name}</h3>
                              {link.description && (
                                <p className="text-xs text-muted-foreground">{link.description}</p>
                              )}
                              <div className="flex flex-wrap gap-1.5">
                                <Badge variant="outline" className="text-xs gap-1">
                                  <CheckCircle className="h-3 w-3 text-green-500" />
                                  {formatVerifiedDate(link.lastVerified)}
                                </Badge>
                                {link.clickCount > 10 && (
                                  <Badge variant="secondary" className="text-xs gap-1">
                                    <TrendingUp className="h-3 w-3" />
                                    Popular
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-2 flex-shrink-0">
                              <ExternalLink className="h-5 w-5 text-muted-foreground" />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => openQuickTrack(link.name, link.url, e)}
                                data-testid={`track-job-${link.id}`}
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                Track
                              </Button>
                              {/* 2026-06 retention #5: save this portal for later */}
                              <BookmarkButton
                                itemType="portal"
                                itemId={String(link.id)}
                                title={link.name}
                                subtitle={`${countryInfo?.name ?? code} · ${link.description ?? "Verified portal"}`}
                                countryCode={(code || "").toUpperCase()}
                                href={`/country/${code}`}
                                meta={{ description: link.description, url: link.url }}
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <p className="text-muted-foreground col-span-full text-center py-8">
                      Job portals are being updated. Please check back soon.
                    </p>
                  )}
                </div>
              </>
            )}
          </TabsContent>


          <TabsContent value="help" className="space-y-6">
            <Card className="bg-gradient-to-r from-primary/5 to-accent/5 border-primary/20">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Briefcase className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Professional Career Services</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Boost your chances with our expert career services. Our team helps you stand out to international employers.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Work-permit promo — only renders if this country has SKUs seeded */}
            <WorkPermitHero countryCode={code} />

            {/*
              ── LIVE service catalogue ──────────────────────────────────────
              Previously this list hardcoded "KES 3,500" for CV Rewrite and
              ATS CV Optimization etc. Replaced with live /api/services fetch
              so admin price updates land here immediately.
            */}
            <CountryServicesGrid />

            <div className="text-center">
              <Link href="/services">
                <Button size="lg" data-testid="button-view-services">
                  View All Services
                  <ExternalLink className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>

            <Card className="border-muted">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground text-center">
                  These are optional premium services. WorkAbroad Hub does not guarantee employment.
                  Services are designed to improve your application quality and interview readiness.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Quick Track Dialog */}
      <Dialog open={trackDialogOpen} onOpenChange={setTrackDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              Quick Track Application
            </DialogTitle>
            <DialogDescription>
              Track a job you're applying to via <strong>{trackingData.portalName}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="jobTitle">Job Title *</Label>
              <Input
                id="jobTitle"
                placeholder="e.g. Software Engineer, Nurse, Electrician"
                value={trackingData.jobTitle}
                onChange={(e) => setTrackingData(prev => ({ ...prev, jobTitle: e.target.value }))}
                data-testid="input-quick-track-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company">Company Name</Label>
              <Input
                id="company"
                placeholder="e.g. Google, NHS, Amazon"
                value={trackingData.company}
                onChange={(e) => setTrackingData(prev => ({ ...prev, company: e.target.value }))}
                data-testid="input-quick-track-company"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              This will be saved to your Application Tracker where you can update status, add notes, and track all your applications in one place.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTrackDialogOpen(false)} data-testid="button-cancel-quick-track">
              Cancel
            </Button>
            <Button
              onClick={handleQuickTrackSubmit}
              disabled={addTrackedMutation.isPending}
              data-testid="button-save-quick-track"
            >
              {addTrackedMutation.isPending ? "Saving..." : "Track Application"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
