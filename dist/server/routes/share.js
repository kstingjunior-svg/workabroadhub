"use strict";
/**
 * Share endpoints — public preview + referral resolution.
 *
 * Routes:
 *   GET /api/share/:token       → returns the sanitized public card data
 *                                 for /share/:token to render. No auth.
 *   POST /api/share/:token/hit  → records a referral-link click for basic
 *                                 analytics (rate-limited, no auth needed).
 *
 * Attribution to a paid order happens in the payment initiation code paths,
 * NOT here — the client POSTs `referrerOrderId` (from localStorage) alongside
 * the normal init payload, and the payment handler writes it to
 * service_orders.referrer_order_id at row-creation time.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerShareRoutes = registerShareRoutes;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const db_1 = require("../db");
const schema_1 = require("@shared/schema");
const drizzle_orm_1 = require("drizzle-orm");
/** Hit limiter: 60 GETs/min per IP — plenty for real users, kills scrapers. */
const previewLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
});
/** Best-effort variant inference from the service_id / slug. */
function variantFromServiceId(id) {
    const s = (id || "").toLowerCase();
    if (s.includes("linkedin"))
        return "linkedin";
    if (s.includes("cover"))
        return "cover";
    if (s.includes("sop") || s.includes("motivation"))
        return "sop";
    if (s.includes("job") && s.includes("match"))
        return "job-match";
    if (s.includes("cv") || s.includes("ats"))
        return "cv";
    return "generic";
}
/**
 * Extract a target country from the order's intake_data JSON, if present.
 * We deliberately don't leak the full intake — just the country.
 */
function pickCountry(intake) {
    if (!intake || typeof intake !== "object")
        return null;
    const obj = intake;
    const candidates = [obj.targetCountry, obj.country, obj.destination];
    for (const c of candidates) {
        if (typeof c === "string" && c.trim())
            return c.trim().slice(0, 40);
    }
    return null;
}
function registerShareRoutes(app) {
    app.get("/api/share/:token", previewLimiter, async (req, res) => {
        const token = String(req.params.token || "").trim();
        // Order IDs are UUIDs — reject anything that looks nothing like one to
        // save a DB round-trip on bot traffic.
        if (!token || token.length < 8 || token.length > 64) {
            return res.status(404).json({ ok: false, error: "not_found" });
        }
        try {
            const rows = await db_1.db
                .select({
                id: schema_1.serviceOrders.id,
                userId: schema_1.serviceOrders.userId,
                serviceId: schema_1.serviceOrders.serviceId,
                serviceName: schema_1.serviceOrders.serviceName,
                status: schema_1.serviceOrders.status,
                intakeData: schema_1.serviceOrders.intakeData,
                qualityScore: schema_1.serviceOrders.qualityScore,
            })
                .from(schema_1.serviceOrders)
                .where((0, drizzle_orm_1.eq)(schema_1.serviceOrders.id, token))
                .limit(1);
            const order = rows[0];
            if (!order) {
                return res.status(404).json({ ok: false, error: "not_found" });
            }
            // Only completed orders can be shared — don't leak in-progress state.
            if (order.status !== "completed") {
                return res.status(404).json({ ok: false, error: "not_available" });
            }
            // Fetch the first name — nullable, first-name only, never full name.
            let firstName = null;
            try {
                const [u] = await db_1.db
                    .select({ firstName: schema_1.users.firstName })
                    .from(schema_1.users)
                    .where((0, drizzle_orm_1.eq)(schema_1.users.id, order.userId))
                    .limit(1);
                if (u?.firstName)
                    firstName = String(u.firstName).split(/\s+/)[0].slice(0, 24);
            }
            catch { /* non-fatal — we can still render the card without a name */ }
            const payload = {
                ok: true,
                card: {
                    firstName,
                    serviceName: order.serviceName || "Career service",
                    targetCountry: pickCountry(order.intakeData),
                    atsScore: typeof order.qualityScore === "number" && order.qualityScore > 0
                        ? order.qualityScore
                        : null,
                    variant: variantFromServiceId(order.serviceId),
                },
            };
            // Cache for 5 min — the card content never changes for a completed
            // order, so we don't need to re-query on every visitor.
            res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
            return res.json(payload);
        }
        catch (err) {
            console.error("[share] preview lookup failed:", err);
            return res.status(500).json({ ok: false, error: "server_error" });
        }
    });
    // Lightweight hit endpoint — kept even simpler than the preview because
    // it's called from every landing page mount. Just increments a counter
    // we might add later; for now it's a noop that returns 204.
    app.post("/api/share/:token/hit", previewLimiter, async (_req, res) => {
        res.status(204).end();
    });
}
