import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MapPin, Briefcase, Star, Globe, Search, Building2,
  ChevronRight, Filter, DollarSign, Plane,
} from "lucide-react";
import { getAgencyRatingDisplay } from "@/lib/agency-rating";

interface AgencyJobListing {
  id: string;
  agencyId: string;
  title: string;
  country: string;
  salary: string | null;
  jobCategory: string | null;
  description: string | null;
  visaSponsorship: boolean;
  isFeatured: boolean;
  viewCount: number;
  createdAt: string;
  agency: {
    id: string;
    agencyName: string;
    licenseNumber: string;
    statusOverride: string | null;
    expiryDate: string;
  } | null;
}

const CATEGORIES = [
  "All Categories", "Healthcare", "Construction", "Hospitality", "Domestic Work",
  "Engineering", "IT & Technology", "Education", "Agriculture", "Manufacturing",
  "Transportation", "Finance", "Sales", "Security",
];

const COUNTRIES = [
  "All Countries", "Saudi Arabia", "United Arab Emirates", "Qatar", "Kuwait",
  "Bahrain", "Oman", "Malaysia", "Singapore", "Canada", "Germany", "UK",
  "Australia", "Japan", "South Korea",
];

function JobCard({ job, agencyScore }: { job: AgencyJobListing; agencyScore: number | null }) {
  const isAgencyValid =
    job.agency && new Date(job.agency.expiryDate) > new Date();

  const ratingDisplay = job.agency
    ? getAgencyRatingDisplay(job.agency.expiryDate, agencyScore)
    : null;

  return (
    <Card
      className={`hover:shadow-md transition-shadow border ${job.isFeatured ? "border-amber-300 bg-amber-50/30 dark:bg-amber-950/10" : ""}`}
      data-testid={`job-card-${job.id}`}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {job.isFeatured && (
                <Badge className="bg-amber-500 text-white text-xs">
                  <Star className="h-3 w-3 mr-1" /> Featured
                </Badge>
              )}
              {job.visaSponsorship && (
                <Badge variant="secondary" className="text-xs">
                  <Plane className="h-3 w-3 mr-1" /> Visa Sponsorship
                </Badge>
              )}
              {job.jobCategory && (
                <Badge variant="outline" className="text-xs">{job.jobCategory}</Badge>
              )}
            </div>

            <h3 className="font-semibold text-base mb-1 truncate" data-testid={`job-title-${job.id}`}>
              {job.title}
            </h3>

            {job.agency && (
              <Link href={`/agencies/${job.agencyId}`}>
                <a className="flex items-center flex-wrap gap-1.5 text-sm text-primary hover:underline mb-2">
                  <Building2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{job.agency.agencyName}</span>
                  {isAgencyValid && (
                    <Badge variant="outline" className="text-xs text-green-600 border-green-300 shrink-0">
                      Licensed
                    </Badge>
                  )}
                  {ratingDisplay?.showRating && ratingDisplay.badge && (
                    <Badge
                      className="text-xs font-semibold border shrink-0"
                      style={{
                        backgroundColor: ratingDisplay.badge.bgColor,
                        color: ratingDisplay.badge.color,
                        borderColor: ratingDisplay.badge.color + "55",
                      }}
                      data-testid={`badge-rating-${job.id}`}
                    >
                      <Star className="h-3 w-3 mr-1" />
                      {ratingDisplay.badge.level}
                    </Badge>
                  )}
                </a>
              </Link>
            )}

            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> {job.country}
              </span>
              {job.salary && (
                <span className="flex items-center gap-1">
                  <DollarSign className="h-3.5 w-3.5" /> {job.salary}
                </span>
              )}
            </div>

            {job.description && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{job.description}</p>
            )}
          </div>

          <Link href={`/agencies/${job.agencyId}`}>
            <Button size="sm" variant="outline" className="shrink-0" data-testid={`btn-view-agency-${job.id}`}>
              View <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AgenciesMarketplace() {
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("All Countries");
  const [category, setCategory] = useState("All Categories");

  const { data: jobs = [], isLoading } = useQuery<AgencyJobListing[]>({
    queryKey: ["/api/agencies", country, category],
    queryFn: () => {
      const params = new URLSearchParams();
      if (country !== "All Countries") params.set("country", country);
      if (category !== "All Categories") params.set("category", category);
      return fetch(`/api/agencies?${params}`).then(r => r.json());
    },
  });

  const { data: bulkScoresData } = useQuery<{ scores: Record<string, { overallScore: number; tier: string }> }>({
    queryKey: ["/api/agency-scores/bulk"],
  });
  const bulkScores = bulkScoresData?.scores ?? {};

  const filtered = jobs.filter(j =>
    !search ||
    j.title.toLowerCase().includes(search.toLowerCase()) ||
    (j.agency?.agencyName ?? "").toLowerCase().includes(search.toLowerCase()) ||
    j.country.toLowerCase().includes(search.toLowerCase())
  );

  const featuredJobs = filtered.filter(j => j.isFeatured);
  const regularJobs = filtered.filter(j => !j.isFeatured);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="bg-primary text-primary-foreground py-12 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-3xl font-bold mb-2">Agency Job Marketplace</h1>
          <p className="text-primary-foreground/80 mb-6">
            Browse jobs from NEA-licensed recruitment agencies. All listings are from verified agencies.
          </p>
          <div className="relative max-w-xl mx-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 bg-white text-foreground"
              placeholder="Search jobs, agencies, or countries..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-job-search"
            />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filter:</span>
          </div>
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger className="w-44" data-testid="select-country">
              <Globe className="h-3.5 w-3.5 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-44" data-testid="select-category">
              <Briefcase className="h-3.5 w-3.5 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(country !== "All Countries" || category !== "All Categories" || search) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setCountry("All Countries"); setCategory("All Categories"); setSearch(""); }}
              data-testid="btn-clear-filters"
            >
              Clear filters
            </Button>
          )}
        </div>

        {/* Count */}
        <p className="text-sm text-muted-foreground mb-4" data-testid="text-job-count">
          {isLoading ? "Loading..." : `${filtered.length} job${filtered.length !== 1 ? "s" : ""} available`}
        </p>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Briefcase className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No jobs found</p>
            <p className="text-sm mt-1">Try adjusting your search or filters</p>
            <Link href="/agency-portal">
              <Button variant="outline" className="mt-4" data-testid="btn-post-job">
                Are you an agency? Post your jobs
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {featuredJobs.length > 0 && (
              <div>
                <h2 className="font-semibold text-sm text-amber-600 uppercase tracking-wider mb-3">
                  Featured Listings
                </h2>
                <div className="space-y-3">
                  {featuredJobs.map(job => (
                    <JobCard
                      key={job.id}
                      job={job}
                      agencyScore={job.agencyId ? (bulkScores[job.agencyId]?.overallScore ?? null) : null}
                    />
                  ))}
                </div>
              </div>
            )}

            {regularJobs.length > 0 && (
              <div>
                {featuredJobs.length > 0 && (
                  <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3">
                    All Jobs
                  </h2>
                )}
                <div className="space-y-3">
                  {regularJobs.map(job => (
                    <JobCard
                      key={job.id}
                      job={job}
                      agencyScore={job.agencyId ? (bulkScores[job.agencyId]?.overallScore ?? null) : null}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* CTA for agencies */}
        <div className="mt-12 p-6 border rounded-xl bg-muted/50 text-center">
          <Building2 className="h-8 w-8 mx-auto mb-2 text-primary" />
          <h3 className="font-semibold mb-1">Are you a licensed recruitment agency?</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Claim your agency profile and post job openings for free. Reach thousands of job seekers.
          </p>
          <Link href="/agency-portal">
            <Button data-testid="btn-agency-portal">Go to Agency Portal</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
