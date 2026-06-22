/**
 * /kenya-careers/my-applications — user's submitted Kenya Careers applications.
 *
 * 2026-06 Phase 2: shows the applications the signed-in user has submitted,
 * grouped by status. Each card links back to the job detail page so they
 * can re-read the listing while waiting for a response.
 *
 * Statuses: submitted | shortlisted | rejected | hired. Phase 3 (employer
 * accounts) will update statuses from the employer dashboard.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  Briefcase, MapPin, ArrowLeft, BadgeCheck, Loader2, CheckCircle2,
  Clock, XCircle, Trophy, ChevronRight, Inbox, Eye, MessageCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ApplicationRow {
  id:        string;
  status:    "submitted" | "under_review" | "shortlisted" | "interview" | "hired" | "rejected" | string;
  appliedAt: string;
  updatedAt: string;
  coverNote: string | null;
  cvUrl:     string | null;
  job: {
    id:     string;
    title:  string;
    county: string | null;
    town:   string | null;
    status: string;
  };
  company: {
    name:     string;
    verified: boolean;
  };
}

const STATUS_META: Record<string, { label: string; icon: any; color: string; bgClass: string }> = {
  submitted:    { label: "Submitted",    icon: Clock,         color: "blue",    bgClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 ring-blue-200" },
  under_review: { label: "Under review", icon: Eye,           color: "indigo",  bgClass: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 ring-indigo-200" },
  shortlisted:  { label: "Shortlisted",  icon: CheckCircle2,  color: "emerald", bgClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 ring-emerald-200" },
  interview:    { label: "Interview",    icon: MessageCircle, color: "violet",  bgClass: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 ring-violet-200" },
  hired:        { label: "Hired",        icon: Trophy,        color: "amber",   bgClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 ring-amber-200" },
  rejected:     { label: "Not selected", icon: XCircle,       color: "muted",   bgClass: "bg-muted text-muted-foreground" },
};

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const ms = Date.now() - t;
  const mins = Math.floor(ms / 60_000);
  if (mins < 5) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export default function KenyaCareersMyApplications() {
  const [apps, setApps] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requiresSignin, setRequiresSignin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/local-jobs/me/applications", { credentials: "include" });
        if (res.status === 401) {
          if (!cancelled) { setRequiresSignin(true); setLoading(false); }
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("application/json")) throw new Error("Bad response");
        const data = await res.json();
        if (!cancelled) {
          setApps(Array.isArray(data?.applications) ? data.applications : []);
          setLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Could not load your applications.");
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* Header */}
      <div className="bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 text-white px-4 pt-4 pb-6">
        <div className="max-w-3xl mx-auto">
          <Link href="/kenya-careers">
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/10 -ml-2 mb-2">
              <ArrowLeft className="h-4 w-4 mr-1.5" /> All Kenya Careers
            </Button>
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">My applications</h1>
          <p className="text-sm text-emerald-100 mt-0.5">
            Kenya Careers applications you've sent. Statuses update when the employer reviews you.
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 mt-4 space-y-3">
        {loading && (
          <Card>
            <CardContent className="p-8 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading your applications…
            </CardContent>
          </Card>
        )}

        {!loading && requiresSignin && (
          <Card>
            <CardContent className="p-8 text-center">
              <Inbox className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <h3 className="font-semibold mb-1">Sign in to see your applications</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Your application history is tied to your account.
              </p>
              <Link href="/login?redirect=/kenya-careers/my-applications">
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">Sign in</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {!loading && !requiresSignin && error && (
          <Card className="border-rose-200 bg-rose-50 dark:bg-rose-900/10">
            <CardContent className="p-4 text-sm text-rose-700 dark:text-rose-300">{error}</CardContent>
          </Card>
        )}

        {!loading && !requiresSignin && !error && apps.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <Inbox className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <h3 className="font-semibold mb-1">No applications yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Browse Kenya Careers and tap Apply on any job you're interested in.
              </p>
              <Link href="/kenya-careers">
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">Browse jobs</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {!loading && apps.map((a) => {
          const meta = STATUS_META[a.status] ?? STATUS_META.submitted;
          const Icon = meta.icon;
          return (
            <Link key={a.id} href={`/kenya-careers/job/${a.job.id}`}>
              <Card className="cursor-pointer hover:border-emerald-400 hover:shadow-sm transition-all" data-testid={`my-app-${a.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm leading-tight">{a.job.title}</h3>
                      <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                        <span>{a.company.name}</span>
                        {a.company.verified && <BadgeCheck className="h-3 w-3 text-emerald-600" />}
                      </div>

                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
                        {(a.job.town || a.job.county) && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {[a.job.town, a.job.county].filter(Boolean).join(", ")}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Briefcase className="h-3 w-3" />
                          Sent {timeAgo(a.appliedAt)}
                        </span>
                      </div>

                      <div className="mt-2">
                        <Badge
                          variant="outline"
                          className={`text-[10px] inline-flex items-center gap-1 ring-1 ${meta.bgClass}`}
                        >
                          <Icon className="h-3 w-3" />
                          {meta.label}
                        </Badge>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
