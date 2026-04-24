import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Globe, Plus, RefreshCw, Trash2, CheckCircle, XCircle,
  AlertTriangle, Clock, Zap, Search, ExternalLink,
  ThumbsUp, ThumbsDown, Users, ShieldCheck, X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { VerifiedPortal } from "@shared/schema";
import {
  useAllSubmissions,
  updateSubmissionStatus,
  deleteSubmission,
  type SubmittedPortal,
} from "@/lib/firebase-portals";

// ── Status config ──────────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; icon: typeof CheckCircle; cls: string }> = {
  active:      { label: "Active",      icon: CheckCircle,  cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  down:        { label: "Down",        icon: XCircle,      cls: "bg-red-100 text-red-700 border-red-200" },
  unreachable: { label: "Unreachable", icon: AlertTriangle, cls: "bg-amber-100 text-amber-700 border-amber-200" },
  unknown:     { label: "Unknown",     icon: Clock,        cls: "bg-gray-100 text-gray-600 border-gray-200" },
};

const SUBMISSION_STATUS_CFG: Record<string, { label: string; cls: string }> = {
  pending_review: { label: "Pending",  cls: "bg-amber-100 text-amber-700 border-amber-200" },
  approved:       { label: "Approved", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  rejected:       { label: "Rejected", cls: "bg-red-100 text-red-700 border-red-200" },
};

const CATEGORIES = ["government", "jobs", "visa", "nea", "embassy", "immigration", "education", "general"];
const EMPTY_FORM = { name: "", url: "", category: "general", country: "Kenya", description: "" };

// ── Verified Portals Tab ───────────────────────────────────────────────────────
function VerifiedPortalsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: portals, isLoading } = useQuery<VerifiedPortal[]>({
    queryKey: ["/api/admin/portals"],
    refetchInterval: 60_000,
  });

  const addMutation = useMutation({
    mutationFn: (body: typeof EMPTY_FORM) => apiRequest("POST", "/api/admin/portals", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/portals"] });
      toast({ title: "Portal added" });
      setForm(EMPTY_FORM);
      setAddOpen(false);
    },
    onError: () => toast({ title: "Failed to add portal", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/portals/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/portals"] });
      toast({ title: "Portal removed" });
    },
    onError: () => toast({ title: "Failed to remove portal", variant: "destructive" }),
  });

  const checkNowMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/portals/check-now"),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/portals"] });
      toast({ title: "Health check complete", description: `${data.active} active · ${data.down} down · ${data.unreachable} unreachable` });
    },
    onError: () => toast({ title: "Health check failed", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiRequest("PATCH", `/api/admin/portals/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/portals"] }),
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const filtered = portals?.filter(p => {
    const q = search.toLowerCase();
    const matchesSearch = !q || p.name.toLowerCase().includes(q) || p.url.toLowerCase().includes(q);
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  }) ?? [];

  const counts = {
    total: portals?.length ?? 0,
    active: portals?.filter(p => p.status === "active").length ?? 0,
    down: portals?.filter(p => p.status === "down").length ?? 0,
    unreachable: portals?.filter(p => p.status === "unreachable").length ?? 0,
  };
  const avgResponse = portals?.filter(p => p.responseTimeMs)
    .reduce((acc, p, _, arr) => acc + (p.responseTimeMs! / arr.length), 0) ?? 0;

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" className="gap-2" onClick={() => checkNowMutation.mutate()} disabled={checkNowMutation.isPending} data-testid="button-check-now">
          <RefreshCw className={`h-4 w-4 ${checkNowMutation.isPending ? "animate-spin" : ""}`} />
          {checkNowMutation.isPending ? "Checking…" : "Check Now"}
        </Button>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-teal-600 hover:bg-teal-700 text-white" data-testid="button-add-portal">
              <Plus className="h-4 w-4" /> Add Portal
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Add Verified Portal</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Portal Name <span className="text-red-500">*</span></Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. NEA Kenya Official Portal" data-testid="input-portal-name" />
              </div>
              <div className="space-y-1.5">
                <Label>URL <span className="text-red-500">*</span></Label>
                <Input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://www.nea.go.ke" type="url" data-testid="input-portal-url" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Country</Label>
                  <Input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} placeholder="Kenya" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button onClick={() => addMutation.mutate(form)} disabled={addMutation.isPending || !form.name.trim() || !form.url.trim()} className="bg-teal-600 hover:bg-teal-700 text-white" data-testid="button-submit-portal">
                  {addMutation.isPending ? "Adding…" : "Add Portal"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total", value: counts.total, cls: "text-gray-900 dark:text-gray-100" },
          { label: "Active", value: counts.active, cls: "text-emerald-600" },
          { label: "Down", value: counts.down, cls: "text-red-600" },
          { label: "Unreachable", value: counts.unreachable, cls: "text-amber-600" },
          { label: "Avg Response", value: avgResponse > 0 ? `${Math.round(avgResponse)}ms` : "—", cls: "text-blue-600" },
        ].map(({ label, value, cls }) => (
          <Card key={label}><CardContent className="p-4 text-center"><p className={`text-2xl font-bold ${cls}`}>{value}</p><p className="text-xs text-muted-foreground mt-0.5">{label}</p></CardContent></Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search portals…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" data-testid="input-search" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="down">Down</SelectItem>
            <SelectItem value="unreachable">Unreachable</SelectItem>
            <SelectItem value="unknown">Unknown</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-6 space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Globe className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium">{portals?.length === 0 ? "No portals added yet" : "No portals match your filter"}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/70 dark:bg-gray-900/40">
                  {["Portal", "Category", "Status", "Response", "Last Checked", ""].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map((portal, idx) => {
                  const cfg = STATUS_CFG[portal.status ?? "unknown"] ?? STATUS_CFG.unknown;
                  const Icon = cfg.icon;
                  return (
                    <tr key={portal.id} className={idx % 2 === 0 ? "" : "bg-gray-50/30 dark:bg-gray-900/10"} data-testid={`row-portal-${portal.id}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800 dark:text-gray-200">{portal.name}</p>
                        <a href={portal.url} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-600 hover:underline flex items-center gap-1">
                          {portal.url.replace(/^https?:\/\//, "").slice(0, 45)}<ExternalLink className="h-3 w-3" />
                        </a>
                        {portal.country && <p className="text-xs text-muted-foreground">{portal.country}</p>}
                      </td>
                      <td className="px-4 py-3"><Badge variant="outline" className="text-xs capitalize">{portal.category ?? "general"}</Badge></td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.cls}`}>
                          <Icon className="h-3.5 w-3.5" />{cfg.label}
                        </span>
                        {portal.statusCode && <p className="text-xs text-muted-foreground mt-0.5 pl-1">HTTP {portal.statusCode}</p>}
                        {portal.errorMessage && <p className="text-xs text-red-500 pl-1 max-w-[140px] truncate" title={portal.errorMessage}>{portal.errorMessage}</p>}
                      </td>
                      <td className="px-4 py-3">
                        {portal.responseTimeMs ? (
                          <div className="flex items-center gap-1.5">
                            <Zap className={`h-3.5 w-3.5 ${portal.responseTimeMs < 1000 ? "text-emerald-500" : portal.responseTimeMs < 3000 ? "text-amber-500" : "text-red-500"}`} />
                            <span className="text-xs text-muted-foreground">{portal.responseTimeMs}ms</span>
                          </div>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {portal.lastChecked ? new Date(portal.lastChecked).toLocaleString("en-KE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Never"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className={`h-7 px-2 text-xs ${portal.isActive ? "text-muted-foreground" : "text-emerald-600"}`}
                            onClick={() => toggleMutation.mutate({ id: portal.id, isActive: !portal.isActive })}
                            disabled={toggleMutation.isPending}>
                            {portal.isActive ? "Pause" : "Enable"}
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                            onClick={() => deleteMutation.mutate(portal.id)}
                            disabled={deleteMutation.isPending}
                            data-testid={`button-delete-portal-${portal.id}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-center text-muted-foreground">
        HEAD request · 5s timeout · HTTP 405 treated as active · auto-checked every 6 hours
      </p>
    </div>
  );
}

// ── Community Submissions Tab ──────────────────────────────────────────────────
function SubmissionsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { portals, loading } = useAllSubmissions();
  const [statusFilter, setStatusFilter] = useState<"all" | "pending_review" | "approved" | "rejected">("pending_review");
  const [actionId, setActionId] = useState<string | null>(null);

  const filtered = portals.filter(p => statusFilter === "all" || p.status === statusFilter);

  const pendingCount = portals.filter(p => p.status === "pending_review").length;

  async function handleApprove(sub: SubmittedPortal) {
    setActionId(sub.id);
    try {
      // 1. Add to verified portals in PostgreSQL
      const res = await apiRequest("POST", "/api/admin/portals", {
        name: sub.name,
        url: sub.url,
        country: sub.country,
        description: sub.description,
        category: "general",
      });
      if (!res.ok) throw new Error("API error");

      // 2. Mark Firebase submission as approved
      await updateSubmissionStatus(sub.id, "approved");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/portals"] });
      toast({ title: "Portal approved", description: `${sub.name} added to verified portals and queued for health check.` });
    } catch {
      toast({ title: "Approval failed", variant: "destructive" });
    } finally {
      setActionId(null);
    }
  }

  async function handleReject(id: string) {
    setActionId(id);
    try {
      await updateSubmissionStatus(id, "rejected");
      toast({ title: "Submission rejected" });
    } catch {
      toast({ title: "Rejection failed", variant: "destructive" });
    } finally {
      setActionId(null);
    }
  }

  async function handleDelete(id: string) {
    setActionId(id);
    try {
      await deleteSubmission(id);
      toast({ title: "Submission deleted" });
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total", value: portals.length, cls: "text-gray-900 dark:text-gray-100" },
          { label: "Pending", value: portals.filter(p => p.status === "pending_review").length, cls: "text-amber-600" },
          { label: "Approved", value: portals.filter(p => p.status === "approved").length, cls: "text-emerald-600" },
          { label: "Rejected", value: portals.filter(p => p.status === "rejected").length, cls: "text-red-500" },
        ].map(({ label, value, cls }) => (
          <Card key={label}><CardContent className="p-4 text-center"><p className={`text-2xl font-bold ${cls}`}>{value}</p><p className="text-xs text-muted-foreground mt-0.5">{label}</p></CardContent></Card>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {(["pending_review", "approved", "rejected", "all"] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              statusFilter === s
                ? "bg-teal-600 text-white border-teal-600"
                : "border-gray-200 dark:border-gray-700 text-muted-foreground hover:border-teal-400 hover:text-teal-600"
            }`}
          >
            {s === "pending_review" ? `Pending${pendingCount > 0 ? ` (${pendingCount})` : ""}` : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center">
            <Users className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
            <p className="font-medium text-gray-700 dark:text-gray-200">No submissions in this category</p>
            <p className="text-sm text-muted-foreground mt-1">Community submissions appear here in real time.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(sub => {
            const scfg = SUBMISSION_STATUS_CFG[sub.status] ?? SUBMISSION_STATUS_CFG.pending_review;
            const score = sub.upvotes - sub.downvotes;
            const busy = actionId === sub.id;
            return (
              <Card key={sub.id} data-testid={`card-submission-${sub.id}`} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Score */}
                    <div className="flex flex-col items-center min-w-[48px] gap-0.5">
                      <div className="flex items-center gap-1 text-emerald-600 text-xs font-medium">
                        <ThumbsUp className="h-3.5 w-3.5" />{sub.upvotes}
                      </div>
                      <div className={`text-base font-bold tabular-nums ${score > 0 ? "text-emerald-600" : score < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                        {score >= 0 ? `+${score}` : score}
                      </div>
                      <div className="flex items-center gap-1 text-red-400 text-xs font-medium">
                        <ThumbsDown className="h-3.5 w-3.5" />{sub.downvotes}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className="font-semibold text-gray-800 dark:text-gray-200">{sub.name}</p>
                          <a href={sub.url} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-600 hover:underline flex items-center gap-1">
                            {sub.url.replace(/^https?:\/\//, "").slice(0, 60)}<ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant="outline" className="text-xs">{sub.country}</Badge>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${scfg.cls}`}>{scfg.label}</span>
                        </div>
                      </div>
                      {sub.description && <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">{sub.description}</p>}
                      <p className="text-xs text-muted-foreground mt-1.5">
                        Submitted {new Date(sub.timestamp).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" })}
                        {" · "}ID: <span className="font-mono">{sub.submittedBy.slice(0, 14)}…</span>
                      </p>
                    </div>

                    {/* Actions */}
                    {sub.status === "pending_review" && (
                      <div className="flex flex-col gap-1.5 flex-shrink-0">
                        <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs"
                          onClick={() => handleApprove(sub)} disabled={busy}
                          data-testid={`button-approve-${sub.id}`}>
                          <ShieldCheck className="h-3.5 w-3.5" />{busy ? "…" : "Approve"}
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5 text-red-500 border-red-200 hover:bg-red-50 h-8 text-xs"
                          onClick={() => handleReject(sub.id)} disabled={busy}
                          data-testid={`button-reject-${sub.id}`}>
                          <X className="h-3.5 w-3.5" />{busy ? "…" : "Reject"}
                        </Button>
                      </div>
                    )}
                    {sub.status !== "pending_review" && (
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500 flex-shrink-0"
                        onClick={() => handleDelete(sub.id)} disabled={busy}
                        data-testid={`button-delete-sub-${sub.id}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function AdminPortalHealthPage() {
  const [tab, setTab] = useState<"verified" | "submissions">("verified");
  const { portals: submissions } = useAllSubmissions();
  const pendingCount = submissions.filter(s => s.status === "pending_review").length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Portal Health Monitor</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage verified portals and review community-submitted suggestions
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setTab("verified")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "verified"
              ? "border-teal-600 text-teal-600"
              : "border-transparent text-muted-foreground hover:text-gray-700 dark:hover:text-gray-300"
          }`}
          data-testid="tab-verified"
        >
          <Globe className="inline h-4 w-4 mr-1.5 -mt-0.5" />
          Verified Portals
        </button>
        <button
          onClick={() => setTab("submissions")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            tab === "submissions"
              ? "border-teal-600 text-teal-600"
              : "border-transparent text-muted-foreground hover:text-gray-700 dark:hover:text-gray-300"
          }`}
          data-testid="tab-submissions"
        >
          <Users className="inline h-4 w-4 -mt-0.5" />
          Community Submissions
          {pendingCount > 0 && (
            <span className="bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full font-semibold min-w-[20px] text-center">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {tab === "verified" ? <VerifiedPortalsTab /> : <SubmissionsTab />}
    </div>
  );
}
