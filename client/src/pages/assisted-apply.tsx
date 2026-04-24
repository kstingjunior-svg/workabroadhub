import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatPhone } from "@/lib/phone";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft,
  Globe,
  CheckCircle2,
  FileText,
  Send,
  Clock,
  Shield,
  AlertTriangle,
  HelpCircle,
  Sparkles,
  Target,
  Users,
  Zap,
  Star,
  ArrowRight,
  Briefcase,
  FileCheck,
  Eye,
  Bell,
  ChevronRight,
  GraduationCap,
  Smartphone,
  Loader2,
  Download,
  CalendarDays,
  Building2,
  ExternalLink,
  CircleCheck,
  MessageSquare,
  Lightbulb,
} from "lucide-react";
import { Link } from "wouter";
import type { ApplicationPack, UserApplicationPack, UserJobApplication } from "@shared/schema";

const APPLICATION_STATUS_CONFIG: Record<string, { label: string; color: string; icon: any; description: string }> = {
  submitted:            { label: "Submitted",          color: "bg-blue-500",    icon: Send,          description: "Your job details have been received" },
  queued:               { label: "Queued",             color: "bg-sky-500",     icon: Loader2,       description: "Waiting in the AI processing queue…" },
  analyzing:            { label: "Analyzing Job",      color: "bg-amber-500",   icon: Loader2,       description: "Scraping and analyzing the job posting…" },
  generating:           { label: "Generating",         color: "bg-yellow-500",  icon: Loader2,       description: "AI is writing your tailored CV and cover letter…" },
  preparing:            { label: "AI Preparing",       color: "bg-yellow-500",  icon: Loader2,       description: "AI is crafting your tailored materials…" },
  materials_ready:      { label: "Ready to Download",  color: "bg-green-500",   icon: FileCheck,     description: "Your CV and cover letter are ready" },
  downloaded:           { label: "Downloaded",         color: "bg-emerald-600", icon: CircleCheck,   description: "Materials downloaded successfully" },
  failed:               { label: "Generation Failed",  color: "bg-red-500",     icon: AlertTriangle, description: "AI generation failed — please try again" },
  user_action_required: { label: "Action Required",    color: "bg-orange-500",  icon: AlertTriangle, description: "Please review and submit your application" },
  applied:              { label: "Applied",            color: "bg-purple-500",  icon: CheckCircle2,  description: "You've submitted your application" },
  confirmed:            { label: "Confirmed",          color: "bg-emerald-500", icon: Shield,        description: "Application received by employer" },
  rejected:             { label: "Not Selected",       color: "bg-gray-500",    icon: Clock,         description: "Application was not successful" },
  interview_scheduled:  { label: "Interview",          color: "bg-primary",     icon: Star,          description: "Interview scheduled!" },
};

export default function AssistedApply() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("overview");
  const [paymentMethod, setPaymentMethod] = useState<"mpesa">("mpesa");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [paymentStep, setPaymentStep] = useState<"select" | "awaiting_mpesa" | "success">("select");
  const [pendingPackId, setPendingPackId] = useState<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Handle route variants
  const [matchPurchase, params] = useRoute("/assisted-apply/purchase/:packId");
  const packId = params?.packId;
  const [matchNew] = useRoute("/assisted-apply/new");
  const [matchDetail, detailParams] = useRoute("/assisted-apply/application/:applicationId");
  const applicationId = detailParams?.applicationId;

  // New application form state
  const [newAppPackId, setNewAppPackId] = useState("");
  const [newAppJobTitle, setNewAppJobTitle] = useState("");
  const [newAppCompany, setNewAppCompany] = useState("");
  const [newAppUrl, setNewAppUrl] = useState("");
  const [newAppCountry, setNewAppCountry] = useState("Kenya");
  const [newAppDeadline, setNewAppDeadline] = useState("");
  const [newAppDescription, setNewAppDescription] = useState("");
  const [newAppCurrentRole, setNewAppCurrentRole] = useState("");
  const [newAppYearsExp, setNewAppYearsExp] = useState("");

  // Application detail: mark submitted state
  const [markingSubmitted, setMarkingSubmitted] = useState(false);

  // Track which applications are currently being generated (spinner state)
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());

  // WebSocket ref for application_ready events
  const appWsRef = useRef<WebSocket | null>(null);

  const { data: packs, isLoading: packsLoading } = useQuery<ApplicationPack[]>({
    queryKey: ["/api/application-packs"],
  });
  
  // Get selected pack for purchase
  const selectedPack = packId ? packs?.find(p => p.id === packId) : null;

  // Stop polling helper
  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  // Poll pack payment status after STK push is fired
  const startPolling = (packId: string) => {
    stopPolling();
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/user-application-packs/${packId}/payment-status`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "active" || data.status === "paid") {
          stopPolling();
          setPaymentStep("success");
          queryClient.invalidateQueries({ queryKey: ["/api/user-application-packs"] });
          toast({ title: "Payment Confirmed!", description: "Your pack is now active. Start submitting applications." });
          setTimeout(() => { navigate("/assisted-apply"); setActiveTab("my-applications"); }, 2500);
        }
      } catch {}
    }, 4000);
  };

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), []);

  // ── WebSocket: listen for application_ready events ──────────────────────────
  useEffect(() => {
    if (!user) return;
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/user`);
    appWsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "identify", userId: (user as any).id }));
    };
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === "application_ready") {
          queryClient.invalidateQueries({ queryKey: ["/api/user-job-applications"] });
          setGeneratingIds((prev) => { const next = new Set(prev); next.delete(msg.applicationId); return next; });
          toast({
            title: "📄 Materials Ready!",
            description: `CV and cover letter for ${msg.jobTitle} at ${msg.company} are ready to download.`,
          });
        }
      } catch { /* ignore malformed */ }
    };
    ws.onerror = () => {};
    ws.onclose = () => {};

    return () => { ws.close(); appWsRef.current = null; };
  }, [user?.id]);

  // ── Generate mutation: triggers AI material generation ───────────────────────
  const generateMutation = useMutation({
    mutationFn: async (applicationId: string) => {
      const res = await apiRequest("POST", `/api/user-job-applications/${applicationId}/generate`);
      return res.json();
    },
    onMutate: (applicationId: string) => {
      setGeneratingIds((prev) => new Set(prev).add(applicationId));
    },
    onSuccess: (_data, applicationId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-job-applications"] });
      toast({ title: "AI generation started", description: "You'll be notified when your materials are ready." });
    },
    onError: (err: any, applicationId) => {
      setGeneratingIds((prev) => { const next = new Set(prev); next.delete(applicationId); return next; });
      toast({ title: "Generation failed", description: err?.message ?? "Please try again.", variant: "destructive" });
    },
  });

  // ── Retry mutation: resets a failed application and re-queues it ─────────────
  const retryMutation = useMutation({
    mutationFn: async (applicationId: string) => {
      const res = await apiRequest("POST", `/api/applications/${applicationId}/retry`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Retry failed");
      }
      return res.json();
    },
    onMutate: (applicationId: string) => {
      setGeneratingIds((prev) => new Set(prev).add(applicationId));
    },
    onSuccess: (_data, applicationId) => {
      setGeneratingIds((prev) => { const next = new Set(prev); next.delete(applicationId); return next; });
      queryClient.invalidateQueries({ queryKey: ["/api/user-job-applications"] });
      toast({ title: "Retry queued", description: "The AI pipeline has been restarted for this application." });
    },
    onError: (err: any, applicationId) => {
      setGeneratingIds((prev) => { const next = new Set(prev); next.delete(applicationId); return next; });
      toast({ title: "Retry failed", description: err?.message ?? "Please try again.", variant: "destructive" });
    },
  });

  // Purchase mutation
  const purchaseMutation = useMutation({
    mutationFn: async ({ packId, paymentMethod, phone }: { packId: string; paymentMethod: "mpesa"; phone?: string }) => {
      const res = await apiRequest("POST", "/api/user-application-packs", { 
        packId, 
        paymentMethod,
        phone: paymentMethod === "mpesa" ? phone : undefined,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Purchase failed");
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.checkoutRequestId && paymentMethod === "mpesa") {
        // Real M-Pesa STK push fired — wait for callback
        setPaymentStep("awaiting_mpesa");
        setPendingPackId(data.id);
        startPolling(data.id);
      } else {
        // Card or non-mpesa — immediate success
        setPaymentStep("success");
        queryClient.invalidateQueries({ queryKey: ["/api/user-application-packs"] });
        toast({ title: "Pack Purchased!", description: "Your application pack is now active." });
        setTimeout(() => { navigate("/assisted-apply"); setActiveTab("my-applications"); }, 2000);
      }
    },
    onError: (error: any) => {
      setPaymentStep("select");
      toast({
        title: "Purchase Failed",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });
  
  const handlePurchase = () => {
    if (!user) {
      toast({
        title: "Login Required",
        description: "Please log in to purchase an application pack.",
        variant: "destructive",
      });
      return;
    }
    if (paymentMethod === "mpesa" && (!phoneNumber || phoneNumber.length < 9)) {
      toast({
        title: "Phone Number Required",
        description: "Please enter a valid M-Pesa phone number.",
        variant: "destructive",
      });
      return;
    }
    if (packId) {
      purchaseMutation.mutate({ packId, paymentMethod, phone: phoneNumber });
    }
  };

  const { data: userPacks } = useQuery<UserApplicationPack[]>({
    queryKey: ["/api/user-application-packs"],
    enabled: !!user,
  });

  const { data: applications } = useQuery<UserJobApplication[]>({
    queryKey: ["/api/user-job-applications"],
    enabled: !!user,
  });

  // Single application detail query (for detail view)
  const { data: applicationDetail, isLoading: detailLoading } = useQuery<UserJobApplication & { statusHistory?: any[] }>({
    queryKey: ["/api/user-job-applications", applicationId],
    enabled: !!applicationId && !!user,
    refetchInterval: matchDetail ? 10_000 : false,
  });

  // Create new application mutation
  const createApplicationMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/user-job-applications", data);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed to submit"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-job-applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-application-packs"] });
      toast({ title: "Application submitted!", description: "Our team will start preparing your materials." });
      navigate("/assisted-apply");
      setActiveTab("my-applications");
    },
    onError: (e: any) => toast({ title: "Submission failed", description: e.message, variant: "destructive" }),
  });

  // Mark as submitted mutation
  const markSubmittedMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/user-job-applications/${id}`, { status: "applied" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-job-applications", applicationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-job-applications"] });
      toast({ title: "Marked as submitted!", description: "Your application has been recorded." });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("en-KE", {
      style: "currency",
      currency: "KES",
      minimumFractionDigits: 0,
    }).format(price);
  };

  const activePack = userPacks?.find(p => p.status === "active" || p.status === "paid");
  const remainingApplications = activePack ? activePack.totalApplications - activePack.usedApplications : 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="icon" data-testid="button-back">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <Target className="h-6 w-6 text-primary" />
                <span className="font-semibold text-lg">Assisted Apply Mode</span>
              </div>
            </div>
            {activePack && (
              <Badge variant="secondary" className="gap-1">
                <Briefcase className="h-3 w-3" />
                {remainingApplications} applications left
              </Badge>
            )}
          </div>
        </div>
      </header>

      {/* ═══ NEW APPLICATION FORM ═══ */}
      {matchNew && (
        <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Button
            variant="ghost" size="sm"
            className="mb-4 gap-2 text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/assisted-apply")}
            data-testid="button-back-to-applications"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>

          {!user ? (
            <Card><CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-4">Please log in to submit an application.</p>
              <Button onClick={() => navigate("/")}>Log In</Button>
            </CardContent></Card>
          ) : !activePack ? (
            <Card><CardContent className="py-12 text-center">
              <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Active Pack</h3>
              <p className="text-muted-foreground mb-4">Purchase an application pack to start submitting applications.</p>
              <Button onClick={() => { navigate("/assisted-apply"); setActiveTab("packages"); }}>View Packages</Button>
            </CardContent></Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Briefcase className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Submit a New Application</CardTitle>
                    <CardDescription>
                      {activePack.packName} · {activePack.totalApplications - activePack.usedApplications} application{activePack.totalApplications - activePack.usedApplications !== 1 ? "s" : ""} remaining
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Pack selector if multiple */}
                {userPacks && userPacks.filter(p => p.status === "active" || p.status === "paid").length > 1 && (
                  <div className="space-y-2">
                    <Label>Select Pack</Label>
                    <Select value={newAppPackId || activePack.id} onValueChange={setNewAppPackId}>
                      <SelectTrigger data-testid="select-pack">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {userPacks.filter(p => p.status === "active" || p.status === "paid").map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.packName} ({p.totalApplications - p.usedApplications} left)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="job-title">Job Title *</Label>
                    <Input id="job-title" placeholder="e.g. Software Engineer" value={newAppJobTitle}
                      onChange={e => setNewAppJobTitle(e.target.value)} data-testid="input-job-title" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company">Company Name *</Label>
                    <Input id="company" placeholder="e.g. Google" value={newAppCompany}
                      onChange={e => setNewAppCompany(e.target.value)} data-testid="input-company" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="job-url">Job Posting URL *</Label>
                  <Input id="job-url" type="url" placeholder="https://jobs.example.com/..." value={newAppUrl}
                    onChange={e => setNewAppUrl(e.target.value)} data-testid="input-job-url" />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="target-country">Target Country *</Label>
                    <Input id="target-country" placeholder="e.g. UAE, Canada, UK" value={newAppCountry}
                      onChange={e => setNewAppCountry(e.target.value)} data-testid="input-target-country" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deadline">Application Deadline</Label>
                    <Input id="deadline" type="date" value={newAppDeadline}
                      onChange={e => setNewAppDeadline(e.target.value)} data-testid="input-deadline" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="job-description">Job Description / Requirements</Label>
                  <Textarea id="job-description" placeholder="Paste the job description or key requirements here. This helps us tailor your CV."
                    rows={4} value={newAppDescription} onChange={e => setNewAppDescription(e.target.value)} data-testid="textarea-job-description" />
                </div>

                <div className="border-t pt-4 space-y-4">
                  <p className="text-sm font-medium text-muted-foreground">Your Profile Info</p>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="current-role">Current Role / Profession</Label>
                      <Input id="current-role" placeholder="e.g. Registered Nurse" value={newAppCurrentRole}
                        onChange={e => setNewAppCurrentRole(e.target.value)} data-testid="input-current-role" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="years-exp">Years of Experience</Label>
                      <Input id="years-exp" type="number" min="0" placeholder="5" value={newAppYearsExp}
                        onChange={e => setNewAppYearsExp(e.target.value)} data-testid="input-years-exp" />
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/40 rounded-lg p-3">
                  <Shield className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>We will never request your login credentials to any employer portal. We prepare materials — you submit.</span>
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  disabled={!newAppJobTitle || !newAppCompany || !newAppUrl || !newAppCountry || createApplicationMutation.isPending}
                  onClick={() => {
                    const packToUse = newAppPackId || activePack.id;
                    createApplicationMutation.mutate({
                      userPackId: packToUse,
                      jobTitle: newAppJobTitle,
                      companyName: newAppCompany,
                      jobUrl: newAppUrl,
                      targetCountry: newAppCountry,
                      applicationDeadline: newAppDeadline || null,
                      jobDescription: newAppDescription || null,
                      intakeData: {
                        currentRole: newAppCurrentRole,
                        yearsExperience: newAppYearsExp,
                      },
                    });
                  }}
                  data-testid="button-submit-application"
                >
                  {createApplicationMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Submitting…</>
                  ) : (
                    <>Submit Application Request <ArrowRight className="h-4 w-4 ml-2" /></>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
        </main>
      )}

      {/* ═══ APPLICATION DETAIL VIEW ═══ */}
      {matchDetail && (
        <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <Button
            variant="ghost" size="sm"
            className="gap-2 text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/assisted-apply")}
            data-testid="button-back-to-list"
          >
            <ArrowLeft className="h-4 w-4" /> My Applications
          </Button>

          {detailLoading ? (
            <Card><CardContent className="py-8"><div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-6 bg-muted animate-pulse rounded" />)}</div></CardContent></Card>
          ) : !applicationDetail ? (
            <Card><CardContent className="py-12 text-center">
              <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Application not found.</p>
            </CardContent></Card>
          ) : (() => {
            const cfg = APPLICATION_STATUS_CONFIG[applicationDetail.status] || APPLICATION_STATUS_CONFIG.submitted;
            const StatusIcon = cfg.icon;
            const mats = applicationDetail.preparedMaterials as any || {};
            const hasMaterials = !!(mats.cvUrl || mats.coverLetterUrl || mats.sopUrl);
            const history: any[] = applicationDetail.statusHistory || [];

            return (
              <>
                {/* Status hero */}
                <Card>
                  <CardContent className="py-6">
                    <div className="flex items-start gap-4">
                      <div className={`h-14 w-14 rounded-2xl ${cfg.color} flex items-center justify-center flex-shrink-0`}>
                        <StatusIcon className="h-7 w-7 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h2 className="text-xl font-bold truncate">{applicationDetail.jobTitle}</h2>
                        <p className="text-muted-foreground">{applicationDetail.companyName}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <Badge className={`${cfg.color} text-white`}>{cfg.label}</Badge>
                          <Badge variant="outline">{applicationDetail.targetCountry}</Badge>
                          {applicationDetail.applicationDeadline && (
                            <Badge variant="outline" className="gap-1">
                              <CalendarDays className="h-3 w-3" />
                              Deadline: {new Date(applicationDetail.applicationDeadline).toLocaleDateString()}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-2">{cfg.description}</p>
                        {applicationDetail.statusMessage && (
                          <p className="text-sm mt-1 text-foreground">{applicationDetail.statusMessage}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Prepared Materials */}
                {hasMaterials && (
                  <Card className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-green-800 dark:text-green-300 flex items-center gap-2">
                        <FileCheck className="h-5 w-5" />
                        Your Materials Are Ready
                      </CardTitle>
                      <CardDescription className="text-green-700 dark:text-green-400">
                        Review and download your prepared application materials below.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {mats.cvUrl && (
                        <a href={mats.cvUrl} target="_blank" rel="noopener noreferrer"
                           className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-green-900/30 border border-green-200 dark:border-green-700 hover:shadow-sm transition-shadow group">
                          <div className="flex items-center gap-3">
                            <FileText className="h-5 w-5 text-green-600" />
                            <div>
                              <p className="font-medium text-sm">CV / Resume</p>
                              <p className="text-xs text-muted-foreground">Tailored for {applicationDetail.jobTitle}</p>
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" className="gap-1" data-testid="button-download-cv">
                            <Download className="h-4 w-4" /> Open
                          </Button>
                        </a>
                      )}
                      {mats.coverLetterUrl && (
                        <a href={mats.coverLetterUrl} target="_blank" rel="noopener noreferrer"
                           className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-green-900/30 border border-green-200 dark:border-green-700 hover:shadow-sm transition-shadow group">
                          <div className="flex items-center gap-3">
                            <Send className="h-5 w-5 text-green-600" />
                            <div>
                              <p className="font-medium text-sm">Cover Letter</p>
                              <p className="text-xs text-muted-foreground">Personalized for {applicationDetail.companyName}</p>
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" className="gap-1" data-testid="button-download-cover-letter">
                            <Download className="h-4 w-4" /> Open
                          </Button>
                        </a>
                      )}
                      {mats.sopUrl && (
                        <a href={mats.sopUrl} target="_blank" rel="noopener noreferrer"
                           className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-green-900/30 border border-green-200 dark:border-green-700 hover:shadow-sm transition-shadow group">
                          <div className="flex items-center gap-3">
                            <GraduationCap className="h-5 w-5 text-green-600" />
                            <div>
                              <p className="font-medium text-sm">Statement of Purpose / Motivation Letter</p>
                              <p className="text-xs text-muted-foreground">University application support</p>
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" className="gap-1" data-testid="button-download-sop">
                            <Download className="h-4 w-4" /> Open
                          </Button>
                        </a>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Interview Preparation */}
                {hasMaterials && Array.isArray(mats.tailoredAnswers) && mats.tailoredAnswers.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <MessageSquare className="h-5 w-5 text-primary" />
                        Interview Preparation
                      </CardTitle>
                      <CardDescription>
                        AI-tailored answers to likely interview questions for this specific role.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Accordion type="single" collapsible className="space-y-2">
                        {mats.tailoredAnswers.map((item: any, idx: number) => (
                          <AccordionItem
                            key={idx}
                            value={`q-${idx}`}
                            className="border rounded-lg px-4"
                            data-testid={`accordion-interview-q-${idx}`}
                          >
                            <AccordionTrigger className="text-sm font-medium text-left hover:no-underline py-3">
                              {item.question}
                            </AccordionTrigger>
                            <AccordionContent className="text-sm text-muted-foreground pb-3 leading-relaxed">
                              {item.answer}
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    </CardContent>
                  </Card>
                )}

                {/* CV Optimisation Tips */}
                {hasMaterials && Array.isArray(mats.cvSuggestions) && mats.cvSuggestions.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Lightbulb className="h-5 w-5 text-amber-500" />
                        CV Optimisation Tips
                      </CardTitle>
                      <CardDescription>
                        Specific improvements to make your CV stronger for this application.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2" data-testid="list-cv-suggestions">
                        {mats.cvSuggestions.map((tip: string, idx: number) => (
                          <li
                            key={idx}
                            className="flex items-start gap-2 text-sm"
                            data-testid={`item-cv-suggestion-${idx}`}
                          >
                            <span className="flex-shrink-0 h-5 w-5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 flex items-center justify-center text-xs font-bold mt-0.5">
                              {idx + 1}
                            </span>
                            <span className="text-muted-foreground leading-relaxed">{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {/* Mark as Submitted CTA */}
                {(applicationDetail.status === "materials_ready" || applicationDetail.status === "user_action_required") && hasMaterials && (
                  <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="py-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <h3 className="font-semibold">Ready to Submit?</h3>
                          <p className="text-sm text-muted-foreground mt-1">
                            Download your materials above, then submit your application through the employer's portal.
                            Click the button once you've submitted.
                          </p>
                        </div>
                        <Button
                          className="gap-2 shrink-0"
                          onClick={() => markSubmittedMutation.mutate(applicationDetail.id)}
                          disabled={markSubmittedMutation.isPending}
                          data-testid="button-mark-submitted"
                        >
                          {markSubmittedMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CircleCheck className="h-4 w-4" />
                          )}
                          I Have Submitted
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {applicationDetail.status === "applied" && (
                  <Card className="border-purple-200 bg-purple-50 dark:bg-purple-950/20 dark:border-purple-800">
                    <CardContent className="py-5 flex items-center gap-3">
                      <CheckCircle2 className="h-6 w-6 text-purple-600 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-purple-800 dark:text-purple-300">Application submitted by you</p>
                        {applicationDetail.userAppliedAt && (
                          <p className="text-sm text-purple-700 dark:text-purple-400">
                            Submitted on {new Date(applicationDetail.userAppliedAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Job Details */}
                <Card>
                  <CardHeader className="pb-3"><CardTitle className="text-base">Job Details</CardTitle></CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex gap-2 items-start">
                      <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <span>{applicationDetail.companyName}</span>
                    </div>
                    <div className="flex gap-2 items-start">
                      <Globe className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <span>{applicationDetail.targetCountry}</span>
                    </div>
                    {applicationDetail.jobUrl && (
                      <div className="flex gap-2 items-start">
                        <ExternalLink className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <a href={applicationDetail.jobUrl} target="_blank" rel="noopener noreferrer"
                           className="text-primary hover:underline truncate">{applicationDetail.jobUrl}</a>
                      </div>
                    )}
                    {applicationDetail.applicationDeadline && (
                      <div className="flex gap-2 items-start">
                        <CalendarDays className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <span>Deadline: {new Date(applicationDetail.applicationDeadline).toLocaleDateString()}</span>
                      </div>
                    )}
                    {applicationDetail.jobDescription && (
                      <div className="pt-2 border-t">
                        <p className="text-muted-foreground mb-1">Job Description</p>
                        <p className="whitespace-pre-line text-xs">{applicationDetail.jobDescription}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Status History Timeline */}
                {history.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3"><CardTitle className="text-base">Timeline</CardTitle></CardHeader>
                    <CardContent>
                      <div className="relative space-y-4">
                        {history.map((item, idx) => {
                          const isLast = idx === history.length - 1;
                          const hCfg = APPLICATION_STATUS_CONFIG[item.newStatus] || APPLICATION_STATUS_CONFIG.submitted;
                          const HIcon = hCfg.icon;
                          return (
                            <div key={item.id} className="flex gap-3">
                              <div className="flex flex-col items-center">
                                <div className={`h-8 w-8 rounded-full ${hCfg.color} flex items-center justify-center flex-shrink-0`}>
                                  <HIcon className="h-4 w-4 text-white" />
                                </div>
                                {!isLast && <div className="w-0.5 flex-1 bg-border mt-1" />}
                              </div>
                              <div className="pb-4 pt-0.5 min-w-0">
                                <p className="font-medium text-sm">{hCfg.label}</p>
                                {item.message && <p className="text-xs text-muted-foreground mt-0.5">{item.message}</p>}
                                <p className="text-xs text-muted-foreground mt-1">
                                  {new Date(item.createdAt).toLocaleString()}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            );
          })()}
        </main>
      )}

      {/* PURCHASE FLOW */}
      {!matchNew && !matchDetail && matchPurchase && selectedPack && (
        <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Back arrow button */}
          <Button 
            variant="ghost" 
            size="sm" 
            className="mb-4 gap-2 text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/assisted-apply")}
            data-testid="button-back-to-packs"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to packs
          </Button>
          
          <Card className="overflow-hidden">
            <div className={`p-6 ${selectedPack.packType === 'student' ? 'bg-purple-600' : 'bg-primary'} text-white`}>
              <div className="flex items-center gap-2 mb-2">
                {selectedPack.packType === 'student' ? (
                  <GraduationCap className="h-6 w-6" />
                ) : (
                  <Briefcase className="h-6 w-6" />
                )}
                <span className="text-sm opacity-90">{selectedPack.packType === 'student' ? 'Student Pack' : 'Job Pack'}</span>
              </div>
              <h2 className="text-2xl font-bold">{selectedPack.name}</h2>
              <p className="opacity-90">{selectedPack.description}</p>
            </div>
            
            <CardContent className="p-6 space-y-6">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold">{formatPrice(selectedPack.price)}</span>
                <span className="text-muted-foreground">one-time</span>
              </div>
              
              {selectedPack.successRate && (
                <Badge variant="secondary" className="gap-1">
                  <Star className="h-3 w-3" />
                  {selectedPack.successRate}
                </Badge>
              )}
              
              <div className="space-y-3">
                <h3 className="font-semibold">What's Included:</h3>
                <ul className="space-y-2">
                  {(selectedPack.features as string[]).map((feature: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
              
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                <Clock className="h-4 w-4" />
                <span>{selectedPack.turnaroundDays}-day turnaround per application</span>
              </div>
              
              <div className="border-t pt-4 space-y-3">
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Shield className="h-4 w-4 mt-0.5 text-green-500" />
                  <span>30-day validity from purchase. Unused applications don't expire within this period.</span>
                </div>
              </div>
            </CardContent>
            
            <CardFooter className="flex flex-col gap-4 p-6 bg-muted/30">
              {!user ? (
                <div className="w-full text-center">
                  <p className="text-sm text-muted-foreground mb-3">Please log in to purchase this pack</p>
                  <Link href="/" className="w-full">
                    <Button className="w-full" data-testid="button-login-to-purchase">
                      Log In to Purchase
                    </Button>
                  </Link>
                </div>
              ) : paymentStep === "awaiting_mpesa" ? (
                <div className="w-full text-center py-6 space-y-4">
                  <div className="relative mx-auto w-16 h-16">
                    <Loader2 className="h-16 w-16 animate-spin text-primary" />
                    <Smartphone className="h-6 w-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Check Your Phone</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      An M-Pesa payment prompt has been sent to <strong>{phoneNumber}</strong>.
                      Enter your PIN to complete payment.
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This page will update automatically once payment is confirmed.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { stopPolling(); setPaymentStep("select"); }}
                    data-testid="button-cancel-awaiting"
                  >
                    Cancel
                  </Button>
                </div>
              ) : paymentStep === "success" ? (
                <div className="w-full text-center py-6 space-y-4">
                  <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                    <CheckCircle2 className="h-8 w-8 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg text-green-600">Payment Successful!</h3>
                    <p className="text-sm text-muted-foreground mt-1">Redirecting to your applications...</p>
                  </div>
                </div>
              ) : (
                <div className="w-full space-y-4">
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Select Payment Method</Label>
                    <div className="flex items-center gap-3 p-4 rounded-lg border-2 border-primary bg-primary/5">
                        <Smartphone className="h-6 w-6 text-primary" />
                        <div>
                          <span className="text-sm font-medium">M-Pesa</span>
                          <p className="text-xs text-muted-foreground">Paybill 4153025 · STK Push to your phone</p>
                        </div>
                      </div>
                  </div>
                  
                  {paymentMethod === "mpesa" && (
                    <div className="space-y-2">
                      <Label htmlFor="phone">M-Pesa Phone Number</Label>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="0712345678"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(formatPhone(e.target.value))}
                        data-testid="input-phone-number"
                      />
                      <p className="text-xs text-muted-foreground">
                        You'll receive a payment prompt on this number
                      </p>
                    </div>
                  )}
                  
                  <Button 
                    className="w-full" 
                    size="lg"
                    onClick={handlePurchase}
                    disabled={purchaseMutation.isPending || phoneNumber.length < 9}
                    data-testid="button-confirm-purchase"
                  >
                    {purchaseMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" />Processing…</>
                    ) : (
                      <>Pay {formatPrice(selectedPack.price)} via M-Pesa <ArrowRight className="h-4 w-4 ml-2" /></>
                    )}
                  </Button>
                </div>
              )}
              {paymentStep === "select" && (
                <Link href="/assisted-apply" className="w-full">
                  <Button variant="ghost" className="w-full" data-testid="button-cancel-purchase">
                    Cancel
                  </Button>
                </Link>
              )}
            </CardFooter>
          </Card>
          
          <div className="mt-6 text-center text-sm text-muted-foreground">
            <p className="flex items-center justify-center gap-1">
              <Shield className="h-4 w-4" />
              Secure payment. Your information is protected.
            </p>
          </div>
        </main>
      )}

      {/* MAIN CONTENT (only show when not in other flows) */}
      {!matchNew && !matchDetail && !matchPurchase && (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="packages" data-testid="tab-packages">Packages</TabsTrigger>
            <TabsTrigger value="my-applications" data-testid="tab-applications">My Applications</TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-8">
            {/* Hero Section */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-primary/80 text-primary-foreground p-8 lg:p-12">
              <div className="relative z-10">
                <Badge className="mb-4 bg-white/20 text-white hover:bg-white/30">
                  <Sparkles className="h-3 w-3 mr-1" />
                  Professional Application Support
                </Badge>
                <h1 className="text-3xl lg:text-4xl font-bold mb-4">
                  We Prepare, You Apply
                </h1>
                <p className="text-lg text-primary-foreground/90 max-w-2xl mb-6">
                  Get professionally crafted CVs and cover letters tailored to each job. 
                  Then you submit them yourself through official employer portals.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button 
                    size="lg" 
                    variant="secondary"
                    onClick={() => setActiveTab("packages")}
                    data-testid="button-view-packages"
                  >
                    View Packages
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                  <Button 
                    size="lg" 
                    variant="outline" 
                    className="bg-transparent border-white/30 text-white hover:bg-white/10"
                  >
                    <HelpCircle className="h-4 w-4 mr-2" />
                    How It Works
                  </Button>
                </div>
              </div>
              <div className="absolute right-0 top-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="absolute left-0 bottom-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
            </div>

            {/* IMPORTANT: Why You Submit */}
            <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
                    <Shield className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <CardTitle className="text-amber-900 dark:text-amber-100">
                      Why You Submit Applications Yourself
                    </CardTitle>
                    <CardDescription className="text-amber-700 dark:text-amber-300 mt-1">
                      Important information about our service
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-amber-800 dark:text-amber-200">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="flex gap-3">
                    <CheckCircle2 className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Legal Compliance</p>
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        Only YOU can legally submit job applications on your behalf. 
                        Employers require direct applications from candidates.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <CheckCircle2 className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Employer Verification</p>
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        Employers verify that the person applying is the actual candidate. 
                        Third-party submissions are often rejected.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <CheckCircle2 className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Account Security</p>
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        We never ask for your login credentials to job portals. 
                        Your accounts and personal data remain secure.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <CheckCircle2 className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Your Success</p>
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        You maintain control of the process and can track your applications 
                        through each employer's official system.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="pt-4 border-t border-amber-200 dark:border-amber-800">
                  <p className="text-sm font-medium">
                    We prepare professional, job-specific application materials. You submit them through the employer's official application portal.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* How It Works */}
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold mb-2">How Assisted Apply Works</h2>
                <p className="text-muted-foreground">Three simple steps to professional job applications</p>
              </div>

              {(() => {
                const steps = [
                  {
                    step: 1, emoji: "📋",
                    title: "Share Job Details",
                    line1: "Tell us the URL",
                    line2: "and role",
                  },
                  {
                    step: 2, emoji: "✍️",
                    title: "We Prepare Materials",
                    line1: "We craft tailored CV",
                    line2: "& cover letter",
                  },
                  {
                    step: 3, emoji: "✅",
                    title: "You Submit",
                    line1: "You apply via",
                    line2: "employer portal",
                  },
                ];

                return (
                  <>
                    {/* ── Desktop: bracket connector ─────────────────────── */}
                    <div className="hidden md:block">
                      {/* Step row */}
                      <div className="grid grid-cols-3">
                        {steps.map((s) => (
                          <div key={s.step} className="flex flex-col items-center text-center px-6">
                            {/* Number + title inline */}
                            <div className="flex items-center gap-2 mb-5 justify-center">
                              <div className="w-8 h-8 rounded-full bg-[#0A66C2] text-white text-sm font-bold flex items-center justify-center flex-shrink-0 shadow-md">
                                {s.step}
                              </div>
                              <span className="font-semibold text-sm text-left leading-tight">{s.title}</span>
                            </div>
                            {/* Emoji icon */}
                            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-3 text-3xl shadow-sm">
                              {s.emoji}
                            </div>
                            {/* Description */}
                            <p className="text-sm text-muted-foreground leading-snug">
                              {s.line1}<br />{s.line2}
                            </p>
                            {/* Vertical stem → connects to bracket */}
                            <div className="mt-5 w-px bg-blue-300 dark:bg-blue-700" style={{ height: "36px" }} />
                          </div>
                        ))}
                      </div>
                      {/* Bottom bracket └──┴──┘ */}
                      <div
                        className="mx-auto border-l-2 border-b-2 border-r-2 border-blue-300 dark:border-blue-700 rounded-b-xl"
                        style={{ width: "66.7%", height: "16px" }}
                      />
                    </div>

                    {/* ── Mobile: vertical connector ─────────────────────── */}
                    <div className="md:hidden space-y-0">
                      {steps.map((s, idx) => (
                        <div key={s.step} className="flex gap-4">
                          <div className="flex flex-col items-center">
                            <div className="w-9 h-9 rounded-full bg-[#0A66C2] text-white flex items-center justify-center font-bold text-sm flex-shrink-0 shadow">
                              {s.step}
                            </div>
                            {idx < steps.length - 1 && (
                              <div className="w-px bg-blue-200 dark:bg-blue-800 flex-1 mt-1" style={{ minHeight: "32px" }} />
                            )}
                          </div>
                          <div className="pb-5">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xl">{s.emoji}</span>
                              <h3 className="font-semibold text-sm">{s.title}</h3>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {s.line1} {s.line2}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Benefits */}
            <div className="grid md:grid-cols-3 gap-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="h-12 w-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                    <Zap className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                  <h3 className="font-semibold mb-2">Save Time</h3>
                  <p className="text-sm text-muted-foreground">
                    Skip hours of CV customization. We tailor your materials to each specific job in 24-48 hours.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="h-12 w-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4">
                    <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h3 className="font-semibold mb-2">Expert Help</h3>
                  <p className="text-sm text-muted-foreground">
                    Career specialists who understand international job markets craft your applications.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="h-12 w-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-4">
                    <Bell className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                  </div>
                  <h3 className="font-semibold mb-2">Track Everything</h3>
                  <p className="text-sm text-muted-foreground">
                    Get real-time updates on preparation status and notifications when materials are ready.
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* CTA */}
            <Card className="bg-gradient-to-r from-primary/5 to-accent/5 border-primary/20">
              <CardContent className="py-8 text-center">
                <h2 className="text-2xl font-bold mb-3">Ready to Get Started?</h2>
                <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
                  Choose an application pack that fits your job search goals and start receiving professionally prepared materials.
                </p>
                <Button size="lg" onClick={() => setActiveTab("packages")} data-testid="button-get-started">
                  View Application Packs
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* PACKAGES TAB */}
          <TabsContent value="packages" className="space-y-8">
            {/* Trust Indicators */}
            <div className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span>Professional application support</span>
              </div>
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-yellow-500" />
                <span>Expert career guidance</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-blue-500" />
                <span>Quality-assured service</span>
              </div>
            </div>

            {/* Job Application Packs — Comparison Table */}
            <div className="space-y-6">
              <div className="text-center">
                <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full mb-4">
                  <Briefcase className="h-4 w-4" />
                  <span className="font-medium">For Job Seekers</span>
                </div>
                <h2 className="text-2xl font-bold mb-2">Job Application Packs</h2>
                <p className="text-muted-foreground max-w-xl mx-auto">
                  Land your dream overseas job with professionally crafted applications.
                  Our experts optimize every CV and cover letter for maximum impact.
                </p>
              </div>

              {packsLoading ? (
                <div className="grid md:grid-cols-3 gap-6">
                  {[1, 2, 3].map((i) => (
                    <Card key={i} className="animate-pulse"><CardContent className="h-80" /></Card>
                  ))}
                </div>
              ) : (() => {
                const jobPacks = (packs ?? []).filter((p: any) => !p.packType || p.packType === 'job')
                  .sort((a: any, b: any) => (a.order ?? 99) - (b.order ?? 99))
                  .slice(0, 3);

                // Feature comparison rows — [label, starter, pro, premium]
                type FeatureRow = { label: string; values: (string | boolean)[] };
                const featureRows: FeatureRow[] = [
                  {
                    label: "Tailored applications",
                    values: jobPacks.map((p: any) => `${p.applicationCount} tailored`),
                  },
                  { label: "Custom CV per application", values: [true, true, true] },
                  { label: "Personalised cover letter",  values: [true, true, true] },
                  { label: "ATS-optimised formatting",   values: [true, true, true] },
                  {
                    label: "Priority turnaround",
                    values: jobPacks.map((p: any) =>
                      p.turnaroundDays === 1 ? "24-hour" :
                      p.turnaroundDays === 2 ? "2-day"   : false
                    ),
                  },
                  {
                    label: "Unlimited revisions",
                    values: jobPacks.map((p: any) =>
                      Array.isArray(p.features) && p.features.some((f: string) => f.toLowerCase().includes("unlimited"))
                    ),
                  },
                ];

                const Check = () => (
                  <CircleCheck className="h-5 w-5 text-green-500 mx-auto" aria-label="Included" />
                );
                const Cross = () => (
                  <span className="inline-flex items-center justify-center w-5 h-5 mx-auto" aria-label="Not included">
                    <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4 text-muted-foreground/40">
                      <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </span>
                );

                return (
                  <div className="overflow-x-auto">
                    <div className="min-w-[560px]">
                      {/* Column headers */}
                      <div className="grid grid-cols-4 gap-0 mb-1">
                        <div /> {/* feature label column */}
                        {jobPacks.map((pack: any) => (
                          <div
                            key={pack.id}
                            className={`relative rounded-t-2xl px-4 pt-6 pb-4 text-center
                              ${pack.isPopular
                                ? "bg-primary text-primary-foreground shadow-lg"
                                : "bg-muted/50 dark:bg-muted/30"
                              }`}
                          >
                            {pack.isPopular && (
                              <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
                                <Badge className="bg-amber-400 text-amber-900 shadow font-semibold text-xs px-2 py-0.5">
                                  <Star className="h-3 w-3 mr-1 inline" />
                                  Most Popular
                                </Badge>
                              </div>
                            )}
                            <p className={`text-xs font-semibold uppercase tracking-widest mb-1 ${pack.isPopular ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                              {pack.name.replace(" Pack", "")}
                            </p>
                            <p className={`text-2xl font-bold ${pack.isPopular ? "text-primary-foreground" : ""}`}>
                              {formatPrice(pack.price)}
                            </p>
                            <p className={`text-xs mt-0.5 ${pack.isPopular ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                              {pack.applicationCount} application{pack.applicationCount !== 1 ? "s" : ""}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* Feature rows */}
                      <div className="border rounded-b-2xl overflow-hidden divide-y dark:divide-border">
                        {featureRows.map((row, rowIdx) => (
                          <div
                            key={rowIdx}
                            className={`grid grid-cols-4 gap-0 items-center
                              ${rowIdx % 2 === 0 ? "bg-background" : "bg-muted/30 dark:bg-muted/10"}`}
                          >
                            <div className="px-4 py-3 text-sm text-muted-foreground font-medium">
                              {row.label}
                            </div>
                            {row.values.map((val, colIdx) => {
                              const isPop = jobPacks[colIdx]?.isPopular;
                              return (
                                <div
                                  key={colIdx}
                                  className={`py-3 text-center text-sm font-medium ${isPop ? "bg-primary/5 dark:bg-primary/10" : ""}`}
                                >
                                  {val === true  ? <Check /> :
                                   val === false ? <Cross /> :
                                   <span className="text-foreground">{val as string}</span>}
                                </div>
                              );
                            })}
                          </div>
                        ))}

                        {/* CTA row */}
                        <div className="grid grid-cols-4 gap-0 bg-background items-center">
                          <div />
                          {jobPacks.map((pack: any) => (
                            <div key={pack.id} className={`px-3 py-4 ${pack.isPopular ? "bg-primary/5 dark:bg-primary/10" : ""}`}>
                              <Link href={`/assisted-apply/purchase/${pack.id}`} className="block">
                                <Button
                                  className="w-full"
                                  variant={pack.isPopular ? "default" : "outline"}
                                  data-testid={`button-select-pack-${pack.id}`}
                                >
                                  Get Started
                                </Button>
                              </Link>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Student Application Packs */}
            <div className="space-y-6 pt-8 border-t">
              <div className="text-center">
                <div className="inline-flex items-center gap-2 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 px-4 py-2 rounded-full mb-4">
                  <GraduationCap className="h-4 w-4" />
                  <span className="font-medium">For Students</span>
                </div>
                <h2 className="text-2xl font-bold mb-2">University Application Packs</h2>
                <p className="text-muted-foreground max-w-xl mx-auto">
                  Get accepted to your dream university abroad. We craft compelling SOPs, 
                  motivation letters, and application materials that stand out.
                </p>
              </div>

              {packsLoading ? (
                <div className="grid md:grid-cols-3 gap-6">
                  {[1, 2, 3].map((i) => (
                    <Card key={i} className="animate-pulse">
                      <CardContent className="h-80" />
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="grid md:grid-cols-3 gap-6">
                  {packs?.filter((p: any) => p.packType === 'student').map((pack: any) => (
                    <Card 
                      key={pack.id} 
                      className={`relative flex flex-col ${pack.isPopular ? "border-purple-500 shadow-lg ring-2 ring-purple-200 dark:ring-purple-800" : ""}`}
                    >
                      {pack.isPopular && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                          <Badge className="bg-purple-600 shadow-lg">
                            <Star className="h-3 w-3 mr-1" />
                            Best Value
                          </Badge>
                        </div>
                      )}
                      <CardHeader className="text-center pb-4">
                        <CardTitle className="text-xl">{pack.name}</CardTitle>
                        <CardDescription>{pack.description}</CardDescription>
                        {pack.successRate && (
                          <Badge variant="secondary" className="mt-2 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                            {pack.successRate}
                          </Badge>
                        )}
                      </CardHeader>
                      <CardContent className="flex-1 space-y-6">
                        <div className="text-center">
                          <span className="text-4xl font-bold">{formatPrice(pack.price)}</span>
                          <p className="text-sm text-muted-foreground mt-1">
                            {pack.applicationCount} application{pack.applicationCount !== 1 ? "s" : ""} included
                          </p>
                          {pack.targetAudience && (
                            <p className="text-xs text-purple-600 dark:text-purple-400 mt-2">{pack.targetAudience}</p>
                          )}
                        </div>
                        
                        <div className="space-y-3">
                          {Array.isArray(pack.features) && pack.features.slice(0, 6).map((feature: string, idx: number) => (
                            <div key={idx} className="flex items-start gap-2 text-sm">
                              <CheckCircle2 className="h-4 w-4 text-purple-500 flex-shrink-0 mt-0.5" />
                              <span>{feature}</span>
                            </div>
                          ))}
                          {Array.isArray(pack.features) && pack.features.length > 6 && (
                            <p className="text-xs text-muted-foreground pl-6">+ {pack.features.length - 6} more benefits</p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span>{pack.turnaroundDays}-day turnaround per application</span>
                        </div>
                      </CardContent>
                      <CardFooter>
                        <Link href={`/assisted-apply/purchase/${pack.id}`} className="w-full">
                          <Button 
                            className="w-full" 
                            variant={pack.isPopular ? "default" : "outline"}
                            data-testid={`button-select-pack-${pack.id}`}
                          >
                            Get Started
                            <ArrowRight className="h-4 w-4 ml-1" />
                          </Button>
                        </Link>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* What's Included */}
            <Card>
              <CardHeader>
                <CardTitle>What's Included in Every Pack</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-4">
                  {[
                    "Tailored CV for each specific job posting",
                    "Custom cover letter matching job requirements",
                    "ATS-optimized formatting",
                    "Keyword optimization for applicant tracking systems",
                    "Unlimited revisions within turnaround period",
                    "Real-time status tracking",
                    "Email notifications when materials are ready",
                    "30-day validity on purchased packs",
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* FAQ */}
            <Card>
              <CardHeader>
                <CardTitle>Frequently Asked Questions</CardTitle>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="item-1">
                    <AccordionTrigger>How quickly will my materials be ready?</AccordionTrigger>
                    <AccordionContent>
                      Turnaround time depends on your chosen pack. Starter packs have 3-day turnaround, 
                      Pro packs have 2-day turnaround, and Premium packs include priority 24-hour service.
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-2">
                    <AccordionTrigger>Why can't you submit applications for me?</AccordionTrigger>
                    <AccordionContent>
                      Employers require candidates to submit their own applications. This verifies your identity, 
                      ensures you understand the role, and complies with employment laws. We prepare everything - 
                      you just need to click submit on the employer's portal.
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-3">
                    <AccordionTrigger>What if I'm not happy with the materials?</AccordionTrigger>
                    <AccordionContent>
                      We offer unlimited revisions within your turnaround period. Share your feedback and 
                      we'll update the materials until you're satisfied before your application deadline.
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-4">
                    <AccordionTrigger>How long is my pack valid?</AccordionTrigger>
                    <AccordionContent>
                      All packs are valid for 30 days from purchase. This gives you time to identify 
                      suitable jobs and use all your included applications.
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          </TabsContent>

          {/* MY APPLICATIONS TAB */}
          <TabsContent value="my-applications" className="space-y-6">
            {!user ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Login to Track Applications</h3>
                  <p className="text-muted-foreground mb-4">
                    Sign in to view and manage your job applications.
                  </p>
                  <Button onClick={() => navigate("/")}>
                    Login
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Active Pack Status */}
                {activePack ? (
                  <Card className="bg-gradient-to-r from-primary/5 to-accent/5">
                    <CardContent className="py-6">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <h3 className="font-semibold">{activePack.packName}</h3>
                          <p className="text-sm text-muted-foreground">
                            {remainingApplications} of {activePack.totalApplications} applications remaining
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex-1 md:w-48">
                            <Progress 
                              value={(activePack.usedApplications / activePack.totalApplications) * 100} 
                              className="h-2"
                            />
                          </div>
                          <Link href="/assisted-apply/new">
                            <Button size="sm" data-testid="button-new-application">
                              <Target className="h-4 w-4 mr-2" />
                              New Application
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No Active Pack</h3>
                      <p className="text-muted-foreground mb-4">
                        Purchase an application pack to start using Assisted Apply.
                      </p>
                      <Button onClick={() => setActiveTab("packages")}>
                        View Packages
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* Applications List */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Your Applications</h3>
                  
                  {applications && applications.length > 0 ? (
                    <div className="space-y-4">
                      {applications.map((app) => {
                        const statusConfig = APPLICATION_STATUS_CONFIG[app.status] || APPLICATION_STATUS_CONFIG.submitted;
                        const StatusIcon = statusConfig.icon;
                        
                        const PIPELINE_STATUSES = ["queued", "analyzing", "generating", "preparing"];
                        const isGenerating = generatingIds.has(app.id) || PIPELINE_STATUSES.includes(app.status);
                        const hasMaterials = app.status === "materials_ready" || app.status === "downloaded";
                        const isFailed = app.status === "failed";

                        return (
                          <Card key={app.id} data-testid={`card-application-${app.id}`} className="hover-elevate">
                            <CardContent className="py-4 space-y-3">
                              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex items-start gap-4">
                                  <div className={`h-10 w-10 rounded-full ${statusConfig.color} flex items-center justify-center flex-shrink-0`}>
                                    <StatusIcon className={`h-5 w-5 text-white ${isGenerating ? "animate-spin" : ""}`} />
                                  </div>
                                  <div>
                                    <h4 className="font-semibold">{app.jobTitle}</h4>
                                    <p className="text-sm text-muted-foreground">{app.companyName}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <Badge variant="outline" className="text-xs">
                                        {app.targetCountry}
                                      </Badge>
                                      <span className="text-xs text-muted-foreground">
                                        {statusConfig.description}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 flex-wrap justify-end">
                                  <Badge className={statusConfig.color}>
                                    {statusConfig.label}
                                  </Badge>
                                  <Link href={`/assisted-apply/application/${app.id}`}>
                                    <Button variant="ghost" size="sm" data-testid={`button-view-${app.id}`}>
                                      View
                                      <ChevronRight className="h-4 w-4 ml-1" />
                                    </Button>
                                  </Link>
                                </div>
                              </div>

                              {/* Pipeline progress animation */}
                              {isGenerating && (
                                <div className="rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-3">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Loader2 className="h-4 w-4 animate-spin text-yellow-600" />
                                    <span className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                                      {statusConfig.description}
                                    </span>
                                  </div>
                                  <div className="h-1.5 w-full rounded-full bg-yellow-200 dark:bg-yellow-800 overflow-hidden">
                                    <div className={`h-full rounded-full bg-yellow-500 animate-pulse ${
                                      app.status === "queued"     ? "w-1/6" :
                                      app.status === "analyzing"  ? "w-1/3" :
                                      app.status === "generating" ? "w-2/3" :
                                      "w-5/6"
                                    }`} />
                                  </div>
                                  <div className="flex justify-between text-xs text-yellow-700 dark:text-yellow-400 mt-1">
                                    <span>Queued</span><span>Analyzing</span><span>Generating</span><span>Ready</span>
                                  </div>
                                </div>
                              )}

                              {/* Failed state — retry button */}
                              {isFailed && (
                                <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 flex items-center justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-medium text-red-800 dark:text-red-300">Generation failed</p>
                                    <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">An error occurred. Click retry to try again.</p>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    data-testid={`button-retry-${app.id}`}
                                    onClick={() => retryMutation.mutate(app.id)}
                                    disabled={retryMutation.isPending}
                                  >
                                    Retry
                                  </Button>
                                </div>
                              )}

                              {/* Generate button — shown only for submitted applications */}
                              {!isGenerating && !hasMaterials && !isFailed && app.status === "submitted" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="w-full border-primary text-primary hover:bg-primary/5"
                                  data-testid={`button-generate-${app.id}`}
                                  onClick={() => generateMutation.mutate(app.id)}
                                  disabled={generateMutation.isPending}
                                >
                                  <Sparkles className="h-4 w-4 mr-2" />
                                  Generate CV &amp; Cover Letter
                                </Button>
                              )}

                              {/* Download buttons — shown when materials are ready */}
                              {hasMaterials && (
                                <div className="flex gap-2 flex-wrap">
                                  <a
                                    href={`/api/user-job-applications/${app.id}/download/cv`}
                                    download
                                    data-testid={`button-download-cv-${app.id}`}
                                  >
                                    <Button size="sm" className="gap-2">
                                      <Download className="h-4 w-4" />
                                      Download CV
                                    </Button>
                                  </a>
                                  <a
                                    href={`/api/user-job-applications/${app.id}/download/cover-letter`}
                                    download
                                    data-testid={`button-download-cl-${app.id}`}
                                  >
                                    <Button size="sm" variant="outline" className="gap-2">
                                      <FileText className="h-4 w-4" />
                                      Download Cover Letter
                                    </Button>
                                  </a>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  ) : (
                    <Card>
                      <CardContent className="py-8 text-center">
                        <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No Applications Yet</h3>
                        <p className="text-muted-foreground">
                          {activePack 
                            ? "Start by submitting a job you'd like to apply for."
                            : "Purchase an application pack to get started."}
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </main>
      )}
    </div>
  );
}
