"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activeSessions = exports.users = exports.PlanTier = exports.UserRole = exports.sessions = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
exports.sessions = (0, pg_core_1.pgTable)("sessions", {
    sid: (0, pg_core_1.varchar)("sid").primaryKey(),
    sess: (0, pg_core_1.jsonb)("sess").notNull(),
    expire: (0, pg_core_1.timestamp)("expire").notNull(),
}, (table) => [(0, pg_core_1.index)("IDX_session_expire").on(table.expire)]);
// ─── User access levels (system permission) ───────────────────────────────────
// Separate from subscription plan. Used for admin panel access control.
exports.UserRole = {
    USER: "USER",
    ADMIN: "ADMIN",
    SUPER_ADMIN: "SUPER_ADMIN",
};
// ─── Subscription plan tiers ─────────────────────────────────────────────────
// The `plan` column is the canonical subscription tier used throughout the app.
// Always use email (not id) to look up users externally.
exports.PlanTier = {
    FREE: "free",
    BASIC: "basic",
    PRO: "pro",
};
// ─── Users table ─────────────────────────────────────────────────────────────
// Required fields (enforced here and at DB level):
//   id         — UUID primary key, auto-generated
//   email      — UNIQUE, NOT NULL — canonical identifier for all external lookups
//   passwordHash — bcrypt hash of the user's password (null for Replit OAuth users)
//   plan       — subscription tier: "free" | "basic" | "pro"
//   createdAt  — row creation timestamp
//
// System permission field:
//   role       — "USER" | "ADMIN" | "SUPER_ADMIN" — controls admin panel access
//               (distinct from `plan` which controls feature access)
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
exports.users = (0, pg_core_1.pgTable)("users", {
    id: (0, pg_core_1.varchar)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    // ── Required identity fields ────────────────────────────────────────────────
    email: (0, pg_core_1.varchar)("email").notNull().unique(), // UNIQUE NOT NULL — always use email to find users
    // ── Subscription tier ───────────────────────────────────────────────────────
    plan: (0, pg_core_1.varchar)("plan").notNull().default("free"), // "free" | "basic" | "pro" — denormalised from user_subscriptions for fast reads
    subscriptionStatus: (0, pg_core_1.varchar)("subscription_status").notNull().default("inactive"), // "active" | "expired" | "inactive"
    // ── System permission level ─────────────────────────────────────────────────
    role: (0, pg_core_1.varchar)("role").notNull().default("USER"), // "USER" | "ADMIN" | "SUPER_ADMIN" — for admin panel access
    // ── Password authentication ─────────────────────────────────────────────────
    passwordHash: (0, pg_core_1.varchar)("password_hash"), // bcrypt hash — null for Replit OAuth users
    authMethod: (0, pg_core_1.varchar)("auth_method").notNull().default("replit"), // "replit" | "email"
    // ── Profile ─────────────────────────────────────────────────────────────────
    firstName: (0, pg_core_1.varchar)("first_name"),
    lastName: (0, pg_core_1.varchar)("last_name"),
    profileImageUrl: (0, pg_core_1.varchar)("profile_image_url"),
    phone: (0, pg_core_1.varchar)("phone"),
    country: (0, pg_core_1.varchar)("country"),
    consentAccepted: (0, pg_core_1.boolean)("consent_accepted").default(false),
    referralCode: (0, pg_core_1.varchar)("referral_code").unique(),
    // ── Status ──────────────────────────────────────────────────────────────────
    isAdmin: (0, pg_core_1.boolean)("is_admin").notNull().default(false),
    isActive: (0, pg_core_1.boolean)("is_active").notNull().default(true),
    userStage: (0, pg_core_1.varchar)("user_stage").notNull().default("new"), // "new" | "active" | "paid" | "inactive"
    // ── Timestamps ───────────────────────────────────────────────────────────────
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow(), // NOT NULL via defaultNow()
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
    lastLogin: (0, pg_core_1.timestamp)("last_login"),
    // ── Presence ─────────────────────────────────────────────────────────────────
    lastSeen: (0, pg_core_1.timestamp)("last_seen"), // updated on every heartbeat
    isOnline: (0, pg_core_1.boolean)("is_online").notNull().default(false), // true while actively browsing
    // ── Service delivery ─────────────────────────────────────────────────────────
    generatedCv: (0, pg_core_1.varchar)("generated_cv", { length: 32000 }), // AI-rewritten CV text from ats_cv_optimization
    jobAlertsActive: (0, pg_core_1.boolean)("job_alerts_active").default(false), // true when job_alerts service is active
    language: (0, pg_core_1.varchar)("language", { length: 10 }).default("en"), // preferred language: en, sw, ar
    interests: (0, pg_core_1.jsonb)("interests").$type().default([]), // services the user has viewed
}, (table) => [
    (0, pg_core_1.index)("users_email_idx").on(table.email),
    (0, pg_core_1.index)("users_phone_idx").on(table.phone),
    (0, pg_core_1.index)("users_created_at_idx").on(table.createdAt),
    (0, pg_core_1.index)("users_plan_idx").on(table.plan),
    (0, pg_core_1.index)("users_is_active_idx").on(table.isActive),
]);
// ─── Active Sessions table ────────────────────────────────────────────────────
// One row per browser session. Upserted on every heartbeat ping.
// Allows the admin dashboard to see who is online and what page they're on.
exports.activeSessions = (0, pg_core_1.pgTable)("active_sessions", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    userId: (0, pg_core_1.varchar)("user_id").notNull().references(() => exports.users.id, { onDelete: "cascade" }),
    sessionId: (0, pg_core_1.varchar)("session_id").notNull().unique(), // connect.sid value
    currentPage: (0, pg_core_1.varchar)("current_page"), // window.location.pathname sent by frontend
    lastSeen: (0, pg_core_1.timestamp)("last_seen").defaultNow().notNull(),
    isOnline: (0, pg_core_1.boolean)("is_online").notNull().default(true),
}, (table) => [
    (0, pg_core_1.index)("active_sessions_user_id_idx").on(table.userId),
    (0, pg_core_1.index)("active_sessions_last_seen_idx").on(table.lastSeen),
]);
