import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  Building2,
  FileText,
  Globe,
  Mail,
  QrCode,
  ArrowLeft,
  Info,
  Star,
  TrendingUp,
  Lock,
  Eye,
  Briefcase,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

interface VerificationResult {
  id: string;
  agencyName: string;
  licenseNumber: string;
  email: string;
  website: string;
  serviceType: string;
  issueDate: string;
  expiryDate: string;
  licenseStatus: string;
  isBlacklisted: boolean;
  legitimacyScore: {
    overallScore: number;
    tier: string;
  } | null;
  hasFraudWarnings: boolean;
  fraudWarningCount: number;
}

interface AgencyDetail extends VerificationResult {
  lastUpdated: string;
  legitimacyScore: {
    overallScore: number;
    tier: string;
    licenseStatusScore: number;
    complianceHistoryScore: number;
    paymentTransparencyScore: number;
    governmentVerificationScore: number;
    userFeedbackScore: number;
    longevityScore: number;
    lastCalculatedAt: string;
  } | null;
  fraudWarnings: {
    ruleTriggered: string;
    severity: string;
    description: string;
    createdAt: string;
  }[];
}

function getTierConfig(tier: string) {
  switch (tier) {
    case "platinum":
      return { label: "Platinum", color: "bg-gradient-to-r from-slate-600 to-slate-400 text-white", icon: Star, textColor: "text-slate-600" };
    case "gold":
      return { label: "Gold", color: "bg-gradient-to-r from-yellow-600 to-yellow-400 text-white", icon: Shield, textColor: "text-yellow-600" };
    case "silver":
      return { label: "Silver", color: "bg-gradient-to-r from-gray-400 to-gray-300 text-gray-900", icon: Shield, textColor: "text-gray-500" };
    case "caution":
      return { label: "Caution", color: "bg-gradient-to-r from-orange-500 to-orange-400 text-white", icon: AlertTriangle, textColor: "text-orange-500" };
    case "high_risk":
      return { label: "High Risk", color: "bg-gradient-to-r from-red-600 to-red-500 text-white", icon: ShieldX, textColor: "text-red-600" };
    default:
      return { label: "Unknown", color: "bg-gray-200 text-gray-700", icon: Shield, textColor: "text-gray-400" };
  }
}

function getStatusConfig(status: string) {
  switch (status) {
    case "valid":
      return { label: "Valid License", variant: "default" as const, icon: CheckCircle2, bgColor: "bg-green-50 dark:bg-green-950", borderColor: "border-green-200 dark:border-green-800", textColor: "text-green-700 dark:text-green-300" };
    case "expired":
      return { label: "Expired License", variant: "destructive" as const, icon: Clock, bgColor: "bg-amber-50 dark:bg-amber-950", borderColor: "border-amber-200 dark:border-amber-800", textColor: "text-amber-700 dark:text-amber-300" };
    case "suspended":
      return { label: "Suspended", variant: "destructive" as const, icon: XCircle, bgColor: "bg-red-50 dark:bg-red-950", borderColor: "border-red-200 dark:border-red-800", textColor: "text-red-700 dark:text-red-300" };
    case "blacklisted":
      return { label: "Blacklisted", variant: "destructive" as const, icon: ShieldX, bgColor: "bg-red-50 dark:bg-red-950", borderColor: "border-red-200 dark:border-red-800", textColor: "text-red-700 dark:text-red-300" };
    default:
      return { label: "Unknown", variant: "secondary" as const, icon: Info, bgColor: "bg-gray-50 dark:bg-gray-900", borderColor: "border-gray-200 dark:border-gray-800", textColor: "text-gray-600 dark:text-gray-400" };
  }
}

function ScoreGauge({ score, tier }: { score: number; tier: string }) {
  const config = getTierConfig(tier);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8" className="text-gray-200 dark:text-gray-700" />
          <circle
            cx="50" cy="50" r="42" fill="none"
            stroke="url(#scoreGradient)" strokeWidth="8"
            strokeDasharray={`${(score / 100) * 264} 264`}
            strokeLinecap="round"
          />
          <defs>
            <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={score >= 75 ? "#22c55e" : score >= 40 ? "#f59e0b" : "#ef4444"} />
              <stop offset="100%" stopColor={score >= 75 ? "#16a34a" : score >= 40 ? "#d97706" : "#dc2626"} />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold" data-testid="text-score-value">{score}</span>
          <span className="text-[10px] text-muted-foreground">/100</span>
        </div>
      </div>
      <Badge className={config.color} data-testid="badge-tier">
        <config.icon className="h-3 w-3 mr-1" />
        {config.label}
      </Badge>
    </div>
  );
}

function QrCodeDialog({ agencyId, agencyName }: { agencyId: string; agencyName: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const { data, isLoading } = useQuery<{ qrCode: string; verifyUrl: string; agencyName: string; licenseNumber: string }>({
    queryKey: ["/api/verify/qr", agencyId],
    queryFn: async () => {
      const res = await fetch(`/api/verify/qr/${agencyId}`);
      if (!res.ok) throw new Error("Failed to generate QR code");
      return res.json();
    },
    enabled: isOpen,
  });

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid={`button-qr-${agencyId}`}>
          <QrCode className="h-4 w-4 mr-2" />
          QR Code
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Verification QR Code</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          {isLoading ? (
            <Skeleton className="w-[300px] h-[300px]" />
          ) : data ? (
            <>
              <img src={data.qrCode} alt={`QR Code for ${agencyName}`} className="w-[300px] h-[300px]" data-testid="img-qr-code" />
              <p className="text-sm text-center text-muted-foreground">
                Scan this QR code to verify <strong>{agencyName}</strong> on any device
              </p>
              <p className="text-xs text-muted-foreground break-all text-center">{data.verifyUrl}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Failed to generate QR code</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AgencySearchResult({ agency, onSelect }: { agency: VerificationResult; onSelect: (id: string) => void }) {
  const statusConfig = getStatusConfig(agency.licenseStatus);
  const StatusIcon = statusConfig.icon;
  const tierConfig = agency.legitimacyScore ? getTierConfig(agency.legitimacyScore.tier) : null;

  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md border ${statusConfig.borderColor}`}
      onClick={() => onSelect(agency.id)}
      data-testid={`card-agency-${agency.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="font-semibold text-base truncate" data-testid={`text-agency-name-${agency.id}`}>
                {agency.agencyName}
              </h3>
              {agency.isBlacklisted && (
                <Badge variant="destructive" className="text-xs" data-testid={`badge-blacklisted-${agency.id}`}>
                  <ShieldX className="h-3 w-3 mr-1" />
                  Blacklisted
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mb-2" data-testid={`text-license-${agency.id}`}>
              License: {agency.licenseNumber}
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant={statusConfig.variant} className="text-xs">
                <StatusIcon className="h-3 w-3 mr-1" />
                {statusConfig.label}
              </Badge>
              {tierConfig && agency.legitimacyScore && (
                <Badge className={`text-xs ${tierConfig.color}`}>
                  <tierConfig.icon className="h-3 w-3 mr-1" />
                  {tierConfig.label} ({agency.legitimacyScore.overallScore}/100)
                </Badge>
              )}
              {agency.hasFraudWarnings && (
                <Badge variant="destructive" className="text-xs">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {agency.fraudWarningCount} Warning{agency.fraudWarningCount !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex-shrink-0">
            <QrCodeDialog agencyId={agency.id} agencyName={agency.agencyName} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface LicenseStatusResponse {
  licenseNumber: string;
  status: string;
  verificationMethod: string;
  manuallyVerified: boolean;
  governmentSystemAvailable: boolean;
  message?: string;
  legalDisclaimer?: string;
  manualVerificationExpiry?: string;
  syncRequired?: boolean;
}

function AgencyDetailView({ agencyId, onBack }: { agencyId: string; onBack: () => void }) {
  const { data: agency, isLoading, error } = useQuery<AgencyDetail>({
    queryKey: ["/api/verify/agency", agencyId],
    queryFn: async () => {
      const res = await fetch(`/api/verify/agency/${agencyId}`);
      if (!res.ok) throw new Error("Agency not found");
      return res.json();
    },
  });

  const { data: licenseStatus } = useQuery<LicenseStatusResponse>({
    queryKey: ["/api/license-status", "nea_kenya", agency?.licenseNumber],
    queryFn: async () => {
      const res = await fetch(`/api/license-status/nea_kenya/${encodeURIComponent(agency!.licenseNumber)}`);
      if (!res.ok) throw new Error("License status unavailable");
      return res.json();
    },
    enabled: !!agency?.licenseNumber,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !agency) {
    return (
      <Card className="border-red-200 dark:border-red-800">
        <CardContent className="p-6 text-center">
          <ShieldX className="h-12 w-12 mx-auto mb-4 text-red-500" />
          <h3 className="text-lg font-semibold mb-2">Agency Not Found</h3>
          <p className="text-muted-foreground mb-4">The agency you're looking for could not be found in our records.</p>
          <Button onClick={onBack} variant="outline" data-testid="button-back-to-search">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Search
          </Button>
        </CardContent>
      </Card>
    );
  }

  const statusConfig = getStatusConfig(agency.licenseStatus);
  const StatusIcon = statusConfig.icon;

  return (
    <div className="space-y-6">
      <Button onClick={onBack} variant="ghost" size="sm" data-testid="button-back">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Search
      </Button>

      {agency.isBlacklisted && (
        <Card className="border-red-500 bg-red-50 dark:bg-red-950">
          <CardContent className="p-4 flex items-start gap-3">
            <ShieldX className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-red-800 dark:text-red-200">Agency Blacklisted</h4>
              <p className="text-sm text-red-700 dark:text-red-300">
                This agency has been blacklisted due to fraudulent activity. Do not engage with this agency for employment services.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {agency.hasFraudWarnings && !agency.isBlacklisted && (
        <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-amber-800 dark:text-amber-200">Fraud Warnings Active</h4>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                This agency has {agency.fraudWarningCount} active fraud warning{agency.fraudWarningCount !== 1 ? "s" : ""}. Exercise caution before engaging.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manual Verification / Government Downtime Indicator */}
      {licenseStatus && !licenseStatus.governmentSystemAvailable && licenseStatus.manuallyVerified && (
        <Card className="border-blue-400 bg-blue-50 dark:bg-blue-950/30" data-testid="card-manually-verified">
          <CardContent className="p-4 flex items-start gap-3">
            <Shield className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="font-semibold text-blue-800 dark:text-blue-200 flex items-center gap-2">
                Temporarily Manually Verified
                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-xs">
                  Manual Override
                </Badge>
              </h4>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                {licenseStatus.message || "This license has been temporarily verified by WorkAbroad Hub staff while the government system is unavailable."}
              </p>
              {licenseStatus.manualVerificationExpiry && (
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  Temporary verification valid until: {new Date(licenseStatus.manualVerificationExpiry).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </p>
              )}
              {licenseStatus.legalDisclaimer && (
                <p className="text-xs text-blue-500 dark:text-blue-400 mt-1 italic">
                  {licenseStatus.legalDisclaimer}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {licenseStatus && !licenseStatus.governmentSystemAvailable && !licenseStatus.manuallyVerified && (
        <Card className="border-orange-400 bg-orange-50 dark:bg-orange-950/30" data-testid="card-gov-unavailable">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 text-orange-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-orange-800 dark:text-orange-200">Government System Unavailable</h4>
              <p className="text-sm text-orange-700 dark:text-orange-300">
                The NEA government verification system is temporarily unavailable. License status may not reflect real-time data. Please check back later or contact support for manual verification.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-xl mb-2" data-testid="text-detail-agency-name">{agency.agencyName}</CardTitle>
              <Badge variant={statusConfig.variant} className="text-sm">
                <StatusIcon className="h-4 w-4 mr-1" />
                {statusConfig.label}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <QrCodeDialog agencyId={agency.id} agencyName={agency.agencyName} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">License Number:</span>
                <span className="font-medium" data-testid="text-detail-license">{agency.licenseNumber}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Service Type:</span>
                <span className="font-medium">{agency.serviceType || "Not specified"}</span>
              </div>
              {agency.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Email:</span>
                  <span className="font-medium">{agency.email}</span>
                </div>
              )}
              {agency.website && (
                <div className="flex items-center gap-2 text-sm">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Website:</span>
                  <a href={agency.website} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">{agency.website}</a>
                </div>
              )}
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Issued:</span>
                <span className="font-medium">
                  {agency.issueDate ? new Date(agency.issueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "N/A"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Expires:</span>
                <span className={`font-medium ${agency.licenseStatus === "expired" ? "text-red-600" : ""}`}>
                  {agency.expiryDate ? new Date(agency.expiryDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "N/A"}
                </span>
              </div>
              {agency.lastUpdated && (
                <div className="flex items-center gap-2 text-sm">
                  <Eye className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Last Updated:</span>
                  <span className="font-medium">
                    {new Date(agency.lastUpdated).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {agency.legitimacyScore && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5" />
              Legitimacy Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row items-center gap-8">
              <ScoreGauge score={agency.legitimacyScore.overallScore} tier={agency.legitimacyScore.tier} />
              <div className="flex-1 w-full space-y-3">
                {[
                  { label: "License Status", score: agency.legitimacyScore.licenseStatusScore, maxWeight: 30, icon: FileText },
                  { label: "Compliance History", score: agency.legitimacyScore.complianceHistoryScore, maxWeight: 15, icon: ShieldCheck },
                  { label: "Payment Transparency", score: agency.legitimacyScore.paymentTransparencyScore, maxWeight: 10, icon: Lock },
                  { label: "Government Verification", score: agency.legitimacyScore.governmentVerificationScore, maxWeight: 20, icon: Building2 },
                  { label: "User Feedback", score: agency.legitimacyScore.userFeedbackScore, maxWeight: 5, icon: Star },
                  { label: "Longevity", score: agency.legitimacyScore.longevityScore, maxWeight: 10, icon: Calendar },
                ].map(({ label, score, maxWeight, icon: Icon }) => {
                  const normalizedPercent = maxWeight > 0 ? Math.max(0, Math.min(100, (score / maxWeight) * 100)) : 0;
                  const isNegative = score < 0;
                  return (
                    <div key={label} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Icon className="h-3.5 w-3.5" />
                          {label}
                        </span>
                        <span className={`font-medium ${isNegative ? "text-red-600" : ""}`}>
                          {Math.round(score)}/{maxWeight}
                        </span>
                      </div>
                      <Progress value={normalizedPercent} className="h-2" />
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground pt-2">
                  Last calculated: {new Date(agency.legitimacyScore.lastCalculatedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {agency.fraudWarnings && agency.fraudWarnings.length > 0 && (
        <Card className="border-red-200 dark:border-red-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-red-700 dark:text-red-300">
              <AlertTriangle className="h-5 w-5" />
              Fraud Warnings ({agency.fraudWarnings.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {agency.fraudWarnings.map((warning, idx) => (
                <div key={idx} className="p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={warning.severity === "critical" ? "destructive" : "secondary"} className="text-xs">
                      {warning.severity}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {warning.ruleTriggered.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="text-sm">{warning.description}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Flagged: {new Date(warning.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800 dark:text-blue-200">
              <p className="font-medium mb-1">Disclaimer</p>
              <p>
                This verification portal provides information based on records maintained by WorkAbroad Hub.
                Always verify agency credentials independently through the{" "}
                <a href="https://nea.go.ke" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                  National Employment Authority (NEA)
                </a>{" "}
                official website. WorkAbroad Hub does not guarantee employment outcomes or agency performance.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function VerifyPage() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedAgencyId, setSelectedAgencyId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const agencyParam = params.get("agency");
    if (agencyParam) {
      setSelectedAgencyId(agencyParam);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: results, isLoading } = useQuery<VerificationResult[]>({
    queryKey: ["/api/verify/search", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) return [];
      const res = await fetch(`/api/verify/search?q=${encodeURIComponent(debouncedQuery)}`);
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: debouncedQuery.length >= 2,
  });

  const handleSelectAgency = (id: string) => {
    setSelectedAgencyId(id);
    window.history.replaceState(null, "", `/verify?agency=${id}`);
  };

  const handleBack = () => {
    setSelectedAgencyId(null);
    window.history.replaceState(null, "", "/verify");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 rounded-full bg-primary/10">
              <ShieldCheck className="h-8 w-8 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">Agency Verification Portal</h1>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Verify the legitimacy of employment agencies before engaging their services.
            Search by agency name, license number, or ID.
          </p>
        </div>

        {selectedAgencyId ? (
          <AgencyDetailView agencyId={selectedAgencyId} onBack={handleBack} />
        ) : (
          <div className="space-y-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search by agency name, license number, or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-12 text-base"
                data-testid="input-search"
              />
            </div>

            {isLoading && debouncedQuery.length >= 2 && (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            )}

            {results && results.length > 0 && (
              <div className="space-y-3" data-testid="search-results">
                <p className="text-sm text-muted-foreground">
                  {results.length} result{results.length !== 1 ? "s" : ""} found
                </p>
                {results.map((agency) => (
                  <AgencySearchResult key={agency.id} agency={agency} onSelect={handleSelectAgency} />
                ))}
              </div>
            )}

            {results && results.length === 0 && debouncedQuery.length >= 2 && !isLoading && (
              <Card className="border-dashed">
                <CardContent className="p-8 text-center">
                  <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                  <h3 className="text-lg font-medium mb-1">No Agencies Found</h3>
                  <p className="text-muted-foreground text-sm">
                    No agencies match "{debouncedQuery}". Try a different search term.
                  </p>
                </CardContent>
              </Card>
            )}

            {(!debouncedQuery || debouncedQuery.length < 2) && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
                <Card className="text-center p-6">
                  <ShieldCheck className="h-8 w-8 mx-auto mb-2 text-green-600" />
                  <h3 className="font-medium text-sm mb-1">License Status</h3>
                  <p className="text-xs text-muted-foreground">Check if an agency holds a valid NEA license</p>
                </Card>
                <Card className="text-center p-6">
                  <TrendingUp className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                  <h3 className="font-medium text-sm mb-1">Trust Score</h3>
                  <p className="text-xs text-muted-foreground">View the agency's legitimacy score and tier</p>
                </Card>
                <Card className="text-center p-6">
                  <ShieldAlert className="h-8 w-8 mx-auto mb-2 text-amber-600" />
                  <h3 className="font-medium text-sm mb-1">Fraud Alerts</h3>
                  <p className="text-xs text-muted-foreground">See active warnings and fraud investigations</p>
                </Card>
              </div>
            )}

            <Separator />

            <div className="text-center text-xs text-muted-foreground space-y-1">
              <p>Data sourced from WorkAbroad Hub agency registry.</p>
              <p>
                For official NEA verification, visit{" "}
                <a href="https://nea.go.ke" target="_blank" rel="noopener noreferrer" className="underline">nea.go.ke</a>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
