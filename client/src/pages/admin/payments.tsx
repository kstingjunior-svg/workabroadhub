import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import AdminLayout from "@/components/admin-layout";
import { Download, Check, Clock, X, Wifi, WifiOff, RefreshCw, Smartphone, Send, AlertTriangle, Link2, Zap, DatabaseZap, CheckCircle2, XCircle, Info, KeyRound, ShieldCheck, ShieldAlert, ShieldOff, UserCheck, Lock, Search, Timer, Unlock, Users, Activity, ChevronDown, ChevronUp, Eye } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { Payment } from "@shared/schema";

export default function AdminPayments() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [mpesaTestResult, setMpesaTestResult] = useState<{ success: boolean; message: string; environment: string } | null>(null);
  const [stkTestPhone, setStkTestPhone] = useState("");
  const [stkTestResult, setStkTestResult] = useState<any>(null);
  const [reconcileResult, setReconcileResult] = useState<{ pulled: number; stored: number; reconciled: number; errors: string[] } | null>(null);
  const [registerResult, setRegisterResult] = useState<any>(null);

  // Grant access tool state
  const [grantUserId, setGrantUserId] = useState("");
  const [grantPlanId, setGrantPlanId] = useState<"pro">("pro");
  const [grantTxCode, setGrantTxCode] = useState("");
  const [grantNote, setGrantNote] = useState("");
  const [showEmergencyTools, setShowEmergencyTools] = useState(false);

  // Failsafe reprocess state
  const [rpTransactionId, setRpTransactionId] = useState("");
  const [rpEmail, setRpEmail] = useState("");
  const [rpPaymentId, setRpPaymentId] = useState("");
  const [rpPlanId, setRpPlanId] = useState<"auto" | "pro">("auto");
  const [rpForce, setRpForce] = useState(false);
  const [rpResult, setRpResult] = useState<any>(null);

  // Verify payment state
  const [code, setCode] = useState("");
  const [result, setResult] = useState<any>(null);
  const [verifying, setVerifying] = useState(false);

  const { data: payments, isLoading } = useQuery<Payment[]>({
    queryKey: ["/api/admin/payments"],
  });

  const { data: pullData, isLoading: pullLoading, refetch: refetchPull } = useQuery<{
    transactions: any[];
    config: any;
  }>({
    queryKey: ["/api/admin/mpesa/pull/transactions"],
  });

  const { data: tokenStatus, isLoading: tokenLoading, refetch: refetchToken } = useQuery<{
    token: {
      status: "valid" | "expiring_soon" | "expired" | "not_fetched" | "error";
      ttlSeconds: number;
      obtainedAt: string | null;
      expiresAt: string | null;
      environment: string;
      lastError: string | null;
    };
    reconciler: {
      lastRunAt: string | null;
      lastSuccessAt: string | null;
      lastError: string | null;
      totalPulled: number;
      totalStored: number;
      totalReconciled: number;
      runCount: number;
      isRunning: boolean;
    };
    environment: string;
    shortcode: string;
    credentialsConfigured: boolean;
  }>({
    queryKey: ["/api/admin/mpesa/token-status"],
    refetchInterval: 30000,
  });

  const forceRefreshMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/mpesa/token-refresh");
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/mpesa/token-status"] });
      toast({
        title: data.success ? "Token Refreshed" : "Refresh Failed",
        description: data.success
          ? `New token valid for ${Math.round((data.token?.ttlSeconds ?? 0) / 60)} min`
          : data.message,
        variant: data.success ? "default" : "destructive",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Token refresh failed", description: err.message, variant: "destructive" });
    },
  });

  const registerPullMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/mpesa/pull/register");
      return res.json();
    },
    onSuccess: (data) => {
      setRegisterResult(data);
      toast({
        title: data.success ? "Pull URL Registered" : "Registration Failed",
        description: data.success
          ? `Callback: ${data.callbackUrl}`
          : data.message,
        variant: data.success ? "default" : "destructive",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Registration failed", description: err.message, variant: "destructive" });
    },
  });

  const reconcileMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/mpesa/pull/reconcile");
      return res.json();
    },
    onSuccess: (data) => {
      setReconcileResult(data);
      qc.invalidateQueries({ queryKey: ["/api/admin/mpesa/pull/transactions"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/service-orders"] });
      toast({
        title: data.reconciled > 0 ? `✓ ${data.reconciled} order(s) auto-confirmed` : "Reconciliation complete",
        description: `Pulled ${data.pulled} transactions, ${data.stored} new, ${data.reconciled} reconciled.`,
        variant: data.errors?.length ? "destructive" : "default",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Reconciliation failed", description: err.message, variant: "destructive" });
    },
  });

  const stkReconcileMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/mpesa/reconcile");
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed"); }
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/service-orders"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/payments"] });
      toast({
        title: `STK Reconcile: ${data.reconciled} checked`,
        description: data.results?.filter((r: any) => r.result === 0).length
          ? `${data.results.filter((r: any) => r.result === 0).length} payment(s) confirmed and activated!`
          : "No new confirmations found from Safaricom.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "STK Reconcile Failed", description: err.message, variant: "destructive" });
    },
  });

  const grantPlanMutation = useMutation({
    mutationFn: async () => {
      if (!grantUserId.trim()) throw new Error("User ID is required");
      if (!grantTxCode.trim()) throw new Error("Transaction code is required");
      const res = await apiRequest("POST", `/api/admin/users/${grantUserId.trim()}/grant-plan`, {
        planId: grantPlanId,
        transactionCode: grantTxCode.trim().toUpperCase(),
        note: grantNote.trim(),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to grant plan");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: `✅ ${data.planActivated} Plan Activated`,
        description: `User ${grantUserId} now has ${data.planActivated} plan until ${new Date(data.expiresAt).toLocaleDateString("en-KE")}`,
      });
      setGrantUserId("");
      setGrantTxCode("");
      setGrantNote("");
      qc.invalidateQueries({ queryKey: ["/api/admin/payments"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/payments/pending-manual"] });
    },
    onError: (err: Error) => {
      toast({ title: "Grant Failed", description: err.message, variant: "destructive" });
    },
  });

  const activatePaymentMutation = useMutation({
    mutationFn: async ({ paymentId, force = false }: { paymentId: string; force?: boolean }) => {
      const res = await apiRequest("POST", `/api/admin/payments/${paymentId}/activate`, {
        note: force ? "Admin repair — force reactivation" : "Admin manual activation",
        force,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to activate");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.alreadyActive) {
        toast({ title: "Already Active", description: data.message });
        return;
      }
      toast({
        title: data.wasRepair ? `🔧 Access Repaired` : `✅ Plan Activated`,
        description: `${data.planActivated} plan activated. Expires ${new Date(data.expiresAt).toLocaleDateString("en-KE")}`,
      });
      qc.invalidateQueries({ queryKey: ["/api/admin/payments"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/payments/pending-manual"] });
    },
    onError: (err: Error) => {
      toast({ title: "Activation Failed", description: err.message, variant: "destructive" });
    },
  });

  const reprocessMutation = useMutation({
    mutationFn: async () => {
      if (!rpTransactionId && !rpEmail && !rpPaymentId) throw new Error("Enter a Transaction ID, Email, or Payment ID");
      const body: Record<string, any> = {};
      if (rpPaymentId) body.paymentId = rpPaymentId.trim();
      if (rpTransactionId) body.transactionId = rpTransactionId.trim();
      if (rpEmail) body.email = rpEmail.trim().toLowerCase();
      if (rpPlanId && rpPlanId !== "auto") body.planId = rpPlanId;
      if (rpForce) body.forceUpgrade = true;
      const res = await apiRequest("POST", "/api/admin/reprocess-payment", body);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Reprocess failed");
      return data;
    },
    onSuccess: (data) => {
      setRpResult(data);
      toast({
        title: data.alreadyProcessed ? "Already Processed" : data.success ? "✅ Plan Activated" : "Reprocess Attempted",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
      qc.invalidateQueries({ queryKey: ["/api/admin/payments"] });
    },
    onError: (err: Error) => {
      setRpResult({ success: false, message: err.message });
      toast({ title: "Reprocess Failed", description: err.message, variant: "destructive" });
    },
  });

  function verifyPayment() {
    fetch(`/api/admin/verify-payment/${code}`, {
      credentials: "include",
    })
      .then(res => res.json())
      .then(data => setResult(data));
  }

  function upgradeUser(phone: string) {
    apiRequest("POST", "/api/admin/manual-grant", {
      identifier: phone,
      planId: "pro",
      note: `Manual upgrade via verify-payment tool (code: ${code})`,
    })
      .then(res => res.json())
      .then(data => {
        toast({
          title: data.message?.includes("already") ? "Already Pro" : "User upgraded to Pro",
          description: data.message,
          variant: data.notFound ? "destructive" : "default",
        });
        if (!data.notFound) setResult((prev: any) => ({ ...prev, upgraded: true }));
      })
      .catch(err => toast({ title: "Upgrade failed", description: err.message, variant: "destructive" }));
  }

  const { data: pendingManual, isLoading: pendingLoading, refetch: refetchPending } = useQuery<any[]>({
    queryKey: ["/api/admin/payments/pending-manual"],
    refetchInterval: 60000,
  });

  // Ghost payments (awaiting > 2 min — highest priority alerts)
  const { data: ghostPayments, isLoading: ghostLoading, refetch: refetchGhosts } = useQuery<any[]>({
    queryKey: ["/api/admin/payments/awaiting-ghost"],
    refetchInterval: 30000,
  });

  // ── Payment stats ──────────────────────────────────────────────────────────
  const [statsStart, setStatsStart] = useState("");
  const [statsEnd,   setStatsEnd]   = useState("");
  const statsParams = new URLSearchParams();
  if (statsStart) statsParams.set("startDate", statsStart);
  if (statsEnd)   statsParams.set("endDate",   statsEnd);

  const statsUrl = `/api/admin/payments/stats${statsParams.toString() ? `?${statsParams}` : ""}`;

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<{
    revenueByType:  { type: string; total: number; count: number }[];
    revenueByDay:   { date: string; total: number }[];
    statusBreakdown:{ status: string; count: number; total: number }[];
    totalRevenue:   number;
  }>({
    queryKey: [statsUrl],
    staleTime: 1000 * 60 * 2,
  });

  // Users locked from making payments (3 failures in 1 hour)
  const { data: lockedUsers, refetch: refetchLocked } = useQuery<any[]>({
    queryKey: ["/api/admin/locked-payment-users"],
    refetchInterval: 60000,
  });

  // Batch Safaricom query — forces the STK recovery poller to run now
  const querySafaricomMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/stuck-payments/query-safaricom");
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed"); }
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/payments"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/payments/awaiting-ghost"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/stuck-payments"] });
      toast({
        title: "Safaricom Query Complete",
        description: data.message,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Query Failed", description: err.message, variant: "destructive" });
    },
  });

  // Force-timeout all stuck awaiting_payment M-Pesa payments
  const forceTimeoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/stuck-payments/force-timeout", { minutesOld: 5 });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed"); }
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/payments"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/payments/awaiting-ghost"] });
      toast({
        title: "Stuck Payments Cleared",
        description: data.message,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Force Timeout Failed", description: err.message, variant: "destructive" });
    },
  });

  // Activate single retry_available payment
  const activateSingleStuckMutation = useMutation({
    mutationFn: async ({ paymentId, note = "" }: { paymentId: string; note?: string }) => {
      const res = await apiRequest("POST", `/api/admin/stuck-payments/${paymentId}/activate`, { planId: "pro", note });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed"); }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "✅ Pro Access Granted",
        description: data.message || "Pro plan activated successfully.",
      });
      qc.invalidateQueries({ queryKey: ["/api/admin/payments"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/stuck-payments"] });
    },
    onError: (err: Error) => {
      toast({ title: "Activation Failed", description: err.message, variant: "destructive" });
    },
  });

  // Query Safaricom for a single retry_available payment and auto-activate if confirmed
  const querySafaricomSingleMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const res = await apiRequest("POST", `/api/admin/stuck-payments/${paymentId}/query-and-activate`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Query failed");
      return data;
    },
    onSuccess: (data) => {
      if (data.activated) {
        toast({
          title: "✅ Confirmed & Pro Activated!",
          description: data.message,
        });
        qc.invalidateQueries({ queryKey: ["/api/admin/payments"] });
        qc.invalidateQueries({ queryKey: ["/api/admin/stuck-payments"] });
      } else {
        toast({
          title: data.confirmed === false ? "❌ Not Paid (Safaricom)" : "⚠️ Unclear",
          description: data.message,
          variant: data.confirmed === false ? "destructive" : "default",
        });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Safaricom Query Failed", description: err.message, variant: "destructive" });
    },
  });

  // Bulk activate all retry_available payments
  const activateAllStuckMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/stuck-payments/activate-all", { planId: "pro" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed"); }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: `✅ Bulk Activation Done`,
        description: `${data.activated} of ${data.total} payments activated.`,
      });
      qc.invalidateQueries({ queryKey: ["/api/admin/payments"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/stuck-payments"] });
    },
    onError: (err: Error) => {
      toast({ title: "Bulk Activation Failed", description: err.message, variant: "destructive" });
    },
  });

  // Unlock user from payment lock
  const unlockUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/unlock-payments`);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed"); }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "User Unlocked", description: data.message });
      qc.invalidateQueries({ queryKey: ["/api/admin/locked-payment-users"] });
    },
    onError: (err: Error) => {
      toast({ title: "Unlock Failed", description: err.message, variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("GET", "/api/admin/mpesa/test");
      return res.json();
    },
    onSuccess: (data) => {
      setMpesaTestResult(data);
      toast({
        title: data.success ? "M-Pesa Connected" : "M-Pesa Error",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
    },
  });

  const stkTestMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/mpesa/test-stk", { phone: stkTestPhone, amount: 1 });
      return res.json();
    },
    onSuccess: (data) => {
      setStkTestResult(data);
      toast({
        title: data.success ? "STK Push Sent!" : "STK Push Failed",
        description: data.success ? "Check the phone for the M-Pesa prompt." : (data.safaricomError?.errorMessage || data.message),
        variant: data.success ? "default" : "destructive",
      });
    },
    onError: (err: Error) => {
      setStkTestResult({ success: false, message: err.message });
      toast({ title: "STK Push Error", description: err.message, variant: "destructive" });
    },
  });

  const resetCircuitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/circuits/mpesa/reset");
      return res.json();
    },
    onSuccess: () => {
      setStkTestResult(null);
      toast({ title: "Circuit Breaker Reset", description: "M-Pesa circuit breaker is now CLOSED. You can retry the STK push." });
    },
    onError: (err: Error) => {
      toast({ title: "Reset Failed", description: err.message, variant: "destructive" });
    },
  });

  const isCircuitOpen = stkTestResult?.message?.includes("Circuit breaker") || stkTestResult?.message?.includes("OPEN");

  const filteredPayments = payments?.filter((payment) => {
    const matchesStatus = statusFilter === "all" || payment.status === statusFilter;
    const matchesMethod = methodFilter === "all" || payment.method === methodFilter;
    if (!matchesStatus || !matchesMethod) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const p = payment as any;
    return (
      p.userEmail?.toLowerCase().includes(q) ||
      p.userName?.toLowerCase().includes(q) ||
      p.userPhone?.includes(q) ||
      payment.transactionRef?.toLowerCase().includes(q) ||
      (p.mpesaReceiptNumber ?? "").toLowerCase().includes(q) ||
      payment.userId?.toLowerCase().includes(q)
    );
  });

  // Summary counts from ALL payments (not filtered)
  const paymentSummary = {
    confirmed: payments?.filter(p => p.status === "success" || p.status === "completed").length ?? 0,
    confirmedKes: payments?.filter(p => p.status === "success" || p.status === "completed").reduce((s, p) => s + p.amount, 0) ?? 0,
    stuck: payments?.filter(p => p.status === "retry_available").length ?? 0,
    stuckKes: payments?.filter(p => p.status === "retry_available").reduce((s, p) => s + p.amount, 0) ?? 0,
    failed: payments?.filter(p => p.status === "failed" || p.status === "retry_available").length ?? 0,
    failedKes: payments?.filter(p => p.status === "failed" || p.status === "retry_available").reduce((s, p) => s + p.amount, 0) ?? 0,
  };

  const parsePhone = (payment: any): string | null => {
    const raw = payment?.phone ?? (() => {
      try {
        const parsed = JSON.parse(payment?.metadata ?? "{}");
        return parsed.phone ?? parsed.phoneNumber ?? null;
      } catch { return null; }
    })();
    if (!raw) return null;
    const s = String(raw);
    if (s.length >= 9) return `+${s.replace(/^\+/, "").replace(/^0/, "254")}`;
    return s;
  };

  const totalRevenue = filteredPayments
    ?.filter((p) => p.status === "completed" || p.status === "success")
    .reduce((sum, p) => sum + p.amount, 0) || 0;

  const formatDate = (date: string | Date | null) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString("en-KE", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const handleExportCSV = async () => {
    try {
      const response = await fetch("/api/admin/payments/export");
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "payments-export.csv";
      a.click();
      window.URL.revokeObjectURL(url);
      toast({ title: "Export successful", description: "CSV file downloaded" });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
      case "success":
        return <Check className="h-3 w-3" />;
      case "pending":
        return <Clock className="h-3 w-3" />;
      case "failed":
        return <X className="h-3 w-3" />;
      default:
        return null;
    }
  };

  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "completed":
      case "success":
        return "default";
      case "pending":
        return "secondary";
      case "failed":
        return "destructive";
      default:
        return "outline";
    }
  };

  const typeLabels: Record<string, string> = {
    subscription:  "Subscriptions",
    cv_service:    "CV Services",
    consultation:  "Consultations",
    visa_guide:    "Visa Guides",
    job_post:      "Job Postings",
    other:         "Other",
  };

  const statusColors: Record<string, string> = {
    completed:       "text-green-700 dark:text-green-400",
    success:         "text-green-700 dark:text-green-400",
    failed:          "text-red-600 dark:text-red-400",
    retry_available: "text-amber-600 dark:text-amber-400",
    pending:         "text-blue-600 dark:text-blue-400",
    awaiting_payment:"text-purple-600 dark:text-purple-400",
  };

  return (
    <AdminLayout title="Payments">
      <div className="space-y-4">

        {/* ── Revenue Analytics ─────────────────────────────────────────────── */}
        <Card data-testid="card-payment-stats">
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
              <div>
                <CardTitle className="text-base">Revenue Analytics</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Completed payments · Amounts in KES
                </CardDescription>
              </div>
              {/* Date range filter */}
              <div className="flex items-center gap-2 flex-wrap">
                <Input
                  type="date" value={statsStart}
                  onChange={e => setStatsStart(e.target.value)}
                  className="h-8 text-xs w-36"
                  data-testid="input-stats-start"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="date" value={statsEnd}
                  onChange={e => setStatsEnd(e.target.value)}
                  className="h-8 text-xs w-36"
                  data-testid="input-stats-end"
                />
                <Button
                  variant="outline" size="sm"
                  onClick={() => { setStatsStart(""); setStatsEnd(""); }}
                  className="h-8 text-xs"
                  data-testid="button-stats-reset"
                >
                  Reset
                </Button>
                <Button
                  variant="outline" size="sm"
                  onClick={() => refetchStats()}
                  disabled={statsLoading}
                  className="h-8 text-xs"
                  data-testid="button-stats-refresh"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${statsLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-2">
            {statsLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {[1,2,3,4].map(i => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
              </div>
            ) : stats ? (
              <>
                {/* KPI row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                  {[
                    { label: "Total Revenue", value: `KES ${stats.totalRevenue.toLocaleString()}`, testId: "kpi-total-revenue" },
                    { label: "Paid Transactions", value: stats.revenueByType.reduce((s, r) => s + r.count, 0), testId: "kpi-paid-count" },
                    {
                      label: "Avg Transaction",
                      value: stats.revenueByType.reduce((s, r) => s + r.count, 0) > 0
                        ? `KES ${Math.round(stats.totalRevenue / stats.revenueByType.reduce((s, r) => s + r.count, 0)).toLocaleString()}`
                        : "—",
                      testId: "kpi-avg-txn",
                    },
                    {
                      label: "Success Rate",
                      value: (() => {
                        const total = stats.statusBreakdown.reduce((s, r) => s + r.count, 0);
                        const paid  = stats.statusBreakdown.filter(r => r.status === "completed" || r.status === "success").reduce((s, r) => s + r.count, 0);
                        return total > 0 ? `${Math.round((paid / total) * 100)}%` : "—";
                      })(),
                      testId: "kpi-success-rate",
                    },
                  ].map(({ label, value, testId }) => (
                    <div key={label} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                      <p className="text-lg font-bold mt-0.5" data-testid={testId}>{value}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Revenue by type — bar chart */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Revenue by Service Type</p>
                    {stats.revenueByType.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-8">No data</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={stats.revenueByType} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                          <XAxis dataKey="type" tickFormatter={t => typeLabels[t] ?? t} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                          <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={36} />
                          <Tooltip
                            formatter={(v: number) => [`KES ${v.toLocaleString()}`, "Revenue"]}
                            labelFormatter={l => typeLabels[l as string] ?? l}
                            contentStyle={{ fontSize: 11 }}
                          />
                          <Bar dataKey="total" fill="hsl(221 83% 53%)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  {/* Revenue over time — area chart (last 30 days) */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Revenue — Last 30 Days</p>
                    {stats.revenueByDay.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-8">No completed payments in the last 30 days</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={180}>
                        <AreaChart data={stats.revenueByDay} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor="hsl(221 83% 53%)" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="hsl(221 83% 53%)" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                          <XAxis
                            dataKey="date"
                            tickFormatter={d => d.slice(5)} // show MM-DD
                            tick={{ fontSize: 10 }}
                            tickLine={false}
                            axisLine={false}
                            interval="preserveStartEnd"
                          />
                          <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={36} />
                          <Tooltip
                            formatter={(v: number) => [`KES ${v.toLocaleString()}`, "Revenue"]}
                            contentStyle={{ fontSize: 11 }}
                          />
                          <Area
                            type="monotone"
                            dataKey="total"
                            stroke="hsl(221 83% 53%)"
                            strokeWidth={2}
                            fill="url(#revenueGrad)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Status breakdown table */}
                {stats.statusBreakdown.length > 0 && (
                  <div className="mt-5 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Status Breakdown (all time)</p>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                      {stats.statusBreakdown.map(row => (
                        <div key={row.status} className="flex items-center justify-between px-4 py-2.5 text-sm" data-testid={`stats-row-${row.status}`}>
                          <span className={`font-medium capitalize ${statusColors[row.status] ?? "text-gray-700 dark:text-gray-300"}`}>
                            {row.status.replace(/_/g, " ")}
                          </span>
                          <div className="flex items-center gap-4">
                            <span className="text-muted-foreground text-xs">{row.count} txn{row.count !== 1 ? "s" : ""}</span>
                            <span className="font-semibold text-xs">KES {(row.total ?? 0).toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-6">Failed to load stats</p>
            )}
          </CardContent>
        </Card>

        {/* Live Payment Monitor — ghost & stuck detection */}
        {((ghostPayments && ghostPayments.length > 0) || ghostLoading) && (
          <Card className="border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/20">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2 text-orange-800 dark:text-orange-300">
                  <Timer className="h-4 w-4 animate-pulse" />
                  Live Payment Monitor
                  {ghostPayments && ghostPayments.length > 0 && (
                    <span className="ml-1 rounded-full bg-orange-600 text-white text-xs px-2 py-0.5">
                      {ghostPayments.length} stuck
                    </span>
                  )}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Auto-refreshes every 30s</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => refetchGhosts()}
                    data-testid="button-refresh-ghosts"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" /> Refresh
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-orange-600 hover:bg-orange-700 text-white"
                    onClick={() => querySafaricomMutation.mutate()}
                    disabled={querySafaricomMutation.isPending}
                    data-testid="button-query-safaricom-batch"
                  >
                    <Activity className="h-3 w-3 mr-1" />
                    {querySafaricomMutation.isPending ? "Querying..." : "Query Safaricom Now"}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 text-xs"
                    onClick={() => forceTimeoutMutation.mutate()}
                    disabled={forceTimeoutMutation.isPending}
                    data-testid="button-force-timeout-all"
                    title="Move all stuck awaiting_payment M-Pesa records (older than 5 min) to retry_available immediately"
                  >
                    <Timer className="h-3 w-3 mr-1" />
                    {forceTimeoutMutation.isPending ? "Clearing..." : "Force Clear All Stuck"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {ghostLoading ? (
                <p className="text-sm text-muted-foreground">Loading stuck payments…</p>
              ) : ghostPayments && ghostPayments.length > 0 ? (
                <div className="overflow-x-auto rounded border border-orange-200 dark:border-orange-800">
                  <table className="w-full text-xs">
                    <thead className="bg-orange-100 dark:bg-orange-900/30">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">User / Phone</th>
                        <th className="text-left px-3 py-2 font-medium">Amount</th>
                        <th className="text-left px-3 py-2 font-medium">Awaiting Since</th>
                        <th className="text-left px-3 py-2 font-medium">Queries</th>
                        <th className="text-left px-3 py-2 font-medium">Txn Ref</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ghostPayments.map((p: any) => (
                        <tr key={p.id} className="border-t border-orange-200 dark:border-orange-800">
                          <td className="px-3 py-2">
                            <div>{p.userEmail || p.userId}</div>
                            {p.userPhone && <div className="text-muted-foreground font-mono">{p.userPhone}</div>}
                          </td>
                          <td className="px-3 py-2 font-mono text-orange-700 dark:text-orange-300">KES {p.amount?.toLocaleString()}</td>
                          <td className="px-3 py-2 text-muted-foreground">{p.createdAt ? new Date(p.createdAt).toLocaleTimeString("en-KE") : "—"}</td>
                          <td className="px-3 py-2">{p.queryAttempts ?? 0}</td>
                          <td className="px-3 py-2 font-mono text-muted-foreground truncate max-w-[120px]">{p.transactionRef || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        {/* Stuck (retry_available) Payments — STK sent but not completed */}
        {payments && payments.filter(p => p.status === "retry_available").length > 0 && (
          <Card className="border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-950/20">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base flex items-center gap-2 text-yellow-800 dark:text-yellow-300">
                  <AlertTriangle className="h-4 w-4" />
                  Stuck Payments — STK Sent, Awaiting Confirmation
                  <span className="ml-1 rounded-full bg-yellow-600 text-white text-xs px-2 py-0.5">
                    {payments.filter(p => p.status === "retry_available").length}
                  </span>
                </CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">
                    Only grant Pro if you have confirmed payment receipt externally
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-yellow-500 text-yellow-700 hover:bg-yellow-100 dark:border-yellow-600 dark:text-yellow-300 dark:hover:bg-yellow-900/30"
                    onClick={() => setStatusFilter("retry_available")}
                    data-testid="button-filter-retry-available"
                  >
                    <Eye className="h-3 w-3 mr-1" /> View in Table
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-yellow-600 hover:bg-yellow-700 text-white"
                    onClick={() => {
                      if (!confirm(`Grant Pro to ALL ${payments.filter(p => p.status === "retry_available").length} stuck payment users? Only do this after confirming payment receipt.`)) return;
                      activateAllStuckMutation.mutate();
                    }}
                    disabled={activateAllStuckMutation.isPending}
                    data-testid="button-bulk-activate-stuck"
                  >
                    <Zap className="h-3 w-3 mr-1" />
                    {activateAllStuckMutation.isPending ? "Activating..." : "Grant Pro to All"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="overflow-x-auto rounded border border-yellow-200 dark:border-yellow-800">
                <table className="w-full text-xs">
                  <thead className="bg-yellow-100 dark:bg-yellow-900/30">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">User</th>
                      <th className="text-left px-3 py-2 font-medium">Phone</th>
                      <th className="text-left px-3 py-2 font-medium">Amount</th>
                      <th className="text-left px-3 py-2 font-medium">Txn Ref</th>
                      <th className="text-left px-3 py-2 font-medium">M-Pesa Receipt</th>
                      <th className="text-left px-3 py-2 font-medium">Date</th>
                      <th className="text-left px-3 py-2 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.filter(p => p.status === "retry_available").map((p: any) => {
                      const phone = parsePhone(p);
                      return (
                        <tr key={p.id} className="border-t border-yellow-200 dark:border-yellow-800">
                          <td className="px-3 py-2">
                            <div className="font-medium">{p.userName || p.userEmail || p.userId}</div>
                            {p.userEmail && p.userName && <div className="text-muted-foreground">{p.userEmail}</div>}
                          </td>
                          <td className="px-3 py-2 font-mono">{phone || (p.userPhone ? `+${String(p.userPhone).replace(/^\+/, "").replace(/^0/, "254")}` : "—")}</td>
                          <td className="px-3 py-2 font-mono text-yellow-700 dark:text-yellow-300 font-semibold">KES {p.amount?.toLocaleString()}</td>
                          <td className="px-3 py-2 font-mono text-muted-foreground truncate max-w-[110px]" title={p.transactionRef || ""}>{p.transactionRef || "—"}</td>
                          <td className="px-3 py-2 font-mono">{p.mpesaReceiptNumber || <span className="text-muted-foreground">Not received</span>}</td>
                          <td className="px-3 py-2 text-muted-foreground">{p.createdAt ? new Date(p.createdAt).toLocaleString("en-KE", { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                                disabled={querySafaricomSingleMutation.isPending}
                                onClick={() => querySafaricomSingleMutation.mutate(p.id)}
                                data-testid={`button-query-safaricom-${p.id}`}
                                title="Ask Safaricom if this payment was completed — auto-activates Pro if confirmed"
                              >
                                <Activity className="h-3 w-3 mr-1" />
                                {querySafaricomSingleMutation.isPending ? "..." : "Verify"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-yellow-500 text-yellow-700 hover:bg-yellow-100 dark:border-yellow-600 dark:text-yellow-300 dark:hover:bg-yellow-900/30"
                                disabled={activateSingleStuckMutation.isPending}
                                onClick={() => {
                                  if (!confirm(`Grant Pro to ${p.userName || p.userEmail || p.userId}? Only do this after confirming M-Pesa receipt.`)) return;
                                  activateSingleStuckMutation.mutate({ paymentId: p.id, note: "Manual activation by admin — STK stuck payment" });
                                }}
                                data-testid={`button-grant-pro-${p.id}`}
                              >
                                <UserCheck className="h-3 w-3 mr-1" />
                                Grant
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Locked Payment Users */}
        {lockedUsers && lockedUsers.length > 0 && (
          <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-base flex items-center gap-2 text-red-800 dark:text-red-300">
                <Lock className="h-4 w-4" />
                Payment-Locked Users
                <span className="ml-1 rounded-full bg-red-600 text-white text-xs px-2 py-0.5">
                  {lockedUsers.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2">
                {lockedUsers.map((u: any) => (
                  <div key={u.userId} className="flex items-center justify-between rounded-md border border-red-200 dark:border-red-800 bg-white dark:bg-black/20 px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium">{u.email || u.userId}</span>
                      <span className="ml-2 text-xs text-muted-foreground">Locked until {u.lockedUntil ? new Date(u.lockedUntil).toLocaleTimeString("en-KE") : "?"}</span>
                      {u.failureCount && <span className="ml-2 text-xs text-red-600">{u.failureCount} failures</span>}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-red-300 dark:border-red-700"
                      onClick={() => unlockUserMutation.mutate(u.userId)}
                      disabled={unlockUserMutation.isPending}
                      data-testid={`button-unlock-user-${u.userId}`}
                    >
                      <Unlock className="h-3 w-3 mr-1" /> Unlock
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* M-Pesa Live Connection Status */}
        <Card className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20">
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-base flex items-center gap-2 text-green-800 dark:text-green-300">
              <Smartphone className="h-4 w-4" />
              M-Pesa Integration (Safaricom Daraja)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Environment</p>
                <Badge variant="outline" className="text-xs font-mono bg-white dark:bg-gray-900">
                  PRODUCTION
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Shortcode</p>
                <p className="font-mono font-semibold text-green-800 dark:text-green-300">4153025</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Amount</p>
                <p className="font-semibold">KES 4,500</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Flow</p>
                <p className="text-xs">STK Push → PIN → Callback</p>
              </div>
            </div>

            {mpesaTestResult && (
              <div className={`rounded-lg p-3 text-sm flex items-start gap-2 ${
                mpesaTestResult.success
                  ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-700"
                  : "bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-700"
              }`} data-testid="text-mpesa-test-result">
                {mpesaTestResult.success
                  ? <Wifi className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  : <WifiOff className="h-4 w-4 flex-shrink-0 mt-0.5" />
                }
                <div>
                  <p className="font-semibold">{mpesaTestResult.success ? "Connected" : "Connection Failed"}</p>
                  <p className="text-xs mt-0.5 break-all">{mpesaTestResult.message}</p>
                  <p className="text-xs mt-0.5 opacity-70">{mpesaTestResult.environment}</p>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending}
                className="bg-white dark:bg-gray-900"
                data-testid="button-test-mpesa"
              >
                {testMutation.isPending ? (
                  <RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" />
                ) : (
                  <Wifi className="h-3.5 w-3.5 mr-2" />
                )}
                {testMutation.isPending ? "Testing..." : "Test OAuth Connection"}
              </Button>
            </div>

            {/* Live STK Push Test */}
            <div className="border-t pt-3 mt-1">
              <p className="text-xs font-medium text-green-800 dark:text-green-300 mb-2">Test Real STK Push</p>
              <div className="flex gap-2">
                <Input
                  placeholder="+254 7XX XXX XXX"
                  value={stkTestPhone}
                  onChange={e => setStkTestPhone(e.target.value)}
                  className="h-8 text-sm bg-white dark:bg-gray-900 flex-1"
                  data-testid="input-stk-test-phone"
                />
                <Button
                  size="sm"
                  onClick={() => stkTestMutation.mutate()}
                  disabled={stkTestMutation.isPending || !stkTestPhone.trim()}
                  className="bg-green-600 hover:bg-green-700 text-white h-8 px-3"
                  data-testid="button-test-stk-push"
                >
                  {stkTestMutation.isPending ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Sends a KES 1 test prompt to verify STK Push is working end-to-end.</p>

              {stkTestResult && (
                <div className={`mt-2 rounded-lg p-3 text-xs flex items-start gap-2 ${
                  stkTestResult.success
                    ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border border-green-200"
                    : "bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 border border-red-200"
                }`} data-testid="text-stk-test-result">
                  {stkTestResult.success
                    ? <Wifi className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                    : <WifiOff className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                  }
                  <div className="min-w-0 space-y-1">
                    <p className="font-semibold">{stkTestResult.success ? "STK Push Delivered" : "STK Push Failed"}</p>
                    {stkTestResult.data?.ResponseDescription && (
                      <p className="break-all">{stkTestResult.data.ResponseDescription}</p>
                    )}
                    {stkTestResult.safaricomError && (
                      <p className="break-all">
                        <span className="font-medium">{stkTestResult.safaricomError.errorCode}</span>
                        {" — "}
                        {stkTestResult.safaricomError.errorMessage}
                      </p>
                    )}
                    {stkTestResult.callbackUrl && !stkTestResult.success && (
                      <p className="break-all text-yellow-700 dark:text-yellow-400">
                        <span className="font-medium">Callback URL:</span> {stkTestResult.callbackUrl}
                        {!stkTestResult.callbackUrl.includes("workabroadhub.tech") && (
                          <span className="ml-1">(⚠ Set APP_URL=https://workabroadhub.tech in secrets)</span>
                        )}
                      </p>
                    )}
                    {isCircuitOpen && (
                      <button
                        onClick={() => resetCircuitMutation.mutate()}
                        disabled={resetCircuitMutation.isPending}
                        className="mt-2 inline-flex items-center gap-1.5 rounded bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3 py-1.5 transition-colors disabled:opacity-60"
                        data-testid="button-reset-circuit"
                      >
                        <RefreshCw className={`h-3 w-3 ${resetCircuitMutation.isPending ? "animate-spin" : ""}`} />
                        {resetCircuitMutation.isPending ? "Resetting…" : "Reset Circuit Breaker"}
                      </button>
                    )}
                    {stkTestResult.hint && (
                      <p className="mt-1 font-medium flex items-start gap-1 text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                        {stkTestResult.hint}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* PayPal Live Integration Status */}
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20">
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-base flex items-center gap-2 text-blue-800 dark:text-blue-300">
              <span className="font-bold text-sm">PAY<span className="text-blue-400">PAL</span></span>
              PayPal Integration (International Payments)
            </CardTitle>
            <CardDescription className="text-xs mt-0.5 text-blue-700/70 dark:text-blue-400/70">
              Shown automatically to users outside Kenya. Accepts cards and PayPal balance in USD.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Environment</p>
                <Badge variant="outline" className="text-xs font-mono bg-white dark:bg-gray-900 text-blue-700 border-blue-300">
                  LIVE
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Currency</p>
                <p className="font-semibold text-blue-800 dark:text-blue-300">USD</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">KES Rate</p>
                <p className="font-semibold">KES 130 = $1</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Flow</p>
                <p className="text-xs">Smart Buttons → Approve → Capture</p>
              </div>
            </div>
            <div className="rounded-lg p-3 text-xs flex items-start gap-2 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-700">
              <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-blue-600" />
              <div>
                <p className="font-semibold">PayPal Live Connected</p>
                <p className="mt-0.5">Geo-routing active — Kenya users see M-Pesa only; international users see PayPal with M-Pesa as fallback.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* M-Pesa Token & Reconciler Debug Panel */}
        {(() => {
          const ts = tokenStatus?.token;
          const rec = tokenStatus?.reconciler;
          const statusIcon = ts?.status === "valid"
            ? <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
            : ts?.status === "expiring_soon"
            ? <ShieldAlert className="h-4 w-4 text-orange-500" />
            : ts?.status === "error" || ts?.status === "expired"
            ? <ShieldOff className="h-4 w-4 text-red-500" />
            : <ShieldOff className="h-4 w-4 text-gray-400" />;

          const statusBadge = {
            valid: "bg-green-50 text-green-700 border-green-300 dark:bg-green-950/30 dark:text-green-400 dark:border-green-700",
            expiring_soon: "bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-700",
            expired: "bg-red-50 text-red-700 border-red-300 dark:bg-red-950/30 dark:text-red-400 dark:border-red-700",
            error: "bg-red-50 text-red-700 border-red-300 dark:bg-red-950/30 dark:text-red-400 dark:border-red-700",
            not_fetched: "bg-gray-50 text-gray-600 border-gray-300 dark:bg-gray-900/30 dark:text-gray-400",
          }[ts?.status ?? "not_fetched"] ?? "";

          const statusLabel = {
            valid: "Token Valid",
            expiring_soon: "Expiring Soon",
            expired: "Token Expired",
            error: "Token Error",
            not_fetched: "Not Fetched",
          }[ts?.status ?? "not_fetched"] ?? "Unknown";

          const ttlMin = ts ? Math.round(ts.ttlSeconds / 60) : 0;

          return (
            <Card className="border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/20" data-testid="card-token-debug">
              <CardHeader className="pb-3 pt-4 px-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base flex items-center gap-2 text-slate-700 dark:text-slate-300">
                    <KeyRound className="h-4 w-4" />
                    M-Pesa API Debug
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {tokenLoading ? (
                      <Badge variant="outline" className="text-xs gap-1 text-slate-500"><RefreshCw className="h-3 w-3 animate-spin" /> Loading…</Badge>
                    ) : (
                      <Badge variant="outline" className={`text-xs gap-1 ${statusBadge}`}>
                        {statusIcon} {statusLabel}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs font-mono">
                      {tokenStatus?.environment === "sandbox" ? "Sandbox" : "Production"}
                    </Badge>
                  </div>
                </div>
                <CardDescription className="text-xs mt-0.5 text-slate-600/70 dark:text-slate-400/70">
                  OAuth token cache status, credentials check, and reconciler health.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">TTL</p>
                    <p className="font-semibold" data-testid="text-token-ttl">
                      {ts ? (ttlMin > 0 ? `${ttlMin}m ${ts.ttlSeconds % 60}s` : "Expired") : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Shortcode</p>
                    <p className="font-mono font-semibold text-slate-700 dark:text-slate-300" data-testid="text-shortcode">
                      {tokenStatus?.shortcode || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Credentials</p>
                    <p className="font-semibold" data-testid="text-creds-status">
                      {tokenStatus?.credentialsConfigured
                        ? <span className="text-green-600 dark:text-green-400">Configured ✓</span>
                        : <span className="text-red-500">Missing ✗</span>}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Obtained At</p>
                    <p className="text-xs" data-testid="text-token-obtained">
                      {ts?.obtainedAt ? new Date(ts.obtainedAt).toLocaleTimeString("en-KE") : "Never"}
                    </p>
                  </div>
                </div>

                {ts?.lastError && (
                  <div className="rounded-lg p-3 text-xs bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-700 flex items-start gap-2" data-testid="text-token-error">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-red-700 dark:text-red-400">Last Token Error</p>
                      <p className="mt-0.5 text-red-600 dark:text-red-400">{ts.lastError}</p>
                      {ts.lastError.toLowerCase().includes("invalid access token") && (
                        <p className="mt-1 text-red-500 dark:text-red-400 italic">
                          Tip: "Invalid Access Token" from Pull API usually means the Pull Transactions product is not yet activated for this shortcode in Safaricom Daraja. Contact your Daraja support team to enable it for shortcode {tokenStatus?.shortcode}.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {rec && (
                  <div className="rounded-lg border bg-white dark:bg-slate-900/40 p-3">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Reconciler (this session)</p>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">Runs</p>
                        <p className="font-semibold" data-testid="text-rec-runs">{rec.runCount}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Pulled</p>
                        <p className="font-semibold" data-testid="text-rec-pulled">{rec.totalPulled}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Stored</p>
                        <p className="font-semibold" data-testid="text-rec-stored">{rec.totalStored}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Confirmed</p>
                        <p className="font-semibold text-green-600 dark:text-green-400" data-testid="text-rec-confirmed">{rec.totalReconciled}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Last Run</p>
                        <p data-testid="text-rec-last-run">{rec.lastRunAt ? new Date(rec.lastRunAt).toLocaleTimeString("en-KE") : "Never"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Status</p>
                        <p data-testid="text-rec-status">{rec.isRunning ? "Running…" : rec.lastError ? <span className="text-orange-500">Error</span> : rec.lastSuccessAt ? <span className="text-green-600">OK</span> : "Idle"}</p>
                      </div>
                    </div>
                    {rec.lastError && (
                      <p className="mt-2 text-xs text-orange-600 dark:text-orange-400 flex items-start gap-1.5" data-testid="text-rec-error">
                        <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                        {rec.lastError}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => forceRefreshMutation.mutate()}
                    disabled={forceRefreshMutation.isPending}
                    className="bg-white dark:bg-gray-900 h-8 text-xs"
                    data-testid="button-force-token-refresh"
                  >
                    {forceRefreshMutation.isPending
                      ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      : <KeyRound className="h-3.5 w-3.5 mr-1.5" />}
                    {forceRefreshMutation.isPending ? "Refreshing…" : "Force Token Refresh"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { refetchToken(); }}
                    disabled={tokenLoading}
                    className="h-8 text-xs"
                    data-testid="button-refresh-token-status"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${tokenLoading ? "animate-spin" : ""}`} />
                    Refresh Status
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* Pull API Auto-Reconciliation */}
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20">
          <CardHeader className="pb-3 pt-4 px-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2 text-blue-800 dark:text-blue-300">
                  <DatabaseZap className="h-4 w-4" />
                  Pull API Auto-Reconciliation
                </CardTitle>
                <CardDescription className="text-xs mt-0.5 text-blue-700/70 dark:text-blue-400/70">
                  Automatically confirms manual PayBill payments by pulling transactions from Safaricom every 5 minutes.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {pullData?.config?.registered_at ? (
                  <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300 dark:bg-green-950/30 dark:text-green-400 dark:border-green-700 gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Registered
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-700 gap-1">
                    <Info className="h-3 w-3" /> Not Registered
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {/* Config status */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Shortcode</p>
                <p className="font-mono font-semibold text-blue-800 dark:text-blue-300">4153025</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Last Pull</p>
                <p className="text-xs">{pullData?.config?.last_pull_at ? new Date(pullData.config.last_pull_at).toLocaleTimeString("en-KE") : "Never"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Transactions Pulled</p>
                <p className="font-semibold text-blue-800 dark:text-blue-300">{pullData?.transactions?.length ?? 0}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Auto-Reconciled</p>
                <p className="font-semibold text-green-700 dark:text-green-400">
                  {pullData?.transactions?.filter(t => t.reconciled).length ?? 0}
                </p>
              </div>
            </div>

            {/* Last reconcile result */}
            {reconcileResult && (
              <div className={`rounded-lg p-3 text-xs flex items-start gap-2 ${
                reconcileResult.errors?.length
                  ? "bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-700 text-orange-800 dark:text-orange-300"
                  : "bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-700 text-green-800 dark:text-green-300"
              }`} data-testid="text-reconcile-result">
                <Zap className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">
                    Pulled {reconcileResult.pulled} · Stored {reconcileResult.stored} · Reconciled {reconcileResult.reconciled}
                  </p>
                  {reconcileResult.errors?.length > 0 && (
                    <p className="mt-0.5">{reconcileResult.errors[0]}</p>
                  )}
                </div>
              </div>
            )}

            {/* Register result */}
            {registerResult && (
              <div className={`rounded-lg p-3 text-xs ${
                registerResult.success
                  ? "bg-green-50 dark:bg-green-950/20 border border-green-200 text-green-800 dark:text-green-300"
                  : "bg-red-50 dark:bg-red-950/20 border border-red-200 text-red-800 dark:text-red-300"
              }`} data-testid="text-register-result">
                {registerResult.success
                  ? <p>✓ Registered callback: <span className="font-mono break-all">{registerResult.callbackUrl}</span></p>
                  : <p>✗ {registerResult.message}</p>
                }
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => registerPullMutation.mutate()}
                disabled={registerPullMutation.isPending}
                className="bg-white dark:bg-gray-900 h-8 text-xs"
                data-testid="button-register-pull-url"
              >
                {registerPullMutation.isPending ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5 mr-1.5" />}
                {registerPullMutation.isPending ? "Registering…" : "Register Pull URL"}
              </Button>
              <Button
                size="sm"
                onClick={() => reconcileMutation.mutate()}
                disabled={reconcileMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white h-8 text-xs"
                data-testid="button-run-reconcile"
              >
                {reconcileMutation.isPending ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 mr-1.5" />}
                {reconcileMutation.isPending ? "Running…" : "Run Reconciliation Now"}
              </Button>
              <Button
                size="sm"
                onClick={() => stkReconcileMutation.mutate()}
                disabled={stkReconcileMutation.isPending}
                className="bg-green-600 hover:bg-green-700 text-white h-8 text-xs"
                data-testid="button-stk-reconcile"
                title="Query Safaricom STK status for all stuck M-Pesa payments"
              >
                {stkReconcileMutation.isPending ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 mr-1.5" />}
                {stkReconcileMutation.isPending ? "Querying Safaricom…" : "STK Reconcile (Fix Stuck)"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => refetchPull()}
                disabled={pullLoading}
                className="h-8 text-xs"
                data-testid="button-refresh-pull"
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${pullLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            {/* Transactions table */}
            {(pullData?.transactions?.length ?? 0) > 0 && (
              <div className="border rounded-lg overflow-hidden mt-2">
                <div className="overflow-x-auto max-h-64">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-blue-100 dark:bg-blue-900/40 border-b">
                        <th className="text-left px-3 py-2 font-medium">Trans ID</th>
                        <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Bill Ref</th>
                        <th className="text-right px-3 py-2 font-medium">Amount</th>
                        <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Phone</th>
                        <th className="text-left px-3 py-2 font-medium">Status</th>
                        <th className="text-left px-3 py-2 font-medium hidden lg:table-cell">Order</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pullData?.transactions?.map((tx: any) => (
                        <tr key={tx.id} className="border-b last:border-0 hover:bg-blue-50/50 dark:hover:bg-blue-900/20" data-testid={`row-pull-tx-${tx.id}`}>
                          <td className="px-3 py-2 font-mono">{tx.transaction_id}</td>
                          <td className="px-3 py-2 hidden sm:table-cell font-mono text-blue-700 dark:text-blue-400">{tx.bill_ref_number || "—"}</td>
                          <td className="px-3 py-2 text-right font-medium">KES {(tx.trans_amount || 0).toLocaleString()}</td>
                          <td className="px-3 py-2 hidden md:table-cell font-mono">{tx.msisdn ? `${tx.msisdn.slice(0, 6)}****` : "—"}</td>
                          <td className="px-3 py-2">
                            {tx.reconciled ? (
                              <Badge variant="outline" className="text-xs gap-1 bg-green-50 text-green-700 border-green-300 dark:bg-green-950/30 dark:text-green-400">
                                <CheckCircle2 className="h-2.5 w-2.5" /> Matched
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs gap-1 bg-gray-50 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-400">
                                <Clock className="h-2.5 w-2.5" /> Pending
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-2 hidden lg:table-cell font-mono text-xs text-muted-foreground">
                            {tx.reconciled_order_id ? tx.reconciled_order_id.substring(0, 8).toUpperCase() : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment summary cards */}
        {payments && payments.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/20 cursor-pointer hover:bg-green-100 dark:hover:bg-green-950/30 transition-colors"
              onClick={() => setStatusFilter("success")}>
              <CardContent className="pt-3 pb-3 text-center">
                <p className="text-2xl font-bold text-green-700 dark:text-green-400">{paymentSummary.confirmed}</p>
                <p className="text-xs text-green-600 dark:text-green-400 font-medium">Confirmed</p>
                <p className="text-xs text-green-500 dark:text-green-500 font-mono">KES {paymentSummary.confirmedKes.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className="border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/20 cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-950/30 transition-colors"
              onClick={() => setStatusFilter("retry_available")}>
              <CardContent className="pt-3 pb-3 text-center">
                <p className="text-2xl font-bold text-orange-700 dark:text-orange-400">{paymentSummary.stuck}</p>
                <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">Stuck (STK sent)</p>
                <p className="text-xs text-orange-500 font-mono">KES {paymentSummary.stuckKes.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className="border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/20 cursor-pointer hover:bg-red-100 dark:hover:bg-red-950/30 transition-colors"
              onClick={() => setStatusFilter("failed")}>
              <CardContent className="pt-3 pb-3 text-center">
                <p className="text-2xl font-bold text-red-700 dark:text-red-400">{paymentSummary.failed}</p>
                <p className="text-xs text-red-600 dark:text-red-400 font-medium">Failed (STK rejected)</p>
                <p className="text-xs text-red-500 font-mono">KES {paymentSummary.failedKes.toLocaleString()}</p>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search email, phone, ref…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 w-[200px] text-sm"
                data-testid="input-search-payments"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]" data-testid="select-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="success">✅ Success</SelectItem>
                <SelectItem value="completed">✅ Completed</SelectItem>
                <SelectItem value="retry_available">⚠️ Stuck (STK Sent)</SelectItem>
                <SelectItem value="pending">⏳ Pending</SelectItem>
                <SelectItem value="awaiting_payment">⏳ Awaiting Payment</SelectItem>
                <SelectItem value="failed">❌ Failed</SelectItem>
                <SelectItem value="refund_pending">↩️ Refund Pending</SelectItem>
              </SelectContent>
            </Select>
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="w-[130px]" data-testid="select-method-filter">
                <SelectValue placeholder="Method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                <SelectItem value="mpesa">M-Pesa 🇰🇪</SelectItem>
                <SelectItem value="paypal">PayPal 🌍</SelectItem>
                <SelectItem value="card">Card</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={handleExportCSV} data-testid="button-export-csv">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {filteredPayments?.length || 0} payments
          </span>
          <span className="font-medium" data-testid="text-total-revenue">
            Total Revenue: KES {totalRevenue.toLocaleString()}
          </span>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                    <Skeleton className="h-6 w-20" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-4 font-medium text-sm">Receipt / Ref</th>
                      <th className="text-left p-4 font-medium text-sm hidden lg:table-cell">User</th>
                      <th className="text-left p-4 font-medium text-sm hidden sm:table-cell">Phone</th>
                      <th className="text-left p-4 font-medium text-sm hidden md:table-cell">For</th>
                      <th className="text-left p-4 font-medium text-sm">Method</th>
                      <th className="text-right p-4 font-medium text-sm">Amount</th>
                      <th className="text-left p-4 font-medium text-sm">Status</th>
                      <th className="text-left p-4 font-medium text-sm hidden md:table-cell">Date</th>
                      <th className="text-right p-4 font-medium text-sm">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayments?.map((payment) => {
                      const phone = parsePhone(payment);
                      const receipt = (payment as any).mpesaReceiptNumber || payment.transactionRef;
                      return (
                        <tr
                          key={payment.id}
                          className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                          data-testid={`row-payment-${payment.id}`}
                        >
                          <td className="p-4">
                            {receipt ? (
                              <span className="font-mono text-sm text-green-700 dark:text-green-400">{receipt}</span>
                            ) : (
                              <span className="font-mono text-xs text-muted-foreground">#{payment.id.slice(0, 8)}</span>
                            )}
                          </td>
                          <td className="p-4 hidden lg:table-cell text-sm max-w-[180px]">
                            {(() => {
                              const p = payment as any;
                              const email = p.userEmail;
                              const name = p.userName;
                              return (
                                <div>
                                  {email ? (
                                    <p className="font-medium text-sm leading-tight truncate">{email}</p>
                                  ) : (
                                    <p className="text-muted-foreground text-xs font-mono truncate">{payment.userId.slice(0, 12)}…</p>
                                  )}
                                  {name && <p className="text-xs text-muted-foreground leading-tight">{name}</p>}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="p-4 hidden sm:table-cell font-mono text-sm">
                            {(() => {
                              const p = payment as any;
                              const displayPhone = p.userPhone || phone;
                              return displayPhone
                                ? <span>{displayPhone}</span>
                                : <span className="text-muted-foreground text-xs">—</span>;
                            })()}
                          </td>
                          <td className="p-4 hidden md:table-cell text-sm max-w-[150px]">
                            {(() => {
                              const label = (payment as any).serviceLabel;
                              if (label) {
                                return (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 text-xs font-medium border border-indigo-200 dark:border-indigo-700 truncate max-w-[140px]" title={label}>
                                    {label}
                                  </span>
                                );
                              }
                              return <span className="text-muted-foreground text-xs">—</span>;
                            })()}
                          </td>
                          <td className="p-4">
                            {payment.method === "mpesa" ? (
                              <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300 dark:bg-green-950/30 dark:text-green-400 dark:border-green-700">
                                M-Pesa 🇰🇪
                              </Badge>
                            ) : payment.method === "paypal" ? (
                              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-700">
                                PayPal 🌍
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">
                                {payment.method.toUpperCase()}
                              </Badge>
                            )}
                          </td>
                          <td className="p-4 text-right font-semibold">
                            {payment.method === "paypal"
                              ? `$${(payment.amount / 130).toFixed(2)} USD`
                              : `KES ${payment.amount.toLocaleString()}`
                            }
                          </td>
                          <td className="p-4">
                            {(() => {
                              const p = payment as any;
                              const failRaw: string = p.fraudReason || p.failReason || "";
                              const failDisplay = failRaw
                                .replace(/:/g, ": ")
                                .replace(/,/g, " | ")
                                .replace(/_/g, " ");
                              const isCancelled = failRaw.includes("cancelled_by_user");
                              const isStuck = payment.status === "retry_available";
                              const isSuspiciousFailed = payment.status === "failed" || p.isSuspicious;

                              return (
                                <div className="flex flex-col gap-0.5">
                                  {isStuck ? (
                                    <Badge className="gap-1 text-xs w-fit bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700">
                                      <AlertTriangle className="h-3 w-3" />
                                      {isCancelled ? "Cancelled by User" : "Not Completed"}
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant={getStatusVariant(payment.status)}
                                      className="gap-1 text-xs w-fit"
                                      title={failRaw || undefined}
                                    >
                                      {getStatusIcon(payment.status)}
                                      {payment.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                                    </Badge>
                                  )}
                                  {/* Show failure reason under the badge for any non-completed payment */}
                                  {(isStuck || isSuspiciousFailed) && failRaw && (
                                    <span
                                      className="text-xs text-red-600 dark:text-red-400 font-mono truncate max-w-[200px] cursor-help"
                                      title={failRaw}
                                      data-testid={`text-fail-reason-${payment.id}`}
                                    >
                                      {failDisplay.slice(0, 80)}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="p-4 hidden md:table-cell text-sm text-muted-foreground">
                            {formatDate(payment.createdAt)}
                          </td>
                          <td className="p-4 text-right">
                            {(payment.status === "success" || payment.status === "completed") && (
                              <Button
                                data-testid={`button-repair-${payment.id}`}
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-orange-400 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/30"
                                disabled={activatePaymentMutation.isPending}
                                onClick={() => activatePaymentMutation.mutate({ paymentId: payment.id, force: false })}
                                title="Re-run plan activation for this payment (safe — checks if user already has access first)"
                              >
                                🔧 Repair Access
                              </Button>
                            )}
                            {payment.status === "retry_available" && (
                              <div className="flex items-center gap-1 justify-end">
                                <Button
                                  data-testid={`button-verify-safaricom-table-${payment.id}`}
                                  size="sm"
                                  className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                                  disabled={querySafaricomSingleMutation.isPending}
                                  onClick={() => querySafaricomSingleMutation.mutate(payment.id)}
                                  title="Ask Safaricom if this payment completed — auto-activates Pro if yes"
                                >
                                  <Activity className="h-3 w-3 mr-1" />
                                  Verify
                                </Button>
                                <Button
                                  data-testid={`button-grant-pro-table-${payment.id}`}
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs border-yellow-500 text-yellow-700 hover:bg-yellow-50 dark:border-yellow-600 dark:text-yellow-300 dark:hover:bg-yellow-900/30"
                                  disabled={activateSingleStuckMutation.isPending}
                                  onClick={() => {
                                    if (!confirm(`Grant Pro to this user? Only confirm if you have verified M-Pesa receipt.`)) return;
                                    activateSingleStuckMutation.mutate({ paymentId: payment.id, note: "Manual activation by admin — table row action" });
                                  }}
                                  title="Manually grant Pro access — only use after confirming receipt in Safaricom portal"
                                >
                                  <UserCheck className="h-3 w-3 mr-1" />
                                  Grant
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredPayments?.length === 0 && (
                  <div className="p-12 text-center space-y-3">
                    <CheckCircle2 className="h-10 w-10 mx-auto text-muted-foreground/40" />
                    <p className="text-muted-foreground font-medium">No transactions yet</p>
                    <p className="text-xs text-muted-foreground/70">
                      Real M-Pesa 🇰🇪 and PayPal 🌍 payments will appear here once customers transact.
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        {/* ── Emergency Tools (collapsible) ────────────────────────────── */}
        <div className="border border-red-200 dark:border-red-800 rounded-xl overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-5 py-3 bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/30 transition-colors"
            onClick={() => setShowEmergencyTools(v => !v)}
            data-testid="button-toggle-emergency-tools"
          >
            <div className="flex items-center gap-2 font-semibold text-sm">
              <ShieldAlert className="h-4 w-4" />
              Emergency Tools
              <span className="ml-1 text-xs font-normal text-red-600/70 dark:text-red-400/70">(Manual Access Grant &amp; Failsafe Recovery)</span>
            </div>
            {showEmergencyTools ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showEmergencyTools && (
            <div className="space-y-4 p-4 bg-white dark:bg-background">

        {/* ── Manual Access Grant Tool ─────────────────────────────────── */}
        <Card className="border-orange-200 dark:border-orange-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-orange-500" />
                <CardTitle className="text-base">Manual Access Grant</CardTitle>
              </div>
              <Badge variant="outline" className="text-xs border-orange-300 text-orange-600">Admin Override</Badge>
            </div>
            <CardDescription className="text-xs">
              Use this when a customer paid but their plan wasn't activated automatically (M-Pesa callback missed, STK push timed out, or PayPal dispute resolved).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Grant by User ID */}
            <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
              <p className="text-sm font-semibold flex items-center gap-1.5"><Lock className="h-4 w-4 text-orange-500" /> Grant Plan by User ID</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">User ID</Label>
                  <Input
                    data-testid="input-grant-user-id"
                    placeholder="e.g. 51375746 or uuid..."
                    value={grantUserId}
                    onChange={e => setGrantUserId(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Plan</Label>
                  <Select value={grantPlanId} onValueChange={(v) => setGrantPlanId(v as "pro")}>
                    <SelectTrigger data-testid="select-grant-plan">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pro">Pro — KES 4,500 / year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">M-Pesa Receipt / Transaction Code</Label>
                  <Input
                    data-testid="input-grant-tx-code"
                    placeholder="e.g. NXX1234567"
                    value={grantTxCode}
                    onChange={e => setGrantTxCode(e.target.value)}
                    className="font-mono text-sm uppercase"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Note (optional)</Label>
                  <Input
                    data-testid="input-grant-note"
                    placeholder="e.g. Verified via Safaricom statement"
                    value={grantNote}
                    onChange={e => setGrantNote(e.target.value)}
                    className="text-sm"
                  />
                </div>
              </div>
              <Button
                data-testid="button-grant-plan"
                className="w-full sm:w-auto bg-orange-500 hover:bg-orange-600 text-white"
                disabled={grantPlanMutation.isPending || !grantUserId || !grantTxCode}
                onClick={() => grantPlanMutation.mutate()}
              >
                {grantPlanMutation.isPending ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Activating…</>
                ) : (
                  <><UserCheck className="h-4 w-4 mr-2" /> Activate Plan Now</>
                )}
              </Button>
            </div>

            {/* Pending Manual Verification payments */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-amber-500" />
                  Payments Awaiting Manual Verification
                  {pendingManual && pendingManual.length > 0 && (
                    <Badge className="ml-1 bg-amber-500 text-white text-xs">{pendingManual.length}</Badge>
                  )}
                </p>
                <Button variant="ghost" size="sm" onClick={() => refetchPending()} className="h-7 px-2 text-xs">
                  <RefreshCw className="h-3 w-3 mr-1" /> Refresh
                </Button>
              </div>

              {pendingLoading ? (
                <div className="space-y-2">
                  {[1,2].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : !pendingManual || pendingManual.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm border rounded-lg bg-muted/20">
                  <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-green-500" />
                  No pending payments — all customers have active plans.
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">User</th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground hidden sm:table-cell">Payment ID</th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Amount</th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                        <th className="p-3 text-left text-xs font-medium text-muted-foreground hidden md:table-cell">Tx Code</th>
                        <th className="p-3 text-right text-xs font-medium text-muted-foreground">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingManual.map((p: any) => {
                        let meta: any = {};
                        try { meta = typeof p.metadata === "string" ? JSON.parse(p.metadata) : (p.metadata || {}); } catch {}
                        return (
                          <tr key={p.id} className="border-t hover:bg-muted/30 transition-colors" data-testid={`row-pending-${p.id}`}>
                            <td className="p-3">
                              <div className="font-medium text-xs">{p.userEmail || p.userId}</div>
                              {p.userName && <div className="text-muted-foreground text-xs">{p.userName}</div>}
                            </td>
                            <td className="p-3 hidden sm:table-cell font-mono text-xs text-muted-foreground">{p.id.slice(0, 12)}…</td>
                            <td className="p-3 font-semibold text-xs">KES {(p.amount || 0).toLocaleString()}</td>
                            <td className="p-3">
                              <Badge variant="outline" className="text-xs border-amber-300 text-amber-600 bg-amber-50 dark:bg-amber-950/30">
                                {p.status}
                              </Badge>
                            </td>
                            <td className="p-3 hidden md:table-cell font-mono text-xs">
                              {meta.manualTxCode || p.transactionRef || <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="p-3 text-right">
                              <Button
                                data-testid={`button-activate-${p.id}`}
                                size="sm"
                                className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                                disabled={activatePaymentMutation.isPending}
                                onClick={() => activatePaymentMutation.mutate({ paymentId: p.id })}
                              >
                                <Check className="h-3 w-3 mr-1" /> Activate
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Failsafe Recovery ──────────────────────────────────────────── */}
        <Card className="border-red-200 dark:border-red-800">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <DatabaseZap className="h-5 w-5 text-red-500" />
              <CardTitle className="text-base">Failsafe Payment Recovery</CardTitle>
              <Badge variant="outline" className="text-xs border-red-300 text-red-600 ml-auto">Admin Only</Badge>
            </div>
            <CardDescription className="text-xs mt-1">
              Re-runs the upgrade pipeline for a completed payment that never activated the user's plan. Safe to rerun — the system detects duplicates automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Transaction ID / Receipt</label>
                <Input
                  data-testid="input-rp-transaction-id"
                  placeholder="e.g. QJH1234567 or PayPal txn ID"
                  value={rpTransactionId}
                  onChange={e => setRpTransactionId(e.target.value)}
                  className="font-mono text-sm uppercase"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">User Email</label>
                <Input
                  data-testid="input-rp-email"
                  placeholder="e.g. user@example.com"
                  value={rpEmail}
                  onChange={e => setRpEmail(e.target.value)}
                  className="text-sm"
                  type="email"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Payment ID <span className="text-muted-foreground/60">(optional)</span></label>
                <Input
                  data-testid="input-rp-payment-id"
                  placeholder="UUID from payments table"
                  value={rpPaymentId}
                  onChange={e => setRpPaymentId(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">Override Plan <span className="text-muted-foreground/60">(optional)</span></label>
                <Select value={rpPlanId} onValueChange={v => setRpPlanId(v as "auto" | "pro")}>
                  <SelectTrigger data-testid="select-rp-plan">
                    <SelectValue placeholder="Auto-detect from payment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto-detect from payment</SelectItem>
                    <SelectItem value="pro">Pro — KES 4,500 / year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                id="rp-force"
                data-testid="checkbox-rp-force"
                checked={rpForce}
                onChange={e => setRpForce(e.target.checked)}
                className="accent-red-500"
              />
              <label htmlFor="rp-force" className="text-xs text-muted-foreground cursor-pointer">
                <span className="font-semibold text-red-600">Force upgrade</span> — allow reprocessing even if payment status is not "completed" (use with caution)
              </label>
            </div>

            <Button
              data-testid="button-reprocess-payment"
              onClick={() => reprocessMutation.mutate()}
              disabled={reprocessMutation.isPending || (!rpTransactionId && !rpEmail && !rpPaymentId)}
              className="bg-red-600 hover:bg-red-700 text-white gap-2"
            >
              {reprocessMutation.isPending
                ? <><RefreshCw className="h-4 w-4 animate-spin" /> Reprocessing…</>
                : <><DatabaseZap className="h-4 w-4" /> Reprocess Payment</>}
            </Button>

            {/* Result display */}
            {rpResult && (
              <div className={`rounded-lg border p-4 text-sm space-y-2 ${rpResult.success ? "border-green-300 bg-green-50 dark:bg-green-950/20" : "border-red-300 bg-red-50 dark:bg-red-950/20"}`} data-testid="section-rp-result">
                <div className="flex items-center gap-2 font-semibold">
                  {rpResult.success
                    ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                    : <XCircle className="h-4 w-4 text-red-600" />}
                  <span className={rpResult.success ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>
                    {rpResult.message}
                  </span>
                </div>
                {rpResult.paymentId && (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                    <span>Payment ID:</span><span className="font-mono truncate">{rpResult.paymentId}</span>
                    {rpResult.userId && <><span>User ID:</span><span className="font-mono truncate">{rpResult.userId}</span></>}
                    {rpResult.email && <><span>Email:</span><span className="truncate">{rpResult.email}</span></>}
                    {rpResult.planActivated && <><span>Plan:</span><span className="capitalize font-medium">{rpResult.planActivated}</span></>}
                    {rpResult.transactionRef && <><span>Txn Ref:</span><span className="font-mono truncate">{rpResult.transactionRef}</span></>}
                    <span>Original Status:</span><span className="capitalize">{rpResult.originalStatus}</span>
                    {rpResult.alreadyProcessed && <><span className="col-span-2 text-amber-600 font-medium">ℹ Already processed — no change made.</span><span /></>}
                  </div>
                )}
                <button
                  className="text-xs text-muted-foreground underline mt-1"
                  onClick={() => setRpResult(null)}
                  data-testid="button-clear-rp-result"
                >
                  Clear
                </button>
              </div>
            )}
          </CardContent>
        </Card>

            </div>
          )}
        </div>

        {/* ── Verify Payment by M-Pesa Code ───────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Verify Payment by M-Pesa Code</CardTitle>
            </div>
            <CardDescription className="text-xs mt-1">
              Look up a payment record in Supabase and match it to a user account via their phone number.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                data-testid="input-verify-code"
                placeholder="Enter M-Pesa code e.g. QJH1234567"
                value={code}
                onChange={e => setCode(e.target.value)}
                onKeyDown={e => e.key === "Enter" && verifyPayment()}
                className="font-mono text-sm uppercase flex-1"
              />
              <Button
                data-testid="button-verify-payment"
                onClick={verifyPayment}
                disabled={verifying || !code.trim()}
                className="gap-1.5 shrink-0"
              >
                {verifying ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {verifying ? "Checking…" : "Verify"}
              </Button>
            </div>

            {result?.found && (
              <div className="mt-4 p-3 border" data-testid="section-verify-result">
                <p>Phone: {result.payment.phone}</p>
                <p>Amount: {result.payment.amount}</p>
                <p>Date: {result.payment.created_at}</p>

                {result.user ? (
                  <p>User Email: {result.user.email}</p>
                ) : (
                  <p>No user linked</p>
                )}

                <button
                  onClick={() => upgradeUser(result.payment.phone)}
                  data-testid="button-upgrade-user"
                >
                  Upgrade User
                </button>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </AdminLayout>
  );
}
