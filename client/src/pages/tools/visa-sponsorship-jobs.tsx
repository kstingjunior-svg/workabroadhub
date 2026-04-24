import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link, useLocation } from "wouter";
import { SeoHead, buildArticleSchema, buildFaqSchema } from "@/components/seo-head";
import { trackPageView } from "@/lib/analytics";
import { useAuth } from "@/hooks/use-auth";
import { useUpgradeModal } from "@/contexts/upgrade-modal-context";
import { useJobRedirect } from "@/hooks/use-job-redirect";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

async function trackEvent(event: string, extra?: { category?: string; country?: string }) {
  try { await apiRequest("POST", "/api/track", { event, page: window.location.pathname, ...extra }); } catch {}
}
import {
  Briefcase,
  ArrowLeft,
  Globe,
  ExternalLink,
  RefreshCcw,
  MapPin,
  Building2,
  BadgeCheck,
  DollarSign,
  Zap,
  CheckSquare,
  Square,
  Lock,
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Loader2,
  Send,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const COUNTRY_TO_CODE: Record<string, string> = {
  "United Kingdom": "uk",
  "Canada": "canada",
  "United Arab Emirates": "uae",
  "Australia": "australia",
  "Germany": "europe",
  "Saudi Arabia": "uae",
  "United States": "usa",
};

const VISA_FAQS = [
  { q: "What does 'visa sponsorship' mean for overseas jobs?", a: "Visa sponsorship means the employer applies for your work visa on your behalf and is registered with the destination country's immigration authority. For example, UK employers must hold a Sponsor Licence, Canadian employers use LMIA, and UAE employers sponsor your residence visa. Without sponsorship, you cannot legally work in most of these countries." },
  { q: "Can Kenyans get visa-sponsored jobs in the UK, Canada, and UAE?", a: "Yes. Kenya is one of the largest sources of skilled workers for the UK NHS, Canadian healthcare, and Gulf hospitality sectors. Nurses, care workers, engineers, IT professionals, and hospitality workers from Kenya are in demand and regularly receive visa sponsorship from verified employers." },
  { q: "Do I need to pay for visa sponsorship?", a: "Legitimate employers never charge you for visa sponsorship. If a recruiter or employer asks you to pay for sponsorship, visa application fees, or any other costs upfront, this is a scam. All genuine visa sponsorship costs are paid by the employer." },
  { q: "How do I know a job listing offering visa sponsorship is real?", a: "Always verify: the employer has a valid sponsor licence (for UK, check the UKVI register), the recruiter is NEA-licensed (for Kenya), there are no upfront fees requested, and you receive a written employment contract before travelling. Use our Job Scam Checker to analyse any advert you find." },
  { q: "What sectors have the most visa-sponsored jobs for Kenyans?", a: "The highest-demand sectors are: healthcare (nurses, carers, doctors) for UK and Canada, construction and engineering for UAE and Saudi Arabia, hospitality for UAE and Europe, technology for Canada and Germany, and domestic/household workers for Gulf states." },
];

interface Job {
  id: string;
  title: string;
  company: string;
  country: string;
  salary: string | null;
  jobCategory: string | null;
  visaSponsorship: boolean;
  applyLink: string | null;
  email: string | null;
  description: string | null;
  createdAt: string;
}

const COUNTRIES = [
  "All Countries",
  "United Kingdom",
  "Canada",
  "United Arab Emirates",
  "Australia",
  "Germany",
  "Saudi Arabia",
  "United States",
];

const CATEGORIES = [
  "All Categories",
  "Healthcare",
  "Technology",
  "Engineering",
  "Finance",
  "Hospitality",
];

const COUNTRY_FLAGS: Record<string, string> = {
  "United Kingdom": "🇬🇧",
  Canada: "🇨🇦",
  "United Arab Emirates": "🇦🇪",
  Australia: "🇦🇺",
  Germany: "🇩🇪",
  "Saudi Arabia": "🇸🇦",
  "United States": "🇺🇸",
};

function JobCard({
  job,
  selected,
  onToggle,
  selectionMode,
  isPaidUser,
  onUpgradeRequired,
  onSave,
  isSaved,
  isSaving,
  onPrepare,
  isPreparing,
}: {
  job: Job;
  selected: boolean;
  onToggle: (id: string) => void;
  selectionMode: boolean;
  isPaidUser: boolean;
  onUpgradeRequired: () => void;
  onSave: (job: Job) => void;
  isSaved: boolean;
  isSaving: boolean;
  onPrepare: (job: Job) => void;
  isPreparing: boolean;
}) {
  const flag = COUNTRY_FLAGS[job.country] ?? "🌍";
  const { openJob } = useJobRedirect();
  const [showSimilar, setShowSimilar]   = useState(false);
  const [similarJobs, setSimilarJobs]   = useState<Job[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);

  useEffect(() => {
    if (!showSimilar || similarJobs.length) return;
    setLoadingSimilar(true);
    fetch(`/api/jobs/${job.id}/similar`, { credentials: "include" })
      .then(res => res.json())
      .then(data => setSimilarJobs(Array.isArray(data) ? data : []))
      .catch(() => setSimilarJobs([]))
      .finally(() => setLoadingSimilar(false));
  }, [showSimilar, job.id]);

  const handleToggle = () => {
    if (!isPaidUser) {
      onUpgradeRequired();
      return;
    }
    onToggle(job.id);
  };

  return (
    <Card
      className={`overflow-hidden transition-all duration-150 ${
        selected
          ? "ring-2 ring-blue-500 shadow-md bg-blue-50/30 dark:bg-blue-950/20"
          : "hover:shadow-md"
      }`}
      data-testid={`card-job-${job.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          <div
            className="mt-1 flex-shrink-0 cursor-pointer"
            onClick={handleToggle}
          >
            {isPaidUser ? (
              <Checkbox
                checked={selected}
                onCheckedChange={handleToggle}
                className="h-5 w-5"
                data-testid={`checkbox-job-${job.id}`}
              />
            ) : (
              <div
                className="h-5 w-5 rounded border-2 border-muted-foreground/30 flex items-center justify-center bg-muted/20"
                data-testid={`checkbox-job-${job.id}`}
              >
                <Lock className="h-2.5 w-2.5 text-muted-foreground/50" />
              </div>
            )}
          </div>

          <div className="h-10 w-10 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-center text-xl shrink-0">
            {flag}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-sm leading-tight" data-testid={`text-job-title-${job.id}`}>{job.title}</h3>
              {job.visaSponsorship && (
                <Badge className="text-[10px] bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 shrink-0 flex items-center gap-0.5">
                  <BadgeCheck className="h-3 w-3" /> Visa
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {job.company}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {job.country}
              </span>
              {job.salary && (
                <span className="flex items-center gap-1 text-green-700 dark:text-green-400 font-medium">
                  <DollarSign className="h-3 w-3" />
                  {job.salary}
                </span>
              )}
            </div>

            {job.jobCategory && (
              <Badge variant="outline" className="text-[10px] mt-2 border-blue-200 dark:border-blue-700">
                {job.jobCategory}
              </Badge>
            )}

            {job.description && (
              <p className="text-xs text-muted-foreground mt-2 line-clamp-2 leading-relaxed">{job.description}</p>
            )}

            <div className="flex items-center gap-2 mt-3">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={(e) => {
                  e.stopPropagation();
                  if (job.applyLink) {
                    window.open(job.applyLink, "_blank", "noopener,noreferrer");
                  } else {
                    openJob(job.id, "visa");
                  }
                }}
                data-testid={`btn-apply-${job.id}`}
              >
                <ExternalLink className="h-3 w-3" /> Apply Directly
              </Button>
              <button
                onClick={(e) => { e.stopPropagation(); onSave(job); }}
                disabled={isSaved || isSaving}
                className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-colors ${
                  isSaved
                    ? "text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 cursor-default"
                    : isSaving
                    ? "text-muted-foreground cursor-wait"
                    : "text-muted-foreground hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20"
                }`}
                data-testid={`button-save-job-${job.id}`}
              >
                {isSaved ? (
                  <><BookmarkCheck className="h-3 w-3" /> Saved</>
                ) : (
                  <><Bookmark className="h-3 w-3" /> {isSaving ? "Saving…" : "Save"}</>
                )}
              </button>
              <button
                onClick={handleToggle}
                className={`text-xs font-medium px-2 py-1 rounded-md transition-colors ${
                  isPaidUser
                    ? selected
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    : "text-muted-foreground/50 cursor-pointer"
                }`}
                data-testid={`button-select-job-${job.id}`}
              >
                {selected ? "✓ Selected" : isPaidUser ? "+ Select" : <span className="flex items-center gap-1"><Lock className="h-2.5 w-2.5" /> Select</span>}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setShowSimilar(v => !v); }}
                className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                data-testid={`btn-similar-${job.id}`}
              >
                {showSimilar ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Similar
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); isPaidUser ? onPrepare(job) : onUpgradeRequired(); }}
                disabled={isPreparing}
                className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-colors ${
                  isPaidUser
                    ? "text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                    : "text-muted-foreground/50"
                }`}
                data-testid={`btn-prepare-${job.id}`}
              >
                {isPreparing
                  ? <><Loader2 className="h-3 w-3 animate-spin" /> Preparing…</>
                  : isPaidUser
                  ? <><Sparkles className="h-3 w-3" /> AI Prep</>
                  : <><Lock className="h-2.5 w-2.5" /> AI Prep</>}
              </button>
            </div>

            {/* Similar jobs panel */}
            {showSimilar && (
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700" data-testid={`panel-similar-${job.id}`}>
                <h2 className="text-lg font-bold mt-6">🔥 Similar Jobs You May Like</h2>
                {loadingSimilar ? (
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    {[1, 2].map(i => <div key={i} className="h-16 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />)}
                  </div>
                ) : similarJobs.length === 0 ? (
                  <p className="text-xs text-muted-foreground mt-2">No similar jobs found.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    {similarJobs.map(sj => (
                      <div
                        key={sj.id}
                        className="border p-3 rounded cursor-pointer hover:shadow-sm transition-shadow dark:border-gray-700"
                        onClick={() => {
                          trackEvent("click_similar_job", { category: job.category ?? undefined, country: job.country ?? undefined });
                          window.location.href = `/job/${sj.id}`;
                        }}
                        data-testid={`card-similar-job-${sj.id}`}
                      >
                        <h3 className="font-semibold text-sm leading-tight">{sj.title}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{sj.country}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function VisaSponsorshipJobs() {
  const [, navigate] = useLocation();
  const [country, setCountry] = useState("All Countries");
  const [category, setCategory] = useState("All Categories");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set());
  const [savingJobId, setSavingJobId] = useState<string | null>(null);

  const { user } = useAuth();
  const { openUpgradeModal } = useUpgradeModal();
  const { toast } = useToast();

  const { data: userPlan } = useQuery<{ planId: string } | null>({
    queryKey: ["/api/user/plan"],
    enabled: !!user,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const planId = (userPlan?.planId || "free").toLowerCase();
  const isPaidUser = planId === "pro";

  const saveToTrackerMutation = useMutation({
    mutationFn: (job: Job) =>
      apiRequest("POST", "/api/tracked-applications", {
        jobTitle: job.title,
        companyName: job.company,
        jobUrl: null,
        targetCountry: COUNTRY_TO_CODE[job.country] ?? "usa",
        salary: job.salary ?? "",
        location: job.country,
        jobType: "full-time",
        source: "Visa Sponsorship Jobs",
        status: "saved",
        notes: job.description ? job.description.slice(0, 200) : "",
        appliedAt: null,
      }),
    onSuccess: (_data, job) => {
      setSavedJobIds((prev) => new Set(prev).add(job.id));
      setSavingJobId(null);
      toast({
        title: "Job saved!",
        description: (
          <span>
            <strong>{job.title}</strong> at {job.company} saved.{" "}
            <a href="/application-tracker" className="underline font-medium text-teal-600">View Tracker →</a>
          </span>
        ) as any,
      });
    },
    onError: () => {
      setSavingJobId(null);
      toast({ title: "Error", description: "Could not save job. Please try again.", variant: "destructive" });
    },
  });

  const handleSaveJob = (job: Job) => {
    if (!user) {
      toast({ title: "Login required", description: "Please log in to save jobs to your tracker.", variant: "destructive" });
      return;
    }
    if (savedJobIds.has(job.id)) return;
    setSavingJobId(job.id);
    saveToTrackerMutation.mutate(job);
  };

  type PreparedApplication = {
    coverLetter: string;
    matchingSkills: string[];
    commonQA: { question: string; answer: string }[];
  };

  const [application, setApplication] = useState<PreparedApplication | null>(null);
  const [preparingJobId, setPreparingJobId] = useState<string | null>(null);
  const [reviewJob, setReviewJob] = useState<Job | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const prepareMutation = useMutation({
    mutationFn: (job: Job) =>
      apiRequest("POST", "/api/prepare-application", { job }).then(
        (r: { application: PreparedApplication }) => r.application
      ),
    onSuccess: (data, job) => {
      setApplication(data);
      setReviewJob(job);
      setPreparingJobId(null);
      setReviewOpen(true);
    },
    onError: (err: any) => {
      setPreparingJobId(null);
      const msg = (err?.message ?? "").toLowerCase();
      if (msg.includes("pro") || msg.includes("upgrade") || err?.status === 403) {
        toast({ title: "PRO required", description: "Upgrade to PRO to use AI Application Prep.", variant: "destructive" });
        handleUpgradeRequired();
      } else if (msg.includes("no cv") || msg.includes("upload") || err?.status === 404) {
        toast({ title: "No CV found", description: "Upload your CV first to use AI Prep.", variant: "destructive" });
      } else {
        toast({ title: "AI Prep failed", description: err?.message || "Could not prepare application. Please try again.", variant: "destructive" });
      }
    },
  });

  const handlePrepare = (job: Job) => {
    setPreparingJobId(job.id);
    prepareMutation.mutate(job);
  };

  const submitApplication = () => {
    if (!reviewJob) return;
    saveToTrackerMutation.mutate(reviewJob);
    setReviewOpen(false);
    if (reviewJob.applyLink) {
      window.open(reviewJob.applyLink, "_blank", "noopener,noreferrer");
    }
    toast({ title: "Application submitted", description: `${reviewJob.title} at ${reviewJob.company} saved to your tracker.` });
  };

  const [jobs, setJobs] = useState<Job[] | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchJobs = useCallback(async (c: string, cat: string) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsFetching(true);
    try {
      const params = new URLSearchParams();
      if (c !== "All Countries") params.set("country", c);
      if (cat !== "All Categories") params.set("category", cat);
      const qs = params.toString();
      const url = qs ? `/api/jobs/sponsorship?${qs}` : "/api/jobs/sponsorship";
      const res = await fetch(url, { credentials: "include", signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Job[] = await res.json();
      setJobs(data);
    } catch (err: any) {
      if (err.name !== "AbortError") setJobs([]);
    } finally {
      setIsLoading(false);
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs(country, category);
  }, [country, category, fetchJobs]);

  const refetch = () => fetchJobs(country, category);

  useEffect(() => {
    trackPageView("visa_sponsorship_jobs");
  }, []);

  const handleUpgradeRequired = () => {
    openUpgradeModal("jobs_locked", "Visa Sponsorship Jobs", "pro");
  };

  const MAX_JOBS = 5;

  const toggleJob = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_JOBS) {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = () => {
    if (!isPaidUser) {
      handleUpgradeRequired();
      return;
    }
    if (!jobs) return;
    setSelectedIds(new Set(jobs.slice(0, MAX_JOBS).map((j) => j.id)));
  };

  const clearAll = () => setSelectedIds(new Set());

  const handleBulkApply = () => {
    if (!isPaidUser) {
      handleUpgradeRequired();
      return;
    }
    if (selectedIds.size === 0 || !jobs) return;
    const selectedJobs = jobs.filter((j) => selectedIds.has(j.id));
    sessionStorage.setItem("bulkApplyJobs", JSON.stringify(selectedJobs));
    navigate("/bulk-apply");
  };

  const seoSchemas = [
    buildArticleSchema({
      title: "Visa Sponsorship Jobs for Kenyans — UK, Canada, UAE, Australia",
      description: "Browse curated overseas jobs offering visa sponsorship in UK, Canada, UAE, Australia, Germany, Saudi Arabia, and the USA.",
      url: "https://workabroadhub.tech/tools/visa-sponsorship-jobs",
    }),
    buildFaqSchema(VISA_FAQS),
  ];

  const selectionCount = selectedIds.size;

  return (
    <div className="min-h-screen bg-background pb-32">
      <SeoHead
        title="Visa Sponsorship Jobs for Kenyans — UK, Canada, UAE, Australia | WorkAbroad Hub"
        description="Browse curated overseas jobs offering visa sponsorship in UK, Canada, UAE, Australia, Germany, Saudi Arabia, and the USA. All listings verified and filtered for Kenyan workers."
        keywords="visa sponsorship jobs, visa sponsorship UK, visa sponsorship Canada, visa sponsored jobs Kenya, overseas jobs with visa, work abroad visa, visa sponsored nursing jobs, Kenya overseas employment"
        canonicalPath="/tools/visa-sponsorship-jobs"
        schemas={seoSchemas}
      />

      {/* Header */}
      <div className="bg-gradient-to-r from-teal-600 to-teal-500 px-4 pt-10 pb-6 text-white">
        <Link href="/tools">
          <button className="flex items-center gap-1 text-teal-100 text-sm mb-4 hover:text-white" data-testid="link-back-tools">
            <ArrowLeft className="h-4 w-4" /> Tools
          </button>
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-white/20 rounded-xl flex items-center justify-center">
            <Briefcase className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold" data-testid="text-page-title">Visa Sponsorship Jobs</h1>
            <p className="text-teal-100 text-xs">Curated overseas jobs with visa support</p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="ml-auto text-white hover:bg-white/20"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh-jobs"
          >
            <RefreshCcw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Bulk apply hero banner */}
        <div className="mt-4 bg-white/10 border border-white/20 rounded-xl p-3 flex items-center gap-3">
          <Zap className="h-5 w-5 text-yellow-300 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold">Apply to multiple jobs in minutes</p>
            <p className="text-teal-100 text-xs">Select jobs below → AI generates cover letters for each → Fast apply</p>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 mt-4 space-y-4">
        {/* Intro / Guide */}
        <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-700 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-teal-900 dark:text-teal-200">What is visa sponsorship and why does it matter?</p>
          <p className="text-xs text-teal-800 dark:text-teal-300 leading-relaxed">
            Visa sponsorship means the employer pays for and applies for your work visa — you never pay any fees. All listings below are curated for Kenyan workers applying to the UK, Canada, UAE, Australia, Germany, Saudi Arabia, and the USA.
          </p>
          <ul className="text-xs text-teal-800 dark:text-teal-300 space-y-1 list-none">
            <li className="flex items-start gap-1.5"><BadgeCheck className="h-3.5 w-3.5 text-teal-500 shrink-0 mt-0.5" /> Filter by country and job category</li>
            <li className="flex items-start gap-1.5"><BadgeCheck className="h-3.5 w-3.5 text-teal-500 shrink-0 mt-0.5" /> All jobs offer employer-paid visa sponsorship</li>
            <li className="flex items-start gap-1.5"><BadgeCheck className="h-3.5 w-3.5 text-teal-500 shrink-0 mt-0.5" /> Use our Job Scam Checker if anything looks suspicious</li>
          </ul>
        </div>

        {/* Disclaimer */}
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-300">
          <strong>Disclaimer:</strong> Job listings are for information only. WorkAbroad Hub does not place workers or act as a recruiter. Always apply via official employer channels and verify before paying any fees.
        </div>

        {/* Upgrade prompt for free/unauthenticated users */}
        {!isPaidUser && (
          <div className="bg-gradient-to-r from-blue-600 to-teal-600 rounded-xl p-4 text-white" data-testid="banner-upgrade-jobs">
            <div className="flex items-center gap-2 mb-2">
              <Lock className="h-4 w-4 text-yellow-300" />
              <p className="text-sm font-bold">Upgrade to Apply for These Jobs</p>
            </div>
            <p className="text-xs text-white/80 mb-3">
              You can browse all {jobs?.length ?? ""} listings, but applying requires a Basic or Pro plan. Upgrade once — access all verified visa sponsorship jobs.
            </p>
            <Button
              size="sm"
              className="bg-white text-blue-700 hover:bg-white/90 font-semibold text-xs h-8"
              onClick={handleUpgradeRequired}
              data-testid="button-upgrade-jobs"
            >
              Unlock Apply Access ✨
            </Button>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2">
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger className="flex-1 text-xs h-9" data-testid="select-country">
              <Globe className="h-4 w-4 mr-1 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="flex-1 text-xs h-9" data-testid="select-category">
              <Briefcase className="h-4 w-4 mr-1 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Selection toolbar */}
        {!isLoading && jobs && jobs.length > 0 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span data-testid="text-job-count">
              {jobs.length} job{jobs.length !== 1 ? "s" : ""} found
              {country !== "All Countries" ? ` in ${country}` : ""}
              {category !== "All Categories" ? ` · ${category}` : ""}
            </span>
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                className="flex items-center gap-1 hover:text-foreground transition-colors"
                data-testid="button-select-all"
              >
                {isPaidUser
                  ? <><CheckSquare className="h-3.5 w-3.5" /> Select all</>
                  : <><Lock className="h-3.5 w-3.5" /> Select all</>
                }
              </button>
              {selectionCount > 0 && (
                <button
                  onClick={clearAll}
                  className="flex items-center gap-1 hover:text-foreground transition-colors text-blue-600 dark:text-blue-400"
                  data-testid="button-clear-selection"
                >
                  <Square className="h-3.5 w-3.5" /> Clear ({selectionCount})
                </button>
              )}
            </div>
          </div>
        )}

        {/* Jobs list */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex gap-3">
                    <Skeleton className="h-5 w-5 rounded" />
                    <Skeleton className="h-10 w-10 rounded-xl" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : jobs && jobs.length > 0 ? (
          <div className="space-y-3">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                selected={selectedIds.has(job.id)}
                onToggle={toggleJob}
                selectionMode={selectionCount > 0}
                isPaidUser={isPaidUser}
                onUpgradeRequired={handleUpgradeRequired}
                onSave={handleSaveJob}
                isSaved={savedJobIds.has(job.id)}
                isSaving={savingJobId === job.id}
                onPrepare={handlePrepare}
                isPreparing={preparingJobId === job.id}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-8 text-center">
              <Briefcase className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
              <p className="text-sm font-medium">No jobs found</p>
              <p className="text-xs text-muted-foreground mt-1">Try changing the filters above</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => { setCountry("All Countries"); setCategory("All Categories"); }}>
                Clear Filters
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Bottom CTA */}
        <Card className="bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4 text-center space-y-2">
            <p className="text-sm font-semibold">Want to maximise your chances?</p>
            <p className="text-xs text-muted-foreground">Get a 1-on-1 consultation with our career advisors who specialise in your target country.</p>
            <Link href="/services">
              <Button size="sm" className="mt-1" data-testid="button-view-services">
                View Consultation Services
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* FAQ Section */}
        <div className="space-y-3 pt-2" data-testid="faq-section-visa">
          <div className="flex items-center gap-2">
            <BadgeCheck className="h-4 w-4 text-teal-500" />
            <p className="text-sm font-semibold">Frequently Asked Questions</p>
          </div>
          {VISA_FAQS.map((faq, i) => (
            <details key={i} className="group rounded-lg border border-border bg-card" data-testid={`faq-item-visa-${i}`}>
              <summary className="flex items-center justify-between cursor-pointer p-3 text-xs font-semibold select-none marker:hidden list-none">
                {faq.q}
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-2 opacity-0 group-open:opacity-100 transition-opacity" />
              </summary>
              <div className="px-3 pb-3 text-xs text-muted-foreground leading-relaxed">{faq.a}</div>
            </details>
          ))}
        </div>

        {/* Internal links */}
        <div className="pb-2">
          <p className="text-xs text-muted-foreground font-semibold mb-2">Related tools & services</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/tools/job-scam-checker"><span className="text-xs text-blue-600 dark:text-blue-400 underline underline-offset-2">Job Scam Checker</span></Link>
            <span className="text-xs text-muted-foreground">·</span>
            <Link href="/tools/ats-cv-checker"><span className="text-xs text-blue-600 dark:text-blue-400 underline underline-offset-2">ATS CV Checker</span></Link>
            <span className="text-xs text-muted-foreground">·</span>
            <Link href="/agencies"><span className="text-xs text-blue-600 dark:text-blue-400 underline underline-offset-2">Verify NEA Agencies</span></Link>
            <span className="text-xs text-muted-foreground">·</span>
            <Link href="/services"><span className="text-xs text-blue-600 dark:text-blue-400 underline underline-offset-2">Career Consultation</span></Link>
            <span className="text-xs text-muted-foreground">·</span>
            <a href="/api/login"><span className="text-xs text-blue-600 dark:text-blue-400 underline underline-offset-2">Sign Up Free</span></a>
          </div>
        </div>
      </div>

      {/* Application Review Sheet */}
      <Sheet open={reviewOpen} onOpenChange={setReviewOpen}>
        <SheetContent side="bottom" className="h-[90vh] overflow-y-auto rounded-t-2xl" data-testid="sheet-application-review">
          <SheetHeader className="pb-2">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-purple-500" />
              Review Your Application
            </SheetTitle>
            {reviewJob && (
              <SheetDescription className="text-xs">
                {reviewJob.title} · {reviewJob.company} · {reviewJob.country}
              </SheetDescription>
            )}
          </SheetHeader>

          {application && (
            <div className="space-y-5 pt-2">
              {/* Cover Letter */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Cover Letter</p>
                <div
                  className="text-sm leading-relaxed whitespace-pre-wrap bg-muted/40 rounded-lg p-3 border border-border"
                  data-testid="text-cover-letter"
                >
                  {application.coverLetter}
                </div>
              </div>

              {/* Matching Skills */}
              {application.matchingSkills.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Matching Skills</p>
                  <div className="flex flex-wrap gap-2" data-testid="list-matching-skills">
                    {application.matchingSkills.map((skill, i) => (
                      <Badge key={i} variant="secondary" className="text-xs" data-testid={`badge-skill-${i}`}>
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Common Q&A */}
              {application.commonQA.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Common Interview Q&A</p>
                  <Accordion type="single" collapsible className="space-y-1" data-testid="accordion-qa">
                    {application.commonQA.map((qa, i) => (
                      <AccordionItem key={i} value={`qa-${i}`} className="border rounded-lg px-3" data-testid={`qa-item-${i}`}>
                        <AccordionTrigger className="text-sm font-medium py-3 hover:no-underline text-left">
                          {qa.question}
                        </AccordionTrigger>
                        <AccordionContent className="text-sm text-muted-foreground pb-3 leading-relaxed">
                          {qa.answer}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              )}

              {/* Submit */}
              <div className="pb-6 space-y-2">
                <Button
                  className="w-full gap-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold"
                  onClick={submitApplication}
                  data-testid="button-submit-application"
                >
                  <Send className="h-4 w-4" />
                  Submit Application
                </Button>
                {reviewJob?.email && (
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => {
                      if (!reviewJob?.email || !application) return;
                      const subject = encodeURIComponent(
                        `Application for ${reviewJob.title} at ${reviewJob.company}`
                      );
                      const body = encodeURIComponent(
                        [
                          application.coverLetter,
                          application.matchingSkills.length
                            ? `\n\nKey skills: ${application.matchingSkills.join(", ")}`
                            : "",
                        ].join("")
                      );
                      window.location.href = `mailto:${reviewJob.email}?subject=${subject}&body=${body}`;
                    }}
                    data-testid="button-email-application"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Email Application
                  </Button>
                )}
                <p className="text-xs text-muted-foreground text-center">Saves to your Application Tracker</p>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Floating Bulk Apply Bar */}
      {selectionCount > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border shadow-2xl px-4 py-3"
          data-testid="bulk-apply-bar"
        >
          <div className="max-w-xl mx-auto flex items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-bold text-foreground">
                {selectionCount} job{selectionCount !== 1 ? "s" : ""} selected
              </p>
              <p className="text-xs text-muted-foreground">AI will generate cover letters for each</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={clearAll}
              className="h-9"
              data-testid="button-bulk-clear"
            >
              Clear
            </Button>
            <Button
              size="sm"
              className="h-9 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
              onClick={handleBulkApply}
              data-testid="button-bulk-apply"
            >
              <Zap className="h-4 w-4" />
              Apply to {selectionCount} Job{selectionCount !== 1 ? "s" : ""}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
