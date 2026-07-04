/**
 * /kazi-karibu/job/:id — Post detail page.
 * Public — anonymous users can view but must sign in to express interest.
 * Contact info is NEVER shown here; poster releases it in-platform after
 * reviewing applicant profiles (contact isolation — Layer 5).
 */
import { useEffect, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import {
  ArrowLeft, MapPin, Clock, Loader2, AlertCircle, Send, ShieldCheck, Info,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KAZI_KARIBU_CATEGORIES } from "@shared/kazi-karibu";

interface KaziKaribuPost {
  id: string;
  category: string;
  county: string;
  sub_county: string | null;
  title: string;
  description: string;
  budget_min_kes: number | null;
  budget_max_kes: number | null;
  budget_period: string | null;
  duration: string | null;
  poster_display_name: string | null;
  is_boosted: boolean;
  published_at: string;
  expires_at: string | null;
}

function formatBudget(p: KaziKaribuPost): string {
  const min = p.budget_min_kes;
  const max = p.budget_max_kes;
  const period = p.budget_period;
  if (!min && !max) return "Negotiable";
  const periodLabel =
    period === "hour"    ? " per hour"    :
    period === "day"     ? " per day"     :
    period === "month"   ? " per month"   :
    period === "project" ? " flat rate"   : "";
  if (min && max && min !== max) {
    return `KES ${min.toLocaleString()} – ${max.toLocaleString()}${periodLabel}`;
  }
  const single = min ?? max;
  return `KES ${single!.toLocaleString()}${periodLabel}`;
}

const DURATION_LABEL: Record<string, string> = {
  one_off:          "One-off",
  recurring_weekly: "Recurring weekly",
  permanent:        "Permanent / ongoing",
};

export default function KaziKaribuJob() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [post, setPost] = useState<KaziKaribuPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInterest, setShowInterest] = useState(false);

  useEffect(() => {
    let ok = true;
    (async () => {
      try {
        const r = await fetch(`/api/kazi-karibu/posts/${id}`);
        if (r.status === 404) { if (ok) { setError("This job is no longer live."); setLoading(false); } return; }
        const body = await r.json();
        if (ok) { setPost(body.post); setLoading(false); document.title = `${body.post.title} — Kazi Karibu`; }
      } catch (err: any) {
        if (ok) { setError("Could not load this job. Please try again."); setLoading(false); }
      }
    })();
    return () => { ok = false; };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="max-w-3xl mx-auto px-4 py-12">
          <Link href="/kazi-karibu/browse">
            <Button variant="ghost" size="sm" className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to browse
            </Button>
          </Link>
          <Card>
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-10 w-10 text-slate-400 mx-auto mb-3" />
              <p className="text-slate-600 dark:text-slate-300">{error ?? "Job not found."}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const categoryLabel = KAZI_KARIBU_CATEGORIES.find(c => c.id === post.category)?.label ?? post.category;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link href="/kazi-karibu/browse">
          <Button variant="ghost" size="sm" className="mb-4" data-testid="btn-back">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to browse
          </Button>
        </Link>

        <Card>
          <CardContent className="p-6 md:p-8">
            <div className="flex items-start justify-between gap-3 mb-4">
              <Badge variant="outline" className="border-emerald-300 text-emerald-700 dark:text-emerald-300">
                {categoryLabel}
              </Badge>
              {post.is_boosted && <Badge className="bg-amber-100 text-amber-800 border-amber-300">Boosted</Badge>}
            </div>

            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-3">
              {post.title}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600 dark:text-slate-300 mb-6">
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {post.sub_county ? `${post.sub_county}, ${post.county}` : post.county}
              </span>
              {post.duration && (
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {DURATION_LABEL[post.duration] ?? post.duration}
                </span>
              )}
              {post.poster_display_name && (
                <span className="text-slate-500">Posted by {post.poster_display_name}</span>
              )}
            </div>

            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-4 mb-6">
              <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase mb-1">Pay</div>
              <div className="text-2xl font-bold text-emerald-800 dark:text-emerald-100">
                {formatBudget(post)}
              </div>
            </div>

            <div className="prose prose-slate dark:prose-invert max-w-none">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase mb-2">About this job</h3>
              <p className="whitespace-pre-line text-slate-700 dark:text-slate-200 leading-relaxed">
                {post.description}
              </p>
            </div>

            {/* ── Contact isolation notice ─────────────────────────────── */}
            <div className="mt-6 flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-xs text-blue-800 dark:text-blue-200">
                <strong>Your safety comes first.</strong> Poster contact details are hidden. Express interest below —
                the poster will review your profile and reach out if they want to shortlist you.
                Never send money to a poster; if anyone asks, <Link href="/report-scam"><span className="underline">report it</span></Link>.
              </div>
            </div>

            {/* ── Interest CTA ─────────────────────────────────────────── */}
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <Button
                onClick={() => setShowInterest(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white flex-1"
                size="lg"
                data-testid="btn-show-interest"
              >
                <Send className="h-4 w-4 mr-2" /> I'm interested
              </Button>
              <Link href="/kazi-karibu/browse">
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
                  Browse more jobs
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* ── Interest modal (Phase 1b: backend still stubbed) ────────── */}
        {showInterest && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <Card className="max-w-md w-full">
              <CardContent className="p-6">
                <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <ShieldCheck className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    The applicant flow is launching soon. For now, please save this job and check back when it opens.
                  </p>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 mb-4">
                  This job posting is live and real. The button to submit your interest lands next release —
                  we're finishing the applicant-safety features first.
                </p>
                <Button className="w-full" variant="outline" onClick={() => setShowInterest(false)}>
                  Got it
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
