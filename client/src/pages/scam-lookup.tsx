import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  Search,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Phone,
  FileText,
  CreditCard,
  Building2,
  Mail,
  ArrowLeft,
  AlertCircle,
  Info,
} from "lucide-react";

const riskColors: Record<string, string> = {
  low: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  moderate: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  critical: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const typeIcons: Record<string, any> = {
  phone: Phone,
  license: FileText,
  payment_account: CreditCard,
  name: Building2,
  email: Mail,
};

const typeLabels: Record<string, string> = {
  phone: "Phone Number",
  license: "License Number",
  payment_account: "Payment Account",
  name: "Agency/Entity Name",
  email: "Email Address",
};

export default function ScamLookupPage() {
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["/api/scam-lookup", searchTerm],
    queryFn: async () => {
      if (!searchTerm || searchTerm.length < 2) return null;
      const res = await fetch(`/api/scam-lookup?q=${encodeURIComponent(searchTerm)}`);
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: searchTerm.length >= 2,
    retry: false,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchTerm(query.trim());
  };

  const hasHighRisk = data?.results?.some((r: any) => r.riskLevel === "high" || r.riskLevel === "critical");

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900" data-testid="scam-lookup-page">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="mb-4">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="link-back">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          </Link>
        </div>

        <div className="text-center mb-6">
          <ShieldAlert className="w-12 h-12 mx-auto mb-3 text-teal-600" />
          <h1 className="text-2xl font-bold" data-testid="text-title">Scam Intelligence Lookup</h1>
          <p className="text-muted-foreground mt-1">
            Check phone numbers, agency names, or license numbers against our fraud database
          </p>
        </div>

        <Card className="mb-6">
          <CardContent className="p-4">
            <form onSubmit={handleSearch} className="flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter phone number, agency name, or license..."
                className="flex-1"
                data-testid="input-search"
              />
              <Button type="submit" disabled={query.trim().length < 2 || isFetching} data-testid="button-search">
                <Search className="w-4 h-4 mr-1" /> Search
              </Button>
            </form>
          </CardContent>
        </Card>

        {isFetching && (
          <div className="text-center py-8">
            <div className="animate-spin w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full mx-auto mb-2" />
            <p className="text-muted-foreground">Searching scam database...</p>
          </div>
        )}

        {data && !isFetching && (
          <>
            {hasHighRisk && (
              <div className="mb-4 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg flex gap-3 items-start" data-testid="warning-banner">
                <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-red-700 dark:text-red-300">Warning: High-risk matches found</p>
                  <p className="text-sm text-red-600 dark:text-red-400">
                    One or more results have been reported in multiple fraud incidents. Exercise extreme caution.
                  </p>
                </div>
              </div>
            )}

            {data.results?.length === 0 && (
              <Card className="mb-4">
                <CardContent className="p-6 text-center">
                  <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-green-500" />
                  <h3 className="font-semibold text-lg" data-testid="text-no-results">No matches found</h3>
                  <p className="text-muted-foreground text-sm mt-1">
                    "{data.query}" was not found in our scam intelligence database. This does not guarantee safety — always verify through official channels.
                  </p>
                </CardContent>
              </Card>
            )}

            {data.results?.length > 0 && (
              <div className="space-y-3" data-testid="results-list">
                <p className="text-sm text-muted-foreground">{data.count} match{data.count !== 1 ? "es" : ""} found</p>
                {data.results.map((indicator: any, idx: number) => {
                  const Icon = typeIcons[indicator.indicatorType] || AlertCircle;
                  return (
                    <Card key={indicator.id || idx} className="overflow-hidden" data-testid={`result-card-${idx}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className="p-2 rounded-lg bg-muted">
                              <Icon className="w-5 h-5 text-muted-foreground" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-mono font-semibold text-sm break-all" data-testid={`text-value-${idx}`}>
                                {indicator.value}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {typeLabels[indicator.indicatorType] || indicator.indicatorType}
                              </p>
                              <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
                                <span>{indicator.reportCount} report{indicator.reportCount !== 1 ? "s" : ""}</span>
                                <span>First: {indicator.firstReportedAt ? new Date(indicator.firstReportedAt).toLocaleDateString() : "N/A"}</span>
                                <span>Latest: {indicator.lastReportedAt ? new Date(indicator.lastReportedAt).toLocaleDateString() : "N/A"}</span>
                              </div>
                            </div>
                          </div>
                          <Badge className={riskColors[indicator.riskLevel] || riskColors.low} data-testid={`badge-risk-${idx}`}>
                            {indicator.riskLevel}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Info className="w-4 h-4" /> How to Stay Safe
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>1. Always verify an agency's NEA license on the official government portal before engaging.</p>
            <p>2. Never pay recruitment fees directly to an agent's personal account — use official channels only.</p>
            <p>3. Be suspicious of unrealistic job offers or guaranteed visa promises.</p>
            <p>4. Keep records of all communications, receipts, and agreements.</p>
            <p>5. Report suspicious activity to protect others in the community.</p>
          </CardContent>
        </Card>

        <div className="mt-4 text-center">
          <Link href="/report-fraud">
            <Button variant="outline" data-testid="link-report-fraud">
              <AlertTriangle className="w-4 h-4 mr-2" /> Report a Scam
            </Button>
          </Link>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground" data-testid="text-disclaimer">
          This database is community-driven and may not be exhaustive. Absence from this database does not guarantee legitimacy.
          WorkAbroad Hub does not guarantee employment and is not a recruitment agency.
        </p>
      </div>
    </div>
  );
}
