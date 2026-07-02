/**
 * Visa Screening tool (free) — /tools/visa-check.
 *
 * Upload a visa image or PDF. We OCR it, parse the machine-readable zone
 * (MRZ) and visible fields, and run a rule engine + AI vision pass to
 * flag anomalies. Output is a 0-100 risk score in three bands (low /
 * medium / high) with a findings list — never a "genuine/fake" verdict.
 *
 * Legal framing: this is a SCREENING tool, not official verification.
 * The UI copy and disclaimer make that explicit throughout.
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
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  XCircle,
  CheckCircle,
  ArrowLeft,
  Upload,
  FileImage,
  X,
  Info,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types matching the /api/tools/visa-check response
// ─────────────────────────────────────────────────────────────────────────────

type RiskBand = "low" | "medium" | "high";
type Severity = "info" | "warning" | "critical";

interface Finding {
  code:     string;
  severity: Severity;
  message:  string;
}

interface VisaCheckResult {
  checkId:        string;
  riskScore:      number;
  riskBand:       RiskBand;
  findings:       Finding[];
  parsed: {
    visaNumber:     string | null;
    issuingCountry: string | null;
    holderName:     string | null;
    visaType:       string | null;
    issueDate:      string | null;
    expiryDate:     string | null;
  };
  mrz: {
    present:       boolean;
    checksumValid: boolean | null;
    issuingState:  string | null;
    documentType:  string | null;
    checkDetails:  string;
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
  label:       string;
  Icon:        typeof ShieldCheck;
  color:       string;
  bg:          string;
  border:      string;
  badgeClass:  string;
  bar:         string;
}> = {
  low: {
    label:      "Low Risk — No red flags found",
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
    label:      "High Risk — Do not rely without verification",
    Icon:       XCircle,
    color:      "text-red-600 dark:text-red-400",
    bg:         "bg-red-50 dark:bg-red-900/20",
    border:     "border-red-200 dark:border-red-700",
    badgeClass: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    bar:        "bg-red-500",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const FAQS = [
  {
    q: "How does the Visa Screening tool decide the risk score?",
    a: "We combine three signals: rule-based checks on the visible fields (do the dates make sense, does the visa number match the country's format), Machine Readable Zone (MRZ) checksum validation, and an AI vision review of the image for tampering artifacts. Each finding contributes to a 0-100 composite score, then we translate that into low / medium / high bands.",
  },
  {
    q: "Does a Low Risk result mean the visa is definitely genuine?",
    a: "No. Low Risk means our automated checks did not raise concerns — that is useful signal, but it is not a verification. A skilled forger can produce a document that passes format checks. For anything high-stakes (travel, signing a contract, paying agency fees), always verify the visa directly with the issuing authority.",
  },
  {
    q: "Does a High Risk result mean the visa is a fake?",
    a: "Not automatically. High Risk means we found indicators that a genuine document would not usually have — for example the MRZ checksum failing, dates that don't add up, or the AI vision pass flagging tampering artifacts. The right next step is human review: bring the flagged findings to a licensed agent or contact the issuing authority.",
  },
  {
    q: "Is my visa image stored?",
    a: "The image bytes are hashed and screened, then discarded. We store the extracted text and the screening result for 30 days so admins can review escalated cases. Original images are not persisted. All storage is protected under the Kenya Data Protection Act.",
  },
  {
    q: "Is there a limit on how many visas I can check?",
    a: "Free users can screen up to 3 visas per 24 hours. Signed-in users get a higher limit. If you need to screen many documents (e.g. a licensed agency verifying candidates), contact us for a business plan.",
  },
];

export default function VisaCheckPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile]     = useState<File | null>(null);
  const [result, setResult] = useState<VisaCheckResult | null>(null);
  const [wrongDoc, setWrongDoc] = useState<WrongDocumentPayload | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // Analytics
  trackPageView?.("visa-check");

  // ── Upload mutation ───────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: async (f: File) => {
      const form = new FormData();
      form.append("file", f);
      const csrfToken = await fetchCsrfToken();
      const res = await fetch("/api/tools/visa-check", {
        method:      "POST",
        credentials: "include",
        headers:     { "X-CSRF-Token": csrfToken },
        body:        form,
      });
      if (!res.ok) {
        const text = await res.text();
        // Try parsing the body — it may be a wrongDocumentType payload
        try {
          const body = JSON.parse(text);
          if (isWrongDocumentResponse(body)) {
            // Throw a custom marker so onError can route to the redirect card
            const err: any = new Error(body.message);
            err.wrongDocument = body;
            throw err;
          }
          throw new Error(body.message ?? "Could not screen this document.");
        } catch (parseErr: any) {
          if (parseErr?.wrongDocument) throw parseErr;
          throw new Error("Could not screen this document. Please try again.");
        }
      }
      return res.json() as Promise<VisaCheckResult>;
    },
    onSuccess: (data) => {
      setWrongDoc(null);
      setResult(data);
      toast({
        title: data.riskBand === "low"
          ? "Screening complete — no red flags"
          : data.riskBand === "medium"
          ? "Screening complete — some anomalies"
          : "Screening complete — high risk indicators",
      });
    },
    onError: (err: any) => {
      if (err?.wrongDocument) {
        // Show the redirect card instead of a toast
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

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleFile = (f: File | null) => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please keep the image under 10 MB.",
        variant: "destructive",
      });
      return;
    }
    const isImage = f.type.startsWith("image/");
    const isPdf   = f.type === "application/pdf";
    if (!isImage && !isPdf) {
      toast({
        title: "Unsupported file type",
        description: "Please upload an image (JPG, PNG, WEBP) or a PDF.",
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

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <SeoHead
        title="Visa Screening Tool — WorkAbroad Hub"
        description="Free visa screening for Kenyan jobseekers. Upload your visa or work permit and get an instant risk report — MRZ verification, format checks, and AI-assisted tampering review."
        canonicalPath="/tools/visa-check"
        jsonLd={buildFaqSchema(FAQS)}
      />

      <div className="mx-auto max-w-4xl px-4 py-10">
        <Link href="/tools">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Tools
          </Button>
        </Link>

        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
              <ShieldAlert className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h1 className="text-3xl font-bold">Visa Screening</h1>
            <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
              Free
            </span>
          </div>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            Upload a visa or work-permit image. We run OCR, verify the machine-readable zone,
            and check for tampering signals. Instant risk report — no account needed.
          </p>
        </div>

        {/* Wrong-document redirect card */}
        {wrongDoc && (
          <div className="space-y-4">
            <WrongDocumentCard payload={wrongDoc} onTryAnother={reset} />
          </div>
        )}

        {/* Upload card */}
        {!result && !wrongDoc && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Upload visa image or PDF</CardTitle>
            </CardHeader>
            <CardContent>
              <label
                htmlFor="visa-file"
                className={`
                  block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
                  transition-colors
                  ${file ? "border-indigo-300 bg-indigo-50/50 dark:bg-indigo-900/10" :
                           "border-slate-300 hover:border-indigo-400 dark:border-slate-700 dark:hover:border-indigo-500"}
                `}
              >
                <input
                  ref={fileInputRef}
                  id="visa-file"
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
                {file ? (
                  <div className="flex flex-col items-center gap-3">
                    {preview ? (
                      <img src={preview} alt="Preview" className="max-h-56 rounded-md border border-slate-200 dark:border-slate-700" />
                    ) : (
                      <FileImage className="h-12 w-12 text-indigo-500" />
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
                        JPG, PNG, WEBP, or PDF · up to 10 MB
                      </div>
                    </div>
                  </div>
                )}
              </label>

              <Button
                className="w-full mt-6"
                size="lg"
                disabled={!file || mutation.isPending}
                onClick={() => file && mutation.mutate(file)}
              >
                {mutation.isPending ? "Screening…" : "Screen this visa"}
              </Button>

              <div className="mt-6 p-4 rounded-md bg-slate-50 dark:bg-slate-900/50 text-sm text-slate-600 dark:text-slate-400 flex gap-3">
                <Info className="h-5 w-5 flex-shrink-0 text-slate-400 mt-0.5" />
                <div>
                  <strong>How this works:</strong> we extract the text on your document,
                  verify the MRZ checksum, cross-check dates and formats, and ask a vision
                  model to look for tampering signals. Your image is hashed and screened —
                  the bytes are not stored. Results are kept for 30 days for review.
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Result card */}
        {result && (
          <>
            <ResultCard result={result} />

            <div className="mt-6 flex gap-3">
              <Button onClick={reset} className="flex-1" size="lg">
                Screen another visa
              </Button>
              <Link href="/services/order/work_permit_uae_light" className="flex-1">
                <Button variant="outline" className="w-full" size="lg">
                  Get a proper permit guide
                </Button>
              </Link>
            </div>

            <p className="mt-6 text-xs text-slate-500 dark:text-slate-400 text-center leading-relaxed">
              {result.disclaimer}
            </p>
          </>
        )}

        {/* FAQ */}
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
// ResultCard — dedicated component for the finding-heavy render
// ─────────────────────────────────────────────────────────────────────────────

function ResultCard({ result }: { result: VisaCheckResult }) {
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
        {/* Recommendation */}
        <div className={`p-4 rounded-md ${cfg.bg} border ${cfg.border}`}>
          <div className="text-sm font-medium mb-1">What to do next</div>
          <div className="text-sm text-slate-700 dark:text-slate-300">
            {result.recommendation}
          </div>
        </div>

        {/* MRZ result */}
        {result.mrz.present && (
          <div>
            <h3 className="text-sm font-semibold mb-2">Machine Readable Zone</h3>
            <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-900/50 text-sm space-y-1">
              <div className="flex items-center gap-2">
                {result.mrz.checksumValid ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
                <span>
                  Checksum {result.mrz.checksumValid ? "PASSED" : "FAILED"}
                </span>
              </div>
              <div className="text-xs text-slate-500 pl-6">
                {result.mrz.checkDetails}
              </div>
              {result.mrz.issuingState && (
                <div className="pl-6 text-xs">
                  Issuing state: <span className="font-mono">{result.mrz.issuingState}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Parsed fields */}
        {(result.parsed.visaNumber || result.parsed.holderName ||
          result.parsed.issuingCountry || result.parsed.expiryDate) && (
          <div>
            <h3 className="text-sm font-semibold mb-2">What we read from the document</h3>
            <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-900/50 text-sm grid grid-cols-2 gap-y-2 gap-x-4">
              {result.parsed.holderName && (
                <div><span className="text-slate-500">Holder:</span> {result.parsed.holderName}</div>
              )}
              {result.parsed.visaNumber && (
                <div><span className="text-slate-500">Number:</span> <span className="font-mono">{result.parsed.visaNumber}</span></div>
              )}
              {result.parsed.issuingCountry && (
                <div><span className="text-slate-500">Country:</span> {result.parsed.issuingCountry}</div>
              )}
              {result.parsed.visaType && (
                <div><span className="text-slate-500">Type:</span> {result.parsed.visaType}</div>
              )}
              {result.parsed.issueDate && (
                <div><span className="text-slate-500">Issued:</span> {result.parsed.issueDate}</div>
              )}
              {result.parsed.expiryDate && (
                <div><span className="text-slate-500">Expires:</span> {result.parsed.expiryDate}</div>
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
                const severityStyle =
                  f.severity === "critical" ? "text-red-600 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800" :
                  f.severity === "warning"  ? "text-amber-700 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800" :
                                              "text-slate-600 bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700";
                return (
                  <li key={`${f.code}-${i}`}
                      className={`p-3 rounded-md border text-sm ${severityStyle}`}>
                    <div className="flex items-start gap-2">
                      {f.severity === "critical" ? <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> :
                       f.severity === "warning"  ? <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" /> :
                                                   <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />}
                      <div>{f.message}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* AI vision notes */}
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
