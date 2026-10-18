import type { Express, Request, Response } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../../db";
import { users } from "@shared/models/auth";
import { sendEmail } from "../../email";
import { validateEmail } from "../../utils/email-validator";
import { validatePhone } from "../../utils/phone-validator";
import {
  getCachedAuthUser,
  setCachedAuthUser,
  invalidateAuthUserCache,
  clearAllAuthUserCache,
} from "../../lib/auth-user-cache";
import {
  sendEmailVerificationCode,
  sendSmsVerificationCode,
  verifyCode,
} from "../../services/identityVerification";
import {
  recordPwaEvent,
  getPwaStatus,
  type PwaEventType,
} from "../../services/pwaInstallTracking";

// Email + password auth routes (replaces the disabled stub).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function appBaseUrl(): string {
  const explicit = (process.env.APP_URL || "").trim().replace(/\/+$/, "");
  if (explicit) return explicit;
  // Production fallback when APP_URL is not configured — used for password
  // reset email links etc. Set APP_URL in Render → Environment for new hosts.
  return "https://workabroadhub.tech";
}

function setSessionUserId(req: Request, userId: string): Promise<void> {
  return new Promise((resolve) => {
    (req.session as any).customUserId = userId;
    if (typeof req.session?.save === "function") {
      req.session.save(() => resolve());
    } else {
      resolve();
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────
// 2026-10 (Tony: "sign up is everything" — ~50% of login attempts were
// failing and 312/370 forgot-password requests in 7 days were for emails
// with NO account, who were silently told "a link has been sent").
// Shared helpers for: email-OR-phone sign-in, honest "no account" answers
// with a one-tap create path + "did you sign up with j•••@yahoo.com?" hint,
// passwordless sign-in codes, and an auth_login_events funnel log so a
// spike in failures is visible immediately.
// ─────────────────────────────────────────────────────────────────────────

type AuthEvent =
  | "password_ok" | "wrong_password" | "no_account" | "unverified" | "locked"
  | "deleted" | "code_sent" | "code_ok" | "code_wrong" | "reset_no_account" | "reset_sent"
  | "verify_ok" | "email_changed";

function clientIpOf(req: Request): string {
  return String(req.headers["x-forwarded-for"] || req.ip || "unknown").split(",")[0].trim().slice(0, 60);
}

function logAuthEvent(req: Request, event: AuthEvent, kind: "email" | "phone" | "invalid" | null, userId: string | null) {
  pool.query(
    `INSERT INTO auth_login_events (event, identifier_kind, user_id, ip) VALUES ($1, $2, $3, $4)`,
    [event, kind, userId, clientIpOf(req)],
  ).catch(() => { /* telemetry must never break auth */ });
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const keep = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${keep}${"•".repeat(Math.max(3, local.length - keep.length))}@${domain}`;
}

type LoginUserRow = {
  id: string;
  email: string;
  password_hash: string | null;
  is_active: boolean | null;
  email_verified: boolean | null;
  first_name: string | null;
};

/**
 * Resolve "email or phone" typed into the sign-in box to a user.
 * Phone matching uses the last 9 digits — the exact same expression as the
 * uniq_users_phone_normalized index — so 0712…, 712…, 254712… and +254712…
 * all find the same account regardless of which format it was stored in.
 */
async function resolveLoginIdentifier(rawInput: string): Promise<{
  kind: "email" | "phone" | "invalid";
  key: string;              // lockout / rate-limit key
  user: LoginUserRow | null;
}> {
  const raw = rawInput.trim().toLowerCase();
  if (raw.includes("@")) {
    const { rows } = await pool.query<LoginUserRow>(
      `SELECT id, email, password_hash, is_active, email_verified, first_name
         FROM users WHERE LOWER(email) = $1 LIMIT 1`,
      [raw],
    );
    return { kind: "email", key: raw, user: rows[0] ?? null };
  }
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 15) return { kind: "invalid", key: raw, user: null };
  const last9 = digits.slice(-9);
  const { rows } = await pool.query<LoginUserRow>(
    `SELECT id, email, password_hash, is_active, email_verified, first_name
       FROM users
      WHERE deleted_at IS NULL AND phone IS NOT NULL AND phone <> ''
        AND right(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 9) = $1
        AND right(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 9) <> ALL (ARRAY['712345678','704454609'])
      ORDER BY (is_active IS NOT FALSE) DESC, last_login DESC NULLS LAST
      LIMIT 1`,
    [last9],
  );
  return { kind: "phone", key: `phone:${last9}`, user: rows[0] ?? null };
}

/** "Did you sign up with jo•••@yahoo.com?" — same name part, other provider. */
async function similarAccountHint(email: string): Promise<string | null> {
  const local = email.split("@")[0];
  if (!local || local.length < 3) return null;
  try {
    const { rows } = await pool.query<{ email: string }>(
      `SELECT email FROM users
        WHERE split_part(LOWER(email), '@', 1) = $1 AND LOWER(email) <> $2
          AND is_active IS NOT FALSE
        ORDER BY last_login DESC NULLS LAST LIMIT 1`,
      [local, email],
    );
    return rows[0] ? maskEmail(rows[0].email.toLowerCase()) : null;
  } catch { return null; }
}

function noAccountPayload(identifierKind: "email" | "phone", typed: string, hint: string | null) {
  const what = identifierKind === "phone" ? "that phone number" : typed;
  return {
    noAccount: true,
    identifierKind,
    similarAccountHint: hint,
    message: hint
      ? `We couldn't find an account for ${what}. Did you sign up with ${hint}? Try that — or create a free account in 30 seconds.`
      : `There's no account for ${what} yet. Create your free account in 30 seconds — it's quick.`,
  };
}

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const rawEmail = String(req.body?.email ?? "").trim().toLowerCase();
      const password = String(req.body?.password ?? "");
      const firstName = req.body?.firstName ? String(req.body.firstName).trim() : null;
      const lastName  = req.body?.lastName  ? String(req.body.lastName).trim()  : null;
      // 2026-09 (Tony's referral audit): the client has always sent
      // `referral_code` (populated from localStorage on landing page /
      // shared invite links), but this handler ignored it — silently
      // dropping every referral. 11,215 users had codes to share; 0 of
      // them ever earned a commission because no signup was linked back.
      // Accept both snake_case (client convention) and camelCase.
      const rawReferralCode = String(
        req.body?.referral_code ?? req.body?.referralCode ?? "",
      ).trim().toUpperCase().slice(0, 32);

      // 2026-07 (pan-African phone): accept structured phone fields from the
      // new PhoneInput. Server re-validates using the canonical E.164 helper
      // so a tampered client can't slip in an invalid number.
      const { normalizeAndValidateE164 } = await import("../../lib/phone-e164");
      const phoneInput = {
        e164:        req.body?.phoneNumberE164 ? String(req.body.phoneNumberE164) : null,
        countryIso:  req.body?.countryIso      ? String(req.body.countryIso)      : null,
        national:    req.body?.nationalNumber  ? String(req.body.nationalNumber)  : null,
        raw:         req.body?.phone           ? String(req.body.phone)           : null,
      };
      const hasAnyPhone = !!(phoneInput.e164 || phoneInput.countryIso || phoneInput.national || phoneInput.raw);
      let phoneNormalized: any = null;
      if (hasAnyPhone) {
        phoneNormalized = normalizeAndValidateE164(phoneInput);
        if (!phoneNormalized.ok) {
          return res.status(400).json({ message: phoneNormalized.message, code: phoneNormalized.error });
        }
      }

      // Real-identity email validation (syntax → typo-check → disposable
      // → MX → suppression-list — all five layers; see email-validator.ts).
      const emailCheck = await validateEmail(rawEmail);
      if (emailCheck.valid === false) {
        // 2026-10 (Tony): include `suggestion` so the signup form can
        // offer a one-click "Did you mean grace@gmail.com?" fix for
        // typo'd provider domains.
        return res.status(400).json({
          message: emailCheck.message,
          reason: emailCheck.reason,
          suggestion: (emailCheck as any).suggestion,
        });
      }
      const cleanEmail = emailCheck.normalized;

      // 2026-09 (Tony's "make sure people use real names" mandate):
      // reject keyboard-mash, sentences ("i went home"), digits in names,
      // 4+ repeated letters, and names that just copy the email prefix.
      // Accepts multi-word African / European / Asian names with
      // apostrophes / hyphens / accented Latin characters — see the
      // validator for the full ruleset.
      const { validateFirstAndLastName } = await import("../../utils/name-validator");
      const nameCheck = validateFirstAndLastName(firstName, lastName, cleanEmail.split("@")[0]);
      if (!nameCheck.ok) {
        return res.status(400).json({
          message: nameCheck.message ?? "Please enter your real first and last name.",
          reason:  nameCheck.code,
        });
      }

      if (!password || password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters." });
      }

      const [existing] = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
      if (existing) {
        return res.status(409).json({
          message: "An account with that email already exists. Try signing in instead.",
          code: "EMAIL_TAKEN",
        });
      }

      // 2026-10 (Tony's duplicate-cleanup follow-up): check for a duplicate
      // phone using the SAME normalization as the DB unique index — last 9
      // digits of digit-stripped phone, matched against BOTH the legacy
      // `phone` column AND the newer `phone_number_e164`. Covers users who
      // typed the same number in different formats (0712..., 254712...,
      // +254712...). Returns a masked hint of the registered email so the
      // user knows which account to sign into.
      if (phoneNormalized?.ok) {
        try {
          const digitsOnly = phoneNormalized.e164.replace(/\D/g, "");
          const last9 = digitsOnly.slice(-9);
          // Skip the known-placeholder slot (people entering a fake number)
          // and Tony's admin pair.
          if (last9 && last9.length === 9 && last9 !== "712345678" && last9 !== "704454609") {
            const { rows } = await pool.query<{ id: string; email: string; email_verified: boolean | null; paid: boolean }>(
              `SELECT id, email, email_verified,
                      EXISTS (SELECT 1 FROM payments p WHERE p.user_id = users.id
                               AND p.status IN ('success','completed')) AS paid
                 FROM users
                WHERE deleted_at IS NULL
                  AND email NOT LIKE 'merged-%@merged.workabroadhub.local'
                  AND email NOT LIKE 'deleted-%@deleted.workabroadhub.local'
                  AND RIGHT(regexp_replace(COALESCE(phone,''), '[^0-9]', '', 'g'), 9) = $1
                LIMIT 1`,
              [last9],
            );
            let existingPhone = rows[0];
            // 2026-10 (Tony: stop auto-deleting unverified signups): the 72h
            // wipe used to free the phone of someone who typo'd their email.
            // Now we keep unverified accounts, so if the phone's only holder
            // is NEVER verified and NEVER paid, treat this signup as the same
            // person starting over: retire the stale record (soft — kept for
            // history) and let them through. Verified or paying accounts are
            // still protected by PHONE_TAKEN below.
            if (existingPhone && existingPhone.email_verified === false && !existingPhone.paid) {
              await pool.query(
                `UPDATE users
                    SET email = 'superseded-' || id || '@deleted.workabroadhub.local',
                        phone = NULL, phone_number_e164 = NULL,
                        is_active = false, deleted_at = NOW(), updated_at = NOW()
                  WHERE id = $1 AND email_verified = false`,
                [existingPhone.id],
              );
              console.log(`[Auth][register] superseded unverified account ${existingPhone.id} (${existingPhone.email}) — same phone re-registering as ${cleanEmail}`);
              existingPhone = undefined as any;
            }
            if (existingPhone) {
              // Mask the email → "d******i@gmail.com"
              const maskEmail = (e: string) => {
                const [local, domain] = e.split("@");
                if (!local || !domain) return e;
                const head = local.slice(0, 1);
                const tail = local.length > 1 ? local.slice(-1) : "";
                const stars = "*".repeat(Math.max(1, Math.min(8, local.length - 2)));
                return `${head}${stars}${tail}@${domain}`;
              };
              return res.status(409).json({
                message:
                  "That mobile number already has an account. Did you mean to sign in with " +
                  maskEmail(existingPhone.email) + "?",
                code:        "PHONE_TAKEN",
                maskedEmail: maskEmail(existingPhone.email),
                suggestSignIn: true,
              });
            }
          }
        } catch (dupErr: any) {
          console.warn("[Auth][register] phone dup check failed non-fatally:", dupErr?.message);
          // Fail OPEN — the DB unique index is the real guard; this is just
          // for a friendlier error message. If the check breaks we fall
          // through and the index will catch it with a 500 at insert time.
        }
      }

      // 2026-09 (Tony's referral audit): validate the referral code
      // BEFORE inserting the user. Guards:
      //   1. Code must exist on some other user's users.referral_code.
      //   2. That other user must not be this same email or phone (no
      //      self-referral via a second account).
      // If the code is invalid we DROP it silently — never fail signup
      // over a bad ref code.
      let validReferrerCode: string | null = null;
      if (rawReferralCode && /^[A-Z0-9-]{3,32}$/.test(rawReferralCode)) {
        try {
          const [referrerRow] = await db
            .select({
              id:              users.id,
              email:           users.email,
              phoneNumberE164: users.phoneNumberE164,
            })
            .from(users)
            .where(eq(users.referralCode, rawReferralCode))
            .limit(1);
          if (referrerRow) {
            const isSelfByEmail = referrerRow.email?.toLowerCase() === cleanEmail;
            const isSelfByPhone = phoneNormalized?.ok
              && !!referrerRow.phoneNumberE164
              && referrerRow.phoneNumberE164 === phoneNormalized.e164;
            if (isSelfByEmail || isSelfByPhone) {
              console.warn(
                `[Auth][register] self-referral blocked: newEmail=${cleanEmail} refCode=${rawReferralCode} refUserId=${referrerRow.id} reason=${isSelfByEmail ? "email" : "phone"}`,
              );
            } else {
              validReferrerCode = rawReferralCode;
            }
          } else {
            console.warn(`[Auth][register] unknown referral code, dropping: ${rawReferralCode}`);
          }
        } catch (err: any) {
          console.warn("[Auth][register] referral lookup failed (non-fatal):", err?.message);
        }
      }

      // 2026-06 PERF: bcrypt cost 10 (was 12). 10 = OWASP minimum + industry
      // standard. Cost 12 took ~500ms on Render Standard CPU; cost 10 is
      // ~120ms — 4× speedup. Existing cost-12 hashes still verify correctly
      // because bcrypt stores the cost in the hash itself.
      const passwordHash = await bcrypt.hash(password, 10);
      // 2026-10 (Tony's duplicate-cleanup follow-up): wrap the INSERT so a
      // race-condition unique-constraint violation (same phone registered
      // by two simultaneous signup attempts) comes back as a friendly 409
      // instead of a bare 500. The pre-check above handles the common case;
      // this is the defense-in-depth net for the race.
      let created: typeof users.$inferSelect | undefined;
      try {
        [created] = await db
          .insert(users)
          .values({
            email: cleanEmail,
            passwordHash,
            authMethod: "email",
            firstName,
            lastName,
            // Structured phone fields (populated when the user provided a valid one)
            ...(phoneNormalized?.ok ? {
              phone:           phoneNormalized.e164,             // legacy column, keep in sync
              phoneNumberE164: phoneNormalized.e164,
              countryIso:      phoneNormalized.countryIso,
              dialCode:        phoneNormalized.dialCode,
              nationalNumber:  phoneNormalized.national,
              country:         phoneNormalized.countryName,     // populate the human-readable country too
            } : {}),
            // 2026-09 (Tony's referral audit): link the new user to the
            // referrer. Downstream commission code in routes.ts ~L5967
            // reads users.referred_by and matches it against every other
            // user's referral_code to compute payouts.
            ...(validReferrerCode ? { referredBy: validReferrerCode } : {}),
          })
          .returning();
      } catch (insertErr: any) {
        const code = String(insertErr?.code ?? insertErr?.cause?.code ?? "");
        const msg  = String(insertErr?.message ?? "");
        // 23505 = unique_violation. Could be either the email unique
        // constraint OR our new phone unique index.
        if (code === "23505" || /duplicate key|unique/i.test(msg)) {
          if (/email/i.test(msg)) {
            return res.status(409).json({
              message: "An account with that email already exists. Try signing in instead.",
              code: "EMAIL_TAKEN",
            });
          }
          return res.status(409).json({
            message: "That mobile number already has an account. Try signing in with the email you used before.",
            code: "PHONE_TAKEN",
            suggestSignIn: true,
          });
        }
        throw insertErr;
      }

      if (!created) {
        return res.status(500).json({ message: "Could not create your account. Please try again." });
      }

      if (validReferrerCode) {
        console.log(
          `[Auth][register] ✓ referral linked: newUserId=${created.id} email=${cleanEmail} referredBy=${validReferrerCode}`,
        );
      }

      await setSessionUserId(req, created.id);

      // Fire-and-forget: send email verification code so user can verify on next page.
      // Don't block registration response on email delivery — surfaces as a non-fatal
      // toast on the client. The user can also request a re-send from /verify-email.
      sendEmailVerificationCode(created.id, cleanEmail).catch((e) =>
        console.warn("[Auth][register] verification email failed:", e?.message),
      );

      res.json({
        id: created.id,
        email: created.email,
        emailVerified: false,
        phoneVerified: false,
        needsVerification: true,
      });
    } catch (err: any) {
      console.error("[Auth][register] error:", err?.message);
      if (err?.code === "23505") {
        return res.status(409).json({ message: "An account with that email already exists. Try signing in instead." });
      }
      res.status(500).json({ message: "Registration failed. Please try again." });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    // 2026-06 PERF: timing instrumentation — pinpoints which step is slow when
    // a login takes >2s. Render log search "[Auth][login] step=" surfaces it.
    const t0 = Date.now();
    const step = (label: string) => {
      const dt = Date.now() - t0;
      if (dt > 200) console.warn(`[Auth][login] step=${label} ms=${dt}`);
    };
    try {
      // 2026-10: the box accepts email OR phone ("identifier"); `email` kept
      // for older cached clients.
      const typed = String(req.body?.identifier ?? req.body?.email ?? "").trim();
      const password = String(req.body?.password ?? "");

      if (!typed || !password) {
        return res.status(400).json({ message: "Enter your email (or phone number) and password." });
      }
      const resolved = await resolveLoginIdentifier(typed);
      if (resolved.kind === "invalid") {
        return res.status(400).json({ message: "Enter your email address or the phone number you signed up with." });
      }
      const rawEmail = resolved.key; // lockout key (email, or phone:last9)

      // 2026-06 SECURITY: brute-force lockout check BEFORE we touch the DB.
      // 5 failed attempts in a 15-min window locks (email + IP) for 15 min.
      // Complements the per-IP rate limit (which doesn't know account context).
      const { checkLockout, recordFailedLogin, clearFailedAttempts } =
        await import("../../lib/security-guard");
      const clientIp = String(req.headers["x-forwarded-for"] || req.ip || "unknown")
        .split(",")[0].trim();
      const lockoutStatus = checkLockout(rawEmail, clientIp);
      if (lockoutStatus.locked) {
        // 2026-06 friendly-error pass: surface the recovery path. Founder
        // reported "Pro users say they can't log back in" — most of those
        // are users who hit lockout and never see a way out. Now we tell
        // them about /forgot-password explicitly.
        res.setHeader("Retry-After", String(lockoutStatus.retryAfterSeconds));
        logAuthEvent(req, "locked", resolved.kind, resolved.user?.id ?? null);
        return res.status(429).json({
          message: `Too many password attempts. Skip the wait — we can email you a sign-in code right now.`,
          retryAfterSeconds: lockoutStatus.retryAfterSeconds,
          locked: true,
          offerCode: !!resolved.user,
          forgotPasswordUrl: "/forgot-password",
        });
      }

      // 2026-06 PERF: project only the columns we need for the auth flow.
      // SELECT * was pulling 60+ columns over the wire on every login attempt.
      //
      // 2026-06 friendly-login pass: lookup is now CASE-INSENSITIVE on email.
      // Old or admin-imported accounts may have email stored with mixed case
      // (Mary.K@Gmail.com); the lowercased rawEmail wouldn't match those and
      // the user would see "Invalid email or password" for an email they
      // typed correctly. LOWER() on both sides covers every case.
      //
      // 2026-09 (Tony's "users get a code, no place to enter it" fix):
      // also pull email_verified so we can detect unverified accounts and
      // route them to the code-entry flow instead of a generic "invalid
      // password" toast that sends them chasing forgot-password.
      const r = resolved.user;
      const user = r ? {
        id: r.id,
        email: r.email,
        passwordHash: r.password_hash,
        isActive: r.is_active,
        emailVerified: r.email_verified,
      } : null;
      step("user_lookup");
      if (!user) {
        // 2026-10: be honest. Signup already reveals "email already exists",
        // so hiding it here protected nothing and cost us real signups —
        // people kept retrying / resetting an account that never existed.
        // Still counted toward the lockout to slow bulk probing.
        recordFailedLogin(rawEmail, clientIp);
        logAuthEvent(req, "no_account", resolved.kind, null);
        const hint = resolved.kind === "email" ? await similarAccountHint(rawEmail) : null;
        return res.status(404).json(
          noAccountPayload(resolved.kind as "email" | "phone", typed, hint),
        );
      }

      // Block deleted (anonymised) accounts.
      if (user.isActive === false) {
        logAuthEvent(req, "deleted", resolved.kind, user.id);
        return res.status(403).json({
          message: "This account has been deleted. Please sign up with a new account, or contact support if this is a mistake.",
          accountDeleted: true,
          supportEmail: "support@workabroadhub.tech",
        });
      }

      // No password on file (admin-created stub etc.) → can't match; the
      // client's "email me a code" path is their way in.
      const valid = user.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
      step("bcrypt_compare");
      if (!valid) {
        // 2026-09 (Tony's "users get a code, no place to enter it" fix):
        // if the account exists but email isn't verified, real-world
        // users often type their 6-digit verification code into the
        // password field, hit "Invalid password", then click Forgot
        // Password, get YET ANOTHER code, and loop. Detect that case
        // and hand the client a clear signal to switch to code-entry
        // mode instead of the generic invalid-password toast.
        if (!user.emailVerified) {
          // Auto-send a fresh code so whatever's in the user's inbox
          // is guaranteed valid when the modal switches to verify UI.
          sendEmailVerificationCode(user.id, user.email, { onlyIfNone: true }).catch((e) =>
            console.warn("[Auth][login-verify-fallback] send-code failed:", e?.message),
          );
          logAuthEvent(req, "unverified", resolved.kind, user.id);
          return res.status(403).json({
            message: "This account isn't verified yet. Enter the 6-digit code we emailed you (it works for 10 minutes) to finish signing in.",
            unverifiedAccount: true,
            verificationRequired: true,
            email: user.email,
          });
        }

        const post = recordFailedLogin(rawEmail, clientIp);
        logAuthEvent(req, "wrong_password", resolved.kind, user.id);
        // 2026-10: the account exists — say so, and offer the one-tap
        // passwordless code instead of sending them off to reset.
        return res.status(401).json({
          message: user.passwordHash
            ? "That password doesn't match. No problem — we can email you a sign-in code instead."
            : "This account doesn't have a password yet. We can email you a sign-in code instead.",
          wrongPassword: true,
          offerCode: true,
          maskedEmail: maskEmail(user.email.toLowerCase()),
          remainingAttempts: post.remainingAttempts,
          forgotPasswordUrl: "/forgot-password",
        });
      }

      // Successful login — clear the failure history for this (email, IP).
      clearFailedAttempts(rawEmail, clientIp);

      // 2026-09 (Tony's "code loop" fix): password is right, but email
      // still isn't verified. Instead of setting a session (which sends
      // them to /dashboard where every /api call gets 403'd downstream),
      // fire a fresh code and tell the client to switch to verify UI.
      if (!user.emailVerified) {
        sendEmailVerificationCode(user.id, user.email, { onlyIfNone: true }).catch((e) =>
          console.warn("[Auth][login-verify-fallback] send-code failed:", e?.message),
        );
        logAuthEvent(req, "unverified", resolved.kind, user.id);
        return res.status(403).json({
          message: "Your password is correct — just confirm your email. Enter the 6-digit code we emailed you (it works for 10 minutes).",
          unverifiedAccount: true,
          verificationRequired: true,
          passwordOk: true,
          email: user.email,
        });
      }

      await setSessionUserId(req, user.id);
      step("session_save");
      logAuthEvent(req, "password_ok", resolved.kind, user.id);
      // 2026-06 PERF: invalidate the auth-user cache so the very next
      // /api/auth/user call (which the client fires right after login) doesn't
      // return a stale negative.
      (app as any).invalidateAuthUserCache?.(user.id);

      const totalMs = Date.now() - t0;
      if (totalMs > 1500) console.warn(`[Auth][login] SLOW total=${totalMs}ms email=${rawEmail}`);
      res.json({ id: user.id, email: user.email });
    } catch (err: any) {
      // 2026-06 diagnostic upgrade: when login throws, log enough context
      // for Tony to find the cause in Render logs (email + error code +
      // full stack), and still hand the user a recovery breadcrumb so they
      // don't sit on a dead error screen. jacksonmuturi004 reported "Login
      // failed. Please try again." with no way forward — now even server
      // errors offer the reset path.
      const rawEmailForLog = String(req.body?.email ?? "").trim().toLowerCase();
      console.error(
        `[Auth][login] EXCEPTION email="${rawEmailForLog}" code=${err?.code ?? "n/a"} ` +
        `name=${err?.name ?? "n/a"} message="${err?.message ?? "n/a"}"`,
      );
      if (err?.stack) console.error("[Auth][login] stack:", err.stack.split("\n").slice(0, 5).join(" | "));
      res.status(500).json({
        message:
          "We hit a snag signing you in. Try again — if it keeps failing, reset your password and you'll be back in. We're already looking at the logs.",
        forgotPasswordUrl: "/forgot-password",
        supportEmail: "support@workabroadhub.tech",
      });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    // 2026-06 PERF: invalidate the auth-user cache on logout so a later login
    // from the same browser doesn't see stale data.
    const userId = (req.session as any)?.customUserId as string | undefined;
    if (userId) (app as any).invalidateAuthUserCache?.(userId);
    if (typeof req.session?.destroy === "function") {
      req.session.destroy(() => res.json({ success: true }));
    } else {
      res.json({ success: true });
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // POST /api/auth/delete-account
  //
  // GDPR-style right-to-be-forgotten for users who want to leave the platform
  // entirely. Anonymises (does NOT hard-delete) the user record so payment
  // and order history are preserved for KRA tax compliance, but every piece
  // of PII is scrubbed:
  //
  //   users row:
  //     email           -> deleted-<id>@deleted.workabroadhub.local
  //     first/last name -> "Deleted" / "User"
  //     phone           -> NULL
  //     profile_image_url, country -> NULL
  //     password_hash   -> NULL  (can no longer log in)
  //     is_active       -> false
  //     email_verified  -> false
  //     deleted_at      -> NOW()
  //     deletion_reason -> user-supplied text or "no reason given"
  //
  //   verification_codes for this user -> hard delete
  //   active_sessions for this user    -> hard delete
  //   service_orders for this user     -> PII columns scrubbed (cv_text,
  //                                       extra_input, job_description) but
  //                                       order audit row stays so revenue
  //                                       reports remain accurate
  //   payments                         -> PRESERVED for KRA tax compliance
  //
  // Safety:
  //   • User MUST be signed in
  //   • Body MUST include confirmEmail that matches their current email
  //   • Admins are blocked from using this endpoint (use SQL or a separate
  //     admin-takedown flow to remove an admin so we don't accidentally
  //     orphan the platform)
  //   • A "your account was deleted" confirmation email is sent BEFORE we
  //     scrub the email column — gives the user a paper trail and tips
  //     them off if someone hijacked their session to delete the account
  //   • Session is destroyed atomically with the DB scrub
  // ───────────────────────────────────────────────────────────────────────────
  app.post("/api/auth/delete-account", async (req: Request, res: Response) => {
    const userId = (req.session as any)?.customUserId as string | undefined;
    if (!userId) {
      return res.status(401).json({ message: "Please sign in first." });
    }

    try {
      // Idempotent schema widener — adds deletion columns if not yet present.
      // Mirrors the pattern in server/services/pwaInstallTracking.ts.
      await pool.query(`
        ALTER TABLE users
          ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMPTZ NULL,
          ADD COLUMN IF NOT EXISTS deletion_reason VARCHAR(500) NULL
      `).catch((e) => console.warn("[Auth][delete-account] schema widener:", e?.message));

      // Fetch the current user.
      const { rows } = await pool.query<{
        id: string;
        email: string;
        is_admin: boolean;
        role: string;
        deleted_at: Date | null;
      }>(
        `SELECT id, email, is_admin, role, deleted_at FROM users WHERE id = $1`,
        [userId],
      );
      const u = rows[0];
      if (!u) {
        return res.status(404).json({ message: "User not found." });
      }
      if (u.deleted_at) {
        return res.status(410).json({ message: "Account is already deleted." });
      }

      // Admin block — admins must be removed via SQL or a separate flow.
      const isAdmin = u.is_admin || u.role === "ADMIN" || u.role === "SUPER_ADMIN";
      if (isAdmin) {
        return res.status(403).json({
          message: "Admin accounts cannot be deleted via this endpoint. Contact support to transfer admin rights first.",
        });
      }

      // Confirmation check — user must type their email exactly.
      const confirmEmail = String(req.body?.confirmEmail ?? "").trim().toLowerCase();
      if (!confirmEmail) {
        return res.status(400).json({
          message: "Please type your email address to confirm deletion.",
        });
      }
      if (confirmEmail !== String(u.email ?? "").trim().toLowerCase()) {
        return res.status(400).json({
          message: "Email confirmation does not match your account email. Type your email exactly to confirm.",
        });
      }

      const reason = String(req.body?.reason ?? "").trim().slice(0, 500) || "no reason given";

      // Send the "your account is deleted" confirmation email FIRST, while we
      // still know where to send it. Fire-and-forget — we don't want a flaky
      // SMTP step to block the actual deletion.
      const originalEmail = u.email;
      const html = `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:auto;padding:24px;color:#1a2530;">
        <h2 style="margin:0 0 12px;">Your WorkAbroad Hub account has been deleted</h2>
        <p>Hi,</p>
        <p>This is a confirmation that your account associated with this email address was permanently deleted on ${new Date().toUTCString()}.</p>
        <p>What was removed:</p>
        <ul>
          <li>Your name, email, phone number, and profile</li>
          <li>Your login credentials (you can no longer sign in)</li>
          <li>The text of any CVs you uploaded</li>
        </ul>
        <p>What was kept (for Kenya Revenue Authority tax compliance):</p>
        <ul>
          <li>Anonymised payment records — these no longer contain your name or contact details</li>
        </ul>
        <p>If you did NOT request this deletion, please reply to this email immediately.</p>
        <p style="margin-top:32px;font-size:13px;color:#475569;">— The WorkAbroad Hub team</p>
      </div>`;
      const text = `Your WorkAbroad Hub account associated with this email address was permanently deleted on ${new Date().toUTCString()}.\n\nIf you did NOT request this deletion, please reply to this email immediately.`;
      sendEmail({
        to: originalEmail,
        subject: "Your WorkAbroad Hub account has been deleted",
        html,
        text,
      }).catch((err: any) => {
        console.warn("[Auth][delete-account] confirmation email failed:", err?.message);
      });

      // ── Atomic scrub via a single transaction ────────────────────────────
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // 1) Anonymise the user row.
        await client.query(
          `UPDATE users
              SET email             = 'deleted-' || id || '@deleted.workabroadhub.local',
                  phone             = NULL,
                  first_name        = 'Deleted',
                  last_name         = 'User',
                  profile_image_url = NULL,
                  country           = NULL,
                  password_hash     = NULL,
                  is_active         = false,
                  email_verified    = false,
                  phone_verified    = false,
                  deleted_at        = NOW(),
                  deletion_reason   = $2,
                  updated_at        = NOW()
            WHERE id = $1`,
          [userId, reason],
        );

        // 2) Wipe verification codes (no longer needed).
        await client.query(
          `DELETE FROM verification_codes WHERE user_id = $1`,
          [userId],
        ).catch((e) => console.warn("[Auth][delete-account] verification_codes:", e?.message));

        // 3) Wipe active sessions (logs them out everywhere).
        await client.query(
          `DELETE FROM active_sessions WHERE user_id = $1`,
          [userId],
        ).catch((e) => console.warn("[Auth][delete-account] active_sessions:", e?.message));

        // 4) Scrub PII from service_orders but keep the audit row.
        await client.query(
          `UPDATE service_orders
              SET cv_text         = NULL,
                  extra_input     = NULL,
                  job_description = NULL,
                  output_text     = NULL,
                  updated_at      = NOW()
            WHERE user_id = $1`,
          [userId],
        ).catch((e) => console.warn("[Auth][delete-account] service_orders scrub:", e?.message));

        await client.query("COMMIT");
      } catch (txErr: any) {
        await client.query("ROLLBACK").catch(() => {});
        throw txErr;
      } finally {
        client.release();
      }

      console.log(`[Auth][delete-account] userId=${userId} anonymised. reason="${reason}"`);

      // Destroy the session so the next request is unauthenticated.
      const sess = req.session as any;
      if (sess && typeof sess.destroy === "function") {
        sess.destroy(() => {
          res.clearCookie("connect.sid");
          res.json({ ok: true, message: "Your account has been deleted." });
        });
      } else {
        res.json({ ok: true, message: "Your account has been deleted." });
      }
    } catch (err: any) {
      console.error("[Auth][delete-account] failed:", err?.message);
      res.status(500).json({ message: "Could not delete account. Please try again or contact support." });
    }
  });

  // 2026-06 PERF: 30 s in-memory cache for /api/auth/user. Lives in
  // server/lib/auth-user-cache.ts so any code path that updates a user can
  // call invalidateAuthUserCache directly. Kept on the app as a property too
  // so older callers (admin grants, logout) that already use that accessor
  // continue to work.
  const getCachedUser = getCachedAuthUser;
  const setCachedUser = setCachedAuthUser;
  (app as any).invalidateAuthUserCache = invalidateAuthUserCache;

  // 2026-08 (Tony's "banner scares verified users" fix): on server boot,
  // wipe every cached /api/auth/user response. Old payloads built by the
  // previous deploy are missing the emailVerified field, which is exactly
  // what left the red banner stuck on verified accounts. A clean cache on
  // deploy guarantees the very next request rebuilds a correct payload.
  clearAllAuthUserCache();
  console.log("[Auth] Cleared in-memory auth-user cache on module load — verification flags will be repopulated fresh.");

  app.get("/api/auth/user", async (req: Request, res: Response) => {
    const t0 = Date.now();
    try {
      const userId = (req.session as any)?.customUserId as string | undefined;
      if (!userId) {
        // Fast-path: no session cookie means no DB call. Caches the negative
        // result client-side via Cache-Control.
        res.setHeader("Cache-Control", "private, max-age=10");
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Fast-path: cache hit returns in <1ms
      const cached = getCachedUser(userId);
      if (cached) {
        res.setHeader("Cache-Control", "private, max-age=5");
        res.setHeader("X-Cache", "HIT");
        return res.json(cached);
      }

      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (user) {
        // ── Admin bypass ────────────────────────────────────────────────────
        // Admins (is_admin=true OR role in ADMIN/SUPER_ADMIN) must look like
        // Pro users to every client component so they can test/QA every paid
        // service without the "Upgrade to Pro" prompts. We override plan +
        // subscription flags + verification flags on the response only —
        // the DB values stay untouched.
        const isAdminUser =
          user.isAdmin === true ||
          user.role === "ADMIN" ||
          user.role === "SUPER_ADMIN";

        // 2026-06 EXPIRY AUDIT: NEVER trust the denormalised users.plan
        // field — it lags actual subscription expiry. Always reconcile with
        // storage.getUserPlan(), which:
        //   - reads user_subscriptions row
        //   - checks status='active' AND end_date >= now()
        //   - lazily auto-downgrades users.plan='free' if expired
        // Worst-case: a trial expiring at 12:00:00 is reflected as "free"
        // by 12:00:30 (max cache TTL). For most cases it's <2s.
        let livePlan = user.plan;
        if (!isAdminUser) {
          try {
            const { storage } = await import("../../storage");
            livePlan = await storage.getUserPlan(userId);
            if (livePlan !== user.plan) {
              console.log(`[Auth][/api/auth/user] live-plan correction userId=${userId} db.plan="${user.plan}" → live="${livePlan}"`);
            }
          } catch (err: any) {
            console.warn(`[Auth][/api/auth/user] getUserPlan failed — falling back to db.plan="${user.plan}":`, err?.message);
          }
        }

        // 2026-08 (Tony's "banner scares verified users" fix): defensive
        // fallback in case the Drizzle schema was out of date at deploy time
        // and (user as any).emailVerified is still undefined. Read the
        // verification flags directly from the DB row using a raw column
        // fetch so the payload ALWAYS includes them for regular users.
        // Without this, `emailVerified === true` on the client is
        // `undefined === true` → false → the red "Final warning" banner
        // never disappears even after successful verification.
        let dbEmailVerified = (user as any).emailVerified;
        let dbPhoneVerified = (user as any).phoneVerified;
        if (dbEmailVerified === undefined || dbPhoneVerified === undefined) {
          try {
            const vr = await pool.query<{ email_verified: boolean; phone_verified: boolean }>(
              `SELECT email_verified, phone_verified FROM users WHERE id = $1`,
              [userId],
            );
            if (vr.rows[0]) {
              dbEmailVerified = vr.rows[0].email_verified === true;
              dbPhoneVerified = vr.rows[0].phone_verified === true;
            }
          } catch (e: any) {
            console.warn(`[Auth][/api/auth/user] verification-flags fallback failed:`, e?.message);
          }
        }

        // 2026-09 (independent audit): STRIP passwordHash before responding.
        // Every /api/auth/user request currently shipped the bcrypt hash to
        // the client and cached it via setCachedUser. Even though bcrypt is
        // slow, exposing hashes lets attackers run offline cracking on any
        // weak passwords and lights up cross-service correlation. Never let
        // this field leave the server.
        const { passwordHash: _stripHash, ...safeUser } = user as any;
        const payload = isAdminUser
          ? { ...safeUser, plan: "pro", subscriptionStatus: "active", emailVerified: true, phoneVerified: true, isAdminBypass: true }
          : {
              ...safeUser,
              plan: livePlan,
              subscriptionStatus: livePlan === "free" ? "expired" : "active",
              // Always coerce to booleans — never send undefined to the client
              emailVerified: dbEmailVerified === true,
              phoneVerified: dbPhoneVerified === true,
            };
        setCachedUser(userId, payload);
        res.setHeader("Cache-Control", "private, max-age=5");
        res.setHeader("X-Cache", "MISS");
        const elapsed = Date.now() - t0;
        if (elapsed > 500) console.warn(`[Auth][/api/auth/user] SLOW ${elapsed}ms userId=${userId}`);
        return res.json(payload);
      }
      // No user row matches the session userId — stale session, destroy it
      const sess = req.session as any;
      if (sess && typeof sess.destroy === "function") {
        sess.destroy(() => {
          res.clearCookie("connect.sid");
          res.status(401).json({ message: "Session expired. Please sign in again." });
        });
      } else {
        res.status(401).json({ message: "Session expired. Please sign in again." });
      }
    } catch (err: any) {
      // Defensive: this used to crash with no try/catch and produce a generic
      // 500 page on the client. Now we log the actual reason and surface it
      // to the client as 503 (transient) so the SPA can retry rather than
      // forcing a logout flow.
      console.error("[Auth][/api/auth/user] error:", err?.message, err?.code, err?.stack?.split("\n")[0]);
      res.status(503).json({
        message: "Temporary error fetching your session. Please retry.",
        code: err?.code ?? "auth_user_lookup_failed",
      });
    }
  });

  // Forgot password — always returns 200 to prevent email enumeration.
  //
  // 2026-07: Fixes for the "6+ users can't recover their accounts" report:
  //   1. AWAIT the send (was fire-and-forget) so we can log the outcome.
  //   2. ALSO send via WhatsApp when phone on file — Kenya users notice it
  //      far faster than email, and Africa's Talking is reliable in-country.
  //   3. Persist every attempt to password_reset_attempts (migration 0017)
  //      so support has a durable record across deploys, not just an
  //      in-memory ring buffer.
  //
  // The user-facing response is still uniform — nothing about the delivery
  // outcome leaks to protect against enumeration.
  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    // 2026-10: accept email OR phone, and be honest when there's no account
    // (312 of 370 reset requests in one week were for emails that never
    // signed up — they waited for an email that could never arrive).
    const typedId = String(req.body?.identifier ?? req.body?.email ?? "").trim();
    const resolvedId = typedId ? await resolveLoginIdentifier(typedId).catch(() => null) : null;
    if (!resolvedId || resolvedId.kind === "invalid" || (resolvedId.kind === "email" && !EMAIL_RE.test(resolvedId.key))) {
      return res.status(400).json({ message: "Enter your email address or the phone number you signed up with." });
    }
    if (!resolvedId.user || resolvedId.user.is_active === false) {
      logAuthEvent(req, "reset_no_account", resolvedId.kind, null);
      try {
        await pool.query(
          `INSERT INTO password_reset_attempts (user_id, email, email_status, ip_address) VALUES (NULL, $1, 'skipped', $2)`,
          [resolvedId.key.slice(0, 255), clientIpOf(req)],
        );
      } catch { /* non-fatal */ }
      const hint = resolvedId.kind === "email" ? await similarAccountHint(resolvedId.key) : null;
      return res.status(404).json(noAccountPayload(resolvedId.kind, typedId, hint));
    }
    const rawEmail = resolvedId.user.email.toLowerCase();
    logAuthEvent(req, "reset_sent", resolvedId.kind, resolvedId.user.id);

    const ip = String(req.ip || req.headers["x-forwarded-for"] || "").split(",")[0].trim().slice(0, 60) || null;
    const ua = String(req.headers["user-agent"] || "").slice(0, 400) || null;

    let userId: string | null = null;
    let tokenId: string | null = null;
    let emailStatus: "sent" | "failed" | "skipped" = "skipped";
    let emailProvider: string | null = null;
    let emailMessageId: string | null = null;
    let emailError: string | null = null;
    let whatsappStatus: "sent" | "failed" | "skipped" = "skipped";
    let whatsappError: string | null = null;

    try {
      const [user] = await db.select().from(users).where(eq(users.id, resolvedId.user.id)).limit(1);
      if (user) {
        userId = user.id;
        const token = crypto.randomBytes(48).toString("hex");
        const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

        await pool.query(
          `UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`,
          [user.id],
        );
        const inserted = await pool.query<{ id: string }>(
          `INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3) RETURNING id`,
          [user.id, token, expiresAt],
        );
        tokenId = inserted.rows[0]?.id ?? null;

        const resetUrl = `${appBaseUrl()}/reset-password?token=${token}`;
        const name = (user.firstName || "there").toString();
        const html = `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:auto;padding:24px;color:#1a2530;"><h2 style="margin:0 0 12px;">Reset your WorkAbroad Hub password</h2><p>Hi ${name},</p><p>We received a request to reset the password for the account tied to <strong>${rawEmail}</strong>. Click the button below to set a new password. The link expires in 1 hour.</p><p style="margin:24px 0;"><a href="${resetUrl}" style="display:inline-block;background:#0f766e;color:#fff;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;">Reset password</a></p><p style="font-size:13px;color:#475569;">If the button does not work, copy this link into your browser:<br><a href="${resetUrl}" style="color:#1d4ed8;word-break:break-all;">${resetUrl}</a></p><p style="font-size:13px;color:#475569;">Did not ask for this? You can safely ignore this email — your password will not change unless you click the link above.</p><p style="margin-top:32px;font-size:13px;color:#475569;">— The WorkAbroad Hub team</p></div>`;
        const text = `Hi ${name},\n\nReset link (expires in 1 hour): ${resetUrl}\n\nDid not ask for this? Ignore this email.\n\n— WorkAbroad Hub`;

        try {
          const emailResult = await sendEmail({ to: rawEmail, subject: "Reset your WorkAbroad Hub password", html, text });
          if (emailResult.success) {
            emailStatus = "sent";
            emailMessageId = emailResult.messageId ?? null;
            emailProvider = "smtp";
          } else {
            emailStatus = "failed";
            emailError = (emailResult.error ?? "unknown").slice(0, 500);
            console.error(`[forgot-password] email failed for ${rawEmail}: ${emailError}`);
          }
        } catch (e: any) {
          emailStatus = "failed";
          emailError = String(e?.message ?? "email send threw").slice(0, 500);
          console.error(`[forgot-password] email threw for ${rawEmail}:`, e);
        }

        const phone = (user.phone || "").trim();
        if (phone) {
          try {
            const { sendWhatsApp } = await import("../../services/whatsapp");
            const waMsg =
              `WorkAbroad Hub password reset\n\n` +
              `Hi ${name}, tap this link to set a new password. It works for 1 hour:\n${resetUrl}\n\n` +
              `Didn't request this? Ignore — your password won't change.`;
            await sendWhatsApp(phone, waMsg);
            whatsappStatus = "sent";
          } catch (e: any) {
            whatsappStatus = "failed";
            whatsappError = String(e?.message ?? "whatsapp send threw").slice(0, 500);
            console.error(`[forgot-password] whatsapp failed for ${phone}:`, e?.message);
          }
        }
      }
    } catch (err: any) {
      console.error("[Auth][forgot-password] error:", err?.message);
    }

    try {
      await pool.query(
        `INSERT INTO password_reset_attempts
           (user_id, email, token_id,
            email_status, email_provider, email_message_id, email_error,
            whatsapp_status, whatsapp_error,
            ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [userId, rawEmail, tokenId,
         emailStatus, emailProvider, emailMessageId, emailError,
         whatsappStatus, whatsappError,
         ip, ua],
      );
    } catch (logErr: any) {
      console.error("[forgot-password] could not log attempt:", logErr?.message);
    }

    res.json({
      ok: emailStatus !== "failed" || whatsappStatus === "sent",
      sentTo: maskEmail(rawEmail),
      viaWhatsApp: whatsappStatus === "sent",
      message: emailStatus === "failed" && whatsappStatus !== "sent"
        ? "We couldn't deliver the reset email just now. Please try again in a minute, or contact support@workabroadhub.tech."
        : `Reset link sent to ${maskEmail(rawEmail)}${whatsappStatus === "sent" ? " and your WhatsApp" : ""}. Check your inbox (and spam).`,
    });
  });

  // ── 2026-10: passwordless sign-in code ───────────────────────────────────
  // Forgot / wrong password → "Email me a code" → type 6 digits → signed in.
  // No reset link, no new password, never leaves the modal. Reuses the same
  // verification_codes table + per-destination hourly rate limit + 5-attempt
  // cap as email verification. A successful code also verifies the email
  // (it proves inbox ownership).
  app.post("/api/auth/login-code/request", async (req: Request, res: Response) => {
    try {
      const typed = String(req.body?.identifier ?? req.body?.email ?? "").trim();
      const resolved = typed ? await resolveLoginIdentifier(typed) : null;
      if (!resolved || resolved.kind === "invalid") {
        return res.status(400).json({ message: "Enter your email address or the phone number you signed up with." });
      }
      if (!resolved.user) {
        logAuthEvent(req, "no_account", resolved.kind, null);
        const hint = resolved.kind === "email" ? await similarAccountHint(resolved.key) : null;
        return res.status(404).json(noAccountPayload(resolved.kind, typed, hint));
      }
      if (resolved.user.is_active === false) {
        logAuthEvent(req, "deleted", resolved.kind, resolved.user.id);
        return res.status(403).json({
          message: "This account has been deleted. Please create a new account, or contact support if this is a mistake.",
          accountDeleted: true,
          supportEmail: "support@workabroadhub.tech",
        });
      }
      const result = await sendEmailVerificationCode(resolved.user.id, resolved.user.email);
      if (!result.ok) {
        return res.status(result.code === "rate_limited" ? 429 : 502).json({
          message: result.code === "rate_limited"
            ? "You've requested several codes in the last hour. Use the newest code in your inbox, or try again a bit later."
            : "We couldn't send the code just now. Please try again in a minute.",
          code: result.code,
        });
      }
      if (!result.reused) logAuthEvent(req, "code_sent", resolved.kind, resolved.user.id);
      res.json({
        ok: true,
        reused: !!result.reused,
        expiresAt: result.expiresAt,
        email: resolved.user.email.toLowerCase(),
        maskedEmail: maskEmail(resolved.user.email.toLowerCase()),
        codeHint: (result as any).codeHint,
      });
    } catch (err: any) {
      console.error("[Auth][login-code/request] error:", err?.message);
      res.status(500).json({ message: "Couldn't send a code right now. Please try again." });
    }
  });

  app.post("/api/auth/login-code/verify", async (req: Request, res: Response) => {
    try {
      const typed = String(req.body?.identifier ?? req.body?.email ?? "").trim();
      const code = String(req.body?.code ?? "").replace(/\D/g, "");
      if (!/^\d{6}$/.test(code)) return res.status(400).json({ message: "Enter the 6-digit code from your email." });
      const resolved = typed ? await resolveLoginIdentifier(typed) : null;
      if (!resolved?.user || resolved.user.is_active === false) {
        return res.status(400).json({ message: "That code doesn't match. Tap Resend for a fresh one." });
      }
      // verifyCode enforces expiry + 5 wrong attempts per code.
      const result = await verifyCode(resolved.user.id, "email", code);
      if (!result.ok) {
        logAuthEvent(req, "code_wrong", resolved.kind, resolved.user.id);
        return res.status(400).json({ message: result.message, reason: result.reason });
      }
      await setSessionUserId(req, resolved.user.id);
      try {
        const { clearAllAttemptsForEmail } = await import("../../lib/security-guard");
        clearAllAttemptsForEmail(resolved.user.email.toLowerCase());
        if (resolved.kind === "phone") clearAllAttemptsForEmail(resolved.key);
      } catch { /* non-fatal */ }
      (app as any).invalidateAuthUserCache?.(resolved.user.id);
      invalidateAuthUserCache(resolved.user.id);
      logAuthEvent(req, "code_ok", resolved.kind, resolved.user.id);
      res.json({ id: resolved.user.id, email: resolved.user.email });
    } catch (err: any) {
      console.error("[Auth][login-code/verify] error:", err?.message);
      res.status(500).json({ message: "Couldn't sign you in right now. Please try again." });
    }
  });

  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const token = String(req.body?.token ?? "").trim();
      const password = String(req.body?.password ?? "");

      if (!token || token.length < 32) {
        return res.status(400).json({ message: "Invalid or missing reset token." });
      }
      if (!password || password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters." });
      }

      const result = await pool.query(
        `SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token = $1 LIMIT 1`,
        [token],
      );
      const row = result.rows[0];
      if (!row) return res.status(400).json({ message: "This reset link is invalid. Request a new one." });
      if (row.used_at) return res.status(400).json({ message: "This reset link has already been used. Request a new one." });
      if (new Date(row.expires_at) < new Date()) {
        return res.status(400).json({ message: "This reset link has expired. Request a new one." });
      }

      // 2026-06 PERF: bcrypt cost 10 (was 12). 10 = OWASP minimum + industry
      // standard. Cost 12 took ~500ms on Render Standard CPU; cost 10 is
      // ~120ms — 4× speedup. Existing cost-12 hashes still verify correctly
      // because bcrypt stores the cost in the hash itself.
      const passwordHash = await bcrypt.hash(password, 10);
      await pool.query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [passwordHash, row.user_id]);
      await pool.query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`, [row.id]);

      // 2026-06: clear any active brute-force lockout for this user's email.
      // Without this, a user who gets locked out → resets → tries to log in
      // is STILL locked for the remainder of the 15-minute window. Brutal.
      // Now the reset is also their unlock.
      try {
        const userRow = await pool.query<{ email: string }>(
          `SELECT email FROM users WHERE id = $1 LIMIT 1`,
          [row.user_id],
        );
        const email = userRow.rows[0]?.email?.toLowerCase();
        if (email) {
          const { clearAllAttemptsForEmail } = await import("../../lib/security-guard");
          if (typeof clearAllAttemptsForEmail === "function") {
            clearAllAttemptsForEmail(email);
            console.log(`[Auth][reset-password] Cleared brute-force lockout for ${email}`);
          }
        }
      } catch (clearErr: any) {
        // Non-fatal — the user can still wait out the lockout naturally
        console.warn("[Auth][reset-password] Could not clear lockout:", clearErr?.message);
      }

      console.log(`[Auth][reset-password] Password updated for userId=${row.user_id}`);
      res.json({ ok: true, message: "Password updated. Please log in with your new password." });
    } catch (err: any) {
      console.error("[Auth][reset-password] error:", err?.message);
      res.status(500).json({ message: "Failed to reset password. Please try again." });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // IDENTITY VERIFICATION — email + phone OTP
  // Endpoints:
  //   POST /api/auth/send-email-code   — (re)send email OTP to current user
  //   POST /api/auth/send-phone-code   — validate phone via Twilio Lookup, then send SMS OTP
  //   POST /api/auth/verify-email      — submit 6-digit email code
  //   POST /api/auth/verify-phone      — submit 6-digit SMS code
  //   GET  /api/auth/verification-status — current email_verified / phone_verified flags
  // ──────────────────────────────────────────────────────────────────────────

  function getSessionUserId(req: Request): string | null {
    return ((req.session as any)?.customUserId as string | undefined) ?? null;
  }

  app.post("/api/auth/send-email-code", async (req: Request, res: Response) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Please sign in first." });
    const r = await pool.query<{ email: string; email_verified: boolean }>(
      `SELECT email, email_verified FROM users WHERE id = $1`,
      [userId],
    );
    const u = r.rows[0];
    if (!u) return res.status(404).json({ message: "User not found." });
    if (u.email_verified) return res.json({ ok: true, message: "Email already verified." });
    const result = await sendEmailVerificationCode(userId, u.email);
    if (!result.ok) {
      // 2026-06: previously all failures returned 429 ("Too many requests"),
      // which made delivery failures look like rate-limiting. Now we map
      // each failure code to the right HTTP status so the client can show
      // appropriate copy AND offer SMS fallback when delivery is the issue.
      const status = result.code === "rate_limited" ? 429
        : result.code === "send_failed" ? 502
        : 500;
      return res.status(status).json({
        message: result.message,
        code: result.code,
        // Tell the client to surface the SMS fallback button when email is
        // broken — users always have an alternate path.
        offerSmsFallback: result.code === "send_failed",
      });
    }
    // 2026-08 (deliverability): pass last-2-digits hint to the client so
    // users can find the right email even when it's buried in Spam.
    res.json({
      ok: true,
      reused: !!result.reused,
      expiresAt: result.expiresAt,
      message: result.reused
        ? "We just sent you a code — use that one. It's still valid."
        : "Verification code sent. Check your inbox (and spam).",
      codeHint: (result as any).codeHint,
    });
  });

  app.post("/api/auth/send-phone-code", async (req: Request, res: Response) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Please sign in first." });
    const rawPhone = String(req.body?.phone ?? "").trim();
    if (!rawPhone) return res.status(400).json({ message: "Phone number is required." });

    // Real-identity phone validation: format + Twilio Lookup (catches fake/disconnected numbers)
    const phoneCheck = await validatePhone(rawPhone);
    if (phoneCheck.valid === false) {
      console.warn(`[send-phone-code] phone validation failed userId=${userId} raw=${rawPhone} reason=${phoneCheck.reason} msg=${phoneCheck.message}`);
      return res.status(400).json({ message: phoneCheck.message, reason: phoneCheck.reason });
    }
    const e164 = phoneCheck.e164;

    // Save the validated phone (so we know what to verify against later) BEFORE sending SMS
    await pool.query(`UPDATE users SET phone = $1, phone_verified = false, updated_at = NOW() WHERE id = $2`, [
      e164,
      userId,
    ]);

    const result = await sendSmsVerificationCode(userId, e164);

    // Map SMS-service failure codes to correct HTTP status codes so the client
    // shows the user a sensible error, not a misleading "Too Many Requests".
    if (!result.ok) {
      console.warn(`[send-phone-code] SMS send failed userId=${userId} phone=${e164} code=${result.code} message=${result.message}`);
      let status = 500;
      if (result.code === "rate_limited") status = 429;
      else if (result.code === "send_failed") status = 502;
      // If the failure is "SMS service is not configured", expose a clear hint
      // so admin can act, but keep the user-facing message friendly.
      const userMessage = result.code === "send_failed" && /not configured/i.test(result.message ?? "")
        ? "We're temporarily unable to send SMS codes. Please contact support@workabroadhub.tech and we'll verify you manually."
        : result.message;
      return res.status(status).json({ message: userMessage, code: result.code });
    }
    res.json({ ok: true, message: "Verification code sent via SMS.", phoneE164: e164 });
  });

  app.post("/api/auth/verify-email", async (req: Request, res: Response) => {
    // 2026-10 (Tony: Lawrence Menya stuck in verify loop for 2hrs). The
    // old handler required a session cookie — but users commonly open the
    // verification email on a different device/tab, or the session drops
    // between signup and verification, which left them with no recovery
    // path. The 6-digit code is itself proof of email ownership (only
    // someone who read the inbox can produce it), so we accept the code
    // alone and resolve the user from it. Session is still used as a
    // hint when present; falls back to looking up the user by the code's
    // hash + the hinted email in the request body.
    const code = String(req.body?.code ?? "").trim();
    const hintedEmail = String(req.body?.email ?? "").trim().toLowerCase();
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ message: "Enter the 6-digit code from your email." });
    }

    let userId = getSessionUserId(req);

    // Session missing — look up the user by the code hash + email hint.
    // 2026-10 SECURITY: the email hint is now REQUIRED. Without it, a 6-digit
    // guess was matched against every active code in the system (and wrong
    // guesses never counted), so spraying codes could sign someone into a
    // random account. With the email we resolve one user and let verifyCode
    // apply its 5-attempt cap.
    if (!userId) {
      if (!hintedEmail) {
        return res.status(400).json({
          message: "Please sign in again and we'll send you a fresh code.",
          reason: "email_required",
        });
      }
      try {
        const { rows: byEmail } = await pool.query<{ id: string }>(
          `SELECT id FROM users WHERE LOWER(email) = $1 AND is_active IS NOT FALSE LIMIT 1`,
          [hintedEmail],
        );
        if (byEmail[0]) {
          const r = await verifyCode(byEmail[0].id, "email", code);
          if (!r.ok) return res.status(400).json({ message: r.message, reason: r.reason });
          try { await setSessionUserId(req, byEmail[0].id); } catch { /* non-fatal */ }
          invalidateAuthUserCache(byEmail[0].id);
          logAuthEvent(req, "verify_ok", "email", byEmail[0].id);
          return res.json({ ok: true, message: r.message, signedIn: true });
        }
      } catch (err: any) {
        console.warn("[Auth][verify-email] sessionless email lookup failed:", err?.message);
      }
      try {
        const { sha256 } = await import("../../services/identityVerification");
        const codeHash = sha256(code);
        const { rows } = await pool.query<{ user_id: string; email: string }>(
          `SELECT vc.user_id, u.email
             FROM verification_codes vc
             JOIN users u ON u.id = vc.user_id
            WHERE vc.channel = 'email'
              AND vc.code_hash = $1
              AND vc.used_at IS NULL
              AND vc.expires_at > NOW()
              ${hintedEmail ? "AND LOWER(u.email) = $2" : ""}
            ORDER BY vc.created_at DESC
            LIMIT 1`,
          hintedEmail ? [codeHash, hintedEmail] : [codeHash],
        );
        if (rows[0]) {
          userId = rows[0].user_id;
          // Opportunistically re-establish the session so subsequent
          // requests from this tab are authenticated.
          try {
            await setSessionUserId(req, userId);
          } catch { /* session store flaky — the verify itself still works */ }
        }
      } catch (err: any) {
        console.warn("[Auth][verify-email] sessionless lookup failed:", err?.message);
      }
    }

    if (!userId) {
      return res.status(400).json({
        message: "That code doesn't match any pending verification. It may have expired or been replaced by a newer code — tap Resend to get a fresh one.",
        reason: "code_not_found",
      });
    }

    const result = await verifyCode(userId, "email", code);
    if (!result.ok) return res.status(400).json({ message: result.message, reason: result.reason });
    logAuthEvent(req, "verify_ok", "email", userId);
    res.json({ ok: true, message: result.message });
  });

  // ── 2026-10: fix a typo'd email on an UNVERIFIED account ─────────────────
  // People who mistype their email at signup can never receive the code
  // (it bounces), so they're stuck. Let them correct it from the code
  // screen. Allowed only while the account is unverified. Proof of
  // ownership: the signup session, OR current email + password (the
  // login-unverified path has no session).
  app.post("/api/auth/change-unverified-email", async (req: Request, res: Response) => {
    try {
      const newRaw = String(req.body?.newEmail ?? "").trim().toLowerCase();
      let userId = getSessionUserId(req);
      if (!userId) {
        const cur = String(req.body?.currentEmail ?? "").trim().toLowerCase();
        const pw = String(req.body?.password ?? "");
        if (!cur || !pw) return res.status(401).json({ message: "Please sign in again to change your email." });
        const { rows } = await pool.query<{ id: string; password_hash: string | null }>(
          `SELECT id, password_hash FROM users WHERE LOWER(email) = $1 AND is_active IS NOT FALSE LIMIT 1`, [cur],
        );
        const okPw = rows[0]?.password_hash ? await bcrypt.compare(pw, rows[0].password_hash) : false;
        if (!okPw) return res.status(401).json({ message: "Please sign in again to change your email." });
        userId = rows[0].id;
      }
      const { rows: me } = await pool.query<{ email: string; email_verified: boolean | null }>(
        `SELECT email, email_verified FROM users WHERE id = $1`, [userId],
      );
      if (!me[0]) return res.status(404).json({ message: "Account not found." });
      if (me[0].email_verified) {
        return res.status(400).json({ message: "Your email is already confirmed. Change it from your profile instead." });
      }
      const check = await validateEmail(newRaw);
      if (check.valid === false) {
        return res.status(400).json({ message: check.message, reason: check.reason, suggestion: (check as any).suggestion });
      }
      const clean = check.normalized;
      if (clean === me[0].email.toLowerCase()) {
        return res.status(400).json({ message: "That's the same email. Check the spelling, or try a different address." });
      }
      const { rowCount: taken } = await pool.query(
        `SELECT 1 FROM users WHERE LOWER(email) = $1 AND id <> $2 LIMIT 1`, [clean, userId],
      );
      if (taken) {
        return res.status(409).json({ message: "That email already has an account. Sign in with it instead.", code: "EMAIL_TAKEN" });
      }
      await pool.query(`UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2 AND email_verified IS NOT TRUE`, [clean, userId]);
      invalidateAuthUserCache(userId);
      try { await setSessionUserId(req, userId); } catch { /* non-fatal */ }
      logAuthEvent(req, "email_changed", "email", userId);
      console.log(`[Auth][change-unverified-email] userId=${userId} ${me[0].email} -> ${clean}`);
      const sent = await sendEmailVerificationCode(userId, clean);
      res.json({
        ok: true,
        email: clean,
        expiresAt: sent.expiresAt,
        message: sent.ok ? `Email updated. We sent a new code to ${clean}.` : (sent.message || "Email updated, but we couldn't send the code. Tap Resend."),
      });
    } catch (err: any) {
      console.error("[Auth][change-unverified-email] error:", err?.message);
      res.status(500).json({ message: "Couldn't update your email right now. Please try again." });
    }
  });

  app.post("/api/auth/verify-phone", async (req: Request, res: Response) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Please sign in first." });
    const code = String(req.body?.code ?? "");
    const result = await verifyCode(userId, "sms", code);
    if (!result.ok) return res.status(400).json({ message: result.message, reason: result.reason });
    res.json({ ok: true, message: result.message });
  });

  app.get("/api/auth/verification-status", async (req: Request, res: Response) => {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ message: "Please sign in first." });
    const r = await pool.query<{
      email: string;
      phone: string | null;
      email_verified: boolean;
      phone_verified: boolean;
      is_admin: boolean;
      role: string;
    }>(
      `SELECT email, phone, email_verified, phone_verified, is_admin, role FROM users WHERE id = $1`,
      [userId],
    );
    const u = r.rows[0];
    if (!u) return res.status(404).json({ message: "User not found." });
    const isAdmin = u.is_admin || u.role === "ADMIN" || u.role === "SUPER_ADMIN";

    // 2026-09 (Tony's "3+ codes, can't verify" report): tell the client
    // whether a still-valid, unused email code already exists so it does
    // NOT blindly fire another send on every page load/visit. Every send
    // invalidates the previous code (see invalidatePriorCodes) — silently
    // re-sending on each visit was the actual cause of the "keeps sending
    // codes, can't verify" loop, not a delivery problem.
    let hasPendingEmailCode = false;
    try {
      const codeRow = await pool.query<{ expires_at: string }>(
        `SELECT expires_at FROM verification_codes
          WHERE user_id = $1 AND channel = 'email' AND used_at IS NULL
          ORDER BY created_at DESC LIMIT 1`,
        [userId],
      );
      const pending = codeRow.rows[0];
      hasPendingEmailCode = !!pending && new Date(pending.expires_at) > new Date();
    } catch (e: any) {
      console.warn("[Auth][verification-status] pending-code lookup failed:", e?.message);
    }

    // EMAIL-ONLY verification policy: phoneVerified is ALWAYS reported true
    // so the client never gates anything on it. Phone column is preserved
    // for M-Pesa STK push but is no longer a verification gate.
    res.json({
      email: u.email,
      phone: u.phone,
      emailVerified: u.email_verified || isAdmin,
      phoneVerified: true,
      isAdmin,
      hasPendingEmailCode,
    });
  });

  // ── Admin override: mark a user phone-verified manually ──────────────────
  // Use this when SMS delivery is broken (Twilio not configured, account
  // suspended, A2P 10DLC pending, etc.) AND support has confirmed the user
  // owns the number through another channel (WhatsApp callback, etc.).
  app.post("/api/auth/admin/force-verify-phone", async (req: Request, res: Response) => {
    const userId = (req.session as any)?.customUserId as string | undefined;
    if (!userId) return res.status(401).json({ message: "Please sign in." });
    const me = await pool.query<{ is_admin: boolean; role: string }>(
      `SELECT is_admin, role FROM users WHERE id = $1`,
      [userId],
    );
    const isAdmin = me.rows[0]?.is_admin || me.rows[0]?.role === "ADMIN" || me.rows[0]?.role === "SUPER_ADMIN";
    if (!isAdmin) return res.status(403).json({ message: "Admin only." });

    const targetUserId = String(req.body?.userId ?? "").trim();
    const phone        = String(req.body?.phone  ?? "").trim();
    if (!targetUserId || !phone) {
      return res.status(400).json({ message: "userId and phone are required." });
    }
    await pool.query(
      `UPDATE users SET phone = $1, phone_verified = true, updated_at = NOW() WHERE id = $2`,
      [phone, targetUserId],
    );
    console.warn(`[Auth] ADMIN force-verified phone for userId=${targetUserId} phone=${phone} by admin=${userId}`);
    res.json({ ok: true, message: "Phone marked as verified." });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PWA install tracking
  //
  // The client calls these so we can answer "does this user have the app
  // installed on this device, or did they install it once and then uninstall?"
  // — used by the install prompt to swap copy between "Install our app?" and
  // "Looks like you removed the app — reinstall?".
  //
  // Both endpoints are silent no-ops for signed-out users so the client can
  // call them unconditionally without checking auth first.
  // ─────────────────────────────────────────────────────────────────────────
  app.post("/api/pwa/event", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.customUserId as string | undefined;
      const rawType = String(req.body?.type ?? "").trim();
      const allowed: PwaEventType[] = ["installed", "standalone-open", "uninstall-detected"];
      if (!allowed.includes(rawType as PwaEventType)) {
        return res.status(400).json({ ok: false, message: "Unknown event type." });
      }
      if (!userId) {
        // Signed-out — silently accept so the client doesn't have to branch.
        return res.json({ ok: true, recorded: false });
      }
      await recordPwaEvent(userId, rawType as PwaEventType);
      res.json({ ok: true, recorded: true });
    } catch (err: any) {
      console.warn("[Auth] /api/pwa/event error:", err?.message);
      res.json({ ok: true, recorded: false }); // never break the UI for telemetry
    }
  });

  app.get("/api/pwa/status", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.customUserId as string | undefined;
      if (!userId) {
        return res.json({
          installedAt: null,
          lastStandaloneAt: null,
          uninstallSeenAt: null,
          likelyUninstalled: false,
          signedIn: false,
        });
      }
      const status = await getPwaStatus(userId);
      res.json({ ...status, signedIn: true });
    } catch (err: any) {
      console.warn("[Auth] /api/pwa/status error:", err?.message);
      res.json({
        installedAt: null,
        lastStandaloneAt: null,
        uninstallSeenAt: null,
        likelyUninstalled: false,
        signedIn: false,
      });
    }
  });

  // Startup diagnostic — exposes whether SMS delivery is configured.
  const hasTwilio = Boolean(
    (process.env.TWILIO_ACCOUNT_SID || "").trim() &&
    (process.env.TWILIO_AUTH_TOKEN  || "").trim() &&
    ((process.env.TWILIO_SMS_FROM || "").trim() || (process.env.TWILIO_WHATSAPP_FROM || "").trim())
  );
  console.log(`[Auth] Twilio SMS configured: ${hasTwilio ? "YES" : "NO - phone OTP delivery will fail. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_SMS_FROM (or TWILIO_WHATSAPP_FROM) in Render env."}`);
  console.log("[Auth] Email/password routes registered: /api/auth/register, /api/auth/login, /api/auth/logout, /api/auth/user, /api/auth/forgot-password, /api/auth/reset-password, /api/auth/send-email-code, /api/auth/verify-email, /api/auth/verification-status, /api/pwa/event, /api/pwa/status");
}
