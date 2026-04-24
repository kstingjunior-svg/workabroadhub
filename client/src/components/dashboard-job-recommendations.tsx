/**
 * AI Job Recommendations widget for the user dashboard.
 * Shows a CV paste form, then displays top 5 AI-matched jobs.
 * Results are cached in sessionStorage to survive page reloads.
 */
import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { fetchCsrfToken } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useJobRedirect } from "@/hooks/use-job-redirect";
import {
  Sparkles, MapPin, Building2, DollarSign, ExternalLink,
  ChevronDown, ChevronUp, RotateCcw, Loader2, Briefcase,
  CheckCircle, TrendingUp,
} from "lucide-react";

interface JobMatch {
  id: string;
  title: string;
  company: string;
  country: string;
  salary: string | null;
  jobCategory: string | null;
  visaSponsorship: boolean;
  matchScore: number;
  matchReason: string;
}

const CACHE_KEY = "dash_job_matches";

function scoreColor(score: number) {
  if (score >= 75) return { bar: "bg-green-500", text: "text-green-600 dark:text-green-400", label: "Strong Match" };
  if (score >= 50) return { bar: "bg-blue-500",  text: "text-blue-600 dark:text-blue-400",  label: "Good Match" };
  if (score >= 30) return { bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", label: "Partial Match" };
  return           { bar: "bg-gray-400",          text: "text-gray-500",                      label: "Low Match" };
}

function JobCard({ job }: { job: JobMatch }) {
  const cfg = scoreColor(job.matchScore);
  const [expanded, setExpanded] = useState(false);
  const { openJob } = useJobRedirect();

  return (
    <div
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
      data-testid={`card-job-match-${job.id}`}
    >
      {/* Match score bar */}
      <div className="h-1.5 bg-gray-100 dark:bg-gray-700">
        <div
          className={`h-full ${cfg.bar} transition-all duration-700`}
          style={{ width: `${job.matchScore}%` }}
        />
      </div>

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
            <Briefcase className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight line-clamp-2">
              {job.title}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <Building2 className="h-3 w-3" /> {job.company}
              </span>
              <span className="text-gray-300 dark:text-gray-600 text-xs">·</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {job.country}
              </span>
            </div>
          </div>
          {/* Score badge */}
          <div className="flex flex-col items-end flex-shrink-0">
            <span className={`text-lg font-bold ${cfg.text}`}>{job.matchScore}%</span>
            <span className={`text-[10px] font-medium ${cfg.text}`}>{cfg.label}</span>
          </div>
        </div>

        {/* Tags row */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {job.salary && (
            <Badge variant="secondary" className="text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-100 dark:border-green-800">
              <DollarSign className="h-2.5 w-2.5 mr-0.5" /> {job.salary}
            </Badge>
          )}
          {job.jobCategory && (
            <Badge variant="secondary" className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-100 dark:border-blue-800">
              {job.jobCategory}
            </Badge>
          )}
          {job.visaSponsorship && (
            <Badge variant="secondary" className="text-xs bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 border-teal-100 dark:border-teal-800">
              <CheckCircle className="h-2.5 w-2.5 mr-0.5" /> Visa Sponsorship
            </Badge>
          )}
        </div>

        {/* AI reason — collapsible */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-2.5 flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors w-full text-left"
          data-testid={`btn-expand-reason-${job.id}`}
        >
          <Sparkles className="h-3 w-3 text-amber-400 flex-shrink-0" />
          {expanded ? "Hide" : "Why this match?"}
          {expanded ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
        </button>
        {expanded && (
          <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2 leading-relaxed">
            {job.matchReason}
          </p>
        )}

        {/* Apply button — URL resolved server-side via /api/go/job */}
        <Button
          size="sm"
          className="w-full mt-3 h-8 bg-blue-600 hover:bg-blue-700 text-white text-xs"
          onClick={() => openJob(job.id, "visa")}
          data-testid={`btn-apply-${job.id}`}
        >
          <ExternalLink className="h-3 w-3 mr-1.5" /> Apply Now
        </Button>
      </div>
    </div>
  );
}

interface BrowseJob {
  id: number | string;
  title: string;
  category?: string;
  country?: string;
  company?: string;
  url?: string;
  salary?: string;
}

function BrowseRecommendations() {
  const [browseJobs, setBrowseJobs] = useState<BrowseJob[]>([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    fetch("/api/recommended-jobs", { credentials: "include" })
      .then(res => res.json())
      .then(data => setBrowseJobs(Array.isArray(data) ? data.slice(0, 5) : []))
      .catch(() => setBrowseJobs([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="space-y-1.5 mb-4">
      {[1, 2].map(i => (
        <div key={i} className="h-12 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
      ))}
    </div>
  );

  if (!browseJobs.length) return null;

  return (
    <div className="mb-4">
      <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
        Based on your browsing
      </p>
      <div className="space-y-1.5">
        {browseJobs.map(job => (
          <div
            key={job.id}
            data-testid={`card-browse-job-${job.id}`}
            className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200" data-testid={`text-browse-title-${job.id}`}>
                {job.title}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                {[job.company, job.country].filter(Boolean).join(" · ")}
              </p>
            </div>
            {job.url && (
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                data-testid={`link-browse-apply-${job.id}`}
                className="shrink-0 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
              >
                Apply <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardJobRecommendations() {
  const { toast } = useToast();
  const [cvText, setCvText] = useState("");
  const [jobs, setJobs] = useState<JobMatch[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Restore cached results on mount
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as JobMatch[];
        if (parsed.length > 0) setJobs(parsed);
      }
    } catch {}
  }, []);

  const matchMutation = useMutation({
    mutationFn: async () => {
      const csrfToken = await fetchCsrfToken();
      const res = await fetch("/api/jobs/match", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        credentials: "include",
        body: JSON.stringify({ cvText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Matching failed.");
      return data as { jobs: JobMatch[]; totalJobs: number };
    },
    onSuccess: (data) => {
      setJobs(data.jobs);
      setCvText("");
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(data.jobs));
      } catch {}
      if (data.jobs.length === 0) {
        toast({
          title: "No matches found",
          description: "We couldn't find matching jobs right now. Try updating your CV or check back as we add new listings.",
        });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Matching failed", description: err.message, variant: "destructive" });
    },
  });

  const handleReset = () => {
    setJobs([]);
    setCvText("");
    try { sessionStorage.removeItem(CACHE_KEY); } catch {}
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  const hasResults = jobs.length > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Recommended Jobs
          </h3>
          <Badge className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-0 px-1.5 py-0">
            <Sparkles className="h-2.5 w-2.5 mr-0.5" /> AI
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {hasResults && (
            <button
              onClick={handleReset}
              className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1 transition-colors"
              data-testid="btn-reset-job-match"
            >
              <RotateCcw className="h-3 w-3" /> Re-match
            </button>
          )}
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            data-testid="btn-toggle-job-recommendations"
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Behaviour-based quick picks */}
          <BrowseRecommendations />

          {/* CV input form — shown when no results yet */}
          {!hasResults && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-teal-500 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white text-sm">
                    Find your best-fit overseas jobs
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Paste your CV and AI will score and rank the best matches from our live job database.
                  </p>
                </div>
              </div>

              <Textarea
                ref={textareaRef}
                value={cvText}
                onChange={(e) => setCvText(e.target.value)}
                placeholder="Paste your CV text here — include your job title, skills, experience, and education…"
                className="min-h-[120px] text-sm resize-none mb-3"
                data-testid="input-cv-match"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {cvText.length} characters · min 50
                </span>
                <Button
                  onClick={() => matchMutation.mutate()}
                  disabled={matchMutation.isPending || cvText.trim().length < 50}
                  className="bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 text-white text-sm h-9 px-4"
                  data-testid="btn-find-jobs"
                >
                  {matchMutation.isPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Matching…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Find Matches
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Results */}
          {hasResults && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Top {jobs.length} jobs matched to your CV — sorted by AI compatibility score.
              </p>
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
