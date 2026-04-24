import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeft, ShieldCheck, Search, CheckCircle, XCircle,
  AlertTriangle, HelpCircle, Download, ClipboardList,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { checkAgencyName } from "@/lib/agency-name-check";

interface VerifyResult {
  licenseNumber: string;
  status: "Valid" | "Expired" | "Blacklisted" | "Not Found";
  agencyName: string | null;
  expiryDate: string | null;
  validUntil: string;
}

const STATUS_CONFIG: Record<VerifyResult["status"], {
  label: string; icon: typeof CheckCircle; color: string; bg: string; border: string;
}> = {
  Valid:       { label: "Valid",       icon: CheckCircle,    color: "text-emerald-700", bg: "bg-emerald-50",  border: "border-emerald-200" },
  Expired:     { label: "Expired",     icon: AlertTriangle,  color: "text-amber-700",   bg: "bg-amber-50",    border: "border-amber-200" },
  Blacklisted: { label: "Blacklisted", icon: XCircle,        color: "text-red-700",     bg: "bg-red-50",      border: "border-red-200" },
  "Not Found": { label: "Not Found",   icon: HelpCircle,     color: "text-gray-500",    bg: "bg-gray-50",     border: "border-gray-200" },
};

const LICENSE_REGEX = /\bRA\/\d{4}\/\d{2}\/\d+\b/gi;

function extractLicenseNumbers(text: string): string[] {
  const matches = text.match(LICENSE_REGEX) ?? [];
  return [...new Set(matches.map(m => m.toUpperCase()))];
}

const EXAMPLE = `RA/2025/04/25
RA/2025/07/122
RA/2026/01/37
RA/2025/09/45`;

export default function BulkAgencyVerifyPage() {
  const { toast } = useToast();
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<VerifyResult[] | null>(null);
  const [extracted, setExtracted] = useState<string[]>([]);

  function handleExtract() {
    const nums = extractLicenseNumbers(inputText);
    setExtracted(nums);
    if (nums.length === 0) {
      toast({ title: "No license numbers found", description: "Make sure they follow the format: RA/YYYY/MM/N", variant: "destructive" });
    }
  }

  async function handleVerify() {
    const nums = extracted.length ? extracted : extractLicenseNumbers(inputText);
    if (nums.length === 0) {
      toast({ title: "No license numbers to verify", variant: "destructive" });
      return;
    }
    if (nums.length > 100) {
      toast({ title: "Too many entries", description: "Maximum 100 license numbers per request.", variant: "destructive" });
      return;
    }
    setLoading(true);
    setResults(null);
    try {
      const res = await apiRequest("POST", "/api/agencies/bulk-verify", { licenseNumbers: nums });
      const data = await res.json();
      setResults(data.results);
    } catch {
      toast({ title: "Verification failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function downloadCSV() {
    if (!results) return;
    const header = ["License Number", "Agency Name", "Status", "Valid Until", "Name Check"];
    const rows = results.map(r => {
      const nc = r.agencyName ? checkAgencyName(r.agencyName) : null;
      const nameCheck = !nc ? "—" : !nc.warning ? "OK" : `${nc.risk}: ${nc.matches.join("; ")}`;
      return [r.licenseNumber, r.agencyName ?? "—", r.status, r.validUntil, nameCheck];
    });
    const csv = [header, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `nea-bulk-verify-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  }

  const counts = results ? {
    valid: results.filter(r => r.status === "Valid").length,
    expired: results.filter(r => r.status === "Expired").length,
    blacklisted: results.filter(r => r.status === "Blacklisted").length,
    notFound: results.filter(r => r.status === "Not Found").length,
  } : null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-16">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Back */}
        <Link href="/tools">
          <a className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
            <ArrowLeft className="h-4 w-4" /> Back to Tools
          </a>
        </Link>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-12 w-12 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
              <ShieldCheck className="h-6 w-6 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Bulk Agency Verifier</h1>
              <p className="text-sm text-muted-foreground">Check multiple NEA license numbers at once</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            Paste a list of text containing NEA license numbers (format: <span className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">RA/YYYY/MM/N</span>).
            The tool extracts all license numbers automatically and checks them against the live NEA database of <strong>1,294 agencies</strong>.
          </p>
        </div>

        {/* Input */}
        <Card className="mb-6">
          <CardContent className="p-5 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
                  <ClipboardList className="h-4 w-4 text-muted-foreground" />
                  Paste agency names, license numbers, or any text
                </label>
                <button
                  onClick={() => setInputText(EXAMPLE)}
                  className="text-xs text-teal-600 hover:underline"
                  data-testid="button-load-example"
                >
                  Load example
                </button>
              </div>
              <textarea
                value={inputText}
                onChange={e => { setInputText(e.target.value); setExtracted([]); setResults(null); }}
                placeholder={`Paste any text containing license numbers, e.g.:\n\nRA/2025/04/25 – Alpha Recruitment\nRA/2026/01/37\nRA/2025/07/122`}
                rows={8}
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-400 font-mono resize-y"
                data-testid="input-bulk-text"
              />
              <p className="text-xs text-muted-foreground mt-1">Up to 100 license numbers per request</p>
            </div>

            {/* Preview extracted */}
            {extracted.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                  {extracted.length} license number{extracted.length > 1 ? "s" : ""} extracted:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {extracted.map(l => (
                    <span key={l} className="font-mono text-xs bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 px-2 py-0.5 rounded">
                      {l}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleExtract}
                disabled={!inputText.trim()}
                className="gap-2"
                data-testid="button-extract"
              >
                <Search className="h-4 w-4" />
                Extract Numbers
              </Button>
              <Button
                onClick={handleVerify}
                disabled={loading || !inputText.trim()}
                className="gap-2 bg-teal-600 hover:bg-teal-700 text-white"
                data-testid="button-verify"
              >
                <ShieldCheck className="h-4 w-4" />
                {loading ? "Verifying…" : "Verify All"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {results && (
          <div className="space-y-4">
            {/* Summary bar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {counts!.valid > 0 && (
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1">
                    <CheckCircle className="h-3 w-3" /> {counts!.valid} Valid
                  </Badge>
                )}
                {counts!.expired > 0 && (
                  <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1">
                    <AlertTriangle className="h-3 w-3" /> {counts!.expired} Expired
                  </Badge>
                )}
                {counts!.blacklisted > 0 && (
                  <Badge className="bg-red-100 text-red-700 border-red-200 gap-1">
                    <XCircle className="h-3 w-3" /> {counts!.blacklisted} Blacklisted
                  </Badge>
                )}
                {counts!.notFound > 0 && (
                  <Badge variant="outline" className="text-gray-500 gap-1">
                    <HelpCircle className="h-3 w-3" /> {counts!.notFound} Not Found
                  </Badge>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={downloadCSV}
                className="gap-2 shrink-0"
                data-testid="button-download-csv"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
            </div>

            {/* Results table */}
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/40">
                      <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wide">License #</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wide">Agency Name</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wide">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wide">Valid Until</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400 text-xs uppercase tracking-wide">Name Check</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {results.map((r, idx) => {
                      const cfg = STATUS_CONFIG[r.status];
                      const Icon = cfg.icon;
                      return (
                        <tr
                          key={r.licenseNumber}
                          className={`${idx % 2 === 0 ? "" : "bg-gray-50/30 dark:bg-gray-900/10"}`}
                          data-testid={`result-row-${r.licenseNumber}`}
                        >
                          <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">
                            {r.licenseNumber}
                          </td>
                          <td className="px-4 py-3 text-gray-800 dark:text-gray-200">
                            {r.agencyName ? (
                              <Link href={`/nea-agencies`}>
                                <a className="hover:text-teal-600 hover:underline">{r.agencyName}</a>
                              </Link>
                            ) : (
                              <span className="text-gray-400 italic">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
                              <Icon className="h-3.5 w-3.5" />
                              {cfg.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs whitespace-nowrap">
                            {r.validUntil}
                          </td>
                          <td className="px-4 py-3">
                            {r.agencyName ? (() => {
                              const nc = checkAgencyName(r.agencyName!);
                              if (!nc.warning) return <span className="text-xs text-emerald-600 font-medium">✓ OK</span>;
                              return (
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${nc.risk === "HIGH" ? "bg-red-100 text-red-700 border-red-200" : "bg-amber-100 text-amber-700 border-amber-200"}`}
                                  title={nc.message}
                                >
                                  <AlertTriangle className="h-3 w-3" />
                                  {nc.risk}
                                </span>
                              );
                            })() : <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <p className="text-xs text-center text-muted-foreground">
              Data sourced from the NEA Kenya registry. Last synced from official NEA records.{" "}
              <a href="https://www.nea.go.ke" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">
                Verify at nea.go.ke →
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
