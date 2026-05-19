import type { Express, Request, Response } from "express";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { users } from "@shared/models/auth";

// Email + password auth routes (replaces the disabled stub).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const rawEmail = String(req.body?.email ?? "").trim().toLowerCase();
      const password = String(req.body?.password ?? "");
      const firstName = req.body?.firstName ? String(req.body.firstName).trim() : null;
      const lastName  = req.body?.lastName  ? String(req.body.lastName).trim()  : null;

      if (!rawEmail || !EMAIL_RE.test(rawEmail)) {
        return res.status(400).json({ message: "Please enter a valid email address." });
      }
      if (!password || password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters." });
      }

      const [existing] = await db.select().from(users).where(eq(users.email, rawEmail)).limit(1);
      if (existing) {
        return res.status(409).json({ message: "An account with that email already exists. Try signing in instead." });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const [created] = await db
        .insert(users)
        .values({
          email: rawEmail,
          passwordHash,
          authMethod: "email",
          firstName,
          lastName,
        })
        .returning();

      if (!created) {
        return res.status(500).json({ message: "Could not create your account. Please try again." });
      }

      await setSessionUserId(req, created.id);
      res.json({ id: created.id, email: created.email });
    } catch (err: any) {
      console.error("[Auth][register] error:", err?.message);
      if (err?.code === "23505") {
        return res.status(409).json({ message: "An account with that email already exists. Try signing in instead." });
      }
      res.status(500).json({ message: "Registration failed. Please try again." });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const rawEmail = String(req.body?.email ?? "").trim().toLowerCase();
      const password = String(req.body?.password ?? "");

      if (!rawEmail || !password) {
        return res.status(400).json({ message: "Email and password are required." });
      }

      const [user] = await db.select().from(users).where(eq(users.email, rawEmail)).limit(1);
      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "Invalid email or password." });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ message: "Invalid email or password." });
      }

      await setSessionUserId(req, user.id);
      res.json({ id: user.id, email: user.email });
    } catch (err: any) {
      console.error("[Auth][login] error:", err?.message);
      res.status(500).json({ message: "Login failed. Please try again." });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    if (typeof req.session?.destroy === "function") {
      req.session.destroy(() => res.json({ success: true }));
    } else {
      res.json({ success: true });
    }
  });

  app.get("/api/auth/user", async (req: Request, res: Response) => {
    const userId = (req.session as any)?.customUserId as string | undefined;
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      // Stale session — the row that customUserId pointed at is gone.
      // Destroy the session so the client gets a clean login next time,
      // and return 401 (not 404) so the auth hook treats it as logged-out
      // instead of "user missing" (which used to bounce the modal back).
      const sess = req.session as any;
      if (sess && typeof sess.destroy === "function") {
        sess.destroy(() => {
          res.clearCookie("connect.sid");
          res.status(401).json({ message: "Session expired. Please sign in again." });
        });
      } else {
        res.status(401).json({ message: "Session expired. Please sign in again." });
      }
      return;
    }
    res.json(user);
  });

  console.log("[Auth] Email/password routes registered: /api/auth/register, /api/auth/login, /api/auth/logout, /api/auth/user");
}
