import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ScamReport, ScamWallComment } from "@shared/schema";
import {
  Heart, MessageCircle, Share2, AlertTriangle, ChevronLeft,
  ChevronRight, X, Send, Flag, Copy, ExternalLink, Eye,
  Flame, ShieldAlert, ArrowLeft, Plus
} from "lucide-react";

const COUNTRY_FLAGS: Record<string, string> = {
  Kenya: "🇰🇪", Uganda: "🇺🇬", Tanzania: "🇹🇿", Nigeria: "🇳🇬",
  "South Africa": "🇿🇦", Ghana: "🇬🇭", Ethiopia: "🇪🇹", Rwanda: "🇷🇼",
  UAE: "🇦🇪", Qatar: "🇶🇦", "Saudi Arabia": "🇸🇦", Kuwait: "🇰🇼",
  Bahrain: "🇧🇭", Oman: "🇴🇲", Malaysia: "🇲🇾", Singapore: "🇸🇬",
  UK: "🇬🇧", USA: "🇺🇸", Canada: "🇨🇦", Australia: "🇦🇺",
  Germany: "🇩🇪", Dubai: "🇦🇪", China: "🇨🇳", India: "🇮🇳",
  Japan: "🇯🇵", "South Korea": "🇰🇷", Egypt: "🇪🇬", Morocco: "🇲🇦",
};

function getFingerprint(): string {
  const stored = localStorage.getItem("swf");
  if (stored) return stored;
  const fp = `${Date.now()}-${Math.random().toString(36).slice(2)}-${navigator.userAgent.length}`;
  localStorage.setItem("swf", fp);
  return fp;
}

function formatCaption(report: ScamReport): string {
  const agency = report.agencyName;
  const country = report.country ? ` operating in ${report.country}` : "";
  const amount = report.amountLost ? ` A victim lost KES ${report.amountLost.toLocaleString()}.` : "";
  const desc = report.description.length > 120
    ? report.description.substring(0, 120) + "…"
    : report.description;
  return `⚠️ SCAM ALERT: ${agency}${country}.${amount} ${desc}`;
}

function timeAgo(date: string | Date): string {
  const d = new Date(date);
  const now = Date.now();
  const diff = Math.floor((now - d.getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

interface CommentsPanelProps {
  reportId: string;
  onClose: () => void;
}

function CommentsPanel({ reportId, onClose }: CommentsPanelProps) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [name, setName] = useState("");

  const { data, isLoading } = useQuery<{ comments: ScamWallComment[] }>({
    queryKey: ["/api/scam-wall", reportId, "comments"],
    queryFn: () => fetch(`/api/scam-wall/${reportId}/comments`).then(r => r.json()),
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const csrf = await fetch("/api/csrf-token").then(r => r.json()).then(d => d.token);
      return fetch(`/api/scam-wall/${reportId}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ content: text.trim(), authorName: name.trim() || "Anonymous" }),
      }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scam-wall", reportId, "comments"] });
      setText("");
      toast({ title: "Comment posted!" });
    },
    onError: () => toast({ title: "Failed to post comment", variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div
        className="bg-zinc-900 rounded-t-3xl max-h-[70vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
          <span className="text-white font-semibold text-sm">Comments</span>
          <button onClick={onClose} className="text-zinc-400 hover:text-white" data-testid="btn-close-comments">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
          {isLoading && <p className="text-zinc-500 text-sm text-center">Loading…</p>}
          {!isLoading && (!data?.comments || data.comments.length === 0) && (
            <p className="text-zinc-500 text-sm text-center py-8">No comments yet. Be first!</p>
          )}
          {data?.comments?.map(c => (
            <div key={c.id} className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs text-white flex-shrink-0">
                {(c.authorName || "A")[0].toUpperCase()}
              </div>
              <div>
                <p className="text-white text-xs font-semibold">{c.authorName || "Anonymous"}</p>
                <p className="text-zinc-300 text-sm">{c.content}</p>
                <p className="text-zinc-600 text-xs mt-0.5">{timeAgo(c.createdAt!)}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="px-4 pb-6 pt-3 border-t border-zinc-800">
          <input
            className="w-full bg-zinc-800 text-white text-sm rounded-xl px-3 py-2 mb-2 placeholder:text-zinc-500 outline-none"
            placeholder="Your name (optional)"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={50}
            data-testid="input-comment-name"
          />
          <div className="flex gap-2">
            <input
              className="flex-1 bg-zinc-800 text-white text-sm rounded-xl px-3 py-2 placeholder:text-zinc-500 outline-none"
              placeholder="Add a comment…"
              value={text}
              onChange={e => setText(e.target.value)}
              maxLength={500}
              onKeyDown={e => e.key === "Enter" && text.trim().length >= 3 && addMutation.mutate()}
              data-testid="input-comment-text"
            />
            <button
              onClick={() => addMutation.mutate()}
              disabled={text.trim().length < 3 || addMutation.isPending}
              className="bg-red-500 text-white rounded-xl px-3 py-2 disabled:opacity-40 hover:bg-red-600 transition-colors"
              data-testid="btn-post-comment"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SharePanelProps {
  report: ScamReport;
  onClose: () => void;
}

function SharePanel({ report, onClose }: SharePanelProps) {
  const { toast } = useToast();
  const url = `${window.location.origin}/scam-wall`;
  const text = `🚨 SCAM ALERT: ${report.agencyName}${report.country ? ` in ${report.country}` : ""}. Check the Scam Wall for details. Stay safe! ${url}`;

  const copy = () => {
    navigator.clipboard.writeText(url).then(() => toast({ title: "Link copied!" }));
    onClose();
  };

  const whatsapp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    onClose();
  };

  const twitter = () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div
        className="bg-zinc-900 rounded-t-3xl p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-white font-semibold">Share this scam alert</span>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-zinc-400 text-sm mb-4 bg-zinc-800 rounded-xl p-3">
          {text.substring(0, 120)}…
        </p>
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={copy}
            className="flex flex-col items-center gap-2 bg-zinc-800 hover:bg-zinc-700 rounded-2xl p-4 transition-colors"
            data-testid="btn-share-copy"
          >
            <Copy className="h-6 w-6 text-white" />
            <span className="text-white text-xs">Copy link</span>
          </button>
          <button
            onClick={whatsapp}
            className="flex flex-col items-center gap-2 bg-green-900/60 hover:bg-green-900 rounded-2xl p-4 transition-colors"
            data-testid="btn-share-whatsapp"
          >
            <span className="text-2xl">💬</span>
            <span className="text-white text-xs">WhatsApp</span>
          </button>
          <button
            onClick={twitter}
            className="flex flex-col items-center gap-2 bg-zinc-800 hover:bg-zinc-700 rounded-2xl p-4 transition-colors"
            data-testid="btn-share-twitter"
          >
            <ExternalLink className="h-6 w-6 text-white" />
            <span className="text-white text-xs">Twitter/X</span>
          </button>
        </div>
        <p className="text-zinc-600 text-xs text-center mt-4">
          Sharing helps others avoid scams. Thank you!
        </p>
      </div>
    </div>
  );
}

interface ScamCardProps {
  report: ScamReport;
  isVisible: boolean;
  likedIds: Set<string>;
  onLike: (id: string) => void;
  onComment: (report: ScamReport) => void;
  onShare: (report: ScamReport) => void;
  onReport: (report: ScamReport) => void;
}

function ScamCard({ report, isVisible, likedIds, onLike, onComment, onShare, onReport }: ScamCardProps) {
  const flag = COUNTRY_FLAGS[report.country ?? ""] || "🌍";
  const isLiked = likedIds.has(report.id);
  const images = (report.evidenceImages ?? []).filter(Boolean);
  const [imgIdx, setImgIdx] = useState(0);
  const [zoomed, setZoomed] = useState(false);

  const isTrending = (report.likesCount ?? 0) >= 5;
  const isHighRisk = false;

  useEffect(() => {
    if (!isVisible) return;
    fetch(`/api/scam-wall/${report.id}/view`, { method: "POST" }).catch(() => {});
  }, [isVisible, report.id]);

  return (
    <div
      className="relative w-full h-full flex flex-col bg-black snap-start snap-always overflow-hidden"
      data-testid={`scam-card-${report.id}`}
    >
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/80 pointer-events-none z-10" />

      {/* Evidence image */}
      {images.length > 0 && (
        <div className="absolute inset-0">
          <img
            src={`/api/uploads/scam-evidence/${images[imgIdx]?.split("/").pop()}`}
            alt="Evidence"
            className="w-full h-full object-cover opacity-30"
            loading="lazy"
          />
          {images.length > 1 && (
            <>
              <button
                className="absolute left-2 top-1/2 -translate-y-1/2 z-20 bg-black/50 rounded-full p-1.5"
                onClick={() => setImgIdx(i => Math.max(0, i - 1))}
              >
                <ChevronLeft className="h-4 w-4 text-white" />
              </button>
              <button
                className="absolute right-14 top-1/2 -translate-y-1/2 z-20 bg-black/50 rounded-full p-1.5"
                onClick={() => setImgIdx(i => Math.min(images.length - 1, i + 1))}
              >
                <ChevronRight className="h-4 w-4 text-white" />
              </button>
              <div className="absolute top-4 right-16 z-20 flex gap-1">
                {images.map((_, i) => (
                  <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === imgIdx ? "bg-white" : "bg-white/40"}`} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* If no images, use a colored gradient bg */}
      {images.length === 0 && (
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-red-950/30 to-zinc-900" />
      )}

      {/* TOP: badges */}
      <div className="relative z-20 flex items-center gap-2 px-4 pt-14 pb-2">
        <span className="bg-red-600 text-white text-xs font-black px-2.5 py-1 rounded-full tracking-wide animate-pulse flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" /> SCAM ALERT
        </span>
        {isTrending && (
          <span className="bg-orange-500/90 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
            <Flame className="h-3 w-3" /> Trending
          </span>
        )}
        {report.isFeatured && (
          <span className="bg-yellow-500/90 text-black text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
            ⭐ Featured
          </span>
        )}
      </div>

      {/* MAIN CONTENT */}
      <div className="relative z-20 flex-1 flex flex-col justify-end px-4 pb-20">
        {/* Agency name */}
        <h1 className="text-white text-3xl font-black leading-tight tracking-tight drop-shadow-lg mb-1">
          {report.agencyName}
        </h1>

        {/* Country + views */}
        <div className="flex items-center gap-3 mb-3">
          {report.country && (
            <span className="text-white/80 text-sm font-medium">
              {flag} {report.country}
            </span>
          )}
          <span className="text-white/50 text-xs flex items-center gap-1">
            <Eye className="h-3 w-3" /> {(report.viewsCount ?? 0).toLocaleString()} views
          </span>
        </div>

        {/* Amount lost */}
        {report.amountLost && (
          <div className="mb-3">
            <span className="bg-red-600/90 text-white text-sm font-bold px-3 py-1.5 rounded-xl">
              💸 KES {report.amountLost.toLocaleString()} lost
            </span>
          </div>
        )}

        {/* Caption */}
        <p className="text-white/90 text-sm leading-relaxed line-clamp-4 mb-3 drop-shadow">
          {report.description}
        </p>

        {/* Report count label */}
        <p className="text-zinc-400 text-xs mb-1">
          ⚠️ User-submitted report · Not legally verified · {timeAgo(report.createdAt!)}
        </p>
      </div>

      {/* RIGHT SIDEBAR: engagement buttons */}
      <div className="absolute right-3 bottom-24 z-30 flex flex-col items-center gap-5">
        {/* Like */}
        <button
          className="flex flex-col items-center gap-1"
          onClick={() => onLike(report.id)}
          data-testid={`btn-like-${report.id}`}
        >
          <div className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 ${isLiked ? "bg-red-500 scale-110" : "bg-black/50"}`}>
            <Heart className={`h-5 w-5 ${isLiked ? "text-white fill-white" : "text-white"}`} />
          </div>
          <span className="text-white text-xs font-semibold drop-shadow">{(report.likesCount ?? 0).toLocaleString()}</span>
        </button>

        {/* Comment */}
        <button
          className="flex flex-col items-center gap-1"
          onClick={() => onComment(report)}
          data-testid={`btn-comment-${report.id}`}
        >
          <div className="w-11 h-11 rounded-full bg-black/50 flex items-center justify-center">
            <MessageCircle className="h-5 w-5 text-white" />
          </div>
          <span className="text-white text-xs font-semibold drop-shadow">Comment</span>
        </button>

        {/* Share */}
        <button
          className="flex flex-col items-center gap-1"
          onClick={() => onShare(report)}
          data-testid={`btn-share-${report.id}`}
        >
          <div className="w-11 h-11 rounded-full bg-black/50 flex items-center justify-center">
            <Share2 className="h-5 w-5 text-white" />
          </div>
          <span className="text-white text-xs font-semibold drop-shadow">Share</span>
        </button>

        {/* Report */}
        <button
          className="flex flex-col items-center gap-1"
          onClick={() => onReport(report)}
          data-testid={`btn-flag-${report.id}`}
        >
          <div className="w-11 h-11 rounded-full bg-black/50 flex items-center justify-center">
            <Flag className="h-5 w-5 text-white" />
          </div>
          <span className="text-white text-xs font-semibold drop-shadow">Report</span>
        </button>
      </div>

      {/* IMAGE zoom lightbox */}
      {zoomed && images.length > 0 && (
        <div
          className="absolute inset-0 z-50 bg-black flex items-center justify-center"
          onClick={() => setZoomed(false)}
        >
          <img
            src={`/api/uploads/scam-evidence/${images[imgIdx]?.split("/").pop()}`}
            alt="Evidence zoomed"
            className="max-w-full max-h-full object-contain"
          />
          <button className="absolute top-4 right-4 text-white bg-black/60 rounded-full p-2">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
      {images.length > 0 && (
        <button
          className="absolute bottom-28 left-4 z-20 bg-black/50 text-white text-xs px-2 py-1 rounded-lg flex items-center gap-1"
          onClick={() => setZoomed(true)}
        >
          📸 {images.length} photo{images.length > 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}

export default function ScamWall() {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [allReports, setAllReports] = useState<ScamReport[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [commentTarget, setCommentTarget] = useState<ScamReport | null>(null);
  const [shareTarget, setShareTarget] = useState<ScamReport | null>(null);
  const [visibleIdx, setVisibleIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const fingerprint = getFingerprint();

  const { data, isFetching } = useQuery<{ reports: ScamReport[]; total: number; pages: number }>({
    queryKey: ["/api/scam-wall", page],
    queryFn: () => fetch(`/api/scam-wall?page=${page}&limit=10`).then(r => r.json()),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (data?.reports) {
      setAllReports(prev => {
        const ids = new Set(prev.map(r => r.id));
        const newOnes = data.reports.filter(r => !ids.has(r.id));
        return [...prev, ...newOnes];
      });
    }
  }, [data]);

  const likeMutation = useMutation({
    mutationFn: async (reportId: string) => {
      const csrf = await fetch("/api/csrf-token").then(r => r.json()).then(d => d.token);
      return fetch(`/api/scam-wall/${reportId}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ fingerprint }),
      }).then(r => r.json()) as Promise<{ liked: boolean; likesCount: number }>;
    },
    onSuccess: (result, reportId) => {
      setLikedIds(prev => {
        const next = new Set(prev);
        result.liked ? next.add(reportId) : next.delete(reportId);
        return next;
      });
      setAllReports(prev => prev.map(r =>
        r.id === reportId ? { ...r, likesCount: result.likesCount } : r
      ));
    },
    onError: () => toast({ title: "Failed to update like", variant: "destructive" }),
  });

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const idx = Math.round(el.scrollTop / el.clientHeight);
    setVisibleIdx(idx);
    if (data && idx >= allReports.length - 3 && page < data.pages && !isFetching) {
      setPage(p => p + 1);
    }
  }, [allReports.length, data, page, isFetching]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  return (
    <div className="fixed inset-0 bg-black flex flex-col" data-testid="scam-wall-page">
      {/* TOP BAR */}
      <div className="absolute top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent">
        <Link href="/dashboard">
          <button className="text-white bg-black/40 rounded-full p-2" data-testid="btn-back-scam-wall">
            <ArrowLeft className="h-5 w-5" />
          </button>
        </Link>
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-red-500" />
          <span className="text-white font-black text-lg tracking-tight">🔥 Scam Wall</span>
        </div>
        <Link href="/report-scam">
          <button className="text-white bg-red-600 rounded-full p-2" data-testid="btn-add-report">
            <Plus className="h-5 w-5" />
          </button>
        </Link>
      </div>

      {/* FEED */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-scroll snap-y snap-mandatory"
        style={{ scrollSnapType: "y mandatory", WebkitOverflowScrolling: "touch" }}
        data-testid="scam-wall-feed"
      >
        {allReports.map((report, idx) => (
          <div key={report.id} className="w-full flex-shrink-0" style={{ height: "100dvh" }}>
            <ScamCard
              report={report}
              isVisible={visibleIdx === idx}
              likedIds={likedIds}
              onLike={id => likeMutation.mutate(id)}
              onComment={r => setCommentTarget(r)}
              onShare={r => setShareTarget(r)}
              onReport={() => window.location.href = "/report-scam"}
            />
          </div>
        ))}

        {/* Empty state */}
        {!isFetching && allReports.length === 0 && (
          <div className="w-full flex flex-col items-center justify-center text-center px-8" style={{ height: "100dvh" }}>
            <ShieldAlert className="h-16 w-16 text-red-500 mb-4" />
            <h2 className="text-white text-2xl font-black mb-2">No scam reports yet</h2>
            <p className="text-zinc-400 text-sm mb-6">
              Be the first to expose a scam agency and protect the community.
            </p>
            <Link href="/report-scam">
              <button className="bg-red-600 text-white font-bold px-6 py-3 rounded-2xl text-sm" data-testid="btn-empty-report">
                ⚠️ Report a Scam Agency
              </button>
            </Link>
          </div>
        )}

        {/* Loading more */}
        {isFetching && allReports.length > 0 && (
          <div className="w-full flex items-center justify-center" style={{ height: "100dvh" }}>
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-zinc-400 text-sm">Loading more reports…</p>
            </div>
          </div>
        )}

        {/* End of feed */}
        {!isFetching && allReports.length > 0 && data && page >= data.pages && (
          <div className="w-full flex flex-col items-center justify-center text-center px-8" style={{ height: "100dvh" }}>
            <span className="text-4xl mb-4">✅</span>
            <h3 className="text-white font-bold text-lg mb-2">You've seen all reports</h3>
            <p className="text-zinc-400 text-sm mb-6">Help others by reporting more scam agencies.</p>
            <Link href="/report-scam">
              <button className="bg-red-600 text-white font-bold px-6 py-3 rounded-2xl text-sm">
                ⚠️ Report a Scam Agency
              </button>
            </Link>
          </div>
        )}
      </div>

      {/* Scroll hint (only show on first load) */}
      {allReports.length > 0 && visibleIdx === 0 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center animate-bounce pointer-events-none">
          <span className="text-white/50 text-xs mb-1">Swipe up</span>
          <ChevronRight className="h-4 w-4 text-white/50 rotate-90" />
        </div>
      )}

      {/* Comments panel */}
      {commentTarget && (
        <CommentsPanel reportId={commentTarget.id} onClose={() => setCommentTarget(null)} />
      )}

      {/* Share panel */}
      {shareTarget && (
        <SharePanel report={shareTarget} onClose={() => setShareTarget(null)} />
      )}
    </div>
  );
}
