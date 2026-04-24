import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  ShieldCheck,
  ShieldX,
  ShieldAlert,
  Copy,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  ArrowLeft,
  Code,
  QrCode,
  ExternalLink,
} from "lucide-react";

interface CertificateVerification {
  valid: boolean;
  reason?: string;
  certificate: {
    id: string;
    certificateId: string;
    agencyId: string;
    agencyName: string | null;
    licenseNumber: string | null;
    complianceScore: number;
    verificationStatus: string;
    issuedAt: string;
    expiresAt: string;
    status: string;
    revokedReason: string | null;
    metadata: any;
  };
  verifiedAt: string;
}

function statusIcon(status: string, valid: boolean) {
  if (valid) return <ShieldCheck className="w-16 h-16 text-green-500" />;
  if (status === "revoked") return <ShieldX className="w-16 h-16 text-red-500" />;
  if (status === "expired") return <Clock className="w-16 h-16 text-orange-500" />;
  return <ShieldAlert className="w-16 h-16 text-yellow-500" />;
}

function statusBadge(status: string, valid: boolean) {
  if (valid) return <Badge className="bg-green-500 text-white text-lg px-4 py-1" data-testid="badge-valid">VALID</Badge>;
  if (status === "revoked") return <Badge className="bg-red-500 text-white text-lg px-4 py-1" data-testid="badge-revoked">REVOKED</Badge>;
  if (status === "expired") return <Badge className="bg-orange-500 text-white text-lg px-4 py-1" data-testid="badge-expired">EXPIRED</Badge>;
  return <Badge className="bg-yellow-500 text-white text-lg px-4 py-1" data-testid="badge-suspended">SUSPENDED</Badge>;
}

export default function CertificateVerifyPage() {
  const { certificateId } = useParams<{ certificateId: string }>();
  const [showEmbed, setShowEmbed] = useState(false);
  const { toast } = useToast();

  const { data, isLoading, isError, error } = useQuery<CertificateVerification>({
    queryKey: ["/api/certificates/verify", certificateId],
    queryFn: async () => {
      const res = await fetch(`/api/certificates/verify/${certificateId}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.reason || err.message || "Certificate not found");
      }
      return res.json();
    },
    enabled: !!certificateId,
    retry: false,
  });

  const { data: badgeData } = useQuery({
    queryKey: ["/api/certificates/badge", certificateId],
    queryFn: async () => {
      const res = await fetch(`/api/certificates/badge/${certificateId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!certificateId && !!data?.valid,
  });

  if (!certificateId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <ShieldAlert className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-bold mb-2">No Certificate ID</h2>
            <p className="text-muted-foreground">Please provide a valid certificate ID to verify.</p>
            <Link href="/">
              <Button className="mt-4" data-testid="link-home">Go Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="space-y-4 w-full max-w-lg px-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-60 w-full" />
        </div>
      </div>
    );
  }

  if (isError || (!isLoading && !data)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <XCircle className="w-16 h-16 mx-auto mb-4 text-red-500" />
            <h2 className="text-xl font-bold mb-2" data-testid="text-not-found">Certificate Not Found</h2>
            <p className="text-muted-foreground">{(error as Error)?.message || "The certificate ID provided could not be verified."}</p>
            <Link href="/">
              <Button className="mt-4" variant="outline" data-testid="link-home-error">Go Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const cert = data.certificate;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900" data-testid="certificate-verify-page">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="mb-4">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="link-back">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Home
            </Button>
          </Link>
        </div>

        <Card className={`overflow-hidden border-2 ${data.valid ? "border-green-300 dark:border-green-700" : "border-red-300 dark:border-red-700"}`}>
          <div className={`p-6 text-center ${data.valid ? "bg-gradient-to-r from-green-50 to-teal-50 dark:from-green-950 dark:to-teal-950" : "bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950 dark:to-orange-950"}`}>
            {statusIcon(cert.status, data.valid)}
            <div className="mt-3">
              {statusBadge(cert.status, data.valid)}
            </div>
            <h1 className="text-2xl font-bold mt-3" data-testid="text-title">Certificate Verification</h1>
            <p className="text-muted-foreground mt-1">
              {data.valid ? "This certificate is authentic and currently valid." : data.reason}
            </p>
          </div>

          <CardContent className="p-6 space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-bold" data-testid="text-agency-name">{cert.agencyName || "Agency"}</h2>
              <p className="text-sm text-muted-foreground">Verified Employment Agency</p>
            </div>

            <div className="grid grid-cols-2 gap-4" data-testid="cert-details">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground font-medium">Certificate ID</p>
                <p className="font-mono font-bold text-sm" data-testid="text-cert-id">{cert.certificateId}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground font-medium">License Number</p>
                <p className="font-mono font-bold text-sm" data-testid="text-license">{cert.licenseNumber || "N/A"}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground font-medium">Compliance Score</p>
                <p className="font-bold text-lg text-teal-600" data-testid="text-score">{cert.complianceScore}/100</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground font-medium">Status</p>
                <p className="font-bold text-sm capitalize" data-testid="text-status">{cert.verificationStatus}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground font-medium">Issued</p>
                <p className="font-medium text-sm" data-testid="text-issued">{cert.issuedAt ? new Date(cert.issuedAt).toLocaleDateString() : "N/A"}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground font-medium">Expires</p>
                <p className="font-medium text-sm" data-testid="text-expires">{cert.expiresAt ? new Date(cert.expiresAt).toLocaleDateString() : "N/A"}</p>
              </div>
            </div>

            <div className="text-center text-xs text-muted-foreground">
              <p data-testid="text-verified-at">Verified at: {new Date(data.verifiedAt).toLocaleString()}</p>
            </div>

            {data.valid && (
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => setShowEmbed(!showEmbed)}
                  data-testid="button-embed-code"
                >
                  <Code className="w-4 h-4 mr-2" /> {showEmbed ? "Hide" : "Get"} Embed Code
                </Button>
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    toast({ title: "Link copied to clipboard" });
                  }}
                  data-testid="button-copy-link"
                >
                  <Copy className="w-4 h-4 mr-2" /> Copy Link
                </Button>
              </div>
            )}

            {showEmbed && badgeData?.embedCode && (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm">Website Badge Code</h3>
                <p className="text-xs text-muted-foreground">
                  Copy the HTML code below and paste it into your website to display a verified agency badge.
                </p>
                <div className="p-3 bg-muted rounded-lg border">
                  <div className="mb-3 p-3 bg-gradient-to-r from-teal-600 to-sky-600 text-white rounded-lg text-sm font-medium inline-flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" />
                    <span><strong>{badgeData.agencyName}</strong> — Verified Agency</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">Preview above. Copy the code below:</p>
                  <Textarea
                    readOnly
                    value={badgeData.embedCode}
                    className="font-mono text-xs min-h-[100px]"
                    data-testid="textarea-embed-code"
                  />
                  <Button
                    size="sm"
                    className="mt-2"
                    onClick={() => {
                      navigator.clipboard.writeText(badgeData.embedCode);
                      toast({ title: "Embed code copied" });
                    }}
                    data-testid="button-copy-embed"
                  >
                    <Copy className="w-3 h-3 mr-1" /> Copy Code
                  </Button>
                </div>
              </div>
            )}

            {cert.revokedReason && !data.valid && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800" data-testid="revoked-info">
                <p className="text-sm font-medium text-red-700 dark:text-red-300">Reason: {cert.revokedReason}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-6 text-center text-xs text-muted-foreground" data-testid="text-disclaimer">
          <p>This certificate verifies compliance status only. WorkAbroad Hub does not guarantee employment.</p>
          <p>Report suspicious certificates to <Link href="/report-abuse" className="underline">Report Abuse</Link></p>
        </div>
      </div>
    </div>
  );
}
