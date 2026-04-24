/**
 * Firebase Realtime Database — Content Moderation Queue
 *
 * Schema (RTDB):
 *   moderationQueue/{queueId}
 *     type        : ContentType
 *     content     : object  (shape depends on type)
 *     status      : 'pending' | 'approved' | 'rejected'
 *     submittedAt : number  (server timestamp)
 *     submittedBy : string  (userId)
 *     reviewedAt  : number  | null
 *     reviewedBy  : string  | null  (adminId)
 *     rejectReason: string  | null
 *
 *   public/testimonials/{queueId}          — approved testimonials
 *   public/agencyReviews/{agencyId}/{qid}  — approved agency reviews
 *   public/portalSubmissions/{queueId}     — approved portal submissions
 */

import {
  ref,
  push,
  get,
  set,
  update,
  remove,
  onValue,
  off,
  serverTimestamp,
  query,
  orderByChild,
  equalTo,
  type Unsubscribe,
} from "firebase/database";
import { rtdb } from "./firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ContentType = "testimonial" | "agency_review" | "portal_submission";
export type ModerationStatus = "pending" | "approved" | "rejected";

export interface TestimonialContent {
  name:    string;
  role:    string;
  country: string;
  rating:  number;
  text:    string;
}

export interface AgencyReviewContent {
  agencyId:   string;
  agencyName: string;
  rating:     number;
  text:       string;
}

export interface PortalSubmissionContent {
  portalName:  string;
  url:         string;
  country:     string;
  description: string;
  category:    string;
}

export type ModerationContent =
  | TestimonialContent
  | AgencyReviewContent
  | PortalSubmissionContent;

export interface ModerationItem {
  id:           string;
  type:         ContentType;
  content:      ModerationContent;
  status:       ModerationStatus;
  submittedAt:  number;
  submittedBy:  string;
  reviewedAt:   number | null;
  reviewedBy:   string | null;
  rejectReason: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rawToItem(id: string, d: any): ModerationItem {
  return {
    id,
    type:         d.type         ?? "testimonial",
    content:      d.content      ?? {},
    status:       d.status       ?? "pending",
    submittedAt:  d.submittedAt  ?? 0,
    submittedBy:  d.submittedBy  ?? "",
    reviewedAt:   d.reviewedAt   ?? null,
    reviewedBy:   d.reviewedBy   ?? null,
    rejectReason: d.rejectReason ?? null,
  };
}

function rawToItems(val: Record<string, any>): ModerationItem[] {
  if (!val) return [];
  return Object.entries(val)
    .map(([id, d]) => rawToItem(id, d))
    .sort((a, b) => b.submittedAt - a.submittedAt);
}

// ─── Public destination paths ─────────────────────────────────────────────────

function publicPath(item: ModerationItem): string {
  switch (item.type) {
    case "testimonial":
      return `public/testimonials/${item.id}`;
    case "agency_review": {
      const c = item.content as AgencyReviewContent;
      return `public/agencyReviews/${c.agencyId}/${item.id}`;
    }
    case "portal_submission":
      return `public/portalSubmissions/${item.id}`;
  }
}

// ─── Write helpers ────────────────────────────────────────────────────────────

/**
 * Submit content for moderation review.
 * Returns the new queue item's Firebase key.
 */
export async function submitForReview(
  contentType: ContentType,
  content: ModerationContent,
  userId: string,
): Promise<string> {
  const queueRef = ref(rtdb, "moderationQueue");
  const newRef = await push(queueRef, {
    type:         contentType,
    content,
    status:       "pending",
    submittedAt:  serverTimestamp(),
    submittedBy:  userId,
    reviewedAt:   null,
    reviewedBy:   null,
    rejectReason: null,
  });
  return newRef.key!;
}

/**
 * Approve a queued item — updates status and publishes to the public RTDB path.
 */
export async function approveContent(queueId: string, adminId: string): Promise<void> {
  const itemRef = ref(rtdb, `moderationQueue/${queueId}`);
  const snap = await get(itemRef);
  if (!snap.exists()) throw new Error(`Queue item ${queueId} not found`);

  const item = rawToItem(queueId, snap.val());

  await update(itemRef, {
    status:    "approved",
    reviewedAt: serverTimestamp(),
    reviewedBy: adminId,
  });

  await set(ref(rtdb, publicPath(item)), {
    ...item.content,
    approvedAt: serverTimestamp(),
    queueId,
  });
}

/**
 * Reject a queued item with an optional reason.
 */
export async function rejectContent(
  queueId: string,
  adminId: string,
  reason = "",
): Promise<void> {
  await update(ref(rtdb, `moderationQueue/${queueId}`), {
    status:       "rejected",
    reviewedAt:   serverTimestamp(),
    reviewedBy:   adminId,
    rejectReason: reason || null,
  });
}

/**
 * Permanently delete a moderation record (admin only).
 */
export async function deleteModerationItem(queueId: string): Promise<void> {
  await remove(ref(rtdb, `moderationQueue/${queueId}`));
}

// ─── Real-time subscriptions ──────────────────────────────────────────────────

/**
 * Subscribe to all items in the moderation queue filtered by status.
 * Pass null to receive all items regardless of status.
 */
export function subscribeToQueue(
  status: ModerationStatus | null,
  callback: (items: ModerationItem[]) => void,
): Unsubscribe {
  const baseRef = ref(rtdb, "moderationQueue");
  const q = status
    ? query(baseRef, orderByChild("status"), equalTo(status))
    : query(baseRef, orderByChild("submittedAt"));

  const handler = (snap: any) => callback(rawToItems(snap.val()));
  onValue(q, handler);
  return () => off(q, "value", handler);
}

/**
 * Subscribe to pending count only (for badge/notification use).
 */
export function subscribeToPendingCount(callback: (count: number) => void): Unsubscribe {
  return subscribeToQueue("pending", (items) => callback(items.length));
}

/**
 * One-time fetch of queue stats.
 */
export async function getQueueStats(): Promise<Record<ModerationStatus, number>> {
  const snap = await get(ref(rtdb, "moderationQueue"));
  const items = rawToItems(snap.val());
  return {
    pending:  items.filter((i) => i.status === "pending").length,
    approved: items.filter((i) => i.status === "approved").length,
    rejected: items.filter((i) => i.status === "rejected").length,
  };
}

// ─── Public feed subscriptions ────────────────────────────────────────────────

/** Subscribe to approved testimonials (real-time). */
export function subscribeToTestimonials(
  callback: (items: (TestimonialContent & { queueId: string; approvedAt: number })[]) => void,
): Unsubscribe {
  const r = ref(rtdb, "public/testimonials");
  const handler = (snap: any) => {
    if (!snap.exists()) { callback([]); return; }
    const items = Object.entries(snap.val() as Record<string, any>).map(([queueId, d]) => ({
      ...(d as TestimonialContent),
      queueId,
      approvedAt: d.approvedAt ?? 0,
    }));
    items.sort((a, b) => b.approvedAt - a.approvedAt);
    callback(items);
  };
  onValue(r, handler);
  return () => off(r, "value", handler);
}

// ─── Legacy path migration ─────────────────────────────────────────────────────

export interface MigrationResult {
  migrated: number;
  skipped: number;
  errors: string[];
}

/**
 * One-time migration: reads every entry under `testimonials/pending/`,
 * creates a proper moderationQueue record for each, then removes the
 * original so it cannot be double-imported.
 *
 * Already-approved entries (those with status === 'approved' in the old
 * path, or any entry that has already been copied to public/testimonials)
 * are moved directly to `public/testimonials/` and recorded in
 * moderationQueue as approved.
 */
export async function migrateLegacyTestimonials(adminId: string): Promise<MigrationResult> {
  const result: MigrationResult = { migrated: 0, skipped: 0, errors: [] };

  const pendingSnap = await get(ref(rtdb, "testimonials/pending"));
  const approvedSnap = await get(ref(rtdb, "testimonials/approved"));

  const pendingMap: Record<string, any> = pendingSnap.exists() ? pendingSnap.val() : {};
  const approvedMap: Record<string, any> = approvedSnap.exists() ? approvedSnap.val() : {};

  // Build combined list: pending items keep status "pending";
  // approved items from the old path get status "approved" and published
  const allEntries: Array<{ id: string; data: any; alreadyApproved: boolean }> = [
    ...Object.entries(pendingMap).map(([id, data]) => ({ id, data, alreadyApproved: false })),
    ...Object.entries(approvedMap).map(([id, data]) => ({ id, data, alreadyApproved: true })),
  ];

  if (allEntries.length === 0) {
    return result;
  }

  for (const { id, data, alreadyApproved } of allEntries) {
    try {
      // Normalise fields from the old schema into TestimonialContent
      const content: TestimonialContent = {
        name:    data.name    ?? data.authorName ?? data.author ?? "Anonymous",
        role:    data.role    ?? data.jobTitle   ?? data.position ?? "",
        country: data.country ?? data.destination ?? "",
        rating:  Number(data.rating ?? data.stars ?? 5),
        text:    data.text    ?? data.message    ?? data.testimonial ?? data.body ?? "",
      };

      // Skip completely empty entries
      if (!content.text.trim()) {
        result.skipped++;
        continue;
      }

      // Push into moderationQueue
      const queueRef = ref(rtdb, "moderationQueue");
      const newRef = await push(queueRef, {
        type:         "testimonial",
        content,
        status:       alreadyApproved ? "approved" : "pending",
        submittedAt:  data.submittedAt ?? data.createdAt ?? data.timestamp ?? Date.now(),
        submittedBy:  data.submittedBy ?? data.userId ?? data.uid ?? "migrated",
        reviewedAt:   alreadyApproved ? (data.verifiedAt ?? data.approvedAt ?? Date.now()) : null,
        reviewedBy:   alreadyApproved ? (data.verifiedBy ?? adminId) : null,
        rejectReason: null,
      });

      // If already approved → also publish to the public path
      if (alreadyApproved && newRef.key) {
        await set(ref(rtdb, `public/testimonials/${newRef.key}`), {
          ...content,
          approvedAt: data.verifiedAt ?? data.approvedAt ?? Date.now(),
          queueId: newRef.key,
        });
      }

      // Remove from legacy path
      const legacyPath = alreadyApproved
        ? `testimonials/approved/${id}`
        : `testimonials/pending/${id}`;
      await remove(ref(rtdb, legacyPath));

      result.migrated++;
    } catch (err: any) {
      result.errors.push(`${id}: ${err?.message ?? "unknown error"}`);
    }
  }

  return result;
}

/** Subscribe to approved reviews for a specific agency (real-time). */
export function subscribeToAgencyReviews(
  agencyId: string,
  callback: (items: (AgencyReviewContent & { queueId: string; approvedAt: number })[]) => void,
): Unsubscribe {
  const r = ref(rtdb, `public/agencyReviews/${agencyId}`);
  const handler = (snap: any) => {
    if (!snap.exists()) { callback([]); return; }
    const items = Object.entries(snap.val() as Record<string, any>).map(([queueId, d]) => ({
      ...(d as AgencyReviewContent),
      queueId,
      approvedAt: d.approvedAt ?? 0,
    }));
    items.sort((a, b) => b.approvedAt - a.approvedAt);
    callback(items);
  };
  onValue(r, handler);
  return () => off(r, "value", handler);
}
