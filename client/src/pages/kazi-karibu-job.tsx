/**
 * /kazi-karibu/job/:id — Post detail page.
 * Public — anonymous users can view but must sign in to express interest.
 * Contact info is NEVER shown here; poster releases it in-platform after
 * reviewing applicant profiles (contact isolation — Layer 5).
 */
import { useEffect, useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import {
  ArrowLeft, MapPin, Clock, Loader2, AlertCircle, Send, ShieldCheck, Info, Check, X, Phone, Mail, Lock,
  Trash2, Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
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
  poster_shows_phone: boolean;
  is_boosted: boolean;
  published_at: string;
  expires_at: string | null;
  /** 2026-07: server-computed — true when the current viewer is the poster. */
  is_mine?: boolean;
}

interface PosterContact {
  firstName: string | null;
  phone: string | null;
  email: string | null;
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
  const { user } = useAuth();
  const [post, setPost] = useState<KaziKaribuPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInterest, setShowInterest] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [contact, setContact] = useState<PosterContact | null>(null);
  const [revealingContact, setRevealingContact] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 2026-07: owner-only delete for when you've hired someone and want to
  // stop calls. The DELETE endpoint enforces ownership again on the server,
  // so this is safe even if is_mine were spoofed client-side.
  async function deleteOwnPost() {
    if (!post) return;
    if (!confirm(`Remove "${post.title}"? Applicants will no longer see it or be able to contact you about this post.`)) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/kazi-karibu/posts/${post.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (r.ok) {
        navigate("/kazi-karibu/my-posts");
      } else {
        const body = await r.json().catch(() => ({}));
        alert(body?.error ?? `Could not remove (${r.status})`);
        setDeleting(false);
      }
    } catch (err: any) {
      alert(err?.message ?? "Network error");
      setDeleting(false);
    }
  }

  async function revealContact() {
    if (!post) return;
    if (!user) {
      navigate(`/login?redirect=/kazi-karibu/job/${post.id}`);
      return;
    }
    setRevealingContact(true);
    setContactError(null);
    try {
      const r = await fetch(`/api/kazi-karibu/posts/${post.id}/contact`, { credentials: "include" });
      const body = await r.json();
      if (r.status === 429) { setContactError(body?.error ?? "You've viewed a lot of contacts recently."); return; }
      if (r.status === 403) { setContactError(body?.error ?? "Contact is not available for this post."); return; }
      if (!r.ok) { setContactError(body?.error ?? `Could not load contact (${r.status})`); return; }
      setContact({ firstName: body.firstName ?? null, phone: body.phone ?? null, email: body.email ?? null });
    } catch (err: any) {
      setContactError(err?.message ?? "Network error");
    } finally {
      setRevealingContact(false);
    }
  }

  async function submitInterest() {
    if (!post) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const r = await fetch(`/api/kazi-karibu/posts/${post.id}/interest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: message.trim() || undefined }),
      });
      const body = await r.json();
      if (r.status === 401) {
        setSubmitError("Please sign in to express interest.");
        setTimeout(() => navigate(`/login?redirect=/kazi-karibu/job/${post.id}`), 800);
        return;
      }
      if (!r.ok) {
        setSubmitError(body?.error ?? `Could not submit (${r.status})`);
        return;
      }
      setSubmitted(true);
    } catch (err: any) {
      setSubmitError(err?.message ?? "Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    let ok = true;
    (async () => {
      try {
        // credentials so the session cookie rides along — the server needs
        // it to set post.is_mine=true when the current viewer is the poster.
        const r = await fetch(`/api/kazi-karibu/posts/${id}`, { credentials: "include" });
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

            {/* ── Owner banner: replaces contact + interest UI when the
                current viewer is the poster (server-computed is_mine=true).
                Landing straight from the browse card, the poster gets a
                one-click "I've hired · Remove" without navigating away. ── */}
            {post.is_mine ? (
              <div className="mt-6 p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                <div className="text-xs font-semibold text-emerald-800 dark:text-emerald-200 uppercase mb-1 flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" /> This is your post
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-200 mb-3">
                  Found who you were looking for? Remove the post so applicants stop calling.
                  You can still see who applied on <Link href="/kazi-karibu/my-posts"><span className="underline font-medium">My posts</span></Link>.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Link href="/kazi-karibu/my-posts">
                    <Button variant="outline" className="w-full sm:w-auto">
                      <Users className="h-4 w-4 mr-2" /> See applicants
                    </Button>
                  </Link>
                  <Button
                    onClick={deleteOwnPost}
                    disabled={deleting}
                    className="w-full sm:w-auto border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-900/20 bg-transparent"
                    variant="outline"
                    data-testid="btn-delete-owner"
                  >
                    {deleting ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Removing…</>
                    ) : (
                      <><Trash2 className="h-4 w-4 mr-2" /> I've hired · Remove this post</>
                    )}
                  </Button>
                </div>
              </div>
            ) : post.poster_shows_phone ? (
              // ── Direct-contact mode (Option B default) ────────────────
              <div className="mt-6">
                {contact ? (
                  // Successfully revealed
                  <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                    <div className="text-xs font-semibold text-emerald-800 dark:text-emerald-200 uppercase mb-2 flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5" /> Poster contact
                    </div>
                    <div className="space-y-1.5">
                      {contact.firstName && (
                        <div className="text-sm font-semibold text-slate-900 dark:text-white">{contact.firstName}</div>
                      )}
                      {contact.phone && (
                        <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-base font-medium text-emerald-800 dark:text-emerald-100 hover:underline">
                          <Phone className="h-4 w-4" /> {contact.phone}
                        </a>
                      )}
                      {contact.email && (
                        <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 hover:underline">
                          <Mail className="h-3.5 w-3.5" /> {contact.email}
                        </a>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-3">
                      Call or WhatsApp them directly. Never send money — <Link href="/report-scam"><span className="underline">report</span></Link> if they ask.
                    </p>
                  </div>
                ) : (
                  // Reveal CTA
                  <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
                    <p className="text-sm text-slate-700 dark:text-slate-200 mb-3">
                      {user
                        ? "Reveal the poster's phone to call or WhatsApp them directly."
                        : "Sign in to see the poster's phone number."}
                    </p>
                    <Button
                      onClick={revealContact}
                      disabled={revealingContact}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto"
                      data-testid="btn-reveal-contact"
                    >
                      {revealingContact ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading…</>
                      ) : user ? (
                        <><Phone className="h-4 w-4 mr-2" /> Show phone number</>
                      ) : (
                        <><Lock className="h-4 w-4 mr-2" /> Sign in to see contact</>
                      )}
                    </Button>
                    {contactError && (
                      <p className="text-xs text-rose-700 dark:text-rose-300 mt-2">{contactError}</p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              // ── Contact-isolation mode (poster opted for interest flow) ──
              <div className="mt-6 flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-800 dark:text-blue-200">
                  <strong>The poster keeps their contact private.</strong> Express interest below and the poster
                  will review your profile — they'll reach out if they want to shortlist you.
                  Never send money to a poster; if anyone asks, <Link href="/report-scam"><span className="underline">report it</span></Link>.
                </div>
              </div>
            )}

            {/* ── Interest CTA (hidden for the poster of this post). ─────── */}
            <div className="mt-4 flex flex-col sm:flex-row gap-3">
              {!post.is_mine && (
                <Button
                  onClick={() => setShowInterest(true)}
                  className={post.poster_shows_phone
                    ? "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 flex-1"
                    : "bg-emerald-600 hover:bg-emerald-700 text-white flex-1"}
                  size="lg"
                  variant={post.poster_shows_phone ? "outline" : "default"}
                  data-testid="btn-show-interest"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {post.poster_shows_phone ? "Or save my interest" : "I'm interested"}
                </Button>
              )}
              <Link href="/kazi-karibu/browse">
                <Button variant="outline" size="lg" className={post.is_mine ? "w-full" : "w-full sm:w-auto"}>
                  Browse more jobs
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* ── Interest modal — real submission form ────────────────────── */}
        {showInterest && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
               onClick={() => !submitting && !submitted && setShowInterest(false)}>
            <Card className="max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <CardContent className="p-6">
                {submitted ? (
                  // ── Success state ───────────────────────────────────
                  <>
                    <div className="flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/40 mx-auto mb-3">
                      <Check className="h-6 w-6 text-emerald-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-center text-slate-900 dark:text-white mb-2">
                      Interest sent
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300 text-center mb-4">
                      The poster will review your profile and reach out on your registered phone if they want to shortlist you.
                    </p>
                    <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                      <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-blue-800 dark:text-blue-200">
                        Track this in <Link href="/kazi-karibu/my-interests"><span className="underline font-medium">My interests</span></Link>. If the poster releases their contact, it appears there.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Link href="/kazi-karibu/browse" className="flex-1">
                        <Button variant="outline" className="w-full">Browse more jobs</Button>
                      </Link>
                      <Link href="/kazi-karibu/my-interests" className="flex-1">
                        <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">My interests</Button>
                      </Link>
                    </div>
                  </>
                ) : (
                  // ── Form state ──────────────────────────────────────
                  <>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Express interest</h3>
                      <button onClick={() => setShowInterest(false)} className="text-slate-400 hover:text-slate-600" data-testid="btn-close-interest">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                      Your profile (name, phone, and any career details) will be shared with the poster.
                      Add a short note if you'd like to introduce yourself.
                    </p>

                    <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                      <ShieldCheck className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-blue-800 dark:text-blue-200">
                        <strong>Your safety:</strong> the poster only sees your contact when you express interest.
                        You'll see theirs when they choose to share it with you. Never send money to a poster.
                      </p>
                    </div>

                    <label className="text-sm font-medium block mb-1">Cover note <span className="text-slate-400">(optional)</span></label>
                    <Textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="e.g. I've been a nanny for 5 years, references available. Can start immediately."
                      rows={4}
                      maxLength={2000}
                      data-testid="input-interest-message"
                    />
                    <p className="text-xs text-slate-500 mt-1 mb-4 text-right">{message.length}/2000</p>

                    {submitError && (
                      <div className="p-2 mb-3 rounded bg-rose-50 dark:bg-rose-900/20 text-sm text-rose-700 dark:text-rose-300">
                        {submitError}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => setShowInterest(false)}
                        disabled={submitting}
                      >
                        Cancel
                      </Button>
                      <Button
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={submitInterest}
                        disabled={submitting}
                        data-testid="btn-submit-interest"
                      >
                        {submitting ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…</>
                        ) : (
                          <><Send className="h-4 w-4 mr-2" /> Send interest</>
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
