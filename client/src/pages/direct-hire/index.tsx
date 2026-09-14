// /direct-hire/jobs — public browse for the Direct Hire Exchange
// (Phase 3 of the "Success-Fee Marketplace" concept). Verified overseas
// employers list real roles for free; no fee is ever collected from
// workers to see or apply to a listing.
import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { usePageSeo } from "@/hooks/use-page-seo";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck, MapPin, Briefcase, Search, Building2, ArrowRight } from "lucide-react";

interface JobListing {
  id: string;
  title: string;
  country: string;
  city: string | null;
  category: string | null;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  employerName: string;
  employerVerified: boolean;
}

export default function DirectHireJobsIndex() {
  usePageSeo({
    title: "Direct Hire Jobs — Verified Overseas Employers | WorkAbroad Hub",
    description: "Browse real overseas job listings from verified employers. Free to browse and apply — built on WorkAbroad Hub's employer reputation and worker verification systems.",
  });
  const [country, setCountry] = useState("");

  const { data: jobs, isLoading } = useQuery<JobListing[]>({
    queryKey: ["/api/direct-hire/jobs", country],
    queryFn: async () => {
      const url = country ? `/api/direct-hire/jobs?country=${encodeURIComponent(country)}` : "/api/direct-hire/jobs";
      const res = await fetch(url);
      return res.json();
    },
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-direct-hire-jobs">
          <Briefcase className="h-6 w-6 text-primary" /> Direct Hire Jobs
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Real overseas roles from verified employers. Free to browse and apply — no agent fee.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Filter by country (e.g. UAE, Qatar)"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="pl-9"
          data-testid="input-filter-country"
        />
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
      )}

      {!isLoading && (!jobs || jobs.length === 0) && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No open listings right now{country ? ` in "${country}"` : ""}. Check back soon.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {jobs?.map((job) => (
          <Link key={job.id} href={`/direct-hire/jobs/${job.id}`}>
            <Card className="cursor-pointer hover:shadow-md transition-shadow" data-testid={`card-job-${job.id}`}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{job.title}</h3>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                      <Building2 className="h-3.5 w-3.5" /> {job.employerName}
                      {job.employerVerified && (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 hover:bg-green-100 gap-1 text-[10px] px-1.5 py-0">
                          <ShieldCheck className="h-2.5 w-2.5" /> Verified
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5">
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {[job.city, job.country].filter(Boolean).join(", ")}</span>
                      {job.employmentType && <span className="capitalize">{job.employmentType.replace(/_/g, " ")}</span>}
                      {(job.salaryMin || job.salaryMax) && (
                        <span>{job.salaryCurrency} {job.salaryMin ?? "?"}{job.salaryMax ? `–${job.salaryMax}` : ""}</span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="bg-muted/40">
        <CardContent className="py-5 flex flex-col sm:flex-row items-center gap-3 justify-between">
          <p className="text-sm">Hiring for overseas roles? List a job for free.</p>
          <Link href="/direct-hire/employer/register">
            <Button size="sm" data-testid="button-become-employer">Register as an employer</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
