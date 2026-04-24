import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useJobRedirect } from "@/hooks/use-job-redirect";
import { useUpgradeModal } from "@/contexts/upgrade-modal-context";
import {
  Zap,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  MapPin,
  Building2,
  Loader2,
  Lock,
  Sparkles,
  Bot,
  Target,
  ClipboardList,
  Edit3,
  Star,
  RefreshCw,
  Send,
} from "lucide-react";

const COUNTRIES = [
  { code: "UK", label: "🇬🇧 United Kingdom" },
  { code: "CA", label: "🇨🇦 Canada" },
  { code: "AE", label: "🇦🇪 UAE / Dubai" },
  { code: "AU", label: "🇦🇺 Australia" },
  { code: "DE", label: "🇩🇪 Germany" },
  { code: "SA", label: "🇸🇦 Saudi Arabia" },
];

const EXPERIENCE_OPTIONS = [
  { value: "0-2", label: "0–2 years" },
  { value: "3-5", label: "3–5 years" },
  { value: "5-10", label: "5–10 years" },
  { value: "10+", label: "10+ years" },
];

const COUNTRY_FLAGS: Record<string, string> = {
  "United Kingdom": "🇬🇧",
  Canada: "🇨🇦",
  "United Arab Emirates": "🇦🇪",
  Australia: "🇦🇺",
  Germany: "🇩🇪",
  "Saudi Arabia": "🇸🇦",
};

interface MatchedJob {
  id: string;
  title: string;
  company: string;
  country: string;
  salary: string | null;
  jobCategory: string | null;
  description: string | null;
  score: number;
  matchReason: string;
}

interface GeneratedApp {
  jobId: string;
  coverLetter: string;
  applicationAnswers: { question: string; answer: string }[];
}

type Step = "profile" | "matching" | "matched" | "generating" | "review" | "done";

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round((score / 10) * 100);
  const color = score >= 8 ? "bg-green-500" : score >= 6 ? "bg-blue-500" : "bg-amber-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-muted-foreground w-8 text-right">{score}/10</span>
    </div>
  );
}

export default function AutoApply() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const { openJob } = useJobRedirect();

  const { openUpgradeModal } = useUpgradeModal();

  const { data: planData } = useQuery<{ planId: string }>({
    queryKey: ["/api/user/plan"],
    enabled: !!user,
  });
  const planId = (planData?.planId || "free").toLowerCase();
  const isPaidPlan = planId === "pro";

  const [step, setStep] = useState<Step>("profile");
  const [jobTitle, setJobTitle] = useState("");
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [experience, setExperience] = useState("");
  const [skills, setSkills] = useState("");

  const [matches, setMatches] = useState<MatchedJob[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [generated, setGenerated] = useState<Record<string, GeneratedApp>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [appliedJobs, setAppliedJobs] = useState<Set<string>>(new Set());
  const [savedCount, setSavedCount] = useState(0);

  const toggleCountry = (code: string) => {
    setSelectedCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const MAX_JOBS = 5;

  const toggleJobSelection = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_JOBS) {
        next.add(id);
      }
      return next;
    });
  };

  const matchMutation = useMutation({
    mutationFn: async () => {
      const countryNames = selectedCountries.map((code) => {
        const map: Record<string, string> = { UK: "United Kingdom", CA: "Canada", AE: "United Arab Emirates", AU: "Australia", DE: "Germany", SA: "Saudi Arabia" };
        return map[code] || code;
      });
      const res = await apiRequest("POST", "/api/auto-apply/match", {
        jobTitle,
        countries: countryNames,
        experience,
        skills,
      });
      return res.json();
    },
    onSuccess: (data) => {
      const jobMatches: MatchedJob[] = data.matches || [];
      setMatches(jobMatches);
      const topIds = jobMatches.slice(0, MAX_JOBS).map((j) => j.id);
      setSelected(new Set(topIds));
      setStep("matched");
    },
    onError: (err: any) => {
      toast({ title: "Matching failed", description: err.message || "Please try again.", variant: "destructive" });
      setStep("profile");
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const selectedJobs = matches.filter((j) => selected.has(j.id));
      const res = await apiRequest("POST", "/api/bulk-apply/generate", {
        jobs: selectedJobs.map((j) => ({
          id: j.id,
          title: j.title,
          company: j.company,
          country: j.country,
          description: j.description,
        })),
        userProfile: skills ? `${jobTitle}, ${experience} years experience. ${skills}` : undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.upgradeRequired) {
        toast({ title: "Upgrade required", description: data.message, variant: "destructive" });
        setStep("matched");
        return;
      }
      if (data.limitReached) {
        toast({ title: "Daily limit reached", description: data.message, variant: "destructive" });
        setStep("matched");
        return;
      }
      const genMap: Record<string, GeneratedApp> = {};
      const editMap: Record<string, string> = {};
      for (const g of data.generated || []) {
        genMap[g.jobId] = g;
        editMap[g.jobId] = g.coverLetter || "";
      }
      setGenerated(genMap);
      setEdits(editMap);
      const firstId = matches.find((j) => selected.has(j.id))?.id;
      setExpandedJob(firstId ?? null);
      setStep("review");
    },
    onError: (err: any) => {
      toast({ title: "Generation failed", description: err.message || "Please try again.", variant: "destructive" });
      setStep("matched");
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const selectedJobs = matches.filter((j) => selected.has(j.id));

      // PRO path: single-shot generate + save (skips separate generate step)
      if (isPaidPlan) {
        return apiRequest("POST", "/api/auto-apply/submit", {
          jobs: selectedJobs.map((j) => ({
            id: j.id,
            title: j.title,
            company: j.company,
            country: j.country,
            salary: j.salary,
            description: j.description,
          })),
          userProfile: skills
            ? `${jobTitle}, ${experience} years experience. ${skills}`
            : undefined,
        });
      }

      // Fallback: use pre-generated letters from the generate step
      const applications = selectedJobs.map((job) => ({
        jobId: job.id,
        jobTitle: job.title,
        companyName: job.company,
        targetCountry: job.country,
        jobUrl: undefined,
        salary: job.salary || undefined,
        coverLetter: edits[job.id] || generated[job.id]?.coverLetter,
        applicationAnswers: generated[job.id]?.applicationAnswers,
      }));
      return apiRequest("POST", "/api/bulk-apply/submit", { applications });
    },
    onSuccess: (data) => {
      setSavedCount(data.saved || selected.size);
      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["/api/tracked-applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bulk-apply/usage"] });
      toast({ title: `${data.saved || selected.size} applications saved!`, description: "Added to your application tracker." });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err.message || "Please try again.", variant: "destructive" });
    },
  });

  const handleStartMatching = () => {
    if (!jobTitle.trim()) {
      toast({ title: "Enter your target role", description: "Tell us what job you're looking for.", variant: "destructive" });
      return;
    }
    setStep("matching");
    matchMutation.mutate();
  };

  const handleGenerate = () => {
    if (selected.size === 0) {
      toast({ title: "Select at least one job", description: "Check the jobs you want to apply to.", variant: "destructive" });
      return;
    }
    setStep("generating");
    generateMutation.mutate();
  };

  const handleOneClickApply = () => {
    if (selected.size === 0) {
      toast({ title: "Select at least one job", description: "Check the jobs you want to apply to.", variant: "destructive" });
      return;
    }
    setStep("generating");
    submitMutation.mutate();
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-gradient-to-r from-violet-600 to-blue-600 px-4 pt-10 pb-8 text-white">
          <Link href="/tools">
            <button className="flex items-center gap-1 text-white/70 text-sm mb-4 hover:text-white">
              <ArrowLeft className="h-4 w-4" /> Tools
            </button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold">AI Auto-Apply</h1>
              <p className="text-white/80 text-xs">AI finds and applies to matching jobs for you</p>
            </div>
          </div>
        </div>
        <div className="max-w-xl mx-auto px-4 mt-6">
          <Card className="border-blue-200 dark:border-blue-700">
            <CardContent className="p-6 text-center space-y-4">
              <div className="h-14 w-14 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto">
                <Lock className="h-7 w-7 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="font-bold text-base mb-1">Sign in to use AI Auto-Apply</h3>
                <p className="text-sm text-muted-foreground">
                  Create a free account to let AI match you to the best overseas jobs and generate applications automatically.
                </p>
              </div>
              <a href="/api/login?next=/tools/auto-apply" className="block w-full">
                <Button className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white" data-testid="button-login-autoapply">
                  <Zap className="h-4 w-4" /> Sign In &amp; Continue
                </Button>
              </a>
              <Link href="/tools">
                <Button variant="outline" className="w-full">Back to Tools</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (user && !isPaidPlan) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-gradient-to-r from-violet-600 to-blue-600 px-4 pt-10 pb-8 text-white">
          <Link href="/tools">
            <button className="flex items-center gap-1 text-white/70 text-sm mb-4 hover:text-white">
              <ArrowLeft className="h-4 w-4" /> Tools
            </button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold">AI Auto-Apply</h1>
              <p className="text-white/80 text-xs">AI finds and applies to matching jobs for you</p>
            </div>
          </div>
        </div>
        <div className="max-w-xl mx-auto px-4 mt-6">
          <Card className="border-violet-200 dark:border-violet-700">
            <CardContent className="p-6 text-center space-y-4">
              <div className="h-14 w-14 bg-violet-100 dark:bg-violet-900/30 rounded-full flex items-center justify-center mx-auto">
                <Lock className="h-7 w-7 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300 mb-2">BASIC / PRO Plan Required</Badge>
                <h3 className="font-bold text-lg mb-1">AI Auto-Apply is a Premium Feature</h3>
                <p className="text-sm text-muted-foreground">
                  Upgrade to let AI match you to the best overseas jobs and automatically generate tailored applications.
                </p>
              </div>
              <div className="text-left bg-muted/50 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">What you unlock</p>
                {[
                  "AI matches you to jobs by score (1–10)",
                  "Generate tailored cover letters instantly",
                  "Apply to up to 5 jobs at once (Basic) or unlimited (Pro)",
                  "Saves all applications to your tracker",
                ].map((f, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <Sparkles className="h-4 w-4 text-violet-500 mt-0.5 shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                <Link href="/pricing">
                  <Button className="w-full gap-2 bg-violet-600 hover:bg-violet-700 text-white" data-testid="button-upgrade-autoapply">
                    <Zap className="h-4 w-4" /> Upgrade to PRO
                  </Button>
                </Link>
                <Link href="/payment">
                  <Button variant="outline" className="w-full" data-testid="button-pay-autoapply">Pay Now</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-gradient-to-r from-green-600 to-emerald-500 px-4 pt-10 pb-8 text-white text-center">
          <CheckCircle2 className="h-14 w-14 mx-auto mb-3" />
          <h1 className="text-2xl font-bold">Applications Saved!</h1>
          <p className="text-green-100 text-sm mt-1">{savedCount} AI-generated applications added to your tracker</p>
        </div>
        <div className="max-w-xl mx-auto px-4 py-6 space-y-4">
          <Card>
            <CardContent className="p-5 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                Open each job below, paste your AI-generated cover letter, and submit directly on the employer's website.
              </p>
              <div className="flex flex-col gap-2">
                <Link href="/application-tracker">
                  <Button className="w-full gap-2" data-testid="button-go-tracker-auto">
                    <ClipboardList className="h-4 w-4" /> View Application Tracker
                  </Button>
                </Link>
                <Button variant="outline" className="w-full" onClick={() => { setStep("profile"); setMatches([]); setSelected(new Set()); setGenerated({}); setEdits({}); }} data-testid="button-restart-auto">
                  <RefreshCw className="h-4 w-4 mr-2" /> Auto-Apply Again
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const selectedJobs = matches.filter((j) => selected.has(j.id));

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="bg-gradient-to-r from-violet-600 to-blue-600 px-4 pt-10 pb-6 text-white">
        <Link href="/tools">
          <button className="flex items-center gap-1 text-white/70 text-sm mb-4 hover:text-white" data-testid="link-back-tools">
            <ArrowLeft className="h-4 w-4" /> Tools
          </button>
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-white/20 rounded-xl flex items-center justify-center">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">AI Auto-Apply</h1>
            <p className="text-white/80 text-xs">{isPaidPlan ? "⚡ Apply to jobs in 1 click with AI" : "AI finds matching jobs — PRO applies in 1 click"}</p>
          </div>
        </div>
        {/* Steps */}
        <div className="mt-4 flex items-center gap-2 text-xs">
          {[
            { key: "profile", label: "Profile" },
            { key: "matching", label: "Match" },
            { key: "matched", label: "Select" },
            { key: "generating", label: "Generate" },
            { key: "review", label: "Review" },
          ].map(({ key, label }, i) => {
            const stepOrder = ["profile", "matching", "matched", "generating", "review", "done"];
            const currentIdx = stepOrder.indexOf(step);
            const thisIdx = stepOrder.indexOf(key);
            const done = thisIdx < currentIdx;
            const active = thisIdx === currentIdx;
            return (
              <div key={key} className="flex items-center gap-1">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${done ? "bg-white text-violet-700" : active ? "bg-yellow-400 text-violet-900" : "bg-white/20 text-white/50"}`}>
                  {done ? "✓" : i + 1}
                </div>
                <span className={active ? "font-semibold text-white" : done ? "text-white/80" : "text-white/40"}>{label}</span>
                {i < 4 && <span className="text-white/30">›</span>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 mt-5 space-y-5">

        {/* ── STEP: Profile ───────────────────────────────────────────────── */}
        {step === "profile" && (
          <>
            <div className="space-y-1">
              <h2 className="text-sm font-bold">Tell us about your career goals</h2>
              <p className="text-xs text-muted-foreground">AI will scan all available jobs and find the best matches for you in seconds.</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Your target job title *</label>
                <Input
                  placeholder="e.g. Registered Nurse, Software Engineer, Accountant"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  className="text-sm"
                  data-testid="input-job-title"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">Preferred countries <span className="text-muted-foreground font-normal">(optional)</span></label>
                <div className="grid grid-cols-2 gap-2">
                  {COUNTRIES.map(({ code, label }) => (
                    <button
                      key={code}
                      onClick={() => toggleCountry(code)}
                      className={`text-xs px-3 py-2 rounded-lg border text-left transition-all ${
                        selectedCountries.includes(code)
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium"
                          : "border-muted bg-background text-muted-foreground hover:border-blue-300"
                      }`}
                      data-testid={`toggle-country-${code}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {selectedCountries.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">No preference = AI searches all countries</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Years of experience <span className="text-muted-foreground font-normal">(optional)</span></label>
                <div className="flex gap-2 flex-wrap">
                  {EXPERIENCE_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setExperience(experience === value ? "" : value)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                        experience === value
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium"
                          : "border-muted text-muted-foreground hover:border-blue-300"
                      }`}
                      data-testid={`toggle-exp-${value}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Skills / background <span className="text-muted-foreground font-normal">(optional — improves AI quality)</span></label>
                <Textarea
                  placeholder="e.g. BSc Nursing, 5 years ICU experience, IELTS 7.0, valid NMC PIN..."
                  rows={3}
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  className="text-xs resize-none"
                  data-testid="textarea-skills"
                />
              </div>
            </div>

            <Button
              className="w-full gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold h-11"
              onClick={handleStartMatching}
              data-testid="button-start-matching"
            >
              <Bot className="h-4 w-4" />
              Find My Matching Jobs
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              AI scans all available visa-sponsored jobs and ranks the best matches for your profile
            </p>
          </>
        )}

        {/* ── STEP: Matching (loading) ────────────────────────────────────── */}
        {step === "matching" && (
          <div className="space-y-4">
            <div className="text-center py-6">
              <div className="h-16 w-16 bg-violet-100 dark:bg-violet-900/30 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                <Bot className="h-8 w-8 text-violet-600" />
              </div>
              <h3 className="font-semibold mb-1">AI is analysing jobs…</h3>
              <p className="text-sm text-muted-foreground">Matching your profile against all available overseas positions</p>
            </div>
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        )}

        {/* ── STEP: Matched ──────────────────────────────────────────────── */}
        {step === "matched" && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold" data-testid="text-match-count">{matches.length} job{matches.length !== 1 ? "s" : ""} matched</h2>
                <p className="text-xs text-muted-foreground">{selected.size} selected for application</p>
              </div>
              <div className="flex gap-2">
                <button className="text-xs text-blue-600 dark:text-blue-400" onClick={() => setSelected(new Set(matches.map(j => j.id)))} data-testid="button-select-all">
                  Select all
                </button>
                <span className="text-muted-foreground text-xs">·</span>
                <button className="text-xs text-muted-foreground" onClick={() => setSelected(new Set())} data-testid="button-clear-all">
                  Clear
                </button>
              </div>
            </div>

            {matches.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center space-y-3">
                  <Target className="h-10 w-10 mx-auto text-muted-foreground" />
                  <p className="text-sm font-medium">No strong matches found</p>
                  <p className="text-xs text-muted-foreground">Try broadening your target countries or adjusting your job title.</p>
                  <Button variant="outline" onClick={() => setStep("profile")} data-testid="button-back-profile">
                    Adjust Profile
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {matches.map((job) => {
                  const isChecked = selected.has(job.id);
                  return (
                    <Card
                      key={job.id}
                      className={`cursor-pointer transition-all ${isChecked ? "border-blue-400 dark:border-blue-600 bg-blue-50/50 dark:bg-blue-950/20" : ""}`}
                      onClick={() => toggleJobSelection(job.id)}
                      data-testid={`card-match-${job.id}`}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${isChecked ? "bg-blue-500 border-blue-500" : "border-muted-foreground/30"}`}>
                            {isChecked && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold leading-snug">{job.title}</p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                  <span className="flex items-center gap-0.5"><Building2 className="h-3 w-3" />{job.company}</span>
                                  <span className="flex items-center gap-0.5">{COUNTRY_FLAGS[job.country] ?? "🌍"}<MapPin className="h-3 w-3" />{job.country}</span>
                                </div>
                              </div>
                              <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border-0 text-[10px] shrink-0" data-testid={`badge-score-${job.id}`}>
                                <Star className="h-2.5 w-2.5 mr-0.5" />{job.score}/10
                              </Badge>
                            </div>
                            <ScoreBar score={job.score} />
                            <p className="text-xs text-muted-foreground mt-1 italic">"{job.matchReason}"</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {matches.length > 0 && (
              <div className="space-y-3">
                {/* PRO: 1-click apply CTA */}
                {isPaidPlan ? (
                  <Button
                    className="w-full gap-2 h-12 text-sm font-bold bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white shadow-md"
                    onClick={handleOneClickApply}
                    disabled={selected.size === 0 || submitMutation.isPending}
                    data-testid="button-one-click-apply"
                  >
                    {submitMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Applying…</>
                    ) : (
                      <>⚡ Apply to {selected.size} job{selected.size !== 1 ? "s" : ""} in 1 click with AI</>
                    )}
                  </Button>
                ) : (
                  <>
                    <Button
                      className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold h-11"
                      onClick={handleGenerate}
                      disabled={selected.size === 0}
                      data-testid="button-generate-auto"
                    >
                      <Sparkles className="h-4 w-4" />
                      Generate AI Applications for {selected.size} Job{selected.size !== 1 ? "s" : ""}
                    </Button>

                    {/* Free user upgrade block */}
                    <button
                      className="w-full rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 px-4 py-3 text-left flex items-center gap-3 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors"
                      onClick={() => openUpgradeModal("feature_locked", "AI Auto-Apply", "pro")}
                      data-testid="button-upgrade-auto-apply"
                    >
                      <div className="h-9 w-9 rounded-full bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center shrink-0">
                        <Lock className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-violet-900 dark:text-violet-100">
                          🔒 Upgrade to PRO to apply instantly without typing
                        </p>
                        <p className="text-xs text-violet-600 dark:text-violet-400 mt-0.5">
                          AI writes & submits cover letters in one click — no copy-pasting
                        </p>
                      </div>
                      <Zap className="h-4 w-4 text-violet-500 shrink-0" />
                    </button>
                  </>
                )}

                <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setStep("profile")} data-testid="button-back-to-profile">
                  ← Adjust Profile
                </Button>
              </div>
            )}
          </>
        )}

        {/* ── STEP: Generating (loading) ─────────────────────────────────── */}
        {step === "generating" && (
          <div className="space-y-4">
            <div className="text-center py-6">
              <div className="h-16 w-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
              </div>
              <h3 className="font-semibold mb-1">Writing your cover letters…</h3>
              <p className="text-sm text-muted-foreground">AI is generating personalised applications for {selectedJobs.length} job{selectedJobs.length !== 1 ? "s" : ""}</p>
            </div>
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        )}

        {/* ── STEP: Review ───────────────────────────────────────────────── */}
        {step === "review" && (
          <>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <h2 className="text-sm font-bold">Review your applications</h2>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              Edit any cover letter before saving. Click "Apply" to open the job in a new tab.
            </p>

            <div className="space-y-3">
              {selectedJobs.map((job) => {
                const gen = generated[job.id];
                const isExpanded = expandedJob === job.id;
                const isApplied = appliedJobs.has(job.id);

                return (
                  <Card key={job.id} className={isApplied ? "border-green-400 dark:border-green-600" : ""} data-testid={`card-review-auto-${job.id}`}>
                    <div
                      className="p-3 flex items-center gap-3 cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => setExpandedJob(isExpanded ? null : job.id)}
                    >
                      <div className="text-xl">{COUNTRY_FLAGS[job.country] ?? "🌍"}</div>
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
                        <Edit3 className="h-3.5 w-3.5 text-muted-foreground" />
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </div>

                    {isExpanded && gen && (
                      <div className="px-3 pb-3 border-t pt-3 space-y-3">
                        <div>
                          <p className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide">Cover Letter</p>
                          <Textarea
                            value={edits[job.id] ?? gen.coverLetter}
                            onChange={(e) => setEdits((prev) => ({ ...prev, [job.id]: e.target.value }))}
                            rows={6}
                            className="text-xs resize-none"
                            data-testid={`textarea-cover-${job.id}`}
                          />
                        </div>
                        {gen.applicationAnswers?.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Application Answers</p>
                            {gen.applicationAnswers.map((qa, i) => (
                              <div key={i} className="text-xs space-y-0.5">
                                <p className="font-medium text-foreground">{qa.question}</p>
                                <p className="text-muted-foreground">{qa.answer}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        {(
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full gap-2 text-xs"
                            onClick={() => {
                              openJob(job.id, "visa");
                              setAppliedJobs((prev) => new Set([...prev, job.id]));
                            }}
                            data-testid={`button-apply-${job.id}`}
                          >
                            <Send className="h-3.5 w-3.5" />
                            Open Job &amp; Apply
                          </Button>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>

            <Button
              className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold h-11"
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              data-testid="button-save-applications"
            >
              {submitMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
              ) : (
                <><ClipboardList className="h-4 w-4" /> Save All to Application Tracker</>
              )}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Applications are saved to your tracker. Open each job and paste the cover letter to submit.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
