import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users, TrendingUp, UserCheck, UserX, ArrowRight,
  Download, RefreshCw, Phone, Mail, Clock
} from "lucide-react";
import { Loader2 } from "lucide-react";

interface StageStats {
  totalUsers: number;
  paidCount: number;
  freeCount: number;
  conversionRate: number;
  stages: { stage: string; count: number; percentage: number }[];
}

interface NonPayingUser {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  plan: string;
  userStage: string;
  createdAt: string | null;
  lastLogin: string | null;
  isInactive: boolean;
  daysSinceSignup: number | null;
}

interface NonPayingResponse {
  total: number;
  users: NonPayingUser[];
}

const STAGE_CONFIG: Record<string, { label: string; color: string; badge: string }> = {
  new:      { label: "New",      color: "bg-blue-500",  badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  active:   { label: "Active",   color: "bg-green-500", badge: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  paid:     { label: "Paid",     color: "bg-amber-500", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  inactive: { label: "Inactive", color: "bg-gray-400",  badge: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
};

export default function AdminFunnelPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  if (!user || !(user as any).isAdmin) {
    navigate("/dashboard");
    return null;
  }

  const { data: stageStats, isLoading: stagesLoading, refetch: refetchStages } = useQuery<StageStats>({
    queryKey: ["/api/admin/analytics/user-stages"],
  });

  const { data: nonPaying, isLoading: nonPayingLoading } = useQuery<NonPayingResponse>({
    queryKey: ["/api/non-paying-users"],
  });

  const fmtDate = (d: string | null) => {
    if (!d) return "Never";
    return new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
  };

  const fmtPhone = (p: string | null) => p || "—";

  const downloadCsv = () => {
    if (!nonPaying?.users) return;
    const rows = [
      ["Name", "Email", "Phone", "Stage", "Signup Date", "Last Login", "Days Since Signup", "Inactive"],
      ...nonPaying.users.map((u) => [
        `${u.firstName || ""} ${u.lastName || ""}`.trim(),
        u.email || "",
        u.phone || "",
        u.userStage,
        fmtDate(u.createdAt),
        fmtDate(u.lastLogin),
        String(u.daysSinceSignup ?? ""),
        u.isInactive ? "Yes" : "No",
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `non-paying-users-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} className="text-muted-foreground">
            ← Admin
          </Button>
        </div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" />
          Conversion Funnel
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track every user from signup → active → paid. Identify retargeting opportunities.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total Users", value: stageStats?.totalUsers ?? "—", icon: Users, color: "text-blue-600" },
          { label: "Paid Users", value: stageStats?.paidCount ?? "—", icon: UserCheck, color: "text-green-600" },
          { label: "Free Users", value: stageStats?.freeCount ?? "—", icon: UserX, color: "text-orange-500" },
          { label: "Conversion", value: stageStats ? `${stageStats.conversionRate}%` : "—", icon: TrendingUp, color: "text-purple-600" },
        ].map((s) => (
          <Card key={s.label} data-testid={`stat-${s.label.toLowerCase().replace(/\s/g,"-")}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <s.icon className={`h-4 w-4 ${s.color}`} />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              {stagesLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Funnel visualization */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">User Stage Funnel</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => refetchStages()} data-testid="btn-refresh-funnel">
              <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {stagesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              {(["new", "active", "paid", "inactive"] as const).map((stage, i, arr) => {
                const stat = stageStats?.stages.find((s) => s.stage === stage);
                const cfg = STAGE_CONFIG[stage];
                return (
                  <div key={stage}>
                    <div className="flex items-center gap-3 mb-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>
                        {cfg.label}
                      </span>
                      <span className="text-sm font-bold text-foreground">{stat?.count ?? 0} users</span>
                      <span className="text-xs text-muted-foreground">({stat?.percentage ?? 0}%)</span>
                    </div>
                    <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${cfg.color}`}
                        style={{ width: `${stat?.percentage ?? 0}%` }}
                      />
                    </div>
                    {i < arr.length - 1 && (
                      <div className="flex items-center gap-1 mt-2 ml-1">
                        <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Non-paying users table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-base">Non-Paying Users</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {nonPaying?.total ?? "..."} registered users on the Free plan — retarget via WhatsApp or email
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadCsv}
              disabled={!nonPaying?.users?.length}
              data-testid="btn-download-csv"
            >
              <Download className="h-4 w-4 mr-1.5" /> Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {nonPayingLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !nonPaying?.users?.length ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No free-plan users found
            </div>
          ) : (
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-2 text-xs text-muted-foreground font-medium">User</th>
                    <th className="text-left py-2 px-2 text-xs text-muted-foreground font-medium">Contact</th>
                    <th className="text-left py-2 px-2 text-xs text-muted-foreground font-medium">Stage</th>
                    <th className="text-left py-2 px-2 text-xs text-muted-foreground font-medium">Joined</th>
                    <th className="text-left py-2 px-2 text-xs text-muted-foreground font-medium">Last Login</th>
                    <th className="text-left py-2 px-2 text-xs text-muted-foreground font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {nonPaying.users.map((u) => {
                    const cfg = STAGE_CONFIG[u.userStage] ?? STAGE_CONFIG.new;
                    return (
                      <tr key={u.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors" data-testid={`row-user-${u.id}`}>
                        <td className="py-2.5 px-2">
                          <p className="font-medium text-foreground">
                            {`${u.firstName || ""} ${u.lastName || ""}`.trim() || "—"}
                          </p>
                        </td>
                        <td className="py-2.5 px-2">
                          <div className="space-y-0.5">
                            {u.email && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Mail className="h-3 w-3" /> {u.email}
                              </div>
                            )}
                            {u.phone && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Phone className="h-3 w-3" /> {fmtPhone(u.phone)}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badge}`}>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-xs text-muted-foreground">
                          {fmtDate(u.createdAt)}
                          {u.daysSinceSignup !== null && (
                            <div className="text-[10px] text-muted-foreground/60">{u.daysSinceSignup}d ago</div>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {fmtDate(u.lastLogin)}
                          </div>
                        </td>
                        <td className="py-2.5 px-2">
                          {u.isInactive ? (
                            <Badge variant="outline" className="text-[10px] text-red-500 border-red-300">Inactive</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-green-600 border-green-300">Recently Active</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
