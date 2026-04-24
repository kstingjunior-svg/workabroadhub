import { useState, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { SeoHead } from "@/components/seo-head";
import {
  Sparkles, Upload, FileText, ClipboardList, Copy, Download,
  CheckCircle, Lock, Crown, ChevronRight, Lightbulb, Loader2,
  ArrowLeft, RotateCcw,
} from "lucide-react";
import { apiRequest, fetchCsrfToken } from "@/lib/queryClient";
import { trackPageView } from "@/lib/analytics";
import { useEffect } from "react";

const TOOL_OPTIONS = [
  {
    value: "cover_letter",
    label: "Cover Letter",
    icon: FileText,
    description: "Tailored cover letter for the specific role",
    color: "text-blue-600",
    bg: "bg-blue-50 border-blue-200",
  },
  {
    value: "cv_optimize",
    label: "CV Optimisation",
    icon: ClipboardList,
    description: "Rewrite your CV with ATS-friendly keywords",
    color: "text-teal-600",
    bg: "bg-teal-50 border-teal-200",
  },
  {
    value: "application_answers",
    label: "Application Answers",
    icon: Sparkles,
    description: "Strong answers to common application questions",
    color: "text-purple-600",
    bg: "bg-purple-50 border-purple-200",
  },
] as const;

type ToolType = (typeof TOOL_OPTIONS)[number]["value"];

interface AssistantResult {
  content: string;
  suggestions: string[];
  toolType: ToolType;
  usageCount: number;
  isPremium: boolean;
}

export default function JobApplicationAssistant() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [toolType, setToolType] = useState<ToolType>("cover_letter");
  const [cvMode, setCvMode] = useState<"upload" | "paste">("upload");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvText, setCvText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [result, setResult] = useState<AssistantResult | null>(null);
  const [editedContent, setEditedContent] = useState("");
  const [copied, setCopied] = useState(false);
  const [upgradeRequired, setUpgradeRequired] = useState(false);

  const { data: user } = useQuery<{ id: string } | null>({
    queryKey: ["/api/auth/user"],
  });

  useEffect(() => {
    trackPageView("job_application_assistant");
  }, []);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      if (cvMode === "upload" && cvFile) {
        formData.append("cv", cvFile);
      } else {
        formData.append("cvText", cvText);
      }
      formData.append("jobDescription", jobDescription);
      formData.append("toolType", toolType);

      const csrfToken = await fetchCsrfToken();
      const res = await fetch("/api/tools/job-assistant", {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: { "X-CSRF-Token": csrfToken },
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("__AUTH__");
        }
        if (res.status === 402) {
          setUpgradeRequired(true);
          throw new Error("__UPGRADE__");
        }
        throw new Error(data.message ?? "Generation failed. Please try again.");
      }
      return data as AssistantResult;
    },
    onSuccess: (data) => {
      setResult(data);
      setEditedContent(data.content);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: (err: Error) => {
      if (err.message === "__AUTH__") {
        toast({ title: "Sign in required", description: "Please sign in to use the AI assistant.", variant: "destructive" });
        setLocation("/api/login");
        return;
      }
      if (err.message === "__UPGRADE__") return;
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file) {
      const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
      if (!allowed.includes(file.type)) {
        toast({ title: "Unsupported file type", description: "Please upload a PDF or DOCX file.", variant: "destructive" });
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "File too large", description: "Maximum file size is 5 MB.", variant: "destructive" });
        return;
      }
      setCvFile(file);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(editedContent);
    setCopied(true);
    toast({ title: "Copied!", description: "Content copied to clipboard." });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const toolLabel = TOOL_OPTIONS.find((t) => t.value === result?.toolType)?.label ?? "output";
    const blob = new Blob([editedContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `workabroadhub-${toolLabel.toLowerCase().replace(/ /g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Downloaded!", description: "Your file has been saved." });
  };

  const handleReset = () => {
    setResult(null);
    setEditedContent("");
    setUpgradeRequired(false);
    setCvFile(null);
    setCvText("");
    setJobDescription("");
  };

  const canSubmit =
    jobDescription.trim().length >= 30 &&
    (cvMode === "upload" ? !!cvFile : cvText.trim().length >= 50);

  const selectedTool = TOOL_OPTIONS.find((t) => t.value === toolType)!;

  return (
    <>
      <SeoHead
        title="AI Job Application Assistant — Cover Letter, CV & Answers | WorkAbroad Hub"
        description="Generate tailored cover letters, ATS-optimised CVs, and strong application answers for overseas jobs using AI. Free for first-time users."
        keywords="cover letter generator, CV optimisation, job application Kenya, overseas jobs AI, ATS-friendly CV"
      />

      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="max-w-4xl mx-auto px-4 py-8">

          {/* Header */}
          <div className="mb-8">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/tools")}
              className="mb-4 text-slate-500 hover:text-slate-700"
              data-testid="back-to-tools"
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to Free Tools
            </Button>

            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-teal-500 flex items-center justify-center flex-shrink-0">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-800">AI Job Application Assistant</h1>
                <p className="text-slate-500 mt-1">
                  Generate tailored cover letters, optimise your CV, and craft strong answers — all personalised to the role.
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
                    1 Free Generation
                  </Badge>
                  <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">
                    GPT-4o-mini Powered
                  </Badge>
                  {user && (
                    <Badge variant="secondary" className="text-xs bg-slate-100 text-slate-600">
                      Signed in
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Upgrade gate */}
          {upgradeRequired && (
            <Card className="mb-6 border-amber-200 bg-amber-50">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <Crown className="h-8 w-8 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-amber-900 text-lg">Free limit reached</h3>
                    <p className="text-amber-700 mt-1 text-sm">
                      You've used your 1 free AI generation. Upgrade to WorkAbroad Hub Premium for unlimited cover letters,
                      CV optimisations, and application answers.
                    </p>
                    <div className="flex gap-3 mt-4 flex-wrap">
                      <Button
                        className="bg-amber-500 hover:bg-amber-600 text-white"
                        onClick={() => setLocation("/payment")}
                        data-testid="upgrade-btn"
                      >
                        <Crown className="h-4 w-4 mr-2" /> Upgrade to Premium
                      </Button>
                      <Button variant="outline" onClick={handleReset} className="border-amber-300 text-amber-700">
                        <RotateCcw className="h-4 w-4 mr-2" /> Try Different Tool
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Result view */}
          {result && !upgradeRequired && (
            <div className="space-y-6">
              <Card className="border-green-200 bg-green-50">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-medium">
                      {selectedTool.label} generated successfully!
                    </span>
                    {result.isPremium && (
                      <Badge className="bg-amber-100 text-amber-700 ml-auto">
                        <Crown className="h-3 w-3 mr-1" /> Premium
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Editable output */}
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <selectedTool.icon className={`h-4 w-4 ${selectedTool.color}`} />
                      {selectedTool.label}
                    </CardTitle>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCopy}
                        data-testid="copy-result-btn"
                      >
                        {copied ? (
                          <><CheckCircle className="h-4 w-4 mr-1 text-green-600" /> Copied</>
                        ) : (
                          <><Copy className="h-4 w-4 mr-1" /> Copy</>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleDownload}
                        data-testid="download-result-btn"
                      >
                        <Download className="h-4 w-4 mr-1" /> Download
                      </Button>
                    </div>
                  </div>
                  <CardDescription className="text-xs mt-1">
                    Edit the content below before submitting your application.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    className="min-h-[420px] font-mono text-sm leading-relaxed resize-y"
                    data-testid="result-textarea"
                  />
                </CardContent>
              </Card>

              {/* AI suggestions */}
              {result.suggestions.length > 0 && (
                <Card className="shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 text-slate-700">
                      <Lightbulb className="h-4 w-4 text-amber-500" />
                      AI Suggestions
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {result.suggestions.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                          <ChevronRight className="h-4 w-4 text-teal-500 flex-shrink-0 mt-0.5" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Try another */}
              <div className="flex gap-3 flex-wrap">
                <Button variant="outline" onClick={handleReset} data-testid="generate-another-btn">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  {result.isPremium ? "Generate Another" : "Start Over"}
                </Button>
                {!result.isPremium && (
                  <Button
                    className="bg-amber-500 hover:bg-amber-600 text-white"
                    onClick={() => setLocation("/payment")}
                    data-testid="premium-cta-btn"
                  >
                    <Crown className="h-4 w-4 mr-2" /> Get Unlimited — Upgrade Now
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Input form */}
          {!result && !upgradeRequired && (
            <div className="space-y-6">

              {/* Tool selector */}
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">What do you need?</CardTitle>
                  <CardDescription>Select the type of content to generate.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {TOOL_OPTIONS.map((opt) => {
                      const Icon = opt.icon;
                      const active = toolType === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setToolType(opt.value)}
                          data-testid={`tool-type-${opt.value}`}
                          className={`text-left p-4 rounded-xl border-2 transition-all ${
                            active
                              ? `${opt.bg} border-current ${opt.color}`
                              : "border-slate-200 hover:border-slate-300 bg-white"
                          }`}
                        >
                          <Icon className={`h-5 w-5 mb-2 ${active ? opt.color : "text-slate-400"}`} />
                          <div className={`font-semibold text-sm ${active ? opt.color : "text-slate-700"}`}>
                            {opt.label}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">{opt.description}</div>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* CV input */}
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Your CV</CardTitle>
                  <CardDescription>Upload a file or paste your CV text directly.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={cvMode === "upload" ? "default" : "outline"}
                      onClick={() => setCvMode("upload")}
                      data-testid="cv-mode-upload"
                      className={cvMode === "upload" ? "bg-blue-600 hover:bg-blue-700" : ""}
                    >
                      <Upload className="h-4 w-4 mr-1" /> Upload File
                    </Button>
                    <Button
                      size="sm"
                      variant={cvMode === "paste" ? "default" : "outline"}
                      onClick={() => setCvMode("paste")}
                      data-testid="cv-mode-paste"
                      className={cvMode === "paste" ? "bg-blue-600 hover:bg-blue-700" : ""}
                    >
                      <FileText className="h-4 w-4 mr-1" /> Paste Text
                    </Button>
                  </div>

                  {cvMode === "upload" ? (
                    <div>
                      <input
                        ref={fileRef}
                        type="file"
                        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        className="hidden"
                        onChange={handleFileChange}
                        data-testid="cv-file-input"
                      />
                      <div
                        onClick={() => fileRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                          cvFile
                            ? "border-green-300 bg-green-50"
                            : "border-slate-200 hover:border-blue-300 hover:bg-blue-50"
                        }`}
                        data-testid="cv-drop-zone"
                      >
                        {cvFile ? (
                          <>
                            <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                            <p className="font-medium text-green-700 text-sm">{cvFile.name}</p>
                            <p className="text-xs text-green-600 mt-1">
                              {(cvFile.size / 1024).toFixed(0)} KB — click to change
                            </p>
                          </>
                        ) : (
                          <>
                            <Upload className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                            <p className="font-medium text-slate-600 text-sm">Click to upload your CV</p>
                            <p className="text-xs text-slate-400 mt-1">PDF or DOCX, max 5 MB</p>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Textarea
                        value={cvText}
                        onChange={(e) => setCvText(e.target.value)}
                        placeholder="Paste your full CV text here…"
                        className="min-h-[200px] text-sm resize-y"
                        data-testid="cv-text-input"
                      />
                      <p className="text-xs text-slate-400 mt-1">{cvText.length} characters</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Job description */}
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Job Description</CardTitle>
                  <CardDescription>
                    Paste the full job advert or description for the role you're applying for.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    placeholder="Paste the job description here — include role title, requirements, company name, and location…"
                    className="min-h-[180px] text-sm resize-y"
                    data-testid="job-description-input"
                  />
                  <p className="text-xs text-slate-400 mt-1">{jobDescription.length} / 2000 characters</p>
                </CardContent>
              </Card>

              {/* Free usage notice */}
              {!user && (
                <Card className="border-amber-200 bg-amber-50">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-start gap-3">
                      <Lock className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-800">Sign in to generate</p>
                        <p className="text-xs text-amber-600 mt-0.5">
                          A free account gives you 1 AI generation. Premium users get unlimited.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {user && (
                <Card className="border-blue-100 bg-blue-50">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-2 text-blue-700 text-sm">
                      <Sparkles className="h-4 w-4 text-blue-500" />
                      <span>
                        <strong>1 free generation</strong> included. Premium users enjoy unlimited generations.{" "}
                        <button
                          onClick={() => setLocation("/payment")}
                          className="underline font-medium"
                        >
                          Upgrade now
                        </button>
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Generate button */}
              <Button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending || !canSubmit}
                className="w-full h-12 text-base bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 text-white shadow-md"
                data-testid="generate-btn"
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Generating with AI…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5 mr-2" />
                    Generate {selectedTool.label}
                  </>
                )}
              </Button>

              {!canSubmit && (jobDescription.length > 0 || cvText.length > 0 || cvFile) && (
                <p className="text-xs text-center text-slate-400">
                  {!cvFile && cvMode === "upload" && "Upload your CV · "}
                  {cvMode === "paste" && cvText.trim().length < 50 && "CV text needs at least 50 characters · "}
                  {jobDescription.trim().length < 30 && "Job description needs at least 30 characters"}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
