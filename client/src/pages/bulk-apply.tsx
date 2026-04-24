import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useJobRedirect } from "@/hooks/use-job-redirect";
import { Link, useLocation } from "wouter";
import {
  Zap,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Edit3,
  Loader2,
  Lock,
  Crown,
  ChevronDown,
  ChevronUp,
  MapPin,
  Building2,
  Send,
  ClipboardList,
  AlertCircle,
  Sparkles,
  X,
} from "lucide-react";

interface Job {
  id: string;
  title: string;
  company: string;
  country: string;
  salary: string | null;
  jobCategory: string | null;
  visaSponsorship: boolean;
  description: string | null;
}

interface GeneratedApp {
  jobId: string;
  coverLetter: string;
  applicationAnswers: { question: string; answer: string }[];
  error?: string | null;
}

interface EditState {
  coverLetter: string;
  applicationAnswers: { question: string; answer: string }[];
}

type Step = "review" | "generating" | "ready" | "submitting" | "done";

const COUNTRY_FLAGS: Record<string, string> = {
  "United Kingdom": "🇬🇧",
  Canada: "🇨🇦",
  "United Arab Emirates": "🇦🇪",
  Australia: "🇦🇺",
  Germany: "🇩🇪",
  "Saudi Arabia": "🇸🇦",
};

export default function BulkApply() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { openJob } = useJobRedirect();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [step, setStep] = useState<Step>("review");
  const [generated, setGenerated] = useState<Record<string, GeneratedApp>>({});
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [editingJob, setEditingJob] = useState<string | null>(null);
  const [appliedJobs, setAppliedJobs] = useState<Set<string>>(new Set());
  const [userProfile, setUserProfile] = useState("");
  const [showProfileInput, setShowProfileInput] = useState(false);
  const [submittedCount, setSubmittedCount] = useState(0);

  // Load jobs from sessionStorage
  useEffect(() => {
    const raw = sessionStorage.getItem("bulkApplyJobs");
    if (!raw) {
      navigate("/tools/visa-sponsorship-jobs");
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      setJobs(parsed);
    } catch {
      navigate("/tools/visa-sponsorship-jobs");
    }
  }, []);

  // Get usage/plan info
  const { data: usage, isLoading: usageLoading, isError: usageError } = useQuery<{
    planId: string;
    usedToday: number;
    dailyLimit: number | null;
    remaining: number | null;
    unlimited: boolean;
    enabled: boolean;
  }>({
    queryKey: ["/api/bulk-apply/usage"],
    staleTime: 30000,
    retry: false,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/bulk-apply/generate", {
        jobs: jobs.map((j) => ({
          id: j.id,
          title: j.title,
          company: j.company,
          country: j.country,
          description: j.description,
        })),
        userProfile: userProfile.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.limitReached) {
        toast({ title: "Daily limit reached", description: data.message, variant: "destructive" });
        setStep("review");
        return;
      }
      if (data.upgradeRequired) {
        toast({ title: "Upgrade required", description: data.message, variant: "destructive" });
        setStep("review");
        return;
      }
      const genMap: Record<string, GeneratedApp> = {};
      const editMap: Record<string, EditState> = {};
      for (const g of data.generated || []) {
        genMap[g.jobId] = g;
        editMap[g.jobId] = {
          coverLetter: g.coverLetter,
          applicationAnswers: g.applicationAnswers || [],
        };
      }
      setGenerated(genMap);
      setEdits(editMap);
      setExpandedJob(jobs[0]?.id ?? null);
      setStep("ready");
    },
    onError: (err: any) => {
      toast({ title: "Generation failed", description: err.message || "Please try again.", variant: "destructive" });
      setStep("review");
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const applications = jobs.map((job) => {
        const edit = edits[job.id];
        return {
          jobId: job.id,
          jobTitle: job.title,
          companyName: job.company,
          targetCountry: job.country,
          jobUrl: undefined,
          salary: job.salary || undefined,
          coverLetter: edit?.coverLetter || generated[job.id]?.coverLetter,
          applicationAnswers: edit?.applicationAnswers || generated[job.id]?.applicationAnswers,
        };
      });
      const res = await apiRequest("POST", "/api/bulk-apply/submit", { applications });
      return res.json();
    },
    onSuccess: (data) => {
      setSubmittedCount(data.saved || jobs.length);
      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["/api/tracked-applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bulk-apply/usage"] });
      sessionStorage.removeItem("bulkApplyJobs");
      toast({ title: `${data.saved} applications saved!`, description: "All saved to your application tracker." });
    },
    onError: (err: any) => {
      toast({ title: "Submit failed", description: err.message || "Please try again.", variant: "destructive" });
    },
  });

  const handleGenerate = () => {
    setStep("generating");
    generateMutation.mutate();
  };

  const handleApplyJob = (job: Job) => {
    openJob(job.id, "visa");
    setAppliedJobs((prev) => new Set([...prev, job.id]));
  };

  const handleFinalSubmit = () => {
    setStep("submitting");
    submitMutation.mutate();
  };

  const removeJob = (id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  };

  const updateEdit = (jobId: string, field: "coverLetter", value: string) => {
    setEdits((prev) => ({ ...prev, [jobId]: { ...prev[jobId], [field]: value } }));
  };

  const updateAnswer = (jobId: string, index: number, answer: string) => {
    setEdits((prev) => {
      const current = prev[jobId];
      if (!current) return prev;
      const newAnswers = [...current.applicationAnswers];
      newAnswers[index] = { ...newAnswers[index], answer };
      return { ...prev, [jobId]: { ...current, applicationAnswers: newAnswers } };
    });
  };

  if (jobs.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // ── Done state ──────────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-gradient-to-r from-green-600 to-emerald-500 px-4 pt-10 pb-8 text-white text-center">
          <CheckCircle2 className="h-14 w-14 mx-auto mb-3 text-white" />
          <h1 className="text-2xl font-bold">Applications Saved!</h1>
          <p className="text-green-100 text-sm mt-1">{submittedCount} applications added to your tracker</p>
        </div>
        <div className="max-w-xl mx-auto px-4 py-6 space-y-4">
          <Card>
            <CardContent className="p-5 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                Your applications are saved in your tracker. Now open each job and submit using the AI-generated cover letter.
              </p>
              <div className="flex flex-col gap-2">
                <Link href="/application-tracker">
                  <Button className="w-full gap-2" data-testid="button-go-tracker">
                    <ClipboardList className="h-4 w-4" /> View Application Tracker
                  </Button>
                </Link>
                <Link href="/tools/visa-sponsorship-jobs">
                  <Button variant="outline" className="w-full" data-testid="button-back-jobs">
                    Browse More Jobs
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-4 pt-10 pb-6 text-white">
        <Link href="/tools/visa-sponsorship-jobs">
          <button className="flex items-center gap-1 text-blue-100 text-sm mb-4 hover:text-white" data-testid="link-back-jobs">
            <ArrowLeft className="h-4 w-4" /> Back to Jobs
          </button>
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-white/20 rounded-xl flex items-center justify-center">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Bulk Apply</h1>
            <p className="text-blue-100 text-xs">Apply to {jobs.length} job{jobs.length !== 1 ? "s" : ""} in minutes</p>
          </div>
          {usage && (
            <div className="ml-auto text-right">
              <Badge className="bg-white/20 text-white border-0 text-xs" data-testid="badge-plan">
                {usage.planId === "pro" ? "PRO ∞" : usage.planId === "basic" ? `BASIC ${usage.remaining}/${usage.dailyLimit} left` : "FREE"}
              </Badge>
            </div>
          )}
        </div>

        {/* Progress steps */}
        <div className="mt-4 flex items-center gap-2 text-xs">
          {["Select", "Generate", "Review", "Apply"].map((label, i) => {
            const stepIndex = step === "review" ? 0 : step === "generating" ? 1 : step === "ready" || step === "submitting" ? 2 : 3;
            const done = i < stepIndex;
            const active = i === stepIndex;
            return (
              <div key={label} className="flex items-center gap-1">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  done ? "bg-white text-blue-600" : active ? "bg-yellow-400 text-blue-900" : "bg-white/20 text-white/60"
                }`}>
                  {done ? "✓" : i + 1}
                </div>
                <span className={active ? "font-semibold text-white" : done ? "text-white/80" : "text-white/40"}>{label}</span>
                {i < 3 && <span className="text-white/30">›</span>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 mt-4 space-y-4">

        {/* Loading skeleton while fetching auth/usage */}
        {usageLoading && (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        )}

        {/* Not signed in — prompt to login */}
        {!usageLoading && usageError && (
          <Card className="border-blue-200 dark:border-blue-700">
            <CardContent className="p-6 text-center space-y-4">
              <div className="h-14 w-14 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto">
                <Lock className="h-7 w-7 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="font-bold text-base mb-1">Sign in to use Bulk Apply</h3>
                <p className="text-sm text-muted-foreground">
                  Create a free account to apply to {jobs.length} job{jobs.length !== 1 ? "s" : ""} with AI-generated cover letters.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <a href="/api/login?next=/bulk-apply" className="w-full">
                  <Button className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white" data-testid="button-login-bulk">
                    <Zap className="h-4 w-4" /> Sign In &amp; Continue
                  </Button>
                </a>
                <Link href="/tools/visa-sponsorship-jobs">
                  <Button variant="outline" className="w-full" data-testid="button-back-from-login">
                    Back to Jobs
                  </Button>
                </Link>
              </div>
              <p className="text-xs text-muted-foreground">
                Free plan includes 3 AI applications per day. No credit card required.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Plan gate for FREE users */}
        {usage && !usage.enabled && (
          <Card className="border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
            <CardContent className="p-5 text-center space-y-3">
              <Lock className="h-8 w-8 mx-auto text-amber-500" />
              <h3 className="font-bold">Bulk Apply — Paid Feature</h3>
              <p className="text-sm text-muted-foreground">
                Bulk Apply is available on Basic (5 jobs/day) and Pro (unlimited) plans. Upgrade to apply to multiple jobs with AI-generated cover letters.
              </p>
              <div className="flex flex-col gap-2">
                <Link href="/pricing">
                  <Button className="w-full gap-2 bg-amber-500 hover:bg-amber-600 text-white" data-testid="button-upgrade-bulk">
                    <Crown className="h-4 w-4" /> Upgrade Plan
                  </Button>
                </Link>
                <Link href="/tools/visa-sponsorship-jobs">
                  <Button variant="outline" className="w-full">Go Back to Jobs</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Daily limit warning */}
        {usage && usage.enabled && !usage.unlimited && usage.remaining !== null && usage.remaining < jobs.length && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3 flex gap-2 text-xs text-amber-800 dark:text-amber-300">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              You can apply to <strong>{usage.remaining}</strong> more job{usage.remaining !== 1 ? "s" : ""} today (Basic: 5/day limit). Only the first {usage.remaining} will be processed.
            </span>
          </div>
        )}

        {/* STEP: Review / pre-generate */}
        {(step === "review" || step === "generating") && usage?.enabled && (
          <>
            <div className="space-y-2">
              <h2 className="text-sm font-bold" data-testid="text-selected-jobs-title">
                {jobs.length} Selected Job{jobs.length !== 1 ? "s" : ""}
              </h2>
              {jobs.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-center text-muted-foreground text-sm">
                    No jobs selected. <Link href="/tools/visa-sponsorship-jobs" className="text-blue-600 underline">Browse jobs</Link> to add more.
                  </CardContent>
                </Card>
              ) : (
                jobs.map((job) => (
                  <Card key={job.id} data-testid={`card-selected-job-${job.id}`}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="text-xl">{COUNTRY_FLAGS[job.country] ?? "🌍"}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{job.title}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-0.5"><Building2 className="h-3 w-3" />{job.company}</span>
                          <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{job.country}</span>
                        </div>
                      </div>
                      <button
                        className="h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
                        onClick={() => removeJob(job.id)}
                        aria-label={`Remove ${job.title}`}
                        data-testid={`button-remove-job-${job.id}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            {/* Optional profile input */}
            <div className="space-y-2">
              <button
                className="text-xs text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1"
                onClick={() => setShowProfileInput(!showProfileInput)}
                data-testid="button-toggle-profile"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {showProfileInput ? "Hide" : "+ Add your profile"} (optional, improves AI quality)
              </button>
              {showProfileInput && (
                <Textarea
                  placeholder="Briefly describe your experience, skills, and what you're looking for. E.g. 'Registered nurse with 5 years ICU experience in Kenya, seeking UK NHS roles with visa sponsorship...'"
                  rows={4}
                  value={userProfile}
                  onChange={(e) => setUserProfile(e.target.value)}
                  className="text-xs"
                  data-testid="textarea-user-profile"
                />
              )}
            </div>

            <Button
              className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold h-11"
              onClick={handleGenerate}
              disabled={step === "generating" || generateMutation.isPending || jobs.length === 0}
              data-testid="button-generate-applications"
            >
              {step === "generating" || generateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating cover letters…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate AI Applications for {jobs.length} Job{jobs.length !== 1 ? "s" : ""}
                </>
              )}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              AI will generate a cover letter + 3 tailored answers per job
            </p>
          </>
        )}

        {/* STEP: Ready — show generated content */}
        {step === "ready" && (
          <>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <h2 className="text-sm font-bold">Review Your Applications</h2>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              Review and edit each cover letter before submitting. Click "Apply" to open the job in a new tab.
            </p>

            <div className="space-y-3">
              {jobs.map((job, idx) => {
                const gen = generated[job.id];
                const edit = edits[job.id];
                const isExpanded = expandedJob === job.id;
                const isEditing = editingJob === job.id;
                const isApplied = appliedJobs.has(job.id);

                return (
                  <Card
                    key={job.id}
                    className={`overflow-hidden transition-all ${isApplied ? "border-green-400 dark:border-green-600" : ""}`}
                    data-testid={`card-review-job-${job.id}`}
                  >
                    {/* Job header */}
                    <div
                      className="p-3 flex items-center gap-3 cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => setExpandedJob(isExpanded ? null : job.id)}
                    >
                      <div className="text-lg">{COUNTRY_FLAGS[job.country] ?? "🌍"}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold truncate">{job.title}</p>
                          {isApplied && (
                            <Badge className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 shrink-0">
                              Applied ✓
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{job.company} · {job.country}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">#{idx + 1}</span>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && gen && (
                      <div className="border-t border-border px-3 pb-3 space-y-3">
                        {/* Cover Letter */}
                        <div className="space-y-1.5 pt-3">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-foreground">Cover Letter</p>
                            <button
                              className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1"
                              onClick={() => setEditingJob(isEditing ? null : job.id)}
                              data-testid={`button-edit-cover-${job.id}`}
                            >
                              <Edit3 className="h-3 w-3" />
                              {isEditing ? "Done" : "Edit"}
                            </button>
                          </div>
                          {isEditing ? (
                            <Textarea
                              value={edit?.coverLetter ?? gen.coverLetter}
                              onChange={(e) => updateEdit(job.id, "coverLetter", e.target.value)}
                              rows={8}
                              className="text-xs font-mono"
                              data-testid={`textarea-cover-${job.id}`}
                            />
                          ) : (
                            <div className="bg-muted/50 rounded-lg p-3 text-xs text-foreground whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto" data-testid={`text-cover-${job.id}`}>
                              {edit?.coverLetter ?? gen.coverLetter}
                            </div>
                          )}
                        </div>

                        {/* Application Answers */}
                        {(edit?.applicationAnswers ?? gen.applicationAnswers ?? []).length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-foreground">Application Answers</p>
                            {(edit?.applicationAnswers ?? gen.applicationAnswers ?? []).map((qa, i) => (
                              <div key={i} className="space-y-1" data-testid={`qa-block-${job.id}-${i}`}>
                                <p className="text-xs font-medium text-muted-foreground">{qa.question}</p>
                                {isEditing ? (
                                  <Textarea
                                    value={qa.answer}
                                    onChange={(e) => updateAnswer(job.id, i, e.target.value)}
                                    rows={3}
                                    className="text-xs"
                                    data-testid={`textarea-answer-${job.id}-${i}`}
                                  />
                                ) : (
                                  <div className="bg-muted/50 rounded-lg p-2.5 text-xs text-foreground leading-relaxed">
                                    {qa.answer}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Fast Apply CTA */}
                        <div className="flex items-center gap-2 pt-1">
                          {(
                            <Button
                              size="sm"
                              className={`flex-1 gap-1.5 h-9 ${isApplied ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"} text-white`}
                              onClick={() => handleApplyJob(job)}
                              data-testid={`button-fast-apply-${job.id}`}
                            >
                              {isApplied ? (
                                <><CheckCircle2 className="h-3.5 w-3.5" /> Applied</>
                              ) : (
                                <><ExternalLink className="h-3.5 w-3.5" /> Open & Apply</>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>

            {/* Submit all to tracker */}
            <div className="space-y-2 pt-2">
              <Button
                className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold h-11"
                onClick={handleFinalSubmit}
                disabled={step === "submitting" || submitMutation.isPending}
                data-testid="button-submit-all"
              >
                {submitMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Saving applications…</>
                ) : (
                  <><Send className="h-4 w-4" /> Confirm & Save {jobs.length} Applications to Tracker</>
                )}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                This saves all applications to your tracker. You still need to click "Open & Apply" on each job.
              </p>
            </div>
          </>
        )}

        {/* Submitting state */}
        {step === "submitting" && (
          <Card>
            <CardContent className="p-8 text-center space-y-3">
              <Loader2 className="h-10 w-10 animate-spin mx-auto text-blue-500" />
              <p className="text-sm font-semibold">Saving your applications…</p>
              <p className="text-xs text-muted-foreground">This will only take a moment</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
