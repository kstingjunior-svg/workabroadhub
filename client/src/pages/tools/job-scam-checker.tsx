import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, fetchCsrfToken } from "@/lib/queryClient";
import { FreemiumGate } from "@/components/freemium-gate";
import { UpgradePrompt } from "@/components/upgrade-prompt";
import { SeoHead, buildArticleSchema, buildFaqSchema } from "@/components/seo-head";
import { trackPageView } from "@/lib/analytics";
import { ReportShareBar } from "@/components/report-share-bar";
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  ArrowLeft,
  CheckCircle,
  ChevronRight,
  Search,
  Upload,
  FileImage,
  FileText,
  X,
} from "lucide-react";

const SCAM_FAQS = [
  { q: "How common are overseas job scams targeting Kenyans?", a: "Job scams targeting Kenyans seeking overseas employment are extremely common. Fraudsters impersonate legitimate employers in the UK, UAE, Saudi Arabia, and Canada, charging fake processing fees, visa fees, or training fees. Thousands of Kenyans lose money every year. Our free checker helps you detect red flags before engaging with any employer." },
  { q: "What are the most common signs of a fake overseas job advert?", a: "Key red flags include: requests to pay any fee upfront (visa, training, registration), generic email addresses like Gmail or Yahoo instead of company domains, salaries that seem unrealistically high, vague job descriptions, pressure to respond urgently, and requests to share personal documents before any interview." },
  { q: "How does the Job Scam Checker detect fraud?", a: "Our rule-based engine scans the text for over 40 known scam signals including fee-request phrases, suspicious contact patterns, unrealistic salary claims, urgency language, and high-risk recruiter patterns. It assigns a risk score from 0–100 and lists every warning signal found." },
  { q: "If a job passes the checker, is it safe?", a: "A low risk score means the advert shows few known scam indicators — it does not guarantee the job is legitimate. Always verify the employer independently: check their website, call their registered office, and never pay any fee before signing a verified employment contract." },
  { q: "Which countries have the most overseas job scams targeting Kenyans?", a: "The UAE, Saudi Arabia, Malaysia, and some parts of Europe have historically had high rates of scam job adverts targeting Kenyan workers. Always verify NEA-licensed agencies before engaging with recruiters for these destinations." },
];

interface ScamResult {
  riskLevel: "low" | "medium" | "high";
  riskScore: number;
  warningSignals: string[];
  recommendations: string[];
  aiVerdict?: "SAFE" | "SUSPICIOUS" | "LIKELY SCAM";
  aiExplanation?: string;
  aiFlags?: string[];
  aiConfidence?: number;
  extractedText?: string;
}

const RISK_CONFIG = {
  low: {
    label: "Low Risk",
    icon: ShieldCheck,
    color: "text-green-600 dark:text-green-400",
    bg: "bg-green-50 dark:bg-green-900/20",
    border: "border-green-200 dark:border-green-700",
    badgeClass: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    bar: "bg-green-500",
    description: "This job advert shows few or no known scam indicators. Proceed carefully and verify independently.",
  },
  medium: {
    label: "Medium Risk",
    icon: AlertTriangle,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20",
    border: "border-amber-200 dark:border-amber-700",
    badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    bar: "bg-amber-500",
    description: "Some suspicious patterns detected. Proceed with caution and verify before sharing documents or paying any fees.",
  },
  high: {
    label: "High Risk — Likely Scam",
    icon: XCircle,
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/20",
    border: "border-red-200 dark:border-red-700",
    badgeClass: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    bar: "bg-red-500",
    description: "Multiple high-risk indicators found. This advert strongly resembles known recruitment scam patterns. Do NOT pay any fees.",
  },
};

const SAMPLE_ADVERTS = [
  {
    label: "Suspicious advert",
    text: "URGENT: Earn $5000/month from home! No experience needed, no CV required. Send KES 5000 processing fee via M-Pesa. Contact agent via WhatsApp only: +254712345678 (gmail.com). Guaranteed visa sponsorship! Limited slots — apply IMMEDIATELY!",
  },
  {
    label: "Normal job advert",
    text: "Registered Nurse — NHS South London. We are seeking Band 5 nurses for our busy medical ward. Visa sponsorship available under the Health and Care Worker visa. Apply via our official careers portal. No fees charged at any stage. Interviews conducted virtually.",
  },
];

export default function JobScamChecker() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [result, setResult] = useState<ScamResult | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState<"yes" | "no" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: userPlan } = useQuery<{ planId: string } | null>({
    queryKey: ["/api/user/plan"],
    enabled: !!user,
  });
  const isPaidUser = userPlan?.planId === "pro";

  useEffect(() => {
    trackPageView("job_scam_checker");
  }, []);

  const { mutate: generateReport } = useMutation({
    mutationFn: (reportData: ScamResult) =>
      apiRequest("POST", "/api/tool-reports", { toolName: "scam", reportData }),
    onSuccess: (data: any) => setReportId(data.reportId),
  });

  const { mutate: checkScam, isPending } = useMutation({
    mutationFn: async (text: string) => {
      const res = await fetch("/api/tools/scam-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      return res.json() as Promise<ScamResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      setReportId(null);
      setFeedbackGiven(null);
      generateReport(data);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const { mutate: checkScamFile, isPending: isFilePending } = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const csrfToken = await fetchCsrfToken();
      const res = await fetch("/api/tools/scam-check-file", {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": csrfToken },
        body: formData,
      });
      if (!res.ok) {
        // Guard against non-JSON error responses (e.g. multer/express plain-text errors)
        const text = await res.text();
        let msg = "File analysis failed. Please try pasting the text manually.";
        try { msg = JSON.parse(text).message ?? msg; } catch {}
        throw new Error(msg);
      }
      return res.json() as Promise<ScamResult & { extractedText?: string }>;
    },
    onSuccess: (data) => {
      if (data.extractedText) setText(data.extractedText);
      const { extractedText: _, ...scamResult } = data as any;
      setResult(scamResult);
      setReportId(null);
      setFeedbackGiven(null);
      generateReport(scamResult);
    },
    onError: (err: any) => {
      toast({ title: "File analysis failed", description: err.message, variant: "destructive" });
    },
  });

  const { mutate: submitFeedback } = useMutation({
    mutationFn: async (wasScam: boolean) => {
      const csrfToken = await fetchCsrfToken();
      const res = await fetch("/api/tools/scam-feedback", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ reportId, wasScam, advertText: text.slice(0, 2000) }),
      });
      if (!res.ok) throw new Error("Feedback failed");
      return res.json();
    },
    onSuccess: (_data, wasScam) => {
      setFeedbackGiven(wasScam ? "yes" : "no");
      toast({ title: "Thanks for your feedback!", description: wasScam ? "This advert has been flagged for review." : "Noted — helps us improve accuracy." });
    },
  });

  function handleFileSelect(file: File) {
    const isImage = file.type.startsWith("image/");
    const isPdf   = file.type === "application/pdf";
    const isDoc   = [
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ].includes(file.type);
    if (!isImage && !isPdf && !isDoc) {
      toast({ title: "Unsupported file", description: "Please upload an image (JPG, PNG, screenshot), PDF, or Word document.", variant: "destructive" });
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 15 MB.", variant: "destructive" });
      return;
    }
    setUploadedFile(file);
    setText("");
    setResult(null);
    setReportId(null);
  }

  const isLoading = isPending || isFilePending;
  const cfg = result ? RISK_CONFIG[result.riskLevel] : null;

  const seoSchemas = [
    buildArticleSchema({
      title: "Free Job Scam Checker — Detect Fake Job Adverts",
      description: "Paste any overseas job advert and instantly detect scam signals — fake fees, suspicious contacts, and high-risk phrases.",
      url: "https://workabroadhub.tech/tools/job-scam-checker",
    }),
    buildFaqSchema(SCAM_FAQS),
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      <SeoHead
        title="Free Job Scam Checker — Detect Fake Overseas Job Adverts | WorkAbroad Hub"
        description="Paste any overseas job advert and instantly detect scam signals — fake fees, suspicious contacts, and high-risk phrases. Protect yourself from fraudulent recruiters targeting Kenyans."
        keywords="job scam checker, fake job advert, Kenya job scam, overseas job fraud, verify job offer, scam detection, overseas employment scam, fraudulent recruiter"
        canonicalPath="/tools/job-scam-checker"
        schemas={seoSchemas}
      />

      {/* Header */}
      <div className="bg-gradient-to-r from-red-600 to-red-500 px-4 pt-10 pb-6 text-white">
        <Link href="/tools">
          <button className="flex items-center gap-1 text-red-100 text-sm mb-4 hover:text-white" data-testid="link-back-tools">
            <ArrowLeft className="h-4 w-4" /> Tools
          </button>
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-white/20 rounded-xl flex items-center justify-center">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold" data-testid="text-page-title">Job Scam Checker</h1>
            <p className="text-red-100 text-xs">Detect fraudulent job adverts instantly</p>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 mt-4 space-y-4">
        {/* Intro / Guide */}
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-red-900 dark:text-red-200">How to spot a fake overseas job advert</p>
          <p className="text-xs text-red-800 dark:text-red-300 leading-relaxed">
            Fraudsters target Kenyans seeking overseas work in the UK, UAE, Saudi Arabia, and Canada. Common tactics include requesting upfront payments for "visa processing", "training fees", or "registration" — legitimate employers never charge workers any fees.
          </p>
          <ul className="text-xs text-red-800 dark:text-red-300 space-y-1 list-none">
            <li className="flex items-start gap-1.5"><CheckCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" /> Paste the full text of any job advert below</li>
            <li className="flex items-start gap-1.5"><CheckCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" /> Our engine scans 40+ known scam signals</li>
            <li className="flex items-start gap-1.5"><CheckCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" /> Get a risk score and every warning flag found</li>
          </ul>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 mt-4 space-y-4">
        {/* Input card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Paste or Upload the Job Advert</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* File upload drop zone */}
            <div
              className={`relative border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer ${
                isDragging
                  ? "border-red-400 bg-red-50 dark:bg-red-900/20"
                  : "border-border hover:border-red-300 hover:bg-muted/30"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files[0];
                if (file) handleFileSelect(file);
              }}
              data-testid="dropzone-file-upload"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                data-testid="input-file-upload"
              />
              {uploadedFile ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {uploadedFile.type === "application/pdf"
                      ? <FileText className="h-4 w-4 text-red-500 shrink-0" />
                      : <FileImage className="h-4 w-4 text-red-500 shrink-0" />}
                    <span className="truncate max-w-[220px]">{uploadedFile.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">({(uploadedFile.size / 1024).toFixed(0)} KB)</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setUploadedFile(null); setText(""); setResult(null); }}
                    className="text-muted-foreground hover:text-foreground shrink-0"
                    data-testid="button-remove-file"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  <Upload className="h-5 w-5 text-muted-foreground mx-auto" />
                  <p className="text-xs font-medium text-foreground">Upload image, screenshot, or document</p>
                  <p className="text-xs text-muted-foreground">Any image · PDF · Word doc · max 15 MB</p>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-2">
              <div className="flex-1 border-t border-border" />
              <span className="text-xs text-muted-foreground">or paste text</span>
              <div className="flex-1 border-t border-border" />
            </div>

            <Textarea
              placeholder="Paste the full job advert text here — include the salary, contact details, and any fee mentions…"
              value={text}
              onChange={(e) => { setText(e.target.value); setUploadedFile(null); setResult(null); }}
              rows={6}
              className="text-sm resize-none"
              data-testid="input-job-advert"
            />

            {/* Quick samples */}
            <div className="flex gap-2 flex-wrap">
              <p className="text-xs text-muted-foreground self-center">Try a sample:</p>
              {SAMPLE_ADVERTS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => { setText(s.text); setUploadedFile(null); setResult(null); }}
                  className="text-xs px-2 py-1 bg-muted rounded-md hover:bg-muted/70 transition-colors"
                  data-testid={`button-sample-${s.label.toLowerCase().replace(/\s/g, "-")}`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <Button
              className="w-full"
              disabled={(!uploadedFile && text.trim().length < 10) || isLoading}
              onClick={() => {
                if (uploadedFile) checkScamFile(uploadedFile);
                else checkScam(text);
              }}
              data-testid="button-check-scam"
            >
              {isLoading ? (
                <><Search className="h-4 w-4 mr-2 animate-pulse" />{isFilePending ? "Reading file…" : "Scanning…"}</>
              ) : (
                <><Search className="h-4 w-4 mr-2" />Check for Scams</>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results */}
        {result && cfg && (
          <div className="space-y-4" data-testid="section-scam-results">
            {/* Risk level card */}
            <Card className={`${cfg.border} ${cfg.bg}`}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <cfg.icon className={`h-7 w-7 ${cfg.color} shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className={`font-bold text-base ${cfg.color}`} data-testid="text-risk-level">{cfg.label}</h2>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badgeClass}`}>
                        Score: {result.riskScore}/100
                      </span>
                      {result.aiVerdict && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                          result.aiVerdict === "LIKELY SCAM" ? "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700"
                          : result.aiVerdict === "SUSPICIOUS" ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700"
                          : "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700"
                        }`} data-testid="text-ai-verdict">
                          AI: {result.aiVerdict}
                        </span>
                      )}
                      {result.aiConfidence != null && (
                        <span className="text-xs text-muted-foreground" data-testid="text-ai-confidence">
                          {result.aiConfidence}% confidence
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{cfg.description}</p>
                  </div>
                </div>

                {/* Risk bar */}
                <div className="h-2.5 bg-white/60 dark:bg-black/20 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${cfg.bar}`}
                    style={{ width: `${result.riskScore}%` }}
                  />
                </div>

                {/* AI Explanation */}
                {result.aiExplanation && (
                  <div className="bg-white/50 dark:bg-black/20 rounded-lg px-3 py-2.5">
                    <p className="text-xs font-semibold text-foreground/80 mb-0.5">AI Analysis</p>
                    <p className="text-xs text-foreground/70 leading-relaxed" data-testid="text-ai-explanation">
                      {result.aiExplanation}
                    </p>
                  </div>
                )}

                {/* Feedback */}
                {feedbackGiven ? (
                  <p className="text-xs text-center text-muted-foreground pt-1" data-testid="text-feedback-thanks">
                    ✓ Feedback received — thank you
                  </p>
                ) : (
                  <div className="flex items-center gap-2 pt-1" data-testid="section-feedback">
                    <p className="text-xs text-muted-foreground flex-1">Was this a scam?</p>
                    <button
                      onClick={() => submitFeedback(true)}
                      className="text-xs px-3 py-1 rounded-full bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50 transition-colors font-medium"
                      data-testid="button-feedback-yes"
                    >Yes, it's a scam</button>
                    <button
                      onClick={() => submitFeedback(false)}
                      className="text-xs px-3 py-1 rounded-full bg-green-100 hover:bg-green-200 text-green-700 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50 transition-colors font-medium"
                      data-testid="button-feedback-no"
                    >No, looks legit</button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Share bar */}
            {reportId && <ReportShareBar toolName="scam" reportId={reportId} />}

            {/* Warning signals + recommendations — locked for free users */}
            {isPaidUser ? (
              <>
                {result.warningSignals.length > 0 ? (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        Warning Signals ({result.warningSignals.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {result.warningSignals.map((w, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm" data-testid={`warning-${i}`}>
                            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                            <span>{w}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <p className="text-sm">No common scam phrases detected in this advert.</p>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-blue-500" />
                      Recommendations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {result.recommendations.map((r, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm" data-testid={`recommendation-${i}`}>
                          <span className="h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                {/* CTA: Verify agency via NEA */}
                <Card className="border-blue-200 bg-blue-50 dark:bg-blue-900/10 dark:border-blue-800">
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Verify the Agency</p>
                      <p className="text-xs text-muted-foreground">Check if this recruiter is NEA-licensed</p>
                    </div>
                    <Link href="/nea-agencies">
                      <Button size="sm" variant="outline" data-testid="button-verify-agency">
                        NEA Check <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              </>
            ) : (
              <FreemiumGate
                title="Unlock Full Scam Analysis"
                description={`${result.warningSignals.length} warning signals detected. Upgrade to see every red flag and get personalised safety recommendations.`}
                ctaText="Unlock Full Report"
                blurHeight={140}
              >
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm font-medium text-amber-600 mb-2">⚠ {result.warningSignals.length} warning signals detected</p>
                    <ul className="space-y-1.5">
                      {result.warningSignals.slice(0, 2).map((w, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                          <span className="text-muted-foreground">{w}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </FreemiumGate>
            )}

            {/* Post-result upgrade prompt for free users */}
            {!isPaidUser && user && (
              <UpgradePrompt
                triggerType="tool_used"
                title="See every scam warning signal"
                description="Premium members get the full breakdown of all warning flags and personalised safety recommendations."
                compact
              />
            )}
          </div>
        )}

        {/* Info box */}
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-semibold mb-2">Common Scam Signals to Watch For</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              {["Any request to pay a fee (processing, visa, training)", "Employers using Gmail, Yahoo, Hotmail addresses", "WhatsApp-only communication with no official website", "Promises of guaranteed visa or immediate deployment", "Vague job descriptions with unrealistic salaries"].map((item, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-red-500 mt-0.5">•</span> {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* FAQ Section */}
        <div className="space-y-3 pt-2" data-testid="faq-section-scam">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-red-500" />
            <p className="text-sm font-semibold">Frequently Asked Questions</p>
          </div>
          {SCAM_FAQS.map((faq, i) => (
            <details key={i} className="group rounded-lg border border-border bg-card" data-testid={`faq-item-scam-${i}`}>
              <summary className="flex items-center justify-between cursor-pointer p-3 text-xs font-semibold select-none marker:hidden list-none">
                {faq.q}
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-2 group-open:rotate-90 transition-transform" />
              </summary>
              <div className="px-3 pb-3 text-xs text-muted-foreground leading-relaxed">{faq.a}</div>
            </details>
          ))}
        </div>

        {/* Internal links */}
        <div className="pb-2">
          <p className="text-xs text-muted-foreground font-semibold mb-2">Related tools & services</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/agencies"><span className="text-xs text-blue-600 dark:text-blue-400 underline underline-offset-2">Verify NEA Agencies</span></Link>
            <span className="text-xs text-muted-foreground">·</span>
            <Link href="/tools/visa-sponsorship-jobs"><span className="text-xs text-blue-600 dark:text-blue-400 underline underline-offset-2">Visa Sponsorship Jobs</span></Link>
            <span className="text-xs text-muted-foreground">·</span>
            <Link href="/tools/ats-cv-checker"><span className="text-xs text-blue-600 dark:text-blue-400 underline underline-offset-2">ATS CV Checker</span></Link>
            <span className="text-xs text-muted-foreground">·</span>
            <a href="/api/login"><span className="text-xs text-blue-600 dark:text-blue-400 underline underline-offset-2">Create Free Account</span></a>
          </div>
        </div>
      </div>
    </div>
  );
}
