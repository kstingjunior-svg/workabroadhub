/**
 * /admin/nea-sync — admin control panel for the live NEA sync pipeline.
 *
 * Shows:
 *   • Last sync (when, what changed, total active/expired counts)
 *   • "Trigger auto-fetch" button (runs the same code path as the weekly cron)
 *   • "Paste NEA export" textarea (CSV/TSV/HTML from neaims.go.ke)
 *   • Sync history table (last 20 runs, colour-coded by status)
 *
 * Auth: the endpoints reject non-admin sessions, so a non-admin who somehow
 * loads this page just sees permission errors.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Upload,
  Loader2,
  Database,
  XCircle,
  Info,
} from "lucide-react";

interface SyncRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  source: string;
  status: "running" | "ok" | "partial" | "error";
  triggered_by: string | null;
  fetched_rows: number | null;
  new_agencies: number | null;
  updated_agencies: number | null;
  expired_agencies: number | null;
  revoked_agencies: number | null;
  unchanged: number | null;
  active_after: number | null;
  expired_after: number | null;
  error_message: string | null;
  notes: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  ok:      "bg-green-100 text-green-800 border-green-200",
  partial: "bg-amber-100 text-amber-800 border-amber-200",
  error:   "bg-red-100 text-red-800 border-red-200",
  running: "bg-blue-100 text-blue-800 border-blue-200",
};

export default function AdminNEASyncPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pasted, setPasted] = useState("");

  const { data: history } = useQuery<{ runs: SyncRun[] }>({
    queryKey: ["/api/admin/nea-sync/history"],
    refetchInterval: 30_000,
  });
  const { data: lastRun } = useQuery<{ run: SyncRun | null }>({
    queryKey: ["/api/admin/nea-sync/last"],
    refetchInterval: 30_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/nea-sync/history"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/nea-sync/last"] });
    queryClient.invalidateQueries({ queryKey: ["/api/agencies/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/public/stats"] });
  };

  const runAuto = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/nea-sync/auto", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "Auto-sync failed");
      return data;
    },
    onSuccess: (data) => {
      invalidate();
      const s = data?.summary;
      if (s?.status === "error") {
        toast({
          title: "Auto-fetch didn't work",
          description: (s.errorMessage as string) || "NEAIMS likely requires JS — paste the export below instead.",
          variant: "destructive",
          duration: 10000,
        });
      } else {
        toast({
          title: "Auto-sync complete",
          description: `+${s.added} new · ~${s.updated} updated · ⏰${s.expired} expired · ×${s.revoked} revoked`,
          duration: 8000,
        });
      }
    },
    onError: (err: any) => {
      toast({ title: "Sync failed", description: err?.message, variant: "destructive" });
    },
  });

  const runPaste = useMutation({
    mutationFn: async (raw: string) => {
      const res = await fetch("/api/admin/nea-sync/paste", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? "Paste sync failed");
      return data;
    },
    onSuccess: (data) => {
      invalidate();
      setPasted("");
      const s = data?.summary;
      if (s?.status === "error") {
        toast({
          title: "Parse failed",
          description: s.errorMessage || "Couldn't extract agency rows from that paste.",
          variant: "destructive",
          duration: 10000,
        });
      } else {
        toast({
          title: "Sync complete from your paste",
          description: `Parsed ${s.fetchedRows} rows · +${s.added} new · ~${s.updated} updated · ⏰${s.expired} expired · ×${s.revoked} revoked`,
          duration: 10000,
        });
      }
    },
    onError: (err: any) => {
      toast({ title: "Sync failed", description: err?.message, variant: "destructive" });
    },
  });

  const busy = runAuto.isPending || runPaste.isPending;
  const runs = history?.runs ?? [];
  const last = lastRun?.run ?? null;

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Database className="h-6 w-6" /> NEA Live Sync
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Reconcile our agency database with the National Employment Authority's live register at{" "}
            <a href="https://neaims.go.ke/EmploymentAgencyList.aspx" target="_blank" rel="noopener noreferrer" className="underline">
              neaims.go.ke
            </a>. Weekly auto-sync fires every Monday 02:00 EAT.
          </p>
        </div>

        {/* Last sync card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" /> Most recent sync
            </CardTitle>
          </CardHeader>
          <CardContent>
            {last ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={STATUS_STYLES[last.status] || ""}>{last.status.toUpperCase()}</Badge>
                  <span className="text-sm text-muted-foreground">
                    {new Date(last.started_at).toLocaleString("en-KE")} · via <b>{last.source}</b>
                  </span>
                </div>
                {last.status !== "error" ? (
                  <div className="text-sm">
                    <span className="text-green-700 font-semibold">+{last.new_agencies ?? 0} new</span> ·{" "}
                    <span className="text-blue-700 font-semibold">~{last.updated_agencies ?? 0} updated</span> ·{" "}
                    <span className="text-amber-700 font-semibold">⏰{last.expired_agencies ?? 0} expired</span> ·{" "}
                    <span className="text-red-700 font-semibold">×{last.revoked_agencies ?? 0} revoked</span>
                    <div className="text-xs text-muted-foreground mt-1">
                      After sync: <b>{last.active_after ?? "?"}</b> active · <b>{last.expired_after ?? "?"}</b> expired
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-red-800 bg-red-50 border border-red-200 rounded p-3">
                    <AlertTriangle className="inline h-4 w-4 mr-1" />
                    {last.error_message || "Sync failed."}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No syncs have run yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Two side-by-side action cards */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Auto-fetch */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <RefreshCw className="h-4 w-4" /> Auto-fetch from NEAIMS
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Attempts a direct HTTP fetch of the NEA register. NEAIMS uses ASP.NET
                pagination that often blocks non-browser requests — if this returns
                zero rows, use the paste method on the right.
              </p>
              <Button
                onClick={() => runAuto.mutate()}
                disabled={busy}
                className="w-full gap-2"
                data-testid="btn-nea-auto-sync"
              >
                {runAuto.isPending
                  ? (<><Loader2 className="h-4 w-4 animate-spin" /> Fetching…</>)
                  : (<><RefreshCw className="h-4 w-4" /> Run auto-sync now</>)}
              </Button>
            </CardContent>
          </Card>

          {/* Paste */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4" /> Paste NEA export
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Export the agency list from{" "}
                <a href="https://neaims.go.ke/EmploymentAgencyList.aspx" target="_blank" rel="noopener noreferrer" className="underline">
                  NEAIMS
                </a>{" "}
                (Excel/CSV) and paste below. Also accepts pasting the visible HTML table.
              </p>
              <Textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder="Paste NEA CSV, TSV, or HTML here…"
                rows={5}
                data-testid="input-nea-paste"
                className="font-mono text-xs"
              />
              <Button
                onClick={() => runPaste.mutate(pasted)}
                disabled={busy || pasted.trim().length < 100}
                className="w-full gap-2"
                data-testid="btn-nea-paste-sync"
              >
                {runPaste.isPending
                  ? (<><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>)
                  : (<><Upload className="h-4 w-4" /> Sync from paste</>)}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* History */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Info className="h-4 w-4" /> Sync history (last 20 runs)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {runs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No sync runs yet. Trigger one above to populate this table.
              </p>
            ) : (
              <div className="overflow-x-auto -mx-2 sm:mx-0">
                <table className="w-full text-sm min-w-[720px]">
                  <thead className="text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="text-left p-2">When</th>
                      <th className="text-left p-2">Source</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-right p-2">Parsed</th>
                      <th className="text-right p-2">+New</th>
                      <th className="text-right p-2">~Upd</th>
                      <th className="text-right p-2">⏰Exp</th>
                      <th className="text-right p-2">×Rev</th>
                      <th className="text-right p-2">Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-2 whitespace-nowrap text-xs">
                          {new Date(r.started_at).toLocaleString("en-KE", {
                            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                          })}
                        </td>
                        <td className="p-2 text-xs">{r.source}</td>
                        <td className="p-2">
                          <Badge className={`text-xs ${STATUS_STYLES[r.status] || ""}`}>
                            {r.status === "ok" && <CheckCircle2 className="h-3 w-3 mr-0.5 inline" />}
                            {r.status === "error" && <XCircle className="h-3 w-3 mr-0.5 inline" />}
                            {r.status}
                          </Badge>
                        </td>
                        <td className="p-2 text-right text-xs tabular-nums">{r.fetched_rows ?? "—"}</td>
                        <td className="p-2 text-right text-xs tabular-nums text-green-700">{r.new_agencies ?? 0}</td>
                        <td className="p-2 text-right text-xs tabular-nums text-blue-700">{r.updated_agencies ?? 0}</td>
                        <td className="p-2 text-right text-xs tabular-nums text-amber-700">{r.expired_agencies ?? 0}</td>
                        <td className="p-2 text-right text-xs tabular-nums text-red-700">{r.revoked_agencies ?? 0}</td>
                        <td className="p-2 text-right text-xs tabular-nums font-semibold">{r.active_after ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
