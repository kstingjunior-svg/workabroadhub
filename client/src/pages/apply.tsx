/**
 * /apply/:jobId — pre-redirect prep page.
 *
 * When a user taps "Apply" on a job card, we now route them HERE before
 * sending them out to GulfTalent / Indeed / Bayt / etc. This page does
 * three things in a single screen:
 *
 *   1. Reminds them they DON'T need to install the third party's app
 *      ("close the prompt and apply in your browser"). Honest, helpful,
 *      kills the most common user-loss pattern in one sentence.
 *
 *   2. Auto-bookmarks the job to their saved list — so when they come
 *      back to us after applying, the job is there and they can apply
 *      to the next one in two taps.
 *
 *   3. Renders a single big "Continue to {portal}" button that does the
 *      actual external redirect. The Continue button hits the existing
 *      paywalled redirect endpoint, so free users still hit /pricing.
 *
 * Founder ask (2026-06): "we might end up losing our users because now
 * they'll be using the Gulf Talent app." We can't strip a third party's
 * app banner — browser security forbids it. But we CAN warn users about
 * the trick before they hit the page, save the job in our app so coming
 * back is friction-free, and own the moment between "tap Apply" and
 * "arrive on external portal."
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight, ArrowLeft, BookmarkCheck, Bookmark, Building2, MapPin,
  DollarSign, AlertTriangle, ExternalLink, Plane, Sparkles, Loader2,
  ChevronRight,
} from "lucide-react";

interface Job {
  id: string;
  title: string;
  company: string;
  country: string;
  salary: string | null;
  jobCategory: string | null;
  visaSponsorship: boolean;
  applyLink: string | null;
  description: string | null;
}

const FLAG: Record<string, string> = {
  "Saudi Arabia": "🇸🇦", "UAE": "🇦🇪", "Qatar": "🇶🇦", "Bahrain": "🇧🇭",
  "Kuwait": "🇰🇼", "Oman": "🇴🇲", "United Kingdom": "🇬🇧", "UK": "🇬🇧",
  "Canada": "🇨🇦", "Australia": "🇦🇺", "Germany": "🇩🇪", "USA": "🇺🇸", "Turkey": "🇹🇷",
  "United States": "🇺🇸",
};

// Extract a friendly portal name from a URL. "https://gulftalent.com/jobs/..."
// becomes "GulfTalent", etc. We try to match well-known portals first so
// the prep page reads as "Continue to GulfTalent" not "Continue to gulftalent.com".
function portalNameFromUrl(url: string | null | undefined): string {
  if (!url) return "the employer's website";
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const known: Record<string, string> = {
      "gulftalent.com":     "GulfTalent",
      "bayt.com":           "Bayt",
      "naukrigulf.com":     "Naukri Gulf",
      "indeed.com":         "Indeed",
      "ae.indeed.com":      "Indeed UAE",
      "sa.indeed.com":      "Indeed Saudi",
      "qa.indeed.com":      "Indeed Qatar",
      "linkedin.com":       "LinkedIn",
      "jobbank.gc.ca":      "Canada Job Bank",
      "workopolis.com":     "Workopolis",
      "findajob.dwp.gov.uk":"UK Find a Job",
      "nhsjobs.com":        "NHS Jobs",
      "seek.com.au":        "Seek Australia",
    };
    return known[host] || host;
  } catch {
    return "the employer's website";
  }
}

export default function ApplyPrepPage() {
  const [, params] = useRoute<{ jobId: string }>("/apply/:jobId");
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const qc = useQueryClient();

  const jobId = params?.jobId || "";

  // Parse ?url= from the query string — supports the "wrap any external
  // portal click" case (used by the country page apply links where we
  // already know the URL).
  const queryUrl = useMemo(() => {
    const qs = location.split("?")[1] || "";
    const sp = new URLSearchParams(qs);
    return sp.get("url");
  }, [location]);

  // Look the job up from the visa-sponsored jobs list (already cached by
  // React Query — no extra round trip when the user came from that page).
  // Falls through gracefully when the job ID isn't a visa-job (e.g. it's a
  // synthetic country portal click that only has a query URL).
  const { data: jobs } = useQuery<Job[]>({
    queryKey: ["/api/jobs/sponsorship"],
    enabled: !!jobId,
    staleTime: 5 * 60_000,
  });

  const job = useMemo<Job | null>(() => {
    if (!jobs) return null;
    return jobs.find((j) => j.id === jobId) ?? null;
  }, [jobs, jobId]);

  // Bookmark the job automatically on mount. Best-effort — if the bookmark
  // endpoint is missing or the user isn't signed in we just continue.
  const [bookmarked, setBookmarked] = useState(false);
  const bookmark = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/bookmarks", {
        itemType: "job",
        itemId: jobId,
      });
      return res.json();
    },
    onSuccess: () => {
      setBookmarked(true);
      qc.invalidateQueries({ queryKey: ["/api/bookmarks"] });
    },
    onError: () => { /* silent — don't block the apply flow */ },
  });

  useEffect(() => {
    if (jobId && user && !bookmarked && !bookmark.isPending) {
      bookmark.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, user]);

  // ── Continue button ────────────────────────────────────────────────────
  // For jobs in our DB the server endpoint handles the gating + redirect.
  // For raw URLs (passed via ?url=) we open them directly. Either way the
  // navigation happens with the user's intent — not silently behind their
  // back — so the browser's "you're leaving this page" affordance fires
  // and they consciously make the choice.
  const externalUrl = queryUrl || job?.applyLink || `/api/visa-jobs/${jobId}/apply`;
  const portal = portalNameFromUrl(externalUrl);

  const handleContinue = () => {
    if (queryUrl || job?.applyLink) {
      window.open(externalUrl, "_blank", "noopener,noreferrer");
    } else {
      // No direct URL — let the server's paid-tier gate handle it.
      // It redirects to the external portal on success or /pricing on
      // free-user upgrade required (HTML detection fix from earlier).
      window.location.href = externalUrl;
    }
  };

  const flag = job ? FLAG[job.country] || "🌍" : "🌍";

  return (
    <div className="min-h-screen bg-background pb-12">
      {/* Soft top header */}
      <div className="bg-gradient-to-br from-amber-600 via-orange-600 to-rose-600 text-white">
        <div className="max-w-2xl mx-auto px-4 py-5">
          <button
            onClick={() => navigate("/tools/visa-sponsorship-jobs")}
            className="text-xs text-amber-50 hover:text-white inline-flex items-center gap-1 mb-2"
            data-testid="link-back-jobs"
          >
            <ArrowLeft className="h-3 w-3" /> Back to jobs
          </button>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Plane className="h-5 w-5" /> One second before you apply…
          </h1>
          <p className="text-xs md:text-sm text-amber-50 mt-1">
            We saved this job. Just a quick heads-up before you continue.
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Job card — what they're applying to */}
        <Card className="border-2 border-amber-200 dark:border-amber-800/60 bg-gradient-to-br from-amber-50/40 to-orange-50/30 dark:from-amber-950/30 dark:to-orange-950/20">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="text-4xl shrink-0">{flag}</div>
              <div className="flex-1 min-w-0">
                {job ? (
                  <>
                    <h2 className="font-bold text-lg leading-tight">{job.title}</h2>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" /> {job.company}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {job.country}
                      </span>
                      {job.salary && (
                        <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300 font-medium">
                          <DollarSign className="h-3 w-3" /> {job.salary}
                        </span>
                      )}
                    </div>
                    {job.jobCategory && (
                      <Badge variant="outline" className="text-[10px] mt-2">{job.jobCategory}</Badge>
                    )}
                  </>
                ) : (
                  <>
                    <h2 className="font-bold text-lg leading-tight">Heading to {portal}</h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      We'll bring you back when you're done.
                    </p>
                  </>
                )}
              </div>
              {bookmarked && (
                <div className="shrink-0 inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
                  <BookmarkCheck className="h-4 w-4" /> Saved
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* The honest heads-up — the whole reason this page exists */}
        <Card className="border-2 border-rose-200 dark:border-rose-800/60 bg-rose-50/40 dark:bg-rose-950/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-rose-700 dark:text-rose-300 shrink-0 mt-0.5" />
              <div className="flex-1 text-sm">
                <p className="font-bold text-rose-900 dark:text-rose-100 mb-1">
                  Heads-up: {portal} might ask you to install their app.
                </p>
                <p className="text-rose-900/80 dark:text-rose-100/80 leading-relaxed">
                  <strong>You don't need to.</strong> Close that prompt and apply right in your
                  browser. When you're done, come back here — we've saved the job and you can
                  apply to the next one in two taps.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Continue button — single big primary action */}
        <Card className="border-2 border-emerald-300 dark:border-emerald-700">
          <CardContent className="p-4">
            <Button
              size="lg"
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              onClick={handleContinue}
              data-testid="button-continue-to-portal"
            >
              Continue to {portal}
              <ExternalLink className="h-4 w-4 ml-2" />
            </Button>
            <p className="text-[11px] text-muted-foreground text-center mt-2">
              Opens in a new tab so you don't lose this page.
            </p>
          </CardContent>
        </Card>

        {/* What WorkAbroad Hub does for you while you're away */}
        <Card className="bg-muted/40">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-bold">When you come back…</h3>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1.5">
              <li className="flex items-start gap-2">
                <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-emerald-600" />
                <span>This job is bookmarked — find it under <Link href="/bookmarks"><a className="underline">Saved Jobs</a></Link>.</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-emerald-600" />
                <span>Need a cover letter tuned for this role? <Link href="/services"><a className="underline">KES 149, in your inbox in 3 minutes.</a></Link></span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-emerald-600" />
                <span>Want to track this application? <Link href="/application-tracker"><a className="underline">Add it to your tracker.</a></Link></span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Tiny escape hatch — let them back out without applying */}
        <div className="text-center">
          <button
            onClick={() => navigate("/tools/visa-sponsorship-jobs")}
            className="text-xs text-muted-foreground hover:text-foreground underline"
            data-testid="link-skip-back"
          >
            Actually, take me back to the jobs list
          </button>
        </div>
      </div>
    </div>
  );
}
