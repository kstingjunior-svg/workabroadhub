/**
 * /admin/ielts-interest — IELTS Phase 0 demand-validation dashboard.
 *
 * 2026-06: Tony's signal-tracker before deciding whether to build the
 * full IELTS prep LMS. Shows total signups, last 24h / 7d momentum,
 * what % are already paying WAH users, distribution across target bands
 * / test windows / proficiency, and the full signup list.
 *
 * Heuristic for the build-or-pivot call:
 *   - 200+ signups in 2 weeks → build the full thing
 *   - 30-100 signups → ship a thin v1 (essay-feedback-only)
 *   - <30 signups → pivot, build something else
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft, Loader2, BookOpen, RefreshCcw, Mail, TrendingUp, Users,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Signup {
  id: string;
  email: string;
  targetBand: string | null;
  plannedTestWindow: string | null;
  currentProficiency: string | null;
  testType: string | null;
  referralSource: string | null;
  isWahUser: boolean;
  userId: string | null;
  createdAt: string;
  notifiedAt: string | null;
}

interface Overview {
  totalSignups: number;
  last24h: number;
  last7d: number;
  alreadyWahUsers: number;
  byTargetBand:   Record<string, number>;
  byTestWindow:   Record<string, number>;
  byCurrentLevel: Record<string, number>;
  byTestType:     Record<string, number>;
  signups: Signup[];
}

const WINDOW_LABEL: Record<string, string> = {
  within_1_month:  "Within 1 month",
  "1_to_3_months": "1-3 months",
  "3_to_6_months": "3-6 months",
  "6_plus_months": "6+ months",
  unsure:          "Not booked yet",
  unknown:         "Unknown",
};

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-bold mt-0.5">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function DistributionList({ title, data, formatLabel }: { title: string; data: Record<string, number>; formatLabel?: (k: string) => string }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(data).sort(([, a], [, b]) => b - a);
  return (
    <div>
      <h3 className="font-semibold text-sm mb-2">{title}</h3>
      {sorted.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No data yet.</p>
      ) : (
        <ul className="space-y-1">
          {sorted.map(([k, n]) => {
            const pct = total > 0 ? Math.round((n / total) * 100) : 0;
            return (
              <li key={k} className="text-xs flex items-center gap-2">
                <span className="w-32 truncate">{formatLabel ? formatLabel(k) : k}</span>
                <div className="flex-1 h-2 bg-muted/40 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                </div>
                <span className="font-mono w-16 text-right text-muted-foreground">{n} · {pct}%</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function IeltsInterestAdmin() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/admin/ielts/interest", { credentials: "include" });
      if (res.status === 401 || res.status === 403) {
        setError("Admin access required."); setLoading(false); return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (err: any) {
      setError(err?.message || "Could not load.");
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function downloadCsv() {
    if (!data) return;
    const header = ["email","target_band","planned_test_window","current_proficiency","test_type","is_wah_user","created_at"];
    const rows = data.signups.map((s) => [
      s.email, s.targetBand ?? "", s.plannedTestWindow ?? "",
      s.currentProficiency ?? "", s.testType ?? "",
      s.isWahUser ? "yes" : "no",
      new Date(s.createdAt).toISOString(),
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `ielts-interest-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      <div className="bg-gradient-to-br from-amber-700 to-orange-600 text-white px-4 pt-4 pb-6">
        <div className="max-w-5xl mx-auto">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/10 -ml-2 mb-2">
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to admin
            </Button>
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6" /> IELTS Prep — interest signups
          </h1>
          <p className="text-sm text-amber-100 mt-0.5">
            Track demand before committing to the full build. Targets: 200+ in 2 weeks → ship.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 mt-4 space-y-4">
        <div className="flex flex-wrap gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={load}><RefreshCcw className="h-4 w-4 mr-1.5" /> Reload</Button>
          <Button variant="outline" size="sm" onClick={downloadCsv} disabled={!data || data.signups.length === 0}>
            <Mail className="h-4 w-4 mr-1.5" /> Download CSV (for ConvertKit / Mailchimp)
          </Button>
        </div>

        {loading && (
          <Card><CardContent className="p-8 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </CardContent></Card>
        )}

        {!loading && error && (
          <Card className="border-rose-200 bg-rose-50 dark:bg-rose-900/10">
            <CardContent className="p-4 flex items-start gap-2 text-sm text-rose-700 dark:text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />{error}
            </CardContent>
          </Card>
        )}

        {!loading && data && (
          <>
            {/* Stat tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Total signups"   value={data.totalSignups} hint="all-time" />
              <Stat label="Last 24h"        value={data.last24h} hint="momentum" />
              <Stat label="Last 7 days"     value={data.last7d} hint="weekly trend" />
              <Stat label="Already paying"  value={data.alreadyWahUsers} hint="WAH account holders" />
            </div>

            {/* Build-or-pivot recommendation */}
            {(() => {
              if (data.totalSignups >= 200) {
                return (
                  <Card className="border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20">
                    <CardContent className="p-4 flex items-start gap-2">
                      <TrendingUp className="h-5 w-5 text-emerald-700 dark:text-emerald-300 shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-semibold text-emerald-900 dark:text-emerald-200">SHIP IT — strong demand</p>
                        <p className="text-xs mt-0.5 text-emerald-800 dark:text-emerald-300/90">
                          200+ signups proves the market. Start authoring content + AI feedback engine.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              }
              if (data.totalSignups >= 30) {
                return (
                  <Card className="border-amber-300 bg-amber-50 dark:bg-amber-900/20">
                    <CardContent className="p-4 flex items-start gap-2">
                      <TrendingUp className="h-5 w-5 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-semibold text-amber-900 dark:text-amber-200">SHIP THIN V1 — moderate demand</p>
                        <p className="text-xs mt-0.5 text-amber-800 dark:text-amber-300/90">
                          {data.totalSignups} signups. Start with essay-feedback-only at KES 500/essay to validate willingness-to-pay.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              }
              return (
                <Card className="border-muted">
                  <CardContent className="p-4 flex items-start gap-2">
                    <Users className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-semibold">EARLY — keep collecting</p>
                      <p className="text-xs mt-0.5 text-muted-foreground">
                        {data.totalSignups} signups so far. Give it 2 weeks before deciding. Cross-post on WAH WhatsApp / IG to boost reach.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Distributions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card><CardContent className="p-4">
                <DistributionList title="Target band score" data={data.byTargetBand} />
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <DistributionList title="Planned test window" data={data.byTestWindow} formatLabel={(k) => WINDOW_LABEL[k] ?? k} />
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <DistributionList title="Current English level" data={data.byCurrentLevel} />
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <DistributionList title="Test type" data={data.byTestType} />
              </CardContent></Card>
            </div>

            {/* Full list */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Mail className="h-4 w-4" /> All signups ({data.signups.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {data.signups.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">No signups yet — share the dashboard with users to start collecting.</div>
                ) : (
                  <ul className="divide-y">
                    {data.signups.map((s) => (
                      <li key={s.id} className="px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{s.email}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.targetBand && <>Band <strong>{s.targetBand}</strong> · </>}
                            {s.plannedTestWindow && <>{WINDOW_LABEL[s.plannedTestWindow] ?? s.plannedTestWindow} · </>}
                            {s.currentProficiency && <>{s.currentProficiency} · </>}
                            {s.testType && <>{s.testType}</>}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {s.isWahUser && (
                            <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700 bg-emerald-50">
                              Paying WAH user
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(s.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
