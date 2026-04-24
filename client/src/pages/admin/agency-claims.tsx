import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchCsrfToken } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ShieldCheck, Clock, CheckCircle2, XCircle, FileText, Eye, Loader2, Building2, RefreshCcw } from "lucide-react";

interface AgencyClaim {
  id: string;
  agencyId: string;
  agencyName: string;
  licenseNumber: string;
  userId: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  role: string;
  status: "pending" | "approved" | "rejected";
  proofFiles: Array<{ filename: string; originalName: string; mimetype: string; size: number }>;
  proofDescription: string | null;
  reviewedBy: string | null;
  reviewNotes: string | null;
  reviewedAt: string | null;
  submittedAt: string;
}

interface ClaimStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

const roleLabels: Record<string, string> = {
  owner: "Owner / Director",
  manager: "General Manager",
  authorized_rep: "Authorized Representative",
  compliance_officer: "Compliance Officer",
};

export default function AdminAgencyClaims() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [selectedClaim, setSelectedClaim] = useState<AgencyClaim | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const { data: stats } = useQuery<ClaimStats>({
    queryKey: ["/api/admin/agency-claims/stats"],
  });

  const { data: claims, isLoading } = useQuery<AgencyClaim[]>({
    queryKey: ["/api/admin/agency-claims", statusFilter],
    queryFn: async () => {
      const url = statusFilter && statusFilter !== "_all"
        ? `/api/admin/agency-claims?status=${statusFilter}`
        : "/api/admin/agency-claims";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const csrfToken = await fetchCsrfToken();
      const res = await fetch(`/api/admin/agency-claims/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        credentials: "include",
        body: JSON.stringify({ reviewNotes }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Claim approved", description: "Agency is now verified with owner badge." });
      setSelectedClaim(null);
      setReviewNotes("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agency-claims"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agency-claims/stats"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!reviewNotes.trim()) throw new Error("Rejection reason is required");
      const csrfToken = await fetchCsrfToken();
      const res = await fetch(`/api/admin/agency-claims/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        credentials: "include",
        body: JSON.stringify({ reviewNotes }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Claim rejected", description: "Applicant will be notified." });
      setSelectedClaim(null);
      setReviewNotes("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agency-claims"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agency-claims/stats"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const statusBadge = (status: string) => {
    if (status === "approved") return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
    if (status === "rejected") return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
    return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
  };

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-green-600" />
        <div>
          <h1 className="text-2xl font-bold">Agency Claim Requests</h1>
          <p className="text-sm text-muted-foreground">Review and approve ownership claims from agency representatives.</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Claims", value: stats?.total ?? 0, icon: Building2, color: "text-primary" },
          { label: "Pending Review", value: stats?.pending ?? 0, icon: Clock, color: "text-amber-600" },
          { label: "Approved", value: stats?.approved ?? 0, icon: CheckCircle2, color: "text-green-600" },
          { label: "Rejected", value: stats?.rejected ?? 0, icon: XCircle, color: "text-red-600" },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Label className="text-sm whitespace-nowrap">Filter by status:</Label>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" data-testid="select-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All Claims</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/agency-claims"] })}
          data-testid="button-refresh-claims"
        >
          <RefreshCcw className="h-4 w-4" />
        </Button>
      </div>

      {/* Claims list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Card key={i}><CardContent className="p-4 h-20 animate-pulse bg-muted" /></Card>)}
        </div>
      ) : claims?.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No claims found</p>
            <p className="text-sm text-muted-foreground">No {statusFilter !== "_all" ? statusFilter : ""} claim requests.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {claims?.map(claim => (
            <Card key={claim.id} data-testid={`card-claim-${claim.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm truncate">{claim.agencyName}</h3>
                      {statusBadge(claim.status)}
                    </div>
                    <p className="text-xs text-muted-foreground">License: {claim.licenseNumber}</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-2">
                      <div><span className="text-muted-foreground">Claimant: </span><span className="font-medium">{claim.contactName}</span></div>
                      <div><span className="text-muted-foreground">Role: </span><span>{roleLabels[claim.role] || claim.role}</span></div>
                      <div><span className="text-muted-foreground">Email: </span><span>{claim.contactEmail}</span></div>
                      {claim.contactPhone && <div><span className="text-muted-foreground">Phone: </span><span>{claim.contactPhone}</span></div>}
                      <div><span className="text-muted-foreground">Files: </span><span>{Array.isArray(claim.proofFiles) ? claim.proofFiles.length : 0} uploaded</span></div>
                      <div><span className="text-muted-foreground">Submitted: </span><span>{new Date(claim.submittedAt).toLocaleDateString("en-GB")}</span></div>
                    </div>
                    {claim.reviewNotes && (
                      <div className="mt-2 p-2 bg-muted rounded text-xs">
                        <span className="font-medium">Review notes: </span>{claim.reviewNotes}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setSelectedClaim(claim); setReviewNotes(""); }}
                    data-testid={`button-review-claim-${claim.id}`}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Review
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Review Dialog */}
      <Dialog open={!!selectedClaim} onOpenChange={(open) => { if (!open) setSelectedClaim(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Review Claim — {selectedClaim?.agencyName}</DialogTitle>
          </DialogHeader>

          {selectedClaim && (
            <div className="space-y-4">
              {/* Agency & Claimant Info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-1 p-3 bg-muted rounded-lg">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Agency</p>
                  <p className="font-medium">{selectedClaim.agencyName}</p>
                  <p className="text-xs text-muted-foreground">{selectedClaim.licenseNumber}</p>
                </div>
                <div className="space-y-1 p-3 bg-muted rounded-lg">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Claimant</p>
                  <p className="font-medium">{selectedClaim.contactName}</p>
                  <p className="text-xs text-muted-foreground">{roleLabels[selectedClaim.role] || selectedClaim.role}</p>
                  <p className="text-xs">{selectedClaim.contactEmail}</p>
                  {selectedClaim.contactPhone && <p className="text-xs">{selectedClaim.contactPhone}</p>}
                </div>
              </div>

              {/* Proof files */}
              {Array.isArray(selectedClaim.proofFiles) && selectedClaim.proofFiles.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Proof Documents ({selectedClaim.proofFiles.length})</p>
                  {selectedClaim.proofFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 border rounded text-xs">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate">{f.originalName}</span>
                      <span className="text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                      <a
                        href={`/api/uploads/agency-claims/${f.filename}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                        data-testid={`link-proof-${i}`}
                      >
                        View
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 border rounded text-sm text-muted-foreground text-center">No proof files uploaded</div>
              )}

              {/* Description */}
              {selectedClaim.proofDescription && (
                <div className="p-3 bg-muted rounded text-sm">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Claimant Notes</p>
                  <p>{selectedClaim.proofDescription}</p>
                </div>
              )}

              {/* Review notes */}
              {selectedClaim.status === "pending" && (
                <div className="space-y-1">
                  <Label className="text-sm">Review Notes {selectedClaim.status === "pending" && "(required for rejection)"}</Label>
                  <Textarea
                    value={reviewNotes}
                    onChange={e => setReviewNotes(e.target.value)}
                    placeholder="Add notes about this claim decision..."
                    rows={3}
                    data-testid="textarea-review-notes"
                  />
                </div>
              )}

              {/* Already reviewed info */}
              {selectedClaim.status !== "pending" && selectedClaim.reviewNotes && (
                <div className="p-3 bg-muted rounded text-sm">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Review Decision</p>
                  <p>{selectedClaim.reviewNotes}</p>
                  {selectedClaim.reviewedAt && (
                    <p className="text-xs text-muted-foreground mt-1">Reviewed: {new Date(selectedClaim.reviewedAt).toLocaleDateString("en-GB")}</p>
                  )}
                </div>
              )}

              {/* Action buttons */}
              {selectedClaim.status === "pending" && (
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => rejectMutation.mutate(selectedClaim.id)}
                    disabled={rejectMutation.isPending || approveMutation.isPending}
                    data-testid="button-reject-claim"
                  >
                    {rejectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><XCircle className="h-4 w-4 mr-1" />Reject</>}
                  </Button>
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={() => approveMutation.mutate(selectedClaim.id)}
                    disabled={approveMutation.isPending || rejectMutation.isPending}
                    data-testid="button-approve-claim"
                  >
                    {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4 mr-1" />Approve & Verify</>}
                  </Button>
                </div>
              )}

              {selectedClaim.status !== "pending" && (
                <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-muted text-sm">
                  {selectedClaim.status === "approved"
                    ? <><CheckCircle2 className="h-4 w-4 text-green-600" /> This claim was approved. Agency has verified owner badge.</>
                    : <><XCircle className="h-4 w-4 text-red-600" /> This claim was rejected.</>}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
