"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAuthRoutes = registerAuthRoutes;
const bcrypt_1 = __importDefault(require("bcrypt"));
const crypto_1 = __importDefault(require("crypto"));
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../../db");
const auth_1 = require("@shared/models/auth");
const email_1 = require("../../email");
// Email + password auth routes (replaces the disabled stub).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
function appBaseUrl() {
    const explicit = (process.env.APP_URL || "").trim().replace(/\/+$/, "");
    if (explicit)
        return explicit;
    // Production fallback when APP_URL is not configured — used for password
    // reset email links etc. Set APP_URL in Render → Environment for new hosts.
    return "https://workabroadhub.tech";
}
function setSessionUserId(req, userId) {
    return new Promise((resolve) => {
        req.session.customUserId = userId;
        if (typeof req.session?.save === "function") {
            req.session.save(() => resolve());
        }
        else {
            resolve();
        }
    });
}
function registerAuthRoutes(app) {
    app.post("/api/auth/register", async (req, res) => {
        try {
            const rawEmail = String(req.body?.email ?? "").trim().toLowerCase();
            const password = String(req.body?.password ?? "");
            const firstName = req.body?.firstName ? String(req.body.firstName).trim() : null;
            const lastName = req.body?.lastName ? String(req.body.lastName).trim() : null;
            if (!rawEmail || !EMAIL_RE.test(rawEmail)) {
                return res.status(400).json({ message: "Please enter a valid email address." });
            }
            if (!password || password.length < 8) {
                return res.status(400).json({ message: "Password must be at least 8 characters." });
            }
            const [existing] = await db_1.db.select().from(auth_1.users).where((0, drizzle_orm_1.eq)(auth_1.users.email, rawEmail)).limit(1);
            if (existing) {
                return res.status(409).json({ message: "An account with that email already exists. Try signing in instead." });
            }
            const passwordHash = await bcrypt_1.default.hash(password, 12);
            const [created] = await db_1.db
                .insert(auth_1.users)
                .values({ email: rawEmail, passwordHash, authMethod: "email", firstName, lastName })
                .returning();
            if (!created) {
                return res.status(500).json({ message: "Could not create your account. Please try again." });
            }
            await setSessionUserId(req, created.id);
            res.json({ id: created.id, email: created.email });
        }
        catch (err) {
            console.error("[Auth][register] error:", err?.message);
            if (err?.code === "23505") {
                return res.status(409).json({ message: "An account with that email already exists. Try signing in instead." });
            }
            res.status(500).json({ message: "Registration failed. Please try again." });
        }
    });
    app.post("/api/auth/login", async (req, res) => {
        try {
            const rawEmail = String(req.body?.email ?? "").trim().toLowerCase();
            const password = String(req.body?.password ?? "");
            if (!rawEmail || !password) {
                return res.status(400).json({ message: "Email and password are required." });
            }
            const [user] = await db_1.db.select().from(auth_1.users).where((0, drizzle_orm_1.eq)(auth_1.users.email, rawEmail)).limit(1);
            if (!user || !user.passwordHash) {
                return res.status(401).json({ message: "Invalid email or password." });
            }
            const valid = await bcrypt_1.default.compare(password, user.passwordHash);
            if (!valid) {
                return res.status(401).json({ message: "Invalid email or password." });
            }
            await setSessionUserId(req, user.id);
            res.json({ id: user.id, email: user.email });
        }
        catch (err) {
            console.error("[Auth][login] error:", err?.message);
            res.status(500).json({ message: "Login failed. Please try again." });
        }
    });
    app.post("/api/auth/logout", (req, res) => {
        if (typeof req.session?.destroy === "function") {
            req.session.destroy(() => res.json({ success: true }));
        }
        else {
            res.json({ success: true });
        }
    });
    app.get("/api/auth/user", async (req, res) => {
        try {
            const userId = req.session?.customUserId;
            if (!userId) {
                return res.status(401).json({ message: "Not authenticated" });
            }
            const [user] = await db_1.db.select().from(auth_1.users).where((0, drizzle_orm_1.eq)(auth_1.users.id, userId)).limit(1);
            if (!user) {
                // Stale session — destroy it so the client gets a clean login next time.
                const sess = req.session;
                if (sess && typeof sess.destroy === "function") {
                    sess.destroy(() => {
                        res.clearCookie("connect.sid");
                        res.status(401).json({ message: "Session expired. Please sign in again." });
                    });
                }
                else {
                    res.status(401).json({ message: "Session expired. Please sign in again." });
                }
                return;
            }
            res.json(user);
        }
        catch (err) {
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
    app.post("/api/auth/forgot-password", async (req, res) => {
        try {
            const rawEmail = String(req.body?.email ?? "").trim().toLowerCase();
            if (!rawEmail || !EMAIL_RE.test(rawEmail)) {
                return res.status(400).json({ message: "Please enter a valid email address." });
            }
            const [user] = await db_1.db.select().from(auth_1.users).where((0, drizzle_orm_1.eq)(auth_1.users.email, rawEmail)).limit(1);
            if (user) {
                const token = crypto_1.default.randomBytes(48).toString("hex");
                const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
                // Invalidate prior unused tokens, then insert new one.
                await db_1.pool.query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`, [user.id]);
                await db_1.pool.query(`INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`, [user.id, token, expiresAt]);
                const resetUrl = `${appBaseUrl()}/reset-password?token=${token}`;
                const name = (user.firstName || "there").toString();
                const html = `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:auto;padding:24px;color:#1a2530;"><h2 style="margin:0 0 12px;">Reset your WorkAbroad Hub password</h2><p>Hi ${name},</p><p>We received a request to reset the password for the account tied to <strong>${rawEmail}</strong>. Click the button below to set a new password. The link expires in 1 hour.</p><p style="margin:24px 0;"><a href="${resetUrl}" style="display:inline-block;background:#0f766e;color:#fff;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;">Reset password</a></p><p style="font-size:13px;color:#475569;">If the button does not work, copy this link into your browser:<br><a href="${resetUrl}" style="color:#1d4ed8;word-break:break-all;">${resetUrl}</a></p><p style="font-size:13px;color:#475569;">Did not ask for this? You can safely ignore this email — your password will not change unless you click the link above.</p><p style="margin-top:32px;font-size:13px;color:#475569;">— The WorkAbroad Hub team</p></div>`;
                const text = `Hi ${name},\n\nReset link (expires in 1 hour): ${resetUrl}\n\nDid not ask for this? Ignore this email.\n\n— WorkAbroad Hub`;
                (0, email_1.sendEmail)({ to: rawEmail, subject: "Reset your WorkAbroad Hub password", html, text })
                    .catch((e) => console.error("[Auth][forgot-password] sendEmail failed:", e?.message));
            }
            res.json({ ok: true, message: "If an account exists for that email, a reset link has been sent." });
        }
        catch (err) {
            console.error("[Auth][forgot-password] error:", err?.message);
            res.json({ ok: true, message: "If an account exists for that email, a reset link has been sent." });
        }
    });
    app.post("/api/auth/reset-password", async (req, res) => {
        try {
            const token = String(req.body?.token ?? "").trim();
            const password = String(req.body?.password ?? "");
            if (!token || token.length < 32) {
                return res.status(400).json({ message: "Invalid or missing reset token." });
            }
            if (!password || password.length < 8) {
                return res.status(400).json({ message: "Password must be at least 8 characters." });
            }
            const result = await db_1.pool.query(`SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token = $1 LIMIT 1`, [token]);
            const row = result.rows[0];
            if (!row)
                return res.status(400).json({ message: "This reset link is invalid. Request a new one." });
            if (row.used_at)
                return res.status(400).json({ message: "This reset link has already been used. Request a new one." });
            if (new Date(row.expires_at) < new Date()) {
                return res.status(400).json({ message: "This reset link has expired. Request a new one." });
            }
            const passwordHash = await bcrypt_1.default.hash(password, 12);
            await db_1.pool.query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [passwordHash, row.user_id]);
            await db_1.pool.query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`, [row.id]);
            console.log(`[Auth][reset-password] Password updated for userId=${row.user_id}`);
            res.json({ ok: true, message: "Password updated. You can now sign in with your new password." });
        }
        catch (err) {
            console.error("[Auth][reset-password] error:", err?.message);
            res.status(500).json({ message: "Failed to reset password. Please try again." });
        }
    });
    console.log("[Auth] Email/password routes registered: /api/auth/register, /api/auth/login, /api/auth/logout, /api/auth/user, /api/auth/forgot-password, /api/auth/reset-password");
}
