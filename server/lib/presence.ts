/**
 * Real-time presence registry.
 *
 * Maintains an in-memory list of every logged-in user who currently has at
 * least one open /ws/user WebSocket connection. Updates the moment a user
 * connects (joins) or their last tab closes (leaves) — no polling, no DB
 * round-trip, no cleanup interval. WebSocket lifecycle IS the truth.
 *
 * Two views are exposed:
 *   getOnlineSnapshot()       — every authenticated user currently online
 *                               (used by the home dashboard "X online now")
 *   getPaidOnlineSnapshot()   — subset who have an active paid subscription
 *                               (used by the admin Live Sessions panel)
 *
 * On every change we notify subscribers (the WebSocket broadcaster) so they
 * can push the new snapshot to connected admin / public clients.
 *
 * 2026-06: built after the admin Live Sessions widget (32 online) and the
 * home dashboard widget (160 online) showed wildly different numbers because
 * they polled two different sources. Now both surfaces subscribe to this
 * single registry — they cannot disagree.
 */

export interface PresenceEntry {
  userId: string;
  // Identity (only populated on attach, so we don't make a DB call per heartbeat)
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  planId: string;          // "free" | "trial" | "monthly" | "yearly" | "pro" | "pro_referral" | "basic"
  isPaid: boolean;         // derived from planId on attach (any non-"free" tier)
  subscriptionExpiresAt: string | null; // ISO; clients render countdown
  // Liveness
  joinedAt: number;        // ms epoch — first connection time
  lastSeen: number;        // ms epoch — last interaction (ping, message)
  tabCount: number;        // open WS connections for this user
  currentPage: string | null; // populated by /api/track heartbeat updates
}

const presence = new Map<string, PresenceEntry>();

// ─── Subscriber pattern ─────────────────────────────────────────────────────
// WebSocket broadcasters register a callback that fires whenever someone
// joins or leaves so they can push the change to all admin / public clients.
type PresenceListener = (kind: "join" | "leave" | "update", userId: string) => void;
const listeners = new Set<PresenceListener>();

export function subscribePresence(fn: PresenceListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(kind: "join" | "leave" | "update", userId: string): void {
  for (const fn of listeners) {
    try { fn(kind, userId); } catch (e: any) {
      console.error(`[presence] listener threw: ${e?.message}`);
    }
  }
}

// ─── Mutation API ───────────────────────────────────────────────────────────

interface AttachOptions {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  planId?: string;
  subscriptionExpiresAt?: string | Date | null;
}

const PAID_PLAN_IDS = new Set(["trial", "basic", "monthly", "yearly", "pro", "pro_referral"]);
const isPaidPlan = (planId?: string | null) =>
  !!planId && PAID_PLAN_IDS.has(planId.toLowerCase());

/**
 * Called when a /ws/user connection opens. Adds a tab to the user's count.
 * If this is the user's FIRST tab → fires a "join" event.
 */
export function attach(userId: string, details: AttachOptions = {}): void {
  const existing = presence.get(userId);
  const now = Date.now();
  const expiresIso =
    details.subscriptionExpiresAt instanceof Date
      ? details.subscriptionExpiresAt.toISOString()
      : (typeof details.subscriptionExpiresAt === "string"
          ? details.subscriptionExpiresAt
          : (existing?.subscriptionExpiresAt ?? null));

  if (existing) {
    existing.tabCount += 1;
    existing.lastSeen = now;
    // Refresh identity if the caller passed updated details
    if (details.email     !== undefined) existing.email     = details.email     ?? existing.email;
    if (details.firstName !== undefined) existing.firstName = details.firstName ?? existing.firstName;
    if (details.lastName  !== undefined) existing.lastName  = details.lastName  ?? existing.lastName;
    if (details.phone     !== undefined) existing.phone     = details.phone     ?? existing.phone;
    if (details.planId) {
      existing.planId = details.planId;
      existing.isPaid = isPaidPlan(details.planId);
    }
    existing.subscriptionExpiresAt = expiresIso;
    notify("update", userId);
    return;
  }

  const entry: PresenceEntry = {
    userId,
    email:     details.email     ?? null,
    firstName: details.firstName ?? null,
    lastName:  details.lastName  ?? null,
    phone:     details.phone     ?? null,
    planId:    details.planId    ?? "free",
    isPaid:    isPaidPlan(details.planId),
    subscriptionExpiresAt: expiresIso,
    joinedAt: now,
    lastSeen: now,
    tabCount: 1,
    currentPage: null,
  };
  presence.set(userId, entry);
  notify("join", userId);
}

/**
 * Called when a /ws/user connection closes. Decrements the tab count and,
 * if this was the user's LAST tab, fires a "leave" event and removes them.
 */
export function detach(userId: string): void {
  const existing = presence.get(userId);
  if (!existing) return;
  existing.tabCount -= 1;
  if (existing.tabCount <= 0) {
    presence.delete(userId);
    notify("leave", userId);
  } else {
    existing.lastSeen = Date.now();
    notify("update", userId);
  }
}

/**
 * Update last-seen + current page from a /api/heartbeat or /api/track call.
 * Does NOT add a user who isn't already attached (HTTP-only sessions don't
 * count as "online" in this registry).
 */
export function heartbeat(userId: string, page?: string | null): void {
  const existing = presence.get(userId);
  if (!existing) return;
  existing.lastSeen = Date.now();
  if (typeof page === "string") existing.currentPage = page.slice(0, 200);
  notify("update", userId);
}

/**
 * Called when an admin manually grants a plan, or a payment callback
 * activates a subscription. Updates the cached plan + expiry so the admin
 * presence widget shows the new tier without waiting for the user to
 * reconnect.
 */
export function updatePlan(userId: string, planId: string, expiresAt?: Date | string | null): void {
  const existing = presence.get(userId);
  if (!existing) return;
  existing.planId = planId;
  existing.isPaid = isPaidPlan(planId);
  if (expiresAt !== undefined) {
    existing.subscriptionExpiresAt =
      expiresAt instanceof Date ? expiresAt.toISOString() :
      (typeof expiresAt === "string" ? expiresAt : null);
  }
  notify("update", userId);
}

// ─── Read API ───────────────────────────────────────────────────────────────

/** Every authenticated user currently online (count = home dashboard). */
export function getOnlineSnapshot(): PresenceEntry[] {
  return Array.from(presence.values());
}

/** Online users with an active paid subscription (admin Live Sessions). */
export function getPaidOnlineSnapshot(): PresenceEntry[] {
  const now = Date.now();
  return Array.from(presence.values()).filter((e) => {
    if (!e.isPaid) return false;
    if (!e.subscriptionExpiresAt) return true;  // no expiry = active forever
    return new Date(e.subscriptionExpiresAt).getTime() > now;
  });
}

/** Lightweight count for the home dashboard banner. */
export function getOnlineCount(): number {
  return presence.size;
}

/** Lightweight count of paid-only users for the admin banner. */
export function getPaidOnlineCount(): number {
  return getPaidOnlineSnapshot().length;
}

// ─── Anonymous visitor presence ─────────────────────────────────────────────
//
// 2026-06: separate, lighter-weight registry for "is anyone on the site right
// now" — used by the public homepage banner and landing page. Counts EVERY
// open browser tab connected to the public presence channel, whether the
// visitor has logged in or not. Dedup'd per visitorId (a UUID stored in
// localStorage), so a single user with 3 tabs still counts as 1 person.
//
// This is what surfaces as "X online now" on the landing page — the number
// includes anonymous visitors who haven't created an account yet, which is
// what Tony asked for ("the exact number, no bots, no exaggerating").

const visitorTabs = new Map<string, number>(); // visitorId -> open tab count
const visitorListeners = new Set<(kind: "visitor_join" | "visitor_leave") => void>();

export function subscribeVisitorCount(fn: (kind: "visitor_join" | "visitor_leave") => void): () => void {
  visitorListeners.add(fn);
  return () => visitorListeners.delete(fn);
}

function notifyVisitor(kind: "visitor_join" | "visitor_leave"): void {
  for (const fn of visitorListeners) {
    try { fn(kind); } catch { /* swallow listener errors */ }
  }
}

export function attachVisitor(visitorId: string): void {
  const tabs = visitorTabs.get(visitorId) ?? 0;
  visitorTabs.set(visitorId, tabs + 1);
  if (tabs === 0) notifyVisitor("visitor_join");
}

export function detachVisitor(visitorId: string): void {
  const tabs = visitorTabs.get(visitorId);
  if (!tabs) return;
  if (tabs === 1) {
    visitorTabs.delete(visitorId);
    notifyVisitor("visitor_leave");
  } else {
    visitorTabs.set(visitorId, tabs - 1);
  }
}

/** Distinct browsers (anonymous + authenticated) currently on the site. */
export function getVisitorCount(): number {
  return visitorTabs.size;
}
