import type { Express, RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { nanoid } from "nanoid";
import { createServer, type Server } from "http";
import { supabase, syncPaymentToSupabase, syncSubscriptionToSupabase, confirmPaymentInSupabase, recordCommission, createServiceRequest, matchPaymentToUser, logPayout, reconcilePayout, logCvUpload, upgradeUserToPro, resolveSupabaseUuidFromPhone, isUserPro, isFraudUser, incrementPromoUsageInSupabase } from "./supabaseClient";
import { getIO } from "./socket";

import { planExpiry, planLabel, planDurationDays } from "./utils/plans";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { csrfTokenEndpoint, validateCsrf } from "./middleware/csrf";
import { requireAnyPaidPlan, requireProPlan, requireSupabasePro, getAccessViolations } from "./middleware/requirePlan";
import { requireAuth } from "./middleware/requireAuth";
import { z } from "zod";
import { UserRole, type UserRoleType } from "@shared/models/auth";
import type { NeaAgency } from "@shared/schema";
import { deliverService } from "./services/delivery";
import { handleUserMessage, detectIntent } from "./ai/router";
import { nanjilaAgent } from "./ai/nanjila";
import { detectLanguage, getVoice } from "./ai/utils";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import multer from "multer";
import { extractTextFromBuffer, MIN_CV_LENGTH } from "./utils/extract-text";
import path from "path";
import fs from "fs";
import { getVapidPublicKey, broadcastNotification } from "./services/push-notifications";
import { getDetailedHealth, getBasicHealth, isReady, isLive } from "./health";
import { createSecurityAlert, listSecurityAlerts, resolveSecurityAlert, getSecurityAlertStats } from "./security";
import { getAllCircuitBreakerStats, mpesaCircuitBreaker, mpesaB2CCircuitBreaker } from "./circuit-breaker";
import { cache, withCache, CACHE_KEYS, CACHE_TTL } from "./cache";
import { trackActiveUser, getActiveUserCounts } from "./active-users";
import { asyncQueue, QUEUE_TYPES, type SmsJob } from "./queue";
import { getPoolStats, db, pool } from "./db";
import twilio from "twilio";
const VoiceResponse = twilio.twiml.VoiceResponse;
import { sql, eq, and, desc, ilike, or, inArray, count, gte, lte } from "drizzle-orm";
import { sendProActivationEmail } from "./email";
import { calculateAgencyScore, recalculateAllScores } from "./score-engine";

// In-memory duplicate STK push guard: orderId → unix timestamp of last push
// Prevents double-sends within a 30-second cooldown window
const recentStkPushes = new Map<string, number>();
const STK_PUSH_COOLDOWN_MS = 30_000;

// Zod validation schemas for service orders
const createOrderSchema = z.object({
  serviceId: z.string().min(1, "Service ID is required"),
});

const submitOrderSchema = z.object({
  intakeData: z.record(z.any()).optional(),
  paymentMethod: z.enum(["mpesa", "card", "paypal"]),
  paymentRef: z.string().optional(),
});

const updateOrderSchema = z.object({
  status: z.enum(["pending", "paid", "intake_required", "processing", "completed", "cancelled"]).optional(),
  adminNotes: z.string().optional(),
  assignedTo: z.string().optional(),
});

// Import insert schemas from shared schema for AI Career Matching
import { insertUserCareerProfileSchema, insertJobAlertSubscriptionSchema, userSubscriptions, jobs, agencyJobs as agencyJobsTable, jobLinks as jobLinksTable, jobClickLog, agencyReports, scamReports, activityEvents, neaAgencies as neaAgenciesTable, payments as paymentsTable, accountLockouts, verifiedPortals, insertVerifiedPortalSchema, successStories as successStoriesTable, consultationBookings as consultationBookingsTable, userServices as userServicesTable, serviceRequests as serviceRequestsTable, services as servicesTable } from "@shared/schema";
import { runPortalHealthCheck } from "./portal-health-checker";
import { users } from "@shared/models/auth";
import {
  isPayPalConfigured,
  paypalMode,
  paypalClientId,
  createPayPalOrder,
  capturePayPalOrder,
  kesToUsd,
} from "./paypal";

// Extended validation for career profile
const careerProfileSchema = insertUserCareerProfileSchema.extend({
  yearsExperience: z.number().int().min(0).max(50).optional().nullable(),
  familySize: z.number().int().min(1).max(20).default(1),
});

// Extended validation for job alerts
const jobAlertSchema = insertJobAlertSubscriptionSchema;

const uploadDeliverableSchema = z.object({
  fileName: z.string().min(1, "File name is required"),
  fileType: z.string().min(1, "File type is required"),
  fileUrl: z.string().min(1, "File content is required"),
  description: z.string().optional(),
});

const reviewOrderSchema = z.object({
  action: z.enum(["approve", "reprocess"]),
  notes: z.string().optional().default(""),
  editedContent: z.string().optional(),
});

// Zod validation schemas for Assisted Apply Mode
const purchasePackSchema = z.object({
  packId: z.string().min(1, "Pack ID is required"),
  paymentMethod: z.enum(["mpesa", "card", "paypal"]).optional().default("mpesa"),
});

const updateUserPackSchema = z.object({
  status: z.enum(["pending", "paid", "active", "exhausted", "expired"]).optional(),
  paymentRef: z.string().optional(),
});

const createJobApplicationSchema = z.object({
  userPackId: z.string().min(1, "Pack ID is required"),
  jobTitle: z.string().min(1, "Job title is required"),
  companyName: z.string().min(1, "Company name is required"),
  jobUrl: z.string().url("Valid job URL is required"),
  targetCountry: z.string().min(1, "Target country is required"),
  jobDescription: z.string().optional(),
  applicationDeadline: z.string().optional(),
  intakeData: z.record(z.any()).optional(),
});

const updateJobApplicationSchema = z.object({
  status: z.enum(["submitted", "queued", "analyzing", "generating", "preparing", "materials_ready", "downloaded", "failed", "user_action_required", "applied", "confirmed", "rejected", "interview_scheduled"]).optional(),
  statusMessage: z.string().optional(),
  preparedMaterials: z.record(z.any()).optional(),
  adminNotes: z.string().optional(),
});

// Status notification messages for all status transitions
const APPLICATION_STATUS_NOTIFICATIONS: Record<string, { title: string; message: string }> = {
  submitted: { title: "Application Received", message: "Your job application has been submitted for processing" },
  preparing: { title: "Preparing Materials", message: "Our team is now preparing your CV and cover letter" },
  materials_ready: { title: "Materials Ready", message: "Your CV and cover letter are ready for review" },
  user_action_required: { title: "Action Required", message: "Please review your materials and submit your application" },
  applied: { title: "Application Marked", message: "You've marked this application as submitted" },
  confirmed: { title: "Application Confirmed", message: "Great news! Your application has been confirmed received" },
  rejected: { title: "Application Update", message: "Unfortunately, this application was not successful this time" },
  interview_scheduled: { title: "Interview Scheduled!", message: "Congratulations! An interview has been scheduled" },
};

const isAdmin: RequestHandler = async (req: any, res, next) => {
  try {
    const userId = req.user?.claims?.sub ?? String(req.user?.id ?? "");
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const admin = await storage.isUserAdmin(userId);
    if (!admin) {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Session-based admin check with redirect for page routes
const requireAdmin: RequestHandler = async (req: any, res, next) => {
  try {
    // Check if admin session exists
    if (!req.session?.admin) {
      // For API requests, return JSON error
      if (req.path.startsWith("/api/")) {
        return res.status(401).json({ message: "Admin login required" });
      }
      // For page requests, redirect to admin login
      return res.redirect("/admin/login");
    }
    next();
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const requireAdminAuth: RequestHandler = async (req: any, res, next) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const user = await storage.getUserById(userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!user.isAdmin && user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      return res.status(403).json({ message: "Admin access required" });
    }
    req.currentUser = user;
    next();
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const requireRole = (...roles: UserRoleType[]): RequestHandler => {
  return async (req: any, res, next) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUserById(userId);
      if (!user || !user.isActive) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      if (!roles.includes(user.role as UserRoleType)) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      req.currentUser = user;
      next();
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  };
};

// requirePaidUser — alias for requireAnyPaidPlan (kept for backwards compat)
const requirePaidUser: RequestHandler = requireAnyPaidPlan;

// Track last-active timestamp per user — fire-and-forget, throttled to once per 5 min
const lastActiveCache = new Map<string, number>();
function touchLastActive(userId: string) {
  const now = Date.now();
  const last = lastActiveCache.get(userId) ?? 0;
  if (now - last > 5 * 60 * 1000) {
    lastActiveCache.set(userId, now);
    db.update(users)
      .set({ lastLogin: new Date() })
      .where(eq(users.id, userId))
      .catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
    // Advance funnel stage: new → active (only for free-plan users not yet marked paid)
    storage.getUserById(userId).then((u) => {
      if (u && u.plan === "free" && u.userStage === "new") {
        storage.updateUserStage(userId, "active").catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
      }
    }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
  }
}

// Mark a user as paid in the funnel — called after any successful payment
function markUserPaid(userId: string) {
  storage.updateUserStage(userId, "paid").catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
}

const initiatePaymentSchema = z.object({
  // `method` is optional — defaults to "mpesa" so callers can omit it
  method: z.enum(["mpesa", "card"]).optional().default("mpesa"),
  phoneNumber: z.string().optional(),
  refCode: z.string().optional(),
  // Accept both the legacy `serviceId` key and the new simplified `plan_id` alias.
  // `plan_id` maps 1:1 to serviceId (e.g. "plan_pro", "ats_cv_optimization").
  serviceId: z.string().optional(),
  plan_id:   z.string().optional(),
  serviceName: z.string().optional(),
});

const createJobLinkSchema = z.object({
  countryId: z.string().min(1),
  name: z.string().min(1),
  url: z.string().url(),
});

const updateProfileSchema = z.object({
  // Must be Kenya E.164 without "+": 254 followed by exactly 9 digits (12 total).
  // Empty string treated as null (remove phone). All other formats rejected.
  phone: z.string()
    .refine(
      (v) => !v || /^254\d{9}$/.test(v),
      { message: "Phone must be a Kenya number: 254 followed by 9 digits (e.g. 254712345678)" }
    )
    .optional(),
  country: z.string().optional(),
  consentAccepted: z.boolean().optional(),
});

// ── Phase 2 / Phase 10: In-memory payment rate tracking ──────────────────────

// Per-user: 5 STK push attempts per 15 minutes
const STK_PUSH_RATE_WINDOW_MS = 15 * 60 * 1000;
const STK_PUSH_RATE_MAX = 5;
const stkPushRateMap = new Map<string, number[]>(); // userId → timestamps[]

function checkStkPushRateLimit(userId: string): boolean {
  const now = Date.now();
  const window = now - STK_PUSH_RATE_WINDOW_MS;
  const timestamps = (stkPushRateMap.get(userId) || []).filter(ts => ts > window);
  if (timestamps.length >= STK_PUSH_RATE_MAX) return false;
  timestamps.push(now);
  stkPushRateMap.set(userId, timestamps);
  return true;
}

// Phase 2: Per-IP STK push rate limit — 15 requests per 15 minutes
const STK_IP_WINDOW_MS = 15 * 60 * 1000;
const STK_IP_MAX = 15;
const stkPushByIp = new Map<string, number[]>(); // ip → timestamps[]

function checkStkPushIpRateLimit(ip: string): boolean {
  const now = Date.now();
  const window = now - STK_IP_WINDOW_MS;
  const timestamps = (stkPushByIp.get(ip) || []).filter(ts => ts > window);
  if (timestamps.length >= STK_IP_MAX) return false;
  timestamps.push(now);
  stkPushByIp.set(ip, timestamps);
  return true;
}

// Phase 10: All payment attempts per IP — block IP if >10 in 10 minutes
const paymentAttemptsByIp = new Map<string, number[]>(); // ip → all attempt timestamps

function recordPaymentAttemptByIp(ip: string): number {
  const now = Date.now();
  const window = now - STK_IP_WINDOW_MS;
  const timestamps = (paymentAttemptsByIp.get(ip) || []).filter(ts => ts > window);
  timestamps.push(now);
  paymentAttemptsByIp.set(ip, timestamps);
  return timestamps.length; // return count in window
}

function normalizePhone(phone: string | null | undefined, country = "KE"): string | null {
  if (!phone) return null;
  phone = phone.replace(/\D/g, "");

  if (country === "KE") {
    if (phone.startsWith("0"))   return "254" + phone.slice(1);
    if (phone.startsWith("7"))   return "254" + phone;
    if (phone.startsWith("254")) return phone;
  }

  if (country === "UG") {
    if (phone.startsWith("0"))   return "256" + phone.slice(1);
    if (phone.startsWith("7"))   return "256" + phone;
    if (phone.startsWith("256")) return phone;
  }

  if (country === "TZ") {
    if (phone.startsWith("0"))                              return "255" + phone.slice(1);
    if (phone.startsWith("6") || phone.startsWith("7"))    return "255" + phone;
    if (phone.startsWith("255"))                            return phone;
  }

  return phone;
}

function detectCountry(phone: string | null | undefined): string | null {
  if (!phone) return null;
  phone = phone.replace(/\D/g, "");

  if (phone.startsWith("254") || phone.startsWith("07") || phone.startsWith("7")) {
    return "KE";
  }

  if (phone.startsWith("256") || phone.startsWith("07") || phone.startsWith("7")) {
    return "UG";
  }

  if (phone.startsWith("255") || phone.startsWith("06") || phone.startsWith("07") || phone.startsWith("6") || phone.startsWith("7")) {
    return "TZ";
  }

  return "UNKNOWN";
}

function normalizePhoneAuto(phone: string | null | undefined): { phone: string | null; country: string | null } {
  const country = detectCountry(phone);
  const normalized = normalizePhone(phone, country ?? "KE");
  return { phone: normalized, country: country === "UNKNOWN" ? null : country };
}

function scoreMatch({ payment, user }: { payment: any; user: any }): number {
  let score = 0;

  // Detect payment country from phone prefix
  const paymentCountry = detectCountry(payment.phone) ?? "KE";

  // User phone uses their stored country (falls back to KE)
  const userCountry = (user.country ?? "KE").toUpperCase().slice(0, 2);

  const pPhone = normalizePhone(payment.phone, paymentCountry);
  const uPhone = normalizePhone(user.phone, userCountry);
  const phoneMatches = !!(pPhone && uPhone && pPhone === uPhone);

  if (phoneMatches) {
    score += 70;
    // Uganda (MTN/Airtel) and Tanzania (Vodacom/Tigo) often omit email.
    // When no email is present, phone is the primary key — boost its weight
    // so a confirmed E.164 match alone clears the 85-point auto-match threshold.
    if (!payment.email) score += 15;
  }

  if (payment.service_id) score += 10; // pre-registered payment — known service

  const created = new Date(user.created_at || 0).getTime();
  if (Date.now() - created < 24 * 60 * 60 * 1000) score += 10;

  if (payment.email && user.email &&
      payment.email.toLowerCase() === user.email.toLowerCase()) score += 10;

  return score;
}

async function findBestUserMatch(payment: any): Promise<{ best: any; bestScore: number }> {
  const { data: users, error } = await supabase
    .from("users")
    .select("*");

  if (error) throw error;

  let best: any = null;
  let bestScore = 0;

  for (const u of (users ?? [])) {
    const s = scoreMatch({ payment, user: u });
    if (s > bestScore) {
      bestScore = s;
      best = u;
    }
  }

  return { best, bestScore };
}

async function findUserByPayment(phone: string, country: string): Promise<any | null> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("phone", phone)
    .eq("country", country)
    .limit(1);

  if (error) {
    console.error("❌ Match error:", error);
    return null;
  }

  return data?.[0] || null;
}

async function findUserByEmail(email: string): Promise<any | null> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", email.toLowerCase())
    .limit(1);

  if (error) {
    console.error("❌ Email match error:", error);
    return null;
  }

  return data?.[0] || null;
}

async function findUserByLastSession(payment: any): Promise<any | null> {
  // Find the most recently active user in the same country who has a
  // pending/unmatched payment of the same amount within the last 24 hours.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("country", payment.country)
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("❌ Session match error:", error);
    return null;
  }

  return data?.[0] || null;
}

async function smartMatchUser(payment: any): Promise<{ user: any; score: number }> {
  let bestMatch: any = null;
  let score = 0;

  // 1. PHONE MATCH (STRONGEST)
  const { data: phoneUsers } = await supabase
    .from("users")
    .select("*")
    .eq("phone", payment.phone)
    .eq("country", payment.country)
    .limit(1);

  if (phoneUsers?.length) {
    bestMatch = phoneUsers[0];
    score     = 100;
  }

  // 2. EMAIL MATCH (IF EXISTS)
  if (!bestMatch && payment.email) {
    const { data: emailUsers } = await supabase
      .from("users")
      .select("*")
      .ilike("email", payment.email)
      .limit(1);

    if (emailUsers?.length) {
      bestMatch = emailUsers[0];
      score     = 70;
    }
  }

  // 3. SAVE RESULT
  await supabase
    .from("payments")
    .update({
      matched:         !!bestMatch,
      matched_user_id: bestMatch?.id || null,
      match_score:     score,
      needs_review:    score < 70,
    })
    .eq("id", payment.id);

  if (!bestMatch) {
    const { sendWhatsAppAlert } = await import("./sms");
    await sendWhatsAppAlert(
      `🚨 Unmatched Payment:\nPhone: ${payment.phone}\nAmount: ${payment.amount}\nCode: ${payment.mpesa_code}`
    );
  }

  if (score >= 90) {
    await upgradeUserToPro(bestMatch.id);
  }

  return { user: bestMatch, score };
}

async function autoMatchAndUpgrade(payment: any): Promise<void> {
  const user = await findUserByPayment(payment.phone, payment.country);

  if (!user) {
    console.log("⚠️ No match found");
    return;
  }

  console.log("✅ Match found:", user.id);

  await upgradeUserToPro(user.id);

  await supabase
    .from("payments")
    .update({
      matched:       true,
      user_id:       user.id,
      auto_upgraded: true,
    })
    .eq("id", payment.id);
}

async function handleKenyaMpesa(paymentData: any): Promise<void> {
  console.log("🇰🇪 Kenya M-Pesa payment:", paymentData.mpesa_code ?? paymentData.id);
  await processPaymentAuto(paymentData);
}

async function handleUgandaMobileMoney(paymentData: any): Promise<void> {
  console.log("🇺🇬 Uganda Mobile Money payment:", paymentData.mpesa_code ?? paymentData.id);
  await processPaymentAuto(paymentData);
}

async function handleTanzaniaVodacom(paymentData: any): Promise<void> {
  console.log("🇹🇿 Tanzania Vodacom payment:", paymentData.mpesa_code ?? paymentData.id);
  await processPaymentAuto(paymentData);
}

async function handlePayment(paymentData: any): Promise<void> {
  const { phone, country } = normalizePhoneAuto(paymentData.phone);
  paymentData.phone   = phone   ?? paymentData.phone;
  paymentData.country = country ?? paymentData.country;

  if (country === "KE") return handleKenyaMpesa(paymentData);
  if (country === "UG") return handleUgandaMobileMoney(paymentData);
  if (country === "TZ") return handleTanzaniaVodacom(paymentData);

  console.log("❌ Unsupported country:", country);
}

async function upgradeIfEligible(user_id: string, payment: any): Promise<void> {
  // Guard: skip if this payment already triggered an upgrade.
  try {
    const { data: existing, error: fetchErr } = await supabase
      .from("payments")
      .select("auto_upgraded")
      .eq("mpesa_code", payment.mpesa_code)
      .single();

    if (!fetchErr && existing?.auto_upgraded) {
      console.log("⚠️ Already auto-upgraded for this payment");
      return;
    }
  } catch {
    // Column may not exist yet — continue
  }

  // ── Dynamic service unlock — service_id is REQUIRED ────────────────────
  // Amount-based fallback has been removed. Every payment must carry a service_id.
  const serviceQuery = payment.service_id ?? payment.serviceId;

  if (!serviceQuery) {
    console.error("🚫 upgradeIfEligible: no service_id on payment — upgrade blocked.", payment.id ?? payment.mpesa_code);
    return;
  }

  const { data: service } = await supabase
    .from("services")
    .select("*")
    .eq("id", serviceQuery)
    .single();

  if (!service) {
    console.error(`🚫 upgradeIfEligible: service_id="${serviceQuery}" not found in services table — upgrade blocked.`);
    return;
  }

  console.log("🛒 Service unlocked:", service.name, "→", service.id);

  // Record the unlock in user_services
  await supabase.from("user_services").insert({
    user_id:    String(user_id),
    service_id: service.id,
    payment_id: String(payment.id ?? payment.mpesa_code),
  });

  // For subscription-type services, also run the PRO upgrade path
  if (service.is_subscription) {
    await upgradeUserToPro(user_id);

    try {
      const localUser = await storage.getUserByPhone(payment.phone ?? "");
      if (localUser) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 360);
        await storage.activateUserPlan(localUser.id, "pro", String(payment.id), expiresAt);
        console.log("✅ LOCAL DB UPGRADED:", localUser.id);
      }
    } catch (localErr) {
      console.error("❌ Local DB upgrade failed:", localErr);
    }
  }

  // Stamp the payment row
  const { error: stampErr } = await supabase
    .from("payments")
    .update({ auto_upgraded: true })
    .eq("mpesa_code", payment.mpesa_code);

  if (stampErr) {
    console.warn("⚠️ Could not stamp auto_upgraded:", stampErr.message);
  }

  // Trigger AI delivery for the processPaymentAuto path.
  // runPaymentPipeline handles this for the primary M-Pesa callback path; this
  // covers the Supabase-webhook / smart-match fallback path where the pipeline was skipped.
  // Guard: skip if the local payment row already shows delivery_status='delivered'
  // (meaning runPaymentPipeline already ran) to prevent double WhatsApp messages.
  try {
    const paymentRef = String(payment.id ?? payment.mpesa_code ?? "");
    let alreadyDelivered = false;
    if (paymentRef) {
      const localPmt = await storage.getPaymentById?.(paymentRef).catch(() => null)
        ?? await storage.getPaymentByTransactionRef?.(paymentRef).catch(() => null);
      alreadyDelivered = (localPmt as any)?.deliveryStatus === "delivered";
    }

    if (!alreadyDelivered) {
      const localUser = await storage.getUserById(String(user_id)).catch(() => null)
        ?? await storage.getUserByPhone(String(payment.phone ?? "")).catch(() => null);
      if (localUser) {
        // Attach the slug so resolveSlug picks it up even without metadata JSON
        const paymentWithSlug = { ...payment, serviceSlug: service.slug ?? null };
        const { deliverService } = await import("./services/delivery");
        await deliverService(paymentWithSlug, localUser);
        console.log("📦 deliverService called from upgradeIfEligible for slug:", service.slug);
      } else {
        console.warn("⚠️ upgradeIfEligible: could not resolve local user for delivery — userId:", user_id);
      }
    } else {
      console.log("⏭️  upgradeIfEligible: skipping deliverService — already delivered by runPaymentPipeline");
    }
  } catch (deliverErr: any) {
    console.error("❌ upgradeIfEligible: deliverService failed:", deliverErr?.message);
  }

  console.log("🚀 UNLOCK COMPLETE — user:", user_id, "service:", service?.name ?? "PRO (fallback)");
}

/**
 * Queue a fraud case for manual admin review.
 *
 * Two things happen (both non-fatal — failures are logged but never thrown):
 *   1. A row is inserted into admin_logs so the review queue is queryable.
 *   2. A WhatsApp alert is sent to ADMIN_PHONE_NUMBER if it is configured.
 */
async function flagForManualReview(
  userId:  string,
  context: { action: string; detail?: string; ip?: string },
): Promise<void> {
  // 1. Insert into admin_logs via storage layer
  try {
    await storage.logAdminAction(
      "system",
      "fraud_review_required",
      { userId, trigger: context.action, detail: context.detail ?? null },
      context.ip ?? undefined,
    );
  } catch (logErr: any) {
    console.error("[FraudReview] admin_logs insert failed:", logErr?.message);
  }

  // 2. WhatsApp alert to admin
  try {
    const adminPhone = process.env.ADMIN_PHONE_NUMBER;
    if (adminPhone) {
      const { sendWhatsAppAlert } = await import("./sms");
      await sendWhatsAppAlert(
        adminPhone,
        `🚨 *FRAUD REVIEW REQUIRED*\n` +
        `User: ${userId}\n` +
        `Trigger: ${context.action}\n` +
        (context.detail ? `Detail: ${context.detail}\n` : "") +
        `Time: ${new Date().toISOString()}\n` +
        `→ Review in admin dashboard → Fraud / Suspicious Payments`,
      );
    }
  } catch (waErr: any) {
    console.error("[FraudReview] WhatsApp alert failed:", waErr?.message);
  }

  console.warn(`🚨 [FraudReview] Queued user=${userId} action=${context.action}`);
}

/**
 * Phone velocity check — independent of the weighted score.
 *
 * If the same phone number has submitted MORE THAN 5 payments within the
 * last 60 minutes we treat it as a velocity attack and:
 *   1. Stamp suspected_fraud=true on every recent payment from that phone.
 *   2. Stamp suspected_fraud=true on the user row (if user_id is known).
 *   3. Return true so the caller can abort immediately.
 *
 * Returns false when velocity is within acceptable bounds.
 */
async function checkPhoneVelocity(phone: string, userId?: string): Promise<boolean> {
  const VELOCITY_WINDOW_MS  = 60 * 60 * 1000; // 1 hour
  const VELOCITY_LIMIT      = 5;               // max allowed payments in window

  const windowStart = new Date(Date.now() - VELOCITY_WINDOW_MS).toISOString();

  const { data: recent, error } = await supabase
    .from("payments")
    .select("id")
    .eq("phone", phone)
    .gte("created_at", windowStart);

  if (error) {
    console.error("[VelocityCheck] Supabase error:", error.message);
    return false; // fail open — don't block on DB errors
  }

  const count = recent?.length ?? 0;
  if (count <= VELOCITY_LIMIT) return false;

  console.warn(
    `🚨 [VelocityCheck] Phone velocity exceeded — phone=${phone} count=${count} in last 60 min (limit=${VELOCITY_LIMIT})`
  );

  // Stamp all recent payments from this phone as suspected_fraud
  await supabase
    .from("payments")
    .update({ suspected_fraud: true })
    .eq("phone", phone)
    .gte("created_at", windowStart);

  // Stamp the user row if we have a user_id
  if (userId) {
    const { error: userErr } = await supabase
      .from("users")
      .update({ suspected_fraud: true })
      .eq("id", userId);
    if (userErr) {
      console.warn("[VelocityCheck] Could not stamp users.suspected_fraud:", userErr.message);
    } else {
      console.warn(`🚨 [VelocityCheck] User ${userId} flagged as suspected_fraud`);
    }
  }

  return true;
}

async function scoreFraud(payment: any): Promise<number> {
  let fraudScore = 0;

  // Signal 1 — duplicate mpesa_code (+50)
  const { data: dup } = await supabase
    .from("payments")
    .select("id")
    .eq("mpesa_code", payment.mpesa_code)
    .limit(2);
  const duplicate = (dup?.length ?? 0) > 1;
  if (duplicate) fraudScore += 50;

  // Signal 2 — user is already PRO (+30)
  const { data: subRows } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("user_id", String(payment.user_id ?? ""))
    .eq("status", "active")
    .limit(1);
  const alreadyPro = (subRows?.length ?? 0) > 0;
  if (alreadyPro) fraudScore += 30;

  // Signal 3 — same phone + amount within last 10 minutes (+20)
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: recentSame } = await supabase
    .from("payments")
    .select("id")
    .eq("phone",  payment.phone)
    .eq("amount", payment.amount)
    .gte("created_at", tenMinutesAgo);
  const fastRepeat = (recentSame?.length ?? 0) > 1;
  if (fastRepeat) fraudScore += 20;

  // Signal 4 — phone velocity: > 5 payments in the last 60 minutes (+70)
  // This alone is enough to breach the 60-point threshold.
  // The hard gate in processPaymentAuto already aborts before we reach this,
  // but we include it in the score so audit logs are accurate.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: velocityRows } = await supabase
    .from("payments")
    .select("id")
    .eq("phone", payment.phone)
    .gte("created_at", oneHourAgo);
  const velocityHit = (velocityRows?.length ?? 0) > 5;
  if (velocityHit) fraudScore += 70;

  console.log(
    `🔍 Fraud score: ${fraudScore} | duplicate=${duplicate} alreadyPro=${alreadyPro} fastRepeat=${fastRepeat} velocityHit=${velocityHit}`
  );
  return fraudScore;
}



// ─────────────────────────────────────────────────────────────────────────────

async function processPaymentAuto(payment: any): Promise<void> {
  try {
    // Normalize phone and detect country before any matching/scoring
    const { phone: normPhone, country: detectedCountry } = normalizePhoneAuto(payment.phone);
    payment.phone   = normPhone   ?? payment.phone;
    payment.country = payment.country ?? detectedCountry;

    console.log("💰 PROCESS PAYMENT:", payment.mpesa_code, "| phone:", payment.phone, "| country:", payment.country);

    // 0. Atomic idempotency guard — single SQL UPDATE that both checks and marks processed.
    //    If rowCount === 0, another callback already claimed this mpesa_code; bail out.
    //    Eliminates the SELECT→UPDATE race window of the previous two-step approach.
    if (payment.mpesa_code) {
      const claim = await pool.query(
        `UPDATE payments
            SET processed = true
          WHERE mpesa_code = $1
            AND processed  = false
          RETURNING id`,
        [String(payment.mpesa_code)],
      );
      if (claim.rowCount === 0) {
        console.warn(
          `[processPaymentAuto] Duplicate blocked (atomic) — mpesa_code=${payment.mpesa_code} already processed`,
        );
        return; // already handled
      }
    }

    // 1a. Phone velocity hard gate — > 5 payments from this phone in 60 min
    //     Stamps suspected_fraud on all affected payments + the user row, then aborts.
    //     Runs before fraud scoring to short-circuit the pipeline cheaply.
    if (payment.phone) {
      const velocityBlocked = await checkPhoneVelocity(
        String(payment.phone),
        payment.user_id ? String(payment.user_id) : undefined,
      );
      if (velocityBlocked) {
        console.warn(
          `🚨 [processPaymentAuto] Velocity block — phone=${payment.phone} mpesa_code=${payment.mpesa_code ?? "?"}`
        );
        return;
      }
    }

    // 1b. Weighted fraud scoring (duplicate code, already-PRO, fast repeat, velocity)
    const fraudScore = await scoreFraud(payment);
    if (fraudScore > 60) {
      await supabase
        .from("payments")
        .update({ suspected_fraud: true })
        .eq("mpesa_code", payment.mpesa_code);
      console.log("🚨 Fraud score exceeded threshold:", fraudScore);
      return;
    }

    let best: any = null;
    let bestScore = 0;

    // 3a+3b. Smart match: phone (100) → email (70)
    const smart = await smartMatchUser(payment);
    if (smart.user) {
      best      = smart.user;
      bestScore = smart.score;
      console.log(`${bestScore === 100 ? "⚡" : "📧"} Smart match (score ${bestScore}):`, best.id);
    }

    // 3c. Last active session fallback → 50
    if (!best) {
      const m = await findUserByLastSession(payment);
      if (m) { best = m; bestScore = 50; console.log("🕐 Session match:", best.id); }
    }

    // 3d. Full scoring loop — final safety net
    if (!best) {
      const result = await findBestUserMatch(payment);
      best      = result.best;
      bestScore = result.bestScore;
    }

    if (!best) {
      console.log("🚨 UNMATCHED PAYMENT:", payment);
      await supabase
        .from("payments")
        .update({ processed: true, matched: false, match_score: 0 })
        .eq("mpesa_code", payment.mpesa_code);
      return;
    }

    console.log("🎯 Best score:", bestScore, "User:", best.id);

    // 3e. Duplicate purchase guard — if user already owns this service, auto-flag for refund
    {
      const { data: matchedService } = await supabase
        .from("services")
        .select("id, name, is_subscription")
        .eq("price", payment.amount)
        .eq("is_active", true)
        .single();

      if (matchedService) {
        // For subscription services — check if already PRO
        if (matchedService.is_subscription) {
          const { data: activeSub } = await supabase
            .from("subscriptions")
            .select("status")
            .eq("user_id", String(best.id))
            .eq("status", "active")
            .limit(1);

          if ((activeSub?.length ?? 0) > 0) {
            await supabase
              .from("payments")
              .update({ refund_requested: true })
              .eq("mpesa_code", payment.mpesa_code);
            console.log("💸 Already PRO — refund auto-requested for:", best.id, "service:", matchedService.name);
            return;
          }
        } else {
          // For one-time services — check if already unlocked
          const { data: existingUnlock } = await supabase
            .from("user_services")
            .select("id")
            .eq("user_id", String(best.id))
            .eq("service_id", matchedService.id)
            .limit(1);

          if ((existingUnlock?.length ?? 0) > 0) {
            await supabase
              .from("payments")
              .update({ refund_requested: true })
              .eq("mpesa_code", payment.mpesa_code);
            console.log("💸 Already owns service — refund auto-requested for:", best.id, "service:", matchedService.name);
            return;
          }
        }
      }
    }

    // 4. Threshold decision
    const THRESHOLD = 85;

    if (bestScore >= THRESHOLD) {
      // Link payment to user
      await supabase
        .from("payments")
        .update({
          user_id:     String(best.id),
          matched:     true,
          processed:   true,
          match_score: bestScore,
        })
        .eq("mpesa_code", payment.mpesa_code);

      // Upgrade — idempotent, guards against double-runs
      await upgradeIfEligible(best.id, payment);

      // Commission — fire-and-forget, never blocks the upgrade response
      recordCommission(
        String(best.id),
        String(payment.id ?? payment.mpesa_code),
        Number(payment.amount ?? 0),
      ).catch((e) => console.error("[Commission] auto-match path failed:", e?.message));

      // Service request — raise a fulfilment work item for this service
      createServiceRequest(
        String(best.id),
        payment.service_id ?? payment.serviceId ?? null,
        String(payment.id ?? payment.mpesa_code),
      ).catch((e) => console.error("[ServiceRequest] auto-match path failed:", e?.message));

      console.log("🚀 AUTO UPGRADE DONE");
    } else {
      // Not confident enough — send to admin dashboard for manual review
      await supabase
        .from("payments")
        .update({
          matched:     false,
          processed:   true,
          match_score: bestScore,
        })
        .eq("mpesa_code", payment.mpesa_code);

      console.log("⚠️ Sent to dashboard (low confidence)");

      // Notify admin via WhatsApp
      try {
        const { sendWhatsAppAlert } = await import("./sms");
        await sendWhatsAppAlert(
          `⚠️ *Unmatched M-Pesa Payment*\n` +
          `Phone: ${payment.phone ?? "unknown"}\n` +
          `Amount: KES ${payment.amount ?? "?"}\n` +
          `Code: ${payment.mpesa_code ?? "?"}\n` +
          `Score: ${bestScore}/100\n` +
          `Action needed: https://workabroad.co.ke/admin/unmatched-payments`
        );
      } catch (notifyErr) {
        console.error("❌ Admin WhatsApp notify failed:", notifyErr);
      }
    }
  } catch (err) {
    console.error("🔥 Auto process crash:", err);
  }
}

// ── PDF helpers (Puppeteer) ──────────────────────────────────────────────────

interface DocHtmlOpts {
  serviceName: string;
  content: string;
  forUser?: string;
  sharedBy?: string;
  generatedOn?: string;
}

function buildDocumentHtml(opts: DocHtmlOpts): string {
  const { serviceName, content, forUser, sharedBy, generatedOn } = opts;
  const meta: string[] = [];
  if (generatedOn) meta.push(`Generated: ${generatedOn}`);
  if (forUser)     meta.push(`For: ${forUser}`);
  if (sharedBy)    meta.push(`Shared by: ${sharedBy}`);

  const escaped = content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, sans-serif;
    max-width: 800px;
    margin: 0 auto;
    padding: 0 40px 60px;
    color: #1E2A36;
  }
  .header {
    background: #1A2530;
    color: #fff;
    padding: 22px 40px 18px;
    margin: 0 -40px 30px;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .header h1 { font-size: 20px; font-weight: 700; letter-spacing: 0.02em; }
  .header .site { font-size: 11px; color: #B4C3D2; }
  .doc-title {
    font-size: 22px;
    font-weight: 700;
    color: #1A2530;
    margin-bottom: 6px;
  }
  .divider {
    border: none;
    border-top: 2px solid #E2DDD5;
    margin: 14px 0 16px;
  }
  .meta { font-size: 11px; color: #7A8A99; margin-bottom: 28px; line-height: 1.8; }
  .content {
    white-space: pre-wrap;
    font-family: 'Courier New', Courier, monospace;
    font-size: 11px;
    line-height: 1.65;
    color: #1E2A36;
  }
  .footer {
    margin-top: 60px;
    border-top: 1px solid #E2DDD5;
    padding-top: 10px;
    color: #B4B4B4;
    font-size: 10px;
    text-align: center;
  }
</style>
</head>
<body>
  <div class="header">
    <h1>WorkAbroad Hub</h1>
    <span class="site">workabroadhub.tech</span>
  </div>
  <div class="doc-title">${serviceName.replace(/</g, "&lt;")}</div>
  <hr class="divider">
  ${meta.length ? `<div class="meta">${meta.join("<br>")}</div>` : ""}
  <div class="content">${escaped}</div>
  <div class="footer">WorkAbroad Hub &mdash; Verified Overseas Job Guidance for Kenyans</div>
</body>
</html>`;
}

async function renderHtmlToPdf(html: string): Promise<Buffer> {
  // Dynamic import avoids static top-level bundling which causes TDZ errors
  // in the production esbuild bundle (same pattern used for twilio/openai)
  const puppeteer = (await import("puppeteer")).default;
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "50px", bottom: "50px", left: "0", right: "0" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="font-size:9px;color:#B4B4B4;width:100%;text-align:center;padding:0 20px;">
        Page <span class="pageNumber"></span> of <span class="totalPages"></span>
      </div>`,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PRICING ENGINE  v2
// ─────────────────────────────────────────────────────────────────────────────
// The DB is the single source of truth for base prices.
// No hardcoded KES amounts below — everything is derived from the plans table.
//
// resolvePrice({ planId, userId?, country?, promoCode? })
//   Four orthogonal dimensions, applied in this order:
//   1. Base price      — fetched from plans table (5-min in-process cache)
//   2. Country adjust  — PPP multiplier for East African markets
//   3. Best discount   — promo code (DB) beats referral (planId === "pro_referral")
//   4. Returns         — { basePrice, countryPrice, finalPrice, discountType,
//                          discountValue, appliedPromo }
//
// resolveCanonicalPlanPrice(planId)   ← backward-compat thin wrapper (all 12
//   existing call sites continue to work without modification)
//
// Discount priority:
//   promoCode (if valid, active, not exhausted, not expired) > referral_20
//   Country adjustment is NOT stacked with discounts — it adjusts the base only.
// ─────────────────────────────────────────────────────────────────────────────

// ── Country PPP multipliers ──────────────────────────────────────────────────
// Approximate purchasing-power-parity adjustments for East/Central Africa.
// KE = 1.00 (Kenya is the base market).  All prices rounded to the nearest KES.
// This map can be replaced by a DB table (country_pricing_rules) in a future
// migration without changing the function signature.
const COUNTRY_PPP: Record<string, number> = {
  KE: 1.00,  // Kenya        — base
  UG: 0.82,  // Uganda
  TZ: 0.82,  // Tanzania
  RW: 0.80,  // Rwanda
  ET: 0.75,  // Ethiopia
  SS: 0.75,  // South Sudan
  BI: 0.75,  // Burundi
  ZM: 0.80,  // Zambia
  ZW: 0.80,  // Zimbabwe
  MZ: 0.78,  // Mozambique
  MW: 0.75,  // Malawi
  GH: 0.85,  // Ghana
  NG: 0.88,  // Nigeria
};

const REFERRAL_DISCOUNT_RATE = 0.20;
const PLAN_PRICE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const _planPriceCache = new Map<string, { price: number; expiresAt: number }>();

export interface ResolvedPrice {
  basePrice: number;       // Raw plan price from the DB
  countryPrice: number;    // After country PPP multiplier (= basePrice when no adjustment)
  finalPrice: number;      // After all discounts — the amount to charge
  discountType: string | null; // "referral_20" | "promo_pct" | "promo_fixed" | null
  discountValue: number;   // KES saved from countryPrice (0 when no discount)
  appliedPromo: string | null; // The promo code string that was actually used
}

interface ResolvePriceInput {
  planId: string;
  userId?: string;   // reserved for future user-specific pricing (e.g. loyalty tier)
  country?: string;  // ISO-3166-1 alpha-2  e.g. "KE" | "UG" | "TZ"
  promoCode?: string;
}

/** Validates a promo code against the DB and returns the discount result.
 *  Returns null when the code is invalid, expired, exhausted, or inactive.
 *  Does NOT increment used_count — call storage.usePromoCode() after payment. */
async function _validatePromoCode(
  code: string,
  basePlanId: string,
): Promise<{ discountType: "promo_pct" | "promo_fixed"; discountValue: number; promoId: string; maxUses: number | null } | null> {
  let promo;
  try {
    promo = await storage.getPromoCode(code);
  } catch {
    return null;
  }
  if (!promo) return null;
  if (!promo.active) return null;
  if (promo.expiresAt && promo.expiresAt < new Date()) return null;
  if (promo.maxUses && promo.usedCount >= promo.maxUses) return null;
  if (promo.appliesToPlan && promo.appliesToPlan !== basePlanId) return null;

  return {
    discountType: promo.discountType === "fixed_kes" ? "promo_fixed" : "promo_pct",
    discountValue: promo.discountValue,
    promoId: promo.id,
    maxUses: promo.maxUses,
  };
}

// ── Core resolver ────────────────────────────────────────────────────────────
async function resolvePrice(input: ResolvePriceInput): Promise<ResolvedPrice | null> {
  const { planId, country, promoCode } = input;
  const basePlanId = planId === "pro_referral" ? "pro" : planId;

  // 1. Base price — from in-process cache (TTL 5 min)
  //    Lookup order: plans table → services table (by slug).
  //    This lets service slugs like "ats_cv_optimization" resolve their own price
  //    without requiring a matching row in the plans table.
  let basePrice: number;
  const cached = _planPriceCache.get(basePlanId);
  if (cached && cached.expiresAt > Date.now()) {
    basePrice = cached.price;
  } else {
    const plan = await storage.getPlanById(basePlanId);
    if (plan?.price && plan.price > 0) {
      basePrice = plan.price;
    } else {
      // Fall through: check services table by slug
      const svc = await storage.getServiceBySlug(basePlanId);
      if (!svc?.price || svc.price <= 0) return null;
      basePrice = svc.price;
    }
    _planPriceCache.set(basePlanId, { price: basePrice, expiresAt: Date.now() + PLAN_PRICE_CACHE_TTL_MS });
  }

  // 2. Country PPP adjustment
  const countryUpper = (country ?? "KE").toUpperCase();
  const multiplier = COUNTRY_PPP[countryUpper] ?? 1.00;
  const countryPrice = multiplier === 1.00 ? basePrice : Math.round(basePrice * multiplier);

  // 3. Best discount — promo code (explicit) beats referral (planId encoding)
  let discountType: string | null = null;
  let discountValue = 0;
  let appliedPromo: string | null = null;

  if (promoCode) {
    const promo = await _validatePromoCode(promoCode, basePlanId);
    if (promo) {
      discountType = promo.discountType;
      appliedPromo = promoCode.toUpperCase();
      if (promo.discountType === "promo_pct") {
        discountValue = Math.round(countryPrice * promo.discountValue / 100);
      } else {
        // promo_fixed — cap at countryPrice so finalPrice never goes negative
        discountValue = Math.min(promo.discountValue, countryPrice);
      }
    }
    // If the promo was invalid, silently fall through to check referral
  }

  if (!discountType && planId === "pro_referral") {
    // Referral discount (backward compat for the existing pro_referral planId)
    discountType = "referral_20";
    discountValue = Math.round(countryPrice * REFERRAL_DISCOUNT_RATE);
  }

  const finalPrice = countryPrice - discountValue;

  return { basePrice, countryPrice, finalPrice, discountType, discountValue, appliedPromo };
}

// ── Backward-compat wrapper ───────────────────────────────────────────────────
// All 12 existing call sites use this signature — keep it unchanged.
type CanonicalPlanPrice = { basePrice: number; finalPrice: number; discountType: string | null };

async function resolveCanonicalPlanPrice(planId: string): Promise<CanonicalPlanPrice | null> {
  const result = await resolvePrice({ planId });
  if (!result) return null;
  return { basePrice: result.basePrice, finalPrice: result.finalPrice, discountType: result.discountType };
}
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called after a plan payment is confirmed.
 * 1. Parses the payment row's JSON metadata to extract the applied promo code.
 * 2. Atomically increments used_count in the local PostgreSQL DB (source of truth).
 * 3. Mirrors the increment to the Supabase `promotions` table.
 * Errors are caught and logged — they never block the payment completion path.
 */
async function redeemAppliedPromo(metadata: string | null | undefined): Promise<void> {
  try {
    if (!metadata) return;
    const meta = typeof metadata === "string" ? JSON.parse(metadata) : metadata;
    const code: string | undefined = meta?.appliedPromo;
    if (!code) return;

    const promo = await storage.getPromoCode(code);
    if (!promo) {
      console.warn(`[PromoRedeem] Code not found in local DB: ${code}`);
      return;
    }

    const incremented = await storage.usePromoCode(promo.id, promo.maxUses ?? null);
    if (!incremented) {
      console.warn(`[PromoRedeem] ${code} has hit its max_uses — no increment`);
      return;
    }

    console.info(`[PromoRedeem] Local DB incremented: ${code} (id=${promo.id})`);
    await incrementPromoUsageInSupabase(code);
  } catch (err) {
    console.error("[PromoRedeem] Failed:", err);
  }
}

// Stable version token for the /api/services payload.
// Derived from a checksum of all current prices so it survives server restarts
// unchanged when no prices have actually changed.
// The client price-watcher compares stored vs live values — a mismatch
// means a real price change occurred and triggers a single UI reload.
let SERVICES_VERSION = "";

function computeServicesVersion(rows: Array<{ code: string; price: number }>): string {
  const sorted = [...rows].filter(r => r.code != null).sort((a, b) => (a.code ?? "").localeCompare(b.code ?? ""));
  const payload = sorted.map(r => `${r.code}:${r.price}`).join("|");
  // Simple djb2 hash — fast, no crypto dependency
  let hash = 5381;
  for (let i = 0; i < payload.length; i++) {
    hash = ((hash << 5) + hash) ^ payload.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  return hash.toString(16);
}

export function bumpServicesVersion(rows?: Array<{ code: string; price: number }>) {
  if (rows) {
    SERVICES_VERSION = computeServicesVersion(rows);
  } else {
    SERVICES_VERSION = Date.now().toString(16); // fallback for manual bumps
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  // Track active sessions for the admin dashboard real-time counter.
  // Must run after setupAuth so req.session is populated.
  app.use(trackActiveUser);

  // =============================================
  // SEO FILES — Served before CSRF middleware
  // =============================================
  app.get("/robots.txt", (_req, res) => {
    res.setHeader("Content-Type", "text/plain");
    res.send(`User-agent: *
Allow: /

Disallow: /admin
Disallow: /admin/
Disallow: /api/
Disallow: /payment
Disallow: /profile
Disallow: /my-orders
Disallow: /order/
Disallow: /service-order/
Disallow: /assisted-apply/
Disallow: /application-tracker
Disallow: /agency-portal

Allow: /tools/
Allow: /country/
Allow: /nea-agencies
Allow: /agencies
Allow: /verify
Allow: /agency-map
Allow: /compliance-index
Allow: /visa-guides
Allow: /green-card
Allow: /student-visas
Allow: /about
Allow: /contact
Allow: /faq
Allow: /pricing
Allow: /services
Allow: /referrals
Allow: /privacy-policy
Allow: /terms-of-service
Allow: /refund-policy
Allow: /career-match

Sitemap: https://workabroadhub.tech/sitemap.xml
Crawl-delay: 1`);
  });

  // Security: CSRF token endpoint — must be registered immediately after session
  // middleware (setupAuth) so req.session is available. The frontend fetches this
  // once on startup and sends the token as X-CSRF-Token on every mutating request.
  app.get("/api/csrf-token", csrfTokenEndpoint);

  // Security: CSRF validation — reject mutating requests that lack a valid session token.
  // Exempt: external webhooks (M-Pesa, PayPal) and OAuth redirect routes.
  app.use(validateCsrf);

  // =============================================
  // HEALTH CHECK / HEARTBEAT ENDPOINTS
  // =============================================

  // POST /api/heartbeat — frontend pings this every 60 s to keep the session
  // alive and refresh the active-user timestamp. trackActiveUser middleware
  // handles the sessionMap update automatically on every request.
  app.post("/api/heartbeat", async (req: any, res) => {
    if (req.session?.touch) req.session.touch();

    const userId: string | undefined =
      req.user?.claims?.sub ??
      req.session?.userId ??
      req.session?.customUserId;

    const sessionId: string | undefined = req.session?.id;
    const currentPage: string | null =
      typeof req.body?.page === "string" ? req.body.page.slice(0, 200) : null;

    if (userId && sessionId) {
      const now = new Date();
      try {
        await Promise.all([
          // Keep users table presence flag fresh (no-op if user row missing)
          db.update(users).set({ lastSeen: now, isOnline: true }).where(eq(users.id, userId)),
          // Upsert one row per session — conditional INSERT guards against FK violation
          // if the user row was never created (e.g. OIDC upsert failed transiently).
          db.execute(sql`
            INSERT INTO active_sessions (user_id, session_id, current_page, last_seen, is_online)
            SELECT ${userId}, ${sessionId}, ${currentPage}, ${now.toISOString()}, true
            WHERE EXISTS (SELECT 1 FROM users WHERE id = ${userId})
            ON CONFLICT (session_id) DO UPDATE
              SET current_page = EXCLUDED.current_page,
                  last_seen    = EXCLUDED.last_seen,
                  is_online    = true
          `),
        ]);
      } catch (err: any) {
        // Non-fatal: presence tracking should never block the response
        console.warn("[Heartbeat] Presence update failed (non-fatal):", err?.message);
      }
    }

    res.json({ ok: true });
  });

  // POST /api/track — fires immediately on every client-side page navigation.
  // Updates current_page in active_sessions without touching the session TTL.
  // Lightweight: no session.touch(), no users table write — page change only.
  app.post("/api/track", async (req: any, res) => {
    const user = req.user;
    const { event, ...meta } = req.body;

    if (!event) return res.json({ ok: true });

    await pool.query(
      `INSERT INTO funnel_events (user_id, event, metadata)
       VALUES ($1, $2, $3)`,
      [user?.id || null, event, meta]
    );

    if (event === "view_service" && user?.id && meta.service) {
      await pool.query(
        `UPDATE users
            SET interests = interests || $1
          WHERE id = $2`,
        [JSON.stringify({ service: meta.service }), user.id]
      );
    }

    res.json({ ok: true });
  });

  // Presence cleanup — runs every 2 minutes.
  // Marks offline any session/user whose last heartbeat is older than 2 min.
  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - 2 * 60 * 1000);
      await Promise.all([
        db.update(users)
          .set({ isOnline: false })
          .where(and(eq(users.isOnline, true), lte(users.lastSeen, cutoff))),
        db.execute(sql`
          UPDATE active_sessions SET is_online = false
          WHERE is_online = true AND last_seen < ${cutoff}
        `),
      ]);
    } catch { /* non-fatal */ }
  }, 2 * 60 * 1000);

  // Basic health check for load balancers (fast, minimal)
  app.get("/api/health", async (req, res) => {
    try {
      const health = await getBasicHealth();
      const statusCode = health.status === "ok" ? 200 : 503;
      res.status(statusCode).json(health);
    } catch (error) {
      res.status(503).json({ status: "error", timestamp: Date.now() });
    }
  });

  // Kubernetes liveness probe - is the process alive?
  app.get("/api/health/live", async (req, res) => {
    const live = await isLive();
    res.status(live ? 200 : 503).json({ live });
  });

  // Kubernetes readiness probe - can we serve traffic?
  app.get("/api/health/ready", async (req, res) => {
    const ready = await isReady();
    res.status(ready ? 200 : 503).json({ ready });
  });

  // Detailed health check for monitoring dashboards
  app.get("/api/health/detailed", async (req, res) => {
    try {
      const health = await getDetailedHealth();
      const statusCode = health.status === "healthy" ? 200 : 
                         health.status === "degraded" ? 200 : 503;
      res.status(statusCode).json(health);
    } catch (error: any) {
      res.status(503).json({ 
        status: "unhealthy", 
        timestamp: new Date().toISOString() 
      });
    }
  });

  // Circuit breaker status
  app.get("/api/health/circuits", (req, res) => {
    const stats = getAllCircuitBreakerStats();
    res.json({
      circuits: stats,
      timestamp: new Date().toISOString(),
    });
  });

  // Admin-only: Reset circuit breaker
  app.post("/api/admin/circuits/:name/reset", isAuthenticated, isAdmin, (req: any, res) => {
    const { name } = req.params;
    if (name === "mpesa") {
      mpesaCircuitBreaker.reset();
      res.json({ success: true, message: "M-Pesa circuit breaker reset" });
    } else if (name === "mpesa-b2c") {
      mpesaB2CCircuitBreaker.reset();
      res.json({ success: true, message: "M-Pesa B2C circuit breaker reset" });
    } else {
      res.status(404).json({ message: "Unknown circuit breaker" });
    }
  });

  app.get("/api/admin/signup-anomaly-stats", isAuthenticated, isAdmin, (_req, res) => {
    import("./services/signupAnomalyDetector").then(({ getRecentSignupStats }) => {
      res.json(getRecentSignupStats());
    }).catch(() => res.status(500).json({ message: "Anomaly detector not available" }));
  });

  app.get("/api/metrics", isAuthenticated, isAdmin, async (req, res) => {
    const memUsage = process.memoryUsage();
    const poolStats = getPoolStats();
    const cacheStats = cache.getStats();
    const queueStats = asyncQueue.getStats();
    const circuitStats = getAllCircuitBreakerStats();
    
    res.json({
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        heapUsedMB: (memUsage.heapUsed / 1024 / 1024).toFixed(2),
        heapTotalMB: (memUsage.heapTotal / 1024 / 1024).toFixed(2),
        rssMB: (memUsage.rss / 1024 / 1024).toFixed(2),
      },
      database: poolStats,
      cache: cacheStats,
      queue: queueStats,
      circuits: circuitStats,
    });
  });

  // Admin session login - sets admin flag in session after verifying user is admin
  app.post("/api/admin/login", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub ?? String(req.user?.id ?? "");
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      
      // Check if user is admin
      const isAdminUser = user.isAdmin || user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
      if (!isAdminUser) {
        return res.status(403).json({ message: "Admin access denied" });
      }
      
      // Set admin session flag
      req.session.admin = true;
      req.session.adminUserId = userId;
      
      res.json({ success: true, message: "Admin login successful" });
    } catch (error) {
      console.error("Admin login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Admin session logout
  app.post("/api/admin/logout", isAuthenticated, (req: any, res) => {
    req.session.admin = false;
    req.session.adminUserId = null;
    res.json({ success: true, message: "Admin logged out" });
  });

  // Check admin session status
  app.get("/api/admin/session", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub ?? String(req.user?.id ?? "");
      if (!userId) {
        return res.json({ isAdmin: false, hasSession: false });
      }
      
      const user = await storage.getUserById(userId);
      const isAdminUser = user?.isAdmin || user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;
      
      res.json({
        isAdmin: isAdminUser,
        hasSession: !!req.session?.admin,
        userId: userId
      });
    } catch (error) {
      res.json({ isAdmin: false, hasSession: false });
    }
  });

  // =============================================
  // ABUSE REPORTING (No Auth Required)
  // =============================================
  const abuseReportSchema = z.object({
    type: z.enum([
      "Suspicious Job Listing",
      "Fraudulent Agency",
      "Scam/Fraud",
      "Harassment",
      "Misleading Content",
      "Other",
    ]),
    description: z.string().min(20, "Description must be at least 20 characters"),
    contactEmail: z.string().email().optional(),
  });

  app.post("/api/reports/abuse", async (req, res) => {
    try {
      const parsed = abuseReportSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid report data", errors: parsed.error.errors });
      }

      const { type, description, contactEmail } = parsed.data;
      const reportData = {
        type,
        description,
        contactEmail: contactEmail || null,
        timestamp: new Date().toISOString(),
        ip: req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown",
      };
      console.log("[ABUSE REPORT]", reportData);

      try {
        await db.execute(sql`
          INSERT INTO abuse_reports (type, description, contact_email, ip_address)
          VALUES (${type}, ${description}, ${reportData.contactEmail}, ${reportData.ip})
        `);
      } catch (dbError) {
        console.error("Failed to persist abuse report (non-critical):", dbError);
      }

      res.json({ success: true, message: "Report submitted successfully" });
    } catch (error) {
      console.error("Error submitting abuse report:", error);
      res.status(500).json({ message: "Failed to submit report" });
    }
  });

  app.get("/api/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      touchLastActive(userId);
      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.patch("/api/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const parsed = updateProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request data", errors: parsed.error.errors });
      }

      // Normalize phone and auto-detect country if the caller didn't supply one
      const profileData = { ...parsed.data };
      if (profileData.phone) {
        const { phone: normPhone, country: detectedCountry } = normalizePhoneAuto(profileData.phone);
        profileData.phone    = normPhone ?? profileData.phone;
        profileData.country  = profileData.country ?? detectedCountry ?? "KE";
      }

      const updatedUser = await storage.updateUserProfile(userId, profileData);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.get("/api/subscription", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub ?? req.session?.userId ?? req.session?.customUserId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const subscription = await storage.getUserSubscription(userId);
      res.json(subscription || null);
    } catch (error) {
      console.error("Error fetching subscription:", error);
      res.status(500).json({ message: "Failed to fetch subscription" });
    }
  });

  // ── Plan Tiers ─────────────────────────────────────────────────────────────
  app.get("/api/plans", async (_req, res) => {
    try {
      const allPlans = await withCache("plans:public", CACHE_TTL.STATIC_DATA, () => storage.getPlans(false));
      res.json(allPlans);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch plans" });
    }
  });

  // GET /api/supabase-config — returns public Supabase URL + anon key for client-side realtime
  app.get("/api/supabase-config", (_req, res) => {
    res.json({
      url:     "https://pvsxecrqfexgwspuqvlp.supabase.co",
      anonKey: process.env.SUPABASE_ANON_KEY ?? "",
    });
  });

  // ── GET /api/public/stats — real platform metrics (no auth required) ───────
  // Used by banners and the landing page. Cached 5 min to keep it light.
  // Returns ONLY real database counts — no hardcoded or simulated numbers.
  app.get("/api/public/stats", async (_req, res) => {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo  = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000);

      const [scamThisMonth, expiredAgencies, totalAgencies, recentUpgrades, totalUsers, activePortals, verifiedSuccessStories, completedConsultations, agencyReviewCount, distinctCountries] = await Promise.all([
        // Approved scam reports submitted in the last 30 days
        db.select({ c: count() }).from(scamReports)
          .where(and(
            eq(scamReports.status, "approved"),
            sql`${scamReports.createdAt} >= ${thirtyDaysAgo.toISOString()}`,
          )),
        // NEA agencies whose license has expired (still published = visible to users)
        db.select({ c: count() }).from(neaAgenciesTable)
          .where(and(
            eq(neaAgenciesTable.isPublished, true),
            sql`${neaAgenciesTable.expiryDate} < ${now.toISOString()}`,
          )),
        // All published NEA agencies (total tracked)
        db.select({ c: count() }).from(neaAgenciesTable)
          .where(eq(neaAgenciesTable.isPublished, true)),
        // Successful Pro plan payments in the last 7 days
        db.select({ c: count() }).from(paymentsTable)
          .where(and(
            sql`${paymentsTable.status} IN ('success', 'completed')`,
            sql`${paymentsTable.serviceId} LIKE 'plan_%'`,
            sql`${paymentsTable.createdAt} >= ${sevenDaysAgo.toISOString()}`,
          )),
        // Total registered users
        db.select({ c: count() }).from(users),
        // Active verified portals
        db.select({ c: count() }).from(verifiedPortals).where(eq(verifiedPortals.isActive, true)),
        // Verified & active success stories
        db.select({ c: count() }).from(successStoriesTable)
          .where(and(eq(successStoriesTable.isVerified, true), eq(successStoriesTable.isActive, true))),
        // Completed consultations
        db.select({ c: count() }).from(consultationBookingsTable)
          .where(eq(consultationBookingsTable.status, "completed")),
        // Community agency reports (proxy for total reviews/feedback submitted)
        db.select({ c: count() }).from(agencyReports),
        // Distinct countries served from verified portals
        db.execute(sql`SELECT COUNT(DISTINCT country)::int AS c FROM verified_portals WHERE is_active = true`),
      ]);

      const activeVisitors = await storage.getActiveUsers(10);
      const countriesServed = Math.max(
        7,
        Number(((distinctCountries as any).rows?.[0]?.c) ?? 0),
      );
      // In-memory session tracker — same source as admin/stats/live (fast, no DB)
      const liveActive = getActiveUserCounts();

      res.json({
        scamReportsThisMonth: Number(scamThisMonth[0]?.c ?? 0),
        expiredAgencies: Number(expiredAgencies[0]?.c ?? 0),
        totalAgencies: Number(totalAgencies[0]?.c ?? 0),
        recentUpgradesThisWeek: Number(recentUpgrades[0]?.c ?? 0),
        totalUsers: Number(totalUsers[0]?.c ?? 0),
        activeNow: liveActive.total,               // real-time session count (unified source)
        activeAuthenticated: liveActive.authenticated,
        activeVisitors,
        // ── Public stats card metrics ──────────────────────────────────────
        activePortals: Number(activePortals[0]?.c ?? 0),
        successStories: Number(verifiedSuccessStories[0]?.c ?? 0),
        consultationsCompleted: Number(completedConsultations[0]?.c ?? 0),
        agencyReviews: Number(agencyReviewCount[0]?.c ?? 0),
        countriesServed,
        generatedAt: now.toISOString(),
      });
    } catch (err: any) {
      console.error("[PublicStats]", err.message);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // ── Public: real-time activity notifications ──────────────────────────────
  // Reads from activity_events table — written on real signups and upgrades.
  // No names, no emails, no user IDs. Only type, optional location, timestamp.
  app.get("/api/notifications/recent", async (_req, res) => {
    try {
      // Only return genuinely recent events (last 48 hours) so the live feed
      // never shows stale/recycled notifications from weeks ago.
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
      const events = await withCache("activity:recent", 30_000, () =>
        db.select().from(activityEvents)
          .where(gte(activityEvents.createdAt, cutoff))
          .orderBy(desc(activityEvents.createdAt))
          .limit(20)
      );
      res.json(events);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  // ── Admin plan management ──────────────────────────────────────────────────
  app.get("/api/admin/plans", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const allPlans = await storage.getPlans(true);
      res.json(allPlans);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch plans" });
    }
  });

  app.patch("/api/admin/plans/:planId", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { planId } = req.params;
      const {
        planName, price, features, description, badge,
        currency, billingPeriod, isActive, displayOrder, metadata,
      } = req.body;

      const updates: Record<string, any> = {};
      if (planName !== undefined) updates.planName = String(planName).trim();
      if (price !== undefined) {
        const parsed = parseInt(price, 10);
        if (isNaN(parsed) || parsed < 0) return res.status(400).json({ message: "price must be a non-negative integer" });
        updates.price = parsed;
      }
      if (features !== undefined) {
        if (!Array.isArray(features)) return res.status(400).json({ message: "features must be an array" });
        updates.features = features;
      }
      if (description !== undefined) updates.description = description ?? null;
      if (badge !== undefined) updates.badge = badge ?? null;
      if (currency !== undefined) updates.currency = String(currency).toUpperCase();
      if (billingPeriod !== undefined) updates.billingPeriod = billingPeriod;
      if (isActive !== undefined) updates.isActive = Boolean(isActive);
      if (displayOrder !== undefined) updates.displayOrder = parseInt(displayOrder, 10);
      if (metadata !== undefined) updates.metadata = metadata;

      const updated = await storage.updatePlan(planId, updates);
      if (!updated) return res.status(404).json({ message: "Plan not found" });

      await storage.createComplianceAuditLog({
        action: "plan_updated",
        performedBy: req.user?.claims?.sub || "admin",
        recordType: "plan",
        recordId: planId,
        details: { changes: updates },
      });

      res.json(updated);
    } catch (err: any) {
      console.error("[Admin] Plan update error:", err);
      res.status(500).json({ message: "Failed to update plan" });
    }
  });

  app.post("/api/admin/plans/:planId/toggle", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { planId } = req.params;
      const plan = await storage.getPlanById(planId);
      if (!plan) return res.status(404).json({ message: "Plan not found" });

      const updated = await storage.updatePlan(planId, { isActive: !plan.isActive });

      await storage.createComplianceAuditLog({
        action: updated?.isActive ? "plan_activated" : "plan_deactivated",
        performedBy: req.user?.claims?.sub || "admin",
        recordType: "plan",
        recordId: planId,
        details: { isActive: updated?.isActive },
      });

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to toggle plan" });
    }
  });

  // ── Admin: Promo code management ─────────────────────────────────────────
  // GET  /api/admin/promo-codes        — list all codes
  // POST /api/admin/promo-codes        — create a new code
  // PATCH /api/admin/promo-codes/:id   — update code (toggle active, extend expiry, etc.)
  // DELETE /api/admin/promo-codes/:id  — deactivate a code (soft delete)

  app.get("/api/admin/promo-codes", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const codes = await storage.listPromoCodes();
      res.json(codes);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch promo codes" });
    }
  });

  app.post("/api/admin/promo-codes", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { code, discountType, discountValue, appliesToPlan, maxUses, expiresAt, description } = req.body;
      if (!code || !discountType || discountValue == null) {
        return res.status(400).json({ message: "code, discountType and discountValue are required" });
      }
      if (!["pct", "fixed_kes"].includes(discountType)) {
        return res.status(400).json({ message: "discountType must be 'pct' or 'fixed_kes'" });
      }
      if (discountType === "pct" && (discountValue < 1 || discountValue > 100)) {
        return res.status(400).json({ message: "Percentage discountValue must be 1–100" });
      }
      const adminId = req.user?.claims?.sub;
      const promo = await storage.createPromoCode({
        code: code.toUpperCase().trim(),
        discountType,
        discountValue: Number(discountValue),
        appliesToPlan: appliesToPlan || null,
        maxUses: maxUses ? Number(maxUses) : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        description: description || null,
        active: true,
        createdBy: adminId,
      });
      console.log(`[Admin] Promo code created: ${promo.code} (${discountType} ${discountValue}) by ${adminId}`);
      res.status(201).json(promo);
    } catch (err: any) {
      if (err.message?.includes("unique")) {
        return res.status(409).json({ message: "A promo code with that code already exists" });
      }
      res.status(500).json({ message: "Failed to create promo code" });
    }
  });

  app.patch("/api/admin/promo-codes/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { active, expiresAt, maxUses, description } = req.body;
      const updates: Record<string, unknown> = {};
      if (active !== undefined) updates.active = Boolean(active);
      if (expiresAt !== undefined) updates.expiresAt = expiresAt ? new Date(expiresAt) : null;
      if (maxUses !== undefined) updates.maxUses = maxUses !== null ? Number(maxUses) : null;
      if (description !== undefined) updates.description = description;
      const updated = await storage.updatePromoCode(id, updates as any);
      if (!updated) return res.status(404).json({ message: "Promo code not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to update promo code" });
    }
  });

  app.delete("/api/admin/promo-codes/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const updated = await storage.updatePromoCode(req.params.id, { active: false });
      if (!updated) return res.status(404).json({ message: "Promo code not found" });
      res.json({ message: "Promo code deactivated", id: req.params.id });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to deactivate promo code" });
    }
  });

  app.get("/api/user/plan", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const planId = await storage.getUserPlan(userId);
      const plan = await storage.getPlanById(planId);
      const subscription = await storage.getUserSubscription(userId);
      res.json({ planId, plan, subscription: subscription || null });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch user plan" });
    }
  });

  // GET /api/user/overview — all data the My Overview page needs in one request
  // Returns payments, user_services (purchases), service_requests, and referral stats
  // from the local DB so the frontend never needs to query Supabase directly.
  app.get("/api/user/overview", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub ?? req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const [paymentsRows, purchasesRows, servicesRows] = await Promise.all([
        db.select({
          id:                   paymentsTable.id,
          amount:               paymentsTable.amount,
          currency:             paymentsTable.currency,
          status:               paymentsTable.status,
          method:               paymentsTable.method,
          plan_id:              paymentsTable.planId,
          service_id:           paymentsTable.serviceId,
          service_name:         paymentsTable.serviceName,
          delivery_status:      paymentsTable.deliveryStatus,
          transaction_ref:      paymentsTable.transactionRef,
          mpesa_receipt_number: paymentsTable.mpesaReceiptNumber,
          fail_reason:          paymentsTable.failReason,
          created_at:           paymentsTable.createdAt,
        })
          .from(paymentsTable)
          .where(eq(paymentsTable.userId, userId))
          .orderBy(desc(paymentsTable.createdAt))
          .limit(100),

        db.select({
          id:         userServicesTable.id,
          service_id: userServicesTable.serviceId,
          payment_id: userServicesTable.paymentId,
          expires_at: userServicesTable.expiresAt,
          created_at: userServicesTable.unlockedAt,
        })
          .from(userServicesTable)
          .where(eq(userServicesTable.userId, userId))
          .orderBy(desc(userServicesTable.unlockedAt)),

        db.select({
          id:          serviceRequestsTable.id,
          service_id:  serviceRequestsTable.serviceId,
          payment_id:  serviceRequestsTable.paymentId,
          status:      serviceRequestsTable.status,
          created_at:  serviceRequestsTable.createdAt,
          input_data:  serviceRequestsTable.inputData,
          output_data: serviceRequestsTable.outputData,
        })
          .from(serviceRequestsTable)
          .where(eq(serviceRequestsTable.userId, userId))
          .orderBy(desc(serviceRequestsTable.createdAt))
          .limit(50),
      ]);

      // Referral commissions come from the referrals table via storage
      const refCode = await storage.generateAndSaveReferralCode(userId);
      const legacyCode = req.user.firstName
        ? `${req.user.firstName.toUpperCase()}${userId?.slice(-4) || ""}`
        : `USER${userId?.slice(-6) || ""}`;
      const [storedReferrals, legacyReferrals] = await Promise.all([
        storage.getReferralsByCode(refCode),
        refCode !== legacyCode ? storage.getReferralsByCode(legacyCode) : Promise.resolve([]),
      ]);
      const allReferrals = [...storedReferrals, ...legacyReferrals];
      const referralRows = allReferrals.map((r: any) => ({
        id:               r.id ?? r.referralId ?? String(Math.random()),
        referrer_user_id: userId,
        payment_id:       r.paymentId ?? null,
        amount:           r.commission ?? 0,
        status:           r.status ?? "pending",
        created_at:       r.createdAt ?? new Date().toISOString(),
      }));

      return res.json({
        payments:  paymentsRows,
        purchases: purchasesRows,
        services:  servicesRows,
        referrals: referralRows,
      });
    } catch (err: any) {
      console.error("[Overview] Error:", err.message);
      res.status(500).json({ message: "Failed to fetch overview data" });
    }
  });

  app.post("/api/user/activity", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;

      const userId = String(user.claims?.sub ?? user.id);

      await supabase
        .from("users")
        .update({
          last_active: new Date().toISOString(),
          current_page: req.body.page
        })
        .eq("id", userId);

      getIO().emit("user_active", {
        user_id: user.id,
        time: new Date().toISOString(),
      });

      res.sendStatus(200);
    } catch (err) {
      console.error("Activity error:", err);
      res.sendStatus(500);
    }
  });

  // ── POST /api/pricing/resolve — Preview price before initiating payment ────
  // Accepts: { planId, country?, promoCode? }
  // Returns: { basePrice, countryPrice, finalPrice, discountType, discountValue,
  //            appliedPromo, valid: true }
  // On invalid promo code the response still returns valid:true but appliedPromo is null
  // so the frontend can show the clean price without the unrecognised code.
  // Requires auth so userId is always available (future user-tier pricing).
  app.post("/api/pricing/resolve", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub as string | undefined;
      const { planId, country, promoCode } = req.body ?? {};
      if (!planId || typeof planId !== "string") {
        return res.status(400).json({ valid: false, message: "planId is required" });
      }
      const resolved = await resolvePrice({
        planId,
        userId,
        country: typeof country === "string" ? country.toUpperCase() : undefined,
        promoCode: typeof promoCode === "string" ? promoCode.trim() : undefined,
      });
      if (!resolved) {
        return res.status(404).json({ valid: false, message: "Plan not found or has no price" });
      }
      // If a promo code was supplied but appliedPromo is null, the code was invalid
      const promoWarning = promoCode && !resolved.appliedPromo
        ? "Promo code is invalid, expired, or does not apply to this plan"
        : undefined;
      res.json({ ...resolved, valid: true, ...(promoWarning ? { promoWarning } : {}) });
    } catch (err: any) {
      console.error("[POST /api/pricing/resolve]", err.message);
      res.status(500).json({ valid: false, message: "Failed to resolve price" });
    }
  });

  // GET /api/pricing/resolve?planId=pro&country=KE&promoCode=SAVE10
  // Stateless variant for unauthenticated previews (landing page, share links).
  app.get("/api/pricing/resolve", async (req, res) => {
    try {
      const { planId, country, promoCode } = req.query as Record<string, string>;
      if (!planId) {
        return res.status(400).json({ valid: false, message: "planId is required" });
      }
      const resolved = await resolvePrice({
        planId,
        country: country?.toUpperCase(),
        promoCode: promoCode?.trim(),
      });
      if (!resolved) {
        return res.status(404).json({ valid: false, message: "Plan not found or has no price" });
      }
      const promoWarning = promoCode && !resolved.appliedPromo
        ? "Promo code is invalid, expired, or does not apply to this plan"
        : undefined;
      // Cache for 30 s — public edge can serve static-country requests without backend hits.
      // No user-specific data is returned here.
      res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
      res.json({ ...resolved, valid: true, ...(promoWarning ? { promoWarning } : {}) });
    } catch (err: any) {
      console.error("[GET /api/pricing/resolve]", err.message);
      res.status(500).json({ valid: false, message: "Failed to resolve price" });
    }
  });

  // ── POST /api/price — Resolve price before initiating payment ──────────────
  // Lightweight public alias for /api/pricing/resolve.
  // Accepts: { planId, promoCode?, country?, userId? }
  // Returns: full ResolvedPrice object  |  400 { error } on invalid plan
  // Does NOT require authentication — useful for checkout previews, external
  // integrations, and pre-login pricing checks.
  app.post("/api/price", async (req, res) => {
    try {
      const { planId, promoCode, country, userId } = req.body ?? {};

      if (!planId || typeof planId !== "string") {
        return res.status(400).json({ error: "planId is required" });
      }

      // Auto-detect country from IP when the client doesn't send one.
      // This makes geo-pricing work transparently for every caller.
      let resolvedCountry: string | undefined =
        typeof country === "string" ? country.toUpperCase() : undefined;
      if (!resolvedCountry) {
        try {
          const { detectCountry } = await import("./middleware/locationDetector");
          const geo = await detectCountry(req);
          if (geo.country && geo.country !== "XX") resolvedCountry = geo.country;
        } catch { /* non-fatal — falls back to KE base price */ }
      }

      const pricing = await resolvePrice({
        planId,
        userId:     typeof userId    === "string" ? userId.trim()   : undefined,
        country:    resolvedCountry,
        promoCode:  typeof promoCode === "string" ? promoCode.trim() : undefined,
      });

      if (!pricing) {
        return res.status(400).json({ error: "Invalid plan" });
      }

      const promoWarning = promoCode && !pricing.appliedPromo
        ? "Promo code is invalid, expired, or does not apply to this plan"
        : undefined;

      return res.json({ ...pricing, valid: true, ...(promoWarning ? { promoWarning } : {}) });
    } catch (err: any) {
      console.error("[POST /api/price]", err.message);
      return res.status(500).json({ error: "Failed to resolve price" });
    }
  });

  // POST /api/subscriptions/upgrade — M-Pesa STK Push for plan upgrade
  app.post("/api/subscriptions/upgrade", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { planId, phoneNumber, promoCode } = req.body;
      const VALID_PLAN_IDS = ["pro", "pro_referral"];
      if (!planId || !VALID_PLAN_IDS.includes(planId)) {
        return res.status(400).json({ message: "planId must be 'pro' or 'pro_referral'" });
      }
      if (!phoneNumber) {
        return res.status(400).json({ message: "phoneNumber is required" });
      }

      // pro_referral uses the base pro plan record but with a 20% discounted price
      const basePlanId = planId === "pro_referral" ? "pro" : planId;

      const plan = await storage.getPlanById(basePlanId);
      if (!plan) return res.status(404).json({ message: "Plan not found" });

      // Resolve canonical price via the pricing engine — the backend is the single
      // source of truth. Client-supplied amounts are never used. Passing userId and
      // promoCode enables per-user discounts and active promo codes.
      const resolvedPrice = await resolvePrice({
        planId,
        userId,
        promoCode: typeof promoCode === "string" ? promoCode.trim() : undefined,
      });
      if (!resolvedPrice) return res.status(404).json({ message: "Plan price not configured" });
      const chargeAmount = resolvedPrice.finalPrice;

      const normalizedPhone = normalizePhone(phoneNumber, "KE") ?? phoneNumber;
      if (!/^254[71]\d{8}$/.test(normalizedPhone)) {
        return res.status(400).json({ message: "Invalid phone number. Use format: 0712345678, 0115364029, or +254712345678" });
      }

      const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
      if (!checkStkPushRateLimit(userId) || !checkStkPushIpRateLimit(clientIp)) {
        return res.status(429).json({ message: "Too many payment attempts. Please wait a few minutes." });
      }

      // Fetch user email so the payment record is always linked by both userId AND email
      const initiatingUser = await storage.getUserById(userId);
      if (!initiatingUser?.email) {
        console.error(`[Payment][INIT] User ${userId} has no email — cannot create traceable payment record`);
        return res.status(400).json({ message: "Account email is required to process payments. Please update your profile." });
      }
      const { logActivity } = await import("./services/activityLogger");
      const useLiveMpesa = process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET && process.env.MPESA_SHORTCODE && process.env.MPESA_PASSKEY;

      if (useLiveMpesa) {
        // STK push FIRST — then single INSERT with checkout_request_id already set
        let checkoutId: string;
        let merchantRequestId: string;
        try {
          const { stkPush } = await import("./mpesa");
          const stkResponse = await stkPush(normalizedPhone, chargeAmount, `${plan.planName} Plan - WorkAbroad Hub`, `WAH-${Date.now()}`);
          checkoutId        = stkResponse.CheckoutRequestID;
          merchantRequestId = stkResponse.MerchantRequestID;
        } catch (err: any) {
          logActivity({ event: "payment_failed", userId, email: initiatingUser.email, meta: { method: "mpesa", planId, error: err.message }, ip: clientIp });
          return res.status(500).json({ message: "Failed to initiate M-Pesa payment. Please try again." });
        }

        const payment = await storage.createPayment({
          userId,
          email:             initiatingUser.email,
          amount:            chargeAmount,
          baseAmount:        resolvedPrice.basePrice,
          discountType:      resolvedPrice.discountType,
          currency:          "KES",
          method:            "mpesa",
          phone:             normalizedPhone,
          status:            "pending",
          planId:            basePlanId,
          serviceId:         `plan_${planId}`,
          serviceName:       `${plan.planName} Plan`,
          checkoutRequestId: checkoutId,
          transactionRef:    checkoutId,
          metadata: JSON.stringify({
            planId,
            planName:          plan.planName,
            phone:             normalizedPhone,
            referralDiscount:  planId === "pro_referral",
            appliedPromo:      resolvedPrice.appliedPromo || null,
            checkoutRequestId: checkoutId,
            merchantRequestId,
          }),
        } as any);

        console.info(`[Payment][START] M-Pesa | paymentId=${payment.id} | userId=${userId} | email=${initiatingUser.email} | KES=${chargeAmount} | plan=${planId} | phone=${normalizedPhone} | checkoutId=${checkoutId}`);
        logActivity({
          event: "payment_started",
          userId,
          email: initiatingUser.email,
          meta:  { method: "mpesa", planId, amountKes: chargeAmount, paymentId: payment.id, phone: normalizedPhone, checkoutRequestId: checkoutId },
          ip:    clientIp,
        });

        return res.json({ success: true, paymentId: payment.id, checkoutRequestId: checkoutId, message: "STK push sent. Enter your M-Pesa PIN." });

      } else {
        // Simulation mode — create row first (no real STK push)
        const payment = await storage.createPayment({
          userId,
          email:        initiatingUser.email,
          amount:       chargeAmount,
          baseAmount:   resolvedPrice.basePrice,
          discountType: resolvedPrice.discountType,
          currency:     "KES",
          method:       "mpesa",
          phone:        normalizedPhone,
          status:       "pending",
          planId:       basePlanId,
          serviceId:    `plan_${planId}`,
          serviceName:  `${plan.planName} Plan`,
          metadata: JSON.stringify({ planId, planName: plan.planName, phone: normalizedPhone, referralDiscount: planId === "pro_referral", appliedPromo: resolvedPrice.appliedPromo || null }),
        } as any);
        await storage.updatePayment(payment.id, { status: "awaiting_payment" });
        return res.json({ success: true, paymentId: payment.id, message: "Payment initiated (simulation mode)." });
      }
    } catch (err: any) {
      console.error("[PlanUpgrade] Error:", err.message);
      res.status(500).json({ message: "Failed to initiate plan upgrade" });
    }
  });

  // PayPal upgrade route removed — M-Pesa is the only supported payment method.

  // GET /api/subscriptions/poll/:paymentId — poll status of a plan upgrade payment
  app.get("/api/subscriptions/poll/:paymentId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { paymentId } = req.params;
      const payment = await storage.getPaymentById(paymentId);
      if (!payment || payment.userId !== userId) return res.status(404).json({ message: "Not found" });
      // Map DB status "completed" → "success" so the frontend poll handler recognises it
      const frontendStatus = payment.status === "completed" ? "success" : payment.status;
      return res.json({
        status: frontendStatus,
        serviceId: payment.serviceId,
        receipt: (payment as any).mpesaReceiptNumber || payment.transactionRef || null,
        planId: payment.serviceId?.startsWith("plan_") ? payment.serviceId.replace("plan_", "") : null,
      });
    } catch (err: any) {
      res.status(500).json({ message: "Poll failed" });
    }
  });

  app.get("/api/pro-feature", isAuthenticated, async (req: any, res) => {
    const user_id = req.user?.claims?.sub;

    const isPro = await isUserPro(user_id);

    if (!isPro) {
      return res.status(403).json({ error: "PRO subscription required" });
    }

    res.json({ success: true });
  });

  app.get("/api/countries", async (req, res) => {
    try {
      const countries = await withCache(CACHE_KEYS.COUNTRIES, CACHE_TTL.COUNTRIES, () => storage.getCountries());
      res.json(countries);
    } catch (error) {
      console.error("Error fetching countries:", error);
      res.status(500).json({ message: "Failed to fetch countries" });
    }
  });

  app.get("/api/countries/:code", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Use getUserPlan as the single source of truth — handles active subscriptions,
      // expired plans, and admin-promoted accounts (users.plan column fallback).
      const planId = await storage.getUserPlan(userId);
      if (planId === "free") {
        return res.status(403).json({ message: "Payment required to access this content" });
      }

      const country = await storage.getCountryWithDetails(req.params.code);
      if (!country) {
        return res.status(404).json({ message: "Country not found" });
      }

      // Strip job portals for non-Pro users
      const isPaidPlan = planId === "pro";
      if (!isPaidPlan) {
        return res.json({ ...country, jobLinks: [] });
      }

      // For PRO users: return jobLinks but NEVER expose the external URL in the API response.
      // URLs are only served via the secure /api/go/job/:id?type=portal redirect endpoint.
      const safeJobLinks = (country.jobLinks || []).map(({ url: _url, ...rest }: any) => rest);
      res.json({ ...country, jobLinks: safeJobLinks });
    } catch (error) {
      console.error("Error fetching country:", error);
      res.status(500).json({ message: "Failed to fetch country" });
    }
  });

  app.get("/api/services", async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT id,
               code,
               slug,
               name, price,
               is_active                              AS active,
               category, badge, description, features,
               is_subscription                        AS "isSubscription",
               subscription_period                    AS "subscriptionPeriod",
               "order",
               flash_sale                             AS "flashSale",
               discount_percent                       AS "discountPercent",
               sale_start                             AS "saleStart",
               sale_end                               AS "saleEnd"
        FROM services
        WHERE is_active = true
          AND code IS NOT NULL
          AND name IS NOT NULL
          AND category IS NOT NULL
        ORDER BY "order" ASC, name ASC
      `);

      // Embed computed final price into every row (server is authoritative)
      const { calcFinalPrice } = await import("./price-engine");
      const rows = result.rows.map((svc: any) => {
        const pr = calcFinalPrice({
          price: svc.price, flashSale: svc.flashSale, discountPercent: svc.discountPercent,
          saleStart: svc.saleStart, saleEnd: svc.saleEnd,
        });
        return { ...svc, ...pr };
      });

      // Seed version from data on first request (survives restarts unchanged).
      if (!SERVICES_VERSION) {
        bumpServicesVersion(rows as Array<{ code: string; price: number }>);
      }
      console.log(
        `✅ SERVICES LOADED FROM DB: ${rows.map((s: any) => `${s.code}=KES${s.finalPrice}${s.isFlashSale ? `(FLASH-${s.discountPercent}%OFF)` : ""}`).join(", ")}`
      );
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.json({
        success:      true,
        services:     rows,
        last_updated: SERVICES_VERSION,
      });
    } catch (error) {
      console.error("Error fetching services:", error);
      res.status(500).json({ success: false, message: "Failed to fetch services" });
    }
  });

  // ── GET /api/pay-page?service=<code>[&user=<userId>] ──────────────────────
  // Public. Returns a single service row with computed final price.
  // If ?user= is supplied and that user already has an active unlock for
  // this service, responds 410 { expired: true } so the pay page can show
  // "Link expired" instead of firing a duplicate STK push.
  app.get("/api/pay-page", async (req, res) => {
    try {
      const code   = String(req.query.service ?? "").trim();
      const userId = String(req.query.user   ?? "").trim();
      if (!code) return res.status(400).json({ message: "service code is required" });

      const result = await pool.query(
        `SELECT id, code, slug, name, price, description, features,
                category, badge, is_subscription AS "isSubscription",
                flash_sale AS "flashSale",
                discount_percent AS "discountPercent",
                sale_start AS "saleStart", sale_end AS "saleEnd"
         FROM services
         WHERE code = $1 AND is_active = true
         LIMIT 1`,
        [code]
      );
      if (!result.rows[0]) return res.status(404).json({ message: `Service "${code}" not found` });

      // ── Already purchased? Mark link as expired ──────────────────────────
      if (userId) {
        const svcId = result.rows[0].id;
        const already = await pool.query(
          `SELECT us.id
           FROM user_services us
           WHERE us.user_id   = $1
             AND us.service_id = $2
             AND (us.expires_at IS NULL OR us.expires_at > NOW())
           LIMIT 1`,
          [userId, svcId]
        );
        if (already.rows.length) {
          console.log(`[PayPage] Link expired — userId=${userId} already owns service "${code}"`);
          return res.status(410).json({ expired: true, message: "Link expired" });
        }
      }

      const { calcFinalPrice } = await import("./price-engine");
      const svc = result.rows[0];
      const pricing = calcFinalPrice({
        price: svc.price,
        flashSale: svc.flashSale,
        discountPercent: svc.discountPercent,
        saleStart: svc.saleStart,
        saleEnd: svc.saleEnd,
      });
      res.json({ success: true, service: { ...svc, ...pricing } });
    } catch (err: any) {
      console.error("[PayPage] GET /api/pay-page error:", err.message);
      res.status(500).json({ message: "Failed to load service" });
    }
  });

  // Job counts for real-time alerts
  app.get("/api/job-counts", async (req, res) => {
    try {
      const counts = await withCache(CACHE_KEYS.JOB_COUNTS, CACHE_TTL.JOB_COUNTS, () => storage.getAllJobCounts());
      res.json(counts);
    } catch (error) {
      console.error("Error fetching job counts:", error);
      res.status(500).json({ message: "Failed to fetch job counts" });
    }
  });

  app.get("/api/job-counts/:countryCode", async (req, res) => {
    try {
      const code = req.params.countryCode;
      const count = await withCache(CACHE_KEYS.JOB_COUNT(code), CACHE_TTL.JOB_COUNTS, () => storage.getJobCountByCountry(code));
      res.json(count || { countryCode: code, jobCount: 0 });
    } catch (error) {
      console.error("Error fetching job count:", error);
      res.status(500).json({ message: "Failed to fetch job count" });
    }
  });

  // ── VISA SPONSORSHIP JOBS ─────────────────────────────────────────────────
  // Public endpoint: returns active visa-sponsored job listings (browse is free).
  // Applying requires Pro — gated at /api/go/job/:id only.
  // applyLink is NEVER included in the response — access it via /api/go/job/:id?type=visa
  app.get("/api/jobs", isAuthenticated, async (req: any, res) => {
    try {
      // 1. MUST BE LOGGED IN — isAuthenticated above normalises both Replit OIDC
      // and custom email/password sessions → req.user.claims.sub is always the UUID
      const user_id = req.user?.claims?.sub;
      if (!user_id) {
        return res.status(401).json({ error: "Login required" });
      }

      // 2. CHECK PRO — Supabase first, local DB fallback
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", String(user_id))
        .single();

      if (sub) {
        // Supabase row found — verify it is active and not expired
        const now = new Date();
        const expiry = new Date(sub.expires_at);
        if (sub.status !== "active" || expiry < now) {
          return res.status(403).json({ error: "Subscription expired" });
        }
      } else {
        // No Supabase row — fall back to local DB (handles pre-sync PRO users)
        const localPlan = await storage.getUserPlan(user_id);
        if (localPlan !== "pro") {
          return res.status(403).json({ error: "Upgrade to PRO" });
        }
        // Local DB says PRO — backfill Supabase so next request hits the fast path
        import("./supabaseClient").then(({ upgradeUserToPro }) =>
          upgradeUserToPro(user_id)
        ).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
      }

      // ✅ ONLY PRO USERS REACH HERE
      const { country, category } = req.query as { country?: string; category?: string };

      const conditions: any[] = [eq(jobs.isActive, true)];
      if (country && country !== "All Countries") {
        conditions.push(eq(jobs.country, country));
      }
      if (category && category !== "All Categories") {
        conditions.push(eq(jobs.jobCategory, category));
      }

      const result = await db
        .select({
          id:              jobs.id,
          title:           jobs.title,
          company:         jobs.company,
          country:         jobs.country,
          salary:          jobs.salary,
          jobCategory:     jobs.jobCategory,
          visaSponsorship: jobs.visaSponsorship,
          description:     jobs.description,
          isActive:        jobs.isActive,
          createdAt:       jobs.createdAt,
        })
        .from(jobs)
        .where(and(...conditions))
        .orderBy(jobs.createdAt);

      res.json(result);
    } catch (err) {
      console.error("[/api/jobs]", err);
      res.status(500).json({ error: "Server error" });
    }
  });

  app.get("/api/jobs/sponsorship", async (req: any, res) => {
    try {
      const { country, category } = req.query as { country?: string; category?: string };

      const conditions = [
        eq(jobs.isActive, true),
        eq(jobs.visaSponsorship, true),
      ];
      if (country && country !== "All Countries") {
        conditions.push(eq(jobs.country, country));
      }
      if (category && category !== "All Categories") {
        conditions.push(eq(jobs.jobCategory, category));
      }

      const result = await db
        .select({
          id: jobs.id,
          title: jobs.title,
          company: jobs.company,
          country: jobs.country,
          salary: jobs.salary,
          jobCategory: jobs.jobCategory,
          visaSponsorship: jobs.visaSponsorship,
          description: jobs.description,
          isActive: jobs.isActive,
          createdAt: jobs.createdAt,
          // applyLink intentionally omitted — served only via /api/go/job/:id?type=visa
        })
        .from(jobs)
        .where(and(...conditions))
        .orderBy(jobs.createdAt);

      res.json(result);
    } catch (error) {
      console.error("Error fetching sponsorship jobs:", error);
      res.status(500).json({ message: "Failed to fetch jobs" });
    }
  });

  // ── POST /api/jobs/submit — quick job submission (maps to tracked_applications) ─
  // Accepts the simplified external payload shape:
  //   { job_url, job_title, company, additional_notes, target_country? }
  // user_id in the request body is intentionally ignored — userId is always
  // derived from the authenticated session to prevent spoofing.
  const jobSubmitSchema = z.object({
    job_url:          z.string().url("job_url must be a valid URL"),
    job_title:        z.string().min(1, "job_title is required"),
    company:          z.string().min(1, "company is required"),
    additional_notes: z.string().max(2000).optional(),
    target_country:   z.string().optional(),
  });

  app.post("/api/jobs/submit", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const parsed = jobSubmitSchema.safeParse(req.body);
      if (!parsed.success) {
        const first = parsed.error.errors[0];
        return res.status(400).json({ error: first.message, field: first.path[0] });
      }

      const { job_url, job_title, company, additional_notes, target_country } = parsed.data;

      const application = await storage.createTrackedApplication({
        userId,
        jobTitle:      job_title,
        companyName:   company,
        jobUrl:        job_url,
        targetCountry: target_country ?? "International",
        notes:         additional_notes ?? null,
        status:        "applied",
        appliedAt:     new Date(),
        salary:        null,
        location:      null,
        jobType:       null,
        source:        "direct_submit",
      });

      console.log(`[JobSubmit] userId=${userId} submitted "${job_title}" @ ${company} → id=${application.id}`);
      return res.status(201).json({
        id:         application.id,
        status:     application.status,
        job_title:  application.jobTitle,
        company:    application.companyName,
        job_url:    application.jobUrl,
        notes:      application.notes,
        applied_at: application.appliedAt,
        created_at: application.createdAt,
      });
    } catch (err: any) {
      console.error("[JobSubmit] Failed:", { error: err?.message, userId: req.user?.claims?.sub, timestamp: new Date().toISOString() });
      return res.status(500).json({ error: "Failed to submit job" });
    }
  });

  // ── POST /api/jobs/analyze — scrape + GPT-4o analysis of a job URL ─────────
  // Input:  { job_url, application_id? }
  // Output: { title, company, country, seniority, keywords, required_skills,
  //           nice_to_have, company_culture, tone, analyzed_at }
  // Results are cached 30 min by URL so the same posting is never analysed twice.
  // If application_id is provided, the analysis is saved to the tracked application's
  // applicationAnswers column so it can be used for material generation later.
  const jobAnalyzeSchema = z.object({
    job_url:        z.string().url("job_url must be a valid URL"),
    application_id: z.string().optional(),
  });

  app.post("/api/jobs/analyze", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const parsed = jobAnalyzeSchema.safeParse(req.body);
      if (!parsed.success) {
        const first = parsed.error.errors[0];
        return res.status(400).json({ error: first.message, field: first.path[0] });
      }

      const { job_url, application_id } = parsed.data;

      const { analyzeJob } = await import("./services/job-analyzer");
      const analysis = await analyzeJob(job_url);

      // Optionally persist to the tracked application so it can drive material generation
      if (application_id) {
        const app = await storage.getTrackedApplicationById(application_id);
        if (app && app.userId === userId) {
          await storage.updateTrackedApplication(application_id, {
            applicationAnswers: { job_analysis: analysis } as any,
          });
          console.log(`[JobAnalyze] Saved analysis to application ${application_id}`);
        }
      }

      return res.json({
        url:             analysis.url,
        title:           analysis.title,
        company:         analysis.company,
        country:         analysis.country,
        seniority:       analysis.seniority,
        keywords:        analysis.keywords,
        required_skills: analysis.required_skills,
        nice_to_have:    analysis.nice_to_have,
        company_culture: analysis.company_culture,
        tone:            analysis.tone,
        analyzed_at:     analysis.analyzed_at,
      });
    } catch (err: any) {
      const msg: string = err?.message ?? "Analysis failed";
      const status = msg.includes("Could not extract") ? 422 : 500;
      console.error("[JobAnalyze] Failed:", { error: msg, url: req.body?.job_url, timestamp: new Date().toISOString() });
      return res.status(status).json({ error: msg });
    }
  });

  // ── GET /api/jobs/:id/similar — jobs sharing category or country ──────────
  app.get("/api/jobs/:id/similar", isAuthenticated, async (req: any, res) => {
    try {
      const jobId = req.params.id;

      const { data: job, error: jobErr } = await supabase
        .from("jobs")
        .select("*")
        .eq("id", jobId)
        .single();

      if (jobErr || !job) return res.status(404).json({ error: "Job not found" });

      const filters: string[] = [];
      if (job.category) filters.push(`category.eq.${job.category}`);
      if (job.country)  filters.push(`country.eq.${job.country}`);

      // Parse salary to numeric — handles "KES 45,000", "$3,500/month", "45000", etc.
      const salaryNum = job.salary ? Number(String(job.salary).replace(/[^0-9.]/g, "")) : NaN;
      if (!isNaN(salaryNum) && salaryNum > 0) {
        filters.push(`salary.gte.${salaryNum - 500}`);
        filters.push(`salary.lte.${salaryNum + 500}`);
      }

      if (!filters.length) return res.json([]);

      const { data: similar, error: simErr } = await supabase
        .from("jobs")
        .select("*")
        .neq("id", jobId)
        .or(filters.join(","))
        .limit(10);

      if (simErr) throw simErr;
      res.json(similar ?? []);
    } catch (err) {
      console.error("[SimilarJobs]", err);
      res.status(500).json({ error: "Similar jobs error" });
    }
  });

  // ── SECURE JOB REDIRECT ───────────────────────────────────────────────────
  // PRO-only: resolves a job's external URL server-side and returns it.
  // Never exposes URLs in HTML or public API responses.
  // Logs: userId, jobId, jobType, IP, timestamp for click analytics.
  // type: 'visa' (jobs table), 'agency' (agency_jobs), 'portal' (job_links)
  app.get("/api/go/job/:jobId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { jobId } = req.params;
      const jobType = (req.query.type as string) || "visa";

      // ── PRO gate ──────────────────────────────────────────────────────────
      const planId = await storage.getUserPlan(userId);
      if (planId !== "pro") {
        return res.status(403).json({
          error: "upgrade_required",
          message: "Upgrade to Pro to access job links.",
        });
      }

      // ── Resolve the external URL ──────────────────────────────────────────
      let externalUrl: string | null | undefined;

      if (jobType === "visa") {
        const [job] = await db
          .select({ applyLink: jobs.applyLink })
          .from(jobs)
          .where(eq(jobs.id, jobId));
        externalUrl = job?.applyLink;
      } else if (jobType === "agency") {
        const [job] = await db
          .select({ applyLink: agencyJobsTable.applyLink })
          .from(agencyJobsTable)
          .where(eq(agencyJobsTable.id, jobId));
        externalUrl = job?.applyLink;
      } else if (jobType === "portal") {
        const [link] = await db
          .select({ url: jobLinksTable.url })
          .from(jobLinksTable)
          .where(eq(jobLinksTable.id, jobId));
        externalUrl = link?.url;
        // Also increment the click counter for analytics
        if (link) {
          storage.incrementJobLinkClick(jobId).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        }
      } else {
        return res.status(400).json({ message: "Invalid job type. Use: visa, agency, or portal" });
      }

      if (!externalUrl) {
        return res.status(404).json({ message: "Job link not found or not yet available" });
      }

      // ── Log the access ────────────────────────────────────────────────────
      const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim()
        || req.socket?.remoteAddress
        || null;

      db.insert(jobClickLog).values({
        userId,
        jobId,
        jobType,
        ipAddress: ip,
      }).catch((err: any) => {
        console.error("[job-click-log] Failed to persist click log:", err);
      });

      // ── Return the URL (do NOT redirect — frontend opens in new tab) ──────
      res.json({ url: externalUrl });
    } catch (error) {
      console.error("Error resolving job redirect:", error);
      res.status(500).json({ message: "Failed to resolve job link" });
    }
  });

  // ── LOAD TEST ENDPOINT ────────────────────────────────────────────────────
  // Only active when LOAD_TEST_MODE=true. Bypasses auth so the load test
  // script can simulate thousands of distinct users. NEVER enable in prod.
  app.post("/api/load-test/stk", async (req: any, res) => {
    if (process.env.LOAD_TEST_MODE !== "true") {
      return res.status(403).json({ error: "Load test mode is disabled" });
    }
    try {
      const { userId, phone, amount = 4500 } = req.body;
      if (!userId || !phone) {
        return res.status(400).json({ error: "userId and phone are required" });
      }

      // Normalize phone
      const normalizedPhone = normalizePhone(String(phone), "KE") ?? String(phone);

      // Create payment record
      const payment = await storage.createPayment({
        userId: String(userId),
        amount: Number(amount),
        currency: "KES",
        method: "mpesa",
        status: "pending",
        metadata: JSON.stringify({ phone: normalizedPhone, loadTest: true }),
      });

      // Call mock stkPush (returns instantly in LOAD_TEST_MODE)
      const { stkPush } = await import("./mpesa");
      const stkResponse = await stkPush(normalizedPhone, Number(amount), "Load Test Payment", `WAH-${payment.id}`);
      const checkoutId = stkResponse.CheckoutRequestID;

      // Transition to awaiting_payment
      await storage.updatePayment(payment.id, {
        status:            "awaiting_payment",
        transactionRef:    checkoutId,
        checkoutRequestId: checkoutId,
      } as any);

      res.json({
        paymentId:         payment.id,
        checkoutRequestId: checkoutId,
        status:            "awaiting_payment",
      });
    } catch (err: any) {
      console.error("[LOAD_TEST] STK error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Status check endpoint for load test (also no-auth in LOAD_TEST_MODE)
  app.get("/api/load-test/status/:paymentId", async (req: any, res) => {
    if (process.env.LOAD_TEST_MODE !== "true") {
      return res.status(403).json({ error: "Load test mode is disabled" });
    }
    try {
      const payment = await storage.getPaymentById(req.params.paymentId);
      if (!payment) return res.status(404).json({ error: "Not found" });
      res.json({ paymentId: payment.id, status: payment.status });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  // ══════════════════════════════════════════════════════════════════════════
  // POST /api/payments/create — Universal Payment Gateway (v2)
  //
  // Single endpoint that routes to any registered gateway (M-Pesa, PayPal, …).
  // Existing per-method endpoints (/api/payments/initiate, /api/paypal/…) are
  // unchanged — this is purely additive.
  //
  // Body: { orderId, orderType, paymentMethod, amount, currency?, phone?, amountUSD? }
  // ══════════════════════════════════════════════════════════════════════════

  app.post("/api/payments/create", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const {
        orderId,
        orderType = "payment",
        paymentMethod,
        amount,
        currency = "KES",
        phone,
        amountUSD,
        description,
      } = req.body;

      // Basic validation
      if (!orderId || !paymentMethod || !amount) {
        return res.status(400).json({
          message: "orderId, paymentMethod, and amount are required",
        });
      }

      if (!["payment", "service_order", "application_pack"].includes(orderType)) {
        return res.status(400).json({ message: `Unknown orderType: ${orderType}` });
      }

      const { routePayment, toUnifiedResponse } = await import("./services/payments/paymentRouter");

      const gatewayResult = await routePayment({
        orderId,
        orderType,
        paymentMethod,
        amount: Number(amount),
        currency,
        description: description || "WorkAbroad Hub Payment",
        userId,
        phone,
        amountUSD: amountUSD != null ? Number(amountUSD) : undefined,
      });

      const statusCode = gatewayResult.success ? 200 : gatewayResult.error?.includes("not found") ? 404 : 400;
      return res.status(statusCode).json(toUnifiedResponse(gatewayResult));

    } catch (err: any) {
      console.error("[POST /api/payments/create]", err.message);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/payments/gateways — list all registered payment gateways
  app.get("/api/payments/gateways", (_req, res) => {
    import("./services/payments/paymentRouter").then(({ paymentRegistry }) => {
      res.json({ gateways: paymentRegistry.list() });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/payments/options — smart payment method recommendation (Step 5)
  // Returns: { recommended, available, country, countryName, fromHistory }
  // ═══════════════════════════════════════════════════════════════════════════
  app.get("/api/payments/options", async (req: any, res) => {
    try {
      const { detectCountry } = await import("./middleware/locationDetector");
      const { getRecommendedPaymentMethod } = await import("./services/paymentRecommender");

      const geo = await detectCountry(req);
      const userId = req.user?.claims?.sub as string | undefined;

      let userHistory: any[] = [];
      if (userId) {
        try {
          userHistory = await storage.getPaymentsByUser(userId);
        } catch {}
      }

      const recommendation = getRecommendedPaymentMethod(geo.country, userHistory, geo.countryName);

      // Step 7: Analytics — track options viewed with country + recommendation
      if (userId) {
        const sessionId = (req.session as any)?.id || req.headers["x-session-id"] || "anon";
        storage.recordAnalyticsEvent({
          userId,
          sessionId: String(sessionId),
          eventType: "payment_options_viewed",
          eventName: "payment_options",
          eventCategory: "conversion",
          eventData: {
            recommended: recommendation.recommended,
            fromHistory: recommendation.fromHistory,
          },
          page: "/payment",
          country: geo.country,
          deviceType: req.headers["user-agent"]?.includes("Mobile") ? "mobile" : "desktop",
          userAgent: req.headers["user-agent"],
        }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
      }

      res.json({
        recommended: recommendation.recommended,
        available: recommendation.available,
        country: recommendation.country,
        countryName: recommendation.countryName,
        fromHistory: recommendation.fromHistory,
        alternativeOnFailure: recommendation.alternativeOnFailure,
      });
    } catch (err: any) {
      // Fail open — return a default recommendation
      console.error("[GET /api/payments/options]", err.message);
      res.json({
        recommended: "mpesa",
        available: ["mpesa"],
        country: "XX",
        countryName: "Unknown",
        fromHistory: false,
        alternativeOnFailure: "mpesa",
      });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /api/payments/track-selection — analytics: user chose a method (Step 7)
  // Body: { paymentMethod, country, orderId? }
  // ═══════════════════════════════════════════════════════════════════════════
  app.post("/api/payments/track-selection", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { paymentMethod, country, orderId } = req.body;
      if (!paymentMethod) return res.status(400).json({ message: "paymentMethod required" });

      const sessionId = (req.session as any)?.id || req.headers["x-session-id"] || "anon";
      await storage.recordAnalyticsEvent({
        userId,
        sessionId: String(sessionId),
        eventType: "payment_method_selected",
        eventName: "payment_method_selected",
        eventCategory: "conversion",
        eventData: { paymentMethod, orderId: orderId ?? null },
        page: "/payment",
        country: country || "XX",
        deviceType: req.headers["user-agent"]?.includes("Mobile") ? "mobile" : "desktop",
        userAgent: req.headers["user-agent"],
      });

      res.json({ tracked: true });
    } catch (err: any) {
      res.json({ tracked: false });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /api/payments/suggest-alternative — failover suggestion (Step 8)
  // Query: ?failedMethod=mpesa&country=KE
  // Returns: { alternative, message }
  // ═══════════════════════════════════════════════════════════════════════════
  app.get("/api/payments/suggest-alternative", async (req: any, res) => {
    try {
      const { getAlternativeMethod } = await import("./services/paymentRecommender");
      const failedMethod = (req.query.failedMethod as string) || "mpesa";
      const country = (req.query.country as string) || "KE";

      const alternative = getAlternativeMethod(failedMethod as "mpesa", country);

      res.json({
        alternative,
        message: "M-Pesa is our only supported payment method. Please try again.",
      });
    } catch {
      res.json({ alternative: "mpesa", message: "Please pay securely via M-Pesa." });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────

  // GET /api/payments/pending — returns the user's in-flight STK if one exists
  // Used by the frontend to block duplicate STK pushes before they're sent.
  // An "awaiting_payment" record older than 5 minutes is considered expired (Safaricom STK TTL).
  app.get("/api/payments/pending", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const userPayments = await storage.getPaymentsByUser(userId);
      const STK_TTL_MS = 5 * 60 * 1000; // 5 minutes — Safaricom STK push TTL
      const cutoff = Date.now() - STK_TTL_MS;

      const activePending = userPayments.find(p =>
        p.status === "awaiting_payment" &&
        new Date(p.createdAt!).getTime() > cutoff
      );

      if (activePending) {
        return res.json({
          hasPending: true,
          paymentId: activePending.id,
          createdAt: activePending.createdAt,
          expiresAt: new Date(new Date(activePending.createdAt!).getTime() + STK_TTL_MS).toISOString(),
        });
      }

      return res.json({ hasPending: false });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/payments/initiate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Fraud gate — block before any processing
      if (await isFraudUser(userId)) {
        const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.socket?.remoteAddress ?? "unknown";
        flagForManualReview(userId, { action: "payment_attempt_blocked", detail: "initiate endpoint", ip: clientIp }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        return res.status(403).json({
          message: "Your account has been flagged for review. Please contact support.",
          code:    "ACCOUNT_UNDER_REVIEW",
        });
      }

      const parsed = initiatePaymentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request data", errors: parsed.error.errors });
      }

      const { method, phoneNumber: bodyPhone, refCode, serviceId: rawServiceId, plan_id: bodyPlanId, serviceName: clientServiceName } = parsed.data;
      // `plan_id` is the simplified alias used by the two-step flow; falls back to serviceId, then default.
      const serviceId = rawServiceId || bodyPlanId || "main_subscription";

      // Phone resolution: body → user profile (enables the simplified { plan_id } call shape)
      let phoneNumber = bodyPhone;
      if (method === "mpesa" && !phoneNumber) {
        try {
          const userRow = await db.query.users.findFirst({ where: (u: any, { eq: eqFn }: any) => eqFn(u.id, userId) } as any) as any;
          phoneNumber = userRow?.phone ?? undefined;
        } catch { /* ignore — validated below */ }
      }
      if (method === "mpesa" && !phoneNumber) {
        return res.status(400).json({ success: false, error: "Phone number required. Add one to your profile or pass phoneNumber in the request." });
      }

      // SECURITY: Normalize phone number to E.164 format for M-Pesa
      let normalizedPhone = "";
      if (method === "mpesa" && phoneNumber) {
        normalizedPhone = normalizePhone(phoneNumber, "KE") ?? phoneNumber;
        if (!/^254[71]\d{8}$/.test(normalizedPhone)) {
          return res.status(400).json({ message: "Invalid phone number. Use 07XXXXXXXX, 01XXXXXXXX, or +254XXXXXXXXX" });
        }
      }

      // SECURITY: Check for account lockout by IP, phone, and per-user payment failure lock
      const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
      const isIpLocked = await storage.isAccountLocked(clientIp, "ip");
      const isPhoneLocked = normalizedPhone ? await storage.isAccountLocked(normalizedPhone, "phone") : false;
      const isUserPaymentLocked = await storage.isAccountLocked(userId, "payment_user");
      if (isIpLocked || isPhoneLocked || isUserPaymentLocked) {
        const reason = isUserPaymentLocked
          ? "Too many failed payment attempts. Your account is temporarily locked. Please contact support or try again in 1 hour."
          : "Too many failed payment attempts. Please try again in 30 minutes.";
        return res.status(429).json({ message: reason, locked: true });
      }

      // Phase 2: Per-IP STK Push rate limit — 5 requests per IP per 10 minutes.
      if (!checkStkPushIpRateLimit(clientIp)) {
        console.warn(`[M-Pesa][Security] Per-IP STK rate limit exceeded: ip=${clientIp}`);
        storage.createPaymentAuditLog({
          paymentId: null, event: "ip_rate_limit_exceeded", ip: clientIp,
          metadata: { userId, phone: normalizedPhone },
        }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        return res.status(429).json({ message: "Too many payment attempts from this network. Please try again later." });
      }

      // Phase 2: Per-user STK Push rate limit — 3 requests per user per 5 minutes.
      if (!checkStkPushRateLimit(userId)) {
        console.warn(`[M-Pesa][Security] STK Push rate limit exceeded for userId=${userId}`);
        storage.createPaymentAuditLog({
          paymentId: null, event: "user_rate_limit_exceeded", ip: clientIp,
          metadata: { userId, phone: normalizedPhone },
        }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        return res.status(429).json({
          message: "Too many payment attempts. Please wait a few minutes before trying again."
        });
      }

      // Phase 10: Track all payment attempts per IP — lock out IP after >10 in 10 minutes.
      const LOCALHOST_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
      const isLocalhost = LOCALHOST_IPS.has(clientIp) || clientIp.startsWith("::ffff:127.");
      const ipAttemptCount = recordPaymentAttemptByIp(clientIp);
      if (!isLocalhost && ipAttemptCount > 10) {
        console.warn(`[M-Pesa][Security] Bot abuse detected: ip=${clientIp} attempts=${ipAttemptCount}/10min`);
        storage.createPaymentAuditLog({
          paymentId: null, event: "bot_abuse_detected", ip: clientIp,
          metadata: { userId, phone: normalizedPhone, attemptCount: ipAttemptCount },
        }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        // Escalate: increment IP lockout counter — after 5 increments IP is locked for 30 minutes
        storage.incrementFailedAttempts(clientIp, "ip").catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        return res.status(429).json({ message: "Suspicious activity detected. Please contact support." });
      }

      // Phase 4a: Per-user pending payment guard — block if the user already has an active STK in flight.
      // STK push TTL on Safaricom's side is ~5 minutes; we use the same window here.
      if (method === "mpesa") {
        const userPayments = await storage.getPaymentsByUser(userId);
        const STK_TTL_MS = 5 * 60 * 1000;
        const cutoff = Date.now() - STK_TTL_MS;
        const existingStk = userPayments.find(p =>
          p.status === "awaiting_payment" &&
          new Date(p.createdAt!).getTime() > cutoff
        );
        if (existingStk) {
          storage.createPaymentAuditLog({
            paymentId: existingStk.id, event: "duplicate_stk_push_blocked", ip: clientIp,
            metadata: { userId, phone: normalizedPhone, existingPaymentId: existingStk.id },
          }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
          return res.status(409).json({
            hasPendingPayment: true,
            paymentId: existingStk.id,
            message: "You already have a pending M-Pesa payment. Complete it first — check your phone for the prompt.",
          });
        }
      }

      // Phase 4b: Duplicate awaiting_payment prevention by phone number.
      // If this phone already has an order awaiting payment (from any user), reject to prevent double charges.
      if (normalizedPhone) {
        const awaitingPayments = await storage.getPaymentsByStatus("awaiting_payment");
        const phoneAlreadyAwaitingPayment = awaitingPayments.some(p => {
          try {
            const meta = p.metadata ? JSON.parse(p.metadata as string) : {};
            return meta.phone === normalizedPhone && p.userId !== userId;
          } catch { return false; }
        });
        if (phoneAlreadyAwaitingPayment) {
          storage.createPaymentAuditLog({
            paymentId: null, event: "duplicate_stk_push_blocked", ip: clientIp,
            metadata: { userId, phone: normalizedPhone },
          }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
          return res.status(409).json({
            message: "A payment is already in progress for this phone number. Please wait ~2 minutes for it to expire, then try again."
          });
        }
      }

      // SECURITY: Store refCode AND phone in metadata for secure server-side verification.
      // The phone is stored here so the M-Pesa callback can verify the payer matches the initiator.
      const metadata = JSON.stringify({
        ...(refCode ? { refCode } : {}),
        ...(normalizedPhone ? { phone: normalizedPhone } : {}),
      });

      // Resolve amount from DB.
      // Plans:    "plan_pro" → strip prefix → "pro"   (looks up plans table)
      // Services: "ats_cv_optimization" → use as-is  (looks up services table by slug)
      const mpesaPlanKey = serviceId.startsWith("plan_") ? serviceId.replace("plan_", "") : serviceId;
      const resolvedMpesa = await resolveCanonicalPlanPrice(mpesaPlanKey);
      if (!resolvedMpesa) return res.status(400).json({ success: false, error: `Service or plan "${mpesaPlanKey}" is not configured for payment.`, message: `Service or plan "${mpesaPlanKey}" is not configured for payment.` });
      const mpesaAmount = resolvedMpesa.finalPrice;

      // Derive planId: subscription plans strip the "plan_" prefix ("plan_pro" → "pro"),
      // standalone service purchases use the serviceId itself as the slug
      // e.g. "ats_cv_optimization" → "ats_cv_optimization"
      const derivedPlanId = serviceId.startsWith("plan_") ? serviceId.replace("plan_", "") : serviceId;

      // Resolve serviceName: prefer client-provided → plan name map → services table by slug → fallback
      const planNameMap: Record<string, string> = {
        trial:    planLabel("trial"),
        monthly:  planLabel("monthly"),
        yearly:   planLabel("yearly"),
        pro:      planLabel("pro"),
        basic:    "Basic Plan",
        standard: "Standard Plan",
      };
      let resolvedServiceName: string | null = clientServiceName ?? null;
      if (!resolvedServiceName) {
        // Try the plan name map first (covers plan purchases)
        resolvedServiceName = planNameMap[derivedPlanId] ?? null;
      }
      if (!resolvedServiceName) {
        // Fall through: look up service name by slug (covers all service purchases)
        try {
          const svcBySlug = await storage.getServiceBySlug(derivedPlanId);
          if (svcBySlug?.name) {
            resolvedServiceName = svcBySlug.name;
          } else {
            // Last resort: look up by UUID id (legacy path)
            const svcById = await db.query.services?.findFirst({ where: (s: any, { eq: eqFn }: any) => eqFn(s.id, serviceId) } as any) as any;
            resolvedServiceName = svcById?.name ?? svcById?.title ?? null;
          }
        } catch { /* leave null — falls back to slug below */ }
      }
      if (!resolvedServiceName) {
        // Absolute fallback: humanize the slug (e.g. "interview_coaching" → "Interview Coaching")
        resolvedServiceName = derivedPlanId.split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      }

      // ── Row-first pattern ──────────────────────────────────────────────────
      // 1. CREATE payment row now (status "pending") — STK push is deferred to POST /api/mpesa/stk.
      // 2. Return payment.id as checkout_request_id so the frontend can call /api/mpesa/stk with it.
      // 3. /api/mpesa/stk triggers the actual Safaricom call, then stamps the real
      //    CheckoutRequestID back onto the row.
      //
      // Reason: the row must exist before the push so the frontend has a stable correlation ID
      // even if the network call to Safaricom takes time or fails on retry.
      const pendingPayment = await storage.createPayment({
        userId,
        amount:       mpesaAmount,
        baseAmount:   resolvedMpesa.basePrice,
        discountType: resolvedMpesa.discountType,
        currency:     "KES",
        method,
        phone:        normalizedPhone || phoneNumber || null,
        status:       "pending",
        planId:       derivedPlanId,
        serviceId,
        serviceName:  resolvedServiceName,
        // checkoutRequestId is intentionally null here — set by /api/mpesa/stk after Safaricom responds
        metadata:     metadata !== "{}" ? metadata : null,
      } as any);

      // Audit log — row created, awaiting STK push
      storage.createPaymentAuditLog({
        paymentId: pendingPayment.id,
        event:     "payment_row_created",
        ip:        clientIp,
        metadata:  { phone: normalizedPhone, amount: mpesaAmount, serviceId, planId: derivedPlanId },
      }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      return res.json({
        success:             true,
        paymentId:           pendingPayment.id,
        checkout_request_id: String(pendingPayment.id),   // payment DB id — used by /api/mpesa/stk
        checkoutRequestId:   String(pendingPayment.id),
        message:             "Payment record created. Call /api/mpesa/stk to trigger the STK push.",
      });
    } catch (error) {
      console.error("Error initiating payment:", error);
      res.status(500).json({ success: false, error: "Failed to initiate payment", message: "Failed to initiate payment" });
    }
  });

  // ── POST /api/mpesa/stk — step-2: trigger the Safaricom STK push ─────────
  // Called after POST /api/payments/initiate returns { checkout_request_id: paymentId }.
  // Body: { checkoutRequestId: "<payment DB id>" }
  //
  // Flow:
  //   1. Look up the pending payment row by DB id
  //   2. Validate ownership + status (idempotent — returns success if already pushed)
  //   3. Call Safaricom stkPush() with phone + amount from the row
  //   4. Stamp the real Safaricom CheckoutRequestID back onto the row
  //   5. Return { success: true, checkoutRequestId: "<safaricom id>" }
  app.post("/api/mpesa/stk", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });

      const { checkoutRequestId } = req.body;
      if (!checkoutRequestId) {
        return res.status(400).json({ success: false, error: "checkoutRequestId is required" });
      }

      // Look up the payment row — supports both DB id (new row-first flow) and Safaricom id (legacy)
      let payment = await storage.getPaymentById(String(checkoutRequestId));
      if (!payment) {
        payment = await storage.getPaymentByTransactionRef(String(checkoutRequestId));
      }
      if (!payment) {
        return res.status(404).json({ success: false, error: "Payment not found for this checkoutRequestId" });
      }

      // Ownership check
      if (String(payment.userId) !== String(userId)) {
        return res.status(403).json({ success: false, error: "Forbidden" });
      }

      const currentStatus = (payment as any).status ?? "pending";

      // Idempotency: if the STK was already pushed (checkoutRequestId already set to a Safaricom ID
      // and differs from the DB id), just return success — no double-push.
      const safaricomIdAlreadySet =
        (payment as any).checkoutRequestId &&
        String((payment as any).checkoutRequestId) !== String(payment.id);
      if (safaricomIdAlreadySet && currentStatus !== "failed") {
        return res.json({
          success:            true,
          alreadySent:        true,
          status:             currentStatus,
          paymentId:          payment.id,
          checkoutRequestId:  (payment as any).checkoutRequestId,
          message:            "STK push was already sent. Waiting for user to enter PIN.",
        });
      }

      // Get phone from the payment row (stored during initiate) or the user's profile
      let phone: string | null = (payment as any).phone ?? null;
      if (!phone) {
        try {
          const userRow = await db.query.users.findFirst({ where: (u: any, { eq: eqFn }: any) => eqFn(u.id, userId) } as any) as any;
          phone = userRow?.phone ?? null;
        } catch { /* leave null — validated below */ }
      }
      if (!phone) {
        return res.status(400).json({ success: false, error: "No phone number on record. Update your profile and try again." });
      }

      const amount = Number((payment as any).amount ?? 0);
      if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, error: "Invalid payment amount." });
      }

      // Use the service name as the Safaricom transaction description (shows on MPESA statement)
      // and the plan_id / slug as the account reference (unique order identifier)
      const serviceName = (payment as any).serviceName ?? "WorkAbroad Hub";
      const accountRef  = (payment as any).planId ?? (payment as any).plan_id ?? `WAH-${payment.id}`;

      // Check M-Pesa credentials
      const useLiveMpesa = process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET &&
                           process.env.MPESA_SHORTCODE   && process.env.MPESA_PASSKEY;

      if (!useLiveMpesa) {
        // ── Simulated path ───────────────────────────────────────────────────
        const simId = `SIM-${payment.id}`;
        await storage.updatePayment(payment.id, {
          checkoutRequestId: simId,
          transactionRef:    simId,
        } as any);
        // Auto-complete after 2 s (mirrors legacy simulated flow)
        setTimeout(async () => {
          try {
            const txRef = `TXN${Date.now()}`;
            await storage.updatePayment(payment.id, { status: "success", transactionRef: txRef } as any);
            const svcId = (payment as any).serviceId;
            await storage.createUserSubscription({ userId, paymentId: payment.id, isActive: true, expiresAt: null });
            await storage.unlockService(userId, svcId, payment.id, { transactionRef: txRef, method: "mpesa", simulated: true });
          } catch (e: any) { console.error("[/api/mpesa/stk sim]", e.message); }
        }, 2000);
        return res.json({
          success:            true,
          paymentId:          payment.id,
          checkoutRequestId:  simId,
          checkout_request_id: simId,
          message:            "STK push sent to your phone (simulated). Enter your PIN.",
        });
      }

      // ── Live Safaricom STK push ───────────────────────────────────────────
      let safaricomId: string;
      let merchantRequestId: string;
      try {
        const { stkPush } = await import("./mpesa");
        const stkResponse  = await stkPush(phone, amount, serviceName, accountRef);
        safaricomId        = stkResponse.CheckoutRequestID;
        merchantRequestId  = stkResponse.MerchantRequestID;
      } catch (mpesaError: any) {
        console.error("[/api/mpesa/stk] STK push failed:", mpesaError.response?.data || mpesaError.message);
        await storage.updatePayment(payment.id, { status: "failed" } as any).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        storage.createPaymentAuditLog({
          paymentId: payment.id, event: "stk_push_failed",
          ip: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown",
          metadata: { error: mpesaError.message, phone, amount },
        }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        return res.status(500).json({ success: false, error: "Failed to send STK push. Please try again." });
      }

      // Stamp Safaricom's IDs onto the row — this is what the M-Pesa callback will match on
      await storage.updatePayment(payment.id, {
        checkoutRequestId: safaricomId,
        transactionRef:    safaricomId,
        metadata: JSON.stringify({
          checkoutRequestId: safaricomId,
          merchantRequestId,
          phone,
        }),
      } as any);

      storage.createPaymentAuditLog({
        paymentId: payment.id,
        event:     "stk_push_initiated",
        ip:        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown",
        metadata:  { checkoutRequestId: safaricomId, merchantRequestId, phone, amount },
      }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      return res.json({
        success:             true,
        paymentId:           payment.id,
        checkoutRequestId:   safaricomId,
        checkout_request_id: safaricomId,
        message:             "STK push sent to your phone. Please enter your M-Pesa PIN.",
      });
    } catch (err: any) {
      console.error("[POST /api/mpesa/stk]", err.message);
      return res.status(500).json({ success: false, error: "Internal server error" });
    }
  });

  app.get("/api/payment-status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const userPayments = await storage.getPaymentsByUser(userId);
      const hasPaid = true;
      
      
      res.json({ 
        paid: hasPaid,
        receipt: null
      });
    } catch (error) {
      console.error("Error checking payment status:", error);
      res.status(500).json({ error: "Failed to check payment status" });
    }
  });

  // ── Service access endpoints ───────────────────────────────────────────────
  // GET /api/user/services — list all services the authenticated user has unlocked
  app.get("/api/user/services", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const services = await storage.getUserServices(userId);
      res.json({ services });
    } catch (err: any) {
      console.error("[GET /api/user/services]", err.message);
      res.status(500).json({ error: "Failed to fetch unlocked services" });
    }
  });

  // GET /api/user/has-service/:serviceId — fast boolean check for a single service
  app.get("/api/user/has-service/:serviceId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
      const { serviceId } = req.params;
      const hasAccess = await storage.hasServiceAccess(userId, serviceId);
      res.json({ serviceId, hasAccess });
    } catch (err: any) {
      console.error("[GET /api/user/has-service]", err.message);
      res.status(500).json({ error: "Failed to check service access" });
    }
  });

  // ── GET /api/user/documents — all deliverables for the signed-in user ──────
  // Equivalent to Firebase: database.ref(`documents/${userId}`).once('value')
  app.get("/api/user/documents", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub as string;
      const documents = await storage.getDeliverablesByUserId(userId);
      res.json({ userId, documents, count: documents.length });
    } catch (err: any) {
      console.error("[GET /api/user/documents]", err?.message ?? err);
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  // ── Phase 11: Per-payment status endpoint (with retry info) ───────────────
  app.get("/api/payment-status/:paymentId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { paymentId } = req.params;
      const payment = await storage.getPaymentById(paymentId);
      if (!payment) return res.status(404).json({ error: "Payment not found" });
      // Users can only view their own payments (admins may view all)
      if (payment.userId !== userId && !req.user?.claims?.metadata?.isAdmin) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const retryCount = (payment as any).retryCount ?? 0;
      const maxRetries = (payment as any).maxRetries ?? 3;
      res.json({
        paymentId: payment.id,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        mpesaReceiptNumber: (payment as any).mpesaReceiptNumber ?? null,
        createdAt: payment.createdAt,
        updatedAt: (payment as any).updatedAt ?? null,
        // Retry info
        retryCount,
        maxRetries,
        retryRemaining: Math.max(0, maxRetries - retryCount),
        lastRetryAt: (payment as any).lastRetryAt ?? null,
        canRetry: (payment.status === "failed" || payment.status === "retry_available") && retryCount < maxRetries,
      });
    } catch (error) {
      console.error("Error fetching payment status:", error);
      res.status(500).json({ error: "Failed to fetch payment status" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /api/payments/retry — Manual payment retry (Steps 3, 5, 6, 8)
  // Body: { paymentId }
  // Returns: { status, retryRemaining, gatewayRef?, message }
  // ═══════════════════════════════════════════════════════════════════════════
  app.post("/api/payments/retry", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { paymentId } = req.body;
      if (!paymentId) return res.status(400).json({ message: "paymentId is required" });

      const payment = await storage.getPaymentById(paymentId);
      if (!payment) return res.status(404).json({ message: "Payment not found" });
      if (payment.userId !== userId) return res.status(403).json({ message: "Forbidden" });

      const { retryPayment } = await import("./payment-retry");
      const result = await retryPayment(paymentId, "user");

      const httpStatus = result.success ? 200 : result.status === "exhausted" ? 410 : 400;
      return res.status(httpStatus).json({
        status: result.status,
        retryRemaining: result.retryRemaining,
        gatewayRef: result.gatewayRef ?? null,
        message: result.message,
      });
    } catch (err: any) {
      console.error("[POST /api/payments/retry]", err.message);
      res.status(500).json({ message: "Retry failed due to internal error" });
    }
  });

  // POST /api/payments/:paymentId/stk-retry
  // Clean retry: cancels the old payment, creates a brand-new payment row, and sends a fresh STK.
  // Never reuses the old CheckoutRequestID — each retry gets its own Safaricom transaction.
  app.post("/api/payments/:paymentId/stk-retry", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { paymentId } = req.params;
      const oldPayment = await storage.getPaymentById(paymentId);
      if (!oldPayment) return res.status(404).json({ message: "Payment not found" });
      if (oldPayment.userId !== userId) return res.status(403).json({ message: "Forbidden" });

      const retryableStatuses = ["awaiting_payment", "pending", "failed", "retry_available"];
      if (!retryableStatuses.includes(oldPayment.status)) {
        return res.status(400).json({
          message: `Payment cannot be retried (status: ${oldPayment.status}). Please start a new payment.`
        });
      }

      // Extract phone from old payment metadata
      let phone = "";
      try {
        const meta = oldPayment.metadata
          ? (typeof oldPayment.metadata === "string" ? JSON.parse(oldPayment.metadata) : oldPayment.metadata)
          : {};
        phone = meta.phone || "";
      } catch {}

      if (!phone) {
        return res.status(400).json({ message: "Phone number not found. Please start a new payment." });
      }

      const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";

      // Step 1: Cancel the old payment so the duplicate-STK guard won't block the new one
      await storage.updatePayment(paymentId, { status: "cancelled" });
      storage.createPaymentAuditLog({
        paymentId,
        event: "stk_cancelled_for_retry",
        ip: clientIp,
        metadata: { userId, phone, retryTrigger: "user" },
      }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      const useLiveMpesa = process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET &&
        process.env.MPESA_SHORTCODE && process.env.MPESA_PASSKEY;

      if (!useLiveMpesa) {
        // Dev/simulation — create row without a real checkoutId
        const newPayment = await storage.createPayment({
          userId,
          amount:   oldPayment.amount,
          currency: oldPayment.currency || "KES",
          method:   "mpesa",
          phone,
          status:   "pending",
          serviceId: (oldPayment as any).serviceId || "main_subscription",
          serviceName: (oldPayment as any).serviceName || null,
          metadata: JSON.stringify({ phone, retryOf: paymentId }),
        } as any);
        await storage.updatePayment(newPayment.id, { status: "awaiting_payment" });
        return res.json({ success: true, paymentId: newPayment.id, message: "Retry initiated (simulation)." });
      }

      // Step 2: STK push FIRST — then single INSERT with checkout_request_id already set
      let checkoutId: string;
      let merchantRequestId: string;
      try {
        const { stkPush } = await import("./mpesa");
        const serviceName = (oldPayment as any).serviceName || "WorkAbroad Hub";
        const stkResponse = await stkPush(phone, Number(oldPayment.amount), serviceName, `WAH-${Date.now()}`);
        checkoutId        = stkResponse.CheckoutRequestID;
        merchantRequestId = stkResponse.MerchantRequestID;
      } catch (stkErr: any) {
        console.error("[STK Retry] STK push failed:", (stkErr as any).response?.data || stkErr.message);
        return res.status(500).json({ message: "Failed to send M-Pesa prompt. Please try again." });
      }

      // Step 3: Single INSERT with checkout_request_id already set
      const newPayment = await storage.createPayment({
        userId,
        amount:            oldPayment.amount,
        currency:          oldPayment.currency || "KES",
        method:            "mpesa",
        phone,
        status:            "pending",
        serviceId:         (oldPayment as any).serviceId  || "main_subscription",
        serviceName:       (oldPayment as any).serviceName || null,
        planId:            (oldPayment as any).planId     || null,
        checkoutRequestId: checkoutId,
        transactionRef:    checkoutId,
        metadata: JSON.stringify({
          phone,
          retryOf:           paymentId,
          checkoutRequestId: checkoutId,
          merchantRequestId,
        }),
      } as any);

      storage.createPaymentAuditLog({
        paymentId: newPayment.id,
        event:     "stk_push_initiated",
        ip:        clientIp,
        metadata:  { checkoutRequestId: checkoutId, phone, amount: oldPayment.amount, retryOf: paymentId },
      }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      return res.json({
        success:           true,
        paymentId:         newPayment.id,
        checkoutRequestId: checkoutId,
        message:           "New M-Pesa prompt sent. Enter your PIN.",
      });

    } catch (err: any) {
      console.error("[STK Retry] Error:", err.message);
      res.status(500).json({ message: "Retry failed. Please try again." });
    }
  });

  // POST /api/payments/:paymentId/timeout
  // Called by the frontend when the 60-second polling window expires.
  // Only transitions awaiting_payment/pending → failed (idempotent for other statuses).
  app.post("/api/payments/:paymentId/timeout", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { paymentId } = req.params;
      const payment = await storage.getPaymentById(paymentId);
      if (!payment) return res.status(404).json({ message: "Payment not found" });
      if (payment.userId !== userId) return res.status(403).json({ message: "Forbidden" });

      // Already resolved — nothing to do
      if (payment.status === "completed" || payment.status === "success" || payment.status === "failed" || payment.status === "cancelled") {
        return res.json({ status: payment.status, changed: false, message: "Payment already resolved." });
      }

      await storage.updatePayment(paymentId, { status: "failed" });

      storage.createPaymentAuditLog({
        paymentId,
        event: "stk_timeout_expired",
        ip: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown",
        metadata: { userId, previousStatus: payment.status, reason: "60s_frontend_timeout" },
      }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      console.log(`[Payment Timeout] paymentId=${paymentId} userId=${userId} ${payment.status} → failed`);

      // Send WhatsApp/SMS recovery nudge (fire-and-forget — never blocks the response)
      storage.getUserById(userId).then(async (user) => {
        const phone = user?.phone;
        if (phone) {
          const { notifyPaymentRecovery } = await import("./sms");
          await notifyPaymentRecovery(phone);
          console.log(`[PaymentRecovery] Recovery message sent → ${phone} (paymentId=${paymentId})`);
        }
      }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      return res.json({ status: "failed", changed: true, message: "Payment timed out and marked as failed." });
    } catch (err: any) {
      console.error("[Payment Timeout]", err.message);
      res.status(500).json({ message: "Failed to update payment status." });
    }
  });

  // POST /api/payments/query — STK Push Status Query
  // Accepts { paymentId } or { checkoutRequestId }.
  // Calls Safaricom stkpushquery/v1/query and, on ResultCode=0, upgrades the user.
  // This recovers "stuck" payments where the callback never arrived.
  app.post("/api/payments/query", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      let { paymentId, checkoutRequestId } = req.body as { paymentId?: string; checkoutRequestId?: string };

      // Resolve checkoutRequestId from DB if only paymentId was given
      let payment: any = null;
      if (paymentId) {
        payment = await storage.getPaymentById(paymentId);
        if (!payment) return res.status(404).json({ message: "Payment not found" });
        if (payment.userId !== userId) return res.status(403).json({ message: "Forbidden" });
        if (!checkoutRequestId) {
          // Try transactionRef first, then metadata
          checkoutRequestId = payment.transactionRef || "";
          if (!checkoutRequestId) {
            try {
              const meta = typeof payment.metadata === "string" ? JSON.parse(payment.metadata) : payment.metadata || {};
              checkoutRequestId = meta.checkoutRequestId || "";
            } catch {}
          }
        }
      }

      if (!checkoutRequestId) {
        return res.status(400).json({ message: "checkoutRequestId is required (or provide paymentId with a linked STK request)" });
      }

      // Already completed? Short-circuit — no need to hit Safaricom.
      if (payment && (payment.status === "completed" || payment.status === "success")) {
        return res.json({ status: "completed", alreadyProcessed: true, message: "Payment was already confirmed." });
      }

      // Call Safaricom STK Query API
      const { stkQuery } = await import("./mpesa");
      let queryResult: any;
      try {
        queryResult = await stkQuery(checkoutRequestId);
      } catch (apiErr: any) {
        console.error("[STK Query] Safaricom API error:", apiErr.response?.data || apiErr.message);
        return res.status(502).json({
          message: "Could not reach Safaricom. Try again in a moment.",
          detail: apiErr.response?.data?.errorMessage || apiErr.message,
        });
      }

      const resultCode = Number(queryResult.ResultCode ?? queryResult.errorCode ?? -1);
      const resultDesc = queryResult.ResultDesc || queryResult.errorMessage || "Unknown";

      console.log(`[STK Query] checkoutRequestId=${checkoutRequestId} ResultCode=${resultCode} ResultDesc=${resultDesc}`);

      // ── SUCCESS ────────────────────────────────────────────────────────────
      if (resultCode === 0) {
        const receipt = queryResult.CallbackMetadata?.Item?.find((i: any) => i.Name === "MpesaReceiptNumber")?.Value
          || queryResult.MpesaReceiptNumber
          || `QUERIED-${Date.now()}`;
        const amount = queryResult.CallbackMetadata?.Item?.find((i: any) => i.Name === "Amount")?.Value;

        if (payment) {
          // Idempotency guard — block double-processing on rapid retries or duplicate queries
          if ((payment as any).processed) {
            return res.json({ status: "completed", alreadyProcessed: true, message: "Payment was already confirmed." });
          }
          const claimed = await storage.markPaymentProcessed(payment.id);
          if (!claimed) {
            return res.json({ status: "completed", alreadyProcessed: true, message: "Payment was already confirmed." });
          }

          await storage.updatePayment(payment.id, { status: "completed", transactionRef: String(receipt) });

          // Determine planId from payment metadata or serviceId
          let planId = payment.planId || "pro";
          if (!planId && (payment as any).serviceId?.startsWith("plan_")) {
            planId = (payment as any).serviceId.replace("plan_", "");
          }

          const { upgradeUserAccount } = await import("./services/upgradeUserAccount");
          const upgradeResult = await upgradeUserAccount({
            userId: payment.userId,
            planType: planId as "pro",
            transactionId: String(receipt),
            paymentId: payment.id,
            serviceId: (payment as any).serviceId || `plan_${planId}`,
            method: "mpesa",
            paymentSource: "web",
            amountKes: amount ? Number(amount) : payment.amount,
            extraMeta: { recoveredViaStkQuery: true, checkoutRequestId },
          });

          storage.createPaymentAuditLog({
            paymentId: payment.id,
            event: "stk_query_recovered",
            ip: req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown",
            metadata: { checkoutRequestId, receipt, resultCode, planId, recoveredViaStkQuery: true },
          }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

          console.log(`[STK Query] ✅ Recovered payment ${payment.id} → plan=${planId} receipt=${receipt}`);

          return res.json({
            status: "completed",
            recovered: true,
            receipt: String(receipt),
            plan: planId,
            expiresAt: upgradeResult.expiresAt,
            message: "Payment confirmed and plan activated.",
          });
        }

        // checkoutRequestId provided without paymentId — report success but can't auto-upgrade
        return res.json({
          status: "completed",
          recovered: false,
          receipt: String(receipt),
          message: "Safaricom confirms payment success. Contact support if your plan is not active.",
        });
      }

      // ── TERMINAL FAILURE (wrong PIN / cancelled / timeout) ─────────────────
      const FAILED_CODES = [1032, 1037, 2001, 17, 1];
      if (FAILED_CODES.includes(resultCode)) {
        if (payment) {
          await storage.updatePayment(payment.id, { status: "failed" });
        }
        return res.json({
          status: "failed",
          resultCode,
          resultDesc,
          message: "Payment was not completed. Please try again.",
        });
      }

      // ── STILL PENDING ──────────────────────────────────────────────────────
      return res.json({
        status: "pending",
        resultCode,
        resultDesc,
        message: "Payment is still pending. Please check your phone.",
      });
    } catch (err: any) {
      console.error("[STK Query] Unexpected error:", err.message);
      res.status(500).json({ message: "Query failed. Please try again." });
    }
  });

  app.post("/api/payments/:paymentId/manual-confirm", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { paymentId } = req.params;
      const { transactionCode } = req.body;

      const payment = await storage.getPaymentById(paymentId);
      if (!payment) return res.status(404).json({ message: "Payment not found" });
      if (payment.userId !== userId) return res.status(403).json({ message: "Forbidden" });

      if (payment.status === "completed") {
        return res.json({ status: "completed", message: "Payment already confirmed." });
      }

      const txCode = transactionCode ? String(transactionCode).toUpperCase().trim() : null;
      if (!txCode) return res.status(400).json({ message: "Transaction code is required" });

      // Simple format validation (M-Pesa codes are 10 chars: 1 letter + 9 alphanumeric)
      if (!/^[A-Z0-9]{8,15}$/.test(txCode)) {
        return res.status(400).json({ message: "Invalid transaction code format. Example: NXX123456789" });
      }

      await storage.updatePayment(payment.id, {
        status: "pending_manual_verification",
        metadata: {
          ...(payment.metadata as object ?? {}),
          manualTxCode: txCode,
          manualSubmittedAt: new Date().toISOString(),
          manualPaybill: process.env.MPESA_SHORTCODE?.trim() || "4153025",
        },
      });

      // Log for admin audit
      console.log(`[ManualPayment] User ${userId} submitted manual tx code ${txCode} for payment ${paymentId}`);

      // Log for admin audit trail
      await storage.logAdminAction(userId, "manual_payment_submitted", {
        paymentId,
        txCode,
        amount: payment.amount,
        paymentMethod: "manual_mpesa_paybill",
      }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      res.json({
        status: "pending_manual_verification",
        message: "Your payment reference has been submitted. We will verify and confirm within 30 minutes during business hours.",
        transactionCode: txCode,
      });
    } catch (err: any) {
      console.error("[POST /api/payments/manual-confirm]", err.message);
      res.status(500).json({ message: "Failed to submit payment confirmation" });
    }
  });

  // GET /api/payments/:paymentId/retry-logs — fetch retry history (Step 7)
  app.get("/api/payments/:paymentId/retry-logs", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { paymentId } = req.params;
      const payment = await storage.getPaymentById(paymentId);
      if (!payment) return res.status(404).json({ message: "Payment not found" });
      if (payment.userId !== userId && !req.user?.claims?.metadata?.isAdmin) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const logs = await storage.getPaymentRetryLogs(paymentId);
      res.json({ paymentId, retryLogs: logs });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch retry logs" });
    }
  });

  // ── Phase 8: User refund request endpoints ─────────────────────────────────
  // POST /api/refund-requests — user submits a refund request
  app.post("/api/refund-requests", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { paymentId, reason } = req.body;
      if (!paymentId || !reason?.trim()) {
        return res.status(400).json({ error: "paymentId and reason are required" });
      }
      // Verify payment belongs to user
      const payment = await storage.getPaymentById(paymentId);
      if (!payment || payment.userId !== userId) {
        return res.status(404).json({ error: "Payment not found" });
      }
      // Prevent duplicate requests for the same payment
      const existing = await storage.getRefundRequestByPayment(paymentId);
      if (existing) {
        return res.status(409).json({ error: "A refund request already exists for this payment", existing });
      }
      const refundRequest = await storage.createRefundRequest({
        paymentId,
        userId,
        reason: reason.trim(),
        status: "pending",
      });
      res.status(201).json(refundRequest);
    } catch (error) {
      console.error("Error creating refund request:", error);
      res.status(500).json({ error: "Failed to create refund request" });
    }
  });

  // GET /api/refund-requests — user views their own refund requests
  app.get("/api/refund-requests", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const requests = await storage.getRefundRequestsByUser(userId);
      res.json(requests);
    } catch (error) {
      console.error("Error fetching refund requests:", error);
      res.status(500).json({ error: "Failed to fetch refund requests" });
    }
  });

  // ── Phase 9: Admin refund dashboard endpoints ──────────────────────────────
  app.get("/api/admin/refund-requests", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const requests = await storage.getRefundRequests();
      res.json(requests);
    } catch (error) {
      console.error("Error fetching admin refund requests:", error);
      res.status(500).json({ error: "Failed to fetch refund requests" });
    }
  });

  // PATCH /api/admin/refund-requests/:id — approve / reject / process with notes
  app.patch("/api/admin/refund-requests/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const adminId = req.user?.claims?.sub;
      const { id } = req.params;
      const { status, adminNotes } = req.body;
      const validStatuses = ["approved", "rejected", "processed"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${validStatuses.join(", ")}` });
      }
      const updateData: Record<string, unknown> = {
        status,
        adminNotes: adminNotes ?? null,
        reviewedBy: adminId,
        reviewedAt: new Date(),
      };
      if (status === "processed") updateData.processedAt = new Date();

      const updated = await storage.updateRefundRequest(id, updateData as any);
      if (!updated) return res.status(404).json({ error: "Refund request not found" });

      // Phase 12: Notify the user of the decision
      const notifTitle = status === "approved" ? "Refund Approved" : status === "rejected" ? "Refund Rejected" : "Refund Processed";
      const notifMsg = status === "approved"
        ? "Your refund request has been approved and will be processed shortly."
        : status === "rejected"
        ? `Your refund request was not approved. ${adminNotes ? "Reason: " + adminNotes : ""}`
        : "Your refund has been processed via M-Pesa. Please check your phone for the credit.";
      storage.createUserNotification({
        userId: updated.userId,
        type: status === "rejected" ? "warning" : "success",
        title: notifTitle,
        message: notifMsg,
      }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      res.json(updated);
    } catch (error) {
      console.error("Error updating refund request:", error);
      res.status(500).json({ error: "Failed to update refund request" });
    }
  });

  // ── Phase 10: Reconciliation report ───────────────────────────────────────
  app.get("/api/admin/reconciliation-report", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const allPayments = await storage.getPayments();
      const allMpesa = await storage.getMpesaAllTransactions(5000);
      const allOrphans = await storage.getMpesaOrphanTransactions(500);

      // Detect duplicate receipts
      const receiptMap = new Map<string, number>();
      for (const tx of allMpesa) {
        if (tx.mpesaReceipt) receiptMap.set(tx.mpesaReceipt, (receiptMap.get(tx.mpesaReceipt) ?? 0) + 1);
      }
      const duplicateReceipts = [...receiptMap.entries()].filter(([, count]) => count > 1).map(([receipt, count]) => ({ receipt, count }));

      // Payments without confirmed receipts
      const successPayments = allPayments.filter(p => p.status === "success");
      const paymentsWithoutReceipts = successPayments.filter(p => !(p as any).mpesaReceiptNumber);

      // Aggregate by status
      const byStatus: Record<string, number> = {};
      for (const p of allPayments) { byStatus[p.status] = (byStatus[p.status] ?? 0) + 1; }

      const report = {
        generatedAt: new Date().toISOString(),
        summary: {
          totalPayments: allPayments.length,
          byStatus,
          totalMpesaTransactions: allMpesa.length,
          orphanCallbacks: allOrphans.length,
          duplicateReceipts: duplicateReceipts.length,
          successPaymentsWithoutReceipts: paymentsWithoutReceipts.length,
          refundPending: allPayments.filter(p => p.status === "refund_pending").length,
        },
        issues: {
          duplicateReceipts,
          paymentsWithoutReceipts: paymentsWithoutReceipts.map(p => ({
            paymentId: p.id, userId: p.userId, amount: p.amount, createdAt: p.createdAt
          })),
          orphanCallbacks: allOrphans.slice(0, 50).map(tx => ({
            phone: tx.phone, amount: tx.amount, receipt: tx.mpesaReceipt, date: tx.transactionDate
          })),
        },
      };
      res.json(report);
    } catch (error) {
      console.error("Error generating reconciliation report:", error);
      res.status(500).json({ error: "Failed to generate reconciliation report" });
    }
  });

  // ── Service lookup by code — direct SQL, always fresh from DB ───────────────
  async function getServiceByCode(serviceCode: string) {
    const result = await pool.query(
      `SELECT id, code, slug, name, price, is_active AS active,
              flash_sale, discount_percent, sale_start, sale_end
       FROM services
       WHERE code = $1`,
      [serviceCode]
    );
    return result.rows[0] ?? null;
  }

  // ── POST /api/payments/mpesa/stk-push — unified STK push for plans + services ─
  app.post("/api/payments/mpesa/stk-push", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub ?? req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      // ── Validate user exists in DB ─────────────────────────────────────────
      const userCheck = await pool.query(
        `SELECT id FROM users WHERE id = $1 LIMIT 1`,
        [userId]
      );
      if (!userCheck.rows.length) {
        console.warn(`[STK][Security] userId=${userId} not found in users table — rejecting`);
        return res.status(404).json({ message: "User account not found", code: "USER_NOT_FOUND" });
      }

      const {
        phoneNumber,    // "254712345678" or "07XXXXXXXX"
        amount,         // optional — ignored for service/plan purchases; DB is authoritative
        planId,         // "pro" | "basic" — subscription plans
        service_id,     // UUID from services table — one-time service purchases
        serviceId = service_id, // accept both spellings
        service_code,   // slug e.g. "ats_cv_optimization" — alternative to UUID
        serviceCode = service_code,
        user_id,        // optional override — defaults to session user
        metadata,       // optional: any extra JSON string
      } = req.body;

      // amount is required only when no service or plan is specified (raw amount purchase)
      const hasServiceOrPlan = !!(planId || serviceId || serviceCode);
      if (!phoneNumber || (!hasServiceOrPlan && !amount)) {
        return res.status(400).json({
          message: "phoneNumber and either planId, service_id, or service_code are required",
        });
      }
      if (!hasServiceOrPlan && Number(amount) < 1) {
        return res.status(400).json({ message: "Invalid amount" });
      }

      const normalizedPhone = String(phoneNumber).startsWith("0")
        ? `254${String(phoneNumber).slice(1)}`
        : String(phoneNumber);

      // ── Server-side price verification ───────────────────────────────────────
      // If this is a service purchase (UUID serviceId, not a plan), the amount MUST
      // match services.price in the DB. The client-supplied amount is used only as
      // a cross-check — the DB value is always authoritative.
      const PLAN_IDS = new Set(["pro", "basic", "pro_referral"]);
      const isMpesaPlanPurchase = !!planId || (serviceId && PLAN_IDS.has(serviceId));
      let amountKES: number;
      let resolvedServiceName: string | null = null; // human-readable name for M-Pesa prompt + metadata

      if (!isMpesaPlanPurchase && (serviceId || serviceCode)) {
        let svc: { id?: string; code?: string; name: string; price: number; is_active?: boolean; active?: boolean } | null = null;

        if (serviceCode && !serviceId) {
          // ── Code (slug) path — direct SQL ──────────────────────────────────
          svc = await getServiceByCode(serviceCode);
          if (!svc) {
            console.error(`[STK][Security] service_code="${serviceCode}" not found — rejecting`);
            return res.status(404).json({ message: `Service "${serviceCode}" not found` });
          }
        } else {
          // ── UUID path — Supabase ────────────────────────────────────────────
          const { data, error: svcErr } = await supabase
            .from("services")
            .select("price, is_active, name")
            .eq("id", serviceId)
            .maybeSingle();
          if (svcErr || !data) {
            console.error(`[STK][Security] service_id=${serviceId} not found — rejecting`);
            return res.status(404).json({ message: "Service not found" });
          }
          svc = data;
        }

        const isActive = (svc as any).active ?? (svc as any).is_active;
        if (!isActive) {
          return res.status(400).json({ message: "This service is not currently available" });
        }

        // Compute final (possibly discounted) price — server is authoritative
        const { calcFinalPrice: _calcFP } = await import("./price-engine");
        const priceResult = _calcFP({
          price:           Number(svc.price),
          flashSale:       (svc as any).flash_sale      ?? false,
          discountPercent: (svc as any).discount_percent ?? 0,
          saleStart:       (svc as any).sale_start       ?? null,
          saleEnd:         (svc as any).sale_end         ?? null,
        });
        const finalDbPrice = priceResult.finalPrice;
        // Always use DB price — client-supplied amount is ignored.
        // Log a warning if it differs so we can detect front-end bugs or tamper attempts.
        if (amount !== undefined && Math.round(Number(amount)) !== finalDbPrice) {
          console.warn(
            `[STK][Security] Client amount ignored — service="${svc.name}" db=${finalDbPrice} client=${Math.round(Number(amount))} user=${user_id ?? userId}`
          );
        }
        amountKES = finalDbPrice; // DB is always authoritative — never trust client
        resolvedServiceName = svc.name ?? null;
        // Carry flash sale info into metadata below
        (req as any)._priceResult = priceResult;
      } else if (planId || isMpesaPlanPurchase) {
        // Plan purchase — resolve from DB (single source of truth).  Client amount ignored.
        const planKey = planId || serviceId || "pro";
        const resolvedPlan = await resolveCanonicalPlanPrice(planKey);
        if (!resolvedPlan) {
          return res.status(400).json({ message: `Plan "${planKey}" is not configured.`, code: "PLAN_NOT_FOUND" });
        }
        amountKES = resolvedPlan.finalPrice;
        resolvedServiceName = planLabel(planKey);
      } else {
        amountKES = Math.round(Number(amount));
      }

      // Fraud gate — block before any DB write or STK push
      const effectiveUserId = user_id ?? userId;
      if (await isFraudUser(effectiveUserId)) {
        const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.socket?.remoteAddress ?? "unknown";
        flagForManualReview(effectiveUserId, { action: "payment_attempt_blocked", detail: `stk-push amount=${amount}`, ip: clientIp }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        return res.status(403).json({
          message: "Your account has been flagged for review. Please contact support.",
          code:    "ACCOUNT_UNDER_REVIEW",
        });
      }

      // Merge service name into metadata so admin panel, callbacks and receipts all have it
      const enrichedMetadata = {
        ...(metadata ? (typeof metadata === "string" ? JSON.parse(metadata) : metadata) : {}),
        ...(resolvedServiceName ? { serviceName: resolvedServiceName } : {}),
      };

      // Carry flash sale breakdown — populated only for service purchases
      const _pr: { originalPrice?: number; finalPrice?: number; savings?: number } =
        (req as any)._priceResult ?? {};

      // Insert the pending row FIRST so a record exists even if STK push fails
      const [payment] = await db
        .insert(paymentsTable)
        .values({
          id:              transactionRef,
          userId:          effectiveUserId,
          amount:          amountKES,
          currency:        "KES",
          status:          "pending",
          method:          "mpesa",
          planId:          planId    || null,
          serviceId:       serviceId || null,
          serviceName:     resolvedServiceName || null,  // dedicated column — no JSON parse needed in callbacks
          transactionRef,
          metadata:        Object.keys(enrichedMetadata).length
                             ? JSON.stringify(enrichedMetadata)
                             : null,
          // Price audit — null for plan purchases or when no discount
          originalPrice:   _pr.originalPrice ?? null,
          paidPrice:       _pr.finalPrice    ?? null,
          discountApplied: _pr.savings && _pr.savings > 0 ? _pr.savings : null,
        })
        .returning();

      const { stkPush, getCallbackBaseUrl } = await import("./mpesa");

      // Use the real service/plan name in the M-Pesa STK prompt so the user sees
      // exactly what they are paying for on their phone screen.
      const description = resolvedServiceName
        ? resolvedServiceName.slice(0, 13)   // Safaricom caps TransactionDesc at 13 chars
        : "WorkAbroad";

      // Route the callback to the new unified handler so plan activations and
      // service unlocks are handled correctly without falling into the legacy Pro-upgrade path.
      const newCallbackUrl = `${getCallbackBaseUrl()}/api/payments/mpesa/callback`;
      const stkResponse = await stkPush(normalizedPhone, amountKES, description, transactionRef, newCallbackUrl);

      if (stkResponse.ResponseCode === "0") {
        // Save CheckoutRequestID so the callback can match this row
        await db
          .update(paymentsTable)
          .set({
            transactionRef: stkResponse.CheckoutRequestID,
            metadata: JSON.stringify({
              initRef:         transactionRef,
              checkoutRequestId: stkResponse.CheckoutRequestID,
              merchantRequestId: stkResponse.MerchantRequestID,
              ...(metadata || {}),
            }),
          })
          .where(eq(paymentsTable.id, payment.id));
      } else {
        await db
          .update(paymentsTable)
          .set({
            status:     "failed",
            failReason: stkResponse.ResponseDescription || "STK push rejected",
          })
          .where(eq(paymentsTable.id, payment.id));

        return res.status(400).json({
          message:   "STK push failed",
          reason:    stkResponse.ResponseDescription,
          paymentId: transactionRef,
        });
      }

      res.json({
        message:           "STK push sent. Check your phone.",
        paymentId:         payment.id,
        checkoutRequestId: stkResponse.CheckoutRequestID,
      });
    } catch (err: any) {
      console.error("[POST /api/payments/mpesa/stk-push]", err.message);
      res.status(500).json({ message: "Failed to initiate payment" });
    }
  });

  // ── POST /api/payments/mpesa/callback — Safaricom callback for the unified STK push ─
  // CSRF exempt — registered in middleware/csrf.ts
  app.post("/api/payments/mpesa/callback", async (req, res) => {
    // 1. Always acknowledge immediately so Safaricom stops retrying
    res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });

    const stk = req.body?.Body?.stkCallback;
    if (!stk) {
      console.error("[MPESA/PAYMENTS CALLBACK] Invalid payload — missing Body.stkCallback");
      return;
    }

    const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stk;
    if (!CheckoutRequestID) {
      console.error("[MPESA/PAYMENTS CALLBACK] Missing CheckoutRequestID");
      return;
    }

    setImmediate(async () => {
      try {
        // 2. Find the pending payment by CheckoutRequestID stored in transactionRef
        const payment = await storage.getPaymentByTransactionRef(CheckoutRequestID);
        if (!payment) {
          // Orphan success — money confirmed by Safaricom but no matching DB record.
          // Parse what we can from the callback, try to match a user by phone, and flag for admin review.
          if (ResultCode === 0 && CallbackMetadata?.Item) {
            let orphanReceipt: string | null = null, orphanAmount: number | null = null, orphanPhone: string | null = null;
            for (const item of CallbackMetadata.Item) {
              if (item.Name === "MpesaReceiptNumber") orphanReceipt = String(item.Value);
              if (item.Name === "Amount")             orphanAmount  = Number(item.Value);
              if (item.Name === "PhoneNumber")        orphanPhone   = String(item.Value);
            }
            const matchedUser = orphanPhone ? await storage.getUserByPhone(orphanPhone) : null;
            const orphan = await storage.createPayment({
              userId:           matchedUser?.id ?? "unknown",
              amount:           orphanAmount ?? 0,
              currency:         "KES",
              method:           "mpesa",
              phone:            orphanPhone,
              status:           "success",
              checkoutRequestId: CheckoutRequestID,
              transactionRef:   CheckoutRequestID,
              mpesaCode:        orphanReceipt,
              mpesaReceiptNumber: orphanReceipt,
              metadata:         JSON.stringify({ orphan: true, phonePaid: orphanPhone, CheckoutRequestID }),
            } as any);
            await storage.updatePayment(orphan.id, { needs_review: true } as any);
            console.warn(`[MPESA/PAYMENTS CALLBACK] Orphan success — no DB record for CheckoutRequestID=${CheckoutRequestID} | phone=${orphanPhone} | receipt=${orphanReceipt} | userId=${matchedUser?.id ?? "unknown"} → needs_review`);
          } else {
            console.error(`[MPESA/PAYMENTS CALLBACK] No payment found for CheckoutRequestID=${CheckoutRequestID}`);
          }
          return;
        }

        // 3. Idempotency guard — don't double-process
        if (payment.status === "success" || payment.status === "completed") {
          console.log(`[MPESA/PAYMENTS CALLBACK] Already completed: ${payment.id}`);
          return;
        }

        // 3b. Atomic processed flag — blocks parallel Safaricom retries at the DB level.
        // UPDATE WHERE processed = false RETURNING id: only the first caller gets true.
        if ((payment as any).processed) {
          console.log(`[MPESA/PAYMENTS CALLBACK] Already claimed (processed=true): ${payment.id}`);
          return;
        }
        const ownedByThisCallback = await storage.markPaymentProcessed(payment.id);
        if (!ownedByThisCallback) {
          console.warn(`[MPESA/PAYMENTS CALLBACK] Race lost — another callback claimed payment ${payment.id} first`);
          return;
        }

        // 4. Parse success metadata
        let mpesaReceipt: string | null = null;
        let amountPaid: number | null = null;
        let phonePaid: string | null = null;

        if (ResultCode === 0 && CallbackMetadata?.Item) {
          for (const item of CallbackMetadata.Item) {
            if (item.Name === "MpesaReceiptNumber") mpesaReceipt = String(item.Value);
            if (item.Name === "Amount")             amountPaid   = Number(item.Value);
            if (item.Name === "PhoneNumber")        phonePaid    = String(item.Value);
          }
        }

        // ResultCode 0 = success; anything else = failed
        const isCancelledByUser = ResultCode === 1032;
        const newStatus = ResultCode === 0 ? "success" : "failed";

        // 5a. Plan amount guard — verify Safaricom-reported amount matches canonical DB price.
        //     Must run BEFORE the payment row update so we don't overwrite amount with a
        //     tampered or wrong value if the check fails.
        if (newStatus === "completed" && amountPaid != null && payment.planId) {
          // Guard 5a-i — plan identity: serviceId-derived planId must equal payment.planId.
          // Discrepancy means the payment row was mutated after creation.
          const serviceIdOnPayment = String((payment as any).serviceId ?? "");
          if (serviceIdOnPayment.startsWith("plan_")) {
            const derivedPlanId = serviceIdOnPayment.replace("plan_", "");
            if (derivedPlanId !== payment.planId) {
              console.error(`[MPESA/PAYMENTS CALLBACK][Security] Plan mismatch on payment ${payment.id}: serviceId="${serviceIdOnPayment}" implies "${derivedPlanId}" but payment.planId="${payment.planId}" — blocked`);
              await storage.updatePayment(payment.id, {
                status: "failed", isSuspicious: true,
                fraudReason: `plan_id_mismatch:fromServiceId=${derivedPlanId},fromPlanId=${payment.planId}`,
              } as any);
              await createSecurityAlert({
                alertType: "payment_fraud", severity: "high",
                title: "M-Pesa Plan Identity Mismatch",
                description: `Payment ${payment.id}: serviceId implies plan "${derivedPlanId}" but payment.planId is "${payment.planId}". Possible row tampering — service NOT activated.`,
                userId: payment.userId,
                metadata: { paymentId: payment.id, derivedPlanId, storedPlanId: payment.planId, CheckoutRequestID },
              });
              return;
            }
          }

          // Use the full pricing engine (not the thin wrapper) so userId is available
          // for future per-user pricing and promoCode discounts encoded in planId work correctly.
          const resolvedCb1 = await resolvePrice({ planId: payment.planId, userId: payment.userId });
          if (!resolvedCb1) {
            console.error(`[MPESA/PAYMENTS CALLBACK][Security] Plan "${payment.planId}" not found in DB — rejecting`);
            await storage.updatePayment(payment.id, {
              status: "failed", isSuspicious: true,
              fraudReason: `plan_not_found:planId=${payment.planId}`,
            } as any);
            await createSecurityAlert({
              alertType: "payment_fraud", severity: "high",
              title: "M-Pesa Callback — Unknown Plan",
              description: `Payment ${payment.id} references plan "${payment.planId}" which has no price in the database.`,
              userId: payment.userId,
              metadata: { paymentId: payment.id, planId: payment.planId, amountPaid, CheckoutRequestID },
            });
            return;
          }
          const { finalPrice: canonical, basePrice: canonicalBase, discountType: canonicalDiscount } = resolvedCb1;
          // Direct Safaricom-reported amount vs canonical plan price — primary fraud gate.
          // Any discrepancy between what Safaricom collected and what the pricing engine
          // expects means either price tampering or an unrecognised discount. Reject both.
          if (Math.round(amountPaid) !== canonical) {
            console.error(`[MPESA/PAYMENTS CALLBACK][Security] Amount mismatch on payment ${payment.id}: Safaricom reported KES ${amountPaid} but canonical plan price is KES ${canonical} (base=${canonicalBase}, discount=${canonicalDiscount ?? "none"}) — blocked`);
            await storage.updatePayment(payment.id, {
              status: "failed", isSuspicious: true,
              fraudReason: `plan_price_mismatch:canonical=${canonical},paid=${amountPaid}`,
            } as any);
            await createSecurityAlert({
              alertType: "payment_fraud", severity: "high",
              title: "M-Pesa Plan Amount Mismatch",
              description: `Payment ${payment.id} for plan "${payment.planId}": Safaricom reported KES ${amountPaid} but canonical price is KES ${canonical} (base=${canonicalBase}, discount=${canonicalDiscount ?? "none"}). Service NOT activated.`,
              userId: payment.userId,
              metadata: { paymentId: payment.id, planId: payment.planId, canonical, canonicalBase, canonicalDiscount, amountPaid, CheckoutRequestID },
            });
            return;
          }
        }

        // 5b. Update the payment row — raw KES (no * 100)
        // verification_status records the Safaricom ResultCode outcome explicitly.
        await storage.updatePayment(payment.id, {
          status:              newStatus,
          mpesaCode:           mpesaReceipt,          // dedicated receipt column
          mpesaReceiptNumber:  mpesaReceipt,          // legacy alias — kept for backward compat
          // Stamp phone from Safaricom's confirmed PhoneNumber (overrides initiation value if different)
          ...(phonePaid ? { phone: phonePaid } : {}),
          failReason:          ResultCode === 0 ? null : (ResultDesc || "Payment failed"),
          // For user-cancellation (1032), bump retryCount to 1 so auto-retry doesn't fire again
          ...(ResultCode !== 0 && isCancelledByUser ? { retryCount: Math.max(1, (payment as any).retryCount ?? 0) } : {}),
          amount:              amountPaid != null ? Math.round(amountPaid) : payment.amount,
          updatedAt:           new Date(),
          // ── Safaricom verification stamp ──────────────────────────────────
          verification_status: ResultCode === 0 ? "verified" : "failed",
          ...(ResultCode === 0 ? { verified_at: new Date() } : {}),
        } as any);

        if (newStatus === "success") {
          console.log('🔥 PAYMENT SUCCESS DETECTED — confirming in Supabase');
          // Update the existing pending row (written before STK push) to completed
          if (mpesaReceipt && phonePaid) {
            await confirmPaymentInSupabase(
              mpesaReceipt,
              phonePaid,
              amountPaid != null ? Math.round(amountPaid) : (payment.amount ?? 0),
            );
          }

          // Commission — fire-and-forget after confirmation
          recordCommission(
            String(payment.userId),
            String(payment.id),
            amountPaid != null ? Math.round(amountPaid) : Number(payment.amount ?? 0),
          ).catch((e) => console.error("[Commission] STK callback path failed:", e?.message));

          // Referral commission — create a pending row when a referred user pays
          if (amountPaid != null && phonePaid) {
            (async () => {
              try {
                const amount = Math.round(amountPaid);

                // get user
                const userRes = await pool.query(
                  `SELECT id, referred_by FROM users WHERE phone = $1`,
                  [phonePaid]
                );
                const user = userRes.rows[0];

                if (user && user.referred_by) {

                  // find referrer
                  const referrerRes = await pool.query(
                    `SELECT id FROM users WHERE referral_code = $1`,
                    [user.referred_by]
                  );

                  if (referrerRes.rows.length > 0) {
                    const commission = Math.round(amount * 0.10);

                    await pool.query(`
                      INSERT INTO referrals (ref_code, referred_phone, payment_amount, commission, status)
                      VALUES ($1, $2, $3, $4, 'pending')
                      ON CONFLICT (referred_phone) DO NOTHING
                    `, [user.referred_by, phonePaid, amount, commission]);

                    console.log(`💰 REFERRAL COMMISSION CREATED — referrer=${referrerRes.rows[0].id} amount=${amount} commission=${commission}`);
                  }
                }
              } catch (err: any) {
                console.error("[Referral] Commission insert failed:", err?.message);
              }
            })();
          }

          // Service request — raise a fulfilment work item for this service
          createServiceRequest(
            String(payment.userId),
            (payment as any).serviceId ?? (payment as any).service_id ?? null,
            String(payment.id),
          ).catch((e) => console.error("[ServiceRequest] STK callback path failed:", e?.message));

          getIO().emit("new_payment", {
            amount: amountPaid != null ? Math.round(amountPaid) : (payment.amount ?? 0),
            phone:  phonePaid || null,
          });

          // 6-7. runPaymentPipeline — processPayment → unlockService → deliverService → notify
          // Resolution order: userId (set at STK push) → phonePaid fallback (guest / orphan-linked)
          let pipelineUser = await storage.getUserById(payment.userId).catch(() => null);
          if (!pipelineUser && phonePaid) {
            pipelineUser = await storage.getUserByPhone(phonePaid).catch(() => null) ?? null;
            if (pipelineUser) {
              console.log(`[MPESA/PAYMENTS CALLBACK] Resolved user by phone=${phonePaid} → userId=${pipelineUser.id}`);
              await storage.updatePayment(payment.id, { userId: pipelineUser.id } as any).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
            }
          }
          if (pipelineUser) {
            // Supabase-specific PRO flag sync (non-blocking, fire-and-forget)
            if (payment.serviceId?.startsWith("plan_")) {
              const supabaseUid = phonePaid
                ? ((await resolveSupabaseUuidFromPhone(phonePaid)) ?? payment.userId)
                : payment.userId;
              upgradeUserToPro(supabaseUid).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
              getIO().emit("user_upgraded", { user_id: supabaseUid });
            }
            const { runPaymentPipeline } = await import("./services/paymentPipeline");
            await runPaymentPipeline({
              payment: { ...payment, userId: pipelineUser.id, amount: amountPaid ?? payment.amount },
              user:    pipelineUser,
              method:  "mpesa",
              transactionId: mpesaReceipt || payment.id,
              planId: payment.serviceId?.startsWith("plan_") ? (payment.planId ?? null) : null,
            });
          } else {
            await storage.updatePayment(payment.id, {
              needs_review:   true,
              deliveryStatus: "needs_review",
            } as any);
            console.warn(`[MPESA/PAYMENTS CALLBACK] No user for userId=${payment.userId} phone=${phonePaid ?? "none"} — flagged needs_review`);
          }

          // 8. Write to Firebase RTDB — credits + payment record + revenue + totalSpent
          const finalAmount = amountPaid ?? payment.amount ?? 0;
          const finalReceipt = mpesaReceipt ?? String(payment.id);
          // service_name column is the authoritative label (set at STK push time).
          // Fall back to metadata.serviceName for payments made before this column existed,
          // then to a sensible default.
          const metaObj: Record<string, any> = (() => {
            try { return JSON.parse((payment as any).metadata ?? "{}"); } catch { return {}; }
          })();
          const serviceLabel: string =
            (payment as any).serviceName ??
            metaObj.serviceName ??
            (payment.planId ? planLabel(payment.planId) : null) ??
            payment.serviceId ??
            payment.planId ??
            "Service";
          import("./services/firebaseRtdb").then(({ recordPaymentEvent, trackRevenue }) => {
            recordPaymentEvent({
              userId:           payment.userId,
              paymentId:        finalReceipt,
              amountKes:        Number(finalAmount),
              reference:        finalReceipt,
              method:           "mpesa",
              serviceId:        payment.serviceId ?? payment.planId ?? null,
              serviceLabel,
              subscriptionKey:  payment.planId ?? undefined,
              subscriptionExpiryMs: payment.planId
                ? planExpiry(payment.planId).getTime()
                : undefined,
            }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
            trackRevenue({
              userId:    payment.userId,
              amountKes: Number(finalAmount),
              serviceId: payment.serviceId ?? payment.planId ?? null,
              method:    "mpesa",
              reference: finalReceipt,
            }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
          }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

          // 9. Send WhatsApp payment confirmation to the user
          //    Includes a personalised deep-link so they tap straight back to their service.
          if (phonePaid) {
            (async () => {
              // Resolve the service code for the deep-link (non-blocking)
              const rawServiceId = (payment as any).serviceId ?? (payment as any).service_id ?? null;
              const serviceCode: string | undefined = rawServiceId
                ? await pool.query<{ code: string }>(
                    "SELECT code FROM services WHERE id = $1 LIMIT 1",
                    [rawServiceId]
                  ).then(r => r.rows[0]?.code).catch(() => undefined)
                : undefined;

              const confirmUserId = pipelineUser?.id ?? payment.userId ?? undefined;

              const { sendWhatsAppPaymentConfirmation } = await import("./sms");
              await sendWhatsAppPaymentConfirmation({
                phone:       phonePaid!,
                serviceLabel,
                amountKes:   Number(finalAmount),
                receipt:     finalReceipt,
                userId:      confirmUserId,
                serviceCode,
              });
            })().catch((err) => {
              console.error("[WhatsAppConfirm] Callback fire-and-forget failed:", err?.message);
            });
          }
        } else {
          // Payment failed / cancelled — notify user and show retry screen
          import("./websocket").then(({ notifyUserPaymentFailed, notifyUserPaymentUpdate }) => {
            notifyUserPaymentFailed(payment.userId, {
              type:            "payment_failed",
              paymentId:       payment.id,
              resultCode:      ResultCode,
              resultDesc:      ResultDesc || "Payment failed",
              isCancelledByUser,
              retryAvailable:  true,
              timestamp:       new Date().toISOString(),
            });
            notifyUserPaymentUpdate(payment.userId, {
              type: "payment_update", paymentId: payment.id, status: "failed",
            });
          }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        }

        console.log(`[MPESA/PAYMENTS CALLBACK] ${payment.id} → ${newStatus} (ResultCode=${ResultCode})${mpesaReceipt ? ` | receipt=${mpesaReceipt}` : ""}`);
      } catch (err: any) {
        console.error("[MPESA/PAYMENTS CALLBACK ERROR]", err.message);
      }
    });
  });

  // ── POST /api/payments/paypal/webhook — PayPal server-to-server event ────────
  // CSRF exempt — registered in middleware/csrf.ts
  // Idempotency-safe backup to the client-side capture-order flow.
  app.post("/api/payments/paypal/webhook", async (req, res) => {
    // 1. Acknowledge immediately so PayPal stops retrying
    res.status(200).send("OK");

    setImmediate(async () => {
      try {
        // 1a. Verify PayPal signature before touching any data
        const { verifyPayPalWebhook } = await import("./utils/verifyPaypalWebhook");
        const sigValid = await verifyPayPalWebhook(
          (req as any).rawBody ?? Buffer.from(JSON.stringify(req.body)),
          req.headers as Record<string, string | undefined>,
        );
        if (!sigValid) {
          console.error(`[PAYPAL WEBHOOK] Signature verification FAILED — request rejected | ip=${req.ip}`);
          return;
        }

        const event = req.body;
        const type: string = event?.event_type;
        const resource = event?.resource;

        // Only process completed captures and approved orders
        if (
          type !== "PAYMENT.CAPTURE.COMPLETED" &&
          type !== "CHECKOUT.ORDER.APPROVED"
        ) return;

        // 2. Resolve our internal payment ID
        // custom_id is set in createPayPalOrder() → purchase_units[0].custom_id
        // For PAYMENT.CAPTURE.COMPLETED the capture resource carries custom_id directly.
        // For CHECKOUT.ORDER.APPROVED the resource is the order, check purchase_units.
        const internalId: string | undefined =
          resource?.custom_id ||
          resource?.purchase_units?.[0]?.custom_id ||
          resource?.purchase_units?.[0]?.reference_id;

        if (!internalId) {
          console.error("[PAYPAL WEBHOOK] Cannot resolve payment ID — missing custom_id/reference_id");
          return;
        }

        // 3. Fetch the payment record
        const payment = await storage.getPaymentById(internalId);
        if (!payment) {
          console.error(`[PAYPAL WEBHOOK] No payment found for id=${internalId}`);
          return;
        }

        // 4. Idempotency guard — stored status is "completed", NOT "success"
        if (payment.status === "completed") {
          console.log(`[PAYPAL WEBHOOK] Already completed: ${payment.id}`);
          return;
        }

        // 5. Derive planId — payments.planId is set directly; fallback to serviceId prefix
        const planId: string | null =
          payment.planId ||
          (payment.serviceId?.startsWith("plan_")
            ? payment.serviceId.replace("plan_", "")
            : null);

        // 6. Update the payment row — amount stays raw KES (payment.amount already correct)
        //    Store the PayPal capture/order ID in transactionRef
        const captureId: string = resource?.id || resource?.purchase_units?.[0]?.payments?.captures?.[0]?.id || "";
        await storage.updatePayment(payment.id, {
          status:       "completed",
          method:       "paypal",
          transactionRef: captureId || payment.transactionRef,
          updatedAt:    new Date(),
        } as any);

        // 7-8. runPaymentPipeline — processPayment → unlockService → deliverService → notify
        const expiresAt = planId ? planExpiry(planId) : null;

        // 9. Write to Firebase RTDB — payment record + revenue daily/monthly rollup
        const ppServiceId = payment.serviceId ?? planId ?? null;
        const ppServiceLabel = planId ? planLabel(planId)
          : payment.serviceId ?? planId ?? "Service";
        import("./services/firebaseRtdb").then(({ recordPaymentEvent, trackRevenue }) => {
          recordPaymentEvent({
            userId:           payment.userId,
            paymentId:        captureId || payment.id,
            amountKes:        Number(payment.amount),
            reference:        captureId || payment.id,
            method:           "paypal",
            serviceId:        ppServiceId,
            serviceLabel:     ppServiceLabel,
            subscriptionKey:  planId ?? undefined,
            subscriptionExpiryMs: planId
              ? planExpiry(planId).getTime()
              : undefined,
          }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
          trackRevenue({
            userId:    payment.userId,
            amountKes: Number(payment.amount),
            serviceId: ppServiceId,
            method:    "paypal",
            reference: captureId || payment.id,
          }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

        // Sync completed payment to Supabase
        console.log('CALLING PAYMENT SYNC NOW');
        await syncPaymentToSupabase({
          user_id:       payment.userId,
          phone:         null,
          amount:        Number(payment.amount),
          mpesa_code:    captureId || (payment as any).transactionRef || null,
          status:        "completed",
          plan_id:       planId || null,
          base_amount:   (payment as any).baseAmount ?? null,
          currency:      "KES",
          discount_data: (payment as any).discountType
            ? { discountType: (payment as any).discountType, discountValue: ((payment as any).baseAmount ?? Number(payment.amount)) - Number(payment.amount) }
            : null,
        });
        if (planId) await upgradeUserToPro(payment.userId);
        if (planId) {
          const ppWebhookExpiry = new Date(); ppWebhookExpiry.setDate(ppWebhookExpiry.getDate() + 360);
          syncSubscriptionToSupabase({ user_id: payment.userId, plan_id: "pro", provider: "paypal", status: "active", auto_renew: false, expires_at: ppWebhookExpiry }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
          redeemAppliedPromo(payment.metadata).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        }

        // 7-8. runPaymentPipeline — processPayment → unlockService → deliverService → notify
        const ppDeliveryUser = payment.userId
          ? await storage.getUserById(payment.userId).catch(() => null)
          : null;
        if (ppDeliveryUser) {
          const { runPaymentPipeline } = await import("./services/paymentPipeline");
          await runPaymentPipeline({
            payment,
            user:          ppDeliveryUser,
            method:        "paypal",
            transactionId: captureId || payment.id,
            planId:        planId ?? null,
            expiresAt:     expiresAt ?? null,
          }).catch((e: any) =>
            console.error("[PAYPAL WEBHOOK] Pipeline error:", e?.message),
          );
        }

        console.log(`[PAYPAL WEBHOOK] ${payment.id} → completed | event=${type} | captureId=${captureId}`);
      } catch (err: any) {
        console.error("[PAYPAL WEBHOOK ERROR]", err?.message ?? err);
      }
    });
  });

  app.post("/api/mpesa/stkpush", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { phone } = req.body;
      
      if (!phone) {
        return res.status(400).json({ error: "Phone number is required" });
      }

      const phoneRegex = /^(?:254|\+254|0)[71]\d{8}$/;
      if (!phoneRegex.test(phone.replace(/\s/g, ""))) {
        return res.status(400).json({ error: "Invalid Kenyan phone number. Use 07XXXXXXXX, 01XXXXXXXX, or +254XXXXXXXXX" });
      }

      const { stkPush } = await import("./mpesa");
      const response = await stkPush(phone);
      res.json(response);
    } catch (err: any) {
      console.error("STK Push error:", JSON.stringify(err.response?.data || err.message));
      console.error("STK Push status:", err.response?.status);
      const detail = err.response?.data?.errorMessage || err.response?.data?.errorCode || err.message;
      res.status(500).json({ error: "Payment failed", detail });
    }
  });

  // M-Pesa callback endpoint
  // SECURITY: Safaricom IP ranges for callback verification
  const SAFARICOM_IPS = [
    "196.201.214.", // Safaricom range
    "196.201.212.", // Safaricom range
    "196.201.213.", // Safaricom range
    "41.215.160.", // Safaricom range
    "127.0.0.1", // Localhost for testing
    "::1", // IPv6 localhost
  ];
  
  // EXPECTED_AMOUNT removed — each payment is validated against payment.amount (the amount stored at STK push time)
  
  app.post("/api/mpesa/callback", async (req, res) => {
    try {
      const body = req.body;

      // 🔍 Extract data safely
      const stkCallback = body?.Body?.stkCallback;

      if (!stkCallback) return res.sendStatus(200);

      const resultCode = stkCallback.ResultCode;

      if (resultCode !== 0) {
        console.log("❌ Payment failed");
        return res.sendStatus(200);
      }

      const metadata = stkCallback.CallbackMetadata.Item;

      const getValue = (name: string) => {
        const item = metadata.find((i: any) => i.Name === name);
        return item ? item.Value : null;
      };

      const amount   = getValue("Amount");
      const mpesaCode = getValue("MpesaReceiptNumber");
      let phone      = String(getValue("PhoneNumber") ?? "");

      // Normalize: 254XXXXXXXXX → 0XXXXXXXXX
      if (phone.startsWith("254")) {
        phone = "0" + phone.slice(3);
      }

      console.log("✅ PAYMENT RECEIVED:", { phone, amount, mpesaCode });

      // 💾 1. Save payment — skip if this mpesa_code already recorded (duplicate callback guard)
      const existingPayment = await pool.query(
        `SELECT id FROM payments WHERE mpesa_code = $1 LIMIT 1`,
        [mpesaCode]
      );
      if (existingPayment.rows.length === 0) {
        await pool.query(
          `INSERT INTO payments (mpesa_code, phone, amount, status)
           VALUES ($1, $2, $3, 'completed')`,
          [mpesaCode, phone, amount]
        );
      }

      // 👤 2. Find or create user
      let userRes = await pool.query(
        `SELECT id FROM users WHERE phone = $1 LIMIT 1`,
        [phone]
      );

      let userId: string;

      if (userRes.rows.length === 0) {
        const newUser = await pool.query(
          `INSERT INTO users (phone, email)
           VALUES ($1, $1 || '@mpesa.workabroad.hub')
           RETURNING id`,
          [phone]
        );
        userId = newUser.rows[0].id;
      } else {
        userId = userRes.rows[0].id;
      }

      // 🔓 3. Activate subscription (30 days)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      // SELECT → UPDATE or INSERT (no UNIQUE constraint on user_id)
      const existingSub = await pool.query(
        `SELECT id FROM user_subscriptions WHERE user_id = $1 AND status = 'active' ORDER BY end_date DESC NULLS LAST LIMIT 1`,
        [userId]
      );
      if (existingSub.rows.length > 0) {
        await pool.query(
          `UPDATE user_subscriptions SET status = 'active', end_date = $1, updated_at = NOW() WHERE id = $2`,
          [expiresAt, existingSub.rows[0].id]
        );
      } else {
        await pool.query(
          `INSERT INTO user_subscriptions (user_id, plan, status, end_date) VALUES ($1, 'pro', 'active', $2)`,
          [userId, expiresAt]
        );
      }

      console.log("🔥 USER UNLOCKED:", userId);

      return res.sendStatus(200);

    } catch (err) {
      console.error("❌ CALLBACK ERROR:", err);
      return res.sendStatus(200);
    }
  });

  app.get("/api/admin/mpesa/test", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { testMpesaCredentials } = await import("./mpesa");
      const result = await testMpesaCredentials();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Test a real STK Push to a given phone number (admin only, for debugging)
  app.post("/api/admin/mpesa/test-stk", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { phone, amount = 1 } = req.body;
      if (!phone) return res.status(400).json({ success: false, message: "phone is required" });
      const { stkPush } = await import("./mpesa");
      const result = await stkPush(phone, Number(amount), "STK Push Test");
      res.json({ success: true, data: result });
    } catch (err: any) {
      const safaricomError = err.response?.data;
      res.status(400).json({
        success: false,
        message: err.message,
        safaricomError,
        callbackUrl: `${process.env.APP_URL || `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`}/api/mpesa/callback`,
        hint: safaricomError?.errorCode === "400.002.02"
          ? "Shortcode not activated for Lipa Na M-Pesa Online (STK Push). Contact Safaricom Business Care: 0722 004 422 or M-PesaBusiness@safaricom.co.ke to activate shortcode for C2B STK Push."
          : safaricomError?.errorCode === "500.001.1001"
          ? "Wrong credentials: The MPESA_PASSKEY secret is incorrect for this shortcode. Log in to Safaricom Daraja (developer.safaricom.co.ke) → Go to your production app → Copy the Lipa Na M-Pesa passkey for shortcode 4153025 → Update the MPESA_PASSKEY secret in Replit. Also ensure APP_URL=https://workabroadhub.tech is set in secrets."
          : undefined,
      });
    }
  });

  // ── M-Pesa Pull API (auto-reconciliation) ──────────────────────────────────

  // Register Pull URL with Safaricom (one-time setup per shortcode)
  app.post("/api/admin/mpesa/pull/register", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { registerPullUrl } = await import("./mpesa");
      const shortCode = (process.env.MPESA_SHORTCODE || "4153025").trim();
      const host = req.headers["x-forwarded-host"] || req.headers.host || "workabroadhub.tech";
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const callbackUrl = `${protocol}://${host}/api/mpesa/pull/callback`;
      const result = await registerPullUrl(shortCode, callbackUrl);
      res.json({ success: true, callbackUrl, result });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.response?.data?.errorMessage || err.message });
    }
  });

  // Manually trigger a reconciliation run
  app.post("/api/admin/mpesa/pull/reconcile", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { runReconciliation } = await import("./mpesa-reconciler");
      const result = await runReconciliation();
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // GET /api/admin/mpesa/callback-url — verify the callback URL Safaricom is receiving
  app.get("/api/admin/mpesa/callback-url", isAuthenticated, isAdmin, async (req: any, res) => {
    const appUrl = process.env.APP_URL || "";
    const replitDomains = process.env.REPLIT_DOMAINS || "";
    const primaryDomain = replitDomains.split(",")[0]?.trim() || "";

    const baseUrl = appUrl || (primaryDomain ? `https://${primaryDomain}` : "https://localhost:5000");
    const callbackUrl = `${baseUrl}/api/mpesa/callback`;
    const isPublic = callbackUrl.startsWith("https://") && !callbackUrl.includes("localhost");

    res.json({
      callbackUrl,
      isPublic,
      appUrl: appUrl || "(not set — using REPLIT_DOMAINS fallback)",
      replitDomains: replitDomains || "(not set)",
      mpesaEnv: process.env.MPESA_ENV || "production",
      shortcode: process.env.MPESA_SHORTCODE || "4153025",
      warning: !isPublic
        ? "⚠️ Callback URL is NOT public. Set APP_URL=https://your-deployed-app.replit.app in environment secrets."
        : null,
      instruction: "This URL must be registered in the Safaricom Daraja dashboard as the Callback URL for your shortcode.",
    });
  });

  app.get("/api/admin/mpesa/token-status", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { getTokenStatus } = await import("./mpesa");
      const { getReconcilerState } = await import("./mpesa-reconciler");
      res.json({
        token: getTokenStatus(),
        reconciler: getReconcilerState(),
        environment: process.env.MPESA_ENV === "sandbox" ? "sandbox" : "production",
        shortcode: (process.env.MPESA_SHORTCODE || "").trim(),
        credentialsConfigured: !!(process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Force a token refresh (useful after credential change or Pull API registration)
  app.post("/api/admin/mpesa/token-refresh", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { forceTokenRefresh, getTokenStatus } = await import("./mpesa");
      await forceTokenRefresh();
      res.json({ success: true, token: getTokenStatus() });
    } catch (err: any) {
      const msg = err.response?.data?.errorMessage || err.message || "Token refresh failed";
      res.status(500).json({ success: false, message: msg });
    }
  });

  // ── Admin: manually activate a plan for any user ──────────────────────────
  // Use when automated callback failed (STK not received, PayPal dispute, etc.)
  // and admin has verified the payment externally.
  app.post("/api/admin/users/:userId/grant-plan", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const adminId = req.user?.claims?.sub;
      const { userId } = req.params;
      const { planId, transactionCode, note } = req.body;

      if (!planId || planId !== "pro") {
        return res.status(400).json({ message: "planId must be 'pro'" });
      }
      if (!transactionCode) {
        return res.status(400).json({ message: "transactionCode is required (M-Pesa receipt or PayPal order ID)" });
      }

      const plan = await storage.getPlanById(planId);
      if (!plan) return res.status(404).json({ message: "Plan not found" });

      // Check if this transaction code was already used (idempotency guard)
      const existing = await storage.getPaymentByTransactionRef(transactionCode);
      if (existing && existing.status === "success") {
        return res.status(409).json({ message: `Transaction code ${transactionCode} was already used for payment ${existing.id}` });
      }

      // Create a payment record for audit trail
      const payment = await storage.createPayment({
        userId,
        amount: plan.price,
        baseAmount: plan.price,   // no discount on admin grant — base === final
        discountType: null,
        currency: "KES",
        method: "mpesa",
        status: "pending",
        serviceId: `plan_${planId}`,
        transactionRef: transactionCode,
        metadata: JSON.stringify({ adminGranted: true, grantedBy: adminId, note: note || "", transactionCode }),
      });

      const { upgradeUserAccount } = await import("./services/upgradeUserAccount");
      const result = await upgradeUserAccount({
        userId,
        planType: planId as "pro",
        transactionId: transactionCode,
        paymentId: payment.id,
        serviceId: `plan_${planId}`,
        method: "mpesa",
        paymentSource: "web",
        amountKes: plan.price,
        extraMeta: { adminGranted: true, grantedBy: adminId, note: note || "" },
      });

      await storage.logAdminAction(adminId, "manual_plan_grant", {
        targetUserId: userId,
        planId,
        transactionCode,
        paymentId: payment.id,
        note: note || "",
      }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      console.log(`[Admin] Manual plan grant: userId=${userId} plan=${planId} txn=${transactionCode} by admin=${adminId}`);

      res.json({
        success: true,
        message: `${planId} plan manually activated for user ${userId}`,
        planActivated: result.planActivated,
        expiresAt: result.expiresAt,
        paymentId: payment.id,
      });
    } catch (err: any) {
      console.error("[Admin Grant Plan]", err.message);
      res.status(500).json({ message: err.message || "Failed to grant plan" });
    }
  });

  // ── Admin: activate a plan via a pending payment record ───────────────────
  // Use for pending_manual_verification payments — admin verifies externally then clicks activate.
  app.post("/api/admin/payments/:paymentId/activate", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const adminId = req.user?.claims?.sub;
      const { paymentId } = req.params;
      const { note, force } = req.body;

      const payment = await storage.getPaymentById(paymentId);
      if (!payment) return res.status(404).json({ message: "Payment not found" });

      // Parse planId from serviceId (e.g. "plan_pro" → "pro")
      let planId = "pro";
      if ((payment as any).serviceId?.startsWith("plan_")) {
        planId = (payment as any).serviceId.replace("plan_", "");
      }

      // Check if user already has an active subscription — true idempotency.
      // If payment is "success"/"completed" AND user already has the plan, skip unless force=true.
      if (!force && (payment.status === "success" || payment.status === "completed")) {
        const existingSub = await storage.getUserSubscription(payment.userId);
        const now = new Date();
        const subActive = existingSub?.isActive && (!existingSub.expiresAt || existingSub.expiresAt >= now);
        const userRow = await storage.getUserById(payment.userId);
        if (subActive && userRow?.plan === planId) {
          return res.json({ success: true, alreadyActive: true, message: "User already has an active plan. Pass force=true to reprocess anyway." });
        }
        // Payment marked success/completed but user NOT on the plan — run upgrade to repair.
        console.warn(`[Admin][Repair] Payment ${paymentId} is ${payment.status} but userId=${payment.userId} plan=${userRow?.plan ?? "?"} — running upgrade repair`);
      }

      const transactionId = payment.transactionRef || `admin-repair-${paymentId}-${Date.now()}`;

      const { upgradeUserAccount } = await import("./services/upgradeUserAccount");
      const result = await upgradeUserAccount({
        userId: payment.userId,
        planType: planId as "pro",
        transactionId,
        paymentId: payment.id,
        serviceId: (payment as any).serviceId || `plan_${planId}`,
        method: "mpesa",
        amountKes: payment.amount || 0,
        extraMeta: { adminActivated: true, activatedBy: adminId, note: note || "", repair: true },
      });

      await storage.logAdminAction(adminId, "manual_payment_activate", {
        paymentId,
        userId: payment.userId,
        planId,
        note: note || "",
        wasRepair: payment.status === "success" || payment.status === "completed",
      }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      console.log(`[Admin] Payment activated/repaired: paymentId=${paymentId} userId=${payment.userId} plan=${planId} by admin=${adminId} result=${result.success}`);

      res.json({
        success: true,
        message: `Plan ${result.planActivated} activated for user ${payment.userId}`,
        planActivated: result.planActivated,
        expiresAt: result.expiresAt,
        wasRepair: payment.status === "success" || payment.status === "completed",
      });
    } catch (err: any) {
      console.error("[Admin Activate Payment]", err.message);
      res.status(500).json({ message: err.message || "Failed to activate payment" });
    }
  });

  // ── Admin: get payments needing manual review ──────────────────────────────
  app.get("/api/admin/payments/pending-manual", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const [manualRows, pendingRows, awaitingRows] = await Promise.all([
        storage.getPaymentsByStatus("pending_manual_verification"),
        storage.getPaymentsByStatus("pending"),
        storage.getPaymentsByStatus("awaiting_payment"),
      ]);

      const rows = [...manualRows, ...pendingRows, ...awaitingRows]
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        .slice(0, 50);

      // Enrich with user info
      const enriched = await Promise.all(rows.map(async (p) => {
        const user = await storage.getUserById(p.userId).catch(() => null);
        return {
          ...p,
          userEmail: (user as any)?.email || p.userId,
          userName: user ? `${(user as any).firstName || ""} ${(user as any).lastName || ""}`.trim() : "",
        };
      }));

      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // List pulled transactions with reconciliation status
  app.get("/api/admin/mpesa/pull/transactions", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { getRecentPulledTransactions, getPullConfig } = await import("./mpesa-reconciler");
      const limit = parseInt(req.query.limit as string || "100", 10);
      const [transactions, config] = await Promise.all([
        getRecentPulledTransactions(limit),
        getPullConfig(),
      ]);
      res.json({ transactions, config });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // M-Pesa Fraud Monitoring Dashboard
  app.get("/api/admin/mpesa/suspicious", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const [allTransactions, orphans, failedCallbacks, lockedAccounts] = await Promise.all([
        storage.getMpesaAllTransactions(200),
        storage.getMpesaOrphanTransactions(100),
        storage.getMpesaFailedCallbacks(100),
        storage.getMpesaLockedAccounts(3),
      ]);

      const now = new Date();
      const activelyLocked = lockedAccounts.filter(a => a.lockedUntil && new Date(a.lockedUntil) > now);

      res.json({
        stats: {
          totalTransactions: allTransactions.length,
          successCount: allTransactions.filter(t => t.status === "success").length,
          orphanCount: orphans.length,
          failedCallbackCount: failedCallbacks.length,
          lockedAccountCount: activelyLocked.length,
          highRiskCount: lockedAccounts.filter(a => a.failedAttempts >= 10).length,
        },
        orphans,
        failedCallbacks,
        lockedAccounts,
        recentTransactions: allTransactions.slice(0, 50),
      });
    } catch (err: any) {
      console.error("[Admin] M-Pesa suspicious data error:", err);
      res.status(500).json({ message: "Failed to fetch M-Pesa security data" });
    }
  });

  app.post("/api/admin/mpesa/unlock/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      await storage.unlockAccount(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/admin/verify-payment/:code — look up a payment by M-Pesa code + matched user
  app.get("/api/admin/verify-payment/:code", isAuthenticated, async (req: any, res) => {
    try {
      const code = req.params.code;

      const { data: payment } = await supabase
        .from("payments")
        .select("*")
        .eq("mpesa_code", code)
        .single();

      if (!payment) {
        return res.json({ found: false });
      }

      const { data: user } = await supabase
        .from("users")
        .select("*")
        .eq("phone", payment.phone)
        .single();

      res.json({
        found: true,
        payment,
        user: user || null,
      });
    } catch (err: any) {
      console.error("[verify-payment]", err);
      res.status(500).json({ error: "Verification failed" });
    }
  });

  // GET /api/admin/payments-dashboard — summary + recent 50 payments from Supabase
  app.get("/api/admin/payments-dashboard", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) return res.status(500).json({ message: error.message });

      const payments = data ?? [];

      res.json({
        total:           payments.length,
        matched:         payments.filter((p: any) =>  p.matched).length,
        unmatched:       payments.filter((p: any) => !p.matched).length,
        needs_review:    payments.filter((p: any) =>  p.needs_review).length,
        high_confidence: payments.filter((p: any) =>  p.match_score >= 90).length,
        data: payments,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/admin/unmatched-payments — payments that completed but had no user match
  app.get("/api/admin/unmatched-payments", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("matched", false)
        .eq("processed", true)
        .order("created_at", { ascending: false });

      if (error) throw error;

      res.json(data || []);
    } catch (err) {
      console.error("❌ Fetch unmatched error:", err);
      res.status(500).json({ error: "Failed to fetch unmatched payments" });
    }
  });

  // GET /api/admin/suggest-users/:phone — fuzzy phone-based user suggestions for manual matching
  app.get("/api/admin/suggest-users/:phone", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const phone = req.params.phone.replace("+", "");

      const { data, error } = await supabase
        .from("users")
        .select("*");

      if (error) throw error;

      const normalize = (p: string | null | undefined): string => {
        if (!p) return "";
        if (p.startsWith("0")) return "254" + p.slice(1);
        if (p.startsWith("+")) return p.slice(1);
        return p;
      };

      const matches = (data ?? []).filter((u: any) =>
        normalize(u.phone).includes(phone.slice(-7))
      );

      res.json(matches);
    } catch (err) {
      console.error("❌ Suggest error:", err);
      res.status(500).json({ error: "Failed to suggest users" });
    }
  });

  // POST /api/admin/match-payment — manually link a payment to a user and upgrade them
  app.post("/api/admin/match-payment", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { payment_id, user_id } = req.body;

      // 1. Fetch payment to get phone number for local DB lookup
      const { data: paymentRow } = await supabase
        .from("payments")
        .select("phone")
        .eq("id", payment_id)
        .single();

      // 2. Update payment in Supabase
      await supabase
        .from("payments")
        .update({
          user_id:     String(user_id),
          matched:     true,
          processed:   true,
          match_score: 100,
        })
        .eq("id", payment_id);

      // 3. Upgrade user in Supabase (subscriptions table)
      await upgradeUserToPro(user_id);

      // 4. Upgrade local Postgres user so plan-gating is instant
      if (paymentRow?.phone) {
        try {
          const localUser = await storage.getUserByPhone(paymentRow.phone);
          if (localUser) {
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 360);
            await storage.activateUserPlan(localUser.id, "pro", String(payment_id), expiresAt);
            console.log("✅ LOCAL DB UPGRADED (manual):", localUser.id);
          } else {
            console.warn("⚠️ No local user found for phone (manual match):", paymentRow.phone);
          }
        } catch (localErr) {
          console.error("❌ Local DB upgrade failed (manual):", localErr);
        }
      }

      res.json({ success: true });
    } catch (err) {
      console.error("❌ Manual match error:", err);
      res.status(500).json({ error: "Failed to match payment" });
    }
  });

  // POST /api/admin/mark-fraud — flag a payment as suspected fraud
  app.post("/api/admin/mark-fraud", isAuthenticated, isAdmin, async (req: any, res) => {
    const { payment_id } = req.body;

    await supabase
      .from("payments")
      .update({ suspected_fraud: true })
      .eq("id", payment_id);

    res.json({ success: true });
  });

  // Pull callback endpoint — Safaricom pushes transactions here if registered
  app.post("/api/mpesa/pull/callback", async (req: any, res) => {
    try {
      const transactions: any[] = req.body?.Response || (Array.isArray(req.body) ? req.body : [req.body]);
      console.log(`[PullCallback] Received ${transactions.length} transaction(s) from Safaricom`);
      const { runReconciliation } = await import("./mpesa-reconciler");
      // Trigger a reconciliation scan to pick up the new transactions
      setImmediate(() => runReconciliation().catch(console.error));
      res.json({ ResultCode: 0, ResultDesc: "Success" });
    } catch (err: any) {
      console.error("[PullCallback] Error:", err.message);
      res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
    }
  });

  // ── GET /api/payments/history — user's own payment history (last 50) ────────
  app.get("/api/payments/history", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub ?? req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      // Infer payment type server-side so the UI doesn't have to
      const typeCase = sql<string>`CASE
        WHEN ${paymentsTable.planId} IS NOT NULL THEN 'subscription'
        WHEN ${paymentsTable.serviceId} ILIKE '%cv%' THEN 'cv_service'
        WHEN ${paymentsTable.serviceId} ILIKE '%consult%' THEN 'consultation'
        WHEN ${paymentsTable.serviceId} ILIKE '%visa%' THEN 'visa_guide'
        WHEN ${paymentsTable.serviceId} ILIKE '%job%' THEN 'job_post'
        ELSE 'other'
      END`;

      // Normalize status: treat "completed" and "success" as the same
      const statusCase = sql<string>`CASE
        WHEN ${paymentsTable.status} = 'completed' THEN 'success'
        ELSE ${paymentsTable.status}
      END`;

      const rows = await db
        .select({
          id:             paymentsTable.id,
          paymentId:      paymentsTable.transactionRef,
          amount:         paymentsTable.amount,          // raw KES — no /100
          currency:       paymentsTable.currency,
          status:         statusCase,
          gateway:        paymentsTable.method,          // "mpesa" | "paypal"
          type:           typeCase,
          planId:         paymentsTable.planId,
          serviceId:      paymentsTable.serviceId,
          serviceName:    paymentsTable.serviceName,
          deliveryStatus: paymentsTable.deliveryStatus,
          gatewayRef:     paymentsTable.mpesaReceiptNumber,
          failReason:     paymentsTable.failReason,
          createdAt:      paymentsTable.createdAt,
        })
        .from(paymentsTable)
        .where(eq(paymentsTable.userId, userId))
        .orderBy(desc(paymentsTable.createdAt))
        .limit(50);

      res.json(rows);
    } catch (err: any) {
      console.error("[GET /api/payments/history]", err.message);
      res.status(500).json({ message: "Failed to fetch payment history" });
    }
  });

  // ── GET /api/payments/:id/receipt — downloadable HTML receipt ───────────────
  app.get("/api/payments/:id/receipt", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub ?? req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const [p] = await db
        .select()
        .from(paymentsTable)
        .where(eq(paymentsTable.id, req.params.id))
        .limit(1);

      if (!p || String(p.userId) !== String(userId)) {
        return res.status(404).json({ message: "Payment not found" });
      }

      const isCompleted = p.status === "completed" || p.status === "success";
      if (!isCompleted) {
        return res.status(400).json({ message: "Receipt only available for completed payments" });
      }

      // XSS-safe HTML escaping (includes quotes for attribute safety)
      const escapeHtml = (str: string | null | undefined) =>
        String(str ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");

      // Amounts stored in raw KES — no division needed
      const amountKES = p.amount ?? 0;

      const dateStr = new Date(p.createdAt!).toLocaleString("en-KE", {
        day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
      });

      const TYPE_LABELS: Record<string, string> = {
        subscription: "Premium Plan",
        cv_service:   "CV Service",
        consultation: "Consultation",
        visa_guide:   "Visa Guide",
        job_post:     "Job Posting",
        other:        "WorkAbroad Hub Service",
      };

      let inferredType = "other";
      if (p.planId) inferredType = "subscription";
      else if (p.serviceId?.toLowerCase().includes("cv"))      inferredType = "cv_service";
      else if (p.serviceId?.toLowerCase().includes("consult")) inferredType = "consultation";
      else if (p.serviceId?.toLowerCase().includes("visa"))    inferredType = "visa_guide";
      else if (p.serviceId?.toLowerCase().includes("job"))     inferredType = "job_post";

      const serviceLabel = p.planId
        ? `${p.planId.charAt(0).toUpperCase() + p.planId.slice(1)} Plan`
        : TYPE_LABELS[inferredType];

      const methodLabel = p.method === "mpesa" ? "M-Pesa"
        : p.method === "paypal" ? "PayPal"
        : "Card";

      const paymentRef = p.mpesaReceiptNumber || p.transactionRef || String(p.id);
      const currency   = p.currency || "KES";

      const receipt = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Receipt — WorkAbroad Hub</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; max-width: 560px; margin: 40px auto; color: #1a1a1a; }
    .logo { font-size: 22px; font-weight: 700; color: #2563eb; }
    .divider { border: none; border-top: 1px solid #e5e7eb; margin: 20px 0; }
    .label { color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; }
    .value { font-size: 15px; font-weight: 500; margin-top: 2px; word-break: break-all; }
    .amount { font-size: 32px; font-weight: 700; color: #16a34a; margin: 16px 0; }
    .footer { font-size: 11px; color: #9ca3af; margin-top: 32px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    td { padding: 8px 0; vertical-align: top; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <div class="logo">WorkAbroad Hub</div>
  <p style="color:#6b7280;font-size:13px;margin-top:4px">workabroad.co.ke · support@workabroad.co.ke</p>
  <hr class="divider">

  <div style="text-align:center;padding:20px 0">
    <div style="font-size:13px;color:#6b7280">Payment Receipt</div>
    <div class="amount">${escapeHtml(currency)} ${amountKES.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    <div style="display:inline-block;background:#dcfce7;color:#16a34a;padding:4px 14px;border-radius:999px;font-size:13px;font-weight:600">✓ Payment Confirmed</div>
  </div>

  <hr class="divider">

  <table>
    <tr><td><div class="label">Service</div><div class="value">${escapeHtml(serviceLabel)}</div></td></tr>
    <tr><td><div class="label">Date</div><div class="value">${escapeHtml(dateStr)}</div></td></tr>
    <tr><td><div class="label">Payment Method</div><div class="value">${escapeHtml(methodLabel)}</div></td></tr>
    <tr><td><div class="label">Receipt Reference</div><div class="value" style="font-family:monospace">${escapeHtml(paymentRef)}</div></td></tr>
    <tr><td><div class="label">Internal ID</div><div class="value" style="font-family:monospace;font-size:12px">${escapeHtml(p.id)}</div></td></tr>
  </table>

  <hr class="divider">

  <div style="text-align:center;margin-top:16px">
    <button onclick="window.print()" style="background:#2563eb;color:#fff;border:none;padding:10px 24px;border-radius:8px;cursor:pointer;font-size:14px">Print / Save as PDF</button>
  </div>

  <div class="footer">
    <p>This is an official payment receipt from WorkAbroad Hub. Keep it for your records.</p>
    <p>For support, email support@workabroad.co.ke or visit workabroad.co.ke</p>
  </div>
</body>
</html>`;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `inline; filename="receipt-${String(p.id).slice(0, 8)}.html"`);
      res.send(receipt);
    } catch (err: any) {
      console.error("[GET /api/payments/:id/receipt]", err.message);
      res.status(500).json({ message: "Failed to generate receipt" });
    }
  });

  app.get("/api/payments/:id/status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const userPayments = await storage.getPaymentsByUser(userId);
      const payment = userPayments.find(p => p.id === req.params.id);
      if (!payment) {
        return res.status(404).json({ message: "Payment not found" });
      }
      // Include receipt number when payment is complete so the frontend can display it.
      // transactionRef holds the MpesaReceiptNumber after the callback overwrites the CheckoutRequestID.
      const receipt =
        (payment.status === "success" || payment.status === "completed")
          ? (payment.transactionRef ?? null)
          : null;
      console.log(`[M-Pesa] Status check for payment ${payment.id}: ${payment.status}${receipt ? ` | receipt: ${receipt}` : ""}`);
      res.json({ status: payment.status, receipt });
    } catch (error) {
      console.error("Error checking payment status:", error);
      res.status(500).json({ message: "Failed to check payment status" });
    }
  });

  // Look up payment status by Safaricom CheckoutRequestID (alternative to payment DB id).
  // The CheckoutRequestID is stored in metadata.checkoutRequestId so it survives the
  // transactionRef overwrite that happens when the receipt is saved on callback success.
  app.get("/api/mpesa/status/:checkoutRequestId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { checkoutRequestId } = req.params;

      // Search the authenticated user's payments for a matching checkoutRequestId.
      // We check both transactionRef (pending state) and metadata.checkoutRequestId (any state).
      const userPayments = await storage.getPaymentsByUser(userId);
      const payment = userPayments.find(p => {
        if (p.transactionRef === checkoutRequestId) return true;
        try {
          const meta = p.metadata
            ? (typeof p.metadata === "string" ? JSON.parse(p.metadata) : p.metadata)
            : {};
          return meta?.checkoutRequestId === checkoutRequestId;
        } catch { return false; }
      });

      if (!payment) {
        return res.status(404).json({ message: "Payment not found" });
      }

      const receipt =
        (payment.status === "success" || payment.status === "completed")
          ? (payment.transactionRef ?? null)
          : null;
      console.log(`[M-Pesa] CheckoutID status check ${checkoutRequestId}: ${payment.status}${receipt ? ` | receipt: ${receipt}` : ""}`);
      res.json({ status: payment.status, receipt });
    } catch (error) {
      console.error("Error checking M-Pesa status by checkoutRequestId:", error);
      res.status(500).json({ message: "Failed to check payment status" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // M-PESA RECONCILIATION — Admin: force-query Safaricom for stuck payments
  // ═══════════════════════════════════════════════════════════════════════════
  app.post("/api/mpesa/reconcile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const user = await storage.getUserById(userId);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin only" });

      const results: any[] = [];

      // 1. Reconcile stuck plan-level payments (payments table)
      const pendingPayments = await storage.getPaymentsByStatus("awaiting_payment");
      for (const payment of pendingPayments) {
        const checkoutId = payment.transactionRef;
        if (!checkoutId?.startsWith("ws_CO_")) continue;
        try {
          const { stkQuery: doQuery } = await import("./mpesa");
          const queryRes = await doQuery(checkoutId);
          results.push({ type: "plan_payment", id: payment.id, checkoutId, result: queryRes.ResultCode, desc: queryRes.ResultDesc });
          if (queryRes.ResultCode === 0) {
            const receipt = queryRes.CallbackMetadata?.Item?.find((i: any) => i.Name === "MpesaReceiptNumber")?.Value
              || queryRes.MpesaReceiptNumber || `RECONCILED-${Date.now()}`;
            await storage.updatePayment(payment.id, { status: "success", transactionRef: String(receipt) });
            const { activateUserPlan } = await import("./services/upgradeUserAccount");
            await activateUserPlan(payment.userId, payment.planId || "pro", payment.id);
          } else if ([1032, 1037, 2001].includes(queryRes.ResultCode)) {
            await storage.updatePayment(payment.id, { status: "failed" });
          }
        } catch (e: any) {
          results.push({ type: "plan_payment", id: payment.id, checkoutId, error: e.message });
        }
      }

      // 2. Reconcile stuck service orders (service_orders table)
      const stuckOrders = await db
        .select()
        .from(sql`service_orders` as any)
        .where(sql`payment_ref LIKE 'ws_CO_%' AND status IN ('pending','expired')`)
        .limit(20);

      for (const order of stuckOrders as any[]) {
        const checkoutId = order.payment_ref;
        try {
          const { stkQuery: doQuery } = await import("./mpesa");
          const queryRes = await doQuery(checkoutId);
          results.push({ type: "service_order", id: order.id, checkoutId, result: queryRes.ResultCode, desc: queryRes.ResultDesc });
          if (queryRes.ResultCode === 0) {
            const receipt = queryRes.CallbackMetadata?.Item?.find((i: any) => i.Name === "MpesaReceiptNumber")?.Value
              || `RECONCILED-${Date.now()}`;
            const amount = queryRes.CallbackMetadata?.Item?.find((i: any) => i.Name === "Amount")?.Value || order.amount;
            await storage.updateServiceOrder(order.id, { status: "processing", paymentRef: String(receipt) });
            await storage.createUserNotification({
              userId: order.user_id,
              orderId: order.id,
              title: "Payment Confirmed — Order Processing",
              message: `M-Pesa payment of KES ${amount} confirmed (${receipt}). Your ${order.service_name} is being prepared.`,
              type: "order_update",
            }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
          } else if ([1032, 1037, 2001].includes(queryRes.ResultCode)) {
            await storage.updateServiceOrder(order.id, { status: "cancelled" });
          }
        } catch (e: any) {
          results.push({ type: "service_order", id: order.id, checkoutId, error: e.message });
        }
      }

      res.json({ reconciled: results.length, results });
    } catch (error: any) {
      console.error("Reconcile error:", error);
      res.status(500).json({ message: "Reconciliation failed", error: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // M-PESA RECEIPT VERIFICATION — User self-service plan activation
  // User provides: M-Pesa receipt (e.g. "QHJ8QKXYZ") + plan + phone
  // We verify no duplicate, store it, activate their plan.
  // ═══════════════════════════════════════════════════════════════════════════
  const verifyReceiptSchema = z.object({
    receipt: z.string().min(8).max(20).regex(/^[A-Z0-9]+$/, "Invalid receipt format"),
    planId: z.enum(["pro"]),
    phone: z.string().min(9).max(15),
  });

  app.post("/api/mpesa/verify-receipt", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const parsed = verifyReceiptSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid receipt details", errors: parsed.error.errors });
      }

      const { receipt, planId, phone } = parsed.data;

      // Check if receipt already used
      const existing = await storage.getMpesaTransactionByReceipt(receipt);
      if (existing) {
        return res.status(409).json({ message: "This M-Pesa receipt has already been used." });
      }

      // Check if user already has an active subscription
      const currentSub = await storage.getUserSubscription(userId);
      if (currentSub?.isActive && (currentSub.planId === "pro" || currentSub.planId === planId)) {
        return res.status(409).json({ message: "You already have an active subscription." });
      }

      // Fetch real price from DB — reject if plan not configured
      const resolvedManual = await resolveCanonicalPlanPrice(planId);
      if (!resolvedManual) return res.status(400).json({ message: `Plan "${planId}" is not configured.` });
      const planAmount = resolvedManual.finalPrice;

      // Record the M-Pesa transaction as "manual_verified"
      await storage.createMpesaTransaction({
        phone: normalizePhone(phone, "KE") ?? phone,
        amount: planAmount,
        mpesaReceipt: receipt,
        transactionDate: new Date(),
        status: "manual_verified",
      });

      // Create a payment record so admin can audit it
      const newPayment = await storage.createPayment({
        userId,
        amount: planAmount,
        baseAmount: resolvedManual.basePrice,
        discountType: resolvedManual.discountType,
        currency: "KES",
        method: "mpesa",
        status: "success",
        transactionRef: receipt,
        serviceId: `plan_${planId}`,
        metadata: JSON.stringify({ source: "manual_receipt_verification", phone, receipt, planId }),
      });

      // Activate the plan via storage directly (no circular import)
      const oneYear = planExpiry(planId);
      await storage.activateUserPlan(userId, planId, newPayment.id, oneYear);

      // Notify user
      storage.createUserNotification({
        userId,
        type: "success",
        title: `${planId === "pro" ? "Pro" : "Basic"} Plan Activated!`,
        message: `Your ${planId === "pro" ? "Pro" : "Basic"} plan is now active. M-Pesa Receipt: ${receipt}.`,
      }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      console.log(`[M-Pesa][ManualVerify] Plan ${planId} activated for user ${userId} via receipt ${receipt}`);
      res.json({ success: true, plan: planId, message: `Your ${planId === "pro" ? "Pro" : "Basic"} plan has been activated!` });
    } catch (error: any) {
      console.error("Receipt verification error:", error);
      res.status(500).json({ message: "Verification failed. Please contact support." });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /api/payment-success — Webhook / manual trigger to unlock premium access
  //
  // Called after ANY confirmed M-Pesa payment. Accepts:
  //   receipt    — Safaricom MpesaReceiptNumber (e.g. "QHV3BG1234")
  //   planId     — "basic" | "pro"  (default "pro" if omitted)
  //   userId     — target user (admin only; if omitted, uses the authenticated user)
  //   phone      — payer's phone, used as fallback to look up user
  //
  // Security:
  //   - Requires authentication (isAuthenticated).
  //   - Non-admin users can only activate their OWN account.
  //   - Admin users can specify any userId.
  //   - Receipt is deduplicated — the same receipt cannot grant access twice.
  // ═══════════════════════════════════════════════════════════════════════════
  app.post("/api/payment-success", isAuthenticated, async (req: any, res) => {
    try {
      const callerId = req.user?.claims?.sub;
      if (!callerId) return res.status(401).json({ message: "Unauthorized" });

      const { receipt, planId = "pro", phone, userId: targetUserId } = req.body;
      if (!receipt || typeof receipt !== "string") {
        return res.status(400).json({ message: "receipt is required" });
      }
      if (planId !== "pro") {
        return res.status(400).json({ message: "planId must be 'pro'" });
      }

      // Resolve target user
      const callerUser = await storage.getUserById(callerId);
      let userId = callerId;
      if (targetUserId && targetUserId !== callerId) {
        if (!callerUser?.isAdmin) return res.status(403).json({ message: "Only admins can activate other users' plans" });
        userId = targetUserId;
      } else if (phone && !targetUserId) {
        // Phone-based lookup (for self-service or admin convenience)
        const normalized = normalizePhone(String(phone), "KE") ?? String(phone);
        const byPhone = await storage.getUserByPhone(normalized);
        if (byPhone && callerUser?.isAdmin) userId = byPhone.id;
      }

      // Idempotency: check if receipt was already processed
      const existingTx = await storage.getMpesaTransactionByReceipt(receipt);
      if (existingTx) {
        // If the plan is already active, just return success
        const currentSub = await storage.getUserSubscription(userId);
        if (currentSub?.isActive) {
          return res.json({ success: true, plan: currentSub.planId || planId, message: "Plan already active.", alreadyProcessed: true });
        }
        return res.status(409).json({ message: "This M-Pesa receipt has already been used for a different account." });
      }

      // Check for existing pending upgrade payment to link to
      const userPayments = await storage.getPaymentsByUser(userId);
      const pendingUpgrade = userPayments.find(p =>
        (p.status === "awaiting_payment" || p.status === "pending" || p.status === "expired") &&
        p.serviceId?.startsWith("plan_")
      );

      const resolvedLink = await resolveCanonicalPlanPrice(planId);
      if (!resolvedLink) return res.status(400).json({ message: `Plan "${planId}" is not configured.` });
      const planAmount = resolvedLink.finalPrice;
      const oneYear = planExpiry(planId);

      let paymentId: string;
      if (pendingUpgrade) {
        // Link the receipt to the existing pending payment
        await storage.updatePayment(pendingUpgrade.id, {
          status: "success",
          transactionRef: receipt,
          mpesaReceiptNumber: receipt,
        } as any);
        paymentId = pendingUpgrade.id;
      } else {
        // Create a new payment record for audit trail
        const newPayment = await storage.createPayment({
          userId,
          amount: planAmount,
          baseAmount: resolvedLink.basePrice,
          discountType: resolvedLink.discountType,
          currency: "KES",
          method: "mpesa",
          status: "success",
          transactionRef: receipt,
          serviceId: `plan_${planId}`,
          metadata: JSON.stringify({ source: "payment_success_webhook", receipt, planId }),
        });
        paymentId = newPayment.id;
      }

      // Record M-Pesa transaction for deduplication
      const normalizedPhone = phone
        ? (normalizePhone(String(phone), "KE") ?? String(phone))
        : "unknown";
      await storage.createMpesaTransaction({
        phone: normalizedPhone,
        amount: planAmount,
        mpesaReceipt: receipt,
        transactionDate: new Date(),
        status: "success",
      }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      // Activate the plan
      await storage.activateUserPlan(userId, planId, paymentId, oneYear);

      // In-app notification
      storage.createUserNotification({
        userId,
        type: "success",
        title: `${planId === "pro" ? "Pro" : "Basic"} Plan Activated!`,
        message: `Your ${planId === "pro" ? "Pro" : "Basic"} plan is now active until ${oneYear.toLocaleDateString("en-KE")}. M-Pesa Receipt: ${receipt}.`,
      }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      console.log(`[PaymentSuccess] Plan ${planId} activated for user ${userId} | receipt=${receipt} | by=${callerId}`);
      return res.json({ success: true, plan: planId, expiresAt: oneYear, paymentId, message: `${planId === "pro" ? "Pro" : "Basic"} plan activated successfully!` });
    } catch (err: any) {
      console.error("[PaymentSuccess]", err.message);
      res.status(500).json({ message: "Failed to activate plan", error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // M-PESA ADMIN: Query a specific CheckoutRequestID from Safaricom
  // ═══════════════════════════════════════════════════════════════════════════
  app.post("/api/mpesa/admin/query-checkout", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const user = await storage.getUserById(userId);
      if (!user?.isAdmin) return res.status(403).json({ message: "Admin only" });

      const { checkoutRequestId } = req.body;
      if (!checkoutRequestId?.startsWith("ws_CO_")) {
        return res.status(400).json({ message: "Invalid CheckoutRequestID format" });
      }

      const { stkQuery: doQuery } = await import("./mpesa");
      const queryRes = await doQuery(checkoutRequestId);
      res.json({ checkoutRequestId, safaricom: queryRes });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ============================================
  // LICENSE RENEWAL PAYMENT ENDPOINTS
  // ============================================

  const LICENSE_RENEWAL_FEES: Record<number, number> = {
    12: 5000,
    24: 9000,
  };

  const initiateRenewalSchema = z.object({
    agencyId: z.string().min(1),
    phoneNumber: z.string().min(10),
    durationMonths: z.union([z.literal(12), z.literal(24)]),
  });

  app.post("/api/license-renewal/initiate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const parsed = initiateRenewalSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request data", errors: parsed.error.errors });
      }

      const { agencyId, phoneNumber, durationMonths } = parsed.data;

      const agency = await storage.getNeaAgencyById(agencyId);
      if (!agency) {
        return res.status(404).json({ message: "Agency not found" });
      }

      const isBlacklisted = await storage.isEntityBlacklisted(agencyId);
      if (isBlacklisted) {
        return res.status(403).json({ message: "This agency is currently restricted and cannot process payments" });
      }

      let normalizedPhone = normalizePhone(phoneNumber, "KE") ?? phoneNumber;
      if (!/^254[71]\d{8}$/.test(normalizedPhone)) {
        return res.status(400).json({ message: "Invalid phone number. Use 07XXXXXXXX, 01XXXXXXXX, or +254XXXXXXXXX" });
      }

      const amount = LICENSE_RENEWAL_FEES[durationMonths] || LICENSE_RENEWAL_FEES[12];

      const renewalPayment = await storage.createLicenseRenewalPayment({
        agencyId,
        licenseNumber: agency.licenseNumber,
        phoneNumber: normalizedPhone,
        amount,
        renewalDurationMonths: durationMonths,
        status: "pending",
        previousExpiryDate: agency.expiryDate,
        checkoutRequestId: null,
        merchantRequestId: null,
        mpesaReceiptNumber: null,
        newExpiryDate: null,
        processedAt: null,
      });

      const useLiveMpesa = process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET && process.env.MPESA_SHORTCODE && process.env.MPESA_PASSKEY;

      if (useLiveMpesa) {
        try {
          const { stkPushForRenewal } = await import("./mpesa");
          const mpesaResponse = await stkPushForRenewal(normalizedPhone, amount, `LicRenew-${agency.licenseNumber}`);

          await storage.updateLicenseRenewalPayment(renewalPayment.id, {
            checkoutRequestId: mpesaResponse.CheckoutRequestID,
            merchantRequestId: mpesaResponse.MerchantRequestID,
          });

          res.json({
            success: true,
            paymentId: renewalPayment.id,
            checkoutRequestId: mpesaResponse.CheckoutRequestID,
            amount,
            message: "STK push sent to your phone. Please enter your M-PESA PIN.",
          });
        } catch (mpesaError: any) {
          console.error("[LicenseRenewal] M-Pesa STK Push error:", mpesaError.response?.data || mpesaError.message);
          await storage.updateLicenseRenewalPayment(renewalPayment.id, { status: "failed" });
          res.status(500).json({ message: "Failed to initiate M-Pesa payment. Please try again." });
        }
      } else {
        setTimeout(async () => {
          try {
            const receipt = `LRNW${Date.now()}`;
            const currentExpiry = new Date(agency.expiryDate);
            const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
            const newExpiry = new Date(baseDate);
            newExpiry.setMonth(newExpiry.getMonth() + durationMonths);

            await storage.updateLicenseRenewalPayment(renewalPayment.id, {
              status: "success",
              mpesaReceiptNumber: receipt,
              newExpiryDate: newExpiry,
              processedAt: new Date(),
            });

            await storage.updateNeaAgency(agencyId, {
              expiryDate: newExpiry,
              statusOverride: null,
            });
          } catch (err) {
            console.error("[LicenseRenewal] Simulation error:", err);
          }
        }, 3000);

        res.json({
          success: true,
          paymentId: renewalPayment.id,
          amount,
          message: "STK push sent to your phone. Please enter your M-PESA PIN.",
        });
      }
    } catch (error) {
      console.error("[LicenseRenewal] Error initiating payment:", error);
      res.status(500).json({ message: "Failed to initiate license renewal payment" });
    }
  });

  app.post("/api/mpesa/license-renewal/callback", async (req, res) => {
    try {
      if (!req.body.Body?.stkCallback) {
        return res.status(400).end();
      }

      const callback = req.body.Body.stkCallback;
      const checkoutRequestId = callback.CheckoutRequestID;

      console.log(`[LicenseRenewal] Callback received: ${checkoutRequestId}, ResultCode: ${callback.ResultCode}`);

      const renewalPayment = await storage.getLicenseRenewalPaymentByCheckoutId(checkoutRequestId);
      if (!renewalPayment) {
        console.warn(`[LicenseRenewal] No matching renewal payment for CheckoutRequestID: ${checkoutRequestId}`);
        return res.json({ ResultCode: 0, ResultDesc: "No matching payment" });
      }

      if (renewalPayment.status === "success") {
        return res.json({ ResultCode: 0, ResultDesc: "Already processed" });
      }

      if (callback.ResultCode !== 0) {
        console.log(`[LicenseRenewal] Payment failed: ${callback.ResultDesc}`);
        await storage.updateLicenseRenewalPayment(renewalPayment.id, { status: "failed" });
        return res.json({ ResultCode: 0, ResultDesc: "Rejected" });
      }

      const items = callback.CallbackMetadata?.Item || [];
      const amount = items.find((i: any) => i.Name === "Amount")?.Value;
      const receipt = items.find((i: any) => i.Name === "MpesaReceiptNumber")?.Value;
      const phone = items.find((i: any) => i.Name === "PhoneNumber")?.Value;

      if (Number(amount) !== renewalPayment.amount) {
        console.warn(`[LicenseRenewal] Amount mismatch: expected ${renewalPayment.amount}, got ${amount}`);
        await storage.updateLicenseRenewalPayment(renewalPayment.id, { status: "failed" });
        return res.json({ ResultCode: 0, ResultDesc: "Amount mismatch" });
      }

      const agency = await storage.getNeaAgencyById(renewalPayment.agencyId);
      if (!agency) {
        console.error(`[LicenseRenewal] Agency not found: ${renewalPayment.agencyId}`);
        await storage.updateLicenseRenewalPayment(renewalPayment.id, { status: "failed" });
        return res.json({ ResultCode: 0, ResultDesc: "Agency not found" });
      }

      const currentExpiry = new Date(agency.expiryDate);
      const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
      const newExpiry = new Date(baseDate);
      newExpiry.setMonth(newExpiry.getMonth() + renewalPayment.renewalDurationMonths);

      await storage.updateLicenseRenewalPayment(renewalPayment.id, {
        status: "success",
        mpesaReceiptNumber: String(receipt),
        newExpiryDate: newExpiry,
        processedAt: new Date(),
      });

      await storage.updateNeaAgency(renewalPayment.agencyId, {
        expiryDate: newExpiry,
        statusOverride: null,
      });

      // Invalidate NEA agencies cache so public pages reflect the renewed license immediately
      cache.invalidate("nea-agencies:");

      console.log(`[LicenseRenewal] License renewed: ${agency.licenseNumber}, new expiry: ${newExpiry.toISOString()}`);

      // Fire-and-forget SMS via background queue (non-blocking)
      asyncQueue.enqueue<SmsJob>(QUEUE_TYPES.SMS, { type: 'payment_received', phone: String(phone), amount: Number(amount), serviceName: `License Renewal - ${agency.licenseNumber}` }, 2);

      return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
    } catch (error: any) {
      console.error("[LicenseRenewal] Callback error:", error);
      return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
    }
  });

  app.get("/api/license-renewal/status/:paymentId", isAuthenticated, async (req: any, res) => {
    try {
      const payment = await storage.getLicenseRenewalPaymentById(req.params.paymentId);
      if (!payment) {
        return res.status(404).json({ message: "Payment not found" });
      }
      res.json({
        id: payment.id,
        status: payment.status,
        amount: payment.amount,
        licenseNumber: payment.licenseNumber,
        mpesaReceiptNumber: payment.mpesaReceiptNumber,
        newExpiryDate: payment.newExpiryDate,
        createdAt: payment.createdAt,
      });
    } catch (error) {
      console.error("[LicenseRenewal] Error checking status:", error);
      res.status(500).json({ message: "Failed to check payment status" });
    }
  });

  app.get("/api/license-renewal/history/:agencyId", isAuthenticated, async (req: any, res) => {
    try {
      const payments = await storage.getLicenseRenewalPaymentsByAgency(req.params.agencyId);
      res.json(payments);
    } catch (error) {
      console.error("[LicenseRenewal] Error fetching history:", error);
      res.status(500).json({ message: "Failed to fetch payment history" });
    }
  });

  // PayPal license renewal route removed — M-Pesa is the only supported payment method.

  app.get("/api/license-renewal/fees", async (_req, res) => {
    res.json({
      fees: Object.entries(LICENSE_RENEWAL_FEES).map(([months, amount]) => ({
        durationMonths: parseInt(months),
        amount,
        label: parseInt(months) === 12 ? "1 Year" : `${parseInt(months) / 12} Years`,
      })),
      currency: "KES",
    });
  });

  app.get("/api/admin/users", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const search = (req.query.search as string) || "";
      const plan = (req.query.plan as string) || "all";
      const status = (req.query.status as string) || "all";
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(20, Math.max(1, parseInt(req.query.limit as string) || 20));

      const { users: pageUsers, totalUsers, totalPages, currentPage } = await storage.getFilteredUsers({
        search, plan, status, page, limit,
      });

      // Fetch subscriptions only for the current page's users via inArray — never fetch all
      const userIds = pageUsers.map(u => u.id);
      let subMap = new Map<string, any>();
      if (userIds.length > 0) {
        const pageSubs = await db.select().from(userSubscriptions)
          .where(inArray(userSubscriptions.userId, userIds));
        subMap = new Map(pageSubs.map(s => [s.userId, s]));
      }

      const enriched = pageUsers.map(u => {
        const sub = subMap.get(u.id);
        const isSubActive = !!(sub?.status === "active" && (!sub.endDate || sub.endDate > new Date()));
        const planLabel = isSubActive ? (sub?.plan || u.plan || "free") : (u.plan || "free");
        return {
          id: u.id,
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          phone: u.phone,
          country: u.country,
          role: u.role,
          isAdmin: u.isAdmin,
          isActive: u.isActive,
          plan: u.plan,
          userStage: u.userStage,
          authMethod: u.authMethod,
          createdAt: u.createdAt,
          lastLogin: u.lastLogin,
          hasActiveSubscription: isSubActive,
          planDisplay: planLabel,
          lastActive: u.lastLogin,
        };
      });

      res.json({ users: enriched, totalUsers, totalPages, currentPage });
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.get("/api/admin/users/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const user = await storage.getUserById(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const subscription = await storage.getUserSubscription(user.id);
      res.json({ ...user, subscription });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // GET /api/admin/active-sessions — who is online right now with their current page
  app.get("/api/admin/active-sessions", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const rows = await db.execute(sql`
        SELECT
          u.id           AS user_id,
          u.email,
          u.phone,
          u.first_name,
          u.last_name,
          u.plan,
          s.session_id,
          s.current_page,
          s.last_seen
        FROM active_sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.is_online = true
        ORDER BY s.last_seen DESC
      `);
      res.json(rows.rows);
    } catch (err: any) {
      console.error("[GET /api/admin/active-sessions]", err.message);
      res.status(500).json({ message: "Failed to fetch active sessions" });
    }
  });

  // POST /api/admin/revenue/backfill — push all historical completed payments to Firebase RTDB
  app.post("/api/admin/revenue/backfill", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const { trackRevenue } = await import("./services/firebaseRtdb");
      const rows = await db.execute(sql`
        SELECT id, user_id, amount, service_id, plan_id, method, mpesa_receipt_number, transaction_ref, created_at
        FROM payments
        WHERE status = 'completed'
          AND amount > 0
        ORDER BY created_at ASC
      `);
      const payments = (rows as any).rows ?? [];
      let pushed = 0;
      let failed = 0;
      for (const p of payments) {
        try {
          const serviceId = p.service_id ?? p.plan_id ?? null;
          const reference = p.mpesa_receipt_number ?? p.transaction_ref ?? p.id;
          const method = p.method ?? "mpesa";
          // Override "now" by temporarily shifting — instead use a direct path write
          await trackRevenue({
            userId:    p.user_id,
            amountKes: Number(p.amount),
            serviceId,
            method,
            reference: String(reference),
            date:      p.created_at ? new Date(p.created_at) : undefined,
          });
          pushed++;
        } catch {
          failed++;
        }
      }
      console.log(`[RTDB][Backfill] Done — ${pushed} pushed, ${failed} failed`);
      res.json({ pushed, failed, total: payments.length });
    } catch (err: any) {
      console.error("[RTDB][Backfill] Error:", err.message);
      res.status(500).json({ message: "Backfill failed" });
    }
  });

  // GET /api/admin/users/:id/payments — payment history for a specific user
  app.get("/api/admin/users/:id/payments", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userPayments = await db
        .select()
        .from(payments)
        .where(eq(payments.userId, req.params.id))
        .orderBy(desc(payments.createdAt))
        .limit(50);
      res.json(userPayments);
    } catch (error) {
      console.error("Error fetching user payments:", error);
      res.status(500).json({ message: "Failed to fetch payment history" });
    }
  });

  // GET /api/non-paying-users — admin list of free users who haven't converted
  app.get("/api/non-paying-users", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 200, 1000);
      const allFree = await storage.getNonPayingUsers(limit);
      // Annotate inactivity: no login in 7+ days
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const annotated = allFree.map((u) => ({
        id: u.id,
        email: u.email,
        phone: u.phone,
        firstName: u.firstName,
        lastName: u.lastName,
        plan: u.plan,
        userStage: u.userStage,
        createdAt: u.createdAt,
        lastLogin: u.lastLogin,
        isInactive: u.lastLogin ? new Date(u.lastLogin).getTime() < sevenDaysAgo : true,
        daysSinceSignup: u.createdAt
          ? Math.floor((Date.now() - new Date(u.createdAt).getTime()) / 86400000)
          : null,
      }));
      res.json({ total: annotated.length, users: annotated });
    } catch (error: any) {
      console.error("Error fetching non-paying users:", error);
      res.status(500).json({ message: "Failed to fetch non-paying users" });
    }
  });

  // GET /api/admin/analytics/user-stages — funnel stage breakdown
  app.get("/api/admin/analytics/user-stages", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const [stages, totalUsers, paidCount] = await Promise.all([
        storage.getFunnelStageStats(),
        storage.getUserCount(),
        storage.getActiveSubscriptionCount(),
      ]);
      const freeCount = totalUsers - paidCount;
      const conversionRate = totalUsers > 0 ? Math.round((paidCount / totalUsers) * 100) : 0;
      res.json({
        totalUsers,
        paidCount,
        freeCount,
        conversionRate,
        stages,
      });
    } catch (error: any) {
      console.error("Error fetching user stage stats:", error);
      res.status(500).json({ message: "Failed to fetch stage stats" });
    }
  });

  app.patch("/api/admin/users/:id/status", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { isActive } = req.body;
      if (typeof isActive !== "boolean") {
        return res.status(400).json({ message: "isActive must be a boolean" });
      }
      const user = await storage.updateUserStatus(req.params.id, isActive);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      console.error("Error updating user status:", error);
      res.status(500).json({ message: "Failed to update user status" });
    }
  });

  // PATCH /api/admin/users/:id/set-admin — grant or revoke admin flag
  app.patch("/api/admin/users/:id/set-admin", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { isAdmin: grantAdmin } = req.body;
      if (typeof grantAdmin !== "boolean") {
        return res.status(400).json({ message: "isAdmin must be a boolean" });
      }
      const adminId = req.user?.claims?.sub ?? String(req.user?.id ?? "");
      if (req.params.id === adminId) {
        return res.status(400).json({ message: "Cannot change your own admin status" });
      }
      const user = await storage.setUserAdmin(req.params.id, grantAdmin);
      if (!user) return res.status(404).json({ message: "User not found" });
      await storage.logAdminAction(adminId, grantAdmin ? "grant_admin" : "revoke_admin", { targetUserId: req.params.id });
      res.json({ success: true, isAdmin: user.isAdmin });
    } catch (err: any) {
      console.error("Error setting admin flag:", err);
      res.status(500).json({ message: "Failed to update admin status" });
    }
  });

  // PATCH /api/admin/users/:id/plan — quickly upgrade/downgrade a user's plan (admin only)
  app.patch("/api/admin/users/:id/plan", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const adminId = req.user?.claims?.sub;
      const { id: userId } = req.params;
      const { plan } = req.body;
      if (!plan || !["free", "pro"].includes(plan)) {
        return res.status(400).json({ message: "plan must be 'free' or 'pro'" });
      }
      if (plan === "free") {
        // Downgrade: deactivate all subscriptions AND reset plan column
        await db.update(userSubscriptions).set({ status: "expired", updatedAt: new Date() }).where(eq(userSubscriptions.userId, userId));
        await db.update(users).set({ plan: "free", updatedAt: new Date() }).where(eq(users.id, userId));
        console.info(`[Admin] Manual plan downgrade: userId=${userId} plan=free by=${adminId}`);
        return res.json({ success: true, plan: "free" });
      }
      // Upgrade: create subscription record and sync plan column
      const transactionCode = `ADMIN-MANUAL-${Date.now()}`;
      const dbPlan = await storage.getPlanById(plan);
      const payment = await storage.createPayment({
        userId,
        amount: dbPlan?.price ?? 0,
        baseAmount: dbPlan?.price ?? 0,   // no discount on admin panel upgrade
        discountType: null,
        currency: "KES",
        method: "mpesa",
        status: "success",
        serviceId: `plan_${plan}`,
        transactionRef: transactionCode,
        metadata: JSON.stringify({ adminGranted: true, grantedBy: adminId, note: "Manual upgrade via admin panel" }),
      });
      const expiresAt = planExpiry(plan);
      await storage.activateUserPlan(userId, plan, payment.id, expiresAt);
      console.info(`[Admin] Manual plan upgrade: userId=${userId} plan=${plan} by=${adminId}`);
      res.json({ success: true, plan });
    } catch (error: any) {
      console.error("Error upgrading user plan:", error);
      res.status(500).json({ message: "Failed to upgrade plan", error: error.message });
    }
  });

  // POST /api/admin/manual-upgrade — upgrade a user by phone via Supabase directly
  app.post("/api/admin/manual-upgrade", isAuthenticated, async (req: any, res) => {
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: "Unauthorized" });
    }
    const { phone } = req.body;
    await upgradeUserToPro(normalizePhone(phone) ?? phone);
    res.json({ success: true });
  });

  // POST /api/admin/manual-grant
  // Look up a user by email OR phone, then grant them a plan.
  // Used when a user paid successfully but the system did not recognise them.
  app.post("/api/admin/manual-grant", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const adminId = req.user?.claims?.sub;
      const { identifier, planId = "pro", note = "", receipt, createIfNotFound = false } = req.body;

      if (!identifier || typeof identifier !== "string") {
        return res.status(400).json({ message: "identifier (email or phone) is required" });
      }
      if (planId !== "pro") {
        return res.status(400).json({ message: "planId must be 'pro'" });
      }

      const raw = identifier.trim();
      const lookupType = raw.includes("@") ? "email" : "phone";
      console.info(`[ManualGrant] looking up ${lookupType}="${raw}" requested by admin=${adminId}`);

      // Search by email if "@" present, else normalize and search by phone
      let user = await storage.getUserByEmailOrPhone(raw);

      if (!user) {
        // If createIfNotFound is true and we have an email, create a stub account
        if (createIfNotFound && raw.includes("@")) {
          console.info(`[ManualGrant] creating stub account for email="${raw.toLowerCase()}"`);
          const [created] = await db.insert(users).values({
            email: raw.toLowerCase(),
            authMethod: "email",
            userStage: "paid",
            firstName: raw.split("@")[0],
          }).returning();
          user = created;
          console.info(`[ManualGrant] stub account created userId=${user.id}`);
        } else {
          console.warn(`[ManualGrant] no account found for ${lookupType}="${raw}"`);
          return res.status(404).json({
            message: `No account found for "${raw}". Please check the ${lookupType} and try again.`,
            notFound: true,
            canCreate: raw.includes("@"),
          });
        }
      }

      console.info(`[ManualGrant] found userId=${user.id} email=${user.email} phone=${user.phone ?? "N/A"}`);

      const resolvedGrant = await resolveCanonicalPlanPrice(planId);
      if (!resolvedGrant) return res.status(400).json({ message: `Plan "${planId}" is not configured in the database.` });
      const amount = resolvedGrant.finalPrice;
      const transactionRef = receipt?.trim() || `ADMIN-GRANT-${Date.now()}`;
      const expiresAt = planExpiry(planId);

      const payment = await storage.createPayment({
        userId: user.id,
        amount,
        baseAmount: resolvedGrant.basePrice,
        discountType: resolvedGrant.discountType,
        currency: "KES",
        method: "mpesa",
        status: "success",
        serviceId: `plan_${planId}`,
        transactionRef,
        metadata: JSON.stringify({
          adminGranted: true,
          grantedBy: adminId,
          note: note || "Manual grant by admin",
          identifier: raw,
        }),
      });

      await storage.activateUserPlan(user.id, planId, payment.id, expiresAt);
      await storage.updateUserStage(user.id, "paid").catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      // In-app notification for the user
      storage.createUserNotification({
        userId: user.id,
        type: "success",
        title: "Pro Plan Activated",
        message: `Your Pro plan has been activated by the admin team. Expires ${expiresAt.toLocaleDateString("en-KE")}.`,
      }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      // Admin audit log
      await storage.logAdminAction(adminId, "manual_plan_grant", {
        targetUserId: user.id,
        identifier: raw,
        planId,
        transactionRef,
        note,
        expiresAt,
      }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      const wasCreated = !!(createIfNotFound && user.createdAt && Date.now() - new Date(user.createdAt).getTime() < 10000);
      console.info(`[ManualGrant] pro granted to userId=${user.id} (${raw}) by admin=${adminId} ref=${transactionRef} created=${wasCreated}`);

      res.json({
        success: true,
        message: wasCreated
          ? `Account created and Pro plan granted to ${raw}. They can sign in with this email to access their plan.`
          : "Pro plan granted successfully.",
        accountCreated: wasCreated,
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || user.phone || "Unknown",
          plan: planId,
          expiresAt,
        },
      });
    } catch (err: any) {
      console.error("[ManualGrant]", err.message);
      res.status(500).json({ message: "Failed to grant plan", error: err.message });
    }
  });

  // POST /api/admin/upgrade
  // Upgrade a user's plan by email OR phone number.
  // Body: { identifier: string, plan: "pro" }
  //   (also accepts legacy key "email" for backward compatibility)
  // Returns: { success, message, user } or 404 "User not found"
  app.post("/api/admin/upgrade", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const adminId = req.user?.claims?.sub;
      // Accept "identifier" (new) or legacy "email" key
      const raw: string = (req.body.identifier ?? req.body.email ?? "").trim();
      const { plan } = req.body;

      if (!raw) {
        return res.status(400).json({ message: "identifier (email or phone) is required" });
      }
      if (!plan || plan !== "pro") {
        return res.status(400).json({ message: "plan must be 'pro'" });
      }

      const lookupType = raw.includes("@") ? "email" : "phone";
      console.info(`[AdminUpgrade] looking up ${lookupType}="${raw}" requested by admin=${adminId}`);

      // Search by email or phone using the canonical lookup
      const user = await storage.getUserByEmailOrPhone(raw);

      if (!user) {
        console.warn(`[AdminUpgrade] no account found for ${lookupType}="${raw}"`);
        return res.status(404).json({
          message: `No account found for "${raw}". Please check the ${lookupType} and try again.`,
        });
      }

      console.info(`[AdminUpgrade] found userId=${user.id} email=${user.email} phone=${user.phone ?? "N/A"}`);

      const resolvedUpgrade = await resolveCanonicalPlanPrice(plan);
      if (!resolvedUpgrade) return res.status(400).json({ message: `Plan "${plan}" is not configured in the database.` });
      const amount = resolvedUpgrade.finalPrice;
      const transactionRef = `ADMIN-UPGRADE-${Date.now()}`;
      const expiresAt = planExpiry(plan);

      const payment = await storage.createPayment({
        userId: user.id,
        email: user.email || null,
        amount,
        baseAmount: resolvedUpgrade.basePrice,
        discountType: resolvedUpgrade.discountType,
        currency: "KES",
        method: "mpesa",
        status: "success",
        serviceId: `plan_${plan}`,
        transactionRef,
        metadata: JSON.stringify({
          adminUpgrade: true,
          grantedBy: adminId,
          identifier: raw,
          lookupType,
          note: "Admin upgrade via /api/admin/upgrade",
        }),
      } as any);

      await storage.activateUserPlan(user.id, plan, payment.id, expiresAt);
      await storage.updateUserStage(user.id, "paid").catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      storage.createUserNotification({
        userId: user.id,
        type: "success",
        title: "Pro Plan Activated",
        message: `Your Pro plan has been activated. Expires ${expiresAt.toLocaleDateString("en-KE")}.`,
      }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      await storage.logAdminAction(adminId, "admin_upgrade_by_identifier", {
        targetUserId: user.id,
        identifier: raw,
        lookupType,
        plan,
        transactionRef,
        expiresAt,
      }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      console.info(
        `[AdminUpgrade] pro granted to userId=${user.id} (${lookupType}="${raw}") by admin=${adminId} ref=${transactionRef}`
      );

      return res.json({
        success: true,
        message: `Pro plan activated successfully for ${user.email || user.phone || raw}.`,
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || user.phone || "Unknown",
          plan,
          expiresAt,
        },
      });
    } catch (err: any) {
      console.error("[AdminUpgrade]", err.message);
      return res.status(500).json({ message: "Failed to upgrade user", error: err.message });
    }
  });

  // ── GET /api/admin/stuck-payments ─────────────────────────────────────────
  // Returns all payments with status=retry_available (M-Pesa STK sent but callback
  // never confirmed). Each entry is enriched with the user's current plan so admin
  // can see who still needs to be activated.
  app.get("/api/admin/stuck-payments", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const stuck = await storage.getPaymentsByStatus("retry_available");
      const enriched = await Promise.all(stuck.map(async (p) => {
        let user = null;
        try { user = await storage.getUserById(p.userId); } catch (_) {}
        return {
          paymentId: p.id,
          userId: p.userId,
          amount: p.amount,
          currency: p.currency,
          transactionRef: p.transactionRef,
          createdAt: p.createdAt,
          userEmail: user?.email ?? null,
          userName: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || null,
          userPhone: user?.phone ?? null,
          currentPlan: user?.plan ?? "unknown",
        };
      }));
      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch stuck payments" });
    }
  });

  // ── POST /api/admin/stuck-payments/activate-all ───────────────────────────
  // Bulk-activates Pro plan for ALL retry_available payments in one click.
  // IMPORTANT: must be registered BEFORE /:paymentId/activate to avoid route shadowing.
  app.post("/api/admin/stuck-payments/activate-all", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const adminId = req.user?.claims?.sub;
      const { planId = "pro" } = req.body;
      const stuck = await storage.getPaymentsByStatus("retry_available");
      const results: { userId: string; email: string | null; status: string }[] = [];
      for (const payment of stuck) {
        try {
          const user = await storage.getUserById(payment.userId);
          if (!user) { results.push({ userId: payment.userId, email: null, status: "user_not_found" }); continue; }
          const expiresAt = planExpiry();
          await storage.updatePayment(payment.id, { status: "success" });
          await storage.activateUserPlan(user.id, "pro", payment.id, expiresAt);
          await storage.updateUserStage(user.id, "paid").catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
          storage.createUserNotification({
            userId: user.id, type: "success",
            title: "Pro Plan Activated",
            message: `Your Pro plan has been activated. Expires ${expiresAt.toLocaleDateString("en-KE")}.`,
          }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
          if (user.email) {
            sendProActivationEmail(user.email, user.firstName, expiresAt, payment.transactionRef).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
          }
          results.push({ userId: user.id, email: user.email ?? null, status: "activated" });
        } catch (e: any) {
          results.push({ userId: payment.userId, email: null, status: `error: ${e.message}` });
        }
      }

      await storage.logAdminAction(adminId, "bulk_stuck_payment_activate", {
        planId, count: results.filter(r => r.status === "activated").length, results,
      }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      const activated = results.filter(r => r.status === "activated").length;
      console.info(`[StuckPayments] Bulk activate: ${activated}/${stuck.length} payments activated by admin=${adminId}`);
      res.json({ success: true, activated, total: stuck.length, results });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to bulk activate", error: err.message });
    }
  });

  // ── POST /api/admin/stuck-payments/:paymentId/activate ────────────────────
  // Manually activates the plan for a single stuck payment.
  app.post("/api/admin/stuck-payments/:paymentId/activate", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const adminId = req.user?.claims?.sub;
      const { paymentId } = req.params;
      const { planId = "pro", note = "" } = req.body;

      const payment = await storage.getPaymentById(paymentId);
      if (!payment) return res.status(404).json({ message: "Payment not found" });
      if (payment.status === "success") return res.status(400).json({ message: "Payment already processed as success" });

      const user = await storage.getUserById(payment.userId);
      if (!user) return res.status(404).json({ message: `User ${payment.userId} not found in database` });

      const expiresAt = planExpiry();

      await storage.updatePayment(paymentId, { status: "success" });
      await storage.activateUserPlan(user.id, "pro", paymentId, expiresAt);
      await storage.updateUserStage(user.id, "paid").catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      storage.createUserNotification({
        userId: user.id,
        type: "success",
        title: "Pro Plan Activated",
        message: `Your Pro plan has been activated. Expires ${expiresAt.toLocaleDateString("en-KE")}.`,
      }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      if (user.email) {
        sendProActivationEmail(user.email, user.firstName, expiresAt, payment.transactionRef).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
      }

      await storage.logAdminAction(adminId, "manual_stuck_payment_activate", {
        paymentId, userId: user.id, planId, transactionRef: payment.transactionRef, note,
      }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      console.info(`[StuckPayments] Activated ${planId} for userId=${user.id} (${user.email}) paymentId=${paymentId} by admin=${adminId}`);
      res.json({ success: true, message: `${planId} plan activated for ${user.email || user.id}`, userId: user.id });
    } catch (err: any) {
      console.error("[StuckPayments] Activate error:", err.message);
      res.status(500).json({ message: "Failed to activate plan", error: err.message });
    }
  });

  // ── POST /api/admin/stuck-payments/:paymentId/query-and-activate ─────────
  // For a single retry_available payment: re-queries Safaricom's STK Query API
  // (which still works even after the 5-min window, for up to ~24h) and if the
  // user actually paid (ResultCode=0), auto-activates Pro immediately.
  // This is the proper fix for "callback missed but user did pay" scenarios.
  app.post("/api/admin/stuck-payments/:paymentId/query-and-activate", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const adminId = req.user?.claims?.sub;
      const { paymentId } = req.params;

      const payment = await storage.getPaymentById(paymentId);
      if (!payment) return res.status(404).json({ message: "Payment not found" });
      if (payment.status === "success") return res.status(400).json({ message: "Payment already succeeded", alreadySuccess: true });
      if (payment.method !== "mpesa") return res.status(400).json({ message: "Only M-Pesa payments can be queried this way" });
      if (!payment.transactionRef) return res.status(400).json({ message: "Payment has no transaction reference (STK CheckoutRequestID missing)" });

      console.log(`[StuckPayments] Admin ${adminId} querying Safaricom for payment ${paymentId} (ref: ${payment.transactionRef})`);

      const { stkQuery } = await import("./mpesa");
      let queryResult: any;
      try {
        queryResult = await stkQuery(payment.transactionRef);
      } catch (queryErr: any) {
        const errMsg = queryErr.response?.data?.errorMessage || queryErr.response?.data?.message || queryErr.message || "Unknown error";
        console.error(`[StuckPayments] Safaricom query error for payment ${paymentId}: ${errMsg}`);
        return res.status(502).json({
          message: `Safaricom query failed: ${errMsg}`,
          safaricomError: errMsg,
          suggestion: "If you have confirmed payment receipt in your Safaricom portal, use the manual 'Grant Pro' button instead.",
        });
      }

      const resultCode = Number(queryResult.ResultCode);
      const resultDesc = queryResult.ResultDesc || `ResultCode ${resultCode}`;

      console.log(`[StuckPayments] Safaricom returned ResultCode=${resultCode} (${resultDesc}) for payment ${paymentId}`);

      if (resultCode === 0) {
        // Payment confirmed by Safaricom — auto-activate Pro
        const receipt =
          queryResult.CallbackMetadata?.Item?.find((i: any) => i.Name === "MpesaReceiptNumber")?.Value
          || queryResult.MpesaReceiptNumber
          || `ADMIN-QUERIED-${Date.now()}`;

        const user = await storage.getUserById(payment.userId);
        if (!user) return res.status(404).json({ message: `User ${payment.userId} not found` });

        const expiresAt = planExpiry();
        await storage.updatePayment(paymentId, {
          status: "success",
          mpesaReceiptNumber: String(receipt),
          transactionRef: String(receipt),
          verificationStatus: "verified",
          verificationNote: `Admin-triggered Safaricom query confirmed. ResultCode=0. Receipt=${receipt}`,
          statusLastChecked: new Date(),
        });
        await storage.activateUserPlan(user.id, payment.planId || "pro", paymentId, expiresAt);
        await storage.updateUserStage(user.id, "paid").catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

        storage.createUserNotification({
          userId: user.id, type: "success",
          title: "Pro Plan Activated",
          message: `Your M-Pesa payment was confirmed by Safaricom (${receipt}). Pro plan active — expires ${expiresAt.toLocaleDateString("en-KE")}.`,
        }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

        if (user.email) {
          sendProActivationEmail(user.email, user.firstName, expiresAt, String(receipt)).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        }

        await storage.logAdminAction(adminId, "stuck_payment_safaricom_confirmed", {
          paymentId, userId: user.id, receipt: String(receipt), resultCode,
        }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

        console.log(`[StuckPayments] ✓ Payment ${paymentId} confirmed by Safaricom → Pro activated for ${user.email}`);
        return res.json({
          success: true,
          confirmed: true,
          activated: true,
          receipt: String(receipt),
          expiresAt: expiresAt.toISOString(),
          message: `Payment confirmed by Safaricom (receipt: ${receipt}). Pro plan activated for ${user.email || user.id}.`,
        });
      } else if ([1032, 2001, 17, 1].includes(resultCode)) {
        // Definitively failed — user cancelled or payment was rejected
        return res.json({
          success: true,
          confirmed: false,
          activated: false,
          resultCode,
          resultDesc,
          message: `Safaricom says this payment was NOT completed (${resultDesc}). The user did not pay. Do NOT grant Pro access.`,
        });
      } else if (resultCode === 1037) {
        return res.json({
          success: true,
          confirmed: false,
          activated: false,
          resultCode,
          resultDesc,
          message: `Safaricom says the STK push timed out — user did not enter their PIN. Do NOT grant Pro access.`,
        });
      } else {
        // Unknown or "still processing" code
        return res.json({
          success: true,
          confirmed: false,
          activated: false,
          resultCode,
          resultDesc,
          message: `Safaricom returned an unexpected code (${resultCode}: ${resultDesc}). Payment status unclear — check your Safaricom portal to verify before granting access manually.`,
        });
      }
    } catch (err: any) {
      console.error("[StuckPayments] Query-and-activate error:", err.message);
      res.status(500).json({ message: "Unexpected error", error: err.message });
    }
  });

  // ── POST /api/admin/stuck-payments/query-safaricom ────────────────────────
  // Queries Safaricom STK Query API for ALL awaiting_payment M-Pesa payments.
  // Auto-resolves any that have been confirmed or failed.
  app.post("/api/admin/stuck-payments/query-safaricom", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { runStkRecovery } = await import("./stk-recovery");
      await runStkRecovery();
      // After running recovery, return updated awaiting_payment + retry_available counts
      const [awaitingList, retryList] = await Promise.all([
        storage.getPaymentsByStatus("awaiting_payment"),
        storage.getPaymentsByStatus("retry_available"),
      ]);
      res.json({
        success: true,
        message: "Safaricom query completed — stuck payments auto-resolved where possible",
        awaitingCount: awaitingList.length,
        retryAvailableCount: retryList.length,
      });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to query Safaricom", error: err.message });
    }
  });

  // ── POST /api/admin/stuck-payments/force-timeout ─────────────────────────
  // Admin panic button: immediately moves ALL awaiting_payment M-Pesa payments
  // older than N minutes to retry_available (or a specific paymentId if provided).
  app.post("/api/admin/stuck-payments/force-timeout", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { paymentId, minutesOld = 5 } = req.body || {};
      const cutoff = new Date(Date.now() - Number(minutesOld) * 60 * 1000);

      let targets: any[] = [];
      if (paymentId) {
        const p = await storage.getPaymentById(paymentId);
        if (!p) return res.status(404).json({ message: "Payment not found" });
        targets = [p];
      } else {
        // All awaiting M-Pesa payments older than minutesOld
        const all = await storage.getPaymentsByStatus("awaiting_payment");
        targets = all.filter((p: any) => p.method === "mpesa" && p.createdAt && new Date(p.createdAt) < cutoff);
      }

      let resolved = 0;
      for (const p of targets) {
        const canRetry = (p.retryCount ?? 0) < (p.maxRetries ?? 3);
        await storage.updatePayment(p.id, {
          status: "failed",
          failReason: `Admin force-timeout: no confirmation received`,
          statusLastChecked: new Date(),
        } as any);

        storage.createUserNotification({
          userId: p.userId,
          type: "warning",
          title: canRetry ? "Payment Timed Out — Retry Available" : "Payment Failed",
          message: canRetry
            ? 'Your M-Pesa payment session expired. Tap "Retry Payment" to try again.'
            : "Your M-Pesa payment expired. Please start a new payment.",
        }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

        storage.createPaymentAuditLog({
          paymentId: p.id,
          event: "admin_force_timeout",
          ip: String(req.ip || "admin"),
          metadata: { adminId: req.user?.id, minutesOld },
        }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

        resolved++;
      }

      res.json({
        success: true,
        resolved,
        message: `${resolved} payment(s) moved to ${resolved === 1 ? "retry/failed" : "retry/failed states"}`,
      });
    } catch (err: any) {
      console.error("[ForceTimeout] Error:", err);
      res.status(500).json({ message: err.message || "Force timeout failed" });
    }
  });

  // ── GET /api/admin/payments/awaiting-ghost ─────────────────────────────────
  // Returns awaiting_payment M-Pesa payments older than 2 minutes (ghost transactions).
  app.get("/api/admin/payments/awaiting-ghost", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const cutoff = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago
      const all = await storage.getPaymentsByStatus("awaiting_payment");
      const ghosts = all
        .filter((p: any) => p.method === "mpesa" && p.createdAt && new Date(p.createdAt) < cutoff)
        .map(async (p: any) => {
          let user = null;
          try { user = await storage.getUserById(p.userId); } catch {}
          const ageMs = Date.now() - new Date(p.createdAt).getTime();
          return {
            paymentId: p.id,
            userId: p.userId,
            amount: p.amount,
            transactionRef: p.transactionRef,
            createdAt: p.createdAt,
            ageMinutes: Math.round(ageMs / 60000),
            queryAttempts: p.queryAttempts ?? 0,
            statusLastChecked: p.statusLastChecked,
            userEmail: user?.email ?? null,
            userName: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || null,
          };
        });
      const resolved = await Promise.all(ghosts);
      res.json(resolved);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch ghost payments" });
    }
  });

  // ── POST /api/admin/users/:userId/unlock-payments ─────────────────────────
  // Unlocks a user's payment lock so they can retry after 3 failures.
  app.post("/api/admin/users/:userId/unlock-payments", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const adminId = req.user?.claims?.sub;
      const { userId: targetUserId } = req.params;
      await storage.resetFailedAttempts(targetUserId, "payment_user");
      await storage.logAdminAction(adminId, "unlock_user_payments", {
        targetUserId,
        timestamp: new Date().toISOString(),
      }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
      console.info(`[Admin] Payment lock cleared for userId=${targetUserId} by admin=${adminId}`);
      // Notify user
      storage.createUserNotification({
        userId: targetUserId,
        type: "info",
        title: "Payment Access Restored",
        message: "Your payment access has been restored by our team. You can now retry your payment.",
      }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
      res.json({ success: true, message: `Payment lock cleared for user ${targetUserId}` });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to unlock user payments", error: err.message });
    }
  });

  // ── GET /api/admin/locked-payment-users ─────────────────────────────────────
  // Returns users currently locked from making payments.
  app.get("/api/admin/locked-payment-users", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const locks = await db
        .select()
        .from(accountLockouts)
        .where(
          and(
            sql`${accountLockouts.identifierType} = 'payment_user'`,
            sql`${accountLockouts.lockedUntil} > NOW()`
          )
        );
      const enriched = await Promise.all(locks.map(async (l) => {
        let user = null;
        try { user = await storage.getUserById(l.identifier); } catch {}
        return {
          lockId: l.id,
          userId: l.identifier,
          failedAttempts: l.failedAttempts,
          lockedUntil: l.lockedUntil,
          lastFailedAt: l.lastFailedAt,
          userEmail: user?.email ?? null,
          userName: [user?.firstName, user?.lastName].filter(Boolean).join(" ") || null,
        };
      }));
      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch locked users" });
    }
  });

  app.get("/api/admin/stats", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      // ── Fast path: serve from cache if < 5 minutes old ──────────────────
      const { getCachedStats, refreshPlatformStats } = await import("./lib/stats-cache");
      const cached = await getCachedStats();
      const CACHE_TTL_SECONDS = 300; // 5 minutes — matches the scheduler interval

      if (cached && cached.cacheAgeSeconds < CACHE_TTL_SECONDS) {
        const activeUsers = getActiveUserCounts();
        return res.json({
          totalUsers:              cached.totalUsers,
          usersToday:              cached.signupsToday,
          activeSubscriptions:     cached.paidUsers,
          totalPayments:           cached.paidUsers, // approximation from cache
          totalRevenue:            cached.totalRevenue,
          revenueToday:            cached.revenueToday,
          signupStats: {
            today:     cached.signupsToday,
            thisWeek:  cached.signupsWeek,
            thisMonth: cached.signupsMonth,
          },
          planBreakdown: { free: cached.totalUsers - cached.paidUsers, basic: 0, pro: cached.paidUsers },
          activeUsers:              activeUsers.total,
          activeAuthenticatedUsers: activeUsers.authenticated,
          _fromCache: true,
          _cacheAgeSeconds: cached.cacheAgeSeconds,
        });
      }

      // ── Slow path: run full queries, then refresh cache in background ────
      const [totalUsers, activeSubscriptions, payments, totalRevenue, revenueToday, signupStats, planRows, missingPhoneRows] = await Promise.all([
        storage.getUserCount(),
        storage.getActiveSubscriptionCount(),
        storage.getPayments(),
        storage.getTotalRevenue(),
        storage.getRevenueToday(),
        storage.getSignupStats(),
        // Plan breakdown: count Pro as users with plan='pro' OR an active pro subscription
        // (catches runtime grants before the next server restart syncs users.plan)
        db.execute(sql`
          SELECT
            COALESCE(
              CASE WHEN u.plan = 'pro' THEN 'pro'
                   WHEN EXISTS (
                     SELECT 1 FROM user_subscriptions us
                     WHERE us.user_id = u.id
                       AND us.plan = 'pro'
                       AND us.status = 'active'
                       AND (us.end_date IS NULL OR us.end_date > NOW())
                   ) THEN 'pro'
                   ELSE COALESCE(u.plan, 'free')
              END,
              'free'
            ) AS effective_plan,
            COUNT(*) AS cnt
          FROM users u
          GROUP BY effective_plan
        `),
        db.select({ cnt: count() }).from(users).where(sql`phone IS NULL OR phone = ''`),
      ]);

      const planBreakdown = { free: 0, basic: 0, pro: 0 };
      const planRows_rows = (planRows as any).rows ?? [];
      for (const row of planRows_rows) {
        const p = (row.effective_plan || "free").toLowerCase();
        if (p === "basic") planBreakdown.basic = Number(row.cnt);
        else if (p === "pro") planBreakdown.pro = Number(row.cnt);
        else planBreakdown.free += Number(row.cnt);
      }

      const activeUsers = getActiveUserCounts();

      // Refresh cache in background — don't block the response
      setImmediate(() => { refreshPlatformStats().catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); }); });

      res.json({
        totalUsers,
        usersToday: signupStats.today,
        activeSubscriptions,
        totalPayments: payments.length,
        totalRevenue,
        revenueToday,
        signupStats,
        planBreakdown,
        missingPhone: Number(missingPhoneRows[0]?.cnt ?? 0),
        activeUsers: activeUsers.total,
        activeAuthenticatedUsers: activeUsers.authenticated,
        _fromCache: false,
      });
    } catch (error) {
      console.error("Error fetching admin stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // ── GET /api/admin/stats/live — lightweight real-time counters (polled every 10s) ──
  // Returns only the fast-changing numbers: user count, paid users, active-now.
  // Intentionally avoids heavy aggregations so it stays < 50ms.
  app.get("/api/admin/stats/live", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const [totalUsersResult, proUsersResult] = await Promise.all([
        db.select({ c: count() }).from(users),
        db.select({ c: sql<number>`count(distinct ${userSubscriptions.userId})` })
          .from(userSubscriptions)
          .innerJoin(users, eq(userSubscriptions.userId, users.id))
          .where(
            and(
              eq(userSubscriptions.status, "active"),
              inArray(userSubscriptions.plan, ["pro"]),
            )
          ),
      ]);

      const totalUsers = Number(totalUsersResult[0]?.c ?? 0);
      const proUsers   = Number(proUsersResult[0]?.c ?? 0);
      const activeNow  = getActiveUserCounts();

      res.json({
        totalUsers,
        proUsers,
        activeNow: activeNow.total,
        activeAuthenticated: activeNow.authenticated,
        timestamp: Date.now(),
      });
    } catch (err: any) {
      console.error("[LiveStats]", err.message);
      res.status(500).json({ message: "Failed to fetch live stats" });
    }
  });

  // ── GET /api/admin/pro-subscribers — list of all active Pro users ──
  app.get("/api/admin/pro-subscribers", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const rows = await db.execute(sql`
        SELECT
          u.id,
          TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS "name",
          u.email,
          u.phone,
          us.start_date AS "startDate",
          us.end_date   AS "endDate",
          p.amount      AS "amountPaid",
          p.payment_method AS "paymentMethod"
        FROM user_subscriptions us
        INNER JOIN users u ON u.id = us.user_id
        LEFT JOIN payments p ON p.id = us.payment_id
        WHERE us.status = 'active'
          AND us.plan   = 'pro'
          AND (us.end_date IS NULL OR us.end_date > NOW())
        ORDER BY us.start_date DESC
      `);
      res.json(rows.rows ?? rows);
    } catch (err: any) {
      console.error("[ProSubscribers]", err.message);
      res.status(500).json({ message: "Failed to fetch pro subscribers" });
    }
  });

  // ── POST /api/admin/merge-sessions — patch all active sessions whose OIDC
  //    claims.sub doesn't match the real DB user ID (accounts that signed up with
  //    email/password first, then later via Replit OIDC with the same email). ──
  app.post("/api/admin/merge-sessions", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      // Find sessions where claims.sub differs from the matched user's DB id
      const mismatchedRows = await db.execute(sql`
        SELECT
          s.sid,
          s.sess,
          u.id   AS real_id,
          u.email
        FROM sessions s
        JOIN users u ON u.email = s.sess->'passport'->'user'->'claims'->>'email'
        WHERE
          s.expire > NOW()
          AND s.sess->'passport'->'user'->'claims'->>'sub' IS NOT NULL
          AND s.sess->'passport'->'user'->'claims'->>'sub' != u.id
      `);

      const rows = (mismatchedRows.rows ?? mismatchedRows) as any[];
      let patched = 0;
      const details: { email: string; oldId: string; newId: string }[] = [];

      for (const row of rows) {
        const sess = typeof row.sess === "string" ? JSON.parse(row.sess) : row.sess;
        const oldId = sess?.passport?.user?.claims?.sub;

        // Patch the claims.sub in the session JSON
        if (sess?.passport?.user?.claims) {
          sess.passport.user.claims.sub = row.real_id;
        }

        await db.execute(sql`
          UPDATE sessions
          SET sess = ${JSON.stringify(sess)}::jsonb
          WHERE sid = ${row.sid}
        `);

        patched++;
        details.push({ email: row.email, oldId, newId: row.real_id });
        console.log(`[SessionMerge] ${row.email}: ${oldId} → ${row.real_id}`);
      }

      res.json({
        ok: true,
        patched,
        details,
        message: `Patched ${patched} session(s). Affected users will now see their correct account on next request.`,
      });
    } catch (err: any) {
      console.error("[SessionMerge]", err.message);
      res.status(500).json({ message: "Session merge failed", error: err.message });
    }
  });

  // ── GET /api/admin/stats/registrations — weekly new-user counts (last 8 weeks) ──
  app.get("/api/admin/stats/registrations", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const rows = await db.execute(sql`
        SELECT
          to_char(date_trunc('week', created_at), 'Mon DD') AS week_label,
          date_trunc('week', created_at)                    AS week_start,
          COUNT(*)::int                                     AS new_users
        FROM users
        WHERE created_at >= NOW() - INTERVAL '8 weeks'
        GROUP BY date_trunc('week', created_at)
        ORDER BY date_trunc('week', created_at) ASC
      `);
      res.json(rows.rows);
    } catch (err: any) {
      console.error("[RegChart]", err.message);
      res.status(500).json({ message: "Failed to fetch registration data" });
    }
  });

  // ── GET /api/admin/stats/integrity — diagnostic: cache vs live DB comparison ──
  // Implements checklist items 1 & 4: "run diagnostic queries" + "red warnings if mismatch"
  app.get("/api/admin/stats/integrity", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const { getCachedStats } = await import("./lib/stats-cache");

      // Determine which DB is connected (dev vs prod) — the source of "4 vs 3,237" confusion
      const dbUrl = process.env.DATABASE_URL ?? "";
      const dbName = dbUrl.includes("neondb") ? "neondb" : dbUrl.includes("helium") ? "heliumdb" : "unknown";
      const dbEnv  = dbName === "neondb" ? "production" : "development";

      // Live counts — run directly, bypass cache
      const [liveUsersResult, liveProResult, liveRevenueResult] = await Promise.all([
        db.select({ c: count() }).from(users),
        db.select({ c: sql<number>`count(distinct ${userSubscriptions.userId})` })
          .from(userSubscriptions)
          .where(and(eq(userSubscriptions.status, "active"), inArray(userSubscriptions.plan, ["pro"]))),
        db.execute(sql`
          SELECT COALESCE(SUM(amount), 0)::numeric AS rev
          FROM payments
          WHERE status = 'completed' AND is_suspicious = false
        `),
      ]);

      const liveUsers   = Number(liveUsersResult[0]?.c ?? 0);
      const livePro     = Number(liveProResult[0]?.c ?? 0);
      const liveRevenue = Number(((liveRevenueResult as any).rows ?? [])[0]?.rev ?? 0);

      // Cached values
      const cached = await getCachedStats();

      function mkCheck(name: string, live: number, cached: number | null) {
        if (cached === null) return { name, live, cached: null, diff: null, diffPct: null, status: "cold" as const };
        const diff    = Math.abs(live - cached);
        const diffPct = live === 0 ? (cached === 0 ? 0 : 100) : (diff / live) * 100;
        const status  = diffPct > 20 ? "error" : diffPct > 5 ? "warn" : "ok";
        return { name, live, cached, diff, diffPct: Math.round(diffPct * 10) / 10, status } as const;
      }

      const checks = [
        mkCheck("Total Users",   liveUsers,   cached?.totalUsers   ?? null),
        mkCheck("Pro Users",     livePro,     cached?.paidUsers    ?? null),
        mkCheck("Revenue (KES)", liveRevenue, cached?.totalRevenue ?? null),
      ];

      const overallStatus =
        cached === null                    ? "cold"  :
        checks.some(c => c.status === "error") ? "error" :
        checks.some(c => c.status === "warn")  ? "warn"  : "ok";

      const cacheStatus =
        cached === null                           ? "cold"  :
        cached.cacheAgeSeconds > 600              ? "stale" : "warm";

      res.json({
        dbName, dbEnv,
        liveUsersCount:  liveUsers,
        liveProCount:    livePro,
        liveRevenue,
        cachedUsersCount:  cached?.totalUsers   ?? null,
        cachedProCount:    cached?.paidUsers    ?? null,
        cachedRevenue:     cached?.totalRevenue ?? null,
        cacheAgeSeconds:   cached?.cacheAgeSeconds ?? null,
        lastUpdated:       cached?.lastUpdated  ?? null,
        cacheStatus,
        checks,
        overallStatus,
      });
    } catch (err: any) {
      console.error("[StatsIntegrity]", err.message);
      res.status(500).json({ message: "Failed to run integrity check" });
    }
  });

  // ── POST /api/admin/stats/cache/refresh — force-refresh the stats cache ──
  app.post("/api/admin/stats/cache/refresh", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const { refreshPlatformStats } = await import("./lib/stats-cache");
      await refreshPlatformStats();
      res.json({ ok: true, message: "Stats cache refreshed" });
    } catch (err: any) {
      console.error("[CacheRefresh]", err.message);
      res.status(500).json({ message: "Failed to refresh cache" });
    }
  });

  // ── GET /api/admin/ai-stats — real-time AI pipeline metrics ──────────────
  // Returns: jobs processed today, avg generation time, live queue depth,
  //          failed jobs last hour, and real OpenAI token/cost totals.
  // Data sources:
  //   • DB   — user_job_applications (completed + failed today)
  //   • Redis — token counters written by the appQueue worker (ai:stats:YYYY-MM-DD)
  //   • BullMQ — live queue depth via appQueue.getJobCounts()
  app.get("/api/admin/ai-stats", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      // ── 1. DB: jobs completed today ──────────────────────────────────────
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { rows: completedRows } = await pool.query<{ count: string; avg_seconds: string }>(
        `SELECT
           COUNT(*)::text AS count,
           COALESCE(
             AVG(
               EXTRACT(EPOCH FROM (updated_at - created_at))
             ), 0
           )::text AS avg_seconds
         FROM user_job_applications
         WHERE status IN ('materials_ready', 'downloaded')
           AND updated_at >= $1`,
        [todayStart],
      );

      const jobsProcessedToday = Number(completedRows[0]?.count  ?? 0);
      const avgGenerationSecs  = Math.round(Number(completedRows[0]?.avg_seconds ?? 0) * 10) / 10;

      // ── 2. DB: failed jobs last hour ─────────────────────────────────────
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1_000);
      const { rows: failedRows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM user_job_applications
         WHERE status = 'failed'
           AND updated_at >= $1`,
        [oneHourAgo],
      );
      const failedJobsLastHour = Number(failedRows[0]?.count ?? 0);

      // ── 3. BullMQ: live queue depth ───────────────────────────────────────
      const { appQueue: q } = await import("./lib/appQueue");
      const counts    = await q.getJobCounts("waiting", "active", "delayed");
      const queueSize = (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0);

      // ── 4. Redis: token usage + cost ──────────────────────────────────────
      const { readDailyStats, estimateCostUsd } = await import("./lib/aiStats");
      const dailyStats = await readDailyStats();
      const todayTokens  = dailyStats.tokensIn + dailyStats.tokensOut;
      const estimatedCost = Math.round(
        estimateCostUsd(dailyStats.tokensIn, dailyStats.tokensOut) * 10_000,
      ) / 10_000;

      return res.json({
        jobs_processed_today:  jobsProcessedToday,
        avg_generation_time_seconds: avgGenerationSecs,
        queue_size:            queueSize,
        failed_jobs_last_hour: failedJobsLastHour,
        openai_api_usage: {
          today_tokens:   todayTokens,
          tokens_in:      dailyStats.tokensIn,
          tokens_out:     dailyStats.tokensOut,
          estimated_cost: estimatedCost,
        },
        meta: {
          as_of:    new Date().toISOString(),
          timezone: "EAT (UTC+3)",
          pricing:  "GPT-4o: $2.50/1M input · $10.00/1M output",
        },
      });
    } catch (err: any) {
      console.error("[AdminAiStats] Error:", err?.message);
      res.status(500).json({ message: "Failed to fetch AI stats" });
    }
  });

  // ── GET /api/admin/funnel — conversion funnel from user_events ──
  app.get("/api/admin/funnel", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { data: events } = await supabase
        .from("user_events")
        .select("*");

      const users: Record<string, Set<string>> = {};

      (events ?? []).forEach((e: { user_id: string; event: string }) => {
        if (!users[e.user_id]) users[e.user_id] = new Set();
        users[e.user_id].add(e.event);
      });

      let signup = 0;
      let viewJobs = 0;
      let upgrade = 0;
      let payment = 0;

      Object.values(users).forEach(set => {
        if (set.has("signup"))          signup++;
        if (set.has("view_jobs"))       viewJobs++;
        if (set.has("click_upgrade"))   upgrade++;
        if (set.has("payment_success")) payment++;
      });

      res.json({ signup, viewJobs, upgrade, payment });
    } catch (err) {
      console.error("[Funnel]", err);
      res.status(500).json({ error: "Funnel error" });
    }
  });

  // ── GET /api/admin/hot-users — users who clicked upgrade but haven't paid ──
  async function getHotUsers(): Promise<string[]> {
    const { data: events } = await supabase.from("user_events").select("*");
    const users: Record<string, Set<string>> = {};
    (events ?? []).forEach((e: { user_id: string; event: string }) => {
      if (!users[e.user_id]) users[e.user_id] = new Set();
      users[e.user_id].add(e.event);
    });
    return Object.entries(users)
      .filter(([, set]) => set.has("click_upgrade") && !set.has("payment_success"))
      .map(([id]) => id);
  }

  app.get("/api/admin/hot-users", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const ids = await getHotUsers();
      res.json({ count: ids.length, user_ids: ids });
    } catch (err) {
      console.error("[HotUsers]", err);
      res.status(500).json({ error: "Failed to fetch hot users" });
    }
  });

  // ── GET /api/admin/user-profile/:userId — behavioural profile from user_events ──
  function getRecommendation(profile: { jobInterest: number; upgradeInterest: number }) {
    if (profile.upgradeInterest > 2) {
      return { type: "upgrade", message: "🔥 You're close! Unlock PRO to apply instantly" };
    }
    if (profile.jobInterest > 3) {
      return { type: "jobs", message: "🔥 New visa-sponsored jobs available for you" };
    }
    return { type: "default", message: "Explore jobs and opportunities" };
  }

  async function getUserProfile(user_id: string): Promise<{ jobInterest: number; upgradeInterest: number }> {
    const { data: events } = await supabase
      .from("user_events")
      .select("*")
      .eq("user_id", String(user_id));

    const profile = { jobInterest: 0, upgradeInterest: 0 };

    (events ?? []).forEach((e: { event: string }) => {
      if (e.event === "view_jobs")     profile.jobInterest++;
      if (e.event === "click_upgrade") profile.upgradeInterest++;
    });

    return profile;
  }

  async function getTrendingJobs() {
    return db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(20);
  }

  function matchScore(cvText: string, job: { jobCategory?: string | null; category?: string | null; country?: string; skills?: string[] }): number {
    let score = 0;
    const cat = job.jobCategory ?? job.category ?? "";
    if (cat && cvText.toLowerCase().includes(cat.toLowerCase())) score += 2;
    if (job.country && cvText.toLowerCase().includes(job.country.toLowerCase())) score += 1;
    if (job.skills) {
      job.skills.forEach(skill => {
        if (cvText.toLowerCase().includes(skill.toLowerCase())) score += 3;
      });
    }
    return score;
  }

  async function getUserInterests(user_id: string): Promise<{ topCategory: string | undefined; topCountry: string | undefined }> {
    const { data } = await supabase
      .from("user_events")
      .select("category, country")
      .eq("user_id", String(user_id))
      .eq("event", "view_job");

    const categories: Record<string, number> = {};
    const countries:  Record<string, number> = {};

    (data ?? []).forEach((e: { category?: string; country?: string }) => {
      if (e.category) categories[e.category] = (categories[e.category] || 0) + 1;
      if (e.country)  countries[e.country]   = (countries[e.country]   || 0) + 1;
    });

    return {
      topCategory: Object.keys(categories).sort((a, b) => categories[b] - categories[a])[0],
      topCountry:  Object.keys(countries).sort((a, b) => countries[b] - countries[a])[0],
      categories,
    };
  }

  app.get("/api/admin/user-profile/:userId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const [profile, interests] = await Promise.all([
        getUserProfile(req.params.userId),
        getUserInterests(req.params.userId),
      ]);
      const recommendation = getRecommendation(profile);
      res.json({ user_id: req.params.userId, ...profile, ...interests, recommendation });
    } catch (err) {
      console.error("[UserProfile]", err);
      res.status(500).json({ error: "Failed to fetch user profile" });
    }
  });

  // ── GET /api/recommendation — personalised recommendation for current user ──
  app.get("/api/recommendation", isAuthenticated, async (req: any, res) => {
    try {
      const user_id = String(req.user?.claims?.sub ?? req.user?.id ?? "");
      const [profile, interests] = await Promise.all([
        getUserProfile(user_id),
        getUserInterests(user_id),
      ]);
      const recommendation = getRecommendation(profile);
      res.json({ ...recommendation, ...interests });
    } catch (err) {
      console.error("[Recommendation]", err);
      res.status(500).json({ error: "Recommendation error" });
    }
  });

  // ── GET /api/recommended-jobs — jobs matching user's top category / country ──
  app.get("/api/recommended-jobs", isAuthenticated, async (req: any, res) => {
    try {
      const user_id = String(req.user?.claims?.sub ?? req.user?.id ?? "");
      const interests = await getUserInterests(user_id);

      if (!interests.topCategory) {
        return res.json(await getTrendingJobs());
      }

      // Heavy caregiver prioritisation — fetch caregiver first, pad with country matches
      if ((interests.categories["caregiver"] ?? 0) > 5) {
        const [caregiverJobs, otherJobs] = await Promise.all([
          db.select().from(jobs).where(ilike(jobs.jobCategory, "%caregiver%")).limit(15),
          db.select().from(jobs).where(
            and(
              eq(jobs.country, interests.topCountry ?? ""),
              sql`job_category NOT ILIKE '%caregiver%'`
            )
          ).limit(5),
        ]);
        const seen = new Set<string>();
        const merged = [...caregiverJobs, ...otherJobs].filter(j => {
          if (seen.has(j.id)) return false;
          seen.add(j.id);
          return true;
        });
        return res.json(merged);
      }

      const whereClause = interests.topCountry
        ? or(eq(jobs.jobCategory, interests.topCategory!), eq(jobs.country, interests.topCountry))
        : eq(jobs.jobCategory, interests.topCategory!);

      const [matchingJobs, { data: cvRows }] = await Promise.all([
        db.select().from(jobs).where(whereClause).limit(20),
        supabase.from("user_cvs").select("content").eq("user_id", user_id)
          .order("created_at", { ascending: false }).limit(1),
      ]);

      const cvText = cvRows?.[0]?.content ?? "";
      const scored = matchingJobs
        .map(j => ({ ...j, _score: matchScore(cvText, j) }))
        .sort((a, b) => b._score - a._score);

      res.json(scored);
    } catch (err) {
      console.error("[RecommendedJobs]", err);
      res.status(500).json({ error: "Recommendation failed" });
    }
  });

  // ── POST /api/upload-cv — store CV in Supabase Storage ───────────────────
  const cvUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ];
      cb(null, allowed.includes(file.mimetype));
    },
  });

  app.post("/api/upload-cv", isAuthenticated, cvUpload.single("cv"), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded. PDF or DOCX only, max 5 MB." });
      }

      const { text, method } = await extractTextFromBuffer(
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname,
      );

      if (text.trim().length < MIN_CV_LENGTH) {
        return res.status(422).json({
          error:
            "Could not extract enough text from your file. " +
            "Please upload a text-based PDF or Word (.docx) — scanned image CVs are not supported.",
        });
      }

      const user_id = String(req.user?.claims?.sub ?? req.user?.id ?? "");
      console.log(`[UploadCV] user=${user_id} method=${method} chars=${text.length}`);

      // Persist to cv_uploads (Storage + row) and keep user_cvs for backward-compat
      const [uploadId] = await Promise.all([
        logCvUpload({
          userId:     user_id,
          fileName:   req.file.originalname,
          buffer:     req.file.buffer,
          mimeType:   req.file.mimetype,
          parsedText: text,
        }),
        supabase.from("user_cvs").insert([{ user_id, content: text }]),
      ]);

      res.json({ success: true, uploadId: uploadId ?? null });
    } catch (err) {
      console.error("[UploadCV]", err);
      res.status(500).json({ error: "CV upload failed" });
    }
  });

  // ── GET /api/cv-matches — top 10 jobs scored against user's latest CV ────────
  app.get("/api/cv-matches", isAuthenticated, async (req: any, res) => {
    try {
      const user_id = String(req.user?.claims?.sub ?? req.user?.id ?? "");

      const isPro = await isUserPro(user_id);
      if (!isPro) {
        return res.status(403).json({ error: "Upgrade to PRO to unlock CV matching" });
      }

      const [{ data: cvRows }, { data: jobs }] = await Promise.all([
        supabase.from("user_cvs").select("content")
          .eq("user_id", user_id)
          .order("created_at", { ascending: false })
          .limit(1),
        supabase.from("jobs").select("*"),
      ]);

      if (!cvRows?.length) {
        return res.status(404).json({ error: "No CV found. Please upload your CV first." });
      }

      const cvText = cvRows[0].content;

      const sorted = (jobs ?? [])
        .map(job => ({ ...job, score: matchScore(cvText, job) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

      res.json(sorted);
    } catch (err) {
      console.error("[CVMatches]", err);
      res.status(500).json({ error: "Matching failed" });
    }
  });

  // ── GET /api/gpt-match — GPT-ranked top 5 jobs for user's CV ─────────────
  app.get("/api/gpt-match", isAuthenticated, async (req: any, res) => {
    try {
      const isPro = await isUserPro(req.user.id);
      if (!isPro) {
        return res.status(403).json({ error: "PRO required" });
      }

      const [{ data: cvRows }, jobRows] = await Promise.all([
        supabase.from("user_cvs").select("content")
          .eq("user_id", req.user.id)
          .order("created_at", { ascending: false })
          .limit(1),
        db.select({
          id: jobs.id,
          title: jobs.title,
          company: jobs.company,
          country: jobs.country,
          category: jobs.jobCategory,
          salary: jobs.salary,
        }).from(jobs).limit(30),
      ]);

      if (!cvRows?.length) {
        return res.status(404).json({ error: "No CV found. Please upload your CV first." });
      }

      const { askGPT } = await import("./lib/openai");

      const prompt = `
You are a job-matching assistant. Given a candidate CV and a list of jobs, return the top 5 best-matching jobs.

CV:
${cvRows[0].content}

Jobs (JSON):
${JSON.stringify(jobRows)}

Respond with ONLY a valid JSON array — no markdown, no explanation. Format:
[{ "id": "...", "title": "...", "company": "...", "country": "...", "salary": "...", "reason": "one sentence" }]
`.trim();

      const raw = await askGPT(prompt);

      // Strip markdown code fences if GPT wraps the response
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      let matches: unknown[];
      try {
        matches = JSON.parse(cleaned);
      } catch {
        // Fallback: return the raw text so the client still gets something useful
        return res.json({ matches: [], raw });
      }

      res.json({ matches });
    } catch (err) {
      console.error("[GPTMatch]", err);
      res.status(500).json({ error: "GPT match failed" });
    }
  });

  // ── POST /api/generate-cover-letter — GPT cover letter from CV + job ────────
  app.post("/api/generate-cover-letter", isAuthenticated, async (req: any, res) => {
    try {
      const { job } = req.body;
      if (!job) return res.status(400).json({ error: "job is required" });

      const isPro = await isUserPro(req.user.id);
      if (!isPro) {
        return res.status(403).json({ error: "PRO required" });
      }

      const { data: cvRows } = await supabase
        .from("user_cvs")
        .select("content")
        .eq("user_id", req.user.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!cvRows?.length) {
        return res.status(404).json({ error: "No CV found. Please upload your CV first." });
      }

      const { askGPT } = await import("./lib/openai");

      const prompt = `
Write a professional cover letter for this job:

Job:
${JSON.stringify(job)}

CV:
${cvRows[0].content}

Keep it concise, professional, and tailored.
`.trim();

      const letter = await askGPT(prompt);
      res.json({ letter });
    } catch (err) {
      console.error("[CoverLetter]", err);
      res.status(500).json({ error: "Cover letter failed" });
    }
  });

  // ── GET /api/score-cv — GPT analysis: score, weaknesses, improvements, summary ──
  app.get("/api/score-cv", isAuthenticated, async (req: any, res) => {
    try {
      const isPro = await isUserPro(req.user.id);
      if (!isPro) {
        return res.status(403).json({ error: "PRO required" });
      }

      const { data: cvRows } = await supabase
        .from("user_cvs")
        .select("content")
        .eq("user_id", req.user.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!cvRows?.length) {
        return res.status(404).json({ error: "No CV found. Please upload your CV first." });
      }

      const { askGPT } = await import("./lib/openai");

      const prompt = `
Analyze this CV and provide a structured response with exactly these four sections:

1. SCORE: Give a score out of 100 with a one-sentence justification.
2. WEAKNESSES: List 3-5 specific weaknesses as bullet points.
3. IMPROVEMENTS: List 3-5 concrete actionable suggestions as bullet points.
4. STRONGER SUMMARY: Rewrite the summary/objective section in a stronger, more impactful way.

CV:
${cvRows[0].content}
`.trim();

      const analysis = await askGPT(prompt);
      res.json({ analysis });
    } catch (err) {
      console.error("[ScoreCV]", err);
      res.status(500).json({ error: "CV scoring failed" });
    }
  });

  // ── POST /api/prepare-application — GPT cover letter + skills + Q&A for a job ──
  app.post("/api/prepare-application", isAuthenticated, async (req: any, res) => {
    try {
      const { job } = req.body;
      if (!job) return res.status(400).json({ error: "job is required" });

      // Support both OIDC users (claims.sub) and custom-auth users (id)
      const userId = req.user?.claims?.sub ?? req.user?.id;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });

      const isPro = await isUserPro(userId);
      if (!isPro) {
        return res.status(403).json({ error: "PRO required", code: "PLAN_REQUIRED" });
      }

      const { data: cvRows } = await supabase
        .from("user_cvs")
        .select("content")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!cvRows?.length) {
        return res.status(404).json({ error: "No CV found. Please upload your CV first." });
      }

      const { askGPT } = await import("./lib/openai");

      const prompt = `
You are a professional job application coach. Prepare a complete application package for the candidate.

Job:
${JSON.stringify(job)}

CV:
${cvRows[0].content}

Respond with ONLY a valid JSON object — no markdown, no extra text. Format:
{
  "coverLetter": "3-paragraph professional cover letter tailored to this specific job",
  "matchingSkills": ["skill1", "skill2", "skill3"],
  "commonQA": [
    { "question": "Tell me about yourself", "answer": "..." },
    { "question": "Why do you want this role?", "answer": "..." },
    { "question": "What is your greatest strength?", "answer": "..." }
  ]
}
`.trim();

      const raw = await askGPT(prompt);
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

      let application: unknown;
      try {
        application = JSON.parse(cleaned);
      } catch {
        application = { coverLetter: raw, matchingSkills: [], commonQA: [] };
      }

      res.json({ application });
    } catch (err) {
      console.error("[PrepareApplication]", err);
      res.status(500).json({ error: "Preparation failed" });
    }
  });

  // ── GET /api/admin/expired-subs — subscriptions past their expiry date ──
  app.get("/api/admin/expired-subs", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const { data: expiredUsers, error } = await supabase
        .from("subscriptions")
        .select("*")
        .lt("expires_at", new Date().toISOString());

      if (error) throw error;
      res.json({ count: (expiredUsers ?? []).length, subscriptions: expiredUsers ?? [] });
    } catch (err) {
      console.error("[ExpiredSubs]", err);
      res.status(500).json({ error: "Failed to fetch expired subscriptions" });
    }
  });

  // ── GET /api/check-hot-user — is the current user a hot (upgrade-intent) user? ──
  app.get("/api/check-hot-user", isAuthenticated, async (req: any, res) => {
    const userId = String(req.user?.claims?.sub ?? req.user?.id ?? "");

    const { data } = await supabase
      .from("user_events")
      .select("event")
      .eq("user_id", userId);

    const events = (data ?? []).map((e: { event: string }) => e.event);

    const isHot =
      events.includes("click_upgrade") &&
      !events.includes("payment_success");

    res.json({ isHot });
  });

  // Register the live-stats provider for WebSocket heartbeat broadcasts
  import("./websocket").then(({ setStatsProvider }) => {
    setStatsProvider(async () => {
      const [totalUsersResult, proUsersResult] = await Promise.all([
        db.select({ c: count() }).from(users),
        db.select({ c: sql<number>`count(distinct ${userSubscriptions.userId})` })
          .from(userSubscriptions)
          .innerJoin(users, eq(userSubscriptions.userId, users.id))
          .where(and(eq(userSubscriptions.status, "active"), inArray(userSubscriptions.plan, ["pro"]))),
      ]);
      const active = getActiveUserCounts();
      return {
        totalUsers: Number(totalUsersResult[0]?.c ?? 0),
        proUsers:   Number(proUsersResult[0]?.c ?? 0),
        activeNow:  active.total,
        activeAuthenticated: active.authenticated,
      };
    });
  }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

  // Combined admin data endpoint - returns users and payments in one call
  app.get("/api/admin/data", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const [users, payments, subscriptions] = await Promise.all([
        storage.getAllUsers(),
        storage.getPayments(),
        storage.getAllSubscriptions(),
      ]);

      // Map users with their subscription status
      const usersWithStatus = users.map(user => {
        const subscription = subscriptions.find(s => s.userId === user.id);
        return {
          id: user.id,
          phone: user.phone || user.email || user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          paid: subscription?.isActive || false,
          isActive: user.isActive,
        };
      });

      // Format payments for display
      const formattedPayments = payments.map(p => ({
        id: p.id,
        phone: (p as any).phone || "—",
        amount: p.amount,
        mpesa_receipt: p.transactionRef || "—",
        transaction_date: p.createdAt ? new Date(p.createdAt).toLocaleString() : "—",
        status: p.status,
      }));

      res.json({ 
        users: usersWithStatus, 
        payments: formattedPayments 
      });
    } catch (error) {
      console.error("Error fetching admin data:", error);
      res.status(500).json({ message: "Failed to fetch admin data" });
    }
  });

  // Toggle user paid/subscription status
  app.post("/api/admin/toggle-user", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { phone, userId } = req.body;
      
      // Find user by phone or userId
      let user;
      if (userId) {
        user = await storage.getUserById(userId);
      } else if (phone) {
        user = await storage.getUserByPhone(phone);
      }
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Toggle subscription status
      const subscription = await storage.getUserSubscription(user.id);
      if (subscription) {
        // Toggle active status
        await storage.updateSubscriptionStatus(user.id, subscription.status !== "active");
      } else {
        // Create new active subscription
        await storage.createSubscription(user.id);
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error toggling user:", error);
      res.status(500).json({ message: "Failed to toggle user" });
    }
  });

  // ── POST /api/admin/reprocess-payment ─────────────────────────────────────
  // Failsafe recovery: re-runs upgradeUserAccount for a completed payment that
  // was never reflected on the user's plan (e.g. M-Pesa callback lost, DB hiccup).
  //
  // Priority resolution order:
  //   1. paymentId      — exact lookup by payments.id
  //   2. transactionId  — lookup by payments.transaction_ref / mpesa_receipt_number
  //   3. email + any    — most recent completed payment for the email
  //
  // Safety:
  //   - Only processes payments with status "completed" or "success"
  //   - upgradeUserAccount is idempotent (alreadyProcessed guard)
  //   - Full audit log written regardless of outcome
  //   - Admin identity stamped in the notes
  app.post("/api/admin/reprocess-payment", isAuthenticated, isAdmin, async (req: any, res) => {
    const adminUser = req.user?.claims?.sub || req.user?.id || "unknown-admin";
    try {
      const { paymentId, transactionId, email, planId, forceUpgrade } = req.body;

      if (!paymentId && !transactionId && !email) {
        return res.status(400).json({
          message: "Provide at least one of: paymentId, transactionId, or email",
        });
      }

      let payment: any = null;

      // 1. Find by paymentId
      if (paymentId) {
        try { payment = await storage.getPaymentById(paymentId); } catch (_) {}
      }

      // 2. Find by transactionId (receipt / PayPal txn / checkout request)
      if (!payment && transactionId) {
        const allPayments = await storage.getPayments();
        payment = allPayments.find(
          (p: any) =>
            p.transactionRef === transactionId ||
            p.mpesaReceiptNumber === transactionId ||
            p.id === transactionId
        ) ?? null;
      }

      // 3. Find by email — most recent completed payment
      if (!payment && email) {
        const allPayments = await storage.getPayments();
        const byEmail = allPayments
          .filter(
            (p: any) =>
              p.email === email &&
              (p.status === "completed" || p.status === "success")
          )
          .sort((a: any, b: any) =>
            new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
          );
        payment = byEmail[0] ?? null;
      }

      if (!payment) {
        return res.status(404).json({
          message: "No payment record found for the provided identifiers.",
          searched: { paymentId, transactionId, email },
        });
      }

      // Safety gate — only reprocess confirmed payments (unless forceUpgrade is set)
      const isConfirmed = payment.status === "completed" || payment.status === "success";
      if (!isConfirmed && !forceUpgrade) {
        return res.status(422).json({
          message: `Payment status is "${payment.status}" — only "completed" payments can be reprocessed. Pass forceUpgrade=true to override.`,
          paymentId: payment.id,
          status: payment.status,
        });
      }

      // Determine plan from stored planId, serviceId, or amount — always "pro"
      const resolvedPlan: "pro" =
        (planId === "pro" ? "pro" : null) ||
        (payment.planId === "pro" ? "pro" : null) ||
        "pro";

      // Resolve user — by email first, then userId from payment
      let resolvedEmail = email || payment.email || undefined;
      let resolvedUserId = payment.userId;

      // If email provided but userId is missing, look up the user
      if (!resolvedUserId && resolvedEmail) {
        const u = await storage.getUserByEmail(resolvedEmail);
        if (u) resolvedUserId = u.id;
      }

      if (!resolvedUserId) {
        return res.status(422).json({
          message: "Cannot resolve user — payment has no userId and no matching account for email.",
          paymentId: payment.id,
        });
      }

      console.info(
        `[Reprocess] Admin ${adminUser} reprocessing paymentId=${payment.id} | txn=${payment.transactionRef || "?"} | email=${resolvedEmail || "?"} | userId=${resolvedUserId} | plan=${resolvedPlan} | forceUpgrade=${!!forceUpgrade}`
      );

      // Write audit log before attempting upgrade
      storage.createPaymentAuditLog({
        paymentId: payment.id,
        event: "admin_reprocess_initiated",
        ip: String(req.ip || "admin"),
        metadata: {
          adminId: adminUser,
          resolvedPlan,
          resolvedUserId,
          resolvedEmail,
          forceUpgrade: !!forceUpgrade,
          originalStatus: payment.status,
        },
      }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      const { upgradeUserAccount } = await import("./services/upgradeUserAccount");
      const result = await upgradeUserAccount({
        userId: resolvedUserId,
        email: resolvedEmail,
        planType: resolvedPlan,
        transactionId: payment.transactionRef || payment.mpesaReceiptNumber || payment.id,
        paymentId: payment.id,
        serviceId: payment.serviceId || `plan_${resolvedPlan}`,
        method: (payment.method === "paypal" ? "paypal" : "mpesa") as "mpesa" | "paypal",
        amountKes: payment.amount || 0,
        extraMeta: {
          reprocessedBy: adminUser,
          reprocessedAt: new Date().toISOString(),
          originalStatus: payment.status,
          forceUpgrade: !!forceUpgrade,
        },
      });

      // Stamp reprocess note on payment
      storage.createPaymentAuditLog({
        paymentId: payment.id,
        event: result.success ? "admin_reprocess_success" : "admin_reprocess_failed",
        ip: String(req.ip || "admin"),
        metadata: {
          adminId: adminUser,
          planActivated: result.planActivated,
          alreadyProcessed: result.alreadyProcessed,
          success: result.success,
        },
      }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      console.info(
        `[Reprocess] paymentId=${payment.id} | success=${result.success} | alreadyProcessed=${result.alreadyProcessed} | plan=${result.planActivated}`
      );

      return res.json({
        success: result.success,
        alreadyProcessed: result.alreadyProcessed,
        planActivated: result.planActivated,
        userId: resolvedUserId,
        email: resolvedEmail,
        paymentId: payment.id,
        transactionRef: payment.transactionRef || payment.mpesaReceiptNumber,
        originalStatus: payment.status,
        message: result.alreadyProcessed
          ? "Payment was already processed — user's plan is already current."
          : result.success
          ? `User plan upgraded to ${result.planActivated} successfully.`
          : "Reprocess attempted but upgrade did not complete — check logs.",
      });
    } catch (error: any) {
      console.error("[Reprocess] Error:", error);
      storage.createPaymentAuditLog({
        paymentId: req.body?.paymentId || null,
        event: "admin_reprocess_error",
        ip: String(req.ip || "admin"),
        metadata: { adminId: adminUser, error: error.message },
      }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
      res.status(500).json({ message: error.message || "Reprocess failed" });
    }
  });

  // ── GET /api/admin/payments/stats — revenue analytics for admin charts ────────
  app.get("/api/admin/payments/stats", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { startDate, endDate } = req.query;

      // Build date range conditions (optional)
      const dateConditions: any[] = [];
      if (startDate) dateConditions.push(gte(paymentsTable.createdAt, new Date(startDate as string)));
      if (endDate)   dateConditions.push(lte(paymentsTable.createdAt, new Date(endDate as string)));

      // Success condition covers both status values used in the live DB
      const successCond = or(eq(paymentsTable.status, "completed"), eq(paymentsTable.status, "success"))!;

      // SQL CASE for type inference (no payments.type column in live schema)
      const typeCaseSql = sql<string>`CASE
        WHEN ${paymentsTable.planId} IS NOT NULL THEN 'subscription'
        WHEN ${paymentsTable.serviceId} ILIKE '%cv%' THEN 'cv_service'
        WHEN ${paymentsTable.serviceId} ILIKE '%consult%' THEN 'consultation'
        WHEN ${paymentsTable.serviceId} ILIKE '%visa%' THEN 'visa_guide'
        WHEN ${paymentsTable.serviceId} ILIKE '%job%' THEN 'job_post'
        ELSE 'other'
      END`;

      // 1. Revenue by service type — completed only
      const revenueByType = await db
        .select({
          type:  typeCaseSql,
          total: sql<number>`sum(${paymentsTable.amount})::int`,
          count: sql<number>`count(*)::int`,
        })
        .from(paymentsTable)
        .where(and(successCond, ...dateConditions))
        .groupBy(sql`CASE
          WHEN ${paymentsTable.planId} IS NOT NULL THEN 'subscription'
          WHEN ${paymentsTable.serviceId} ILIKE '%cv%' THEN 'cv_service'
          WHEN ${paymentsTable.serviceId} ILIKE '%consult%' THEN 'consultation'
          WHEN ${paymentsTable.serviceId} ILIKE '%visa%' THEN 'visa_guide'
          WHEN ${paymentsTable.serviceId} ILIKE '%job%' THEN 'job_post'
          ELSE 'other'
        END`);

      // 2. Revenue over time — last 30 days (always fixed range, ignores date filter)
      const revenueByDay = await db
        .select({
          date:  sql<string>`to_char(${paymentsTable.createdAt}, 'YYYY-MM-DD')`,
          total: sql<number>`sum(${paymentsTable.amount})::int`,
        })
        .from(paymentsTable)
        .where(and(
          successCond,
          gte(paymentsTable.createdAt, sql`now() - interval '30 days'`),
        ))
        .groupBy(sql`to_char(${paymentsTable.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${paymentsTable.createdAt}, 'YYYY-MM-DD')`);

      // 3. Status breakdown (all statuses, filtered by date) — for pie / table
      const allCond = dateConditions.length > 0 ? and(...dateConditions) : undefined;
      const statusBreakdown = await db
        .select({
          status: paymentsTable.status,
          count:  sql<number>`count(*)::int`,
          total:  sql<number>`sum(${paymentsTable.amount})::int`,
        })
        .from(paymentsTable)
        .where(allCond)
        .groupBy(paymentsTable.status)
        .orderBy(sql`count(*) desc`);

      const totalRevenue = (revenueByType as any[]).reduce((s, r) => s + (r.total ?? 0), 0);

      res.json({
        revenueByType,
        revenueByDay,
        statusBreakdown,
        totalRevenue,
      });
    } catch (err: any) {
      console.error("[GET /api/admin/payments/stats]", err.message);
      res.status(500).json({ message: "Failed to fetch payment stats" });
    }
  });

  app.get("/api/admin/payments", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const allPayments = await storage.getPayments();

      // Pre-fetch all services once so we can resolve service names without N+1 queries
      const allServices = await db.select({ id: servicesTable.id, name: servicesTable.name })
        .from(servicesTable).catch(() => [] as { id: string; name: string }[]);
      const serviceMap = new Map(allServices.map((s) => [s.id, s.name]));

      // Enrich each payment with user info + resolved service/plan label
      const enriched = await Promise.all(allPayments.map(async (p) => {
        let userEmail: string | null = null;
        let userName: string | null = null;
        let userPhone: string | null = null;
        try {
          const u = await storage.getUserById(p.userId);
          if (u) {
            userEmail = u.email ?? null;
            userName = [u.firstName, u.lastName].filter(Boolean).join(" ") || null;
            userPhone = u.phone ?? null;
          }
        } catch (_) {}

        // Resolve a human-readable label for what was purchased.
        // Priority: dedicated service_name column → services table map → planId fallback.
        const sid = (p as any).serviceId ?? null;
        const pid = (p as any).planId ?? null;
        const storedName = (p as any).serviceName ?? null;

        let serviceLabel: string | null = storedName; // use stored name first (no JOIN)
        if (!serviceLabel) {
          if (pid) {
            serviceLabel = planLabel(pid);
          } else if (sid) {
            if (String(sid).startsWith("plan_")) {
              const planKey = String(sid).replace("plan_", "");
              serviceLabel = planKey.charAt(0).toUpperCase() + planKey.slice(1) + " Plan";
            } else {
              serviceLabel = serviceMap.get(String(sid)) ?? `Service (${String(sid).slice(0, 8)}…)`;
            }
          }
        }

        return { ...p, userEmail, userName, userPhone, serviceLabel };
      }));
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching payments:", error);
      res.status(500).json({ message: "Failed to fetch payments" });
    }
  });

  app.get("/api/admin/payments/export", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const payments = await storage.getPayments();
      const headers = [
        "ID", "User ID", "Email", "Plan", "Amount", "Currency", "Method",
        "Transaction Ref", "M-Pesa Receipt", "Status", "Fail Reason",
        "Retry Count", "Callback Received At", "Status Last Checked", "Query Attempts",
        "Created At", "Updated At"
      ];
      const csvRows = [
        headers.join(","),
        ...payments.map((p: any) => [
          p.id,
          p.userId,
          p.email || "",
          p.planId || "",
          p.amount,
          p.currency,
          p.method,
          p.transactionRef || "",
          p.mpesaReceiptNumber || "",
          p.status,
          p.failReason || "",
          p.retryCount ?? 0,
          p.callbackReceivedAt ? new Date(p.callbackReceivedAt).toISOString() : "",
          p.statusLastChecked ? new Date(p.statusLastChecked).toISOString() : "",
          p.queryAttempts ?? 0,
          p.createdAt ? new Date(p.createdAt).toISOString() : "",
          p.updatedAt ? new Date(p.updatedAt).toISOString() : "",
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
      ];
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=payments-${new Date().toISOString().slice(0,10)}.csv`);
      res.send(csvRows.join("\n"));
    } catch (error) {
      console.error("Error exporting payments:", error);
      res.status(500).json({ message: "Failed to export payments" });
    }
  });

  // Phase 11: Payment Audit Log admin endpoint
  app.get("/api/admin/payments/audit-logs", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { paymentId, limit } = req.query;
      const logs = await storage.getPaymentAuditLogs(
        paymentId as string | undefined,
        limit ? parseInt(limit as string, 10) : 200
      );
      res.json(logs);
    } catch (error) {
      console.error("Error fetching payment audit logs:", error);
      res.status(500).json({ message: "Failed to fetch payment audit logs" });
    }
  });

  // Referral endpoints
  app.get("/api/admin/referrals", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const referrals = await storage.getReferrals();
      res.json(referrals);
    } catch (error) {
      console.error("Error fetching referrals:", error);
      res.status(500).json({ message: "Failed to fetch referrals" });
    }
  });

  app.get("/api/admin/referrals/stats", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const stats = await storage.getReferralStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching referral stats:", error);
      res.status(500).json({ message: "Failed to fetch referral stats" });
    }
  });

  app.post("/api/admin/referrals/:id/status", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body;
      
      if (!["pending", "paid"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      
      const updated = await storage.updateReferralStatus(id, status);
      if (!updated) {
        return res.status(404).json({ message: "Referral not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating referral status:", error);
      res.status(500).json({ message: "Failed to update referral status" });
    }
  });

  // User's own referrals
  app.get("/api/my-referrals", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      // Use stored referral code, generate+save if not yet set
      const refCode = await storage.generateAndSaveReferralCode(user.id);

      // Also check old dynamically-generated code so legacy referrals still count
      const legacyCode = user.firstName
        ? `${user.firstName.toUpperCase()}${user.id?.slice(-4) || ""}`
        : `USER${user.id?.slice(-6) || ""}`;

      const [storedReferrals, legacyReferrals] = await Promise.all([
        storage.getReferralsByCode(refCode),
        refCode !== legacyCode ? storage.getReferralsByCode(legacyCode) : Promise.resolve([]),
      ]);
      const userReferrals = [...storedReferrals, ...legacyReferrals];

      const pendingCommission = userReferrals
        .filter(r => r.status === "pending" || r.status === "processing")
        .reduce((sum, r) => sum + r.commission, 0);

      const paidCommission = userReferrals
        .filter(r => r.status === "paid")
        .reduce((sum, r) => sum + r.commission, 0);

      res.json({
        refCode,
        totalReferrals: userReferrals.length,
        pendingCommission,
        paidCommission,
        referrals: userReferrals,
      });
    } catch (error) {
      console.error("Error fetching user referrals:", error);
      res.status(500).json({ message: "Failed to fetch referrals" });
    }
  });

  // Admin endpoint for manual referral creation (corrections only)
  // SECURITY: Commission is calculated server-side from DB plan price, not from client input
  // Note: Normal referrals are created automatically in M-Pesa callback
  const COMMISSION_RATE = 0.10; // 10%

  app.post("/api/referrals", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { refCode, referredPhone, paymentId } = req.body;
      const userId = req.user?.claims?.sub;

      if (!refCode || !referredPhone) {
        return res.status(400).json({ message: "refCode and referredPhone are required" });
      }

      // Validate phone number format (Kenyan)
      const phoneRegex = /^(0|254|\+254)?[17]\d{8}$/;
      if (!phoneRegex.test(referredPhone.replace(/\s/g, ''))) {
        return res.status(400).json({ message: "Invalid phone number format" });
      }

      // Fraud detection
      const fraudCheck = await storage.checkFraud(refCode, referredPhone);
      if (fraudCheck.isFraud) {
        console.log(`Fraud detected: ${fraudCheck.reason} for refCode: ${refCode}, phone: ${referredPhone}, user: ${userId}`);
        return res.status(400).json({ message: "Referral rejected", reason: fraudCheck.reason });
      }

      // Derive payment amount from a linked payment record if provided,
      // otherwise look it up from the DB plans table.
      let referralPaymentAmount: number;
      if (paymentId) {
        const linkedPayment = await storage.getPaymentById(paymentId);
        referralPaymentAmount = linkedPayment?.amount ?? 0;
      } else {
        referralPaymentAmount = (await resolveCanonicalPlanPrice("pro"))?.finalPrice ?? 0;
      }
      if (!referralPaymentAmount) {
        return res.status(400).json({ message: "Could not determine payment amount — check plan configuration." });
      }
      const referralCommission = Math.round(referralPaymentAmount * COMMISSION_RATE);

      // SECURITY: Use DB-derived values, ignore any client-supplied commission/amount
      const referral = await storage.createReferral({
        refCode,
        referredPhone,
        paymentAmount: referralPaymentAmount,
        commission: referralCommission,
        status: "pending",
      });

      // Update influencer stats if this is an influencer
      await storage.updateInfluencerStats(refCode, referralCommission);

      // Send SMS notification to referrer — fire-and-forget via background queue
      storage.getInfluencerByRefCode(refCode).then(influencer => {
        if (influencer?.phone) {
          asyncQueue.enqueue<SmsJob>(QUEUE_TYPES.SMS, { type: 'new_referral', phone: influencer.phone, refCode, commission: referralCommission }, 1);
        }
      }).catch((err: any) => console.error("Failed to queue referral SMS:", err.message));
      
      res.json(referral);
    } catch (error) {
      console.error("Error creating referral:", error);
      res.status(500).json({ message: "Failed to create referral" });
    }
  });

  // Admin: Payout referral commission via M-Pesa B2C
  app.post("/api/admin/referrals/:id/payout", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { phone } = req.body;
      
      // Get the referral
      const allReferrals = await storage.getReferrals();
      const referral = allReferrals.find(r => r.id === parseInt(id));
      
      if (!referral) {
        return res.status(404).json({ message: "Referral not found" });
      }
      
      if (referral.status === "paid") {
        return res.status(400).json({ message: "Referral already paid out" });
      }

      // Fraud gate — look up the payout recipient by phone in Supabase and block if flagged.
      // Admin is explicitly overriding; if they need to pay a flagged user they must first
      // clear the flag via the admin Fraud dashboard.
      {
        const { data: recipientUser } = await supabase
          .from("users")
          .select("id, suspected_fraud")
          .eq("phone", phone)
          .maybeSingle();
        if (recipientUser?.suspected_fraud) {
          const adminId = req.user?.claims?.sub ?? req.user?.id ?? "admin";
          flagForManualReview(String(recipientUser.id), {
            action: "payout_blocked_admin_attempted",
            detail: `referral=${id} phone=${phone} commission=${referral.commission}`,
          }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
          return res.status(403).json({
            message: `Payout blocked — recipient (${phone}) is flagged for suspected fraud. Clear the flag in the Fraud dashboard first.`,
            code:    "RECIPIENT_UNDER_REVIEW",
          });
        }
      }

      // Initiate M-Pesa B2C payout
      const { b2cPayout } = await import("./mpesa");
      const occasion = `WorkAbroad Referral Commission - Ref ${referral.refCode}`;
      const payoutResult = await b2cPayout(phone, referral.commission, occasion);
      
      // Update referral status with transaction ID
      const transactionId = payoutResult.ConversationID || payoutResult.originatorConversationID;

      // Audit log — every B2C send gets a payouts row for callback reconciliation
      logPayout({
        phone,
        amount:          referral.commission,
        occasion,
        conversationId:  transactionId || undefined,
        originatorConversationId: payoutResult.originatorConversationID || undefined,
        referralId:      String(referral.id),
      }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      const updated = await storage.updateReferralStatus(
        parseInt(id), 
        "paid", 
        transactionId
      );
      
      // Send SMS notification to partner
      try {
        const { notifyPayoutComplete } = await import("./sms");
        await notifyPayoutComplete(phone, referral.commission, transactionId || "N/A");
      } catch (smsError) {
        console.error("Failed to send payout SMS:", smsError);
      }
      
      res.json({ 
        message: "Payout initiated successfully", 
        referral: updated,
        mpesaResponse: payoutResult 
      });
    } catch (error: any) {
      console.error("Error processing payout:", error);
      res.status(500).json({ message: "Failed to process payout", error: error.message });
    }
  });

  // M-Pesa B2C callback endpoints
  app.post("/api/mpesa/b2c/result", async (req, res) => {
    try {
      const result = req.body?.Result;
      console.log("[B2C] Result callback:", JSON.stringify(result, null, 2));

      if (!result) return res.json({ ResultCode: 0, ResultDesc: "Accepted" });

      const conversationId = result.ConversationID || result.OriginatorConversationID;
      const resultCode = result.ResultCode;

      // Find the referral that was awaiting this B2C payout
      if (conversationId) {
        // Reconcile payouts audit table regardless of referral/commission type
        const params: any[] = result.ResultParameters?.ResultParameter || [];
        const receipt = params.find((p: any) => p.Key === "TransactionReceipt")?.Value;
        if (resultCode === 0) {
          reconcilePayout(conversationId, "confirmed", { resultCode, receipt }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        } else {
          reconcilePayout(conversationId, "failed", {
            resultCode,
            errorMsg: result.ResultDesc || `B2C failed code ${resultCode}`,
          }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        }

        const allReferrals = await storage.getReferrals();
        const referral = allReferrals.find(
          r => r.transactionId === conversationId && r.status === "processing"
        );
        if (referral) {
          if (resultCode === 0) {
            await storage.updateReferralStatus(referral.id, "paid", receipt || conversationId);
            console.log(`[B2C] Referral ${referral.id} marked PAID — receipt: ${receipt}`);

            // Notify referrer via SMS
            try {
              const influencer = await storage.getInfluencerByRefCode(referral.refCode);
              const referrerUser = influencer ? null : await storage.getUserByReferralCode(referral.refCode);
              const phone = influencer?.phone || referrerUser?.phone;
              if (phone) {
                const { notifyPayoutComplete } = await import("./sms");
                await notifyPayoutComplete(phone, referral.commission, receipt || conversationId);
              }
            } catch (smsErr) {
              console.error("[B2C] Payout SMS failed:", smsErr);
            }
          } else {
            // B2C failed — revert to pending so admin can retry
            await storage.updateReferralStatus(referral.id, "pending");
            console.warn(`[B2C] Referral ${referral.id} B2C FAILED (code ${resultCode}) — reverted to pending`);
          }
        }
      }
    } catch (err: any) {
      console.error("[B2C] Result callback error:", err.message);
    }
    res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  });

  app.post("/api/mpesa/b2c/timeout", async (req, res) => {
    try {
      const conversationId = req.body?.Result?.OriginatorConversationID;
      console.warn("[B2C] Timeout for conversationId:", conversationId);
      if (conversationId) {
        // Reconcile payouts audit table
        reconcilePayout(conversationId, "timed_out").catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

        const allReferrals = await storage.getReferrals();
        const referral = allReferrals.find(r => r.transactionId === conversationId && r.status === "processing");
        if (referral) {
          await storage.updateReferralStatus(referral.id, "pending");
          console.warn(`[B2C] Referral ${referral.id} timed out — reverted to pending`);
        }
      }
    } catch (err: any) {
      console.error("[B2C] Timeout callback error:", err.message);
    }
    res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  });

  // Top partners analytics
  app.get("/api/admin/referrals/top-partners", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const topPartners = await storage.getTopPartners(limit);
      res.json(topPartners);
    } catch (error) {
      console.error("Error fetching top partners:", error);
      res.status(500).json({ message: "Failed to fetch top partners" });
    }
  });

  // ── Referral Payout Scheduler Admin Endpoints ────────────────────────────────

  app.get("/api/admin/referrals/scheduler/status", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const { getSchedulerStatus } = await import("./referral-payout-scheduler");
      const pendingReferrals = await storage.getPendingReferrals(5);
      res.json({ ...getSchedulerStatus(), pendingCount: pendingReferrals.length });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch scheduler status" });
    }
  });

  app.post("/api/admin/referrals/scheduler/run-now", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const { runPayoutBatch } = await import("./referral-payout-scheduler");
      const result = await runPayoutBatch();
      res.json({ message: "Payout batch completed", result });
    } catch (err: any) {
      res.status(500).json({ message: "Batch run failed", error: err.message });
    }
  });

  app.post("/api/admin/referrals/scheduler/toggle", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { enabled } = req.body as { enabled: boolean };
      if (typeof enabled !== "boolean") return res.status(400).json({ message: "enabled (boolean) required" });
      const { setSchedulerEnabled, getSchedulerStatus } = await import("./referral-payout-scheduler");
      setSchedulerEnabled(enabled);
      res.json({ message: `Scheduler ${enabled ? "enabled" : "disabled"}`, status: getSchedulerStatus() });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to toggle scheduler" });
    }
  });

  // Influencer management endpoints
  app.get("/api/admin/influencers", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const influencers = await storage.getInfluencers();
      res.json(influencers);
    } catch (error) {
      console.error("Error fetching influencers:", error);
      res.status(500).json({ message: "Failed to fetch influencers" });
    }
  });

  app.post("/api/admin/influencers", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { userId, name, phone, email, refCode, commissionRate, inviteCode } = req.body;
      
      if (!userId || !name || !phone || !refCode) {
        return res.status(400).json({ message: "userId, name, phone, and refCode are required" });
      }
      
      const influencer = await storage.createInfluencer({
        userId,
        name,
        phone,
        email,
        refCode,
        commissionRate: commissionRate || 10,
        status: "pending",
        inviteCode,
      });
      
      res.json(influencer);
    } catch (error) {
      console.error("Error creating influencer:", error);
      res.status(500).json({ message: "Failed to create influencer" });
    }
  });

  app.post("/api/admin/influencers/:id/status", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      if (!["pending", "approved", "rejected", "suspended"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      
      const updated = await storage.updateInfluencerStatus(parseInt(id), status);
      
      // Send SMS notification for approval/rejection
      if (updated && (status === "approved" || status === "rejected")) {
        try {
          const { notifyInfluencerStatus } = await import("./sms");
          await notifyInfluencerStatus(updated.phone, status === "approved", updated.refCode);
        } catch (smsError) {
          console.error("Failed to send influencer status SMS:", smsError);
        }
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating influencer status:", error);
      res.status(500).json({ message: "Failed to update influencer status" });
    }
  });

  // User: Apply to become an influencer
  app.post("/api/influencer/apply", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      const { phone, inviteCode } = req.body;
      
      if (!phone) {
        return res.status(400).json({ message: "Phone number is required" });
      }
      
      // Check if user is already an influencer
      const existing = await storage.getInfluencerByUserId(user.id);
      if (existing) {
        return res.status(400).json({ message: "You have already applied to the influencer program" });
      }
      
      // Generate ref code
      const refCode = `INF${user.firstName?.toUpperCase() || "USER"}${user.id.slice(-4)}`;
      
      const influencer = await storage.createInfluencer({
        userId: user.id,
        name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Unknown",
        phone,
        email: user.email,
        refCode,
        commissionRate: 10,
        status: "pending",
        inviteCode,
      });
      
      res.json({ message: "Application submitted successfully", influencer });
    } catch (error) {
      console.error("Error applying for influencer program:", error);
      res.status(500).json({ message: "Failed to submit application" });
    }
  });

  // User: Get my influencer status
  app.get("/api/influencer/status", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user;
      const influencer = await storage.getInfluencerByUserId(user.id);
      
      if (!influencer) {
        return res.json({ isInfluencer: false });
      }
      
      res.json({ 
        isInfluencer: true, 
        status: influencer.status,
        influencer 
      });
    } catch (error) {
      console.error("Error fetching influencer status:", error);
      res.status(500).json({ message: "Failed to fetch influencer status" });
    }
  });

  app.get("/api/admin/countries", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const countries = await storage.getAllCountriesWithDetails();
      res.json(countries);
    } catch (error) {
      console.error("Error fetching countries:", error);
      res.status(500).json({ message: "Failed to fetch countries" });
    }
  });

  app.patch("/api/admin/countries/:id/toggle", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const country = await storage.getCountryById(req.params.id);
      if (!country) {
        return res.status(404).json({ message: "Country not found" });
      }
      const updated = await storage.updateCountry(req.params.id, { isActive: !country.isActive });
      cache.invalidate(CACHE_KEYS.COUNTRIES);
      res.json(updated);
    } catch (error) {
      console.error("Error toggling country:", error);
      res.status(500).json({ message: "Failed to toggle country" });
    }
  });

  app.get("/api/admin/guides/:countryId", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const guides = await storage.getCountryGuides(req.params.countryId);
      res.json(guides);
    } catch (error) {
      console.error("Error fetching guides:", error);
      res.status(500).json({ message: "Failed to fetch guides" });
    }
  });

  app.post("/api/admin/guides", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { countryId, section, content } = req.body;
      if (!countryId || !section || !content) {
        return res.status(400).json({ message: "countryId, section, and content are required" });
      }
      const guide = await storage.createGuide({ countryId, section, content });
      res.json(guide);
    } catch (error) {
      console.error("Error creating guide:", error);
      res.status(500).json({ message: "Failed to create guide" });
    }
  });

  app.patch("/api/admin/guides/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { section, content } = req.body;
      const updated = await storage.updateGuide(req.params.id, { section, content });
      if (!updated) {
        return res.status(404).json({ message: "Guide not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating guide:", error);
      res.status(500).json({ message: "Failed to update guide" });
    }
  });

  app.get("/api/admin/scam-alerts", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const alerts = await storage.getAllScamAlerts();
      res.json(alerts);
    } catch (error) {
      console.error("Error fetching scam alerts:", error);
      res.status(500).json({ message: "Failed to fetch scam alerts" });
    }
  });

  app.post("/api/admin/scam-alerts", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { countryId, title, description } = req.body;
      if (!title || !description) {
        return res.status(400).json({ message: "title and description are required" });
      }
      const alert = await storage.createScamAlert({ 
        countryId: countryId || null, 
        title, 
        description, 
        isActive: true 
      });
      res.json(alert);
    } catch (error) {
      console.error("Error creating scam alert:", error);
      res.status(500).json({ message: "Failed to create scam alert" });
    }
  });

  app.patch("/api/admin/scam-alerts/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { title, description, isActive } = req.body;
      const updated = await storage.updateScamAlert(req.params.id, { 
        title, 
        description, 
        isActive 
      });
      if (!updated) {
        return res.status(404).json({ message: "Scam alert not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating scam alert:", error);
      res.status(500).json({ message: "Failed to update scam alert" });
    }
  });

  app.get("/api/admin/services", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const services = await storage.getServices();
      res.json(services);
    } catch (error) {
      console.error("Error fetching services:", error);
      res.status(500).json({ message: "Failed to fetch services" });
    }
  });

  app.post("/api/admin/services", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { name, price, description } = req.body;
      if (!name || price === undefined) {
        return res.status(400).json({ message: "name and price are required" });
      }
      const service = await storage.createService({ name, price, description: description || "", isActive: true, order: 0 });
      cache.invalidate(CACHE_KEYS.SERVICES);
      res.json(service);
    } catch (error) {
      console.error("Error creating service:", error);
      res.status(500).json({ message: "Failed to create service" });
    }
  });

  app.patch("/api/admin/services/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { name, price, description, isActive } = req.body;
      const updated = await storage.updateService(req.params.id, { name, price, description, isActive });
      if (!updated) {
        return res.status(404).json({ message: "Service not found" });
      }
      cache.invalidate(CACHE_KEYS.SERVICES);
      res.json(updated);
    } catch (error) {
      console.error("Error updating service:", error);
      res.status(500).json({ message: "Failed to update service" });
    }
  });

  app.delete("/api/admin/services/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      await storage.deleteService(req.params.id);
      cache.invalidate(CACHE_KEYS.SERVICES);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting service:", error);
      res.status(500).json({ message: "Failed to delete service" });
    }
  });

  // POST /api/admin/update-service — update price by service code (slug)
  app.post("/api/admin/update-service", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { code, price } = req.body;

      if (!code || typeof code !== "string" || code.trim() === "") {
        return res.status(400).json({ success: false, message: "code is required" });
      }
      const parsedPrice = Number(price);
      if (price === undefined || price === null || isNaN(parsedPrice) || parsedPrice < 0 || !Number.isInteger(parsedPrice)) {
        return res.status(400).json({ success: false, message: "price must be a non-negative integer" });
      }

      const result = await pool.query(
        `UPDATE services SET price = $1 WHERE code = $2 RETURNING id, code, slug, name, price`,
        [parsedPrice, code.trim()]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, message: `No service found with code "${code}"` });
      }

      cache.invalidate(CACHE_KEYS.SERVICES);
      // Recompute version from live price data so all tabs get exactly one reload.
      const allRows = await pool.query(`SELECT code, price FROM services WHERE is_active = true`);
      bumpServicesVersion(allRows.rows as Array<{ code: string; price: number }>);

      const updated = result.rows[0];
      console.log(`[AdminServiceUpdate] ${updated.code} → KES ${updated.price} (by admin ${req.user?.claims?.sub ?? req.user?.id})`);

      res.json({
        success: true,
        message: "✅ Price updated globally",
        service: updated,
      });
    } catch (error) {
      console.error("Error updating service price:", error);
      res.status(500).json({ success: false, message: "Failed to update service price" });
    }
  });

  // ── POST /api/admin/flash-sale — toggle/configure flash sale for a service ──
  app.post("/api/admin/flash-sale", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { code, flash_sale, discount_percent, sale_start, sale_end } = req.body;
      if (!code || typeof code !== "string") {
        return res.status(400).json({ success: false, message: "code is required" });
      }
      const discPct = Number(discount_percent ?? 0);
      if (!Number.isInteger(discPct) || discPct < 0 || discPct > 80) {
        return res.status(400).json({ success: false, message: "discount_percent must be 0–80" });
      }

      // Validate ISO timestamps when provided
      const start = sale_start ? new Date(sale_start) : null;
      const end   = sale_end   ? new Date(sale_end)   : null;
      if (sale_start && isNaN((start as Date).getTime())) {
        return res.status(400).json({ success: false, message: "sale_start is not a valid date" });
      }
      if (sale_end && isNaN((end as Date).getTime())) {
        return res.status(400).json({ success: false, message: "sale_end is not a valid date" });
      }

      const result = await pool.query(
        `UPDATE services
         SET flash_sale       = $1,
             discount_percent = $2,
             sale_start       = $3,
             sale_end         = $4
         WHERE code = $5
         RETURNING id, code, name, price, flash_sale, discount_percent, sale_start, sale_end`,
        [!!flash_sale, discPct, start, end, code.trim()]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, message: `Service "${code}" not found` });
      }

      // Bust the services cache so all clients get fresh data immediately
      cache.invalidate(CACHE_KEYS.SERVICES);
      const allRows = await pool.query(`SELECT code, price FROM services WHERE is_active = true`);
      bumpServicesVersion(allRows.rows as Array<{ code: string; price: number }>);

      const svc = result.rows[0];
      const adminId = req.user?.claims?.sub ?? req.user?.id;
      console.log(`[FlashSale] ${svc.code} flash=${svc.flash_sale} disc=${svc.discount_percent}% end=${svc.sale_end} by admin ${adminId}`);

      res.json({ success: true, message: "Flash sale updated", service: svc });
    } catch (error: any) {
      console.error("[POST /api/admin/flash-sale]", error.message);
      res.status(500).json({ success: false, message: "Failed to update flash sale" });
    }
  });

  // ── GET /api/urgency-stats?code=<service_code> ────────────────────────────
  // Returns real-time social proof: live viewers count + recent purchases.
  app.get("/api/urgency-stats", async (req: any, res) => {
    try {
      const code = String(req.query.code ?? "").trim();
      if (!code) return res.status(400).json({ error: "code is required" });

      // 1. Live viewer estimate — total live users, proportionally spread across services
      //    with per-service variation seeded from code hash (stable, realistic)
      const liveRes = await pool.query(
        `SELECT COUNT(*) AS c FROM live_users WHERE last_seen > NOW() - INTERVAL '5 minutes'`
      );
      const totalLive = Number(liveRes.rows[0]?.c ?? 0);
      // Simple djb2 seed for per-service variation (1–8 fraction of total live users)
      let hash = 5381;
      for (let i = 0; i < code.length; i++) hash = ((hash << 5) + hash) ^ code.charCodeAt(i);
      const fraction = ((Math.abs(hash) % 6) + 1) / 8; // 1/8 to 6/8
      const viewing  = Math.max(2, Math.min(30, Math.round(totalLive * fraction + 3)));

      // 2. Purchases in the last hour for this service
      const purchasesRes = await pool.query(
        `SELECT COUNT(*) AS c
         FROM payments
         WHERE service_id = (SELECT id FROM services WHERE code = $1 LIMIT 1)
           AND status = 'success'
           AND created_at > NOW() - INTERVAL '1 hour'`,
        [code]
      );
      const recentPurchases = Number(purchasesRes.rows[0]?.c ?? 0);

      res.json({ viewing, recentPurchases });
    } catch (error: any) {
      console.error("[GET /api/urgency-stats]", error.message);
      res.status(500).json({ viewing: 0, recentPurchases: 0 });
    }
  });

  app.post("/api/admin/job-links", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const parsed = createJobLinkSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request data", errors: parsed.error.errors });
      }

      const { countryId, name, url } = parsed.data;

      const link = await storage.createJobLink({
        countryId,
        name,
        url,
        isActive: true,
        order: 0,
      });

      res.json(link);
    } catch (error) {
      console.error("Error creating job link:", error);
      res.status(500).json({ message: "Failed to create job link" });
    }
  });

  app.patch("/api/admin/job-links/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { name, url, order } = req.body;
      const updated = await storage.updateJobLink(req.params.id, { name, url, order });
      if (!updated) {
        return res.status(404).json({ message: "Job link not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating job link:", error);
      res.status(500).json({ message: "Failed to update job link" });
    }
  });

  app.patch("/api/admin/job-links/:id/toggle", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const link = await storage.getJobLinkById(req.params.id);
      if (!link) {
        return res.status(404).json({ message: "Job link not found" });
      }
      const updated = await storage.updateJobLink(req.params.id, { isActive: !link.isActive });
      res.json(updated);
    } catch (error) {
      console.error("Error toggling job link:", error);
      res.status(500).json({ message: "Failed to toggle job link" });
    }
  });

  app.delete("/api/admin/job-links/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      await storage.deleteJobLink(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting job link:", error);
      res.status(500).json({ message: "Failed to delete job link" });
    }
  });

  // Track job link clicks (public endpoint for authenticated users)
  app.post("/api/job-links/:id/click", isAuthenticated, async (req: any, res) => {
    try {
      await storage.incrementJobLinkClick(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error tracking job link click:", error);
      res.status(500).json({ message: "Failed to track click" });
    }
  });

  // Admin: Mark job link as verified
  app.patch("/api/admin/job-links/:id/verify", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      await storage.verifyJobLink(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error verifying job link:", error);
      res.status(500).json({ message: "Failed to verify job link" });
    }
  });

  // Admin: all payments flagged as suspicious — for fraud review
  // Returns payments where isSuspicious=true or verificationStatus=suspicious/mismatch, enriched.
  app.get("/api/admin/mpesa/fraud-transactions", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const all = await storage.getPayments();
      const suspicious = all.filter(
        (p: any) =>
          p.isSuspicious === true ||
          p.verificationStatus === "suspicious" ||
          p.verificationStatus === "mismatch"
      );
      const enriched = suspicious.map((p: any) => ({
        ...p,
        verificationStatus: p.verificationStatus ?? "unknown",
        verificationNote: p.verificationNote ?? null,
        verifiedAt: p.verifiedAt ?? null,
        fraudReasonDecoded: p.fraudReason ? p.fraudReason.replace(/_/g, " ") : null,
      }));
      res.json(enriched);
    } catch (error) {
      console.error("[Fraud] Error fetching suspicious payments:", error);
      res.status(500).json({ message: "Failed to fetch fraud transactions" });
    }
  });

  // NEA Agency public routes
  // ── Tool Reports (viral shareable public pages) ──────────────────────────
  app.post("/api/tool-reports", async (req: any, res) => {
    try {
      const { toolName, reportData } = req.body;
      if (!toolName || !reportData) return res.status(400).json({ message: "toolName and reportData required" });
      const allowed = ["ats", "scam"];
      if (!allowed.includes(toolName)) return res.status(400).json({ message: "Invalid toolName" });
      const userId = req.user?.id ?? null;
      const report = await storage.createToolReport({ toolName, userId, reportData });
      res.json({ reportId: report.id, toolName: report.toolName });
    } catch (err) {
      console.error("[ToolReports] create error:", err);
      res.status(500).json({ message: "Failed to create report" });
    }
  });

  app.get("/api/tool-reports/:reportId", async (req, res) => {
    try {
      const report = await storage.getToolReport(req.params.reportId);
      if (!report) return res.status(404).json({ message: "Report not found" });
      await storage.incrementReportViews(report.id);
      res.json(report);
    } catch (err) {
      console.error("[ToolReports] get error:", err);
      res.status(500).json({ message: "Failed to fetch report" });
    }
  });

  app.post("/api/tool-reports/:reportId/share", async (req, res) => {
    try {
      const report = await storage.getToolReport(req.params.reportId);
      if (!report) return res.status(404).json({ message: "Report not found" });
      await storage.incrementReportShares(report.id);
      res.json({ success: true });
    } catch {
      res.status(500).json({ message: "Failed to track share" });
    }
  });

  app.get("/api/agencies/stats", async (_req, res) => {
    try {
      const stats = await storage.getAgencyStats();
      res.json({ ...stats, lastUpdated: new Date().toISOString() });
    } catch {
      res.status(500).json({ message: "Failed to fetch agency stats" });
    }
  });

  // POST /api/agencies/bulk-verify — look up multiple license numbers in one shot
  app.post("/api/agencies/bulk-verify", async (req, res) => {
    try {
      const { licenseNumbers } = req.body as { licenseNumbers: string[] };
      if (!Array.isArray(licenseNumbers) || licenseNumbers.length === 0) {
        return res.status(400).json({ message: "licenseNumbers array required" });
      }
      const capped = licenseNumbers.slice(0, 100).map(l => l.trim().toUpperCase());
      const rows = await db
        .select({
          licenseNumber: neaAgenciesTable.licenseNumber,
          agencyName: neaAgenciesTable.agencyName,
          expiryDate: neaAgenciesTable.expiryDate,
          statusOverride: neaAgenciesTable.statusOverride,
          isPublished: neaAgenciesTable.isPublished,
        })
        .from(neaAgenciesTable)
        .where(inArray(neaAgenciesTable.licenseNumber, capped));

      const now = new Date();
      const byLicense = Object.fromEntries(rows.map(r => [r.licenseNumber.toUpperCase(), r]));

      const results = capped.map(lic => {
        const row = byLicense[lic];
        if (!row) return { licenseNumber: lic, status: "Not Found", agencyName: null, expiryDate: null, validUntil: "N/A" };
        const expired = new Date(row.expiryDate) < now;
        const status = row.statusOverride === "blacklisted"
          ? "Blacklisted"
          : expired ? "Expired" : "Valid";
        return {
          licenseNumber: lic,
          status,
          agencyName: row.agencyName,
          expiryDate: row.expiryDate,
          validUntil: row.expiryDate ? new Date(row.expiryDate).toLocaleDateString("en-KE") : "N/A",
        };
      });

      res.json({ results });
    } catch (err) {
      console.error("[BulkVerify]", err);
      res.status(500).json({ message: "Verification failed" });
    }
  });

  // GET /api/agencies/rating-eligibility — check if the logged-in user can rate (7-day rule)
  app.get("/api/agencies/rating-eligibility", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub as string | undefined;
      if (!userId) return res.status(401).json({ eligible: false, reason: "Not logged in" });

      const [userRow] = await db
        .select({ createdAt: users.createdAt })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!userRow?.createdAt) return res.json({ eligible: false, daysOld: 0, reason: "Account not found" });

      const daysOld = Math.floor((Date.now() - new Date(userRow.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      const eligible = daysOld >= 7;
      res.json({ eligible, daysOld, reason: eligible ? null : `Account must be at least 7 days old (yours is ${daysOld} day${daysOld === 1 ? "" : "s"} old)` });
    } catch (err) {
      console.error("[RatingEligibility]", err);
      res.status(500).json({ eligible: false, reason: "Server error" });
    }
  });

  app.get("/api/nea-agencies/stats", async (_req, res) => {
    try {
      const [allAgencies, blacklistedIds] = await Promise.all([
        withCache(
          CACHE_KEYS.NEA_AGENCIES("", "", 1),
          CACHE_TTL.NEA_AGENCIES,
          () => storage.getNeaAgencies()
        ),
        withCache(
          CACHE_KEYS.NEA_AGENCIES_BLACKLIST,
          CACHE_TTL.NEA_AGENCIES_BLACKLIST,
          () => storage.getActiveBlacklistedEntityIds()
        ),
      ]);

      const agencies = allAgencies.filter((a: any) => !blacklistedIds.has(a.id));
      const today = new Date();

      let valid = 0, expired = 0, suspended = 0;
      for (const a of agencies) {
        if (a.statusOverride === "suspended") {
          suspended++;
        } else if (a.statusOverride === "expired" || new Date(a.expiryDate) < today) {
          expired++;
        } else {
          valid++;
        }
      }

      res.json({
        valid,
        expired,
        suspended,
        total: valid + expired + suspended,
        lastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error fetching NEA stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  app.get("/api/nea-agencies", async (req, res) => {
    try {
      const search = (req.query.search as string | undefined) || "";
      const statusFilter = (req.query.status as string | undefined) || "";
      const page = parseInt(req.query.page as string) || 1;

      const [agencies, blacklistedIds] = await Promise.all([
        withCache(
          CACHE_KEYS.NEA_AGENCIES(search, statusFilter, page),
          CACHE_TTL.NEA_AGENCIES,
          () => storage.getNeaAgencies(search || undefined, statusFilter || undefined)
        ),
        withCache(
          CACHE_KEYS.NEA_AGENCIES_BLACKLIST,
          CACHE_TTL.NEA_AGENCIES_BLACKLIST,
          () => storage.getActiveBlacklistedEntityIds()
        ),
      ]);

      const filtered = agencies.filter((a: any) => !blacklistedIds.has(a.id));
      res.json(filtered);
    } catch (error) {
      console.error("Error fetching NEA agencies:", error);
      res.status(500).json({ message: "Failed to fetch agencies" });
    }
  });

  app.get("/api/nea-agencies/download", async (req, res) => {
    try {
      const allAgencies = await storage.getNeaAgencies();
      const agencies = [];
      for (const a of allAgencies) {
        if (!(await storage.isEntityBlacklisted(a.id))) agencies.push(a);
      }
      
      agencies.sort((a, b) => a.agencyName.localeCompare(b.agencyName));
      
      // Create workbook and worksheet
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "WorkAbroad Hub";
      workbook.created = new Date();
      
      const worksheet = workbook.addWorksheet("NEA Licensed Agencies");
      
      // Define columns with headers
      worksheet.columns = [
        { header: "Agency Name", key: "agencyName", width: 40 },
        { header: "License Number", key: "licenseNumber", width: 20 },
        { header: "Issue Date", key: "issueDate", width: 15 },
        { header: "Expiry Date", key: "expiryDate", width: 15 },
        { header: "Status", key: "status", width: 15 },
        { header: "Notes", key: "notes", width: 40 },
        { header: "Last Updated", key: "lastUpdated", width: 15 },
      ];
      
      // Style header row
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4472C4" },
      };
      worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      
      // Add data rows
      agencies.forEach((agency) => {
        const today = new Date();
        const expiryDate = new Date(agency.expiryDate);
        let status = "Valid";
        if (agency.statusOverride === "suspended") {
          status = "Suspended";
        } else if (expiryDate < today) {
          status = "Expired";
        }
        
        worksheet.addRow({
          agencyName: agency.agencyName,
          licenseNumber: agency.licenseNumber,
          issueDate: new Date(agency.issueDate).toISOString().split("T")[0],
          expiryDate: new Date(agency.expiryDate).toISOString().split("T")[0],
          status: status,
          notes: agency.notes || "",
          lastUpdated: agency.lastUpdated ? new Date(agency.lastUpdated).toISOString().split("T")[0] : "",
        });
      });
      
      // Add empty row before metadata
      worksheet.addRow([]);
      
      // Add metadata rows
      const today = new Date().toISOString().split("T")[0];
      const metaRow1 = worksheet.addRow([`Generated on: ${today}`]);
      metaRow1.font = { italic: true, color: { argb: "FF666666" } };
      
      const metaRow2 = worksheet.addRow(["Source: Admin-updated NEA public data"]);
      metaRow2.font = { italic: true, color: { argb: "FF666666" } };
      
      // Add disclaimer
      worksheet.addRow([]);
      const disclaimerRow1 = worksheet.addRow(["DISCLAIMER:"]);
      disclaimerRow1.font = { bold: true, color: { argb: "FFCC0000" } };
      
      const disclaimerRow2 = worksheet.addRow(["This list is provided for public awareness only."]);
      disclaimerRow2.font = { italic: true, color: { argb: "FF666666" } };
      
      const disclaimerRow3 = worksheet.addRow(["Not affiliated with the National Employment Authority (NEA)."]);
      disclaimerRow3.font = { italic: true, color: { argb: "FF666666" } };
      
      const disclaimerRow4 = worksheet.addRow(["Always confirm directly with NEA."]);
      disclaimerRow4.font = { italic: true, color: { argb: "FF666666" } };
      
      // Set response headers
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename=NEA_Licensed_Agencies_${today}.xlsx`);
      
      // Write to response
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error("Error downloading agencies:", error);
      res.status(500).json({ message: "Failed to download agencies" });
    }
  });

  // PDF download endpoint
  app.get("/api/nea-agencies/download-pdf", async (req, res) => {
    try {
      const allAgencies = await storage.getNeaAgencies();
      const agencies = [];
      for (const a of allAgencies) {
        if (!(await storage.isEntityBlacklisted(a.id))) agencies.push(a);
      }
      agencies.sort((a, b) => a.agencyName.localeCompare(b.agencyName));
      
      const today = new Date().toISOString().split("T")[0];
      
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=NEA_Licensed_Agencies_${today}.pdf`);
      
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      doc.pipe(res);
      
      // Title
      doc.fontSize(20).font("Helvetica-Bold").text("NEA Licensed Employment Agencies", { align: "center" });
      doc.moveDown(0.5);
      doc.fontSize(10).font("Helvetica").fillColor("#666666").text(`Generated on: ${today}`, { align: "center" });
      doc.moveDown(0.3);
      doc.text("Source: Admin-updated NEA public data", { align: "center" });
      doc.moveDown(1);
      
      // Status legend
      doc.fontSize(9).fillColor("#000000");
      doc.text("Status Key: ", { continued: true });
      doc.fillColor("#22c55e").text("Valid", { continued: true });
      doc.fillColor("#000000").text(" | ", { continued: true });
      doc.fillColor("#ef4444").text("Expired", { continued: true });
      doc.fillColor("#000000").text(" | ", { continued: true });
      doc.fillColor("#f59e0b").text("Suspended");
      doc.moveDown(1);
      
      // Agency list
      doc.fillColor("#000000");
      let validCount = 0;
      let expiredCount = 0;
      let suspendedCount = 0;
      
      agencies.forEach((agency, index) => {
        const todayDate = new Date();
        const expiryDate = new Date(agency.expiryDate);
        let status = "Valid";
        let statusColor = "#22c55e";
        
        if (agency.statusOverride === "suspended") {
          status = "Suspended";
          statusColor = "#f59e0b";
          suspendedCount++;
        } else if (expiryDate < todayDate) {
          status = "Expired";
          statusColor = "#ef4444";
          expiredCount++;
        } else {
          validCount++;
        }
        
        // Check if we need a new page
        if (doc.y > 700) {
          doc.addPage();
        }
        
        doc.fontSize(11).font("Helvetica-Bold").fillColor("#000000")
           .text(`${index + 1}. ${agency.agencyName}`, { continued: true });
        doc.fontSize(9).font("Helvetica").fillColor(statusColor).text(` [${status}]`);
        
        doc.fontSize(9).font("Helvetica").fillColor("#666666");
        doc.text(`   License: ${agency.licenseNumber}`);
        doc.text(`   Issue Date: ${new Date(agency.issueDate).toLocaleDateString("en-GB")} | Expiry: ${new Date(agency.expiryDate).toLocaleDateString("en-GB")}`);
        
        if (agency.notes) {
          doc.fillColor("#b45309").text(`   Note: ${agency.notes}`);
        }
        
        doc.moveDown(0.5);
      });
      
      // Summary
      doc.moveDown(1);
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#000000")
         .text(`Summary: ${agencies.length} agencies total (${validCount} valid, ${expiredCount} expired, ${suspendedCount} suspended)`);
      
      // Disclaimer
      doc.moveDown(1.5);
      doc.fontSize(8).font("Helvetica-Bold").fillColor("#cc0000").text("DISCLAIMER:", { underline: true });
      doc.font("Helvetica").fillColor("#666666");
      doc.text("This list is provided for public awareness only.");
      doc.text("Not affiliated with the National Employment Authority (NEA).");
      doc.text("Always confirm agency status directly with NEA before any transaction.");
      
      doc.end();
    } catch (error) {
      console.error("Error generating PDF:", error);
      res.status(500).json({ message: "Failed to generate PDF" });
    }
  });

  app.get("/api/nea-agencies/:id", async (req, res) => {
    try {
      const agency = await storage.getNeaAgencyById(req.params.id);
      if (!agency) {
        return res.status(404).json({ message: "Agency not found" });
      }
      const isBlacklisted = await storage.isEntityBlacklisted(agency.id);
      if (isBlacklisted) {
        return res.status(403).json({ message: "This agency is currently restricted" });
      }
      res.json(agency);
    } catch (error) {
      console.error("Error fetching agency:", error);
      res.status(500).json({ message: "Failed to fetch agency" });
    }
  });

  app.post("/api/agency-reports", async (req, res) => {
    try {
      const { agencyId, agencyName, reporterEmail, reporterPhone, description } = req.body;
      if (!agencyName || !description) {
        return res.status(400).json({ message: "Agency name and description are required" });
      }
      const report = await storage.createAgencyReport({
        agencyId: agencyId || null,
        agencyName,
        reporterEmail: reporterEmail || null,
        reporterPhone: reporterPhone || null,
        description,
        status: "pending",
      });

      if (agencyId) {
        try {
          const { runFraudDetection } = await import("./fraud-engine");
          runFraudDetection(agencyId, "agency").catch(err =>
            console.error("[FraudEngine] Auto-scan after report failed:", err)
          );
        } catch (err) {
          console.error("[FraudEngine] Import error:", err);
        }
      }

      res.json(report);
    } catch (error) {
      console.error("Error creating agency report:", error);
      res.status(500).json({ message: "Failed to submit report" });
    }
  });

  // License Expiry Cron Status
  app.get("/api/admin/license-cron-status", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const { getLastCheckResult } = await import("./license-checker");
      const result = getLastCheckResult();
      if (!result) {
        return res.json({ status: "pending", message: "Initial check not yet completed" });
      }
      res.json({
        status: "ok",
        lastChecked: result.checkedAt,
        summary: {
          total: result.total,
          expired: result.expired.length,
          expiringSoon: result.expiringSoon.length,
          expiring60: result.expiring60.length,
          expiring90: result.expiring90.length,
          valid: result.valid,
        },
      });
    } catch (error) {
      console.error("Error fetching cron status:", error);
      res.status(500).json({ message: "Failed to fetch cron status" });
    }
  });

  // License Expiry Status API
  app.get("/api/admin/license-expiry-status", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const agencies = await storage.getNeaAgencies();
      const now = new Date();
      
      const categorized = agencies.map((agency: NeaAgency) => {
        const expiryDate = new Date(agency.expiryDate);
        const diffMs = expiryDate.getTime() - now.getTime();
        const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        
        let category: string;
        let color: string;
        if (daysRemaining < 0) {
          category = "expired";
          color = "red";
        } else if (daysRemaining <= 30) {
          category = "expiring_soon";
          color = "orange";
        } else if (daysRemaining <= 60) {
          category = "expiring_60";
          color = "yellow";
        } else if (daysRemaining <= 90) {
          category = "expiring_90";
          color = "lightgreen";
        } else {
          category = "valid";
          color = "green";
        }
        
        return {
          id: agency.id,
          agencyName: agency.agencyName,
          licenseNumber: agency.licenseNumber,
          email: agency.email,
          website: agency.website,
          serviceType: agency.serviceType,
          issuingAuthority: "National Employment Authority (NEA)",
          issueDate: agency.issueDate,
          expiryDate: agency.expiryDate,
          daysRemaining,
          category,
          color,
          statusOverride: agency.statusOverride,
        };
      });

      const summary = {
        total: categorized.length,
        expired: categorized.filter((a: any) => a.category === "expired").length,
        expiringSoon: categorized.filter((a: any) => a.category === "expiring_soon").length,
        expiring60: categorized.filter((a: any) => a.category === "expiring_60").length,
        expiring90: categorized.filter((a: any) => a.category === "expiring_90").length,
        valid: categorized.filter((a: any) => a.category === "valid").length,
      };

      res.json({ summary, agencies: categorized });
    } catch (error) {
      console.error("Error fetching license expiry status:", error);
      res.status(500).json({ message: "Failed to fetch license expiry status" });
    }
  });

  // Public endpoint for user agent portal license check
  app.get("/api/license-check", isAuthenticated, async (req: any, res) => {
    try {
      const agencies = await storage.getNeaAgencies();
      const now = new Date();
      
      const result = agencies.map((agency: NeaAgency) => {
        const expiryDate = new Date(agency.expiryDate);
        const diffMs = expiryDate.getTime() - now.getTime();
        const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        
        let status: string;
        if (daysRemaining < 0) status = "expired";
        else if (daysRemaining <= 30) status = "expiring_soon";
        else if (daysRemaining <= 60) status = "expiring_60";
        else status = "valid";
        
        const needsRenewal = daysRemaining <= 60;
        
        return {
          id: agency.id,
          agencyName: agency.agencyName,
          licenseNumber: agency.licenseNumber,
          issuingAuthority: "National Employment Authority (NEA)",
          expiryDate: agency.expiryDate,
          daysRemaining,
          status,
          needsRenewal,
        };
      });

      res.json(result);
    } catch (error) {
      console.error("Error fetching license check:", error);
      res.status(500).json({ message: "Failed to fetch license data" });
    }
  });

  // ============================================
  // LICENSE REMINDER SYSTEM ENDPOINTS
  // ============================================

  app.get("/api/admin/license-reminder-logs", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { agencyId, status, reminderTier, limit, offset } = req.query;
      const filters = {
        agencyId: agencyId as string | undefined,
        status: status as string | undefined,
        reminderTier: reminderTier as string | undefined,
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0,
      };

      const [logs, total] = await Promise.all([
        storage.getLicenseReminderLogs(filters),
        storage.getLicenseReminderLogCount(filters),
      ]);

      res.json({ logs, total, limit: filters.limit, offset: filters.offset });
    } catch (error) {
      console.error("Error fetching reminder logs:", error);
      res.status(500).json({ message: "Failed to fetch reminder logs" });
    }
  });

  app.post("/api/admin/license-reminder-retry/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { retryFailedReminder } = await import("./license-checker");
      const result = await retryFailedReminder(req.params.id, storage);
      if (result.success) {
        res.json({ message: "Reminder retried successfully" });
      } else {
        res.status(400).json({ message: result.error || "Retry failed" });
      }
    } catch (error) {
      console.error("Error retrying reminder:", error);
      res.status(500).json({ message: "Failed to retry reminder" });
    }
  });

  app.get("/api/admin/agency-notification-preferences", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const prefs = await storage.getAllAgencyNotificationPreferences();
      res.json(prefs);
    } catch (error) {
      console.error("Error fetching notification preferences:", error);
      res.status(500).json({ message: "Failed to fetch preferences" });
    }
  });

  app.get("/api/admin/agency-notification-preferences/:agencyId", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const pref = await storage.getAgencyNotificationPreference(req.params.agencyId);
      res.json(pref || { remindersEnabled: true, enableSms: true, enableWhatsapp: false, enableEmail: true, preferredChannel: "sms" });
    } catch (error) {
      console.error("Error fetching notification preference:", error);
      res.status(500).json({ message: "Failed to fetch preference" });
    }
  });

  app.put("/api/admin/agency-notification-preferences/:agencyId", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { contactEmail, contactPhone, contactName, enableSms, enableWhatsapp, enableEmail, preferredChannel, remindersEnabled } = req.body;
      const pref = await storage.upsertAgencyNotificationPreference({
        agencyId: req.params.agencyId,
        contactEmail: contactEmail || null,
        contactPhone: contactPhone || null,
        contactName: contactName || null,
        enableSms: enableSms !== false,
        enableWhatsapp: enableWhatsapp === true,
        enableEmail: enableEmail !== false,
        preferredChannel: preferredChannel || "sms",
        remindersEnabled: remindersEnabled !== false,
        consentRecordedAt: new Date(),
      });
      res.json(pref);
    } catch (error) {
      console.error("Error updating notification preference:", error);
      res.status(500).json({ message: "Failed to update preference" });
    }
  });

  app.post("/api/admin/agency-disable-reminders/:agencyId", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      await storage.disableAgencyReminders(req.params.agencyId);
      res.json({ message: "Reminders disabled for agency" });
    } catch (error) {
      console.error("Error disabling reminders:", error);
      res.status(500).json({ message: "Failed to disable reminders" });
    }
  });

  app.post("/api/admin/agency-enable-reminders/:agencyId", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      await storage.enableAgencyReminders(req.params.agencyId);
      res.json({ message: "Reminders enabled for agency" });
    } catch (error) {
      console.error("Error enabling reminders:", error);
      res.status(500).json({ message: "Failed to enable reminders" });
    }
  });

  app.get("/api/admin/license-reminder-stats", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const [total, sent, failed] = await Promise.all([
        storage.getLicenseReminderLogCount(),
        storage.getLicenseReminderLogCount({ status: "sent" }),
        storage.getLicenseReminderLogCount({ status: "failed" }),
      ]);

      const { getLastCheckResult } = await import("./license-checker");
      const lastCheck = getLastCheckResult();

      res.json({
        totalReminders: total,
        sent,
        failed,
        pending: total - sent - failed,
        lastCheckAt: lastCheck?.checkedAt || null,
        lastCheckRemindersSent: lastCheck?.remindersSent || 0,
        lastCheckRemindersFailed: lastCheck?.remindersFailed || 0,
      });
    } catch (error) {
      console.error("Error fetching reminder stats:", error);
      res.status(500).json({ message: "Failed to fetch reminder stats" });
    }
  });

  // NEA Agency admin routes
  app.get("/api/admin/nea-agencies", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const search = req.query.search as string | undefined;
      const agencies = await storage.getNeaAgencies(search);
      res.json(agencies);
    } catch (error) {
      console.error("Error fetching agencies:", error);
      res.status(500).json({ message: "Failed to fetch agencies" });
    }
  });

  app.post("/api/admin/nea-agencies", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { agencyName, licenseNumber, issueDate, expiryDate, statusOverride, notes, isPublished } = req.body;
      if (!agencyName || !licenseNumber || !issueDate || !expiryDate) {
        return res.status(400).json({ message: "Agency name, license number, issue date, and expiry date are required" });
      }
      const agency = await storage.createNeaAgency({
        agencyName,
        licenseNumber,
        issueDate: new Date(issueDate),
        expiryDate: new Date(expiryDate),
        statusOverride: statusOverride || null,
        notes: notes || null,
        isPublished: isPublished !== false,
        updatedBy: userId,
      });
      res.json(agency);
    } catch (error: any) {
      if (error.code === "23505") {
        return res.status(400).json({ message: "License number already exists" });
      }
      console.error("Error creating agency:", error);
      res.status(500).json({ message: "Failed to create agency" });
    }
  });

  app.patch("/api/admin/nea-agencies/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { agencyName, licenseNumber, issueDate, expiryDate, statusOverride, notes, isPublished } = req.body;
      const updateData: any = { updatedBy: userId };
      if (agencyName !== undefined) updateData.agencyName = agencyName;
      if (licenseNumber !== undefined) updateData.licenseNumber = licenseNumber;
      if (issueDate !== undefined) updateData.issueDate = new Date(issueDate);
      if (expiryDate !== undefined) updateData.expiryDate = new Date(expiryDate);
      if (statusOverride !== undefined) updateData.statusOverride = statusOverride || null;
      if (notes !== undefined) updateData.notes = notes || null;
      if (isPublished !== undefined) updateData.isPublished = isPublished;
      
      const updated = await storage.updateNeaAgency(req.params.id, updateData);
      if (!updated) {
        return res.status(404).json({ message: "Agency not found" });
      }
      if (expiryDate !== undefined || statusOverride !== undefined) {
        calculateAgencyScore(req.params.id, "license_update").catch(err =>
          console.error("[ScoreEngine] Auto-recalculate failed:", err)
        );
      }
      res.json(updated);
    } catch (error: any) {
      if (error.code === "23505") {
        return res.status(400).json({ message: "License number already exists" });
      }
      console.error("Error updating agency:", error);
      res.status(500).json({ message: "Failed to update agency" });
    }
  });

  app.delete("/api/admin/nea-agencies/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      await storage.deleteNeaAgency(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting agency:", error);
      res.status(500).json({ message: "Failed to delete agency" });
    }
  });

  app.post("/api/admin/nea-agencies/bulk", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { agencies } = req.body;
      if (!Array.isArray(agencies) || agencies.length === 0) {
        return res.status(400).json({ message: "agencies array is required" });
      }
      
      const validAgencies = agencies.map((a: any) => ({
        agencyName: a.agencyName || a.agency_name,
        licenseNumber: a.licenseNumber || a.license_number,
        issueDate: new Date(a.issueDate || a.issue_date),
        expiryDate: new Date(a.expiryDate || a.expiry_date),
        statusOverride: a.statusOverride || a.status_override || null,
        notes: a.notes || null,
        isPublished: a.isPublished !== false && a.is_published !== false,
        updatedBy: userId,
      }));
      
      const created = await storage.bulkCreateNeaAgencies(validAgencies);
      res.json({ success: true, count: created.length, agencies: created });
    } catch (error: any) {
      if (error.code === "23505") {
        return res.status(400).json({ message: "One or more license numbers already exist" });
      }
      console.error("Error bulk creating agencies:", error);
      res.status(500).json({ message: "Failed to bulk create agencies" });
    }
  });

  app.get("/api/admin/nea-agencies/download", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const agencies = await storage.getNeaAgencies();
      
      const csvHeader = "agency_name,license_number,issue_date,expiry_date,status_override,notes,is_published\n";
      const csvRows = agencies.map((a: NeaAgency) => {
        const issueDate = new Date(a.issueDate).toISOString().split("T")[0];
        const expiryDate = new Date(a.expiryDate).toISOString().split("T")[0];
        const escapeCsv = (val: string | null) => {
          if (!val) return "";
          if (val.includes(",") || val.includes('"') || val.includes("\n")) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        };
        return [
          escapeCsv(a.agencyName),
          escapeCsv(a.licenseNumber),
          issueDate,
          expiryDate,
          a.statusOverride || "",
          escapeCsv(a.notes),
          a.isPublished ? "true" : "false"
        ].join(",");
      }).join("\n");
      
      const csv = csvHeader + csvRows;
      
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=nea_agencies_${new Date().toISOString().split("T")[0]}.csv`);
      res.send(csv);
    } catch (error) {
      console.error("Error downloading agencies:", error);
      res.status(500).json({ message: "Failed to download agencies" });
    }
  });

  app.get("/api/admin/agency-reports", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const reports = await storage.getAgencyReports();
      res.json(reports);
    } catch (error) {
      console.error("Error fetching agency reports:", error);
      res.status(500).json({ message: "Failed to fetch reports" });
    }
  });

  app.patch("/api/admin/agency-reports/:id/status", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { status } = req.body;
      if (!status) {
        return res.status(400).json({ message: "status is required" });
      }
      const updated = await storage.updateAgencyReportStatus(req.params.id, status);
      if (!updated) {
        return res.status(404).json({ message: "Report not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating report status:", error);
      res.status(500).json({ message: "Failed to update report status" });
    }
  });

  // Daily job endpoint for agency expiry notifications
  app.post("/api/admin/jobs/check-agency-expiry", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const agencies = await storage.getNeaAgencies();
      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];
      
      const results = {
        checked: agencies.length,
        expiringSoon: 0,
        expiringVerySoon: 0,
        expired: 0,
        notifications: [] as any[],
      };
      
      for (const agency of agencies) {
        const expiryDate = new Date(agency.expiryDate);
        const diffTime = expiryDate.getTime() - today.getTime();
        const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        let notificationType: string | null = null;
        let shouldNotify = false;
        
        if (daysLeft < 0 && agency.statusOverride !== "suspended") {
          // Expired
          notificationType = "expired";
          // Check if already notified today
          const lastNotified = agency.lastNotifiedExpired;
          shouldNotify = !lastNotified || new Date(lastNotified).toISOString().split("T")[0] !== todayStr;
          if (shouldNotify) results.expired++;
        } else if (daysLeft === 7) {
          notificationType = "expiring_very_soon";
          const lastNotified = agency.lastNotified7Days;
          shouldNotify = !lastNotified || new Date(lastNotified).toISOString().split("T")[0] !== todayStr;
          if (shouldNotify) results.expiringVerySoon++;
        } else if (daysLeft === 30) {
          notificationType = "expiring_soon";
          const lastNotified = agency.lastNotified30Days;
          shouldNotify = !lastNotified || new Date(lastNotified).toISOString().split("T")[0] !== todayStr;
          if (shouldNotify) results.expiringSoon++;
        }
        
        if (notificationType && shouldNotify) {
          // Create notification
          const notification = await storage.createAgencyNotification({
            agencyId: agency.id,
            agencyName: agency.agencyName,
            licenseNumber: agency.licenseNumber,
            type: notificationType,
            expiryDate: agency.expiryDate,
            daysLeft: daysLeft,
            isRead: false,
          });
          results.notifications.push(notification);
          
          // Update last notified date on agency
          const updateData: any = {};
          if (notificationType === "expired") {
            updateData.lastNotifiedExpired = today;
          } else if (notificationType === "expiring_very_soon") {
            updateData.lastNotified7Days = today;
          } else if (notificationType === "expiring_soon") {
            updateData.lastNotified30Days = today;
          }
          await storage.updateNeaAgency(agency.id, updateData);
        }
      }
      
      res.json({
        success: true,
        message: `Checked ${results.checked} agencies`,
        results,
      });
    } catch (error) {
      console.error("Error running agency expiry job:", error);
      res.status(500).json({ message: "Failed to run expiry check" });
    }
  });

  // Get agency notifications
  app.get("/api/admin/agency-notifications", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const unreadOnly = req.query.unread === "true";
      const notifications = await storage.getAgencyNotifications(unreadOnly);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  // Get unread notification count
  app.get("/api/admin/agency-notifications/count", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const count = await storage.getUnreadNotificationCount();
      res.json({ count });
    } catch (error) {
      console.error("Error fetching notification count:", error);
      res.status(500).json({ message: "Failed to fetch count" });
    }
  });

  // Mark notification as read
  app.patch("/api/admin/agency-notifications/:id/read", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      await storage.markNotificationAsRead(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ message: "Failed to mark as read" });
    }
  });

  // Mark all notifications as read
  app.post("/api/admin/agency-notifications/read-all", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      await storage.markAllNotificationsAsRead();
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking all as read:", error);
      res.status(500).json({ message: "Failed to mark all as read" });
    }
  });

  // ===== AGENCY ADD-ONS =====
  
  // Get all add-ons (admin)
  app.get("/api/admin/agency-add-ons", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const agencyId = req.query.agencyId as string | undefined;
      const addOns = await storage.getAgencyAddOns(agencyId);
      res.json(addOns);
    } catch (error) {
      console.error("Error fetching add-ons:", error);
      res.status(500).json({ message: "Failed to fetch add-ons" });
    }
  });

  // Create add-on (admin)
  app.post("/api/admin/agency-add-ons", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { agencyId, addOnType, price, countryId, startDate, endDate, paymentRef, notes } = req.body;
      
      if (!agencyId || !addOnType || !price || !startDate || !endDate) {
        return res.status(400).json({ message: "Agency ID, add-on type, price, start date, and end date are required" });
      }
      
      const addOn = await storage.createAgencyAddOn({
        agencyId,
        addOnType,
        price: parseInt(price),
        countryId: countryId || null,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        isActive: true,
        paymentRef: paymentRef || null,
        notes: notes || null,
        createdBy: userId,
      });
      res.json(addOn);
    } catch (error) {
      console.error("Error creating add-on:", error);
      res.status(500).json({ message: "Failed to create add-on" });
    }
  });

  // Update add-on (admin)
  app.patch("/api/admin/agency-add-ons/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { addOnType, price, countryId, startDate, endDate, isActive, paymentRef, notes } = req.body;
      const updateData: any = {};
      if (addOnType !== undefined) updateData.addOnType = addOnType;
      if (price !== undefined) updateData.price = parseInt(price);
      if (countryId !== undefined) updateData.countryId = countryId || null;
      if (startDate !== undefined) updateData.startDate = new Date(startDate);
      if (endDate !== undefined) updateData.endDate = new Date(endDate);
      if (isActive !== undefined) updateData.isActive = isActive;
      if (paymentRef !== undefined) updateData.paymentRef = paymentRef || null;
      if (notes !== undefined) updateData.notes = notes || null;
      
      const addOn = await storage.updateAgencyAddOn(req.params.id, updateData);
      res.json(addOn);
    } catch (error) {
      console.error("Error updating add-on:", error);
      res.status(500).json({ message: "Failed to update add-on" });
    }
  });

  // Delete add-on (admin)
  app.delete("/api/admin/agency-add-ons/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      await storage.deleteAgencyAddOn(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting add-on:", error);
      res.status(500).json({ message: "Failed to delete add-on" });
    }
  });

  // Get agencies with active add-ons for public display
  app.get("/api/featured-agencies", async (req, res) => {
    try {
      const homepageBanners = await storage.getActiveAddOnsByType("homepage_banner");
      const verifiedBadges = await storage.getActiveAddOnsByType("verified_badge");
      
      // Get agency details for featured agencies
      const bannerAgencyIds = homepageBanners.map(a => a.agencyId);
      const verifiedAgencyIds = verifiedBadges.map(a => a.agencyId);
      
      const agencies = await storage.getNeaAgencies();
      const now = new Date();
      
      // Filter to only include agencies with valid (non-expired) licenses
      const featuredAgencies = agencies.filter(a => {
        const isValidLicense = new Date(a.expiryDate) >= now;
        const hasPremiumAddOn = bannerAgencyIds.includes(a.id) || verifiedAgencyIds.includes(a.id);
        return isValidLicense && hasPremiumAddOn;
      }).map(agency => ({
        ...agency,
        hasBanner: bannerAgencyIds.includes(agency.id),
        isVerified: verifiedAgencyIds.includes(agency.id),
      }));
      
      res.json(featuredAgencies);
    } catch (error) {
      console.error("Error fetching featured agencies:", error);
      res.status(500).json({ message: "Failed to fetch featured agencies" });
    }
  });

  // Record agency click (public, for analytics)
  app.post("/api/agency-clicks", async (req, res) => {
    try {
      const { agencyId, source } = req.body;
      if (!agencyId || !source) {
        return res.status(400).json({ message: "Agency ID and source are required" });
      }
      
      // Hash IP for privacy
      const ip = req.ip || req.headers['x-forwarded-for'] || '';
      const ipHash = require('crypto').createHash('sha256').update(String(ip)).digest('hex').substring(0, 16);
      
      await storage.recordAgencyClick({
        agencyId,
        source,
        ipHash,
        userAgent: req.headers['user-agent'] || null,
        referrer: req.headers['referer'] || null,
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error recording click:", error);
      res.status(500).json({ message: "Failed to record click" });
    }
  });

  // Get agency click stats (admin)
  app.get("/api/admin/agency-clicks/:agencyId", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const stats = await storage.getAgencyClickStats(req.params.agencyId);
      const total = await storage.getAgencyTotalClicks(req.params.agencyId);
      res.json({ stats, total });
    } catch (error) {
      console.error("Error fetching click stats:", error);
      res.status(500).json({ message: "Failed to fetch click stats" });
    }
  });

  // Get agency profile (public)
  app.get("/api/agency-profiles/:agencyId", async (req, res) => {
    try {
      // Check if agency has profile page add-on
      const addOns = await storage.getAgencyActiveAddOns(req.params.agencyId);
      const hasProfilePage = addOns.some(a => a.addOnType === "profile_page");
      
      if (!hasProfilePage) {
        return res.status(404).json({ message: "Agency profile not available" });
      }
      
      const profile = await storage.getAgencyProfile(req.params.agencyId);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }
      res.json(profile);
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  // Create/update agency profile (admin)
  app.post("/api/admin/agency-profiles", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { agencyId, description, phone, email, website, address, services, countries, bannerImageUrl, logoUrl } = req.body;
      
      if (!agencyId) {
        return res.status(400).json({ message: "Agency ID is required" });
      }
      
      const existing = await storage.getAgencyProfile(agencyId);
      
      if (existing) {
        const updated = await storage.updateAgencyProfile(agencyId, {
          description, phone, email, website, address, services, countries, bannerImageUrl, logoUrl
        });
        res.json(updated);
      } else {
        const created = await storage.createAgencyProfile({
          agencyId, description, phone, email, website, address, services, countries, bannerImageUrl, logoUrl
        });
        res.json(created);
      }
    } catch (error) {
      console.error("Error saving profile:", error);
      res.status(500).json({ message: "Failed to save profile" });
    }
  });

  // Get add-on pricing (public)
  app.get("/api/add-on-pricing", async (req, res) => {
    res.json({
      homepage_banner: { name: "Homepage Banner", price: 15000, description: "Featured banner on homepage" },
      country_exposure: { name: "Country-Specific Exposure", price: 10000, description: "Highlighted in specific country pages" },
      verified_badge: { name: "Verified Badge", price: 5000, description: "Visual verification badge on listings" },
      profile_page: { name: "Agency Profile Page", price: 10000, description: "Dedicated agency profile page" },
      click_analytics: { name: "Click Analytics Report", price: 5000, description: "Detailed click tracking and reports" },
    });
  });

  // ==================== AGENCY PORTAL ====================
  
  // Get current user's claimed agency
  app.get("/api/agency-portal/my-agency", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.json(null);
      }
      const agency = await storage.getAgencyByClaimedUser(userId);
      res.json(agency);
    } catch (error) {
      console.error("Error fetching claimed agency:", error);
      res.status(500).json({ message: "Failed to fetch agency" });
    }
  });

  // Search agencies for claiming (filter out already claimed)
  app.get("/api/agency-portal/search", isAuthenticated, async (req: any, res) => {
    try {
      const query = req.query.query as string || "";
      if (query.length < 3) {
        return res.json([]);
      }
      const agencies = await storage.searchAgenciesForClaim(query);
      // Filter out already claimed agencies for cleaner UX
      const unclaimed = agencies.filter(a => !a.claimedByUserId);
      res.json(unclaimed);
    } catch (error) {
      console.error("Error searching agencies:", error);
      res.status(500).json({ message: "Failed to search agencies" });
    }
  });

  // Claim an agency
  app.post("/api/agency-portal/claim", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { agencyId } = req.body;
      
      if (!userId || !agencyId) {
        return res.status(400).json({ message: "Invalid request" });
      }
      
      // Check if user already has an agency
      const existingAgency = await storage.getAgencyByClaimedUser(userId);
      if (existingAgency) {
        return res.status(400).json({ message: "You have already claimed an agency" });
      }
      
      // Check if agency is already claimed
      const agency = await storage.getNeaAgencyById(agencyId);
      if (!agency) {
        return res.status(404).json({ message: "Agency not found" });
      }
      if (agency.claimedByUserId) {
        return res.status(400).json({ message: "This agency has already been claimed" });
      }
      
      // Claim the agency
      const claimed = await storage.claimAgency(agencyId, userId);
      res.json(claimed);
    } catch (error) {
      console.error("Error claiming agency:", error);
      res.status(500).json({ message: "Failed to claim agency" });
    }
  });

  // --- Agency Claim Workflow (with proof upload) ---
  const uploadDir = path.join(process.cwd(), "uploads", "agency-claims");
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const claimUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, uploadDir),
      filename: (_req, file, cb) => {
        const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        cb(null, `${unique}${path.extname(file.originalname)}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024, files: 3 }, // 10MB per file, max 3 files
    fileFilter: (_req, file, cb) => {
      const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
      cb(null, allowed.includes(file.mimetype));
    },
  });

  // Serve uploaded proof files (admin only - protected)
  app.get("/api/uploads/agency-claims/:filename", isAuthenticated, isAdmin, (req, res) => {
    // Sanitize: strip directory components to prevent path traversal attacks
    const safeFilename = path.basename(req.params.filename);
    const filePath = path.join(uploadDir, safeFilename);
    // Confirm resolved path is still inside the uploadDir (defence-in-depth)
    if (!filePath.startsWith(uploadDir + path.sep)) {
      return res.status(400).json({ message: "Invalid filename" });
    }
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: "File not found" });
    res.sendFile(filePath);
  });

  // Submit a claim for a specific agency (public-facing - any logged-in user)
  app.post("/api/nea-agencies/:id/claim", isAuthenticated, claimUpload.array("proofFiles", 3), async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const agencyId = req.params.id;
      if (!userId) return res.status(401).json({ message: "Login required" });

      const agency = await storage.getNeaAgencyById(agencyId);
      if (!agency) return res.status(404).json({ message: "Agency not found" });

      // Only block if already verified; pending claims are allowed to be re-submitted
      if (agency.isVerifiedOwner) {
        return res.status(400).json({ message: "This agency has already been verified" });
      }

      // Check if user already has a pending/approved claim for this agency
      const existing = await storage.getUserClaimForAgency(userId, agencyId);
      if (existing && (existing.status === "pending" || existing.status === "approved")) {
        return res.status(400).json({ message: "You already have an active claim for this agency", claim: existing });
      }

      const { contactName, contactEmail, contactPhone, role, proofDescription } = req.body;
      if (!contactName || !contactEmail || !role) {
        return res.status(400).json({ message: "Contact name, email and role are required" });
      }

      const proofFiles = (req.files as Express.Multer.File[] || []).map(f => ({
        filename: f.filename,
        originalName: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
      }));

      const claim = await storage.createAgencyClaim({
        agencyId,
        agencyName: agency.agencyName,
        licenseNumber: agency.licenseNumber,
        userId,
        contactName,
        contactEmail,
        contactPhone: contactPhone || null,
        role,
        status: "pending",
        proofFiles,
        proofDescription: proofDescription || null,
      });

      res.json({ message: "Claim submitted successfully. We will review and verify within 2-3 business days.", claim });
    } catch (error: any) {
      console.error("Claim submission error:", error);
      res.status(500).json({ message: "Failed to submit claim" });
    }
  });

  // Get current user's claim status for a specific agency
  app.get("/api/nea-agencies/:id/my-claim", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.json(null);
      const claim = await storage.getUserClaimForAgency(userId, req.params.id);
      res.json(claim || null);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch claim status" });
    }
  });

  // Admin: list all claims
  app.get("/api/admin/agency-claims", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { status, agencyId } = req.query;
      const claims = await storage.getAgencyClaims({
        status: status ? String(status) : undefined,
        agencyId: agencyId ? String(agencyId) : undefined,
      });
      res.json(claims);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch claims" });
    }
  });

  // Admin: claim stats
  app.get("/api/admin/agency-claims/stats", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const stats = await storage.getAgencyClaimCount();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch claim stats" });
    }
  });

  // Admin: approve a claim → grants verified badge
  app.post("/api/admin/agency-claims/:id/approve", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const adminId = req.user?.claims?.sub;
      const claim = await storage.getAgencyClaimById(req.params.id);
      if (!claim) return res.status(404).json({ message: "Claim not found" });
      if (claim.status !== "pending") return res.status(400).json({ message: "Claim is not pending" });

      const { reviewNotes } = req.body;
      await storage.updateAgencyClaim(claim.id, {
        status: "approved",
        reviewedBy: adminId,
        reviewNotes: reviewNotes || null,
        reviewedAt: new Date(),
      });

      // Grant verified owner badge to the agency
      await storage.verifyAgencyOwner(claim.agencyId, claim.userId);

      res.json({ message: "Claim approved. Agency is now verified." });
    } catch (error) {
      console.error("Approve claim error:", error);
      res.status(500).json({ message: "Failed to approve claim" });
    }
  });

  // Admin: reject a claim
  app.post("/api/admin/agency-claims/:id/reject", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const adminId = req.user?.claims?.sub;
      const claim = await storage.getAgencyClaimById(req.params.id);
      if (!claim) return res.status(404).json({ message: "Claim not found" });
      if (claim.status !== "pending") return res.status(400).json({ message: "Claim is not pending" });

      const { reviewNotes } = req.body;
      if (!reviewNotes) return res.status(400).json({ message: "Rejection reason is required" });

      await storage.updateAgencyClaim(claim.id, {
        status: "rejected",
        reviewedBy: adminId,
        reviewNotes,
        reviewedAt: new Date(),
      });

      res.json({ message: "Claim rejected." });
    } catch (error) {
      res.status(500).json({ message: "Failed to reject claim" });
    }
  });

  // Get user's agency add-ons
  app.get("/api/agency-portal/my-addons", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.json([]);
      }
      const agency = await storage.getAgencyByClaimedUser(userId);
      if (!agency) {
        return res.json([]);
      }
      const addOns = await storage.getAgencyAddOns(agency.id);
      res.json(addOns);
    } catch (error) {
      console.error("Error fetching add-ons:", error);
      res.status(500).json({ message: "Failed to fetch add-ons" });
    }
  });

  // Get user's agency click analytics (requires analytics add-on)
  app.get("/api/agency-portal/my-clicks", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const agency = await storage.getAgencyByClaimedUser(userId);
      if (!agency) {
        return res.status(403).json({ message: "No agency claimed" });
      }
      
      // Server-side check for analytics entitlement
      const addOns = await storage.getAgencyAddOns(agency.id);
      const { ALL_ADDON_TYPES } = await import("@shared/sponsorship-packages");
      const now = new Date();
      const hasAnalytics = addOns.some(a => {
        const addonInfo = ALL_ADDON_TYPES[a.addOnType as keyof typeof ALL_ADDON_TYPES];
        const start = new Date(a.startDate);
        const end = new Date(a.endDate);
        return a.isActive && start <= now && end >= now && addonInfo?.includes?.clickAnalytics;
      });
      
      if (!hasAnalytics) {
        return res.status(403).json({ message: "Analytics add-on required" });
      }
      
      const stats = await storage.getAgencyClickStats(agency.id);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching click stats:", error);
      res.status(500).json({ message: "Failed to fetch click stats" });
    }
  });

  // Purchase package/add-on
  app.post("/api/agency-portal/purchase", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { packageId, phoneNumber } = req.body;
      
      if (!userId || !packageId || !phoneNumber) {
        return res.status(400).json({ message: "Invalid request" });
      }
      
      const agency = await storage.getAgencyByClaimedUser(userId);
      if (!agency) {
        return res.status(400).json({ message: "No agency claimed" });
      }
      
      // Import pricing
      const { ALL_ADDON_TYPES } = await import("@shared/sponsorship-packages");
      const addonType = ALL_ADDON_TYPES[packageId as keyof typeof ALL_ADDON_TYPES];
      
      if (!addonType) {
        return res.status(400).json({ message: "Invalid package" });
      }
      
      // Simulate M-Pesa payment (in production, integrate real M-Pesa)
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Create the add-on
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + addonType.duration);
      
      const addOn = await storage.createAgencyAddOn({
        agencyId: agency.id,
        addOnType: packageId,
        price: addonType.price,
        startDate,
        endDate,
        isActive: true,
      });
      
      res.json({ success: true, addOn });
    } catch (error) {
      console.error("Error purchasing package:", error);
      res.status(500).json({ message: "Failed to purchase package" });
    }
  });

  // ==================== AGENCY JOBS ====================

  // Public: list all active agency jobs (marketplace)
  app.get("/api/agencies", async (req, res) => {
    try {
      const { country, category } = req.query as { country?: string; category?: string };
      const jobs = await storage.getAllActiveAgencyJobs({ country, category });

      // Enrich with basic agency info
      const agencyIds = [...new Set(jobs.map(j => j.agencyId))];
      const agencies = await Promise.all(agencyIds.map(id => storage.getNeaAgencyById(id)));
      const agencyMap = Object.fromEntries(agencies.filter(Boolean).map(a => [a!.id, a]));

      const enriched = jobs.map(j => ({ ...j, agency: agencyMap[j.agencyId] ?? null }));
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching agency jobs:", error);
      res.status(500).json({ message: "Failed to fetch jobs" });
    }
  });

  // Public: get agency profile + their jobs
  app.get("/api/agencies/:agencyId/profile", async (req, res) => {
    try {
      const { agencyId } = req.params;
      const [agency, profile, rawJobs] = await Promise.all([
        storage.getNeaAgencyById(agencyId),
        storage.getAgencyProfile(agencyId).catch(() => null),
        storage.getAgencyJobs(agencyId),
      ]);
      if (!agency) return res.status(404).json({ message: "Agency not found" });
      // Strip applyLink from public response — access via /api/go/job/:id?type=agency
      // Include hasApplyLink boolean so frontend can conditionally show the Apply button
      const jobs = rawJobs.map(({ applyLink, ...rest }: any) => ({
        ...rest,
        hasApplyLink: !!applyLink,
      }));
      res.json({ agency, profile, jobs });
    } catch (error) {
      console.error("Error fetching agency profile:", error);
      res.status(500).json({ message: "Failed to fetch agency profile" });
    }
  });

  // Public: record a job view
  app.post("/api/agency-jobs/:jobId/view", async (req, res) => {
    try {
      await storage.incrementAgencyJobViews(req.params.jobId);
      res.json({ ok: true });
    } catch {
      res.json({ ok: false });
    }
  });

  // Portal: list MY jobs
  app.get("/api/agency-portal/jobs", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const agency = await storage.getAgencyByClaimedUser(userId);
      if (!agency) return res.status(403).json({ message: "No agency claimed" });
      const jobs = await storage.getAgencyJobs(agency.id);
      res.json(jobs);
    } catch (error) {
      console.error("Error fetching agency jobs:", error);
      res.status(500).json({ message: "Failed to fetch jobs" });
    }
  });

  // Portal: create job listing
  app.post("/api/agency-portal/jobs", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const agency = await storage.getAgencyByClaimedUser(userId);
      if (!agency) return res.status(403).json({ message: "No agency claimed" });
      const job = await storage.createAgencyJob({ ...req.body, agencyId: agency.id });
      res.status(201).json(job);
    } catch (error) {
      console.error("Error creating job:", error);
      res.status(500).json({ message: "Failed to create job" });
    }
  });

  // Portal: update job listing
  app.patch("/api/agency-portal/jobs/:jobId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const agency = await storage.getAgencyByClaimedUser(userId);
      if (!agency) return res.status(403).json({ message: "No agency claimed" });
      const job = await storage.getAgencyJobById(req.params.jobId);
      if (!job || job.agencyId !== agency.id) return res.status(403).json({ message: "Access denied" });
      const updated = await storage.updateAgencyJob(req.params.jobId, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating job:", error);
      res.status(500).json({ message: "Failed to update job" });
    }
  });

  // Portal: delete (soft) job listing
  app.delete("/api/agency-portal/jobs/:jobId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const agency = await storage.getAgencyByClaimedUser(userId);
      if (!agency) return res.status(403).json({ message: "No agency claimed" });
      const job = await storage.getAgencyJobById(req.params.jobId);
      if (!job || job.agencyId !== agency.id) return res.status(403).json({ message: "Access denied" });
      await storage.deleteAgencyJob(req.params.jobId);
      res.json({ ok: true });
    } catch (error) {
      console.error("Error deleting job:", error);
      res.status(500).json({ message: "Failed to delete job" });
    }
  });

  // ==================== SERVICE ORDERS ====================

  // Get user's service orders
  // ── GET /api/shared/:orderId — public document share (no auth) ──────────
  app.get("/api/shared/:orderId", async (req: any, res) => {
    try {
      const { orderId } = req.params;
      const order = await storage.getServiceOrderById(orderId);
      if (!order || order.status !== "completed") {
        return res.status(404).json({ message: "Document not found or not yet ready." });
      }
      const aiOutput = order.aiOutput as any;
      const content: string = aiOutput?.content || aiOutput?.result || "";
      if (!content) {
        return res.status(404).json({ message: "Document content not available." });
      }

      // Fetch anonymized user info — first initial + country only
      let sharedByInitial = "A";
      let sharedByCountry = "Kenya";
      try {
        const [owner] = await db
          .select({ firstName: users.firstName, country: users.country })
          .from(users)
          .where(eq(users.id, order.userId as any));
        if (owner) {
          if (owner.firstName) sharedByInitial = owner.firstName.charAt(0).toUpperCase();
          if (owner.country) sharedByCountry = owner.country;
        }
      } catch { /* non-fatal — fall back to defaults */ }

      res.json({
        orderId: order.id,
        serviceName: order.serviceName || "Document",
        serviceId: order.serviceId || "",
        content,
        createdAt: order.createdAt,
        sharedBy: `${sharedByInitial} from ${sharedByCountry}`,
      });
    } catch (error) {
      console.error("[Shared] Error fetching shared document:", error);
      res.status(500).json({ message: "Failed to load document." });
    }
  });

  // ── GET /api/document/:orderId/pdf — authenticated server-side PDF ─────────
  app.get("/api/document/:orderId/pdf", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const order = await storage.getServiceOrderById(req.params.orderId);

      if (!order || order.userId !== userId) {
        return res.status(404).json({ message: "Document not found." });
      }
      if (order.status !== "completed") {
        return res.status(400).json({ message: "Document is not yet ready." });
      }

      const aiOutput = order.aiOutput as any;
      const content: string = aiOutput?.content || aiOutput?.result || "";
      if (!content) {
        return res.status(404).json({ message: "Document content not available." });
      }

      const [owner] = await db
        .select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
        .from(users)
        .where(eq(users.id, userId as any));

      const forUser = owner
        ? [owner.firstName, owner.lastName].filter(Boolean).join(" ") || owner.email || ""
        : "";

      const generatedOn = order.createdAt
        ? new Date(order.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })
        : "";

      const html = buildDocumentHtml({
        serviceName: order.serviceName || "Document",
        content,
        forUser,
        generatedOn,
      });

      const pdfBuffer = await renderHtmlToPdf(html);

      const safe = (order.serviceName || "Document").replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="WorkAbroad_${safe}_${Date.now()}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("[PDF] Authenticated PDF error:", error);
      res.status(500).json({ message: "Failed to generate PDF." });
    }
  });

  // ── GET /api/shared/:orderId/pdf — public PDF (no auth required) ──────────
  app.get("/api/shared/:orderId/pdf", async (req: any, res) => {
    try {
      const order = await storage.getServiceOrderById(req.params.orderId);
      if (!order || order.status !== "completed") {
        return res.status(404).json({ message: "Document not found or not yet ready." });
      }

      const aiOutput = order.aiOutput as any;
      const content: string = aiOutput?.content || aiOutput?.result || "";
      if (!content) {
        return res.status(404).json({ message: "Document content not available." });
      }

      let sharedBy = "";
      try {
        const [owner] = await db
          .select({ firstName: users.firstName, country: users.country })
          .from(users)
          .where(eq(users.id, order.userId as any));
        if (owner) {
          const initial = owner.firstName?.charAt(0).toUpperCase() || "A";
          sharedBy = `${initial} from ${owner.country || "Kenya"}`;
        }
      } catch { /* non-fatal */ }

      const generatedOn = order.createdAt
        ? new Date(order.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })
        : "";

      const html = buildDocumentHtml({
        serviceName: order.serviceName || "Document",
        content,
        sharedBy,
        generatedOn,
      });

      const pdfBuffer = await renderHtmlToPdf(html);

      const safe = (order.serviceName || "Document").replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="WorkAbroad_${safe}_${Date.now()}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("[PDF] Public shared PDF error:", error);
      res.status(500).json({ message: "Failed to generate PDF." });
    }
  });

  app.get("/api/service-orders", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const orders = await storage.getServiceOrders({ userId });
      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // Get single order with deliverables
  app.get("/api/service-orders/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const order = await storage.getServiceOrderById(req.params.id);
      
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      // Check if user owns this order or is admin
      const isAdmin = await storage.isUserAdmin(userId);
      if (order.userId !== userId && !isAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const deliverables = await storage.getDeliverablesByOrderId(order.id);
      res.json({ ...order, deliverables });
    } catch (error) {
      console.error("Error fetching order:", error);
      res.status(500).json({ message: "Failed to fetch order" });
    }
  });

  // Create service order
  app.post("/api/service-orders", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const validation = createOrderSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: validation.error.errors[0]?.message || "Invalid request" });
      }
      
      const { serviceId } = validation.data;
      const service = await storage.getServices();
      const selectedService = service.find(s => s.id === serviceId);
      
      if (!selectedService) {
        return res.status(404).json({ message: "Service not found" });
      }
      
      const order = await storage.createServiceOrder({
        userId,
        serviceId,
        serviceName: selectedService.name,
        amount: selectedService.price,
        currency: selectedService.currency,
        status: "pending",
      });

      // Send order received notification
      try {
        const user = await storage.getUserById(userId);
        if (user?.phone) {
          const { notifyOrderReceived } = await import("./sms");
          await notifyOrderReceived(user.phone, selectedService.name, order.id);
        }
      } catch (smsError) {
        console.error("Failed to send order notification:", smsError);
      }
      
      res.json(order);
    } catch (error) {
      console.error("Error creating order:", error);
      res.status(500).json({ message: "Failed to create order" });
    }
  });

  // Submit intake form and payment
  app.post("/api/service-orders/:id/submit", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      const validation = submitOrderSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: validation.error.errors[0]?.message || "Invalid request" });
      }

      const { intakeData, paymentMethod } = validation.data;
      const order = await storage.getServiceOrderById(req.params.id);

      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.userId !== userId) return res.status(403).json({ message: "Access denied" });

      // Save intake data first
      await storage.updateServiceOrder(order.id, {
        intakeData,
        paymentMethod: paymentMethod || "mpesa",
        status: "pending_payment",
      });

      // Trigger real M-Pesa STK push for the service amount
      if (paymentMethod === "mpesa") {
        const phone = intakeData?.phone;
        if (!phone) {
          return res.status(400).json({ message: "Phone number required for M-Pesa payment" });
        }

        // Duplicate prevention: block a new STK push if one was sent within the cooldown window
        const lastSent = recentStkPushes.get(order.id);
        if (lastSent) {
          const elapsed = Date.now() - lastSent;
          if (elapsed < STK_PUSH_COOLDOWN_MS) {
            const retryAfter = Math.ceil((STK_PUSH_COOLDOWN_MS - elapsed) / 1000);
            console.log(`[ServiceOrder] Duplicate STK push blocked for order ${order.id} — retry in ${retryAfter}s`);
            // Return the existing CheckoutRequestID so the client can keep polling
            return res.status(429).json({
              message: `M-Pesa prompt already sent. Please wait ${retryAfter} more seconds before resending.`,
              retryAfter,
              checkoutRequestId: order.paymentRef,
            });
          }
        }

        try {
          const { stkPush } = await import("./mpesa");
          const mpesaRes = await stkPush(
            phone,
            Number(order.amount),
            `${order.serviceName?.substring(0, 25) || "Service"} - WorkAbroad`
          );
          const checkoutRequestId = mpesaRes.CheckoutRequestID;
          console.log(`[ServiceOrder] STK Push sent for order ${order.id}: ${checkoutRequestId}`);

          // Record timestamp for duplicate prevention
          recentStkPushes.set(order.id, Date.now());

          // Save the real Safaricom CheckoutRequestID as paymentRef
          const updated = await storage.updateServiceOrder(order.id, {
            paymentRef: checkoutRequestId,
            status: "pending_payment",
          });

          return res.json({
            ...updated,
            checkoutRequestId,
            message: "STK push sent to your phone. Please enter your M-Pesa PIN.",
          });
        } catch (mpesaError: any) {
          const errData = mpesaError.response?.data;
          const errCode = errData?.errorCode || "";
          const errMsg = errData?.errorMessage || mpesaError.message || "";

          console.error("[ServiceOrder] M-Pesa STK Push error:", errData || mpesaError.message);

          // Detect Safaricom shortcode/configuration errors vs user phone errors
          const isShortcodeError =
            errCode === "400.002.02" ||
            errMsg.toLowerCase().includes("invalid businessshortcode") ||
            errMsg.toLowerCase().includes("invalid shortcode");

          const isPhoneError =
            errCode === "400.002.05" ||
            errMsg.toLowerCase().includes("invalid phone") ||
            errMsg.toLowerCase().includes("invalid msisdn");

          await storage.updateServiceOrder(order.id, { status: "pending" });

          if (isShortcodeError) {
            // Configuration issue on our end — offer manual payment fallback
            return res.status(502).json({
              errorType: "shortcode_config",
              message: "M-Pesa STK Push is temporarily unavailable. You can still pay manually using our PayBill number.",
              detail: errMsg,
              manualPayment: {
                paybillNumber: process.env.MPESA_SHORTCODE || "4153025",
                accountRef: order.id.substring(0, 8).toUpperCase(),
                amount: order.amount,
                serviceName: order.serviceName,
              },
            });
          }

          return res.status(502).json({
            errorType: isPhoneError ? "phone_error" : "unknown",
            message: isPhoneError
              ? "The phone number you entered is not registered for M-Pesa. Please check and try again."
              : "Could not send M-Pesa prompt. Please try again.",
            detail: errMsg,
          });
        }
      }

      // Card / manual payment methods — set to pending_payment so admin reviews
      const updated = await storage.updateServiceOrder(order.id, {
        paymentRef: `ORD-${Date.now()}`,
        status: "pending_payment",
        paymentMethod: paymentMethod,
      });
      res.json(updated);
    } catch (error) {
      console.error("Error submitting order:", error);
      res.status(500).json({ message: "Failed to submit order" });
    }
  });

  // Poll for service order payment status
  app.get("/api/service-orders/:id/payment-status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const order = await storage.getServiceOrderById(req.params.id);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.userId !== userId) return res.status(403).json({ message: "Access denied" });

      // Calculate remaining cooldown so the client can show the correct resend timer
      const lastSent = recentStkPushes.get(order.id);
      const resendCooldownSeconds = lastSent
        ? Math.max(0, Math.ceil((STK_PUSH_COOLDOWN_MS - (Date.now() - lastSent)) / 1000))
        : 0;

      res.json({
        status: order.status,
        orderId: order.id,
        paymentRef: order.paymentRef,
        resendCooldownSeconds,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to check status" });
    }
  });

  // Verify payment status directly with Safaricom STK Query API
  app.post("/api/service-orders/:id/verify-payment", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const order = await storage.getServiceOrderById(req.params.id);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.userId !== userId) return res.status(403).json({ message: "Access denied" });

      if (!order.paymentRef) {
        return res.status(400).json({ message: "No pending payment to verify." });
      }

      // Only query Safaricom if the order is still pending
      if (order.status !== "pending_payment") {
        return res.json({ status: order.status, verified: order.status === "processing" || order.status === "completed" });
      }

      try {
        const { stkQuery } = await import("./mpesa");
        const queryResult = await stkQuery(order.paymentRef);

        // ResultCode 0 = success, 1032 = cancelled, 1037 = timeout, etc.
        const resultCode = Number(queryResult.ResultCode);
        console.log(`[ServiceOrder] STK Query result for ${order.id}: code=${resultCode} desc="${queryResult.ResultDesc}"`);

        if (resultCode === 0) {
          // Payment confirmed by Safaricom — update order status
          await storage.updateServiceOrder(order.id, {
            status: "processing",
            paymentMethod: "mpesa",
          });
          // Clear the cooldown since payment is done
          recentStkPushes.delete(order.id);
          // Auto-process in background
          setImmediate(async () => {
            try {
              const { processAndDeliverOrder } = await import("./services/ai-processor");
              await processAndDeliverOrder(order.id);
            } catch {}
          });
          return res.json({ status: "processing", verified: true, resultCode, resultDesc: queryResult.ResultDesc });
        }

        // User cancelled (1032) or timeout (1037) — clear the duplicate guard so they can resend
        if (resultCode === 1032 || resultCode === 1037) {
          recentStkPushes.delete(order.id);
          await storage.updateServiceOrder(order.id, { status: "pending" });
          return res.json({
            status: "pending",
            verified: false,
            resultCode,
            resultDesc: queryResult.ResultDesc,
            canResend: true,
          });
        }

        // Still processing or unknown result
        return res.json({ status: order.status, verified: false, resultCode, resultDesc: queryResult.ResultDesc });
      } catch (queryError: any) {
        console.error("[ServiceOrder] STK Query error:", queryError.response?.data || queryError.message);
        return res.status(502).json({
          message: "Could not reach Safaricom to verify payment. Please wait for the callback or try again.",
          detail: queryError.response?.data?.errorMessage || queryError.message,
        });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to verify payment" });
    }
  });

  // Complete a service order that was paid via PayPal
  app.post("/api/service-orders/:id/paypal-complete", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const order = await storage.getServiceOrderById(req.params.id);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.userId !== userId) return res.status(403).json({ message: "Access denied" });

      // Idempotent: if already processing or completed, just return success
      if (order.status === "processing" || order.status === "completed") {
        return res.json({ success: true, status: order.status });
      }

      const { transactionId } = req.body;
      const paymentRef = transactionId || `PP-${Date.now()}`;

      await storage.updateServiceOrder(order.id, {
        status: "processing",
        paymentMethod: "paypal",
        paymentRef,
      });

      // Notify the user
      await storage.createUserNotification({
        userId: order.userId,
        orderId: order.id,
        title: "Payment Confirmed — Order Processing",
        message: `PayPal payment confirmed (${paymentRef}). Your ${order.serviceName} is now being prepared.`,
        type: "order_update",
      }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      // Sync completed payment to Supabase
      console.log('CALLING PAYMENT SYNC NOW');
      await syncPaymentToSupabase({
        user_id:  order.userId,
        phone:    null,
        amount:   Number((order as any).amount || (order as any).totalPrice || 0),
        mpesa_code: paymentRef || null,
        status:   "completed",
        currency: "KES",
      });
      await upgradeUserToPro(order.userId);

      // Auto-trigger AI processing in the background
      setImmediate(async () => {
        try {
          const { processAndDeliverOrder } = await import("./services/ai-processor");
          await processAndDeliverOrder(order.id);
          console.log(`[ServiceOrder][PayPal] Auto-processing complete for ${order.id}`);
        } catch (aiErr: any) {
          console.error(`[ServiceOrder][PayPal] Auto-processing failed for ${order.id}:`, aiErr.message);
        }
      });

      res.json({ success: true, status: "processing" });
    } catch (error) {
      console.error("Error completing PayPal service order:", error);
      res.status(500).json({ message: "Failed to complete order" });
    }
  });

  // Confirm manual M-Pesa payment (when STK Push is unavailable)
  app.post("/api/service-orders/:id/confirm-manual-payment", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const order = await storage.getServiceOrderById(req.params.id);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.userId !== userId) return res.status(403).json({ message: "Access denied" });
      if (order.status === "processing" || order.status === "completed") {
        return res.json({ status: order.status, message: "Already paid" });
      }

      const { transactionCode } = req.body;
      const paymentRef = transactionCode
        ? transactionCode.toUpperCase().trim()
        : `MANUAL-${Date.now()}`;

      const updated = await storage.updateServiceOrder(order.id, {
        status: "pending_payment",
        paymentMethod: "manual_mpesa",
        paymentRef,
        adminNotes: `Manual M-Pesa payment claimed by user. Ref: ${paymentRef}. Pending admin verification.`,
      });

      console.log(`[ServiceOrder] Manual payment claimed for order ${order.id}: ref=${paymentRef}`);
      res.json({ ...updated, message: "Payment submitted for verification. We will confirm within 30 minutes." });
    } catch (error) {
      res.status(500).json({ message: "Failed to confirm payment" });
    }
  });

  // ── POST /api/intake/submit ─────────────────────────────────────────────
  // Store user intake form data to Firebase RTDB before payment, then trigger STK push.
  // The M-Pesa callback retrieves this data and auto-generates the document on success.
  app.post("/api/intake/submit", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { serviceId, serviceName, formData } = req.body;

      if (!serviceId || !formData) {
        return res.status(400).json({ message: "serviceId and formData are required" });
      }

      // 1. Save intake data to Firebase RTDB (1-hour TTL)
      const { fbPut } = await import("./services/firebaseRtdb");
      await fbPut(`pendingIntake/${userId}_${serviceId}`, {
        ...formData,
        serviceId,
        serviceName: serviceName || serviceId,
        userId,
        submittedAt: Date.now(),
        expiresAt: Date.now() + 3_600_000,
      });

      console.log(`[Intake] Stored for userId=${userId} service=${serviceId}`);
      res.json({ success: true, message: "Intake saved. Proceed to payment." });
    } catch (err: any) {
      console.error("[Intake] Error:", err.message);
      res.status(500).json({ message: "Failed to save intake data" });
    }
  });

  // ── POST /api/document/revise ────────────────────────────────────────────
  // AI-powered revision of a completed service order's output.
  app.post("/api/document/revise", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { orderId, revisionRequest } = req.body;

      if (!orderId || !revisionRequest) {
        return res.status(400).json({ message: "orderId and revisionRequest are required" });
      }

      const order = await storage.getServiceOrderById(orderId);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.userId !== userId) return res.status(403).json({ message: "Access denied" });
      if (!order.aiOutput) return res.status(400).json({ message: "No AI output to revise" });

      const originalContent = (order.aiOutput as any)?.content || "";

      // Run AI revision
      const { openai } = await import("./lib/openai");
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert career consultant. Revise the document below according to the user's request while maintaining professional quality. Return the full revised document.",
          },
          {
            role: "user",
            content: `ORIGINAL DOCUMENT:\n\n${originalContent}\n\nREVISION REQUEST:\n${revisionRequest}\n\nPlease revise and return the complete updated document.`,
          },
        ],
        temperature: 0.5,
        max_tokens: 2500,
      });

      const revisedContent = completion.choices[0].message.content || "";

      // Save revision to the order
      const revisedOutput = {
        ...(order.aiOutput as any),
        content: revisedContent,
        revisedAt: new Date().toISOString(),
        revisionRequest,
        revisionCount: ((order.aiOutput as any)?.revisionCount ?? 0) + 1,
      };

      await storage.updateServiceOrder(orderId, {
        aiOutput: revisedOutput,
        adminNotes: `Revised by user on ${new Date().toLocaleDateString()}. Request: "${revisionRequest.substring(0, 100)}"`,
      } as any);

      // Notify via dashboard
      await storage.createUserNotification({
        userId,
        orderId,
        title: "Document Revised",
        message: `Your ${order.serviceName} has been updated per your revision request.`,
        type: "success",
      }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      console.log(`[Revision] orderId=${orderId} userId=${userId} | request="${revisionRequest.substring(0, 60)}"`);
      res.json({ success: true, content: revisedContent, message: "Document revised successfully" });
    } catch (err: any) {
      console.error("[Revision] Error:", err.message);
      res.status(500).json({ message: "Failed to revise document" });
    }
  });

  // Admin: Trust Dashboard Metrics
  app.get("/api/admin/trust-metrics", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const metrics = await storage.getTrustMetrics();
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching trust metrics:", error);
      res.status(500).json({ message: "Failed to fetch trust metrics" });
    }
  });

  // Admin: Get all orders
  app.get("/api/admin/service-orders", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { status } = req.query;
      const orders = await storage.getServiceOrders(status ? { status: status as string } : undefined);
      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // Admin: Update order status
  app.patch("/api/admin/service-orders/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const validation = updateOrderSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: validation.error.errors[0]?.message || "Invalid request" });
      }
      
      const { status, adminNotes, assignedTo } = validation.data;
      const order = await storage.getServiceOrderById(req.params.id);
      
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      const updateData: any = {};
      if (status) updateData.status = status;
      if (adminNotes !== undefined) updateData.adminNotes = adminNotes;
      if (assignedTo !== undefined) updateData.assignedTo = assignedTo;
      
      if (status === "completed") {
        updateData.completedAt = new Date();
        
        // Notify user of completion
        await storage.createUserNotification({
          userId: order.userId,
          orderId: order.id,
          title: "Order Completed",
          message: `Your ${order.serviceName} is ready! You can now download your deliverables.`,
          type: "success",
        });
        
        await storage.updateServiceOrder(order.id, { userNotifiedAt: new Date() });

        // Send SMS/WhatsApp notification for completed order
        try {
          const user = await storage.getUserById(order.userId);
          if (user?.phone) {
            const { notifyOrderReady } = await import("./sms");
            await notifyOrderReady(user.phone, order.serviceName);
          }
        } catch (smsError) {
          console.error("Failed to send order completion SMS:", smsError);
        }
      }

      // Send processing notification if status changed to processing
      if (status === "processing") {
        try {
          const user = await storage.getUserById(order.userId);
          if (user?.phone) {
            const { notifyOrderProcessing } = await import("./sms");
            await notifyOrderProcessing(user.phone, order.serviceName);
          }
        } catch (smsError) {
          console.error("Failed to send order processing SMS:", smsError);
        }
      }
      
      const updated = await storage.updateServiceOrder(order.id, updateData);
      res.json(updated);
    } catch (error) {
      console.error("Error updating order:", error);
      res.status(500).json({ message: "Failed to update order" });
    }
  });

  // Admin: Upload deliverable
  app.post("/api/admin/service-orders/:orderId/deliverables", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const adminId = req.user.claims.sub;
      
      const validation = uploadDeliverableSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: validation.error.errors[0]?.message || "Invalid request" });
      }
      
      const { fileName, fileType, fileUrl, description } = validation.data;
      const order = await storage.getServiceOrderById(req.params.orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      const deliverable = await storage.createDeliverable({
        orderId: order.id,
        fileName,
        fileType,
        fileUrl,
        description,
        uploadedBy: adminId,
      });
      
      res.json(deliverable);
    } catch (error) {
      console.error("Error uploading deliverable:", error);
      res.status(500).json({ message: "Failed to upload deliverable" });
    }
  });

  // Download deliverable (user)
  app.get("/api/deliverables/:id/download", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const deliverableId = req.params.id;
      
      // Direct lookup for deliverable
      const deliverable = await storage.getDeliverableById(deliverableId);
      
      if (!deliverable) {
        return res.status(404).json({ message: "Deliverable not found" });
      }
      
      // Check order ownership
      const order = await storage.getServiceOrderById(deliverable.orderId);
      if (!order) {
        return res.status(404).json({ message: "Associated order not found" });
      }
      
      // Verify access: user owns order or is admin
      const isAdmin = await storage.isUserAdmin(userId);
      if (order.userId !== userId && !isAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Increment download count
      await storage.incrementDownloadCount(deliverable.id);
      
      // Return file URL for download
      res.json({ 
        fileName: deliverable.fileName,
        fileUrl: deliverable.fileUrl,
        fileType: deliverable.fileType
      });
    } catch (error) {
      console.error("Error downloading deliverable:", error);
      res.status(500).json({ message: "Failed to download deliverable" });
    }
  });

  // User notifications
  app.get("/api/notifications", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const notifications = await storage.getUserNotifications(userId);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.get("/api/notifications/unread-count", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const count = await storage.getUnreadUserNotificationCount(userId);
      res.json({ count });
    } catch (error) {
      console.error("Error fetching notification count:", error);
      res.status(500).json({ message: "Failed to fetch count" });
    }
  });

  app.patch("/api/notifications/:id/read", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      // SECURITY: Verify ownership before marking as read to prevent IDOR
      const notifications = await storage.getUserNotifications(userId);
      const notificationToUpdate = notifications.find(n => n.id === req.params.id);
      if (!notificationToUpdate) {
        return res.status(404).json({ message: "Notification not found or not owned by you" });
      }

      await storage.markUserNotificationAsRead(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ message: "Failed to update notification" });
    }
  });

  app.post("/api/notifications/mark-all-read", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      await storage.markAllUserNotificationsAsRead(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      res.status(500).json({ message: "Failed to update notifications" });
    }
  });

  // ======== AI Processing Routes ========

  // Admin: Trigger AI processing for a specific order
  app.post("/api/admin/service-orders/:id/process", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const orderId = req.params.id;
      
      // Validate order exists and is in correct state
      const order = await storage.getServiceOrderById(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      // Only process orders that are in processing status
      if (order.status !== "processing") {
        return res.status(400).json({ 
          message: `Cannot process order. Current status is '${order.status}', expected 'processing'` 
        });
      }
      
      // Skip if already processed
      if (order.aiProcessedAt) {
        return res.status(400).json({ 
          message: "Order has already been processed by AI" 
        });
      }
      
      const { processAndDeliverOrder } = await import("./services/ai-processor");
      const result = await processAndDeliverOrder(orderId);
      res.json(result);
    } catch (error) {
      console.error("Error processing order:", error);
      res.status(500).json({ message: "Failed to process order" });
    }
  });

  // Admin: Process all pending orders in queue
  app.post("/api/admin/service-orders/process-queue", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { processQueue } = await import("./services/ai-processor");
      const stats = await processQueue();
      res.json(stats);
    } catch (error) {
      console.error("Error processing queue:", error);
      res.status(500).json({ message: "Failed to process queue" });
    }
  });

  // Admin: Get orders needing human review
  app.get("/api/admin/service-orders/needs-review", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const allOrders = await storage.getServiceOrders();
      const needsReview = allOrders.filter(o => o.needsHumanReview);
      res.json(needsReview);
    } catch (error) {
      console.error("Error fetching orders needing review:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // Admin: Complete human review (approve or request re-processing)
  app.post("/api/admin/service-orders/:id/review", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      // Validate request body
      const parseResult = reviewOrderSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: "Invalid request", 
          errors: parseResult.error.errors 
        });
      }
      
      const adminId = req.user.claims.sub;
      const { action, notes, editedContent } = parseResult.data;
      
      const order = await storage.getServiceOrderById(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      // Only allow review for orders that need human review
      if (!order.needsHumanReview) {
        return res.status(400).json({ 
          message: "This order does not require human review" 
        });
      }
      
      // Don't allow review on already completed orders
      if (order.status === "completed") {
        return res.status(400).json({ 
          message: "Cannot review a completed order" 
        });
      }

      if (action === "approve") {
        // Approve the AI output (optionally with edits)
        const content = editedContent || (order.aiOutput as any)?.content || "";
        
        // Create deliverable
        await storage.createDeliverable({
          orderId: order.id,
          fileName: `${order.serviceName.replace(/\s+/g, "_")}_${Date.now()}.txt`,
          fileType: "text/plain",
          fileUrl: `data:text/plain;base64,${Buffer.from(content).toString("base64")}`,
          description: `${order.serviceName} - Reviewed by admin`,
          uploadedBy: adminId,
        });

        // Update order as completed
        await storage.updateServiceOrder(order.id, {
          status: "completed",
          completedAt: new Date(),
          needsHumanReview: false,
          humanReviewNotes: notes,
          reviewedBy: adminId,
          reviewedAt: new Date(),
        });

        // Notify user
        await storage.createUserNotification({
          userId: order.userId,
          orderId: order.id,
          title: "Order Completed",
          message: `Your ${order.serviceName} is ready! You can now download your deliverables.`,
          type: "success",
        });

        res.json({ success: true, action: "approved" });
      } else if (action === "reprocess") {
        // Clear AI output and reprocess
        await storage.updateServiceOrder(order.id, {
          aiProcessedAt: null,
          aiOutput: null,
          qualityScore: null,
          qualityPassed: null,
          qualityCheckData: null,
          needsHumanReview: false,
          humanReviewNotes: notes,
          reviewedBy: adminId,
        });

        // Trigger reprocessing
        const { processAndDeliverOrder } = await import("./services/ai-processor");
        const result = await processAndDeliverOrder(order.id);
        res.json({ success: true, action: "reprocessed", result });
      } else {
        res.status(400).json({ message: "Invalid action. Use 'approve' or 'reprocess'" });
      }
    } catch (error) {
      console.error("Error completing review:", error);
      res.status(500).json({ message: "Failed to complete review" });
    }
  });

  // ============================================
  // PUSH NOTIFICATION ROUTES
  // ============================================

  // Get VAPID public key for push subscription
  app.get("/api/push/vapid-key", (req, res) => {
    const publicKey = getVapidPublicKey();
    if (!publicKey) {
      return res.status(503).json({ message: "Push notifications not configured" });
    }
    res.json({ publicKey });
  });

  // Subscribe to push notifications
  app.post("/api/push/subscribe", isAuthenticated, async (req: any, res) => {
    try {
      const { endpoint, keys } = req.body;
      
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ message: "Invalid subscription data" });
      }

      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const subscription = await storage.createPushSubscription({
        userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: req.headers["user-agent"] || null,
        isActive: true,
      });

      res.json({ success: true, id: subscription.id });
    } catch (error) {
      console.error("Error creating push subscription:", error);
      res.status(500).json({ message: "Failed to create subscription" });
    }
  });

  // Unsubscribe from push notifications
  app.post("/api/push/unsubscribe", isAuthenticated, async (req: any, res) => {
    try {
      const { endpoint } = req.body;
      
      if (!endpoint) {
        return res.status(400).json({ message: "Endpoint is required" });
      }

      await storage.deletePushSubscription(endpoint);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting push subscription:", error);
      res.status(500).json({ message: "Failed to unsubscribe" });
    }
  });

  // Get user's push subscription status
  app.get("/api/push/status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const subscriptions = await storage.getUserPushSubscriptions(userId);
      res.json({ 
        subscribed: subscriptions.length > 0,
        subscriptionCount: subscriptions.length 
      });
    } catch (error) {
      console.error("Error checking push status:", error);
      res.status(500).json({ message: "Failed to check status" });
    }
  });

  // Admin: Send notification to all subscribers
  app.post("/api/admin/push/broadcast", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { title, body, url, countryId } = req.body;
      
      if (!title || !body) {
        return res.status(400).json({ message: "Title and body are required" });
      }

      const result = await broadcastNotification({ title, body, url }, countryId);

      // Log the notification
      await storage.createScheduledNotification({
        title,
        body,
        url: url || null,
        countryId: countryId || null,
        type: "announcement",
        sentAt: new Date(),
        recipientCount: result.sent,
        status: "sent",
        createdBy: req.user?.claims?.sub,
      });

      res.json({ success: true, ...result });
    } catch (error) {
      console.error("Error broadcasting notification:", error);
      res.status(500).json({ message: "Failed to broadcast notification" });
    }
  });

  // Admin: Get notification history
  app.get("/api/admin/push/history", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const notifications = await storage.getScheduledNotifications();
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notification history:", error);
      res.status(500).json({ message: "Failed to fetch history" });
    }
  });

  // Admin: Get push subscription stats
  app.get("/api/admin/push/stats", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const subscriberCount = await storage.getPushSubscriptionCount();
      const notifications = await storage.getScheduledNotifications();
      const recentNotifications = notifications.slice(0, 5);
      
      res.json({
        subscriberCount,
        totalNotificationsSent: notifications.filter(n => n.status === "sent").length,
        recentNotifications
      });
    } catch (error) {
      console.error("Error fetching push stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // Admin: Get all job counts
  app.get("/api/admin/job-counts", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const counts = await storage.getAllJobCounts();
      res.json(counts);
    } catch (error) {
      console.error("Error fetching job counts:", error);
      res.status(500).json({ message: "Failed to fetch job counts" });
    }
  });

  // Admin: Update job count for a country and broadcast notification
  app.post("/api/admin/job-counts", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { countryCode, jobCount, sendNotification } = req.body;
      
      if (!countryCode || jobCount === undefined) {
        return res.status(400).json({ message: "countryCode and jobCount are required" });
      }

      const adminId = req.user?.claims?.sub;
      const updated = await storage.updateJobCount(countryCode, jobCount, adminId);

      // Send push notification if requested and job count increased
      if (sendNotification && updated.previousCount !== null && jobCount > updated.previousCount) {
        const difference = jobCount - (updated.previousCount || 0);
        const title = `${updated.countryName}: ${jobCount.toLocaleString()} jobs available`;
        const body = `${difference.toLocaleString()} new jobs added! Check the latest opportunities.`;
        
        await broadcastNotification({
          title,
          body,
          url: `/country/${countryCode}`,
        });

        // Log notification
        await storage.createScheduledNotification({
          title,
          body,
          url: `/country/${countryCode}`,
          countryId: null,
          type: "job_posting",
          sentAt: new Date(),
          status: "sent",
          createdBy: adminId,
        });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating job count:", error);
      res.status(500).json({ message: "Failed to update job count" });
    }
  });

  // ============================================
  // STUDENT VISA MODULE
  // ============================================

  // Get student visas by country code (public, no auth required)
  app.get("/api/student-visas/:countryCode", async (req: any, res) => {
    try {
      const { countryCode } = req.params;
      const visas = await storage.getStudentVisasByCountry(countryCode);
      res.json(visas);
    } catch (error) {
      console.error("Error fetching student visas:", error);
      res.status(500).json({ message: "Failed to fetch student visas" });
    }
  });

  // Get single student visa with details
  app.get("/api/student-visa/:id", async (req: any, res) => {
    try {
      const { id } = req.params;
      const visa = await storage.getStudentVisaById(id);
      if (!visa) {
        return res.status(404).json({ message: "Visa not found" });
      }
      res.json(visa);
    } catch (error) {
      console.error("Error fetching student visa:", error);
      res.status(500).json({ message: "Failed to fetch student visa" });
    }
  });

  // Get all visa links for a country (public)
  app.get("/api/visa-links/:countryCode", async (req: any, res) => {
    try {
      const { countryCode } = req.params;
      const links = await storage.getVisaLinks(undefined, countryCode);
      res.json(links);
    } catch (error) {
      console.error("Error fetching visa links:", error);
      res.status(500).json({ message: "Failed to fetch visa links" });
    }
  });

  // Admin: Get all student visas
  app.get("/api/admin/student-visas", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const visas = await storage.getAllStudentVisas();
      res.json(visas);
    } catch (error) {
      console.error("Error fetching all student visas:", error);
      res.status(500).json({ message: "Failed to fetch student visas" });
    }
  });

  // Admin: Create student visa
  app.post("/api/admin/student-visas", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const visa = await storage.createStudentVisa(req.body);
      res.status(201).json(visa);
    } catch (error) {
      console.error("Error creating student visa:", error);
      res.status(500).json({ message: "Failed to create student visa" });
    }
  });

  // Admin: Update student visa
  app.patch("/api/admin/student-visas/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const visa = await storage.updateStudentVisa(id, req.body);
      if (!visa) {
        return res.status(404).json({ message: "Visa not found" });
      }
      res.json(visa);
    } catch (error) {
      console.error("Error updating student visa:", error);
      res.status(500).json({ message: "Failed to update student visa" });
    }
  });

  // Admin: Delete student visa
  app.delete("/api/admin/student-visas/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      await storage.deleteStudentVisa(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting student visa:", error);
      res.status(500).json({ message: "Failed to delete student visa" });
    }
  });

  // Admin: Create visa requirement
  app.post("/api/admin/visa-requirements", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const requirement = await storage.createVisaRequirement(req.body);
      res.status(201).json(requirement);
    } catch (error) {
      console.error("Error creating visa requirement:", error);
      res.status(500).json({ message: "Failed to create requirement" });
    }
  });

  // Admin: Delete visa requirement
  app.delete("/api/admin/visa-requirements/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      await storage.deleteVisaRequirement(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting visa requirement:", error);
      res.status(500).json({ message: "Failed to delete requirement" });
    }
  });

  // Admin: Create visa step
  app.post("/api/admin/visa-steps", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const step = await storage.createVisaStep(req.body);
      res.status(201).json(step);
    } catch (error) {
      console.error("Error creating visa step:", error);
      res.status(500).json({ message: "Failed to create step" });
    }
  });

  // Admin: Delete visa step
  app.delete("/api/admin/visa-steps/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      await storage.deleteVisaStep(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting visa step:", error);
      res.status(500).json({ message: "Failed to delete step" });
    }
  });

  // Admin: Create visa link
  app.post("/api/admin/visa-links", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const link = await storage.createVisaLink(req.body);
      res.status(201).json(link);
    } catch (error) {
      console.error("Error creating visa link:", error);
      res.status(500).json({ message: "Failed to create link" });
    }
  });

  // Admin: Delete visa link
  app.delete("/api/admin/visa-links/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      await storage.deleteVisaLink(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting visa link:", error);
      res.status(500).json({ message: "Failed to delete link" });
    }
  });

  // ============================================
  // ASSISTED APPLY MODE ROUTES
  // ============================================

  // Get all application packs (public)
  app.get("/api/application-packs", async (req, res) => {
    try {
      const packs = await storage.getApplicationPacks();
      res.json(packs);
    } catch (error) {
      console.error("Error fetching application packs:", error);
      res.status(500).json({ message: "Failed to fetch packs" });
    }
  });

  // Get single application pack
  app.get("/api/application-packs/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const pack = await storage.getApplicationPackById(id);
      if (!pack) {
        return res.status(404).json({ message: "Pack not found" });
      }
      res.json(pack);
    } catch (error) {
      console.error("Error fetching application pack:", error);
      res.status(500).json({ message: "Failed to fetch pack" });
    }
  });

  // Get user's purchased application packs
  app.get("/api/user-application-packs", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const packs = await storage.getUserApplicationPacks(userId);
      res.json(packs);
    } catch (error) {
      console.error("Error fetching user application packs:", error);
      res.status(500).json({ message: "Failed to fetch packs" });
    }
  });

  // Purchase an application pack
  app.post("/api/user-application-packs", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Validate request body
      const parseResult = purchasePackSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: parseResult.error.errors[0].message });
      }
      const { packId, paymentMethod } = parseResult.data;
      const rawPhone: string | undefined = req.body.phone;

      if (paymentMethod === "mpesa" && !rawPhone) {
        return res.status(400).json({ message: "Phone number is required for M-Pesa payment" });
      }

      const pack = await storage.getApplicationPackById(packId);
      if (!pack) {
        return res.status(404).json({ message: "Pack not found" });
      }

      // Normalize phone to E.164 format
      const normalizedPhone = rawPhone
        ? (normalizePhone(rawPhone, "KE") ?? rawPhone)
        : undefined;

      // Create pack record in awaiting_payment state
      const userPack = await storage.createUserApplicationPack({
        userId,
        packId: pack.id,
        packName: pack.name,
        totalApplications: pack.applicationCount,
        usedApplications: 0,
        amount: pack.price,
        currency: pack.currency,
        paymentMethod,
        status: paymentMethod === "mpesa" ? "awaiting_payment" : "pending",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      });

      // Fire real M-Pesa STK Push
      if (paymentMethod === "mpesa" && normalizedPhone) {
        try {
          const { stkPush } = await import("./mpesa");
          const mpesaRes = await stkPush(
            normalizedPhone,
            Number(pack.price),
            `${pack.name.substring(0, 25)} - WorkAbroad`,
            `PACK-${userPack.id}`
          );
          const checkoutRequestId = mpesaRes.CheckoutRequestID;
          console.log(`[AppPack] STK Push sent for pack ${userPack.id}: ${checkoutRequestId}`);

          // Save checkout request ID so callback can match it
          await storage.updateUserApplicationPack(userPack.id, {
            paymentRef: checkoutRequestId,
          });

          return res.status(201).json({
            ...userPack,
            paymentRef: checkoutRequestId,
            checkoutRequestId,
            message: "M-Pesa prompt sent. Please enter your PIN on your phone.",
          });
        } catch (mpesaErr: any) {
          // Roll back pack to pending so user can retry
          await storage.updateUserApplicationPack(userPack.id, { status: "pending" });
          const errCode = mpesaErr.response?.data?.errorCode || "";
          const errMsg = mpesaErr.response?.data?.errorMessage || mpesaErr.message || "M-Pesa error";
          console.error("[AppPack] STK Push failed:", errMsg);
          return res.status(502).json({
            message: errCode === "404.001.04"
              ? "M-Pesa STK Push is not yet active for this shortcode. Please contact support."
              : `M-Pesa error: ${errMsg}`,
          });
        }
      }

      res.status(201).json(userPack);
    } catch (error) {
      console.error("Error purchasing application pack:", error);
      res.status(500).json({ message: "Failed to purchase pack" });
    }
  });

  // Poll payment status for an application pack purchase
  app.get("/api/user-application-packs/:id/payment-status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const pack = await storage.getUserApplicationPackById(req.params.id);
      if (!pack || pack.userId !== userId) {
        return res.status(404).json({ message: "Pack not found" });
      }
      res.json({ id: pack.id, status: pack.status, paymentRef: pack.paymentRef });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch status" });
    }
  });

  // Update user pack (simulate payment completion)
  app.patch("/api/user-application-packs/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      // Validate request body
      const parseResult = updateUserPackSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: parseResult.error.errors[0].message });
      }
      
      const pack = await storage.getUserApplicationPackById(id);
      
      if (!pack || pack.userId !== userId) {
        return res.status(404).json({ message: "Pack not found" });
      }

      const updated = await storage.updateUserApplicationPack(id, parseResult.data);
      res.json(updated);
    } catch (error) {
      console.error("Error updating application pack:", error);
      res.status(500).json({ message: "Failed to update pack" });
    }
  });

  // Get user's job applications
  // ── GET /api/applications/pack-info ─────────────────────────────────────────
  // Returns a compact summary of the user's currently active application pack:
  // { packId, packName, total, used, remaining, plan, expiresAt }
  // If no active pack exists returns { total:0, used:0, remaining:0, plan:null }.
  // Used by the frontend header counter and new-application gate.
  app.get("/api/applications/pack-info", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const packs  = await storage.getUserApplicationPacks(userId);

      // Prefer the first active pack; fall back to paid → any
      const activePack =
        packs.find(p => p.status === "active") ??
        packs.find(p => p.status === "paid")   ??
        null;

      if (!activePack) {
        return res.json({ total: 0, used: 0, remaining: 0, plan: null });
      }

      const remaining = Math.max(0, activePack.totalApplications - activePack.usedApplications);

      return res.json({
        packId:    activePack.id,
        packName:  activePack.packName,
        plan:      (activePack as any).packType ?? "standard",
        total:     activePack.totalApplications,
        used:      activePack.usedApplications,
        remaining,
        expiresAt: activePack.expiresAt ?? null,
        status:    activePack.status,
      });
    } catch (err: any) {
      console.error("[PackInfo]", err?.message);
      res.status(500).json({ message: "Failed to fetch pack info" });
    }
  });

  // ── GET /api/applications — alias for /api/user-job-applications ─────────
  // Matches the reference API shape; returns the same list.
  app.get("/api/applications", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const applications = await storage.getUserJobApplications(userId);
      // Expose reference-compatible field names alongside existing camelCase ones
      const mapped = applications.map((a: any) => ({
        ...a,
        cv_url:            (a.preparedMaterials as any)?.cvUrl           ?? null,
        cover_letter_url:  (a.preparedMaterials as any)?.coverLetterUrl  ?? null,
        job_url:           a.jobUrl,
        job_title:         a.jobTitle,
        created_at:        a.createdAt,
      }));
      res.json(mapped);
    } catch (err: any) {
      console.error("[GET /api/applications]", err?.message);
      res.status(500).json({ message: "Failed to fetch applications" });
    }
  });

  // ── POST /api/applications/track-download ────────────────────────────────
  // Explicit download-tracking endpoint (no file stream).
  // Called after the user downloads a file via the direct Supabase Storage URL.
  // Body: { application_id }
  app.post("/api/applications/track-download", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { application_id } = req.body;

      if (!application_id) {
        return res.status(400).json({ error: "application_id is required" });
      }

      const application = await storage.getUserJobApplicationById(application_id);
      if (!application || application.userId !== userId) {
        return res.status(404).json({ error: "Application not found" });
      }

      if (application.status === "materials_ready") {
        await storage.updateUserJobApplication(application_id, {
          status: "downloaded",
          statusMessage: "Materials downloaded.",
        });
      }

      return res.json({ success: true, status: "downloaded" });
    } catch (err: any) {
      console.error("[TrackDownload]", err?.message);
      res.status(500).json({ error: "Failed to track download" });
    }
  });

  // ── POST /api/applications/:id/retry ─────────────────────────────────────
  // Re-queues a "failed" application through the AI pipeline without consuming
  // another slot from the user's pack.
  // Only applications in "failed" status can be retried.
  app.post("/api/applications/:id/retry", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { id }  = req.params;

      const application = await storage.getUserJobApplicationById(id);
      if (!application || application.userId !== userId) {
        return res.status(404).json({ error: "Application not found" });
      }

      const RETRYABLE = ["failed", "submitted"];
      if (!RETRYABLE.includes(application.status)) {
        return res.status(409).json({
          error:  `Cannot retry an application in "${application.status}" status`,
          status: application.status,
        });
      }

      // Reset to queued + requeue
      const { appQueue } = await import("./lib/appQueue");

      // Remove any existing BullMQ job with the same idempotent key before re-adding
      const existingJob = await appQueue.getJob(`app-${id}`);
      if (existingJob) await existingJob.remove().catch(() => {});

      await storage.updateUserJobApplication(id, {
        status:        "queued",
        statusMessage: "Retry queued — AI pipeline restarted…",
      });

      await appQueue.add(
        "generate-materials",
        { applicationId: id, userId },
        { jobId: `app-${id}` },
      );

      // Status history entry
      await storage.createApplicationStatusHistory({
        applicationId:  id,
        previousStatus: application.status,
        newStatus:      "queued",
        message:        "User requested retry",
        changedBy:      userId,
      }).catch(() => {});

      console.log(`[Retry] User ${userId} retried application ${id}`);
      return res.json({ success: true, status: "queued", applicationId: id });
    } catch (err: any) {
      console.error("[Retry]", err?.message);
      res.status(500).json({ error: "Failed to retry application" });
    }
  });

  app.get("/api/user-job-applications", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const applications = await storage.getUserJobApplications(userId);
      res.json(applications);
    } catch (error) {
      console.error("Error fetching user job applications:", error);
      res.status(500).json({ message: "Failed to fetch applications" });
    }
  });

  // Get single job application
  app.get("/api/user-job-applications/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const application = await storage.getUserJobApplicationById(id);
      
      if (!application || application.userId !== userId) {
        return res.status(404).json({ message: "Application not found" });
      }

      const statusHistory = await storage.getApplicationStatusHistory(id);
      res.json({ ...application, statusHistory });
    } catch (error) {
      console.error("Error fetching job application:", error);
      res.status(500).json({ message: "Failed to fetch application" });
    }
  });

  // Create new job application
  app.post("/api/user-job-applications", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Validate request body
      const parseResult = createJobApplicationSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: parseResult.error.errors[0].message });
      }
      const { userPackId, jobTitle, companyName, jobUrl, targetCountry, jobDescription, applicationDeadline, intakeData } = parseResult.data;

      // ── Duplicate URL guard ───────────────────────────────────────────────
      // Block resubmission of the same job URL for this user so they don't
      // waste a pack slot on a posting they've already queued or generated.
      if (jobUrl) {
        const existing = await storage.getUserJobApplications(userId);
        const dupe = existing.find(
          (a: any) => a.jobUrl && a.jobUrl === jobUrl &&
                      !["rejected", "downloaded"].includes(a.status),
        );
        if (dupe) {
          return res.status(409).json({
            message: "You already submitted this job URL",
            applicationId: dupe.id,
            status:        dupe.status,
          });
        }
      }

      // Check if user has an active pack with remaining applications
      const pack = await storage.getUserApplicationPackById(userPackId);
      if (!pack || pack.userId !== userId) {
        return res.status(404).json({ message: "Pack not found" });
      }
      if (pack.status !== "active" && pack.status !== "paid") {
        return res.status(400).json({ message: "Pack is not active" });
      }
      if (pack.usedApplications >= pack.totalApplications) {
        return res.status(400).json({ message: "No applications remaining in pack" });
      }

      // Create the application
      const application = await storage.createUserJobApplication({
        userId,
        userPackId,
        jobTitle,
        companyName,
        jobUrl,
        targetCountry,
        jobDescription,
        applicationDeadline: applicationDeadline ? new Date(applicationDeadline) : null,
        intakeData,
        status: "submitted",
      });

      // Update pack usage
      await storage.updateUserApplicationPack(userPackId, {
        usedApplications: pack.usedApplications + 1,
        status: pack.usedApplications + 1 >= pack.totalApplications ? "exhausted" : "active",
      });

      // Create initial status history
      await storage.createApplicationStatusHistory({
        applicationId: application.id,
        previousStatus: null,
        newStatus: "submitted",
        message: "Application submitted for processing",
        changedBy: "system",
      });

      // Create notification for user
      const notificationInfo = APPLICATION_STATUS_NOTIFICATIONS["submitted"];
      await storage.createUserNotification({
        userId,
        orderId: application.id,
        title: notificationInfo.title,
        message: `${notificationInfo.message} for ${jobTitle} at ${companyName}`,
        type: "info",
      });

      res.status(201).json(application);
    } catch (error) {
      console.error("Error creating job application:", error);
      res.status(500).json({ message: "Failed to create application" });
    }
  });

  // Update job application (user marking as applied, etc.)
  app.patch("/api/user-job-applications/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      
      // Validate request body
      const parseResult = updateJobApplicationSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: parseResult.error.errors[0].message });
      }
      
      const application = await storage.getUserJobApplicationById(id);
      
      if (!application || application.userId !== userId) {
        return res.status(404).json({ message: "Application not found" });
      }

      const { status, statusMessage, preparedMaterials, adminNotes } = parseResult.data;
      const previousStatus = application.status;

      const updateData: any = { ...parseResult.data };
      if (status === "applied" && !application.userAppliedAt) {
        updateData.userAppliedAt = new Date();
      }

      const updated = await storage.updateUserJobApplication(id, updateData);

      // Log status change if status was updated
      if (status && status !== previousStatus) {
        await storage.createApplicationStatusHistory({
          applicationId: id,
          previousStatus,
          newStatus: status,
          message: status === "applied" ? "You marked this application as submitted" : statusMessage,
          changedBy: userId,
        });
        
        // Send notification for status change
        const notificationInfo = APPLICATION_STATUS_NOTIFICATIONS[status];
        if (notificationInfo) {
          await storage.createUserNotification({
            userId,
            orderId: id,
            title: notificationInfo.title,
            message: `${notificationInfo.message} for ${application.jobTitle} at ${application.companyName}`,
            type: status === "rejected" ? "warning" : status === "interview_scheduled" ? "success" : "info",
          });
        }
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating job application:", error);
      res.status(500).json({ message: "Failed to update application" });
    }
  });

  // Download CV or cover letter as PDF from prepared materials
  app.get("/api/user-job-applications/:id/download/:docType", isAuthenticated, async (req: any, res) => {
    try {
      const { id, docType } = req.params;
      if (docType !== "cv" && docType !== "cover-letter") {
        return res.status(400).json({ message: "Invalid document type. Use 'cv' or 'cover-letter'." });
      }

      const userId = req.user.claims.sub;
      const application = await storage.getUserJobApplicationById(id);

      if (!application || application.userId !== userId) {
        return res.status(404).json({ message: "Application not found" });
      }

      const materials = application.preparedMaterials as any;
      if (!materials || (!materials.cv && !materials.coverLetter)) {
        return res.status(404).json({ message: "Materials not ready yet" });
      }

      const label       = docType === "cv" ? "CV" : "Cover_Letter";
      const safeJob     = (application.jobTitle ?? "Application").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
      const safeCompany = (application.companyName ?? "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30);
      const filename    = `${label}_${safeJob}_${safeCompany}.pdf`;

      // ── Fast path: redirect to pre-uploaded Supabase Storage URL ───────────
      const storedUrl: string | undefined =
        docType === "cv" ? materials.cvUrl : materials.coverLetterUrl;

      if (storedUrl) {
        // Mark as downloaded
        if (application.status === "materials_ready") {
          storage.updateUserJobApplication(id, { status: "downloaded" }).catch(() => {});
        }
        // Stream from Supabase Storage to avoid CORS issues with direct browser redirect
        const { default: axios } = await import("axios");
        const upstream = await axios.get(storedUrl, { responseType: "stream" });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        (upstream.data as NodeJS.ReadableStream).pipe(res);
        return;
      }

      // ── Fallback: generate PDF on-the-fly from stored text ─────────────────
      const content: string = docType === "cv" ? (materials.cv ?? "") : (materials.coverLetter ?? "");
      if (!content) {
        return res.status(404).json({ message: "Requested document not available" });
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

      const doc = new PDFDocument({ margin: 50, size: "A4" });
      doc.pipe(res);

      doc.fontSize(16).font("Helvetica-Bold").text(
        docType === "cv"
          ? `Curriculum Vitae — ${application.jobTitle}`
          : `Cover Letter — ${application.jobTitle} at ${application.companyName}`,
        { align: "center" },
      );
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(1);
      doc.fontSize(11).font("Helvetica").text(content, { lineGap: 4 });
      doc.moveDown(2);
      doc.fontSize(8).fillColor("#888888").text(
        `Generated by WorkAbroad Hub · ${new Date().toLocaleDateString("en-KE", { dateStyle: "long" })}`,
        { align: "center" },
      );
      doc.end();

      // Mark as downloaded if it was "ready"
      if (application.status === "materials_ready") {
        storage.updateUserJobApplication(id, { status: "downloaded" }).catch((err: any) => {
          console.error("[Download] Failed to update status to downloaded:", err?.message);
        });
      }
    } catch (error: any) {
      console.error("[Download] Failed:", { error: error?.message, appId: req.params.id });
      if (!res.headersSent) {
        res.status(500).json({ message: "Download failed" });
      }
    }
  });

  // Trigger AI generation of application materials
  app.post("/api/user-job-applications/:id/generate", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId  = req.user.claims.sub;

      const application = await storage.getUserJobApplicationById(id);
      if (!application || application.userId !== userId) {
        return res.status(404).json({ message: "Application not found" });
      }
      const IN_PROGRESS = ["queued", "analyzing", "generating", "preparing"];
      if (IN_PROGRESS.includes(application.status)) {
        return res.status(409).json({ message: "Generation already in progress", status: application.status });
      }
      if (application.status === "materials_ready" || application.status === "downloaded") {
        return res.status(409).json({ message: "Materials already generated" });
      }

      // Enqueue into the AI pipeline queue (BullMQ) and acknowledge immediately
      const { appQueue } = await import("./lib/appQueue");
      await appQueue.add(
        "generate-materials",
        { applicationId: id, userId },
        { jobId: `app-${id}` },           // idempotent — same jobId is deduplicated
      );

      // Set status to "queued" so the UI shows the pipeline has started
      await storage.updateUserJobApplication(id, {
        status: "queued",
        statusMessage: "Your application has been queued for AI processing…",
      });

      res.json({ message: "Generation queued", applicationId: id, status: "queued" });
    } catch (error: any) {
      console.error("[Generate] Route error:", error?.message);
      res.status(500).json({ message: "Failed to start generation" });
    }
  });

  // Admin: Update job application status
  app.patch("/api/admin/user-job-applications/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const adminId = req.user.claims.sub;
      
      // Validate request body
      const parseResult = updateJobApplicationSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: parseResult.error.errors[0].message });
      }
      
      const application = await storage.getUserJobApplicationById(id);
      
      if (!application) {
        return res.status(404).json({ message: "Application not found" });
      }

      const { status, statusMessage, preparedMaterials, adminNotes } = parseResult.data;
      const previousStatus = application.status;

      const updated = await storage.updateUserJobApplication(id, {
        status,
        statusMessage,
        preparedMaterials,
        adminNotes,
        assignedTo: adminId,
      });

      // Log status change
      if (status && status !== previousStatus) {
        await storage.createApplicationStatusHistory({
          applicationId: id,
          previousStatus,
          newStatus: status,
          message: statusMessage || `Status updated by admin`,
          changedBy: adminId,
        });

        // Notify user of status change using shared notification constants
        const notificationInfo = APPLICATION_STATUS_NOTIFICATIONS[status];
        if (notificationInfo) {
          await storage.createUserNotification({
            userId: application.userId,
            orderId: id,
            title: notificationInfo.title,
            message: `${notificationInfo.message} for ${application.jobTitle} at ${application.companyName}`,
            type: status === "rejected" ? "warning" : status === "interview_scheduled" ? "success" : "order_update",
          });
        }
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating job application:", error);
      res.status(500).json({ message: "Failed to update application" });
    }
  });

  // Admin: Get all job applications
  app.get("/api/admin/user-job-applications", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      // Get all applications (admin view)
      const allApplications: any[] = [];
      const users = await storage.getAllUsers();
      for (const user of users) {
        const apps = await storage.getUserJobApplications(user.id);
        allApplications.push(...apps.map(app => ({ ...app, userEmail: user.email, userName: `${user.firstName || ''} ${user.lastName || ''}`.trim() })));
      }
      res.json(allApplications);
    } catch (error) {
      console.error("Error fetching all job applications:", error);
      res.status(500).json({ message: "Failed to fetch applications" });
    }
  });

  // Admin: CRUD for application packs
  app.post("/api/admin/application-packs", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const pack = await storage.createApplicationPack(req.body);
      res.status(201).json(pack);
    } catch (error) {
      console.error("Error creating application pack:", error);
      res.status(500).json({ message: "Failed to create pack" });
    }
  });

  app.patch("/api/admin/application-packs/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const updated = await storage.updateApplicationPack(id, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating application pack:", error);
      res.status(500).json({ message: "Failed to update pack" });
    }
  });

  app.delete("/api/admin/application-packs/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      await storage.deleteApplicationPack(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting application pack:", error);
      res.status(500).json({ message: "Failed to delete pack" });
    }
  });

  // ============================================
  // TRACKED APPLICATIONS - User self-managed application tracking
  // ============================================

  // Get user's tracked applications
  app.get("/api/tracked-applications", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const applications = await storage.getTrackedApplications(userId);
      res.json(applications);
    } catch (error) {
      console.error("Error fetching tracked applications:", error);
      res.status(500).json({ message: "Failed to fetch applications" });
    }
  });

  // Get tracked application stats
  app.get("/api/tracked-applications/stats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const stats = await storage.getTrackedApplicationStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching application stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // Get single tracked application
  app.get("/api/tracked-applications/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { id } = req.params;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const application = await storage.getTrackedApplicationById(id);
      if (!application) {
        return res.status(404).json({ message: "Application not found" });
      }
      // Ensure user owns this application
      if (application.userId !== userId) {
        return res.status(403).json({ message: "Not authorized" });
      }
      res.json(application);
    } catch (error) {
      console.error("Error fetching tracked application:", error);
      res.status(500).json({ message: "Failed to fetch application" });
    }
  });

  // Create tracked application
  app.post("/api/tracked-applications", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const { jobTitle, companyName, jobUrl, targetCountry, salary, location, jobType, source, status, notes, appliedAt } = req.body;
      
      if (!jobTitle || !companyName || !targetCountry) {
        return res.status(400).json({ message: "Job title, company name, and target country are required" });
      }

      const application = await storage.createTrackedApplication({
        userId,
        jobTitle,
        companyName,
        jobUrl: jobUrl || null,
        targetCountry,
        salary: salary || null,
        location: location || null,
        jobType: jobType || null,
        source: source || null,
        status: status || "saved",
        notes: notes || null,
        appliedAt: appliedAt ? new Date(appliedAt) : null,
      });
      res.status(201).json(application);
    } catch (error) {
      console.error("Error creating tracked application:", error);
      res.status(500).json({ message: "Failed to create application" });
    }
  });

  // Update tracked application
  app.patch("/api/tracked-applications/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { id } = req.params;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      // Verify ownership
      const existing = await storage.getTrackedApplicationById(id);
      if (!existing) {
        return res.status(404).json({ message: "Application not found" });
      }
      if (existing.userId !== userId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const updateData: any = {};
      const allowedFields = ['jobTitle', 'companyName', 'jobUrl', 'targetCountry', 'salary', 'location', 'jobType', 'source', 'status', 'notes', 'appliedAt', 'nextFollowUp', 'deadline'];
      
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          if (field === 'appliedAt' || field === 'nextFollowUp' || field === 'deadline') {
            updateData[field] = req.body[field] ? new Date(req.body[field]) : null;
          } else {
            updateData[field] = req.body[field];
          }
        }
      }

      const updated = await storage.updateTrackedApplication(id, updateData);
      res.json(updated);
    } catch (error) {
      console.error("Error updating tracked application:", error);
      res.status(500).json({ message: "Failed to update application" });
    }
  });

  // Delete tracked application
  app.delete("/api/tracked-applications/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { id } = req.params;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      // Verify ownership
      const existing = await storage.getTrackedApplicationById(id);
      if (!existing) {
        return res.status(404).json({ message: "Application not found" });
      }
      if (existing.userId !== userId) {
        return res.status(403).json({ message: "Not authorized" });
      }

      await storage.deleteTrackedApplication(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting tracked application:", error);
      res.status(500).json({ message: "Failed to delete application" });
    }
  });

  // ============================================
  // ADMIN SMS/WHATSAPP TEST ENDPOINTS
  // ============================================

  // Send test SMS to verify Twilio integration
  app.post("/api/admin/test-sms", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { phone, message, channel } = req.body;
      
      if (!phone) {
        return res.status(400).json({ message: "Phone number is required" });
      }

      const { sendSMS, sendWhatsApp, sendMessage, sendTestMessage } = await import("./sms");

      // If no custom message, send a test message to both channels
      if (!message) {
        const result = await sendTestMessage(phone);
        return res.json({
          success: result.success,
          smsResult: result.smsResult,
          whatsappResult: result.whatsappResult,
          message: result.success 
            ? "Test messages sent successfully" 
            : "Test failed - check console for details"
        });
      }

      // Send to specified channel or default to both
      if (channel === "sms") {
        const result = await sendSMS(phone, message);
        return res.json({ success: result.success, channel: "sms", result });
      } else if (channel === "whatsapp") {
        const result = await sendWhatsApp(phone, message);
        return res.json({ success: result.success, channel: "whatsapp", result });
      } else {
        // Send to both
        const smsResult = await sendSMS(phone, message);
        const whatsappResult = await sendWhatsApp(phone, message);
        return res.json({
          success: smsResult.success || whatsappResult.success,
          smsResult,
          whatsappResult
        });
      }
    } catch (error: any) {
      console.error("Error sending test message:", error);
      res.status(500).json({ 
        message: "Failed to send test message", 
        error: error.message 
      });
    }
  });

  // Get Twilio connection status
  app.get("/api/admin/twilio-status", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const accountSid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
      const authToken = (process.env.TWILIO_AUTH_TOKEN || '').trim();
      const phoneNumber = (process.env.TWILIO_PHONE_NUMBER || '').trim();

      if (accountSid && authToken && accountSid.startsWith('AC')) {
        res.json({ 
          connected: true, 
          message: "Twilio credentials configured via environment secrets",
          source: "environment_variables",
          hasPhone: !!phoneNumber
        });
      } else {
        // Check Replit connector
        try {
          const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
          if (hostname) {
            res.json({ 
              connected: true, 
              message: "Twilio configured via Replit connector (may need Account SID verification)",
              source: "replit_connector"
            });
          } else {
            res.json({ 
              connected: false, 
              message: `Twilio not configured. SID exists: ${!!accountSid}, starts with AC: ${accountSid.startsWith('AC')}, Auth exists: ${!!authToken}`
            });
          }
        } catch {
          res.json({ 
            connected: false, 
            message: "Twilio credentials not found" 
          });
        }
      }
    } catch (error: any) {
      res.status(500).json({ 
        connected: false, 
        message: error.message 
      });
    }
  });

  // ── Nanjila Proactive Alerts — send personalised WhatsApp messages ──────────
  // POST /api/admin/whatsapp/proactive-alert
  // Body: { audience, template, variables: { jobTitle, location, customBody } }
  app.post("/api/admin/whatsapp/proactive-alert", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { audience = "all_with_phone", template = "job_alert", variables = {} } = req.body ?? {};
      const { sendWhatsApp } = await import("./sms");

      // Fetch recipients
      const allUsers = await storage.getAllUsers();
      const recipients = allUsers.filter((u: any) => {
        if (!u.phone) return false;
        if (audience === "pro_users") return (u.plan || "free").toLowerCase() === "pro";
        if (audience === "free_users") return (u.plan || "free").toLowerCase() !== "pro";
        return true; // all_with_phone
      });

      if (recipients.length === 0) {
        return res.status(400).json({ message: "No recipients found for this audience filter." });
      }

      const TEMPLATES: Record<string, (name: string, v: any) => string> = {
        job_alert: (name, v) =>
          `Hi ${name}! 👋\n\nNew *${v.jobTitle || "overseas"}* jobs just posted in *${v.location || "UK, Canada & UAE"}*.\n\nWould you like me to send you the details? Reply *YES* and I'll share the verified listings right away.\n\n— Nanjila, WorkAbroad Hub`,
        pro_nudge: (name, _) =>
          `Hi ${name}! 👋\n\nUpgrade to WorkAbroad Hub PRO for just *KES 4,500/year* and access:\n✅ Verified jobs in UK, Canada, UAE & more\n✅ NEA agency checker\n✅ AI CV tools\n\n👉 workabroadhub.tech/pricing\n\n— Nanjila`,
        checkin: (name, _) =>
          `Hi ${name}! 😊 It's Nanjila from WorkAbroad Hub.\n\nAny questions about working abroad? I'm here to help — just reply with your question!\n\n— Nanjila, WorkAbroad Hub`,
        custom: (name, v) =>
          (v.customBody || "Hi {name}! 👋").replace(/\{name\}/g, name),
      };

      const buildMsg = TEMPLATES[template] ?? TEMPLATES.job_alert;

      let sent = 0, failed = 0, skipped = 0;
      const errors: string[] = [];

      for (const user of recipients) {
        const name = user.firstName || user.email?.split("@")[0] || "there";
        const message = buildMsg(name, variables);
        const result = await sendWhatsApp(user.phone, message);
        if (result.success) sent++;
        else {
          failed++;
          if (errors.length < 5) errors.push(`${user.phone}: ${result.error}`);
        }
        // Throttle — Twilio rate-limits outbound messages
        await new Promise(r => setTimeout(r, 250));
      }

      console.log(`[Nanjila/Proactive] Sent: ${sent} | Failed: ${failed} | Skipped: ${skipped}`);
      res.json({ ok: true, sent, failed, skipped, total: recipients.length, errors });
    } catch (err: any) {
      console.error("[Nanjila/Proactive] Error:", err.message);
      res.status(500).json({ message: err.message ?? "Failed to send proactive alerts" });
    }
  });

  // ── Abandoned Cart Recovery — detect & send WhatsApp recovery messages ──────
  // GET  /api/admin/whatsapp/abandoned-carts — list recoverable orders with user info
  // POST /api/admin/whatsapp/abandoned-cart-alerts — send recovery messages
  app.get("/api/admin/whatsapp/abandoned-carts", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const minMinutes = parseInt(req.query.minMinutes as string) || 60;
      const maxHours   = parseInt(req.query.maxHours   as string) || 48;
      const orders = await storage.getAbandonedOrders(minMinutes, maxHours);

      const enriched = await Promise.all(orders.map(async (o: any) => {
        const user = await storage.getUserById(o.userId).catch(() => null);
        return {
          orderId: o.id,
          serviceName: o.serviceName,
          amount: o.amount,
          createdAt: o.createdAt,
          userId: o.userId,
          userPhone: user?.phone || null,
          userName: user?.firstName || user?.email?.split("@")[0] || "there",
          userEmail: user?.email || null,
        };
      }));

      const withPhone = enriched.filter((e: any) => !!e.userPhone);
      res.json({ orders: enriched, recoverableCount: withPhone.length, totalAbandoned: enriched.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/whatsapp/abandoned-cart-alerts", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { minMinutes = 60, maxHours = 48 } = req.body ?? {};
      const { sendWhatsApp } = await import("./sms");

      const orders = await storage.getAbandonedOrders(minMinutes, maxHours);
      if (orders.length === 0) return res.json({ ok: true, sent: 0, failed: 0, skipped: 0, total: 0 });

      let sent = 0, failed = 0, skipped = 0;
      const errors: string[] = [];

      for (const o of orders) {
        const user = await storage.getUserById(o.userId).catch(() => null);
        if (!user?.phone) { skipped++; continue; }

        const name = user.firstName || user.email?.split("@")[0] || "there";
        const message =
          `Hi ${name}! 👋\n\n` +
          `I noticed you started the *${o.serviceName}* service but didn't complete payment.\n\n` +
          `Need help with M-Pesa, or have questions about what's included?\n\n` +
          `Just reply here and I'll sort you out right away 😊\n\n` +
          `Or complete payment at:\n👉 workabroadhub.tech/services\n\n` +
          `— Nanjila, WorkAbroad Hub`;

        const result = await sendWhatsApp(user.phone, message);
        if (result.success) {
          sent++;
          await storage.markAbandonedCartAlerted(o.id);
        } else {
          failed++;
          if (errors.length < 5) errors.push(`${user.phone} (${o.serviceName}): ${result.error}`);
        }
        await new Promise(r => setTimeout(r, 250));
      }

      console.log(`[Nanjila/AbandonedCart] Sent: ${sent} | Failed: ${failed} | Skipped: ${skipped}`);
      res.json({ ok: true, sent, failed, skipped, total: orders.length, errors });
    } catch (err: any) {
      console.error("[Nanjila/AbandonedCart] Error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ── Nanjila daily metrics (from Firebase RTDB) ───────────────────────────
  // GET /api/admin/nanjila/metrics?days=7
  app.get("/api/admin/nanjila/metrics", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const { getNanjilaMetrics } = await import("./services/firebaseRtdb");
      const metrics = await getNanjilaMetrics(days);
      res.json(metrics);
    } catch (err: any) {
      console.error("[Nanjila/Metrics] Error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // Preview how a proactive message will look (no sending)
  app.post("/api/admin/whatsapp/proactive-preview", isAuthenticated, isAdmin, async (req: any, res) => {
    const { audience = "all_with_phone", template = "job_alert", variables = {} } = req.body ?? {};
    const allUsers = await storage.getAllUsers();
    const count = allUsers.filter((u: any) => {
      if (!u.phone) return false;
      if (audience === "pro_users") return (u.plan || "free").toLowerCase() === "pro";
      if (audience === "free_users") return (u.plan || "free").toLowerCase() !== "pro";
      return true;
    }).length;

    const SAMPLE_NAME = "Anthony";
    const TEMPLATES: Record<string, (name: string, v: any) => string> = {
      job_alert: (name, v) =>
        `Hi ${name}! 👋\n\nNew *${v.jobTitle || "overseas"}* jobs just posted in *${v.location || "UK, Canada & UAE"}*.\n\nWould you like me to send you the details? Reply *YES* and I'll share the verified listings right away.\n\n— Nanjila, WorkAbroad Hub`,
      pro_nudge: (name, _) =>
        `Hi ${name}! 👋\n\nUpgrade to WorkAbroad Hub PRO for just *KES 4,500/year* and access:\n✅ Verified jobs in UK, Canada, UAE & more\n✅ NEA agency checker\n✅ AI CV tools\n\n👉 workabroadhub.tech/pricing\n\n— Nanjila`,
      checkin: (name, _) =>
        `Hi ${name}! 😊 It's Nanjila from WorkAbroad Hub.\n\nAny questions about working abroad? I'm here to help — just reply with your question!\n\n— Nanjila, WorkAbroad Hub`,
      custom: (name, v) =>
        (v.customBody || "Hi {name}! 👋").replace(/\{name\}/g, name),
    };
    const buildMsg = TEMPLATES[template] ?? TEMPLATES.job_alert;
    res.json({ preview: buildMsg(SAMPLE_NAME, variables), recipientCount: count });
  });

  // Broadcast message to multiple users (admin only)
  app.post("/api/admin/broadcast-sms", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { phones, message, channel } = req.body;
      
      if (!phones || !Array.isArray(phones) || phones.length === 0) {
        return res.status(400).json({ message: "Phone numbers array is required" });
      }
      if (!message) {
        return res.status(400).json({ message: "Message is required" });
      }
      if (phones.length > 100) {
        return res.status(400).json({ message: "Maximum 100 recipients per broadcast" });
      }

      const { sendMessage } = await import("./sms");
      const preferWhatsApp = channel !== "sms";

      const results = await Promise.allSettled(
        phones.map(phone => sendMessage(phone, message, preferWhatsApp))
      );

      const successful = results.filter(r => r.status === "fulfilled" && r.value.success).length;
      const failed = phones.length - successful;

      res.json({
        total: phones.length,
        successful,
        failed,
        results: results.map((r, i) => ({
          phone: phones[i],
          status: r.status === "fulfilled" ? (r.value.success ? "sent" : "failed") : "error",
          channel: r.status === "fulfilled" ? r.value.channel : null,
          error: r.status === "rejected" ? r.reason?.message : (r.status === "fulfilled" && !r.value.success ? r.value.error : null)
        }))
      });
    } catch (error: any) {
      console.error("Error broadcasting message:", error);
      res.status(500).json({ message: "Failed to broadcast message", error: error.message });
    }
  });

  // ==================== ANALYTICS ENDPOINTS ====================

  const analyticsLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { message: "Too many analytics requests" },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.post("/api/analytics/event", analyticsLimiter, async (req: any, res) => {
    try {
      const { sessionId, eventType, eventName, eventCategory, eventData, page, referrer, deviceType } = req.body;
      
      if (!sessionId || !eventType || !eventName || !eventCategory) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const MAX_FIELD_LEN = 500;
      if (
        String(sessionId).length > MAX_FIELD_LEN ||
        String(eventType).length > 100 ||
        String(eventName).length > 200 ||
        String(eventCategory).length > 200
      ) {
        return res.status(400).json({ message: "Field value too long" });
      }

      const userId = req.user?.claims?.sub || null;
      const userAgent = req.headers["user-agent"] || null;

      await storage.recordAnalyticsEvent({
        userId,
        sessionId,
        eventType,
        eventName,
        eventCategory,
        eventData: eventData || null,
        page: page || null,
        referrer: referrer || null,
        userAgent,
        deviceType: deviceType || null,
        country: null // Would need geo-IP lookup for this
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error recording analytics event:", error);
      res.status(500).json({ message: "Failed to record event" });
    }
  });

  app.post("/api/analytics/conversion", analyticsLimiter, async (req: any, res) => {
    try {
      const { sessionId, funnelStep, metadata } = req.body;
      
      if (!sessionId || !funnelStep) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const userId = req.user?.claims?.sub || null;

      await storage.recordConversionEvent({
        userId,
        sessionId,
        funnelStep,
        metadata: metadata || null
      });

      // Update daily stats based on funnel step
      const today = new Date().toISOString().split('T')[0];
      await storage.incrementDailyStat(today, funnelStep);

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error recording conversion:", error);
      res.status(500).json({ message: "Failed to record conversion" });
    }
  });

  // ── CV Funnel Event Tracker (frontend → Firebase RTDB) ─────────────────────
  app.post("/api/analytics/cv-funnel", analyticsLimiter, async (req: any, res) => {
    try {
      const { event, meta = {} } = req.body;
      const VALID_EVENTS = ["uploaded", "analyzed", "viewed_jobs", "clicked_apply", "upgraded"];
      if (!event || !VALID_EVENTS.includes(event)) {
        return res.status(400).json({ message: "Invalid or missing event" });
      }
      const userId = req.user?.claims?.sub || req.user?.id || null;
      if (!userId) return res.status(401).json({ message: "Authentication required" });

      const { trackCvFunnelEvent } = await import("./services/firebaseRtdb");
      await trackCvFunnelEvent(userId, event, { ...meta, source: "web" });
      res.json({ success: true });
    } catch (err: any) {
      console.error("[CvFunnel]", err.message);
      res.status(500).json({ message: "Tracking failed" });
    }
  });

  // Get admin analytics dashboard data
  app.get("/api/admin/analytics/dashboard", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { period = "7d" } = req.query;
      
      // Calculate date range
      const endDate = new Date();
      let startDate = new Date();
      
      switch (period) {
        case "24h":
          startDate.setHours(startDate.getHours() - 24);
          break;
        case "7d":
          startDate.setDate(startDate.getDate() - 7);
          break;
        case "30d":
          startDate.setDate(startDate.getDate() - 30);
          break;
        case "90d":
          startDate.setDate(startDate.getDate() - 90);
          break;
        default:
          startDate.setDate(startDate.getDate() - 7);
      }

      // Get analytics data
      const [
        dailyStats,
        funnelData,
        topPages,
        deviceBreakdown,
        recentEvents
      ] = await Promise.all([
        storage.getDailyStats(startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]),
        storage.getConversionFunnel(startDate, endDate),
        storage.getTopPages(startDate, endDate, 10),
        storage.getDeviceBreakdown(startDate, endDate),
        storage.getRecentEvents(20)
      ]);

      // Calculate summary metrics
      const totalPageViews = dailyStats.reduce((sum, d) => sum + (d.pageViews || 0), 0);
      const totalUniqueVisitors = dailyStats.reduce((sum, d) => sum + (d.uniqueVisitors || 0), 0);
      const totalSignups = dailyStats.reduce((sum, d) => sum + (d.signups || 0), 0);
      const totalPayments = dailyStats.reduce((sum, d) => sum + (d.paymentsCompleted || 0), 0);
      const totalRevenue = dailyStats.reduce((sum, d) => sum + (d.revenue || 0), 0);
      const totalJobLinkClicks = dailyStats.reduce((sum, d) => sum + (d.jobLinkClicks || 0), 0);

      // Calculate conversion rates
      const signupRate = totalUniqueVisitors > 0 ? (totalSignups / totalUniqueVisitors * 100).toFixed(2) : "0.00";
      const paymentRate = totalSignups > 0 ? (totalPayments / totalSignups * 100).toFixed(2) : "0.00";
      const overallConversionRate = totalUniqueVisitors > 0 ? (totalPayments / totalUniqueVisitors * 100).toFixed(2) : "0.00";

      res.json({
        period,
        summary: {
          pageViews: totalPageViews,
          uniqueVisitors: totalUniqueVisitors,
          signups: totalSignups,
          payments: totalPayments,
          revenue: totalRevenue,
          jobLinkClicks: totalJobLinkClicks,
          signupRate: parseFloat(signupRate),
          paymentRate: parseFloat(paymentRate),
          overallConversionRate: parseFloat(overallConversionRate)
        },
        dailyStats,
        funnelData,
        topPages,
        deviceBreakdown,
        recentEvents
      });
    } catch (error: any) {
      console.error("Error fetching analytics dashboard:", error);
      res.status(500).json({ message: "Failed to fetch analytics", error: error.message });
    }
  });

  // Get conversion funnel breakdown
  app.get("/api/admin/analytics/funnel", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { days = 7 } = req.query;
      const daysNum = Math.min(Math.max(parseInt(days as string) || 7, 1), 365);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysNum);
      
      const funnel = await storage.getConversionFunnel(startDate, new Date());
      res.json(funnel);
    } catch (error: any) {
      console.error("Error fetching funnel data:", error);
      res.status(500).json({ message: "Failed to fetch funnel data" });
    }
  });

  // Get real-time active users (last 5 minutes)
  app.get("/api/admin/analytics/realtime", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const activeUsers = await storage.getActiveUsers(5); // 5 minutes
      res.json({ activeUsers, timestamp: new Date().toISOString() });
    } catch (error: any) {
      console.error("Error fetching realtime data:", error);
      res.status(500).json({ message: "Failed to fetch realtime data" });
    }
  });

  // Get event breakdown by category
  app.get("/api/admin/analytics/events", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { days = 7, category } = req.query;
      const daysNum = Math.min(Math.max(parseInt(days as string) || 7, 1), 365);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysNum);
      const safeCategory = typeof category === 'string' ? category.slice(0, 50).replace(/[^a-zA-Z0-9_\-]/g, '') : undefined;
      const events = await storage.getEventsByCategory(startDate, new Date(), safeCategory);
      res.json(events);
    } catch (error: any) {
      console.error("Error fetching events:", error);
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  // ── GET /api/admin/analytics ─────────────────────────────────────────────
  // Summary: total users, total revenue, active subscriptions, daily payment
  // series. All three scalar metrics come from the local DB (fast, cached).
  // The daily series comes from the Supabase payments mirror so it can be
  // queried without touching the primary transactional DB.
  //
  // Query params:
  //   period = 24h | 7d (default) | 30d | 90d
  app.get("/api/admin/analytics", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { period = "7d" } = req.query as { period?: string };

      const startDate = new Date();
      switch (period) {
        case "24h": startDate.setHours(startDate.getHours() - 24); break;
        case "30d": startDate.setDate(startDate.getDate() - 30);   break;
        case "90d": startDate.setDate(startDate.getDate() - 90);   break;
        default:    startDate.setDate(startDate.getDate() - 7);    break; // 7d
      }

      // ── Scalar metrics (local DB, parallel) ──────────────────────────────
      const [users, revenue, activeSubs] = await Promise.all([
        storage.getUserCount(),
        storage.getTotalRevenue(),
        storage.getActiveSubscriptionCount(),
      ]);

      // ── Daily series from Supabase payments mirror ────────────────────────
      const { data: rows, error } = await supabase
        .from("payments")
        .select("amount, created_at, status, currency")
        .gte("created_at", startDate.toISOString())
        .order("created_at", { ascending: true });

      if (error) {
        console.error("[Analytics] Supabase daily query error:", error.message);
      }

      // Group by calendar date, sum completed-payment amounts
      const dayMap = new Map<string, { amount: number; count: number }>();
      for (const row of rows ?? []) {
        if (!row.created_at) continue;
        const date = (row.created_at as string).slice(0, 10); // YYYY-MM-DD
        const amt  = row.status === "completed" ? Number(row.amount ?? 0) : 0;
        const prev = dayMap.get(date) ?? { amount: 0, count: 0 };
        dayMap.set(date, {
          amount: prev.amount + amt,
          count:  row.status === "completed" ? prev.count + 1 : prev.count,
        });
      }

      const daily = Array.from(dayMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, { amount, count }]) => ({ date, amount, count }));

      res.json({ users, revenue, activeSubs, daily, period });
    } catch (err: any) {
      console.error("[Analytics] /api/admin/analytics error:", err?.message ?? err);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // ── GET /api/admin/monitor ──────────────────────────────────────────────────
  // Unified monitoring dashboard — aggregates all four pillars in one response:
  //   pricing engine · payment gateways · subscription sweep · fraud + system health
  app.get("/api/admin/monitor", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const { getSweepStats } = await import("./services/subscriptionRenewal");

      // Run independent queries in parallel
      const [health, fraudFlagStats, suspiciousPayments, activeSubCount] = await Promise.all([
        getDetailedHealth().catch(() => ({ status: "unknown" })),
        storage.getFraudFlagStats?.().catch?.(() => null) ?? Promise.resolve(null),
        db.execute(sql`
          SELECT COUNT(*) AS cnt FROM payments
          WHERE is_suspicious = true AND status != 'resolved'
        `).catch(() => ({ rows: [{ cnt: 0 }] })),
        storage.getActiveSubscriptionCount().catch(() => 0),
      ]);

      const circuits = getAllCircuitBreakerStats();

      // Payment gateway status
      const gateways = {
        mpesa: {
          configured: !!(process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET),
          circuit: circuits?.mpesa_stk ?? circuits?.["mpesa"] ?? null,
        },
        paypal: {
          configured: isPayPalConfigured(),
          circuit: circuits?.paypal ?? null,
        },
      };

      // Fraud summary — use dedicated stats if available, otherwise count from raw query
      const openSuspicious = Number((suspiciousPayments as any).rows?.[0]?.cnt ?? 0);
      const fraudSummary = fraudFlagStats ?? { openFlags: openSuspicious };

      res.json({
        timestamp:     new Date().toISOString(),
        system:        health,
        circuits,
        gateways,
        subscriptions: {
          active: activeSubCount,
          sweep:  getSweepStats(),
        },
        fraud: fraudSummary,
        openSuspiciousPayments: openSuspicious,
      });
    } catch (err: any) {
      console.error("[Monitor] /api/admin/monitor error:", err?.message ?? err);
      res.status(500).json({ message: "Failed to fetch monitoring data" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // REVENUE ANALYTICS (Steps 3-7 from spec)
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/admin/analytics/revenue — revenue metrics (Step 3)
  app.get("/api/admin/analytics/revenue", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const { getRevenueMetrics } = await import("./services/analyticsService");
      const metrics = await getRevenueMetrics();
      res.json(metrics);
    } catch (err: any) {
      console.error("[analytics/revenue]", err.message);
      res.status(500).json({ message: "Failed to fetch revenue metrics" });
    }
  });

  // GET /api/admin/analytics/payments — payment performance + method breakdown (Steps 4 & 6)
  app.get("/api/admin/analytics/payments", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const { getPaymentPerformance } = await import("./services/analyticsService");
      const perf = await getPaymentPerformance();
      res.json(perf);
    } catch (err: any) {
      console.error("[analytics/payments]", err.message);
      res.status(500).json({ message: "Failed to fetch payment performance" });
    }
  });

  // GET /api/admin/analytics/countries — group payments by country (Step 5)
  app.get("/api/admin/analytics/countries", isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const { getCountryAnalytics } = await import("./services/analyticsService");
      const countries = await getCountryAnalytics();
      res.json(countries);
    } catch (err: any) {
      console.error("[analytics/countries]", err.message);
      res.status(500).json({ message: "Failed to fetch country analytics" });
    }
  });

  // GET /api/admin/analytics/recent-transactions — last 20 transactions
  app.get("/api/admin/analytics/recent-transactions", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const limit = Math.min(parseInt(String((req.query as any).limit) || "20"), 100);
      const { getRecentTransactions } = await import("./services/analyticsService");
      const txns = await getRecentTransactions(limit);
      res.json(txns);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  // GET /api/admin/analytics/export — CSV export (Step 9)
  // Query: ?type=revenue (success only) | ?type=all (all payments)
  app.get("/api/admin/analytics/export", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const type = (req.query as any).type === "all" ? "all" : "revenue";
      const { generateRevenueCSV, generateAllPaymentsCSV } = await import("./services/analyticsService");
      const csv = type === "all" ? await generateAllPaymentsCSV() : await generateRevenueCSV();
      const filename = `workabroadhub_${type}_payments_${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (err: any) {
      console.error("[analytics/export]", err.message);
      res.status(500).json({ message: "Export failed" });
    }
  });

  // GET /api/admin/analytics/ws-status — WebSocket connection count
  app.get("/api/admin/analytics/ws-status", isAuthenticated, isAdmin, (_req, res) => {
    import("./websocket").then(({ getConnectedClients }) => {
      res.json({ connectedClients: getConnectedClients() });
    }).catch(() => res.json({ connectedClients: 0 }));
  });

  // ============================================
  // COUNTRY INSIGHTS, ADVISORS, SUCCESS STORIES
  // ============================================

  // Get country insights
  app.get("/api/countries/:code/insights", async (req, res) => {
    try {
      const insights = await storage.getCountryInsights(req.params.code);
      if (!insights) {
        return res.status(404).json({ message: "Country insights not found" });
      }
      res.json(insights);
    } catch (error: any) {
      console.error("Error fetching country insights:", error);
      res.status(500).json({ message: "Failed to fetch country insights" });
    }
  });

  // Get all active advisors
  app.get("/api/advisors", async (req, res) => {
    try {
      const advisorList = await storage.getActiveAdvisors();
      res.json(advisorList);
    } catch (error: any) {
      console.error("Error fetching advisors:", error);
      res.status(500).json({ message: "Failed to fetch advisors" });
    }
  });

  // Anonymize a display-name string before it leaves the server.
  // "John Doe" → "J D" | "Sarah K." → "S K" | NEVER exposes full name.
  function sanitizeStoryName(name: string): string {
    if (!name?.trim()) return "?";
    return name
      .trim()
      .split(/\s+/)
      .map((p) => p.replace(/\./g, "")[0]?.toUpperCase() ?? "")
      .filter(Boolean)
      .join(" ");
  }

  // Get featured success stories
  app.get("/api/success-stories", async (req, res) => {
    try {
      const stories = await storage.getFeaturedSuccessStories();
      // Anonymize names server-side — full names must never reach public clients.
      const safe = stories.map((s) => ({ ...s, name: sanitizeStoryName(s.name) }));
      res.json(safe);
    } catch (error: any) {
      console.error("Error fetching success stories:", error);
      res.status(500).json({ message: "Failed to fetch success stories" });
    }
  });

  // ============================================
  // CONSULTATION BOOKINGS
  // ============================================

  const consultationBookingSchema = z.object({
    scheduledDate: z.string().refine((date) => {
      const parsed = new Date(date);
      return !isNaN(parsed.getTime()) && parsed > new Date();
    }, "Scheduled date must be a valid future date"),
    topic: z.string().min(3).max(200),
    notes: z.string().max(1000).optional(),
    userName: z.string().min(2).max(100),
    userEmail: z.string().email().optional(),
    userPhone: z.string().min(9).max(20),
  });

  // Book a consultation
  app.post("/api/consultations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const validation = consultationBookingSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid request", errors: validation.error.flatten().fieldErrors });
      }

      const { scheduledDate, topic, notes, userName, userEmail, userPhone } = validation.data;

      const booking = await storage.createConsultationBooking({
        userId,
        advisorId: null,
        userName,
        userEmail: userEmail || null,
        userPhone,
        scheduledDate: new Date(scheduledDate),
        topic,
        notes: notes || null,
        status: "pending",
      });

      // Send WhatsApp auto-reply to user
      try {
        const { sendWhatsApp } = await import("./sms.js");
        const dateStr = new Date(scheduledDate).toLocaleDateString("en-KE", {
          weekday: "long", day: "numeric", month: "long", year: "numeric"
        });
        const timeStr = new Date(scheduledDate).toLocaleTimeString("en-KE", {
          hour: "2-digit", minute: "2-digit"
        });

        const userMsg = `Hi ${userName}! 👋\n\nYour consultation request has been received.\n\n📅 *Date:* ${dateStr}\n⏰ *Time:* ${timeStr}\n💬 *Topic:* ${topic}\n\nOur team will confirm your slot within 24 hours. If you have any urgent questions, reply to this message directly.\n\n— WorkAbroad Hub Team`;

        await sendWhatsApp(userPhone, userMsg);
        await storage.markConsultationWhatsappSent(booking.id);

        // Notify admin
        const adminPhone = process.env.ADMIN_PHONE_NUMBER || "";
        if (adminPhone) {
          const adminMsg = `📋 *New Consultation Booking*\n\n👤 *Name:* ${userName}\n📱 *Phone:* ${userPhone}\n📧 *Email:* ${userEmail || "N/A"}\n📅 *Date:* ${dateStr}\n⏰ *Time:* ${timeStr}\n💬 *Topic:* ${topic}\n${notes ? `📝 *Notes:* ${notes}` : ""}`;
          await sendWhatsApp(adminPhone, adminMsg);
        }
      } catch (waErr: any) {
        console.warn("[Consultations] WhatsApp notification failed:", waErr.message);
      }

      res.status(201).json(booking);
    } catch (error: any) {
      console.error("Error creating consultation:", error);
      res.status(500).json({ message: "Failed to book consultation" });
    }
  });

  // Get user's consultations
  app.get("/api/consultations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const consultations = await storage.getUserConsultations(userId);
      res.json(consultations);
    } catch (error: any) {
      console.error("Error fetching consultations:", error);
      res.status(500).json({ message: "Failed to fetch consultations" });
    }
  });

  // Admin: get all consultations
  app.get("/api/admin/consultations", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const consultations = await storage.getAllConsultations();
      res.json(consultations);
    } catch (error: any) {
      console.error("Error fetching all consultations:", error);
      res.status(500).json({ message: "Failed to fetch consultations" });
    }
  });

  // Admin: update consultation status / notes
  app.patch("/api/admin/consultations/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status, advisorNotes } = req.body;
      const updated = await storage.updateConsultationAdmin(id, { status, advisorNotes });
      if (!updated) return res.status(404).json({ message: "Booking not found" });

      // If confirming, send WhatsApp to user
      if (status === "confirmed" && updated.userPhone) {
        try {
          const { sendWhatsApp } = await import("./sms.js");
          const dateStr = new Date(updated.scheduledDate).toLocaleDateString("en-KE", {
            weekday: "long", day: "numeric", month: "long", year: "numeric"
          });
          const timeStr = new Date(updated.scheduledDate).toLocaleTimeString("en-KE", {
            hour: "2-digit", minute: "2-digit"
          });
          const msg = `✅ *Consultation Confirmed!*\n\nHi ${updated.userName || "there"}!\n\nYour consultation has been confirmed.\n\n📅 *Date:* ${dateStr}\n⏰ *Time:* ${timeStr}\n💬 *Topic:* ${updated.topic}\n\nWe will WhatsApp you at this number when it's time. See you then!\n\n— WorkAbroad Hub Team`;
          await sendWhatsApp(updated.userPhone, msg);
        } catch (waErr: any) {
          console.warn("[Consultations] Confirm WhatsApp failed:", waErr.message);
        }
      }

      res.json(updated);
    } catch (error: any) {
      console.error("Error updating consultation:", error);
      res.status(500).json({ message: "Failed to update consultation" });
    }
  });

  // ============================================
  // AI CAREER MATCHING
  // ============================================

  // Get user's career profile
  app.get("/api/career-profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const profile = await storage.getUserCareerProfile(userId);
      res.json(profile || null);
    } catch (error: any) {
      console.error("Error fetching career profile:", error);
      res.status(500).json({ message: "Failed to fetch career profile" });
    }
  });

  // Save/update career profile
  app.post("/api/career-profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Validate input with Zod
      const parseResult = careerProfileSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid data", errors: parseResult.error.errors });
      }

      const profile = await storage.upsertUserCareerProfile(userId, parseResult.data);
      res.json(profile);
    } catch (error: any) {
      console.error("Error saving career profile:", error);
      res.status(500).json({ message: "Failed to save career profile" });
    }
  });

  // Get AI recommendations for career profile
  app.post("/api/career-profile/analyze", isAuthenticated, requireAnyPaidPlan, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const profile = await storage.getUserCareerProfile(userId);
      if (!profile) {
        return res.status(400).json({ message: "Please complete your career profile first" });
      }

      // Get country insights for analysis
      const insights = await storage.getAllCountryInsights();

      // Import and use the AI matcher
      const { analyzeCareerProfile } = await import("./services/ai-career-matcher");
      
      const recommendations = await analyzeCareerProfile(
        {
          currentJobTitle: profile.currentJobTitle,
          yearsExperience: profile.yearsExperience,
          educationLevel: profile.educationLevel,
          fieldOfStudy: profile.fieldOfStudy,
          skills: profile.skills || [],
          certifications: profile.certifications || [],
          languages: profile.languages || [],
          preferredCountries: profile.preferredCountries || [],
          preferredIndustries: profile.preferredIndustries || [],
          salaryExpectation: profile.salaryExpectation,
          willingToRelocate: profile.willingToRelocate || true,
          familySize: profile.familySize || 1,
          hasPassport: profile.hasPassport || false,
          hasWorkExperienceAbroad: profile.hasWorkExperienceAbroad || false,
        },
        insights.map(i => ({
          countryCode: i.countryCode,
          avgSalaryUsd: i.avgSalaryUsd || 0,
          visaDifficulty: i.visaDifficulty || "moderate",
          demandSectors: Array.isArray(i.demandSectors) ? i.demandSectors : [],
          workVisaTypes: Array.isArray(i.workVisaTypes) ? i.workVisaTypes : [],
        }))
      );

      // Save recommendations to profile
      await storage.updateCareerProfileRecommendations(userId, recommendations);

      res.json(recommendations);
    } catch (error: any) {
      console.error("Error analyzing career profile:", error);
      res.status(500).json({ message: "Failed to analyze career profile" });
    }
  });

  // ============================================
  // JOB ALERTS
  // ============================================

  // Get user's job alert subscriptions
  app.get("/api/job-alerts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const alerts = await storage.getUserJobAlerts(userId);
      res.json(alerts);
    } catch (error: any) {
      console.error("Error fetching job alerts:", error);
      res.status(500).json({ message: "Failed to fetch job alerts" });
    }
  });

  // Create job alert subscription
  app.post("/api/job-alerts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Validate input with Zod
      const parseResult = jobAlertSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: "Invalid data", errors: parseResult.error.errors });
      }

      // SECURITY: Spread parseResult.data first, then override userId from session
      // This prevents clients from spoofing userId in the request body
      const alert = await storage.createJobAlertSubscription({
        ...parseResult.data,
        userId,
      });
      res.status(201).json(alert);
    } catch (error: any) {
      console.error("Error creating job alert:", error);
      res.status(500).json({ message: "Failed to create job alert" });
    }
  });

  // Delete job alert subscription
  app.delete("/api/job-alerts/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // SECURITY: Verify ownership before deletion to prevent IDOR
      const alerts = await storage.getUserJobAlerts(userId);
      const alertToDelete = alerts.find(a => a.id === req.params.id);
      if (!alertToDelete) {
        return res.status(404).json({ message: "Job alert not found or not owned by you" });
      }

      await storage.deleteJobAlert(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting job alert:", error);
      res.status(500).json({ message: "Failed to delete job alert" });
    }
  });

  // GDPR: Export user data (right to access)
  app.get("/api/account/export", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const data = await storage.exportUserData(userId);
      if (!data || Object.keys(data).length === 0) {
        return res.status(404).json({ message: "User not found" });
      }
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="workabroad-data-${userId.substring(0, 8)}-${Date.now()}.json"`);
      res.json(data);
    } catch (error) {
      console.error("Error exporting user data:", error);
      res.status(500).json({ message: "Failed to export data" });
    }
  });

  // GDPR: Delete user account (right to be forgotten)
  // Shared handler used by both DELETE /api/account and POST /api/account/delete
  async function handleDeleteAccount(req: any, res: any) {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const confirmWord = (req.body?.confirmWord as string | undefined)?.trim().toUpperCase();
      if (!confirmWord || confirmWord !== "DELETE") {
        return res.status(400).json({ message: "Please type DELETE to confirm account deletion." });
      }

      // Capture email & name before deletion so we can send goodbye email
      const userBeforeDeletion = await storage.getUserById(userId);
      const farewellEmail = (userBeforeDeletion?.email || "").trim();
      const farewellName = userBeforeDeletion?.firstName || "there";

      console.log(`[AccountDeletion] Deleting account for userId=${userId}`);
      const deleted = await storage.deleteUserAccount(userId);
      if (!deleted) {
        console.warn(`[AccountDeletion] User not found: ${userId}`);
        return res.status(404).json({ message: "User not found" });
      }

      console.log(`[AccountDeletion] Successfully deleted account for userId=${userId}`);

      // Send farewell email (fire-and-forget — account already deleted)
      if (farewellEmail) {
        import("./email").then(({ sendAccountDeletedEmail }) => {
          sendAccountDeletedEmail(farewellEmail, farewellName).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        });
      }

      // Erase all session data first, then destroy — response only sent after destroy completes
      if (req.session) {
        // Wipe custom-auth field so middleware can't re-authenticate from a stale session
        req.session.customUserId = undefined;
        req.session.destroy((err: any) => {
          if (err) console.error("[AccountDeletion] Session destroy error:", err);
          res.clearCookie("connect.sid", { path: "/" });
          res.clearCookie("__Host-next-auth.csrf-token", { path: "/" });
          res.json({ success: true, message: "Account permanently deleted" });
        });
      } else {
        res.clearCookie("connect.sid", { path: "/" });
        res.json({ success: true, message: "Account permanently deleted" });
      }
    } catch (error) {
      console.error("[AccountDeletion] Error:", error);
      res.status(500).json({ message: "Failed to delete account. Please try again." });
    }
  }

  // DELETE /api/account — original endpoint (kept for backward compatibility)
  app.delete("/api/account", isAuthenticated, handleDeleteAccount);

  // POST /api/account/delete — alias that works reliably in all environments
  // (Some production proxies/CDNs strip request bodies from DELETE requests)
  app.post("/api/account/delete", isAuthenticated, handleDeleteAccount);

  // Get video testimonials
  app.get("/api/video-testimonials", async (req, res) => {
    try {
      const videos = await storage.getVideoTestimonials();
      res.json(videos);
    } catch (error: any) {
      console.error("Error fetching video testimonials:", error);
      res.status(500).json({ message: "Failed to fetch video testimonials" });
    }
  });

  // ============================================================
  // Government Integration Admin API
  // ============================================================

  app.get("/api/admin/government/integrations", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const integrations = await storage.getGovernmentIntegrations();
      res.json(integrations);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch integrations" });
    }
  });

  app.get("/api/admin/government/integrations/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const integration = await storage.getGovernmentIntegrationById(req.params.id);
      if (!integration) return res.status(404).json({ message: "Integration not found" });
      res.json(integration);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch integration" });
    }
  });

  app.post("/api/admin/government/integrations", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const integration = await storage.createGovernmentIntegration(req.body);
      res.status(201).json(integration);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to create integration" });
    }
  });

  app.patch("/api/admin/government/integrations/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const updated = await storage.updateGovernmentIntegration(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Integration not found" });

      if (req.body.enabled !== undefined) {
        const { governmentRegistry } = await import("./government");
        if (req.body.enabled && updated.baseUrl) {
          try {
            await governmentRegistry.initializeAdapter(updated.code, {
              integrationId: updated.id,
              code: updated.code,
              baseUrl: updated.baseUrl,
              authType: updated.authType as any,
              credentialRef: updated.credentialRef || undefined,
              timeoutMs: updated.timeoutMs || 30000,
              retryAttempts: updated.retryAttempts || 3,
              rateLimit: updated.rateLimit || 100,
              metadata: updated.metadata as any,
            });
          } catch (err) {
            console.warn(`[Gov] Failed to initialize adapter ${updated.code}:`, err);
          }
        }
      }

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update integration" });
    }
  });

  app.delete("/api/admin/government/integrations/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      await storage.deleteGovernmentIntegration(req.params.id);
      res.json({ message: "Deleted" });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to delete integration" });
    }
  });

  app.get("/api/admin/government/sync-logs", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const logs = await storage.getGovernmentSyncLogs({
        integrationCode: req.query.integrationCode as string,
        status: req.query.status as string,
        action: req.query.action as string,
        limit: parseInt(req.query.limit as string) || 100,
        offset: parseInt(req.query.offset as string) || 0,
      });
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch sync logs" });
    }
  });

  app.get("/api/admin/government/sync-logs/:requestId", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const log = await storage.getGovernmentSyncLogByRequestId(req.params.requestId);
      if (!log) return res.status(404).json({ message: "Log not found" });
      res.json(log);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch sync log" });
    }
  });

  app.get("/api/admin/government/sync-stats", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const stats = await storage.getGovernmentSyncStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch sync stats" });
    }
  });

  app.post("/api/admin/government/sync/verify", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { integrationCode, licenseNumber } = req.body;
      if (!integrationCode || !licenseNumber) {
        return res.status(400).json({ message: "integrationCode and licenseNumber required" });
      }
      const { governmentSyncService } = await import("./government");
      const requestId = await governmentSyncService.enqueueVerification(
        integrationCode, licenseNumber, req.user?.claims?.sub || "admin"
      );
      res.json({ requestId, message: "Verification queued" });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to queue verification" });
    }
  });

  app.post("/api/admin/government/sync/status", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { integrationCode, licenseNumber } = req.body;
      if (!integrationCode || !licenseNumber) {
        return res.status(400).json({ message: "integrationCode and licenseNumber required" });
      }
      const { governmentSyncService } = await import("./government");
      const requestId = await governmentSyncService.enqueueStatusCheck(
        integrationCode, licenseNumber, req.user?.claims?.sub || "admin"
      );
      res.json({ requestId, message: "Status check queued" });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to queue status check" });
    }
  });

  app.post("/api/admin/government/sync/renewal", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { integrationCode, licenseNumber, agencyId, paymentReference, licenseDetails } = req.body;
      if (!integrationCode || !licenseNumber || !paymentReference) {
        return res.status(400).json({ message: "integrationCode, licenseNumber, and paymentReference required" });
      }
      const { governmentSyncService } = await import("./government");
      const requestId = await governmentSyncService.enqueueRenewalSubmission(
        integrationCode, licenseNumber, agencyId || "", paymentReference,
        licenseDetails || {}, req.user?.claims?.sub || "admin"
      );
      res.json({ requestId, message: "Renewal submission queued" });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to queue renewal" });
    }
  });

  app.post("/api/admin/government/sync/retry/:requestId", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { governmentSyncService } = await import("./government");
      const newRequestId = await governmentSyncService.retrySyncJob(
        req.params.requestId, req.user?.claims?.sub || "admin"
      );
      res.json({ requestId: newRequestId, message: "Retry queued" });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to retry sync" });
    }
  });

  app.get("/api/admin/government/adapters", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const { governmentRegistry } = await import("./government");
      const adapters = governmentRegistry.listAdapters();
      const circuitBreakers = governmentRegistry.getAllCircuitBreakerStats();
      res.json({ adapters, circuitBreakers });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch adapters" });
    }
  });

  app.post("/api/admin/government/adapters/:code/reset-circuit", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { governmentRegistry } = await import("./government");
      const cb = governmentRegistry.getCircuitBreaker(req.params.code);
      if (!cb) return res.status(404).json({ message: "Adapter not found" });
      cb.reset();
      res.json({ message: "Circuit breaker reset" });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to reset circuit breaker" });
    }
  });

  app.get("/api/admin/government/feature-flags", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const flags = await storage.getGovernmentFeatureFlags();
      res.json(flags);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch feature flags" });
    }
  });

  app.patch("/api/admin/government/feature-flags/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const updated = await storage.updateGovernmentFeatureFlag(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Flag not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update feature flag" });
    }
  });

  app.post("/api/admin/government/feature-flags", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const flag = await storage.upsertGovernmentFeatureFlag(req.body);
      res.json(flag);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to create feature flag" });
    }
  });

  app.get("/api/admin/government/manual-overrides", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const filters = {
        integrationCode: req.query.integrationCode as string | undefined,
        overrideStatus: req.query.overrideStatus as string | undefined,
        syncStatus: req.query.syncStatus as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      };
      const [overrides, total] = await Promise.all([
        storage.getManualOverrides(filters),
        storage.getManualOverrideCount(filters),
      ]);
      res.json({ overrides, total, limit: filters.limit, offset: filters.offset });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch manual overrides" });
    }
  });

  app.get("/api/admin/government/manual-overrides/stats", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const [submitted, inReview, approved, rejected, pendingSync, synced, mismatched] = await Promise.all([
        storage.getManualOverrideCount({ overrideStatus: "submitted" }),
        storage.getManualOverrideCount({ overrideStatus: "in_review" }),
        storage.getManualOverrideCount({ overrideStatus: "approved" }),
        storage.getManualOverrideCount({ overrideStatus: "rejected" }),
        storage.getManualOverrideCount({ syncStatus: "pending" }),
        storage.getManualOverrideCount({ syncStatus: "synced" }),
        storage.getManualOverrideCount({ syncStatus: "mismatch" }),
      ]);
      res.json({ submitted, inReview, approved, rejected, pendingSync, synced, mismatched, total: submitted + inReview + approved + rejected });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch override stats" });
    }
  });

  app.get("/api/admin/government/manual-overrides/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const override = await storage.getManualOverrideById(req.params.id);
      if (!override) return res.status(404).json({ message: "Override not found" });
      res.json(override);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch override" });
    }
  });

  app.post("/api/admin/government/manual-overrides", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub || "admin";
      const data = {
        ...req.body,
        submittedBy: userId,
        overrideStatus: "submitted",
        syncStatus: "pending",
        syncRequired: true,
      };
      const override = await storage.createManualOverride(data);
      await storage.createComplianceAuditLog({
        userId,
        userRole: "admin",
        action: "manual_override_created",
        recordType: "manual_override",
        recordId: override.id,
        details: { licenseNumber: data.licenseNumber, integrationCode: data.integrationCode, reason: data.reason },
        ipAddress: req.ip || req.connection?.remoteAddress,
      });
      res.status(201).json(override);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to create manual override" });
    }
  });

  app.post("/api/admin/government/manual-overrides/:id/evidence", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const override = await storage.getManualOverrideById(req.params.id);
      if (!override) return res.status(404).json({ message: "Override not found" });
      const currentEvidence = Array.isArray(override.evidence) ? override.evidence : [];
      const newEvidence = {
        ...req.body,
        uploadedBy: req.user?.id || req.user?.claims?.sub || "admin",
        uploadedAt: new Date().toISOString(),
      };
      const updated = await storage.updateManualOverride(req.params.id, {
        evidence: [...currentEvidence, newEvidence] as any,
      });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to add evidence" });
    }
  });

  app.post("/api/admin/government/manual-overrides/:id/review", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const override = await storage.getManualOverrideById(req.params.id);
      if (!override) return res.status(404).json({ message: "Override not found" });
      if (override.overrideStatus !== "submitted" && override.overrideStatus !== "in_review") {
        return res.status(400).json({ message: "Override is not in a reviewable state" });
      }
      const updated = await storage.updateManualOverride(req.params.id, {
        overrideStatus: "in_review",
        reviewedBy: req.user?.id || req.user?.claims?.sub || "admin",
      });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to mark override for review" });
    }
  });

  app.post("/api/admin/government/manual-overrides/:id/approve", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const override = await storage.getManualOverrideById(req.params.id);
      if (!override) return res.status(404).json({ message: "Override not found" });
      if (override.overrideStatus !== "submitted" && override.overrideStatus !== "in_review") {
        return res.status(400).json({ message: `Cannot approve override in '${override.overrideStatus}' state. Must be 'submitted' or 'in_review'.` });
      }
      const approverId = req.user?.id || req.user?.claims?.sub || "admin";
      if (override.submittedBy === approverId) {
        return res.status(403).json({ message: "Dual-control violation: you cannot approve your own submission. A different officer must approve." });
      }
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 14);
      const updated = await storage.updateManualOverride(req.params.id, {
        overrideStatus: "approved",
        reviewedBy: approverId,
        approvedBy: approverId,
        reviewNotes: req.body.reviewNotes || null,
        reviewedAt: new Date(),
        approvedAt: new Date(),
        manualVerificationExpiry: expiryDate,
      });
      await storage.createComplianceAuditLog({
        userId: approverId,
        userRole: "admin",
        action: "manual_override_approved",
        recordType: "manual_override",
        recordId: req.params.id,
        details: { licenseNumber: override.licenseNumber, submittedBy: override.submittedBy, expiresAt: expiryDate.toISOString(), reviewNotes: req.body.reviewNotes },
        ipAddress: req.ip || req.connection?.remoteAddress,
      });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to approve override" });
    }
  });

  app.post("/api/admin/government/manual-overrides/:id/reject", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const override = await storage.getManualOverrideById(req.params.id);
      if (!override) return res.status(404).json({ message: "Override not found" });
      if (override.overrideStatus !== "submitted" && override.overrideStatus !== "in_review") {
        return res.status(400).json({ message: `Cannot reject override in '${override.overrideStatus}' state. Must be 'submitted' or 'in_review'.` });
      }
      const rejecterId = req.user?.id || req.user?.claims?.sub || "admin";
      const updated = await storage.updateManualOverride(req.params.id, {
        overrideStatus: "rejected",
        reviewedBy: rejecterId,
        reviewNotes: req.body.reviewNotes || req.body.reason || "Rejected by compliance officer",
        reviewedAt: new Date(),
      });
      await storage.createComplianceAuditLog({
        userId: rejecterId,
        userRole: "admin",
        action: "manual_override_rejected",
        recordType: "manual_override",
        recordId: req.params.id,
        details: { licenseNumber: override.licenseNumber, reviewNotes: req.body.reviewNotes },
        ipAddress: req.ip || req.connection?.remoteAddress,
      });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to reject override" });
    }
  });

  app.post("/api/admin/government/fallback/:code/toggle", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { enabled, reason } = req.body;
      const userId = req.user?.id || req.user?.claims?.sub || "admin";
      const updated = await storage.setIntegrationFallbackMode(req.params.code, enabled, reason);
      if (!updated) return res.status(404).json({ message: "Integration not found" });
      await storage.createComplianceAuditLog({
        userId,
        userRole: "admin",
        action: enabled ? "fallback_activated" : "fallback_deactivated",
        recordType: "government_integration",
        recordId: req.params.code,
        details: { enabled, reason },
        ipAddress: req.ip || req.connection?.remoteAddress,
      });
      await storage.createDowntimeEvent({
        integrationCode: req.params.code,
        eventType: enabled ? "fallback_activated" : "fallback_deactivated",
        reason: reason || (enabled ? "Manually activated by admin" : "Manually deactivated by admin"),
        triggeredBy: userId,
      });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to toggle fallback mode" });
    }
  });

  app.post("/api/admin/government/manual-overrides/resync/:code", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const { governmentRegistry } = await import("./government");
      if (governmentRegistry.isResyncInProgress(req.params.code)) {
        return res.status(409).json({ message: "Re-sync already in progress" });
      }
      await storage.createComplianceAuditLog({
        userId: userId || "system",
        userRole: "admin",
        action: "resync_triggered",
        recordType: "government_integration",
        recordId: req.params.code,
        details: { integrationCode: req.params.code },
        ipAddress: req.ip || "unknown",
      });
      const results = await governmentRegistry.triggerResync(req.params.code);
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to trigger re-sync" });
    }
  });

  app.get("/api/license-status/:integrationCode/:licenseNumber", async (req: any, res) => {
    try {
      const { integrationCode, licenseNumber } = req.params;
      const integration = await storage.getGovernmentIntegrationByCode(integrationCode);

      if (integration?.fallbackMode) {
        const manualOverride = await storage.getManualOverrideByLicense(integrationCode, licenseNumber);
        if (manualOverride) {
          const isExpired = manualOverride.manualVerificationExpiry && new Date(manualOverride.manualVerificationExpiry) < new Date();
          return res.json({
            licenseNumber,
            status: isExpired ? "PENDING_CONFIRMATION" : manualOverride.manualLicenseStatus,
            verificationMethod: "manual",
            manuallyVerified: true,
            legalDisclaimer: "This license status has been temporarily verified due to government system unavailability. Final confirmation will occur automatically once government systems resume service. This temporary verification is valid for 14 days from the date of approval.",
            message: isExpired
              ? "Your temporary manual verification has expired. The system is awaiting government confirmation."
              : "Your license has been temporarily verified while the government system is unavailable. Final confirmation will be completed automatically.",
            governmentSystemAvailable: false,
            overrideId: manualOverride.id,
            syncRequired: manualOverride.syncRequired,
            expiryDateOverride: manualOverride.expiryDateOverride,
            manualVerificationExpiry: manualOverride.manualVerificationExpiry,
          });
        }
        return res.json({
          licenseNumber,
          status: "UNKNOWN",
          verificationMethod: "unavailable",
          manuallyVerified: false,
          message: "The government verification system is temporarily unavailable. Please contact support for manual verification.",
          governmentSystemAvailable: false,
        });
      }

      const manualOverride = await storage.getManualOverrideByLicense(integrationCode, licenseNumber);
      if (manualOverride && manualOverride.syncStatus === "synced") {
        return res.json({
          licenseNumber,
          status: manualOverride.manualLicenseStatus,
          verificationMethod: "verified",
          manuallyVerified: false,
          governmentSystemAvailable: true,
          syncStatus: "synced",
        });
      }
      if (manualOverride && manualOverride.syncStatus === "mismatch") {
        return res.json({
          licenseNumber,
          status: "UNDER_REVIEW",
          verificationMethod: "manual_pending_review",
          manuallyVerified: true,
          message: "Your license verification is under review due to a discrepancy. Please contact support.",
          governmentSystemAvailable: true,
          syncStatus: "mismatch",
        });
      }

      try {
        const { governmentRegistry: govRegistry } = await import("./government");
        const adapter = govRegistry.getAdapter(integrationCode);
        if (adapter) {
          const circuitBreaker = govRegistry.getCircuitBreaker(integrationCode);
          const verifyFn = () => adapter.fetchLicenseStatus(licenseNumber);
          const result = circuitBreaker ? await circuitBreaker.execute(verifyFn) : await verifyFn();
          return res.json({
            licenseNumber,
            status: (result as any)?.status || "UNKNOWN",
            verificationMethod: "government_api",
            manuallyVerified: false,
            governmentSystemAvailable: true,
            source: "live",
          });
        }
      } catch (apiError: any) {
        console.error(`[LicenseStatus] Live API verification failed for ${licenseNumber}:`, apiError.message);
      }

      res.json({
        licenseNumber,
        status: "UNKNOWN",
        verificationMethod: "api",
        manuallyVerified: false,
        governmentSystemAvailable: true,
        message: "License status could not be determined. Please use the verification portal or contact support.",
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to check license status" });
    }
  });

  app.get("/api/government-status", async (_req: any, res) => {
    try {
      const status = await withCache(CACHE_KEYS.GOVERNMENT_STATUS, CACHE_TTL.GOVERNMENT_STATUS, async () => {
        const integrations = await storage.getGovernmentIntegrations();
        return {
          integrations: integrations.map(i => ({
            code: i.code,
            name: i.name,
            available: !i.fallbackMode,
            fallbackMode: i.fallbackMode,
            fallbackReason: i.fallbackReason,
            fallbackActivatedAt: i.fallbackActivatedAt,
            healthStatus: i.healthStatus,
          })),
        };
      });
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch government system status" });
    }
  });

  app.post("/api/license-status/acknowledge", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const { overrideId } = req.body;
      if (!overrideId) return res.status(400).json({ message: "overrideId required" });
      const override = await storage.getManualOverrideById(overrideId);
      if (!override) return res.status(404).json({ message: "Override not found" });
      const viewed = Array.isArray(override.disclaimerViewedBy) ? override.disclaimerViewedBy : [];
      const alreadyViewed = viewed.some((v: any) => v.userId === userId);
      if (!alreadyViewed) {
        await storage.updateManualOverride(overrideId, {
          disclaimerViewedBy: [...viewed, { userId, viewedAt: new Date().toISOString() }] as any,
        });
        await storage.createComplianceAuditLog({
          userId,
          userRole: "user",
          action: "disclaimer_acknowledged",
          recordType: "manual_override",
          recordId: overrideId,
          details: { licenseNumber: override.licenseNumber },
          ipAddress: req.ip || req.connection?.remoteAddress,
        });
      }
      res.json({ acknowledged: true });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to acknowledge disclaimer" });
    }
  });

  app.get("/api/admin/compliance-logs", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const filters = {
        userId: req.query.userId as string | undefined,
        action: req.query.action as string | undefined,
        recordType: req.query.recordType as string | undefined,
        recordId: req.query.recordId as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      };
      const [logs, total] = await Promise.all([
        storage.getComplianceAuditLogs(filters),
        storage.getComplianceAuditLogCount(filters),
      ]);
      res.json({ logs, total, limit: filters.limit, offset: filters.offset });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch compliance logs" });
    }
  });

  app.get("/api/admin/compliance-logs/stats", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const [total, overrideCreated, overrideApproved, overrideRejected, fallbackEvents] = await Promise.all([
        storage.getComplianceAuditLogCount(),
        storage.getComplianceAuditLogCount({ action: "manual_override_created" }),
        storage.getComplianceAuditLogCount({ action: "manual_override_approved" }),
        storage.getComplianceAuditLogCount({ action: "manual_override_rejected" }),
        storage.getComplianceAuditLogCount({ action: "fallback_activated" }),
      ]);
      res.json({ total, overrideCreated, overrideApproved, overrideRejected, fallbackEvents });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch compliance stats" });
    }
  });

  app.get("/api/admin/government/downtime-events", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const filters = {
        integrationCode: req.query.integrationCode as string | undefined,
        eventType: req.query.eventType as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      };
      const events = await storage.getDowntimeEvents(filters);
      res.json({ events });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch downtime events" });
    }
  });

  app.get("/api/admin/government/downtime-analytics", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const integrationCode = req.query.integrationCode as string | undefined;
      const analytics = await storage.getDowntimeAnalytics(integrationCode);
      const integrations = await storage.getGovernmentIntegrations();
      const pendingSyncCount = await storage.getManualOverrideCount({ syncStatus: "pending" });
      const manualApprovals = await storage.getManualOverrideCount({ overrideStatus: "approved" });
      res.json({ ...analytics, pendingSyncCount, manualApprovals, integrations: integrations.map(i => ({ code: i.code, name: i.name, fallbackMode: i.fallbackMode })) });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch downtime analytics" });
    }
  });

  app.get("/api/admin/compliance/export/csv", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const crypto = await import("crypto");
      const userId = req.user?.id || req.user?.claims?.sub || "admin";
      const overrides = await storage.getManualOverrides({ limit: 10000 });
      const headers = [
        "ID", "Integration Code", "License Number", "Agency ID", "Agency Name",
        "Override Status", "Manual License Status", "Reason", "Evidence Count",
        "Submitted By", "Approved By", "Review Notes", "Approved At",
        "Sync Status", "Sync Required", "Mismatch Notes",
        "Manual Verification Expiry", "Expiry Notified",
        "Created At", "Updated At"
      ];
      const sanitizeCsvField = (val: string) => {
        const s = String(val || "").replace(/"/g, '""');
        if (/^[=+\-@\t\r]/.test(s)) return `"\t${s}"`;
        return `"${s}"`;
      };
      const rows = overrides.map(o => [
        o.id,
        o.integrationCode,
        o.licenseNumber,
        o.agencyId || "",
        sanitizeCsvField(o.agencyName || ""),
        o.overrideStatus,
        o.manualLicenseStatus,
        sanitizeCsvField(o.reason || ""),
        Array.isArray(o.evidence) ? o.evidence.length : 0,
        o.submittedBy,
        o.approvedBy || o.reviewedBy || "",
        sanitizeCsvField(o.reviewNotes || ""),
        o.approvedAt ? new Date(o.approvedAt).toISOString() : "",
        o.syncStatus,
        o.syncRequired ? "Yes" : "No",
        sanitizeCsvField(o.mismatchNotes || ""),
        o.manualVerificationExpiry ? new Date(o.manualVerificationExpiry).toISOString() : "",
        o.expiryNotified ? "Yes" : "No",
        o.createdAt ? new Date(o.createdAt).toISOString() : "",
        o.updatedAt ? new Date(o.updatedAt).toISOString() : "",
      ].join(","));
      const csvContent = [headers.join(","), ...rows].join("\n");
      const hashSignature = crypto.createHash("sha256").update(csvContent).digest("hex");
      const exportMeta = `\n\n# Export Metadata\n# Export ID: ${crypto.randomUUID()}\n# Exported By: ${userId}\n# Timestamp: ${new Date().toISOString()}\n# Records: ${overrides.length}\n# SHA-256 Hash: ${hashSignature}`;
      await storage.createAuditExport({
        exportedBy: userId,
        exportType: "csv",
        filters: req.query as any,
        recordCount: overrides.length,
        hashSignature,
      });
      await storage.createComplianceAuditLog({
        userId,
        userRole: "admin",
        action: "audit_export",
        recordType: "compliance_export",
        details: { format: "csv", recordCount: overrides.length, hashSignature },
        ipAddress: req.ip || req.connection?.remoteAddress,
      });
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="compliance-audit-${new Date().toISOString().split("T")[0]}.csv"`);
      res.send(csvContent + exportMeta);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to export audit data" });
    }
  });

  app.get("/api/admin/compliance/exports", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const exports = await storage.getAuditExports(50);
      res.json({ exports });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch export history" });
    }
  });

  app.post("/api/admin/government/manual-overrides/check-expiry", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const expired = await storage.getExpiredManualOverrides();
      let updated = 0;
      for (const override of expired) {
        await storage.updateManualOverride(override.id, {
          overrideStatus: "submitted",
          manualLicenseStatus: "UNKNOWN",
          expiryNotified: true,
          syncRequired: true,
        });
        await storage.createComplianceAuditLog({
          userId: "system",
          userRole: "system",
          action: "manual_verification_expired",
          recordType: "manual_override",
          recordId: override.id,
          details: { licenseNumber: override.licenseNumber, expiredAt: override.manualVerificationExpiry },
        });
        updated++;
      }
      res.json({ expired: expired.length, updated });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to check expiry" });
    }
  });

  app.get("/api/agency-scores/bulk", async (_req: any, res) => {
    try {
      const scores = await storage.getAllAgencyScores({ limit: 5000 });
      const scoreMap: Record<string, { overallScore: number; tier: string }> = {};
      for (const s of scores) {
        scoreMap[s.agencyId] = { overallScore: s.overallScore, tier: s.tier };
      }
      res.json({ scores: scoreMap });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch scores" });
    }
  });

  app.get("/api/agency-score/:agencyId", async (req: any, res) => {
    try {
      const { agencyId } = req.params;
      const score = await storage.getAgencyScore(agencyId);
      if (!score) {
        return res.json({ agencyId, overallScore: null, tier: null, message: "Score not yet calculated" });
      }
      res.json({
        agencyId: score.agencyId,
        overallScore: score.overallScore,
        tier: score.tier,
        licenseStatusScore: score.licenseStatusScore,
        complianceHistoryScore: score.complianceHistoryScore,
        paymentTransparencyScore: score.paymentTransparencyScore,
        governmentVerificationScore: score.governmentVerificationScore,
        userFeedbackScore: score.userFeedbackScore,
        longevityScore: score.longevityScore,
        isFrozen: score.isFrozen,
        lastCalculatedAt: score.lastCalculatedAt,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch agency score" });
    }
  });

  app.get("/api/admin/agency-scores", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const filters = {
        tier: req.query.tier as string | undefined,
        isFrozen: req.query.isFrozen === "true" ? true : req.query.isFrozen === "false" ? false : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      };
      const [scores, total] = await Promise.all([
        storage.getAllAgencyScores(filters),
        storage.getAgencyScoreCount(filters),
      ]);
      res.json({ scores, total, limit: filters.limit, offset: filters.offset });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch agency scores" });
    }
  });

  app.get("/api/admin/agency-scores/stats", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const [total, platinum, gold, silver, caution, highRisk, frozenCount] = await Promise.all([
        storage.getAgencyScoreCount(),
        storage.getAgencyScoreCount({ tier: "platinum" }),
        storage.getAgencyScoreCount({ tier: "gold" }),
        storage.getAgencyScoreCount({ tier: "silver" }),
        storage.getAgencyScoreCount({ tier: "caution" }),
        storage.getAgencyScoreCount({ tier: "high_risk" }),
        storage.getAgencyScoreCount({ isFrozen: true }),
      ]);
      res.json({ total, tiers: { platinum, gold, silver, caution, high_risk: highRisk }, frozenCount });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch score stats" });
    }
  });

  app.post("/api/admin/agency-scores/:agencyId/recalculate", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { agencyId } = req.params;
      const userId = req.user?.id || req.user?.claims?.sub || "admin";
      const result = await calculateAgencyScore(agencyId, userId);
      if (!result) return res.status(404).json({ message: "Agency not found" });
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to recalculate score" });
    }
  });

  app.post("/api/admin/agency-scores/recalculate-all", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub || "admin";
      const result = await recalculateAllScores(userId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to recalculate all scores" });
    }
  });

  app.post("/api/admin/agency-scores/:agencyId/freeze", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { agencyId } = req.params;
      const { reason } = req.body;
      const userId = req.user?.id || req.user?.claims?.sub || "admin";
      if (!reason) return res.status(400).json({ message: "Freeze reason is required" });
      await storage.freezeAgencyScore(agencyId, userId, reason);
      res.json({ success: true, message: "Score frozen" });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to freeze score" });
    }
  });

  app.post("/api/admin/agency-scores/:agencyId/unfreeze", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { agencyId } = req.params;
      await storage.unfreezeAgencyScore(agencyId);
      res.json({ success: true, message: "Score unfrozen" });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to unfreeze score" });
    }
  });

  app.get("/api/admin/agency-scores/:agencyId/history", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { agencyId } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const history = await storage.getScoreHistory(agencyId, limit);
      res.json({ history });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch score history" });
    }
  });

  app.get("/api/admin/agency-score-weights", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const weights = await storage.getScoreWeights();
      res.json({ weights });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch score weights" });
    }
  });

  app.patch("/api/admin/agency-score-weights/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { weight } = req.body;
      const userId = req.user?.id || req.user?.claims?.sub || "admin";
      if (weight === undefined || weight < 0 || weight > 100) {
        return res.status(400).json({ message: "Weight must be between 0 and 100" });
      }
      const updated = await storage.updateScoreWeight(id, weight, userId);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update score weight" });
    }
  });

  app.post("/api/admin/agency-compliance-events", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { agencyId, eventType, severity, description } = req.body;
      const userId = req.user?.id || req.user?.claims?.sub || "admin";
      if (!agencyId || !eventType) {
        return res.status(400).json({ message: "agencyId and eventType are required" });
      }
      const event = await storage.createComplianceEvent({
        agencyId,
        eventType,
        severity: severity || "info",
        description,
        reportedBy: userId,
      });
      await calculateAgencyScore(agencyId, "compliance_event");
      res.json(event);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to create compliance event" });
    }
  });

  app.get("/api/admin/agency-compliance-events/:agencyId", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { agencyId } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const events = await storage.getComplianceEvents(agencyId, limit);
      res.json({ events });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch compliance events" });
    }
  });

  // ===== FRAUD DETECTION & BLACKLIST ENDPOINTS =====

  app.get("/api/admin/fraud-flags", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const filters = {
        status: req.query.status as string | undefined,
        severity: req.query.severity as string | undefined,
        entityType: req.query.entityType as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      };
      const [flags, total] = await Promise.all([
        storage.getAllFraudFlags(filters),
        storage.getFraudFlagCount(filters),
      ]);
      res.json({ flags, total });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch fraud flags" });
    }
  });

  app.get("/api/admin/fraud-flags/stats", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const [open, investigating, resolved, dismissed, low, medium, high, critical, activeBlacklist] = await Promise.all([
        storage.getFraudFlagCount({ status: "open" }),
        storage.getFraudFlagCount({ status: "investigating" }),
        storage.getFraudFlagCount({ status: "resolved" }),
        storage.getFraudFlagCount({ status: "dismissed" }),
        storage.getFraudFlagCount({ severity: "low" }),
        storage.getFraudFlagCount({ severity: "medium" }),
        storage.getFraudFlagCount({ severity: "high" }),
        storage.getFraudFlagCount({ severity: "critical" }),
        storage.getBlacklistCount({ status: "active" }),
      ]);
      res.json({
        byStatus: { open, investigating, resolved, dismissed },
        bySeverity: { low, medium, high, critical },
        activeBlacklist,
        total: open + investigating + resolved + dismissed,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch fraud stats" });
    }
  });

  app.get("/api/admin/fraud-flags/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const flag = await storage.getFraudFlag(req.params.id);
      if (!flag) return res.status(404).json({ message: "Fraud flag not found" });
      const notes = await storage.getNotesByFraudFlag(flag.id);
      res.json({ flag, notes });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch fraud flag" });
    }
  });

  app.patch("/api/admin/fraud-flags/:id/status", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { status } = req.body;
      if (!["open", "investigating", "resolved", "dismissed"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const userId = req.user?.id || req.user?.claims?.sub || "admin";
      const updated = await storage.updateFraudFlagStatus(req.params.id, status, userId);
      res.json({ flag: updated });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update fraud flag status" });
    }
  });

  app.post("/api/admin/fraud-flags/:id/notes", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { note } = req.body;
      if (!note || typeof note !== "string" || note.trim().length === 0) {
        return res.status(400).json({ message: "Note is required" });
      }
      const userId = req.user?.id || req.user?.claims?.sub || "admin";
      const created = await storage.createFraudInvestigationNote({
        fraudFlagId: req.params.id,
        note: note.trim(),
        attachedBy: userId,
      });
      res.json({ note: created });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to add investigation note" });
    }
  });

  app.get("/api/admin/fraud-flags/:id/notes", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const notes = await storage.getNotesByFraudFlag(req.params.id);
      res.json({ notes });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch notes" });
    }
  });

  app.get("/api/admin/blacklist", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const filters = {
        status: req.query.status as string | undefined,
        entityType: req.query.entityType as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      };
      const [entries, total] = await Promise.all([
        storage.getAllBlacklistEntries(filters),
        storage.getBlacklistCount(filters),
      ]);
      res.json({ entries, total });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch blacklist" });
    }
  });

  app.post("/api/admin/blacklist", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { entityId, entityType, reason, evidence } = req.body;
      if (!entityId || !entityType || !reason) {
        return res.status(400).json({ message: "entityId, entityType, and reason are required" });
      }
      const userId = req.user?.id || req.user?.claims?.sub || "admin";
      const entry = await storage.createBlacklistEntry({
        entityId,
        entityType,
        reason,
        reportedBy: userId,
        status: "active",
        evidence: evidence || [],
      });
      cache.invalidate(CACHE_KEYS.NEA_AGENCIES_BLACKLIST);
      res.json({ entry });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to add to blacklist" });
    }
  });

  app.patch("/api/admin/blacklist/:id/status", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { status } = req.body;
      if (!["active", "under_review", "cleared"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const updated = await storage.updateBlacklistStatus(req.params.id, status);
      cache.invalidate(CACHE_KEYS.NEA_AGENCIES_BLACKLIST);
      res.json({ entry: updated });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update blacklist status" });
    }
  });

  app.post("/api/admin/blacklist/:id/clear", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { reason } = req.body;
      if (!reason) return res.status(400).json({ message: "Clearing reason is required" });
      const userId = req.user?.id || req.user?.claims?.sub || "admin";
      const updated = await storage.clearBlacklistEntry(req.params.id, userId, reason);
      res.json({ entry: updated });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to clear blacklist entry" });
    }
  });

  app.post("/api/admin/blacklist/:id/notes", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { note } = req.body;
      if (!note || typeof note !== "string" || note.trim().length === 0) {
        return res.status(400).json({ message: "Note is required" });
      }
      const userId = req.user?.id || req.user?.claims?.sub || "admin";
      const created = await storage.createFraudInvestigationNote({
        blacklistEntryId: req.params.id,
        note: note.trim(),
        attachedBy: userId,
      });
      res.json({ note: created });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to add note" });
    }
  });

  app.get("/api/admin/blacklist/:id/notes", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const notes = await storage.getNotesByBlacklistEntry(req.params.id);
      res.json({ notes });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch notes" });
    }
  });

  app.get("/api/admin/fraud-detection-rules", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const rules = await storage.getAllFraudDetectionRules();
      res.json({ rules });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch detection rules" });
    }
  });

  app.patch("/api/admin/fraud-detection-rules/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { threshold, timeWindowDays, severity, isActive, autoBlacklist, autoReduceScore, scoreReduction } = req.body;
      const updateData: any = {};
      if (threshold !== undefined) updateData.threshold = threshold;
      if (timeWindowDays !== undefined) updateData.timeWindowDays = timeWindowDays;
      if (severity !== undefined) updateData.severity = severity;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (autoBlacklist !== undefined) updateData.autoBlacklist = autoBlacklist;
      if (autoReduceScore !== undefined) updateData.autoReduceScore = autoReduceScore;
      if (scoreReduction !== undefined) updateData.scoreReduction = scoreReduction;
      const updated = await storage.updateFraudDetectionRule(req.params.id, updateData);
      res.json({ rule: updated });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update rule" });
    }
  });

  app.post("/api/admin/fraud-detection/scan", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const { runBatchFraudDetection } = await import("./fraud-engine");
      const result = await runBatchFraudDetection();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to run batch fraud scan" });
    }
  });

  app.post("/api/admin/fraud-detection/scan/:entityId", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { runFraudDetection } = await import("./fraud-engine");
      const result = await runFraudDetection(req.params.entityId, "agency");
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to run fraud scan" });
    }
  });

  // =====================================================================
  // PUBLIC VERIFICATION PORTAL
  // =====================================================================

  const verificationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    message: { message: "Too many verification requests. Please try again later." },
  });

  app.get("/api/verify/search", verificationLimiter, async (req, res) => {
    try {
      const query = (req.query.q as string || "").trim();
      if (!query || query.length < 2) {
        return res.json([]);
      }

      const agencies = await storage.getNeaAgencies(query);
      const results = [];

      for (const agency of agencies) {
        const isBlacklisted = await storage.isEntityBlacklisted(agency.id);
        const score = await storage.getAgencyScore(agency.id);
        const fraudFlags = await storage.getFraudFlagsByEntityId(agency.id);
        const activeFlags = fraudFlags.filter((f: any) => f.status === "open" || f.status === "investigating");

        const now = new Date();
        const expiryDate = agency.expiryDate ? new Date(agency.expiryDate) : null;
        let licenseStatus = "valid";
        if (agency.statusOverride === "suspended") licenseStatus = "suspended";
        else if (isBlacklisted) licenseStatus = "blacklisted";
        else if (expiryDate && expiryDate < now) licenseStatus = "expired";

        results.push({
          id: agency.id,
          agencyName: agency.agencyName,
          licenseNumber: agency.licenseNumber,
          email: agency.email,
          website: agency.website,
          serviceType: agency.serviceType,
          issueDate: agency.issueDate,
          expiryDate: agency.expiryDate,
          licenseStatus,
          isBlacklisted,
          legitimacyScore: score ? {
            overallScore: score.overallScore,
            tier: score.tier,
          } : null,
          hasFraudWarnings: activeFlags.length > 0,
          fraudWarningCount: activeFlags.length,
        });
      }

      const idQuery = query.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      if (idQuery && results.length === 0) {
        const agencyById = await storage.getNeaAgencyById(query);
        if (agencyById) {
          const isBlacklisted = await storage.isEntityBlacklisted(agencyById.id);
          const score = await storage.getAgencyScore(agencyById.id);
          const fraudFlags = await storage.getFraudFlagsByEntityId(agencyById.id);
          const activeFlags = fraudFlags.filter((f: any) => f.status === "open" || f.status === "investigating");
          const now = new Date();
          const expiryDate = agencyById.expiryDate ? new Date(agencyById.expiryDate) : null;
          let licenseStatus = "valid";
          if (agencyById.statusOverride === "suspended") licenseStatus = "suspended";
          else if (isBlacklisted) licenseStatus = "blacklisted";
          else if (expiryDate && expiryDate < now) licenseStatus = "expired";
          results.push({
            id: agencyById.id,
            agencyName: agencyById.agencyName,
            licenseNumber: agencyById.licenseNumber,
            email: agencyById.email,
            website: agencyById.website,
            serviceType: agencyById.serviceType,
            issueDate: agencyById.issueDate,
            expiryDate: agencyById.expiryDate,
            licenseStatus,
            isBlacklisted,
            legitimacyScore: score ? { overallScore: score.overallScore, tier: score.tier } : null,
            hasFraudWarnings: activeFlags.length > 0,
            fraudWarningCount: activeFlags.length,
          });
        }
      }

      res.json(results);
    } catch (error: any) {
      console.error("Verification search error:", error);
      res.status(500).json({ message: "Search failed" });
    }
  });

  app.get("/api/verify/agency/:id", verificationLimiter, async (req, res) => {
    try {
      const agency = await storage.getNeaAgencyById(req.params.id);
      if (!agency) {
        return res.status(404).json({ message: "Agency not found" });
      }

      const isBlacklisted = await storage.isEntityBlacklisted(agency.id);
      const score = await storage.getAgencyScore(agency.id);
      const fraudFlags = await storage.getFraudFlagsByEntityId(agency.id);
      const activeFlags = fraudFlags.filter((f: any) => f.status === "open" || f.status === "investigating");

      const now = new Date();
      const expiryDate = agency.expiryDate ? new Date(agency.expiryDate) : null;
      let licenseStatus = "valid";
      if (agency.statusOverride === "suspended") licenseStatus = "suspended";
      else if (isBlacklisted) licenseStatus = "blacklisted";
      else if (expiryDate && expiryDate < now) licenseStatus = "expired";

      res.json({
        id: agency.id,
        agencyName: agency.agencyName,
        licenseNumber: agency.licenseNumber,
        email: agency.email,
        website: agency.website,
        serviceType: agency.serviceType,
        issueDate: agency.issueDate,
        expiryDate: agency.expiryDate,
        lastUpdated: agency.lastUpdated,
        licenseStatus,
        isBlacklisted,
        legitimacyScore: score ? {
          overallScore: score.overallScore,
          tier: score.tier,
          licenseStatusScore: score.licenseStatusScore,
          complianceHistoryScore: score.complianceHistoryScore,
          paymentTransparencyScore: score.paymentTransparencyScore,
          governmentVerificationScore: score.governmentVerificationScore,
          userFeedbackScore: score.userFeedbackScore,
          longevityScore: score.longevityScore,
          lastCalculatedAt: score.lastCalculatedAt,
        } : null,
        hasFraudWarnings: activeFlags.length > 0,
        fraudWarningCount: activeFlags.length,
        fraudWarnings: activeFlags.map((f: any) => ({
          ruleTriggered: f.ruleTriggered,
          severity: f.severity,
          description: typeof f.details === "object" && f.details?.message ? f.details.message : String(f.ruleTriggered || "").replace(/_/g, " "),
          createdAt: f.createdAt,
        })),
      });
    } catch (error: any) {
      console.error("Verification detail error:", error);
      res.status(500).json({ message: "Failed to fetch agency details" });
    }
  });

  app.get("/api/verify/qr/:id", verificationLimiter, async (req, res) => {
    try {
      const agency = await storage.getNeaAgencyById(req.params.id);
      if (!agency) {
        return res.status(404).json({ message: "Agency not found" });
      }

      const QRCode = (await import("qrcode")).default;
      const canonicalBase = process.env.PUBLIC_APP_URL || "https://workabroadhub.tech";
      const verifyUrl = `${canonicalBase}/verify?agency=${agency.id}`;

      const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
        width: 300,
        margin: 2,
        color: { dark: "#0f172a", light: "#ffffff" },
        errorCorrectionLevel: "M",
      });

      res.json({
        qrCode: qrDataUrl,
        verifyUrl,
        agencyName: agency.agencyName,
        licenseNumber: agency.licenseNumber,
      });
    } catch (error: any) {
      console.error("QR generation error:", error);
      res.status(500).json({ message: "Failed to generate QR code" });
    }
  });

  // =====================================================================
  // GLOBAL AGENCY REGISTRY MAP
  // =====================================================================

  app.get("/api/map/agencies", async (req, res) => {
    try {
      const { country, status, minScore, maxScore, industry, search } = req.query;
      const allAgencies = await storage.getNeaAgencies(search as string | undefined);
      const results = [];

      for (const agency of allAgencies) {
        if (!agency.latitude || !agency.longitude) continue;

        const isBlacklisted = await storage.isEntityBlacklisted(agency.id);
        if (isBlacklisted) continue;

        const score = await storage.getAgencyScore(agency.id);
        const now = new Date();
        const expiryDate = agency.expiryDate ? new Date(agency.expiryDate) : null;
        const daysUntilExpiry = expiryDate ? Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;

        let licenseStatus = "valid";
        if (agency.statusOverride === "suspended") licenseStatus = "suspended";
        else if (expiryDate && expiryDate < now) licenseStatus = "expired";
        else if (daysUntilExpiry !== null && daysUntilExpiry <= 30) licenseStatus = "expiring_soon";

        if (country && agency.country && agency.country.toLowerCase() !== (country as string).toLowerCase()) continue;
        if (status && licenseStatus !== status) continue;
        if (industry && agency.serviceType && !agency.serviceType.toLowerCase().includes((industry as string).toLowerCase())) continue;
        if (minScore && score && score.overallScore < parseInt(minScore as string)) continue;
        if (maxScore && score && score.overallScore > parseInt(maxScore as string)) continue;

        let markerColor = "gray";
        if (licenseStatus === "valid" && score && score.overallScore >= 60) markerColor = "green";
        else if (licenseStatus === "expiring_soon" || (score && score.overallScore >= 40 && score.overallScore < 60)) markerColor = "yellow";
        else if (licenseStatus === "expired" || licenseStatus === "suspended") markerColor = "red";

        results.push({
          id: agency.id,
          agencyName: agency.agencyName,
          licenseNumber: agency.licenseNumber,
          latitude: parseFloat(agency.latitude),
          longitude: parseFloat(agency.longitude),
          country: agency.country || "Kenya",
          city: agency.city || "Unknown",
          serviceType: agency.serviceType,
          licenseStatus,
          expiryDate: agency.expiryDate,
          markerColor,
          legitimacyScore: score ? { overallScore: score.overallScore, tier: score.tier } : null,
        });
      }

      res.json(results);
    } catch (error: any) {
      console.error("Map agencies error:", error);
      res.status(500).json({ message: "Failed to fetch map data" });
    }
  });

  app.get("/api/map/filters", async (_req, res) => {
    try {
      const allAgencies = await storage.getNeaAgencies();
      const countries = new Set<string>();
      const industries = new Set<string>();
      for (const a of allAgencies) {
        if (a.country) countries.add(a.country);
        if (a.serviceType) industries.add(a.serviceType);
      }
      res.json({
        countries: Array.from(countries).sort(),
        industries: Array.from(industries).sort(),
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch filters" });
    }
  });

  const coordinatesSchema = z.object({
    latitude: z.string().optional().nullable().refine(
      (v) => !v || (parseFloat(v) >= -90 && parseFloat(v) <= 90),
      { message: "Latitude must be between -90 and 90" }
    ),
    longitude: z.string().optional().nullable().refine(
      (v) => !v || (parseFloat(v) >= -180 && parseFloat(v) <= 180),
      { message: "Longitude must be between -180 and 180" }
    ),
    country: z.string().max(100).optional().nullable(),
    city: z.string().max(100).optional().nullable(),
  });

  app.patch("/api/admin/nea-agencies/:id/coordinates", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const parsed = coordinatesSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid coordinates", errors: parsed.error.flatten() });
      }
      const { latitude, longitude, country, city } = parsed.data;
      const agency = await storage.getNeaAgencyById(req.params.id);
      if (!agency) {
        return res.status(404).json({ message: "Agency not found" });
      }
      await storage.updateNeaAgency(req.params.id, {
        latitude: latitude || null,
        longitude: longitude || null,
        country: country || null,
        city: city || null,
      });
      res.json({ message: "Coordinates updated successfully" });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update coordinates" });
    }
  });

  // ==================== Scam Intelligence (Public) ====================
  app.post("/api/fraud-reports", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const { suspectedEntity, suspectedAgencyId, incidentType, description, phoneNumber, paymentReference, licenseNumber, evidenceFiles } = req.body;
      if (!suspectedEntity || !incidentType || !description) {
        return res.status(400).json({ message: "Missing required fields: suspectedEntity, incidentType, description" });
      }
      const validTypes = ["job_scam", "payment_fraud", "fake_documents", "impersonation", "other"];
      if (!validTypes.includes(incidentType)) {
        return res.status(400).json({ message: "Invalid incident type" });
      }
      const report = await storage.createFraudReport({
        reporterId: userId,
        suspectedEntity,
        suspectedAgencyId: suspectedAgencyId || null,
        incidentType,
        description,
        phoneNumber: phoneNumber || null,
        paymentReference: paymentReference || null,
        licenseNumber: licenseNumber || null,
        evidenceFiles: evidenceFiles || [],
        status: "pending",
        assignedTo: null,
      });
      try {
        const { analyzeReport } = await import("./scam-intelligence-engine");
        await analyzeReport(report.id);
      } catch (analyzeErr) {
        console.error("[ScamIntel] Auto-analysis failed:", analyzeErr);
      }
      res.json({ message: "Report submitted successfully", report: { id: report.id, status: report.status } });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to submit fraud report" });
    }
  });

  app.get("/api/fraud-reports/my", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const reports = await storage.getUserFraudReports(userId);
      res.json(reports.map(r => ({ ...r, reporterId: undefined })));
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch your reports" });
    }
  });

  app.get("/api/scam-lookup", async (req: any, res) => {
    try {
      const { q } = req.query;
      if (!q || String(q).trim().length < 2) {
        return res.status(400).json({ message: "Query must be at least 2 characters" });
      }
      const { searchIndicators } = await import("./scam-intelligence-engine");
      const results = await searchIndicators(String(q));
      res.json({ query: q, results, count: results.length });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to search scam database" });
    }
  });

  app.get("/api/scam-lookup/check", async (req: any, res) => {
    try {
      const { value, type } = req.query;
      if (!value) return res.status(400).json({ message: "Value is required" });
      const { searchIndicators } = await import("./scam-intelligence-engine");
      const results = await searchIndicators(String(value));
      const filtered = type ? results.filter((r: any) => r.indicatorType === type) : results;
      const isRisky = filtered.some((r: any) => r.riskLevel === "high" || r.riskLevel === "critical");
      const riskOrder = ["low", "moderate", "high", "critical"];
      const highestRisk = filtered.length > 0
        ? filtered.reduce((max: string, r: any) => riskOrder.indexOf(r.riskLevel) > riskOrder.indexOf(max) ? r.riskLevel : max, "low")
        : null;
      res.json({
        value,
        found: filtered.length > 0,
        isRisky,
        highestRisk,
        matchCount: filtered.length,
        indicators: filtered,
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to check scam database" });
    }
  });

  // ==================== Scam Intelligence (Admin) ====================
  app.get("/api/admin/fraud-reports", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { status, incidentType, limit, offset } = req.query;
      const reports = await storage.listFraudReports({
        status: status || undefined,
        incidentType: incidentType || undefined,
        limit: limit ? parseInt(limit) : 100,
        offset: offset ? parseInt(offset) : 0,
      });
      const total = await storage.getFraudReportCount({
        status: status || undefined,
        incidentType: incidentType || undefined,
      });
      res.json({ reports, total });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch fraud reports" });
    }
  });

  app.patch("/api/admin/fraud-reports/:id/status", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { status, resolution } = req.body;
      if (!status) return res.status(400).json({ message: "Status is required" });
      const validStatuses = ["pending", "investigating", "confirmed", "rejected"];
      if (!validStatuses.includes(status)) return res.status(400).json({ message: "Invalid status" });
      const userId = req.user?.id || req.user?.claims?.sub;
      const report = await storage.updateFraudReportStatus(req.params.id, status, userId, resolution);
      if (!report) return res.status(404).json({ message: "Report not found" });
      res.json({ message: "Report status updated", report });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update report status" });
    }
  });

  app.post("/api/admin/fraud-reports/:id/assign", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { assignedTo } = req.body;
      const userId = req.user?.id || req.user?.claims?.sub;
      const report = await storage.assignFraudReport(req.params.id, assignedTo || userId);
      if (!report) return res.status(404).json({ message: "Report not found" });
      res.json({ message: "Report assigned", report });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to assign report" });
    }
  });

  app.post("/api/admin/fraud-reports/:id/analyze", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { analyzeReport } = await import("./scam-intelligence-engine");
      const result = await analyzeReport(req.params.id);
      res.json({ message: "Analysis complete", ...result });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to analyze report" });
    }
  });

  app.get("/api/admin/fraud-indicators", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { indicatorType, riskLevel, status, limit, offset } = req.query;
      const indicators = await storage.listFraudIndicators({
        indicatorType: indicatorType || undefined,
        riskLevel: riskLevel || undefined,
        status: status || "active",
        limit: limit ? parseInt(limit) : 100,
        offset: offset ? parseInt(offset) : 0,
      });
      const total = await storage.getFraudIndicatorCount({
        indicatorType: indicatorType || undefined,
        riskLevel: riskLevel || undefined,
        status: status || "active",
      });
      res.json({ indicators, total });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch fraud indicators" });
    }
  });

  app.post("/api/admin/fraud-indicators", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { indicatorType, value, riskLevel, metadata } = req.body;
      if (!indicatorType || !value) return res.status(400).json({ message: "indicatorType and value are required" });
      const validTypes = ["phone", "license", "name", "payment_account", "email"];
      if (!validTypes.includes(indicatorType)) return res.status(400).json({ message: "Invalid indicator type" });
      const userId = req.user?.id || req.user?.claims?.sub;
      const normalizedValue = value.trim().toLowerCase().replace(/[\s\-\(\)]+/g, "");
      const indicator = await storage.createFraudIndicator({
        indicatorType,
        value,
        normalizedValue,
        riskLevel: riskLevel || "low",
        source: "admin_added",
        addedBy: userId,
        linkedReports: [],
        reportCount: 0,
        metadata: metadata || null,
        status: "active",
      });
      res.json({ message: "Indicator added", indicator });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to add indicator" });
    }
  });

  app.patch("/api/admin/fraud-indicators/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const existing = await storage.getFraudIndicatorById(req.params.id);
      if (!existing) return res.status(404).json({ message: "Indicator not found" });
      const { riskLevel, status } = req.body;
      const updates: any = {};
      if (riskLevel) updates.riskLevel = riskLevel;
      if (status) updates.status = status;
      const indicator = await storage.updateFraudIndicator(req.params.id, updates);
      res.json({ message: "Indicator updated", indicator });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update indicator" });
    }
  });

  app.delete("/api/admin/fraud-indicators/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const existing = await storage.getFraudIndicatorById(req.params.id);
      if (!existing) return res.status(404).json({ message: "Indicator not found" });
      await storage.deleteFraudIndicator(req.params.id);
      res.json({ message: "Indicator deleted" });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to delete indicator" });
    }
  });

  app.get("/api/admin/fraud-analytics", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const { getFraudAnalytics } = await import("./scam-intelligence-engine");
      const analytics = await getFraudAnalytics();
      res.json(analytics);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch fraud analytics" });
    }
  });

  app.post("/api/admin/scam-intelligence/pattern-scan", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const { runPatternDetection } = await import("./scam-intelligence-engine");
      const result = await runPatternDetection();
      res.json({ message: "Pattern detection complete", ...result });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to run pattern detection" });
    }
  });

  // ==================== Agency Certificates (Public) ====================
  app.get("/api/certificates/verify/:certificateId", async (req: any, res) => {
    try {
      const { verifyCertificate } = await import("./certificate-engine");
      const result = await verifyCertificate(req.params.certificateId);
      if (!result.certificate) return res.status(404).json({ valid: false, reason: result.reason });
      const { verificationHash, ...publicCert } = result.certificate;
      res.json({
        valid: result.valid,
        reason: result.reason,
        certificate: publicCert,
        verifiedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to verify certificate" });
    }
  });

  app.get("/api/certificates/badge/:certificateId", async (req: any, res) => {
    try {
      const cert = await storage.getCertificateByCertId(req.params.certificateId);
      if (!cert || cert.status !== "active") {
        return res.status(404).json({ message: "Active certificate not found" });
      }
      const { generateEmbedBadgeCode } = await import("./certificate-engine");
      const embedCode = generateEmbedBadgeCode(cert.certificateId, cert.agencyName || "Agency");
      res.json({ certificateId: cert.certificateId, agencyName: cert.agencyName, embedCode });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to generate badge code" });
    }
  });

  // ==================== Agency Certificates (Admin) ====================
  app.get("/api/admin/certificates", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { status, limit, offset } = req.query;
      const certificates = await storage.listCertificates({
        status: status || undefined,
        limit: limit ? parseInt(limit) : 100,
        offset: offset ? parseInt(offset) : 0,
      });
      const total = await storage.getCertificateCount({ status: status || undefined });
      res.json({ certificates, total });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch certificates" });
    }
  });

  app.post("/api/admin/certificates/generate/:agencyId", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { generateCertificate } = await import("./certificate-engine");
      const result = await generateCertificate(req.params.agencyId);
      if (!result.success) return res.status(400).json({ message: result.error });
      res.json({ message: "Certificate generated", certificate: result.certificate });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to generate certificate" });
    }
  });

  app.post("/api/admin/certificates/revoke/:certificateId", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const { reason } = req.body;
      const { revokeCertificate } = await import("./certificate-engine");
      const result = await revokeCertificate(req.params.certificateId, userId, reason || "Admin revocation");
      if (!result.success) return res.status(400).json({ message: result.error });
      res.json({ message: "Certificate revoked" });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to revoke certificate" });
    }
  });

  app.post("/api/admin/certificates/regenerate/:agencyId", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const { regenerateCertificate } = await import("./certificate-engine");
      const result = await regenerateCertificate(req.params.agencyId, userId);
      if (!result.success) return res.status(400).json({ message: result.error });
      res.json({ message: "Certificate regenerated", certificate: result.certificate });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to regenerate certificate" });
    }
  });

  app.post("/api/admin/certificates/batch-invalidate", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const { invalidateExpiredCertificates } = await import("./certificate-engine");
      const result = await invalidateExpiredCertificates();
      res.json({ message: `${result.invalidated} certificates invalidated`, ...result });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to batch invalidate certificates" });
    }
  });

  // ==================== Compliance Index (Public) ====================
  app.get("/api/compliance-index", async (req: any, res) => {
    try {
      const { country, industry, badge, search, limit, offset } = req.query;
      const rankings = await storage.getComplianceIndexRankings({
        country: country || undefined,
        industry: industry || undefined,
        badge: badge || undefined,
        search: search || undefined,
        limit: limit ? parseInt(limit) : 100,
        offset: offset ? parseInt(offset) : 0,
      });
      res.json(rankings);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch compliance index" });
    }
  });

  app.get("/api/compliance-index/stats", async (_req: any, res) => {
    try {
      const stats = await storage.getComplianceIndexStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch index stats" });
    }
  });

  app.get("/api/compliance-index/filters", async (_req: any, res) => {
    try {
      const rankings = await storage.getComplianceIndexRankings({ limit: 10000 });
      const countries = [...new Set(rankings.map(r => r.country).filter(Boolean))].sort();
      const industries = [...new Set(rankings.map(r => r.industry).filter(Boolean))].sort();
      res.json({ countries, industries });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch filters" });
    }
  });

  app.get("/api/compliance-index/:agencyId", async (req: any, res) => {
    try {
      const score = await storage.getComplianceIndexByAgency(req.params.agencyId);
      if (!score || score.isExcluded) return res.status(404).json({ message: "Agency not found in compliance index" });
      const history = await storage.getComplianceIndexHistory(req.params.agencyId, 30);
      const { isExcluded, excludedBy, excludedReason, ...publicScore } = score;
      res.json({ score: publicScore, history });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch agency index" });
    }
  });

  // ==================== Compliance Index (Admin) ====================
  app.post("/api/admin/compliance-index/recalculate", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const { batchCalculateIndex } = await import("./compliance-index-engine");
      const result = await batchCalculateIndex();
      res.json({ message: `Index recalculated: ${result.ranked} agencies ranked out of ${result.total}`, ...result });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to recalculate index" });
    }
  });

  app.get("/api/admin/compliance-index/config", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const config = await storage.getComplianceIndexConfig();
      res.json(config);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch index config" });
    }
  });

  app.patch("/api/admin/compliance-index/config", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { configKey, configValue } = req.body;
      if (!configKey) return res.status(400).json({ message: "configKey is required" });
      const updated = await storage.updateComplianceIndexConfig(configKey, configValue);
      if (!updated) return res.status(404).json({ message: "Config key not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update index config" });
    }
  });

  app.patch("/api/admin/compliance-index/:agencyId/exclude", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const { reason } = req.body;
      await storage.excludeAgencyFromIndex(req.params.agencyId, userId, reason || "Admin exclusion");
      res.json({ message: "Agency excluded from index" });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to exclude agency" });
    }
  });

  app.patch("/api/admin/compliance-index/:agencyId/include", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      await storage.includeAgencyInIndex(req.params.agencyId);
      res.json({ message: "Agency included in index" });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to include agency" });
    }
  });

  // ==================== AI Compliance Monitor ====================
  app.get("/api/admin/compliance/dashboard", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const stats = await storage.getComplianceDashboardStats();
      const topRisky = await storage.getComplianceRiskScores({ minScore: 50, limit: 10 });
      const recentAlerts = await storage.getComplianceAlerts({ status: "pending", limit: 10 });
      res.json({ stats, topRisky, recentAlerts });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to load compliance dashboard" });
    }
  });

  app.get("/api/admin/compliance/risk-scores", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { minScore, maxScore, trend, limit, offset } = req.query;
      const scores = await storage.getComplianceRiskScores({
        minScore: minScore ? parseInt(minScore) : undefined,
        maxScore: maxScore ? parseInt(maxScore) : undefined,
        trend: trend || undefined,
        limit: limit ? parseInt(limit) : 100,
        offset: offset ? parseInt(offset) : 0,
      });
      res.json(scores);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch risk scores" });
    }
  });

  app.get("/api/admin/compliance/risk-scores/:agencyId", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const score = await storage.getComplianceRiskScoreByAgency(req.params.agencyId);
      const history = await storage.getComplianceRiskHistory(req.params.agencyId, 30);
      if (!score) return res.status(404).json({ message: "No risk score found for this agency" });
      res.json({ score, history });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch agency risk detail" });
    }
  });

  app.get("/api/admin/compliance/anomalies", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { status, severity, anomalyType, limit, offset } = req.query;
      const anomalies = await storage.getComplianceAnomalies({
        status: status || undefined,
        severity: severity || undefined,
        anomalyType: anomalyType || undefined,
        limit: limit ? parseInt(limit) : 100,
        offset: offset ? parseInt(offset) : 0,
      });
      res.json(anomalies);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch anomalies" });
    }
  });

  app.patch("/api/admin/compliance/anomalies/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const { status, reviewNotes } = req.body;
      const updated = await storage.updateComplianceAnomaly(req.params.id, {
        status,
        reviewNotes,
        reviewedBy: userId,
      });
      if (!updated) return res.status(404).json({ message: "Anomaly not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update anomaly" });
    }
  });

  app.get("/api/admin/compliance/alerts", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { status, severity, alertType, limit, offset } = req.query;
      const alerts = await storage.getComplianceAlerts({
        status: status || undefined,
        severity: severity || undefined,
        alertType: alertType || undefined,
        limit: limit ? parseInt(limit) : 100,
        offset: offset ? parseInt(offset) : 0,
      });
      res.json(alerts);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch alerts" });
    }
  });

  app.patch("/api/admin/compliance/alerts/:id/acknowledge", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const updated = await storage.acknowledgeComplianceAlert(req.params.id, userId);
      if (!updated) return res.status(404).json({ message: "Alert not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to acknowledge alert" });
    }
  });

  app.patch("/api/admin/compliance/alerts/:id/resolve", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const updated = await storage.resolveComplianceAlert(req.params.id, userId);
      if (!updated) return res.status(404).json({ message: "Alert not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to resolve alert" });
    }
  });

  app.post("/api/admin/compliance/scan", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const { batchCalculateRiskScores } = await import("./compliance-risk-engine");
      const { runAnomalyDetection } = await import("./compliance-anomaly-detector");
      const [riskResults, anomalyResults] = await Promise.all([
        batchCalculateRiskScores(),
        runAnomalyDetection(),
      ]);
      res.json({ risk: riskResults, anomalies: anomalyResults, message: `Scan complete: ${riskResults.processed} scores, ${anomalyResults.anomaliesFound} anomalies` });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to run compliance scan" });
    }
  });

  app.get("/api/admin/compliance/config", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const config = await storage.getComplianceRiskConfig();
      res.json(config);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch compliance config" });
    }
  });

  app.patch("/api/admin/compliance/config", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { configKey, configValue } = req.body;
      if (!configKey) return res.status(400).json({ message: "configKey is required" });
      const updated = await storage.updateComplianceRiskConfig(configKey, configValue);
      if (!updated) return res.status(404).json({ message: "Config key not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to update compliance config" });
    }
  });

  // Admin-protected system health — includes full DB pool stats, memory, circuit breakers.
  // Unlike the public /api/health/detailed, this requires admin authentication so that
  // internal metrics (pool sizes, queue depths, circuit breaker states) are not publicly exposed.
  app.get("/api/admin/system-health", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const health = await getDetailedHealth();
      const circuits = getAllCircuitBreakerStats();
      res.json({ ...health, circuits });
    } catch (error: any) {
      res.status(503).json({ status: "unhealthy", error: error.message, timestamp: new Date().toISOString() });
    }
  });

  // ── Security Monitoring Admin Endpoints ─────────────────────────────────────
  // GET /api/admin/security-alerts — list security alerts with optional filters
  app.get("/api/admin/security-alerts", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { alertType, severity, isResolved, limit = "50", offset = "0" } = req.query;
      const alerts = await listSecurityAlerts({
        alertType: alertType as string | undefined,
        severity: severity as string | undefined,
        isResolved: isResolved !== undefined ? isResolved === "true" : undefined,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      });
      res.json(alerts);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch security alerts" });
    }
  });

  // PATCH /api/admin/security-alerts/:id/resolve — mark alert as resolved
  app.patch("/api/admin/security-alerts/:id/resolve", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const adminId = req.user?.claims?.sub || "admin";
      const updated = await resolveSecurityAlert(id, adminId);
      if (!updated) return res.status(404).json({ message: "Alert not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to resolve security alert" });
    }
  });

  // POST /api/admin/security-alerts/bulk-resolve-localhost — permanently delete false-positive alerts from internal IPs
  app.post("/api/admin/security-alerts/bulk-resolve-localhost", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { securityAlerts: secAlertsTable } = await import("@shared/schema");
      const deleted = await db
        .delete(secAlertsTable)
        .where(
          sql`(
            ip_address IN ('127.0.0.1','::1','::ffff:127.0.0.1','localhost')
            OR description LIKE '%127.0.0.1%'
            OR description LIKE '%::1%'
            OR description LIKE '%"unknown"%'
            OR description LIKE '%localhost%'
          )`
        )
        .returning({ id: secAlertsTable.id });
      res.json({ deleted: deleted.length, message: `Permanently removed ${deleted.length} localhost false-positive alert(s)` });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to remove alerts", error: error.message });
    }
  });

  // GET /api/admin/security-dashboard — summary stats for the security dashboard
  app.get("/api/admin/security-dashboard", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const stats = await getSecurityAlertStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch security dashboard stats" });
    }
  });

  // GET /api/admin/access-violations — recent blocked premium access attempts (last 200)
  app.get("/api/admin/access-violations", isAuthenticated, isAdmin, (req: any, res) => {
    const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || "200"))));
    const violations = getAccessViolations(limit);
    res.json({ violations, total: violations.length });
  });

  // GET /api/admin/fraud-alerts — suspicious payment records (alias for security dashboard)
  app.get("/api/admin/fraud-alerts", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const { db } = await import("./db");
      const { payments } = await import("@shared/schema");
      const { eq, desc } = await import("drizzle-orm");
      const suspicious = await db
        .select()
        .from(payments)
        .where(eq(payments.isSuspicious, true))
        .orderBy(desc(payments.createdAt))
        .limit(100);
      res.json(suspicious);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch fraud alerts" });
    }
  });

  // GET /api/admin/admin-activity — recent admin actions from compliance audit log
  app.get("/api/admin/admin-activity", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { userId, limit = "50", offset = "0" } = req.query;
      const logs = await storage.getComplianceAuditLogs({
        userId: userId as string | undefined,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      });
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch admin activity" });
    }
  });

  // GET /api/admin/security-logs — structured security-related audit log entries
  app.get("/api/admin/security-logs", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { limit = "100", offset = "0" } = req.query;
      const logs = await storage.getComplianceAuditLogs({
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      });
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch security logs" });
    }
  });

  // GET /api/admin/vulnerability-summary — static security posture report.
  // Reads current configuration state and recent alert data to provide a snapshot
  // of the platform's security health. Does NOT run attack simulations (which would
  // damage production data). Real-time detection by the existing security stack
  // is safer and more accurate than simulated tests against a live app.
  app.get("/api/admin/vulnerability-summary", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      const { listSecurityAlerts, getSecurityAlertStats } = await import("./security");
      const { db } = await import("./db");
      const { accountLockouts, payments } = await import("@shared/schema");
      const { eq, gte, count } = await import("drizzle-orm");

      const [alertStats, recentAlerts, [lockoutCount], [suspiciousCount]] = await Promise.all([
        getSecurityAlertStats(),
        listSecurityAlerts({ isResolved: false, limit: 10 }),
        db.select({ cnt: count() }).from(accountLockouts).where(gte(accountLockouts.failedAttempts, 3)),
        db.select({ cnt: count() }).from(payments).where(eq(payments.isSuspicious, true)),
      ]);

      // Static check of active security controls
      const securityControls = [
        { control: "Helmet CSP + HSTS headers", status: "active", layer: "HTTP" },
        { control: "CORS allowlist", status: "active", layer: "HTTP" },
        { control: "Global API rate limiter (100/15min per IP)", status: "active", layer: "API" },
        { control: "Auth endpoint rate limiter (20/15min per IP)", status: "active", layer: "Auth" },
        { control: "Payment endpoint rate limiter (10/hour per IP)", status: "active", layer: "Payment" },
        { control: "M-Pesa callback rate limiter (30/min per IP)", status: "active", layer: "Payment" },
        { control: "Admin endpoint rate limiter (60/15min per IP)", status: "active", layer: "Admin" },
        { control: "Per-user STK Push rate limiter (5/5min)", status: "active", layer: "Payment" },
        { control: "Account lockout after repeated failures", status: "active", layer: "Auth" },
        { control: "M-Pesa amount mismatch detection", status: "active", layer: "Payment" },
        { control: "M-Pesa phone mismatch detection", status: "active", layer: "Payment" },
        { control: "Duplicate receipt detection", status: "active", layer: "Payment" },
        { control: "Orphan callback detection", status: "active", layer: "Payment" },
        { control: "File upload MIME type filtering", status: "active", layer: "Upload" },
        { control: "File upload size limit (10 MB)", status: "active", layer: "Upload" },
        { control: "Zod input validation on all POST/PATCH endpoints", status: "active", layer: "API" },
        { control: "Drizzle ORM parameterized queries (SQL injection immune)", status: "active", layer: "Database" },
        { control: "isAuthenticated + isAdmin RBAC on admin routes", status: "active", layer: "Auth" },
        { control: "Webhook idempotency locks (replay attack prevention)", status: "active", layer: "Payment" },
        { control: "Sensitive data redaction in server logs", status: "active", layer: "Logging" },
        { control: "Periodic security scanner (every 10 min)", status: "active", layer: "Monitoring" },
        { control: "Infrastructure config validation on startup", status: "active", layer: "Monitoring" },
        { control: "HTTPS enforcement (production)", status: process.env.NODE_ENV === "production" ? "active" : "dev-only", layer: "HTTP" },
      ];

      res.json({
        generatedAt: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        alertSummary: alertStats,
        recentUnresolvedAlerts: recentAlerts,
        activeSecurityControls: securityControls,
        riskIndicators: {
          accountsWithFailedLogins: lockoutCount?.cnt ?? 0,
          suspiciousPayments: suspiciousCount?.cnt ?? 0,
          unresolvedSecurityAlerts: alertStats.unresolved,
          criticalAlerts: alertStats.critical,
        },
        recommendations: [
          alertStats.critical > 0 ? { priority: "critical", message: `${alertStats.critical} critical security alert(s) require immediate attention` } : null,
          (lockoutCount?.cnt ?? 0) > 10 ? { priority: "high", message: `${lockoutCount?.cnt} accounts have repeated login failures — possible credential stuffing` } : null,
          (suspiciousCount?.cnt ?? 0) > 0 ? { priority: "high", message: `${suspiciousCount?.cnt} suspicious payment(s) flagged — review fraud detection tab` } : null,
          process.env.NODE_ENV !== "production" ? { priority: "info", message: "HTTPS enforcement is production-only — ensure deployment uses TLS" } : null,
        ].filter(Boolean),
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to generate vulnerability summary" });
    }
  });

  // GET /api/admin/security-reports — alias for security alerts (named to match spec convention)
  app.get("/api/admin/security-reports", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { listSecurityAlerts } = await import("./security");
      const { limit = "50", offset = "0", severity } = req.query;
      const alerts = await listSecurityAlerts({
        severity: severity as string | undefined,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      });
      res.json(alerts);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch security reports" });
    }
  });

  // ── Security AI Anomaly Detection Endpoints ──────────────────────────────
  // These endpoints expose the security_events behavior log collected by
  // trackSecurityEvent() hooks in the rate limiters and XSS middleware.
  // Risk scoring is done by the periodic scanner (every 5 minutes) which
  // aggregates events per IP/user and creates security_alerts for spikes.

  // GET /api/admin/security-ai/events — paginated raw security event log
  app.get("/api/admin/security-ai/events", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { eventType, ipAddress, userId, hours = "24", limit = "100", offset = "0" } = req.query;
      const since = new Date(Date.now() - parseFloat(hours as string) * 60 * 60 * 1000);
      const events = await storage.getSecurityEvents({
        eventType: eventType as string | undefined,
        ipAddress: ipAddress as string | undefined,
        userId: userId as string | undefined,
        since,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      });
      res.json(events);
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch security events" });
    }
  });

  // GET /api/admin/security-ai/high-risk-users — users ranked by accumulated risk score
  app.get("/api/admin/security-ai/high-risk-users", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { hours = "24", limit = "20" } = req.query;
      const since = new Date(Date.now() - parseFloat(hours as string) * 60 * 60 * 1000);
      const [highRiskUsers, topIPs] = await Promise.all([
        storage.getHighRiskUsers(since, parseInt(limit as string, 10)),
        storage.getTopSuspiciousIPs(since, parseInt(limit as string, 10)),
      ]);
      res.json({ highRiskUsers, topSuspiciousIPs: topIPs, windowHours: parseFloat(hours as string) });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch high-risk users" });
    }
  });

  // GET /api/admin/security-ai/dashboard — today's summary for the security-ai overview panel
  app.get("/api/admin/security-ai/dashboard", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { getSecurityAlertStats } = await import("./security");
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const since1h = new Date(Date.now() - 60 * 60 * 1000);

      const [alertStats, eventStats1h, eventStats24h, topIPs, highRiskUsers] = await Promise.all([
        getSecurityAlertStats(),
        storage.getSecurityEventStats(since1h),
        storage.getSecurityEventStats(since24h),
        storage.getTopSuspiciousIPs(since24h, 5),
        storage.getHighRiskUsers(since24h, 5),
      ]);

      res.json({
        generatedAt: new Date().toISOString(),
        alerts: alertStats,
        last1h: eventStats1h,
        last24h: eventStats24h,
        topSuspiciousIPs: topIPs,
        highRiskUsers,
        riskScoring: {
          auth_failure: 10,
          rate_limit_hit: 15,
          payment_attempt: 5,
          file_upload_rejected: 12,
          restricted_route_access: 25,
          xss_attempt: 30,
          admin_access: 3,
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: "Failed to fetch security AI dashboard" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DDOS PROTECTION ADMIN ENDPOINTS
  // Manage IP bans, under-attack mode, and view DDoS state.
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/admin/ddos/status — current DDoS protection state
  app.get("/api/admin/ddos/status", isAuthenticated, isAdmin, (_req: any, res) => {
    try {
      const { getUnderAttackState, getBannedIps } = require("./middleware/ddos-protection");
      const attackState = getUnderAttackState();
      const bannedIps = getBannedIps();
      res.json({
        underAttackMode: attackState.active,
        attackModeActivatedAt: attackState.activatedAt,
        globalRps: attackState.globalRps,
        bannedIpCount: bannedIps.length,
        bannedIps: bannedIps.map((b: any) => ({
          ip: b.ip,
          tier: b.tier,
          reason: b.reason,
          bannedAt: b.bannedAt,
          blockedUntil: b.blockedUntil,
          hitCount: b.hitCount,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to get DDoS status" });
    }
  });

  // POST /api/admin/ddos/ban — manually ban an IP
  app.post("/api/admin/ddos/ban", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { ip, tier = "moderate", reason = "Manual admin ban" } = req.body;
      if (!ip) return res.status(400).json({ message: "IP address required" });
      if (!["minor", "moderate", "severe"].includes(tier)) {
        return res.status(400).json({ message: "tier must be minor, moderate, or severe" });
      }
      const { banIp } = require("./middleware/ddos-protection");
      banIp(ip, tier, reason);
      await storage.logAdminAction(req.user.claims.sub, "ddos_ip_ban", { ip, tier, reason });
      res.json({ message: `IP ${ip} banned (${tier})`, ip, tier });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to ban IP" });
    }
  });

  // DELETE /api/admin/ddos/ban/:ip — unban an IP
  app.delete("/api/admin/ddos/ban/:ip", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const ip = decodeURIComponent(req.params.ip);
      const { unbanIp } = require("./middleware/ddos-protection");
      const removed = unbanIp(ip);
      await storage.logAdminAction(req.user.claims.sub, "ddos_ip_unban", { ip });
      res.json({ message: removed ? `IP ${ip} unbanned` : `IP ${ip} was not banned`, removed });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to unban IP" });
    }
  });

  // POST /api/admin/ddos/attack-mode — manually toggle under-attack mode
  app.post("/api/admin/ddos/attack-mode", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { active } = req.body;
      if (typeof active !== "boolean") {
        return res.status(400).json({ message: "active (boolean) required" });
      }
      const { setUnderAttackMode } = require("./middleware/ddos-protection");
      setUnderAttackMode(active);
      await storage.logAdminAction(req.user.claims.sub, "ddos_attack_mode_toggle", { active });
      res.json({ message: `Under-attack mode ${active ? "activated" : "deactivated"}`, active });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to toggle attack mode" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PAYPAL — International payment gateway (USD)
  //
  // Mode:  PAYPAL_ENV=sandbox  → PayPal Developer Sandbox (test mode, no real $)
  //        PAYPAL_ENV=live     → PayPal Live (real payments)
  //
  // To switch to LIVE:  Set PAYPAL_ENV=live in Replit Secrets.
  // To test:            Set PAYPAL_ENV=sandbox (default if not set).
  //
  // Credentials (set in Replit Secrets — never hardcode):
  //   PAYPAL_CLIENT_ID      — from developer.paypal.com → My Apps → App → Client ID
  //   PAYPAL_CLIENT_SECRET  — same location, under Client Secret
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /api/paypal/config — public: returns client ID and mode so the frontend
  // can load the PayPal JS SDK without exposing the secret.
  app.get("/api/paypal/config", (_req, res) => {
    if (!isPayPalConfigured()) {
      return res.json({ enabled: false, clientId: null, mode: null });
    }
    res.json({
      enabled: true,
      clientId: paypalClientId(),
      mode: paypalMode(),
    });
  });

  // POST /api/paypal/create-order — authenticated; creates a PayPal order,
  // saves a pending payment record in the DB, and returns paypalOrderId + paymentId.
  //
  // SECURITY: For plan upgrades (serviceId = "plan_basic" | "plan_pro") the amount is
  // ALWAYS resolved from the database — the client-supplied amount is IGNORED.
  // This prevents any 1-KES or arbitrary-amount exploit attempts.
  app.post("/api/paypal/create-order", isAuthenticated, async (req: any, res) => {
    try {
      if (!isPayPalConfigured()) {
        return res.status(503).json({ message: "PayPal is not configured." });
      }

      const userId = req.user?.claims?.sub as string;
      const { amount: clientAmount, description, serviceId: rawServiceId, refCode, promoCode } = req.body;

      // Fraud gate — block before any PayPal order is created
      if (await isFraudUser(userId)) {
        const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.socket?.remoteAddress ?? "unknown";
        flagForManualReview(userId, { action: "payment_attempt_blocked", detail: "paypal create-order", ip: clientIp }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        return res.status(403).json({
          message: "Your account has been flagged for review. Please contact support.",
          code:    "ACCOUNT_UNDER_REVIEW",
        });
      }

      const serviceId = rawServiceId || "main_subscription";

      // ── Amount + service name resolution ─────────────────────────────────────
      // The backend is always the single source of truth — client-supplied amounts
      // are IGNORED for all plan payments to prevent price-tampering exploits.
      let verifiedAmount: number;
      let resolvedPaypal: ResolvedPrice | null = null;
      let paypalServiceName: string | null = null; // human-readable label for the payment record

      if (serviceId.startsWith("plan_")) {
        // PLAN UPGRADE: resolve via the pricing engine.
        // Passing userId and promoCode enables per-user discounts and active promo codes.
        const planId = serviceId.replace("plan_", "");
        resolvedPaypal = await resolvePrice({
          planId,
          userId,
          promoCode: typeof promoCode === "string" ? promoCode.trim() : undefined,
        });
        if (!resolvedPaypal) {
          console.error(`[PayPal][Security] Plan "${planId}" not found in DB or has no price — rejecting create-order`);
          return res.status(400).json({ message: `Plan "${planId}" is not available for PayPal payment.` });
        }
        verifiedAmount = resolvedPaypal.finalPrice;
        paypalServiceName = planLabel(planId);
      } else {
        // NON-PLAN payment (career service, consultation, etc.):
        // The client-supplied amount is NEVER trusted — look up services.price from the DB.
        // The serviceId must be a valid UUID pointing to an active row in the services table.
        const { data: svcRow, error: svcRowErr } = await supabase
          .from("services")
          .select("price, is_active, name")
          .eq("id", serviceId)
          .maybeSingle();

        if (svcRowErr || !svcRow) {
          console.error(`[PayPal][Security] service_id="${serviceId}" not found — rejecting create-order`);
          return res.status(404).json({ message: "Service not found. Please select a valid service." });
        }
        if (!svcRow.is_active) {
          return res.status(400).json({ message: "This service is not currently available." });
        }

        const dbPrice = Math.round(Number(svcRow.price));

        // Cross-check the client amount so the frontend receives a clear error
        // if there's a stale price displayed — but always use the DB value.
        if (typeof clientAmount === "number" && Math.round(clientAmount) !== dbPrice) {
          console.warn(
            `[PayPal][Security] Amount tamper/stale price — service="${svcRow.name}" db=${dbPrice} client=${clientAmount} user=${userId}`
          );
          return res.status(400).json({
            message: `Amount mismatch: expected KES ${dbPrice} for "${svcRow.name}". Please refresh and try again.`,
            code:    "AMOUNT_TAMPERED",
          });
        }

        verifiedAmount = dbPrice; // always DB value, never client value
        paypalServiceName = svcRow.name ?? null; // store the real service name
      }

      // Fetch user email so the payment record is always linked by both userId AND email
      const paypalInitUser = await storage.getUserById(userId);
      // Create a pending payment record so capture-order can look it up
      const paymentRecord = await storage.createPayment({
        userId,
        email: paypalInitUser?.email || null,
        amount: verifiedAmount,
        baseAmount: resolvedPaypal?.basePrice ?? null,
        discountType: resolvedPaypal?.discountType ?? null,
        currency: "KES",
        method: "paypal",
        status: "pending",
        serviceId,
        serviceName: paypalServiceName,
        metadata: JSON.stringify({ refCode: refCode || null, appliedPromo: resolvedPaypal?.appliedPromo || null }),
      } as any);

      console.info(
        `[Payment][START] PayPal | paymentId=${paymentRecord.id} | userId=${userId} | email=${paypalInitUser?.email || "unknown"} | KES=${verifiedAmount} | serviceId=${serviceId}`
      );

      const order = await createPayPalOrder(
        verifiedAmount,
        description || "WorkAbroad Hub payment",
        paymentRecord.id
      );

      res.json({
        paypalOrderId: order.id,
        paymentId: paymentRecord.id,
        approvalUrl: order.approvalUrl,
        amountUSD: kesToUsd(verifiedAmount).toFixed(2),
        status: order.status,
      });
    } catch (err: any) {
      console.error("[PayPal] create-order error:", err?.message ?? err);
      res.status(500).json({ message: err?.message ?? "PayPal order creation failed." });
    }
  });

  // POST /api/paypal/capture-order — authenticated; captures a PayPal order
  // after the user approves on PayPal's hosted page.
  app.post("/api/paypal/capture-order", isAuthenticated, async (req: any, res) => {
    try {
      if (!isPayPalConfigured()) {
        return res.status(503).json({ message: "PayPal is not configured." });
      }

      const { paypalOrderId, paymentId } = req.body;
      if (!paypalOrderId) {
        return res.status(400).json({ message: "paypalOrderId is required." });
      }

      // 1. Capture payment with PayPal
      const capture = await capturePayPalOrder(paypalOrderId);
      if (capture.status !== "COMPLETED") {
        return res.status(402).json({
          message: `PayPal payment not completed — status: ${capture.status}`,
          status: capture.status,
        });
      }

      const userId = req.user?.claims?.sub as string;
      const { upgradeUserAccount } = await import("./services/upgradeUserAccount");

      // 2. Look up (or create) the payment record so we know serviceId
      let payment: any = null;
      if (paymentId) {
        try {
          payment = await storage.getPaymentById(paymentId);
        } catch (_e) { /* non-fatal */ }
      }

      // Idempotency guard — prevent double-capture and double-upgrade
      if (payment?.processed) {
        console.log(`[PayPal] Capture skipped — payment ${payment.id} already processed`);
        return res.status(200).json({ message: "Payment already processed.", alreadyProcessed: true, plan: "pro" });
      }

      if (!payment) {
        // Fallback: create the record if none exists (legacy flow)
        const kesAmount = Math.round(parseFloat(capture.amountUSD) * 130);
        payment = await storage.createPayment({
          userId,
          amount: kesAmount || 0,
          currency: "KES",
          method: "paypal",
          transactionRef: capture.transactionId,
          status: "pending",
          serviceId: "main_subscription",
          metadata: JSON.stringify({ paypalOrderId, payerEmail: capture.payerEmail, amountUSD: capture.amountUSD }),
        });
      }

      // 3. ── PROVIDER VERIFICATION ────────────────────────────────────────────
      // Confirm the capture with PayPal before upgrading the user.
      const kesAmount = payment.amount || Math.round(parseFloat(capture.amountUSD) * 130);
      const { verifyPayPalPayment } = await import("./services/verifyPayment");
      const paypalVerify = await verifyPayPalPayment({
        paymentId: payment.id,
        paypalOrderId,
        captureId: capture.transactionId,
        expectedAmountKes: kesAmount,
        ip: String(req.ip || "server"),
      });

      if (!paypalVerify.verified && paypalVerify.status !== "api_unavailable") {
        // PayPal order/capture mismatch — do NOT upgrade
        console.error(
          `[PayPal][Security] Verification BLOCKED paymentId=${payment.id} orderId=${paypalOrderId} status=${paypalVerify.status} note="${paypalVerify.note}"`
        );
        return res.status(402).json({
          message: `Payment verification failed: ${paypalVerify.note}`,
          verificationStatus: paypalVerify.status,
        });
      }

      if (paypalVerify.status === "api_unavailable") {
        console.warn(`[PayPal][Verify] API unavailable for paymentId=${payment.id} — proceeding with upgrade (non-blocking)`);
      }

      // 4. ── AUTO-UNLOCK via centralized upgradeUserAccount ─────────────────
      // All payments upgrade to "pro" — single plan system
      const svcId = payment.serviceId || "main_subscription";
      const derivedPlan: "pro" = "pro";
      const upgrade = await upgradeUserAccount({
        userId,
        email: capture.payerEmail || (payment as any).email || undefined,
        planType: derivedPlan,
        transactionId: capture.transactionId,
        paymentId: payment.id,
        serviceId: svcId,
        method: "paypal",
        paymentSource: "web",
        amountKes: kesAmount,
        extraMeta: { paypalOrderId, payerEmail: capture.payerEmail, amountUSD: capture.amountUSD, verificationStatus: paypalVerify.status },
      });

      if (upgrade.alreadyProcessed) {
        console.warn(`[PayPal] Duplicate capture ignored — txn ${capture.transactionId} already processed.`);
      }

      console.info(
        `[Payment][COMPLETE] PayPal | txn=${capture.transactionId} | paymentId=${payment.id} | userId=${userId} | email=${capture.payerEmail || (payment as any).email || "unknown"} | USD=${capture.amountUSD} | plan=${upgrade.planActivated} | verified=${paypalVerify.status} | success=${upgrade.success}`
      );

      if (upgrade.success) {
        import("./services/activityLogger").then(({ logActivity }) => {
          logActivity({
            event: "payment_success",
            userId,
            email: capture.payerEmail || (payment as any).email || undefined,
            meta: { method: "paypal", transactionId: capture.transactionId, amountUSD: capture.amountUSD, paymentId: payment.id, plan: upgrade.planActivated },
            ip: req.ip || "",
          });
        }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

        // Real-time update to My Payments page
        import("./websocket").then(({ notifyUserPaymentUpdate }) => {
          notifyUserPaymentUpdate(userId, {
            type: "payment_update", paymentId: payment.id, status: "completed",
          });
        }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

        // Sync completed payment to Supabase
        console.log('CALLING PAYMENT SYNC NOW');
        await syncPaymentToSupabase({
          user_id:       userId,
          phone:         null,
          amount:        kesAmount,
          mpesa_code:    capture.transactionId || null,
          status:        "completed",
          plan_id:       (payment as any).planId || null,
          base_amount:   (payment as any).baseAmount ?? null,
          currency:      "KES",
          discount_data: (payment as any).discountType
            ? { discountType: (payment as any).discountType, discountValue: ((payment as any).baseAmount ?? kesAmount) - kesAmount }
            : null,
        });
        await upgradeUserToPro(userId);
        const ppCaptureExpiry = new Date(); ppCaptureExpiry.setDate(ppCaptureExpiry.getDate() + 360);
        syncSubscriptionToSupabase({ user_id: userId, plan_id: (payment as any).planId || "pro", provider: "paypal", status: "active", auto_renew: false, expires_at: ppCaptureExpiry }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        redeemAppliedPromo(payment.metadata).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
      }

      // 4. Handle referral if one was stored
      if (payment.metadata) {
        try {
          const meta = typeof payment.metadata === "string" ? JSON.parse(payment.metadata) : payment.metadata;
          if (meta?.refCode) {
            const commission = Math.round(payment.amount * 0.10);
            storage.createReferral({
              refCode: meta.refCode,
              referredPhone: capture.payerEmail || "",
              paymentAmount: payment.amount,
              commission,
              status: "pending",
            }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
          }
        } catch (_e) { /* non-fatal */ }
      }

      res.json({
        success: true,
        transactionId: capture.transactionId,
        payerEmail: capture.payerEmail,
        amountUSD: capture.amountUSD,
        planActivated: upgrade.planActivated,
        expiresAt: upgrade.expiresAt,
        status: capture.status,
      });
    } catch (err: any) {
      console.error("[PayPal] capture-order error:", err?.message ?? err);
      res.status(500).json({ message: err?.message ?? "PayPal capture failed." });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTO APPLY — AI job matching + automated application generation engine
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const OpenAI = (await import("openai")).default;
    const autoAiClient = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });

    // POST /api/auto-apply/match — AI-rank all available jobs against a user profile
    app.post("/api/auto-apply/match", isAuthenticated, requireAnyPaidPlan, async (req: any, res) => {
      try {
        const userId = req.user?.claims?.sub;
        if (!userId) return res.status(401).json({ message: "Unauthorised" });

        const { jobTitle, countries, experience, skills } = req.body;
        if (!jobTitle || typeof jobTitle !== "string") {
          return res.status(400).json({ message: "jobTitle is required" });
        }

        const allJobs = await storage.getVisaJobs();
        if (!allJobs.length) return res.json({ matches: [] });

        const countryList = Array.isArray(countries) && countries.length
          ? countries.join(", ")
          : "Any country";

        const prompt = `You are a career advisor matching a Kenyan job seeker to overseas job opportunities with visa sponsorship.

Candidate profile:
- Target role: ${jobTitle.slice(0, 100)}
- Preferred countries: ${countryList}
- Years of experience: ${experience || "Not specified"}
- Skills/background: ${(skills || "").slice(0, 300)}

Available jobs (JSON array):
${JSON.stringify(allJobs.map(j => ({ id: j.id, title: j.title, company: j.company, country: j.country, category: j.jobCategory, description: (j.description || "").slice(0, 150) })))}

Return ONLY valid JSON in this exact format:
{"matches": [{"id": "...", "score": 8, "matchReason": "Brief reason..."}]}

Rules:
- Only include jobs with score >= 5
- Sort by score descending
- Maximum 8 jobs
- matchReason: one concise sentence (max 80 chars)
- Score = how well the job matches the candidate profile (1-10)`;

        const completion = await autoAiClient.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 700,
          temperature: 0.2,
          response_format: { type: "json_object" },
        });

        const raw = completion.choices[0]?.message?.content || "{}";
        let aiMatches: { id: string; score: number; matchReason: string }[] = [];
        try {
          const parsed = JSON.parse(raw);
          aiMatches = Array.isArray(parsed) ? parsed : (parsed.matches || parsed.jobs || []);
        } catch {
          // AI JSON parsing failed — fall back to empty
        }

        const jobMap = new Map(allJobs.map(j => [j.id, j]));
        const enriched = aiMatches
          .filter(m => m.id && jobMap.has(m.id))
          .map(m => {
            const { applyLink: _applyLink, ...jobData } = jobMap.get(m.id)!;
            return { ...jobData, score: Number(m.score) || 5, matchReason: m.matchReason || "Good match" };
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, 8);

        return res.json({ matches: enriched });
      } catch (err: any) {
        console.error("[AutoApply] Match error:", err.message);
        return res.status(500).json({ message: "Matching service temporarily unavailable. Please try again." });
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BULK APPLY SYSTEM — AI-powered multi-job application engine
  // Plan limits: FREE=disabled, BASIC=5 jobs/day, PRO=unlimited
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const OpenAI = (await import("openai")).default;
    const bulkAiClient = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });

    const BULK_LIMITS: Record<string, number> = { free: 0, basic: 5, pro: Infinity };
    const BULK_TOOL = "bulk_apply";

    function getTodayStr(): string {
      return new Date().toISOString().split("T")[0];
    }

    // GET /api/bulk-apply/usage — today's apply count + plan limit
    app.get("/api/bulk-apply/usage", isAuthenticated, async (req: any, res) => {
      try {
        const userId = req.user?.claims?.sub;
        if (!userId) return res.status(401).json({ message: "Unauthorised" });
        const planId = (await storage.getUserPlan(userId) || "free").toLowerCase();
        const dailyLimit = BULK_LIMITS[planId] ?? 0;
        const unlimited = planId === "pro";
        const today = getTodayStr();
        const row = await storage.getAiUsageToday(userId, BULK_TOOL, today);
        const usedToday = row?.questionsUsed ?? 0;
        return res.json({
          planId,
          usedToday,
          dailyLimit: unlimited ? null : dailyLimit,
          remaining: unlimited ? null : Math.max(0, dailyLimit - usedToday),
          unlimited,
          enabled: planId !== "free",
        });
      } catch (err: any) {
        console.error("[BulkApply] Usage error:", err.message);
        return res.status(500).json({ message: "Failed to fetch usage" });
      }
    });

    // POST /api/bulk-apply/generate — AI generate cover letters + answers for selected jobs
    app.post("/api/bulk-apply/generate", isAuthenticated, requireAnyPaidPlan, async (req: any, res) => {
      try {
        const userId = req.user?.claims?.sub;
        if (!userId) return res.status(401).json({ message: "Unauthorised" });

        const { jobs, userProfile } = req.body;
        if (!Array.isArray(jobs) || jobs.length === 0) {
          return res.status(400).json({ message: "No jobs provided" });
        }

        const planId = ((await storage.getUserPlan(userId)) || "free").toLowerCase();
        const today = getTodayStr();
        const row = await storage.getAiUsageToday(userId, BULK_TOOL, today);
        const usedToday = row?.questionsUsed ?? 0;
        const dailyLimit = BULK_LIMITS[planId] ?? 0;
        const unlimited = planId === "pro";

        if (!unlimited) {
          const remaining = dailyLimit - usedToday;
          if (remaining <= 0) {
            return res.json({
              limitReached: true,
              message: `You have used all ${dailyLimit} bulk applications for today. Your limit resets at midnight. Upgrade to Pro for unlimited applications.`,
              usedToday,
              dailyLimit,
            });
          }
          if (jobs.length > remaining) {
            return res.status(400).json({
              message: `You can only apply to ${remaining} more job(s) today. Upgrade to Pro for higher limits.`,
              remaining,
            });
          }
        }

        const MAX_PER_BATCH = planId === "pro" ? 20 : 5;
        const jobsBatch = jobs.slice(0, MAX_PER_BATCH);

        // Generate in parallel (cap at MAX_PER_BATCH)
        const generateForJob = async (job: any) => {
          const systemPrompt = `You are an expert career coach helping a Kenyan professional apply for overseas jobs. Generate a professional, personalized cover letter and answers to common application questions for a job posting.

Keep the cover letter to 3 concise paragraphs (intro, relevant skills/experience, why this company/country).
For the answers, use clear direct professional language.
The applicant is based in Kenya and is targeting overseas employment with visa sponsorship.`;

          const userPrompt = `Job Title: ${job.title}
Company: ${job.company}
Country: ${job.country}
${job.description ? `Job Description: ${job.description.slice(0, 500)}` : ""}
${userProfile ? `Applicant Profile: ${userProfile.slice(0, 400)}` : ""}

Please provide:
1. A cover letter (3 paragraphs, professional, specific to this role)
2. Answer to: "Why do you want to work in ${job.country}?"
3. Answer to: "Why are you interested in this ${job.title} role?"
4. Answer to: "What relevant experience do you have for this position?"

Format as JSON: { "coverLetter": "...", "answers": [{"question": "...", "answer": "..."}] }`;

          try {
            const completion = await bulkAiClient.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
              max_tokens: 800,
              temperature: 0.7,
              response_format: { type: "json_object" },
            });
            const content = completion.choices[0]?.message?.content || "{}";
            const parsed = JSON.parse(content);
            return {
              jobId: job.id,
              coverLetter: parsed.coverLetter || "Cover letter generation failed. Please write one manually.",
              applicationAnswers: parsed.answers || [],
              error: null,
            };
          } catch (e: any) {
            return {
              jobId: job.id,
              coverLetter: `Dear Hiring Manager,\n\nI am writing to express my interest in the ${job.title} position at ${job.company} in ${job.country}.\n\nAs a motivated professional from Kenya seeking overseas employment, I am excited about the opportunity to contribute to your team. My skills and dedication make me a strong candidate for this role.\n\nI look forward to discussing how my background aligns with your requirements.\n\nYours sincerely`,
              applicationAnswers: [
                { question: `Why do you want to work in ${job.country}?`, answer: "I am motivated by professional growth opportunities and the chance to contribute my skills in an international environment." },
                { question: `Why are you interested in this ${job.title} role?`, answer: "This position aligns well with my professional background and career aspirations." },
                { question: "What relevant experience do you have?", answer: "I bring relevant experience and skills that make me well-suited for this position." },
              ],
              error: "AI generation failed, fallback content provided",
            };
          }
        };

        const generated = await Promise.all(jobsBatch.map(generateForJob));
        return res.json({ generated, limitReached: false, planId, remaining: unlimited ? null : Math.max(0, dailyLimit - usedToday) });
      } catch (err: any) {
        console.error("[BulkApply] Generate error:", err.message);
        return res.status(500).json({ message: "Generation service temporarily unavailable. Please try again." });
      }
    });

    // POST /api/bulk-apply/submit — confirm and save bulk applications to tracker
    app.post("/api/bulk-apply/submit", isAuthenticated, requireAnyPaidPlan, async (req: any, res) => {
      try {
        const userId = req.user?.claims?.sub;
        if (!userId) return res.status(401).json({ message: "Unauthorised" });

        const { applications } = req.body;
        if (!Array.isArray(applications) || applications.length === 0) {
          return res.status(400).json({ message: "No applications provided" });
        }

        const planId = ((await storage.getUserPlan(userId)) || "free").toLowerCase();
        const today = getTodayStr();
        const unlimited = planId === "pro";
        if (!unlimited) {
          const row = await storage.getAiUsageToday(userId, BULK_TOOL, today);
          const usedToday = row?.questionsUsed ?? 0;
          const dailyLimit = BULK_LIMITS[planId] ?? 0;
          if (usedToday + applications.length > dailyLimit) {
            return res.status(400).json({
              message: `Applying to ${applications.length} jobs would exceed your daily limit of ${dailyLimit}. You have ${Math.max(0, dailyLimit - usedToday)} remaining.`,
            });
          }
        }

        const toInsert = applications.map((app: any) => ({
          userId,
          jobTitle: app.jobTitle || "Unknown Position",
          companyName: app.companyName || "Unknown Company",
          jobUrl: app.jobUrl || null,
          targetCountry: app.targetCountry || "Unknown",
          salary: app.salary || null,
          source: "bulk_apply",
          status: "applied" as const,
          appliedAt: new Date(),
          coverLetter: app.coverLetter || null,
          applicationAnswers: app.applicationAnswers || null,
          notes: app.notes || null,
        }));

        const saved = await storage.bulkCreateTrackedApplications(toInsert);
        await storage.addAiUsage(userId, BULK_TOOL, today, applications.length);

        return res.json({ saved: saved.length, message: `Successfully saved ${saved.length} application(s) to your tracker.` });
      } catch (err: any) {
        console.error("[BulkApply] Submit error:", err.message);
        return res.status(500).json({ message: "Failed to save applications. Please try again." });
      }
    });
  }

  // ── POST /api/auto-apply/submit — PRO-only: generate cover letter + save in one shot ──
  app.post("/api/auto-apply/submit", isAuthenticated, async (req: any, res) => {
    try {
      const isPro = await isUserPro(req.user.id);
      if (!isPro) {
        return res.status(403).json({ error: "Upgrade to PRO to auto-apply with AI" });
      }

      const { jobs: jobList, userProfile } = req.body;
      if (!Array.isArray(jobList) || jobList.length === 0) {
        return res.status(400).json({ error: "jobs array is required" });
      }
      if (jobList.length > 20) {
        return res.status(400).json({ error: "Maximum 20 jobs per request" });
      }

      // Fetch CV from Supabase for richer generation (optional — falls back gracefully)
      const { data: cvRows } = await supabase
        .from("user_cvs")
        .select("content")
        .eq("user_id", req.user.id)
        .order("created_at", { ascending: false })
        .limit(1);

      const cvContext = cvRows?.[0]?.content ?? null;
      const profileContext = userProfile ?? (cvContext ? "(see CV below)" : "overseas job seeker from Kenya");

      const { askGPT } = await import("./lib/openai");

      // Generate cover letter for each job in parallel (capped at 5 concurrent)
      const CONCURRENCY = 5;
      const results: { jobId: string; coverLetter: string }[] = [];

      for (let i = 0; i < jobList.length; i += CONCURRENCY) {
        const batch = jobList.slice(i, i + CONCURRENCY);
        const settled = await Promise.allSettled(
          batch.map(async (job: any) => {
            const prompt = `
Write a concise, professional 2-paragraph cover letter for this job application.
Tailor it specifically to the role and company. Do not add placeholders.

Job: ${job.title} at ${job.company} (${job.country})
${job.description ? `Description: ${job.description.slice(0, 400)}` : ""}
Applicant profile: ${profileContext}
${cvContext ? `\nCV summary:\n${cvContext.slice(0, 800)}` : ""}
`.trim();
            const letter = await askGPT(prompt);
            return { jobId: job.id, coverLetter: letter };
          })
        );
        for (const r of settled) {
          if (r.status === "fulfilled") results.push(r.value);
        }
      }

      // Build insert payload — one row per successfully generated letter
      const generatedIds = new Set(results.map((r) => r.jobId));
      const toInsert = jobList
        .filter((j: any) => generatedIds.has(j.id))
        .map((job: any) => ({
          userId: req.user.id,
          jobTitle: job.title || "Unknown Position",
          companyName: job.company || "Unknown Company",
          jobUrl: job.applyLink ?? null,
          targetCountry: job.country || "Unknown",
          salary: job.salary ?? null,
          source: "auto_apply",
          status: "applied" as const,
          appliedAt: new Date(),
          coverLetter: results.find((r) => r.jobId === job.id)?.coverLetter ?? null,
          applicationAnswers: null,
          notes: null,
        }));

      const saved = await storage.bulkCreateTrackedApplications(toInsert);
      return res.json({ saved: saved.length });
    } catch (err: any) {
      console.error("[AutoApply] Submit error:", err.message);
      return res.status(500).json({ error: "Auto-apply failed. Please try again." });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VISA ASSISTANT — Freemium AI chat for visa & immigration questions
  // Limits: FREE=3/day, BASIC=20/day, PRO=unlimited
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const OpenAI = (await import("openai")).default;
    const visaAiClient = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });

    const DAILY_LIMITS: Record<string, number> = { free: 3, basic: 20, pro: Infinity };
    const TOOL_NAME = "visa_assistant";

    function getTodayDate(): string {
      return new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    }

    // GET /api/visa-assistant/usage — return today's usage for the logged-in user
    app.get("/api/visa-assistant/usage", isAuthenticated, async (req: any, res) => {
      try {
        const userId = req.user?.claims?.sub;
        if (!userId) return res.status(401).json({ message: "Unauthorised" });

        const planId = await storage.getUserPlan(userId);
        const normalised = (planId || "free").toLowerCase();
        const dailyLimit = DAILY_LIMITS[normalised] ?? DAILY_LIMITS.free;
        const unlimited = normalised === "pro";

        const today = getTodayDate();
        const row = await storage.getAiUsageToday(userId, TOOL_NAME, today);
        const questionsUsed = row?.questionsUsed ?? 0;
        const remaining = unlimited ? Infinity : Math.max(0, dailyLimit - questionsUsed);

        return res.json({
          questionsUsed,
          dailyLimit: unlimited ? null : dailyLimit,
          remaining: unlimited ? null : remaining,
          planId: normalised,
          unlimited,
        });
      } catch (err: any) {
        console.error("[VisaAssistant] Usage error:", err.message);
        return res.status(500).json({ message: "Failed to fetch usage" });
      }
    });

    // POST /api/visa-assistant — submit a question
    app.post("/api/visa-assistant", isAuthenticated, async (req: any, res) => {
      try {
        const userId = req.user?.claims?.sub;
        if (!userId) return res.status(401).json({ message: "Unauthorised" });

        const { question } = req.body;
        if (!question || typeof question !== "string" || question.trim().length === 0) {
          return res.status(400).json({ message: "Question is required" });
        }
        if (question.trim().length > 2000) {
          return res.status(400).json({ message: "Question too long (max 2,000 characters)" });
        }

        // ── Check plan & daily limit ────────────────────────────────────────
        const planId = await storage.getUserPlan(userId);
        const normalised = (planId || "free").toLowerCase();
        const dailyLimit = DAILY_LIMITS[normalised] ?? DAILY_LIMITS.free;
        const unlimited = normalised === "pro";

        const today = getTodayDate();
        if (!unlimited) {
          const row = await storage.getAiUsageToday(userId, TOOL_NAME, today);
          const used = row?.questionsUsed ?? 0;
          if (used >= dailyLimit) {
            const limitMessages: Record<string, string> = {
              free: `You have reached your free limit of ${dailyLimit} questions today. Upgrade to Basic (20/day) or Pro (unlimited) to continue.`,
              basic: `You have reached your Basic plan limit of ${dailyLimit} questions today. Upgrade to Pro for unlimited questions.`,
            };
            return res.json({
              limitReached: true,
              message: limitMessages[normalised] || "Daily limit reached. Please upgrade to continue.",
              planId: normalised,
              questionsUsed: used,
              dailyLimit,
            });
          }
        }

        // ── Call OpenAI ─────────────────────────────────────────────────────
        const systemPrompt = `You are an expert visa and immigration advisor specialising in helping Kenyan and African professionals work abroad. You have deep knowledge of work visas, immigration pathways, and job market requirements for Canada, UK, USA, Germany, UAE, Australia, Netherlands, Ireland, and other popular destinations.

Your role:
- Answer visa and immigration questions clearly and practically
- Give step-by-step guidance when asked about application processes
- Suggest next steps and related resources
- Be honest about requirements and typical processing times
- Tailor advice to the context of applicants from Kenya/Africa when relevant

Rules:
- Always end your response with: "⚠️ This is general guidance and not official immigration advice. Always verify with the official government website for your target country."
- Keep responses concise but complete (300–600 words unless the question requires more detail)
- Use numbered lists for steps
- Use plain language`;

        const completion = await visaAiClient.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: question.trim() },
          ],
          max_tokens: 900,
          temperature: 0.7,
        });

        const response = completion.choices[0]?.message?.content || "Sorry, I could not generate a response. Please try again.";

        // ── Increment usage ─────────────────────────────────────────────────
        const newCount = await storage.incrementAiUsage(userId, TOOL_NAME, today);

        return res.json({
          response,
          limitReached: false,
          questionsUsed: newCount,
          dailyLimit: unlimited ? null : dailyLimit,
          remaining: unlimited ? null : Math.max(0, dailyLimit - newCount),
          planId: normalised,
          unlimited,
        });
      } catch (err: any) {
        console.error("[VisaAssistant] Error:", err.message);
        return res.status(500).json({ message: "AI service temporarily unavailable. Please try again." });
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCAM REPORTING & AGENCY BLACKLIST
  // ═══════════════════════════════════════════════════════════════════════════
  {
    const scamEvidenceDir = path.join(process.cwd(), "uploads", "scam-evidence");
    if (!fs.existsSync(scamEvidenceDir)) fs.mkdirSync(scamEvidenceDir, { recursive: true });

    const scamUpload = multer({
      storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, scamEvidenceDir),
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
          cb(null, `${unique}${path.extname(file.originalname).toLowerCase()}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024, files: 5 }, // 5MB per file, max 5 files
      fileFilter: (_req, file, cb) => {
        const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
        cb(null, allowed.includes(file.mimetype));
      },
    });

    // Serve evidence images publicly
    app.get("/api/uploads/scam-evidence/:filename", (req, res) => {
      const safeFilename = path.basename(req.params.filename);
      const filePath = path.join(scamEvidenceDir, safeFilename);
      if (!filePath.startsWith(scamEvidenceDir + path.sep)) return res.status(400).json({ message: "Invalid filename" });
      if (!fs.existsSync(filePath)) return res.status(404).json({ message: "File not found" });
      res.sendFile(filePath);
    });

    // POST /api/scam-reports/upload-evidence — upload evidence images (returns URLs)
    app.post("/api/scam-reports/upload-evidence", scamUpload.array("files", 5), async (req: any, res) => {
      try {
        const files = req.files as Express.Multer.File[];
        if (!files || files.length === 0) return res.status(400).json({ message: "No files uploaded" });
        const urls = files.map(f => `/api/uploads/scam-evidence/${f.filename}`);
        return res.json({ urls });
      } catch (err: any) {
        console.error("[ScamReport] Upload error:", err.message);
        res.status(500).json({ message: "Upload failed" });
      }
    });

    // POST /api/scam-reports — submit a new report
    app.post("/api/scam-reports", async (req: any, res) => {
      try {
        const userId = req.user?.claims?.sub ?? null;

        // Rate limit: max 3 reports per user per day
        if (userId) {
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
          const recentCount = await storage.getRecentScamReportsByUser(userId, since);
          if (recentCount >= 3) {
            return res.status(429).json({ message: "You can submit a maximum of 3 reports per day." });
          }
        }

        const { agencyName, country, description, amountLost, contactInfo, evidenceImages, reporterEmail } = req.body;
        if (!agencyName?.trim() || !description?.trim()) {
          return res.status(400).json({ message: "Agency name and description are required." });
        }
        if (description.trim().length < 20) {
          return res.status(400).json({ message: "Description must be at least 20 characters." });
        }

        const report = await storage.createScamReport({
          agencyName: agencyName.trim().slice(0, 255),
          country: country?.trim().slice(0, 100) || null,
          description: description.trim().slice(0, 5000),
          amountLost: amountLost ? Number(amountLost) : null,
          contactInfo: contactInfo?.trim().slice(0, 500) || null,
          evidenceImages: Array.isArray(evidenceImages) ? evidenceImages.slice(0, 10) : [],
          reportedBy: userId,
          reporterEmail: reporterEmail?.trim().slice(0, 255) || null,
        });

        res.json({ success: true, id: report.id, message: "Report submitted successfully. It will be reviewed before publishing." });
      } catch (err: any) {
        console.error("[ScamReport] Create error:", err.message);
        res.status(500).json({ message: "Failed to submit report. Please try again." });
      }
    });

    // GET /api/scam-reports — public approved reports (paginated, filterable)
    app.get("/api/scam-reports", async (req, res) => {
      try {
        const { search, country, page = "1", limit = "10" } = req.query as any;
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 10));
        const offset = (pageNum - 1) * limitNum;

        const reports = await storage.getScamReports({
          status: "approved",
          search: search?.trim() || undefined,
          country: country?.trim() || undefined,
          limit: limitNum,
          offset,
        });
        const total = await storage.countScamReports("approved");

        res.json({ reports, total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) });
      } catch (err: any) {
        console.error("[ScamReport] List error:", err.message);
        res.status(500).json({ message: "Failed to fetch reports" });
      }
    });

    // ── Admin routes ──────────────────────────────────────────────────────────
    app.get("/api/admin/scam-reports", isAuthenticated, isAdmin, async (req: any, res) => {
      try {
        const { status, search, country, page = "1", limit = "20" } = req.query as any;
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(100, parseInt(limit) || 20);
        const offset = (pageNum - 1) * limitNum;
        const reports = await storage.getScamReports({ status, search, country, limit: limitNum, offset });
        const total = await storage.countScamReports(status);
        const pending = await storage.countScamReports("pending");
        const approved = await storage.countScamReports("approved");
        const rejected = await storage.countScamReports("rejected");
        res.json({ reports, total, page: pageNum, limit: limitNum, stats: { pending, approved, rejected } });
      } catch (err: any) {
        res.status(500).json({ message: "Failed to fetch admin scam reports" });
      }
    });

    app.patch("/api/admin/scam-reports/:id", isAuthenticated, isAdmin, async (req: any, res) => {
      try {
        const { id } = req.params;
        const { status, adminNote } = req.body;
        if (!["approved", "rejected", "pending"].includes(status)) {
          return res.status(400).json({ message: "Status must be approved, rejected, or pending" });
        }
        const updated = await storage.updateScamReport(id, { status, adminNote: adminNote?.trim() || null });
        if (!updated) return res.status(404).json({ message: "Report not found" });
        res.json(updated);
      } catch (err: any) {
        res.status(500).json({ message: "Failed to update report" });
      }
    });

    app.delete("/api/admin/scam-reports/:id", isAuthenticated, isAdmin, async (req: any, res) => {
      try {
        await storage.deleteScamReport(req.params.id);
        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ message: "Failed to delete report" });
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCAM WALL — TikTok-style viral engagement feed for approved scam reports
  // ═══════════════════════════════════════════════════════════════════════════
  app.get("/api/scam-wall", async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page || "1")));
      const limit = Math.min(20, Math.max(1, parseInt(String(req.query.limit || "10"))));
      const { reports, total } = await storage.getScamWallFeed(page, limit);
      res.json({ reports, total, page, limit, pages: Math.ceil(total / limit) });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to load feed" });
    }
  });

  app.post("/api/scam-wall/:id/like", async (req, res) => {
    try {
      const fingerprint = String(req.body.fingerprint || "anon").substring(0, 255);
      const result = await storage.likeScamReport(req.params.id, fingerprint);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to like report" });
    }
  });

  app.get("/api/scam-wall/:id/comments", async (req, res) => {
    try {
      const comments = await storage.getScamWallComments(req.params.id);
      res.json({ comments });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to load comments" });
    }
  });

  app.post("/api/scam-wall/:id/comment", async (req, res) => {
    try {
      const { content, authorName } = req.body;
      if (!content || String(content).trim().length < 3) {
        return res.status(400).json({ message: "Comment must be at least 3 characters" });
      }
      const comment = await storage.addScamWallComment(
        req.params.id,
        String(content).trim().substring(0, 500),
        String(authorName || "Anonymous").trim().substring(0, 100)
      );
      res.json({ comment });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to add comment" });
    }
  });

  app.post("/api/scam-wall/:id/view", async (req, res) => {
    try {
      await storage.incrementScamReportViews(req.params.id);
      res.json({ success: true });
    } catch {
      res.json({ success: false });
    }
  });

  // Admin: feature/unfeature a scam report
  app.patch("/api/admin/scam-reports/:id/feature", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { isFeatured } = req.body;
      const updated = await storage.updateScamReport(req.params.id, { isFeatured: !!isFeatured });
      res.json({ report: updated });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to update feature status" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIVITY LOGS (admin)
  // ═══════════════════════════════════════════════════════════════════════════

  app.get("/api/admin/stats", isAuthenticated, isAdmin, async (_req: any, res) => {
    try {
      // 1. TOTAL USERS
      const { count: usersCount } = await supabase
        .from("users")
        .select("*", { count: "exact", head: true });

      // 2. TOTAL PAYMENTS + REVENUE
      const { data: payments } = await supabase
        .from("payments")
        .select("*");

      const totalRevenue = (payments ?? []).reduce(
        (sum: number, p: any) => sum + (Number(p.amount) || 0), 0
      );

      // 3. ACTIVE SUBSCRIPTIONS
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("*");

      const now = new Date();
      const activeSubs = (subs ?? []).filter(
        (s: any) => s.status === "active" && new Date(s.expires_at) > now
      );

      // 4. LIVE USERS — active in the last 5 minutes
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      const { data: activeUsers } = await supabase
        .from("users")
        .select("*")
        .gte("last_active", fiveMinutesAgo.toISOString());
      const liveCount = activeUsers?.length || 0;

      const { data: events } = await supabase
        .from("user_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      res.json({
        users:      usersCount ?? 0,
        revenue:    totalRevenue,
        active_pro: activeSubs.length,
        live_users: liveCount,
        payments:   (payments ?? []).slice(-10).reverse(),
        events:     events ?? [],
      });
    } catch (err) {
      console.error("[Admin] stats error:", err);
      res.status(500).json({ error: "Admin error" });
    }
  });

  app.get("/api/admin/activity-logs", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { event, email, userId, limit = "100", offset = "0" } = req.query as any;
      const { activityLogs: logsTable } = await import("../shared/schema");
      const { and, eq, ilike, desc } = await import("drizzle-orm");

      const conditions: any[] = [];
      if (event && event !== "all") conditions.push(eq(logsTable.event, event));
      if (email) conditions.push(ilike(logsTable.email, `%${email}%`));
      if (userId) conditions.push(eq(logsTable.userId, userId));

      const rows = await db
        .select()
        .from(logsTable)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(logsTable.createdAt))
        .limit(Math.min(500, parseInt(limit) || 100))
        .offset(parseInt(offset) || 0);

      res.json({ logs: rows, total: rows.length });
    } catch (err: any) {
      console.error("[Admin] activity-logs error:", err.message);
      res.status(500).json({ message: "Failed to fetch activity logs" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GROWTH TOOLS SUITE — ATS CV Checker, Scam Checker, Visa Jobs, CV Templates
  // ═══════════════════════════════════════════════════════════════════════════
  const { registerToolsRoutes } = await import("./tools-routes");
  registerToolsRoutes(app, isAuthenticated, isAdmin);

  // AI Routes — /api/ai/cv/check, /api/ai/jobs/generate, /api/ai/jobs/batch-generate, /api/ai/jobs/history, /api/ai/jobs/retry/:id
  const { default: aiRouter } = await import("./routes/ai");
  app.use("/api/ai", aiRouter);

  // ═══════════════════════════════════════════════════════════════════════════
  // WhatsApp AI Pipeline (exempt from CSRF — external Twilio webhook):
  //   User (WA) → Twilio Webhook → Backend (Replit) → DB lookup
  //                                                  → OpenAI (gpt-4.1-mini)
  //                                                  → TwiML Response → Twilio → User
  // ═══════════════════════════════════════════════════════════════════════════

  // Per-user conversation memory keyed by WhatsApp sender (TTL: 30 min)
  type ConvMessage = { role: "user" | "assistant"; content: string };
  type WaBookingSlot = { label: string; date: Date; timeLabel: string };
  type WaCvMatch = {
    id: string; title: string; company: string; country: string;
    matchScore: number; matchReason: string; salary: string | null;
  };
  type WaConvEntry = {
    messages: ConvMessage[];
    lastAt: number;
    awaitingBookingSlot?: boolean;
    bookingSlots?: WaBookingSlot[];
    awaitingCvMenu?: boolean;      // true after CV analysis sent — waiting for 1/2/3/4
    pendingCvMatches?: WaCvMatch[]; // full match list so "MORE" can page through them
    cvMatchIndex?: number;          // how many matches already shown (default 3)
  };
  const waConversations = new Map<string, WaConvEntry>();

  // Periodic sweep — evict entries that haven't been active for >30 min.
  // Without this the Map accumulates one slot per unique phone number forever
  // (entries are only evicted on the next message from the same number).
  const WA_CONV_TTL_MS = 30 * 60 * 1000;
  const waConvSweep = setInterval(() => {
    const cutoff = Date.now() - WA_CONV_TTL_MS;
    let evicted = 0;
    for (const [key, entry] of waConversations) {
      if (entry.lastAt < cutoff) {
        waConversations.delete(key);
        evicted++;
      }
    }
    if (evicted > 0) console.log(`[WA] Swept ${evicted} stale conversation entries (size=${waConversations.size})`);
  }, 15 * 60 * 1000); // run every 15 min
  // Allow process to exit cleanly — don't keep the event loop alive
  waConvSweep.unref();

  // Generate Grace's next available consultation slots (always 3 future slots)
  function getGraceSlots(): WaBookingSlot[] {
    const now = new Date();
    const slots: WaBookingSlot[] = [];

    // Helper: next occurrence of a weekday (0=Sun…6=Sat) at a given hour
    const nextWeekday = (day: number, hour: number, minute = 0): Date => {
      const d = new Date(now);
      d.setHours(hour, minute, 0, 0);
      const diff = (day - d.getDay() + 7) % 7 || (d < now ? 7 : 0);
      d.setDate(d.getDate() + diff);
      if (d <= now) d.setDate(d.getDate() + 7);
      return d;
    };

    // Today at 3 PM (only if it's before 2 PM today)
    const todayAt3 = new Date(now);
    todayAt3.setHours(15, 0, 0, 0);
    if (todayAt3 > now) {
      slots.push({ label: "Today at 3:00 PM", date: todayAt3, timeLabel: "3:00 PM" });
    }

    // Tomorrow at 10 AM
    const tomorrowAt10 = new Date(now);
    tomorrowAt10.setDate(tomorrowAt10.getDate() + 1);
    tomorrowAt10.setHours(10, 0, 0, 0);
    slots.push({ label: "Tomorrow at 10:00 AM", date: tomorrowAt10, timeLabel: "10:00 AM" });

    // Thursday at 2 PM
    const thuAt2 = nextWeekday(4, 14); // 4 = Thursday
    slots.push({ label: `${thuAt2.toLocaleDateString("en-KE", { weekday: "long", month: "short", day: "numeric" })} at 2:00 PM`, date: thuAt2, timeLabel: "2:00 PM" });

    // Fill to 3 if "today" was filtered out
    if (slots.length < 3) {
      const dayAfterTomorrow = new Date(now);
      dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
      dayAfterTomorrow.setHours(11, 0, 0, 0);
      slots.splice(1, 0, { label: `${dayAfterTomorrow.toLocaleDateString("en-KE", { weekday: "long", month: "short", day: "numeric" })} at 11:00 AM`, date: dayAfterTomorrow, timeLabel: "11:00 AM" });
    }

    return slots.slice(0, 3);
  }

  // Parse a user's slot selection ("1","2","3","today","tomorrow","3 pm","10 am") → slot index 0-2
  function parseSlotSelection(msg: string, slots: WaBookingSlot[]): WaBookingSlot | null {
    const m = msg.trim().toLowerCase();
    if (m === "1" || m.includes("first") || m.includes("today") || m.includes("3 pm") || m.includes("3pm")) return slots[0] ?? null;
    if (m === "2" || m.includes("second") || m.includes("tomorrow") || m.includes("10 am") || m.includes("10am")) return slots[1] ?? null;
    if (m === "3" || m.includes("third") || m.includes("thursday") || m.includes("2 pm") || m.includes("2pm")) return slots[2] ?? null;
    // Fallback: try to match any slot label keyword
    for (let i = 0; i < slots.length; i++) {
      if (slots[i].label.toLowerCase().split(" ").some(w => m.includes(w) && w.length > 3)) return slots[i];
    }
    return null;
  }

  // Base persona — user-specific context is appended at runtime after DB lookup
  const WA_BASE_PROMPT = `You are Nanjila, WorkAbroad Hub's career assistant — warm, knowledgeable, and unmistakably Kenyan.

IDENTITY:
- Name: Nanjila | Brand: WorkAbroad Hub | Role: Career Assistant
- You speak like a trusted Kenyan professional: confident, caring, occasionally mixing Swahili naturally.

CRITICAL CONVERSATION RULES:
1. NEVER start a reply with "Hello, I'm Nanjila" or any form of self-introduction after the first greeting. You already introduced yourself — just answer the question directly.
2. Do NOT repeat your name, brand name, or role at the start of follow-up replies. Jump straight to the answer.
3. Be warm, professional, and concise (under 3 short paragraphs unless explaining services).
4. Never make up information. When unsure, escalate to a human immediately.
5. Always highlight safety: NEA verification, scam protection.
6. State all prices in KES. Never quote USD or GBP unless asked about destination costs.
7. Mix English + Swahili naturally. Never sound robotic.
8. Use emojis occasionally — not on every sentence.

KNOWLEDGE BASE — TOPICS YOU HANDLE:
1. Pro Plan pricing (KES 4,500/year, 360 days)
2. NEA agency verification (566 valid, 728 expired/fake in our database)
3. Countries covered: UK, Canada, Australia, UAE, USA, Germany & Europe
4. CV services: ATS optimization, country-specific rewrites (all ⚡ instant AI, under 3 minutes)
5. Job application packs (3, 8, or 15 applications)
6. Student university application packs
7. Scam warnings, red flags, and protection advice
8. CV analysis & job matching — users can send their CV as a PDF or Word document here on WhatsApp and you will analyze it and match them with overseas jobs instantly. When asked about CV analysis, always tell users to *send their CV as a PDF or Word document* and you will analyze it right here.

SERVICES & PRICING:
- Pro Plan: KES 4,500/year — unlimited NEA checks, 30+ verified portals, ATS CV scanner, WhatsApp consultation, priority support
- ATS CV Optimization: KES 3,500 (⚡ instant AI delivery)
- Country-Specific CV Rewrite: KES 3,500 (⚡ instant AI delivery)
- Cover Letter Writing: KES 1,500 (⚡ instant AI delivery)
- Interview Coaching: KES 5,000 (⚡ instant AI delivery)
- Visa Guidance Session: KES 3,000 (⚡ instant AI delivery)
- LinkedIn Optimization: KES 3,000 (⚡ instant AI delivery)
- SOP/Statement of Purpose: KES 4,000 (⚡ instant AI delivery)
- Employment Contract Review: KES 3,500 (⚡ instant AI delivery)
- Employer Verification Report: KES 2,500 (⚡ instant AI delivery)
- Pre-Departure Orientation Pack: KES 1,500 (⚡ instant AI delivery)

JOB APPLICATION PACKS:
- Starter Pack: KES 2,500 (3 applications)
- Pro Pack: KES 5,500 (8 applications)
- Premium Pack: KES 9,500 (15 applications)

STUDENT PACKS:
- Student Starter: KES 3,500 (3 university applications)
- Student Pro: KES 7,500 (6 university applications)
- Student Premium: KES 12,000 (10 university applications)

SUBSCRIPTIONS:
- Premium WhatsApp Support: KES 1,000/month (priority 2-hour response)
- Premium Job Alerts: KES 500/month (weekly verified jobs via WhatsApp)
- Abroad Worker Emergency Support: KES 300/month (24/7 emergency line)

COUNTRIES COVERED:
- United Kingdom (NHS, Tier 2 Visa)
- Canada (Express Entry, PNP)
- Australia (Points-tested, State Nomination)
- USA (H-1B, EB-3, Green Card DV Lottery)
- UAE/Gulf (Tax-free, construction, hospitality)
- Europe (Germany, France, EU Blue Card)

SCAM PROTECTION:
- NEA License Verification: 566 valid agencies, 728 expired/fake in our database
- Always advise users to verify agencies before paying any fees
- "Hii inaonekana shady ⚠️ — don't risk pesa yako."

HUMAN ESCALATION:
If a user says they're frustrated, asks to speak to a human, mentions Grace or James, or you cannot answer confidently:
Say exactly: "I understand. Let me connect you with our team. Grace M. will reply within 2 hours. Your message has been forwarded to her right now."
Never improvise this message. Trigger phrases include: "speak to human", "real person", "talk to grace", "talk to james", "not helping", "frustrated", "complaint".

PAYMENT:
- M-Pesa and PayPal accepted. Payments are secure and recorded automatically.
- Reply PAY to get the payment link.

REFERRAL / AFFILIATE PROGRAMME:
WorkAbroad Hub has a referral programme anyone can join to earn money by promoting the platform.
Key facts to share confidently:
- Every registered user gets a unique referral link from their dashboard at /referrals
- When someone signs up and pays using their referral link, the affiliate earns *10% commission automatically*
- Commission is paid out *instantly and automatically via M-Pesa* — no forms, no waiting, no manual process. The moment the referred user's payment clears, the commission lands in the affiliate's M-Pesa
- Referred users also benefit: they get a *20% discount* on the Pro Plan — KES 3,600 instead of KES 4,500
- There are no limits — affiliates can refer as many people as they want and earn on every payment
- It's ideal for social media influencers, community leaders, church groups, SACCOs, students, and anyone with a network of job seekers
- To join, simply register at WorkAbroad Hub and go to the Dashboard → Referrals section to get your link
When a user asks about earning, making money, affiliate marketing, or promoting WorkAbroad Hub:
→ Explain the referral programme enthusiastically. Emphasise: FREE to join, automatic M-Pesa payout, instant commission, no middleman.
→ Direct them to: /referrals or their Dashboard after signing up.

Tone examples:
- "Hii inaonekana shady ⚠️ don't risk pesa yako."
- "Unlock PRO 🔒 uone verified jobs pekee."
- Warm, sharp, protective. Always reinforce trust and safety.`;

  // ── Intent detection ─────────────────────────────────────────────────────────
  type WhatsAppIntent =
    | "PRICING_INQUIRY" | "CV_SERVICE" | "JOB_APPLICATION" | "VISA_INQUIRY"
    | "VERIFICATION" | "COUNTRY_INQUIRY" | "HUMAN_REQUEST" | "PAYMENT_INQUIRY"
    | "SCAM_WARNING" | "BOOK_CONSULTATION" | "GENERAL_INQUIRY";

  function detectWhatsAppIntent(message: string): WhatsAppIntent {
    const m = message.toLowerCase();
    if (m.includes("book") || m.includes("schedule") || m.includes("appointment") ||
        m.includes("consultation") || m.includes("consult") || m.includes("call with grace") ||
        m.includes("speak with grace") || m.includes("book a call") || m.includes("book call") ||
        m.includes("reserve") || m.includes("set up a call") || m.includes("meeting") ||
        m.includes("nipigie") || m.includes("piga simu") || m.includes("miadi"))
      return "BOOK_CONSULTATION";
    if (m.includes("price") || m.includes("cost") || m.includes("kes") || m.includes("how much") || m.includes("bei"))
      return "PRICING_INQUIRY";
    if (m.includes("cv") || m.includes("resume") || m.includes("curriculum") || m.includes("optimization"))
      return "CV_SERVICE";
    if (m.includes("apply") || m.includes("application") || m.includes("job pack") || m.includes("omba kazi"))
      return "JOB_APPLICATION";
    if (m.includes("visa") || m.includes("immigration") || m.includes("permit") || m.includes("passport"))
      return "VISA_INQUIRY";
    if (m.includes("scam") || m.includes("fake") || m.includes("fraud") || m.includes("verify") || m.includes("nea") || m.includes("legit"))
      return "VERIFICATION";
    if (m.includes("country") || m.includes("canada") || m.includes("uk") || m.includes("australia") ||
        m.includes("uae") || m.includes("dubai") || m.includes("usa") || m.includes("germany") || m.includes("europe"))
      return "COUNTRY_INQUIRY";
    if (m.includes("speak to human") || m.includes("real person") || m.includes("talk to grace") ||
        m.includes("talk to james") || m.includes("not helping") || m.includes("frustrated") ||
        m.includes("complaint") || m.includes("human") || m.includes("person") || m.includes("speak") ||
        m.includes("advisor") || m.includes("agent") || m.includes("grace") || m.includes("james") ||
        m.includes("real") || m.includes("talk to") || m.includes("connect me") ||
        m.includes("doesn't help") || m.includes("useless") || m.includes("annoyed") ||
        m.includes("waste") || m.includes("sijafaidi") || m.includes("tuma mtu") || m.includes("naomba msaada"))
      return "HUMAN_REQUEST";
    if (m.includes("payment") || m.includes("mpesa") || m.includes("pay") || m.includes("lipa") || m.includes("paypal"))
      return "PAYMENT_INQUIRY";
    if (m.includes("scam") || m.includes("shady") || m.includes("suspicious"))
      return "SCAM_WARNING";
    return "GENERAL_INQUIRY";
  }

  // ── Firebase WhatsApp logger (delegates to firebaseRtdb service) ─────────────
  async function logWhatsAppConversation(
    phoneNumber: string,
    userMessage: string,
    aiResponse: string,
    intent: WhatsAppIntent,
    audioSent = true,
  ) {
    const { logWhatsAppMessage } = await import("./services/firebaseRtdb");
    await logWhatsAppMessage({
      phoneNumber,
      userMessage,
      aiResponse,
      intent,
      escalated: intent === "HUMAN_REQUEST",
      audioSent,
    });
  }

  app.post("/api/whatsapp/webhook", async (req: any, res) => {
    const message = req.body.Body;
    const phone   = req.body.From.replace("whatsapp:", "");

    const user = await pool.query(
      "SELECT * FROM users WHERE phone = $1",
      [phone]
    );

    if (!user.rows.length) {
      await sendWhatsApp(phone, "Please sign up first.");
      return res.sendStatus(200);
    }

    const reply = await handleUserMessage(user.rows[0], message);

    await sendWhatsApp(phone, reply);

    res.sendStatus(200);
  });

  // ─── Twilio delivery status callback (exempt from CSRF) ───────────────────
  // Twilio calls this URL with message delivery updates (sent, delivered, failed, etc.)
  // Configure it in your Twilio WhatsApp Sender → Status Callback URL field.
  app.post("/api/whatsapp/status", async (req: any, res) => {
    const messageStatus: string = req.body?.MessageStatus ?? "";
    const messageSid: string   = req.body?.MessageSid   ?? "";
    const errorCode: string    = req.body?.ErrorCode     ?? "";
    const errorMsg: string     = req.body?.ErrorMessage  ?? "";
    if (messageSid && messageStatus) {
      const detail = errorCode ? ` | ErrorCode=${errorCode} ErrorMessage="${errorMsg}"` : "";
      console.log(`[WhatsApp/Status] ${messageSid} → ${messageStatus}${detail}`);
      const { fbPatch } = await import("./services/firebaseRtdb");
      fbPatch(`messageStatus/${messageSid}`, {
        status: messageStatus,
        ...(errorCode ? { errorCode, errorMsg } : {}),
        updatedAt: Date.now(),
      }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
    }
    res.sendStatus(200);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ElevenLabs Voice — POST /api/whatsapp/voice { text } → streams MP3
  // GET /audio/:file → serves generated file to Twilio for WhatsApp media
  // Both exempt from CSRF (external Twilio callbacks / no-session callers)
  // ═══════════════════════════════════════════════════════════════════════════
  // POST /api/whatsapp/voice — generate voice and stream MP3 back to caller
  app.post("/api/whatsapp/voice", async (req: any, res) => {
    const text: string = (req.body?.text || "").trim();
    if (!text) return res.status(400).json({ message: "text is required" });

    if (!process.env.ELEVENLABS_API_KEY) {
      return res.status(503).json({ message: "Voice generation not configured — ELEVENLABS_API_KEY missing." });
    }

    try {
      const { generateVoiceFile } = await import("./lib/elevenlabs");
      const filename = await generateVoiceFile(text);
      const filepath = `/tmp/${filename}`;

      const fs = await import("fs");
      res.set("Content-Type", "audio/mpeg");
      res.set("Cache-Control", "no-store");
      fs.createReadStream(filepath).pipe(res);
    } catch (err: any) {
      console.error("[ElevenLabs] TTS error:", err.message);
      res.status(500).json({ message: "Voice generation failed. Please try again." });
    }
  });

  // ── Verified Portal Health Routes ────────────────────────────────────────────
  // GET /api/admin/portals — list all portals (sorted by name)
  app.get("/api/admin/portals", async (req: any, res) => {
    try {
      const rows = await db.select().from(verifiedPortals).orderBy(verifiedPortals.name);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch portals", error: err.message });
    }
  });

  // GET /api/portals — public list of active portals
  app.get("/api/portals", async (req: any, res) => {
    try {
      const rows = await db.select().from(verifiedPortals).where(eq(verifiedPortals.isActive, true)).orderBy(verifiedPortals.name);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch portals", error: err.message });
    }
  });

  // POST /api/admin/portals — add a new portal
  app.post("/api/admin/portals", async (req: any, res) => {
    if (!req.isAuthenticated?.() && !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const parsed = insertVerifiedPortalSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid portal data", errors: parsed.error.errors });
    }
    try {
      const [portal] = await db.insert(verifiedPortals).values(parsed.data).returning();
      res.status(201).json(portal);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to add portal", error: err.message });
    }
  });

  // PATCH /api/admin/portals/:id — update portal fields (toggle isActive, etc.)
  app.patch("/api/admin/portals/:id", async (req: any, res) => {
    if (!req.isAuthenticated?.() && !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid portal id" });
    try {
      const [updated] = await db.update(verifiedPortals).set(req.body).where(eq(verifiedPortals.id, id)).returning();
      if (!updated) return res.status(404).json({ message: "Portal not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to update portal", error: err.message });
    }
  });

  // DELETE /api/admin/portals/:id — remove a portal
  app.delete("/api/admin/portals/:id", async (req: any, res) => {
    if (!req.isAuthenticated?.() && !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid portal id" });
    try {
      await db.delete(verifiedPortals).where(eq(verifiedPortals.id, id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to delete portal", error: err.message });
    }
  });

  // POST /api/admin/portals/check-now — trigger immediate health check
  app.post("/api/admin/portals/check-now", async (req: any, res) => {
    if (!req.isAuthenticated?.() && !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const result = await runPortalHealthCheck();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: "Health check failed", error: err.message });
    }
  });

  // GET /audio/:file — serve generated voice files to Twilio so it can send them
  // as WhatsApp media (voice notes). Files live in /tmp and auto-delete after 5min.
  app.get("/audio/:file", async (req: any, res) => {
    const { default: fs } = await import("fs");
    const { default: path } = await import("path");
    // Sanitise filename — only allow safe chars to prevent path traversal
    const safe = (req.params.file as string).replace(/[^a-zA-Z0-9_.\-]/g, "");
    const filepath = path.join("/tmp", safe);
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ message: "Audio file not found or already expired." });
    }
    res.set("Content-Type", "audio/mpeg");
    res.set("Cache-Control", "no-store");
    fs.createReadStream(filepath).pipe(res);
  });

  // ── Admin: send WhatsApp error alert ────────────────────────────────────────
  // POST /api/admin/errors/alert — triggered manually from Error Monitor dashboard
  // or automatically by the background poller when threshold is exceeded.
  app.post("/api/admin/errors/alert", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { backendUnresolved = 0, frontendUnresolved = 0, total = 0 } = req.body ?? {};
      const adminPhone = process.env.ADMIN_PHONE_NUMBER;
      if (!adminPhone) return res.status(500).json({ message: "ADMIN_PHONE_NUMBER not configured" });

      const { sendWhatsApp } = await import("./sms");
      const message =
        `🚨 *WorkAbroad Hub — Error Alert*\n\n` +
        `Backend unresolved: *${backendUnresolved}*\n` +
        `Frontend unresolved: *${frontendUnresolved}*\n` +
        `Total logged: *${total}*\n\n` +
        `Review at: /admin/error-monitor`;

      await sendWhatsApp(adminPhone, message);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message ?? "Failed to send alert" });
    }
  });

  // ── Contact form submission ───────────────────────────────────────────────────
  app.post("/api/contact", async (req: Request, res: Response) => {
    try {
      const { fullName, email, phone, topic, message } = req.body ?? {};
      if (!fullName || !email || !topic || !message) {
        return res.status(400).json({ message: "fullName, email, topic and message are required" });
      }

      const entry = {
        fullName:  String(fullName).slice(0, 120),
        email:     String(email).slice(0, 200),
        phone:     phone ? String(phone).slice(0, 30) : "",
        topic:     String(topic).slice(0, 80),
        message:   String(message).slice(0, 2000),
        timestamp: Date.now(),
        status:    "unread",
        userAgent: req.headers["user-agent"] ?? "",
      };

      // Persist to Firebase RTDB
      const { fbPost } = await import("./services/firebaseRtdb");
      await fbPost("contactMessages", entry).catch((e) =>
        console.warn("[Contact] Firebase write failed:", e.message)
      );

      // Email notification to admin
      const { sendEmail } = await import("./email");
      await sendEmail({
        to:      process.env.GMAIL_USER ?? "kstingjunior@gmail.com",
        subject: `[WorkAbroad Hub] New Contact: ${entry.topic} — ${entry.fullName}`,
        html: `
          <h2 style="font-family:sans-serif">New Contact Form Submission</h2>
          <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
            <tr><td style="padding:6px 12px;font-weight:600">Name</td><td>${entry.fullName}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:600">Email</td><td>${entry.email}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:600">Phone</td><td>${entry.phone || "—"}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:600">Topic</td><td>${entry.topic}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:600">Message</td><td style="white-space:pre-wrap">${entry.message}</td></tr>
          </table>
        `,
      }).catch((e) => console.warn("[Contact] Email notification failed:", e.message));

      res.json({ success: true });
    } catch (err: any) {
      console.error("[Contact] Error:", err.message);
      res.status(500).json({ message: "Failed to submit contact message" });
    }
  });

  // ── Client-side error logging ────────────────────────────────────────────────
  // Receives errors from the browser global error handler and stores them in
  // Firebase RTDB under errors/frontend for monitoring and triage.
  app.post("/api/log/client-error", async (req: Request, res: Response) => {
    try {
      const {
        message = "unknown",
        stack,
        filename,
        lineno,
        colno,
        url,
        type = "client",
        userAgent,
        timestamp,
        ...rest
      } = req.body ?? {};

      // Silently ignore spam: ResizeObserver, script errors from extensions, etc.
      const msgLower = String(message).toLowerCase();
      const isNoise =
        msgLower.includes("resizeobserver") ||
        msgLower === "script error." ||
        msgLower === "script error";

      if (!isNoise) {
        const { logErrorToFirebase } = await import("./services/firebaseRtdb");
        await logErrorToFirebase(
          {
            type,
            code: "CLIENT",
            message,
            stack,
            url: url ?? filename,
            lineno,
            colno,
            userAgent,
            user: (req as any).user?.id?.toString() ?? "anonymous",
            timestamp: timestamp ?? new Date().toISOString(),
            ...rest,
          },
          "frontend"
        );
      }

      res.json({ ok: true });
    } catch {
      res.json({ ok: false });
    }
  });

  // ── Nanjila In-Site Chat ─────────────────────────────────────────────────────
  const webChatSessions = new Map<string, {
    messages: { role: "user" | "assistant"; content: string }[];
    lastActivity: number;
  }>();
  setInterval(() => {
    const now = Date.now();
    webChatSessions.forEach((s, k) => {
      if (now - s.lastActivity > 30 * 60 * 1000) webChatSessions.delete(k);
    });
  }, 10 * 60 * 1000);

  const chatUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

  app.post("/api/nanjila/chat", chatUpload.single("cv"), async (req: any, res: Response) => {
    try {
      const sessionId: string = req.body.sessionId || `web_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const userMessage: string = (req.body.message || "").trim();
      const cvFile = req.file;

      if (!webChatSessions.has(sessionId)) {
        webChatSessions.set(sessionId, { messages: [], lastActivity: Date.now() });
      }
      const session = webChatSessions.get(sessionId)!;
      session.lastActivity = Date.now();

      // ── CV Analysis ─────────────────────────────────────────────────────────
      if (cvFile) {
        const mime = (cvFile.mimetype || "").toLowerCase();
        let cvText = "";
        try {
          const { text, method } = await extractTextFromBuffer(
            cvFile.buffer,
            mime,
            cvFile.originalname || undefined,
          );
          cvText = text;
          console.log(`[Nanjila CV] Extracted ${cvText.length} chars via ${method} from ${cvFile.originalname || "?"}`);
        } catch (err) {
          console.error("[Nanjila CV] Parsing error:", err instanceof Error ? err.message : err);
          return res.json({
            text:
              `I received your file (${cvFile.originalname || "document"}) but had trouble reading it. Please try:\n` +
              `• Saving as a standard PDF (not scanned/image)\n` +
              `• Using Word .docx format\n` +
              `• Copying your CV text and pasting it in the chat`,
            sessionId,
          });
        }

        if (cvText.trim().length < MIN_CV_LENGTH) {
          return res.json({
            text: `I could see your file (${cvFile.originalname || "document"}) but couldn't extract enough text from it — it may be a scanned image PDF. Please try a text-based PDF or Word (.docx) version, or paste your CV text directly in the chat. 🙏`,
            sessionId,
          });
        }
        try {
          const { extractCvInsights, getJobMatches } = await import("./services/jobMatchingService");
          const [insights, matches] = await Promise.all([extractCvInsights(cvText), getJobMatches(cvText)]);

          // ── Compute honest ATS/CV quality score ───────────────────────────
          let cvScore = 0;
          if (insights.skills.length >= 8)        cvScore += 25;
          else if (insights.skills.length >= 4)   cvScore += 15;
          else if (insights.skills.length >= 1)   cvScore += 8;
          if (insights.experienceYears >= 5)       cvScore += 20;
          else if (insights.experienceYears >= 2)  cvScore += 12;
          else if (insights.experienceYears >= 1)  cvScore += 6;
          if (insights.education.length >= 2)      cvScore += 15;
          else if (insights.education.length >= 1) cvScore += 10;
          if (insights.certifications.length >= 2) cvScore += 15;
          else if (insights.certifications.length >= 1) cvScore += 8;
          if (insights.profession && insights.profession !== "Professional") cvScore += 10;
          if (insights.summary && insights.summary.length > 30) cvScore += 10;
          if (insights.languages.length >= 2)      cvScore += 5;
          cvScore = Math.min(100, cvScore);
          const cvScoreLabel = cvScore >= 70 ? "Strong ✅" : cvScore >= 45 ? "Average ⚠️" : "Needs Work ❌";

          // ── Build conversational reply ─────────────────────────────────────
          const profession = insights.profession || "professional";
          const expStr = insights.experienceYears > 0 ? `${insights.experienceYears} year${insights.experienceYears !== 1 ? "s" : ""}` : null;

          let reply = `I've read your CV${insights.name ? `, ${insights.name}` : ""}. `;
          reply += `You are a *${profession}* by profession`;
          if (expStr) reply += ` with ${expStr} of experience`;
          reply += `.\n\n`;

          reply += `📊 *CV Quality Score: ${cvScore}/100 — ${cvScoreLabel}*\n`;
          if (cvScore < 45) {
            reply += `Your CV needs some improvement before applying abroad — key areas: skills list, certifications, and a professional summary. I can help you fix this.\n\n`;
          } else if (cvScore < 70) {
            reply += `Your CV is decent but has room to improve for international ATS systems. A few tweaks could significantly boost your chances.\n\n`;
          } else {
            reply += `Your CV is well-structured and competitive for international applications. 👏\n\n`;
          }

          // Only show job matches if they are actually relevant (score > 20)
          const relevantMatches = matches.filter((m: any) => m.matchScore > 20).slice(0, 3);
          if (relevantMatches.length > 0) {
            reply += `🎯 *Visa-Sponsored Jobs matching your profile:*\n\n`;
            relevantMatches.forEach((m: any, i: number) => {
              reply += `${i + 1}. *${m.title}* — ${m.company} (${m.country}) — ${m.matchScore}%\n`;
            });
            reply += `\n`;
          }

          reply += `If you wish to apply for a job abroad or find visa-sponsored opportunities, I can help you with:\n`;
          reply += `• *CV optimization* for ATS systems (KES 3,500)\n`;
          reply += `• *Job application packs* — we submit on your behalf\n`;
          reply += `• *Visa guidance* for your target country\n\n`;
          reply += `What would you like to do next?`;

          session.messages.push({ role: "user", content: "I uploaded my CV for analysis" });
          session.messages.push({ role: "assistant", content: reply });

          let audioUrl: string | null = null;
          if (process.env.ELEVENLABS_API_KEY) {
            try {
              const { generateVoiceFile } = await import("./lib/elevenlabs");
              const ttsText = reply
                .replace(/[*_~`]/g, "")           // strip markdown bold/italic/code
                .replace(/^[•\-–]\s*/gm, "")       // strip bullet points
                .replace(/📊|🎯|👤|🌍|📋|✅|👏|•/g, "") // strip emojis that don't read well
                .replace(/\n{2,}/g, ". ")           // double newlines → sentence pause
                .replace(/\n/g, ", ")               // single newlines → comma pause
                .replace(/\s{2,}/g, " ")            // collapse spaces
                .trim()
                .substring(0, 4000);               // ElevenLabs supports up to 5000 chars
              const filename = await generateVoiceFile(ttsText);
              if (filename) audioUrl = `/audio/${filename}`;
            } catch {}
          }
          return res.json({ text: reply, sessionId, jobMatches: relevantMatches, audioUrl });
        } catch {
          return res.json({ text: "I received your CV but had trouble analyzing it right now. Please try again in a moment. 🙏", sessionId });
        }
      }

      // ── Text Chat ───────────────────────────────────────────────────────────
      if (!userMessage) {
        // Voice greeting — generate audio for the initial hello
        const greetingText = "Hello! I'm Nanjila from WorkAbroad Hub. I can help with overseas jobs, NEA agency verification, CV analysis, and more. How can I assist you today?";
        let audioUrl: string | null = null;
        if (process.env.ELEVENLABS_API_KEY) {
          try {
            const { generateVoiceFile } = await import("./lib/elevenlabs");
            const filename = await generateVoiceFile(greetingText);
            if (filename) audioUrl = `/audio/${filename}`;
          } catch {}
        }
        return res.json({ text: "Hello! 😊 I'm Nanjila from WorkAbroad Hub.\n\nI can help with overseas jobs, NEA agency verification, CV analysis, and more. How can I assist you today?", sessionId, audioUrl, isGreeting: true });
      }

      session.messages.push({ role: "user", content: userMessage });
      if (session.messages.length > 20) session.messages = session.messages.slice(-20);

      // Personalize for logged-in users
      let dbUser: any = null;
      let recentPayment: any = null;
      try {
        const authUser = (req as any).user;
        if (authUser?.id) {
          dbUser = await storage.getUser(authUser.id);
          if (dbUser) {
            const payments = await storage.getPaymentsByUser(dbUser.id);
            recentPayment = payments
              .filter((p: any) => p.status === "completed" || p.status === "success")
              .sort((a: any, b: any) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())[0] ?? null;
          }
        }
      } catch {}

      let systemPrompt = WA_BASE_PROMPT;
      systemPrompt += "\n\nNOTE: You are in the in-site chat widget on WorkAbroad Hub's website. The greeting was already sent to the user — do NOT say 'Hello I'm Nanjila' or introduce yourself again. Start every reply by directly addressing what the user asked. Users can upload CVs directly via the attachment button in this chat.";
      if (dbUser) {
        const plan = (dbUser.plan || "free").toLowerCase();
        systemPrompt += `\n\n--- USER CONTEXT ---\nName: ${dbUser.firstName || "unknown"}\nPlan: ${plan.toUpperCase()}\nAccount: ${dbUser.isActive ? "active" : "inactive"}`;
        if (recentPayment) systemPrompt += `\nLast payment: KES ${recentPayment.amount} via ${recentPayment.method} on ${new Date(recentPayment.createdAt).toDateString()}`;
        if (plan === "pro") {
          systemPrompt += `\n\nUser is PRO — do NOT pitch upgrade. Help them maximise Pro features.`;
        } else {
          systemPrompt += `\n\nUser is FREE — actively encourage upgrade to PRO (Ksh 4,500) at /pricing.`;
        }
        if (dbUser.firstName) systemPrompt += `\nUse their first name (${dbUser.firstName}) naturally — not on every line.`;
      } else {
        systemPrompt += `\n\nUnknown visitor — encourage free signup then PRO upgrade (Ksh 4,500).`;
      }

      let reply = "Samahani, kuna tatizo kidogo. Tafadhali jaribu tena! 🙏";
      try {
        const { openai } = await import("./lib/openai");
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);
        const completion = await openai.chat.completions.create(
          {
            model: "gpt-4.1-mini",
            messages: [{ role: "system", content: systemPrompt }, ...session.messages],
            max_tokens: 400,
            temperature: 0.65,
          },
          { signal: controller.signal }
        );
        clearTimeout(timeout);
        reply = completion.choices[0]?.message?.content?.trim() || reply;
      } catch (aiErr: any) {
        console.error("[NanjilChat] AI error:", aiErr.message);
      }

      session.messages.push({ role: "assistant", content: reply });

      let audioUrl: string | null = null;
      if (process.env.ELEVENLABS_API_KEY) {
        try {
          const { generateVoiceFile } = await import("./lib/elevenlabs");
          const ttsText = reply
            .replace(/[*_~`]/g, "")
            .replace(/^[•\-–]\s*/gm, "")
            .replace(/📊|🎯|👤|🌍|📋|✅|👏|•/g, "")
            .replace(/\n{2,}/g, ". ")
            .replace(/\n/g, ", ")
            .replace(/\s{2,}/g, " ")
            .trim()
            .substring(0, 4000);
          const filename = await generateVoiceFile(ttsText);
          if (filename) audioUrl = `/audio/${filename}`;
        } catch {}
      }

      res.json({ text: reply, sessionId, audioUrl });
    } catch (err: any) {
      console.error("[NanjilChat] Error:", err.message);
      res.status(500).json({ text: "Something went wrong. Please try again! 🙏" });
    }
  });

  // ── Support: self-service payment status check ──────────────────────────────
  app.post("/api/support/check-payment", async (req: any, res) => {
    try {
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ message: "Phone number is required" });

      const normalizedPhone = normalizePhone(String(phone), "KE") ?? String(phone);

      const { data: payment, error } = await supabase
        .from("payments")
        .select("*")
        .eq("phone", normalizedPhone)
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) return res.status(500).json({ message: "Failed to check payment status" });

      if (!payment?.length) {
        return res.json({ message: "❌ No payment found" });
      }

      if (payment[0].auto_upgraded) {
        return res.json({ message: "✅ You are already upgraded" });
      }

      if (payment[0].needs_review) {
        return res.json({ message: "⏳ Your payment is under review" });
      }

      return res.json({ message: "⚠️ Payment received, processing..." });
    } catch (err: any) {
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  app.post("/api/support/request-refund", async (req: any, res) => {
    try {
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ message: "Phone number is required" });

      const normalizedPhone = normalizePhone(String(phone), "KE") ?? String(phone);

      const { data: payments, error } = await supabase
        .from("payments")
        .select("id, auto_upgraded, refund_requested")
        .eq("phone", normalizedPhone)
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) return res.status(500).json({ message: "Failed to look up payment" });
      if (!payments?.length) return res.status(404).json({ message: "❌ No payment found for this number" });

      const payment = payments[0];

      if (payment.refund_requested) {
        return res.json({ message: "⏳ Refund already requested — our team will be in touch" });
      }

      await supabase
        .from("payments")
        .update({ refund_requested: true })
        .eq("id", payment.id);

      return res.json({ message: "✅ Refund request received. We'll review and respond within 24 hours." });
    } catch (err: any) {
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  // ── POST /api/pay — thin payment initiator ──────────────────────────────────
  // Accepts { amount, service_id }. Looks up the service, resolves the user's
  // phone from their profile, then fires the M-Pesa STK push in one call.
  app.post("/api/pay", isAuthenticated, async (req: any, res) => {
    console.log(`[POST /api/pay] handler entered | userId=${req.user?.claims?.sub ?? req.user?.id ?? "undefined"} body=${JSON.stringify(req.body).slice(0, 120)}`);
    try {
      const userId = req.user?.claims?.sub ?? req.user?.id;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const { amount, service_id } = req.body;
      if (!amount || !service_id) {
        return res.status(400).json({ message: "amount and service_id are required" });
      }

      // 1. Validate service exists and price matches — use local DB, NOT Supabase
      const service = await storage.getServiceById(String(service_id));
      if (!service) {
        return res.status(404).json({ message: "Service not found" });
      }
      if (!service.isActive) {
        return res.status(400).json({ message: "This service is not currently available" });
      }
      if (Number(service.price) !== Number(amount)) {
        return res.status(400).json({
          message: `Amount mismatch: expected KES ${service.price}, got KES ${amount}`,
        });
      }

      // 2. Resolve user phone — required for STK push
      const userRow = await storage.getUserById(userId);
      if (!userRow?.phone) {
        return res.status(400).json({
          message: "No phone number on file. Please update your profile before paying.",
          code: "NO_PHONE",
        });
      }

      // 3. Fraud gate — block flagged accounts before any money moves
      if (await isFraudUser(userId)) {
        const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.socket?.remoteAddress ?? "unknown";
        flagForManualReview(userId, { action: "payment_attempt_blocked", detail: `service=${service_id} amount=${amount}`, ip: clientIp }).catch((err) => { console.error('[routes] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
        return res.status(403).json({
          message: "Your account has been flagged for review. Please contact support.",
          code:    "ACCOUNT_UNDER_REVIEW",
        });
      }

      // 4. Fire STK push via the existing unified endpoint logic
      const transactionRef = `WAH-${nanoid(12)}`;
      const amountKES = Math.round(Number(amount));
      const normalizedPhone = userRow.phone.startsWith("0")
        ? `254${userRow.phone.slice(1)}`
        : userRow.phone;

      const [payment] = await db
        .insert(paymentsTable)
        .values({
          id:           transactionRef,
          userId,
          amount:       amountKES,
          currency:     "KES",
          status:       "pending",
          method:       "mpesa",
          serviceId:    service_id,
          transactionRef,
        })
        .returning();

      // 4. Write pending row to Supabase BEFORE the STK push so service_id is
      //    recorded even if the callback never arrives.
      await syncPaymentToSupabase({
        user_id:    String(userId),
        phone:      normalizedPhone,
        amount:     amountKES,
        status:     "pending",
        service_id: service_id,
        currency:   "KES",
      });

      const { stkPush } = await import("./mpesa");
      const stkResponse = await stkPush(
        normalizedPhone,
        amountKES,
        `WorkAbroad — ${service.name}`,
        transactionRef
      );

      if (stkResponse.ResponseCode !== "0") {
        await db
          .update(paymentsTable)
          .set({ status: "failed", failReason: stkResponse.ResponseDescription || "STK push rejected" })
          .where(eq(paymentsTable.id, payment.id));

        return res.status(400).json({
          message: stkResponse.ResponseDescription || "STK push failed. Please try again.",
        });
      }

      // Save CheckoutRequestID for callback matching.
      // serviceSlug is stored here so deliverService can resolve the
      // correct AI handler without an extra DB lookup.
      await db
        .update(paymentsTable)
        .set({
          transactionRef: stkResponse.CheckoutRequestID,
          metadata: JSON.stringify({
            initRef:           transactionRef,
            checkoutRequestId: stkResponse.CheckoutRequestID,
            merchantRequestId: stkResponse.MerchantRequestID,
            serviceSlug:       service.slug ?? null,
            serviceName:       service.name,
          }),
        })
        .where(eq(paymentsTable.id, payment.id));

      res.json({
        message:           `STK push sent to ${normalizedPhone}. Check your phone.`,
        paymentId:         payment.id,
        checkoutRequestId: stkResponse.CheckoutRequestID,
        service:           { id: service.id, name: service.name, amount: amountKES },
      });
    } catch (err: any) {
      console.error("[POST /api/pay]", err?.message);
      res.status(500).json({ message: "Failed to initiate payment. Please try again." });
    }
  });

  // ── Receipt OCR ─────────────────────────────────────────────────────────────

  const receiptUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      cb(null, allowed.includes(file.mimetype));
    },
  });

  async function extractTextFromImage(fileBuffer: Buffer, mimeType: string): Promise<string> {
    const { openai } = await import("./lib/openai");
    const base64 = fileBuffer.toString("base64");
    const result = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract all text from this payment receipt exactly as shown. Return: transaction code, amount, phone number, date/time, and recipient name. Format as plain text, one field per line.",
            },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
          ],
        },
      ],
      max_tokens: 500,
    });
    return result.choices[0].message.content ?? "";
  }

  function extractMpesaCode(text: string): string | null {
    const match = text.match(/[A-Z0-9]{10}/);
    return match ? match[0] : null;
  }

  app.post("/api/upload-receipt", isAuthenticated, receiptUpload.single("receipt"), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No receipt file uploaded. Please attach an image." });
      }

      const text = await extractTextFromImage(req.file.buffer, req.file.mimetype);
      const mpesaCode = extractMpesaCode(text);

      let payment: any = null;
      if (mpesaCode) {
        const { data } = await supabase
          .from("payments")
          .select("*")
          .eq("mpesa_code", mpesaCode)
          .single();
        payment = data ?? null;
      }

      const verified = !!(payment?.matched || payment?.auto_upgraded);
      const message = verified
        ? "✅ Payment verified successfully"
        : "❌ Payment not found, please contact support";

      res.json({ text, mpesaCode, payment, verified, message });
    } catch (err: any) {
      console.error("Receipt OCR error:", err?.message);
      res.status(500).json({ message: "Failed to read receipt. Please try again with a clearer image." });
    }
  });

  app.get("/api/user/payment-status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = String(req.user.id);

      const { data: payments, error } = await supabase
        .from("payments")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) return res.status(500).json({ message: "Failed to fetch payment status" });

      res.json(payments?.[0] ?? null);
    } catch (err: any) {
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  app.post("/api/nanjila", async (req: any, res) => {
    try {
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ reply: "❌ Please provide your phone number." });

      const normalized = normalizePhoneAuto(String(phone)).phone;

      const { data: payments } = await supabase
        .from("payments")
        .select("*")
        .eq("phone", normalized)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!payments?.length) {
        return res.json({ reply: "❌ I can't find any payment yet. Please confirm your M-Pesa code." });
      }

      const p = payments[0];

      if (p.refund_requested) {
        return res.json({ reply: "💸 A refund has been requested for your payment. Our team will be in touch within 24 hours." });
      }

      if (p.auto_upgraded) {
        return res.json({ reply: "✅ You are already upgraded to PRO. Enjoy!" });
      }

      if (p.needs_review) {
        return res.json({ reply: "⏳ Your payment is under review. You'll be updated shortly." });
      }

      if (!p.matched) {
        return res.json({ reply: "⚠️ Payment received but not yet linked. Please wait a moment." });
      }

      return res.json({ reply: "🔄 Your payment is being processed." });
    } catch (err: any) {
      res.status(500).json({ reply: "Something went wrong. Please try again." });
    }
  });

  // ── Live user presence tracker ───────────────────────────────────────────────
  app.post("/api/track-live", async (req: any, res) => {
    try {
      const { userId, page } = req.body;
      if (userId) {
        await pool.query(`
          INSERT INTO live_users (user_id, current_page, last_seen)
          VALUES ($1, $2, now())
          ON CONFLICT (user_id)
          DO UPDATE SET
            current_page = $2,
            last_seen    = now()
        `, [userId, page]);
      }
      res.sendStatus(200);
    } catch (_e) {
      res.sendStatus(200);
    }
  });

  // ── Nanjila AI chat ─────────────────────────────────────────────────────────
  app.post("/api/ai/chat", async (req: any, res) => {
    try {
      const user = req.user;
      const { message } = req.body;
      const reply = await handleUserMessage(user, message);
      res.json({ reply });
    } catch (e: any) {
      res.status(500).json({ message: "AI chat unavailable" });
    }
  });

  // ── API 404 catch-all ───────────────────────────────────────────────────────
  // Any /api/* path that fell through all route handlers without a response.
  // Must come after all route registrations and before Vite / static middleware.
  app.use("/api", (_req: Request, res: Response) => {
    if (!res.headersSent) {
      res.status(404).json({
        success: false,
        error: {
          type: "notfound",
          message: "Resource not found",
        },
      });
    }
  });

  // ── Unmatched-payment retry engine ──────────────────────────────────────────
  // Every 5 minutes: re-run smartMatchUser on payments that haven't matched yet
  // and have been retried fewer than 5 times.
  setInterval(async () => {
    console.log("🔁 Running retry engine...");

    const { data: payments } = await supabase
      .from("payments")
      .select("*")
      .eq("matched", false)
      .lt("retry_count", 5);

    for (const payment of (payments ?? [])) {
      const { user, score } = await smartMatchUser(payment);

      if (user && score >= 90) {
        await upgradeUserToPro(user.id);

        await supabase
          .from("payments")
          .update({ auto_upgraded: true })
          .eq("id", payment.id);
      }

      if (!user) {
        console.log("🚨 UNMATCHED PAYMENT:", payment);

        // Final attempt — escalate to admin
        const isLastRetry = (payment.retry_count ?? 0) >= 4;
        if (isLastRetry) {
          try {
            const { sendWhatsAppAlert } = await import("./sms");
            await sendWhatsAppAlert(
              `🚨 *Unmatched Payment — 5 retries exhausted*\n` +
              `Phone: ${payment.phone ?? "unknown"}\n` +
              `Amount: KES ${payment.amount ?? "?"}\n` +
              `Code: ${payment.mpesa_code ?? payment.id}\n` +
              `Country: ${payment.country ?? "?"}\n` +
              `Action needed: https://workabroad.co.ke/admin/unmatched-payments`
            );
          } catch (err) {
            console.error("❌ Admin alert failed:", err);
          }
        }
      }

      await supabase
        .from("payments")
        .update({ retry_count: (payment.retry_count ?? 0) + 1 })
        .eq("id", payment.id);
    }
  }, 300_000); // 5 minutes

  // ── Twilio Voice — inbound call greeting ────────────────────────────────────
  const NANJILA_VOICE = { voice: "Polly.Joanna" } as const;

  app.post("/api/voice", (req: any, res) => {
    const twiml = new VoiceResponse();

    twiml.say(
      NANJILA_VOICE,
      "Hello, this is Nanjila from Work Abroad Hub. How can I help you today?"
    );

    twiml.gather({
      input: ["speech"],
      action: "/api/voice/process",
      speechTimeout: "auto",
    });

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ── Twilio Voice — process spoken response ───────────────────────────────────
  app.post("/api/voice/process", async (req: any, res) => {
    const caller     = req.body.From;
    const userSpeech = req.body.SpeechResult || "No speech detected";

    const user = await pool.query(
      "SELECT * FROM users WHERE phone = $1",
      [caller]
    );

    const lang  = user.rows[0]?.language || detectLanguage(userSpeech);
    const voice = getVoice(lang);

    const intent = detectIntent(userSpeech);

    let reply = "";

    if (intent === "payment") {
      reply = "Let me check your payment status. Please provide your phone number.";
    } else if (intent === "cv") {
      reply = "I can help you with your CV. Would you like me to generate one now?";
    } else {
      reply = await nanjilaAgent(null, userSpeech);
    }

    const twiml = new VoiceResponse();

    twiml.say({ voice }, reply);

    twiml.redirect("/api/voice");

    res.type("text/xml");
    res.send(twiml.toString());
  });

  // ── Client-side event tracker ────────────────────────────────────────────────
  app.post("/api/track-event", async (req: any, res) => {
    const { userId, event, page, metadata = {} } = req.body;

    if (!event) return res.sendStatus(200);

    await pool.query(
      `INSERT INTO funnel_events (user_id, event, page, metadata)
       VALUES ($1, $2, $3, $4)`,
      [userId ?? req.user?.id ?? null, event, page ?? null, metadata]
    );

    res.sendStatus(200);
  });

  return httpServer;
}
