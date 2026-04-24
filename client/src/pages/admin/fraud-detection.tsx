import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AdminLayout from "@/components/admin-layout";
import {
  Shield,
  ShieldAlert,
  ShieldX,
  AlertTriangle,
  Eye,
  RefreshCw,
  Plus,
  Loader2,
  ArrowLeft,
  FileText,
  Ban,
  CheckCircle,
  XCircle,
  Search,
  MessageSquare,
  BarChart3,
  Database,
  Phone,
  CreditCard,
  Building2,
  Mail,
  Trash2,
  UserCheck,
} from "lucide-react";

interface FraudStats {
  byStatus: { open: number; investigating: number; resolved: number; dismissed: number };
  bySeverity: { low: number; medium: number; high: number; critical: number };
  activeBlacklist: number;
  total: number;
}

interface FraudFlag {
  id: string;
  entityId: string;
  entityType: string;
  ruleTriggered: string;
  severity: string;
  details: any;
  autoActions: any;
  status: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

interface BlacklistEntry {
  id: string;
  entityId: string;
  entityType: string;
  reason: string;
  reportedBy: string;
  status: string;
  evidence: any;
  dateAdded: string;
  clearedAt: string | null;
  clearedBy: string | null;
  clearedReason: string | null;
}

interface DetectionRule {
  id: string;
  ruleName: string;
  description: string | null;
  ruleType: string;
  threshold: number;
  timeWindowDays: number;
  severity: string;
  isActive: boolean;
  autoBlacklist: boolean;
  autoReduceScore: boolean;
  scoreReduction: number;
}

interface InvestigationNote {
  id: string;
  note: string;
  attachedBy: string;
  createdAt: string;
}

function getSeverityBadge(severity: string) {
  const styles: Record<string, string> = {
    low: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    high: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    critical: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };
  return <Badge className={styles[severity] || ""} data-testid={`severity-badge-${severity}`}>{severity}</Badge>;
}

function getStatusBadge(status: string) {
  const styles: Record<string, string> = {
    open: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    investigating: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    resolved: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    dismissed: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
    active: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    under_review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    cleared: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  };
  return <Badge className={styles[status] || ""} data-testid={`status-badge-${status}`}>{status.replace("_", " ")}</Badge>;
}

function MpesaFraudTab() {
  const { toast } = useToast();
  const [subTab, setSubTab] = useState<"transactions" | "orphans" | "callbacks" | "locked" | "suspicious">("transactions");

  const { data: fraudPayments, isLoading: fraudLoading } = useQuery<Array<{
    id: string; userId: string; amount: number; method: string; status: string;
    transactionRef: string | null; isSuspicious: boolean; fraudReason: string | null; createdAt: string;
  }>>({ queryKey: ["/api/admin/mpesa/fraud-transactions"] });

  const { data, isLoading, refetch, isFetching } = useQuery<{
    stats: { totalTransactions: number; successCount: number; orphanCount: number; failedCallbackCount: number; lockedAccountCount: number; highRiskCount: number };
    orphans: Array<{ id: number; phone: string; amount: number; mpesaReceipt: string | null; status: string; transactionDate: string | null }>;
    failedCallbacks: Array<{ id: string; lockKey: string; webhookType: string; status: string; createdAt: string }>;
    lockedAccounts: Array<{ id: string; identifier: string; identifierType: string; failedAttempts: number; lockedUntil: string | null; lastFailedAt: string | null }>;
    recentTransactions: Array<{ id: number; phone: string; amount: number; mpesaReceipt: string | null; status: string; transactionDate: string | null }>;
  }>({ queryKey: ["/api/admin/mpesa/suspicious"] });

  const unlockMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/mpesa/unlock/${id}`),
    onSuccess: () => {
      toast({ title: "Account unlocked", description: "The lockout has been cleared." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/mpesa/suspicious"] });
    },
    onError: () => toast({ title: "Failed to unlock", variant: "destructive" }),
  });

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      success: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      orphan: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    };
    return <Badge className={map[status] || "bg-gray-100 text-gray-800"} data-testid={`status-${status}`}>{status}</Badge>;
  };

  const riskBadge = (attempts: number) => {
    if (attempts >= 10) return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">High Risk ({attempts})</Badge>;
    if (attempts >= 5) return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">Medium ({attempts})</Badge>;
    return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Low ({attempts})</Badge>;
  };

  if (isLoading) return (
    <div className="space-y-3">
      {[1,2,3,4].map(i => <Skeleton key={i} className="h-20" />)}
    </div>
  );

  const s = data?.stats;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-blue-500" />
          M-Pesa Security Monitor
        </h3>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="btn-refresh-mpesa">
          <RefreshCw className={`w-3 h-3 mr-1 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card data-testid="stat-total-transactions">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">{s?.totalTransactions ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Transactions</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-success-transactions">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{s?.successCount ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">Confirmed</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-orphan-transactions" className="border-orange-200">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-orange-600">{s?.orphanCount ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">Orphan Callbacks</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-failed-callbacks" className="border-red-200">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-red-600">{s?.failedCallbackCount ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">Rejected Callbacks</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-locked-accounts" className="border-red-200">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-red-600">{s?.lockedAccountCount ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">Locked Accounts</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-high-risk" className={s?.highRiskCount ? "border-red-400 bg-red-50 dark:bg-red-950" : ""}>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-red-700">{s?.highRiskCount ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">High-Risk IPs/Phones</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={subTab} onValueChange={(v: any) => setSubTab(v)}>
        <TabsList className="w-full">
          <TabsTrigger value="transactions" data-testid="subtab-transactions" className="text-xs flex-1">
            All Transactions
          </TabsTrigger>
          <TabsTrigger value="orphans" data-testid="subtab-orphans" className="text-xs flex-1">
            Orphans {s?.orphanCount ? <Badge className="ml-1 bg-orange-100 text-orange-800 text-xs px-1 py-0">{s.orphanCount}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="callbacks" data-testid="subtab-callbacks" className="text-xs flex-1">
            Rejected {s?.failedCallbackCount ? <Badge className="ml-1 bg-red-100 text-red-800 text-xs px-1 py-0">{s.failedCallbackCount}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="locked" data-testid="subtab-locked" className="text-xs flex-1">
            Locked {s?.lockedAccountCount ? <Badge className="ml-1 bg-red-100 text-red-800 text-xs px-1 py-0">{s.lockedAccountCount}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="suspicious" data-testid="subtab-suspicious" className="text-xs flex-1">
            Flagged {fraudPayments?.length ? <Badge className="ml-1 bg-red-100 text-red-800 text-xs px-1 py-0">{fraudPayments.length}</Badge> : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="mt-3">
          {!data?.recentTransactions?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">No transactions recorded yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">ID</TableHead>
                    <TableHead className="text-xs">Phone</TableHead>
                    <TableHead className="text-xs">Amount (KES)</TableHead>
                    <TableHead className="text-xs">Receipt</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentTransactions.map(tx => (
                    <TableRow key={tx.id} data-testid={`tx-row-${tx.id}`}>
                      <TableCell className="text-xs font-mono">{tx.id}</TableCell>
                      <TableCell className="text-xs">{tx.phone}</TableCell>
                      <TableCell className="text-xs font-semibold">{tx.amount.toLocaleString()}</TableCell>
                      <TableCell className="text-xs font-mono">{tx.mpesaReceipt ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>{statusBadge(tx.status)}</TableCell>
                      <TableCell className="text-xs">{tx.transactionDate ? new Date(tx.transactionDate).toLocaleString() : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="orphans" className="mt-3 space-y-2">
          <div className="flex items-center gap-2 p-3 rounded-md bg-orange-50 dark:bg-orange-950 border border-orange-200 text-xs text-orange-800 dark:text-orange-200" data-testid="orphan-info-banner">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Orphan transactions: Safaricom confirmed a payment but no matching pending record was found. This could indicate a callback with an unknown CheckoutRequestID — investigate immediately.</span>
          </div>
          {!data?.orphans?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6 flex items-center justify-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" /> No orphan transactions — all callbacks matched valid payments.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-orange-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Phone</TableHead>
                    <TableHead className="text-xs">Amount (KES)</TableHead>
                    <TableHead className="text-xs">Receipt</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.orphans.map(tx => (
                    <TableRow key={tx.id} className="bg-orange-50/50 dark:bg-orange-950/20" data-testid={`orphan-row-${tx.id}`}>
                      <TableCell className="text-xs">{tx.phone}</TableCell>
                      <TableCell className="text-xs font-semibold text-orange-700">{tx.amount.toLocaleString()}</TableCell>
                      <TableCell className="text-xs font-mono">{tx.mpesaReceipt ?? "—"}</TableCell>
                      <TableCell className="text-xs">{tx.transactionDate ? new Date(tx.transactionDate).toLocaleString() : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="callbacks" className="mt-3 space-y-2">
          <div className="flex items-center gap-2 p-3 rounded-md bg-red-50 dark:bg-red-950 border border-red-200 text-xs text-red-800 dark:text-red-200" data-testid="callback-info-banner">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>Rejected callbacks: Callbacks that were blocked by security checks (missing fields, phone mismatch, duplicate receipt, invalid structure). Frequent failures from the same source may indicate a fraud attempt.</span>
          </div>
          {!data?.failedCallbacks?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6 flex items-center justify-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" /> No rejected callbacks on record.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-red-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">CheckoutRequestID</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.failedCallbacks.map(cb => (
                    <TableRow key={cb.id} className="bg-red-50/50 dark:bg-red-950/20" data-testid={`callback-row-${cb.id}`}>
                      <TableCell className="text-xs font-mono max-w-[180px] truncate" title={cb.lockKey}>{cb.lockKey}</TableCell>
                      <TableCell className="text-xs">{cb.webhookType}</TableCell>
                      <TableCell>{statusBadge(cb.status)}</TableCell>
                      <TableCell className="text-xs">{new Date(cb.createdAt).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="locked" className="mt-3 space-y-2">
          <div className="flex items-center gap-2 p-3 rounded-md bg-red-50 dark:bg-red-950 border border-red-200 text-xs text-red-800 dark:text-red-200" data-testid="locked-info-banner">
            <Phone className="w-4 h-4 shrink-0" />
            <span>Locked accounts: Phone numbers or IP addresses with 3+ failed payment attempts. Actively locked accounts are temporarily blocked from initiating new payments. Unlock manually if confirmed legitimate.</span>
          </div>
          {!data?.lockedAccounts?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6 flex items-center justify-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" /> No suspicious lockouts.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Identifier</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Risk</TableHead>
                    <TableHead className="text-xs">Locked Until</TableHead>
                    <TableHead className="text-xs">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.lockedAccounts.map(acc => {
                    const isLocked = acc.lockedUntil && new Date(acc.lockedUntil) > new Date();
                    return (
                      <TableRow key={acc.id} className={isLocked ? "bg-red-50/50 dark:bg-red-950/20" : ""} data-testid={`locked-row-${acc.id}`}>
                        <TableCell className="text-xs font-mono">{acc.identifier}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {acc.identifierType === "ip" ? "IP" : "Phone"}
                          </Badge>
                        </TableCell>
                        <TableCell>{riskBadge(acc.failedAttempts)}</TableCell>
                        <TableCell className="text-xs">
                          {isLocked
                            ? <span className="text-red-600 font-medium">{new Date(acc.lockedUntil!).toLocaleString()}</span>
                            : <span className="text-muted-foreground">Expired</span>
                          }
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => unlockMutation.mutate(acc.id)}
                            disabled={unlockMutation.isPending}
                            data-testid={`btn-unlock-${acc.id}`}
                          >
                            {unlockMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3 mr-1" />}
                            Unlock
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="suspicious" className="mt-3 space-y-2">
          <div className="flex items-center gap-2 p-3 rounded-md bg-red-50 dark:bg-red-950 border border-red-200 text-xs text-red-800 dark:text-red-200" data-testid="suspicious-info-banner">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Flagged payments: these records were rejected by the M-Pesa security chain due to amount mismatches or phone number mismatches. No funds were credited for these transactions.</span>
          </div>
          {fraudLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12" />)}</div>
          ) : !fraudPayments?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6 flex items-center justify-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" /> No flagged payments — all verified payments passed security checks.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-red-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Payment ID</TableHead>
                    <TableHead className="text-xs">User ID</TableHead>
                    <TableHead className="text-xs">Amount (KES)</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Fraud Reason</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fraudPayments.map(p => (
                    <TableRow key={p.id} className="bg-red-50/50 dark:bg-red-950/20" data-testid={`suspicious-row-${p.id}`}>
                      <TableCell className="text-xs font-mono">{p.id.slice(0, 8)}…</TableCell>
                      <TableCell className="text-xs font-mono">{p.userId.slice(0, 8)}…</TableCell>
                      <TableCell className="text-xs font-semibold text-red-700">{p.amount.toLocaleString()}</TableCell>
                      <TableCell>{statusBadge(p.status)}</TableCell>
                      <TableCell className="text-xs font-mono text-red-700 max-w-[180px] truncate" title={p.fraudReason ?? ""}>
                        {p.fraudReason ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs">{p.createdAt ? new Date(p.createdAt).toLocaleString() : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function AdminFraudDetection() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("flags");
  const [flagStatusFilter, setFlagStatusFilter] = useState("all");
  const [flagSeverityFilter, setFlagSeverityFilter] = useState("all");
  const [blacklistStatusFilter, setBlacklistStatusFilter] = useState("all");
  const [selectedFlag, setSelectedFlag] = useState<string | null>(null);
  const [blacklistDialog, setBlacklistDialog] = useState(false);
  const [newBlacklistEntityId, setNewBlacklistEntityId] = useState("");
  const [newBlacklistEntityType, setNewBlacklistEntityType] = useState("agency");
  const [newBlacklistReason, setNewBlacklistReason] = useState("");
  const [clearDialog, setClearDialog] = useState<string | null>(null);
  const [clearReason, setClearReason] = useState("");
  const [reportStatusFilter, setReportStatusFilter] = useState("_all");
  const [indicatorTypeFilter, setIndicatorTypeFilter] = useState("_all");
  const [indicatorRiskFilter, setIndicatorRiskFilter] = useState("_all");
  const [newIndicatorType, setNewIndicatorType] = useState("");
  const [newIndicatorValue, setNewIndicatorValue] = useState("");
  const [newIndicatorRisk, setNewIndicatorRisk] = useState("low");

  const { data: stats, isLoading: statsLoading } = useQuery<FraudStats>({
    queryKey: ["/api/admin/fraud-flags/stats"],
  });

  const buildFlagQuery = () => {
    const params = new URLSearchParams();
    if (flagStatusFilter !== "all") params.set("status", flagStatusFilter);
    if (flagSeverityFilter !== "all") params.set("severity", flagSeverityFilter);
    return params.toString();
  };

  const { data: flagsData, isLoading: flagsLoading } = useQuery<{ flags: FraudFlag[]; total: number }>({
    queryKey: ["/api/admin/fraud-flags", flagStatusFilter, flagSeverityFilter],
    queryFn: async () => {
      const qs = buildFlagQuery();
      const url = qs ? `/api/admin/fraud-flags?${qs}` : "/api/admin/fraud-flags";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const flags = flagsData?.flags || [];

  const { data: blacklistData, isLoading: blacklistLoading } = useQuery<{ entries: BlacklistEntry[]; total: number }>({
    queryKey: ["/api/admin/blacklist", blacklistStatusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (blacklistStatusFilter !== "all") params.set("status", blacklistStatusFilter);
      const qs = params.toString();
      const url = qs ? `/api/admin/blacklist?${qs}` : "/api/admin/blacklist";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const blacklistEntries = blacklistData?.entries || [];

  const { data: rulesData, isLoading: rulesLoading } = useQuery<{ rules: DetectionRule[] }>({
    queryKey: ["/api/admin/fraud-detection-rules"],
  });

  const rules = rulesData?.rules || [];

  const batchScanMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/fraud-detection/scan");
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Scan Complete", description: `Scanned ${data.scanned} agencies, ${data.flagged} flagged.` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fraud-flags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fraud-flags/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blacklist"] });
    },
    onError: () => toast({ title: "Scan failed", variant: "destructive" }),
  });

  const updateFlagStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/fraud-flags/${id}/status`, { status });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Status updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fraud-flags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fraud-flags/stats"] });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const addBlacklistMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/blacklist", {
        entityId: newBlacklistEntityId,
        entityType: newBlacklistEntityType,
        reason: newBlacklistReason,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Entity blacklisted" });
      setBlacklistDialog(false);
      setNewBlacklistEntityId("");
      setNewBlacklistReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blacklist"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fraud-flags/stats"] });
    },
    onError: () => toast({ title: "Failed to blacklist", variant: "destructive" }),
  });

  const clearBlacklistMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/admin/blacklist/${id}/clear`, { reason });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Entity cleared from blacklist" });
      setClearDialog(null);
      setClearReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blacklist"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fraud-flags/stats"] });
    },
    onError: () => toast({ title: "Failed to clear", variant: "destructive" }),
  });

  const updateRuleMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/fraud-detection-rules/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Rule updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fraud-detection-rules"] });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const buildReportQuery = () => {
    const params = new URLSearchParams();
    if (reportStatusFilter !== "_all") params.set("status", reportStatusFilter);
    return params.toString();
  };

  const { data: fraudReportsData, isLoading: reportsLoading } = useQuery<{ reports: any[]; total: number }>({
    queryKey: ["/api/admin/fraud-reports", buildReportQuery()],
    queryFn: async () => {
      const q = buildReportQuery();
      const res = await fetch(`/api/admin/fraud-reports${q ? `?${q}` : ""}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const buildIndicatorQuery = () => {
    const params = new URLSearchParams();
    if (indicatorTypeFilter !== "_all") params.set("indicatorType", indicatorTypeFilter);
    if (indicatorRiskFilter !== "_all") params.set("riskLevel", indicatorRiskFilter);
    return params.toString();
  };

  const { data: indicatorsData, isLoading: indicatorsLoading } = useQuery<{ indicators: any[]; total: number }>({
    queryKey: ["/api/admin/fraud-indicators", buildIndicatorQuery()],
    queryFn: async () => {
      const q = buildIndicatorQuery();
      const res = await fetch(`/api/admin/fraud-indicators${q ? `?${q}` : ""}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: analyticsData } = useQuery<any>({
    queryKey: ["/api/admin/fraud-analytics"],
    queryFn: async () => {
      const res = await fetch("/api/admin/fraud-analytics");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const updateReportMutation = useMutation({
    mutationFn: async ({ id, status, resolution }: { id: string; status: string; resolution?: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/fraud-reports/${id}/status`, { status, resolution });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Report updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fraud-reports"] });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const analyzeReportMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/fraud-reports/${id}/analyze`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Analysis complete", description: `Found ${data.indicatorsFound} indicators, ${data.patternsDetected} patterns` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fraud-reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fraud-indicators"] });
    },
    onError: () => toast({ title: "Analysis failed", variant: "destructive" }),
  });

  const addIndicatorMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/admin/fraud-indicators", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Indicator added" });
      setNewIndicatorType("");
      setNewIndicatorValue("");
      setNewIndicatorRisk("low");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fraud-indicators"] });
    },
    onError: () => toast({ title: "Failed to add indicator", variant: "destructive" }),
  });

  const deleteIndicatorMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/fraud-indicators/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Indicator deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fraud-indicators"] });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const patternScanMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/scam-intelligence/pattern-scan");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Pattern scan complete", description: `Scanned ${data.scanned}, escalated ${data.escalated}, ${data.alertsCreated} alerts` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fraud-indicators"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fraud-analytics"] });
    },
    onError: () => toast({ title: "Scan failed", variant: "destructive" }),
  });

  const indicatorTypeIcons: Record<string, any> = { phone: Phone, license: FileText, payment_account: CreditCard, name: Building2, email: Mail };

  return (
    <AdminLayout title="Fraud Detection & Blacklist">
      <div className="space-y-6" data-testid="fraud-detection-page">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link href="/admin">
              <Button variant="ghost" size="icon" data-testid="button-back-admin">
                <ArrowLeft />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold" data-testid="page-title">Fraud Detection & Blacklist</h1>
              <p className="text-muted-foreground text-sm mt-1">Monitor and manage suspicious agency activity</p>
            </div>
          </div>
          <Button
            onClick={() => batchScanMutation.mutate()}
            disabled={batchScanMutation.isPending}
            data-testid="button-run-scan"
          >
            {batchScanMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Search className="w-4 h-4 mr-2" />
            )}
            Run Fraud Scan
          </Button>
        </div>

        {statsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" data-testid="fraud-stats">
            <Card data-testid="stat-open-flags">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-100 dark:bg-red-950 rounded-lg">
                    <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.byStatus.open}</p>
                    <p className="text-xs text-muted-foreground">Open Flags</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="stat-investigating">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-yellow-100 dark:bg-yellow-950 rounded-lg">
                    <Eye className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.byStatus.investigating}</p>
                    <p className="text-xs text-muted-foreground">Investigating</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="stat-blacklisted">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 dark:bg-purple-950 rounded-lg">
                    <Ban className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.activeBlacklist}</p>
                    <p className="text-xs text-muted-foreground">Blacklisted</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="stat-critical">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 dark:bg-orange-950 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.bySeverity.critical + stats.bySeverity.high}</p>
                    <p className="text-xs text-muted-foreground">High/Critical</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} data-testid="fraud-tabs">
          <TabsList className="flex w-full overflow-x-auto">
            <TabsTrigger value="flags" data-testid="tab-flags" className="text-xs">
              <ShieldAlert className="w-3 h-3 mr-1" />
              Flags
            </TabsTrigger>
            <TabsTrigger value="blacklist" data-testid="tab-blacklist" className="text-xs">
              <ShieldX className="w-3 h-3 mr-1" />
              Blacklist
            </TabsTrigger>
            <TabsTrigger value="rules" data-testid="tab-rules" className="text-xs">
              <Shield className="w-3 h-3 mr-1" />
              Rules
            </TabsTrigger>
            <TabsTrigger value="reports" data-testid="tab-reports" className="text-xs">
              <FileText className="w-3 h-3 mr-1" />
              Reports
            </TabsTrigger>
            <TabsTrigger value="intelligence" data-testid="tab-intelligence" className="text-xs">
              <Database className="w-3 h-3 mr-1" />
              Intel
            </TabsTrigger>
            <TabsTrigger value="analytics" data-testid="tab-analytics" className="text-xs">
              <BarChart3 className="w-3 h-3 mr-1" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="mpesa" data-testid="tab-mpesa" className="text-xs">
              <CreditCard className="w-3 h-3 mr-1" />
              M-Pesa
            </TabsTrigger>
          </TabsList>

          <TabsContent value="flags" className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Select value={flagStatusFilter} onValueChange={setFlagStatusFilter}>
                <SelectTrigger className="w-40" data-testid="filter-flag-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="investigating">Investigating</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="dismissed">Dismissed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={flagSeverityFilter} onValueChange={setFlagSeverityFilter}>
                <SelectTrigger className="w-40" data-testid="filter-flag-severity">
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severity</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {flagsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}
              </div>
            ) : flags.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <ShieldAlert className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No fraud flags found</p>
                </CardContent>
              </Card>
            ) : (
              <div className="border rounded-md overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Entity</TableHead>
                      <TableHead>Rule</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {flags.map(flag => (
                      <TableRow key={flag.id} data-testid={`flag-row-${flag.id}`}>
                        <TableCell>
                          <span className="text-sm font-mono">{flag.entityId.slice(0, 8)}...</span>
                          <br />
                          <span className="text-xs text-muted-foreground">{flag.entityType}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{flag.ruleTriggered.replace(/_/g, " ")}</span>
                        </TableCell>
                        <TableCell>{getSeverityBadge(flag.severity)}</TableCell>
                        <TableCell>{getStatusBadge(flag.status)}</TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {new Date(flag.createdAt).toLocaleDateString()}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedFlag(flag.id)}
                              data-testid={`btn-view-flag-${flag.id}`}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {flag.status === "open" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => updateFlagStatusMutation.mutate({ id: flag.id, status: "investigating" })}
                                data-testid={`btn-investigate-${flag.id}`}
                              >
                                <Search className="w-4 h-4" />
                              </Button>
                            )}
                            {(flag.status === "open" || flag.status === "investigating") && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => updateFlagStatusMutation.mutate({ id: flag.id, status: "resolved" })}
                                  data-testid={`btn-resolve-${flag.id}`}
                                >
                                  <CheckCircle className="w-4 h-4 text-green-600" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => updateFlagStatusMutation.mutate({ id: flag.id, status: "dismissed" })}
                                  data-testid={`btn-dismiss-${flag.id}`}
                                >
                                  <XCircle className="w-4 h-4 text-gray-500" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="blacklist" className="space-y-4">
            <div className="flex flex-wrap gap-3 items-center justify-between">
              <Select value={blacklistStatusFilter} onValueChange={setBlacklistStatusFilter}>
                <SelectTrigger className="w-40" data-testid="filter-blacklist-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="under_review">Under Review</SelectItem>
                  <SelectItem value="cleared">Cleared</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => setBlacklistDialog(true)} data-testid="btn-add-blacklist">
                <Plus className="w-4 h-4 mr-2" />
                Add to Blacklist
              </Button>
            </div>

            {blacklistLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}
              </div>
            ) : blacklistEntries.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <ShieldX className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No blacklisted entities</p>
                </CardContent>
              </Card>
            ) : (
              <div className="border rounded-md overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Entity</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date Added</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blacklistEntries.map(entry => (
                      <TableRow key={entry.id} data-testid={`blacklist-row-${entry.id}`}>
                        <TableCell>
                          <span className="text-sm font-mono">{entry.entityId.slice(0, 8)}...</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{entry.entityType}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm max-w-[200px] truncate block">{entry.reason}</span>
                        </TableCell>
                        <TableCell>{getStatusBadge(entry.status)}</TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {new Date(entry.dateAdded).toLocaleDateString()}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {entry.status === "active" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => { setClearDialog(entry.id); setClearReason(""); }}
                                data-testid={`btn-clear-${entry.id}`}
                              >
                                <CheckCircle className="w-4 h-4 text-green-600" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="rules" className="space-y-4">
            {rulesLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
              </div>
            ) : rules.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No detection rules configured</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {rules.map(rule => (
                  <RuleCard key={rule.id} rule={rule} onUpdate={updateRuleMutation.mutate} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="reports" className="space-y-4">
            <div className="flex flex-wrap gap-3 items-center">
              <Select value={reportStatusFilter} onValueChange={setReportStatusFilter}>
                <SelectTrigger className="w-40" data-testid="filter-report-status"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="investigating">Investigating</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <Badge variant="outline">{fraudReportsData?.total || 0} reports</Badge>
            </div>
            {reportsLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}</div>
            ) : !fraudReportsData?.reports?.length ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>No fraud reports yet</p>
              </CardContent></Card>
            ) : (
              <div className="space-y-3">
                {fraudReportsData.reports.map((report: any) => (
                  <Card key={report.id} data-testid={`report-card-${report.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="font-semibold text-sm">{report.suspectedEntity}</p>
                          <p className="text-xs text-muted-foreground">{report.incidentType?.replace("_", " ")} — {report.createdAt ? new Date(report.createdAt).toLocaleDateString() : ""}</p>
                        </div>
                        {getStatusBadge(report.status)}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{report.description}</p>
                      {report.phoneNumber && <p className="text-xs mt-1"><Phone className="w-3 h-3 inline mr-1" />{report.phoneNumber}</p>}
                      {report.licenseNumber && <p className="text-xs mt-1"><FileText className="w-3 h-3 inline mr-1" />{report.licenseNumber}</p>}
                      {report.paymentReference && <p className="text-xs mt-1"><CreditCard className="w-3 h-3 inline mr-1" />{report.paymentReference}</p>}
                      {report.analysisResult && (
                        <div className="mt-2 p-2 bg-muted rounded text-xs">
                          Analyzed: {report.analysisResult.indicatorsFound} indicators, {report.analysisResult.patternsDetected} patterns
                        </div>
                      )}
                      <div className="flex gap-2 mt-3 flex-wrap">
                        {report.status === "pending" && (
                          <Button size="sm" variant="outline" onClick={() => updateReportMutation.mutate({ id: report.id, status: "investigating" })} data-testid={`btn-investigate-${report.id}`}>
                            <Search className="w-3 h-3 mr-1" /> Investigate
                          </Button>
                        )}
                        {(report.status === "pending" || report.status === "investigating") && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => updateReportMutation.mutate({ id: report.id, status: "confirmed" })} data-testid={`btn-confirm-${report.id}`}>
                              <CheckCircle className="w-3 h-3 mr-1" /> Confirm
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => updateReportMutation.mutate({ id: report.id, status: "rejected" })} data-testid={`btn-reject-${report.id}`}>
                              <XCircle className="w-3 h-3 mr-1" /> Reject
                            </Button>
                          </>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => analyzeReportMutation.mutate(report.id)} disabled={analyzeReportMutation.isPending} data-testid={`btn-analyze-${report.id}`}>
                          <RefreshCw className="w-3 h-3 mr-1" /> Analyze
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="intelligence" className="space-y-4">
            <div className="flex flex-wrap gap-3 items-center">
              <Select value={indicatorTypeFilter} onValueChange={setIndicatorTypeFilter}>
                <SelectTrigger className="w-40" data-testid="filter-indicator-type"><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All Types</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="license">License</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="payment_account">Payment Account</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
              <Select value={indicatorRiskFilter} onValueChange={setIndicatorRiskFilter}>
                <SelectTrigger className="w-40" data-testid="filter-indicator-risk"><SelectValue placeholder="Risk" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All Risk</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => patternScanMutation.mutate()} disabled={patternScanMutation.isPending} data-testid="btn-pattern-scan">
                {patternScanMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />} Pattern Scan
              </Button>
              <Badge variant="outline">{indicatorsData?.total || 0} indicators</Badge>
            </div>
            <Card>
              <CardHeader><CardTitle className="text-sm">Add Indicator</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Select value={newIndicatorType} onValueChange={setNewIndicatorType}>
                    <SelectTrigger className="w-36" data-testid="input-new-indicator-type"><SelectValue placeholder="Type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="phone">Phone</SelectItem>
                      <SelectItem value="license">License</SelectItem>
                      <SelectItem value="name">Name</SelectItem>
                      <SelectItem value="payment_account">Payment Account</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input value={newIndicatorValue} onChange={e => setNewIndicatorValue(e.target.value)} placeholder="Value" className="flex-1 min-w-[150px]" data-testid="input-new-indicator-value" />
                  <Select value={newIndicatorRisk} onValueChange={setNewIndicatorRisk}>
                    <SelectTrigger className="w-28" data-testid="input-new-indicator-risk"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="moderate">Moderate</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={() => addIndicatorMutation.mutate({ indicatorType: newIndicatorType, value: newIndicatorValue, riskLevel: newIndicatorRisk })} disabled={!newIndicatorType || !newIndicatorValue || addIndicatorMutation.isPending} data-testid="btn-add-indicator">
                    <Plus className="w-3 h-3 mr-1" /> Add
                  </Button>
                </div>
              </CardContent>
            </Card>
            {indicatorsLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20" />)}</div>
            ) : !indicatorsData?.indicators?.length ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">
                <Database className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>No scam indicators in database</p>
              </CardContent></Card>
            ) : (
              <div className="space-y-2">
                {indicatorsData.indicators.map((ind: any) => {
                  const Icon = indicatorTypeIcons[ind.indicatorType] || AlertTriangle;
                  return (
                    <Card key={ind.id} data-testid={`indicator-card-${ind.id}`}>
                      <CardContent className="p-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="font-mono text-sm truncate">{ind.value}</p>
                            <p className="text-xs text-muted-foreground">{ind.indicatorType} — {ind.reportCount} reports — {ind.source}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getSeverityBadge(ind.riskLevel)}
                          <Button size="sm" variant="ghost" onClick={() => deleteIndicatorMutation.mutate(ind.id)} data-testid={`btn-delete-indicator-${ind.id}`}>
                            <Trash2 className="w-3 h-3 text-red-500" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            {!analyticsData ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-32" />)}</div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Card><CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-teal-600" data-testid="stat-total-reports">{analyticsData.totalReports}</p>
                    <p className="text-xs text-muted-foreground">Total Reports</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-orange-600" data-testid="stat-total-indicators">{analyticsData.totalIndicators}</p>
                    <p className="text-xs text-muted-foreground">Active Indicators</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-blue-600" data-testid="stat-recent-reports">{analyticsData.recentReports}</p>
                    <p className="text-xs text-muted-foreground">Reports (30d)</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-red-600" data-testid="stat-critical">
                      {(analyticsData.byRiskLevel?.critical || 0) + (analyticsData.byRiskLevel?.high || 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">High/Critical</p>
                  </CardContent></Card>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader><CardTitle className="text-sm">By Incident Type</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      {Object.entries(analyticsData.byIncidentType || {}).map(([type, cnt]: any) => (
                        <div key={type} className="flex justify-between items-center" data-testid={`incident-type-${type}`}>
                          <span className="text-sm capitalize">{type.replace("_", " ")}</span>
                          <Badge variant="outline">{cnt}</Badge>
                        </div>
                      ))}
                      {Object.keys(analyticsData.byIncidentType || {}).length === 0 && <p className="text-sm text-muted-foreground">No data yet</p>}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle className="text-sm">By Risk Level</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      {Object.entries(analyticsData.byRiskLevel || {}).map(([level, cnt]: any) => (
                        <div key={level} className="flex justify-between items-center" data-testid={`risk-level-${level}`}>
                          <span className="text-sm capitalize">{level}</span>
                          {getSeverityBadge(level)}<Badge variant="outline" className="ml-2">{cnt}</Badge>
                        </div>
                      ))}
                      {Object.keys(analyticsData.byRiskLevel || {}).length === 0 && <p className="text-sm text-muted-foreground">No data yet</p>}
                    </CardContent>
                  </Card>
                </div>
                <Card>
                  <CardHeader><CardTitle className="text-sm">Top Scam Indicators</CardTitle></CardHeader>
                  <CardContent>
                    {analyticsData.topIndicators?.length > 0 ? (
                      <div className="space-y-2">
                        {analyticsData.topIndicators.map((ind: any, idx: number) => {
                          const Icon = indicatorTypeIcons[ind.indicatorType] || AlertTriangle;
                          return (
                            <div key={ind.id || idx} className="flex items-center justify-between gap-2" data-testid={`top-indicator-${idx}`}>
                              <div className="flex items-center gap-2 min-w-0">
                                <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                <span className="text-sm font-mono truncate">{ind.value}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {getSeverityBadge(ind.riskLevel)}
                                <Badge variant="outline">{ind.reportCount} reports</Badge>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : <p className="text-sm text-muted-foreground">No indicators yet</p>}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-sm">By Indicator Type</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {Object.entries(analyticsData.byIndicatorType || {}).map(([type, cnt]: any) => {
                      const Icon = indicatorTypeIcons[type] || AlertTriangle;
                      return (
                        <div key={type} className="flex justify-between items-center" data-testid={`indicator-type-${type}`}>
                          <span className="text-sm flex items-center gap-2"><Icon className="w-4 h-4" />{type.replace("_", " ")}</span>
                          <Badge variant="outline">{cnt}</Badge>
                        </div>
                      );
                    })}
                    {Object.keys(analyticsData.byIndicatorType || {}).length === 0 && <p className="text-sm text-muted-foreground">No data yet</p>}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="mpesa" className="space-y-4" data-testid="tab-content-mpesa">
            <MpesaFraudTab />
          </TabsContent>
        </Tabs>

        {selectedFlag && (
          <FlagDetailDialog flagId={selectedFlag} onClose={() => setSelectedFlag(null)} />
        )}

        <Dialog open={blacklistDialog} onOpenChange={setBlacklistDialog}>
          <DialogContent data-testid="dialog-add-blacklist">
            <DialogHeader>
              <DialogTitle>Add Entity to Blacklist</DialogTitle>
              <DialogDescription>Blacklisted entities will be hidden from public search and blocked from payments.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Entity ID</Label>
                <Input
                  value={newBlacklistEntityId}
                  onChange={e => setNewBlacklistEntityId(e.target.value)}
                  placeholder="Agency or agent ID"
                  data-testid="input-blacklist-entity-id"
                />
              </div>
              <div>
                <Label>Entity Type</Label>
                <Select value={newBlacklistEntityType} onValueChange={setNewBlacklistEntityType}>
                  <SelectTrigger data-testid="select-blacklist-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agency">Agency</SelectItem>
                    <SelectItem value="agent">Agent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Reason</Label>
                <Textarea
                  value={newBlacklistReason}
                  onChange={e => setNewBlacklistReason(e.target.value)}
                  placeholder="Reason for blacklisting"
                  data-testid="input-blacklist-reason"
                />
              </div>
              <Button
                onClick={() => addBlacklistMutation.mutate()}
                disabled={!newBlacklistEntityId || !newBlacklistReason || addBlacklistMutation.isPending}
                className="w-full"
                data-testid="btn-confirm-blacklist"
              >
                {addBlacklistMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Ban className="w-4 h-4 mr-2" />}
                Add to Blacklist
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!clearDialog} onOpenChange={() => setClearDialog(null)}>
          <DialogContent data-testid="dialog-clear-blacklist">
            <DialogHeader>
              <DialogTitle>Clear from Blacklist</DialogTitle>
              <DialogDescription>Provide a reason for removing this entity from the blacklist.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Reason for Clearing</Label>
                <Textarea
                  value={clearReason}
                  onChange={e => setClearReason(e.target.value)}
                  placeholder="Reason for clearing from blacklist"
                  data-testid="input-clear-reason"
                />
              </div>
              <Button
                onClick={() => clearDialog && clearBlacklistMutation.mutate({ id: clearDialog, reason: clearReason })}
                disabled={!clearReason || clearBlacklistMutation.isPending}
                className="w-full"
                data-testid="btn-confirm-clear"
              >
                {clearBlacklistMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                Clear from Blacklist
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}

function RuleCard({ rule, onUpdate }: { rule: DetectionRule; onUpdate: (data: { id: string; data: any }) => void }) {
  const [threshold, setThreshold] = useState(String(rule.threshold));
  const [timeWindow, setTimeWindow] = useState(String(rule.timeWindowDays));
  const [scoreReduction, setScoreReduction] = useState(String(rule.scoreReduction));

  return (
    <Card data-testid={`rule-card-${rule.id}`}>
      <CardContent className="pt-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-sm">{rule.ruleName.replace(/_/g, " ")}</h3>
              {getSeverityBadge(rule.severity)}
            </div>
            <p className="text-xs text-muted-foreground">{rule.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">Active</Label>
            <Switch
              checked={rule.isActive}
              onCheckedChange={checked => onUpdate({ id: rule.id, data: { isActive: checked } })}
              data-testid={`switch-active-${rule.id}`}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Threshold</Label>
            <div className="flex gap-1">
              <Input
                type="number"
                value={threshold}
                onChange={e => setThreshold(e.target.value)}
                className="h-8 text-sm"
                data-testid={`input-threshold-${rule.id}`}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2"
                onClick={() => onUpdate({ id: rule.id, data: { threshold: parseInt(threshold) } })}
                data-testid={`btn-save-threshold-${rule.id}`}
              >
                <RefreshCw className="w-3 h-3" />
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">Time Window (days)</Label>
            <div className="flex gap-1">
              <Input
                type="number"
                value={timeWindow}
                onChange={e => setTimeWindow(e.target.value)}
                className="h-8 text-sm"
                data-testid={`input-timewindow-${rule.id}`}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2"
                onClick={() => onUpdate({ id: rule.id, data: { timeWindowDays: parseInt(timeWindow) } })}
                data-testid={`btn-save-timewindow-${rule.id}`}
              >
                <RefreshCw className="w-3 h-3" />
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">Score Reduction</Label>
            <div className="flex gap-1">
              <Input
                type="number"
                value={scoreReduction}
                onChange={e => setScoreReduction(e.target.value)}
                className="h-8 text-sm"
                data-testid={`input-score-reduction-${rule.id}`}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2"
                onClick={() => onUpdate({ id: rule.id, data: { scoreReduction: parseInt(scoreReduction) } })}
                data-testid={`btn-save-score-${rule.id}`}
              >
                <RefreshCw className="w-3 h-3" />
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Switch
                checked={rule.autoBlacklist}
                onCheckedChange={checked => onUpdate({ id: rule.id, data: { autoBlacklist: checked } })}
                data-testid={`switch-auto-blacklist-${rule.id}`}
              />
              <Label className="text-xs">Auto Blacklist</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={rule.autoReduceScore}
                onCheckedChange={checked => onUpdate({ id: rule.id, data: { autoReduceScore: checked } })}
                data-testid={`switch-auto-reduce-${rule.id}`}
              />
              <Label className="text-xs">Auto Reduce Score</Label>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FlagDetailDialog({ flagId, onClose }: { flagId: string; onClose: () => void }) {
  const { toast } = useToast();
  const [newNote, setNewNote] = useState("");

  const { data: flagData, isLoading } = useQuery<{ flag: FraudFlag; notes: InvestigationNote[] }>({
    queryKey: ["/api/admin/fraud-flags", flagId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/fraud-flags/${flagId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/fraud-flags/${flagId}/notes`, { note: newNote });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Note added" });
      setNewNote("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fraud-flags", flagId] });
    },
    onError: () => toast({ title: "Failed to add note", variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh]" data-testid="dialog-flag-detail">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5" />
            Fraud Flag Details
          </DialogTitle>
          <DialogDescription>Investigation details and notes</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : flagData ? (
          <div className="overflow-y-auto max-h-[60vh] space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Rule:</span>
                <p className="font-medium">{flagData.flag.ruleTriggered.replace(/_/g, " ")}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Severity:</span>
                <div className="mt-1">{getSeverityBadge(flagData.flag.severity)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>
                <div className="mt-1">{getStatusBadge(flagData.flag.status)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Created:</span>
                <p className="font-medium">{new Date(flagData.flag.createdAt).toLocaleString()}</p>
              </div>
            </div>

            {flagData.flag.details && Object.keys(flagData.flag.details).length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Detection Details</h4>
                <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-32" data-testid="flag-details-json">
                  {JSON.stringify(flagData.flag.details, null, 2)}
                </pre>
              </div>
            )}

            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Investigation Notes ({flagData.notes.length})
              </h4>
              {flagData.notes.length === 0 ? (
                <p className="text-xs text-muted-foreground">No notes yet</p>
              ) : (
                <div className="space-y-2">
                  {flagData.notes.map(note => (
                    <Card key={note.id} data-testid={`note-${note.id}`}>
                      <CardContent className="p-3">
                        <p className="text-sm">{note.note}</p>
                        <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                          <span>by {note.attachedBy}</span>
                          <span>{new Date(note.createdAt).toLocaleString()}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t pt-3">
              <Label className="text-sm">Add Investigation Note</Label>
              <Textarea
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                placeholder="Enter investigation notes..."
                className="mt-1"
                data-testid="input-investigation-note"
              />
              <Button
                className="mt-2 w-full"
                onClick={() => addNoteMutation.mutate()}
                disabled={!newNote.trim() || addNoteMutation.isPending}
                data-testid="btn-add-note"
              >
                {addNoteMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
                Add Note
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
