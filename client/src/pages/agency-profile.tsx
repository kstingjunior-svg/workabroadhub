import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2, MapPin, Globe, Mail, Phone, Shield, Star, Plane,
  DollarSign, ArrowLeft, Briefcase, ExternalLink, Calendar, Eye, Flag, AlertTriangle,
} from "lucide-react";
import { ReportAgencyModal } from "@/components/report-agency-modal";
import { useAgencyWarningCount } from "@/lib/firebase-agency-reports";
import { apiRequest } from "@/lib/queryClient";
import { useJobRedirect } from "@/hooks/use-job-redirect";
import { getAgencyRatingDisplay } from "@/lib/agency-rating";

interface AgencyProfileData {
  agency: {
    id: string;
    agencyName: string;
    licenseNumber: string;
    email: string | null;
    phoneNumber: string | null;
    website: string | null;
    address: string | null;
    country: string | null;
    issueDate: string;
    expiryDate: string;
    statusOverride: string | null;
  };
  profile: {
    id: string;
    specializations: string[] | null;
    destinationCountries: string[] | null;
    description: string | null;
    logoUrl: string | null;
    yearsInBusiness: number | null;
    totalPlacements: number | null;
  } | null;
  jobs: {
    id: string;
    title: string;
    country: string;
    salary: string | null;
    jobCategory: string | null;
    description: string | null;
    requirements: string | null;
    visaSponsorship: boolean;
    isFeatured: boolean;
    hasApplyLink: boolean;
    applyEmail: string | null;
    applicationDeadline: string | null;
    viewCount: number;
    createdAt: string;
  }[];
}

export default function AgencyProfile() {
  const [, params] = useRoute("/agencies/:agencyId");
  const agencyId = params?.agencyId;
  const { openJob } = useJobRedirect();

  const { data, isLoading, isError } = useQuery<AgencyProfileData>({
    queryKey: [`/api/agencies/${agencyId}/profile`],
    enabled: !!agencyId,
  });

  const isLicenseValid = data?.agency
    ? new Date(data.agency.expiryDate) > new Date()
    : false;

  const { data: scoreData } = useQuery<{ agencyId: string; overallScore: number | null; tier: string | null }>({
    queryKey: [`/api/agency-score/${agencyId}`],
    enabled: !!agencyId,
  });

  const ratingDisplay = data?.agency
    ? getAgencyRatingDisplay(data.agency.expiryDate, scoreData?.overallScore ?? null)
    : null;

  const [reportModalOpen, setReportModalOpen] = useState(false);
  const warningCount = useAgencyWarningCount(data?.agency?.licenseNumber);

  const recordView = async (jobId: string) => {
    await apiRequest("POST", `/api/agency-jobs/${jobId}/view`).catch(() => {});
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-muted-foreground">
        <Building2 className="h-12 w-12 mx-auto mb-3 opacity-40" />
        <p className="font-medium">Agency not found</p>
        <Link href="/agencies">
          <Button variant="outline" className="mt-4">Back to Marketplace</Button>
        </Link>
      </div>
    );
  }

  const { agency, profile, jobs } = data;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Back */}
        <Link href="/agencies">
          <a className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
            <ArrowLeft className="h-4 w-4" /> Back to Marketplace
          </a>
        </Link>

        {/* Header Card */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              {profile?.logoUrl ? (
                <img
                  src={profile.logoUrl}
                  alt={agency.agencyName}
                  className="h-20 w-20 rounded-xl object-cover border"
                />
              ) : (
                <div className="h-20 w-20 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="h-10 w-10 text-primary" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h1 className="text-xl font-bold" data-testid="text-agency-name">
                    {agency.agencyName}
                  </h1>
                  {isLicenseValid ? (
                    <Badge className="bg-green-500 text-white text-xs">
                      <Shield className="h-3 w-3 mr-1" /> NEA Licensed
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-xs">License Expired</Badge>
                  )}
                  {ratingDisplay?.showRating && ratingDisplay.badge && (
                    <Badge
                      className="text-xs font-semibold border"
                      style={{
                        backgroundColor: ratingDisplay.badge.bgColor,
                        color: ratingDisplay.badge.color,
                        borderColor: ratingDisplay.badge.color + "55",
                      }}
                      data-testid="badge-agency-rating"
                    >
                      <Star className="h-3 w-3 mr-1" />
                      {ratingDisplay.badge.level} · {ratingDisplay.badge.score}
                    </Badge>
                  )}
                  {ratingDisplay?.warningLevel === "medium" && ratingDisplay.message && (
                    <Badge className="bg-amber-50 text-amber-700 border border-amber-300 text-xs gap-1" data-testid="badge-expiry-warning">
                      <AlertTriangle className="h-3 w-3" />
                      {ratingDisplay.message}
                    </Badge>
                  )}
                  {warningCount >= 3 && (
                    <Badge className="bg-amber-100 text-amber-700 border border-amber-300 text-xs gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {warningCount} Community Report{warningCount > 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>

                <p className="text-sm text-muted-foreground mb-3">
                  License: <span className="font-mono text-xs">{agency.licenseNumber}</span>
                  {" · "}
                  Expires: {new Date(agency.expiryDate).toLocaleDateString()}
                </p>

                <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                  {agency.email && (
                    <a href={`mailto:${agency.email}`} className="flex items-center gap-1 hover:text-primary">
                      <Mail className="h-3.5 w-3.5" /> {agency.email}
                    </a>
                  )}
                  {agency.website && (
                    <a
                      href={agency.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-primary"
                    >
                      <Globe className="h-3.5 w-3.5" /> Website
                    </a>
                  )}
                  {agency.phoneNumber && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" /> {agency.phoneNumber}
                    </span>
                  )}
                  {agency.address && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" /> {agency.address}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {profile?.description && (
              <p className="text-sm text-muted-foreground mt-4 leading-relaxed" data-testid="text-agency-description">
                {profile.description}
              </p>
            )}

            {/* Stats */}
            {(profile?.yearsInBusiness || profile?.totalPlacements) && (
              <div className="flex gap-6 mt-4 pt-4 border-t">
                {profile.yearsInBusiness && (
                  <div>
                    <p className="text-2xl font-bold text-primary">{profile.yearsInBusiness}+</p>
                    <p className="text-xs text-muted-foreground">Years in Business</p>
                  </div>
                )}
                {profile.totalPlacements && (
                  <div>
                    <p className="text-2xl font-bold text-primary">{profile.totalPlacements.toLocaleString()}+</p>
                    <p className="text-xs text-muted-foreground">Successful Placements</p>
                  </div>
                )}
                <div>
                  <p className="text-2xl font-bold text-primary">{jobs.length}</p>
                  <p className="text-xs text-muted-foreground">Active Jobs</p>
                </div>
              </div>
            )}

            {/* Specializations + Destinations */}
            {profile?.specializations && profile.specializations.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground font-medium mb-1.5">Specializations</p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.specializations.map(s => (
                    <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                  ))}
                </div>
              </div>
            )}

            {profile?.destinationCountries && profile.destinationCountries.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-muted-foreground font-medium mb-1.5">Destination Countries</p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.destinationCountries.map(c => (
                    <Badge key={c} variant="outline" className="text-xs">
                      <Globe className="h-3 w-3 mr-1" />{c}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Jobs */}
        <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-primary" />
          Job Listings
          <Badge variant="secondary">{jobs.length}</Badge>
        </h2>

        {jobs.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground border rounded-xl">
            <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>No active job listings yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map(job => (
              <Card
                key={job.id}
                className={`hover:shadow-md transition-shadow ${job.isFeatured ? "border-amber-300 bg-amber-50/30 dark:bg-amber-950/10" : ""}`}
                data-testid={`job-card-${job.id}`}
              >
                <CardContent className="p-5">
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

                  <h3 className="font-semibold text-base mb-1" data-testid={`job-title-${job.id}`}>
                    {job.title}
                  </h3>

                  <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mb-3">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" /> {job.country}
                    </span>
                    {job.salary && (
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-3.5 w-3.5" /> {job.salary}
                      </span>
                    )}
                    {job.applicationDeadline && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        Deadline: {new Date(job.applicationDeadline).toLocaleDateString()}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5" /> {job.viewCount} views
                    </span>
                  </div>

                  {job.description && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-3">{job.description}</p>
                  )}

                  {job.requirements && (
                    <details className="text-sm mb-3">
                      <summary className="cursor-pointer font-medium text-xs text-muted-foreground uppercase tracking-wide">
                        Requirements
                      </summary>
                      <p className="mt-1.5 text-muted-foreground whitespace-pre-line">{job.requirements}</p>
                    </details>
                  )}

                  <div className="flex gap-2 mt-2">
                    {job.hasApplyLink && (
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={() => { recordView(job.id); openJob(job.id, "agency"); }}
                        data-testid={`btn-apply-link-${job.id}`}
                      >
                        Apply Now <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {job.applyEmail && (
                      <a
                        href={`mailto:${job.applyEmail}?subject=Application for ${encodeURIComponent(job.title)}`}
                        onClick={() => recordView(job.id)}
                        data-testid={`btn-apply-email-${job.id}`}
                      >
                        <Button size="sm" variant="outline" className="gap-1.5">
                          <Mail className="h-3.5 w-3.5" /> Email Application
                        </Button>
                      </a>
                    )}
                    {!job.hasApplyLink && !job.applyEmail && (
                      <p className="text-sm text-muted-foreground italic">
                        Contact agency directly to apply
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Verify Agency */}
        <div className="mt-8 p-4 bg-muted/50 rounded-xl text-sm text-muted-foreground">
          <p className="font-medium mb-1 flex items-center gap-1.5">
            <Shield className="h-4 w-4 text-green-500" /> Verify this agency
          </p>
          <p>
            You can independently verify{" "}
            <strong>{agency.agencyName}</strong> using license number{" "}
            <span className="font-mono text-xs bg-background px-1 py-0.5 rounded">{agency.licenseNumber}</span>{" "}
            on the{" "}
            <Link href="/nea-agencies">
              <a className="text-primary underline">NEA Agency Registry</a>
            </Link>
            {" "}or at{" "}
            <a
              href="https://www.nea.go.ke"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              nea.go.ke
            </a>
            .
          </p>
        </div>

        {/* Report Agency */}
        <div className="mt-4 flex items-center justify-between p-4 rounded-xl border border-dashed border-red-200 dark:border-red-900/40 bg-red-50/40 dark:bg-red-950/10">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Flag className="h-4 w-4 text-red-400 flex-shrink-0" />
            <span>Encountered suspicious activity with this agency?</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30 shrink-0 ml-3 gap-1.5"
            onClick={() => setReportModalOpen(true)}
            data-testid="button-report-agency"
          >
            <Flag className="h-3.5 w-3.5" />
            Report Agency
          </Button>
        </div>

        <ReportAgencyModal
          open={reportModalOpen}
          onClose={() => setReportModalOpen(false)}
          licenseNumber={agency.licenseNumber}
          agencyName={agency.agencyName}
        />
      </div>
    </div>
  );
}
