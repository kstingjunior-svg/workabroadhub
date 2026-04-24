import { ref, push, get, update, query, orderByChild, onValue } from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { useEffect, useState } from "react";

export type BookingStatus = "confirmed" | "completed" | "cancelled" | "no_show";

export interface Booking {
  id: string;
  advisorId: string;
  advisorName: string;
  advisorSpecialty: string;
  userId: string;
  userName: string;
  dateTime: string;
  status: BookingStatus;
  whatsappNumber: string;
  timestamp: number;
}

export const TIME_SLOTS = [
  "08:00", "09:00", "10:00", "11:00",
  "13:00", "14:00", "15:00", "16:00",
  "18:00", "19:00",
];

export async function bookConsultation(params: {
  advisorId: string;
  advisorName: string;
  advisorSpecialty: string;
  userId: string;
  userName: string;
  dateTime: string;
  whatsappNumber: string;
}): Promise<void> {
  await push(ref(rtdb, "bookings"), {
    ...params,
    status: "confirmed" as BookingStatus,
    timestamp: Date.now(),
  });
}

export function useUserBookings(userId: string | null | undefined) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    const q = query(ref(rtdb, "bookings"), orderByChild("userId"));
    const unsub = onValue(q, (snap) => {
      if (!snap.exists()) { setBookings([]); setLoading(false); return; }
      const all = Object.entries(snap.val() as Record<string, Omit<Booking, "id">>)
        .map(([id, v]) => ({ id, ...v }))
        .filter(b => b.userId === userId)
        .sort((a, b) => b.timestamp - a.timestamp);
      setBookings(all);
      setLoading(false);
    });
    return () => unsub();
  }, [userId]);

  return { bookings, loading };
}

export async function getAllBookings(): Promise<Booking[]> {
  const snap = await get(ref(rtdb, "bookings"));
  if (!snap.exists()) return [];
  return Object.entries(snap.val() as Record<string, Omit<Booking, "id">>)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.timestamp - a.timestamp);
}

export async function updateBookingStatus(id: string, status: BookingStatus): Promise<void> {
  await update(ref(rtdb, `bookings/${id}`), { status });
}
