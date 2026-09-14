// /direct-hire/jobs/:id — public listing detail + apply.
import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { usePageSeo } from "@/hooks/use-page-seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck, MapPin, Briefcase, Globe, ChevronLeft, Star, CheckCircle2 } from "lucide-react";
import { useEmployerRatingSummary } from "@/lib/firebase-employer-ratings";

interface JobDetail {
  id: string;
  title: string;
  country: string;
  city: string | null;
  category: string | null;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  vacancies: number | null;
  requirements: string | null;
  responsibilities: string | null;
  employer: {
    id: string;
    companyName: string;
    country: string;
    sector: string | null;
    website: string | null;
    description: string | null;
    verified: boolean;
    ratingSlug: string | null;
  } | null;
}

export default function DirectHireJobDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [coverNote, setCoverNote] = useState("");

  const { data: job, isLoading } = useQuery<JobDetail>({
    queryKey: [`/api/direct-hire/jobs/${id}`],
    queryFn: async () => {
      const res = await fetch(`/api/direct-hire/jobs/${id}`);
      if (!res.ok) throw new Error("not_found");
      return res.json();
    },
  });

  const rating = useEmployerRatingSummary(job?.employer?.ratingSlug ?? null);

  const applyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/direct-hire/jobs/${id}/apply`, { coverNote });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Application submitted", description: "You'll see status updates on My Applications." });
      queryClient.invalidateQueries({ queryKey: ["/api/direct-hire/my-applications"] });
    },
    onError: () => {
      toast({ title: "Couldn't submit application", description: "Please try again.", variant: "destructive" });
    },
  });

  usePageSeo({
    title: job ? `${job.title} — Direct Hire Jobs | WorkAbroad Hub` : "Direct Hire Jobs",
    description: job ? `${job.title} in ${job.country} with ${job.employer?.companyName ?? "a verified employer"} — apply free via WorkAbroad Hub.` : "Overseas job listing.",
  });

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <h2 className="text-xl font-bold">Job not found</h2>
        <p className="text-muted-foreground text-sm">This listing may have closed or been removed.</p>
        <Link href="/direct-hire/jobs"><Button variant="outline">Back to listings</Button></Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <Link href="/direct-hire/jobs">
        <Button variant="ghost" size="sm" className="gap-1 -ml-2" data-testid="button-back-jobs">
          <ChevronLeft className="h-4 w-4" /> All listings
        </Button>
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl" data-testid="heading-job-title">{job.title}</CardTitle>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground pt-1">
            <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {[job.city, job.country].filter(Boolean).join(", ")}</span>
            {job.employmentType && <span className="capitalize">{job.employmentType.replace(/_/g, " ")}</span>}
            {job.vacancies && job.vacancies > 1 && <span>{job.vacancies} vacancies</span>}
          </div>
          {(job.salaryMin || job.salaryMax) && (
            <p className="text-sm font-medium pt-1">
              {job.salaryCurrency} {job.salaryMin ?? "?"}{job.salaryMax ? `–${job.salaryMax}` : ""} / month
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {job.requirements && (
            <div>
              <h4 className="font-semibold mb-1">Requirements</h4>
              <p className="text-muted-foreground whitespace-pre-wrap">{job.requirements}</p>
            </div>
          )}
          {job.responsibilities && (
            <div>
              <h4 className="font-semibold mb-1">Responsibilities</h4>
              <p className="text-muted-foreground whitespace-pre-wrap">{job.responsibilities}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {job.employer && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 justify-between">
              <span>{job.employer.companyName}</span>
              {job.employer.verified ? (
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 hover:bg-green-100 gap-1">
                  <ShieldCheck className="h-3 w-3" /> Verified employer
                </Badge>
              ) : (
                <Badge variant="secondary">Verification pending</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            {job.employer.description && <p className="text-muted-foreground">{job.employer.description}</p>}
            {job.employer.website && (
              <a href={job.employer.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-primary hover:underline">
                <Globe className="h-3.5 w-3.5" /> {job.employer.website}
              </a>
            )}
            {rating.count > 0 ? (
              <div className="flex items-center gap-1.5 pt-1">
                <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                <span className="font-medium">{rating.average.toFixed(1)}</span>
                <span className="text-muted-foreground">({rating.count} worker review{rating.count === 1 ? "" : "s"})</span>
              </div>
            ) : (
              <p className="text-muted-foreground text-xs pt-1">No worker reviews yet for this employer.</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Apply</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {applyMutation.isSuccess ? (
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-sm">
              <CheckCircle2 className="h-4 w-4" /> Application submitted — free, no fee charged.
            </div>
          ) : !user ? (
            <p className="text-sm text-muted-foreground">Sign in to apply to this job — it's free.</p>
          ) : (
            <>
              <Textarea
                placeholder="Optional: a short note about why you're a good fit (mention your IELTS score, relevant experience, etc.)"
                value={coverNote}
                onChange={(e) => setCoverNote(e.target.value)}
                rows={4}
                data-testid="textarea-cover-note"
              />
              <Button
                onClick={() => applyMutation.mutate()}
                disabled={applyMutation.isPending}
                className="gap-2"
                data-testid="button-apply"
              >
                <Briefcase className="h-4 w-4" /> {applyMutation.isPending ? "Submitting…" : "Apply — it's free"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
