/**
 * Dashboard widget — small chip showing total saved items with a quick link
 * to the bookmarks page. Hides itself when the user has zero saves.
 *
 * 2026-06 retention #5.
 */
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { BookmarkCheck, ArrowRight } from "lucide-react";

interface BookmarkRow {
  id: string;
  itemType: string;
}

export function DashboardBookmarksCard() {
  const { user } = useAuth();
  const { data: bookmarks = [] } = useQuery<BookmarkRow[]>({
    queryKey: ["/api/bookmarks"],
    enabled: !!user,
    staleTime: 60_000,
    retry: false,
  });

  if (bookmarks.length === 0) return null;

  // Count distinct types for the subhead
  const distinctTypes = new Set(bookmarks.map((b) => b.itemType)).size;

  return (
    <Link href="/bookmarks">
      <Card
        className="mb-4 cursor-pointer hover:shadow-md transition-all overflow-hidden bg-gradient-to-br from-amber-500/10 via-yellow-500/10 to-orange-500/10 border-amber-200 dark:border-amber-900"
        data-testid="card-bookmarks"
      >
        <CardContent className="p-4 flex items-center gap-3">
          <div className="shrink-0 p-2.5 rounded-full bg-amber-100 dark:bg-amber-900/30">
            <BookmarkCheck className="h-5 w-5 text-amber-700 dark:text-amber-300" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm mb-0.5">
              {bookmarks.length} saved {bookmarks.length === 1 ? "item" : "items"}
            </div>
            <div className="text-xs text-muted-foreground line-clamp-1">
              Across {distinctTypes} {distinctTypes === 1 ? "category" : "categories"} · tap to review
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </CardContent>
      </Card>
    </Link>
  );
}
