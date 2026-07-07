"use strict";
/**
 * "Write from Scratch" routes.
 *
 * Product: a paid tool that lets a user generate a CV, cover letter,
 * recruitment CV, or reference letter from a short description of themselves
 * — no existing document to upload. All other AI tools require an upload;
 * this fills the gap for users starting from zero.
 *
 * Pricing:
 *   - Free users:   KES 300 per generation, one-off M-Pesa
 *   - Pro subs:     free (unlimited)
 *
 * Endpoints:
 *
 *   POST /api/write-from-scratch/init
 *     Body: { docType, input, phone? }
 *     - Pro user  → creates draft (status='paid'), returns { draftId }
 *     - Free user → creates draft (status='pending_payment'), STK-pushes 300
 *                   to phone, returns { draftId, mpesaCheckoutId }
 *
 *   POST /api/write-from-scratch/mpesa-callback
 *     Safaricom hits this. Looks up draft by CheckoutRequestID, marks paid.
 *
 *   GET  /api/write-from-scratch/:id/status
 *     Client polls this after payment. Returns { status, hasBody, error }.
 *
 *   POST /api/write-from-scratch/:id/generate
 *     Requires status='paid'. Runs the AI generator, stores body, marks
 *     status='generated'. Idempotent — safe to retry.
 *
 *   GET  /api/write-from-scratch/:id/download.docx
 *   GET  /api/write-from-scratch/:id/download.pdf
 *     Streams the file. Requires status='generated'. Draft ID is an
 *     unguessable UUID, so the URL itself acts as capability.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWriteFromScratchRoutes = registerWriteFromScratchRoutes;
const db_1 = require("../db");
const storage_1 = require("../storage");
const mpesa_1 = require("../mpesa");
const document_renderer_1 = require("../services/document-renderer");
const generator_1 = require("../services/writeFromScratch/generator");
const PRICE_KES = 300;
const VALID_DOC_TYPES = [
    "cv",
    "cover_letter",
    "recruitment_cv",
    "reference_letter",
];
/**
 * Match the frontend's definition of "paying customer" — any plan that isn't
 * "free" or null. The strict list (pro / pro_referral / yearly) missed users
 * on legacy plan strings ("basic", "standard", grandfathered tiers) who see
 * the "Included with your Pro plan" banner but then hit an M-Pesa phone
 * demand because the server disagreed with the UI.
 *
 * Anyone with an active non-free plan gets the tool free — same policy Tony
 * announced ("free for Pro subscribers"), just aligned to the actual plan
 * strings in storage.getUserPlan.
 */
function isProTier(plan) {
    if (!plan)
        return false;
    const p = String(plan).trim().toLowerCase();
    if (!p)
        return false;
    return p !== "free";
}
/**
 * Sniff the current user id from the standard auth shape used everywhere else
 * in this codebase. Returns null for unauthenticated requests (which are
 * allowed — guests can pay via M-Pesa without an account).
 */
function currentUserId(req) {
    return req.user?.claims?.sub ?? req.user?.id ?? null;
}
function registerWriteFromScratchRoutes(app) {
    /* ─── POST /api/write-from-scratch/init ─────────────────────────────── */
    app.post("/api/write-from-scratch/init", async (req, res) => {
        try {
            const { docType, input, phone } = req.body ?? {};
            // ── Validate ─────────────────────────────────────────────────────
            if (!VALID_DOC_TYPES.includes(docType)) {
                return res.status(400).json({
                    error: `Invalid docType. Must be one of: ${VALID_DOC_TYPES.join(", ")}`,
                });
            }
            if (!input || typeof input !== "object") {
                return res.status(400).json({ error: "Missing or invalid 'input'." });
            }
            const validationError = validateInputForType(docType, input);
            if (validationError) {
                return res.status(400).json({ error: validationError });
            }
            const userId = currentUserId(req);
            // Pro users skip payment entirely.
            let isPro = false;
            let observedPlan = null;
            if (userId) {
                try {
                    observedPlan = await storage_1.storage.getUserPlan(userId);
                    isPro = isProTier(observedPlan);
                }
                catch (err) {
                    console.warn("[write-from-scratch] Could not read plan:", err?.message);
                }
            }
            console.log(`[write-from-scratch/init] userId=${userId ?? "guest"} plan=${observedPlan ?? "n/a"} isPro=${isPro}`);
            // ── Create draft row ─────────────────────────────────────────────
            const { rows: created } = await db_1.pool.query(`INSERT INTO write_from_scratch_drafts
           (user_id, doc_type, input_json, status, mpesa_amount, mpesa_phone, paid_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`, [
                userId,
                docType,
                JSON.stringify(input),
                isPro ? "paid" : "pending_payment",
                PRICE_KES,
                phone ?? null,
                isPro ? new Date() : null,
            ]);
            const draftId = created[0].id;
            // Pro users: no payment step, they can hit /generate straight away.
            if (isPro) {
                return res.json({ draftId, isPro: true, status: "paid" });
            }
            // ── Free users: STK push ─────────────────────────────────────────
            if (!phone || typeof phone !== "string" || phone.length < 9) {
                // Roll back the draft; we won't be able to charge them.
                await db_1.pool.query(`DELETE FROM write_from_scratch_drafts WHERE id = $1`, [draftId]);
                return res.status(400).json({
                    error: "Please provide the M-Pesa phone number that will pay.",
                });
            }
            if (!(0, mpesa_1.isMpesaAvailable)()) {
                await db_1.pool.query(`DELETE FROM write_from_scratch_drafts WHERE id = $1`, [draftId]);
                return res.status(503).json({
                    error: "M-Pesa is temporarily unavailable. Please try again in a moment.",
                });
            }
            let stkResponse;
            try {
                stkResponse = await (0, mpesa_1.stkPush)(phone, PRICE_KES, `WorkAbroad Hub — ${docTypeLabel(docType)}`, `WAH-WFS-${draftId.slice(0, 8)}`, 
                // Route this STK's callback to OUR dedicated endpoint, not the
                // generic /api/payments/mpesa/callback pipeline. Isolated
                // paths = no risk of accidentally triggering plan-activation
                // logic on a 300 KES tool payment.
                `${getCallbackBaseUrl(req)}/api/write-from-scratch/mpesa-callback`);
            }
            catch (err) {
                console.error("[write-from-scratch] STK push failed:", err?.message);
                await db_1.pool.query(`DELETE FROM write_from_scratch_drafts WHERE id = $1`, [draftId]);
                return res.status(502).json({
                    error: "Could not send the M-Pesa prompt. Please try again.",
                });
            }
            // Save the CheckoutRequestID so we can match the callback.
            await db_1.pool.query(`UPDATE write_from_scratch_drafts
            SET mpesa_checkout_id = $1
          WHERE id = $2`, [stkResponse?.CheckoutRequestID ?? null, draftId]);
            return res.json({
                draftId,
                isPro: false,
                status: "pending_payment",
                mpesaCheckoutId: stkResponse?.CheckoutRequestID ?? null,
                message: "Check your phone for the M-Pesa prompt and enter your PIN.",
            });
        }
        catch (err) {
            console.error("[write-from-scratch/init] error:", err);
            return res.status(500).json({ error: "Could not start the request." });
        }
    });
    /* ─── POST /api/write-from-scratch/mpesa-callback ───────────────────── */
    app.post("/api/write-from-scratch/mpesa-callback", async (req, res) => {
        // Always ACK Safaricom immediately; do work best-effort. If we return
        // non-OK Safaricom retries, which risks double-processing.
        try {
            const body = req.body?.Body?.stkCallback;
            if (!body) {
                return res.json({ ResultCode: 0, ResultDesc: "ignored" });
            }
            const checkoutId = body.CheckoutRequestID;
            const resultCode = Number(body.ResultCode ?? -1);
            if (!checkoutId) {
                return res.json({ ResultCode: 0, ResultDesc: "no checkout id" });
            }
            // Successful payment → grab receipt + amount from metadata.
            let receipt = null;
            if (resultCode === 0) {
                const items = body.CallbackMetadata?.Item;
                if (items) {
                    const receiptItem = items.find((i) => i.Name === "MpesaReceiptNumber");
                    if (receiptItem)
                        receipt = String(receiptItem.Value);
                }
                await db_1.pool.query(`UPDATE write_from_scratch_drafts
              SET status        = 'paid',
                  mpesa_receipt = $1,
                  paid_at       = NOW()
            WHERE mpesa_checkout_id = $2
              AND status = 'pending_payment'`, [receipt, checkoutId]);
                console.log(`[write-from-scratch] Payment success: checkoutId=${checkoutId} receipt=${receipt}`);
            }
            else {
                // User cancelled or STK failed. Leave draft as pending_payment so
                // client sees "not paid" and can retry.
                console.log(`[write-from-scratch] Payment result=${resultCode}: checkoutId=${checkoutId}`);
            }
            return res.json({ ResultCode: 0, ResultDesc: "acknowledged" });
        }
        catch (err) {
            console.error("[write-from-scratch] callback error:", err?.message);
            return res.json({ ResultCode: 0, ResultDesc: "handled" });
        }
    });
    /* ─── GET /api/write-from-scratch/:id/status ────────────────────────── */
    app.get("/api/write-from-scratch/:id/status", async (req, res) => {
        try {
            const { rows } = await db_1.pool.query(`SELECT status, output_body IS NOT NULL AS has_body, error_message
           FROM write_from_scratch_drafts
          WHERE id = $1`, [req.params.id]);
            if (rows.length === 0)
                return res.status(404).json({ error: "Not found" });
            const row = rows[0];
            return res.json({
                status: row.status,
                hasBody: Boolean(row.has_body),
                error: row.error_message ?? null,
            });
        }
        catch (err) {
            console.error("[write-from-scratch/status] error:", err?.message);
            return res.status(500).json({ error: "Could not check status." });
        }
    });
    /* ─── POST /api/write-from-scratch/:id/generate ─────────────────────── */
    app.post("/api/write-from-scratch/:id/generate", async (req, res) => {
        try {
            const { rows } = await db_1.pool.query(`SELECT id, doc_type, input_json, status, output_body
           FROM write_from_scratch_drafts
          WHERE id = $1`, [req.params.id]);
            if (rows.length === 0)
                return res.status(404).json({ error: "Not found" });
            const row = rows[0];
            if (row.status === "pending_payment") {
                return res.status(402).json({
                    error: "Payment not yet confirmed. Please complete the M-Pesa prompt.",
                });
            }
            if (row.status === "generated" && row.output_body) {
                // Idempotent — client can call again after a page refresh.
                return res.json({ status: "generated", body: row.output_body });
            }
            if (row.status === "failed") {
                // Reset to paid so we can try one more time.
                await db_1.pool.query(`UPDATE write_from_scratch_drafts
              SET status = 'paid', error_message = NULL
            WHERE id = $1`, [row.id]);
            }
            const request = {
                docType: row.doc_type,
                input: typeof row.input_json === "string" ? JSON.parse(row.input_json) : row.input_json,
            };
            let result;
            try {
                result = await (0, generator_1.generateDocument)(request);
            }
            catch (err) {
                const isKnown = err instanceof generator_1.WriteFromScratchGenerationError;
                const message = isKnown ? err.message : "Could not generate the document.";
                await db_1.pool.query(`UPDATE write_from_scratch_drafts
              SET status = 'failed', error_message = $1
            WHERE id = $2`, [message, row.id]);
                return res.status(500).json({ error: message });
            }
            await db_1.pool.query(`UPDATE write_from_scratch_drafts
            SET output_body  = $1,
                status       = 'generated',
                generated_at = NOW(),
                error_message = NULL
          WHERE id = $2`, [result.body, row.id]);
            return res.json({
                status: "generated",
                body: result.body,
                wordCount: result.wordCount,
            });
        }
        catch (err) {
            console.error("[write-from-scratch/generate] error:", err);
            return res.status(500).json({ error: "Could not generate." });
        }
    });
    /* ─── GET /api/write-from-scratch/:id/download.(docx|pdf) ───────────── */
    const download = async (req, res, format) => {
        try {
            const { rows } = await db_1.pool.query(`SELECT id, doc_type, input_json, output_body, status
           FROM write_from_scratch_drafts
          WHERE id = $1`, [req.params.id]);
            if (rows.length === 0)
                return res.status(404).json({ error: "Not found" });
            const row = rows[0];
            if (row.status !== "generated" || !row.output_body) {
                return res.status(409).json({ error: "Document not ready for download." });
            }
            const input = typeof row.input_json === "string" ? JSON.parse(row.input_json) : row.input_json;
            const filename = filenameFor(row.doc_type, input, format);
            const renderInput = {
                body: row.output_body,
                footer: "Generated by WorkAbroad Hub — workabroadhub.tech",
            };
            const buffer = format === "docx" ? await (0, document_renderer_1.renderDocx)(renderInput) : await (0, document_renderer_1.renderPdf)(renderInput);
            res.setHeader("Content-Type", format === "docx"
                ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                : "application/pdf");
            res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
            res.setHeader("Content-Length", String(buffer.length));
            return res.send(buffer);
        }
        catch (err) {
            console.error(`[write-from-scratch/download.${format}] error:`, err?.message);
            return res.status(500).json({ error: "Could not build the download." });
        }
    };
    app.get("/api/write-from-scratch/:id/download.docx", (req, res) => download(req, res, "docx"));
    app.get("/api/write-from-scratch/:id/download.pdf", (req, res) => download(req, res, "pdf"));
}
// ─── helpers ────────────────────────────────────────────────────────────────
function docTypeLabel(t) {
    switch (t) {
        case "cv": return "CV";
        case "cover_letter": return "Cover Letter";
        case "recruitment_cv": return "Recruitment CV";
        case "reference_letter": return "Reference Letter";
    }
}
function filenameFor(docType, input, format) {
    const safe = (s) => String(s ?? "").replace(/[^a-zA-Z0-9\-_\s]/g, "").trim().replace(/\s+/g, "_") || "document";
    switch (docType) {
        case "cv": return `CV_${safe(input.fullName)}.${format}`;
        case "cover_letter":
            return `Cover_Letter_${safe(input.fullName)}${input.employerName ? "_" + safe(input.employerName) : ""}.${format}`;
        case "recruitment_cv":
            return `Recruitment_CV_${safe(input.fullName)}_${safe(input.destinationCountry)}.${format}`;
        case "reference_letter":
            return `Reference_Letter_${safe(input.candidateName)}.${format}`;
    }
}
function validateInputForType(docType, input) {
    const requireString = (field) => {
        if (!input[field] || typeof input[field] !== "string" || !input[field].trim()) {
            return `Missing required field: ${field}`;
        }
        return null;
    };
    const requireNumber = (field) => {
        const n = Number(input[field]);
        if (!Number.isFinite(n) || n < 0 || n > 60) {
            return `Field "${field}" must be a number between 0 and 60.`;
        }
        return null;
    };
    switch (docType) {
        case "cv":
        case "cover_letter":
            return (requireString("fullName") ||
                requireString("role") ||
                requireNumber("yearsExperience") ||
                requireString("keySkills"));
        case "recruitment_cv":
            return (requireString("fullName") ||
                requireString("role") ||
                requireNumber("yearsExperience") ||
                requireString("keySkills") ||
                requireString("destinationCountry"));
        case "reference_letter":
            return (requireString("employerName") ||
                requireString("employerTitle") ||
                requireString("employerCompany") ||
                requireString("candidateName") ||
                requireString("candidateRole") ||
                requireNumber("yearsWorked") ||
                requireString("keyStrengths"));
    }
}
/**
 * Same idea as server/mpesa.ts getCallbackBaseUrl but scoped locally so we
 * can override just this route without touching the module-level default.
 * Falls back to APP_URL / X-Forwarded-Host.
 */
function getCallbackBaseUrl(req) {
    const explicit = (process.env.APP_URL || "").trim();
    if (explicit)
        return explicit.replace(/\/$/, "");
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    return `${proto}://${host}`;
}
