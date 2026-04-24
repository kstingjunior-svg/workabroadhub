import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { db, pool } from "../../db";
import { users } from "@shared/models/auth";
import { activityEvents } from "@shared/schema";
import { eq, count, sql } from "drizzle-orm";
import bcrypt from "bcrypt";
import { z } from "zod";
import { broadcastNewUserEvent, broadcastStatsUpdate } from "../../websocket";
import { sendEmail } from "../../email";
import crypto from "crypto";
import { syncUserToSupabase } from "../../supabaseClient";

// In-memory password reset token store: token -> { userId, email, expires }
const resetTokens = new Map<string, { userId: number; email: string; expires: number }>();
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Purge expired tokens every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of resetTokens.entries()) {
    if (data.expires < now) resetTokens.delete(token);
  }
}, 5 * 60 * 1000);

const COUNTRY_NAMES: Record<string, string> = {
  KE: "Kenya", UG: "Uganda", TZ: "Tanzania", RW: "Rwanda", ET: "Ethiopia",
  GH: "Ghana", NG: "Nigeria", ZA: "South Africa", ZM: "Zambia", ZW: "Zimbabwe",
  US: "USA", GB: "UK", CA: "Canada", AU: "Australia", AE: "UAE",
  DE: "Germany", NL: "Netherlands", FR: "France", SE: "Sweden", NO: "Norway",
};
function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  return COUNTRY_NAMES[code.toUpperCase()] || null;
}

const BCRYPT_ROUNDS = 12;

const registerSchema = z.object({
  firstName: z.string().min(2, "Name must be at least 2 characters"),
  lastName: z.string().optional().default(""),
  email: z.string().email("Please enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  phone: z.string().optional(),
  referral_code: z.string().optional(), // ?ref= captured from the signup URL
});

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export function registerAuthRoutes(app: Express): void {
  // ── GET current authenticated user ──────────────────────────────────────
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      let user = await authStorage.getUser(userId);

      // Guard: if the user is authenticated via OIDC but their DB row was never
      // created (e.g. the callback upsert failed transiently), create it now so
      // the client gets a valid user object instead of an empty response.
      if (!user && req.user.claims) {
        const claims = req.user.claims;
        try {
          user = await authStorage.upsertUser({
            id: userId,
            email: claims.email,
            firstName: claims.first_name,
            lastName: claims.last_name,
            profileImageUrl: claims.profile_image_url,
          });
          console.log(`[Auth] Late-upserted user ${userId} (${claims.email}) on /api/auth/user`);
        } catch (upsertErr: any) {
          console.error("[Auth] Late-upsert failed:", upsertErr?.message);
        }
      }

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // ── POST /api/auth/register — email/password sign-up ────────────────────
  app.post("/api/auth/register", async (req: any, res) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        const firstError = parsed.error.errors[0]?.message || "Invalid input";
        return res.status(400).json({ message: firstError });
      }

      const { firstName, lastName, email, password, phone: rawPhone, referral_code: ref } = parsed.data;
      const lowerEmail = email.toLowerCase().trim();

      const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, lowerEmail));
      if (existing) {
        return res.status(409).json({
          message: "An account with this email already exists. Please sign in instead.",
        });
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const { generateUniqueReferralCode } = await import("../../utils/referral-code");
      const referralCode = await generateUniqueReferralCode();

      // Normalize phone to 254XXXXXXXXX format if provided
      let normalizedPhone: string | undefined;
      if (rawPhone && rawPhone.trim()) {
        const { normalizePhone } = await import("../../utils/phone");
        normalizedPhone = normalizePhone(rawPhone.trim());
      }

      const [newUser] = await db
        .insert(users)
        .values({
          email: lowerEmail,
          firstName,
          lastName: lastName || "",
          passwordHash,
          authMethod: "email",
          referralCode,
          plan: "free",
          userStage: "new",
          isAdmin: false,
          isActive: true,
          ...(normalizedPhone ? { phone: normalizedPhone } : {}),
        })
        .returning();

      // Guard: ensure the row was actually persisted before returning success
      if (!newUser || !newUser.id) {
        console.error(`[Auth][Register] Insert returned no row for email: ${lowerEmail}`);
        return res.status(500).json({
          message: "Account could not be saved. Please try again.",
        });
      }

      // Verify the row exists in the DB (belt-and-suspenders read-back)
      const [persisted] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, newUser.id));

      if (!persisted) {
        console.error(`[Auth][Register] Row not found after insert — id=${newUser.id}, email=${lowerEmail}`);
        return res.status(500).json({
          message: "Account could not be confirmed in the database. Please try again.",
        });
      }

      // Stamp referred_by with the referral code — fire-and-forget, never blocks signup
      if (ref) {
        pool.query(
          `UPDATE users SET referred_by = $1 WHERE id = $2`,
          [ref, newUser.id]
        ).catch((err: any) =>
          console.error("[Auth][Referral] referred_by update failed:", err?.message)
        );
      }

      (req.session as any).customUserId = newUser.id;
      (req.session as any).userId = newUser.id;
      await new Promise<void>((resolve) => req.session.save(() => resolve()));

      const clientIp = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || req.socket?.remoteAddress || "";
      const clientUa = req.headers["user-agent"] || "";

      console.log(
        JSON.stringify({
          level: "info",
          ts: new Date().toISOString(),
          event: "user_signup",
          userId: newUser.id,
          email: lowerEmail,
          method: "email",
          ip: clientIp,
          userAgent: clientUa,
        })
      );

      // Real-time admin notification — fire and forget
      broadcastNewUserEvent({
        type: "new_user",
        userId: newUser.id,
        email: lowerEmail,
        firstName,
        method: "email",
        ip: clientIp,
        userAgent: clientUa,
        timestamp: new Date().toISOString(),
      });

      // Immediately push updated user counts to all connected admin dashboards
      db.select({ c: count() }).from(users)
        .then(([row]) => {
          broadcastStatsUpdate({
            totalUsers: Number(row?.c ?? 0),
            proUsers: 0,
            activeNow: 0,
            activeAuthenticated: 0,
          });
        }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      // Write real activity event — fire and forget, no personal data stored
      db.insert(activityEvents).values({
        type: "signup",
        location: countryName(newUser.country),
      }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      // Mirror to Firebase RTDB for real-time landing page feed
      import("../../services/firebaseRtdb").then(({ pushActivityEvent }) => {
        pushActivityEvent("signup", countryName(newUser.country), { firstName });
      }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      // Signup anomaly detection — fire and forget, never blocks the response
      import("../../services/signupAnomalyDetector").then(({ recordSignupEvent }) => {
        recordSignupEvent(clientIp, String(newUser.id), clientUa);
      }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      import("../../services/activityLogger").then(({ logActivity }) => {
        logActivity({
          event: "signup",
          userId: newUser.id,
          email: lowerEmail,
          meta: { method: "email", firstName, lastName },
          ip: clientIp,
        });
      }).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });

      console.log("CALLING SUPABASE SYNC NOW");
      await syncUserToSupabase({
        id: newUser.id,
        email: lowerEmail,
        phone: newUser.phone ?? null,
      });

      res.status(201).json({
        success: true,
        message: "Account created successfully!",
        user: {
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          plan: newUser.plan,
          isAdmin: newUser.isAdmin,
        },
      });
    } catch (error: any) {
      console.error("[Auth][Register] Error:", error.message);
      // Surface specific DB constraint errors clearly
      if (error.code === "23505") {
        return res.status(409).json({ message: "An account with this email already exists. Please sign in instead." });
      }
      res.status(500).json({ message: "Registration failed. Please try again." });
    }
  });

  // ── POST /api/auth/login — email/password sign-in ───────────────────────
  app.post("/api/auth/login", async (req: any, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const { email, password } = parsed.data;
      const lowerEmail = email.toLowerCase().trim();

      const [user] = await db.select().from(users).where(eq(users.email, lowerEmail));

      if (!user) {
        return res.status(401).json({
          message: "Invalid email or password. Please check your credentials and try again.",
        });
      }

      if (user.authMethod === "replit" && !user.passwordHash) {
        return res.status(400).json({
          message: "This account was created with Replit login. Please use the 'Continue with Replit' button.",
          code: "USE_REPLIT_AUTH",
        });
      }

      if (!user.passwordHash) {
        return res.status(401).json({ message: "Invalid email or password." });
      }

      const passwordMatch = await bcrypt.compare(password, user.passwordHash);
      if (!passwordMatch) {
        return res.status(401).json({
          message: "Invalid email or password. Please check your credentials and try again.",
        });
      }

      if (!user.isActive) {
        return res.status(403).json({
          message: "Your account has been deactivated. Please contact support.",
        });
      }

      await db.update(users).set({ lastLogin: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));

      (req.session as any).customUserId = user.id;
      (req.session as any).userId = user.id;
      await new Promise<void>((resolve) => req.session.save(() => resolve()));

      console.log(`[Auth][Login] User signed in: ${lowerEmail} (id=${user.id})`);

      res.json({
        success: true,
        message: "Signed in successfully!",
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          plan: user.plan,
          isAdmin: user.isAdmin,
        },
      });
    } catch (error: any) {
      console.error("[Auth][Login] Error:", error.message);
      res.status(500).json({ message: "Login failed. Please try again." });
    }
  });

  // ── POST /api/auth/forgot-password — send reset link ────────────────────
  app.post("/api/auth/forgot-password", async (req: any, res) => {
    try {
      const { email } = z.object({ email: z.string().email() }).parse(req.body);
      const lowerEmail = email.toLowerCase().trim();

      // Always respond 200 to prevent user enumeration
      const [user] = await db.select().from(users).where(eq(users.email, lowerEmail));
      if (!user || user.authMethod === "replit") {
        return res.json({ success: true });
      }

      // Generate a secure token
      const token = crypto.randomBytes(32).toString("hex");
      resetTokens.set(token, { userId: user.id, email: lowerEmail, expires: Date.now() + RESET_TOKEN_TTL_MS });

      const appUrl = process.env.APP_URL || "https://workabroadhub.tech";
      const resetUrl = `${appUrl}/reset-password?token=${token}`;
      const name = user.firstName || "there";

      await sendEmail({
        to: lowerEmail,
        subject: "Reset your WorkAbroad Hub password",
        html: `
          <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#fff;border-radius:16px;border:1px solid #E2DDD5">
            <div style="margin-bottom:24px">
              <span style="font-size:24px">🌍</span>
              <span style="font-size:14px;font-weight:600;color:#1A2530;vertical-align:middle;margin-left:6px">WorkAbroad Hub</span>
            </div>
            <h1 style="font-family:Georgia,serif;font-size:26px;color:#1A2530;margin:0 0 8px">Reset your password</h1>
            <p style="color:#5A6A7A;font-size:15px;line-height:1.6;margin:0 0 24px">
              Hi ${name}, we received a request to reset the password for your WorkAbroad Hub account.
              Click the button below to choose a new password. This link expires in 15 minutes.
            </p>
            <a href="${resetUrl}" style="display:inline-block;background:#1A2530;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;font-size:15px;margin-bottom:24px">
              Reset Password →
            </a>
            <p style="color:#7A8A9A;font-size:13px;line-height:1.6;margin:0">
              If you didn't request a password reset, you can safely ignore this email — your password won't change.<br><br>
              If the button doesn't work, copy this link:<br>
              <a href="${resetUrl}" style="color:#1A2530;word-break:break-all">${resetUrl}</a>
            </p>
          </div>
        `,
        text: `Hi ${name},\n\nReset your WorkAbroad Hub password:\n${resetUrl}\n\nThis link expires in 15 minutes.\n\nIf you didn't request this, please ignore this email.`,
      });

      console.log(`[Auth][ForgotPassword] Reset link sent to ${lowerEmail}`);
      res.json({ success: true });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: "Please provide a valid email address." });
      }
      console.error("[Auth][ForgotPassword] Error:", error.message);
      res.status(500).json({ message: "Could not send reset email. Please try again." });
    }
  });

  // ── POST /api/auth/reset-password — validate token + set new password ───
  app.post("/api/auth/reset-password", async (req: any, res) => {
    try {
      const { token, password } = z.object({
        token: z.string().min(32),
        password: z.string().min(8).regex(/[A-Z]/, "Must include uppercase").regex(/[0-9]/, "Must include number"),
      }).parse(req.body);

      const entry = resetTokens.get(token);
      if (!entry || entry.expires < Date.now()) {
        return res.status(400).json({ message: "This reset link has expired or is invalid. Please request a new one." });
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, entry.userId));
      resetTokens.delete(token);

      console.log(`[Auth][ResetPassword] Password reset for userId=${entry.userId}`);
      res.json({ success: true, message: "Password updated successfully." });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ message: error.errors?.[0]?.message || "Invalid input." });
      }
      console.error("[Auth][ResetPassword] Error:", error.message);
      res.status(500).json({ message: "Failed to reset password. Please try again." });
    }
  });

  // ── POST /api/auth/logout — clears all sessions ─────────────────────────
  app.post("/api/auth/logout", async (req: any, res) => {
    // Mark the user offline in the DB before the session is wiped
    const userId: string | undefined =
      req.user?.claims?.sub ??
      (req.session as any)?.userId ??
      (req.session as any)?.customUserId;

    const sessionId: string | undefined = req.session?.id;

    if (userId) {
      await db.update(users).set({ isOnline: false }).where(eq(users.id, userId)).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
    }
    if (sessionId) {
      await db.execute(
        sql`UPDATE active_sessions SET is_online = false WHERE session_id = ${sessionId}`
      ).catch((err) => { console.error('[] Unhandled rejection:', { error: err?.message, timestamp: new Date().toISOString() }); });
    }

    (req.session as any).customUserId = undefined;
    (req.session as any).userId = undefined;
    if (req.logout) req.logout(() => {});
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

}
