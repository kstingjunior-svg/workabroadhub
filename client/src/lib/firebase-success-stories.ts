import { ref, push, query, orderByChild, equalTo, limitToLast, onValue, update, remove, get } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { useEffect, useState } from "react";
import { anonymizeUser } from "@/lib/anonymize";

export interface SuccessStoryEntry {
  id: string;
  initials: string;
  from: string;
  to: string;
  jobTitle: string;
  verifiedByAdmin: boolean;
  timestamp: number;
  userId?: string;
}

const COUNTRY_NAMES: Record<string, string> = {
  KE: "Kenya", UG: "Uganda", TZ: "Tanzania", RW: "Rwanda",
  ET: "Ethiopia", GH: "Ghana", NG: "Nigeria", ZA: "South Africa",
  ZM: "Zambia", ZW: "Zimbabwe", US: "USA", GB: "UK",
  CA: "Canada", AU: "Australia", AE: "UAE",
};

export async function pushSuccessStory(
  user: { id?: string; firstName?: string | null; lastName?: string | null; email?: string; country?: string | null; createdAt?: string | Date | number | null },
  jobTitle: string,
  destination: string,
): Promise<void> {
  const from = user.country
    ? (COUNTRY_NAMES[user.country.toUpperCase()] ?? user.country)
    : "Kenya";

  const anon = anonymizeUser(user);
  const initials = anon.initials !== "?"
    ? anon.initials
    : (user.email?.[0]?.toUpperCase() ?? "?");

  await push(ref(rtdb, "successStories"), {
    userId: user.id ?? null,
    initials,
    from,
    to: destination,
    jobTitle,
    verifiedByAdmin: false,
    timestamp: Date.now(),
  });
}

export function useVerifiedSuccessStories(limit = 10) {
  const [stories, setStories] = useState<SuccessStoryEntry[]>([]);

  useEffect(() => {
    const q = query(
      ref(rtdb, "successStories"),
      orderByChild("verifiedByAdmin"),
      equalTo(true),
      limitToLast(limit),
    );
    const unsub = onValue(q, (snap) => {
      if (!snap.exists()) { setStories([]); return; }
      const items: SuccessStoryEntry[] = Object.entries(
        snap.val() as Record<string, Omit<SuccessStoryEntry, "id">>
      )
        .map(([id, v]) => ({ id, ...v }))
        .sort((a, b) => b.timestamp - a.timestamp);
      setStories(items);
    });
    return () => unsub();
  }, [limit]);

  return stories;
}

export async function getAllSuccessStories(): Promise<SuccessStoryEntry[]> {
  const snap = await get(ref(rtdb, "successStories"));
  if (!snap.exists()) return [];
  return Object.entries(snap.val() as Record<string, Omit<SuccessStoryEntry, "id">>)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.timestamp - a.timestamp);
}

export async function verifyStory(id: string): Promise<void> {
  await update(ref(rtdb, `successStories/${id}`), { verifiedByAdmin: true });
}

export async function rejectStory(id: string): Promise<void> {
  await remove(ref(rtdb, `successStories/${id}`));
}
