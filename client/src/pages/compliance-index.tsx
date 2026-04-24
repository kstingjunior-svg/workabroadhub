import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import {
  Trophy,
  Search,
  Diamond,
  Award,
  Medal,
  Shield,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronLeft,
  ChevronRight,
  Globe,
  Building2,
  Star,
  BarChart3,
  ArrowLeft,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from "lucide-react";

interface IndexScore {
  id: string;
  agencyId: string;
  agencyName: string | null;
  compositeScore: number;
  licenseValidityScore: number;
  govVerificationScore: number;
  legitimacyScore: number;
  complianceHistoryScore: number;
  fraudDetectionScore: number;
  userFeedbackScore: number;
  globalRank: number | null;
  countryRank: number | null;
  industryRank: number | null;
  badge: string;
  country: string | null;
  city: string | null;
  industry: string | null;
  calculatedAt: string;
}

interface IndexStats {
  totalRanked: number;
  avgScore: number;
  diamondCount: number;
  platinumCount: number;
  goldCount: number;
  silverCount: number;
}

interface IndexHistory {
  id: string;
  compositeScore: number;
  globalRank: number | null;
  badge: string | null;
  calculatedAt: string;
}

function badgeIcon(badge: string) {
  switch (badge) {
    case "diamond": return <Diamond className="w-5 h-5 text-cyan-400" />;
    case "platinum": return <Award className="w-5 h-5 text-purple-500" />;
    case "gold": return <Medal className="w-5 h-5 text-amber-500" />;
    case "silver": return <Shield className="w-5 h-5 text-gray-400" />;
    default: return null;
  }
}

function badgeLabel(badge: string) {
  const colors: Record<string, string> = {
    diamond: "bg-gradient-to-r from-cyan-400 to-blue-500 text-white",
    platinum: "bg-gradient-to-r from-purple-400 to-purple-600 text-white",
    gold: "bg-gradient-to-r from-amber-400 to-amber-600 text-white",
    silver: "bg-gradient-to-r from-gray-300 to-gray-500 text-white",
  };
  if (!colors[badge]) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${colors[badge]}`} data-testid={`badge-${badge}`}>
      {badgeIcon(badge)} {badge.charAt(0).toUpperCase() + badge.slice(1)}
    </span>
  );
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-blue-600";
  if (score >= 40) return "text-yellow-600";
  return "text-red-600";
}

function scoreProgressColor(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-blue-500";
  if (score >= 40) return "bg-yellow-500";
  return "bg-red-500";
}

function rankDisplay(rank: number | null) {
  if (!rank) return "-";
  if (rank === 1) return "1st";
  if (rank === 2) return "2nd";
  if (rank === 3) return "3rd";
  return `${rank}th`;
}

export default function ComplianceIndexPage() {
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("");
  const [industry, setIndustry] = useState("");
  const [badgeFilter, setBadgeFilter] = useState("");
  const [page, setPage] = useState(0);
  const [selectedAgency, setSelectedAgency] = useState<string | null>(null);
  const pageSize = 50;

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (country && country !== "_all") params.set("country", country);
  if (industry && industry !== "_all") params.set("industry", industry);
  if (badgeFilter && badgeFilter !== "_all") params.set("badge", badgeFilter);
  params.set("limit", String(pageSize));
  params.set("offset", String(page * pageSize));
  const queryStr = params.toString();

  const { data: rankings, isLoading } = useQuery<IndexScore[]>({
    queryKey: ["/api/compliance-index", queryStr],
    queryFn: async () => {
      const res = await fetch(`/api/compliance-index?${queryStr}`);
      return res.json();
    },
  });

  const { data: stats } = useQuery<IndexStats>({
    queryKey: ["/api/compliance-index/stats"],
  });

  const { data: filters } = useQuery<{ countries: string[]; industries: string[] }>({
    queryKey: ["/api/compliance-index/filters"],
  });

  const { data: agencyDetail } = useQuery({
    queryKey: ["/api/compliance-index", selectedAgency],
    queryFn: async () => {
      const res = await fetch(`/api/compliance-index/${selectedAgency}`);
      return res.json();
    },
    enabled: !!selectedAgency,
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900" data-testid="compliance-index-page">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="mb-2">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="link-back-home">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to Home
            </Button>
          </Link>
        </div>

        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <Trophy className="w-10 h-10 text-amber-500" />
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-teal-600 to-blue-600 bg-clip-text text-transparent" data-testid="text-page-title">
              Compliance Index
            </h1>
          </div>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Trusted Agency Rankings — Verified compliance scores for employment agencies worldwide
          </p>
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6" data-testid="stats-bar">
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-teal-600" data-testid="stat-total">{stats.totalRanked}</p>
                <p className="text-xs text-muted-foreground">Ranked Agencies</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-blue-600" data-testid="stat-avg">{stats.avgScore}</p>
                <p className="text-xs text-muted-foreground">Avg Score</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <Diamond className="w-4 h-4 text-cyan-400" />
                  <span className="text-2xl font-bold" data-testid="stat-diamond">{stats.diamondCount}</span>
                </div>
                <p className="text-xs text-muted-foreground">Diamond</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <Award className="w-4 h-4 text-purple-500" />
                  <span className="text-2xl font-bold" data-testid="stat-platinum">{stats.platinumCount}</span>
                </div>
                <p className="text-xs text-muted-foreground">Platinum</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <Medal className="w-4 h-4 text-amber-500" />
                  <span className="text-2xl font-bold" data-testid="stat-gold">{stats.goldCount}</span>
                </div>
                <p className="text-xs text-muted-foreground">Gold</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <Shield className="w-4 h-4 text-gray-400" />
                  <span className="text-2xl font-bold" data-testid="stat-silver">{stats.silverCount}</span>
                </div>
                <p className="text-xs text-muted-foreground">Silver</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-3 items-end">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search agencies..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                    className="pl-9"
                    data-testid="input-search"
                  />
                </div>
              </div>
              <Select value={country || "_all"} onValueChange={(v) => { setCountry(v === "_all" ? "" : v); setPage(0); }}>
                <SelectTrigger className="w-44" data-testid="select-country">
                  <SelectValue placeholder="All Countries" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All Countries</SelectItem>
                  {filters?.countries?.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={industry || "_all"} onValueChange={(v) => { setIndustry(v === "_all" ? "" : v); setPage(0); }}>
                <SelectTrigger className="w-44" data-testid="select-industry">
                  <SelectValue placeholder="All Industries" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All Industries</SelectItem>
                  {filters?.industries?.map((ind) => (
                    <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={badgeFilter || "_all"} onValueChange={(v) => { setBadgeFilter(v === "_all" ? "" : v); setPage(0); }}>
                <SelectTrigger className="w-36" data-testid="select-badge">
                  <SelectValue placeholder="All Badges" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All Badges</SelectItem>
                  <SelectItem value="diamond">Diamond</SelectItem>
                  <SelectItem value="platinum">Platinum</SelectItem>
                  <SelectItem value="gold">Gold</SelectItem>
                  <SelectItem value="silver">Silver</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : !rankings || rankings.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <BarChart3 className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2" data-testid="text-no-rankings">No Rankings Available</h3>
              <p className="text-muted-foreground">Rankings have not been calculated yet or no agencies match your filters.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="space-y-2" data-testid="rankings-list">
              {rankings.map((agency) => (
                <Card
                  key={agency.id}
                  className="cursor-pointer hover:shadow-lg transition-all hover:border-teal-300 dark:hover:border-teal-700"
                  onClick={() => setSelectedAgency(agency.agencyId)}
                  data-testid={`agency-card-${agency.agencyId}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-teal-100 to-blue-100 dark:from-teal-900 dark:to-blue-900 flex items-center justify-center">
                        <span className="text-lg font-bold text-teal-700 dark:text-teal-300" data-testid={`rank-${agency.agencyId}`}>
                          #{agency.globalRank || "-"}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold truncate" data-testid={`name-${agency.agencyId}`}>
                            {agency.agencyName || "Unknown Agency"}
                          </h3>
                          {badgeLabel(agency.badge)}
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1 flex-wrap">
                          {agency.country && (
                            <span className="flex items-center gap-1">
                              <Globe className="w-3 h-3" /> {agency.country}
                            </span>
                          )}
                          {agency.industry && (
                            <span className="flex items-center gap-1">
                              <Building2 className="w-3 h-3" /> {agency.industry}
                            </span>
                          )}
                          {agency.countryRank && (
                            <span className="text-xs">Country #{agency.countryRank}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex-shrink-0 text-right">
                        <p className={`text-2xl font-bold ${scoreColor(agency.compositeScore)}`} data-testid={`score-${agency.agencyId}`}>
                          {agency.compositeScore}
                        </p>
                        <p className="text-xs text-muted-foreground">/ 100</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex justify-between items-center mt-6">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(p => Math.max(0, p - 1))}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Previous
              </Button>
              <span className="text-sm text-muted-foreground" data-testid="text-page-info">
                Page {page + 1} {rankings.length === pageSize && "(more available)"}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={rankings.length < pageSize}
                onClick={() => setPage(p => p + 1)}
                data-testid="button-next-page"
              >
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </>
        )}

        {selectedAgency && agencyDetail?.score && (
          <Dialog open={!!selectedAgency} onOpenChange={() => setSelectedAgency(null)}>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="agency-detail-dialog">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {badgeIcon(agencyDetail.score.badge)}
                  {agencyDetail.score.agencyName || "Agency Details"}
                </DialogTitle>
                <DialogDescription>
                  Global Rank: #{agencyDetail.score.globalRank || "N/A"}
                  {agencyDetail.score.country && ` | ${agencyDetail.score.country}`}
                  {agencyDetail.score.countryRank && ` (Country #${agencyDetail.score.countryRank})`}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5">
                <div className="text-center">
                  <span className={`text-5xl font-bold ${scoreColor(agencyDetail.score.compositeScore)}`} data-testid="detail-score">
                    {agencyDetail.score.compositeScore}
                  </span>
                  <p className="text-sm text-muted-foreground mt-1">Compliance Score</p>
                  {badgeLabel(agencyDetail.score.badge)}
                </div>

                <div className="space-y-3" data-testid="score-breakdown">
                  <h4 className="font-semibold text-sm">Score Breakdown</h4>
                  {[
                    { label: "License Validity", score: agencyDetail.score.licenseValidityScore, weight: 30 },
                    { label: "Government Verification", score: agencyDetail.score.govVerificationScore, weight: 20 },
                    { label: "Legitimacy Score", score: agencyDetail.score.legitimacyScore, weight: 20 },
                    { label: "Compliance History", score: agencyDetail.score.complianceHistoryScore, weight: 10 },
                    { label: "Fraud Detection", score: agencyDetail.score.fraudDetectionScore, weight: 10 },
                    { label: "User Feedback", score: agencyDetail.score.userFeedbackScore, weight: 10 },
                  ].map((factor) => (
                    <div key={factor.label} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{factor.label} <span className="text-xs text-muted-foreground">({factor.weight}%)</span></span>
                        <span className={scoreColor(factor.score)}>{factor.score}/100</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${scoreProgressColor(factor.score)}`}
                          style={{ width: `${factor.score}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {agencyDetail.history && agencyDetail.history.length > 1 && (
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Score History</h4>
                    <div className="space-y-1" data-testid="score-history">
                      {agencyDetail.history.slice(0, 10).map((h: IndexHistory, i: number) => (
                        <div key={i} className="flex justify-between text-xs p-1.5 border-b">
                          <span className="text-muted-foreground">{new Date(h.calculatedAt).toLocaleDateString()}</span>
                          <div className="flex items-center gap-2">
                            <span className={scoreColor(h.compositeScore)}>{h.compositeScore}</span>
                            <span className="text-muted-foreground">#{h.globalRank || "-"}</span>
                            {h.badge && h.badge !== "none" && (
                              <span className="text-xs">{badgeIcon(h.badge)}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}

        <div className="mt-10 text-center text-xs text-muted-foreground" data-testid="text-disclaimer">
          <p>Rankings are based on publicly available compliance data and are updated daily.</p>
          <p>This index does not guarantee employment or endorse any agency. <Link href="/privacy-policy" className="underline">Privacy Policy</Link></p>
        </div>
      </div>
    </div>
  );
}
