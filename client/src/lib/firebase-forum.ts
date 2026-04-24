/**
 * Firebase Realtime Database — Country Q&A Forum + Country Groups
 *
 * Schema (RTDB):
 *   forum/{country}/{questionId}
 *     question  : string
 *     userId    : string
 *     timestamp : number (server timestamp)
 *     views     : number
 *     answers/{answerId}
 *       answer    : string
 *       userId    : string
 *       timestamp : number
 *       helpful   : number
 *
 *   groups/{country}/members/{userId}
 *     joinedAt  : number (server timestamp)
 *     status    : string  e.g. "Looking for opportunities"
 *     timeline  : string  e.g. "Planning to move in 3-6 months"
 */

import {
  ref,
  push,
  get,
  set,
  remove,
  onValue,
  off,
  runTransaction,
  serverTimestamp,
  query,
  orderByChild,
  limitToLast,
  type DatabaseReference,
  type Unsubscribe,
} from "firebase/database";
import { rtdb } from "./firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ForumAnswer {
  id: string;
  answer: string;
  userId: string;
  timestamp: number;
  helpful: number;
}

export interface ForumQuestion {
  id: string;
  question: string;
  userId: string;
  timestamp: number;
  views: number;
  answers: ForumAnswer[];
}

// Valid country slugs accepted by the forum
export const FORUM_COUNTRIES = ["usa", "canada", "uae", "uk", "australia", "europe"] as const;
export type ForumCountry = (typeof FORUM_COUNTRIES)[number];

// ─── Write helpers ────────────────────────────────────────────────────────────

/**
 * Post a new question to a country's forum thread.
 * Returns the new question's Firebase key.
 */
export async function postQuestion(
  country: string,
  question: string,
  userId: string,
): Promise<string> {
  const forumRef = ref(rtdb, `forum/${country}`);
  const newRef = await push(forumRef, {
    question: question.trim(),
    userId,
    timestamp: serverTimestamp(),
    views: 0,
    answers: {},
  });
  return newRef.key!;
}

/**
 * Post an answer to a specific question.
 * Returns the new answer's Firebase key.
 */
export async function answerQuestion(
  country: string,
  questionId: string,
  answer: string,
  userId: string,
): Promise<string> {
  const answersRef = ref(rtdb, `forum/${country}/${questionId}/answers`);
  const newRef = await push(answersRef, {
    answer: answer.trim(),
    userId,
    timestamp: serverTimestamp(),
    helpful: 0,
  });
  return newRef.key!;
}

/**
 * Mark an answer as helpful (+1).
 */
export async function markAnswerHelpful(
  country: string,
  questionId: string,
  answerId: string,
): Promise<void> {
  const helpfulRef = ref(rtdb, `forum/${country}/${questionId}/answers/${answerId}/helpful`);
  await runTransaction(helpfulRef, (current) => (current ?? 0) + 1);
}

/**
 * Increment the view count for a question (called when a question is opened).
 */
export async function incrementViews(country: string, questionId: string): Promise<void> {
  const viewsRef = ref(rtdb, `forum/${country}/${questionId}/views`);
  await runTransaction(viewsRef, (current) => (current ?? 0) + 1);
}

// ─── Read helpers ─────────────────────────────────────────────────────────────

function rawToQuestions(val: Record<string, any>): ForumQuestion[] {
  if (!val) return [];
  return Object.entries(val)
    .map(([id, q]) => ({
      id,
      question: q.question ?? "",
      userId: q.userId ?? "",
      timestamp: q.timestamp ?? 0,
      views: q.views ?? 0,
      answers: q.answers
        ? Object.entries(q.answers as Record<string, any>).map(([aid, a]) => ({
            id: aid,
            answer: a.answer ?? "",
            userId: a.userId ?? "",
            timestamp: a.timestamp ?? 0,
            helpful: a.helpful ?? 0,
          }))
        : [],
    }))
    .sort((a, b) => (b.timestamp as number) - (a.timestamp as number));
}

/**
 * Subscribe to the latest 50 questions for a country (real-time).
 * Returns an unsubscribe function.
 */
export function subscribeToQuestions(
  country: string,
  callback: (questions: ForumQuestion[]) => void,
): Unsubscribe {
  const q = query(ref(rtdb, `forum/${country}`), orderByChild("timestamp"), limitToLast(50));
  const handler = (snap: any) => {
    callback(rawToQuestions(snap.val()));
  };
  onValue(q, handler);
  return () => off(q, "value", handler);
}

/**
 * One-time fetch for a single question (with answers).
 */
export async function getQuestion(country: string, questionId: string): Promise<ForumQuestion | null> {
  const snap = await get(ref(rtdb, `forum/${country}/${questionId}`));
  if (!snap.exists()) return null;
  const q = snap.val();
  return {
    id: questionId,
    question: q.question ?? "",
    userId: q.userId ?? "",
    timestamp: q.timestamp ?? 0,
    views: q.views ?? 0,
    answers: q.answers
      ? Object.entries(q.answers as Record<string, any>).map(([aid, a]) => ({
          id: aid,
          answer: a.answer ?? "",
          userId: a.userId ?? "",
          timestamp: a.timestamp ?? 0,
          helpful: a.helpful ?? 0,
        }))
      : [],
  };
}

// ─── Country Group membership ──────────────────────────────────────────────────
//  RTDB path: groups/{country}/members/{userId}

export const GROUP_STATUSES = [
  "Looking for opportunities",
  "Actively applying",
  "Interview stage",
  "Got the job!",
  "Already working abroad",
] as const;

export const GROUP_TIMELINES = [
  "Planning to move in 1-3 months",
  "Planning to move in 3-6 months",
  "Planning to move in 6-12 months",
  "Just exploring options",
  "Already abroad",
] as const;

export type GroupStatus = (typeof GROUP_STATUSES)[number];
export type GroupTimeline = (typeof GROUP_TIMELINES)[number];

export interface GroupMember {
  userId: string;
  joinedAt: number;
  status: GroupStatus;
  timeline: GroupTimeline;
}

/**
 * Join a country group (or update your existing membership).
 * Keyed by userId so each user has exactly one record.
 */
export async function joinCountryGroup(
  country: string,
  userId: string,
  status: GroupStatus = "Looking for opportunities",
  timeline: GroupTimeline = "Planning to move in 3-6 months",
): Promise<void> {
  const memberRef = ref(rtdb, `groups/${country}/members/${userId}`);
  await set(memberRef, {
    userId,
    joinedAt: serverTimestamp(),
    status,
    timeline,
  });
}

/**
 * Leave a country group — removes the user's membership record.
 */
export async function leaveCountryGroup(country: string, userId: string): Promise<void> {
  const memberRef = ref(rtdb, `groups/${country}/members/${userId}`);
  await remove(memberRef);
}

/**
 * Check once whether a user is already a member of a country group.
 */
export async function isUserInGroup(country: string, userId: string): Promise<boolean> {
  const snap = await get(ref(rtdb, `groups/${country}/members/${userId}`));
  return snap.exists();
}

/**
 * Fetch a user's current group member record (or null if not joined).
 */
export async function getUserGroupMembership(
  country: string,
  userId: string,
): Promise<GroupMember | null> {
  const snap = await get(ref(rtdb, `groups/${country}/members/${userId}`));
  if (!snap.exists()) return null;
  const d = snap.val();
  return {
    userId,
    joinedAt: d.joinedAt ?? 0,
    status: d.status ?? GROUP_STATUSES[0],
    timeline: d.timeline ?? GROUP_TIMELINES[1],
  };
}

/**
 * Subscribe to live member count + recent member list for a country group.
 * Returns an unsubscribe function.
 */
export function subscribeToGroupMembers(
  country: string,
  callback: (members: GroupMember[]) => void,
): Unsubscribe {
  const membersRef = ref(rtdb, `groups/${country}/members`);
  const handler = (snap: any) => {
    if (!snap.exists()) { callback([]); return; }
    const members: GroupMember[] = Object.entries(snap.val() as Record<string, any>).map(
      ([uid, d]) => ({
        userId: uid,
        joinedAt: d.joinedAt ?? 0,
        status: d.status ?? GROUP_STATUSES[0],
        timeline: d.timeline ?? GROUP_TIMELINES[1],
      }),
    );
    members.sort((a, b) => b.joinedAt - a.joinedAt);
    callback(members);
  };
  onValue(membersRef, handler);
  return () => off(membersRef, "value", handler);
}
