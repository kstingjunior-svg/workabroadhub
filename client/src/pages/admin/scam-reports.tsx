import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AdminLayout from "@/components/admin-layout";
import {
  ShieldAlert,
  CheckCircle,
  XCircle,
  Trash2,
  ArrowLeft,
  Search,
  MapPin,
  Calendar,
  DollarSign,
  Eye,
  Loader2,
  ImageIcon,
  Clock,
  RefreshCw,
} from "lucide-react";

interface ScamReport {
  id: string;
  agencyName: string;
  country: string | null;
  description: string;
  amountLost: number | null;
  contactInfo: string | null;
  evidenceImages: string[];
  reportedBy: string | null;
  reporterEmail: string | null;
  status: string;
  adminNote: string | null;
  createdAt: string;
}

interface AdminReportsResponse {
  reports: ScamReport[];
  total: number;
  stats: { pending: number; approved: number; rejected: number };
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const statusIcons: Record<string, any> = {
  pending: Clock,
  approved: CheckCircle,
  rejected: XCircle,
};

export default function AdminScamReportsPage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedReport, setSelectedReport] = useState<ScamReport | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery<AdminReportsResponse>({
    queryKey: ["/api/admin/scam-reports", { statusFilter, search, page }],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/admin/scam-reports?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, adminNote }: { id: string; status: string; adminNote: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/scam-reports/${id}`, { status, adminNote });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message || "Update failed");
      return d;
    },
    onSuccess: () => {
      toast({ title: "Report updated successfully" });
      setSelectedReport(null);
      setAdminNote("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/scam-reports"] });
    },
    onError: (error: any) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/scam-reports/${id}`, undefined);
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      toast({ title: "Report deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/scam-reports"] });
    },
    onError: () => {
      toast({ title: "Delete failed", variant: "destructive" });
    },
  });

  function openReview(report: ScamReport) {
    setSelectedReport(report);
    setAdminNote(report.adminNote || "");
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <button className="p-2 hover:bg-muted rounded-lg transition-colors" aria-label="Back to admin">
                <ArrowLeft className="h-5 w-5" />
              </button>
            </Link>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-red-500" />
                Scam Reports
              </h1>
              <p className="text-sm text-muted-foreground">Moderate user-submitted agency scam reports</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="btn-refresh-reports">
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>

        {/* Stats */}
        {data && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Pending", count: data.stats.pending, color: "text-yellow-600", status: "pending" },
              { label: "Approved", count: data.stats.approved, color: "text-green-600", status: "approved" },
              { label: "Rejected", count: data.stats.rejected, color: "text-red-600", status: "rejected" },
            ].map(s => (
              <Card key={s.status} className={`cursor-pointer transition-colors ${statusFilter === s.status ? "border-primary" : ""}`} onClick={() => { setStatusFilter(s.status); setPage(1); }}>
                <CardContent className="pt-3 pb-3 text-center">
                  <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by agency name..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
              data-testid="input-admin-search"
            />
          </div>
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-36" data-testid="select-admin-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Reports Table */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : !data?.reports.length ? (
          <Card>
            <CardContent className="pt-8 pb-8 text-center">
              <ShieldAlert className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No reports found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {data.reports.map(report => {
              const StatusIcon = statusIcons[report.status] || Clock;
              return (
                <Card key={report.id} data-testid={`card-report-${report.id}`}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm">{report.agencyName}</h3>
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[report.status]}`}>
                            <StatusIcon className="h-3 w-3" />
                            {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                          </span>
                          {report.country && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <MapPin className="h-3 w-3" />{report.country}
                            </span>
                          )}
                          {report.amountLost && (
                            <span className="text-xs text-red-600 flex items-center gap-1">
                              <DollarSign className="h-3 w-3" />KES {report.amountLost.toLocaleString()}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{report.description}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(report.createdAt).toLocaleDateString()}
                          </span>
                          {report.evidenceImages?.length > 0 && (
                            <span className="flex items-center gap-1">
                              <ImageIcon className="h-3 w-3" />
                              {report.evidenceImages.length} image{report.evidenceImages.length > 1 ? "s" : ""}
                            </span>
                          )}
                          {report.reporterEmail && (
                            <span>By: {report.reporterEmail}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openReview(report)}
                          data-testid={`btn-review-${report.id}`}
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          Review
                        </Button>
                        {report.status === "pending" && (
                          <>
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => updateMutation.mutate({ id: report.id, status: "approved", adminNote: "" })}
                              disabled={updateMutation.isPending}
                              data-testid={`btn-approve-${report.id}`}
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => updateMutation.mutate({ id: report.id, status: "rejected", adminNote: "" })}
                              disabled={updateMutation.isPending}
                              data-testid={`btn-reject-${report.id}`}
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => { if (confirm("Delete this report permanently?")) deleteMutation.mutate(report.id); }}
                          disabled={deleteMutation.isPending}
                          data-testid={`btn-delete-${report.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Review Dialog */}
      {selectedReport && (
        <Dialog open={!!selectedReport} onOpenChange={open => !open && setSelectedReport(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-red-500" />
                {selectedReport.agencyName}
              </DialogTitle>
              <DialogDescription>Review and moderate this report</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Report details */}
              <div className="space-y-2 text-sm">
                {selectedReport.country && <p><strong>Country:</strong> {selectedReport.country}</p>}
                {selectedReport.amountLost && <p><strong>Amount Lost:</strong> KES {selectedReport.amountLost.toLocaleString()}</p>}
                {selectedReport.contactInfo && <p><strong>Agency Contact:</strong> {selectedReport.contactInfo}</p>}
                {selectedReport.reporterEmail && <p><strong>Reported by:</strong> {selectedReport.reporterEmail}</p>}
                <p><strong>Date:</strong> {new Date(selectedReport.createdAt).toLocaleString()}</p>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium">Description</p>
                <p className="text-sm text-muted-foreground bg-muted rounded-lg p-3 whitespace-pre-wrap">{selectedReport.description}</p>
              </div>

              {selectedReport.evidenceImages?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Evidence Images</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedReport.evidenceImages.map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt={`Evidence ${i + 1}`}
                        className="w-20 h-20 object-cover rounded-lg border cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => setLightboxImage(url)}
                        loading="lazy"
                        data-testid={`img-evidence-dialog-${i}`}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Admin Note (optional)</label>
                <Textarea
                  value={adminNote}
                  onChange={e => setAdminNote(e.target.value)}
                  placeholder="Add a note about this decision..."
                  rows={2}
                  data-testid="textarea-admin-note"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => updateMutation.mutate({ id: selectedReport.id, status: "approved", adminNote })}
                  disabled={updateMutation.isPending}
                  data-testid="btn-dialog-approve"
                >
                  {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle className="h-4 w-4 mr-1" />Approve</>}
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => updateMutation.mutate({ id: selectedReport.id, status: "rejected", adminNote })}
                  disabled={updateMutation.isPending}
                  data-testid="btn-dialog-reject"
                >
                  {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><XCircle className="h-4 w-4 mr-1" />Reject</>}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Lightbox */}
      <Dialog open={!!lightboxImage} onOpenChange={open => !open && setLightboxImage(null)}>
        <DialogContent className="max-w-2xl p-2">
          <DialogHeader className="sr-only">
            <DialogTitle>Evidence Image</DialogTitle>
          </DialogHeader>
          {lightboxImage && <img src={lightboxImage} alt="Evidence" className="w-full rounded-lg object-contain max-h-[80vh]" />}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
