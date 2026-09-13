// /employers — Employer Reputation Layer directory (Phase 1 of the "Direct
// Hire Exchange" concept). A public, worker-authored rating system for
// overseas EMPLOYERS (as distinct from /agencies, which rates NEA-licensed
// Kenyan recruitment agencies). Crowd-sourced: anyone can add an employer
// and rate it; there's no government registry to seed from.
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { usePageSeo } from "@/hooks/use-page-seo";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RateEmployerModal } from "@/components/rate-employer-modal";
import {
  Search, Star, MapPin, Building2, Plus, ShieldCheck, Users,
} from "lucide-react";
import {
  useEmployerDirectory, slugifyEmployer,
} from "@/lib/firebase-employer-ratings";

function StarRow({ average, size = "h-4 w-4" }: { average: number; size?: string }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star
          key={n}
          className={`${size} ${
            n <= Math.round(average)
              ? "text-amber-400 fill-amber-400"
              : "text-gray-200 dark:text-gray-700 fill-gray-200 dark:fill-gray-700"
          }`}
        />
      ))}
    </div>
  );
}

export default function EmployersDirectoryPage() {
  usePageSeo({
    title: "Employer Reviews — Rate Overseas Employers | WorkAbroad Hub",
    description: "Worker-written reviews of overseas employers: pay-on-time, housing as promised, and treatment. See what past and current employees say before you accept a job abroad.",
    path: "/employers",
    keywords: ["overseas employer reviews", "rate my employer abroad", "employer reputation kenya", "is this employer legit"],
  });

  const { employers, loading } = useEmployerDirectory();
  const [search, setSearch] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCountry, setNewCountry] = useState("");
  const [modalTarget, setModalTarget] = useState<{ slug: string; name: string; country: string } | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = !q
      ? employers
      : employers.filter(e =>
          e.name.toLowerCase().includes(q) ||
          e.country.toLowerCase().includes(q) ||
          (e.sector ?? "").toLowerCase().includes(q)
        );
    return [...list].sort((a, b) => b.summary.count - a.summary.count || b.summary.average - a.summary.average);
  }, [employers, search]);

  function startAddAndRate() {
    if (!newName.trim() || !newCountry.trim()) return;
    const slug = slugifyEmployer(newName, newCountry);
    const target = { slug, name: newName.trim(), country: newCountry.trim() };
    setAddOpen(false);
    // Deferred to the next tick: opening the RateEmployerModal's Radix
    // Dialog in the *same* click that closes this quick-add overlay causes
    // Radix's dismissable-layer "outside click" detection to catch the
    // tail of that same click event and immediately close the new dialog.
    // Letting the current event finish first avoids that race.
    setTimeout(() => setModalTarget(target), 0);
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-primary text-primary-foreground py-12 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-3xl font-bold mb-2">Employer Reviews</h1>
          <p className="text-primary-foreground/80 mb-6 max-w-2xl mx-auto">
            Worker-written reviews of the companies and households that actually pay wages and provide housing abroad —
            not the agencies that place you with them. Did they pay on time? Was housing as promised? Were you treated with respect?
          </p>
          <div className="relative max-w-xl mx-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 bg-white text-foreground"
              placeholder="Search by employer name, country, or sector..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-employer-search"
            />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground" data-testid="text-employer-count">
            {loading ? "Loading..." : `${filtered.length} employer${filtered.length !== 1 ? "s" : ""}`}
          </p>
          <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5" data-testid="btn-add-employer">
            <Plus className="h-4 w-4" /> Add an employer
          </Button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No employers found</p>
            <p className="text-sm mt-1">Be the first to add and review one.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(e => (
              <Card key={e.slug} className="hover:shadow-md transition-shadow" data-testid={`employer-card-${e.slug}`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/employers/${e.slug}`}>
                        <a className="font-semibold text-base hover:underline truncate block" data-testid={`employer-name-${e.slug}`}>
                          {e.name}
                        </a>
                      </Link>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" /> {e.country}
                        </span>
                        {e.sector && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5" /> {e.sector}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        {e.summary.count > 0 ? (
                          <>
                            <StarRow average={e.summary.average} />
                            <span className="text-sm font-medium">{e.summary.average.toFixed(1)}</span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Users className="h-3 w-3" /> {e.summary.count} review{e.summary.count !== 1 ? "s" : ""}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">No reviews yet — be the first</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <Link href={`/employers/${e.slug}`}>
                        <Button size="sm" variant="outline" data-testid={`btn-view-employer-${e.slug}`}>View</Button>
                      </Link>
                      <Button
                        size="sm"
                        onClick={() => setModalTarget({ slug: e.slug, name: e.name, country: e.country })}
                        data-testid={`btn-rate-employer-${e.slug}`}
                      >
                        Rate
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="mt-12 p-6 border rounded-xl bg-muted/50 text-center">
          <ShieldCheck className="h-8 w-8 mx-auto mb-2 text-primary" />
          <h3 className="font-semibold mb-1">Reviews are written by workers, for workers</h3>
          <p className="text-sm text-muted-foreground">
            Only accounts at least 7 days old can leave a rating — the same rule that protects our agency ratings from fake reviews.
          </p>
        </div>
      </div>

      {/* Quick-add dialog: name + country, then straight into the rating modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setAddOpen(false)}>
          <Card className="w-full max-w-sm" onClick={(ev) => ev.stopPropagation()}>
            <CardContent className="p-5 space-y-3">
              <h3 className="font-semibold">Add an employer</h3>
              <Input
                placeholder="Employer name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                data-testid="input-new-employer-name"
              />
              <Input
                placeholder="Country (e.g. Saudi Arabia)"
                value={newCountry}
                onChange={e => setNewCountry(e.target.value)}
                data-testid="input-new-employer-country"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button onClick={startAddAndRate} disabled={!newName.trim() || !newCountry.trim()} data-testid="btn-confirm-add-employer">
                  Continue to review
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {modalTarget && (
        <RateEmployerModal
          open={!!modalTarget}
          onOpenChange={(o) => !o && setModalTarget(null)}
          slug={modalTarget.slug}
          employerName={modalTarget.name}
          country={modalTarget.country}
        />
      )}
    </div>
  );
}
