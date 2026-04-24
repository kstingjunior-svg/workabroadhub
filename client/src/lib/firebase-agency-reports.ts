import {
  ref, push, get, set, update, onValue,
  runTransaction, query, orderByChild, equalTo,
} from "firebase/database";
import { rtdb } from "@/lib/firebase";
import { useEffect, useState } from "react";

export type ReportStatus = "pending_review" | "reviewed" | "confirmed_scam" | "dismissed";

export interface AgencyReport {
  id: string;
  licenseNumber: string;
  agencyName?: string;
  reason: string;
  reportedBy: string;
  timestamp: number;
  status: ReportStatus;
}

export const REPORT_REASONS = [
  "Charging illegal recruitment fees",
  "Fake/invalid license number",
  "Deceptive job offers",
  "Non-existent employer or job",
  "Withheld worker documents",
  "Failed to deploy after payment",
  "Physical or verbal abuse claims",
  "Other suspicious activity",
] as const;

export async function reportAgency(
  licenseNumber: string,
  reason: string,
  visitorId: string,
  agencyName?: string,
): Promise<void> {
  await push(ref(rtdb, "reportedAgencies"), {
    licenseNumber,
    agencyName: agencyName ?? null,
    reason,
    reportedBy: visitorId,
    timestamp: Date.now(),
    status: "pending_review" as ReportStatus,
  });

  await runTransaction(ref(rtdb, `agencyWarnings/${licenseNumber}`), (current) => {
    return (current ?? 0) + 1;
  });
}

export function useAgencyWarningCount(licenseNumber: string | null | undefined) {
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    if (!licenseNumber) return;
    const warningRef = ref(rtdb, `agencyWarnings/${licenseNumber}`);
    const unsub = onValue(warningRef, (snap) => {
      setCount(snap.exists() ? (snap.val() as number) : 0);
    });
    return () => unsub();
  }, [licenseNumber]);

  return count;
}

export async function getAllAgencyReports(): Promise<AgencyReport[]> {
  const snap = await get(ref(rtdb, "reportedAgencies"));
  if (!snap.exists()) return [];
  return Object.entries(snap.val() as Record<string, Omit<AgencyReport, "id">>)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.timestamp - a.timestamp);
}

export async function updateReportStatus(id: string, status: ReportStatus): Promise<void> {
  await update(ref(rtdb, `reportedAgencies/${id}`), { status });
}

export async function getAgencyWarningCounts(): Promise<Record<string, number>> {
  const snap = await get(ref(rtdb, "agencyWarnings"));
  if (!snap.exists()) return {};
  return snap.val() as Record<string, number>;
}

export async function resetAgencyWarnings(licenseNumber: string): Promise<void> {
  await set(ref(rtdb, `agencyWarnings/${licenseNumber}`), 0);
}
