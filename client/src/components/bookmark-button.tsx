/**
 * <BookmarkButton /> — drop-in save/unsave button.
 *
 * Hits /api/bookmarks. Optimistic UI: the heart fills the moment you click,
 * and rolls back only if the server rejects. Idempotent on both ends — saving
 * the same item twice does nothing weird, unsaving an unsaved item is a no-op.
 *
 * Usage:
 *   <BookmarkButton
 *     itemType="visa_job"
 *     itemId={job.id}
 *     title={job.title}
 *     subtitle={`${job.employer} · ${job.city}, ${job.country}`}
 *     countryCode={job.countryCode}
 *     href={`/jobs/${job.id}`}
 *     meta={{ salary: job.salary, category: job.category }}
 *   />
 *
 * 2026-06 retention #5.
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";

interface BookmarkButtonProps {
  itemType: "visa_job" | "agency_job" | "portal" | "service" | "country";
  itemId: string;
  title: string;
  subtitle?: string;
  countryCode?: string;
  href?: string;
  meta?: Record<string, unknown>;
  /** Compact icon-only mode vs full label */
  variant?: "icon" | "labeled";
  className?: string;
}

export function BookmarkButton(props: BookmarkButtonProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [bookmarked, setBookmarked] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);

  // Initial check — single fast roundtrip, no React Query needed
  useEffect(() => {
    if (!user) {
      setBookmarked(false);
      return;
    }
    let cancelled = false;
    const url = `/api/bookmarks/check?type=${encodeURIComponent(props.itemType)}&itemId=${encodeURIComponent(props.itemId)}`;
    fetch(url, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { bookmarked: false }))
      .then((data) => { if (!cancelled) setBookmarked(!!data.bookmarked); })
      .catch(() => { if (!cancelled) setBookmarked(false); });
    return () => { cancelled = true; };
  }, [user, props.itemType, props.itemId]);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast({
        title: "Sign in to save",
        description: "Bookmarked jobs sync across all your devices.",
      });
      return;
    }
    if (pending) return;
    const next = !bookmarked;
    setBookmarked(next);
    setPending(true);
    try {
      if (next) {
        await apiRequest("POST", "/api/bookmarks", {
          itemType: props.itemType,
          itemId: props.itemId,
          title: props.title,
          subtitle: props.subtitle,
          countryCode: props.countryCode,
          href: props.href,
          meta: props.meta,
        });
      } else {
        await apiRequest("DELETE", "/api/bookmarks/by-item", {
          itemType: props.itemType,
          itemId: props.itemId,
        });
      }
      // Bust the /bookmarks list cache so the standalone page reflects the change
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
    } catch (err: any) {
      // Rollback
      setBookmarked(!next);
      toast({
        title: next ? "Couldn't save" : "Couldn't remove",
        description: err?.message ?? "Try again",
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  }

  const Icon = bookmarked ? BookmarkCheck : Bookmark;
  const labelOn  = "Saved";
  const labelOff = "Save";

  if (props.variant === "labeled") {
    return (
      <button
        type="button"
        onClick={toggle}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold border transition ${
          bookmarked
            ? "bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-200"
            : "bg-background border-border text-muted-foreground hover:border-amber-300 hover:text-amber-700"
        } ${props.className ?? ""}`}
        data-testid={`bookmark-${props.itemType}-${props.itemId}`}
        aria-pressed={!!bookmarked}
      >
        {pending
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <Icon className={`h-3.5 w-3.5 ${bookmarked ? "fill-amber-500 text-amber-600" : ""}`} />}
        {bookmarked ? labelOn : labelOff}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`inline-flex items-center justify-center p-1.5 rounded-md transition hover:bg-muted ${props.className ?? ""}`}
      data-testid={`bookmark-${props.itemType}-${props.itemId}`}
      aria-pressed={!!bookmarked}
      aria-label={bookmarked ? labelOn : labelOff}
      title={bookmarked ? labelOn : labelOff}
    >
      {pending
        ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        : <Icon className={`h-4 w-4 ${bookmarked ? "fill-amber-500 text-amber-600" : "text-muted-foreground"}`} />}
    </button>
  );
}
