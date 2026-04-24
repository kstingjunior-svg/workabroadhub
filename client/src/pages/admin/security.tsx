import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, AlertTriangle, CreditCard, Activity, CheckCircle, Clock, User, FileSearch, Brain, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

type SecurityAlert = {
  id: string;
  alertType: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  ipAddress: string | null;
  userId: string | null;
  metadata: Record<string, unknown> | null;
  isResolved: boolean;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
};

type DashboardStats = {
  total: number;
  unresolved: number;
  critical: number;
};

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-blue-100 text-blue-800",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

const TYPE_LABELS: Record<string, string> = {
  suspicious_login: "Suspicious Login",
  payment_fraud: "Payment Fraud",
  api_abuse: "API Abuse",
  admin_abuse: "Admin Abuse",
  system_vulnerability: "System Vulnerability",
  file_upload: "File Upload",
};

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${SEVERITY_COLORS[severity] ?? "bg-gray-100 text-gray-700"}`}
      data-testid={`badge-severity-${severity}`}
    >
      {severity.toUpperCase()}
    </span>
  );
}

function SecurityAlertsTab() {
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterResolved, setFilterResolved] = useState<string>("unresolved");
  const { toast } = useToast();

  const { data: alerts = [], isLoading } = useQuery<SecurityAlert[]>({
    queryKey: ["/api/admin/security-alerts", filterSeverity, filterResolved],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterSeverity !== "all") params.set("severity", filterSeverity);
      if (filterResolved !== "all") params.set("isResolved", filterResolved === "resolved" ? "true" : "false");
      params.set("limit", "100");
      const res = await fetch(`/api/admin/security-alerts?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/admin/security-alerts/${id}/resolve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/security-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/security-dashboard"] });
      toast({ title: "Alert resolved", description: "Security alert marked as resolved." });
    },
    onError: () => toast({ title: "Error", description: "Failed to resolve alert.", variant: "destructive" }),
  });

  const bulkResolveLocalhostMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/security-alerts/bulk-resolve-localhost", {}),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/security-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/security-dashboard"] });
      toast({ title: "False positives cleared", description: data.message });
    },
    onError: () => toast({ title: "Error", description: "Failed to bulk resolve.", variant: "destructive" }),
  });

  const localhostAlertCount = alerts.filter(
    a => (["127.0.0.1","::1","::ffff:127.0.0.1","localhost"].includes(a.ipAddress ?? "") || a.description?.includes("127.0.0.1"))
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap items-center justify-between">
        <div className="flex gap-3 flex-wrap">
          <Select value={filterSeverity} onValueChange={setFilterSeverity}>
            <SelectTrigger className="w-36" data-testid="select-severity-filter">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterResolved} onValueChange={setFilterResolved}>
            <SelectTrigger className="w-36" data-testid="select-resolved-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="unresolved">Unresolved</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {localhostAlertCount > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => bulkResolveLocalhostMutation.mutate()}
            disabled={bulkResolveLocalhostMutation.isPending}
            className="text-xs border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400"
            data-testid="button-bulk-resolve-localhost"
            title="Permanently delete false-positive alerts from 127.0.0.1 (server's own internal traffic)"
          >
            <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
            {bulkResolveLocalhostMutation.isPending
              ? "Deleting…"
              : `Delete ${localhostAlertCount} localhost false-positive${localhostAlertCount > 1 ? "s" : ""}`}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading alerts…</div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground flex flex-col items-center gap-2">
          <Shield className="h-8 w-8 text-green-500" />
          <p>No security alerts found for this filter.</p>
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Severity</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alerts.map((alert) => (
                <TableRow key={alert.id} data-testid={`row-alert-${alert.id}`}>
                  <TableCell>
                    <SeverityBadge severity={alert.severity} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {TYPE_LABELS[alert.alertType] ?? alert.alertType}
                  </TableCell>
                  <TableCell className="font-medium text-sm max-w-[180px]">
                    <span data-testid={`text-alert-title-${alert.id}`}>{alert.title}</span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[240px] break-words">
                    {alert.description}
                  </TableCell>
                  <TableCell className="text-xs font-mono">{alert.ipAddress ?? "—"}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {new Date(alert.createdAt).toLocaleString("en-KE", { dateStyle: "short", timeStyle: "short" })}
                  </TableCell>
                  <TableCell>
                    {alert.isResolved ? (
                      <Badge variant="outline" className="text-green-600 border-green-300 text-xs">
                        <CheckCircle className="h-3 w-3 mr-1" /> Resolved
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-orange-600 border-orange-300 text-xs">
                        <Clock className="h-3 w-3 mr-1" /> Open
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {!alert.isResolved && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7"
                        data-testid={`button-resolve-${alert.id}`}
                        onClick={() => resolveMutation.mutate(alert.id)}
                        disabled={resolveMutation.isPending}
                      >
                        Resolve
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function FraudAlertsTab() {
  const { data: fraudAlerts = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/fraud-alerts"],
  });

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading…</div>
      ) : fraudAlerts.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground flex flex-col items-center gap-2">
          <CreditCard className="h-8 w-8 text-green-500" />
          <p>No flagged payments found.</p>
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payment ID</TableHead>
                <TableHead>User ID</TableHead>
                <TableHead>Amount (KES)</TableHead>
                <TableHead>Fraud Reason</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fraudAlerts.map((p: any) => (
                <TableRow key={p.id} data-testid={`row-fraud-${p.id}`}>
                  <TableCell className="text-xs font-mono">{p.id.slice(0, 8)}…</TableCell>
                  <TableCell className="text-xs">{p.userId}</TableCell>
                  <TableCell className="font-semibold">{p.amount?.toLocaleString()}</TableCell>
                  <TableCell className="text-xs text-red-600 max-w-[220px] break-words">{p.fraudReason ?? "—"}</TableCell>
                  <TableCell className="text-xs capitalize">{p.method}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {p.createdAt ? new Date(p.createdAt).toLocaleString("en-KE", { dateStyle: "short", timeStyle: "short" }) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function AdminActivityTab() {
  const { data: logs = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/admin-activity"],
  });

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading…</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground flex flex-col items-center gap-2">
          <Activity className="h-8 w-8 text-muted-foreground" />
          <p>No admin activity logged yet.</p>
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Admin ID</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Record Type</TableHead>
                <TableHead>Record ID</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log: any) => (
                <TableRow key={log.id} data-testid={`row-activity-${log.id}`}>
                  <TableCell className="text-xs font-mono flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {log.userId?.slice(0, 8) ?? "—"}…
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{log.recordType ?? "—"}</TableCell>
                  <TableCell className="text-xs font-mono">{log.recordId ? `${log.recordId.slice(0, 8)}…` : "—"}</TableCell>
                  <TableCell className="text-xs font-mono">{log.ipAddress ?? "—"}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {log.createdAt ? new Date(log.createdAt).toLocaleString("en-KE", { dateStyle: "short", timeStyle: "short" }) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

type SecurityAiDashboard = {
  generatedAt: string;
  alerts: { total: number; unresolved: number; critical: number };
  last1h: { totalEvents: number; totalRiskPoints: number; uniqueIPs: number; uniqueUsers: number; byType: Record<string, number> };
  last24h: { totalEvents: number; totalRiskPoints: number; uniqueIPs: number; uniqueUsers: number; byType: Record<string, number> };
  topSuspiciousIPs: { ipAddress: string; totalRiskPoints: number; eventCount: number; eventTypes: string[] }[];
  highRiskUsers: { userId: string; totalRiskPoints: number; eventCount: number; eventTypes: string[] }[];
  riskScoring: Record<string, number>;
};

type SecurityEventRow = {
  id: string;
  eventType: string;
  riskPoints: number;
  ipAddress: string | null;
  userId: string | null;
  endpoint: string | null;
  createdAt: string;
};

const EVENT_COLORS: Record<string, string> = {
  rate_limit_hit: "bg-orange-100 text-orange-800",
  auth_failure: "bg-red-100 text-red-800",
  xss_attempt: "bg-red-200 text-red-900",
  restricted_route_access: "bg-purple-100 text-purple-800",
  file_upload_rejected: "bg-yellow-100 text-yellow-800",
  payment_attempt: "bg-blue-100 text-blue-800",
  admin_access: "bg-gray-100 text-gray-700",
};

function SecurityAiTab() {
  const [eventFilter, setEventFilter] = useState("all");

  const { data: dashboard, isLoading: dashLoading } = useQuery<SecurityAiDashboard>({
    queryKey: ["/api/admin/security-ai/dashboard"],
    refetchInterval: 60_000,
  });

  const { data: events, isLoading: eventsLoading } = useQuery<SecurityEventRow[]>({
    queryKey: ["/api/admin/security-ai/events", eventFilter],
    queryFn: () => {
      const params = eventFilter !== "all" ? `?eventType=${eventFilter}` : "";
      return fetch(`/api/admin/security-ai/events${params}`, { credentials: "include" }).then(r => r.json());
    },
    refetchInterval: 30_000,
  });

  if (dashLoading) return <div className="text-center py-8 text-muted-foreground">Loading anomaly detection data…</div>;

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        Events collected by real-time hooks on rate limiters, XSS filter, and login handlers. Scanner runs every 5 minutes.
        Last updated: {dashboard ? new Date(dashboard.generatedAt).toLocaleTimeString("en-KE") : "—"}
      </p>

      {/* 24h stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Events (24h)", value: dashboard?.last24h.totalEvents ?? 0, color: "text-foreground" },
          { label: "Risk points (24h)", value: dashboard?.last24h.totalRiskPoints ?? 0, color: dashboard?.last24h.totalRiskPoints ?? 0 > 100 ? "text-red-600" : "text-green-600" },
          { label: "Unique IPs (24h)", value: dashboard?.last24h.uniqueIPs ?? 0, color: "text-foreground" },
          { label: "Events (last 1h)", value: dashboard?.last1h.totalEvents ?? 0, color: dashboard?.last1h.totalEvents ?? 0 > 10 ? "text-orange-600" : "text-foreground" },
        ].map((s) => (
          <Card key={s.label} data-testid={`card-ai-${s.label.replace(/\s+/g, "-").toLowerCase()}`}>
            <CardContent className="pt-4">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Risk scoring legend */}
      {dashboard?.riskScoring && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Risk Point Scoring</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(dashboard.riskScoring).map(([type, pts]) => (
              <span key={type} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${EVENT_COLORS[type] ?? "bg-gray-100 text-gray-700"}`} data-testid={`risk-score-${type}`}>
                {type.replace(/_/g, " ")}: <strong>+{pts}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Top suspicious IPs */}
        <div>
          <h3 className="text-sm font-semibold mb-2">Top Suspicious IPs (24h)</h3>
          {!dashboard?.topSuspiciousIPs.length ? (
            <p className="text-xs text-muted-foreground">No suspicious IP activity recorded</p>
          ) : (
            <div className="rounded-md border overflow-hidden">
              {dashboard.topSuspiciousIPs.map((row, i) => (
                <div key={i} className="flex items-start gap-2 px-3 py-2 border-b last:border-b-0 text-xs" data-testid={`ip-row-${i}`}>
                  <Zap className="h-3 w-3 text-orange-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-mono font-medium truncate">{row.ipAddress}</div>
                    <div className="text-muted-foreground">{row.eventTypes.join(", ")}</div>
                  </div>
                  <Badge variant="outline" className="text-red-600 border-red-300 shrink-0">{row.totalRiskPoints} pts</Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* High risk users */}
        <div>
          <h3 className="text-sm font-semibold mb-2">High Risk Users (24h)</h3>
          {!dashboard?.highRiskUsers.length ? (
            <p className="text-xs text-muted-foreground">No high-risk user activity recorded</p>
          ) : (
            <div className="rounded-md border overflow-hidden">
              {dashboard.highRiskUsers.map((row, i) => (
                <div key={i} className="flex items-start gap-2 px-3 py-2 border-b last:border-b-0 text-xs" data-testid={`user-risk-row-${i}`}>
                  <User className="h-3 w-3 text-purple-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-mono font-medium truncate">{row.userId}</div>
                    <div className="text-muted-foreground">{row.eventTypes.join(", ")}</div>
                  </div>
                  <Badge variant="outline" className="text-red-600 border-red-300 shrink-0">{row.totalRiskPoints} pts</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Event log */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Raw Event Log (last 24h)</h3>
          <Select value={eventFilter} onValueChange={setEventFilter} data-testid="select-event-type-filter">
            <SelectTrigger className="w-44 h-7 text-xs">
              <SelectValue placeholder="All event types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {Object.keys(EVENT_COLORS).map(t => (
                <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {eventsLoading ? (
          <div className="text-xs text-muted-foreground">Loading events…</div>
        ) : !events?.length ? (
          <div className="text-xs text-muted-foreground">No events recorded in this window. Events will appear as rate limits are hit or XSS attempts are blocked.</div>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Risk</TableHead>
                  <TableHead className="text-xs">IP</TableHead>
                  <TableHead className="text-xs">Endpoint</TableHead>
                  <TableHead className="text-xs">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((ev) => (
                  <TableRow key={ev.id} data-testid={`event-row-${ev.id}`}>
                    <TableCell>
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-xs ${EVENT_COLORS[ev.eventType] ?? "bg-gray-100 text-gray-700"}`}>
                        {ev.eventType.replace(/_/g, " ")}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-red-600">+{ev.riskPoints}</TableCell>
                    <TableCell className="text-xs font-mono">{ev.ipAddress ?? "—"}</TableCell>
                    <TableCell className="text-xs truncate max-w-[120px]">{ev.endpoint ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(ev.createdAt).toLocaleTimeString("en-KE")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

type VulnerabilitySummary = {
  generatedAt: string;
  environment: string;
  alertSummary: { total: number; unresolved: number; critical: number };
  activeSecurityControls: { control: string; status: string; layer: string }[];
  riskIndicators: {
    accountsWithFailedLogins: number;
    suspiciousPayments: number;
    unresolvedSecurityAlerts: number;
    criticalAlerts: number;
  };
  recommendations: { priority: string; message: string }[];
};

const LAYER_COLORS: Record<string, string> = {
  HTTP: "bg-blue-100 text-blue-800",
  API: "bg-purple-100 text-purple-800",
  Auth: "bg-yellow-100 text-yellow-800",
  Payment: "bg-green-100 text-green-800",
  Admin: "bg-orange-100 text-orange-800",
  Upload: "bg-teal-100 text-teal-800",
  Database: "bg-indigo-100 text-indigo-800",
  Logging: "bg-gray-100 text-gray-700",
  Monitoring: "bg-pink-100 text-pink-800",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "border-red-400 bg-red-50 text-red-800",
  high: "border-orange-400 bg-orange-50 text-orange-800",
  info: "border-blue-300 bg-blue-50 text-blue-800",
};

function VulnerabilitySummaryTab() {
  const { data, isLoading } = useQuery<VulnerabilitySummary>({
    queryKey: ["/api/admin/vulnerability-summary"],
    refetchInterval: 5 * 60 * 1000,
  });

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">Generating security posture report…</div>;
  if (!data) return null;

  const grouped = data.activeSecurityControls.reduce<Record<string, typeof data.activeSecurityControls>>((acc, c) => {
    if (!acc[c.layer]) acc[c.layer] = [];
    acc[c.layer].push(c);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {/* Generated at */}
      <p className="text-xs text-muted-foreground">
        Report generated: {new Date(data.generatedAt).toLocaleString("en-KE")} · Environment: <span className="font-semibold">{data.environment}</span>
      </p>

      {/* Risk indicators */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Accounts with failures", value: data.riskIndicators.accountsWithFailedLogins, warn: 5 },
          { label: "Suspicious payments", value: data.riskIndicators.suspiciousPayments, warn: 1 },
          { label: "Unresolved alerts", value: data.riskIndicators.unresolvedSecurityAlerts, warn: 3 },
          { label: "Critical alerts", value: data.riskIndicators.criticalAlerts, warn: 1 },
        ].map((indicator) => (
          <Card key={indicator.label} data-testid={`card-risk-${indicator.label.replace(/\s+/g, "-").toLowerCase()}`}>
            <CardContent className="pt-4">
              <div className={`text-2xl font-bold ${indicator.value >= indicator.warn ? "text-red-600" : "text-green-600"}`}>
                {indicator.value}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{indicator.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recommendations */}
      {data.recommendations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Recommendations</h3>
          {data.recommendations.map((rec, i) => (
            <div key={i} className={`rounded-md border px-3 py-2 text-xs ${PRIORITY_COLORS[rec.priority] ?? "border-gray-300 bg-gray-50"}`} data-testid={`recommendation-${i}`}>
              <span className="font-semibold uppercase mr-2">{rec.priority}</span>
              {rec.message}
            </div>
          ))}
        </div>
      )}

      {/* Active security controls by layer */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Active Security Controls ({data.activeSecurityControls.length} total)</h3>
        {Object.entries(grouped).map(([layer, controls]) => (
          <div key={layer}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${LAYER_COLORS[layer] ?? "bg-gray-100 text-gray-700"}`}>
                {layer}
              </span>
            </div>
            <div className="rounded-md border overflow-hidden">
              {controls.map((c) => (
                <div key={c.control} className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0 text-xs" data-testid={`control-${c.control.slice(0, 20)}`}>
                  <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                  <span className="flex-1">{c.control}</span>
                  <Badge variant="outline" className="text-green-600 border-green-300 text-xs shrink-0">
                    {c.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type AccessViolation = {
  userId: string | null;
  endpoint: string;
  method: string;
  ip: string;
  reason: string;
  planId: string;
  timestamp: string;
};

const REASON_LABELS: Record<string, { label: string; color: string }> = {
  unauthenticated: { label: "No Session", color: "bg-gray-100 text-gray-700" },
  free_plan: { label: "Free Plan", color: "bg-yellow-100 text-yellow-800" },
  insufficient_plan: { label: "Wrong Plan", color: "bg-orange-100 text-orange-800" },
  expired: { label: "Expired", color: "bg-red-100 text-red-800" },
};

function AccessViolationsTab() {
  const { data, isLoading, refetch } = useQuery<{ violations: AccessViolation[]; total: number }>({
    queryKey: ["/api/admin/access-violations"],
    refetchInterval: 15_000,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">Premium Access Violations</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Real-time log of blocked attempts to access premium APIs — refreshes every 15s.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} data-testid="btn-refresh-violations">
          Refresh
        </Button>
      </div>

      {isLoading && <p className="text-center text-gray-500 py-8">Loading…</p>}

      {!isLoading && (!data?.violations || data.violations.length === 0) && (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <p className="font-semibold text-gray-700 dark:text-white">No violations recorded</p>
            <p className="text-sm text-gray-500 mt-1">All premium access attempts have been authorised.</p>
          </CardContent>
        </Card>
      )}

      {data && data.violations.length > 0 && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Time</TableHead>
                  <TableHead className="text-xs">Endpoint</TableHead>
                  <TableHead className="text-xs">User ID</TableHead>
                  <TableHead className="text-xs">Plan</TableHead>
                  <TableHead className="text-xs">Reason</TableHead>
                  <TableHead className="text-xs">IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.violations.map((v, i) => {
                  const reasonInfo = REASON_LABELS[v.reason] || { label: v.reason, color: "bg-gray-100 text-gray-700" };
                  return (
                    <TableRow key={i} data-testid={`violation-row-${i}`}>
                      <TableCell className="text-xs text-gray-500 whitespace-nowrap">
                        {new Date(v.timestamp).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-blue-700 dark:text-blue-400">
                        <span className="mr-1 text-gray-400">{v.method}</span>{v.endpoint}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-gray-600 dark:text-gray-300 max-w-[120px] truncate">
                        {v.userId ?? <span className="text-gray-400 italic">anon</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{v.planId || "—"}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${reasonInfo.color}`}>
                          {reasonInfo.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-gray-500">{v.ip}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-gray-400 text-center">
        Last {data?.total ?? 0} violations shown (in-memory, resets on server restart). Max 500 stored.
      </p>
    </div>
  );
}

export default function AdminSecurity() {
  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ["/api/admin/security-dashboard"],
  });

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center gap-2">
        <Link href="/admin" className="text-muted-foreground text-sm hover:text-foreground">Admin</Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">Security Monitor</span>
      </div>

      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-blue-600" />
        <div>
          <h1 className="text-xl font-bold">Security Monitor</h1>
          <p className="text-sm text-muted-foreground">Automated threat detection, fraud alerts, and admin audit log</p>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card data-testid="card-total-alerts">
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{stats?.total ?? "—"}</div>
            <div className="text-xs text-muted-foreground mt-1">Total Alerts</div>
          </CardContent>
        </Card>
        <Card data-testid="card-unresolved-alerts">
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-orange-600">{stats?.unresolved ?? "—"}</div>
            <div className="text-xs text-muted-foreground mt-1">Unresolved</div>
          </CardContent>
        </Card>
        <Card data-testid="card-critical-alerts">
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-red-600">{stats?.critical ?? "—"}</div>
            <div className="text-xs text-muted-foreground mt-1">Critical</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="security-alerts">
        <TabsList className="w-full grid grid-cols-3 md:grid-cols-6" data-testid="tabs-security">
          <TabsTrigger value="security-alerts" className="text-xs" data-testid="tab-security-alerts">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Alerts
          </TabsTrigger>
          <TabsTrigger value="fraud-alerts" className="text-xs" data-testid="tab-fraud-alerts">
            <CreditCard className="h-3 w-3 mr-1" />
            Fraud
          </TabsTrigger>
          <TabsTrigger value="admin-activity" className="text-xs" data-testid="tab-admin-activity">
            <Activity className="h-3 w-3 mr-1" />
            Activity
          </TabsTrigger>
          <TabsTrigger value="anomaly-detection" className="text-xs" data-testid="tab-anomaly-detection">
            <Brain className="h-3 w-3 mr-1" />
            Anomaly
          </TabsTrigger>
          <TabsTrigger value="vulnerability-summary" className="text-xs" data-testid="tab-vulnerability-summary">
            <FileSearch className="h-3 w-3 mr-1" />
            Posture
          </TabsTrigger>
          <TabsTrigger value="access-violations" className="text-xs" data-testid="tab-access-violations">
            <Zap className="h-3 w-3 mr-1" />
            Blocked
          </TabsTrigger>
        </TabsList>

        <TabsContent value="security-alerts" className="mt-4">
          <SecurityAlertsTab />
        </TabsContent>
        <TabsContent value="fraud-alerts" className="mt-4">
          <FraudAlertsTab />
        </TabsContent>
        <TabsContent value="admin-activity" className="mt-4">
          <AdminActivityTab />
        </TabsContent>
        <TabsContent value="anomaly-detection" className="mt-4">
          <SecurityAiTab />
        </TabsContent>
        <TabsContent value="vulnerability-summary" className="mt-4">
          <VulnerabilitySummaryTab />
        </TabsContent>
        <TabsContent value="access-violations" className="mt-4">
          <AccessViolationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
