import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AdminLayout from "@/components/admin-layout";
import { Textarea } from "@/components/ui/textarea";
import {
  Settings,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Search,
  Activity,
  Shield,
  Zap,
  ToggleLeft,
  Server,
  Play,
  RotateCcw,
  ExternalLink,
  Plug,
  FileCheck,
  Upload,
  Eye,
  ThumbsUp,
  ThumbsDown,
  AlertOctagon,
  Download,
  BarChart3,
  FileText,
  Timer,
  History,
} from "lucide-react";

interface GovernmentIntegration {
  id: string;
  name: string;
  code: string;
  description: string | null;
  baseUrl: string | null;
  authType: string;
  credentialRef: string | null;
  enabled: boolean;
  supportedActions: string;
  rateLimit: number | null;
  timeoutMs: number | null;
  retryAttempts: number | null;
  lastHealthCheck: string | null;
  healthStatus: string | null;
  fallbackMode: boolean;
  fallbackReason: string | null;
  fallbackActivatedAt: string | null;
  metadata: any;
  createdAt: string;
  updatedAt: string;
}

interface ManualOverride {
  id: string;
  integrationCode: string;
  licenseNumber: string;
  agencyId: string | null;
  agencyName: string | null;
  overrideStatus: string;
  manualLicenseStatus: string;
  reason: string;
  evidence: any[];
  submittedBy: string;
  reviewedBy: string | null;
  reviewNotes: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  syncRequired: boolean;
  syncStatus: string;
  syncResult: any;
  mismatchNotes: string | null;
  expiryDateOverride: string | null;
  createdAt: string;
  updatedAt: string;
}

interface OverrideStats {
  submitted: number;
  inReview: number;
  approved: number;
  rejected: number;
  pendingSync: number;
  synced: number;
  mismatched: number;
  total: number;
}

interface GovernmentSyncLog {
  id: string;
  integrationId: string;
  integrationCode: string;
  action: string;
  licenseNumber: string | null;
  agencyId: string | null;
  requestId: string;
  status: string;
  normalizedStatus: string | null;
  errorMessage: string | null;
  retryCount: number;
  durationMs: number | null;
  triggeredBy: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface GovernmentFeatureFlag {
  id: string;
  key: string;
  enabled: boolean;
  description: string | null;
  integrationCode: string | null;
  rolloutPercentage: number | null;
  createdAt: string;
  updatedAt: string;
}

interface ComplianceAuditLog {
  id: string;
  userId: string;
  userRole: string;
  action: string;
  recordType: string;
  recordId: string;
  details: any;
  ipAddress: string;
  createdAt: string;
}

interface GovernmentDowntimeEvent {
  id: string;
  integrationCode: string;
  eventType: string;
  reason: string;
  triggeredBy: string;
  durationMs: number;
  metadata: any;
  createdAt: string;
}

interface AuditExport {
  id: string;
  exportedBy: string;
  exportType: string;
  filters: any;
  recordCount: number;
  hashSignature: string;
  createdAt: string;
}

interface AdapterInfo {
  code: string;
  name: string;
  supportedActions: string[];
  [key: string]: any;
}

interface CircuitBreakerState {
  state: string;
  failures: number;
  lastFailure: string | null;
  [key: string]: any;
}

function healthBadge(status: string | null) {
  if (!status) return <Badge variant="outline" data-testid="health-unknown"><Clock className="w-3 h-3 mr-1" />Unknown</Badge>;
  if (status === "healthy") return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" data-testid="health-healthy"><CheckCircle2 className="w-3 h-3 mr-1" />Healthy</Badge>;
  if (status === "degraded") return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" data-testid="health-degraded"><AlertTriangle className="w-3 h-3 mr-1" />Degraded</Badge>;
  return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" data-testid="health-unhealthy"><XCircle className="w-3 h-3 mr-1" />Unhealthy</Badge>;
}

function syncStatusBadge(status: string) {
  switch (status) {
    case "completed":
    case "success":
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" data-testid={`sync-status-${status}`}><CheckCircle2 className="w-3 h-3 mr-1" />Success</Badge>;
    case "failed":
    case "error":
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" data-testid={`sync-status-${status}`}><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
    case "pending":
    case "in_progress":
      return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" data-testid={`sync-status-${status}`}><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    default:
      return <Badge variant="outline" data-testid={`sync-status-${status}`}>{status}</Badge>;
  }
}

function circuitBadge(state: string) {
  switch (state) {
    case "closed":
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" data-testid="circuit-closed"><CheckCircle2 className="w-3 h-3 mr-1" />Closed</Badge>;
    case "open":
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" data-testid="circuit-open"><XCircle className="w-3 h-3 mr-1" />Open</Badge>;
    case "half-open":
      return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" data-testid="circuit-half-open"><AlertTriangle className="w-3 h-3 mr-1" />Half-Open</Badge>;
    default:
      return <Badge variant="outline">{state}</Badge>;
  }
}

export default function AdminGovernmentIntegrations() {
  const [activeTab, setActiveTab] = useState("integrations");
  const { toast } = useToast();

  return (
    <AdminLayout title="Government Integrations">
      <div className="space-y-6" data-testid="government-integrations-page">
        <div>
          <h1 className="text-2xl font-bold" data-testid="page-title">Government Integrations</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage government API integrations, sync logs, feature flags, and adapter health
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} data-testid="tabs-container">
          <TabsList data-testid="tabs-list">
            <TabsTrigger value="integrations" data-testid="tab-integrations">
              <Plug className="w-4 h-4 mr-1" />
              Integrations
            </TabsTrigger>
            <TabsTrigger value="sync-logs" data-testid="tab-sync-logs">
              <Activity className="w-4 h-4 mr-1" />
              Sync Logs
            </TabsTrigger>
            <TabsTrigger value="feature-flags" data-testid="tab-feature-flags">
              <ToggleLeft className="w-4 h-4 mr-1" />
              Feature Flags
            </TabsTrigger>
            <TabsTrigger value="adapters" data-testid="tab-adapters">
              <Server className="w-4 h-4 mr-1" />
              Adapters & Health
            </TabsTrigger>
            <TabsTrigger value="manual-overrides" data-testid="tab-manual-overrides">
              <FileCheck className="w-4 h-4 mr-1" />
              Manual Overrides
            </TabsTrigger>
            <TabsTrigger value="compliance-logs" data-testid="tab-compliance-logs">
              <Shield className="w-4 h-4 mr-1" />
              Compliance Logs
            </TabsTrigger>
            <TabsTrigger value="downtime-analytics" data-testid="tab-downtime-analytics">
              <Activity className="w-4 h-4 mr-1" />
              Downtime Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="integrations">
            <IntegrationsTab />
          </TabsContent>
          <TabsContent value="sync-logs">
            <SyncLogsTab />
          </TabsContent>
          <TabsContent value="feature-flags">
            <FeatureFlagsTab />
          </TabsContent>
          <TabsContent value="adapters">
            <AdaptersTab />
          </TabsContent>
          <TabsContent value="manual-overrides">
            <ManualOverridesTab />
          </TabsContent>
          <TabsContent value="compliance-logs">
            <ComplianceLogsTab />
          </TabsContent>
          <TabsContent value="downtime-analytics">
            <DowntimeAnalyticsTab />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}

function IntegrationsTab() {
  const { toast } = useToast();
  const [editingIntegration, setEditingIntegration] = useState<GovernmentIntegration | null>(null);

  const { data: integrations, isLoading } = useQuery<GovernmentIntegration[]>({
    queryKey: ["/api/admin/government/integrations"],
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/government/integrations/${id}`, { enabled });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Integration updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/government/integrations"] });
    },
    onError: (error: any) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<GovernmentIntegration> }) => {
      const res = await apiRequest("PATCH", `/api/admin/government/integrations/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Settings saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/government/integrations"] });
      setEditingIntegration(null);
    },
    onError: (error: any) => {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 mt-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
      </div>
    );
  }

  if (!integrations || integrations.length === 0) {
    return (
      <Card className="mt-4">
        <CardContent className="py-12 text-center text-muted-foreground">
          <Plug className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium">No integrations configured</p>
          <p className="text-sm mt-1">Government integrations will appear here once configured.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 mt-4" data-testid="integrations-list">
      {integrations.map((integration) => (
        <Card key={integration.id} data-testid={`integration-card-${integration.id}`}>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold" data-testid={`integration-name-${integration.id}`}>{integration.name}</h3>
                  <Badge variant="outline" className="text-xs">{integration.code}</Badge>
                  {healthBadge(integration.healthStatus)}
                </div>
                {integration.description && (
                  <p className="text-sm text-muted-foreground mt-1">{integration.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                  <span>Auth: {integration.authType}</span>
                  {integration.rateLimit && <span>Rate: {integration.rateLimit}/min</span>}
                  {integration.timeoutMs && <span>Timeout: {integration.timeoutMs}ms</span>}
                  {integration.lastHealthCheck && (
                    <span>Last check: {new Date(integration.lastHealthCheck).toLocaleString()}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={integration.enabled}
                  onCheckedChange={(enabled) => toggleMutation.mutate({ id: integration.id, enabled })}
                  disabled={toggleMutation.isPending}
                  data-testid={`toggle-integration-${integration.id}`}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingIntegration(integration)}
                  data-testid={`edit-integration-${integration.id}`}
                >
                  <Settings className="w-3 h-3 mr-1" />
                  Settings
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {editingIntegration && (
        <IntegrationSettingsDialog
          integration={editingIntegration}
          onClose={() => setEditingIntegration(null)}
          onSave={(data) => saveMutation.mutate({ id: editingIntegration.id, data })}
          isPending={saveMutation.isPending}
        />
      )}
    </div>
  );
}

function IntegrationSettingsDialog({
  integration,
  onClose,
  onSave,
  isPending,
}: {
  integration: GovernmentIntegration;
  onClose: () => void;
  onSave: (data: Partial<GovernmentIntegration>) => void;
  isPending: boolean;
}) {
  const [baseUrl, setBaseUrl] = useState(integration.baseUrl || "");
  const [rateLimit, setRateLimit] = useState(String(integration.rateLimit || ""));
  const [timeoutMs, setTimeoutMs] = useState(String(integration.timeoutMs || ""));
  const [retryAttempts, setRetryAttempts] = useState(String(integration.retryAttempts || ""));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md" data-testid="integration-settings-dialog">
        <DialogHeader>
          <DialogTitle>Integration Settings</DialogTitle>
          <DialogDescription>{integration.name} ({integration.code})</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Base URL</Label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com"
              data-testid="input-base-url"
            />
          </div>
          <div>
            <Label>Rate Limit (requests/min)</Label>
            <Input
              type="number"
              value={rateLimit}
              onChange={(e) => setRateLimit(e.target.value)}
              placeholder="60"
              data-testid="input-rate-limit"
            />
          </div>
          <div>
            <Label>Timeout (ms)</Label>
            <Input
              type="number"
              value={timeoutMs}
              onChange={(e) => setTimeoutMs(e.target.value)}
              placeholder="30000"
              data-testid="input-timeout"
            />
          </div>
          <div>
            <Label>Retry Attempts</Label>
            <Input
              type="number"
              value={retryAttempts}
              onChange={(e) => setRetryAttempts(e.target.value)}
              placeholder="3"
              data-testid="input-retry-attempts"
            />
          </div>
          <Button
            className="w-full"
            onClick={() =>
              onSave({
                baseUrl: baseUrl || null,
                rateLimit: rateLimit ? parseInt(rateLimit) : null,
                timeoutMs: timeoutMs ? parseInt(timeoutMs) : null,
                retryAttempts: retryAttempts ? parseInt(retryAttempts) : null,
              })
            }
            disabled={isPending}
            data-testid="save-settings-btn"
          >
            {isPending ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SyncLogsTab() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [codeFilter, setCodeFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");

  const buildQueryString = () => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (codeFilter !== "all") params.set("integrationCode", codeFilter);
    if (actionFilter !== "all") params.set("action", actionFilter);
    params.set("limit", "100");
    return params.toString();
  };

  const { data: logsData, isLoading: logsLoading } = useQuery<{ logs: GovernmentSyncLog[] }>({
    queryKey: ["/api/admin/government/sync-logs", statusFilter, codeFilter, actionFilter],
    queryFn: async () => {
      const res = await fetch(`/api/admin/government/sync-logs?${buildQueryString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch sync logs");
      return res.json();
    },
  });

  const { data: stats, isLoading: statsLoading } = useQuery<any>({
    queryKey: ["/api/admin/government/sync-stats"],
  });

  const { data: integrations } = useQuery<GovernmentIntegration[]>({
    queryKey: ["/api/admin/government/integrations"],
  });

  const retryMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const res = await apiRequest("POST", `/api/admin/government/sync/retry/${requestId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Retry initiated", description: "The sync request has been retried." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/government/sync-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/government/sync-stats"] });
    },
    onError: (error: any) => {
      toast({ title: "Retry failed", description: error.message, variant: "destructive" });
    },
  });

  const logs = logsData?.logs || (Array.isArray(logsData) ? logsData : []);
  const integrationCodes = integrations?.map((i) => i.code) || [];

  return (
    <div className="space-y-4 mt-4">
      {statsLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="sync-stats">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold" data-testid="stat-total-syncs">{stats.total || 0}</p>
                  <p className="text-xs text-muted-foreground">Total Syncs</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <div>
                  <p className="text-2xl font-bold" data-testid="stat-successful">{stats.completed || stats.success || 0}</p>
                  <p className="text-xs text-muted-foreground">Successful</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-500" />
                <div>
                  <p className="text-2xl font-bold" data-testid="stat-failed">{stats.failed || 0}</p>
                  <p className="text-xs text-muted-foreground">Failed</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-purple-500" />
                <div>
                  <p className="text-2xl font-bold" data-testid="stat-avg-duration">{stats.avgDurationMs ? `${Math.round(stats.avgDurationMs)}ms` : "N/A"}</p>
                  <p className="text-xs text-muted-foreground">Avg Duration</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-lg">Sync History</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32" data-testid="filter-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                </SelectContent>
              </Select>
              {integrationCodes.length > 0 && (
                <Select value={codeFilter} onValueChange={setCodeFilter}>
                  <SelectTrigger className="w-36" data-testid="filter-code">
                    <SelectValue placeholder="Integration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Integrations</SelectItem>
                    {integrationCodes.map((code) => (
                      <SelectItem key={code} value={code}>{code}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-36" data-testid="filter-action">
                  <SelectValue placeholder="Action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="verify">Verify</SelectItem>
                  <SelectItem value="status_check">Status Check</SelectItem>
                  <SelectItem value="renew">Renew</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground" data-testid="empty-logs">
              <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No sync logs found</p>
              <p className="text-sm mt-1">Sync logs will appear as integrations process requests.</p>
            </div>
          ) : (
            <div className="overflow-x-auto" data-testid="sync-logs-table">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium">Integration</th>
                    <th className="text-left py-2 px-2 font-medium">Action</th>
                    <th className="text-left py-2 px-2 font-medium">License</th>
                    <th className="text-left py-2 px-2 font-medium">Status</th>
                    <th className="text-left py-2 px-2 font-medium">Duration</th>
                    <th className="text-left py-2 px-2 font-medium">Started</th>
                    <th className="text-left py-2 px-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b hover:bg-muted/50" data-testid={`sync-log-row-${log.id}`}>
                      <td className="py-2 px-2">
                        <Badge variant="outline" className="text-xs">{log.integrationCode}</Badge>
                      </td>
                      <td className="py-2 px-2 text-xs capitalize">{log.action.replace(/_/g, " ")}</td>
                      <td className="py-2 px-2 text-xs text-muted-foreground font-mono">{log.licenseNumber || "-"}</td>
                      <td className="py-2 px-2">{syncStatusBadge(log.status)}</td>
                      <td className="py-2 px-2 text-xs text-muted-foreground">
                        {log.durationMs ? `${log.durationMs}ms` : "-"}
                      </td>
                      <td className="py-2 px-2 text-xs text-muted-foreground">
                        {new Date(log.startedAt).toLocaleString()}
                      </td>
                      <td className="py-2 px-2">
                        {(log.status === "failed" || log.status === "error") && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => retryMutation.mutate(log.requestId)}
                            disabled={retryMutation.isPending}
                            data-testid={`retry-sync-${log.id}`}
                          >
                            <RotateCcw className="w-3 h-3 mr-1" />
                            Retry
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FeatureFlagsTab() {
  const { toast } = useToast();

  const { data: flags, isLoading } = useQuery<GovernmentFeatureFlag[]>({
    queryKey: ["/api/admin/government/feature-flags"],
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/government/feature-flags/${id}`, { enabled });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Feature flag updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/government/feature-flags"] });
    },
    onError: (error: any) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });

  const rolloutMutation = useMutation({
    mutationFn: async ({ id, rolloutPercentage }: { id: string; rolloutPercentage: number }) => {
      const res = await apiRequest("PATCH", `/api/admin/government/feature-flags/${id}`, { rolloutPercentage });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Rollout percentage updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/government/feature-flags"] });
    },
    onError: (error: any) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 mt-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  const flagsList = Array.isArray(flags) ? flags : [];

  if (flagsList.length === 0) {
    return (
      <Card className="mt-4">
        <CardContent className="py-12 text-center text-muted-foreground">
          <ToggleLeft className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium">No feature flags configured</p>
          <p className="text-sm mt-1">Feature flags for government integrations will appear here.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 mt-4" data-testid="feature-flags-list">
      {flagsList.map((flag) => (
        <Card key={flag.id} data-testid={`flag-card-${flag.id}`}>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold font-mono text-sm" data-testid={`flag-key-${flag.id}`}>{flag.key}</h3>
                  {flag.integrationCode && (
                    <Badge variant="outline" className="text-xs">{flag.integrationCode}</Badge>
                  )}
                </div>
                {flag.description && (
                  <p className="text-sm text-muted-foreground mt-1">{flag.description}</p>
                )}
                {flag.rolloutPercentage !== null && flag.rolloutPercentage !== undefined && (
                  <div className="mt-3 max-w-xs">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>Rollout</span>
                      <span data-testid={`flag-rollout-${flag.id}`}>{flag.rolloutPercentage}%</span>
                    </div>
                    <Slider
                      value={[flag.rolloutPercentage]}
                      max={100}
                      step={1}
                      onValueCommit={(value) =>
                        rolloutMutation.mutate({ id: flag.id, rolloutPercentage: value[0] })
                      }
                      disabled={rolloutMutation.isPending}
                      data-testid={`slider-rollout-${flag.id}`}
                    />
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  Updated: {new Date(flag.updatedAt).toLocaleString()}
                </p>
              </div>
              <Switch
                checked={flag.enabled}
                onCheckedChange={(enabled) => toggleMutation.mutate({ id: flag.id, enabled })}
                disabled={toggleMutation.isPending}
                data-testid={`toggle-flag-${flag.id}`}
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AdaptersTab() {
  const { toast } = useToast();
  const [verifyDialog, setVerifyDialog] = useState(false);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyLicense, setVerifyLicense] = useState("");

  const { data: adapterData, isLoading } = useQuery<{ adapters: AdapterInfo[]; circuitBreakers: Record<string, CircuitBreakerState> }>({
    queryKey: ["/api/admin/government/adapters"],
  });

  const resetCircuitMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest("POST", `/api/admin/government/adapters/${code}/reset-circuit`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Circuit breaker reset" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/government/adapters"] });
    },
    onError: (error: any) => {
      toast({ title: "Reset failed", description: error.message, variant: "destructive" });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async ({ integrationCode, licenseNumber }: { integrationCode: string; licenseNumber: string }) => {
      const res = await apiRequest("POST", "/api/admin/government/sync/verify", { integrationCode, licenseNumber });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Verification triggered", description: "Check sync logs for results." });
      setVerifyDialog(false);
      setVerifyCode("");
      setVerifyLicense("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/government/sync-logs"] });
    },
    onError: (error: any) => {
      toast({ title: "Verification failed", description: error.message, variant: "destructive" });
    },
  });

  const adapters = adapterData?.adapters || [];
  const circuitBreakers = adapterData?.circuitBreakers || {};

  if (isLoading) {
    return (
      <div className="space-y-4 mt-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Registered Adapters</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setVerifyDialog(true)}
          data-testid="trigger-verify-btn"
        >
          <Play className="w-3 h-3 mr-1" />
          Manual Verification
        </Button>
      </div>

      {adapters.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Server className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No adapters registered</p>
            <p className="text-sm mt-1">Government API adapters will appear here once registered.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4" data-testid="adapters-list">
          {adapters.map((adapter) => {
            const cb = circuitBreakers[adapter.code];
            return (
              <Card key={adapter.code} data-testid={`adapter-card-${adapter.code}`}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold" data-testid={`adapter-name-${adapter.code}`}>
                          {adapter.name || adapter.code}
                        </h3>
                        <Badge variant="outline" className="text-xs">{adapter.code}</Badge>
                      </div>
                      {adapter.supportedActions && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {(Array.isArray(adapter.supportedActions) ? adapter.supportedActions : []).map((action: string) => (
                            <Badge key={action} variant="secondary" className="text-xs">{action}</Badge>
                          ))}
                        </div>
                      )}
                      {cb && (
                        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Shield className="w-3 h-3" />
                            Circuit: {circuitBadge(cb.state)}
                          </div>
                          <span>Failures: {cb.failures}</span>
                          {cb.lastFailure && (
                            <span>Last failure: {new Date(cb.lastFailure).toLocaleString()}</span>
                          )}
                        </div>
                      )}
                    </div>
                    {cb && cb.state !== "closed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resetCircuitMutation.mutate(adapter.code)}
                        disabled={resetCircuitMutation.isPending}
                        data-testid={`reset-circuit-${adapter.code}`}
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />
                        Reset Circuit
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {verifyDialog && (
        <Dialog open onOpenChange={() => setVerifyDialog(false)}>
          <DialogContent className="max-w-sm" data-testid="verify-dialog">
            <DialogHeader>
              <DialogTitle>Manual Verification</DialogTitle>
              <DialogDescription>Trigger a license verification through a government adapter.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Integration Code</Label>
                <Input
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  placeholder="e.g. nea"
                  data-testid="input-verify-code"
                />
              </div>
              <div>
                <Label>License Number</Label>
                <Input
                  value={verifyLicense}
                  onChange={(e) => setVerifyLicense(e.target.value)}
                  placeholder="e.g. NEA/12345"
                  data-testid="input-verify-license"
                />
              </div>
              <Button
                className="w-full"
                onClick={() => verifyMutation.mutate({ integrationCode: verifyCode, licenseNumber: verifyLicense })}
                disabled={verifyMutation.isPending || !verifyCode || !verifyLicense}
                data-testid="submit-verify-btn"
              >
                {verifyMutation.isPending ? "Verifying..." : "Trigger Verification"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function overrideStatusBadge(status: string) {
  switch (status) {
    case "submitted":
      return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" data-testid={`override-status-${status}`}><Clock className="w-3 h-3 mr-1" />Submitted</Badge>;
    case "in_review":
      return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" data-testid={`override-status-${status}`}><Eye className="w-3 h-3 mr-1" />In Review</Badge>;
    case "approved":
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" data-testid={`override-status-${status}`}><ThumbsUp className="w-3 h-3 mr-1" />Approved</Badge>;
    case "rejected":
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" data-testid={`override-status-${status}`}><ThumbsDown className="w-3 h-3 mr-1" />Rejected</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function overrideSyncBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge variant="outline" data-testid={`sync-badge-${status}`}><Clock className="w-3 h-3 mr-1" />Pending Sync</Badge>;
    case "synced":
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" data-testid={`sync-badge-${status}`}><CheckCircle2 className="w-3 h-3 mr-1" />Synced</Badge>;
    case "mismatch":
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" data-testid={`sync-badge-${status}`}><AlertOctagon className="w-3 h-3 mr-1" />Mismatch</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function ManualOverridesTab() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [syncFilter, setSyncFilter] = useState("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedOverride, setSelectedOverride] = useState<ManualOverride | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const [newOverride, setNewOverride] = useState({
    integrationCode: "nea_kenya",
    licenseNumber: "",
    agencyId: "",
    agencyName: "",
    manualLicenseStatus: "VALID",
    reason: "",
  });

  const statsQuery = useQuery<OverrideStats>({
    queryKey: ["/api/admin/government/manual-overrides/stats"],
  });

  const integrationsQuery = useQuery<GovernmentIntegration[]>({
    queryKey: ["/api/admin/government/integrations"],
  });

  const overridesQuery = useQuery<{ overrides: ManualOverride[]; total: number }>({
    queryKey: ["/api/admin/government/manual-overrides", statusFilter, syncFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("overrideStatus", statusFilter);
      if (syncFilter !== "all") params.set("syncStatus", syncFilter);
      params.set("limit", "50");
      const res = await fetch(`/api/admin/government/manual-overrides?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newOverride) => {
      const res = await apiRequest("POST", "/api/admin/government/manual-overrides", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Override created", description: "Manual override submitted for review" });
      setShowCreateDialog(false);
      setNewOverride({ integrationCode: "nea_kenya", licenseNumber: "", agencyId: "", agencyName: "", manualLicenseStatus: "VALID", reason: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/government/manual-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/government/manual-overrides/stats"] });
    },
    onError: () => toast({ title: "Error", description: "Failed to create override", variant: "destructive" }),
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, action, notes }: { id: string; action: "review" | "approve" | "reject"; notes?: string }) => {
      const res = await apiRequest("POST", `/api/admin/government/manual-overrides/${id}/${action}`, { reviewNotes: notes });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      toast({ title: "Success", description: `Override ${variables.action}${variables.action === "review" ? "ed" : variables.action === "approve" ? "d" : "ed"} successfully` });
      setSelectedOverride(null);
      setReviewNotes("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/government/manual-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/government/manual-overrides/stats"] });
    },
    onError: () => toast({ title: "Error", description: "Action failed", variant: "destructive" }),
  });

  const fallbackMutation = useMutation({
    mutationFn: async ({ code, enabled, reason }: { code: string; enabled: boolean; reason?: string }) => {
      const res = await apiRequest("POST", `/api/admin/government/fallback/${code}/toggle`, { enabled, reason });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Fallback mode updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/government/integrations"] });
    },
    onError: () => toast({ title: "Error", description: "Failed to toggle fallback", variant: "destructive" }),
  });

  const resyncMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest("POST", `/api/admin/government/manual-overrides/resync/${code}`);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Re-sync complete", description: `${data.synced} synced, ${data.mismatched} mismatched, ${data.errors} errors` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/government/manual-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/government/manual-overrides/stats"] });
    },
    onError: () => toast({ title: "Error", description: "Re-sync failed", variant: "destructive" }),
  });

  const stats = statsQuery.data;
  const integrations = integrationsQuery.data || [];
  const overrides = overridesQuery.data?.overrides || [];

  return (
    <div className="space-y-6" data-testid="manual-overrides-tab">
      {integrations.filter(i => i.fallbackMode).map(i => (
        <Card key={i.code} className="border-orange-300 bg-orange-50 dark:bg-orange-950 dark:border-orange-800" data-testid={`fallback-banner-${i.code}`}>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertOctagon className="w-5 h-5 text-orange-600" />
              <div>
                <p className="font-semibold text-orange-800 dark:text-orange-200">{i.name} — Fallback Mode Active</p>
                <p className="text-sm text-orange-600 dark:text-orange-400">{i.fallbackReason || "Government API unavailable"}</p>
                {i.fallbackActivatedAt && (
                  <p className="text-xs text-orange-500">Since {new Date(i.fallbackActivatedAt).toLocaleString()}</p>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fallbackMutation.mutate({ code: i.code, enabled: false })}
              disabled={fallbackMutation.isPending}
              data-testid={`deactivate-fallback-${i.code}`}
            >
              Deactivate
            </Button>
          </CardContent>
        </Card>
      ))}

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="override-stats-grid">
          <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-blue-600" data-testid="stat-submitted">{stats.submitted}</p><p className="text-sm text-muted-foreground">Submitted</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-yellow-600" data-testid="stat-in-review">{stats.inReview}</p><p className="text-sm text-muted-foreground">In Review</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-green-600" data-testid="stat-approved">{stats.approved}</p><p className="text-sm text-muted-foreground">Approved</p></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-orange-600" data-testid="stat-pending-sync">{stats.pendingSync}</p><p className="text-sm text-muted-foreground">Pending Sync</p></CardContent></Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle data-testid="overrides-title">Manual Overrides</CardTitle>
              <CardDescription>Process licenses manually when government APIs are unavailable</CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              {integrations.filter(i => !i.fallbackMode).length > 0 && (
                <Select onValueChange={(code) => fallbackMutation.mutate({ code, enabled: true, reason: "Manually activated by admin" })}>
                  <SelectTrigger className="w-[180px]" data-testid="activate-fallback-select">
                    <SelectValue placeholder="Activate Fallback" />
                  </SelectTrigger>
                  <SelectContent>
                    {integrations.filter(i => !i.fallbackMode).map(i => (
                      <SelectItem key={i.code} value={i.code}>{i.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select onValueChange={(code) => resyncMutation.mutate(code)}>
                <SelectTrigger className="w-[160px]" data-testid="resync-select">
                  <SelectValue placeholder="Force Re-sync" />
                </SelectTrigger>
                <SelectContent>
                  {integrations.map(i => (
                    <SelectItem key={i.code} value={i.code}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => setShowCreateDialog(true)} data-testid="create-override-btn">
                <Upload className="w-4 h-4 mr-1" /> New Override
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 mb-4 flex-wrap">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]" data-testid="filter-status-select">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="in_review">In Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select value={syncFilter} onValueChange={setSyncFilter}>
              <SelectTrigger className="w-[160px]" data-testid="filter-sync-select">
                <SelectValue placeholder="Sync Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sync</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="synced">Synced</SelectItem>
                <SelectItem value="mismatch">Mismatch</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {overridesQuery.isLoading ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
          ) : overrides.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="no-overrides">
              <FileCheck className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No manual overrides found</p>
            </div>
          ) : (
            <div className="space-y-3" data-testid="overrides-list">
              {overrides.map((o) => (
                <Card key={o.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedOverride(o)} data-testid={`override-card-${o.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-semibold" data-testid={`license-${o.id}`}>{o.licenseNumber}</span>
                          {overrideStatusBadge(o.overrideStatus)}
                          {overrideSyncBadge(o.syncStatus)}
                          <Badge variant="outline">{o.manualLicenseStatus}</Badge>
                        </div>
                        {o.agencyName && <p className="text-sm text-muted-foreground mt-1">{o.agencyName}</p>}
                        <p className="text-xs text-muted-foreground mt-1">{o.reason}</p>
                      </div>
                      <div className="text-right text-sm text-muted-foreground">
                        <p>{new Date(o.createdAt).toLocaleDateString()}</p>
                        <p className="text-xs">by {o.submittedBy}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent data-testid="create-override-dialog">
          <DialogHeader>
            <DialogTitle>Create Manual Override</DialogTitle>
            <DialogDescription>Submit a manual license verification with supporting evidence</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Integration</Label>
              <Select value={newOverride.integrationCode} onValueChange={(v) => setNewOverride(p => ({ ...p, integrationCode: v }))}>
                <SelectTrigger data-testid="new-override-integration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {integrations.map(i => (
                    <SelectItem key={i.code} value={i.code}>{i.name}</SelectItem>
                  ))}
                  {integrations.length === 0 && <SelectItem value="nea-kenya">NEA Kenya</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>License Number</Label>
              <Input value={newOverride.licenseNumber} onChange={(e) => setNewOverride(p => ({ ...p, licenseNumber: e.target.value }))} placeholder="e.g. NEA/2024/001" data-testid="new-override-license" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Agency ID (optional)</Label>
                <Input value={newOverride.agencyId} onChange={(e) => setNewOverride(p => ({ ...p, agencyId: e.target.value }))} data-testid="new-override-agency-id" />
              </div>
              <div>
                <Label>Agency Name (optional)</Label>
                <Input value={newOverride.agencyName} onChange={(e) => setNewOverride(p => ({ ...p, agencyName: e.target.value }))} data-testid="new-override-agency-name" />
              </div>
            </div>
            <div>
              <Label>Manual License Status</Label>
              <Select value={newOverride.manualLicenseStatus} onValueChange={(v) => setNewOverride(p => ({ ...p, manualLicenseStatus: v }))}>
                <SelectTrigger data-testid="new-override-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VALID">Valid</SelectItem>
                  <SelectItem value="EXPIRED">Expired</SelectItem>
                  <SelectItem value="UNKNOWN">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reason</Label>
              <Textarea value={newOverride.reason} onChange={(e) => setNewOverride(p => ({ ...p, reason: e.target.value }))} placeholder="Describe why manual verification is needed..." data-testid="new-override-reason" />
            </div>
            <Button
              className="w-full"
              onClick={() => createMutation.mutate(newOverride)}
              disabled={createMutation.isPending || !newOverride.licenseNumber || !newOverride.reason}
              data-testid="submit-override-btn"
            >
              {createMutation.isPending ? "Creating..." : "Submit Override"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {selectedOverride && (
        <Dialog open={!!selectedOverride} onOpenChange={() => { setSelectedOverride(null); setReviewNotes(""); }}>
          <DialogContent className="max-w-lg" data-testid="override-detail-dialog">
            <DialogHeader>
              <DialogTitle>Override Detail</DialogTitle>
              <DialogDescription>License: {selectedOverride.licenseNumber}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Status:</span> {overrideStatusBadge(selectedOverride.overrideStatus)}</div>
                <div><span className="text-muted-foreground">License Status:</span> <Badge variant="outline">{selectedOverride.manualLicenseStatus}</Badge></div>
                <div><span className="text-muted-foreground">Sync:</span> {overrideSyncBadge(selectedOverride.syncStatus)}</div>
                <div><span className="text-muted-foreground">Integration:</span> {selectedOverride.integrationCode}</div>
                {selectedOverride.agencyName && <div className="col-span-2"><span className="text-muted-foreground">Agency:</span> {selectedOverride.agencyName}</div>}
                <div data-testid="submitted-by-field"><span className="text-muted-foreground">Submitted By:</span> {selectedOverride.submittedBy || "N/A"}</div>
                <div data-testid="approved-by-field"><span className="text-muted-foreground">Approved By:</span> {selectedOverride.reviewedBy || "Pending"}</div>
              </div>

              {selectedOverride.expiryDateOverride && (() => {
                const expiryDate = new Date(selectedOverride.expiryDateOverride!);
                const now = new Date();
                const diffMs = expiryDate.getTime() - now.getTime();
                const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                const isExpired = diffMs <= 0;
                return (
                  <div data-testid="expiry-countdown">
                    {isExpired ? (
                      <div className="p-3 bg-red-50 dark:bg-red-950 rounded border border-red-200 dark:border-red-800">
                        <p className="text-sm font-semibold text-red-700 dark:text-red-300" data-testid="expiry-warning">
                          <AlertTriangle className="w-4 h-4 inline mr-1" />
                          Manual verification expired - pending government confirmation
                        </p>
                      </div>
                    ) : (
                      <div className="p-3 bg-yellow-50 dark:bg-yellow-950 rounded border border-yellow-200 dark:border-yellow-800">
                        <p className="text-sm text-yellow-700 dark:text-yellow-300" data-testid="expiry-info">
                          <Timer className="w-4 h-4 inline mr-1" />
                          Expires in {diffDays} day{diffDays !== 1 ? "s" : ""} ({expiryDate.toLocaleDateString()})
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {(selectedOverride as any).disclaimerViewedBy && Array.isArray((selectedOverride as any).disclaimerViewedBy) && (
                <div data-testid="disclaimer-viewed-count">
                  <span className="text-sm text-muted-foreground">
                    <FileText className="w-4 h-4 inline mr-1" />
                    Disclaimer viewed by {(selectedOverride as any).disclaimerViewedBy.length} user{(selectedOverride as any).disclaimerViewedBy.length !== 1 ? "s" : ""}
                  </span>
                </div>
              )}

              <div>
                <Label className="text-muted-foreground">Reason</Label>
                <p className="text-sm mt-1">{selectedOverride.reason}</p>
              </div>
              {selectedOverride.evidence && Array.isArray(selectedOverride.evidence) && selectedOverride.evidence.length > 0 && (
                <div>
                  <Label className="text-muted-foreground">Evidence ({selectedOverride.evidence.length} items)</Label>
                  <div className="mt-1 space-y-1">
                    {selectedOverride.evidence.map((e: any, i: number) => (
                      <div key={i} className="text-xs p-2 bg-muted rounded flex justify-between">
                        <span>{e.type || "Document"} - {e.description || "No description"}</span>
                        <span className="text-muted-foreground">{e.uploadedBy} @ {e.uploadedAt ? new Date(e.uploadedAt).toLocaleDateString() : "N/A"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {selectedOverride.mismatchNotes && (
                <div className="p-3 bg-red-50 dark:bg-red-950 rounded border border-red-200 dark:border-red-800">
                  <p className="text-sm font-semibold text-red-700 dark:text-red-300">Mismatch Notes</p>
                  <p className="text-sm text-red-600 dark:text-red-400">{selectedOverride.mismatchNotes}</p>
                </div>
              )}
              {selectedOverride.reviewNotes && (
                <div>
                  <Label className="text-muted-foreground">Review Notes</Label>
                  <p className="text-sm mt-1">{selectedOverride.reviewNotes}</p>
                  {selectedOverride.reviewedBy && <p className="text-xs text-muted-foreground">by {selectedOverride.reviewedBy}</p>}
                </div>
              )}

              {(selectedOverride.overrideStatus === "submitted" || selectedOverride.overrideStatus === "in_review") && (
                <div className="space-y-3 border-t pt-3">
                  <div>
                    <Label>Review Notes</Label>
                    <Textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} placeholder="Add review notes..." data-testid="review-notes-input" />
                  </div>
                  <div className="flex gap-2">
                    {selectedOverride.overrideStatus === "submitted" && (
                      <Button variant="outline" className="flex-1" onClick={() => reviewMutation.mutate({ id: selectedOverride.id, action: "review" })} disabled={reviewMutation.isPending} data-testid="mark-review-btn">
                        <Eye className="w-4 h-4 mr-1" /> Mark for Review
                      </Button>
                    )}
                    <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => reviewMutation.mutate({ id: selectedOverride.id, action: "approve", notes: reviewNotes })} disabled={reviewMutation.isPending} data-testid="approve-override-btn">
                      <ThumbsUp className="w-4 h-4 mr-1" /> Approve
                    </Button>
                    <Button variant="destructive" className="flex-1" onClick={() => reviewMutation.mutate({ id: selectedOverride.id, action: "reject", notes: reviewNotes })} disabled={reviewMutation.isPending} data-testid="reject-override-btn">
                      <ThumbsDown className="w-4 h-4 mr-1" /> Reject
                    </Button>
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

function ComplianceLogsTab() {
  const { toast } = useToast();
  const [actionFilter, setActionFilter] = useState("all");
  const [recordTypeFilter, setRecordTypeFilter] = useState("all");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const { data: stats, isLoading: statsLoading } = useQuery<{ total: number; overrideCreated: number; overrideApproved: number; overrideRejected: number; fallbackEvents: number }>({
    queryKey: ["/api/admin/compliance-logs/stats"],
  });

  const buildComplianceQuery = () => {
    const params = new URLSearchParams();
    if (actionFilter !== "all") params.set("action", actionFilter);
    if (recordTypeFilter !== "all") params.set("recordType", recordTypeFilter);
    params.set("limit", "100");
    return params.toString();
  };

  const { data: logsData, isLoading: logsLoading } = useQuery<{ logs: ComplianceAuditLog[] } | ComplianceAuditLog[]>({
    queryKey: ["/api/admin/compliance-logs", actionFilter, recordTypeFilter],
    queryFn: async () => {
      const res = await fetch(`/api/admin/compliance-logs?${buildComplianceQuery()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch compliance logs");
      return res.json();
    },
  });

  const { data: exportsData, isLoading: exportsLoading } = useQuery<{ exports: AuditExport[] }>({
    queryKey: ["/api/admin/compliance/exports"],
  });

  const logs: ComplianceAuditLog[] = logsData ? (Array.isArray(logsData) ? logsData : (logsData as any).logs || []) : [];
  const exportList = exportsData?.exports || [];

  const handleExportCSV = async () => {
    try {
      const res = await fetch("/api/admin/compliance/export/csv", { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `compliance-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({ title: "Export started", description: "CSV download initiated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/compliance/exports"] });
    } catch {
      toast({ title: "Export failed", description: "Could not generate CSV", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4 mt-4" data-testid="compliance-logs-tab">
      {statsLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4" data-testid="compliance-stats">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold" data-testid="stat-compliance-total">{stats.total || 0}</p>
                  <p className="text-xs text-muted-foreground">Total Logs</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-green-500" />
                <div>
                  <p className="text-2xl font-bold" data-testid="stat-override-created">{stats.overrideCreated || 0}</p>
                  <p className="text-xs text-muted-foreground">Created</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <ThumbsUp className="w-5 h-5 text-green-500" />
                <div>
                  <p className="text-2xl font-bold" data-testid="stat-override-approved">{stats.overrideApproved || 0}</p>
                  <p className="text-xs text-muted-foreground">Approved</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <ThumbsDown className="w-5 h-5 text-red-500" />
                <div>
                  <p className="text-2xl font-bold" data-testid="stat-override-rejected">{stats.overrideRejected || 0}</p>
                  <p className="text-xs text-muted-foreground">Rejected</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
                <div>
                  <p className="text-2xl font-bold" data-testid="stat-fallback-events">{stats.fallbackEvents || 0}</p>
                  <p className="text-xs text-muted-foreground">Fallback Events</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-lg">Compliance Audit Logs</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-40" data-testid="filter-compliance-action">
                  <SelectValue placeholder="Action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="manual_override_created">Override Created</SelectItem>
                  <SelectItem value="manual_override_approved">Override Approved</SelectItem>
                  <SelectItem value="manual_override_rejected">Override Rejected</SelectItem>
                  <SelectItem value="fallback_activated">Fallback Activated</SelectItem>
                  <SelectItem value="fallback_deactivated">Fallback Deactivated</SelectItem>
                </SelectContent>
              </Select>
              <Select value={recordTypeFilter} onValueChange={setRecordTypeFilter}>
                <SelectTrigger className="w-40" data-testid="filter-compliance-record-type">
                  <SelectValue placeholder="Record Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="manual_override">Manual Override</SelectItem>
                  <SelectItem value="integration">Integration</SelectItem>
                  <SelectItem value="license">License</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={handleExportCSV} data-testid="export-audit-csv-btn">
                <Download className="w-4 h-4 mr-1" />
                Export Audit Report
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground" data-testid="empty-compliance-logs">
              <Shield className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No compliance logs found</p>
              <p className="text-sm mt-1">Audit logs will appear as compliance events are recorded.</p>
            </div>
          ) : (
            <div className="space-y-2" data-testid="compliance-logs-list">
              {logs.map((log) => (
                <Card
                  key={log.id}
                  className="cursor-pointer"
                  onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                  data-testid={`compliance-log-${log.id}`}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs" data-testid={`log-action-${log.id}`}>{log.action.replace(/_/g, " ")}</Badge>
                        <Badge variant="outline" className="text-xs" data-testid={`log-record-type-${log.id}`}>{log.recordType}</Badge>
                        <span className="text-xs font-mono text-muted-foreground" data-testid={`log-record-id-${log.id}`}>{log.recordId}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span data-testid={`log-user-${log.id}`}>{log.userId}</span>
                        <Badge variant="outline" className="text-xs">{log.userRole}</Badge>
                        <span data-testid={`log-ip-${log.id}`}>{log.ipAddress}</span>
                        <span>{new Date(log.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                    {expandedLogId === log.id && log.details && (
                      <div className="mt-3 p-3 bg-muted rounded text-xs font-mono overflow-x-auto" data-testid={`log-details-${log.id}`}>
                        <pre>{JSON.stringify(log.details, null, 2)}</pre>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="w-5 h-5" />
            Export History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {exportsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : exportList.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="empty-exports">
              <Download className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No exports yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto" data-testid="export-history-list">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium">Hash Signature</th>
                    <th className="text-left py-2 px-2 font-medium">Records</th>
                    <th className="text-left py-2 px-2 font-medium">Exported By</th>
                    <th className="text-left py-2 px-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {exportList.map((exp) => (
                    <tr key={exp.id} className="border-b" data-testid={`export-row-${exp.id}`}>
                      <td className="py-2 px-2 font-mono text-xs" data-testid={`export-hash-${exp.id}`}>{exp.hashSignature?.slice(0, 16)}...</td>
                      <td className="py-2 px-2" data-testid={`export-count-${exp.id}`}>{exp.recordCount}</td>
                      <td className="py-2 px-2" data-testid={`export-by-${exp.id}`}>{exp.exportedBy}</td>
                      <td className="py-2 px-2 text-muted-foreground">{new Date(exp.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DowntimeAnalyticsTab() {
  const { toast } = useToast();

  const { data: analytics, isLoading: analyticsLoading } = useQuery<{ totalEvents: number; totalOutages: number; totalFallbacks: number; avgDurationMs: number; pendingSyncCount: number; manualApprovals: number }>({
    queryKey: ["/api/admin/government/downtime-analytics"],
  });

  const { data: eventsData, isLoading: eventsLoading } = useQuery<{ events: GovernmentDowntimeEvent[] } | GovernmentDowntimeEvent[]>({
    queryKey: ["/api/admin/government/downtime-events"],
  });

  const checkExpiryMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/government/manual-overrides/check-expiry");
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Expiry check complete", description: `${data.expired || 0} expired overrides found` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/government/downtime-analytics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/government/manual-overrides"] });
    },
    onError: () => toast({ title: "Error", description: "Failed to check expired overrides", variant: "destructive" }),
  });

  const events: GovernmentDowntimeEvent[] = eventsData ? (Array.isArray(eventsData) ? eventsData : (eventsData as any).events || []) : [];

  function eventTypeBadge(eventType: string) {
    switch (eventType) {
      case "outage_start":
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" data-testid={`event-type-${eventType}`}><XCircle className="w-3 h-3 mr-1" />Outage Start</Badge>;
      case "outage_end":
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" data-testid={`event-type-${eventType}`}><CheckCircle2 className="w-3 h-3 mr-1" />Outage End</Badge>;
      case "fallback_activated":
        return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" data-testid={`event-type-${eventType}`}><AlertTriangle className="w-3 h-3 mr-1" />Fallback Activated</Badge>;
      case "fallback_deactivated":
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" data-testid={`event-type-${eventType}`}><CheckCircle2 className="w-3 h-3 mr-1" />Fallback Deactivated</Badge>;
      default:
        return <Badge variant="outline" data-testid={`event-type-${eventType}`}>{eventType}</Badge>;
    }
  }

  return (
    <div className="space-y-4 mt-4" data-testid="downtime-analytics-tab">
      {analyticsLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : analytics && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4" data-testid="downtime-stats">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold" data-testid="stat-total-events">{analytics.totalEvents || 0}</p>
                  <p className="text-xs text-muted-foreground">Total Events</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-500" />
                <div>
                  <p className="text-2xl font-bold" data-testid="stat-total-outages">{analytics.totalOutages || 0}</p>
                  <p className="text-xs text-muted-foreground">Outages</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
                <div>
                  <p className="text-2xl font-bold" data-testid="stat-total-fallbacks">{analytics.totalFallbacks || 0}</p>
                  <p className="text-xs text-muted-foreground">Fallbacks</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <Timer className="w-5 h-5 text-purple-500" />
                <div>
                  <p className="text-2xl font-bold" data-testid="stat-avg-downtime">{analytics.avgDurationMs ? `${Math.round(analytics.avgDurationMs / 1000)}s` : "N/A"}</p>
                  <p className="text-xs text-muted-foreground">Avg Duration</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold" data-testid="stat-pending-sync">{analytics.pendingSyncCount || 0}</p>
                  <p className="text-xs text-muted-foreground">Pending Sync</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-green-500" />
                <div>
                  <p className="text-2xl font-bold" data-testid="stat-manual-approvals">{analytics.manualApprovals || 0}</p>
                  <p className="text-xs text-muted-foreground">Manual Approvals</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Downtime Events Timeline</h2>
        <Button
          variant="outline"
          onClick={() => checkExpiryMutation.mutate()}
          disabled={checkExpiryMutation.isPending}
          data-testid="check-expired-overrides-btn"
        >
          <Timer className="w-4 h-4 mr-1" />
          {checkExpiryMutation.isPending ? "Checking..." : "Check Expired Overrides"}
        </Button>
      </div>

      {eventsLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground" data-testid="empty-downtime-events">
            <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No downtime events recorded</p>
            <p className="text-sm mt-1">Events will appear here when government API disruptions occur.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3" data-testid="downtime-events-list">
          {events.map((event) => (
            <Card key={event.id} data-testid={`downtime-event-${event.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    {eventTypeBadge(event.eventType)}
                    <Badge variant="outline" className="text-xs" data-testid={`event-integration-${event.id}`}>{event.integrationCode}</Badge>
                    <span className="text-sm" data-testid={`event-reason-${event.id}`}>{event.reason}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span data-testid={`event-triggered-by-${event.id}`}>by {event.triggeredBy}</span>
                    {event.durationMs > 0 && (
                      <span data-testid={`event-duration-${event.id}`}>{event.durationMs >= 60000 ? `${Math.round(event.durationMs / 60000)}m` : `${Math.round(event.durationMs / 1000)}s`}</span>
                    )}
                    <span>{new Date(event.createdAt).toLocaleString()}</span>
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
