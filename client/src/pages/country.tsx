import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { trackJobLinkClick } from "@/lib/analytics";
import { useJobRedirect } from "@/hooks/use-job-redirect";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { CountryWithDetails } from "@shared/schema";

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

  const isPaidPlan = userPlan?.planId === "basic" || userPlan?.planId === "pro";

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
          window.location.href = "/api/login";
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

  if (error) {
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
                  Unlock Access
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
                    {country?.guides?.find(g => g.section === "before_apply")?.content || 
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
                    {country?.guides?.find(g => g.section === "cv_tips")?.content || 
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
                  {country?.guides?.find(g => g.section === "visa_warning")?.content || 
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
                  {country?.jobLinks && country.jobLinks.length > 0 ? (
                    country.jobLinks.map((link: any) => (
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

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { name: "CV Rewrite", desc: "Professional CV tailored to international standards", price: "KES 3,500+" },
                { name: "ATS CV Optimization", desc: "Make your CV pass Applicant Tracking Systems", price: "KES 3,500" },
                { name: "Cover Letter Writing", desc: "Custom cover letters for each application", price: "KES 1,500" },
                { name: "Interview Coaching", desc: "One-on-one mock interviews with feedback", price: "KES 5,000" },
                { name: "Visa Guidance Articles", desc: "Detailed visa process information", price: "KES 3,000" },
                { name: "LinkedIn Optimization", desc: "Attract international recruiters", price: "KES 3,000" },
              ].map((service) => (
                <Card key={service.name} className="hover-elevate">
                  <CardContent className="p-4">
                    <h3 className="font-medium">{service.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{service.desc}</p>
                    <Badge variant="secondary" className="mt-3">{service.price}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>

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
