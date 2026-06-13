// ─────────────────────────────────────────────────────────────────────────────
// Community chat — real-time, moderated, country-scoped rooms.
//
// FOUNDER ASK (verbatim):
//   "real users in real time can chat... about jobs, CVs and stuff like that.
//    No numbers, no emails or something, just chatting. We don't allow
//    exchange of numbers or emails... From my end I can see which user is
//    under that, I can see their profiles."
//
// DESIGN:
//   - 8 rooms: General + UAE + Saudi + UK + USA + Canada + Australia + Europe.
//   - Posting eligibility:
//       * Pro/Monthly/Trial users → UNLIMITED posts.
//       * Free users who have referred ≥1 paying friend → 3 posts per day.
//       * Everyone else → read-only.
//   - PII auto-filter on every send: phone numbers (KE + intl), email
//     addresses, M-Pesa Paybill/Till numbers. Replaced with [removed].
//     Messages with >2 strips are auto-hidden (scam signal) and queued
//     for admin review.
//   - Real-time delivery via Socket.IO room namespaces.
//   - Admin can see every message + user profile + delete + ban.
//
// SCHEMA (idempotent CREATE TABLE IF NOT EXISTS):
//   chat_rooms          — static catalogue of 8 rooms
//   chat_messages       — every message ever posted (including hidden)
//   chat_post_quota     — per-user daily quota tracking for free posters
// ─────────────────────────────────────────────────────────────────────────────

import { pool } from "../db";
import { storage } from "../storage";

// ─── Rooms catalogue ─────────────────────────────────────────────────────────

export const ROOMS = [
  { slug: "general",   name: "General",    flag: "🌍", description: "Anything about jobs abroad." },
  { slug: "uae",       name: "UAE",        flag: "🇦🇪", description: "Dubai, Abu Dhabi, Sharjah." },
  { slug: "saudi",     name: "Saudi",      flag: "🇸🇦", description: "Riyadh, Jeddah, Dammam." },
  { slug: "uk",        name: "UK",         flag: "🇬🇧", description: "NHS, Health & Care Worker visa." },
  { slug: "usa",       name: "USA",        flag: "🇺🇸", description: "H-1B, EB-3, Green Card lottery." },
  { slug: "canada",    name: "Canada",     flag: "🇨🇦", description: "Express Entry, PNP, LMIA." },
  { slug: "australia", name: "Australia",  flag: "🇦🇺", description: "Skilled migration, NAATI, healthcare." },
  { slug: "europe",    name: "Europe",     flag: "🇪🇺", description: "Schengen, Germany blue card." },
] as const;

export type RoomSlug = (typeof ROOMS)[number]["slug"];

export function isValidRoomSlug(s: string): s is RoomSlug {
  return ROOMS.some((r) => r.slug === s);
}

// ─── Schema setup ────────────────────────────────────────────────────────────

const SCHEMA_INIT = { done: false };

async function ensureSchema(): Promise<void> {
  if (SCHEMA_INIT.done) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_rooms (
        slug         VARCHAR(40) PRIMARY KEY,
        name         VARCHAR(120) NOT NULL,
        description  TEXT,
        message_count INTEGER NOT NULL DEFAULT 0,
        last_message_at TIMESTAMPTZ,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id            BIGSERIAL PRIMARY KEY,
        room_slug     VARCHAR(40) NOT NULL,
        user_id       VARCHAR(60) NOT NULL,
        body          TEXT NOT NULL,
        original_body TEXT NOT NULL,
        strip_count   INTEGER NOT NULL DEFAULT 0,
        hidden        BOOLEAN NOT NULL DEFAULT FALSE,
        hidden_reason VARCHAR(60),
        reported_count INTEGER NOT NULL DEFAULT 0,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at    TIMESTAMPTZ
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created
        ON chat_messages (room_slug, created_at DESC)
        WHERE deleted_at IS NULL;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_post_quota (
        user_id           VARCHAR(60) PRIMARY KEY,
        day_bucket        DATE NOT NULL,
        posts_today       INTEGER NOT NULL DEFAULT 0,
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Seed the static room catalogue (idempotent on PK).
    for (const r of ROOMS) {
      await pool.query(
        `INSERT INTO chat_rooms (slug, name, description) VALUES ($1, $2, $3)
           ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description`,
        [r.slug, r.name, r.description],
      );
    }

    SCHEMA_INIT.done = true;
  } catch (err: any) {
    console.error("[community] ensureSchema failed:", err?.message ?? err);
  }
}

// ─── PII filter ──────────────────────────────────────────────────────────────
//
// Strips:
//   1. Phone numbers — Kenya (+254, 254, 07XX, 01XX) + international (+N…)
//   2. Email addresses — anything matching local-part@domain.tld
//   3. M-Pesa Paybill / Till numbers — 5-7 digit numbers in payment context
//      ("paybill 123456", "till 987654", "buy goods 12345").
//
// Returns { sanitized, stripCount } so the caller can decide whether to
// hide a high-strip message (scam signal).

const PHONE_REGEX = /(\+?254\s?[17]\d{2}\s?\d{3}\s?\d{3})|(\b0[17]\d{2}\s?\d{3}\s?\d{3}\b)|(\+\d{1,3}\s?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4})/g;
const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const MPESA_REGEX = /\b(?:paybill|till|buy\s*goods|account)[\s#:]*\d{4,7}\b|\b\d{5,7}\s*(?:paybill|till)\b/gi;

export function sanitize(body: string): { sanitized: string; stripCount: number } {
  let stripCount = 0;
  let out = body;

  out = out.replace(PHONE_REGEX, () => { stripCount++; return "[phone removed]"; });
  out = out.replace(EMAIL_REGEX, () => { stripCount++; return "[email removed]"; });
  out = out.replace(MPESA_REGEX, () => { stripCount++; return "[payment info removed]"; });

  return { sanitized: out, stripCount };
}

// ─── Posting eligibility ─────────────────────────────────────────────────────
//
// Returns:
//   - canPost: true if message can go through
//   - reason: short identifier when canPost is false
//   - quotaRemaining: posts left today for free users with quota
//   - tier: "pro" | "referrer" | "none"

export interface PostEligibility {
  canPost: boolean;
  reason?: "not_signed_in" | "no_quota" | "rate_limited";
  quotaRemaining?: number;
  tier: "pro" | "referrer" | "none";
}

const FREE_QUOTA_PER_DAY = 3;
const RATE_LIMIT_SECONDS = 8; // min gap between posts per user

// 2026-06: previously allowlisted only ["pro", "monthly", "trial"] which
// silently denied posting to YEARLY (KES 4,500) subscribers, pro_referral
// users, and — critically — admins. Now matches the unified PAID_TIERS set
// used in server/visa-jobs-routes.ts and requireAnyPaidPlan middleware, and
// adds an explicit admin bypass so support staff can always moderate.
const PAID_TIERS = new Set(["trial", "basic", "monthly", "yearly", "pro", "pro_referral"]);

async function isPaidTier(userId: string): Promise<boolean> {
  try {
    // Admin bypass — admins always count as paid for posting purposes
    const { rows } = await pool.query<{ is_admin: boolean; role: string }>(
      `SELECT is_admin, role FROM users WHERE id = $1`,
      [userId],
    );
    const u = rows[0];
    if (u && (u.is_admin === true || u.role === "ADMIN" || u.role === "SUPER_ADMIN")) {
      return true;
    }
    // Fresh plan check (does end_date expiration enforcement)
    const userPlan = await storage.getUserPlan?.(userId);
    const planId = typeof userPlan === "string" ? userPlan : (userPlan as any)?.planId;
    return !!planId && PAID_TIERS.has(planId);
  } catch {
    return false;
  }
}

async function hasReferredPayingFriend(userId: string): Promise<boolean> {
  try {
    // Check the referrals table for any row matching this user with status =
    // 'paid' or any post-payment status. We use a permissive query so the
    // referee can be in any non-pending state.
    const refCode = `WAH${userId.substring(0, 6).toUpperCase()}`;
    const { rows } = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM referrals
         WHERE ref_code = $1 AND status IN ('paid','processing','completed','sent')`,
      [refCode],
    );
    return Number(rows[0]?.cnt ?? 0) > 0;
  } catch {
    return false;
  }
}

async function getOrInitQuota(userId: string): Promise<number> {
  await ensureSchema();
  const today = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD
  const { rows } = await pool.query<{ posts_today: number; day_bucket: string }>(
    `SELECT posts_today, day_bucket::text FROM chat_post_quota WHERE user_id = $1`,
    [userId],
  );
  if (!rows.length || rows[0].day_bucket !== today) {
    // Either no row, or it's a stale bucket — reset.
    await pool.query(
      `INSERT INTO chat_post_quota (user_id, day_bucket, posts_today)
         VALUES ($1, $2::date, 0)
       ON CONFLICT (user_id) DO UPDATE SET day_bucket = EXCLUDED.day_bucket, posts_today = 0, updated_at = NOW()`,
      [userId, today],
    );
    return 0;
  }
  return rows[0].posts_today;
}

async function bumpQuota(userId: string): Promise<void> {
  await pool.query(
    `UPDATE chat_post_quota SET posts_today = posts_today + 1, updated_at = NOW() WHERE user_id = $1`,
    [userId],
  );
}

const lastPostAt = new Map<string, number>(); // userId -> epoch ms

export async function checkEligibility(userId: string | undefined): Promise<PostEligibility> {
  if (!userId) return { canPost: false, reason: "not_signed_in", tier: "none" };

  // Rate limit — applies regardless of tier (anti-spam).
  const last = lastPostAt.get(userId);
  if (last && Date.now() - last < RATE_LIMIT_SECONDS * 1000) {
    return { canPost: false, reason: "rate_limited", tier: "none" };
  }

  // Pro tier — unlimited.
  if (await isPaidTier(userId)) {
    return { canPost: true, tier: "pro" };
  }

  // Free + referred at least one paying friend — quota allowed.
  if (await hasReferredPayingFriend(userId)) {
    const used = await getOrInitQuota(userId);
    if (used < FREE_QUOTA_PER_DAY) {
      return { canPost: true, tier: "referrer", quotaRemaining: FREE_QUOTA_PER_DAY - used };
    }
    return { canPost: false, reason: "no_quota", tier: "referrer", quotaRemaining: 0 };
  }

  return { canPost: false, reason: "no_quota", tier: "none" };
}

// ─── Message CRUD ────────────────────────────────────────────────────────────

export interface PostedMessage {
  id: number;
  roomSlug: string;
  userId: string;
  body: string;
  originalBody: string;
  stripCount: number;
  hidden: boolean;
  hiddenReason: string | null;
  reportedCount: number;
  createdAt: string;
  // 2026-06: client renders avatar initial-circle + first name above
  // the message bubble. Falls back to "Friend" if the user has no
  // firstName on file. Never returns email/phone — privacy.
  firstName: string | null;
}

export async function postMessage(
  userId: string,
  roomSlug: string,
  rawBody: string,
): Promise<PostedMessage> {
  await ensureSchema();
  if (!isValidRoomSlug(roomSlug)) {
    throw new Error("invalid_room");
  }
  const trimmed = rawBody.trim().slice(0, 800);
  if (trimmed.length < 2) {
    throw new Error("empty_message");
  }

  const { sanitized, stripCount } = sanitize(trimmed);
  const hidden = stripCount >= 3;
  const hiddenReason = hidden ? "pii_overload" : null;

  // 2026-06: log INSERT failures explicitly with the param shape so we
  // can diagnose schema drift / FK violations / pool exhaustion etc.
  let rows: Array<{ id: number; created_at: string }>;
  try {
    const result = await pool.query<{ id: number; created_at: string }>(
      `INSERT INTO chat_messages
         (room_slug, user_id, body, original_body, strip_count, hidden, hidden_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at`,
      [roomSlug, userId, sanitized, trimmed, stripCount, hidden, hiddenReason],
    );
    rows = result.rows;
  } catch (dbErr: any) {
    console.error(
      `[community] chat_messages INSERT failed for userId=${userId} slug=${roomSlug} bodyLen=${trimmed.length}:`,
      dbErr?.code, dbErr?.message,
      dbErr?.detail ? `detail=${dbErr.detail}` : "",
    );
    throw new Error("db_insert_failed");
  }

  // Stamp the room stats — best-effort.
  pool.query(
    `UPDATE chat_rooms SET message_count = message_count + 1, last_message_at = NOW() WHERE slug = $1`,
    [roomSlug],
  ).catch(() => {});

  lastPostAt.set(userId, Date.now());
  bumpQuota(userId).catch(() => {});

  // Look up firstName for the avatar — best-effort, never throws.
  let firstName: string | null = null;
  try {
    const userResult = await pool.query<{ first_name: string | null }>(
      `SELECT first_name FROM users WHERE id = $1`,
      [userId],
    );
    firstName = userResult.rows[0]?.first_name ?? null;
  } catch { /* fall through with firstName = null */ }

  return {
    id: rows[0].id,
    roomSlug,
    userId,
    firstName,
    body: sanitized,
    originalBody: trimmed,
    stripCount,
    hidden,
    hiddenReason,
    reportedCount: 0,
    createdAt: rows[0].created_at,
  };
}

export async function fetchMessages(
  roomSlug: string,
  limit = 50,
  beforeId?: number,
): Promise<PostedMessage[]> {
  await ensureSchema();
  if (!isValidRoomSlug(roomSlug)) throw new Error("invalid_room");
  const args: any[] = [roomSlug, Math.min(100, Math.max(1, limit))];
  let beforeClause = "";
  if (beforeId && Number.isFinite(beforeId)) {
    beforeClause = ` AND id < $3`;
    args.push(beforeId);
  }
  const { rows } = await pool.query(
    `SELECT id, room_slug, user_id, body, original_body, strip_count, hidden,
            hidden_reason, reported_count, created_at
       FROM chat_messages
      WHERE room_slug = $1 AND deleted_at IS NULL AND hidden = FALSE ${beforeClause}
      ORDER BY id DESC
      LIMIT $2`,
    args,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    roomSlug: r.room_slug,
    userId: r.user_id,
    firstName: r.first_name ?? null,
    body: r.body,
    originalBody: r.original_body,
    stripCount: r.strip_count,
    hidden: r.hidden,
    hiddenReason: r.hidden_reason,
    reportedCount: r.reported_count,
    createdAt: typeof r.created_at === "string" ? r.created_at : r.created_at.toISOString(),
  })).reverse();
}

export async function reportMessage(messageId: number): Promise<void> {
  await ensureSchema();
  await pool.query(
    `UPDATE chat_messages SET reported_count = reported_count + 1,
       hidden = CASE WHEN reported_count + 1 >= 3 THEN TRUE ELSE hidden END,
       hidden_reason = CASE WHEN reported_count + 1 >= 3 THEN 'reported' ELSE hidden_reason END
     WHERE id = $1`,
    [messageId],
  );
}

export async function adminDeleteMessage(messageId: number, reason = "admin_delete"): Promise<void> {
  await ensureSchema();
  await pool.query(
    `UPDATE chat_messages SET deleted_at = NOW(), hidden = TRUE, hidden_reason = $2 WHERE id = $1`,
    [messageId, reason],
  );
}

export async function fetchRoomsSummary(): Promise<Array<{ slug: string; name: string; flag: string; description: string; messageCount: number; lastMessageAt: string | null }>> {
  await ensureSchema();
  const { rows } = await pool.query<{ slug: string; message_count: number; last_message_at: Date | null }>(
    `SELECT slug, message_count, last_message_at FROM chat_rooms`,
  );
  const map = new Map(rows.map((r) => [r.slug, r]));
  return ROOMS.map((r) => {
    const row = map.get(r.slug);
    return {
      slug: r.slug,
      name: r.name,
      flag: r.flag,
      description: r.description,
      messageCount: row?.message_count ?? 0,
      lastMessageAt: row?.last_message_at ? new Date(row.last_message_at).toISOString() : null,
    };
  });
}

// ─── Admin: fetch with user profile join ─────────────────────────────────────

export async function adminFetchRecent(limit = 100): Promise<Array<PostedMessage & { userName: string | null; userEmail: string | null }>> {
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT m.id, m.room_slug, m.user_id, m.body, m.original_body, m.strip_count,
            m.hidden, m.hidden_reason, m.reported_count, m.created_at,
            u.first_name, u.last_name, u.email
       FROM chat_messages m
       LEFT JOIN users u ON u.id = m.user_id
      WHERE m.deleted_at IS NULL
      ORDER BY m.id DESC
      LIMIT $1`,
    [Math.min(500, Math.max(1, limit))],
  );
  return rows.map((r: any) => ({
    id: Number(r.id),
    roomSlug: r.room_slug,
    userId: r.user_id,
    body: r.body,
    originalBody: r.original_body,
    stripCount: r.strip_count,
    hidden: r.hidden,
    hiddenReason: r.hidden_reason,
    reportedCount: r.reported_count,
    createdAt: typeof r.created_at === "string" ? r.created_at : r.created_at.toISOString(),
    userName: [r.first_name, r.last_name].filter(Boolean).join(" ") || null,
    