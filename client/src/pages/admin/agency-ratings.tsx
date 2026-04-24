import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, Trash2, Search, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getAllAgencyRatings, deleteAgencyRating, type AgencyRating } from "@/lib/firebase-agency-ratings";

type RatingWithMeta = AgencyRating & { id: string; agencyKey: string };

function StarDisplay({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star
          key={n}
          className={`h-3.5 w-3.5 ${n <= rating ? "text-amber-400 fill-amber-400" : "text-gray-200 dark:text-gray-700 fill-gray-200 dark:fill-gray-700"}`}
        />
      ))}
    </div>
  );
}

const RATING_COLOR: Record<number, string> = {
  5: "bg-emerald-100 text-emerald-700 border-emerald-200",
  4: "bg-green-100 text-green-700 border-green-200",
  3: "bg-amber-100 text-amber-700 border-amber-200",
  2: "bg-orange-100 text-orange-700 border-orange-200",
  1: "bg-red-100 text-red-700 border-red-200",
};

export default function AdminAgencyRatingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: ratings, isLoading } = useQuery<RatingWithMeta[]>({
    queryKey: ["/admin/agency-ratings/all"],
    queryFn: () => getAllAgencyRatings(),
    refetchInterval: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: ({ licenseNumber, userId }: { licenseNumber: string; userId: string }) =>
      deleteAgencyRating(licenseNumber, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/admin/agency-ratings/all"] });
      toast({ title: "Rating deleted" });
    },
    onError: () => toast({ title: "Failed to delete rating", variant: "destructive" }),
  });

  const filtered = ratings?.filter(r => {
    const q = search.toLowerCase();
    return (
      r.licenseNumber?.toLowerCase().includes(q) ||
      r.agencyName?.toLowerCase().includes(q) ||
      r.userId?.toLowerCase().includes(q) ||
      r.comment?.toLowerCase().includes(q)
    );
  }) ?? [];

  const avgRating = ratings?.length
    ? Math.round((ratings.reduce((acc, r) => acc + r.rating, 0) / ratings.length) * 10) / 10
    : 0;

  const dist = [5, 4, 3, 2, 1].map(star => ({
    star,
    count: ratings?.filter(r => r.rating === star).length ?? 0,
  }));

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Agency Ratings</h1>
        <p className="text-sm text-muted-foreground mt-1">User-submitted ratings stored in Firebase Realtime Database</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-amber-500">{avgRating || "—"}</p>
            <div className="flex justify-center mt-1">
              {avgRating > 0 && <StarDisplay rating={Math.round(avgRating)} />}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Average Rating</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold">{ratings?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Ratings</p>
          </CardContent>
        </Card>
        {dist.slice(0, 2).map(({ star, count }) => (
          <Card key={star}>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold">{count}</p>
              <div className="flex items-center justify-center gap-1 mt-1">
                <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                <span className="text-xs text-muted-foreground">{star} star{star > 1 ? "s" : ""}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Distribution bar */}
      {ratings && ratings.length > 0 && (
        <Card>
          <CardContent className="p-5 space-y-2">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">Rating Distribution</p>
            {dist.map(({ star, count }) => {
              const pct = ratings.length > 0 ? Math.round((count / ratings.length) * 100) : 0;
              return (
                <div key={star} className="flex items-center gap-3">
                  <div className="flex items-center gap-1 w-16 shrink-0">
                    <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                    <span className="text-xs text-muted-foreground">{star}</span>
                  </div>
                  <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-10 text-right">{count}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Ratings table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-base">All Ratings</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search agency, user, comment…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
                data-testid="input-search-ratings"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground text-sm">
              {search ? "No ratings match your search." : "No agency ratings yet."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900/40">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Agency</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Rating</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Comment</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">User</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Date</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map((r, idx) => (
                  <tr
                    key={`${r.agencyKey}-${r.id}`}
                    className={idx % 2 === 0 ? "" : "bg-gray-50/30 dark:bg-gray-900/10"}
                    data-testid={`rating-row-${idx}`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800 dark:text-gray-200 text-xs leading-snug max-w-[160px] truncate">
                        {r.agencyName ?? "—"}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">{r.licenseNumber}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <StarDisplay rating={r.rating} />
                        <Badge variant="outline" className={`text-xs px-1.5 py-0 ${RATING_COLOR[r.rating]}`}>
                          {r.rating}/5
                        </Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-[220px]">
                      {r.comment ? (
                        <div className="flex items-start gap-1.5">
                          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                          <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2">{r.comment}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">No comment</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-mono text-muted-foreground max-w-[100px] truncate" title={r.userId}>
                        {r.userId}
                      </p>
                      {r.verifiedUser && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0 bg-blue-50 text-blue-600 border-blue-200 mt-0.5">
                          Verified
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(r.timestamp).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        onClick={() => deleteMutation.mutate({ licenseNumber: r.licenseNumber, userId: r.id })}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-rating-${idx}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
