"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerEmailAdminRoutes = registerEmailAdminRoutes;
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("../db");
const email_1 = require("../email");
const email_providers_1 = require("../lib/email-providers");
function sha256(s) {
    return crypto_1.default.createHash("sha256").update(s).digest("hex");
}
function generateCode() {
    return crypto_1.default.randomInt(0, 1000000).toString().padStart(6, "0");
}
function registerEmailAdminRoutes(app, isAuthenticated, isAdmin) {
    // ─── 1. Provider diagnostic ─────────────────────────────────────────────
    app.get("/api/admin/email/diagnostics", isAuthenticated, isAdmin, async (_req, res) => {
        const providers = (0, email_providers_1.getProviderStats)();
        const recent = (0, email_providers_1.getRecentEmailAttempts)(50);
        // Last 1h verification-code summary from DB
        let codesLastHour = 0;
        let unverifiedSignupsLast24h = 0;
        try {
            const a = await db_1.pool.query(`SELECT COUNT(*)::text AS count FROM verification_codes
         WHERE channel = 'email' AND created_at > NOW() - INTERVAL '1 hour'`);
            codesLastHour = Number(a.rows[0]?.count ?? 0);
            const b = await db_1.pool.query(`SELECT COUNT(*)::text AS count FROM users
         WHERE email_verified = false
           AND created_at > NOW() - INTERVAL '24 hours'`);
            unverifiedSignupsLast24h = Number(b.rows[0]?.count ?? 0);
        }
        catch (err) {
            console.warn("[email-admin/diagnostics] DB query failed:", err?.message);
        }
        res.json({
            providers,
            activeProfile: (0, email_providers_1.getActiveSmtpProfile)(),
            configuredFrom: (process.env.SMTP_FROM || process.env.EMAIL_FROM || "").trim() || null,
            codesGeneratedLastHour: codesLastHour,
            unverifiedSignupsLast24h,
            recentAttempts: recent.map((a) => ({
                at: a.at,
                to: a.to.replace(/(.{2}).*(@.*)/, "$1***$2"), // partial mask
                subject: a.subject,
                success: a.success,
                provider: a.provider,
                errorCode: a.errorCode,
                error: a.error?.slice(0, 200),
                durationMs: a.durationMs,
            })),
        });
    });
    // ─── 2. Test email ──────────────────────────────────────────────────────
    app.post("/api/admin/email/test", isAuthenticated, isAdmin, async (req, res) => {
        const to = String(req.body?.to || "").trim();
        if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
            return res.status(400).json({ message: "Provide a valid recipient email." });
        }
        const code = generateCode();
        const html = `<div style="font-family:sans-serif;padding:24px;">
      <h2>WorkAbroad Hub — Test Email</h2>
      <p>This is a test from the admin diagnostic tool.</p>
      <p>Test code: <strong style="font-size:24px;letter-spacing:6px;">${code}</strong></p>
      <p style="font-size:12px;color:#666;">Sent at: ${new Date().toISOString()}</p>
    </div>`;
        const result = await (0, email_1.sendEmail)({
            to,
            subject: `WorkAbroad Hub — Test Email (${code})`,
            html,
            text: `WorkAbroad Hub test email. Code: ${code}`,
        });
        res.json({
            success: result.success,
            messageId: result.messageId,
            error: result.error,
            to,
            testCode: code, // shown to admin for confirmation
        });
    });
    // ─── 3. Resend verification code (admin sees the code too) ──────────────
    app.post("/api/admin/email/resend-code/:userId", isAuthenticated, isAdmin, async (req, res) => {
        const userId = String(req.params.userId);
        try {
            const r = await db_1.pool.query(`SELECT email, email_verified, first_name FROM users WHERE id = $1`, [userId]);
            const u = r.rows[0];
            if (!u)
                return res.status(404).json({ message: "User not found" });
            if (u.email_verified) {
                return res.json({ ok: true, alreadyVerified: true, message: "User is already verified." });
            }
            // Invalidate prior codes + insert a fresh one
            await db_1.pool.query(`UPDATE verification_codes SET used_at = NOW()
         WHERE user_id = $1 AND channel = 'email' AND used_at IS NULL`, [userId]);
            const code = generateCode();
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
            await db_1.pool.query(`INSERT INTO verification_codes (user_id, channel, destination, code_hash, expires_at)
         VALUES ($1, 'email', $2, $3, $4)`, [userId, u.email.toLowerCase(), sha256(code), expiresAt]);
            // Try to send via email
            const html = `<div style="font-family:sans-serif;padding:24px;">
        <h2>Your verification code (admin-resent)</h2>
        <p>Hi ${u.first_name || "there"},</p>
        <p>Here's a new verification code (sent at the request of our support team):</p>
        <p style="font-size:32px;letter-spacing:8px;background:#f0fdf4;color:#15803d;text-align:center;padding:16px;border-radius:8px;">
          <strong>${code}</strong>
        </p>
        <p>Enter this in the app to verify your email. Expires in 10 minutes.</p>
      </div>`;
            const sendResult = await (0, email_1.sendEmail)({
                to: u.email,
                subject: `Your WorkAbroad Hub verification code: ${code}`,
                html,
                text: `Your WorkAbroad Hub verification code: ${code}. Expires in 10 minutes.`,
            });
            // Always return the plaintext code so admin can WhatsApp/call it to the
            // user when email delivery is failing. This is the whole point of this
            // endpoint — gated behind admin auth.
            res.json({
                ok: true,
                emailSentSuccessfully: sendResult.success,
                sendError: sendResult.error,
                code, // ← plaintext for admin to relay manually
                expiresAt,
                userEmail: u.email,
                instructions: sendResult.success
                    ? "Email sent. Tell the user to check inbox AND spam."
                    : "Email did NOT send. Read this code to the user over phone/WhatsApp.",
            });
        }
        catch (err) {
            console.error("[email-admin/resend-code]", err?.message);
            res.status(500).json({ message: "Failed to generate code", error: err?.message });
        }
    });
    // ─── 4. Emergency force-verify (skip email entirely) ────────────────────
    app.post("/api/admin/email/force-verify/:userId", isAuthenticated, isAdmin, async (req, res) => {
        const userId = String(req.params.userId);
        const reason = String(req.body?.reason || "admin-override").slice(0, 200);
        try {
            const r = await db_1.pool.query(`SELECT email, email_verified FROM users WHERE id = $1`, [userId]);
            const u = r.rows[0];
            if (!u)
                return res.status(404).json({ message: "User not found" });
            if (u.email_verified) {
                return res.json({ ok: true, alreadyVerified: true });
            }
            await db_1.pool.query(`UPDATE users SET email_verified = true, email_verified_at = NOW(), updated_at = NOW() WHERE id = $1`, [userId]);
            // Mark any outstanding codes used so they don't lock the user later
            await db_1.pool.query(`UPDATE verification_codes SET used_at = NOW()
         WHERE user_id = $1 AND channel = 'email' AND used_at IS NULL`, [userId]);
            console.log(`[email-admin/force-verify] userId=${userId} email=${u.email} reason="${reason}"`);
            res.json({
                ok: true,
                userId,
                email: u.email,
                reason,
                message: "Email forcibly marked as verified. User can now proceed without entering a code.",
            });
        }
        catch (err) {
            console.error("[email-admin/force-verify]", err?.message);
            res.status(500).json({ message: "Failed to force-verify", error: err?.message });
        }
    });
    // ─── 5. Manual password-reset link (admin escape hatch) ─────────────────
    //
    // Use case: user is locked out and forgot-password emails aren't reaching
    // them. Admin looks up the user by email; this endpoint issues a fresh
    // reset token, sends the reset link via BOTH email and WhatsApp, and
    // RETURNS the raw URL to the admin so they can copy-paste it directly
    // (WhatsApp DM, phone call, whatever works). Gated behind admin auth.
    app.post("/api/admin/auth/manual-reset-link", isAuthenticated, isAdmin, async (req, res) => {
        const email = String(req.body?.email ?? "").trim().toLowerCase();
        if (!email)
            return res.status(400).json({ message: "email is required" });
        const adminId = req.user?.claims?.sub ?? req.user?.id ?? "unknown";
        try {
            const { rows } = await db_1.pool.query(`SELECT id, first_name, phone FROM users WHERE email = $1 LIMIT 1`, [email]);
            const user = rows[0];
            if (!user)
                return res.status(404).json({ message: `No user found with email ${email}` });
            const token = crypto_1.default.randomBytes(48).toString("hex");
            const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
            await db_1.pool.query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`, [user.id]);
            const inserted = await db_1.pool.query(`INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3) RETURNING id`, [user.id, token, expiresAt]);
            const tokenId = inserted.rows[0]?.id ?? null;
            const appUrl = (process.env.APP_URL || "https://workabroadhub.tech").replace(/\/+$/, "");
            const resetUrl = `${appUrl}/reset-password?token=${token}`;
            const name = (user.first_name || "there").toString();
            let emailStatus = "failed";
            let emailProvider = null;
            let emailMessageId = null;
            let emailError = null;
            try {
                const html = `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:auto;padding:24px;color:#1a2530;"><h2>Reset your WorkAbroad Hub password</h2><p>Hi ${name},</p><p>Support has generated this password-reset link for you. It works for 1 hour.</p><p style="margin:24px 0;"><a href="${resetUrl}" style="display:inline-block;background:#0f766e;color:#fff;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">Reset password</a></p><p style="font-size:13px;color:#475569;">Or copy this link: <a href="${resetUrl}">${resetUrl}</a></p></div>`;
                const text = `Hi ${name},\n\nSupport-issued password reset link (1 hour): ${resetUrl}\n\n— WorkAbroad Hub`;
                const r = await (0, email_1.sendEmail)({ to: email, subject: "Your WorkAbroad Hub password reset link", html, text });
                if (r.success) {
                    emailStatus = "sent";
                    emailMessageId = r.messageId ?? null;
                    emailProvider = "smtp";
                }
                else {
                    emailError = (r.error ?? "unknown").slice(0, 500);
                }
            }
            catch (e) {
                emailError = String(e?.message ?? "email threw").slice(0, 500);
            }
            let whatsappStatus = "skipped";
            let whatsappError = null;
            if (user.phone) {
                try {
                    const { sendWhatsApp } = await Promise.resolve().then(() => __importStar(require("../services/whatsapp")));
                    const waMsg = `WorkAbroad Hub password reset\n\nHi ${name}, tap this link to set a new password. It works for 1 hour:\n${resetUrl}\n\nIssued by support at your request.`;
                    await sendWhatsApp(user.phone, waMsg);
                    whatsappStatus = "sent";
                }
                catch (e) {
                    whatsappStatus = "failed";
                    whatsappError = String(e?.message ?? "whatsapp threw").slice(0, 500);
                }
            }
            try {
                await db_1.pool.query(`INSERT INTO password_reset_attempts
               (user_id, email, token_id,
                email_status, email_provider, email_message_id, email_error,
                whatsapp_status, whatsapp_error,
                ip_address, user_agent)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`, [user.id, email, tokenId,
                    emailStatus, emailProvider, emailMessageId, emailError,
                    whatsappStatus, whatsappError,
                    `admin:${adminId}`, "manual-reset-link"]);
            }
            catch (logErr) {
                console.error("[manual-reset-link] could not log attempt:", logErr?.message);
            }
            console.log(`[manual-reset-link] admin=${adminId} target=${email} email=${emailStatus} whatsapp=${whatsappStatus}`);
            return res.json({
                ok: true,
                email,
                userId: user.id,
                resetUrl,
                expiresAt: expiresAt.toISOString(),
                delivery: {
                    email: { status: emailStatus, error: emailError },
                    whatsapp: { status: whatsappStatus, error: whatsappError },
                },
            });
        }
        catch (err) {
            console.error("[manual-reset-link] error:", err);
            return res.status(500).json({ message: "Could not generate reset link", error: err?.message });
        }
    });
    // ─── 6. Recent password-reset attempts (durable log) ────────────────────
    app.get("/api/admin/auth/reset-attempts", isAuthenticated, isAdmin, async (req, res) => {
        const email = String(req.query.email ?? "").trim().toLowerCase();
        const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 500);
        try {
            const params = [];
            let where = "";
            if (email) {
                params.push(email);
                where = `WHERE LOWER(email) = $1`;
            }
            params.push(limit);
            const { rows } = await db_1.pool.query(`SELECT id, user_id, email, token_id,
                  email_status, email_provider, email_message_id, email_error,
                  whatsapp_status, whatsapp_error,
                  ip_address, user_agent, requested_at
             FROM password_reset_attempts
             ${where}
             ORDER BY requested_at DESC
             LIMIT $${params.length}`, params);
            return res.json({ attempts: rows, count: rows.length });
        }
        catch (err) {
            console.error("[reset-attempts] error:", err?.message);
            return res.status(500).json({ message: "Could not load attempts" });
        }
    });
    console.log("[email-admin] Routes registered: /api/admin/email/{diagnostics,test,resend-code/:userId,force-verify/:userId}, /api/admin/auth/{manual-reset-link,reset-attempts}");
}
