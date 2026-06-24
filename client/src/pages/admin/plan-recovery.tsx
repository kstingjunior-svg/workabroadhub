/**
 * /admin/plan-recovery — fix users who were wrongly cross-granted access
 * from a one-off service payment (CV Fix Lite, Cover Letter, etc.).
 *
 * Background (2026-06):
 * For weeks the payment-initiation code wrote the raw serviceId
 * (e.g. "cv_fix_lite") into payments.plan_id whenever the request didn't
 * start with "plan_". The M-Pesa callback then activated that string AS
 * A SUBSCRIPTION TIER, flipping users.plan to "cv_fix_lite" and giving
 * the user full job-application access they never paid KES 99 for.
 *
 * Tony's direct quote (the bug report):
 *   "for the documentations, it is only for the documentations and the
 *    papers that are needed to be fixed only. So fixing a paper there
 *    does not mean that you have the rights to go and continue applying
 *    jobs. So can you separate the two entities?"
 *
 * The bug is patched at three layers (payment creation, callback gate,
 * pipeline gate). This page handles the cleanup for users already
 * affected before the patches landed.
 *
 * UX is deliberately two-step:
 *   1. Click "Preview" to see exactly which users + subscriptions will
 *      be reset back to "free". Nothing is changed.
 *   2. Click "Apply recovery" to commit the fix inside a transaction.
 *
 * Safe to run repeatedly — second click reports zero affected rows.
 */
import { useState } from "react";
import { Link } from "wouter";
import AdminLayout from "@/components/admin-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft, Search, ShieldAlert, CheckCircle2, Loader2,
  RotateCcw, AlertTriangle,
} from "lucide-react";

interface AffectedUser  { id: string; email: string | null; plan: string; user_stage: string | null; }
interface AffectedSub   { id: string; user_id: string; plan: string; status?: string; end_date?: string | null; }
interface ScanResponse  {
  mode: "preview" | "dry-run" | "apply";
  success?: boolean;
  affectedUserCount: number;
  affectedSubscriptionCount: number;
  users?: AffectedUser[];
  subscriptions?: AffectedSub[];
  canonicalTiers?: string[];
  message?: string;
  note?: string;
}

export default function PlanRecoveryPage() {
  const { toast } = useToast();
  const [scan,    setScan]    = useState<ScanResponse | null>(null);
  const [applied, setApplied] = useState<ScanResponse | null>(null);
  const [loading, setLoading] = useState<"none" | "scan" | "apply">("none");

  async function runScan() {
    setLoading("scan");
    setApplied(null);
    try {
      const r = await apiRequest("GET", "/api/admin/recover-cross-granted-plans");
      const j: ScanResponse = await r.json();
      setScan(j);
      toast({
        title: "Scan complete",
        description: `${j.affectedUserCount} user(s), ${j.affectedSubscriptionCount} bogus subscription row(s) found.`,
      });
    } catch (e: any) {
      toast({ title: "Scan failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setLoading("none");
    }
  }

  async function runApply() {
    if (!scan || scan.affectedUserCount + scan.affectedSubscriptionCount === 0) {
      toast({ title: "Nothing to apply", description: "Run a Preview scan first." });
      return;
    }
    const confirmed = window.confirm(
      `This will reset ${scan.affectedUserCount} user(s) back to "free" and expire ` +
      `${scan.affectedSubscriptionCount} bogus subscription row(s). Continue?`,
    );
    if (!confirmed) return;

    setLoading("apply");
    try {
      const r = await apiRequest("POST", "/api/admin/recover-cross-granted-plans", { dryRun: false });
      const j: ScanResponse = await r.json();
      setApplied(j);
      setScan(null);
      toast({
        title: "Recovery applied",
        description: j.message ?? `Reset ${j.affectedUserCount} user(s) to free.`,
      });
    } catch (e: any) {
      toast({ title: "Recovery failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    } finally {
      setLoading("none");
    }
  }

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/admin" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to admin
            </Link>
            <h1 className="text-2xl font-bold mt-2 flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-amber-600" /> Cross-grant recovery
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Finds users whose plan was accidentally set to a service ID (like
              <code className="mx-1 px-1 rounded bg-muted">cv_fix_lite</code>) by the old payment code path.
              Resets them back to <Badge variant="outline">free</Badge> and expires the bogus subscription row.
              Safe to run repeatedly.
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={runScan} disabled={loading !== "none"} variant="outline">
                {loading === "scan"
                  ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  : <Search className="h-4 w-4 mr-2" />}
                Preview affected users
              </Button>
              <Button
                onClick={runApply}
                disabled={loading !== "none" || !scan || scan.affectedUserCount + scan.affectedSubscriptionCount === 0}
                variant="destructive"
              >
                {loading === "apply"
                  ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  : <RotateCcw className="h-4 w-4 mr-2" />}
                Apply recovery
              </Button>
              {scan?.canonicalTiers && (
                <span className="text-xs text-muted-foreground">
                  Canonical tiers: {scan.canonicalTiers.join(", ")}
                </span>
              )}
            </div>

            {!scan && !applied && (
              <p className="text-sm text-muted-foreground">
                Click <b>Preview</b> to see if any users are currently sitting on a non-canonical plan.
              </p>
            )}

            {applied && (
              <div className="rounded-md border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 p-4">
                <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200 font-medium">
                  <CheckCircle2 className="h-5 w-5" /> Recovery applied
                </div>
                <p className="text-sm mt-1 text-emerald-900 dark:text-emerald-100">
                  {applied.message ?? `${applied.affectedUserCount} user(s) reset to free.`}
                </p>
              </div>
            )}

            {scan && scan.affectedUserCount === 0 && scan.affectedSubscriptionCount === 0 && (
              <div className="rounded-md border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 p-4 flex items-center gap-2 text-emerald-800 dark:text-emerald-200">
                <CheckCircle2 className="h-5 w-5" />
                Database is clean — no cross-granted users found.
              </div>
            )}

            {scan && (scan.affectedUserCount > 0 || scan.affectedSubscriptionCount > 0) && (
              <div className="space-y-4">
                <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-4 flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-700 dark:text-amber-300 mt-0.5" />
                  <div className="text-sm text-amber-900 dark:text-amber-100">
                    <b>{scan.affectedUserCount}</b> user(s) and <b>{scan.affectedSubscriptionCount}</b> subscription row(s) need cleanup.
                    Review the lists below, then click <b>Apply recovery</b>.
                  </div>
                </div>

                {scan.users && scan.users.length > 0 && (
                  <div>
                    <div className="text-sm font-medium mb-2">Users to downgrade</div>
                    <div className="border rounded-md overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left px-3 py-2">User ID</th>
                            <th className="text-left px-3 py-2">Email</th>
                            <th className="text-left px-3 py-2">Current plan</th>
                            <th className="text-left px-3 py-2">Stage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scan.users.map((u) => (
                            <tr key={u.id} className="border-t">
                              <td className="px-3 py-2 font-mono text-xs">{u.id.slice(0, 8)}…</td>
                              <td className="px-3 py-2">{u.email ?? "—"}</td>
                              <td className="px-3 py-2">
                                <Badge variant="destructive">{u.plan}</Badge>
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">{u.user_stage ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {scan.subscriptions && scan.subscriptions.length > 0 && (
                  <div>
                    <div className="text-sm font-medium mb-2">Bogus subscription rows to expire</div>
                    <div className="border rounded-md overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left px-3 py-2">Sub ID</th>
                            <th className="text-left px-3 py-2">User ID</th>
                            <th className="text-left px-3 py-2">Plan</th>
                            <th className="text-left px-3 py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scan.subscriptions.map((s) => (
                            <tr key={s.id} className="border-t">
                              <td className="px-3 py-2 font-mono text-xs">{s.id.slice(0, 8)}…</td>
                              <td className="px-3 py-2 font-mono text-xs">{s.user_id.slice(0, 8)}…</td>
                              <td className="px-3 py-2">
                                <Badge variant="destructive">{s.plan}</Badge>
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">{s.status ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
