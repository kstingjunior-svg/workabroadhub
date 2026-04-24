import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin-layout";
import {
  RefreshCw, CheckCircle2, XCircle, Clock, AlertTriangle, FileSearch, BarChart3,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { RefundRequest } from "@shared/schema";

type ReconciliationReport = {
  generatedAt: string;
  summary: {
    totalPayments: number;
    byStatus: Record<string, number>;
    totalMpesaTransactions: number;
    orphanCallbacks: number;
    duplicateReceipts: number;
    successPaymentsWithoutReceipts: number;
    refundPending: number;
  };
  issues: {
    duplicateReceipts: { receipt: string; count: number }[];
    paymentsWithoutReceipts: { paymentId: string; userId: string; amount: number; createdAt: string }[];
    orphanCallbacks: { phone: string; amount: number; receipt: string; date: string }[];
  };
};

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending:   { label: "Pending",   variant: "secondary" },
  approved:  { label: "Approved",  variant: "default" },
  rejected:  { label: "Rejected",  variant: "destructive" },
  processed: { label: "Processed", variant: "outline" },
};

export default function AdminRefunds() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<RefundRequest | null>(null);
  const [dialogStatus, setDialogStatus] = useState<"approved" | "rejected" | "processed">("approved");
  const [adminNotes, setAdminNotes] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showReport, setShowReport] = useState(false);

  const { data: refunds, isLoading } = useQuery<RefundRequest[]>({
    queryKey: ["/api/admin/refund-requests"],
  });

  const { data: report, isLoading: reportLoading, refetch: fetchReport } = useQuery<ReconciliationReport>({
    queryKey: ["/api/admin/reconciliation-report"],
    enabled: showReport,
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/refund-requests/${id}`, { status, adminNotes: notes });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/refund-requests"] });
      setSelected(null);
      setAdminNotes("");
      toast({ title: "Refund request updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const filtered = (refunds ?? []).filter(r => statusFilter === "all" || r.status === statusFilter);

  function openDialog(r: RefundRequest, defaultStatus: "approved" | "rejected" | "processed") {
    setSelected(r);
    setDialogStatus(defaultStatus);
    setAdminNotes(r.adminNotes ?? "");
  }

  const stats = {
    total: (refunds ?? []).length,
    pending: (refunds ?? []).filter(r => r.status === "pending").length,
    approved: (refunds ?? []).filter(r => r.status === "approved").length,
    processed: (refunds ?? []).filter(r => r.status === "processed").length,
  };

  return (
    <AdminLayout title="Refund Dashboard">
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Refund Dashboard</h1>
            <p className="text-muted-foreground text-sm">Review and process payment refund requests</p>
          </div>
          <Button
            variant={showReport ? "default" : "outline"}
            onClick={() => { setShowReport(s => !s); if (!showReport) fetchReport(); }}
            data-testid="button-toggle-report"
          >
            <FileSearch className="w-4 h-4 mr-2" />
            {showReport ? "Hide" : "Reconciliation Report"}
          </Button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total", value: stats.total, icon: <AlertTriangle className="w-4 h-4" />, color: "text-foreground" },
            { label: "Pending", value: stats.pending, icon: <Clock className="w-4 h-4" />, color: "text-yellow-600" },
            { label: "Approved", value: stats.approved, icon: <CheckCircle2 className="w-4 h-4" />, color: "text-green-600" },
            { label: "Processed", value: stats.processed, icon: <RefreshCw className="w-4 h-4" />, color: "text-blue-600" },
          ].map(s => (
            <Card key={s.label} data-testid={`card-refund-stat-${s.label.toLowerCase()}`}>
              <CardContent className="p-4">
                <div className={`flex items-center gap-2 mb-1 ${s.color}`}>{s.icon}<span className="text-xs font-medium uppercase">{s.label}</span></div>
                <div className="text-2xl font-bold">{s.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Reconciliation Report */}
        {showReport && (
          <Card data-testid="card-reconciliation-report">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5" /> Reconciliation Report</CardTitle>
              {report && <CardDescription>Generated: {new Date(report.generatedAt).toLocaleString()}</CardDescription>}
            </CardHeader>
            <CardContent>
              {reportLoading ? (
                <div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div>
              ) : report ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Object.entries(report.summary).map(([k, v]) =>
                      typeof v === "number" ? (
                        <div key={k} className="border rounded p-3">
                          <div className="text-xs text-muted-foreground capitalize">{k.replace(/([A-Z])/g, ' $1')}</div>
                          <div className={`text-xl font-bold ${v > 0 && k !== 'totalPayments' && k !== 'totalMpesaTransactions' ? 'text-orange-600' : ''}`}>{v}</div>
                        </div>
                      ) : null
                    )}
                  </div>
                  {report.summary.byStatus && (
                    <div>
                      <p className="text-sm font-medium mb-2">Payments by Status</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(report.summary.byStatus).map(([s, c]) => (
                          <Badge key={s} variant="outline">{s}: {c}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {report.issues.duplicateReceipts.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-red-600 mb-1">⚠ Duplicate Receipts ({report.issues.duplicateReceipts.length})</p>
                      <div className="space-y-1">
                        {report.issues.duplicateReceipts.map(d => (
                          <div key={d.receipt} className="text-xs bg-red-50 p-2 rounded font-mono">{d.receipt} — {d.count} occurrences</div>
                        ))}
                      </div>
                    </div>
                  )}
                  {report.issues.paymentsWithoutReceipts.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-orange-600 mb-1">⚠ Success payments missing receipts ({report.issues.paymentsWithoutReceipts.length})</p>
                      <div className="space-y-1">
                        {report.issues.paymentsWithoutReceipts.map(p => (
                          <div key={p.paymentId} className="text-xs bg-orange-50 p-2 rounded">ID: {p.paymentId} | KES {p.amount} | {p.userId}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        {/* Refund list */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Refund Requests</CardTitle>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40" data-testid="select-refund-status-filter">
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="processed">Processed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p>No refund requests{statusFilter !== "all" ? ` with status "${statusFilter}"` : ""}.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map(r => {
                  const badgeConf = STATUS_BADGE[r.status] ?? { label: r.status, variant: "secondary" as const };
                  return (
                    <div key={r.id} className="border rounded-lg p-4 flex flex-col md:flex-row md:items-center gap-3" data-testid={`card-refund-${r.id}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={badgeConf.variant}>{badgeConf.label}</Badge>
                          <span className="text-xs text-muted-foreground font-mono truncate">{r.id.slice(0, 8)}…</span>
                        </div>
                        <p className="text-sm font-medium truncate">Payment: {r.paymentId.slice(0, 12)}…</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">{r.reason}</p>
                        {r.adminNotes && (
                          <p className="text-xs text-blue-600 mt-1">Admin: {r.adminNotes}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">{new Date(r.createdAt!).toLocaleString()}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {r.status === "pending" && (
                          <>
                            <Button size="sm" variant="default" onClick={() => openDialog(r, "approved")} data-testid={`button-approve-${r.id}`}>
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => openDialog(r, "rejected")} data-testid={`button-reject-${r.id}`}>
                              <XCircle className="w-3 h-3 mr-1" /> Reject
                            </Button>
                          </>
                        )}
                        {r.status === "approved" && (
                          <Button size="sm" variant="outline" onClick={() => openDialog(r, "processed")} data-testid={`button-process-${r.id}`}>
                            <RefreshCw className="w-3 h-3 mr-1" /> Mark Processed
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Review dialog */}
      <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogStatus === "approved" ? "Approve Refund" : dialogStatus === "rejected" ? "Reject Refund" : "Mark as Processed"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm text-muted-foreground">
              <p><strong>Payment ID:</strong> {selected?.paymentId}</p>
              <p><strong>Reason:</strong> {selected?.reason}</p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Admin Notes (optional)</label>
              <Textarea
                value={adminNotes}
                onChange={e => setAdminNotes(e.target.value)}
                placeholder={
                  dialogStatus === "rejected"
                    ? "Provide a reason for rejection (shown to user)…"
                    : dialogStatus === "processed"
                    ? "M-Pesa B2C reference, confirmation details…"
                    : "Internal notes…"
                }
                rows={3}
                data-testid="textarea-admin-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
            <Button
              variant={dialogStatus === "rejected" ? "destructive" : "default"}
              onClick={() => selected && reviewMutation.mutate({ id: selected.id, status: dialogStatus, notes: adminNotes })}
              disabled={reviewMutation.isPending}
              data-testid="button-confirm-review"
            >
              {reviewMutation.isPending ? "Saving…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
