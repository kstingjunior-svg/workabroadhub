/** Kazi Karibu job card with distance + Call / WhatsApp (2026-11). */
import { useState } from "react";
import { Link } from "wouter";
import { MapPin, Phone, MessageCircle, Loader2, Users } from "lucide-react";
import { KAZI_KARIBU_CATEGORIES } from "@shared/kazi-karibu";
import type { MapPoint } from "@/components/jobs-map";
import { formatKm } from "@/lib/geo";
import { openJobUnlock, type UnlockJob } from "@/components/job-unlock-dialog";
import { showAfterContactTip } from "@/lib/after-contact-tip";

export interface KkPost {
  id: string; category: string; county: string; sub_county: string | null; title: string; description: string;
  budget_min_kes: number | null; budget_max_kes: number | null; budget_period: string | null; poster_display_name: string | null;
  employer_name?: string | null; posted_by_admin?: boolean; poster_shows_phone?: boolean; published_at: string;
  lat?: number | null; lng?: number | null; formatted_address?: string | null; estate?: string | null; town?: string | null;
  location_mode?: string | null; service_radius_km?: number | null; vacancies?: number | null; distance_km?: number | null;
}
const PERIOD: Record<string, string> = { hour: "/hour", day: "/day", month: "/month", project: " flat" };
export function kkPay(p: KkPost) {
  const a = p.budget_min_kes, b = p.budget_max_kes;
  if (!a && !b) return "Pay: negotiable";
  return `KES ${Number(a ?? b).toLocaleString()}${a && b && a !== b ? `–${Number(b).toLocaleString()}` : ""}${PERIOD[p.budget_period ?? ""] ?? ""}`;
}
export const kkPlace = (p: KkPost) => [p.estate ?? p.sub_county, p.town, p.county].filter((x, i, arr) => x && arr.indexOf(x) === i).join(", ");
export const kkToPoint = (p: KkPost): MapPoint | null => (p.lat == null || p.lng == null ? null : {
  id: p.id, lat: Number(p.lat), lng: Number(p.lng), title: p.title, employer: p.employer_name ?? p.poster_display_name,
  place: kkPlace(p), vacancies: p.vacancies ?? 1, distance: formatKm(p.distance_km), href: `/kazi-karibu/job/${p.id}`,
});
const DURATION: Record<string, string> = { permanent: "Permanent / ongoing", recurring_weekly: "Recurring weekly", one_off: "One-off job" };
/** Job details for the KES 1,000 unlock modal. */
export const kkUnlockJob = (p: KkPost & { duration?: string | null }): UnlockJob => ({
  employer: p.employer_name ?? p.poster_display_name, title: p.title, place: kkPlace(p),
  payMin: p.budget_min_kes, payMax: p.budget_max_kes, period: p.budget_period, type: DURATION[p.duration ?? ""] ?? null,
});
const norm = (raw: string | null) => {
  let d = String(raw ?? "").replace(/\D/g, ""); if (/^0[17]\d{8}$/.test(d)) d = "254" + d.slice(1); else if (/^[17]\d{8}$/.test(d)) d = "254" + d;
  return /^254\d{9}$/.test(d) ? d : null;
};

export function KaziJobCard({ p, distance }: { p: KkPost; distance: string | null }) {
  const cat = KAZI_KARIBU_CATEGORIES.find((c) => c.id === p.category);
  const [busy, setBusy] = useState<string | null>(null);
  async function contact(kind: "call" | "whatsapp") {
    setBusy(kind);
    try {
      const r = await fetch(`/api/kazi-karibu/posts/${p.id}/contact`, { credentials: "include", headers: { accept: "application/json" } });
      if (r.status === 401) { window.location.href = `/signup?redirect=${encodeURIComponent(window.location.pathname)}`; return; }
      const b = await r.json().catch(() => ({}));
      if (r.status === 402) { openJobUnlock(b, kkUnlockJob(p)); return; }
      if (!r.ok) { alert(b?.error ?? "Couldn't open the contact."); return; }
      const n = norm(b.phone);
      if (!n) { alert("This poster hasn't shared a phone number — open the job and tap “I'm interested”."); return; }
      showAfterContactTip("kazi");
      if (kind === "call") window.location.href = `tel:+${n}`;
      else window.open(`https://wa.me/${n}?text=${encodeURIComponent("Hello, I saw your job on WorkAbroadHub Kazi Karibu and I am interested. Kindly share more information.")}`, "_blank", "noopener");
    } finally { setBusy(null); }
  }
  return (
    <article className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex flex-col gap-2 h-full" data-testid={`kk-card-${p.id}`}>
      <div className="flex items-start justify-between gap-2">
        <Link href={`/kazi-karibu/job/${p.id}`}><h3 className="font-bold text-base leading-snug hover:underline cursor-pointer">{p.title}</h3></Link>
        {distance && <span className="shrink-0 text-xs font-bold text-blue-700 bg-blue-50 dark:bg-blue-950 dark:text-blue-200 rounded-full px-2 py-0.5" data-testid={`kk-distance-${p.id}`}>{distance}</span>}
      </div>
      <div className="text-sm text-slate-600 dark:text-slate-300">{p.employer_name ?? p.poster_display_name ?? "Local employer"}</div>
      <div className="text-sm text-slate-600 dark:text-slate-300 inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 shrink-0" />{kkPlace(p)}{p.location_mode === "service_area" ? ` · works within ${p.service_radius_km} km` : ""}</div>
      <div className="flex flex-wrap gap-1.5 text-xs">
        <span className="rounded-full bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 px-2 py-0.5 font-semibold">{kkPay(p)}</span>
        {cat && <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5">{cat.emoji} {cat.label}</span>}
        <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 inline-flex items-center gap-1"><Users className="h-3 w-3" />{p.vacancies ?? 1} needed</span>
      </div>
      <div className="flex flex-wrap gap-2 pt-1 mt-auto">
        {p.poster_shows_phone !== false && (<>
          <button onClick={() => contact("call")} className="h-9 px-3 rounded-full bg-emerald-600 text-white text-sm font-semibold inline-flex items-center gap-1.5">{busy === "call" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}Call</button>
          <button onClick={() => contact("whatsapp")} className="h-9 px-3 rounded-full bg-[#25D366] text-white text-sm font-semibold inline-flex items-center gap-1.5">{busy === "whatsapp" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}WhatsApp</button>
        </>)}
        <Link href={`/kazi-karibu/job/${p.id}`}><button className="h-9 px-3 rounded-full border border-slate-300 dark:border-slate-700 text-sm">View job</button></Link>
      </div>
    </article>
  );
}
