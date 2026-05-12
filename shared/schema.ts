
import {
  pgTable,
  text,
  varchar,
  integer,
  timestamp,
  boolean,
  uuid,
} from "drizzle-orm/pg-core";

/* =========================
   USERS
========================= */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  name: varchar("name", { length: 100 }),
  passwordHash: varchar("password_hash", { length: 255 }),
  authMethod: varchar("auth_method", { length: 50 }),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  profileImageUrl: varchar("profile_image_url", { length: 255 }),
  country: varchar("country", { length: 100 }),
  subscriptionStatus: varchar("subscription_status", { length: 50 }),
  plan: varchar("plan", { length: 50 }),
  role: varchar("role", { length: 50 }),
  isActive: boolean("is_active"),
  isOnline: boolean("is_online"),
  userStage: varchar("user_stage", { length: 50 }),
  consentAccepted: boolean("consent_accepted"),
  lastLogin: timestamp("last_login"),
  lastSeen: timestamp("last_seen"),
  updatedAt: timestamp("updated_at"),
  generatedCv: text("generated_cv"),
  jobAlertsActive: text("job_alerts_active"),
  language: varchar("language", { length: 50 }),
  interests: text("interests"),
  referralCode: varchar("referral_code", { length: 100 }),
  isAdmin: boolean("is_admin").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

/* =========================
   PAYMENTS
========================= */
export const payments = pgTable("payments", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  amount: integer("amount").notNull(),
  mpesaCode: varchar("mpesa_code", { length: 50 }).unique(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  checkoutRequestId: varchar("checkout_request_id", { length: 100 }).notNull().unique(),
  merchantRequestId: varchar("merchant_request_id", { length: 100 }),
  reference: varchar("reference", { length: 100 }),
  provider: varchar("provider", { length: 50 }).default("mpesa"),
  callbackReceivedAt: timestamp("callback_received_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

/* =========================
   SUBSCRIPTIONS
========================= */
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  status: text("status").notNull().default("active"),
  plan: text("plan").notNull().default("pro"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});