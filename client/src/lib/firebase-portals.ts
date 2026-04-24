import {
  ref, push, get, onValue, runTransaction, update, remove, serverTimestamp,
} from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { useEffect, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────
export type PortalStatus = "pending_review" | "approved" | "rejected";

export interface SubmittedPortal {
  id: string;
  url: string;
  name: string;
  country: string;
  description: string;
  submittedBy: string;
  status: PortalStatus;
  upvotes: number;
  downvotes: number;
  timestamp: number;
}

// ── Visitor ID ─────────────────────────────────────────────────────────────────
// Reuse the same anonymous ID from presence tracking
export function getVisitorId(): string {
  const KEY = "wah_visitor_id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(KEY, id);
  }
  return id;
}

// ── Submit a portal for community review ───────────────────────────────────────
export async function submitPortalForVerification(
  url: string,
  name: string,
  country: string,
  description: string,
): Promise<void> {
  const visitorId = getVisitorId();
  await push(ref(rtdb, "submittedPortals"), {
    url: url.trim(),
    name: name.trim(),
    country: country.trim(),
    description: description.trim(),
    submittedBy: visitorId,
    status: "pending_review" as PortalStatus,
    upvotes: 0,
    downvotes: 0,
    timestamp: Date.now(),
  });
}

// ── Community vote (transaction-safe) ─────────────────────────────────────────
export async function votePortal(
  submissionId: string,
  voteType: "upvotes" | "downvotes",
): Promise<void> {
  await runTransaction(
    ref(rtdb, `submittedPortals/${submissionId}/${voteType}`),
    (count) => (count ?? 0) + 1,
  );
}

// ── Admin actions ──────────────────────────────────────────────────────────────
export async function updateSubmissionStatus(
  submissionId: string,
  status: PortalStatus,
): Promise<void> {
  await update(ref(rtdb, `submittedPortals/${submissionId}`), { status });
}

export async function deleteSubmission(submissionId: string): Promise<void> {
  await remove(ref(rtdb, `submittedPortals/${submissionId}`));
}

export async function getAllSubmissions(): Promise<SubmittedPortal[]> {
  const snap = await get(ref(rtdb, "submittedPortals"));
  if (!snap.exists()) return [];
  return Object.entries(snap.val() as Record<string, Omit<SubmittedPortal, "id">>)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.timestamp - a.timestamp);
}

// ── Live hook — all pending submissions ────────────────────────────────────────
export function usePendingPortals(): { portals: SubmittedPortal[]; loading: boolean } {
  const [portals, setPortals] = useState<SubmittedPortal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onValue(ref(rtdb, "submittedPortals"), (snap) => {
      if (!snap.exists()) {
        setPortals([]);
      } else {
        const all = Object.entries(snap.val() as Record<string, Omit<SubmittedPortal, "id">>)
          .map(([id, v]) => ({ id, ...v }))
          .filter((p) => p.status === "pending_review")
          .sort((a, b) => b.upvotes - a.upvotes || b.timestamp - a.timestamp);
        setPortals(all);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return { portals, loading };
}

// ── Live hook — all submissions (for admin) ────────────────────────────────────
export function useAllSubmissions(): { portals: SubmittedPortal[]; loading: boolean } {
  const [portals, setPortals] = useState<SubmittedPortal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onValue(ref(rtdb, "submittedPortals"), (snap) => {
      if (!snap.exists()) {
        setPortals([]);
      } else {
        const all = Object.entries(snap.val() as Record<string, Omit<SubmittedPortal, "id">>)
          .map(([id, v]) => ({ id, ...v }))
          .sort((a, b) => b.timestamp - a.timestamp);
        setPortals(all);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return { portals, loading };
}
