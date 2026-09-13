// Employer Reputation Layer — Phase 1 of the "Direct Hire Exchange" concept.
//
// Modeled directly on lib/firebase-agency-ratings.ts (which rates licensed
// recruitment AGENCIES). This file rates overseas EMPLOYERS instead — the
// companies/households abroad that actually pay wages and provide housing.
// Same storage engine (Firebase RTDB), same one-rating-per-user shape, same
// eligibility gate (GET /api/agencies/rating-eligibility — it's a pure
// account-age check with no agency/employer-specific logic, so it's shared
// across both features rather than duplicated).
//
// Employers are crowd-sourced (there is no government registry of overseas
// employers the way there is for NEA-licensed agencies), so this file also
// owns the lightweight employer directory itself: `employers/{slug}`.
import {
  ref, set, get, remove, onValue,
} from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { useEffect, useState } from "react";

export interface EmployerDirectoryEntry {
  slug: string;
  name: string;
  country: string;
  sector?: string | null;
  createdAt: number;
}

export type EmploymentStatus = "current" | "former";

export interface EmployerRating {
  ratingOverall: number;       // 1-5, required
  ratingPayOnTime: number;     // 1-5, required
  ratingHousing: number | null; // 1-5, or null if "not applicable / no housing provided"
  ratingTreatment: number;     // 1-5, required
  comment: string;
  employmentStatus: EmploymentStatus;
  jobTitle?: string;
  userId: string;
  verifiedUser: boolean;
  timestamp: number;
}

export interface EmployerRatingSummary {
  average: number;
  count: number;
  avgPayOnTime: number;
  avgHousing: number | null;
  avgTreatment: number;
}

// Turn "Al Fahad Trading LLC" + "United Arab Emirates" into a stable,
// collision-resistant RTDB key. This is the entirety of the v1 dedupe
// strategy: two submissions that normalize to the same slug are the same
// employer record. An admin merge tool for near-duplicates (different
// spelling, same company) is future work — see the MVP roadmap, Phase 1.
export function slugifyEmployer(name: string, country: string): string {
  const norm = (s: string) =>
    s.trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const namePart = norm(name).slice(0, 80) || "employer";
  const countryPart = norm(country).slice(0, 40) || "unknown";
  return `${namePart}__${countryPart}`;
}

// Create the directory entry if it doesn't exist yet. Safe to call every
// time a user rates an employer — never overwrites an existing entry's
// createdAt/name, since a later reviewer's spelling shouldn't reset it.
export async function ensureEmployerDirectoryEntry(
  slug: string,
  name: string,
  country: string,
  sector?: string,
): Promise<void> {
  if (!rtdb) throw new Error("Realtime features are not configured for this deployment.");
  const entryRef = ref(rtdb, `employers/${slug}`);
  const snap = await get(entryRef);
  if (snap.exists()) return;
  const entry: EmployerDirectoryEntry = {
    slug,
    name: name.trim().slice(0, 255),
    country: country.trim().slice(0, 100),
    sector: sector?.trim().slice(0, 100) || null,
    createdAt: Date.now(),
  };
  await set(entryRef, entry);
}

export async function getEmployer(slug: string): Promise<EmployerDirectoryEntry | null> {
  if (!rtdb) return null;
  const snap = await get(ref(rtdb, `employers/${slug}`));
  return snap.exists() ? (snap.val() as EmployerDirectoryEntry) : null;
}

export async function listEmployers(): Promise<EmployerDirectoryEntry[]> {
  if (!rtdb) return [];
  const snap = await get(ref(rtdb, "employers"));
  if (!snap.exists()) return [];
  return Object.values(snap.val() as Record<string, EmployerDirectoryEntry>);
}

// Submit or update a rating — one per user per employer (keyed by userId),
// same shape as submitAgencyRating.
export async function submitEmployerRating(
  slug: string,
  data: {
    ratingOverall: number;
    ratingPayOnTime: number;
    ratingHousing: number | null;
    ratingTreatment: number;
    comment: string;
    employmentStatus: EmploymentStatus;
    jobTitle?: string;
  },
  userId: string,
): Promise<void> {
  if (!rtdb) throw new Error("Realtime features are not configured for this deployment.");
  const rating: EmployerRating = {
    ratingOverall: data.ratingOverall,
    ratingPayOnTime: data.ratingPayOnTime,
    ratingHousing: data.ratingHousing,
    ratingTreatment: data.ratingTreatment,
    comment: data.comment.trim().slice(0, 500),
    employmentStatus: data.employmentStatus,
    jobTitle: data.jobTitle?.trim().slice(0, 150) || undefined,
    userId,
    verifiedUser: true,
    timestamp: Date.now(),
  };
  await set(ref(rtdb, `employerRatings/${slug}/${userId}`), rating);
}

export async function getUserEmployerRating(
  slug: string,
  userId: string,
): Promise<EmployerRating | null> {
  if (!rtdb) return null;
  const snap = await get(ref(rtdb, `employerRatings/${slug}/${userId}`));
  return snap.exists() ? (snap.val() as EmployerRating) : null;
}

// Admin action: remove a single abusive/fake rating.
export async function deleteEmployerRating(slug: string, userId: string): Promise<void> {
  if (!rtdb) throw new Error("Realtime features are not configured for this deployment.");
  await remove(ref(rtdb, `employerRatings/${slug}/${userId}`));
}

function summarize(vals: EmployerRating[]): EmployerRatingSummary {
  const count = vals.length;
  if (count === 0) return { average: 0, count: 0, avgPayOnTime: 0, avgHousing: null, avgTreatment: 0 };
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const average = round1(vals.reduce((a, v) => a + v.ratingOverall, 0) / count);
  const avgPayOnTime = round1(vals.reduce((a, v) => a + v.ratingPayOnTime, 0) / count);
  const avgTreatment = round1(vals.reduce((a, v) => a + v.ratingTreatment, 0) / count);
  const housingVals = vals.filter(v => v.ratingHousing != null).map(v => v.ratingHousing as number);
  const avgHousing = housingVals.length > 0 ? round1(housingVals.reduce((a, v) => a + v, 0) / housingVals.length) : null;
  return { average, count, avgPayOnTime, avgHousing, avgTreatment };
}

// Hook: live aggregate rating for an employer card/profile.
export function useEmployerRatingSummary(slug: string | null | undefined): EmployerRatingSummary {
  const [summary, setSummary] = useState<EmployerRatingSummary>({
    average: 0, count: 0, avgPayOnTime: 0, avgHousing: null, avgTreatment: 0,
  });

  useEffect(() => {
    if (!rtdb || !slug) return;
    const unsub = onValue(ref(rtdb, `employerRatings/${slug}`), (snap) => {
      if (!snap.exists()) {
        setSummary({ average: 0, count: 0, avgPayOnTime: 0, avgHousing: null, avgTreatment: 0 });
        return;
      }
      setSummary(summarize(Object.values(snap.val() as Record<string, EmployerRating>)));
    });
    return () => unsub();
  }, [slug]);

  return summary;
}

// Hook: live list of individual reviews for an employer profile page.
export function useEmployerReviews(slug: string | null | undefined): EmployerRating[] {
  const [reviews, setReviews] = useState<EmployerRating[]>([]);

  useEffect(() => {
    if (!rtdb || !slug) return;
    const unsub = onValue(ref(rtdb, `employerRatings/${slug}`), (snap) => {
      if (!snap.exists()) { setReviews([]); return; }
      const vals = Object.values(snap.val() as Record<string, EmployerRating>);
      setReviews(vals.sort((a, b) => b.timestamp - a.timestamp));
    });
    return () => unsub();
  }, [slug]);

  return reviews;
}

// Hook: current user's existing rating for an employer (pre-fills the modal).
export function useUserEmployerRating(
  slug: string | null | undefined,
  userId: string | null | undefined,
): EmployerRating | null {
  const [rating, setRating] = useState<EmployerRating | null>(null);

  useEffect(() => {
    if (!rtdb || !slug || !userId) return;
    const unsub = onValue(ref(rtdb, `employerRatings/${slug}/${userId}`), (snap) => {
      setRating(snap.exists() ? (snap.val() as EmployerRating) : null);
    });
    return () => unsub();
  }, [slug, userId]);

  return rating;
}

// Hook: live directory list + per-employer summaries, for the /employers
// search page. Firebase RTDB has no server-side aggregation, so summaries
// are computed client-side from the full ratings tree — fine at this
// dataset's expected size (hundreds to low thousands of employers).
export function useEmployerDirectory(): {
  employers: (EmployerDirectoryEntry & { summary: EmployerRatingSummary })[];
  loading: boolean;
} {
  const [employers, setEmployers] = useState<EmployerDirectoryEntry[]>([]);
  const [ratingsByEmployer, setRatingsByEmployer] = useState<Record<string, EmployerRating[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!rtdb) { setLoading(false); return; }
    const unsubDir = onValue(ref(rtdb, "employers"), (snap) => {
      setEmployers(snap.exists() ? Object.values(snap.val() as Record<string, EmployerDirectoryEntry>) : []);
      setLoading(false);
    });
    const unsubRatings = onValue(ref(rtdb, "employerRatings"), (snap) => {
      if (!snap.exists()) { setRatingsByEmployer({}); return; }
      const all = snap.val() as Record<string, Record<string, EmployerRating>>;
      const out: Record<string, EmployerRating[]> = {};
      for (const [slug, userRatings] of Object.entries(all)) {
        out[slug] = Object.values(userRatings);
      }
      setRatingsByEmployer(out);
    });
    return () => { unsubDir(); unsubRatings(); };
  }, []);

  return {
    employers: employers.map(e => ({ ...e, summary: summarize(ratingsByEmployer[e.slug] ?? []) })),
    loading,
  };
}

// Admin: flat list of every employer rating, for abuse review.
export async function getAllEmployerRatings(): Promise<Array<EmployerRating & { id: string; employerSlug: string }>> {
  if (!rtdb) return [];
  const snap = await get(ref(rtdb, "employerRatings"));
  if (!snap.exists()) return [];
  const results: Array<EmployerRating & { id: string; employerSlug: string }> = [];
  const all = snap.val() as Record<string, Record<string, EmployerRating>>;
  for (const [employerSlug, userRatings] of Object.entries(all)) {
    for (const [userId, rating] of Object.entries(userRatings)) {
      results.push({ ...rating, id: userId, employerSlug });
    }
  }
  return results.sort((a, b) => b.timestamp - a.timestamp);
}
