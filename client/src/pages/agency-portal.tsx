import { useState, useEffect } from "react";
import { formatPhone } from "@/lib/phone";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { 
  Building2, 
  Shield, 
  Star, 
  Globe, 
  BarChart3, 
  CheckCircle, 
  ArrowLeft,
  Search,
  Clock,
  CreditCard,
  Eye,
  BadgeCheck,
  TrendingUp,
  LogIn,
  RefreshCw,
  Phone,
  Receipt,
  Loader2,
  AlertTriangle,
  CalendarPlus,
  Briefcase,
  Plus,
  Pencil,
  Trash2,
  MapPin,
  DollarSign,
  Plane,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { SPONSORSHIP_PACKAGES, INDIVIDUAL_ADDONS, ALL_ADDON_TYPES } from "@shared/sponsorship-packages";
import { useAuth } from "@/hooks/use-auth";

interface NeaAgency {
  id: string;
  agencyName: string;
  licenseNumber: string;
  email: string | null;
  website: string | null;
  issueDate: string;
  expiryDate: string;
  statusOverride: string | null;
  claimedByUserId: string | null;
  claimedAt: string | null;
}

interface AgencyAddOn {
  id: string;
  agencyId: string;
  addOnType: string;
  price: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

interface ClickStats {
  stats: { source: string; count: number }[];
  total: number;
}

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 0,
  }).format(price);
}

function isAddonActive(addon: AgencyAddOn): boolean {
  const now = new Date();
  const start = new Date(addon.startDate);
  const end = new Date(addon.endDate);
  return addon.isActive && start <= now && end >= now;
}

function getDaysRemaining(endDate: string): number {
  const end = new Date(endDate);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

interface AgencyJob {
  id: string;
  agencyId: string;
  title: string;
  country: string;
  salary: string | null;
  jobCategory: string | null;
  description: string | null;
  requirements: string | null;
  visaSponsorship: boolean;
  isFeatured: boolean;
  isActive: boolean;
  applyLink: string | null;
  applyEmail: string | null;
  applicationDeadline: string | null;
  viewCount: number;
  createdAt: string;
}

const BLANK_JOB = {
  title: "", country: "", salary: "", jobCategory: "", description: "",
  requirements: "", visaSponsorship: false, applyLink: "", applyEmail: "",
  applicationDeadline: "",
};

function MyJobsTab({ agencyId }: { agencyId: string }) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AgencyJob | null>(null);
  const [form, setForm] = useState({ ...BLANK_JOB });
  const [deleting, setDeleting] = useState<string | null>(null);

  const { data: jobs = [], isLoading } = useQuery<AgencyJob[]>({
    queryKey: ["/api/agency-portal/jobs"],
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => apiRequest("POST", "/api/agency-portal/jobs", data),
    onSuccess: () => {
      toast({ title: "Job posted", description: "Your job listing is now live." });
      setShowForm(false);
      setForm({ ...BLANK_JOB });
      queryClient.invalidateQueries({ queryKey: ["/api/agency-portal/jobs"] });
    },
    onError: () => toast({ title: "Error", description: "Failed to post job.", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof form }) =>
      apiRequest("PATCH", `/api/agency-portal/jobs/${id}`, data),
    onSuccess: () => {
      toast({ title: "Job updated" });
      setEditing(null);
      setShowForm(false);
      setForm({ ...BLANK_JOB });
      queryClient.invalidateQueries({ queryKey: ["/api/agency-portal/jobs"] });
    },
    onError: () => toast({ title: "Error", description: "Failed to update job.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/agency-portal/jobs/${id}`),
    onSuccess: () => {
      toast({ title: "Job removed" });
      setDeleting(null);
      queryClient.invalidateQueries({ queryKey: ["/api/agency-portal/jobs"] });
    },
    onError: () => toast({ title: "Error", description: "Failed to remove job.", variant: "destructive" }),
  });

  const openCreate = () => { setEditing(null); setForm({ ...BLANK_JOB }); setShowForm(true); };
  const openEdit = (job: AgencyJob) => {
    setEditing(job);
    setForm({
      title: job.title, country: job.country, salary: job.salary ?? "",
      jobCategory: job.jobCategory ?? "", description: job.description ?? "",
      requirements: job.requirements ?? "", visaSponsorship: job.visaSponsorship,
      applyLink: job.applyLink ?? "", applyEmail: job.applyEmail ?? "",
      applicationDeadline: job.applicationDeadline
        ? new Date(job.applicationDeadline).toISOString().split("T")[0]
        : "",
    });
    setShowForm(true);
  };
  const handleSubmit = () => {
    const payload = {
      ...form,
      applicationDeadline: form.applicationDeadline || null,
      salary: form.salary || null,
      jobCategory: form.jobCategory || null,
      applyLink: form.applyLink || null,
      applyEmail: form.applyEmail || null,
    };
    if (editing) updateMutation.mutate({ id: editing.id, data: payload as any });
    else createMutation.mutate(payload as any);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" /> My Job Listings
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Post overseas job vacancies. They appear on the public Agency Marketplace.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1.5" data-testid="btn-post-new-job">
          <Plus className="h-4 w-4" /> Post Job
        </Button>
      </div>

      {/* Form dialog */}
      {showForm && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-base">{editing ? "Edit Job Listing" : "New Job Listing"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Job Title *</Label>
                <Input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Registered Nurse"
                  data-testid="input-job-title"
                />
              </div>
              <div>
                <Label>Destination Country *</Label>
                <Input
                  value={form.country}
                  onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                  placeholder="e.g. Saudi Arabia"
                  data-testid="input-job-country"
                />
              </div>
              <div>
                <Label>Salary / Compensation</Label>
                <Input
                  value={form.salary}
                  onChange={e => setForm(f => ({ ...f, salary: e.target.value }))}
                  placeholder="e.g. SAR 4,500/month"
                  data-testid="input-job-salary"
                />
              </div>
              <div>
                <Label>Job Category</Label>
                <Input
                  value={form.jobCategory}
                  onChange={e => setForm(f => ({ ...f, jobCategory: e.target.value }))}
                  placeholder="e.g. Healthcare"
                  data-testid="input-job-category"
                />
              </div>
              <div>
                <Label>Apply Link (URL)</Label>
                <Input
                  value={form.applyLink}
                  onChange={e => setForm(f => ({ ...f, applyLink: e.target.value }))}
                  placeholder="https://..."
                  data-testid="input-job-apply-link"
                />
              </div>
              <div>
                <Label>Apply Email</Label>
                <Input
                  value={form.applyEmail}
                  onChange={e => setForm(f => ({ ...f, applyEmail: e.target.value }))}
                  placeholder="jobs@youragency.co.ke"
                  data-testid="input-job-apply-email"
                />
              </div>
              <div>
                <Label>Application Deadline</Label>
                <Input
                  type="date"
                  value={form.applicationDeadline}
                  onChange={e => setForm(f => ({ ...f, applicationDeadline: e.target.value }))}
                  data-testid="input-job-deadline"
                />
              </div>
              <div className="flex items-center gap-3 pt-5">
                <Switch
                  id="visa-sponsorship"
                  checked={form.visaSponsorship}
                  onCheckedChange={v => setForm(f => ({ ...f, visaSponsorship: v }))}
                  data-testid="switch-visa-sponsorship"
                />
                <Label htmlFor="visa-sponsorship" className="flex items-center gap-1.5 cursor-pointer">
                  <Plane className="h-4 w-4" /> Visa Sponsorship Included
                </Label>
              </div>
            </div>

            <div>
              <Label>Job Description</Label>
              <Textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Describe the role, responsibilities, and working conditions..."
                rows={4}
                data-testid="textarea-job-description"
              />
            </div>

            <div>
              <Label>Requirements</Label>
              <Textarea
                value={form.requirements}
                onChange={e => setForm(f => ({ ...f, requirements: e.target.value }))}
                placeholder="Qualifications, experience, and other requirements..."
                rows={3}
                data-testid="textarea-job-requirements"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleSubmit}
                disabled={isPending || !form.title || !form.country}
                data-testid="btn-save-job"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {editing ? "Save Changes" : "Post Job"}
              </Button>
              <Button
                variant="outline"
                onClick={() => { setShowForm(false); setEditing(null); }}
                data-testid="btn-cancel-job"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Jobs list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : jobs.length === 0 ? (
        <Card className="text-center py-10">
          <CardContent>
            <Briefcase className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-muted-foreground">No job listings yet.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Post your first job — it will appear on the public Agency Marketplace.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {jobs.map(job => (
            <Card key={job.id} data-testid={`job-card-${job.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-1.5 mb-1">
                      {job.isFeatured && (
                        <Badge className="bg-amber-500 text-white text-xs">
                          <Star className="h-3 w-3 mr-1" /> Featured
                        </Badge>
                      )}
                      {job.visaSponsorship && (
                        <Badge variant="secondary" className="text-xs">
                          <Plane className="h-3 w-3 mr-1" /> Visa
                        </Badge>
                      )}
                      {job.jobCategory && (
                        <Badge variant="outline" className="text-xs">{job.jobCategory}</Badge>
                      )}
                    </div>
                    <p className="font-semibold" data-testid={`job-title-${job.id}`}>{job.title}</p>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {job.country}
                      </span>
                      {job.salary && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" /> {job.salary}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" /> {job.viewCount} views
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(job)}
                      data-testid={`btn-edit-job-${job.id}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleting(job.id)}
                      data-testid={`btn-delete-job-${job.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={open => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Job Listing?</AlertDialogTitle>
            <AlertDialogDescription>
              This listing will be hidden from the public marketplace. You can re-post it anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => deleting && deleteMutation.mutate(deleting)}
              disabled={deleteMutation.isPending}
              data-testid="btn-confirm-delete-job"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Remove
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function AgencyPortal() {
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAgency, setSelectedAgency] = useState<NeaAgency | null>(null);
  const [isPurchaseOpen, setIsPurchaseOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<string>("basic_sponsored");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isRenewalOpen, setIsRenewalOpen] = useState(false);
  const [renewalPhone, setRenewalPhone] = useState("");
  const [renewalDuration, setRenewalDuration] = useState("12");
  const [renewalPaymentId, setRenewalPaymentId] = useState<string | null>(null);
  const [renewalPolling, setRenewalPolling] = useState(false);

  const { data: myAgency, isLoading: agencyLoading } = useQuery<NeaAgency | null>({
    queryKey: ["/api/agency-portal/my-agency"],
    enabled: !!user,
  });

  // Show loading state while checking authentication
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  // Show login prompt for unauthenticated users
  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center h-16 gap-4">
              <Link href="/">
                <Button variant="ghost" size="icon" data-testid="button-back">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <Building2 className="h-6 w-6 text-primary" />
                <span className="font-semibold text-lg">Agency Portal</span>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <Card className="text-center">
            <CardContent className="p-8 sm:p-12 space-y-6">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <Building2 className="h-8 w-8 text-primary" />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold">Agency Portal</h1>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Sign in to claim your NEA-licensed agency and purchase visibility packages to reach more job seekers.
                </p>
              </div>
              <div className="space-y-4 pt-4">
                <Button size="lg" className="w-full sm:w-auto px-8" asChild data-testid="button-login-agency">
                  <a href="/api/login">
                    <LogIn className="mr-2 h-5 w-5" />
                    Sign In to Continue
                  </a>
                </Button>
                <p className="text-sm text-muted-foreground">
                  Don't have an account? Signing in will create one automatically.
                </p>
              </div>
              
              <div className="border-t pt-6 mt-6">
                <h3 className="font-semibold mb-4">What you can do in Agency Portal:</h3>
                <div className="grid sm:grid-cols-2 gap-4 text-left">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium">Claim Your Agency</div>
                      <div className="text-sm text-muted-foreground">Verify ownership of your listing</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Star className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium">Get Featured</div>
                      <div className="text-sm text-muted-foreground">Appear at the top of search results</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <BadgeCheck className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium">Verified Badge</div>
                      <div className="text-sm text-muted-foreground">Build trust with job seekers</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <BarChart3 className="h-5 w-5 text-purple-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium">Click Analytics</div>
                      <div className="text-sm text-muted-foreground">Track views and engagement</div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const { data: myAddOns = [], isLoading: addOnsLoading } = useQuery<AgencyAddOn[]>({
    queryKey: ["/api/agency-portal/my-addons"],
    enabled: !!myAgency,
  });

  const { data: clickStats } = useQuery<ClickStats>({
    queryKey: ["/api/agency-portal/my-clicks"],
    enabled: !!myAgency && myAddOns.some(a => 
      isAddonActive(a) && ALL_ADDON_TYPES[a.addOnType as keyof typeof ALL_ADDON_TYPES]?.includes?.clickAnalytics
    ),
  });

  const { data: searchResults = [] } = useQuery<NeaAgency[]>({
    queryKey: ["/api/agency-portal/search", searchQuery],
    enabled: searchQuery.length >= 3 && !myAgency,
  });

  const claimMutation = useMutation({
    mutationFn: (agencyId: string) => apiRequest("POST", "/api/agency-portal/claim", { agencyId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agency-portal/my-agency"] });
      setSelectedAgency(null);
      toast({ title: "Agency claimed successfully!" });
    },
    onError: () => {
      toast({ title: "Failed to claim agency", variant: "destructive" });
    },
  });

  const purchaseMutation = useMutation({
    mutationFn: (data: { packageId: string; phoneNumber: string }) => 
      apiRequest("POST", "/api/agency-portal/purchase", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agency-portal/my-addons"] });
      setIsPurchaseOpen(false);
      setPhoneNumber("");
      toast({ title: "Purchase initiated! You will receive an M-Pesa prompt." });
    },
    onError: () => {
      toast({ title: "Purchase failed", variant: "destructive" });
    },
  });

  const { data: renewalFees } = useQuery<{ fees: { durationMonths: number; amount: number; label: string }[]; currency: string }>({
    queryKey: ["/api/license-renewal/fees"],
    enabled: !!myAgency,
  });

  const { data: renewalHistory = [] } = useQuery<any[]>({
    queryKey: ["/api/license-renewal/history", myAgency?.id],
    enabled: !!myAgency,
  });

  const { data: renewalStatus } = useQuery<{ id: string; status: string; mpesaReceiptNumber?: string; newExpiryDate?: string }>({
    queryKey: ["/api/license-renewal/status", renewalPaymentId],
    enabled: !!renewalPaymentId && renewalPolling,
    refetchInterval: renewalPolling ? 3000 : false,
  });

  const { data: govStatus } = useQuery<{ integrations: Array<{ code: string; name: string; available: boolean; fallbackMode: boolean; fallbackReason: string | null }> }>({
    queryKey: ["/api/government-status"],
    enabled: !!myAgency,
    staleTime: 5 * 60 * 1000,
  });

  const { data: licenseStatus } = useQuery<{ manuallyVerified: boolean; governmentSystemAvailable: boolean; message?: string; legalDisclaimer?: string; manualVerificationExpiry?: string }>({
    queryKey: ["/api/license-status", "nea_kenya", myAgency?.licenseNumber],
    queryFn: async () => {
      const res = await fetch(`/api/license-status/nea_kenya/${encodeURIComponent(myAgency!.licenseNumber)}`);
      if (!res.ok) throw new Error("Unavailable");
      return res.json();
    },
    enabled: !!myAgency?.licenseNumber,
    staleTime: 5 * 60 * 1000,
  });

  const governmentDown = govStatus?.integrations?.some(i => i.fallbackMode) || false;

  useEffect(() => {
    if (renewalStatus?.status === "success" && renewalPolling) {
      setRenewalPolling(false);
      setIsRenewalOpen(false);
      setRenewalPaymentId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/agency-portal/my-agency"] });
      queryClient.invalidateQueries({ queryKey: ["/api/license-renewal/history", myAgency?.id] });
      toast({ title: "License renewed successfully!", description: `Receipt: ${renewalStatus.mpesaReceiptNumber}` });
    }
    if (renewalStatus?.status === "failed" && renewalPolling) {
      setRenewalPolling(false);
      toast({ title: "Payment failed", description: "Please try again.", variant: "destructive" });
    }
  }, [renewalStatus?.status, renewalPolling, myAgency?.id]);


  const renewalMutation = useMutation({
    mutationFn: (data: { agencyId: string; phoneNumber: string; durationMonths: number }) =>
      apiRequest("POST", "/api/license-renewal/initiate", data),
    onSuccess: async (response: any) => {
      const data = await response.json();
      setRenewalPaymentId(data.paymentId);
      setRenewalPolling(true);
      toast({ title: "M-PESA prompt sent", description: "Check your phone and enter your PIN." });
    },
    onError: () => {
      toast({ title: "Payment failed", description: "Could not initiate M-Pesa payment.", variant: "destructive" });
    },
  });

  const selectedFee = renewalFees?.fees.find(f => f.durationMonths === parseInt(renewalDuration));

  const hasActivePackage = (packageId: string) => {
    return myAddOns.some(a => a.addOnType === packageId && isAddonActive(a));
  };

  const hasClickAnalytics = myAddOns.some(a => 
    isAddonActive(a) && ALL_ADDON_TYPES[a.addOnType as keyof typeof ALL_ADDON_TYPES]?.includes?.clickAnalytics
  );

  const hasVerifiedBadge = myAddOns.some(a => 
    isAddonActive(a) && ALL_ADDON_TYPES[a.addOnType as keyof typeof ALL_ADDON_TYPES]?.includes?.verifiedBadge
  );

  if (agencyLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!myAgency) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center h-16 gap-4">
              <Link href="/">
                <Button variant="ghost" size="icon" data-testid="button-back">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <Building2 className="h-6 w-6 text-primary" />
                <span className="font-semibold text-lg">Agency Portal</span>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card>
            <CardHeader>
              <CardTitle>Claim Your Agency</CardTitle>
              <CardDescription>
                Search for your NEA-licensed agency to claim and manage your listing
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by agency name or license number..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-agency"
                  />
                </div>
              </div>

              {searchQuery.length >= 3 && (
                <div className="space-y-2">
                  {searchResults.length > 0 ? (
                    searchResults.map((agency) => (
                      <div
                        key={agency.id}
                        className="p-4 border rounded-lg flex items-center justify-between hover-elevate cursor-pointer"
                        onClick={() => setSelectedAgency(agency)}
                        data-testid={`agency-result-${agency.id}`}
                      >
                        <div>
                          <h3 className="font-medium">{agency.agencyName}</h3>
                          <p className="text-sm text-muted-foreground">{agency.licenseNumber}</p>
                        </div>
                        <Button size="sm">Claim</Button>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-center py-4">
                      No agencies found. Make sure your agency is NEA-licensed.
                    </p>
                  )}
                </div>
              )}

              {searchQuery.length > 0 && searchQuery.length < 3 && (
                <p className="text-muted-foreground text-sm">
                  Type at least 3 characters to search
                </p>
              )}
            </CardContent>
          </Card>

          <Dialog open={!!selectedAgency} onOpenChange={() => setSelectedAgency(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Claim Agency</DialogTitle>
                <DialogDescription>
                  Verify that you represent this agency
                </DialogDescription>
              </DialogHeader>
              {selectedAgency && (
                <div className="space-y-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <h3 className="font-semibold">{selectedAgency.agencyName}</h3>
                    <p className="text-sm text-muted-foreground">License: {selectedAgency.licenseNumber}</p>
                    {selectedAgency.email && (
                      <p className="text-sm text-muted-foreground">Email: {selectedAgency.email}</p>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    By claiming this agency, you confirm that you are an authorized representative. 
                    We may verify your claim by contacting the agency's registered email.
                  </p>
                  <Button 
                    className="w-full" 
                    onClick={() => claimMutation.mutate(selectedAgency.id)}
                    disabled={claimMutation.isPending}
                    data-testid="button-confirm-claim"
                  >
                    {claimMutation.isPending ? "Claiming..." : "Confirm & Claim Agency"}
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
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
              <div className="flex items-center gap-2">
                <Building2 className="h-6 w-6 text-primary" />
                <span className="font-semibold text-lg">Agency Portal</span>
              </div>
            </div>
            <Button onClick={() => setIsPurchaseOpen(true)} data-testid="button-upgrade">
              <Star className="h-4 w-4 mr-2" />
              Upgrade
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold">{myAgency.agencyName}</h1>
            {hasVerifiedBadge && <BadgeCheck className="h-6 w-6 text-blue-500" />}
          </div>
          <p className="text-muted-foreground">License: {myAgency.licenseNumber}</p>
        </div>

        {/* Government Downtime Banner */}
        {governmentDown && (
          <div className="mb-6 p-4 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-300 dark:border-orange-800 flex items-start gap-3" data-testid="portal-downtime-banner">
            <AlertTriangle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-orange-800 dark:text-orange-200 text-sm">Government Verification System Offline</p>
              <p className="text-sm text-orange-700 dark:text-orange-300 mt-0.5">
                The NEA government licensing system is temporarily unavailable. Your license status below reflects the last known or manually verified state. Automatic re-verification will occur once the system is restored.
              </p>
            </div>
          </div>
        )}

        {/* Manual Verification Banner */}
        {licenseStatus?.manuallyVerified && !licenseStatus?.governmentSystemAvailable && (
          <div className="mb-6 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-300 dark:border-blue-800 flex items-start gap-3" data-testid="portal-manually-verified-banner">
            <Shield className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-800 dark:text-blue-200 text-sm flex items-center gap-2">
                License Temporarily Manually Verified
                <span className="text-xs font-normal bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">Manual Override Active</span>
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-0.5">
                {licenseStatus.message || "Your license has been temporarily verified by WorkAbroad Hub staff while the government system is unavailable."}
              </p>
              {licenseStatus.manualVerificationExpiry && (
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  Valid until: {new Date(licenseStatus.manualVerificationExpiry).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </p>
              )}
            </div>
          </div>
        )}

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="jobs" data-testid="tab-jobs">My Jobs</TabsTrigger>
            <TabsTrigger value="renewal" data-testid="tab-renewal">License Renewal</TabsTrigger>
            <TabsTrigger value="packages" data-testid="tab-packages">My Packages</TabsTrigger>
            {hasClickAnalytics && (
              <TabsTrigger value="analytics" data-testid="tab-analytics">Analytics</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <Shield className="h-8 w-8 text-green-500" />
                    <div>
                      <p className="text-sm text-muted-foreground">License Status</p>
                      <p className="font-semibold">
                        {new Date(myAgency.expiryDate) > new Date() ? "Valid" : "Expired"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <Clock className="h-8 w-8 text-blue-500" />
                    <div>
                      <p className="text-sm text-muted-foreground">License Expires</p>
                      <p className="font-semibold">
                        {new Date(myAgency.expiryDate).toLocaleDateString("en-GB", {
                          day: "2-digit", month: "short", year: "numeric"
                        })}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <Star className="h-8 w-8 text-amber-500" />
                    <div>
                      <p className="text-sm text-muted-foreground">Active Add-Ons</p>
                      <p className="font-semibold">{myAddOns.filter(a => isAddonActive(a)).length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Agency Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{myAgency.email || "Not set"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Website</p>
                    <p className="font-medium">{myAgency.website || "Not set"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">License Issued</p>
                    <p className="font-medium">
                      {new Date(myAgency.issueDate).toLocaleDateString("en-GB", {
                        day: "2-digit", month: "short", year: "numeric"
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Claimed On</p>
                    <p className="font-medium">
                      {myAgency.claimedAt ? new Date(myAgency.claimedAt).toLocaleDateString("en-GB", {
                        day: "2-digit", month: "short", year: "numeric"
                      }) : "N/A"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Upgrade Your Visibility</CardTitle>
                <CardDescription>Get more exposure and attract more job seekers</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  {Object.values(SPONSORSHIP_PACKAGES).map((pkg) => (
                    <div 
                      key={pkg.id} 
                      className={`p-4 border rounded-lg ${hasActivePackage(pkg.id) ? 'border-green-500 bg-green-50 dark:bg-green-950/20' : ''}`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Star className="h-5 w-5 text-primary" />
                        <span className="font-medium">{pkg.name}</span>
                      </div>
                      <p className="text-2xl font-bold text-primary">{formatPrice(pkg.price)}</p>
                      <p className="text-sm text-muted-foreground mb-3">{pkg.duration} days</p>
                      <ul className="text-xs text-muted-foreground space-y-1 mb-4">
                        {pkg.features.slice(0, 3).map((f, i) => (
                          <li key={i} className="flex items-center gap-1">
                            <CheckCircle className="h-3 w-3 text-green-500" />
                            {f}
                          </li>
                        ))}
                      </ul>
                      {hasActivePackage(pkg.id) ? (
                        <Badge variant="default" className="w-full justify-center">Active</Badge>
                      ) : (
                        <Button 
                          size="sm" 
                          className="w-full"
                          onClick={() => {
                            setSelectedPackage(pkg.id);
                            setIsPurchaseOpen(true);
                          }}
                          data-testid={`button-purchase-${pkg.id}`}
                        >
                          Purchase
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="renewal" className="space-y-6">
            {!myAgency ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <RefreshCw className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Claim your agency first to access license renewal.</p>
                </CardContent>
              </Card>
            ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <RefreshCw className="h-5 w-5" />
                  Renew Your License
                </CardTitle>
                <CardDescription>
                  Extend your NEA license validity via M-PESA payment
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {new Date(myAgency.expiryDate) <= new Date() && (
                  <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg" data-testid="license-expired-warning">
                    <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-destructive">License Expired</p>
                      <p className="text-sm text-muted-foreground">
                        Your license expired on {new Date(myAgency.expiryDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}. Renew now to restore your valid status.
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  {renewalFees?.fees.map((fee) => (
                    <div
                      key={fee.durationMonths}
                      className={`p-5 border-2 rounded-lg cursor-pointer transition-colors ${
                        parseInt(renewalDuration) === fee.durationMonths
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                      onClick={() => setRenewalDuration(String(fee.durationMonths))}
                      data-testid={`renewal-option-${fee.durationMonths}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-lg">{fee.label}</span>
                        <CalendarPlus className="h-5 w-5 text-primary" />
                      </div>
                      <p className="text-2xl font-bold text-primary">
                        KES {fee.amount.toLocaleString()}
                      </p>
                      {fee.durationMonths === 24 && (
                        <Badge variant="secondary" className="mt-2">Save KES 1,000</Badge>
                      )}
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                    <Label htmlFor="renewal-phone">M-PESA Phone Number</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="renewal-phone"
                        placeholder="0712345678"
                        value={renewalPhone}
                        onChange={(e) => setRenewalPhone(formatPhone(e.target.value))}
                        className="pl-10"
                        data-testid="input-renewal-phone"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      You will receive an M-PESA STK push prompt on this number
                    </p>
                  </div>

                <div className="p-4 bg-muted rounded-lg space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>License Number</span>
                    <span className="font-medium">{myAgency.licenseNumber}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Current Expiry</span>
                    <span className="font-medium">
                      {new Date(myAgency.expiryDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Duration</span>
                    <span className="font-medium">{selectedFee?.label || "1 Year"}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t pt-2 mt-2">
                    <span className="font-semibold">Total Amount</span>
                    <span className="font-bold text-primary text-lg">
                      KES {(selectedFee?.amount || 5000).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* M-Pesa payment flow */}
                <Button
                  size="lg"
                  className="w-full"
                  disabled={renewalMutation.isPending || renewalPolling || !renewalPhone}
                  onClick={() => setIsRenewalOpen(true)}
                  data-testid="button-renew-license"
                >
                  {renewalPolling ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Waiting for payment...
                    </>
                  ) : renewalMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending STK Push...
                    </>
                  ) : (
                    <>
                      <Phone className="h-4 w-4 mr-2" />
                      Pay KES {(selectedFee?.amount || 5000).toLocaleString()} via M-PESA
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
            )}

            {renewalHistory.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Receipt className="h-5 w-5" />
                    Renewal History
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {renewalHistory.map((payment: any) => (
                      <div key={payment.id} className="flex items-center justify-between p-4 border rounded-lg" data-testid={`renewal-record-${payment.id}`}>
                        <div>
                          <p className="font-medium">KES {payment.amount.toLocaleString()}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(payment.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                            {" - "}
                            {payment.renewalDurationMonths === 12 ? "1 Year" : `${payment.renewalDurationMonths / 12} Years`}
                          </p>
                          {payment.mpesaReceiptNumber && (
                            <p className="text-xs text-muted-foreground">Receipt: {payment.mpesaReceiptNumber}</p>
                          )}
                        </div>
                        <Badge
                          variant={payment.status === "success" ? "default" : payment.status === "pending" ? "secondary" : "destructive"}
                        >
                          {payment.status === "success" ? "Paid" : payment.status === "pending" ? "Pending" : "Failed"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="packages" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>My Active Packages & Add-Ons</CardTitle>
              </CardHeader>
              <CardContent>
                {addOnsLoading ? (
                  <Skeleton className="h-32 w-full" />
                ) : myAddOns.filter(a => isAddonActive(a)).length > 0 ? (
                  <div className="space-y-3">
                    {myAddOns.filter(a => isAddonActive(a)).map((addon) => {
                      const addonInfo = ALL_ADDON_TYPES[addon.addOnType as keyof typeof ALL_ADDON_TYPES];
                      return (
                        <div key={addon.id} className="flex items-center justify-between p-4 border rounded-lg">
                          <div>
                            <h3 className="font-medium">{addonInfo?.name || addon.addOnType}</h3>
                            <p className="text-sm text-muted-foreground">
                              Expires: {new Date(addon.endDate).toLocaleDateString("en-GB", {
                                day: "2-digit", month: "short", year: "numeric"
                              })}
                            </p>
                          </div>
                          <Badge variant="outline">
                            {getDaysRemaining(addon.endDate)} days left
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Star className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No active packages or add-ons</p>
                    <Button 
                      className="mt-4" 
                      onClick={() => setIsPurchaseOpen(true)}
                      data-testid="button-get-started"
                    >
                      Get Started
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {myAddOns.filter(a => !isAddonActive(a)).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Expired Packages</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {myAddOns.filter(a => !isAddonActive(a)).map((addon) => {
                      const addonInfo = ALL_ADDON_TYPES[addon.addOnType as keyof typeof ALL_ADDON_TYPES];
                      return (
                        <div key={addon.id} className="flex items-center justify-between p-3 border rounded-lg opacity-60">
                          <div>
                            <h3 className="font-medium text-sm">{addonInfo?.name || addon.addOnType}</h3>
                            <p className="text-xs text-muted-foreground">
                              Expired: {new Date(addon.endDate).toLocaleDateString()}
                            </p>
                          </div>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => {
                              setSelectedPackage(addon.addOnType);
                              setIsPurchaseOpen(true);
                            }}
                          >
                            Renew
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="jobs" className="space-y-4">
            <MyJobsTab agencyId={myAgency.id} />
          </TabsContent>

          {hasClickAnalytics && (
            <TabsContent value="analytics" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Click Analytics
                  </CardTitle>
                  <CardDescription>Track how job seekers interact with your listing</CardDescription>
                </CardHeader>
                <CardContent>
                  {clickStats ? (
                    <div className="space-y-6">
                      <div className="flex items-center gap-4 p-4 bg-primary/10 rounded-lg">
                        <TrendingUp className="h-8 w-8 text-primary" />
                        <div>
                          <p className="text-sm text-muted-foreground">Total Clicks</p>
                          <p className="text-3xl font-bold">{clickStats.total}</p>
                        </div>
                      </div>
                      <div>
                        <h4 className="font-medium mb-3">Clicks by Source</h4>
                        <div className="space-y-2">
                          {clickStats.stats.map((stat) => (
                            <div key={stat.source} className="flex items-center justify-between p-3 border rounded">
                              <span className="capitalize">{stat.source.replace(/_/g, ' ')}</span>
                              <Badge variant="secondary">{stat.count}</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No analytics data yet</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </main>

      <AlertDialog open={isRenewalOpen} onOpenChange={setIsRenewalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm License Renewal</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to pay <strong>KES {(selectedFee?.amount || 5000).toLocaleString()}</strong> for a <strong>{selectedFee?.label || "1 Year"}</strong> license renewal via M-PESA to phone number <strong>{renewalPhone}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
            <div className="flex justify-between">
              <span>Agency</span>
              <span className="font-medium">{myAgency?.agencyName}</span>
            </div>
            <div className="flex justify-between">
              <span>License</span>
              <span className="font-medium">{myAgency?.licenseNumber}</span>
            </div>
            <div className="flex justify-between">
              <span>Amount</span>
              <span className="font-bold text-primary">KES {(selectedFee?.amount || 5000).toLocaleString()}</span>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-renewal">Cancel</AlertDialogCancel>
            <Button
              onClick={() => {
                if (myAgency) {
                  renewalMutation.mutate({
                    agencyId: myAgency.id,
                    phoneNumber: renewalPhone,
                    durationMonths: parseInt(renewalDuration),
                  });
                  setIsRenewalOpen(false);
                }
              }}
              disabled={renewalMutation.isPending}
              data-testid="button-confirm-renewal"
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Confirm & Pay
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isPurchaseOpen} onOpenChange={setIsPurchaseOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Purchase Package</DialogTitle>
            <DialogDescription>
              Select a package to boost your visibility
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select Package</Label>
              <Select value={selectedPackage} onValueChange={setSelectedPackage}>
                <SelectTrigger data-testid="select-package">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Packages</div>
                  {Object.values(SPONSORSHIP_PACKAGES).map((pkg) => (
                    <SelectItem key={pkg.id} value={pkg.id}>
                      {pkg.name} - {formatPrice(pkg.price)}
                    </SelectItem>
                  ))}
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground border-t mt-1 pt-1">
                    Individual Add-Ons
                  </div>
                  {Object.values(INDIVIDUAL_ADDONS).map((addon) => (
                    <SelectItem key={addon.id} value={addon.id}>
                      {addon.name} - {formatPrice(addon.price)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm font-medium mb-2">Includes:</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                {ALL_ADDON_TYPES[selectedPackage as keyof typeof ALL_ADDON_TYPES]?.features.map((f, i) => (
                  <li key={i} className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              <Label>M-Pesa Phone Number</Label>
              <Input
                placeholder="0712345678"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(formatPhone(e.target.value))}
                data-testid="input-phone"
              />
              <p className="text-xs text-muted-foreground">
                You will receive an M-Pesa prompt to complete payment
              </p>
            </div>

            <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg">
              <span className="font-medium">Total</span>
              <span className="text-xl font-bold">
                {formatPrice(ALL_ADDON_TYPES[selectedPackage as keyof typeof ALL_ADDON_TYPES]?.price || 0)}
              </span>
            </div>

            <Button
              className="w-full"
              onClick={() => purchaseMutation.mutate({ packageId: selectedPackage, phoneNumber })}
              disabled={purchaseMutation.isPending || !phoneNumber}
              data-testid="button-confirm-purchase"
            >
              <CreditCard className="h-4 w-4 mr-2" />
              {purchaseMutation.isPending ? "Processing..." : "Pay with M-Pesa"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
