"use strict";
/**
 * Kazi Karibu — shared constants used on both client and server.
 *
 * See docs/kazi-karibu/STRATEGY.md.
 *
 * SHARED FOLDER SEMANTICS: this file may be imported from any client OR
 * server module. Do NOT import server-only code (pg, node:fs, etc.) here
 * or the client bundle will break.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.KAZI_KARIBU_VERIFIED_BADGE_PRICE_KES = exports.KAZI_KARIBU_BOOST_PRICE_KES = exports.KAZI_KARIBU_STANDARD_POST_PRICE_KES = exports.KAZI_KARIBU_SERVICE_CODES = exports.KAZI_KARIBU_BUDGET_PERIODS = exports.KAZI_KARIBU_DURATIONS = exports.KAZI_KARIBU_POST_STATES = exports.ALLOWED_KAZI_KARIBU_CATEGORY_IDS = exports.KAZI_KARIBU_CATEGORIES = void 0;
exports.defaultPosterDisplayName = defaultPosterDisplayName;
// ─── Category taxonomy (Phase 1) ────────────────────────────────────────────
// Machine-readable IDs used across the DB, API, and UI. Adding a new
// category is a code-only change — no migration required (category is a
// free-text column in kazi_karibu_posts). But keep the ALLOWED_CATEGORY_IDS
// set in sync with this list so the server can validate submissions.
exports.KAZI_KARIBU_CATEGORIES = [
    { id: "house_help", label: "House help / nanny", suggestsRecurring: true },
    { id: "cleaner", label: "Cleaner", suggestsRecurring: true },
    { id: "cook_caterer", label: "Cook / caterer", suggestsRecurring: false },
    { id: "driver", label: "Driver", suggestsRecurring: false },
    { id: "fundi_mason", label: "Fundi — mason", suggestsRecurring: false },
    { id: "fundi_plumber", label: "Fundi — plumber", suggestsRecurring: false },
    { id: "fundi_electrician", label: "Fundi — electrician", suggestsRecurring: false },
    { id: "fundi_painter", label: "Fundi — painter", suggestsRecurring: false },
    { id: "fundi_carpenter", label: "Fundi — carpenter", suggestsRecurring: false },
    { id: "delivery_errand", label: "Delivery / errand runner", suggestsRecurring: false },
    { id: "security_guard", label: "Security guard / watchman", suggestsRecurring: true },
    { id: "gardener", label: "Gardener / shamba boy", suggestsRecurring: true },
    { id: "tutor", label: "Tutor", suggestsRecurring: true },
    { id: "event_promoter", label: "Event promoter / staff", suggestsRecurring: false },
];
exports.ALLOWED_KAZI_KARIBU_CATEGORY_IDS = new Set(exports.KAZI_KARIBU_CATEGORIES.map(c => c.id));
// ─── Post lifecycle states ──────────────────────────────────────────────────
// Mirrors the CHECK constraint in migrations/0013_kazi_karibu_foundations.sql.
exports.KAZI_KARIBU_POST_STATES = [
    "draft",
    "awaiting_payment",
    "pending_moderation",
    "live",
    "held",
    "rejected",
    "expired",
    "removed",
];
// ─── Duration options ───────────────────────────────────────────────────────
exports.KAZI_KARIBU_DURATIONS = [
    { id: "one_off", label: "One-off" },
    { id: "recurring_weekly", label: "Recurring weekly" },
    { id: "permanent", label: "Permanent / ongoing" },
];
// ─── Budget period options ──────────────────────────────────────────────────
exports.KAZI_KARIBU_BUDGET_PERIODS = [
    { id: "hour", label: "per hour" },
    { id: "day", label: "per day" },
    { id: "month", label: "per month" },
    { id: "project", label: "flat rate" },
];
// ─── Service codes (mirrors migration 0013 services rows) ───────────────────
exports.KAZI_KARIBU_SERVICE_CODES = {
    STANDARD_POST: "kazi_karibu_post_standard",
    BOOST: "kazi_karibu_boost",
    VERIFIED_BADGE: "kazi_karibu_verified_badge",
};
exports.KAZI_KARIBU_STANDARD_POST_PRICE_KES = 100;
exports.KAZI_KARIBU_BOOST_PRICE_KES = 500;
exports.KAZI_KARIBU_VERIFIED_BADGE_PRICE_KES = 1000;
// ─── Post display defaults ──────────────────────────────────────────────────
// A post's default display name derives poster's county so applicants see
// context without revealing identity. E.g. "Household in Kileleshwa".
// Poster can opt-in to name display via `poster_shows_name`.
function defaultPosterDisplayName(subCounty, county) {
    const where = (subCounty && subCounty.trim().length > 0) ? subCounty.trim() : county;
    return `Household in ${where}`;
}
