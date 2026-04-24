import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  DollarSign,
  Clock,
  CheckCircle,
  Search,
  Download,
  RefreshCw,
  Zap,
  AlertCircle,
  PlayCircle,
  Timer,
  XCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AdminLayout from "@/components/admin-layout";

interface Referral {
  id: number;
  refCode: string;
  referredPhone: string;
  paymentAmount: number;
  commission: number;
  status: string;
  retryCount: number;
  lastPayoutAttempt: string | null;
  createdAt: string;
}

interface ReferralStats {
  refCode: string;
  total: number;
  pending: number;
  paid: number;
  totalCommission: number;
}

interface SchedulerStatus {
  enabled: boolean;
  isRunning: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastRunResult: {
    processed: number;
    succeeded: number;
    skipped: number;
    failed: number;
    errors: string[];
  } | null;
  totalRuns: number;
  totalPaid: number;
  pendingCount: number;
  intervalSeconds: number;
  maxAutoRetries: number;
  batchSize: number;
}

function statusColor(status: string) {
  switch (status) {
    case "paid": return "default";
    case "processing": return "secondary";
    case "failed": return "destructive";
    default: return "outline";
  }
}

function statusIcon(status: string) {
  switch (status) {
    case "paid": return <CheckCircle className="h-3 w-3 mr-1 text-green-500" />;
    case "processing": return <RefreshCw className="h-3 w-3 mr-1 animate-spin" />;
    case "failed": return <XCircle className="h-3 w-3 mr-1 text-red-500" />;
    default: return <Clock className="h-3 w-3 mr-1 text-amber-500" />;
  }
}

export default function AdminReferrals() {
  const { toast } = useToast();
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: referrals, isLoading } = useQuery<Referral[]>({
    queryKey: ["/api/admin/referrals"],
  });

  const { data: stats } = useQuery<ReferralStats[]>({
    queryKey: ["/api/admin/referrals/stats"],
  });

  const { data: scheduler, refetch: refetchScheduler } = useQuery<SchedulerStatus>({
    queryKey: ["/api/admin/referrals/scheduler/status"],
    refetchInterval: 15000,
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("POST", `/api/admin/referrals/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/referrals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/referrals/stats"] });
      toast({ title: "Status Updated", description: "Referral updated successfully." });
    },
  });

  const manualPayoutMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("POST", `/api/admin/referrals/${id}/payout`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/referrals"] });
      toast({ title: "Payout Initiated", description: "M-Pesa B2C payout sent. Result via callback." });
    },
    onError: (e: Error) =>
      toast({ title: "Payout Failed", description: e.message, variant: "destructive" }),
  });

  const runNowMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/referrals/scheduler/run-now", {}),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/referrals"] });
      refetchScheduler();
      const r = data.result;
      toast({
        title: "Batch Complete",
        description: `Processed ${r.processed} — ${r.succeeded} payouts initiated, ${r.skipped} skipped, ${r.failed} failed.`,
      });
    },
    onError: (e: Error) =>
      toast({ title: "Batch Failed", description: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest("POST", "/api/admin/referrals/scheduler/toggle", { enabled }),
    onSuccess: () => refetchScheduler(),
  });

  const filteredReferrals = referrals?.filter((ref) => {
    const matchesStatus = filterStatus === "all" || ref.status === filterStatus;
    const matchesSearch =
      ref.refCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ref.referredPhone.includes(searchQuery);
    return matchesStatus && matchesSearch;
  });

  const totalPending = stats?.reduce((sum, s) => sum + s.pending * 450, 0) || 0;
  const totalPaid = stats?.reduce((sum, s) => sum + s.paid * 450, 0) || 0;
  const totalReferrals = stats?.reduce((sum, s) => sum + s.total, 0) || 0;

  const exportCSV = () => {
    if (!referrals) return;
    const headers = ["ID", "Ref Code", "Phone", "Payment (KES)", "Commission (KES)", "Status", "Retries", "Date"];
    const rows = referrals.map((r) => [
      r.id, r.refCode, r.referredPhone, r.paymentAmount,
      r.commission, r.status, r.retryCount,
      new Date(r.createdAt).toLocaleDateString(),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `referrals-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  return (
    <AdminLayout title="Referral Management">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Referral Management</h1>
            <p className="text-muted-foreground">Automatic M-Pesa B2C payouts for affiliates</p>
          </div>
          <Button onClick={exportCSV} variant="outline" data-testid="button-export-csv">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {/* Scheduler Status Card */}
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-blue-500" />
                <CardTitle className="text-base">Auto-Payout Scheduler</CardTitle>
                <Badge variant={scheduler?.enabled ? "default" : "secondary"} className="text-xs">
                  {scheduler?.enabled ? "Active" : "Paused"}
                </Badge>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Switch
                    id="scheduler-toggle"
                    checked={scheduler?.enabled ?? true}
                    onCheckedChange={(v) => toggleMutation.mutate(v)}
                    data-testid="switch-scheduler-enabled"
                  />
                  <Label htmlFor="scheduler-toggle" className="text-sm">
                    {scheduler?.enabled ? "Enabled" : "Disabled"}
                  </Label>
                </div>
                <Button
                  size="sm"
                  onClick={() => runNowMutation.mutate()}
                  disabled={runNowMutation.isPending}
                  data-testid="button-run-payout-batch"
                >
                  {runNowMutation.isPending ? (
                    <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <PlayCircle className="h-3 w-3 mr-1" />
                  )}
                  Run Now
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Pending</p>
                <p className="text-2xl font-bold text-amber-600" data-testid="text-pending-count">
                  {scheduler?.pendingCount ?? 0}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Paid (session)</p>
                <p className="text-2xl font-bold text-green-600" data-testid="text-scheduler-paid">
                  {scheduler?.totalPaid ?? 0}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Interval</p>
                <p className="text-lg font-semibold">
                  {scheduler ? scheduler.intervalSeconds / 60 : 5} min
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Max Auto Retries</p>
                <p className="text-lg font-semibold">{scheduler?.maxAutoRetries ?? 5}</p>
              </div>
            </div>

            {scheduler && (
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                {scheduler.lastRunAt && (
                  <span className="flex items-center gap-1">
                    <Timer className="h-3 w-3" />
                    Last run: {new Date(scheduler.lastRunAt).toLocaleTimeString()}
                  </span>
                )}
                {scheduler.nextRunAt && scheduler.enabled && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Next run: {new Date(scheduler.nextRunAt).toLocaleTimeString()}
                  </span>
                )}
                <span>Total runs: {scheduler.totalRuns}</span>
              </div>
            )}

            {scheduler?.lastRunResult && (
              <div className="mt-3 p-3 bg-muted rounded-lg text-sm">
                <p className="font-medium mb-1">Last batch result</p>
                <div className="flex gap-4 text-xs">
                  <span>Processed: <strong>{scheduler.lastRunResult.processed}</strong></span>
                  <span className="text-green-600">Initiated: <strong>{scheduler.lastRunResult.succeeded}</strong></span>
                  <span className="text-amber-600">Skipped: <strong>{scheduler.lastRunResult.skipped}</strong></span>
                  <span className="text-red-600">Failed: <strong>{scheduler.lastRunResult.failed}</strong></span>
                </div>
                {scheduler.lastRunResult.errors.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {scheduler.lastRunResult.errors.slice(0, 3).map((e, i) => (
                      <p key={i} className="flex items-start gap-1 text-red-600">
                        <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                        {e}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                  <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-total-referrals">{totalReferrals}</p>
                  <p className="text-sm text-muted-foreground">Total Referrals</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900 rounded-lg">
                  <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">KES {totalPending.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">Pending Payouts</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">KES {totalPaid.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">Total Paid Out</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                  <DollarSign className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.length || 0}</p>
                  <p className="text-sm text-muted-foreground">Active Affiliates</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top Affiliates */}
        {stats && stats.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Top Affiliates</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {stats.slice(0, 5).map((affiliate) => (
                  <div key={affiliate.refCode} className="p-3 bg-muted rounded-lg">
                    <p className="font-bold text-lg">{affiliate.refCode}</p>
                    <p className="text-sm text-muted-foreground">{affiliate.total} referrals</p>
                    <p className="text-sm font-medium text-green-600">
                      KES {affiliate.totalCommission.toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by ref code or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search"
                />
              </div>
              <div data-testid="select-status-filter">
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Referrals Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ref Code</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Retries</TableHead>
                  <TableHead>Last Attempt</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                      Loading referrals...
                    </TableCell>
                  </TableRow>
                ) : filteredReferrals?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No referrals found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredReferrals?.map((ref) => (
                    <TableRow key={ref.id} data-testid={`row-referral-${ref.id}`}>
                      <TableCell className="font-bold">{ref.refCode}</TableCell>
                      <TableCell>{ref.referredPhone}</TableCell>
                      <TableCell>KES {ref.paymentAmount.toLocaleString()}</TableCell>
                      <TableCell className="font-medium text-green-600">
                        KES {ref.commission.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusColor(ref.status)} className="flex items-center w-fit">
                          {statusIcon(ref.status)}
                          {ref.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={ref.retryCount >= 4 ? "text-red-500 font-medium" : ""}>
                          {ref.retryCount}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {ref.lastPayoutAttempt
                          ? new Date(ref.lastPayoutAttempt).toLocaleString()
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {(ref.status === "pending" || ref.status === "failed") && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => manualPayoutMutation.mutate(ref.id)}
                            disabled={manualPayoutMutation.isPending}
                            data-testid={`button-payout-${ref.id}`}
                          >
                            <Zap className="h-3 w-3 mr-1" />
                            Pay Now
                          </Button>
                        )}
                        {ref.status === "processing" && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <RefreshCw className="h-3 w-3 animate-spin" />
                            Awaiting callback
                          </span>
                        )}
                        {ref.status === "paid" && (
                          <span className="text-green-600 text-sm font-medium flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Paid
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
