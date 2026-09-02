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
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyOrderNeedsReview = notifyOrderNeedsReview;
/**
 * service-order-notify — user notifications for special service-order states.
 *
 * 2026-08: created to support the CV Revamp quality guardrail. When the AI
 * output fails the length-ratio check (input < 85% or > 150%) even after a
 * retry, we do NOT auto-deliver. Instead the order goes into human-review
 * state and the user gets this message — softer than "failed", more honest
 * than pretending everything is fine.
 *
 * Kept in its own file so the guardrail import is cheap and doesn't drag in
 * every other route dependency of service-order-routes.ts.
 */
const db_1 = require("./db");
function escapeHtml(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
async function notifyOrderNeedsReview(orderId) {
    try {
        const { rows } = await db_1.pool.query(`SELECT user_id, service_name, service_slug
       FROM service_orders
       WHERE id = $1 AND needs_human_review = true`, [orderId]);
        const order = rows[0];
        if (!order)
            return;
        const { rows: userRows } = await db_1.pool.query(`SELECT email, phone, first_name FROM users WHERE id = $1`, [order.user_id]);
        const user = userRows[0];
        if (!user)
            return;
        const firstName = (user.first_name || "").split(/\s+/)[0] || "there";
        const serviceName = order.service_name || "document";
        const appOrigin = (process.env.APP_ORIGIN || "https://workabroadhub.tech").replace(/\/$/, "");
        const orderUrl = `${appOrigin}/order/${orderId}`;
        const supportPhone = (process.env.WHATSAPP_SUPPORT_NUMBER || process.env.ADMIN_PHONE_NUMBER || "")
            .replace(/^\+?/, "");
        const supportLine = supportPhone
            ? `\n\nQuestions? WhatsApp us on wa.me/${supportPhone} — Tony reads every message personally.`
            : `\n\nQuestions? Reply here — Tony reads every message personally.`;
        // ── Email ────────────────────────────────────────────────────────────────
        if (user.email) {
            try {
                const { sendWithFailover } = await Promise.resolve().then(() => __importStar(require("./lib/email-providers")));
                const html = `
          <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">
            <h1 style="font-size:22px;font-weight:700;color:#c2410c;margin:0 0 12px">Your ${escapeHtml(serviceName)} is being personally reviewed</h1>
            <p style="font-size:15px;line-height:1.6;margin:0 0 14px">
              Hi ${escapeHtml(firstName)}, our AI produced a first draft of your ${escapeHtml(serviceName.toLowerCase())} but the length didn't match what we'd expect from a CV of your size.
            </p>
            <p style="font-size:15px;line-height:1.6;margin:0 0 14px">
              Rather than send you something that lost important details from your original, we've flagged it for a personal review. <strong>You'll get your polished ${escapeHtml(serviceName.toLowerCase())} within 4 hours</strong> — same day, no extra charge.
            </p>
            <p style="font-size:15px;line-height:1.6;margin:0 0 20px">
              Your original CV is safe with us. Nothing was lost.
            </p>
            <a href="${orderUrl}" style="display:inline-block;background:linear-gradient(90deg,#f97316,#ea580c);color:#fff;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px">
              Check order status →
            </a>
            <div style="border-top:1px solid #e2e8f0;margin:24px 0 12px"></div>
            <p style="font-size:12px;line-height:1.5;color:#94a3b8;margin:0">
              You paid for quality, and quality is what we'll deliver — even if it takes an extra hour. — Tony, founder, WorkAbroad Hub
            </p>
          </div>
        `;
                const text = `Your ${serviceName} is being personally reviewed.

Hi ${firstName},

Our AI produced a first draft of your ${serviceName.toLowerCase()} but the length didn't match what we'd expect from a CV of your size. Rather than send something that lost important details from your original, we've flagged it for a personal review.

You'll get your polished ${serviceName.toLowerCase()} within 4 hours — same day, no extra charge.

Your original CV is safe with us. Nothing was lost.

Check order status: ${orderUrl}

You paid for quality, and quality is what we'll deliver.
— Tony, founder, WorkAbroad Hub`;
                await sendWithFailover({
                    to: user.email,
                    subject: `Your ${serviceName} is being personally reviewed — ready within 4 hours`,
                    html,
                    text,
                });
            }
            catch (emailErr) {
                console.warn(`[notifyOrderNeedsReview] email failed for ${orderId}: ${emailErr?.message}`);
            }
        }
        // ── WhatsApp ─────────────────────────────────────────────────────────────
        if (user.phone) {
            try {
                const { sendWhatsApp } = await Promise.resolve().then(() => __importStar(require("./services/whatsapp")));
                const waMessage = `Hi ${firstName}, this is WorkAbroad Hub.\n\n` +
                    `Our AI produced a first draft of your *${serviceName}* but the result didn't match the quality we promise you. Rather than send you something less than perfect, we've flagged it for personal review.\n\n` +
                    `You'll get your polished ${serviceName.toLowerCase()} *within 4 hours* — same day, no extra charge.\n\n` +
                    `Your original is safe. Nothing was lost.\n\n` +
                    `Status: ${orderUrl}` +
                    supportLine;
                await sendWhatsApp(user.phone, waMessage);
            }
            catch (waErr) {
                console.warn(`[notifyOrderNeedsReview] WhatsApp failed for ${orderId}: ${waErr?.message}`);
            }
        }
        // ── In-app notification ──────────────────────────────────────────────────
        try {
            const { storage } = await Promise.resolve().then(() => __importStar(require("./storage")));
            await storage.createUserNotification({
                userId: order.user_id,
                type: "info",
                title: `Your ${serviceName} is being personally reviewed`,
                message: `We're double-checking quality before sending — you'll have it within 4 hours, no extra charge.`,
            });
        }
        catch (notifErr) {
            console.warn(`[notifyOrderNeedsReview] in-app notif failed for ${orderId}: ${notifErr?.message}`);
        }
        // ── Admin alert — Tony needs to actually DO the review ───────────────────
        // Send Tony a WhatsApp so he knows there's an order waiting for him.
        try {
            const { sendWhatsApp } = await Promise.resolve().then(() => __importStar(require("./services/whatsapp")));
            const adminPhone = (process.env.ADMIN_PHONE_NUMBER || process.env.WHATSAPP_SUPPORT_NUMBER || "")
                .replace(/^\+?/, "");
            if (adminPhone) {
                await sendWhatsApp(adminPhone, `⚠️ *Order needs human review*\n\nOrder: ${orderId}\nService: ${serviceName}\nUser: ${user.email ?? user.phone}\n\nAI output failed length-ratio check. Admin: ${appOrigin}/admin/orders/${orderId}`);
            }
        }
        catch { /* best effort */ }
        console.log(`[notifyOrderNeedsReview] Dispatched for order ${orderId} (email=${!!user.email} wa=${!!user.phone})`);
    }
    catch (outer) {
        console.error(`[notifyOrderNeedsReview] outer failure for ${orderId}: ${outer?.message}`);
    }
}
