"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscribePresence = subscribePresence;
exports.attach = attach;
exports.detach = detach;
exports.heartbeat = heartbeat;
exports.updatePlan = updatePlan;
exports.getOnlineSnapshot = getOnlineSnapshot;
exports.getPaidOnlineSnapshot = getPaidOnlineSnapshot;
exports.getOnlineCount = getOnlineCount;
exports.getPaidOnlineCount = getPaidOnlineCount;
const presence = new Map();
const listeners = new Set();
function subscribePresence(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
function notify(kind, userId) {
    for (const fn of listeners) {
        try {
            fn(kind, userId);
        }
        catch (e) {
            console.error(`[presence] listener threw: ${e?.message}`);
        }
    }
}
const PAID_PLAN_IDS = new Set(["trial", "basic", "monthly", "yearly", "pro", "pro_referral"]);
const isPaidPlan = (planId) => !!planId && PAID_PLAN_IDS.has(planId.toLowerCase());
/**
 * Called when a /ws/user connection opens. Adds a tab to the user's count.
 * If this is the user's FIRST tab → fires a "join" event.
 */
function attach(userId, details = {}) {
    const existing = presence.get(userId);
    const now = Date.now();
    const expiresIso = details.subscriptionExpiresAt instanceof Date
        ? details.subscriptionExpiresAt.toISOString()
        : (typeof details.subscriptionExpiresAt === "string"
            ? details.subscriptionExpiresAt
            : (existing?.subscriptionExpiresAt ?? null));
    if (existing) {
        existing.tabCount += 1;
        existing.lastSeen = now;
        // Refresh identity if the caller passed updated details
        if (details.email !== undefined)
            existing.email = details.email ?? existing.email;
        if (details.firstName !== undefined)
            existing.firstName = details.firstName ?? existing.firstName;
        if (details.lastName !== undefined)
            existing.lastName = details.lastName ?? existing.lastName;
        if (details.phone !== undefined)
            existing.phone = details.phone ?? existing.phone;
        if (details.planId) {
            existing.planId = details.planId;
            existing.isPaid = isPaidPlan(details.planId);
        }
        existing.subscriptionExpiresAt = expiresIso;
        notify("update", userId);
        return;
    }
    const entry = {
        userId,
        email: details.email ?? null,
        firstName: details.firstName ?? null,
        lastName: details.lastName ?? null,
        phone: details.phone ?? null,
        planId: details.planId ?? "free",
        isPaid: isPaidPlan(details.planId),
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
function detach(userId) {
    const existing = presence.get(userId);
    if (!existing)
        return;
    existing.tabCount -= 1;
    if (existing.tabCount <= 0) {
        presence.delete(userId);
        notify("leave", userId);
    }
    else {
        existing.lastSeen = Date.now();
        notify("update", userId);
    }
}
/**
 * Update last-seen + current page from a /api/heartbeat or /api/track call.
 * Does NOT add a user who isn't already attached (HTTP-only sessions don't
 * count as "online" in this registry).
 */
function heartbeat(userId, page) {
    const existing = presence.get(userId);
    if (!existing)
        return;
    existing.lastSeen = Date.now();
    if (typeof page === "string")
        existing.currentPage = page.slice(0, 200);
    notify("update", userId);
}
/**
 * Called when an admin manually grants a plan, or a payment callback
 * activates a subscription. Updates the cached plan + expiry so the admin
 * presence widget shows the new tier without waiting for the user to
 * reconnect.
 */
function updatePlan(userId, planId, expiresAt) {
    const existing = presence.get(userId);
    if (!existing)
        return;
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
function getOnlineSnapshot() {
    return Array.from(presence.values());
}
/** Online users with an active paid subscription (admin Live Sessions). */
function getPaidOnlineSnapshot() {
    const now = Date.now();
    return Array.from(presence.values()).filter((e) => {
        if (!e.isPaid)
            return false;
        if (!e.subscriptionExpiresAt)
            return true; // no expiry = active forever
        return new Date(e.subscriptionExpiresAt).getTime() > now;
    });
}
/** Lightweight count for the home dashboard banner. */
function getOnlineCount() {
    return presence.size;
}
/** Lightweight count of paid-only users for the admin banner. */
function getPaidOnlineCount() {
    return getPaidOnlineSnapshot().length;
}
