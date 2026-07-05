/**
 * /kazi-karibu/my-posts — Poster's own posts, in every state.
 * Shows moderation lifecycle so the poster can see what happened at each step.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft, Briefcase, Clock, Loader2, CheckCircle2, AlertCircle, Ban, EyeOff, FileText, Trash2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { KAZI_KARIBU_CATEGORIES } from "@shared/kazi-karibu";
import { KaziKaribuApplicantsPanel } from "@/components/kazi-karibu-applicants-panel";

interface MyPost {
  id: string;
  category: string;
  county: string;
  sub_county: string | null;
  title: string;
  moderation_state: string;
  is_boosted: boolean;
  published_at: string | null;
  expires_at: string | null;
  created_at: string;
}

const STATE_LABEL: Record<string, string> = {
  draft:               "Draft",
  awaiting_payment:    "Awaiting M-Pesa",
  pending_moderation:  "Reviewing…",
  live:                "Live",
  held:                "Held for review",
  rejected:            "Rejected",
  expired:             "Expired",
  removed:             "Removed",
};

const STATE_COLOR: Record<string, string> = {
  draft:               "bg-slate-100 text-slate-700 border-slate-300",
  awaiting_payment:    "bg-amber-100 text-amber-800 border-amber-300",
  pending_moderation:  "bg-blue-100 text-blue-800 border-blue-300",
  live:                "bg-emerald-100 text-emerald-800 border-emerald-300",
  held:                "bg-amber-100 text-amber-800 border-amber-300",
  rejected:            "bg-rose-100 text-rose-800 border-rose-300",
  expired:             "bg-slate-100 text-slate-500 border-slate-300",
  removed:             "bg-slate-100 text-slate-500 border-slate-300",
};

const STATE_ICON: Record<string, any> = {
  draft:              FileText,
  awaiting_payment:   Clock,
  pending_moderation: Loader2,
  live:               CheckCircle2,
  held:               AlertCircle,
  rejected:           Ban,
  expired:            EyeOff,
  removed:            EyeOff,
};

export default function KaziKaribuMyPosts() {
  const { user, isLoading: authLoading } = useAuth();
  const [posts, setPosts] = useState<MyPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function deletePost(postId: string, postTitle: string) {
    if (!confirm(`Remove "${postTitle}"? Applicants will no longer be able to see it or contact you about this post.`)) {
      return;
    }
    setDeletingId(postId);
    try {
      const r = await fetch(`/api/kazi-karibu/posts/${postId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (r.ok) {
        setPosts(prev => prev.map(p =>
          p.id === postId ? { ...p, moderation_state: "removed" } : p,
        ));
      } else {
        const body = await r.json().catch(() => ({}));
        alert(body?.error ?? `Could not remove (${r.status})`);
      }
    } catch (err: any) {
      alert(err?.message ?? "Network error");
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    document.title = "My posts — Kazi Karibu";
  }, []);

  useEffect(() => {
    if (!user) return;
    let ok = true;
    (async () => {
      try {
        const r = await fetch("/api/kazi-karibu/posts/mine", { credentials: "include" });
        if (r.status === 404) { if (ok) { setPosts([]); setLoading(false); } return; }
        const body = await r.json();
        if (ok) { setPosts(body.posts ?? []); setLoading(false); }
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
            <h2 className="text-xl font-bold mb-2">Sign in to view your posts</h2>
            <Link href="/login?redirect=/kazi-karibu/my-posts">
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
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My posts</h1>
            <p className="text-sm text-slate-500 mt-1">{posts.length} post{posts.length === 1 ? "" : "s"}</p>
          </div>
          <Link href="/kazi-karibu/post">
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">Post another job</Button>
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
        ) : posts.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center">
              <Briefcase className="h-10 w-10 text-slate-400 mx-auto mb-3" />
              <p className="text-slate-600 dark:text-slate-300 mb-4">You haven't posted any jobs yet.</p>
              <Link href="/kazi-karibu/post">
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">Post your first job (free)</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {posts.map((p) => {
              const Icon = STATE_ICON[p.moderation_state] ?? FileText;
              const isLive = p.moderation_state === "live";
              return (
                <Card key={p.id} data-testid={`my-post-${p.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {KAZI_KARIBU_CATEGORIES.find(c => c.id === p.category)?.label ?? p.category}
                          </Badge>
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${STATE_COLOR[p.moderation_state] ?? "bg-slate-100"}`}>
                            <Icon className={`h-3 w-3 ${p.moderation_state === "pending_moderation" ? "animate-spin" : ""}`} />
                            {STATE_LABEL[p.moderation_state] ?? p.moderation_state}
                          </span>
                          {p.is_boosted && (<Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px]">Boosted</Badge>)}
                        </div>
                        <div className="font-semibold text-slate-900 dark:text-white mb-1 line-clamp-1">{p.title}</div>
                        <div className="text-xs text-slate-500">
                          {p.sub_county ? `${p.sub_county}, ${p.county}` : p.county}
                          {p.published_at && ` · published ${new Date(p.published_at).toLocaleDateString()}`}
                          {p.expires_at && isLive && ` · expires ${new Date(p.expires_at).toLocaleDateString()}`}
                        </div>
                      </div>
                      {isLive && (
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            variant={expandedPostId === p.id ? "default" : "outline"}
                            size="sm"
                            onClick={() => setExpandedPostId(expandedPostId === p.id ? null : p.id)}
                            data-testid={`btn-applicants-${p.id}`}
                          >
                            {expandedPostId === p.id ? "Hide applicants" : "See applicants"}
                          </Button>
                          <Link href={`/kazi-karibu/job/${p.id}`}>
                            <Button variant="outline" size="sm">View post</Button>
                          </Link>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deletePost(p.id, p.title)}
                            disabled={deletingId === p.id}
                            className="border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-900/20"
                            data-testid={`btn-delete-${p.id}`}
                          >
                            {deletingId === p.id ? (
                              <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Removing…</>
                            ) : (
                              <><Trash2 className="h-3.5 w-3.5 mr-1" /> I've hired · Remove</>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                    {/* Inline applicants panel — fetched only when the poster expands it */}
                    {isLive && expandedPostId === p.id && (
                      <KaziKaribuApplicantsPanel postId={p.id} />
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
