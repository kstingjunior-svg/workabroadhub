/**
 * /bookmarks — saved jobs, portals, and services.
 *
 * Grouped by type with quick filter chips. Each row is tappable (jumps to
 * the bookmark's `href`) and has an X to remove. Empty state nudges users
 * to start saving from anywhere on the site.
 *
 * 2026-06 retention #5.
 */
import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Bookmark, BookmarkCheck, ArrowRight, X, Briefcase, Globe, Sparkles, MapPin,
  Building2, Calendar,
} from "lucide-react";

interface BookmarkRow {
  id: string;
  itemType: "visa_job" | "agency_job" | "portal" | "service" | "country";
  itemId: string;
  title: string;
  subtitle: string | null;
  countryCode: string | null;
  href: string | null;
  meta: Record<string, any> | null;
  createdAt: string;
}

const TYPE_META: Record<string, { label: string; icon: any; color: string }> = {
  visa_job:   { label: "Visa Jobs",   icon: Briefcase, color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  agency_job: { label: "Agency Jobs", icon: Building2, color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
  portal:     { label: "Job Portals", icon: Globe,     color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300" },
  service:    { label: "Services",    icon: Sparkles,  color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
  country:    { label: "Countries",   icon: MapPin,    color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
};

const COUNTRY_FLAG: Record<string, string> = {
  AE: "🇦🇪", SA: "🇸🇦", QA: "🇶🇦", BH: "🇧🇭",
  GB: "🇬🇧", CA: "🇨🇦", AU: "🇦🇺", DE: "🇩🇪", US: "🇺🇸",
};

function humanAgo(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)} min ago`;
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)} hr ago`;
  if (ms < 7 * 86400_000) return `${Math.floor(ms / 86400_000)} day${Math.floor(ms / 86400_000) === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-KE");
}

export default function BookmarksPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const { data: bookmarks = [], isLoading } = useQuery<BookmarkRow[]>({
    queryKey: ["/api/bookmarks"],
    enabled: !!user,
    retry: false,
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/bookmarks/${encodeURIComponent(id)}`);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["/api/bookmarks"] });
      const prev = queryClient.getQueryData<BookmarkRow[]>(["/api/bookmarks"]);
      if (prev) queryClient.setQueryData(["/api/bookmarks"], prev.filter((r) => r.id !== id));
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["/api/bookmarks"], ctx.prev);
      toast({ title: "Couldn't remove", variant: "destructive" });
    },
  });

  // Group + count by type for the filter chips
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bookmarks) m.set(b.itemType, (m.get(b.itemType) ?? 0) + 1);
    return m;
  }, [bookmarks]);

  const filtered = activeFilter
    ? bookmarks.filter((b) => b.itemType === activeFilter)
    : bookmarks;

  // ── Auth gate ───────────────────────────────────────────────────────────
  if (!authLoading && !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md"><CardContent className="p-6 text-center">
          <Bookmark className="h-10 w-10 mx-auto mb-3 text-primary" />
          <h2 className="text-xl font-bold mb-2">Sign in to see your saved jobs</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Bookmarks sync across every device you sign in on.
          </p>
          <Button onClick={() => navigate("/?redirect=" + encodeURIComponent("/bookmarks"))}>Sign in</Button>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-5">
          <div className="inline-flex items-center gap-2 text-primary mb-1">
            <BookmarkCheck className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wider">Saved for later</span>
          </div>
          <h1 className="text-2xl font-bold">Your bookmarks</h1>
          <p className="text-sm text-muted-foreground">
            {bookmarks.length === 0
              ? "Save jobs, portals, and services from anywhere on the site."
              : `${bookmarks.length} saved · last added ${humanAgo(bookmarks[0]?.createdAt ?? null)}`}
          </p>
        </div>

        {/* Filter chips */}
        {bookmarks.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            <FilterChip
              active={activeFilter === null}
              onClick={() => setActiveFilter(null)}
              label={`All (${bookmarks.length})`}
            />
            {Array.from(counts.entries()).map(([type, n]) => {
              const meta = TYPE_META[type];
              if (!meta) return null;
              return (
                <FilterChip
                  key={type}
                  active={activeFilter === type}
                  onClick={() => setActiveFilter((cur) => (cur === type ? null : type))}
                  label={`${meta.label} (${n})`}
                  icon={meta.icon}
                />
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && bookmarks.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center">
              <Bookmark className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <h3 className="font-bold mb-1">No bookmarks yet</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                Tap the bookmark icon on any job, portal, or service to save it here.
                Bookmarks survive across devices.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                <Link href="/dashboard"><Button variant="outline" size="sm">Browse jobs</Button></Link>
                <Link href="/services"><Button variant="outline" size="sm">Browse services</Button></Link>
                <Link href="/journey"><Button variant="outline" size="sm">Pick a country</Button></Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bookmark list */}
        {filtered.length > 0 && (
          <div className="space-y-2">
            {filtered.map((b) => (
              <BookmarkCard key={b.id} bookmark={b} onRemove={() => removeMutation.mutate(b.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

function FilterChip({ active, onClick, label, icon: Icon }: { active: boolean; onClick: () => void; label: string; icon?: any }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition inline-flex items-center gap-1.5 ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
      }`}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {label}
    </button>
  );
}

function BookmarkCard({ bookmark, onRemove }: { bookmark: BookmarkRow; onRemove: () => void }) {
  const meta = TYPE_META[bookmark.itemType];
  const Icon = meta?.icon ?? Bookmark;
  const flag = bookmark.countryCode ? COUNTRY_FLAG[bookmark.countryCode] : null;

  // For external job-portal bookmarks, open the resolved /api/go/job route
  // (which leads through the existing redirect handler — keeps Pro gates intact).
  const inner = (
    <Card
      className="hover:shadow-md transition-all cursor-pointer overflow-hidden"
      data-testid={`bookmark-row-${bookmark.id}`}
    >
      <CardContent className="p-3 flex items-start gap-3">
        <div className={`shrink-0 p-2 rounded-md ${meta?.color ?? "bg-muted"}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            {flag && <span className="text-base">{flag}</span>}
            <h3 className="font-bold text-sm leading-tight line-clamp-1">{bookmark.title}</h3>
          </div>
          {bookmark.subtitle && (
            <p className="text-xs text-muted-foreground line-clamp-1">{bookmark.subtitle}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            <Badge className={`text-[10px] ${meta?.color ?? ""}`}>{meta?.label ?? bookmark.itemType}</Badge>
            <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
              <Calendar className="h-2.5 w-2.5" />
              {humanAgo(bookmark.createdAt)}
            </span>
          </div>
        </div>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
          className="shrink-0 p-1 rounded hover:bg-muted text-muted-foreground hover:text-rose-600 transition"
          aria-label="Remove bookmark"
          data-testid={`remove-bookmark-${bookmark.id}`}
        >
          <X className="h-4 w-4" />
        </button>
      </CardContent>
    </Card>
  );

  if (bookmark.href) {
    // External-looking links (full URLs) open in new tab; internal app paths
    // use wouter Link.
    if (/^https?:\/\//.test(bookmark.href)) {
      return (
        <a href={bookmark.href} target="_blank" rel="noopener noreferrer">
          {inner}
        </a>
      );
    }
    return <Link href={bookmark.href}>{inner}</Link>;
  }
  return inner;
}
