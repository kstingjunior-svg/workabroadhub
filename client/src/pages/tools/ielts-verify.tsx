/**
 * IELTS Verify — premium AI verification dashboard.
 *
 * 2026-07 (Tony's founder brief): "The AI should behave like an IELTS
 * verification officer and forensic document examiner. Never simply respond
 * 'Your IELTS certificate is genuine.' Instead provide evidence and explain
 * the reasoning."
 *
 * Route: /tools/ielts-verify
 * Backend: POST /api/tools/ielts-verify-ai (v2 AI engine — see analyzer.ts)
 * Legacy PDF fallback: POST /api/tools/ielts-verify (v1 heuristic).
 */

import { useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Loader2, ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2, XCircle,
  Info, ExternalLink, ChevronDown, ChevronUp, Camera, RefreshCw,
  Phone, Mail, Globe, FileText, GraduationCap,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fetchCsrfToken } from "@/lib/queryClient";

interface SubScore { key: string; label: string; score: number; detail: string; }
interface Finding  { id: string; label: string; status: "pass" | "warn" | "fail" | "info"; detail: string; }
interface Provider {
  key: string; name: string; operatingRegions: string[];
  links: Record<string, string | null>;
  contacts: Record<string, string | null>;
  notes: string;
}
interface OfficialResource {
  label: string; url: string;
  audience: "candidates" | "institutions" | "both";
  note?: string;
}
interface VerifyResponse {
  ok: true;
  overallTrust: number; confidence: number;
  riskBand: "low" | "medium" | "high" | "critical";
  verdict: "consistent" | "verify_officially" | "suspicious" | "high_risk";
  headline: string; explanation: string;
  extractedFields: Record<string, any>;
  provider: Provider | null;
  subScores: SubScore[];
  findings: Finding[];
  forgeryIndicators: string[];
  positiveIndicators: string[];
  recommendations: string[];
  officialResources: OfficialResource[];
  disclaimer: string;
}

const VERDICT_STYLES = {
  consistent: {
    bg: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
    accent: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900",
    icon: ShieldCheck,
    label: "Consistent with genuine TRF",
  },
  verify_officially: {
    bg: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    accent: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900",
    icon: Info,
    label: "Verify officially before use",
  },
  suspicious: {
    bg: "bg-orange-500",
    text: "text-orange-700 dark:text-orange-400",
    accent: "bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-900",
    icon: ShieldAlert,
    label: "Suspicious",
  },
  high_risk: {
    bg: "bg-red-600",
    text: "text-red-700 dark:text-red-400",
    accent: "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900",
    icon: AlertTriangle,
    label: "High risk",
  },
} as const;

export default function IeltsVerifyPage() {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [showTechnical, setShowTechnical] = useState(false);

  // 2026-08 (Tony): accept PDF + Word too — most IELTS TRFs arrive as PDF.
  const ACCEPTED_MIMES = new Set<string>([
    "image/jpeg", "image/jpg", "image/png", "image/webp",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
  ]);

  function handleFile(f: File | null) {
    if (!f) return;
    const isAccepted = ACCEPTED_MIMES.has(f.type) || /\.(pdf|docx?|jpe?g|png|webp)$/i.test(f.name);
    if (!isAccepted) {
      toast({ title: "Unsupported file type", description: "Upload a photo (JPG/PNG/WEBP) or the TRF file (PDF or Word).", variant: "destructive" });
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please upload something under 8 MB.", variant: "destructive" });
      return;
    }
    setFile(f);
    setResult(null);
    setPreview(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  }

  async function handleVerify() {
    if (!file) return;
    setLoading(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      // 2026-07 (production CSRF fix): every mutating request needs the token.
      const csrf = await fetchCsrfToken();
      const res = await fetch("/api/tools/ielts-verify-ai", {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": csrf },
        body: form,
      });
      const data = await res.json();
      if (!data.ok) {
        toast({ title: "Couldn't verify", description: data.message || "Please try again with a clearer image.", variant: "destructive" });
      } else {
        setResult(data);
      }
    } catch {
      toast({ title: "Network issue", description: "Check your connection and try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setShowTechnical(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-100 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 text-xs font-semibold">
            <GraduationCap className="h-3.5 w-3.5" />
            AI IELTS TRF VERIFICATION
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Verify an IELTS certificate</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-lg mx-auto leading-relaxed">
            Our AI reads the Test Report Form, checks band-score math, formatting, and security features, and shows you exactly where to verify officially.
          </p>
        </div>

        {!result && (
          <Card className="border-2 border-dashed border-teal-300 dark:border-teal-800">
            <CardContent className="pt-6 pb-6 space-y-4">
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf,.pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                className="hidden"
                data-testid="input-ielts-file"
              />
              {!file ? (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="w-full flex flex-col items-center justify-center gap-3 py-8 hover:bg-teal-50/50 dark:hover:bg-teal-950/20 rounded-lg transition"
                  data-testid="button-pick-ielts"
                >
                  <div className="h-16 w-16 rounded-full bg-teal-100 dark:bg-teal-950/40 flex items-center justify-center">
                    <Camera className="h-8 w-8 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-gray-900 dark:text-white">Upload your TRF</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Photo (JPG/PNG/WEBP) or the file itself (PDF or Word) · up to 8 MB</p>
                  </div>
                </button>
              ) : (
                <div className="space-y-3">
                  {preview ? (
                    <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800 max-h-80">
                      <img src={preview} alt="TRF preview" className="w-full h-auto object-contain max-h-80" />
                    </div>
                  ) : (
                    <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-4 flex items-center gap-3 bg-gray-50 dark:bg-gray-900/50" data-testid="ielts-doc-card">
                      <div className="h-12 w-12 rounded-md bg-teal-100 dark:bg-teal-950/40 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-teal-700 dark:text-teal-300">
                          {/\.pdf$/i.test(file.name) ? "PDF" : "DOC"}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-900 dark:text-white truncate text-sm">{file.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {(file.size / 1024).toFixed(0)} KB · ready to verify
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      onClick={handleVerify}
                      disabled={loading}
                      className="flex-1 h-12 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white font-semibold"
                      data-testid="button-verify-ielts"
                    >
                      {loading ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Verifying…</> : <><ShieldCheck className="h-5 w-5 mr-2" /> Verify this TRF</>}
                    </Button>
                    <Button variant="outline" onClick={handleReset} disabled={loading} data-testid="button-change-ielts">Change</Button>
                  </div>
                </div>
              )}
              <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-start gap-1.5 leading-relaxed pt-2 border-t border-gray-100 dark:border-gray-800">
                <Info className="h-3 w-3 flex-shrink-0 mt-0.5" />
                <span>Your TRF is analyzed then discarded. This is a screening — only the official IELTS Verification Service (institutions only) can confirm authenticity.</span>
              </div>
            </CardContent>
          </Card>
        )}

        {result && (
          <ResultView
            result={result}
            showTechnical={showTechnical}
            onToggleTechnical={() => setShowTechnical((v) => !v)}
            onReset={handleReset}
          />
        )}
      </div>
    </div>
  );
}

function ResultView({ result, showTechnical, onToggleTechnical, onReset }: {
  result: VerifyResponse; showTechnical: boolean; onToggleTechnical: () => void; onReset: () => void;
}) {
  const style = VERDICT_STYLES[result.verdict];
  const Icon = style.icon;
  return (
    <div className="space-y-4">
      <Card className={`border-2 ${style.accent}`}>
        <CardContent className="pt-6 pb-6 space-y-4">
          <div className="flex items-start gap-4">
            <div className={`h-14 w-14 rounded-full ${style.bg} flex items-center justify-center flex-shrink-0`}>
              <Icon className="h-7 w-7 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-xs uppercase tracking-widest font-bold ${style.text}`}>{style.label}</p>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white mt-0.5 leading-tight">{result.headline}</h2>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mt-2">{result.explanation}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-gray-800">
            <TrustGauge value={result.overallTrust} label="Overall Trust" />
            <TrustGauge value={result.confidence} label="AI Confidence" muted />
          </div>
        </CardContent>
      </Card>

      <CandidateCard fields={result.extractedFields} provider={result.provider} />
      <BandScoreCard fields={result.extractedFields} findings={result.findings} />
      <OfficialResourcesPanel resources={result.officialResources} provider={result.provider} />
      <RecommendationsPanel recommendations={result.recommendations} />

      {(result.forgeryIndicators.length > 0 || result.findings.some((f) => f.status === "fail" || f.status === "warn")) && (
        <ConcernsPanel findings={result.findings.filter((f) => f.status === "fail" || f.status === "warn")} indicators={result.forgeryIndicators} />
      )}

      <Card>
        <CardContent className="pt-4 pb-4">
          <button type="button" onClick={onToggleTechnical} className="w-full flex items-center justify-between text-sm font-semibold text-gray-900 dark:text-white">
            <span>Technical Report ({result.subScores.length + result.findings.length} checks)</span>
            {showTechnical ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showTechnical && (
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sub-scores</p>
                {result.subScores.map((s) => (
                  <div key={s.key} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-gray-900 dark:text-gray-100">{s.label}</span>
                      <span className="font-bold">{Math.round(s.score)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
                      <div className={`h-full ${s.score >= 80 ? "bg-emerald-500" : s.score >= 60 ? "bg-amber-500" : s.score >= 40 ? "bg-orange-500" : "bg-red-600"}`} style={{ width: `${Math.max(4, s.score)}%` }} />
                    </div>
                    <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-snug">{s.detail}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-2 pt-3 border-t border-gray-200 dark:border-gray-800">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">All findings</p>
                {result.findings.map((f) => <FindingRow key={f.id} finding={f} />)}
              </div>
              {(result.positiveIndicators.length > 0) && (
                <div className="space-y-2 pt-3 border-t border-gray-200 dark:border-gray-800">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Positive observations</p>
                  {result.positiveIndicators.map((i, idx) => (
                    <div key={`p-${idx}`} className="flex items-start gap-2 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-700 dark:text-gray-300">{i}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onReset} className="flex-1" data-testid="button-verify-another-ielts">
          <RefreshCw className="h-4 w-4 mr-2" /> Verify another
        </Button>
      </div>
      <p className="text-[11px] text-center text-gray-500 dark:text-gray-400 leading-relaxed">{result.disclaimer}</p>
    </div>
  );
}

function TrustGauge({ value, label, muted = false }: { value: number; label: string; muted?: boolean }) {
  const color = value >= 80 ? "text-emerald-600" : value >= 60 ? "text-amber-600" : value >= 40 ? "text-orange-600" : "text-red-600";
  return (
    <div className="text-center">
      <div className={`text-3xl font-extrabold ${muted ? "text-gray-500 dark:text-gray-400" : color}`}>{value}%</div>
      <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}

function CandidateCard({ fields, provider }: { fields: Record<string, any>; provider: Provider | null }) {
  const rows: [string, string][] = [];
  if (fields.candidateName)   rows.push(["Candidate",     fields.candidateName]);
  if (fields.candidateNumber) rows.push(["Candidate #",   fields.candidateNumber]);
  if (fields.trfNumber)       rows.push(["TRF Number",    fields.trfNumber]);
  if (fields.testType)        rows.push(["Test type",     fields.testType]);
  if (fields.deliveryMethod)  rows.push(["Delivery",      fields.deliveryMethod]);
  if (fields.testDate)        rows.push(["Test date",     fields.testDate]);
  if (fields.issueDate)       rows.push(["Issue date",    fields.issueDate]);
  if (fields.testCentreName)  rows.push(["Test centre",   fields.testCentreName]);
  if (fields.testCentreNumber) rows.push(["Centre code",   fields.testCentreNumber]);
  if (fields.country)         rows.push(["Country",       fields.country]);

  return (
    <Card>
      <CardContent className="pt-5 pb-5 space-y-3">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-teal-600 dark:text-teal-400" />
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400 font-semibold">Certificate summary</p>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate">
              {fields.candidateName || "Unknown candidate"}
            </h3>
          </div>
          {provider && (
            <span className="text-[11px] px-2 py-1 rounded-full bg-teal-100 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 font-semibold">
              {provider.name}
            </span>
          )}
        </div>
        {rows.length > 0 && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2 border-t border-gray-200 dark:border-gray-800 text-sm">
            {rows.map(([label, value]) => (
              <div key={label}>
                <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">{label}</p>
                <p className="text-gray-900 dark:text-white font-medium truncate">{value}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BandScoreCard({ fields, findings }: { fields: Record<string, any>; findings: Finding[] }) {
  const scores = [
    { label: "Listening", value: fields.listeningBand as number | null | undefined },
    { label: "Reading",   value: fields.readingBand   as number | null | undefined },
    { label: "Writing",   value: fields.writingBand   as number | null | undefined },
    { label: "Speaking",  value: fields.speakingBand  as number | null | undefined },
  ];
  const overall = fields.overallBand as number | null | undefined;
  const consistent = findings.find((f) => f.id === "overall_band_consistent");
  const inconsistent = findings.find((f) => f.id === "overall_band_inconsistent");
  const consistencyStatus = inconsistent ? "fail" : consistent ? "pass" : "unknown";

  return (
    <Card>
      <CardContent className="pt-5 pb-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            <p className="text-sm font-bold text-gray-900 dark:text-white">Band scores</p>
          </div>
          {overall != null && (
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest text-gray-500 dark:text-gray-400 font-semibold">Overall</p>
              <p className="text-2xl font-extrabold text-teal-600 dark:text-teal-400">{overall}</p>
            </div>
          )}
        </div>
        <div className="grid grid-cols-4 gap-2 pt-2 border-t border-gray-200 dark:border-gray-800">
          {scores.map(({ label, value }) => (
            <div key={label} className="text-center bg-gray-50 dark:bg-gray-900 rounded-lg p-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">{label}</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white mt-0.5">{value ?? "—"}</p>
            </div>
          ))}
        </div>
        {consistencyStatus === "pass" && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 pt-2 border-t border-gray-200 dark:border-gray-800">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Overall band correctly matches the IELTS calculation from section scores.</span>
          </div>
        )}
        {consistencyStatus === "fail" && (
          <div className="flex items-start gap-1.5 text-xs text-red-700 dark:text-red-400 pt-2 border-t border-gray-200 dark:border-gray-800">
            <XCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span>{inconsistent?.detail}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OfficialResourcesPanel({ resources, provider }: { resources: OfficialResource[]; provider: Provider | null }) {
  return (
    <Card className="border-teal-200 dark:border-teal-900 bg-teal-50/40 dark:bg-teal-950/10">
      <CardContent className="pt-5 pb-5 space-y-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-teal-700 dark:text-teal-400 font-bold">
            Official IELTS Verification
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 leading-relaxed">
            {provider
              ? `${provider.name} appears to be the issuing partner. Use the links below — the Test Taker Portal is for candidates, the Verification Service is for institutions only.`
              : "The provider (British Council / IDP / IELTS USA) couldn't be identified from the TRF. Use the general IELTS resources below."}
          </p>
        </div>
        <div className="grid gap-2 pt-3 border-t border-teal-200 dark:border-teal-900">
          {resources.map((r) => (
            <a
              key={r.url}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 text-sm text-teal-700 dark:text-teal-400 hover:underline"
            >
              <Globe className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.label}</span>
                  <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${r.audience === "candidates" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : r.audience === "institutions" ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}>
                    {r.audience}
                  </span>
                </div>
                {r.note && <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-snug mt-0.5">{r.note}</p>}
              </div>
              <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 opacity-60 mt-0.5" />
            </a>
          ))}
        </div>
        {provider && (provider.contacts.supportPhone || provider.contacts.supportEmail) && (
          <div className="pt-3 border-t border-teal-200 dark:border-teal-900 space-y-1 text-xs text-gray-700 dark:text-gray-300">
            <p className="font-semibold text-teal-700 dark:text-teal-400 uppercase tracking-wider text-[11px]">Direct contact</p>
            {provider.contacts.supportPhone && <div className="flex items-center gap-1.5"><Phone className="h-3 w-3" /> {provider.contacts.supportPhone}</div>}
            {provider.contacts.supportEmail && <div className="flex items-center gap-1.5"><Mail  className="h-3 w-3" /> {provider.contacts.supportEmail}</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecommendationsPanel({ recommendations }: { recommendations: string[] }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400 font-bold mb-3">What to do next</p>
        <ol className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
          {recommendations.map((rec, idx) => (
            <li key={idx} className="flex items-start gap-2 leading-relaxed">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-teal-100 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 text-xs font-bold flex items-center justify-center mt-0.5">{idx + 1}</span>
              <span>{rec}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function ConcernsPanel({ findings, indicators }: { findings: Finding[]; indicators: string[] }) {
  const hardCount = findings.filter(f => f.status === "fail").length;
  return (
    <Card className={`border-2 ${hardCount > 0 ? "border-red-400 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900" : "border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900"}`}>
      <CardContent className="pt-5 pb-5 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className={`h-5 w-5 ${hardCount > 0 ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`} />
          <p className={`font-bold ${hardCount > 0 ? "text-red-900 dark:text-red-200" : "text-amber-900 dark:text-amber-200"}`}>
            {hardCount > 0 ? `${hardCount} critical issue${hardCount === 1 ? "" : "s"} — verify officially` : `${findings.length + indicators.length} concern${(findings.length + indicators.length) === 1 ? "" : "s"} to check`}
          </p>
        </div>
        <div className="space-y-2">
          {findings.map((f) => (
            <div key={f.id} className={`rounded-md p-2.5 ${f.status === "fail" ? "bg-red-100/70 dark:bg-red-950/30" : "bg-amber-100/60 dark:bg-amber-950/25"}`}>
              <p className={`text-xs font-semibold ${f.status === "fail" ? "text-red-900 dark:text-red-200" : "text-amber-900 dark:text-amber-200"}`}>
                {f.status === "fail" ? "❌" : "⚠️"} {f.label}
              </p>
              <p className="text-[11px] text-gray-800 dark:text-gray-200 leading-relaxed mt-1">{f.detail}</p>
            </div>
          ))}
          {indicators.map((ind, idx) => (
            <div key={`ind-${idx}`} className="rounded-md p-2.5 bg-amber-100/60 dark:bg-amber-950/25">
              <p className="text-[11px] text-gray-800 dark:text-gray-200 leading-relaxed">
                <strong className="text-amber-900 dark:text-amber-200">Forensic observation:</strong> {ind}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  const Icon =
    finding.status === "pass" ? CheckCircle2 :
    finding.status === "fail" ? XCircle :
    finding.status === "warn" ? AlertTriangle :
                                 Info;
  const color =
    finding.status === "pass" ? "text-emerald-500" :
    finding.status === "fail" ? "text-red-500" :
    finding.status === "warn" ? "text-amber-500" :
                                 "text-blue-500";
  return (
    <div className="flex items-start gap-2 text-xs">
      <Icon className={`h-3.5 w-3.5 flex-shrink-0 mt-0.5 ${color}`} />
      <div>
        <span className="font-semibold text-gray-900 dark:text-white">{finding.label}:</span>{" "}
        <span className="text-gray-700 dark:text-gray-300">{finding.detail}</span>
      </div>
    </div>
  );
}
