/**
 * Inline applicants panel for the poster's my-posts view.
 *
 * Fetches interests for a specific post, renders each applicant with their
 * profile snapshot, and offers a "Reveal my contact" button that releases
 * the poster's contact TO that specific applicant.
 *
 * See docs/kazi-karibu/STRATEGY.md §10 (Layer 5 — contact isolation).
 */
import { useEffect, useState } from "react";
import { Loader2, Phone, Mail, ShieldCheck, Users, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ApplicantInterest {
  id: string;
  applicant_user_id: string;
  message: string | null;
  shared_profile_snapshot: {
    firstName?:  string | null;
    lastName?:   string | null;
    email?:      string | null;
    phone?:      string | null;
    city?:       string | null;
    country?:    string | null;
    headline?:   string | null;
    summary?:    string | null;
    snapshotAt?: string;
  };
  contact_revealed_at: string | null;
  reported: boolean;
  created_at: string;
}

export function KaziKaribuApplicantsPanel({ postId }: { postId: string }) {
  const [interests, setInterests] = useState<ApplicantInterest[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealing, setRevealing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ok = true;
    (async () => {
      try {
        const r = await fetch(`/api/kazi-karibu/posts/${postId}/interests`, { credentials: "include" });
        if (!r.ok) {
          if (ok) { setError(`Could not load applicants (${r.status})`); setLoading(false); }
          return;
        }
        const body = await r.json();
        if (ok) { setInterests(body.interests ?? []); setLoading(false); }
      } catch (err: any) {
        if (ok) { setError(err?.message ?? "Network error"); setLoading(false); }
      }
    })();
    return () => { ok = false; };
  }, [postId]);

  async function revealContact(interestId: string) {
    setRevealing(interestId);
    try {
      const r = await fetch(`/api/kazi-karibu/interests/${interestId}/reveal-contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: "{}",
      });
      if (r.ok) {
        // Optimistically update the local list — the interest now has a reveal time.
        setInterests(prev => prev.map(i =>
          i.id === interestId ? { ...i, contact_revealed_at: new Date().toISOString() } : i,
        ));
      } else {
        const body = await r.json().catch(() => ({}));
        alert(body?.error ?? `Could not release contact (${r.status})`);
      }
    } catch (err: any) {
      alert(err?.message ?? "Network error");
    } finally {
      setRevealing(null);
    }
  }

  if (loading) {
    return (
      <div className="mt-3 p-3 rounded bg-slate-50 dark:bg-slate-800/40 flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading applicants…
      </div>
    );
  }
  if (error) {
    return (
      <div className="mt-3 p-3 rounded bg-rose-50 dark:bg-rose-900/20 text-sm text-rose-700">
        {error}
      </div>
    );
  }
  if (interests.length === 0) {
    return (
      <div className="mt-3 p-3 rounded bg-slate-50 dark:bg-slate-800/40 text-sm text-slate-500 flex items-center gap-2">
        <Users className="h-4 w-4" /> No applicants yet. Applicants will appear here once they express interest.
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="text-xs uppercase font-semibold text-slate-500 flex items-center gap-1.5 mb-1">
        <Users className="h-3.5 w-3.5" />
        {interests.length} applicant{interests.length === 1 ? "" : "s"}
      </div>
      {interests.map((it) => {
        const snap = it.shared_profile_snapshot ?? {};
        const fullName = [snap.firstName, snap.lastName].filter(Boolean).join(" ") || "Applicant";
        const revealed = !!it.contact_revealed_at;
        return (
          <div
            key={it.id}
            className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            data-testid={`applicant-${it.id}`}
          >
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                  {fullName}
                  {revealed && (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px]">
                      Contact shared
                    </Badge>
                  )}
                  {it.reported && (
                    <Badge className="bg-rose-100 text-rose-800 border-rose-300 text-[10px]">
                      Reported
                    </Badge>
                  )}
                </div>
                {snap.headline && (
                  <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-1">
                    {snap.headline}
                  </div>
                )}
                {(snap.city || snap.country) && (
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {[snap.city, snap.country].filter(Boolean).join(", ")}
                  </div>
                )}
                <div className="mt-1.5 space-y-0.5">
                  {snap.phone && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200">
                      <Phone className="h-3 w-3 text-slate-500" />
                      <a href={`tel:${snap.phone}`} className="hover:underline">{snap.phone}</a>
                    </div>
                  )}
                  {snap.email && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200">
                      <Mail className="h-3 w-3 text-slate-500" />
                      <a href={`mailto:${snap.email}`} className="hover:underline">{snap.email}</a>
                    </div>
                  )}
                </div>
                {it.message && (
                  <div className="mt-2 text-xs text-slate-600 dark:text-slate-300 italic border-l-2 border-slate-200 dark:border-slate-700 pl-2">
                    "{it.message}"
                  </div>
                )}
              </div>
              {!revealed ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => revealContact(it.id)}
                  disabled={revealing === it.id}
                  data-testid={`btn-reveal-${it.id}`}
                >
                  {revealing === it.id ? (
                    <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Sharing…</>
                  ) : (
                    <><ShieldCheck className="h-3 w-3 mr-1" /> Share my contact</>
                  )}
                </Button>
              ) : (
                <span className="shrink-0 text-xs text-emerald-700 flex items-center gap-1">
                  <Check className="h-3.5 w-3.5" /> Contact shared
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
