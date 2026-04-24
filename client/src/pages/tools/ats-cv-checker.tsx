import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, fetchCsrfToken } from "@/lib/queryClient";
import { FreemiumGate } from "@/components/freemium-gate";
import { UpgradePrompt } from "@/components/upgrade-prompt";
import { SeoHead, buildArticleSchema, buildFaqSchema } from "@/components/seo-head";
import { trackPageView } from "@/lib/analytics";
import { ReportShareBar } from "@/components/report-share-bar";
import {
  FileText,
  Upload,
  CheckCircle,
  XCircle,
  AlertCircle,
  ArrowLeft,
  Lock,
  Sparkles,
  Star,
  ChevronRight,
  HelpCircle,
} from "lucide-react";

const ATS_FAQS = [
  { q: "What is an ATS and why does it matter for overseas jobs?", a: "ATS (Applicant Tracking System) is software used by 99% of large employers in the UK, Canada, UAE, and Australia to filter CVs before a human reads them. A CV that fails ATS parsing is rejected automatically, even if you are qualified. Our checker analyses your CV against ATS criteria so you can fix issues before applying." },
  { q: "How does the ATS CV checker score my CV?", a: "The checker uses GPT-4o AI to parse your CV and evaluate keyword density, formatting compatibility, section headings, file structure, and layout. It generates a score from 0–100 and flags specific weaknesses with suggestions to fix them." },
  { q: "What file formats does the ATS CV checker accept?", a: "You can upload PDF or Word (.docx) files. Keep your file under 5MB. Avoid scanned PDFs or image-based CVs — these cannot be parsed by ATS systems or our checker." },
  { q: "Is my CV data kept private?", a: "Your CV is processed securely for analysis only and is not stored or shared. We do not retain your document after the analysis is complete." },
  { q: "What score do I need to pass ATS for overseas jobs?", a: "A score of 70 or above is generally considered ATS-safe. Scores below 50 indicate serious formatting or keyword issues that are likely to cause rejection. Our service helps you target a score of 75+ before applying." },
];

interface ATSResult {
  score: number;
  grade: string;
  summary: string;
  locked?: boolean;
  message?: string;
  strengths?: string[];
  weaknesses?: string[];
  missingKeywords?: string[];
  suggestions?: string[];
}

function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const circumference = 2 * Math.PI * 54;
  const offset = circumference * (1 - score / 100);
  const color =
    score >= 70 ? "#10b981" : score >= 45 ? "#f59e0b" : "#ef4444";

  return (
    <div className="relative h-36 w-36 mx-auto">
      <svg className="h-36 w-36 -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="54" fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle
          cx="60" cy="60" r="54" fill="none"
          stroke={color} strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold" style={{ color }}>{score}</span>
        <span className="text-xs text-muted-foreground font-medium">{grade}</span>
      </div>
    </div>
  );
}

const ATS_CACHE_KEY = "ats_result_cache";

export default function ATSCVChecker() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  const { data: userPlan } = useQuery<{ planId: string } | null>({
    queryKey: ["/api/user/plan"],
    enabled: !!user,
  });
  const isPaidUser = userPlan?.planId === "pro";
  const [result, setResult] = useState<ATSResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [returnedFromLogin, setReturnedFromLogin] = useState(false);

  useEffect(() => {
    trackPageView("ats_cv_checker");
  }, []);

  // When user logs in and comes back to this page, restore the cached score
  // so they see their result and know to re-upload for the full report.
  useEffect(() => {
    if (!user) return;
    try {
      const cached = sessionStorage.getItem(ATS_CACHE_KEY);
      if (cached) {
        const parsed: ATSResult = JSON.parse(cached);
        if (parsed.locked) {
          // User just signed in — show the score but prompt re-upload for full details
          setResult({ ...parsed, locked: false });
          setReturnedFromLogin(true);
        }
      }
    } catch {}
  }, [user]);

  const { mutate: generateReport } = useMutation({
    mutationFn: (reportData: ATSResult) =>
      apiRequest("POST", "/api/tool-reports", { toolName: "ats", reportData }),
    onSuccess: (data: any) => setReportId(data.reportId),
  });

  const { mutate: checkCV, isPending } = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("cv", file);
      const csrfToken = await fetchCsrfToken();
      const res = await fetch("/api/tools/ats-check", {
        method: "POST",
        body: form,
        credentials: "include",
        headers: { "X-CSRF-Token": csrfToken },
      });
      if (!res.ok) {
        let message = "ATS check failed. Please try again.";
        try {
          const err = await res.json();
          message = err.message || message;
        } catch {
          // Server returned a non-JSON body (e.g. proxy error page) — use generic message
        }
        throw new Error(message);
      }
      return res.json() as Promise<ATSResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      setReportId(null);
      setReturnedFromLogin(false);
      // Always cache the result so it survives a login redirect
      try { sessionStorage.setItem(ATS_CACHE_KEY, JSON.stringify(data)); } catch {}
      if (!data.locked) generateReport(data);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleFile = (f: File) => {
    const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (!allowed.includes(f.type)) {
      toast({ title: "Wrong file type", description: "Please upload a PDF or DOCX file.", variant: "destructive" });
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 5 MB.", variant: "destructive" });
      return;
    }
    setFile(f);
    setResult(null);
    setReturnedFromLogin(false);
    try { sessionStorage.removeItem(ATS_CACHE_KEY); } catch {}
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const scoreColor = result
    ? result.score >= 70 ? "text-green-600" : result.score >= 45 ? "text-amber-600" : "text-red-600"
    : "";

  const seoSchemas = [
    buildArticleSchema({
      title: "Free ATS CV Checker for Overseas Jobs",
      description: "Check if your CV will pass ATS systems used by recruiters in Canada, UK, UAE, and Australia. Get instant score, missing keywords & AI suggestions.",
      url: "https://workabroadhub.tech/tools/ats-cv-checker",
    }),
    buildFaqSchema(ATS_FAQS),
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      <SeoHead
        title="Free ATS CV Checker for Overseas Jobs | WorkAbroad Hub"
        description="Check if your CV will pass ATS systems used by recruiters in Canada, UK, UAE, and Australia. Get instant score, missing keywords & AI suggestions. Free."
        keywords="ATS CV checker, ATS resume checker, overseas jobs CV, Kenya overseas jobs, international CV, UK jobs CV, Canada jobs CV, free ATS checker, ATS compatibility"
        canonicalPath="/tools/ats-cv-checker"
        schemas={seoSchemas}
      />

      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-4 pt-10 pb-6 text-white">
        <Link href="/tools">
          <button className="flex items-center gap-1 text-blue-100 text-sm mb-4 hover:text-white" data-testid="link-back-tools">
            <ArrowLeft className="h-4 w-4" /> Tools
          </button>
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-white/20 rounded-xl flex items-center justify-center">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold" data-testid="text-page-title">ATS CV Checker</h1>
            <p className="text-blue-100 text-xs">AI-powered ATS compatibility analysis</p>
          </div>
          <Badge className="ml-auto bg-white/20 text-white border-white/30 text-xs">
            <Sparkles className="h-3 w-3 mr-1" /> AI
          </Badge>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 mt-4 space-y-4">
        {/* Intro / Guide */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">Why ATS matters for overseas job applications</p>
          <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
            99% of large employers in the UK, Canada, UAE, and Australia use Applicant Tracking Systems (ATS) to automatically filter CVs. If your CV uses tables, text boxes, graphics, or missing section headers, ATS software cannot read it — and you are rejected before any human sees your application.
          </p>
          <ul className="text-xs text-blue-800 dark:text-blue-300 space-y-1 list-none">
            <li className="flex items-start gap-1.5"><CheckCircle className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" /> Upload your CV (PDF or Word)</li>
            <li className="flex items-start gap-1.5"><CheckCircle className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" /> Get an ATS score from 0–100 with AI analysis</li>
            <li className="flex items-start gap-1.5"><CheckCircle className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" /> See missing keywords, formatting issues, and suggestions</li>
          </ul>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 mt-4 space-y-4">
        {/* Upload card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Upload Your CV</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                dragOver
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                  : "border-muted hover:border-blue-400 hover:bg-muted/30"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              data-testid="upload-drop-zone"
            >
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              {file ? (
                <div>
                  <p className="text-sm font-medium text-blue-600">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                </div>
              ) : (
                <>
                  <p className="text-sm font-medium mb-1">Drop your CV here or click to browse</p>
                  <p className="text-xs text-muted-foreground">PDF or DOCX · Max 5 MB</p>
                </>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx"
              className="hidden"
              data-testid="input-file"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />

            <Button
              className="w-full"
              disabled={!file || isPending}
              onClick={() => file && checkCV(file)}
              data-testid="button-check-cv"
            >
              {isPending ? (
                <>
                  <Sparkles className="h-4 w-4 mr-2 animate-spin" />
                  Analysing CV…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Check My CV
                </>
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Your CV is processed by AI and not stored on our servers.
            </p>
          </CardContent>
        </Card>

        {/* Results */}
        {result && (
          <div className="space-y-4" data-testid="section-ats-results">
            {/* Score card */}
            <Card>
              <CardContent className="p-6 text-center">
                <ScoreRing score={result.score} grade={result.grade} />
                <p className={`text-sm font-semibold mt-3 ${scoreColor}`}>
                  {result.score >= 70 ? "Strong ATS Compatibility" : result.score >= 45 ? "Moderate — Improvements Needed" : "Weak — Significant Improvements Needed"}
                </p>
                {result.summary && (
                  <p className="text-xs text-muted-foreground mt-2 max-w-xs mx-auto">{result.summary}</p>
                )}
              </CardContent>
            </Card>

            {/* Share bar — shown as soon as report is generated */}
            {reportId && !result.locked && (
              <ReportShareBar toolName="ats" reportId={reportId} />
            )}

            {/* Locked state for unauthenticated users */}
            {result.locked ? (
              <Card className="border-blue-200 bg-blue-50 dark:bg-blue-900/10 dark:border-blue-800">
                <CardContent className="p-6 text-center space-y-3">
                  <Lock className="h-8 w-8 mx-auto text-blue-500" />
                  <h3 className="font-semibold">Full Report Locked</h3>
                  <p className="text-sm text-muted-foreground">{result.message}</p>
                  <a href="/api/login?next=/tools/ats-cv-checker" className="block">
                    <Button className="w-full" data-testid="button-sign-in-for-full">
                      Sign In for Full Report
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </a>
                </CardContent>
              </Card>
            ) : returnedFromLogin ? (
              <Card className="border-green-200 bg-green-50 dark:bg-green-900/10 dark:border-green-800">
                <CardContent className="p-6 text-center space-y-3">
                  <CheckCircle className="h-8 w-8 mx-auto text-green-500" />
                  <h3 className="font-semibold text-green-800 dark:text-green-300">You're signed in!</h3>
                  <p className="text-sm text-muted-foreground">
                    Re-upload your CV above to get your full report — including strengths, weaknesses, missing keywords, and improvement suggestions.
                  </p>
                  <Button
                    variant="outline"
                    className="w-full border-green-400 text-green-700 dark:text-green-400"
                    onClick={() => fileRef.current?.click()}
                    data-testid="button-reupload-cv"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Re-upload CV for Full Report
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Strengths */}
                {result.strengths && result.strengths.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        Strengths ({result.strengths.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {result.strengths.map((s, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm" data-testid={`strength-${i}`}>
                            <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {/* Weaknesses, Keywords & Suggestions — locked for free users */}
                {isPaidUser ? (
                  <>
                    {result.weaknesses && result.weaknesses.length > 0 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-red-500" />
                            Weaknesses ({result.weaknesses.length})
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ul className="space-y-2">
                            {result.weaknesses.map((w, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm" data-testid={`weakness-${i}`}>
                                <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                                <span>{w}</span>
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}

                    {result.missingKeywords && result.missingKeywords.length > 0 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-amber-500" />
                            Missing Keywords
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-2">
                            {result.missingKeywords.map((k, i) => (
                              <Badge key={i} variant="outline" className="text-xs border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300" data-testid={`keyword-${i}`}>
                                {k}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {result.suggestions && result.suggestions.length > 0 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Star className="h-4 w-4 text-blue-500" />
                            Suggestions
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ul className="space-y-2">
                            {result.suggestions.map((s, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm" data-testid={`suggestion-${i}`}>
                                <span className="h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                                <span>{s}</span>
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    )}
                  </>
                ) : (
                  <FreemiumGate
                    title="Unlock Full CV Analysis"
                    description={`Your CV has ${result.weaknesses?.length || 0} weaknesses and ${result.missingKeywords?.length || 0} missing keywords. Upgrade to see every issue and how to fix it.`}
                    ctaText="Unlock Full Report"
                    blurHeight={160}
                  >
                    <div className="space-y-3">
                      {result.weaknesses && result.weaknesses.length > 0 && (
                        <Card>
                          <CardContent className="p-4">
                            <p className="text-sm font-medium text-red-600 mb-2">⚠ {result.weaknesses.length} weaknesses found</p>
                            <ul className="space-y-1.5">
                              {result.weaknesses.slice(0, 2).map((w, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm">
                                  <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                                  <span className="text-muted-foreground">{w}</span>
                                </li>
                              ))}
                            </ul>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  </FreemiumGate>
                )}

                {/* Post-result upgrade prompt for free users */}
                {!isPaidUser && user && (
                  <UpgradePrompt
                    triggerType="tool_used"
                    title="Your ATS report is ready — unlock it all"
                    description="Premium members see full weakness breakdown, all missing keywords, and AI suggestions to boost their score."
                    compact
                  />
                )}

                {/* Step 8 CTA — link to professional CV service */}
                <Card className="border-blue-200 bg-blue-50 dark:bg-blue-900/10 dark:border-blue-800">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="h-10 w-10 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
                      <Sparkles className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">Improve Your CV Automatically</p>
                      <p className="text-xs text-muted-foreground">Our AI writers will rewrite your CV for international markets.</p>
                    </div>
                    <Link href="/service-order/cv_rewrite">
                      <Button size="sm" className="shrink-0" data-testid="button-optimize-cv">
                        Optimise
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        )}
      </div>

      {/* FAQ Section */}
      <div className="max-w-xl mx-auto px-4 mt-6 space-y-3" data-testid="faq-section-ats">
        <div className="flex items-center gap-2 mb-1">
          <HelpCircle className="h-4 w-4 text-blue-500" />
          <p className="text-sm font-semibold">Frequently Asked Questions</p>
        </div>
        {ATS_FAQS.map((faq, i) => (
          <details key={i} className="group rounded-lg border border-border bg-card" data-testid={`faq-item-${i}`}>
            <summary className="flex items-center justify-between cursor-pointer p-3 text-xs font-semibold select-none marker:hidden list-none">
              {faq.q}
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-2 group-open:rotate-90 transition-transform" />
            </summary>
            <div className="px-3 pb-3 text-xs text-muted-foreground leading-relaxed">{faq.a}</div>
          </details>
        ))}
      </div>

      {/* Internal links */}
      <div className="max-w-xl mx-auto px-4 mt-6 pb-4">
        <p className="text-xs text-muted-foreground font-semibold mb-2">Related tools & services</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/tools/cv-templates"><span className="text-xs text-blue-600 dark:text-blue-400 underline underline-offset-2">Free CV Templates</span></Link>
          <span className="text-xs text-muted-foreground">·</span>
          <Link href="/tools/visa-sponsorship-jobs"><span className="text-xs text-blue-600 dark:text-blue-400 underline underline-offset-2">Visa Sponsorship Jobs</span></Link>
          <span className="text-xs text-muted-foreground">·</span>
          <Link href="/tools/job-scam-checker"><span className="text-xs text-blue-600 dark:text-blue-400 underline underline-offset-2">Job Scam Checker</span></Link>
          <span className="text-xs text-muted-foreground">·</span>
          <Link href="/services"><span className="text-xs text-blue-600 dark:text-blue-400 underline underline-offset-2">CV Writing Service</span></Link>
          <span className="text-xs text-muted-foreground">·</span>
          <a href="/api/login?next=/tools/ats-cv-checker"><span className="text-xs text-blue-600 dark:text-blue-400 underline underline-offset-2">Create Free Account</span></a>
        </div>
      </div>
    </div>
  );
}
