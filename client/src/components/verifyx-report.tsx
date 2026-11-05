/**
 * VerifyX evidence report — shared by visa and offer-letter checks.
 *
 * No "genuine/fake" verdict and no percentage. Every finding shows what was
 * examined, what the document says, what the evidence says, whether it is
 * confirmed or only suspected, how to verify it yourself, and when it was
 * checked. Users can correct misread fields (free re-check) or ask for a
 * manual review.
 */
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertOctagon, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, ExternalLink, FileSearch,
  HelpCircle, Info, Loader2, Pencil, RefreshCw, ShieldCheck, UserCheck,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fetchCsrfToken } from "@/lib/queryClient";

export type EvidenceStatus =
  | "officially_confirmed" | "consistent_with_requirements" | "confirmed_discrepancy"
  | "potential_risk_indicator" | "unable_to_verify" | "manual_review_required";

export interface VxFinding {
  id: string; code: string; status: EvidenceStatus; priority: "high" | "medium" | "low";
  title: string; examined: string; documentSays?: string; evidenceSays?: string; whyItMatters?: string;
  howToVerify?: string; howToVerifyUrl?: string; checkedAt: string; uncertainty?: string;
  method: string; downgradedFrom?: EvidenceStatus;
  source?: { sourceId: string; authority: string; url: string; retrievedAt: string | null; ruleId?: string; ruleVersion?: number };
  documentRefs?: Array<{ field: string; value: string | null; ocrConfidence: number | null; userConfirmed?: boolean }>;
}

export interface VxReport {
  ok: true; engine: "verifyx"; engineVersion: string; tool: "visa_check" | "offer_check";
  requestId?: string; referenceNo?: string; revision: number; checkedAt: string;
  outcome: "discrepancies_found" | "needs_attention" | "no_discrepancies_found" | "insufficient_information";
  headline: string; explanation: string; limitation: string;
  counts: Record<EvidenceStatus, number>;
  findings: VxFinding[];
  extractedFields: Array<{ field: string; label: string; value: string | null; confidence: number | null; userCorrected: boolean; correctable: boolean }>;
  documentKind: string | null;
  country: { code: string; name: string; flag: string; links: Record<string, string | null>; contacts: Record<string, string | null>; generalGuidance: string; guidanceLastReviewed: string } | null;
  officialCheck: { title: string; url: string | null; capability: string; needs: string | null; limitation: string };
  sourcesUsed: Array<{ id: string; title: string; authority: string; url: string; retrievedAt: string | null }>;
  generalScamAwareness: string[];
  disclaimer: string;
  _accessKey?: string;
}

export const STATUS_META: Record<EvidenceStatus, { label: string; icon: any; chip: string; border: string; explain: string }> = {
  confirmed_discrepancy: {
    label: "Confirmed discrepancy", icon: AlertOctagon,
    chip: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300", border: "border-l-red-500",
    explain: "A contradiction we could reproduce from reliable evidence.",
  },
  manual_review_required: {
    label: "Manual review required", icon: UserCheck,
    chip: "bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300", border: "border-l-purple-500",
    explain: "Needs a person to look at it.",
  },
  potential_risk_indicator: {
    label: "Potential risk indicator", icon: AlertTriangle,
    chip: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300", border: "border-l-amber-500",
    explain: "Suspicious but not confirmed — check it.",
  },
  unable_to_verify: {
    label: "Unable to verify", icon: HelpCircle,
    chip: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", border: "border-l-slate-400",
    explain: "The sources available to us cannot establish this.",
  },
  consistent_with_requirements: {
    label: "Consistent with official requirements", icon: CheckCircle2,
    chip: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300", border: "border-l-sky-500",
    explain: "Matches published rules or records — not proof of authenticity.",
  },
  officially_confirmed: {
    label: "Officially confirmed", icon: ShieldCheck,
    chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300", border: "border-l-emerald-500",
    explain: "Confirmed through an authorised official channel.",
  },
};

const OUTCOME_STYLE: Record<VxReport["outcome"], string> = {
  discrepancies_found: "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30",
  needs_attention: "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30",
  no_discrepancies_found: "border-sky-300 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/30",
  insufficient_information: "border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40",
};

const ORDER: EvidenceStatus[] = [
  "confirmed_discrepancy", "manual_review_required", "potential_risk_indicator",
  "unable_to_verify", "consistent_with_requirements", "officially_confirmed",
];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "unknown date";
  try { return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); } catch { return iso; }
}

function headersFor(report: VxReport, csrf: string): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json", "X-CSRF-Token": csrf };
  if (report._accessKey) h["x-verifyx-key"] = report._accessKey;
  return h;
}

export function VerifyXReportView({ report, onReportChange, onReset, docNoun }: {
  report: VxReport; onReportChange: (r: VxReport) => void; onReset: () => void; docNoun: string;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reviewSent, setReviewSent] = useState(false);
  const [reviewMsg, setReviewMsg] = useState("");
  const [showReview, setShowReview] = useState(false);

  const grouped = useMemo(() => {
    const m = new Map<EvidenceStatus, VxFinding[]>();
    for (const f of report.findings) m.set(f.status, [...(m.get(f.status) ?? []), f]);
    return ORDER.filter((s) => m.has(s)).map((s) => [s, m.get(s)!] as const);
  }, [report.findings]);

  async function submitCorrections(values: Record<string, string | null>, confirmed: string[]) {
    if (!report.requestId) return;
    setBusy(true);
    try {
      const csrf = await fetchCsrfToken();
      const res = await fetch(`/api/verifyx/requests/${report.requestId}/corrections`, {
        method: "POST", credentials: "include", headers: headersFor(report, csrf),
        body: JSON.stringify({ values, confirmed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message ?? "Could not re-check.");
      onReportChange({ ...body, _accessKey: report._accessKey });
      setEditing(false);
      toast({ title: "Re-checked", description: "Your corrections were applied. No extra charge." });
    } catch (e: any) {
      toast({ title: "Couldn't re-check", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function requestReview() {
    if (!report.requestId) return;
    setBusy(true);
    try {
      const csrf = await fetchCsrfToken();
      const res = await fetch(`/api/verifyx/requests/${report.requestId}/review`, {
        method: "POST", credentials: "include", headers: headersFor(report, csrf),
        body: JSON.stringify({ kind: "dispute", message: reviewMsg }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message ?? "Could not send.");
      setReviewSent(true); setShowReview(false);
      toast({ title: "Review requested", description: "Our team will look at this report. A WorkAbroadHub review is not a government verification." });
    } catch (e: any) {
      toast({ title: "Couldn't send", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4" data-testid="verifyx-report">
      {/* Headline */}
      <Card className={`border-2 ${OUTCOME_STYLE[report.outcome]}`}>
        <CardContent className="pt-5 pb-5 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[11px] font-semibold tracking-wide text-gray-600 dark:text-gray-400 uppercase">
              VerifyX evidence report{report.country ? ` · ${report.country.flag} ${report.country.name}` : ""}
            </span>
            {report.referenceNo && (
              <span className="text-[11px] font-mono text-gray-600 dark:text-gray-400" data-testid="text-reference">
                Ref {report.referenceNo}{report.revision > 1 ? ` · rev ${report.revision}` : ""}
              </span>
            )}
          </div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-snug" data-testid="text-headline">{report.headline}</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{report.explanation}</p>
          <div className="flex flex-wrap gap-1.5">
            {ORDER.filter((s) => report.counts[s] > 0).map((s) => {
              const M = STATUS_META[s];
              return (
                <span key={s} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${M.chip}`}>
                  <M.icon className="h-3 w-3" /> {report.counts[s]} {M.label}
                </span>
              );
            })}
          </div>
          <div className="rounded-md bg-white/70 dark:bg-black/20 border border-gray-200 dark:border-gray-800 p-2.5 text-xs text-gray-700 dark:text-gray-300 flex gap-2">
            <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span>{report.limitation}</span>
          </div>
          <p className="text-[11px] text-gray-500">Checked {fmtDate(report.checkedAt)}</p>
        </CardContent>
      </Card>

      {/* Official check */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-2">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-teal-600" /> Check it with the official source
          </h3>
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{report.officialCheck.title}</p>
          {report.officialCheck.needs && <p className="text-xs text-gray-600 dark:text-gray-400">What you need: {report.officialCheck.needs}</p>}
          <p className="text-xs text-gray-600 dark:text-gray-400">{report.officialCheck.limitation}</p>
          {report.officialCheck.url && (
            <a href={report.officialCheck.url} target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-1 text-sm font-semibold text-teal-700 dark:text-teal-400 hover:underline" data-testid="link-official-check">
              Open official service <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </CardContent>
      </Card>

      {/* Findings */}
      {grouped.map(([status, items]) => (
        <div key={status} className="space-y-2">
          <div className="flex items-baseline gap-2 px-1">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">{STATUS_META[status].label}</h3>
            <span className="text-[11px] text-gray-500">{STATUS_META[status].explain}</span>
          </div>
          {items.map((f) => <FindingCard key={f.id} f={f} />)}
        </div>
      ))}

      {/* Extracted fields + corrections */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <FileSearch className="h-4 w-4 text-teal-600" /> What we read from your {docNoun}
            </h3>
            {report.requestId && !editing && (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)} data-testid="button-correct-details">
                <Pencil className="h-3.5 w-3.5 mr-1" /> Correct details
              </Button>
            )}
          </div>
          {editing ? (
            <CorrectionForm fields={report.extractedFields} busy={busy} onCancel={() => setEditing(false)} onSubmit={submitCorrections} />
          ) : (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              {report.extractedFields.filter((x) => x.value).map((x) => (
                <div key={x.field} className="text-xs min-w-0">
                  <dt className="text-gray-500">{x.label}</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100 break-words whitespace-pre-wrap">
                    {x.value}
                    {x.userCorrected ? <span className="ml-1 text-[10px] text-teal-700">(confirmed by you)</span>
                      : x.confidence != null && x.confidence < 85 ? <span className="ml-1 text-[10px] text-amber-700">(unclear — please check)</span> : null}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <p className="text-[11px] text-gray-500">If anything was misread, correct it and we will re-run the checks free of charge. Contradictions based on unclear readings are never shown as confirmed until you confirm the value.</p>
        </CardContent>
      </Card>

      {/* Sources */}
      {report.sourcesUsed.length > 0 && (
        <Card>
          <CardContent className="pt-4 pb-4 space-y-2">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Official sources used</h3>
            <ul className="space-y-1.5">
              {report.sourcesUsed.map((s) => (
                <li key={s.id} className="text-xs">
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium text-teal-700 dark:text-teal-400 hover:underline inline-flex items-center gap-1">
                    {s.title} <ExternalLink className="h-3 w-3" />
                  </a>
                  <span className="text-gray-500"> — {s.authority} · data as of {fmtDate(s.retrievedAt)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* General guidance */}
      {(report.country?.generalGuidance || report.generalScamAwareness.length > 0) && (
        <Card>
          <CardContent className="pt-4 pb-4 space-y-2">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">General guidance{report.country ? ` for ${report.country.name}` : ""}</h3>
            <p className="text-[11px] text-gray-500">General information last reviewed {report.country?.guidanceLastReviewed ?? "—"}. It was not matched against your document.</p>
            {report.country?.generalGuidance && <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{report.country.generalGuidance}</p>}
            {report.generalScamAwareness.length > 0 && (
              <ul className="list-disc pl-5 space-y-1">
                {report.generalScamAwareness.map((p, i) => <li key={i} className="text-xs text-gray-700 dark:text-gray-300">{p}</li>)}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Review / dispute */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-2">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Disagree with a finding?</h3>
          {reviewSent ? (
            <p className="text-xs text-teal-700 dark:text-teal-400">Review requested. Our team will check this report{report.referenceNo ? ` (ref ${report.referenceNo})` : ""}. A WorkAbroadHub review is not a government verification.</p>
          ) : showReview ? (
            <div className="space-y-2">
              <textarea value={reviewMsg} onChange={(e) => setReviewMsg(e.target.value)} maxLength={2000} rows={3}
                className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-2 text-sm"
                placeholder="Tell us which finding you think is wrong and why." data-testid="input-review-message" />
              <div className="flex gap-2">
                <Button size="sm" onClick={requestReview} disabled={busy} data-testid="button-send-review">
                  {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null} Send for review
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowReview(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setShowReview(true)} disabled={!report.requestId} data-testid="button-request-review">
              Request a manual review
            </Button>
          )}
        </CardContent>
      </Card>

      <p className="text-[11px] text-gray-500 leading-relaxed px-1">{report.disclaimer}</p>

      <Button variant="outline" className="w-full" onClick={onReset} data-testid="button-check-another">
        <RefreshCw className="h-4 w-4 mr-2" /> Check another {docNoun}
      </Button>
    </div>
  );
}

function FindingCard({ f }: { f: VxFinding }) {
  const [open, setOpen] = useState(f.priority === "high" || f.status === "confirmed_discrepancy");
  const M = STATUS_META[f.status];
  return (
    <div className={`rounded-lg border border-gray-200 dark:border-gray-800 border-l-4 ${M.border} bg-white dark:bg-gray-950`} data-testid={`finding-${f.code}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-start gap-2 p-3 text-left">
        <M.icon className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{f.title}</p>
          <span className={`inline-block mt-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${M.chip}`}>{M.label}</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>
      {open && (
        <div className="px-3 pb-3 pl-9 space-y-1.5 text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
          <p><span className="font-semibold">What we examined:</span> {f.examined}</p>
          {f.documentSays && <p><span className="font-semibold">The document says:</span> {f.documentSays}</p>}
          {f.evidenceSays && <p><span className="font-semibold">What the evidence shows:</span> {f.evidenceSays}</p>}
          {f.whyItMatters && <p><span className="font-semibold">Why it matters:</span> {f.whyItMatters}</p>}
          {f.uncertainty && <p className="text-gray-600 dark:text-gray-400"><span className="font-semibold">Limits:</span> {f.uncertainty}</p>}
          {f.howToVerify && (
            <p><span className="font-semibold">Check it yourself:</span> {f.howToVerify}{" "}
              {f.howToVerifyUrl && (
                <a href={f.howToVerifyUrl} target="_blank" rel="noopener noreferrer" className="text-teal-700 dark:text-teal-400 hover:underline inline-flex items-center gap-0.5">
                  official link <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </p>
          )}
          {f.source && (
            <p className="text-gray-500">
              Source: <a href={f.source.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{f.source.authority}</a>
              {f.source.retrievedAt ? ` · retrieved ${fmtDate(f.source.retrievedAt)}` : ""}
              {f.source.ruleId ? ` · rule ${f.source.ruleId}${f.source.ruleVersion ? ` v${f.source.ruleVersion}` : " (citation under review)"}` : ""}
            </p>
          )}
          <p className="text-gray-400 text-[10px]">Finding {f.id} · method: {f.method.replace(/_/g, " ")} · checked {fmtDate(f.checkedAt)}</p>
        </div>
      )}
    </div>
  );
}

function CorrectionForm({ fields, busy, onCancel, onSubmit }: {
  fields: VxReport["extractedFields"]; busy: boolean; onCancel: () => void;
  onSubmit: (values: Record<string, string | null>, confirmed: string[]) => void;
}) {
  const editable = fields.filter((f) => f.correctable);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(editable.map((f) => [f.field, f.value ?? ""])));
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  function submit() {
    const changed: Record<string, string | null> = {};
    for (const f of editable) {
      const nv = (vals[f.field] ?? "").trim();
      if (nv !== (f.value ?? "").trim()) changed[f.field] = nv || null;
    }
    onSubmit(changed, [...confirmed].filter((k) => !(k in changed)));
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-600 dark:text-gray-400">Type values exactly as printed on the original. Tick “correct as read” for values that are right — this lets us treat contradictions in them as confirmed.</p>
      {editable.map((f) => (
        <div key={f.field} className="space-y-1">
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300">{f.label}</label>
          {f.field === "mrz" ? (
            <textarea value={vals[f.field]} rows={2} onChange={(e) => setVals((v) => ({ ...v, [f.field]: e.target.value }))}
              className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-2 text-xs font-mono" data-testid={`input-field-${f.field}`} />
          ) : (
            <input value={vals[f.field]} onChange={(e) => setVals((v) => ({ ...v, [f.field]: e.target.value }))}
              className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-2 text-sm" data-testid={`input-field-${f.field}`} />
          )}
          {f.value && (
            <label className="flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-400">
              <input type="checkbox" checked={confirmed.has(f.field)}
                onChange={(e) => setConfirmed((s) => { const n = new Set(s); e.target.checked ? n.add(f.field) : n.delete(f.field); return n; })} />
              Correct as read
            </label>
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={busy} data-testid="button-submit-corrections">
          {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />} Re-check (free)
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
      </div>
    </div>
  );
}
