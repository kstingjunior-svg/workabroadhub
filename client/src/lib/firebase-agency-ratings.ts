import {
  ref, set, get, remove, onValue, query, orderByChild,
} from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { useEffect, useState } from "react";

export interface AgencyRating {
  rating: number;
  comment: string;
  userId: string;
  verifiedUser: boolean;
  licenseNumber: string;
  agencyName?: string;
  timestamp: number;
}

export interface AgencyRatingSummary {
  average: number;
  count: number;
}

// Submit or update a rating — one per user per agency (keyed by userId)
export async function submitAgencyRating(
  licenseNumber: string,
  rating: number,
  comment: string,
  userId: string,
  agencyName?: string,
): Promise<void> {
  const safeKey = licenseNumber.replace(/\//g, "_");
  await set(ref(rtdb, `agencyRatings/${safeKey}/${userId}`), {
    rating,
    comment: comment.trim(),
    userId,
    verifiedUser: true,
    licenseNumber,
    agencyName: agencyName ?? null,
    timestamp: Date.now(),
  });
}

// Read a single user's rating for an agency
export async function getUserRating(
  licenseNumber: string,
  userId: string,
): Promise<AgencyRating | null> {
  const safeKey = licenseNumber.replace(/\//g, "_");
  const snap = await get(ref(rtdb, `agencyRatings/${safeKey}/${userId}`));
  if (!snap.exists()) return null;
  return snap.val() as AgencyRating;
}

// Delete a rating (admin action)
export async function deleteAgencyRating(
  licenseNumber: string,
  userId: string,
): Promise<void> {
  const safeKey = licenseNumber.replace(/\//g, "_");
  await remove(ref(rtdb, `agencyRatings/${safeKey}/${userId}`));
}

// Hook: live aggregate rating for an agency card
export function useAgencyRatingSummary(licenseNumber: string | null | undefined): AgencyRatingSummary {
  const [summary, setSummary] = useState<AgencyRatingSummary>({ average: 0, count: 0 });

  useEffect(() => {
    if (!licenseNumber) return;
    const safeKey = licenseNumber.replace(/\//g, "_");
    const unsub = onValue(ref(rtdb, `agencyRatings/${safeKey}`), (snap) => {
      if (!snap.exists()) {
        setSummary({ average: 0, count: 0 });
        return;
      }
      const vals = Object.values(snap.val() as Record<string, AgencyRating>);
      const count = vals.length;
      const average = vals.reduce((acc, v) => acc + v.rating, 0) / count;
      setSummary({ average: Math.round(average * 10) / 10, count });
    });
    return () => unsub();
  }, [licenseNumber]);

  return summary;
}

// Hook: current user's existing rating for an agency
export function useUserAgencyRating(
  licenseNumber: string | null | undefined,
  userId: string | null | undefined,
): AgencyRating | null {
  const [rating, setRating] = useState<AgencyRating | null>(null);

  useEffect(() => {
    if (!licenseNumber || !userId) return;
    const safeKey = licenseNumber.replace(/\//g, "_");
    const unsub = onValue(ref(rtdb, `agencyRatings/${safeKey}/${userId}`), (snap) => {
      setRating(snap.exists() ? (snap.val() as AgencyRating) : null);
    });
    return () => unsub();
  }, [licenseNumber, userId]);

  return rating;
}

// Admin: get all ratings across all agencies, flat list
export async function getAllAgencyRatings(): Promise<Array<AgencyRating & { id: string; agencyKey: string }>> {
  const snap = await get(ref(rtdb, "agencyRatings"));
  if (!snap.exists()) return [];
  const results: Array<AgencyRating & { id: string; agencyKey: string }> = [];
  const all = snap.val() as Record<string, Record<string, AgencyRating>>;
  for (const [agencyKey, userRatings] of Object.entries(all)) {
    for (const [userId, rating] of Object.entries(userRatings)) {
      results.push({ ...rating, id: userId, agencyKey });
    }
  }
  return results.sort((a, b) => b.timestamp - a.timestamp);
}
