import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Flag, RefreshCw, CheckCircle, XCircle, AlertTriangle,
  ShieldAlert, Clock, Filter, Building2, RotateCcw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  getAllAgencyReports, updateReportStatus, getAgencyWarningCounts,
  resetAgencyWarnings, type AgencyReport, type ReportStatus,
} from "@/lib/firebase-agency-reports";

const STATUS_LABELS: Record<ReportStatus, { label: string; color: string }> = {
  pending_review: { label: "Pending Review", color: "bg-amber-100 text-amber-700 border-amber-200" },
  reviewed:       { label: "Reviewed",       color: "bg-blue-100 text-blue-700 border-blue-200" },
  confirmed_scam: { label: "Confirmed Scam", color: "bg-red-100 text-red-700 border-red-200" },
  dismissed:      { label: "Dismissed",      color: "bg-gray-100 text-gray-600 border-gray-200" },
};

export default function AdminReportedAgenciesPage() {
  const { toast } = useToast();
  const [reports, setReports] = useState<AgencyReport[]>([]);
  const [warnings, setWarnings] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReportStatus | "all">("all");

  async function loadData() {
    setLoading(true);
    try {
      const [r, w] = await Promise.all([getAllAgencyReports(), getAgencyWarningCounts()]);
      setReports(r);
      setWarnings(w);
    } catch {
      toast({ title: "Failed to load reports", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  async function handleStatus(id: string, licenseNumber: string, status: ReportStatus) {
    setProcessing(id);
    try {
      await updateReportStatus(id, status);
      setReports(r => r.map(x => x.id === id ? { ...x, status } : x));
      toast({ title: `Status updated to "${STATUS_LABELS[status].label}"` });
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  }

  async function handleResetWarnings(licenseNumber: string) {
    setProcessing(`reset-${licenseNumber}`);
    try {
      await resetAgencyWarnings(licenseNumber);
      setWarnings(w => ({ ...w, [licenseNumber]: 0 }));
      toast({ title: `Warning counter reset for ${licenseNumber}` });
    } catch {
      toast({ title: "Reset failed", variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  }

  const filtered = filter === "all" ? reports : reports.filter(r => r.status === filter);

  const counts = {
    all: reports.length,
    pending_review: reports.filter(r => r.status === "pending_review").length,
    reviewed: reports.filter(r => r.status === "reviewed").length,
    confirmed_scam: reports.filter(r => r.status === "confirmed_scam").length,
    dismissed: reports.filter(r => r.status === "dismissed").length,
  };

  const topWarnings = Object.entries(warnings)
    .filter(([, c]) => c > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  return (
    <AdminLayout title="Reported Agencies">
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Reported Agencies</h1>
            <p className="text-slate-500 text-sm mt-1">Community reports submitted via agency profiles</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-2">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { key: "pending_review", label: "Pending", icon: Clock, color: "text-amber-600" },
            { key: "confirmed_scam", label: "Confirmed Scam", icon: ShieldAlert, color: "text-red-600" },
            { key: "reviewed", label: "Reviewed", icon: CheckCircle, color: "text-blue-600" },
            { key: "dismissed", label: "Dismissed", icon: XCircle, color: "text-gray-500" },
          ].map(({ key, label, icon: Icon, color }) => (
            <div key={key} className="bg-white border border-slate-200 rounded-lg p-4 text-center">
              <Icon className={`h-5 w-5 ${color} mx-auto mb-1`} />
              <div className={`text-2xl font-bold ${color}`}>{counts[key as ReportStatus]}</div>
              <div className="text-xs text-slate-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* Warning counter leaderboard */}
        {topWarnings.length > 0 && (
          <div>
            <h2 className="text-base font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Most Reported Agencies
            </h2>
            <div className="flex flex-wrap gap-2">
              {topWarnings.map(([license, count]) => (
                <div
                  key={license}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm"
                  data-testid={`warning-chip-${license}`}
                >
                  <Building2 className="h-3.5 w-3.5 text-slate-400" />
                  <span className="font-mono text-xs text-slate-600">{license}</span>
                  <Badge variant="destructive" className="text-xs h-5 px-1.5">{count}</Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 px-1.5 text-xs text-slate-400 hover:text-red-600"
                    onClick={() => handleResetWarnings(license)}
                    disabled={processing === `reset-${license}`}
                    data-testid={`reset-warnings-${license}`}
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2">
          {[
            { key: "all", label: `All (${counts.all})` },
            { key: "pending_review", label: `Pending (${counts.pending_review})` },
            { key: "confirmed_scam", label: `Scam (${counts.confirmed_scam})` },
            { key: "reviewed", label: `Reviewed (${counts.reviewed})` },
            { key: "dismissed", label: `Dismissed (${counts.dismissed})` },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key as typeof filter)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                filter === key
                  ? "bg-slate-800 text-white border-slate-800"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              }`}
              data-testid={`filter-${key}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Report list */}
        {loading ? (
          <div className="text-sm text-slate-400 py-8 text-center">Loading reports…</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-slate-400 py-8 text-center border border-dashed border-slate-200 rounded-lg">
            No reports in this category
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => {
              const { label, color } = STATUS_LABELS[r.status];
              const warnCount = warnings[r.licenseNumber] ?? 0;
              return (
                <Card key={r.id} className={r.status === "confirmed_scam" ? "border-red-200 bg-red-50/20" : ""}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-semibold text-slate-800">
                            {r.agencyName ?? r.licenseNumber}
                          </span>
                          <span className="font-mono text-xs text-slate-400">{r.licenseNumber}</span>
                          {warnCount > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              ⚠️ {warnCount} report{warnCount > 1 ? "s" : ""}
                            </Badge>
                          )}
                          <Badge variant="outline" className={`text-xs ${color}`}>{label}</Badge>
                        </div>
                        <p className="text-sm text-slate-700 font-medium mb-1">"{r.reason}"</p>
                        <p className="text-xs text-slate-400">
                          Reported by: <span className="font-mono">{r.reportedBy.slice(0, 12)}…</span>
                          {" · "}{new Date(r.timestamp).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 shrink-0">
                        {r.status !== "confirmed_scam" && (
                          <Button
                            size="sm"
                            onClick={() => handleStatus(r.id, r.licenseNumber, "confirmed_scam")}
                            disabled={processing === r.id}
                            className="bg-red-600 hover:bg-red-700 text-white gap-1 text-xs h-8"
                            data-testid={`confirm-scam-${r.id}`}
                          >
                            <ShieldAlert className="h-3.5 w-3.5" />
                            Confirm Scam
                          </Button>
                        )}
                        {r.status === "pending_review" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleStatus(r.id, r.licenseNumber, "reviewed")}
                            disabled={processing === r.id}
                            className="gap-1 text-xs h-8"
                            data-testid={`mark-reviewed-${r.id}`}
                          >
                            <CheckCircle className="h-3.5 w-3.5 text-blue-500" />
                            Mark Reviewed
                          </Button>
                        )}
                        {r.status !== "dismissed" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleStatus(r.id, r.licenseNumber, "dismissed")}
                            disabled={processing === r.id}
                            className="gap-1 text-xs h-8 text-slate-400 hover:text-slate-700"
                            data-testid={`dismiss-report-${r.id}`}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Dismiss
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
