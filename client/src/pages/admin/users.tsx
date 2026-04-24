import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import AdminLayout from "@/components/admin-layout";
import {
  Search, Settings, Check, X, Copy, CheckCheck,
  Crown, Zap, UserCheck, ShieldCheck, ShieldOff, AlertTriangle,
  Loader2, RefreshCw, ChevronLeft, ChevronRight, Users,
  History, CreditCard, CheckCircle, Clock, XCircle,
  Monitor, Wifi, ChevronDown, ChevronUp, Mail, Phone,
} from "lucide-react";

/* ─── Types ────────────────────────────────────────────────────────────────── */
interface User {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: string | null;
  plan: string | null;
  planDisplay: string | null;
  isActive: boolean;
  isAdmin: boolean;
  hasActiveSubscription: boolean;
  createdAt: string;
  lastActive: string | null;
}

interface PagedUsers {
  users: User[];
  totalUsers: number;
  totalPages: number;
  currentPage: number;
}

interface AdminStats {
  totalUsers: number;
  planBreakdown: { free: number; basic: number; pro: number };
  missingPhone: number;
  signupStats: { today: number; thisWeek: number; thisMonth: number };
}

interface StuckPayment {
  paymentId: string;
  userId: string;
  amount: number;
  currency: string;
  transactionRef: string | null;
  createdAt: string;
  userEmail: string | null;
  userName: string | null;
  userPhone: string | null;
  currentPlan: string;
}

interface GrantResult {
  success: boolean;
  message: string;
  accountCreated?: boolean;
  user: { id: string; email: string | null; phone: string | null; name: string; plan: string; expiresAt: string };
}

interface ActiveSessionRow {
  user_id: string;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  plan: string | null;
  session_id: string;
  current_page: string | null;
  last_seen: string;
}

/* ─── Helpers ───────────────────────────────────────────────────────────────── */
function planBadge(plan: string | null | undefined) {
  const p = (plan || "free").toLowerCase();
  if (p === "pro") return (
    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-700 gap-1 text-xs">
      <Crown className="h-3 w-3" /> Pro
    </Badge>
  );
  if (p === "basic") return (
    <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-700 gap-1 text-xs">
      <Zap className="h-3 w-3" /> Basic
    </Badge>
  );
  return (
    <Badge variant="outline" className="text-muted-foreground gap-1 text-xs">
      <UserCheck className="h-3 w-3" /> Free
    </Badge>
  );
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

/* ─── Pagination component ──────────────────────────────────────────────────── */
function Pagination({
  page,
  totalPages,
  totalUsers,
  perPage,
  count,
  isLoading,
  onPage,
}: {
  page: number;
  totalPages: number;
  totalUsers: number;
  perPage: number;
  count: number;
  isLoading: boolean;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  // Build page number window (max 5 pills)
  const window = 5;
  let start = Math.max(1, page - Math.floor(window / 2));
  const end = Math.min(totalPages, start + window - 1);
  if (end - start + 1 < window) start = Math.max(1, end - window + 1);
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, totalUsers);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t">
      <p className="text-xs text-muted-foreground order-2 sm:order-1">
        {isLoading ? "Loading…" : `Showing ${from}–${to} of ${totalUsers.toLocaleString()} users`}
      </p>
      <div className="flex items-center gap-1 order-1 sm:order-2">
        {/* Previous */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPage(page - 1)}
          disabled={page === 1 || isLoading}
          data-testid="button-prev-page"
          className="h-8 px-3 gap-1"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Prev</span>
        </Button>

        {/* First page + ellipsis */}
        {start > 1 && (
          <>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0 text-xs" onClick={() => onPage(1)} disabled={isLoading} data-testid="button-page-1">1</Button>
            {start > 2 && <span className="text-xs text-muted-foreground px-1">…</span>}
          </>
        )}

        {/* Page pills */}
        {pages.map(p => (
          <Button
            key={p}
            variant={p === page ? "default" : "outline"}
            size="sm"
            onClick={() => onPage(p)}
            disabled={isLoading}
            className="h-8 w-8 p-0 text-xs"
            data-testid={`button-page-${p}`}
          >
            {p}
          </Button>
        ))}

        {/* Last page + ellipsis */}
        {end < totalPages && (
          <>
            {end < totalPages - 1 && <span className="text-xs text-muted-foreground px-1">…</span>}
            <Button variant="outline" size="sm" className="h-8 w-8 p-0 text-xs" onClick={() => onPage(totalPages)} disabled={isLoading} data-testid={`button-page-${totalPages}`}>{totalPages}</Button>
          </>
        )}

        {/* Next */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPage(page + 1)}
          disabled={page === totalPages || isLoading}
          data-testid="button-next-page"
          className="h-8 px-3 gap-1"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/* ─── Main page ─────────────────────────────────────────────────────────────── */
export default function UsersPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editRole, setEditRole] = useState("USER");
  const [editStatus, setEditStatus] = useState("active");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Payment history viewer
  const [viewPaymentsUser, setViewPaymentsUser] = useState<User | null>(null);

  // Manual grant
  const [grantIdentifier, setGrantIdentifier] = useState("");
  const [grantPlan, setGrantPlan] = useState<"pro">("pro");
  const [grantReceipt, setGrantReceipt] = useState("");
  const [grantNote, setGrantNote] = useState("");
  const [grantResult, setGrantResult] = useState<GrantResult | null>(null);
  const [grantNotFound, setGrantNotFound] = useState(false);

  // Pro subscriber dropdown
  const [proDropdownOpen, setProDropdownOpen] = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [planFilter, statusFilter]);

  const params = new URLSearchParams({
    search: debouncedSearch,
    plan: planFilter,
    status: statusFilter,
    page: String(page),
    limit: "20",
  }).toString();

  /* Queries */
  const { data: pagedData, isLoading, isFetching, isError, error, refetch } = useQuery<PagedUsers>({
    queryKey: ["/api/admin/users", debouncedSearch, planFilter, statusFilter, page],
    queryFn: async () => {
      const res = await fetch(`/api/admin/users?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      return res.json();
    },
    staleTime: 15_000,
    retry: 2,
  });

  const { data: stats } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    refetchInterval: 60_000,
    staleTime: 8_000,
  });

  const { data: stuckPayments, isLoading: stuckLoading, isFetching: stuckFetching, refetch: refetchStuck } = useQuery<StuckPayment[]>({
    queryKey: ["/api/admin/stuck-payments"],
    staleTime: 30_000,
  });

  const { data: liveSessions = [], refetch: refetchLive } = useQuery<ActiveSessionRow[]>({
    queryKey: ["/api/admin/active-sessions"],
    refetchInterval: 30_000, // auto-refresh every 30 seconds
    staleTime: 15_000,
  });

  const { data: userPayments, isLoading: userPaymentsLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/users", viewPaymentsUser?.id, "payments"],
    queryFn: async () => {
      if (!viewPaymentsUser) return [];
      const res = await fetch(`/api/admin/users/${viewPaymentsUser.id}/payments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load payments");
      return res.json();
    },
    enabled: !!viewPaymentsUser,
    staleTime: 10_000,
  });

  interface ProSubscriber {
    id: string;
    name: string | null;
    email: string;
    phone: string | null;
    startDate: string | null;
    endDate: string | null;
    amountPaid: string | null;
    paymentMethod: string | null;
  }
  const { data: proSubscribers, isLoading: proSubLoading } = useQuery<ProSubscriber[]>({
    queryKey: ["/api/admin/pro-subscribers"],
    enabled: proDropdownOpen,
    staleTime: 60_000,
  });

  const users = pagedData?.users ?? [];
  const totalUsers = stats?.totalUsers ?? pagedData?.totalUsers ?? 0;
  const totalPages = pagedData?.totalPages ?? 1;

  /* Mutations */
  async function doGrant(createIfNotFound = false): Promise<GrantResult> {
    const res = await apiRequest("POST", "/api/admin/manual-grant", {
      identifier: grantIdentifier.trim(),
      planId: grantPlan,
      receipt: grantReceipt.trim() || undefined,
      note: grantNote.trim() || "Manual grant via admin panel",
      createIfNotFound,
    });
    return res.json();
  }

  const manualGrantMutation = useMutation({
    mutationFn: () => doGrant(false),
    onSuccess: (data) => {
      setGrantResult(data);
      setGrantNotFound(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Plan granted", description: data.message });
      setGrantIdentifier(""); setGrantReceipt(""); setGrantNote("");
    },
    onError: (err: any) => {
      const msg: string = err.message || "";
      const isNotFound = msg.includes("No account found") && grantIdentifier.trim().includes("@");
      if (isNotFound) {
        setGrantNotFound(true);
      } else {
        setGrantNotFound(false);
        toast({ title: "Grant failed", description: msg || "Could not grant plan", variant: "destructive" });
      }
    },
  });

  const createAndGrantMutation = useMutation({
    mutationFn: () => doGrant(true),
    onSuccess: (data) => {
      setGrantResult(data);
      setGrantNotFound(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({
        title: data.accountCreated ? "Account created & Pro granted" : "Plan granted",
        description: data.message,
      });
      setGrantIdentifier(""); setGrantReceipt(""); setGrantNote("");
    },
    onError: (err: any) => {
      toast({ title: "Grant failed", description: err.message || "Could not create account", variant: "destructive" });
    },
  });

  const activateSingleMutation = useMutation({
    mutationFn: async ({ paymentId, planId }: { paymentId: string; planId: string }) => {
      const res = await apiRequest("POST", `/api/admin/stuck-payments/${paymentId}/activate`, { planId });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Plan activated", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stuck-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (err: any) => toast({ title: "Activation failed", description: err.message, variant: "destructive" }),
  });

  const activateAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/stuck-payments/activate-all", { planId: "pro" });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `${data.activated} plans activated`, description: `Processed ${data.total} stuck payments.` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stuck-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    },
    onError: (err: any) => toast({ title: "Bulk activation failed", description: err.message, variant: "destructive" }),
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: any }) =>
      apiRequest("PATCH", `/api/admin/users/${userId}/status`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User updated" });
      setSelectedUser(null);
    },
    onError: () => toast({ title: "Failed to update user", variant: "destructive" }),
  });

  const upgradePlanMutation = useMutation({
    mutationFn: async ({ userId, plan }: { userId: string; plan: string }) =>
      apiRequest("PATCH", `/api/admin/users/${userId}/plan`, { plan }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: `Plan updated to ${vars.plan}` });
      setSelectedUser(null);
    },
    onError: () => toast({ title: "Failed to update plan", variant: "destructive" }),
  });

  const setAdminMutation = useMutation({
    mutationFn: async ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}/set-admin`, { isAdmin });
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setSelectedUser(prev => prev ? { ...prev, isAdmin: vars.isAdmin } : prev);
      toast({ title: vars.isAdmin ? "Admin access granted" : "Admin access revoked" });
    },
    onError: (err: any) => toast({ title: "Failed to update admin status", description: err.message, variant: "destructive" }),
  });

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const counts = {
    total: stats?.totalUsers ?? totalUsers,
    free: stats?.planBreakdown?.free ?? 0,
    basic: stats?.planBreakdown?.basic ?? 0,
    pro: stats?.planBreakdown?.pro ?? 0,
  };

  return (
    <AdminLayout title="Users">
      <div className="space-y-5">

        {/* ── Header: total users ─────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground" data-testid="text-total-users">
                {isLoading && counts.total === 0 ? <Skeleton className="h-7 w-20 inline-block" /> : counts.total.toLocaleString()}
              </h1>
              <p className="text-sm text-muted-foreground">
                Total registered users
                {stats?.signupStats && (
                  <> · <span className="text-green-600 dark:text-green-400 font-medium">+{stats.signupStats.today} today</span></>
                )}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh-users"
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* ── Plan breakdown ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xl font-bold text-muted-foreground">{counts.free.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><UserCheck className="h-3 w-3" />Free</p>
            </CardContent>
          </Card>
          <Card className="border-blue-200 dark:border-blue-800">
            <CardContent className="p-4">
              <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{counts.basic.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><Zap className="h-3 w-3 text-blue-500" />Basic</p>
            </CardContent>
          </Card>
          <Card
            className="border-amber-200 dark:border-amber-800 cursor-pointer hover:border-amber-400 dark:hover:border-amber-600 transition-colors select-none"
            onClick={() => setProDropdownOpen(o => !o)}
            data-testid="card-pro-toggle"
          >
            <CardContent className="p-4">
              <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{counts.pro.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                <Crown className="h-3 w-3 text-amber-500" />Pro
                {proDropdownOpen ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ── Pro Subscriber List ──────────────────────────────────────────── */}
        {proDropdownOpen && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-card shadow-md overflow-hidden" data-testid="panel-pro-subscribers">
            <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-100 dark:border-amber-800">
              <Crown className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">Active Pro Subscribers</span>
              {!proSubLoading && proSubscribers && (
                <Badge className="ml-1 text-[10px] px-1.5 py-0 h-4 bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-700">
                  {proSubscribers.length} total
                </Badge>
              )}
            </div>

            {proSubLoading ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
              </div>
            ) : !proSubscribers || proSubscribers.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No active Pro subscribers found.</p>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card border-b border-border">
                    <tr>
                      <th className="text-left px-4 py-2 font-semibold text-muted-foreground">#</th>
                      <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Name</th>
                      <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Email</th>
                      <th className="text-left px-4 py-2 font-semibold text-muted-foreground hidden sm:table-cell">Phone</th>
                      <th className="text-right px-4 py-2 font-semibold text-muted-foreground hidden md:table-cell">Paid</th>
                      <th className="text-right px-4 py-2 font-semibold text-muted-foreground">Expires</th>
                      <th className="text-right px-4 py-2 font-semibold text-muted-foreground hidden lg:table-cell">Method</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {proSubscribers.map((sub, idx) => (
                      <tr key={sub.id} className="hover:bg-muted/40 transition-colors" data-testid={`row-pro-sub-${idx}`}>
                        <td className="px-4 py-2.5 text-muted-foreground">{idx + 1}</td>
                        <td className="px-4 py-2.5 font-medium max-w-[140px] truncate">{sub.name || "—"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground max-w-[180px] truncate">
                          <a href={`mailto:${sub.email}`} className="hover:text-amber-600 transition-colors flex items-center gap-1">
                            <Mail className="h-2.5 w-2.5 shrink-0" />{sub.email}
                          </a>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">
                          {sub.phone
                            ? <span className="flex items-center gap-1"><Phone className="h-2.5 w-2.5" />{sub.phone}</span>
                            : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-green-600 dark:text-green-400 hidden md:table-cell">
                          {sub.amountPaid ? `KES ${Number(sub.amountPaid).toLocaleString()}` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground whitespace-nowrap">
                          {sub.endDate
                            ? new Date(sub.endDate).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })
                            : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right capitalize text-muted-foreground hidden lg:table-cell">
                          {sub.paymentMethod || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Live Sessions ──────────────────────────────────────────────── */}
        <Card className="border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-950/10">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                </span>
                Live Sessions
                <Badge className="ml-1 bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-200 dark:border-green-700 text-xs">
                  {liveSessions.length} online
                </Badge>
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetchLive()}
                className="h-7 px-2 gap-1.5 text-xs text-muted-foreground"
                data-testid="button-refresh-live"
              >
                <RefreshCw className="h-3 w-3" />
                Refresh
              </Button>
            </div>
            <CardDescription className="text-xs">Users browsing right now — updates every 30 s</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {liveSessions.length === 0 ? (
              <p className="text-xs text-muted-foreground px-6 pb-4 flex items-center gap-1.5">
                <Wifi className="h-3.5 w-3.5" />
                No active sessions at the moment
              </p>
            ) : (
              <div className="divide-y divide-border">
                {liveSessions.map((s) => {
                  const name = [s.first_name, s.last_name].filter(Boolean).join(" ") || s.email || "Unknown";
                  const seenMs = new Date(s.last_seen).getTime();
                  const diffSec = Math.floor((Date.now() - seenMs) / 1000);
                  const ago = diffSec < 60 ? `${diffSec}s ago` : `${Math.floor(diffSec / 60)}m ago`;
                  return (
                    <div
                      key={s.session_id}
                      className="flex items-center gap-3 px-6 py-2.5"
                      data-testid={`row-live-session-${s.session_id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate" data-testid={`text-session-email-${s.session_id}`}>
                          {name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {s.email}{s.phone ? ` · ${s.phone}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <Monitor className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span
                          className="text-xs text-muted-foreground truncate font-mono"
                          data-testid={`text-session-page-${s.session_id}`}
                        >
                          {s.current_page || "—"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {planBadge(s.plan)}
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap" data-testid={`text-session-seen-${s.session_id}`}>
                          {ago}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Manual Plan Grant ──────────────────────────────────────────── */}
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-900/10">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-amber-600" />
              Manual Plan Grant
            </CardTitle>
            <CardDescription className="text-xs">
              User paid but system didn't recognise them? Look up by email or phone and grant the plan immediately.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {grantResult ? (
              <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 space-y-2">
                <p className="font-semibold text-green-700 dark:text-green-400 flex items-center gap-1.5 text-sm">
                  <Check className="h-4 w-4" /> {grantResult.accountCreated ? "Account created & Pro granted" : "Plan granted"}
                </p>
                <div className="text-xs space-y-1 text-muted-foreground">
                  <p><strong className="text-foreground">{grantResult.user.name}</strong> · {grantResult.user.email ?? grantResult.user.phone ?? "—"}</p>
                  <p>Plan: <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 capitalize text-xs">{grantResult.user.plan}</Badge></p>
                  <p>Expires: {new Date(grantResult.user.expiresAt).toLocaleDateString("en-KE")}</p>
                  {grantResult.accountCreated && (
                    <p className="text-orange-700 dark:text-orange-400 font-medium mt-1">
                      Account was created. Tell this person to sign in using their email and set a password.
                    </p>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={() => setGrantResult(null)} data-testid="button-grant-another">
                  Grant another
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="grant-identifier" className="text-xs">Email or Phone <span className="text-destructive">*</span></Label>
                  <Input id="grant-identifier" value={grantIdentifier} onChange={e => { setGrantIdentifier(e.target.value); setGrantNotFound(false); }} placeholder="user@email.com or 0712…" data-testid="input-grant-identifier" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="grant-plan" className="text-xs">Plan</Label>
                  <Select value={grantPlan} onValueChange={v => setGrantPlan(v as "pro")}>
                    <SelectTrigger id="grant-plan" data-testid="select-grant-plan"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pro">Pro — KES 4,500 / year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="grant-receipt" className="text-xs">Receipt <span className="text-muted-foreground">(optional)</span></Label>
                  <Input id="grant-receipt" value={grantReceipt} onChange={e => setGrantReceipt(e.target.value)} placeholder="QHX9K2ABCD" data-testid="input-grant-receipt" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="grant-note" className="text-xs">Note <span className="text-muted-foreground">(optional)</span></Label>
                  <Input id="grant-note" value={grantNote} onChange={e => setGrantNote(e.target.value)} placeholder="User called in, receipt confirmed" data-testid="input-grant-note" />
                </div>
                <div className="sm:col-span-2 flex flex-col gap-2">
                  <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 rounded px-3 py-2 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    This activates the plan immediately and creates an audit log entry.
                  </p>
                  {grantNotFound && (
                    <div className="rounded-lg border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/30 p-3 space-y-2">
                      <p className="text-xs text-orange-800 dark:text-orange-300 font-medium">
                        No account found for <strong>{grantIdentifier.trim()}</strong>. This person has not signed up yet.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        You can create an account for them and grant Pro immediately. They can then sign in with this email to access their plan.
                      </p>
                      <Button
                        onClick={() => createAndGrantMutation.mutate()}
                        disabled={createAndGrantMutation.isPending}
                        data-testid="button-create-and-grant"
                        className="bg-orange-600 hover:bg-orange-700 text-white text-xs h-8"
                        size="sm"
                      >
                        {createAndGrantMutation.isPending
                          ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Creating…</>
                          : <><Crown className="h-3.5 w-3.5 mr-1.5" />Create Account & Grant Pro</>}
                      </Button>
                    </div>
                  )}
                  <Button
                    onClick={() => { setGrantNotFound(false); manualGrantMutation.mutate(); }}
                    disabled={!grantIdentifier.trim() || manualGrantMutation.isPending}
                    data-testid="button-grant-plan"
                    className="bg-amber-600 hover:bg-amber-700 text-white self-start"
                  >
                    {manualGrantMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Granting…</> : <><Crown className="h-4 w-4 mr-2" />Grant {grantPlan === "pro" ? "Pro" : "Basic"}</>}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Stuck payments ─────────────────────────────────────────────── */}
        {((stuckPayments && stuckPayments.length > 0) || stuckLoading) && (
          <Card className="border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  <CardTitle className="text-sm font-semibold text-orange-800 dark:text-orange-300">
                    Stuck M-Pesa Payments
                    {stuckPayments && <Badge className="ml-2 bg-orange-200 text-orange-800 dark:bg-orange-800/40 dark:text-orange-200 text-xs">{stuckPayments.length}</Badge>}
                  </CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => refetchStuck()} disabled={stuckFetching} data-testid="button-refresh-stuck" className="border-orange-300 text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:text-orange-300 h-7 text-xs gap-1">
                    <RefreshCw className={`h-3 w-3 ${stuckFetching ? "animate-spin" : ""}`} />Refresh
                  </Button>
                  <Button size="sm" onClick={() => activateAllMutation.mutate()} disabled={activateAllMutation.isPending || !stuckPayments?.length} data-testid="button-activate-all-stuck" className="bg-orange-600 hover:bg-orange-700 text-white h-7 text-xs gap-1">
                    {activateAllMutation.isPending ? <><Loader2 className="h-3 w-3 animate-spin" />Activating…</> : <><Crown className="h-3 w-3" />Activate All</>}
                  </Button>
                </div>
              </div>
              <CardDescription className="text-orange-700 dark:text-orange-400 text-xs mt-1">
                M-Pesa STK callback failed — users paid but plan was never activated.
                Total: KES {stuckPayments?.reduce((s, p) => s + (p.amount || 0), 0).toLocaleString() ?? "—"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {stuckLoading ? (
                <div className="p-4 space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (
                <div className="divide-y divide-orange-100 dark:divide-orange-900/40">
                  {stuckPayments?.map(sp => (
                    <div key={sp.paymentId} className="flex items-center justify-between gap-3 p-3 hover:bg-orange-50/60 dark:hover:bg-orange-900/10" data-testid={`row-stuck-${sp.paymentId}`}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{sp.userName || sp.userId.slice(0, 10) + "…"}</p>
                        <p className="text-xs text-muted-foreground truncate">{sp.userEmail ?? sp.userPhone ?? "—"} · KES {(sp.amount ?? 0).toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {planBadge(sp.currentPlan)}
                        <Button size="sm" variant="outline" onClick={() => activateSingleMutation.mutate({ paymentId: sp.paymentId, planId: "pro" })} disabled={activateSingleMutation.isPending} data-testid={`button-activate-stuck-${sp.paymentId}`} className="h-7 text-xs border-orange-300 text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:text-orange-300">
                          Activate
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Filters ────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input placeholder="Search by email, phone or name…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10" data-testid="input-search-users" />
          </div>
          <Select value={planFilter} onValueChange={setPlanFilter}>
            <SelectTrigger className="w-full sm:w-36" data-testid="select-plan-filter"><SelectValue placeholder="Plan" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Plans</SelectItem>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="basic">Basic</SelectItem>
              <SelectItem value="pro">Pro</SelectItem>
              <SelectItem value="paid">Paid (any)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-36" data-testid="select-status-filter"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* ── Error state ────────────────────────────────────────────────── */}
        {isError && (
          <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
              <div>
                <p className="text-sm font-medium text-destructive">Failed to load users</p>
                <p className="text-xs text-muted-foreground">{(error as any)?.message || "An unexpected error occurred"}</p>
              </div>
            </div>
            <Button size="sm" variant="outline" className="border-destructive/40 text-destructive shrink-0" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Retry
            </Button>
          </div>
        )}

        {/* ── User list ──────────────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-0">
            {/* Loading skeleton */}
            {isLoading && (
              <div className="p-4 space-y-3" data-testid="section-loading">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                    <Skeleton className="h-5 w-14 rounded-full" />
                  </div>
                ))}
              </div>
            )}

            {/* Table — desktop */}
            {!isLoading && !isError && (
              <>
                {/* Desktop table (hidden on small screens) */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left p-3 font-medium text-xs text-muted-foreground">Email</th>
                        <th className="text-left p-3 font-medium text-xs text-muted-foreground hidden md:table-cell">Name</th>
                        <th className="text-left p-3 font-medium text-xs text-muted-foreground">Plan</th>
                        <th className="text-left p-3 font-medium text-xs text-muted-foreground hidden lg:table-cell">Status</th>
                        <th className="text-left p-3 font-medium text-xs text-muted-foreground">Date Joined</th>
                        <th className="text-right p-3 font-medium text-xs text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(user => (
                        <tr key={user.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors" data-testid={`row-user-${user.id}`}>
                          <td className="p-3">
                            <p className="font-medium text-sm truncate max-w-[220px]" data-testid={`text-email-${user.id}`}>
                              {user.email ?? <span className="italic text-muted-foreground">No email</span>}
                            </p>
                            <button onClick={() => copyId(user.id)} className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground/50 hover:text-muted-foreground font-mono transition-colors" data-testid={`copy-id-${user.id}`} title="Copy ID">
                              {copiedId === user.id
                                ? <><CheckCheck className="h-2.5 w-2.5 text-green-500" /><span className="text-green-500">copied</span></>
                                : <><Copy className="h-2.5 w-2.5" />{user.id.slice(0, 12)}…</>}
                            </button>
                          </td>
                          <td className="p-3 hidden md:table-cell text-sm text-muted-foreground">{user.firstName} {user.lastName}</td>
                          <td className="p-3">{planBadge(user.planDisplay || user.plan)}</td>
                          <td className="p-3 hidden lg:table-cell">
                            {user.isActive
                              ? <Badge variant="outline" className="text-green-600 border-green-300 gap-1 text-xs"><Check className="h-3 w-3" />Active</Badge>
                              : <Badge variant="outline" className="text-red-600 border-red-300 gap-1 text-xs"><X className="h-3 w-3" />Inactive</Badge>}
                          </td>
                          <td className="p-3 text-xs text-muted-foreground whitespace-nowrap" data-testid={`text-joined-${user.id}`}>{fmtDate(user.createdAt)}</td>
                          <td className="p-3 text-right">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSelectedUser(user); setEditRole(user.role || "USER"); setEditStatus(user.isActive ? "active" : "inactive"); }} data-testid={`button-edit-user-${user.id}`}>
                              <Settings className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile card list (shown on small screens only) */}
                <div className="sm:hidden divide-y">
                  {users.map(user => (
                    <div key={user.id} className="flex items-center gap-3 p-4 hover:bg-muted/10" data-testid={`card-user-${user.id}`}>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate" data-testid={`text-email-mobile-${user.id}`}>
                          {user.email ?? <span className="italic text-muted-foreground">No email</span>}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-joined-mobile-${user.id}`}>
                          Joined {fmtDate(user.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {planBadge(user.planDisplay || user.plan)}
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSelectedUser(user); setEditRole(user.role || "USER"); setEditStatus(user.isActive ? "active" : "inactive"); }} data-testid={`button-edit-user-mobile-${user.id}`}>
                          <Settings className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {users.length === 0 && (
                  <div className="py-14 text-center text-muted-foreground text-sm" data-testid="section-empty-users">
                    {debouncedSearch || planFilter !== "all" || statusFilter !== "all" ? "No users match your filters." : "No users found."}
                  </div>
                )}

                {/* Pagination */}
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  totalUsers={totalUsers}
                  perPage={20}
                  count={users.length}
                  isLoading={isLoading}
                  onPage={setPage}
                />
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Edit Dialog ────────────────────────────────────────────────── */}
        <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Manage User</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <p className="font-medium text-sm mt-0.5">{selectedUser?.email || "—"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Phone</Label>
                  <p className="font-medium text-sm font-mono mt-0.5">{selectedUser?.phone || <span className="text-amber-600 text-xs not-italic">Not set</span>}</p>
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">User ID</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-xs bg-muted px-2 py-1 rounded font-mono flex-1 break-all" data-testid="text-user-id">{selectedUser?.id}</code>
                  <Button size="sm" variant="ghost" className="h-7 px-2 shrink-0" onClick={() => selectedUser && copyId(selectedUser.id)} data-testid="button-copy-user-id">
                    {copiedId === selectedUser?.id ? <CheckCheck className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Current Plan</Label>
                <div className="flex items-center gap-2 mt-1">
                  {planBadge(selectedUser?.planDisplay || selectedUser?.plan)}
                  <span className="text-xs text-muted-foreground">{selectedUser?.hasActiveSubscription ? "Active subscription" : "No active subscription"}</span>
                </div>
              </div>

              <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quick Plan Change</p>
                <div className="flex flex-wrap gap-2">
                  {["free", "basic", "pro"].map(p => (
                    <Button
                      key={p}
                      size="sm"
                      variant={(selectedUser?.planDisplay || selectedUser?.plan || "free").toLowerCase() === p ? "default" : "outline"}
                      disabled={upgradePlanMutation.isPending || (selectedUser?.planDisplay || selectedUser?.plan || "free").toLowerCase() === p}
                      onClick={() => selectedUser && upgradePlanMutation.mutate({ userId: selectedUser.id, plan: p })}
                      data-testid={`button-set-plan-${p}`}
                      className="capitalize"
                    >
                      {upgradePlanMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      {p}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Admin Access</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {selectedUser?.isAdmin
                      ? <ShieldCheck className="h-4 w-4 text-violet-500" />
                      : <ShieldOff className="h-4 w-4 text-muted-foreground" />}
                    <span className="text-sm">
                      {selectedUser?.isAdmin ? "Admin" : "Not admin"}
                    </span>
                  </div>
                  {selectedUser?.isAdmin ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={setAdminMutation.isPending}
                      onClick={() => selectedUser && setAdminMutation.mutate({ userId: selectedUser.id, isAdmin: false })}
                      data-testid="button-revoke-admin"
                      className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 h-7 text-xs gap-1"
                    >
                      {setAdminMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldOff className="h-3 w-3" />}
                      Revoke Admin
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={setAdminMutation.isPending}
                      onClick={() => selectedUser && setAdminMutation.mutate({ userId: selectedUser.id, isAdmin: true })}
                      data-testid="button-grant-admin"
                      className="border-violet-300 text-violet-600 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-900/20 h-7 text-xs gap-1"
                    >
                      {setAdminMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                      Grant Admin
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-role" className="text-xs">Role</Label>
                  <Select value={editRole} onValueChange={setEditRole}>
                    <SelectTrigger id="edit-role" data-testid="select-edit-role"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USER">User</SelectItem>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-status" className="text-xs">Account Status</Label>
                  <Select value={editStatus} onValueChange={setEditStatus}>
                    <SelectTrigger id="edit-status" data-testid="select-edit-status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-between items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setViewPaymentsUser(selectedUser); setSelectedUser(null); }}
                  data-testid="button-view-payments"
                  className="gap-1.5"
                >
                  <History className="h-3.5 w-3.5" />
                  Payment History
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setSelectedUser(null)} data-testid="button-cancel-edit">Cancel</Button>
                  <Button onClick={() => selectedUser && updateUserMutation.mutate({ userId: selectedUser.id, data: { isActive: editStatus === "active", role: editRole } })} disabled={updateUserMutation.isPending} data-testid="button-save-user">
                    {updateUserMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : "Save Changes"}
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Payment History Dialog ──────────────────────────────────── */}
        <Dialog open={!!viewPaymentsUser} onOpenChange={() => setViewPaymentsUser(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Payment History
              </DialogTitle>
              {viewPaymentsUser && (
                <p className="text-sm text-muted-foreground">
                  {viewPaymentsUser.email || viewPaymentsUser.id} · {planBadge(viewPaymentsUser.planDisplay || viewPaymentsUser.plan)}
                </p>
              )}
            </DialogHeader>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {userPaymentsLoading ? (
                <div className="space-y-2 py-2">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
                </div>
              ) : !userPayments || userPayments.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground" data-testid="section-no-payments">
                  <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No payments found for this user.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {userPayments.map((p: any) => {
                    const isCompleted = p.status === "completed" || p.status === "success";
                    const isPending = p.status === "pending";
                    return (
                      <div
                        key={p.id}
                        className="flex items-start justify-between gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                        data-testid={`row-payment-${p.id}`}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={`mt-0.5 h-7 w-7 shrink-0 rounded-full flex items-center justify-center ${
                            isCompleted ? "bg-green-100 dark:bg-green-900/40" :
                            isPending ? "bg-amber-100 dark:bg-amber-900/40" :
                            "bg-red-100 dark:bg-red-900/40"
                          }`}>
                            {isCompleted ? <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" /> :
                             isPending ? <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" /> :
                             <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm">KES {(p.amount ?? 0).toLocaleString()}</span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 capitalize">{p.method || "—"}</Badge>
                              {p.planId && (
                                <Badge className={`text-[10px] px-1.5 py-0 h-4 capitalize ${p.planId === "pro" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"}`}>
                                  {p.planId}
                                </Badge>
                              )}
                              {p.verificationStatus && (
                                <Badge className={`text-[10px] px-1.5 py-0 h-4 capitalize ${
                                  p.verificationStatus === "verified" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400" :
                                  p.verificationStatus === "suspicious" || p.verificationStatus === "mismatch" ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" :
                                  p.verificationStatus === "api_unavailable" ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" :
                                  "bg-muted text-muted-foreground"
                                }`}>
                                  {p.verificationStatus === "api_unavailable" ? "unverifiable" : p.verificationStatus}
                                </Badge>
                              )}
                            </div>
                            {p.transactionRef && (
                              <p className="text-[10px] font-mono text-muted-foreground mt-0.5 truncate" data-testid={`text-ref-${p.id}`}>
                                Ref: {p.transactionRef}
                              </p>
                            )}
                            {(p.verificationStatus === "suspicious" || p.verificationStatus === "mismatch") && p.verificationNote && (
                              <p className="text-[10px] text-red-600 dark:text-red-400 mt-0.5 truncate" data-testid={`text-verify-note-${p.id}`}>
                                ⚠ {p.verificationNote}
                              </p>
                            )}
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {p.createdAt ? new Date(p.createdAt).toLocaleString("en-KE", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                            </p>
                          </div>
                        </div>
                        <Badge
                          className={`shrink-0 text-[10px] capitalize ${
                            isCompleted ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" :
                            isPending ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" :
                            "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                          }`}
                          data-testid={`badge-status-${p.id}`}
                        >
                          {p.status}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="pt-3 border-t flex justify-between items-center">
              <p className="text-xs text-muted-foreground">
                {userPayments ? `${userPayments.length} payment${userPayments.length !== 1 ? "s" : ""} · KES ${userPayments.filter((p: any) => p.status === "completed" || p.status === "success").reduce((s: number, p: any) => s + (p.amount || 0), 0).toLocaleString()} total paid` : ""}
              </p>
              <Button variant="outline" onClick={() => setViewPaymentsUser(null)} data-testid="button-close-payments">Close</Button>
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </AdminLayout>
  );
}
