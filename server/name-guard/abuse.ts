/**
 * Name Guard — repeat-abuse detection (2026-11). PURE.
 *
 * Counts REJECTED name attempts per (hashed) client in a sliding window.
 * One bad or ambiguous attempt never restricts anyone; REVIEW decisions
 * never count. Restrictions are temporary and escalate gently.
 */
export interface AttemptEvent { at: Date; decision: "accept" | "review" | "reject"; category: string }
export interface AbuseVerdict { restricted: boolean; minutes: number; rejectsInWindow: number; risk: "low" | "medium" | "high" }

export const WINDOW_MIN = 30;
export const THRESHOLD = 5;          // 5 rejected attempts in 30 min → 15-minute pause
export const HEAVY_THRESHOLD = 10;   // 10+ → 60-minute pause + admin review

export function classifyAbuse(events: AttemptEvent[], nowMs = Date.now()): AbuseVerdict {
  const recent = events.filter((e) => nowMs - new Date(e.at).getTime() <= WINDOW_MIN * 60_000 && e.decision === "reject" && e.category !== "incomplete");
  const n = recent.length;
  if (n >= HEAVY_THRESHOLD) return { restricted: true, minutes: 60, rejectsInWindow: n, risk: "high" };
  if (n >= THRESHOLD) return { restricted: true, minutes: 15, rejectsInWindow: n, risk: "medium" };
  return { restricted: false, minutes: 0, rejectsInWindow: n, risk: n >= 3 ? "medium" : "low" };
}
