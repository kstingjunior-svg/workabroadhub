/**
 * Offer Letter Screening tool (free) — /tools/offer-check.
 *
 * Upload a job offer letter (PDF, Word, or image). We extract the text,
 * run 20+ scam-pattern rules, cross-check the sender email domain against
 * the claimed employer, and — for image uploads — ask a vision model
 * whether corporate letterhead and signature are present. Output is a
 * 0-100 risk score in three bands.
 *
 * Framing: SCREENING, not verification. Copy and disclaimers reinforce
 * that users must still verify independently.
 */

import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { SeoHead, buildFaqSchema } from "@/components/seo-head";
import { trackPageView } from "@/lib/analytics";
import { fetchCsrfToken } from "@/lib/queryClient";
import {
  WrongDocumentCard,
  isWrongDocumentResponse,
  type WrongDocumentPayload,
} from "@/components/wrong-document-card";
import { AskNanjilaButton } from "@/components/ask-nanjila-button";
import { AiDisclaimer } from "@/components/ai-disclaimer";
import {
  ShieldCheck,
  AlertTriangle,
  XCircle,
  CheckCircle,
  ArrowLeft,
  Upload,
  FileText,
  X,
  Info,
  Building2,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type RiskBand = "low" | "medium" | "high";
type Severity = "info" | "warning" | "critical";

interface Finding {
  code:     string;
  severity: Severity;
  message:  string;
  matched?: string;
}

interface OfferCheckResult {
  checkId:  string;
  riskScore: number;
  riskBand:  RiskBand;
  findings:  Finding[];
  parsed: {
    candidateName:  string | null;
    employerName:   string | null;
    positionTitle:  string | null;
    workCountry:    string | null;
    salaryAmount:   string | null;
    salaryCurrency: string | null;
    startDate:      string | null;
  };
  employer: {
    senderDomain:         string | null;
    domainMatchesCompany: boolean | null;
    hasLetterhead:        boolean | null;
    hasSignature:         boolean | null;
    hasPhysicalAddress:   boolean | null;
  };
  headline:       string;
  recommendation: string;
  aiVisionUsed:   boolean;
  aiVisionNotes:  string | null;
  disclaimer:     string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Risk-band UI config
// ─────────────────────────────────────────────────────────────────────────────

const BAND_CONFIG: Record<RiskBand, {
  label:      string;
  Icon:       typeof ShieldCheck;
  color:      string;
  bg:         string;
  border:     string;
  badgeClass: string;
  bar:        string;
}> = {
  low: {
    label:      "Low Risk — No major red flags",
    Icon:       ShieldCheck,
    color:      "text-green-600 dark:text-green-400",
    bg:         "bg-green-50 dark:bg-green-900/20",
    border:     "border-green-200 dark:border-green-700",
    badgeClass: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    bar:        "bg-green-500",
  },
  medium: {
    label:      "Medium Risk — Anomalies to review",
    Icon:       AlertTriangle,
    color:      "text-amber-600 dark:text-amber-400",
    bg:         "bg-amber-50 dark:bg-amber-900/20",
    border:     "border-amber-200 dark:border-amber-700",
    badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    bar:        "bg-amber-500",
  },
  high: {
    label:      "High Risk — Do NOT engage further",
    Icon:       XCircle,
    color:      "text-red-600 dark:text-red-400",
    bg:         "bg-red-50 dark:bg-red-900/20",
    border:     "border-red-200 dark:border-red-700",
    badgeClass: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    bar:        "bg-red-500",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// FAQ
// ─────────────────────────────────────────────────────────────────────────────

const FAQS = [
  {
    q: "How does the Offer Letter Screener decide the risk score?",
    a: "We combine three signals. First, a pattern engine of 20+ scam rules covers fee demands, urgency pressure, free-email domains, guaranteed-visa promises, and other well-known fraud vocabulary. Second, an employer-authenticity check compares the sender email domain against the claimed employer name. Third, for image uploads, an AI vision model reports whether corporate letterhead and a signature are present. Each finding contributes to a 0-100 score, then we translate that into low / medium / high.",
  },
  {
    q: "Does a Low Risk result mean the offer is definitely real?",
    a: "No. Low Risk means our automated checks did not raise concerns. That's useful signal, but it is not a verification. A skilled scammer can produce a document that looks corporate. For any high-value overseas offer, verify independently: confirm the company's registration in the destination country, insist on a live interview, and never pay any fee before you have a signed contract.",
  },
  {
    q: "Does a High Risk result mean the offer is a scam?",
    a: "Not automatically. High Risk means we found indicators a real employer's letter wouldn't have — for example a request for upfront payment, a free-email sender domain, or 'guaranteed visa' language. The right next step is caution: stop engaging, verify the company through its official website and registered office phone, and do not send any documents or money until you've confirmed.",
  },
  {
    q: "What are the biggest red flags?",
    a: "In our data, these are the strongest signals of a fake offer: (1) any request for a fee — visa fee, training fee, deposit; (2) M-Pesa or Western Union payments to a personal number; (3) contact via a free email domain (Gmail / Yahoo); (4) 'guaranteed visa' or '100% placement' promises; (5) skipped or nonexistent interview; (6) urgency pressure to 'start immediately'; (7) salary that is dramatically above market for the destination country.",
  },
  {
    q: "Is my offer letter stored?",
    a: "The document bytes are hashed and screened, then discarded. We store the extracted text and the screening result for 30 days so admins can review escalated cases. Original files are not persisted. All storage follows the Kenya Data Protection Act.",
  },
  {
    q: "Is there a limit on how many offer letters I can check?",
    a: "Free users can screen up to 3 offer letters per 24 hours. Signed-in users get a higher limit. If you need to review many offers on behalf of others (e.g. a licensed agent), contact us for a business plan.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function OfferCheckPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile]     = useState<File | null>(null);
  const [result, setResult] = useState<OfferCheckResult | null>(null);
  const [wrongDoc, setWrongDoc] = useState<WrongDocumentPayload | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  trackPageView?.("offer-check");

  const mutation = useMutation({
    mutationFn: async (arg: File | { file: File; forceAnalyze?: boolean }) => {
      const f = arg instanceof File ? arg : arg.file;
      const forceAnalyze = arg instanceof File ? false : !!arg.forceAnalyze;
      const form = new FormData();
      form.append("file", f);
      if (forceAnalyze) form.append("forceAnalyze", "true");
      const csrfToken = await fetchCsrfToken();
      const res = await fetch("/api/tools/offer-check", {
        method:      "POST",
        credentials: "include",
        headers:     { "X-CSRF-Token": csrfToken },
        body:        form,
      });
      if (!res.ok) {
        const text = await res.text();
        try {
          const body = JSON.parse(text);
          if (isWrongDocumentResponse(body)) {
            const err: any = new Error(body.message);
            err.wrongDocument = body;
            throw err;
          }
          throw new Error(body.message ?? "Could not screen this offer.");
        } catch (parseErr: any) {
          if (parseErr?.wrongDocument) throw parseErr;
          throw new Error("Could not screen this offer. Please try again.");
        }
      }
      return res.json() as Promise<OfferCheckResult>;
    },
    onSuccess: (data) => {
      setWrongDoc(null);
      setResult(data);
      toast({
        title: data.riskBand === "low"
          ? "Screening complete — no red flags"
          : data.riskBand === "medium"
          ? "Screening complete — anomalies found"
          : "Screening complete — high risk indicators",
      });
    },
    onError: (err: any) => {
      if (err?.wrongDocument) {
        setWrongDoc(err.wrongDocument);
        setResult(null);
        return;
      }
      toast({
        title: "Could not screen this document",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleFile = (f: File | null) => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please keep it under 10 MB.",
        variant: "destructive",
      });
      return;
    }
    const isImage = f.type.startsWith("image/");
    const isPdf   = f.type === "application/pdf";
    const isDoc   = f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                 || f.type === "application/msword";
    if (!isImage && !isPdf && !isDoc) {
      toast({
        title: "Unsupported file type",
        description: "Please upload an image (JPG, PNG, WEBP), PDF, or Word document.",
        variant: "destructive",
      });
      return;
    }
    setFile(f);
    setResult(null);
    setWrongDoc(null);
    if (isImage) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setWrongDoc(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <SeoHead
        title="Offer Letter Screener — WorkAbroad Hub"
        description="Free offer-letter screening for Kenyan jobseekers. Upload your job offer and get an instant risk report — fee-demand detection, employer domain check, and AI-assisted authenticity review."
        canonicalPath="/tools/offer-check"
        jsonLd={buildFaqSchema(FAQS)}
      />

      <div className="mx-auto max-w-4xl px-4 py-10">
        <AiDisclaimer className="mb-4" />
        <Link href="/tools">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Tools
          </Button>
        </Link>

        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <FileText className="h-6 w-6 text-orange-600 dark:text-orange-400" />
            </div>
            <h1 className="text-3xl font-bold">Offer Letter Screener</h1>
            <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
              Free
            </span>
          </div>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            Got a job offer that looks too good to be true? Upload the letter and we'll
            scan it for scam patterns, verify the sender domain, and give you an instant risk
            report. No account needed.
          </p>
        </div>

        {wrongDoc && (
          <div className="space-y-4">
            <WrongDocumentCard payload={wrongDoc} onTryAnother={reset} onAnalyzeAnyway={file ? () => mutation.mutate({ file, forceAnalyze: true }) : undefined} />
          </div>
        )}

        {!result && !wrongDoc && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Upload offer letter</CardTitle>
            </CardHeader>
            <CardContent>
              <label
                htmlFor="offer-file"
                className={`
                  block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
                  transition-colors
                  ${file ? "border-orange-300 bg-orange-50/50 dark:bg-orange-900/10" :
                           "border-slate-300 hover:border-orange-400 dark:border-slate-700 dark:hover:border-orange-500"}
                `}
              >
                <input
                  ref={fileInputRef}
                  id="offer-file"
                  type="file"
                  accept="image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                  onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
                {file ? (
                  <div className="flex flex-col items-center gap-3">
                    {preview ? (
                      <img src={preview} alt="Preview" className="max-h-56 rounded-md border border-slate-200 dark:border-slate-700" />
                    ) : (
                      <FileText className="h-12 w-12 text-orange-500" />
                    )}
                    <div className="text-sm">
                      <div className="font-medium">{file.name}</div>
                      <div className="text-slate-500">{(file.size / 1024).toFixed(0)} KB</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.preventDefault(); reset(); }}
                    >
                      <X className="h-4 w-4 mr-1" /> Choose a different file
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Upload className="h-10 w-10 text-slate-400" />
                    <div>
                      <div className="font-medium">Click to upload or drag & drop</div>
                      <div className="text-sm text-slate-500 mt-1">
                        PDF, Word, or image · up to 10 MB
                      </div>
                    </div>
                  </div>
                )}
              </label>

              <Button
                className="w-full mt-6 bg-orange-600 hover:bg-orange-700"
                size="lg"
                disabled={!file || mutation.isPending}
                onClick={() => file && mutation.mutate(file)}
              >
                {mutation.isPending ? "Screening…" : "Screen this offer"}
              </Button>

              <div className="mt-6 p-4 rounded-md bg-slate-50 dark:bg-slate-900/50 text-sm text-slate-600 dark:text-slate-400 flex gap-3">
                <Info className="h-5 w-5 flex-shrink-0 text-slate-400 mt-0.5" />
                <div>
                  <strong>How this works:</strong> we extract the text on your letter,
                  scan it for 20+ known scam patterns (fees, urgency, guaranteed-visa language),
                  cross-check the sender email domain against the claimed employer, and — for
                  image uploads — ask a vision model whether letterhead and signature are present.
                  Your file is hashed and screened — the bytes are not stored. Results are kept
                  for 30 days for review.
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {result && (
          <>
            <ResultCard result={result} />

            <div className="mt-6 space-y-3">
              <AskNanjilaButton
                topic="offer"
                summary={`${result.riskBand} risk — score ${result.riskScore}/100`}
                variant="default"
                size="lg"
                className="w-full bg-orange-600 hover:bg-orange-700"
              />
              <div className="flex gap-3">
                <Button onClick={reset} className="flex-1" size="lg" variant="outline">
                  Screen another offer
                </Button>
                <Link href="/services/order/employer_verification" className="flex-1">
                  <Button variant="outline" className="w-full" size="lg">
                    Get a paid employer check
                  </Button>
                </Link>
              </div>
            </div>

            <p className="mt-6 text-xs text-slate-500 dark:text-slate-400 text-center leading-relaxed">
              {result.disclaimer}
            </p>
          </>
        )}

        {!result && (
          <div className="mt-12">
            <h2 className="text-xl font-semibold mb-4">Frequently asked questions</h2>
            <div className="space-y-4">
              {FAQS.map((f) => (
                <div key={f.q} className="border-b border-slate-200 dark:border-slate-800 pb-4">
                  <div className="font-medium mb-2">{f.q}</div>
                  <div className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{f.a}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ResultCard
// ─────────────────────────────────────────────────────────────────────────────

function ResultCard({ result }: { result: OfferCheckResult }) {
  const cfg = BAND_CONFIG[result.riskBand];
  const Icon = cfg.Icon;

  return (
    <Card className={`border-2 ${cfg.border}`}>
      <CardHeader className={cfg.bg}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icon className={`h-8 w-8 ${cfg.color}`} />
            <div>
              <CardTitle className="text-xl">{cfg.label}</CardTitle>
              <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                {result.headline}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className={`text-3xl font-bold ${cfg.color}`}>{result.riskScore}</div>
            <div className="text-xs text-slate-500">/ 100 risk</div>
          </div>
        </div>
        <div className="mt-4 h-2 bg-white/60 dark:bg-black/20 rounded-full overflow-hidden">
          <div
            className={`h-full ${cfg.bar} transition-all`}
            style={{ width: `${result.riskScore}%` }}
          />
        </div>
      </CardHeader>

      <CardContent className="pt-6 space-y-6">
        <div className={`p-4 rounded-md ${cfg.bg} border ${cfg.border}`}>
          <div className="text-sm font-medium mb-1">What to do next</div>
          <div className="text-sm text-slate-700 dark:text-slate-300">
            {result.recommendation}
          </div>
        </div>

        {/* Corporate signals */}
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Employer signals
          </h3>
          <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-900/50 text-sm space-y-1.5">
            {result.employer.senderDomain && (
              <SignalRow
                ok={result.employer.domainMatchesCompany}
                label={`Sender domain: ${result.employer.senderDomain}`}
                okText={result.employer.domainMatchesCompany ? "matches claimed employer" : ""}
                notOkText={result.employer.domainMatchesCompany === false ? "does NOT match claimed employer" : ""}
              />
            )}
            <SignalRow
              ok={result.employer.hasLetterhead}
              label="Corporate letterhead"
              okText="detected"
              notOkText="not detected"
            />
            <SignalRow
              ok={result.employer.hasSignature}
              label="Signature"
              okText="present"
              notOkText="missing"
            />
            <SignalRow
              ok={result.employer.hasPhysicalAddress}
              label="Physical address"
              okText="included"
              notOkText="not found"
            />
          </div>
        </div>

        {/* Parsed fields */}
        {(result.parsed.employerName || result.parsed.positionTitle ||
          result.parsed.salaryAmount || result.parsed.workCountry) && (
          <div>
            <h3 className="text-sm font-semibold mb-2">What we read from the letter</h3>
            <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-900/50 text-sm grid grid-cols-2 gap-y-2 gap-x-4">
              {result.parsed.candidateName && (
                <div><span className="text-slate-500">Candidate:</span> {result.parsed.candidateName}</div>
              )}
              {result.parsed.employerName && (
                <div><span className="text-slate-500">Employer:</span> {result.parsed.employerName}</div>
              )}
              {result.parsed.positionTitle && (
                <div><span className="text-slate-500">Position:</span> {result.parsed.positionTitle}</div>
              )}
              {result.parsed.workCountry && (
                <div><span className="text-slate-500">Country:</span> {result.parsed.workCountry}</div>
              )}
              {result.parsed.salaryAmount && (
                <div><span className="text-slate-500">Salary:</span> {result.parsed.salaryAmount}</div>
              )}
              {result.parsed.startDate && (
                <div><span className="text-slate-500">Start:</span> {result.parsed.startDate}</div>
              )}
            </div>
          </div>
        )}

        {/* Findings */}
        <div>
          <h3 className="text-sm font-semibold mb-2">
            Findings ({result.findings.length})
          </h3>
          {result.findings.length === 0 ? (
            <div className="p-3 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-sm text-green-700 dark:text-green-300">
              Nothing flagged by our checks.
            </div>
          ) : (
            <ul className="space-y-2">
              {result.findings.map((f, i) => {
                const style =
                  f.severity === "critical" ? "text-red-700 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800" :
                  f.severity === "warning"  ? "text-amber-700 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800" :
                                              "text-slate-600 bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700";
                return (
                  <li key={`${f.code}-${i}`}
                      className={`p-3 rounded-md border text-sm ${style}`}>
                    <div className="flex items-start gap-2">
                      {f.severity === "critical" ? <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> :
                       f.severity === "warning"  ? <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" /> :
                                                   <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />}
                      <div>
                        <div>{f.message}</div>
                        {f.matched && (
                          <div className="mt-1 text-xs opacity-75 italic">
                            Matched: "{f.matched}"
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {result.aiVisionUsed && result.aiVisionNotes && (
          <div>
            <h3 className="text-sm font-semibold mb-2">AI vision review</h3>
            <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-900/50 text-sm text-slate-700 dark:text-slate-300 italic leading-relaxed">
              "{result.aiVisionNotes}"
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SignalRow({
  ok, label, okText, notOkText,
}: {
  ok: boolean | null; label: string; okText?: string; notOkText?: string;
}) {
  if (ok === null) {
    return (
      <div className="flex items-center gap-2 text-slate-500">
        <Info className="h-4 w-4" />
        <span>{label}: <em>unknown</em></span>
      </div>
    );
  }
  return ok ? (
    <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
      <CheckCircle className="h-4 w-4" />
      <span>{label}{okText ? ` — ${okText}` : ""}</span>
    </div>
  ) : (
    <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
      <XCircle className="h-4 w-4" />
      <span>{label}{notOkText ? ` — ${notOkText}` : ""}</span>
    </div>
  );
}
