/**
 * /kazi-karibu/browse — location-first browsing (2026-11).
 * Type an estate/town/street or use your location, pick a radius,
 * list or map. Category from ?category= is pre-selected.
 */
import { Link } from "wouter";
import { ArrowLeft, Plus } from "lucide-react";
import { usePageSeo } from "@/hooks/use-page-seo";
import { KAZI_KARIBU_CATEGORIES } from "@shared/kazi-karibu";
import { NearbyJobsExplorer } from "@/components/nearby-jobs-explorer";
import { KaziJobCard, kkToPoint, type KkPost } from "@/components/kazi-job-card";

const KK_CATS = KAZI_KARIBU_CATEGORIES.map((c) => ({ id: c.id, label: `${c.emoji} ${c.label}` }));
const renderKk = (p: KkPost, d: string | null) => <KaziJobCard p={p} distance={d} />;

export default function KaziKaribuBrowse() {
  usePageSeo({
    title: "Kazi Karibu jobs near you — house help, fundis, drivers & more | WorkAbroad Hub",
    description: "Find local work near your estate or town in Kenya. See how far each job is, view it on a map, and call or WhatsApp the poster directly.",
    path: "/kazi-karibu/browse",
  });
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-6xl mx-auto px-4 pt-16 sm:pt-8 pb-10 space-y-4">
        <div className="flex items-center justify-between">
          <Link href="/kazi-karibu"><span className="inline-flex items-center gap-1 text-sm text-slate-600 cursor-pointer"><ArrowLeft className="h-4 w-4" />Kazi Karibu</span></Link>
          <Link href="/kazi-karibu/post"><span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 cursor-pointer"><Plus className="h-4 w-4" />Post a job</span></Link>
        </div>
        <NearbyJobsExplorer<KkPost> source="kk" categories={KK_CATS} defaultRadius={10}
          initialCategory={params.get("category") ?? "all"} initialQuery={params.get("q") ?? ""}
          title="Kazi near you" subtitle="Choose your area and a distance — we'll show real jobs around you."
          renderCard={renderKk} toPoint={kkToPoint} />
      </div>
    </div>
  );
}
