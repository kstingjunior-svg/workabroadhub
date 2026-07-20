"use strict";
/**
 * Scout Jobs routes — 2026-07 (Tony's Job Scout feature).
 *
 * Individuals already living in destination countries who know of real job
 * openings (a chef friend at a Dubai hotel, a nurse at a UK care home, a
 * farm manager in Ontario) can pay KES 200 to list them here. They are NOT
 * registered recruitment agents, hence "scout".
 *
 * Lifecycle:
 *   1. POST /api/scout-jobs/init         → create row status='pending_payment',
 *                                          fire M-Pesa STK for KES 200
 *   2. POST /api/scout-jobs/mpesa-callback → Safaricom flips row to
 *                                            'pending_review' when paid
 *   3. Admin approves via POST /api/admin/scout-jobs/:id/approve → 'active'
 *   4. Seekers see it on GET /api/scout-jobs and contact via WhatsApp/email
 *   5. Auto-expiry after 60 days (handled by a scheduled job elsewhere)
 *
 * PayPal parity: POST /api/scout-jobs/paypal-init + /:id/paypal-capture
 * covers scouts outside Kenya (which is most of them — they're overseas).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerScoutJobsRoutes = registerScoutJobsRoutes;
const db_1 = require("../db");
const storage_1 = require("../storage");
const mpesa_1 = require("../mpesa");
const paypal_1 = require("../paypal");
const PRICE_KES = 200;
const VALID_INDUSTRIES = [
    "hospitality", "care", "nursing", "farming", "driving", "construction",
    "cleaning", "chef", "trade", "security", "office", "other",
];
const VALID_COUNTRIES = [
    "UK", "UAE", "Canada", "Australia", "Saudi Arabia", "Qatar", "Bahrain",
    "Germany", "USA", "Luxembourg", "Kuwait", "Oman", "Ireland", "Netherlands",
    "Other",
];
function currentUserId(req) {
    return (req.user?.claims?.sub ??
        req.user?.id ??
        req.session?.customUserId ??
        null);
}
function validateBody(body) {
    if (!body || typeof body !== "object")
        return { ok: false, error: "Body required" };
    const req = [
        "scoutName", "scoutCountry", "scoutWhatsapp",
        "jobTitle", "jobCountry", "jobIndustry", "jobDescription",
    ];
    for (const f of req) {
        if (!body[f] || typeof body[f] !== "string" || body[f].trim().length < 2) {
            return { ok: false, error: `${f} is required` };
        }
    }
    if (!VALID_COUNTRIES.includes(body.jobCountry)) {
        return { ok: false, error: `jobCountry must be one of: ${VALID_COUNTRIES.join(", ")}` };
    }
    if (!VALID_INDUSTRIES.includes(String(body.jobIndustry).toLowerCase())) {
        return { ok: false, error: `jobIndustry must be one of: ${VALID_INDUSTRIES.join(", ")}` };
    }
    if (body.jobDescription.length > 4000) {
        return { ok: false, error: "jobDescription too long (4000 char max)" };
    }
    return {
        ok: true,
        data: {
            scoutName: String(body.scoutName).trim().slice(0, 150),
            scoutCountry: String(body.scoutCountry).trim().slice(0, 100),
            scoutWhatsapp: String(body.scoutWhatsapp).trim().slice(0, 30),
            scoutEmail: body.scoutEmail ? String(body.scoutEmail).trim().slice(0, 200) : null,
            jobTitle: String(body.jobTitle).trim().slice(0, 200),
            jobCountry: String(body.jobCountry).trim(),
            jobCity: body.jobCity ? String(body.jobCity).trim().slice(0, 100) : null,
            jobIndustry: String(body.jobIndustry).toLowerCase().trim(),
            jobDescription: String(body.jobDescription).trim(),
            salaryText: body.salaryText ? String(body.salaryText).trim().slice(0, 120) : null,
            howToApply: body.howToApply ? String(body.howToApply).trim().slice(0, 1000) : null,
        },
    };
}
function registerScoutJobsRoutes(app) {
    /* ─── GET /api/scout-jobs — public listing (active only) ───────────────── */
    app.get("/api/scout-jobs", async (req, res) => {
        try {
            const country = req.query.country?.trim();
            const industry = req.query.industry?.trim().toLowerCase();
            const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 40)));
            const filters = [`status = 'active'`, `(expires_at IS NULL OR expires_at > NOW())`];
            const params = [];
            if (country && VALID_COUNTRIES.includes(country)) {
                params.push(country);
                filters.push(`job_country = $${params.length}`);
            }
            if (industry && VALID_INDUSTRIES.includes(industry)) {
                params.push(industry);
                filters.push(`job_industry = $${params.length}`);
            }
            params.push(limit);
            const { rows } = await db_1.pool.query(`SELECT id, scout_name, scout_country, job_title, job_country, job_city,
                job_industry, job_description, salary_text, view_count,
                approved_at, created_at
           FROM scout_jobs
          WHERE ${filters.join(" AND ")}
          ORDER BY approved_at DESC NULLS LAST, created_at DESC
          LIMIT $${params.length}`, params);
            // Contact details deliberately excluded — /:id endpoint gates them.
            res.json({ jobs: rows });
        }
        catch (err) {
            console.error("[scout-jobs] list error:", err?.message);
            res.status(500).json({ error: "Could not load scout jobs" });
        }
    });
    /* ─── GET /api/scout-jobs/:id — public detail (contact for authed users) ─ */
    app.get("/api/scout-jobs/:id", async (req, res) => {
        try {
            const { rows } = await db_1.pool.query(`SELECT * FROM scout_jobs WHERE id = $1 LIMIT 1`, [req.params.id]);
            const row = rows[0];
            if (!row)
                return res.status(404).json({ error: "Not found" });
            if (row.status !== "active")
                return res.status(404).json({ error: "Not available" });
            const userId = currentUserId(req);
            const contactVisible = !!userId; // any signed-in user sees contact — grow demand
            // Bump view count, best-effort
            db_1.pool.query(`UPDATE scout_jobs SET view_count = view_count + 1 WHERE id = $1`, [row.id])
                .catch(() => { });
            res.json({
                id: row.id,
                scoutName: row.scout_name,
                scoutCountry: row.scout_country,
                scoutWhatsapp: contactVisible ? row.scout_whatsapp : null,
                scoutEmail: contactVisible ? row.scout_email : null,
                contactLocked: !contactVisible,
                jobTitle: row.job_title,
                jobCountry: row.job_country,
                jobCity: row.job_city,
                jobIndustry: row.job_industry,
                jobDescription: row.job_description,
                salaryText: row.salary_text,
                howToApply: contactVisible ? row.how_to_apply : null,
                viewCount: row.view_count,
                approvedAt: row.approved_at,
                createdAt: row.created_at,
            });
        }
        catch (err) {
            console.error("[scout-jobs] get error:", err?.message);
            res.status(500).json({ error: "Could not load scout job" });
        }
    });
    /* ─── POST /api/scout-jobs/:id/contact — bump the interest counter ────── */
    app.post("/api/scout-jobs/:id/contact", async (req, res) => {
        try {
            const userId = currentUserId(req);
            if (!userId)
                return res.status(401).json({ error: "Sign in to contact scouts." });
            await db_1.pool.query(`UPDATE scout_jobs SET contact_count = contact_count + 1 WHERE id = $1 AND status = 'active'`, [req.params.id]);
            res.json({ ok: true });
        }
        catch (err) {
            console.error("[scout-jobs] contact-bump error:", err?.message);
            res.status(500).json({ error: "Could not record contact click" });
        }
    });
    /* ─── POST /api/scout-jobs/init — create draft + M-Pesa STK ──────────── */
    app.post("/api/scout-jobs/init", async (req, res) => {
        try {
            const userId = currentUserId(req);
            if (!userId)
                return res.status(401).json({ error: "Please sign in to post a scout job." });
            const check = validateBody(req.body);
            if (!check.ok)
                return res.status(400).json({ error: check.error });
            const d = check.data;
            const phone = String(req.body?.phone ?? "").trim();
            if (!phone || phone.length < 9) {
                return res.status(400).json({
                    error: "We need an M-Pesa phone number to send the KES 200 prompt.",
                    needsPhone: true,
                });
            }
            // Insert draft row
            const { rows: created } = await db_1.pool.query(`INSERT INTO scout_jobs
           (posted_by_user_id, scout_name, scout_country, scout_whatsapp, scout_email,
            job_title, job_country, job_city, job_industry, job_description, salary_text,
            how_to_apply, amount_paid, currency, status)
         VALUES ($1,$2,$3,$4,$5, $6,$7,$8,$9,$10,$11, $12, $13, 'KES', 'pending_payment')
         RETURNING id`, [
                userId, d.scoutName, d.scoutCountry, d.scoutWhatsapp, d.scoutEmail,
                d.jobTitle, d.jobCountry, d.jobCity, d.jobIndustry, d.jobDescription, d.salaryText,
                d.howToApply, PRICE_KES,
            ]);
            const scoutJobId = created[0].id;
            if (!(0, mpesa_1.isMpesaAvailable)()) {
                await db_1.pool.query(`DELETE FROM scout_jobs WHERE id = $1`, [scoutJobId]);
                return res.status(503).json({ error: "M-Pesa temporarily unavailable. Try PayPal or try again in a moment." });
            }
            // STK push, isolated callback path
            let stkResponse;
            try {
                stkResponse = await (0, mpesa_1.stkPush)(phone, PRICE_KES, `WorkAbroad Hub — Scout Job listing`, `WAH-SCOUT-${scoutJobId.slice(0, 8)}`, `${(0, mpesa_1.getCallbackBaseUrl)(req)}/api/scout-jobs/mpesa-callback`);
            }
            catch (err) {
                console.error("[scout-jobs] STK push failed:", err?.message);
                await db_1.pool.query(`DELETE FROM scout_jobs WHERE id = $1`, [scoutJobId]);
                return res.status(502).json({ error: "Could not send the M-Pesa prompt. Please try again." });
            }
            // Save the CheckoutRequestID so callback can match
            await db_1.pool.query(`UPDATE scout_jobs
            SET payment_id = $1
          WHERE id = $2`, [stkResponse.CheckoutRequestID, scoutJobId]);
            return res.json({
                scoutJobId,
                mpesaCheckoutId: stkResponse.CheckoutRequestID,
                message: "M-Pesa prompt sent. Enter your PIN on your phone.",
            });
        }
        catch (err) {
            console.error("[scout-jobs] init error:", err?.message);
            res.status(500).json({ error: "Could not start the scout job listing. Please try again." });
        }
    });
    /* ─── POST /api/scout-jobs/mpesa-callback — Safaricom result ─────────── */
    app.post("/api/scout-jobs/mpesa-callback", async (req, res) => {
        try {
            const cb = req.body?.Body?.stkCallback;
            if (!cb)
                return res.json({ ResultCode: 0, ResultDesc: "no callback body" });
            const checkoutId = cb.CheckoutRequestID;
            const resultCode = cb.ResultCode;
            const { rows } = await db_1.pool.query(`SELECT id FROM scout_jobs WHERE payment_id = $1 LIMIT 1`, [checkoutId]);
            const scoutJobId = rows[0]?.id;
            if (!scoutJobId) {
                console.warn(`[scout-jobs/callback] no scout job matches CheckoutRequestID ${checkoutId}`);
                return res.json({ ResultCode: 0, ResultDesc: "no matching draft" });
            }
            if (resultCode === 0) {
                await db_1.pool.query(`UPDATE scout_jobs SET status = 'pending_review', updated_at = NOW() WHERE id = $1`, [scoutJobId]);
                console.log(`[scout-jobs/callback] Scout job ${scoutJobId} paid → pending_review`);
            }
            else {
                await db_1.pool.query(`UPDATE scout_jobs SET status = 'flagged', moderation_notes = $2, updated_at = NOW() WHERE id = $1`, [scoutJobId, `M-Pesa result ${resultCode}: ${cb.ResultDesc ?? "unknown"}`]);
                console.warn(`[scout-jobs/callback] Scout job ${scoutJobId} payment failed (${resultCode})`);
            }
            return res.json({ ResultCode: 0, ResultDesc: "handled" });
        }
        catch (err) {
            console.error("[scout-jobs] callback error:", err?.message);
            return res.json({ ResultCode: 0, ResultDesc: "internal, handled" });
        }
    });
    /* ─── GET /api/scout-jobs/:id/status — poll for the client ───────────── */
    app.get("/api/scout-jobs/:id/status", async (req, res) => {
        try {
            const { rows } = await db_1.pool.query(`SELECT status, moderation_notes FROM scout_jobs WHERE id = $1 LIMIT 1`, [req.params.id]);
            const row = rows[0];
            if (!row)
                return res.status(404).json({ error: "Not found" });
            res.json({ status: row.status, note: row.moderation_notes ?? null });
        }
        catch (err) {
            console.error("[scout-jobs] status error:", err?.message);
            res.status(500).json({ error: "Could not fetch status" });
        }
    });
    /* ─── POST /api/scout-jobs/paypal-init ───────────────────────────────── */
    app.post("/api/scout-jobs/paypal-init", async (req, res) => {
        try {
            const userId = currentUserId(req);
            if (!userId)
                return res.status(401).json({ error: "Please sign in to post a scout job." });
            if (!(0, paypal_1.isPayPalConfigured)()) {
                return res.status(503).json({ error: "PayPal is temporarily unavailable. Try M-Pesa." });
            }
            const check = validateBody(req.body);
            if (!check.ok)
                return res.status(400).json({ error: check.error });
            const d = check.data;
            const { rows: created } = await db_1.pool.query(`INSERT INTO scout_jobs
           (posted_by_user_id, scout_name, scout_country, scout_whatsapp, scout_email,
            job_title, job_country, job_city, job_industry, job_description, salary_text,
            how_to_apply, amount_paid, currency, status)
         VALUES ($1,$2,$3,$4,$5, $6,$7,$8,$9,$10,$11, $12, $13, 'KES', 'pending_payment')
         RETURNING id`, [
                userId, d.scoutName, d.scoutCountry, d.scoutWhatsapp, d.scoutEmail,
                d.jobTitle, d.jobCountry, d.jobCity, d.jobIndustry, d.jobDescription, d.salaryText,
                d.howToApply, PRICE_KES,
            ]);
            const scoutJobId = created[0].id;
            let order;
            try {
                order = await (0, paypal_1.createPayPalOrder)(PRICE_KES, `WorkAbroad Hub, Scout Job listing`, `WAH-SCOUT-${scoutJobId.slice(0, 8)}`);
            }
            catch (err) {
                console.error("[scout-jobs] PayPal order create failed:", err?.message);
                await db_1.pool.query(`DELETE FROM scout_jobs WHERE id = $1`, [scoutJobId]);
                return res.status(502).json({ error: "Could not start the PayPal payment. Please try again." });
            }
            await db_1.pool.query(`UPDATE scout_jobs SET payment_id = $1 WHERE id = $2`, [order.id, scoutJobId]);
            res.json({ scoutJobId, paypalOrderId: order.id, approvalUrl: order.approvalUrl });
        }
        catch (err) {
            console.error("[scout-jobs] paypal-init error:", err?.message);
            res.status(500).json({ error: "Could not start PayPal payment. Please try again." });
        }
    });
    /* ─── POST /api/scout-jobs/:id/paypal-capture ────────────────────────── */
    app.post("/api/scout-jobs/:id/paypal-capture", async (req, res) => {
        try {
            const { paypalOrderId } = req.body ?? {};
            if (!paypalOrderId)
                return res.status(400).json({ error: "paypalOrderId required" });
            const { rows } = await db_1.pool.query(`SELECT id, status FROM scout_jobs WHERE id = $1 LIMIT 1`, [req.params.id]);
            const row = rows[0];
            if (!row)
                return res.status(404).json({ error: "Scout job not found" });
            if (row.status === "pending_review" || row.status === "active") {
                return res.json({ status: row.status, note: "Payment already captured." });
            }
            let capture;
            try {
                capture = await (0, paypal_1.capturePayPalOrder)(paypalOrderId);
            }
            catch (err) {
                console.error("[scout-jobs] PayPal capture failed:", err?.message);
                return res.status(502).json({ error: "Could not confirm PayPal payment. Please try again." });
            }
            if (capture.status !== "COMPLETED") {
                return res.status(400).json({ error: `PayPal status ${capture.status}. Cannot proceed.` });
            }
            await db_1.pool.query(`UPDATE scout_jobs SET status = 'pending_review', updated_at = NOW() WHERE id = $1`, [row.id]);
            res.json({ status: "pending_review", capture: capture.transactionId });
        }
        catch (err) {
            console.error("[scout-jobs] paypal-capture error:", err?.message);
            res.status(500).json({ error: "Could not capture PayPal payment." });
        }
    });
    /* ─── Admin: queue + approve/reject ──────────────────────────────────── */
    app.get("/api/admin/scout-jobs/queue", async (req, res) => {
        try {
            const userId = currentUserId(req);
            if (!userId)
                return res.status(401).json({ error: "Unauthorized" });
            const user = await storage_1.storage.getUserById(userId);
            if (!user?.isAdmin)
                return res.status(403).json({ error: "Admin only" });
            const { rows } = await db_1.pool.query(`SELECT * FROM scout_jobs WHERE status = 'pending_review' ORDER BY updated_at ASC LIMIT 100`);
            res.json({ jobs: rows });
        }
        catch (err) {
            console.error("[scout-jobs] admin queue error:", err?.message);
            res.status(500).json({ error: "Queue fetch failed" });
        }
    });
    app.post("/api/admin/scout-jobs/:id/approve", async (req, res) => {
        try {
            const userId = currentUserId(req);
            if (!userId)
                return res.status(401).json({ error: "Unauthorized" });
            const user = await storage_1.storage.getUserById(userId);
            if (!user?.isAdmin)
                return res.status(403).json({ error: "Admin only" });
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 60);
            await db_1.pool.query(`UPDATE scout_jobs
            SET status = 'active', approved_at = NOW(), expires_at = $2, updated_at = NOW()
          WHERE id = $1 AND status = 'pending_review'`, [req.params.id, expiresAt]);
            res.json({ ok: true, expiresAt });
        }
        catch (err) {
            console.error("[scout-jobs] approve error:", err?.message);
            res.status(500).json({ error: "Approve failed" });
        }
    });
    app.post("/api/admin/scout-jobs/:id/reject", async (req, res) => {
        try {
            const userId = currentUserId(req);
            if (!userId)
                return res.status(401).json({ error: "Unauthorized" });
            const user = await storage_1.storage.getUserById(userId);
            if (!user?.isAdmin)
                return res.status(403).json({ error: "Admin only" });
            const note = String(req.body?.note ?? "Rejected by moderator").slice(0, 500);
            await db_1.pool.query(`UPDATE scout_jobs
            SET status = 'flagged', moderation_notes = $2, updated_at = NOW()
          WHERE id = $1`, [req.params.id, note]);
            res.json({ ok: true });
        }
        catch (err) {
            console.error("[scout-jobs] reject error:", err?.message);
            res.status(500).json({ error: "Reject failed" });
        }
    });
}
