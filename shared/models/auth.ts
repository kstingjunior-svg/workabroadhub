import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, timestamp, varchar, boolean, serial } from "drizzle-orm/pg-core";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// ─── User access levels (system permission) ───────────────────────────────────
// Separate from subscription plan. Used for admin panel access control.
export const UserRole = {
  USER: "USER",
  ADMIN: "ADMIN",
  SUPER_ADMIN: "SUPER_ADMIN",
} as const;

export type UserRoleType = typeof UserRole[keyof typeof UserRole];

// ─── Subscription plan tiers ─────────────────────────────────────────────────
// The `plan` column is the canonical subscription tier used throughout the app.
// Always use email (not id) to look up users externally.
export const PlanTier = {
  FREE: "free",
  BASIC: "basic",
  PRO: "pro",
} as const;

export type PlanTierType = typeof PlanTier[keyof typeof PlanTier];

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
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  // ── Required identity fields ────────────────────────────────────────────────
  email: varchar("email").notNull().unique(),       // UNIQUE NOT NULL — always use email to find users

  // ── Subscription tier ───────────────────────────────────────────────────────
  plan: varchar("plan").notNull().default("free"),  // "free" | "basic" | "pro" — denormalised from user_subscriptions for fast reads
  subscriptionStatus: varchar("subscription_status").notNull().default("inactive"), // "active" | "expired" | "inactive"

  // ── System permission level ─────────────────────────────────────────────────
  role: varchar("role").notNull().default("USER"),  // "USER" | "ADMIN" | "SUPER_ADMIN" — for admin panel access

  // ── Password authentication ─────────────────────────────────────────────────
  passwordHash: varchar("password_hash"),           // bcrypt hash — null for Replit OAuth users
  authMethod: varchar("auth_method").notNull().default("replit"), // "replit" | "email"

  // ── Profile ─────────────────────────────────────────────────────────────────
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  phone: varchar("phone"),
  country: varchar("country"),
  consentAccepted: boolean("consent_accepted").default(false),
  referralCode: varchar("referral_code").unique(),

  // ── Status ──────────────────────────────────────────────────────────────────
  isAdmin: boolean("is_admin").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  userStage: varchar("user_stage").notNull().default("new"), // "new" | "active" | "paid" | "inactive"

  // ── Timestamps ───────────────────────────────────────────────────────────────
  createdAt: timestamp("created_at").defaultNow(),  // NOT NULL via defaultNow()
  updatedAt: timestamp("updated_at").defaultNow(),
  lastLogin: timestamp("last_login"),

  // ── Presence ─────────────────────────────────────────────────────────────────
  lastSeen: timestamp("last_seen"),                          // updated on every heartbeat
  isOnline: boolean("is_online").notNull().default(false),   // true while actively browsing

  // ── Service delivery ─────────────────────────────────────────────────────────
  generatedCv: varchar("generated_cv", { length: 32000 }),  // AI-rewritten CV text from ats_cv_optimization
  jobAlertsActive: boolean("job_alerts_active").default(false), // true when job_alerts service is active
  language:  varchar("language", { length: 10 }).default("en"), // preferred language: en, sw, ar
  interests: jsonb("interests").$type<{ service: string }[]>().default([]), // services the user has viewed
}, (table) => [
  index("users_email_idx").on(table.email),
  index("users_phone_idx").on(table.phone),
  index("users_created_at_idx").on(table.createdAt),
  index("users_plan_idx").on(table.plan),
  index("users_is_active_idx").on(table.isActive),
]);

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// ─── Active Sessions table ────────────────────────────────────────────────────
// One row per browser session. Upserted on every heartbeat ping.
// Allows the admin dashboard to see who is online and what page they're on.
export const activeSessions = pgTable("active_sessions", {
  id:          serial("id").primaryKey(),
  userId:      varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionId:   varchar("session_id").notNull().unique(), // connect.sid value
  currentPage: varchar("current_page"),                  // window.location.pathname sent by frontend
  lastSeen:    timestamp("last_seen").defaultNow().notNull(),
  isOnline:    boolean("is_online").notNull().default(true),
}, (table) => [
  index("active_sessions_user_id_idx").on(table.userId),
  index("active_sessions_last_seen_idx").on(table.lastSeen),
]);

export type ActiveSession = typeof activeSessions.$inferSelect;
export type InsertActiveSession = typeof activeSessions.$inferInsert;
