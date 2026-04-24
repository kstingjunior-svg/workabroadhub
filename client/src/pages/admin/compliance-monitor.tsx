import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AdminLayout from "@/components/admin-layout";
import {
  ShieldAlert,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Eye,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  Activity,
  Bell,
  Settings,
  BarChart3,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

interface RiskFactor {
  name: string;
  weight: number;
  rawScore: number;
  weightedScore: number;
  explanation: string;
}

interface RiskScore {
  id: string;
  agencyId: string;
  agencyName: string | null;
  riskScore: number;
  previousScore: number | null;
  scoreDelta: number | null;
  trend: string;
  factors: RiskFactor[];
  explanation: string | null;
  calculatedAt: string;
}

interface Anomaly {
  id: string;
  agencyId: string;
  agencyName: string | null;
  anomalyType: string;
  severity: string;
  details: Record<string, any>;
  detectedAt: string;
  status: string;
  reviewedBy: string | null;
  reviewNotes: string | null;
}

interface ComplianceAlert {
  id: string;
  agencyId: string;
  agencyName: string | null;
  alertType: string;
  severity: string;
  title: string;
  message: string | null;
  explanation: string | null;
  status: string;
  triggeredAt: string;
  acknowledgedBy: string | null;
  resolvedBy: string | null;
}

interface DashboardData {
  stats: { highRisk: number; openAnomalies: number; pendingAlerts: number; avgRiskScore: number; criticalAlerts: number };
  topRisky: RiskScore[];
  recentAlerts: ComplianceAlert[];
}

interface ConfigItem {
  id: string;
  configKey: string;
  configValue: any;
  description: string | null;
}

function severityBadge(severity: string) {
  const colors: Record<string, string> = {
    critical: "bg-red-600 text-white",
    high: "bg-orange-500 text-white",
    medium: "bg-yellow-500 text-black",
    low: "bg-blue-500 text-white",
  };
  return <Badge className={colors[severity] || "bg-gray-500 text-white"} data-testid={`severity-${severity}`}>{severity}</Badge>;
}

function statusBadge(status: string) {
  const variants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
    pending: "destructive",
    open: "destructive",
    acknowledged: "secondary",
    reviewed: "secondary",
    resolved: "outline",
    dismissed: "outline",
  };
  return <Badge variant={variants[status] || "default"} data-testid={`status-${status}`}>{status}</Badge>;
}

function trendIcon(trend: string) {
  if (trend === "worsening") return <TrendingUp className="w-4 h-4 text-red-500" />;
  if (trend === "improving") return <TrendingDown className="w-4 h-4 text-green-500" />;
  return <Minus className="w-4 h-4 text-gray-400" />;
}

function riskColor(score: number): string {
  if (score >= 85) return "text-red-600";
  if (score >= 70) return "text-orange-500";
  if (score >= 50) return "text-yellow-600";
  if (score >= 30) return "text-blue-500";
  return "text-green-600";
}

function anomalyTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    transaction_spike: "Transaction Spike",
    multiple_phone_numbers: "Multiple Phone Numbers",
    payments_after_expiry: "Post-Expiry Payments",
    shared_payment_account: "Shared Payment Account",
  };
  return labels[type] || type;
}

function OverviewTab() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/admin/compliance/dashboard"],
  });

  const scanMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/compliance/scan"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/compliance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/compliance/dashboard"] });
    },
  });

  if (isLoading) return <div className="space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>;

  const stats = data?.stats;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold" data-testid="text-overview-title">Compliance Overview</h3>
        <Button
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
          data-testid="button-run-scan"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${scanMutation.isPending ? "animate-spin" : ""}`} />
          {scanMutation.isPending ? "Scanning..." : "Run Full Scan"}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4" data-testid="stats-grid">
        <Card>
          <CardContent className="p-4 text-center">
            <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-red-500" />
            <p className="text-3xl font-bold text-red-600" data-testid="stat-high-risk">{stats?.highRisk || 0}</p>
            <p className="text-sm text-muted-foreground">High Risk</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-orange-500" />
            <p className="text-3xl font-bold text-orange-600" data-testid="stat-anomalies">{stats?.openAnomalies || 0}</p>
            <p className="text-sm text-muted-foreground">Open Anomalies</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Bell className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
            <p className="text-3xl font-bold text-yellow-600" data-testid="stat-pending-alerts">{stats?.pendingAlerts || 0}</p>
            <p className="text-sm text-muted-foreground">Pending Alerts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Zap className="w-8 h-8 mx-auto mb-2 text-red-600" />
            <p className="text-3xl font-bold text-red-700" data-testid="stat-critical">{stats?.criticalAlerts || 0}</p>
            <p className="text-sm text-muted-foreground">Critical Alerts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <BarChart3 className="w-8 h-8 mx-auto mb-2 text-blue-500" />
            <p className="text-3xl font-bold text-blue-600" data-testid="stat-avg-score">{stats?.avgRiskScore || 0}</p>
            <p className="text-sm text-muted-foreground">Avg Risk Score</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Risky Agencies</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.topRisky && data.topRisky.length > 0 ? (
              <div className="space-y-2" data-testid="top-risky-list">
                {data.topRisky.map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-2 rounded border" data-testid={`risky-agency-${r.agencyId}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.agencyName || r.agencyId}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.explanation?.slice(0, 80)}...</p>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      {trendIcon(r.trend)}
                      <span className={`text-lg font-bold ${riskColor(r.riskScore)}`}>{r.riskScore}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4" data-testid="no-risky">No risk data available. Run a scan to generate scores.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.recentAlerts && data.recentAlerts.length > 0 ? (
              <div className="space-y-2" data-testid="recent-alerts-list">
                {data.recentAlerts.map((a) => (
                  <div key={a.id} className="flex items-center justify-between p-2 rounded border" data-testid={`alert-${a.id}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{new Date(a.triggeredAt).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      {severityBadge(a.severity)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4" data-testid="no-alerts">No pending alerts.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function RiskScoresTab() {
  const [minScore, setMinScore] = useState("");
  const [trendFilter, setTrendFilter] = useState("");
  const [selectedAgency, setSelectedAgency] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (minScore) params.set("minScore", minScore);
  if (trendFilter && trendFilter !== "_all") params.set("trend", trendFilter);
  const queryStr = params.toString() ? `?${params.toString()}` : "";

  const { data: scores, isLoading } = useQuery<RiskScore[]>({
    queryKey: ["/api/admin/compliance/risk-scores", queryStr],
    queryFn: async () => {
      const res = await fetch(`/api/admin/compliance/risk-scores${queryStr}`, { credentials: "include" });
      return res.json();
    },
  });

  const { data: detail } = useQuery({
    queryKey: ["/api/admin/compliance/risk-scores", selectedAgency],
    queryFn: async () => {
      const res = await fetch(`/api/admin/compliance/risk-scores/${selectedAgency}`, { credentials: "include" });
      return res.json();
    },
    enabled: !!selectedAgency,
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap items-end">
        <div>
          <Label className="text-xs">Min Score</Label>
          <Input
            type="number"
            placeholder="0"
            className="w-24 h-8"
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
            data-testid="input-min-score"
          />
        </div>
        <div>
          <Label className="text-xs">Trend</Label>
          <Select value={trendFilter || "_all"} onValueChange={(v) => setTrendFilter(v === "_all" ? "" : v)}>
            <SelectTrigger className="w-36 h-8" data-testid="select-trend">
              <SelectValue placeholder="All Trends" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All Trends</SelectItem>
              <SelectItem value="worsening">Worsening</SelectItem>
              <SelectItem value="improving">Improving</SelectItem>
              <SelectItem value="stable">Stable</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : !scores || scores.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground" data-testid="no-scores">
          <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No risk scores available. Run a compliance scan first.</p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="risk-scores-list">
          {scores.map((s) => (
            <Card
              key={s.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedAgency(s.agencyId)}
              data-testid={`risk-card-${s.agencyId}`}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold truncate">{s.agencyName || s.agencyId}</span>
                      {trendIcon(s.trend)}
                      {s.scoreDelta !== null && s.scoreDelta !== 0 && (
                        <span className={`text-xs ${s.scoreDelta > 0 ? "text-red-500" : "text-green-500"}`}>
                          {s.scoreDelta > 0 ? "+" : ""}{s.scoreDelta}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{s.explanation?.slice(0, 120)}</p>
                  </div>
                  <div className={`text-2xl font-bold ml-4 ${riskColor(s.riskScore)}`} data-testid={`score-value-${s.agencyId}`}>
                    {s.riskScore}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedAgency && detail && (
        <Dialog open={!!selectedAgency} onOpenChange={() => setSelectedAgency(null)}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto" data-testid="risk-detail-dialog">
            <DialogHeader>
              <DialogTitle>Risk Score Detail</DialogTitle>
              <DialogDescription>{detail.score?.agencyName || selectedAgency}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <span className={`text-4xl font-bold ${riskColor(detail.score?.riskScore || 0)}`}>
                  {detail.score?.riskScore}
                </span>
                <div>
                  <div className="flex items-center gap-1">
                    {trendIcon(detail.score?.trend)}
                    <span className="text-sm capitalize">{detail.score?.trend}</span>
                  </div>
                  {detail.score?.scoreDelta !== null && (
                    <span className="text-xs text-muted-foreground">
                      Previous: {detail.score?.previousScore || "N/A"} ({detail.score?.scoreDelta > 0 ? "+" : ""}{detail.score?.scoreDelta})
                    </span>
                  )}
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-sm mb-2">Risk Factor Breakdown</h4>
                <div className="space-y-2" data-testid="factor-breakdown">
                  {(detail.score?.factors as RiskFactor[])?.map((f: RiskFactor, i: number) => (
                    <div key={i} className="p-2 rounded border text-sm">
                      <div className="flex justify-between">
                        <span className="font-medium capitalize">{f.name.replace(/_/g, " ")}</span>
                        <span className={riskColor(f.rawScore)}>{f.rawScore}/100 (w:{f.weight}%)</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{f.explanation}</p>
                    </div>
                  ))}
                </div>
              </div>

              {detail.history && detail.history.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm mb-2">Score History</h4>
                  <div className="space-y-1">
                    {detail.history.slice(0, 10).map((h: any, i: number) => (
                      <div key={i} className="flex justify-between text-xs p-1 border-b">
                        <span>{new Date(h.calculatedAt).toLocaleString()}</span>
                        <span className={riskColor(h.riskScore)}>{h.riskScore}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function AnomaliesTab() {
  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [reviewAnomaly, setReviewAnomaly] = useState<Anomaly | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const { toast } = useToast();

  const params = new URLSearchParams();
  if (statusFilter && statusFilter !== "_all") params.set("status", statusFilter);
  if (severityFilter && severityFilter !== "_all") params.set("severity", severityFilter);
  const queryStr = params.toString() ? `?${params.toString()}` : "";

  const { data: anomalies, isLoading } = useQuery<Anomaly[]>({
    queryKey: ["/api/admin/compliance/anomalies", queryStr],
    queryFn: async () => {
      const res = await fetch(`/api/admin/compliance/anomalies${queryStr}`, { credentials: "include" });
      return res.json();
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/admin/compliance/anomalies/${id}`, { status, reviewNotes });
    },
    onSuccess: () => {
      toast({ title: "Anomaly updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/compliance/anomalies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/compliance/dashboard"] });
      setReviewAnomaly(null);
      setReviewNotes("");
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <Select value={statusFilter || "_all"} onValueChange={(v) => setStatusFilter(v === "_all" ? "" : v)}>
          <SelectTrigger className="w-36 h-8" data-testid="filter-anomaly-status">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All Statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={severityFilter || "_all"} onValueChange={(v) => setSeverityFilter(v === "_all" ? "" : v)}>
          <SelectTrigger className="w-36 h-8" data-testid="filter-anomaly-severity">
            <SelectValue placeholder="All Severities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All Severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : !anomalies || anomalies.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground" data-testid="no-anomalies">
          <Eye className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No anomalies detected.</p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="anomalies-list">
          {anomalies.map((a) => (
            <Card key={a.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setReviewAnomaly(a)} data-testid={`anomaly-${a.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{anomalyTypeLabel(a.anomalyType)}</span>
                      {severityBadge(a.severity)}
                      {statusBadge(a.status)}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{a.agencyName || a.agencyId}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(a.detectedAt).toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {reviewAnomaly && (
        <Dialog open={!!reviewAnomaly} onOpenChange={() => { setReviewAnomaly(null); setReviewNotes(""); }}>
          <DialogContent data-testid="anomaly-detail-dialog">
            <DialogHeader>
              <DialogTitle>Anomaly Detail</DialogTitle>
              <DialogDescription>{anomalyTypeLabel(reviewAnomaly.anomalyType)} - {reviewAnomaly.agencyName || reviewAnomaly.agencyId}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex gap-2">{severityBadge(reviewAnomaly.severity)}{statusBadge(reviewAnomaly.status)}</div>
              <div className="p-3 bg-muted rounded text-sm">
                <pre className="whitespace-pre-wrap">{JSON.stringify(reviewAnomaly.details, null, 2)}</pre>
              </div>
              <p className="text-xs text-muted-foreground">Detected: {new Date(reviewAnomaly.detectedAt).toLocaleString()}</p>

              {reviewAnomaly.status === "open" && (
                <>
                  <div>
                    <Label>Review Notes</Label>
                    <Textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} placeholder="Add investigation notes..." data-testid="input-review-notes" />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => reviewMutation.mutate({ id: reviewAnomaly.id, status: "reviewed" })}
                      disabled={reviewMutation.isPending}
                      data-testid="button-mark-reviewed"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1" /> Mark Reviewed
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => reviewMutation.mutate({ id: reviewAnomaly.id, status: "dismissed" })}
                      disabled={reviewMutation.isPending}
                      data-testid="button-dismiss"
                    >
                      <XCircle className="w-4 h-4 mr-1" /> Dismiss
                    </Button>
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function AlertsTab() {
  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const { toast } = useToast();

  const params = new URLSearchParams();
  if (statusFilter && statusFilter !== "_all") params.set("status", statusFilter);
  if (severityFilter && severityFilter !== "_all") params.set("severity", severityFilter);
  const queryStr = params.toString() ? `?${params.toString()}` : "";

  const { data: alerts, isLoading } = useQuery<ComplianceAlert[]>({
    queryKey: ["/api/admin/compliance/alerts", queryStr],
    queryFn: async () => {
      const res = await fetch(`/api/admin/compliance/alerts${queryStr}`, { credentials: "include" });
      return res.json();
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/admin/compliance/alerts/${id}/acknowledge`),
    onSuccess: () => {
      toast({ title: "Alert acknowledged" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/compliance/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/compliance/dashboard"] });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/admin/compliance/alerts/${id}/resolve`),
    onSuccess: () => {
      toast({ title: "Alert resolved" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/compliance/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/compliance/dashboard"] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <Select value={statusFilter || "_all"} onValueChange={(v) => setStatusFilter(v === "_all" ? "" : v)}>
          <SelectTrigger className="w-40 h-8" data-testid="filter-alert-status">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="acknowledged">Acknowledged</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
        <Select value={severityFilter || "_all"} onValueChange={(v) => setSeverityFilter(v === "_all" ? "" : v)}>
          <SelectTrigger className="w-36 h-8" data-testid="filter-alert-severity">
            <SelectValue placeholder="All Severities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All Severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : !alerts || alerts.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground" data-testid="no-alerts-tab">
          <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No compliance alerts.</p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="alerts-list">
          {alerts.map((a) => (
            <Card key={a.id} data-testid={`alert-card-${a.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{a.title}</span>
                      {severityBadge(a.severity)}
                      {statusBadge(a.status)}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{a.message}</p>
                    <p className="text-xs text-muted-foreground">{new Date(a.triggeredAt).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-1">
                    {a.status === "pending" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => acknowledgeMutation.mutate(a.id)}
                        disabled={acknowledgeMutation.isPending}
                        data-testid={`ack-alert-${a.id}`}
                      >
                        <Eye className="w-3 h-3 mr-1" /> Ack
                      </Button>
                    )}
                    {(a.status === "pending" || a.status === "acknowledged") && (
                      <Button
                        size="sm"
                        onClick={() => resolveMutation.mutate(a.id)}
                        disabled={resolveMutation.isPending}
                        data-testid={`resolve-alert-${a.id}`}
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Resolve
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsTab() {
  const { toast } = useToast();
  const { data: configs, isLoading } = useQuery<ConfigItem[]>({
    queryKey: ["/api/admin/compliance/config"],
  });

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const updateMutation = useMutation({
    mutationFn: ({ configKey, configValue }: { configKey: string; configValue: any }) =>
      apiRequest("PATCH", "/api/admin/compliance/config", { configKey, configValue }),
    onSuccess: () => {
      toast({ title: "Configuration updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/compliance/config"] });
      setEditingKey(null);
    },
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4" data-testid="settings-panel">
      <h3 className="text-lg font-semibold">Risk Configuration</h3>
      <div className="space-y-3">
        {configs?.map((c) => (
          <Card key={c.id} data-testid={`config-${c.configKey}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-sm font-semibold">{c.configKey}</p>
                  <p className="text-xs text-muted-foreground">{c.description}</p>
                  {editingKey === c.configKey ? (
                    <div className="flex gap-2 mt-2">
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="h-8 text-sm font-mono"
                        data-testid={`input-config-${c.configKey}`}
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          try {
                            const parsed = JSON.parse(editValue);
                            updateMutation.mutate({ configKey: c.configKey, configValue: parsed });
                          } catch {
                            updateMutation.mutate({ configKey: c.configKey, configValue: editValue });
                          }
                        }}
                        disabled={updateMutation.isPending}
                        data-testid={`save-config-${c.configKey}`}
                      >
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingKey(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <p className="text-sm font-mono mt-1 bg-muted p-1 rounded">
                      {typeof c.configValue === "object" ? JSON.stringify(c.configValue) : String(c.configValue)}
                    </p>
                  )}
                </div>
                {editingKey !== c.configKey && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingKey(c.configKey);
                      setEditValue(typeof c.configValue === "object" ? JSON.stringify(c.configValue, null, 2) : String(c.configValue));
                    }}
                    data-testid={`edit-config-${c.configKey}`}
                  >
                    Edit
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function ComplianceMonitorPage() {
  return (
    <AdminLayout title="AI Compliance Monitor">
      <div className="space-y-6" data-testid="compliance-monitor-page">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">AI Compliance Monitor</h1>
          <p className="text-muted-foreground">Risk scoring, anomaly detection, and compliance alerts for agency monitoring</p>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="flex flex-wrap gap-1">
            <TabsTrigger value="overview" data-testid="tab-overview">
              <BarChart3 className="w-4 h-4 mr-1" /> Overview
            </TabsTrigger>
            <TabsTrigger value="risk-scores" data-testid="tab-risk-scores">
              <ShieldAlert className="w-4 h-4 mr-1" /> Risk Scores
            </TabsTrigger>
            <TabsTrigger value="anomalies" data-testid="tab-anomalies">
              <AlertTriangle className="w-4 h-4 mr-1" /> Anomalies
            </TabsTrigger>
            <TabsTrigger value="alerts" data-testid="tab-alerts">
              <Bell className="w-4 h-4 mr-1" /> Alerts
            </TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings">
              <Settings className="w-4 h-4 mr-1" /> Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview"><OverviewTab /></TabsContent>
          <TabsContent value="risk-scores"><RiskScoresTab /></TabsContent>
          <TabsContent value="anomalies"><AnomaliesTab /></TabsContent>
          <TabsContent value="alerts"><AlertsTab /></TabsContent>
          <TabsContent value="settings"><SettingsTab /></TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
