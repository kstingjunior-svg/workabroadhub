import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import AdminLayout from "@/components/admin-layout";
import {
  XCircle,
  AlertTriangle,
  Clock,
  Leaf,
  CheckCircle2,
  Search,
  ArrowUpDown,
  Shield,
} from "lucide-react";

interface LicenseAgency {
  id: string;
  agencyName: string;
  licenseNumber: string;
  email: string | null;
  website: string | null;
  serviceType: string | null;
  issuingAuthority: string;
  issueDate: string;
  expiryDate: string;
  daysRemaining: number;
  category: string;
  color: string;
  statusOverride: string | null;
}

interface LicenseSummary {
  total: number;
  expired: number;
  expiringSoon: number;
  expiring60: number;
  expiring90: number;
  valid: number;
}

interface LicenseResponse {
  summary: LicenseSummary;
  agencies: LicenseAgency[];
}

type FilterCategory = "all" | "expired" | "expiring_soon" | "expiring_60" | "expiring_90" | "valid";
type SortField = "agencyName" | "daysRemaining" | "expiryDate";
type SortDirection = "asc" | "desc";

function getStatusBadge(category: string, daysRemaining: number) {
  switch (category) {
    case "expired":
      return (
        <Badge className="bg-red-600 hover:bg-red-700 text-white" data-testid={`badge-status-expired`}>
          <XCircle className="h-3 w-3 mr-1" />
          Expired
        </Badge>
      );
    case "expiring_soon":
      return (
        <Badge className="bg-orange-500 hover:bg-orange-600 text-white" data-testid={`badge-status-expiring-soon`}>
          <AlertTriangle className="h-3 w-3 mr-1" />
          {daysRemaining} days left
        </Badge>
      );
    case "expiring_60":
      return (
        <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white" data-testid={`badge-status-expiring-60`}>
          <Clock className="h-3 w-3 mr-1" />
          {daysRemaining} days left
        </Badge>
      );
    case "expiring_90":
      return (
        <Badge className="bg-emerald-400 hover:bg-emerald-500 text-white" data-testid={`badge-status-expiring-90`}>
          <Leaf className="h-3 w-3 mr-1" />
          {daysRemaining} days left
        </Badge>
      );
    default:
      return (
        <Badge className="bg-green-600 hover:bg-green-700 text-white" data-testid={`badge-status-valid`}>
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Valid
        </Badge>
      );
  }
}

function getDaysRemainingText(days: number): string {
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return "Expires today";
  if (days === 1) return "1 day remaining";
  return `${days} days remaining`;
}

export default function LicenseExpiry() {
  const [activeFilter, setActiveFilter] = useState<FilterCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("daysRemaining");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const { data, isLoading } = useQuery<LicenseResponse>({
    queryKey: ["/api/admin/license-expiry-status"],
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const filteredAgencies = data?.agencies
    ?.filter(a => {
      if (activeFilter !== "all" && a.category !== activeFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          a.agencyName.toLowerCase().includes(q) ||
          a.licenseNumber.toLowerCase().includes(q)
        );
      }
      return true;
    })
    ?.sort((a, b) => {
      const dir = sortDirection === "asc" ? 1 : -1;
      if (sortField === "agencyName") return a.agencyName.localeCompare(b.agencyName) * dir;
      if (sortField === "daysRemaining") return (a.daysRemaining - b.daysRemaining) * dir;
      return (new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()) * dir;
    }) || [];

  const summaryCards: { key: FilterCategory; label: string; count: number; icon: any; borderColor: string; textColor: string; bgColor: string }[] = [
    {
      key: "expired",
      label: "Expired Licenses",
      count: data?.summary.expired || 0,
      icon: XCircle,
      borderColor: "border-red-500/50",
      textColor: "text-red-500",
      bgColor: "bg-red-500/10",
    },
    {
      key: "expiring_soon",
      label: "Expiring in 30 Days",
      count: data?.summary.expiringSoon || 0,
      icon: AlertTriangle,
      borderColor: "border-orange-500/50",
      textColor: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
    {
      key: "expiring_60",
      label: "Expiring in 60 Days",
      count: data?.summary.expiring60 || 0,
      icon: Clock,
      borderColor: "border-yellow-500/50",
      textColor: "text-yellow-500",
      bgColor: "bg-yellow-500/10",
    },
    {
      key: "expiring_90",
      label: "Expiring in 90 Days",
      count: data?.summary.expiring90 || 0,
      icon: Leaf,
      borderColor: "border-emerald-500/50",
      textColor: "text-emerald-400",
      bgColor: "bg-emerald-500/10",
    },
  ];

  return (
    <AdminLayout title="License Expiry Status">
      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {summaryCards.map(card => {
              const Icon = card.icon;
              const isActive = activeFilter === card.key;
              return (
                <Card
                  key={card.key}
                  className={`cursor-pointer transition-all hover:scale-[1.02] ${card.borderColor} ${isActive ? "ring-2 ring-primary shadow-lg" : ""}`}
                  onClick={() => setActiveFilter(prev => prev === card.key ? "all" : card.key)}
                  data-testid={`card-filter-${card.key}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className={`h-10 w-10 rounded-lg ${card.bgColor} flex items-center justify-center`}>
                        <Icon className={`h-5 w-5 ${card.textColor}`} />
                      </div>
                      {isActive && (
                        <Badge variant="outline" className="text-xs">Active</Badge>
                      )}
                    </div>
                    <p className={`text-3xl font-bold ${card.textColor}`}>{card.count}</p>
                    <p className="text-xs text-muted-foreground mt-1">{card.label}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <Card className="border-green-500/50 flex-1">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-green-500">{data?.summary.valid || 0}</p>
                  <p className="text-xs text-muted-foreground">Valid (90+ days)</p>
                </div>
              </CardContent>
            </Card>
            <Card className="flex-1">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-3xl font-bold">{data?.summary.total || 0}</p>
                  <p className="text-xs text-muted-foreground">Total Agencies</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <CardTitle className="text-lg">Agency License Details</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search agencies..."
                      className="pl-9"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      data-testid="input-search-license"
                    />
                  </div>
                  {activeFilter !== "all" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveFilter("all")}
                      data-testid="button-clear-filter"
                    >
                      Clear Filter
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full" data-testid="table-license-expiry">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-4 font-medium text-sm">
                        <button
                          className="flex items-center gap-1 hover:text-foreground"
                          onClick={() => handleSort("agencyName")}
                          data-testid="sort-agency-name"
                        >
                          Agency Name
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="text-left p-4 font-medium text-sm hidden sm:table-cell">License No.</th>
                      <th className="text-left p-4 font-medium text-sm hidden lg:table-cell">Issuing Authority</th>
                      <th className="text-left p-4 font-medium text-sm hidden md:table-cell">
                        <button
                          className="flex items-center gap-1 hover:text-foreground"
                          onClick={() => handleSort("expiryDate")}
                          data-testid="sort-expiry-date"
                        >
                          Expiry Date
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="text-left p-4 font-medium text-sm hidden md:table-cell">
                        <button
                          className="flex items-center gap-1 hover:text-foreground"
                          onClick={() => handleSort("daysRemaining")}
                          data-testid="sort-days-remaining"
                        >
                          Days Remaining
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="text-center p-4 font-medium text-sm">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAgencies.map(agency => {
                      const rowBg =
                        agency.category === "expired"
                          ? "bg-red-500/5"
                          : agency.category === "expiring_soon"
                          ? "bg-orange-500/5"
                          : agency.category === "expiring_60"
                          ? "bg-yellow-500/5"
                          : "";
                      return (
                        <tr
                          key={agency.id}
                          className={`border-b last:border-0 ${rowBg} transition-colors hover:bg-muted/50`}
                          data-testid={`row-license-${agency.id}`}
                        >
                          <td className="p-4">
                            <div>
                              <p className="font-medium text-sm">{agency.agencyName}</p>
                              <p className="text-xs text-muted-foreground sm:hidden">{agency.licenseNumber}</p>
                              <p className="text-xs text-muted-foreground md:hidden mt-0.5">
                                {getDaysRemainingText(agency.daysRemaining)}
                              </p>
                            </div>
                          </td>
                          <td className="p-4 hidden sm:table-cell">
                            <code className="text-xs bg-muted px-2 py-1 rounded">{agency.licenseNumber}</code>
                          </td>
                          <td className="p-4 hidden lg:table-cell text-sm text-muted-foreground">
                            {agency.issuingAuthority}
                          </td>
                          <td className="p-4 hidden md:table-cell text-sm">
                            {new Date(agency.expiryDate).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </td>
                          <td className="p-4 hidden md:table-cell">
                            <span
                              className={`text-sm font-medium ${
                                agency.daysRemaining < 0
                                  ? "text-red-500"
                                  : agency.daysRemaining <= 30
                                  ? "text-orange-500"
                                  : agency.daysRemaining <= 60
                                  ? "text-yellow-500"
                                  : agency.daysRemaining <= 90
                                  ? "text-emerald-400"
                                  : "text-green-500"
                              }`}
                            >
                              {getDaysRemainingText(agency.daysRemaining)}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            {getStatusBadge(agency.category, agency.daysRemaining)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredAgencies.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground">
                    No agencies match the current filter.
                  </div>
                )}
              </div>
              <div className="p-4 border-t text-xs text-muted-foreground">
                Showing {filteredAgencies.length} of {data?.summary.total || 0} agencies
                {activeFilter !== "all" && ` (filtered by: ${activeFilter.replace("_", " ")})`}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </AdminLayout>
  );
}
