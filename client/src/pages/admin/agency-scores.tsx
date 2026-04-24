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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AdminLayout from "@/components/admin-layout";
import {
  Shield,
  RefreshCw,
  Lock,
  Unlock,
  History,
  AlertTriangle,
  BarChart3,
  Plus,
  Loader2,
  ChevronDown,
  ArrowLeft,
} from "lucide-react";

interface AgencyScore {
  id: string;
  agencyId: string;
  overallScore: number;
  tier: string;
  isFrozen: boolean;
  frozenBy: string | null;
  frozenReason: string | null;
  frozenAt: string | null;
  lastCalculatedAt: string | null;
  licenseStatusScore: number;
  complianceHistoryScore: number;
  paymentTransparencyScore: number;
  governmentVerificationScore: number;
  userFeedbackScore: number;
  longevityScore: number;
}

interface ScoreStats {
  total: number;
  tiers: {
    platinum: number;
    gold: number;
    silver: number;
    caution: number;
    high_risk: number;
  };
  frozenCount: number;
}

interface ScoreHistory {
  id: string;
  createdAt: string;
  previousScore: number;
  newScore: number;
  previousTier: string;
  newTier: string;
  changeReason: string;
  triggeredBy: string;
}

interface ScoreWeight {
  id: string;
  factorName: string;
  description: string | null;
  weight: number;
  isActive: boolean;
}

function getTierBadge(tier: string) {
  switch (tier) {
    case "platinum":
      return <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" data-testid={`tier-badge-${tier}`}>Platinum</Badge>;
    case "gold":
      return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" data-testid={`tier-badge-${tier}`}>Gold</Badge>;
    case "silver":
      return <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200" data-testid={`tier-badge-${tier}`}>Silver</Badge>;
    case "caution":
      return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" data-testid={`tier-badge-${tier}`}>Caution</Badge>;
    case "high_risk":
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" data-testid={`tier-badge-${tier}`}>High Risk</Badge>;
    default:
      return <Badge variant="outline" data-testid={`tier-badge-${tier}`}>{tier}</Badge>;
  }
}

function getScoreBarColor(score: number): string {
  if (score >= 90) return "bg-purple-500";
  if (score >= 75) return "bg-yellow-500";
  if (score >= 60) return "bg-gray-400";
  if (score >= 40) return "bg-orange-500";
  return "bg-red-500";
}

export default function AdminAgencyScores() {
  const { toast } = useToast();
  const [tierFilter, setTierFilter] = useState("all");
  const [frozenFilter, setFrozenFilter] = useState("all");
  const [historyAgencyId, setHistoryAgencyId] = useState<string | null>(null);
  const [freezeAgencyId, setFreezeAgencyId] = useState<string | null>(null);
  const [freezeReason, setFreezeReason] = useState("");
  const [addEventAgencyId, setAddEventAgencyId] = useState<string | null>(null);
  const [eventType, setEventType] = useState("violation_minor");
  const [eventSeverity, setEventSeverity] = useState("info");
  const [eventDescription, setEventDescription] = useState("");

  const buildQueryString = () => {
    const params = new URLSearchParams();
    if (tierFilter !== "all") params.set("tier", tierFilter);
    if (frozenFilter !== "all") params.set("isFrozen", frozenFilter);
    return params.toString();
  };

  const { data: stats, isLoading: statsLoading } = useQuery<ScoreStats>({
    queryKey: ["/api/admin/agency-scores/stats"],
  });

  const { data: scoresData, isLoading: scoresLoading } = useQuery<{ scores: AgencyScore[]; total: number }>({
    queryKey: ["/api/admin/agency-scores", tierFilter, frozenFilter],
    queryFn: async () => {
      const qs = buildQueryString();
      const url = qs ? `/api/admin/agency-scores?${qs}` : "/api/admin/agency-scores";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch scores");
      return res.json();
    },
  });

  const scores = scoresData?.scores || [];

  const { data: weightsData, isLoading: weightsLoading } = useQuery<{ weights: ScoreWeight[] }>({
    queryKey: ["/api/admin/agency-score-weights"],
  });

  const weights = weightsData?.weights || [];

  const recalcAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/agency-scores/recalculate-all");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Recalculation started", description: "All agency scores are being recalculated." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agency-scores"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agency-scores/stats"] });
    },
    onError: (error: any) => {
      toast({ title: "Recalculation failed", description: error.message, variant: "destructive" });
    },
  });

  const recalcOneMutation = useMutation({
    mutationFn: async (agencyId: string) => {
      const res = await apiRequest("POST", `/api/admin/agency-scores/${agencyId}/recalculate`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Score recalculated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agency-scores"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agency-scores/stats"] });
    },
    onError: (error: any) => {
      toast({ title: "Recalculation failed", description: error.message, variant: "destructive" });
    },
  });

  const freezeMutation = useMutation({
    mutationFn: async ({ agencyId, reason }: { agencyId: string; reason: string }) => {
      const res = await apiRequest("POST", `/api/admin/agency-scores/${agencyId}/freeze`, { reason });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Score frozen" });
      setFreezeAgencyId(null);
      setFreezeReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agency-scores"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agency-scores/stats"] });
    },
    onError: (error: any) => {
      toast({ title: "Freeze failed", description: error.message, variant: "destructive" });
    },
  });

  const unfreezeMutation = useMutation({
    mutationFn: async (agencyId: string) => {
      const res = await apiRequest("POST", `/api/admin/agency-scores/${agencyId}/unfreeze`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Score unfrozen" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agency-scores"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agency-scores/stats"] });
    },
    onError: (error: any) => {
      toast({ title: "Unfreeze failed", description: error.message, variant: "destructive" });
    },
  });

  const addEventMutation = useMutation({
    mutationFn: async (data: { agencyId: string; eventType: string; severity: string; description: string }) => {
      const res = await apiRequest("POST", "/api/admin/agency-compliance-events", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Compliance event added" });
      setAddEventAgencyId(null);
      setEventType("violation_minor");
      setEventSeverity("info");
      setEventDescription("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agency-scores"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to add event", description: error.message, variant: "destructive" });
    },
  });

  const tierCards = [
    { key: "platinum", label: "Platinum", color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-950" },
    { key: "gold", label: "Gold", color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-950" },
    { key: "silver", label: "Silver", color: "text-gray-600 dark:text-gray-400", bg: "bg-gray-50 dark:bg-gray-900" },
    { key: "caution", label: "Caution", color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950" },
    { key: "high_risk", label: "High Risk", color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950" },
    { key: "frozen", label: "Frozen", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950" },
  ];

  return (
    <AdminLayout title="Agency Legitimacy Scores">
      <div className="space-y-6" data-testid="agency-scores-page">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/admin">
                <Button variant="ghost" size="icon" data-testid="button-back-admin">
                  <ArrowLeft />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold" data-testid="page-title">Agency Legitimacy Scores</h1>
                <p className="text-muted-foreground text-sm mt-1">Dynamic trust scoring for NEA agencies</p>
              </div>
            </div>
          </div>
          <Button
            onClick={() => recalcAllMutation.mutate()}
            disabled={recalcAllMutation.isPending}
            data-testid="button-recalculate-all"
          >
            {recalcAllMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Recalculate All Scores
          </Button>
        </div>

        {statsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-20" />)}
          </div>
        ) : stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4" data-testid="tier-stats">
            {tierCards.map((tc) => (
              <Card key={tc.key} data-testid={`stat-card-${tc.key}`}>
                <CardContent className="pt-4 pb-3">
                  <div className={`flex flex-col items-center gap-1 ${tc.bg} rounded-md p-3`}>
                    <p className={`text-2xl font-bold ${tc.color}`} data-testid={`stat-count-${tc.key}`}>
                      {tc.key === "frozen" ? (stats?.frozenCount ?? 0) : ((stats?.tiers as any)?.[tc.key] ?? 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">{tc.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Score List
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={tierFilter} onValueChange={setTierFilter}>
                  <SelectTrigger className="w-36" data-testid="filter-tier">
                    <SelectValue placeholder="Tier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tiers</SelectItem>
                    <SelectItem value="platinum">Platinum</SelectItem>
                    <SelectItem value="gold">Gold</SelectItem>
                    <SelectItem value="silver">Silver</SelectItem>
                    <SelectItem value="caution">Caution</SelectItem>
                    <SelectItem value="high_risk">High Risk</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={frozenFilter} onValueChange={setFrozenFilter}>
                  <SelectTrigger className="w-36" data-testid="filter-frozen">
                    <SelectValue placeholder="Frozen Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="true">Frozen</SelectItem>
                    <SelectItem value="false">Not Frozen</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {scoresLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : !scores || scores.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <Shield className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No agency scores found</p>
                <p className="text-sm mt-1">Agency scores will appear here once calculated.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table data-testid="scores-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agency ID</TableHead>
                      <TableHead>Overall Score</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead>Frozen</TableHead>
                      <TableHead>Last Calculated</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scores.map((score) => (
                      <TableRow key={score.id} data-testid={`score-row-${score.agencyId}`}>
                        <TableCell>
                          <span className="font-mono text-sm" data-testid={`agency-id-${score.agencyId}`} title={score.agencyId}>
                            {score.agencyId.length > 12 ? `${score.agencyId.slice(0, 12)}...` : score.agencyId}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm" data-testid={`score-value-${score.agencyId}`}>
                              {score.overallScore}
                            </span>
                            <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${getScoreBarColor(score.overallScore)}`}
                                style={{ width: `${Math.min(score.overallScore, 100)}%` }}
                              />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{getTierBadge(score.tier)}</TableCell>
                        <TableCell>
                          {score.isFrozen ? (
                            <Lock className="w-4 h-4 text-blue-500" data-testid={`frozen-icon-${score.agencyId}`} />
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {score.lastCalculatedAt ? new Date(score.lastCalculatedAt).toLocaleDateString() : "N/A"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" data-testid={`actions-btn-${score.agencyId}`}>
                                Actions <ChevronDown className="w-3 h-3 ml-1" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => recalcOneMutation.mutate(score.agencyId)}
                                data-testid={`action-recalculate-${score.agencyId}`}
                              >
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Recalculate
                              </DropdownMenuItem>
                              {score.isFrozen ? (
                                <DropdownMenuItem
                                  onClick={() => unfreezeMutation.mutate(score.agencyId)}
                                  data-testid={`action-unfreeze-${score.agencyId}`}
                                >
                                  <Unlock className="w-4 h-4 mr-2" />
                                  Unfreeze Score
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() => setFreezeAgencyId(score.agencyId)}
                                  data-testid={`action-freeze-${score.agencyId}`}
                                >
                                  <Lock className="w-4 h-4 mr-2" />
                                  Freeze Score
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() => setHistoryAgencyId(score.agencyId)}
                                data-testid={`action-history-${score.agencyId}`}
                              >
                                <History className="w-4 h-4 mr-2" />
                                View History
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setAddEventAgencyId(score.agencyId)}
                                data-testid={`action-add-event-${score.agencyId}`}
                              >
                                <Plus className="w-4 h-4 mr-2" />
                                Add Event
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <WeightConfigSection weights={weights || []} isLoading={weightsLoading} />

        {historyAgencyId && (
          <ScoreHistoryDialog
            agencyId={historyAgencyId}
            onClose={() => setHistoryAgencyId(null)}
          />
        )}

        {freezeAgencyId && (
          <Dialog open onOpenChange={() => { setFreezeAgencyId(null); setFreezeReason(""); }}>
            <DialogContent className="max-w-md" data-testid="freeze-dialog">
              <DialogHeader>
                <DialogTitle>Freeze Score</DialogTitle>
                <DialogDescription>
                  Provide a reason for freezing the score for agency {freezeAgencyId}.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Reason</Label>
                  <Textarea
                    value={freezeReason}
                    onChange={(e) => setFreezeReason(e.target.value)}
                    placeholder="Enter reason for freezing..."
                    data-testid="input-freeze-reason"
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() => freezeMutation.mutate({ agencyId: freezeAgencyId, reason: freezeReason })}
                  disabled={freezeMutation.isPending || !freezeReason.trim()}
                  data-testid="button-confirm-freeze"
                >
                  {freezeMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
                  Freeze Score
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {addEventAgencyId && (
          <Dialog open onOpenChange={() => { setAddEventAgencyId(null); setEventDescription(""); }}>
            <DialogContent className="max-w-md" data-testid="add-event-dialog">
              <DialogHeader>
                <DialogTitle>Add Compliance Event</DialogTitle>
                <DialogDescription>
                  Record a compliance event for agency {addEventAgencyId}.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Agency ID</Label>
                  <Input value={addEventAgencyId} disabled data-testid="input-event-agency-id" />
                </div>
                <div>
                  <Label>Event Type</Label>
                  <Select value={eventType} onValueChange={setEventType}>
                    <SelectTrigger data-testid="select-event-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="violation_minor">Violation (Minor)</SelectItem>
                      <SelectItem value="violation_major">Violation (Major)</SelectItem>
                      <SelectItem value="positive_feedback">Positive Feedback</SelectItem>
                      <SelectItem value="negative_feedback">Negative Feedback</SelectItem>
                      <SelectItem value="payment_verified">Payment Verified</SelectItem>
                      <SelectItem value="payment_unverified">Payment Unverified</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Severity</Label>
                  <Select value={eventSeverity} onValueChange={setEventSeverity}>
                    <SelectTrigger data-testid="select-event-severity">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">Info</SelectItem>
                      <SelectItem value="minor">Minor</SelectItem>
                      <SelectItem value="major">Major</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={eventDescription}
                    onChange={(e) => setEventDescription(e.target.value)}
                    placeholder="Describe the compliance event..."
                    data-testid="input-event-description"
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() =>
                    addEventMutation.mutate({
                      agencyId: addEventAgencyId,
                      eventType,
                      severity: eventSeverity,
                      description: eventDescription,
                    })
                  }
                  disabled={addEventMutation.isPending || !eventDescription.trim()}
                  data-testid="button-submit-event"
                >
                  {addEventMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                  Add Event
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </AdminLayout>
  );
}

function ScoreHistoryDialog({ agencyId, onClose }: { agencyId: string; onClose: () => void }) {
  const { data: historyData, isLoading } = useQuery<{ history: ScoreHistory[] }>({
    queryKey: ["/api/admin/agency-scores", agencyId, "history"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/agency-scores/${agencyId}/history`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
  });

  const history = historyData?.history || [];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh]" data-testid="history-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Score History
          </DialogTitle>
          <DialogDescription>History for agency {agencyId}</DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto max-h-[60vh] space-y-3">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : !history || history.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No history entries found</p>
            </div>
          ) : (
            history.map((entry) => (
              <Card key={entry.id} data-testid={`history-entry-${entry.id}`}>
                <CardContent className="p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      by {entry.triggeredBy}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="font-bold text-sm">{entry.previousScore}</span>
                    <span className="text-muted-foreground text-xs">&rarr;</span>
                    <span className="font-bold text-sm">{entry.newScore}</span>
                    <span className="mx-1 text-muted-foreground">|</span>
                    {getTierBadge(entry.previousTier)}
                    <span className="text-muted-foreground text-xs">&rarr;</span>
                    {getTierBadge(entry.newTier)}
                  </div>
                  {entry.changeReason && (
                    <p className="text-xs text-muted-foreground mt-2">{entry.changeReason}</p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WeightConfigSection({ weights, isLoading }: { weights: ScoreWeight[]; isLoading: boolean }) {
  const { toast } = useToast();

  const updateWeightMutation = useMutation({
    mutationFn: async ({ id, weight }: { id: string; weight: number }) => {
      const res = await apiRequest("PATCH", `/api/admin/agency-score-weights/${id}`, { weight });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Weight updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/agency-score-weights"] });
    },
    onError: (error: any) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Card data-testid="weight-config-section">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Score Weight Configuration
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : !weights || weights.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <p className="text-sm">No weight factors configured</p>
          </div>
        ) : (
          <div className="space-y-4">
            {weights.map((w) => (
              <WeightRow key={w.id} weight={w} onSave={(val) => updateWeightMutation.mutate({ id: w.id, weight: val })} isPending={updateWeightMutation.isPending} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WeightRow({ weight, onSave, isPending }: { weight: ScoreWeight; onSave: (val: number) => void; isPending: boolean }) {
  const [value, setValue] = useState(String(weight.weight));

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 border rounded-md" data-testid={`weight-row-${weight.id}`}>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm" data-testid={`weight-name-${weight.id}`}>{weight.factorName}</p>
        <p className="text-xs text-muted-foreground">{weight.description}</p>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-24"
          step="0.01"
          min="0"
          max="1"
          data-testid={`input-weight-${weight.id}`}
        />
        <Button
          size="sm"
          onClick={() => onSave(parseFloat(value))}
          disabled={isPending || parseFloat(value) === weight.weight}
          data-testid={`button-save-weight-${weight.id}`}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
