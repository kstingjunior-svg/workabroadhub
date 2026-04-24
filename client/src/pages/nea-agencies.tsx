import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, fetchCsrfToken } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useUpgradeModal } from "@/contexts/upgrade-modal-context";
import { Link } from "wouter";
import { Search, AlertTriangle, Flag, Shield, ArrowLeft, Info, Loader2, AlertCircle, CheckCircle2, XCircle, Star, BadgeCheck, Building2, Upload, ShieldCheck, Clock, Ban } from "lucide-react";
import { useAgencyRatingSummary } from "@/lib/firebase-agency-ratings";
import { RateAgencyModal } from "@/components/rate-agency-modal";
import { checkAgencyName } from "@/lib/agency-name-check";
import { getAgencyRatingDisplay } from "@/lib/agency-rating";

interface NeaAgency {
  id: string;
  agencyName: string;
  licenseNumber: string;
  email: string | null;
  website: string | null;
  serviceType: string | null;
  issueDate: string;
  expiryDate: string;
  statusOverride: string | null;
  notes: string | null;
  isPublished: boolean;
  lastUpdated: string;
  claimedByUserId: string | null;
  claimedAt: string | null;
  isVerifiedOwner: boolean;
}

interface AgencyClaim {
  id: string;
  agencyId: string;
  status: "pending" | "approved" | "rejected";
  contactName: string;
  contactEmail: string;
  role: string;
  submittedAt: string;
  reviewNotes: string | null;
}

interface FeaturedAgency extends NeaAgency {
  hasBanner: boolean;
  isVerified: boolean;
}

interface AgencyScore {
  agencyId: string;
  overallScore: number | null;
  tier: string | null;
}


function getAgencyStatus(agency: NeaAgency): { status: string; color: "green" | "red" | "orange"; label: string } {
  if (agency.statusOverride === "suspended") {
    return { status: "suspended", color: "orange", label: "Suspended" };
  }
  const today = new Date();
  const expiryDate = new Date(agency.expiryDate);
  if (expiryDate < today) {
    return { status: "expired", color: "red", label: "Expired" };
  }
  return { status: "active", color: "green", label: "Valid" };
}

function getDaysUntilExpiry(expiryDate: string): number {
  const today = new Date();
  const expiry = new Date(expiryDate);
  const diffTime = expiry.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function AgencyRatingDisplay({ licenseNumber }: { licenseNumber: string }) {
  const { average, count } = useAgencyRatingSummary(licenseNumber);
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-1.5" data-testid={`rating-display-${licenseNumber}`}>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map(n => (
          <Star
            key={n}
            className={`h-3.5 w-3.5 ${n <= Math.round(average) ? "text-amber-400 fill-amber-400" : "text-gray-200 dark:text-gray-700 fill-gray-200 dark:fill-gray-700"}`}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{average} ({count})</span>
    </div>
  );
}

export default function NeaAgenciesPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { openUpgradeModal } = useUpgradeModal();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isEducationOpen, setIsEducationOpen] = useState(false);
  const [selectedAgency, setSelectedAgency] = useState<NeaAgency | null>(null);
  const [reportForm, setReportForm] = useState({
    agencyName: "",
    reporterEmail: "",
    reporterPhone: "",
    description: "",
  });

  // Rating modal state
  const [ratingAgency, setRatingAgency] = useState<NeaAgency | null>(null);

  // Claim workflow state
  const [claimAgency, setClaimAgency] = useState<NeaAgency | null>(null);
  const [claimStep, setClaimStep] = useState(1);
  const [claimForm, setClaimForm] = useState({
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    role: "",
    proofDescription: "",
  });
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check user's existing claim for selected agency
  const { data: existingClaim } = useQuery<AgencyClaim | null>({
    queryKey: ["/api/nea-agencies", claimAgency?.id, "my-claim"],
    queryFn: async () => {
      if (!claimAgency || !user) return null;
      const res = await fetch(`/api/nea-agencies/${claimAgency.id}/my-claim`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!claimAgency && !!user,
  });

  const submitClaimMutation = useMutation({
    mutationFn: async () => {
      if (!claimAgency) throw new Error("No agency selected");
      const formData = new FormData();
      formData.append("contactName", claimForm.contactName);
      formData.append("contactEmail", claimForm.contactEmail);
      formData.append("contactPhone", claimForm.contactPhone);
      formData.append("role", claimForm.role);
      formData.append("proofDescription", claimForm.proofDescription);
      proofFiles.forEach(f => formData.append("proofFiles", f));
      const csrfToken = await fetchCsrfToken();
      const res = await fetch(`/api/nea-agencies/${claimAgency.id}/claim`, {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: { "X-CSRF-Token": csrfToken },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to submit claim");
      }
      return res.json();
    },
    onSuccess: () => {
      setClaimStep(3);
      queryClient.invalidateQueries({ queryKey: ["/api/nea-agencies"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleAgencyClick = (agency: NeaAgency) => {
    trackAgencyClick(agency.id, "agency_list");
    const status = getAgencyStatus(agency);
    if (status.status === "expired" || status.status === "suspended") {
      setSelectedAgency(agency);
      setIsEducationOpen(true);
    }
  };

  const trackAgencyClick = async (agencyId: string, source: string) => {
    try {
      await fetch("/api/agency-clicks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyId, source }),
      });
    } catch (error) {
      // Silent fail for analytics
    }
  };

  const handleFeaturedAgencyClick = (agency: FeaturedAgency) => {
    trackAgencyClick(agency.id, "featured_banner");
  };

  const { data: agencies, isLoading } = useQuery<NeaAgency[]>({
    queryKey: ["/api/nea-agencies", searchQuery],
    queryFn: async () => {
      const url = searchQuery
        ? `/api/nea-agencies?search=${encodeURIComponent(searchQuery)}`
        : "/api/nea-agencies";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch agencies");
      return res.json();
    },
  });

  const { data: featuredAgencies } = useQuery<FeaturedAgency[]>({
    queryKey: ["/api/featured-agencies"],
  });

  const { data: govStatus } = useQuery<{ integrations: Array<{ code: string; name: string; available: boolean; fallbackMode: boolean; fallbackReason: string | null }> }>({
    queryKey: ["/api/government-status"],
  });

  const governmentDown = govStatus?.integrations?.some(i => i.fallbackMode) || false;

  const { data: scoresData } = useQuery<{ scores: Record<string, { overallScore: number; tier: string }> }>({
    queryKey: ["/api/agency-scores/bulk"],
  });

  const { data: neaStats } = useQuery<{
    valid: number;
    expired: number;
    suspended: number;
    total: number;
    lastUpdated: string;
  }>({
    queryKey: ["/api/nea-agencies/stats"],
    refetchInterval: 60_000,
  });

  const verifiedAgencyIds = new Set(
    featuredAgencies?.filter(a => a.isVerified).map(a => a.id) || []
  );

  const bannerAgencies = featuredAgencies?.filter(a => a.hasBanner) || [];

  const reportMutation = useMutation({
    mutationFn: async (data: typeof reportForm) => {
      return apiRequest("POST", "/api/agency-reports", data);
    },
    onSuccess: () => {
      toast({ title: "Thank you! Your report has been submitted and will be reviewed." });
      setIsReportOpen(false);
      setReportForm({ agencyName: "", reporterEmail: "", reporterPhone: "", description: "" });
    },
    onError: () => {
      toast({ title: "Failed to submit report. Please try again.", variant: "destructive" });
    },
  });

  const handleReport = () => {
    if (!reportForm.agencyName || !reportForm.description) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    reportMutation.mutate(reportForm);
  };

  const filteredAgencies = agencies?.filter(agency => {
    if (statusFilter === "all") return true;
    const status = getAgencyStatus(agency);
    return status.status === statusFilter;
  });


  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="font-bold text-lg">Verify Agency License</h1>
              <p className="text-xs text-muted-foreground">NEA Licensed Employment Agencies</p>
            </div>
          </div>
          <Shield className="h-6 w-6 text-primary" />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {governmentDown && (
          <Card className="bg-orange-50 dark:bg-orange-950/30 border-orange-300 dark:border-orange-800" data-testid="government-downtime-banner">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-orange-600 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold text-orange-800 dark:text-orange-200">Government Verification System Temporarily Unavailable</p>
                  <p className="text-orange-700 dark:text-orange-300 mt-1">
                    The government license verification system is currently experiencing downtime. License statuses shown may be based on temporary manual verification. Final confirmation will occur automatically once government systems resume service.
                  </p>
                  <p className="text-xs text-orange-600 dark:text-orange-400 mt-2 italic">
                    Legal Notice: Temporary verifications are valid for 14 days and are subject to government confirmation upon system recovery.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-200">Important Notice</p>
                <p className="text-amber-700 dark:text-amber-300">
                  This list is for reference only. We are not affiliated with NEA. Always verify license status directly with the National Employment Authority before making any payment.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <p className="font-medium">Protect Yourself from Job Scams</p>
                <p className="mt-1">Before paying any recruitment fee, search for the agency below to check if they hold a valid NEA license. Unlicensed agents are illegal.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-3">
          <Card className="text-center p-4">
            <div className="flex items-center justify-center gap-2 mb-1">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <span
                className="text-2xl font-bold text-green-600"
                data-stat="valid"
                data-testid="stat-valid"
              >
                {neaStats?.valid ?? "—"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Valid Licenses</p>
          </Card>
          <Card className="text-center p-4">
            <div className="flex items-center justify-center gap-2 mb-1">
              <XCircle className="h-5 w-5 text-red-500" />
              <span
                className="text-2xl font-bold text-red-600"
                data-stat="expired"
                data-testid="stat-expired"
              >
                {neaStats?.expired ?? "—"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Expired</p>
          </Card>
          <Card className="text-center p-4">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Shield className="h-5 w-5 text-primary" />
              <span
                className="text-2xl font-bold"
                data-stat="total"
                data-testid="stat-total"
              >
                {neaStats?.total ?? "—"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Total Listed</p>
          </Card>
        </div>

        {neaStats?.lastUpdated && (
          <p className="text-xs text-center text-muted-foreground -mt-2">
            Database updated:{" "}
            <span data-stat="lastUpdated" data-testid="stat-last-updated">
              {new Date(neaStats.lastUpdated).toLocaleString("en-KE", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </p>
        )}

        {bannerAgencies.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
                <h2 className="font-semibold text-lg">Licensed Agencies</h2>
              </div>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">Sponsored / Paid Advertising</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {bannerAgencies.map(agency => (
                <Card
                  key={agency.id}
                  className="border-amber-200 dark:border-amber-900 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 cursor-pointer hover:shadow-md transition-shadow"
                  data-testid={`featured-agency-${agency.id}`}
                  onClick={() => handleFeaturedAgencyClick(agency)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{agency.agencyName}</h3>
                          {agency.isVerified && (
                            <BadgeCheck className="h-5 w-5 text-blue-500" />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">License: {agency.licenseNumber}</p>
                      </div>
                      <Badge variant="default" className="bg-amber-500 hover:bg-amber-600 shrink-0">
                        <Star className="h-3 w-3 mr-1 fill-current" />
                        Sponsored
                      </Badge>
                    </div>
                    <div className="mt-2 text-sm">
                      <span className="text-muted-foreground">Valid until: </span>
                      {new Date(agency.expiryDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Sponsored listings are paid advertisements. We are not affiliated with NEA. Always verify agency licenses directly.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3 p-3 bg-muted/50 rounded-lg text-sm">
            <span className="text-muted-foreground">Status Key:</span>
            <div className="flex items-center gap-1">
              <span style={{ color: '#4CAF50' }}>🟢</span>
              <span>Valid</span>
            </div>
            <div className="flex items-center gap-1">
              <span style={{ color: '#D92D20' }}>🔴</span>
              <span>Expired</span>
            </div>
            <div className="flex items-center gap-1">
              <span style={{ color: '#FF9800' }}>🟠</span>
              <span>Suspended</span>
            </div>
            <div className="flex items-center gap-1">
              <span style={{ color: '#2196F3' }}>🔵</span>
              <span>Verified</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Type agency name or license number..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-agencies"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40" data-testid="select-status-filter">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Valid Only</SelectItem>
                <SelectItem value="expired">Expired Only</SelectItem>
                <SelectItem value="suspended">Suspended Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-40" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredAgencies?.map(agency => {
              const status = getAgencyStatus(agency);
              const isExpired = status.status === "expired";
              const isSuspended = status.status === "suspended";
              const daysLeft = getDaysUntilExpiry(agency.expiryDate);
              const isExpiringSoon = daysLeft > 0 && daysLeft <= 30;
              
              const agencyScore = scoresData?.scores?.[agency.id]?.overallScore ?? null;
              const ratingDisplay = getAgencyRatingDisplay(agency.expiryDate, agencyScore);

              return (
                <Card
                  key={agency.id}
                  className={`transition-shadow overflow-hidden ${isExpired || isSuspended ? "cursor-pointer hover:shadow-md" : "hover:shadow-sm"}`}
                  style={{
                    borderLeft: isExpired
                      ? "5px solid #D92D20"
                      : isSuspended || isExpiringSoon
                      ? "5px solid #E6A700"
                      : "5px solid #4A7C59",
                  }}
                  data-testid={`card-agency-${agency.id}`}
                  onClick={() => handleAgencyClick(agency)}
                >
                  <CardContent className="p-5">
                    <div className="flex flex-col gap-3">

                      {/* ── Header row ── */}
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-base leading-tight" data-testid={`text-agency-name-${agency.id}`}>
                              {agency.agencyName}
                            </h3>
                            {agency.isVerifiedOwner && (
                              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border border-green-300 dark:border-green-700 text-xs gap-1" data-testid={`badge-verified-owner-${agency.id}`}>
                                <ShieldCheck className="h-3 w-3" />
                                Verified Owner
                              </Badge>
                            )}
                            {verifiedAgencyIds.has(agency.id) && (
                              <BadgeCheck className="h-4.5 w-4.5 text-blue-500 shrink-0" />
                            )}
                            {(() => {
                              const nc = checkAgencyName(agency.agencyName);
                              if (!nc.warning) return null;
                              return (
                                <Badge
                                  className={`text-xs gap-1 border ${nc.risk === "HIGH" ? "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700" : "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700"}`}
                                  title={nc.message}
                                  data-testid={`badge-name-warning-${agency.id}`}
                                >
                                  <AlertTriangle className="h-3 w-3" />
                                  Suspicious Name
                                </Badge>
                              );
                            })()}
                          </div>
                          <AgencyRatingDisplay licenseNumber={agency.licenseNumber} />
                        </div>

                        {/* Top-right: rating badge / hidden pill + status badge */}
                        <div className="flex items-center gap-2 flex-wrap shrink-0">
                          {isExpired ? (
                            <span
                              className="inline-flex items-center gap-1.5 bg-muted text-muted-foreground px-3 py-1 rounded-full text-xs font-medium"
                              data-testid={`badge-rating-hidden-${agency.id}`}
                            >
                              <Ban className="h-3 w-3" />
                              Rating hidden — License expired
                            </span>
                          ) : ratingDisplay.showRating && ratingDisplay.badge ? (
                            <span
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border"
                              style={{
                                backgroundColor: ratingDisplay.badge.bgColor,
                                color: ratingDisplay.badge.color,
                                borderColor: ratingDisplay.badge.color + "55",
                              }}
                              data-testid={`badge-score-${agency.id}`}
                            >
                              <Star className="h-3 w-3 fill-current" />
                              {ratingDisplay.badge.level} ({ratingDisplay.badge.score})
                            </span>
                          ) : null}

                          <Badge
                            className={`shrink-0 text-xs font-semibold uppercase tracking-wide rounded-full px-3 ${
                              isExpired
                                ? "bg-red-100 text-red-800 border border-red-300 dark:bg-red-900/30 dark:text-red-300"
                                : isSuspended
                                ? "bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-300"
                                : isExpiringSoon
                                ? "bg-orange-100 text-orange-800 border border-orange-300 dark:bg-orange-900/30 dark:text-orange-300"
                                : "bg-green-100 text-green-800 border border-green-300 dark:bg-green-900/30 dark:text-green-300"
                            }`}
                          >
                            {isExpired ? "Expired" : isSuspended ? "Suspended" : isExpiringSoon ? "Expiring Soon" : "✓ Valid"}
                          </Badge>
                        </div>
                      </div>

                      {/* ── License detail grid ── */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm p-3 bg-muted/50 rounded-xl">
                        <div>
                          <span className="text-xs uppercase tracking-wide text-muted-foreground">License No</span>
                          <p className="font-semibold font-mono text-xs mt-0.5">{agency.licenseNumber}</p>
                        </div>
                        <div>
                          <span className="text-xs uppercase tracking-wide text-muted-foreground">Issued</span>
                          <p className="font-semibold text-sm mt-0.5">
                            {new Date(agency.issueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                          </p>
                        </div>
                        <div>
                          <span className="text-xs uppercase tracking-wide text-muted-foreground">
                            {isExpired ? "Expired" : "Expires"}
                          </span>
                          <p className={`font-semibold text-sm mt-0.5 ${isExpired ? "text-red-600 dark:text-red-400" : isExpiringSoon ? "text-amber-600 dark:text-amber-400" : ""}`}>
                            {new Date(agency.expiryDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                            {isExpired && " (expired)"}
                            {isExpiringSoon && ` (in ${daysLeft} day${daysLeft !== 1 ? "s" : ""})`}
                          </p>
                        </div>
                        <div>
                          <span className="text-xs uppercase tracking-wide text-muted-foreground">Status</span>
                          <p className={`font-semibold text-sm mt-0.5 ${isExpired ? "text-red-600 dark:text-red-400" : isSuspended ? "text-amber-600 dark:text-amber-400" : "text-green-700 dark:text-green-400"}`}>
                            {isExpired ? "❌ No Longer Licensed" : isSuspended ? "⚠️ Suspended" : "✅ Licensed"}
                          </p>
                        </div>
                        {agency.email && (
                          <div className="col-span-2">
                            <span className="text-xs uppercase tracking-wide text-muted-foreground">Email</span>
                            <p className="mt-0.5">
                              <a href={`mailto:${agency.email}`} className="text-primary hover:underline text-sm">{agency.email}</a>
                            </p>
                          </div>
                        )}
                        {agency.website && agency.website.toLowerCase() !== "n/a" && (
                          <div className="col-span-2">
                            <span className="text-xs uppercase tracking-wide text-muted-foreground">Website</span>
                            <p className="mt-0.5">
                              <a
                                href={agency.website.startsWith("http") ? agency.website : `https://${agency.website}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline text-sm"
                              >
                                {agency.website}
                              </a>
                            </p>
                          </div>
                        )}
                      </div>

                      {agency.notes && (
                        <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-800 dark:text-amber-200">
                          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>{agency.notes}</span>
                        </div>
                      )}

                      {/* ── Warning boxes ── */}
                      {isExpired && (
                        <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-sm space-y-1.5">
                          <p className="font-bold text-red-800 dark:text-red-200 flex items-center gap-2">
                            <XCircle className="h-4 w-4 shrink-0" />
                            ⛔ LICENSE EXPIRED — DO NOT PAY THIS AGENCY
                          </p>
                          <p className="text-red-700 dark:text-red-300 leading-relaxed">
                            Before expiry, this agency was authorized to recruit workers for overseas jobs.
                            After expiry, they are no longer licensed. Paying them is risky and may be illegal.
                            Verify current status with NEA before any transaction.
                          </p>
                        </div>
                      )}

                      {isExpiringSoon && !isExpired && (
                        <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-sm space-y-1.5">
                          <p className="font-bold text-amber-800 dark:text-amber-200 flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            ⏰ Expiring Soon — Verify Renewal Status
                          </p>
                          <p className="text-amber-700 dark:text-amber-300 leading-relaxed">
                            This license expires in {daysLeft} day{daysLeft !== 1 ? "s" : ""}. Confirm renewal status with NEA before proceeding with any payment or agreement.
                          </p>
                        </div>
                      )}

                      {isSuspended && (
                        <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-sm space-y-1.5">
                          <p className="font-bold text-amber-800 dark:text-amber-200 flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            ⚠️ LICENSE SUSPENDED
                          </p>
                          <p className="text-amber-700 dark:text-amber-300 leading-relaxed">
                            This agency's license has been suspended by NEA, possibly due to complaints or violations.
                            Do NOT engage until you verify their status is restored.
                          </p>
                        </div>
                      )}

                      {/* ── Safety indicator ── */}
                      <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium ${
                        isExpired
                          ? "bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800"
                          : isSuspended || isExpiringSoon
                          ? "bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800"
                          : "bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800"
                      }`} data-testid={`safety-indicator-${agency.id}`}>
                        <span className="text-base">
                          {isExpired ? "🚨" : isSuspended || isExpiringSoon ? "⚠️" : "✅"}
                        </span>
                        <span>
                          {isExpired
                            ? <><strong>Not safe to work with</strong> — This agency's license has expired.</>
                            : isSuspended
                            ? <><strong>Not safe to work with</strong> — This agency's license has been suspended.</>
                            : isExpiringSoon
                            ? <><strong>Proceed with caution</strong> — Verify license renewal before committing.</>
                            : <><strong>Safe to proceed</strong> — This agency holds a valid NEA license.</>
                          }
                        </span>
                      </div>

                      {/* ── Rate & Claim actions ── */}
                      <div className="pt-1 border-t border-dashed flex items-center gap-1 flex-wrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 gap-1.5 h-7 px-2"
                          data-testid={`button-rate-agency-${agency.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setRatingAgency(agency);
                          }}
                        >
                          <Star className="h-3 w-3" />
                          Rate Agency
                        </Button>
                        {!agency.isVerifiedOwner && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-muted-foreground hover:text-primary gap-1.5 h-7 px-2"
                            data-testid={`button-claim-agency-${agency.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              const isPaid = user && (user as any).plan && (user as any).plan !== "free";
                              if (!isPaid) {
                                openUpgradeModal("feature_locked", "Agency Claim");
                                return;
                              }
                              setClaimAgency(agency);
                              setClaimStep(1);
                              setClaimForm({ contactName: "", contactEmail: "", contactPhone: "", role: "", proofDescription: "" });
                              setProofFiles([]);
                            }}
                          >
                            <Building2 className="h-3 w-3" />
                            Is this your agency? Claim it
                          </Button>
                        )}
                      </div>

                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {filteredAgencies?.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center">
                  <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="font-medium">No agencies found</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {searchQuery ? `No results for "${searchQuery}". Try a different search term.` : "No agencies in the registry yet."}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <Card className="border-dashed border-2">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
                  <Flag className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold">Encountered a suspicious agency?</h3>
                  <p className="text-sm text-muted-foreground">Help protect others by reporting them to us.</p>
                </div>
              </div>
              <Dialog open={isReportOpen} onOpenChange={setIsReportOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-50" data-testid="button-report-agency">
                    <Flag className="h-4 w-4 mr-2" />
                    Report Agency
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Report a Suspicious Agency</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <p className="text-sm text-muted-foreground">
                      Your report helps us protect job seekers. Provide as much detail as possible.
                    </p>
                    <div className="space-y-2">
                      <Label>Agency Name <span className="text-red-500">*</span></Label>
                      <Input
                        placeholder="Enter the agency name"
                        value={reportForm.agencyName}
                        onChange={(e) => setReportForm({ ...reportForm, agencyName: e.target.value })}
                        data-testid="input-report-agency-name"
                      />
                      {(() => {
                        const nc = checkAgencyName(reportForm.agencyName);
                        if (!nc.warning) return null;
                        return (
                          <div className={`flex items-start gap-2 mt-1.5 px-3 py-2 rounded-lg text-xs border ${nc.risk === "HIGH" ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300" : "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300"}`}>
                            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            <span><strong>{nc.risk} risk:</strong> {nc.message}</span>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Your Email (optional)</Label>
                        <Input
                          type="email"
                          placeholder="email@example.com"
                          value={reportForm.reporterEmail}
                          onChange={(e) => setReportForm({ ...reportForm, reporterEmail: e.target.value })}
                          data-testid="input-report-email"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Your Phone (optional)</Label>
                        <Input
                          placeholder="0712 345 678"
                          value={reportForm.reporterPhone}
                          onChange={(e) => setReportForm({ ...reportForm, reporterPhone: e.target.value })}
                          data-testid="input-report-phone"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>What happened? <span className="text-red-500">*</span></Label>
                      <Textarea
                        placeholder="Describe your experience with this agency. Include any details about payments, promises made, documents requested, etc."
                        value={reportForm.description}
                        onChange={(e) => setReportForm({ ...reportForm, description: e.target.value })}
                        rows={4}
                        data-testid="input-report-description"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" onClick={() => setIsReportOpen(false)}>Cancel</Button>
                      <Button onClick={handleReport} disabled={reportMutation.isPending} data-testid="button-submit-report">
                        {reportMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Submit Report
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        <div className="text-center text-xs text-muted-foreground py-4 space-y-1">
          <p className="font-medium">Disclaimer</p>
          <p>This list is provided for public awareness only and may not reflect real-time data.</p>
          <p>Agency information is periodically updated and may be outdated.</p>
          <p>Not affiliated with the National Employment Authority (NEA).</p>
          <p>Always confirm agency status directly with NEA before engaging any agency.</p>
        </div>

        <Dialog open={isEducationOpen} onOpenChange={setIsEducationOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                Important Warning
              </DialogTitle>
            </DialogHeader>
            {selectedAgency && (
              <div className="space-y-4 pt-2">
                <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-lg">
                  <h3 className="font-semibold text-lg">{selectedAgency.agencyName}</h3>
                  <p className="text-sm text-muted-foreground">License: {selectedAgency.licenseNumber}</p>
                  <Badge variant="destructive" className="mt-2">
                    {getAgencyStatus(selectedAgency).label}
                  </Badge>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold text-red-600">What This Means For You</h4>
                  
                  {getAgencyStatus(selectedAgency).status === "expired" && (
                    <div className="space-y-2 text-sm">
                      <div className="flex items-start gap-2">
                        <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                        <p><strong>License Expired:</strong> This agency is no longer authorized to recruit workers for overseas jobs.</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                        <p><strong>High Risk:</strong> Paying an unlicensed agency could result in loss of money with no legal recourse.</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                        <p><strong>Before Expiry:</strong> They could legally charge fees and process job applications.</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                        <p><strong>After Expiry:</strong> Their authority has lapsed. Any fees collected may be illegal.</p>
                      </div>
                    </div>
                  )}

                  {getAgencyStatus(selectedAgency).status === "suspended" && (
                    <div className="space-y-2 text-sm">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                        <p><strong>License Suspended:</strong> NEA has suspended this agency's license, possibly due to complaints or violations.</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                        <p><strong>Do Not Engage:</strong> Until their status is restored, they cannot legally operate.</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                        <p><strong>Suspension Reason:</strong> Could be due to fraud allegations, labor violations, or failure to meet NEA requirements.</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                  <h4 className="font-semibold text-blue-700 dark:text-blue-300 mb-2">What You Should Do</h4>
                  <ol className="list-decimal list-inside text-sm space-y-1 text-blue-800 dark:text-blue-200">
                    <li>Do NOT pay any money to this agency</li>
                    <li>Verify their status directly with NEA (National Employment Authority)</li>
                    <li>Look for agencies with valid, active licenses</li>
                    <li>Report suspicious activity using our Report button</li>
                  </ol>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setReportForm({ ...reportForm, agencyName: selectedAgency.agencyName });
                      setIsEducationOpen(false);
                      setIsReportOpen(true);
                    }}
                    data-testid="button-report-from-popup"
                  >
                    <Flag className="h-4 w-4 mr-2" />
                    Report This Agency
                  </Button>
                  <Button onClick={() => setIsEducationOpen(false)} data-testid="button-close-education">
                    I Understand
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Claim Agency Dialog */}
        <Dialog open={!!claimAgency} onOpenChange={(open) => { if (!open) { setClaimAgency(null); setClaimStep(1); } }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-green-600" />
                Claim Agency Listing
              </DialogTitle>
            </DialogHeader>

            {claimAgency && (
              <div className="space-y-4">
                {/* Agency name header */}
                <div className="p-3 bg-muted rounded-lg">
                  <p className="font-semibold text-sm">{claimAgency.agencyName}</p>
                  <p className="text-xs text-muted-foreground">License: {claimAgency.licenseNumber}</p>
                </div>

                {/* Existing pending claim banner */}
                {existingClaim && existingClaim.status === "pending" && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-2" data-testid="banner-claim-pending">
                    <Clock className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div className="text-sm">
                      <p className="font-semibold text-amber-800 dark:text-amber-200">Claim Under Review</p>
                      <p className="text-amber-700 dark:text-amber-300 text-xs mt-0.5">Your claim submitted on {new Date(existingClaim.submittedAt).toLocaleDateString()} is being reviewed. We'll notify you within 2–3 business days.</p>
                    </div>
                  </div>
                )}

                {existingClaim && existingClaim.status === "rejected" && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-sm" data-testid="banner-claim-rejected">
                    <p className="font-semibold text-red-800 dark:text-red-200">Previous Claim Rejected</p>
                    {existingClaim.reviewNotes && <p className="text-red-700 dark:text-red-300 text-xs mt-0.5">Reason: {existingClaim.reviewNotes}</p>}
                    <p className="text-red-600 dark:text-red-400 text-xs mt-1">You may resubmit with updated proof documents.</p>
                  </div>
                )}

                {/* Not logged in */}
                {!user && claimStep === 1 && (
                  <div className="text-center py-4 space-y-3">
                    <ShieldCheck className="h-12 w-12 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">You need to sign in to claim this agency listing.</p>
                    <a href="/api/login" className="inline-block">
                      <Button className="w-full" data-testid="button-signin-claim">Sign In to Continue</Button>
                    </a>
                  </div>
                )}

                {/* Step 1: Contact details */}
                {user && claimStep === 1 && (!existingClaim || existingClaim.status === "rejected") && (
                  <div className="space-y-3" data-testid="claim-step-1">
                    <p className="text-sm text-muted-foreground">
                      Provide your contact details to verify you're an authorized representative of this agency.
                    </p>
                    <div className="space-y-1">
                      <Label className="text-xs">Your Full Name <span className="text-red-500">*</span></Label>
                      <Input
                        value={claimForm.contactName}
                        onChange={e => setClaimForm(f => ({ ...f, contactName: e.target.value }))}
                        placeholder="John Mwangi"
                        data-testid="input-claim-name"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Business Email <span className="text-red-500">*</span></Label>
                      <Input
                        type="email"
                        value={claimForm.contactEmail}
                        onChange={e => setClaimForm(f => ({ ...f, contactEmail: e.target.value }))}
                        placeholder="you@agency.co.ke"
                        data-testid="input-claim-email"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Phone Number</Label>
                      <Input
                        value={claimForm.contactPhone}
                        onChange={e => setClaimForm(f => ({ ...f, contactPhone: e.target.value }))}
                        placeholder="+254 7XX XXX XXX"
                        data-testid="input-claim-phone"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Your Role <span className="text-red-500">*</span></Label>
                      <Select value={claimForm.role} onValueChange={v => setClaimForm(f => ({ ...f, role: v }))}>
                        <SelectTrigger data-testid="select-claim-role">
                          <SelectValue placeholder="Select your role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="owner">Owner / Director</SelectItem>
                          <SelectItem value="manager">General Manager</SelectItem>
                          <SelectItem value="authorized_rep">Authorized Representative</SelectItem>
                          <SelectItem value="compliance_officer">Compliance Officer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => setClaimStep(2)}
                      disabled={!claimForm.contactName || !claimForm.contactEmail || !claimForm.role}
                      data-testid="button-claim-next"
                    >
                      Next: Upload Proof
                    </Button>
                  </div>
                )}

                {/* Step 2: Upload proof */}
                {user && claimStep === 2 && (
                  <div className="space-y-3" data-testid="claim-step-2">
                    <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-800 dark:text-blue-200">
                      <p className="font-semibold">Required: License Proof</p>
                      <p className="text-xs mt-0.5 text-blue-700 dark:text-blue-300">Upload your NEA license certificate, business registration certificate, or official government document proving ownership. Accepted: JPG, PNG, PDF (max 10MB each, up to 3 files).</p>
                    </div>

                    <div
                      className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="dropzone-proof-upload"
                    >
                      <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm font-medium">Click to upload documents</p>
                      <p className="text-xs text-muted-foreground mt-1">NEA license, business reg, or ID card</p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        className="hidden"
                        onChange={e => setProofFiles(Array.from(e.target.files || []))}
                        data-testid="input-proof-files"
                      />
                    </div>

                    {proofFiles.length > 0 && (
                      <div className="space-y-1">
                        {proofFiles.map((f, i) => (
                          <div key={i} className="flex items-center gap-2 p-2 bg-muted rounded text-xs">
                            <CheckCircle2 className="h-3 w-3 text-green-600 shrink-0" />
                            <span className="flex-1 truncate">{f.name}</span>
                            <span className="text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="space-y-1">
                      <Label className="text-xs">Additional Notes (optional)</Label>
                      <Textarea
                        value={claimForm.proofDescription}
                        onChange={e => setClaimForm(f => ({ ...f, proofDescription: e.target.value }))}
                        placeholder="e.g. 'Attached is our NEA license for 2025–2026. Our director is John Mwangi.'"
                        rows={2}
                        className="text-sm"
                        data-testid="textarea-claim-notes"
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => setClaimStep(1)} data-testid="button-claim-back">
                        Back
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={() => submitClaimMutation.mutate()}
                        disabled={proofFiles.length === 0 || submitClaimMutation.isPending}
                        data-testid="button-claim-submit"
                      >
                        {submitClaimMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit Claim"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      Your submission will be reviewed by our compliance team within 2–3 business days.
                    </p>
                  </div>
                )}

                {/* Step 3: Success */}
                {claimStep === 3 && (
                  <div className="text-center py-6 space-y-4" data-testid="claim-step-3">
                    <div className="h-16 w-16 bg-green-100 dark:bg-green-950 rounded-full flex items-center justify-center mx-auto">
                      <CheckCircle2 className="h-8 w-8 text-green-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">Claim Submitted!</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Your claim for <strong>{claimAgency.agencyName}</strong> has been received.
                      </p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Our compliance team will verify your documents and contact you at <strong>{claimForm.contactEmail}</strong> within 2–3 business days. Once approved, your agency will display a <strong>Verified Owner</strong> badge.
                      </p>
                    </div>
                    <Button onClick={() => { setClaimAgency(null); setClaimStep(1); }} className="w-full" data-testid="button-claim-done">
                      Done
                    </Button>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Rate Agency Modal */}
        {ratingAgency && (
          <RateAgencyModal
            open={!!ratingAgency}
            onOpenChange={(open) => { if (!open) setRatingAgency(null); }}
            licenseNumber={ratingAgency.licenseNumber}
            agencyName={ratingAgency.agencyName}
          />
        )}
      </main>
    </div>
  );
}
