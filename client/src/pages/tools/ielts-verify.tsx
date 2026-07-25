/**
 * IELTS Verifier — /tools/ielts-verify.
 *
 * Upload your IELTS TRF (Test Report Form) as PDF or image. We extract the
 * TRF number, test centre code, dates and band scores, run consistency
 * checks (band mean = overall, valid centre code prefix, date in 2-year
 * validity window), and flag likely fakes.
 *
 * CRITICAL FRAMING: we're a pre-screener, NOT an authoritative verifier.
 * Only the official ielts.org verification portal queries the real
 * database. Copy reinforces this throughout.
 */

import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { fetchCsrfToken } from "@/lib/queryClient";
import { AiDisclaimer } from "@/components/ai-disclaimer";
import {
  ShieldCheck, AlertTriangle, XCircle, CheckCircle2, ArrowLeft,
  Upload, FileText, X, Info, ExternalLink, Loader2, ArrowRight,
} from "lucide-react";

type Verdict = "likely_genuine" | "suspicious" | "likely_fake" | "undetermined";

interface Finding {
  code:     string;
  severity: "info" | "warning" | "critical";
  message:  string;
}

interface Parsed {
  trfNumber?:      string;
  testCentreCode?: string;
  testDate?:       string;
  candidateName?:  string;
  testType?:       string;
  overallBand?:    number;
  listeningBand?:  number;
  readingBand?:    number;
  writingBand?:    number;
  speakingBand?:   number;
}

interface VerifyResponse {
  checkId:           string;
  verdict:           Verdict;
  confidence:        number;
  parsed:            Parsed;
  findings:          Finding[];
  aiVisionUsed:      boolean;
  officialVerifyUrl: string;
  disclaimer:        string;
}

const VERDICT_META: Record<Verdict, { label: string; color: string; icon: any; description: string }> = {
  likely_genuine: {
    label: "Likely Genuine",
    color: "green",
    icon: CheckCircle2,
    description: "The document matches IELTS TRF conventions. Still verify officially before submitting.",
  },
  suspicious: {
    label: "Suspicious",
    color: "amber",
    icon: AlertTriangle,
    description: "Some fields don't match what a real TRF should look like. Verify officially before using it.",
  },
  likely_fake: {
    label: "Likely Fake",
    color: "red",
    icon: XCircle,
    description: "Multiple critical inconsistencies. This document is very likely forged. Do NOT submit it — it will be flagged and you may be banned.",
  },
  undetermined: {
    label: "Undetermined",
    color: "gray",
    icon: Info,
    description: "Not enough legible data to make a call. Try a clearer scan.",
  },
};

export default function IeltsVerifyPage() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const mutation = useMutation({
    mutationFn: async (f: File): Promise<VerifyResponse> => {
      const form = new FormData();
      form.append("file", f);
      const csrf = await fetchCsrfToken();
      const res = await fetch("/api/tools/ielts-verify", {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": csrf },
        body: form,
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Verification failed");
      return j as VerifyResponse;
    },
    onSuccess: (data) => setResult(data),
    onError: (err: any) => {
      toast({ title: "Could not verify", description: err?.message ?? "", variant: "destructive" });
    },
  });

  function reset() {
    setFile(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleSubmit() {
    if (!file) return;
    mutation.mutate(file);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-5" data-testid="page-ielts-verify">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <Link href="/tools">
        <button className="text-sm text-teal-600 hover:text-teal-700 flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> All tools
        </button>
      </Link>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">IELTS Verifier</h1>
          <Badge className="bg-blue-500/20 text-blue-700 border-blue-500/40 dark:text-blue-300">Anti-scam</Badge>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          Upload your IELTS Test Report Form (TRF). We check the TRF number
          format, test centre code, band consistency, and test date validity,
          then flag anything unusual. Fake TRFs are a common scam in Kenya
          and will get your visa application rejected.
        </p>
      </div>

      {/* ── Trust banner ──────────────────────────────────────────────── */}
      <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900">
        <CardContent className="pt-4 pb-4 flex gap-3">
          <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-800 dark:text-blue-200 leading-relaxed">
            <strong className="font-semibold">This is a pre-screener, not an authoritative check.</strong>{" "}
            The only 100% authoritative IELTS verification is the official portal at{" "}
            <a href="https://ielts.org/organisations/results-verification" target="_blank" rel="noopener noreferrer" className="underline font-semibold">
              ielts.org/organisations/results-verification
            </a>. Employers and immigration officers use only that portal. Our tool catches obvious forgeries so you don't waste a visa slot.
          </div>
        </CardContent>
      </Card>

      {/* ── Upload / Verdict ──────────────────────────────────────────── */}
      {!result ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Upload your TRF</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!file ? (
              <div
                className="p-8 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-600 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                data-testid="dropzone-trf"
              >
                <Upload className="h-10 w-10 text-blue-500 mx-auto mb-2" />
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Click to upload TRF</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">PDF or image (JPG, PNG, WEBP). Max 8 MB.</p>
              </div>
            ) : (
              <div className="p-3 rounded-lg border border-gray-300 dark:border-gray-700 flex items-center gap-3">
                <FileText className="h-6 w-6 text-blue-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{file.name}</p>
                  <p className="text-[11px] text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                <button
                  onClick={reset}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  aria-label="Remove file"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }}
              data-testid="input-file-trf"
            />

            <Button
              onClick={handleSubmit}
              disabled={!file || mutation.isPending}
              size="lg"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold"
              data-testid="button-verify"
            >
              {mutation.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verifying...</>
                : <><ShieldCheck className="h-4 w-4 mr-2" />Verify this TRF</>}
            </Button>

            <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center">
              Free: 2 checks/day. Pro: unlimited. Results in seconds.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ResultCard result={result} onNew={reset} />
      )}

      <AiDisclaimer variant="banner" />

      <div className="text-[11px] text-gray-400 text-center pt-2">
        Uploaded files are stored for 30 days for audit + fraud pattern analysis, then permanently deleted.
      </div>
    </div>
  );
}

function ResultCard({ result, onNew }: { result: VerifyResponse; onNew: () => void }) {
  const meta = VERDICT_META[result.verdict];
  const Icon = meta.icon;

  const bg = meta.color === "green" ? "border-green-300 bg-green-50/50 dark:bg-green-950/20 dark:border-green-900"
           : meta.color === "amber" ? "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900"
           : meta.color === "red"   ? "border-red-300 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900"
                                    : "border-gray-300 bg-gray-50/50 dark:bg-gray-900/50 dark:border-gray-700";
  const textCol = meta.color === "green" ? "text-green-700 dark:text-green-300"
                : meta.color === "amber" ? "text-amber-700 dark:text-amber-300"
                : meta.color === "red"   ? "text-red-700 dark:text-red-300"
                                         : "text-gray-700 dark:text-gray-300";

  return (
    <div className="space-y-4">
      {/* ── Verdict ─────────────────────────────────────────────────── */}
      <Card className={bg}>
        <CardContent className="pt-6 pb-6 space-y-3">
          <div className="flex items-center gap-3">
            <Icon className={`h-10 w-10 ${textCol}`} />
            <div>
              <div className={`text-xs uppercase tracking-wide font-bold ${textCol}`}>Verdict</div>
              <div className={`text-2xl font-bold ${textCol}`}>{meta.label}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Confidence: {result.confidence}%</div>
            </div>
          </div>
          <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">{meta.description}</p>
        </CardContent>
      </Card>

      {/* ── Official verification CTA ───────────────────────────────── */}
      <Card className="border-blue-300 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800">
        <CardContent className="pt-4 pb-4 space-y-2">
          <div className="text-xs font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">Do this next</div>
          <p className="text-sm text-gray-800 dark:text-gray-200">
            Verify officially at the IELTS results-verification portal. This is the ONLY authoritative check — every employer and immigration officer uses it.
          </p>
          <a href={result.officialVerifyUrl} target="_blank" rel="noopener noreferrer">
            <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold" data-testid="button-official-verify">
              Open the official IELTS verifier
              <ExternalLink className="h-4 w-4 ml-2" />
            </Button>
          </a>
        </CardContent>
      </Card>

      {/* ── Parsed fields ─────────────────────────────────────────── */}
      <Card>
        <CardHeader><CardTitle className="text-sm">What we extracted from your TRF</CardTitle></CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          <Field label="Candidate name"   value={result.parsed.candidateName} />
          <Field label="TRF number"        value={result.parsed.trfNumber} mono />
          <Field label="Test centre code"  value={result.parsed.testCentreCode} mono />
          <Field label="Test type"         value={result.parsed.testType} />
          <Field label="Test date"         value={result.parsed.testDate ? new Date(result.parsed.testDate).toDateString() : undefined} />
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2">
            <BandCell label="Listening" value={result.parsed.listeningBand} />
            <BandCell label="Reading"   value={result.parsed.readingBand} />
            <BandCell label="Writing"   value={result.parsed.writingBand} />
            <BandCell label="Speaking"  value={result.parsed.speakingBand} />
            <BandCell label="Overall"   value={result.parsed.overallBand} highlight />
          </div>
        </CardContent>
      </Card>

      {/* ── Findings ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Why we said that</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {result.findings.map((f, i) => (
            <div
              key={i}
              className={`p-3 rounded-lg text-sm ${
                f.severity === "critical" ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900" :
                f.severity === "warning"  ? "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900" :
                                             "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900"
              }`}
            >
              <div className="flex items-start gap-2">
                {f.severity === "critical" && <XCircle       className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />}
                {f.severity === "warning"  && <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />}
                {f.severity === "info"     && <CheckCircle2  className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />}
                <div className="text-gray-800 dark:text-gray-200 leading-relaxed">{f.message}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
        {result.disclaimer}
      </p>

      <div className="flex gap-2">
        <Button onClick={onNew} variant="outline" className="flex-1">
          Verify another TRF
        </Button>
        <Link href="/tools" className="flex-1">
          <Button variant="ghost" className="w-full">Back to all tools <ArrowRight className="h-3 w-3 ml-1" /></Button>
        </Link>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center gap-2">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <span className={`text-sm text-gray-900 dark:text-white ${mono ? "font-mono" : "font-semibold"}`}>
        {value ?? <span className="text-gray-400 italic font-normal">not found</span>}
      </span>
    </div>
  );
}

function BandCell({ label, value, highlight }: { label: string; value?: number; highlight?: boolean }) {
  return (
    <div className={`p-2 rounded text-center ${highlight ? "bg-blue-100 dark:bg-blue-950/40" : "bg-gray-100 dark:bg-gray-800"}`}>
      <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">{label}</div>
      <div className={`text-lg font-bold ${highlight ? "text-blue-700 dark:text-blue-300" : "text-gray-900 dark:text-white"}`}>
        {value ?? "—"}
      </div>
    </div>
  );
}
