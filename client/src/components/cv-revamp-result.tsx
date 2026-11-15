/**
 * CV Revamp result — honest before/after (2026-11, Tony's mock-up).
 *
 * Both numbers come from the server (`ats` on the order status), measured by
 * the same engine as the free ATS checker. Nothing here computes, rounds up
 * or invents a score. If the rewrite didn't beat the original, we say so.
 *
 * Mobile-first: scores stack (arrow points down) on phones, sit side by side
 * from sm; improvements are 1 → 2 → 3 columns; buttons are full-width 52px
 * on phones.
 */
import { useState } from "react";
import {
  ArrowDown, ArrowRight, CheckCircle2, Download, FileText, Loader2, Lock, RefreshCw, Search,
  ShieldCheck, Sparkles, Star, Target, TrendingUp, Zap, AlertTriangle,
} from "lucide-react";
import { fetchCsrfToken } from "@/lib/queryClient";

export interface AtsCompare {
  before: number;
  after: number;
  lift: number;
  improvements: { key: string; title: string; detail: string }[];
  measuredAt?: string | null;
}

const ICONS: Record<string, any> = {
  keywords: Search, summary: FileText, structure: Target, achievements: Star, language: Zap, fixed: ShieldCheck,
};

export function CvRevampResult({
  orderId, downloadToken, ats, busy, onDownload,
}: {
  orderId: string;
  downloadToken?: string | null;
  ats: AtsCompare;
  busy: "pdf" | "docx" | null;
  onDownload: (format: "pdf" | "docx") => void;
}) {
  const [recheck, setRecheck] = useState<{ loading: boolean; score?: number; sameVersion?: boolean; error?: string }>({ loading: false });
  const improved = ats.after > ats.before;

  async function runRecheck() {
    setRecheck({ loading: true });
    try {
      const csrf = await fetchCsrfToken().catch(() => "");
      const q = downloadToken ? `?token=${encodeURIComponent(downloadToken)}` : "";
      const res = await fetch(`/api/services/order/${orderId}/ats-recheck${q}`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", ...(csrf ? { "X-CSRF-Token": csrf } : {}) },
        body: "{}",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Couldn't re-check right now.");
      setRecheck({ loading: false, score: data.score, sameVersion: data.sameVersion });
    } catch (e: any) {
      setRecheck({ loading: false, error: e?.message || "Couldn't re-check right now." });
    }
  }

  return (
    <div className="text-left max-w-3xl mx-auto px-1 sm:px-0" data-testid="cv-revamp-result">
      {/* Header */}
      <div className="text-center">
        <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white flex items-center justify-center gap-2">
          <Sparkles className="h-6 w-6 text-emerald-600" />
          {improved ? <>Your CV has been <span className="text-emerald-600 dark:text-emerald-400">revamped</span></> : <>Your CV is ready</>}
        </h3>
        <p className="mt-1 text-sm sm:text-base text-slate-500 dark:text-slate-400">
          {improved ? "Stronger impact. Clearer value. Better results." : "Polished wording and layout — your original was already strong."}
        </p>
        <div className="mx-auto mt-3 h-1 w-14 rounded bg-emerald-500" />
      </div>

      {/* Scores */}
      <div className="mt-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 sm:p-7 shadow-sm">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-6">
          <div className="text-center flex-1">
            <p className="text-xs font-bold tracking-[0.2em] text-slate-500">ORIGINAL</p>
            <p className="text-6xl sm:text-7xl font-extrabold text-slate-600 dark:text-slate-300 tabular-nums leading-none mt-1" data-testid="text-score-before">{ats.before}%</p>
          </div>
          <div className="text-emerald-500" aria-hidden>
            <ArrowDown className="h-10 w-10 sm:hidden" />
            <ArrowRight className="h-14 w-14 hidden sm:block" />
          </div>
          <div className="text-center flex-1">
            <p className="text-xs font-bold tracking-[0.2em] text-emerald-600">REVAMPED</p>
            <p className="text-6xl sm:text-7xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums leading-none mt-1" data-testid="text-score-after">{ats.after}%</p>
            {improved ? (
              <div className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 px-4 py-2">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
                <div className="text-left">
                  <p className="font-extrabold text-emerald-700 dark:text-emerald-300 leading-tight">+{ats.lift} point{ats.lift === 1 ? "" : "s"}</p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">Overall improvement</p>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500 max-w-[220px] mx-auto">Your original already scored highly, so there was little room to gain.</p>
            )}
          </div>
        </div>
        <p className="mt-4 text-center text-[11px] text-slate-500 dark:text-slate-400">
          Both scores measured by the same ATS checker as our free tool — the file you download is the exact version scored.
        </p>
      </div>

      {/* Improvements */}
      {ats.improvements.length > 0 && (
        <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <p className="flex items-center gap-2 font-bold text-slate-900 dark:text-white"><ShieldCheck className="h-5 w-5 text-emerald-600" /> Key improvements</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ats.improvements.map((imp) => {
              const Icon = ICONS[imp.key] ?? CheckCircle2;
              return (
                <div key={imp.key} className="flex gap-3">
                  <span className="h-11 w-11 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center shrink-0"><Icon className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-slate-900 dark:text-white">{imp.title}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-snug break-words">{imp.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <button type="button" disabled={busy !== null} onClick={() => onDownload("docx")}
          className="inline-flex items-center justify-center gap-2 min-h-[52px] rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-70 text-white font-semibold" data-testid="success-download-docx">
          {busy === "docx" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />} Download as Word
        </button>
        <button type="button" disabled={busy !== null} onClick={() => onDownload("pdf")}
          className="inline-flex items-center justify-center gap-2 min-h-[52px] rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-70 text-white font-semibold" data-testid="success-download-pdf">
          {busy === "pdf" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />} Download as PDF
        </button>
        <button type="button" disabled={recheck.loading} onClick={runRecheck}
          className="inline-flex items-center justify-center gap-2 min-h-[52px] rounded-xl border-2 border-slate-300 dark:border-slate-600 hover:border-emerald-500 text-slate-800 dark:text-slate-100 font-semibold" data-testid="button-recheck-cv">
          {recheck.loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />} Check this CV again
        </button>
      </div>

      {(recheck.score !== undefined || recheck.error) && (
        <div className={`mt-3 rounded-xl px-4 py-3 text-sm ${recheck.error ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" : "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"}`} data-testid="recheck-result">
          {recheck.error ? (
            <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {recheck.error}</span>
          ) : (
            <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />
              Checked again: <strong>{recheck.score}%</strong>
              {recheck.sameVersion ? " — the same version we delivered and scored." : " on our ATS checker just now."}
            </span>
          )}
        </div>
      )}

      <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><Lock className="h-3.5 w-3.5 text-emerald-600" /> Your data is secure and handled with confidentiality.</p>
    </div>
  );
}
