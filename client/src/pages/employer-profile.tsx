// /employers/:slug — public Employer Reputation Layer profile page.
import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { usePageSeo } from "@/hooks/use-page-seo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RateEmployerModal } from "@/components/rate-employer-modal";
import {
  Star, MapPin, Building2, ChevronLeft, Users, CheckCircle2,
} from "lucide-react";
import {
  useEmployerRatingSummary, useEmployerReviews, getEmployer,
  type EmployerDirectoryEntry,
} from "@/lib/firebase-employer-ratings";

function StarRow({ average, size = "h-5 w-5" }: { average: number; size?: string }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star
          key={n}
          className={`${size} ${
            n <= Math.round(average)
              ? "text-amber-400 fill-amber-400"
              : "text-gray-200 dark:text-gray-700 fill-gray-200 dark:fill-gray-700"
          }`}
        />
      ))}
    </div>
  );
}

function BreakdownBar({ label, value, max = 5 }: { label: string; value: number | null; max?: number }) {
  const pct = value == null ? 0 : (value / max) * 100;
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value == null ? "N/A" : value.toFixed(1)}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function timeAgo(ts: number): string {
  const days = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
  if (days < 1) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months !== 1 ? "s" : ""} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years !== 1 ? "s" : ""} ago`;
}

export default function EmployerProfilePage() {
  const params = useParams<{ employerId: string }>();
  const slug = params.employerId;

  const [entry, setEntry] = useState<EmployerDirectoryEntry | null>(null);
  const [loadingEntry, setLoadingEntry] = useState(true);
  const summary = useEmployerRatingSummary(slug);
  const reviews = useEmployerReviews(slug);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingEntry(true);
    getEmployer(slug).then(e => { if (!cancelled) { setEntry(e); setLoadingEntry(false); } });
    return () => { cancelled = true; };
  }, [slug]);

  usePageSeo({
    title: entry ? `${entry.name} Reviews — Employer Reputation | WorkAbroad Hub` : "Employer Reviews | WorkAbroad Hub",
    description: entry
      ? `Worker reviews of ${entry.name} in ${entry.country}: pay-on-time, housing, and treatment ratings from current and former employees.`
      : "Worker-written reviews of overseas employers.",
    path: `/employers/${slug}`,
    keywords: entry ? [`${entry.name} reviews`, `is ${entry.name} legit`, `${entry.name} employer reviews`] : [],
  });

  if (loadingEntry) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  if (!entry) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center px-4">
        <Building2 className="h-10 w-10 text-muted-foreground opacity-40" />
        <p className="font-medium">Employer not found</p>
        <Link href="/employers"><Button variant="outline">Back to directory</Button></Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link href="/employers">
          <a className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4" data-testid="link-back-directory">
            <ChevronLeft className="h-4 w-4" /> All employers
          </a>
        </Link>

        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold" data-testid="text-employer-name">{entry.name}</h1>
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-1.5">
                  <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {entry.country}</span>
                  {entry.sector && <Badge variant="outline">{entry.sector}</Badge>}
                </div>
                <div className="flex items-center gap-2 mt-3">
                  {summary.count > 0 ? (
                    <>
                      <StarRow average={summary.average} />
                      <span className="text-xl font-bold">{summary.average.toFixed(1)}</span>
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" /> {summary.count} review{summary.count !== 1 ? "s" : ""}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">No reviews yet</span>
                  )}
                </div>
              </div>
              <Button onClick={() => setModalOpen(true)} data-testid="btn-rate-this-employer">
                {summary.count > 0 ? "Write a review" : "Be the first to review"}
              </Button>
            </div>

            {summary.count > 0 && (
              <div className="grid sm:grid-cols-3 gap-4 mt-6 pt-6 border-t">
                <BreakdownBar label="Paid on time" value={summary.avgPayOnTime} />
                <BreakdownBar label="Housing as promised" value={summary.avgHousing} />
                <BreakdownBar label="Treated with respect" value={summary.avgTreatment} />
              </div>
            )}
          </CardContent>
        </Card>

        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3">
          {reviews.length > 0 ? `${reviews.length} Review${reviews.length !== 1 ? "s" : ""}` : "Reviews"}
        </h2>

        {reviews.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <Star className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No one has reviewed {entry.name} yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {reviews.map((r, i) => (
              <Card key={i} data-testid={`review-card-${i}`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <StarRow average={r.ratingOverall} size="h-4 w-4" />
                      <span className="text-sm font-medium">{r.ratingOverall.toFixed(1)}</span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{timeAgo(r.timestamp)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-2">
                    <Badge variant="secondary" className="text-xs">
                      {r.employmentStatus === "current" ? "Currently working there" : "Formerly worked there"}
                    </Badge>
                    {r.jobTitle && <Badge variant="outline" className="text-xs">{r.jobTitle}</Badge>}
                    {r.verifiedUser && (
                      <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300 gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Verified account
                      </Badge>
                    )}
                  </div>
                  {r.comment && <p className="text-sm text-foreground/90">{r.comment}</p>}
                  <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
                    <span>Pay on time: {r.ratingPayOnTime}/5</span>
                    <span>Housing: {r.ratingHousing != null ? `${r.ratingHousing}/5` : "N/A"}</span>
                    <span>Treatment: {r.ratingTreatment}/5</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <RateEmployerModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        slug={slug}
        employerName={entry.name}
        country={entry.country}
      />
    </div>
  );
}
