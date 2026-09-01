/**
 * /admin/scam-reports — Moderation Queue for the Community Fraud
 * Intelligence Platform.
 *
 * "No report should become public immediately." — every submission lands
 * here first and requires an admin action (approve / reject / blacklist)
 * before it appears on the public agency page or the searchable directory.
 *
 * Actions write to scam_report_audit_log via
 * POST /api/admin/scam-reports/:id/moderate — that endpoint records who
 * did what, when, and why. Full trail is viewable inline.
 *
 * The queue itself comes from GET /api/admin/scam-reports?status=pending.
 * Server enforces ensureAdmin (isUserAdmin storage check) — client is
 * defence-in-depth only. Never trust client-side gating alone.
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, fetchCsrfToken } from "@/lib/queryClient";
import AdminLayout from "@/components/admin-layout";
import {
  ShieldAlert,
  CheckCircle,
  XCircle,
  Ban,
  ArrowLeft,
  Calendar,
  Loader2,
  Clock,
  RefreshCw,
  ExternalLink,
  Paperclip,
  Users,
  History,
  ChevronRight,
} from "lucide-react";

type ModerationStatus = "pending" | "approved" | "rejected" | "blacklisted";
type RiskBand = "low" | "medium" | "high" | "critical";

interface QueueReport {
  id: string;
  agency_name: string;
  agency_slug: string | null;
  country: string | null;
  destination_country: string | null;
  description: string;
  amount_lost: number | null;
  currency: string | null;
  risk_band: RiskBand;
  status: ModerationStatus;
  created_at: string;
  reporter_email: string | null;
  evidence_count: number;
  contact_count: number;
}

interface QueueResponse {
  ok: boolean;
  reports: QueueReport[];
  total: number;
}

interface AuditEntry {
  id: string;
  actor_user_id: string | null;
  action: string;
  reason: string | null;
  before_json: any;
  after_json: any;
  created_at: string;
}

const STATUS_TABS: { key: ModerationStatus; label: string; icon: any; color: string }[] = [
  { key: "pending",     label: "Pending review", icon: Clock,       color: "text-yellow-600" },
  { key: "approved",    label: "Approved",       icon: CheckCircle, color: "text-green-600"  },
  { key: "rejected",    label: "Rejected",       icon: XCircle,     color: "text-gray-500"   },
  { key: "blacklisted", label: "Blacklisted",    icon: Ban,         color: "text-red-600"    },
];

const RISK_BADGE: Record<RiskBand, string> = {
  low:      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  medium:   "bg-amber-100   text-amber-800   dark:bg-amber-950/40   dark:text-amber-300",
  high:     "bg-orange-100  text-orange-800  dark:bg-orange-950/40  dark:text-orange-300",
  critical: "bg-red-100     text-red-800     dark:bg-red-950/40     dark:text-red-300",
};

export default function AdminScamReportsPage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<ModerationStatus>("pending");
  const [selectedReport, setSelectedReport] = useState<QueueReport | null>(null);
  const [moderationReason, setModerationReason] = useState("");
  const [pendingAction, setPendingAction] = useState<"approve" | "reject" | "blacklist" | null>(null);
  const [showAudit, setShowAudit] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery<QueueResponse>({
    queryKey: ["/api/admin/scam-reports", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ status: statusFilter, limit: "100" });
      const res = await fetch(`/api/admin/scam-reports?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load queue");
      return res.json();
    },
  });

  const { data: auditData } = useQuery<{ ok: boolean; entries: AuditEntry[] }>({
    queryKey: ["/api/admin/scam-reports/audit", selectedReport?.id],
    enabled: !!(selectedReport && showAudit),
    queryFn: async () => {
      const res = await fetch(`/api/admin/scam-reports/${selectedReport!.id}/audit`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load audit trail");
      return res.json();
    },
  });

  const moderateMutation = useMutation({
    mutationFn: async ({ id, action, reason }: { id: string; action: string; reason: string }) => {
      const csrf = await fetchCsrfToken();
      const res = await fetch(`/api/admin/scam-reports/${id}/moderate`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({ action, reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Moderation action failed");
      return json;
    },
    onSuccess: (_data, vars) => {
      toast({
        title: "Action recorded",
        description: `Report ${vars.action}d and written to the audit log.`,
      });
      setSelectedReport(null);
      setModerationReason("");
      setPendingAction(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/scam-reports"] });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not update report",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const confirmModeration = () => {
    if (!selectedReport || !pendingAction) return;
    // Rejection & blacklist require a reason — full audit trail is not
    // optional for adverse actions.
    if ((pendingAction === "reject" || pendingAction === "blacklist") && !moderationReason.trim()) {
      toast({
        title: "Reason required",
        description: "Rejections and blacklists must include a reason for the audit log.",
        variant: "destructive",
      });
      return;
    }
    moderateMutation.mutate({
      id: selectedReport.id,
      action: pendingAction,
      reason: moderationReason.trim() || undefined as any,
    });
  };

  const totalStats = data?.reports?.length ?? 0;

  return (
    <AdminLayout title="Scam Reports">
      <div className="max-w-6xl mx-auto p-4 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/admin">
                <a className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 flex items-center gap-1">
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to admin
                </a>
              </Link>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-red-600" />
              Fraud Intelligence — Moderation Queue
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Nothing is published until you approve it here. Every action is written to an immutable audit log.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh-queue"
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Status tabs */}
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = statusFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-semibold transition ${
                  active
                    ? "bg-teal-600 text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
                data-testid={`tab-status-${tab.key}`}
              >
                <Icon className={`h-4 w-4 ${active ? "text-white" : tab.color}`} />
                {tab.label}
                {active && totalStats > 0 && (
                  <span className="ml-1 bg-white/20 px-1.5 py-0.5 rounded text-xs">{totalStats}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && data?.reports?.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="pt-10 pb-10 text-center">
              <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-3" />
              <p className="text-lg font-semibold text-gray-900 dark:text-white">Queue is clear</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                No {statusFilter} reports right now.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Report list */}
        {!isLoading && data?.reports && data.reports.length > 0 && (
          <div className="grid gap-3">
            {data.reports.map((r) => (
              <Card key={r.id} className="hover:border-teal-400 dark:hover:border-teal-700 transition">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-bold text-gray-900 dark:text-white text-base">
                          {r.agency_name}
                        </h3>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${RISK_BADGE[r.risk_band]}`}>
                          {r.risk_band.toUpperCase()} RISK
                        </span>
                        {r.agency_slug && (
                          <Link href={`/agencies-reported/${r.agency_slug}`}>
                            <a target="_blank" className="text-xs text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1">
                              View public page <ExternalLink className="h-3 w-3" />
                            </a>
                          </Link>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-3 flex-wrap">
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />
                          {new Date(r.created_at).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })}
                        </span>
                        {r.country && <span>Reporter in {r.country}</span>}
                        {r.destination_country && <span>Destination: {r.destination_country}</span>}
                        {r.amount_lost && r.amount_lost > 0 && (
                          <span className="font-semibold text-red-600 dark:text-red-400">
                            {r.currency || "KES"} {r.amount_lost.toLocaleString()}
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                        {r.description}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1"><Paperclip className="h-3 w-3" /> {r.evidence_count} evidence file{r.evidence_count === 1 ? "" : "s"}</span>
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {r.contact_count} identifier{r.contact_count === 1 ? "" : "s"}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setSelectedReport(r); setShowAudit(false); setModerationReason(""); setPendingAction(null); }}
                      data-testid={`button-review-${r.id}`}
                    >
                      Review <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Legal footer */}
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-4 italic">
          Reports are community-submitted allegations. Approval publishes them as such — publication does not constitute a court finding. Preserve original evidence before any moderation action.
        </p>
      </div>

      {/* Review dialog */}
      <Dialog open={!!selectedReport} onOpenChange={(open) => { if (!open) { setSelectedReport(null); setShowAudit(false); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedReport && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <ShieldAlert className="h-5 w-5 text-red-600" />
                  {selectedReport.agency_name}
                </DialogTitle>
                <DialogDescription>
                  Submitted {new Date(selectedReport.created_at).toLocaleString("en-KE", { dateStyle: "long", timeStyle: "short" })}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Meta grid */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <MetaCell label="Reporter country" value={selectedReport.country} />
                  <MetaCell label="Destination country" value={selectedReport.destination_country} />
                  <MetaCell label="Amount lost" value={selectedReport.amount_lost ? `${selectedReport.currency || "KES"} ${selectedReport.amount_lost.toLocaleString()}` : "Not reported"} />
                  <MetaCell label="Risk band" value={<Badge className={RISK_BADGE[selectedReport.risk_band]}>{selectedReport.risk_band.toUpperCase()}</Badge>} />
                  <MetaCell label="Evidence" value={`${selectedReport.evidence_count} file${selectedReport.evidence_count === 1 ? "" : "s"}`} />
                  <MetaCell label="Cross-ref identifiers" value={`${selectedReport.contact_count}`} />
                </div>

                {/* Reporter email — internal only */}
                {selectedReport.reporter_email && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-800 pt-2">
                    Reporter contact (internal only): <span className="font-mono">{selectedReport.reporter_email}</span>
                  </div>
                )}

                {/* Full description */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">What the reporter described</p>
                  <div className="text-sm text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900 p-3 rounded whitespace-pre-wrap max-h-52 overflow-y-auto">
                    {selectedReport.description}
                  </div>
                </div>

                {/* Audit trail toggle */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowAudit((s) => !s)}
                    className="text-xs font-semibold text-teal-600 dark:text-teal-400 flex items-center gap-1 hover:underline"
                    data-testid="button-toggle-audit"
                  >
                    <History className="h-3.5 w-3.5" /> {showAudit ? "Hide" : "Show"} audit history
                  </button>
                  {showAudit && (
                    <div className="mt-2 space-y-1 max-h-48 overflow-y-auto text-xs">
                      {!auditData && <p className="text-gray-500">Loading trail…</p>}
                      {auditData?.entries?.length === 0 && (
                        <p className="text-gray-500 italic">No prior actions.</p>
                      )}
                      {auditData?.entries?.map((e) => (
                        <div key={e.id} className="border-l-2 border-teal-500 pl-2 py-1">
                          <p className="font-semibold text-gray-800 dark:text-gray-200">
                            {e.action} · <span className="text-gray-500 font-normal">{new Date(e.created_at).toLocaleString()}</span>
                          </p>
                          {e.reason && <p className="text-gray-600 dark:text-gray-400 italic">"{e.reason}"</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Reason input */}
                {selectedReport.status === "pending" && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1 block">
                      Moderator note {pendingAction === "reject" || pendingAction === "blacklist" ? "(required)" : "(optional)"}
                    </label>
                    <Textarea
                      value={moderationReason}
                      onChange={(e) => setModerationReason(e.target.value)}
                      placeholder="Written to the immutable audit log. Explain the basis for your action…"
                      rows={3}
                      maxLength={2000}
                      className="text-sm"
                      data-testid="textarea-moderation-reason"
                    />
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 flex-wrap">
                {selectedReport.status === "pending" ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setPendingAction("reject"); setTimeout(confirmModeration, 0); }}
                      disabled={moderateMutation.isPending}
                      className="text-gray-600"
                      data-testid="button-reject"
                    >
                      <XCircle className="h-4 w-4 mr-1.5" /> Reject
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setPendingAction("blacklist"); setTimeout(confirmModeration, 0); }}
                      disabled={moderateMutation.isPending}
                      className="border-red-300 text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                      data-testid="button-blacklist"
                    >
                      <Ban className="h-4 w-4 mr-1.5" /> Blacklist
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => { setPendingAction("approve"); setTimeout(confirmModeration, 0); }}
                      disabled={moderateMutation.isPending}
                      className="bg-green-600 hover:bg-green-700 text-white"
                      data-testid="button-approve"
                    >
                      {moderateMutation.isPending
                        ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                        : <CheckCircle className="h-4 w-4 mr-1.5" />}
                      Approve &amp; Publish
                    </Button>
                  </>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    Already {selectedReport.status} — no further actions available
                  </Badge>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function MetaCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase">{label}</p>
      <p className="text-sm text-gray-800 dark:text-gray-200">{value ?? <span className="text-gray-400 italic">—</span>}</p>
    </div>
  );
}
