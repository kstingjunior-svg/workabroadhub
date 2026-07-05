/**
 * /kazi-karibu/my-interests — Applicant's expressed interests.
 *
 * Shows every job the user has expressed interest in. If the poster has
 * released their contact, the phone/email is shown here — otherwise it's
 * gated with a "waiting for poster to respond" state.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft, Briefcase, Clock, Loader2, Phone, Mail, ShieldCheck, MapPin,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { KAZI_KARIBU_CATEGORIES } from "@shared/kazi-karibu";

interface MyInterest {
  id: string;
  message: string | null;
  contact_revealed_at: string | null;
  created_at: string;
  post_id: string;
  title: string;
  category: string;
  county: string;
  sub_county: string | null;
  moderation_state: string;
  budget_min_kes: number | null;
  budget_max_kes: number | null;
  budget_period: string | null;
  poster_display_name: string | null;
  poster_first_name: string | null;
  poster_phone: string | null;
  poster_email: string | null;
}

function formatBudget(p: MyInterest): string {
  const min = p.budget_min_kes;
  const max = p.budget_max_kes;
  const period = p.budget_period;
  if (!min && !max) return "Negotiable";
  const periodLabel =
    period === "hour"    ? "/hour"    :
    period === "day"     ? "/day"     :
    period === "month"   ? "/month"   :
    period === "project" ? " flat"    : "";
  if (min && max && min !== max) {
    return `KES ${min.toLocaleString()}–${max.toLocaleString()}${periodLabel}`;
  }
  const single = min ?? max;
  return `KES ${single!.toLocaleString()}${periodLabel}`;
}

function timeAgo(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const mins = Math.floor((now - then) / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function KaziKaribuMyInterests() {
  const { user, isLoading: authLoading } = useAuth();
  const [interests, setInterests] = useState<MyInterest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "My interests — Kazi Karibu";
  }, []);

  useEffect(() => {
    if (!user) return;
    let ok = true;
    (async () => {
      try {
        const r = await fetch("/api/kazi-karibu/interests/mine", { credentials: "include" });
        if (r.status === 404) { if (ok) { setInterests([]); setLoading(false); } return; }
        const body = await r.json();
        if (ok) { setInterests(body.interests ?? []); setLoading(false); }
      } catch { if (ok) setLoading(false); }
    })();
    return () => { ok = false; };
  }, [user]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-bold mb-2">Sign in to view your interests</h2>
            <Link href="/login?redirect=/kazi-karibu/my-interests">
              <Button className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white">Sign in</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <Link href="/kazi-karibu"><Button variant="ghost" size="sm" className="mb-4"><ArrowLeft className="h-4 w-4 mr-1" /> Back to Kazi Karibu</Button></Link>

        <div className="mb-4">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My interests</h1>
          <p className="text-sm text-slate-500 mt-1">
            {interests.length} job{interests.length === 1 ? "" : "s"} you've expressed interest in
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
        ) : interests.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center">
              <Briefcase className="h-10 w-10 text-slate-400 mx-auto mb-3" />
              <p className="text-slate-600 dark:text-slate-300 mb-4">You haven't expressed interest in any jobs yet.</p>
              <Link href="/kazi-karibu/browse">
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">Browse jobs</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {interests.map((it) => {
              const revealed = !!it.contact_revealed_at;
              const jobStillLive = it.moderation_state === "live";
              const categoryLabel = KAZI_KARIBU_CATEGORIES.find(c => c.id === it.category)?.label ?? it.category;
              return (
                <Card key={it.id} data-testid={`my-interest-${it.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">{categoryLabel}</Badge>
                        {revealed ? (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-xs">
                            Contact received
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-xs">
                            Waiting for poster
                          </Badge>
                        )}
                        {!jobStillLive && (
                          <Badge variant="outline" className="text-xs text-slate-500">Job closed</Badge>
                        )}
                      </div>
                      <span className="text-xs text-slate-400">{timeAgo(it.created_at)}</span>
                    </div>

                    <Link href={`/kazi-karibu/job/${it.post_id}`}>
                      <div className="font-semibold text-slate-900 dark:text-white mb-1 hover:underline cursor-pointer">
                        {it.title}
                      </div>
                    </Link>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mb-2">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {it.sub_county ? `${it.sub_county}, ${it.county}` : it.county}
                      </span>
                      <span className="text-emerald-700 dark:text-emerald-300 font-medium">{formatBudget(it)}</span>
                      {it.poster_display_name && <span>Posted by {it.poster_display_name}</span>}
                    </div>

                    {it.message && (
                      <div className="text-xs text-slate-500 italic mb-2 line-clamp-2">
                        Your note: "{it.message}"
                      </div>
                    )}

                    {/* ── Contact reveal panel ──────────────────────────── */}
                    {revealed ? (
                      <div className="mt-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                        <div className="text-xs font-semibold text-emerald-800 dark:text-emerald-200 mb-2 flex items-center gap-1">
                          <ShieldCheck className="h-3 w-3" />
                          The poster shared their contact with you
                        </div>
                        <div className="text-sm space-y-1">
                          {it.poster_first_name && (
                            <div className="text-slate-700 dark:text-slate-200">
                              <strong>{it.poster_first_name}</strong>
                            </div>
                          )}
                          {it.poster_phone && (
                            <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-100">
                              <Phone className="h-3.5 w-3.5 text-emerald-700" />
                              <a href={`tel:${it.poster_phone}`} className="hover:underline font-medium">
                                {it.poster_phone}
                              </a>
                            </div>
                          )}
                          {it.poster_email && (
                            <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-100">
                              <Mail className="h-3.5 w-3.5 text-emerald-700" />
                              <a href={`mailto:${it.poster_email}`} className="hover:underline">
                                {it.poster_email}
                              </a>
                            </div>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-2">
                          Reach out directly. Never send money — <Link href="/report-scam"><span className="underline">report</span></Link> if the poster asks for any.
                        </p>
                      </div>
                    ) : (
                      <div className="mt-3 p-2 rounded bg-slate-50 dark:bg-slate-800/40 text-xs text-slate-500 flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        Poster hasn't reached out yet. Their contact will appear here if they shortlist you.
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
