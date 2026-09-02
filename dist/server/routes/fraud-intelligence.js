"use strict";
/**
 * fraud-intelligence.ts — Community Scam Reporting v2 endpoints.
 *
 * Routes:
 *   POST /api/scam-reports/v2                 — structured submission with cross-ref
 *   GET  /api/agency-profiles/:slug           — public agency profile
 *   GET  /api/agency-profiles                  — paginated list (search + filter)
 *   POST /api/agency-appeals                   — controlled agency response workflow
 *
 * Legacy /api/scam-reports POST + GET remain untouched for backward compat.
 *
 * Security posture:
 *   - Rate-limited per IP (5 submissions/hour) to prevent mass-report abuse
 *   - Reporter IP + user-agent hashed for abuse dedup only (never displayed)
 *   - Auto-moderation status: 'pending' — every report needs admin approval
 *     before appearing on public agency profiles
 *   - Public endpoints only return APPROVED aggregated data
 */
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
exports.registerFraudIntelligenceRoutes = registerFraudIntelligenceRoutes;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const crypto_1 = __importDefault(require("crypto"));
const multer_1 = __importDefault(require("multer"));
const db_1 = require("../db");
const scam_cross_ref_1 = require("../lib/scam-cross-ref");
const submitLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 reports per hour per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "You've submitted 5 reports in the last hour. Please wait before submitting more, or contact support@workabroadhub.tech if you have many cases to file." },
});
const publicReadLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
});
function registerFraudIntelligenceRoutes(app) {
    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/scam-reports/v2 — structured intake + cross-reference
    // ═══════════════════════════════════════════════════════════════════════
    app.post("/api/scam-reports/v2", submitLimiter, async (req, res) => {
        const t0 = Date.now();
        try {
            const p = req.body;
            if (!p || typeof p !== "object") {
                return res.status(400).json({ message: "Please fill in the report form." });
            }
            const agency = String(p.agencyName ?? "").trim();
            const desc = String(p.description ?? "").trim();
            if (!agency || agency.length < 2) {
                return res.status(400).json({ message: "Please enter the agency or recruiter's name." });
            }
            if (!desc || desc.length < 30) {
                return res.status(400).json({
                    message: "Please describe what happened in at least 30 characters — specifics help us protect other job seekers.",
                });
            }
            // Compute the reporter fingerprint for abuse dedup + cluster stats
            const reporterIpHash = (0, scam_cross_ref_1.hashReporterIp)(req.ip, req.headers?.["user-agent"]);
            const reporterUserId = req.user?.claims?.sub ?? req.user?.id ?? null;
            // 1. Insert the report row with all structured fields
            const agencySlug = (0, scam_cross_ref_1.slugifyAgency)(agency);
            const { rows: inserted } = await db_1.pool.query(`INSERT INTO scam_reports (
           agency_name, agency_slug, country, office_location, website,
           facebook_url, instagram_url, tiktok_url, linkedin_url,
           whatsapp_number, phone_numbers, email_addresses,
           company_registration, recruitment_licence, employer_name,
           destination_country, job_applied, incident_date,
           amount_lost, currency, payment_method,
           bank_account, mpesa_number, crypto_wallet, transaction_reference,
           timeline_json, description, evidence_images,
           reported_by, reporter_email, reporter_ip_hash,
           status, risk_band, contact_info
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8, $9,
           $10, $11, $12,
           $13, $14, $15,
           $16, $17, $18,
           $19, $20, $21,
           $22, $23, $24, $25,
           $26, $27, $28,
           $29, $30, $31,
           'pending', 'medium', $32
         )
         RETURNING id`, [
                agency, agencySlug, p.country ?? null, p.officeLocation ?? null, p.website ?? null,
                p.facebookUrl ?? null, p.instagramUrl ?? null, p.tiktokUrl ?? null, p.linkedinUrl ?? null,
                p.whatsappNumber ?? null,
                Array.isArray(p.phoneNumbers) ? p.phoneNumbers.join(", ") : (p.phoneNumbers ?? null),
                Array.isArray(p.emailAddresses) ? p.emailAddresses.join(", ") : (p.emailAddresses ?? null),
                p.companyRegistration ?? null, p.recruitmentLicence ?? null, p.employerName ?? null,
                p.destinationCountry ?? null, p.jobApplied ?? null,
                p.incidentDate ? new Date(p.incidentDate) : null,
                p.amountLostKes ?? null, p.currency ?? "KES", p.paymentMethod ?? null,
                p.bankAccount ?? null, p.mpesaNumber ?? null, p.cryptoWallet ?? null, p.transactionReference ?? null,
                p.timelineJson ? JSON.stringify(p.timelineJson) : null,
                desc,
                p.evidenceImages ?? [],
                reporterUserId, p.reporterEmail ?? null, reporterIpHash,
                // Legacy `contact_info` column kept populated for backwards compat with old queries
                [p.whatsappNumber, Array.isArray(p.phoneNumbers) ? p.phoneNumbers.join(",") : p.phoneNumbers, Array.isArray(p.emailAddresses) ? p.emailAddresses.join(",") : p.emailAddresses].filter(Boolean).join(" | ") || null,
            ]);
            const reportId = inserted[0]?.id;
            if (!reportId)
                throw new Error("Insert failed");
            // 2. Cross-reference
            const crossRef = await (0, scam_cross_ref_1.persistAndCrossRef)(reportId, {
                phoneNumbers: p.phoneNumbers,
                emailAddresses: p.emailAddresses,
                whatsappNumber: p.whatsappNumber,
                bankAccount: p.bankAccount,
                mpesaNumber: p.mpesaNumber,
                cryptoWallet: p.cryptoWallet,
                website: p.website,
                facebookUrl: p.facebookUrl,
                instagramUrl: p.instagramUrl,
                tiktokUrl: p.tiktokUrl,
                linkedinUrl: p.linkedinUrl,
            });
            // 3. Update the aggregated agency profile
            await (0, scam_cross_ref_1.upsertAgencyProfile)(agency, {
                country: p.country,
                officeLocation: p.officeLocation,
                licenceNumber: p.recruitmentLicence,
                licenceStatus: p.recruitmentLicence ? "unknown" : "unlicensed",
                contacts: {
                    phoneNumbers: p.phoneNumbers,
                    emailAddresses: p.emailAddresses,
                    whatsappNumber: p.whatsappNumber,
                    bankAccount: p.bankAccount,
                    mpesaNumber: p.mpesaNumber,
                    website: p.website,
                    facebookUrl: p.facebookUrl,
                    instagramUrl: p.instagramUrl,
                },
                amountLostKes: p.amountLostKes,
            });
            console.log(`[FraudIntel] Report ${reportId} agency="${agency}" clusters=${crossRef.clusters.length} related=${crossRef.totalRelatedReports} in ${Date.now() - t0}ms`);
            res.status(201).json({
                ok: true,
                reportId,
                agencySlug,
                status: "pending",
                headline: crossRef.headline || `Thank you — your report will be reviewed within 24 hours. If similar reports exist we'll link them to this case.`,
                clusters: crossRef.clusters,
                totalRelatedReports: crossRef.totalRelatedReports,
                disclaimer: "Your report is now in our moderation queue. Publication happens only after evidence review. Please also file with the Kenya Directorate of Criminal Investigations (reportscam@dci.go.ke) and the National Employment Authority (neaims.nea.go.ke) — our platform is a warning resource, not a substitute for official investigation.",
            });
        }
        catch (err) {
            console.error("[FraudIntel] Submit error:", err?.message);
            res.status(500).json({
                ok: false,
                message: "We couldn't save your report right now. Please try again in a moment.",
            });
        }
    });
    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/agency-profiles/:slug — public warning page data
    // ═══════════════════════════════════════════════════════════════════════
    app.get("/api/agency-profiles/:slug", publicReadLimiter, async (req, res) => {
        const slug = String(req.params.slug || "").toLowerCase().slice(0, 64);
        if (!slug)
            return res.status(400).json({ message: "Missing agency slug." });
        try {
            const { rows } = await db_1.pool.query(`SELECT * FROM reported_agency_profiles WHERE slug = $1 LIMIT 1`, [slug]);
            const profile = rows[0];
            if (!profile)
                return res.status(404).json({ message: "No reported agency found under that name." });
            // Load APPROVED report count + last 5 approved reports (safe fields only)
            const { rows: reports } = await db_1.pool.query(`SELECT id, incident_date, destination_country, job_applied, amount_lost, currency, description, created_at
           FROM scam_reports
          WHERE agency_slug = $1 AND status = 'approved'
          ORDER BY incident_date DESC NULLS LAST, created_at DESC
          LIMIT 5`, [slug]);
            res.setHeader("Cache-Control", "public, max-age=120, s-maxage=300");
            res.json({
                ok: true,
                profile: {
                    slug: profile.slug,
                    displayName: profile.display_name,
                    country: profile.country,
                    officeLocation: profile.office_location,
                    licenceStatus: profile.licence_status,
                    licenceNumber: profile.licence_number,
                    licenceExpiresAt: profile.licence_expires_at,
                    reportCount: profile.report_count,
                    approvedReportCount: profile.approved_report_count,
                    totalReportedLossKes: profile.total_reported_loss_kes,
                    riskBand: profile.risk_band,
                    firstReportAt: profile.first_report_at,
                    lastReportAt: profile.last_report_at,
                    knownWebsites: profile.known_websites ?? [],
                    // Mask sensitive identifiers on the public view
                    knownPhones: (profile.known_phones ?? []).map(maskPhone),
                    knownEmails: (profile.known_emails ?? []).map(maskEmail),
                    knownWhatsapp: (profile.known_whatsapp ?? []).map(maskPhone),
                    knownBankAccounts: (profile.known_bank_accounts ?? []).map(maskAccount),
                    knownMpesaNumbers: (profile.known_mpesa_numbers ?? []).map(maskPhone),
                },
                recentReports: reports.map((r) => ({
                    id: r.id,
                    incidentDate: r.incident_date,
                    destinationCountry: r.destination_country,
                    jobApplied: r.job_applied,
                    amountLost: r.amount_lost,
                    currency: r.currency,
                    // Truncate long descriptions for the summary card
                    descriptionExcerpt: (r.description || "").slice(0, 300),
                    createdAt: r.created_at,
                })),
                disclaimer: "This page contains allegations submitted by users and evidence reviewed under WorkAbroadHub's moderation process. Publication does not constitute a court finding. Users should make their own decisions and consult official authorities where appropriate.",
            });
        }
        catch (err) {
            console.error("[FraudIntel] Profile fetch error:", err?.message);
            res.status(500).json({ message: "Could not load this agency profile." });
        }
    });
    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/agency-profiles — searchable index
    // ═══════════════════════════════════════════════════════════════════════
    app.get("/api/agency-profiles", publicReadLimiter, async (req, res) => {
        try {
            const q = String(req.query.q ?? "").trim().slice(0, 100);
            const country = String(req.query.country ?? "").trim().slice(0, 60);
            const riskBand = String(req.query.risk ?? "").trim().slice(0, 12);
            const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 30)));
            const conditions = ["approved_report_count > 0"];
            const values = [];
            if (q) {
                values.push(`%${q.toLowerCase()}%`);
                conditions.push(`LOWER(display_name) LIKE $${values.length}`);
            }
            if (country) {
                values.push(country);
                conditions.push(`country = $${values.length}`);
            }
            if (riskBand && ["low", "medium", "high", "critical"].includes(riskBand)) {
                values.push(riskBand);
                conditions.push(`risk_band = $${values.length}`);
            }
            values.push(limit);
            const { rows } = await db_1.pool.query(`SELECT slug, display_name, country, risk_band,
                report_count, approved_report_count, total_reported_loss_kes,
                last_report_at
           FROM reported_agency_profiles
          WHERE ${conditions.join(" AND ")}
          ORDER BY last_report_at DESC NULLS LAST
          LIMIT $${values.length}`, values);
            res.setHeader("Cache-Control", "public, max-age=60, s-maxage=180");
            res.json({
                ok: true,
                agencies: rows.map((r) => ({
                    slug: r.slug,
                    displayName: r.display_name,
                    country: r.country,
                    riskBand: r.risk_band,
                    reportCount: r.report_count,
                    approvedReportCount: r.approved_report_count,
                    totalReportedLossKes: r.total_reported_loss_kes,
                    lastReportAt: r.last_report_at,
                })),
                total: rows.length,
            });
        }
        catch (err) {
            console.error("[FraudIntel] Index error:", err?.message);
            res.status(500).json({ message: "Could not load agency list." });
        }
    });
    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/agency-appeals — controlled agency response workflow
    // ═══════════════════════════════════════════════════════════════════════
    app.post("/api/agency-appeals", submitLimiter, async (req, res) => {
        try {
            const body = req.body;
            if (!body?.claimantName || !body?.claimantEmail || !body?.responseText) {
                return res.status(400).json({ message: "Please provide your name, email, and response." });
            }
            if (!body.agencySlug && !body.reportId) {
                return res.status(400).json({ message: "Please indicate which report or agency this response is about." });
            }
            const { rows } = await db_1.pool.query(`INSERT INTO scam_report_appeals (
           report_id, agency_slug, claimant_name, claimant_email, claimant_phone,
           claimant_role, proof_of_identity_url, response_text
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`, [
                body.reportId ?? null, body.agencySlug ?? null,
                body.claimantName, body.claimantEmail, body.claimantPhone ?? null,
                body.claimantRole ?? null, body.proofOfIdentityUrl ?? null, body.responseText,
            ]);
            res.status(201).json({
                ok: true,
                appealId: rows[0].id,
                message: "Thank you. Your response is in our moderation queue. If it's substantiated with proof of identity, we'll publish it alongside the reports within 5 business days.",
            });
        }
        catch (err) {
            console.error("[FraudIntel] Appeal error:", err?.message);
            res.status(500).json({ message: "Could not save your response. Please try again." });
        }
    });
    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/scam-reports/evidence — batch upload of evidence files.
    //
    // Two-step upload flow: user uploads evidence with a client-generated
    // uploadBatchId, then submits the main report which references the batch.
    // Files >8 MB rejected; up to 50 per batch.
    // ═══════════════════════════════════════════════════════════════════════
    const evidenceUpload = (0, multer_1.default)({
        storage: multer_1.default.memoryStorage(),
        limits: { fileSize: 8 * 1024 * 1024, files: 50 },
        fileFilter: (_req, file, cb) => {
            const ok = file.mimetype.startsWith("image/") ||
                file.mimetype === "application/pdf" ||
                file.mimetype === "application/msword" ||
                file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            cb(null, ok);
        },
    });
    const evidenceUploadWithJsonErrors = (req, res, next) => {
        evidenceUpload.array("files", 50)(req, res, (err) => {
            if (!err)
                return next();
            const isSize = err?.code === "LIMIT_FILE_SIZE";
            const isCount = err?.code === "LIMIT_FILE_COUNT";
            return res.status(400).json({
                ok: false,
                message: isSize
                    ? "One or more files are larger than 8 MB. Please compress them and try again."
                    : isCount
                        ? "Please upload up to 50 files per batch. Split larger evidence into multiple submissions."
                        : "Some of the files couldn't be processed. Supported: JPG, PNG, WEBP, PDF, DOC, DOCX (max 8 MB each).",
            });
        });
    };
    app.post("/api/scam-reports/evidence", submitLimiter, evidenceUploadWithJsonErrors, async (req, res) => {
        try {
            const files = req.files ?? [];
            if (files.length === 0) {
                return res.status(400).json({ ok: false, message: "Please attach at least one evidence file." });
            }
            const batchId = req.body?.uploadBatchId || crypto_1.default.randomUUID();
            const reporterIpHash = (0, scam_cross_ref_1.hashReporterIp)(req.ip, req.headers?.["user-agent"]);
            const userId = req.user?.claims?.sub ?? req.user?.id ?? null;
            const saved = [];
            for (const f of files) {
                const sha = crypto_1.default.createHash("sha256").update(f.buffer).digest("hex");
                const dataUrl = `data:${f.mimetype};base64,${f.buffer.toString("base64")}`;
                try {
                    const { rows } = await db_1.pool.query(`INSERT INTO scam_report_evidence (
               upload_batch, file_name, file_mime, file_size, file_sha256, file_data,
               uploaded_by, reporter_ip_hash
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id`, [batchId, f.originalname, f.mimetype, f.size, sha, dataUrl, userId, reporterIpHash]);
                    saved.push({ id: rows[0].id, fileName: f.originalname, fileSize: f.size, fileMime: f.mimetype });
                }
                catch (err) {
                    console.warn(`[FraudIntel/evidence] file insert failed for ${f.originalname}:`, err?.message);
                }
            }
            console.log(`[FraudIntel/evidence] batch=${batchId} savedFiles=${saved.length}/${files.length} userId=${userId ?? "anon"}`);
            res.status(201).json({
                ok: true,
                uploadBatchId: batchId,
                files: saved,
                message: `${saved.length} file${saved.length === 1 ? "" : "s"} attached. Submit your report to link them to the case.`,
            });
        }
        catch (err) {
            console.error("[FraudIntel/evidence] error:", err?.message);
            res.status(500).json({ ok: false, message: "Could not save your evidence files. Please try again." });
        }
    });
    // ═══════════════════════════════════════════════════════════════════════
    // AGENCY FOLLOW / UNFOLLOW
    // ═══════════════════════════════════════════════════════════════════════
    app.post("/api/agency-profiles/:slug/follow", async (req, res) => {
        const userId = req.user?.claims?.sub ?? req.user?.id;
        if (!userId)
            return res.status(401).json({ ok: false, message: "Please sign in to follow this agency." });
        const slug = String(req.params.slug || "").toLowerCase().slice(0, 64);
        if (!slug)
            return res.status(400).json({ ok: false, message: "Missing agency slug." });
        try {
            await db_1.pool.query(`INSERT INTO agency_follows (user_id, agency_slug) VALUES ($1, $2)
         ON CONFLICT (user_id, agency_slug) DO NOTHING`, [userId, slug]);
            res.json({ ok: true, following: true });
        }
        catch (err) {
            console.error("[FraudIntel/follow] error:", err?.message);
            res.status(500).json({ ok: false, message: "Could not follow the agency." });
        }
    });
    app.delete("/api/agency-profiles/:slug/follow", async (req, res) => {
        const userId = req.user?.claims?.sub ?? req.user?.id;
        if (!userId)
            return res.status(401).json({ ok: false, message: "Please sign in." });
        const slug = String(req.params.slug || "").toLowerCase().slice(0, 64);
        try {
            await db_1.pool.query(`DELETE FROM agency_follows WHERE user_id = $1 AND agency_slug = $2`, [userId, slug]);
            res.json({ ok: true, following: false });
        }
        catch (err) {
            res.status(500).json({ ok: false, message: "Could not unfollow." });
        }
    });
    app.get("/api/agency-profiles/:slug/following", async (req, res) => {
        const userId = req.user?.claims?.sub ?? req.user?.id;
        if (!userId)
            return res.json({ ok: true, following: false });
        const slug = String(req.params.slug || "").toLowerCase().slice(0, 64);
        try {
            const { rows } = await db_1.pool.query(`SELECT 1 FROM agency_follows WHERE user_id = $1 AND agency_slug = $2 LIMIT 1`, [userId, slug]);
            res.json({ ok: true, following: rows.length > 0 });
        }
        catch {
            res.json({ ok: true, following: false });
        }
    });
    // ═══════════════════════════════════════════════════════════════════════
    // ADMIN — moderation queue + actions
    //
    // Every action is written to scam_report_audit_log for legal defensibility.
    // Requires isAdmin (checked inline via storage.isUserAdmin).
    // ═══════════════════════════════════════════════════════════════════════
    async function ensureAdmin(req, res) {
        const userId = req.user?.claims?.sub ?? req.user?.id;
        if (!userId) {
            res.status(401).json({ message: "Sign in required." });
            return null;
        }
        try {
            const { storage } = await Promise.resolve().then(() => __importStar(require("../storage")));
            const isAdmin = await storage.isUserAdmin(userId);
            if (!isAdmin) {
                res.status(403).json({ message: "Admin access required." });
                return null;
            }
            return userId;
        }
        catch {
            res.status(500).json({ message: "Could not verify admin access." });
            return null;
        }
    }
    app.get("/api/admin/scam-reports", async (req, res) => {
        const adminId = await ensureAdmin(req, res);
        if (!adminId)
            return;
        const status = String(req.query.status ?? "pending").slice(0, 20);
        const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
        try {
            const { rows } = await db_1.pool.query(`SELECT r.id, r.agency_name, r.agency_slug, r.country, r.destination_country,
                r.description, r.amount_lost, r.currency, r.risk_band, r.status,
                r.created_at, r.reporter_email,
                (SELECT COUNT(*)::int FROM scam_report_evidence e
                  WHERE e.report_id = r.id OR (r.timeline_json IS NOT NULL AND e.upload_batch = COALESCE(r.timeline_json->>'uploadBatchId', ''))) AS evidence_count,
                (SELECT COUNT(*)::int FROM scam_report_contacts c WHERE c.report_id = r.id) AS contact_count
           FROM scam_reports r
          WHERE r.status = $1
          ORDER BY r.created_at DESC
          LIMIT $2`, [status, limit]);
            res.json({ ok: true, reports: rows, total: rows.length });
        }
        catch (err) {
            console.error("[FraudIntel/admin] list error:", err?.message);
            res.status(500).json({ message: "Could not load report queue." });
        }
    });
    app.post("/api/admin/scam-reports/:id/moderate", async (req, res) => {
        const adminId = await ensureAdmin(req, res);
        if (!adminId)
            return;
        const reportId = String(req.params.id);
        const action = String(req.body?.action ?? "").toLowerCase();
        const reason = String(req.body?.reason ?? "").slice(0, 2000) || null;
        const validActions = ["approve", "reject", "blacklist"];
        if (!validActions.includes(action)) {
            return res.status(400).json({ message: "Invalid action. Must be approve, reject, or blacklist." });
        }
        try {
            const newStatus = action === "approve" ? "approved" :
                action === "reject" ? "rejected" :
                    /* blacklist */ "blacklisted";
            const { rows: before } = await db_1.pool.query(`SELECT status, agency_slug FROM scam_reports WHERE id = $1`, [reportId]);
            if (before.length === 0)
                return res.status(404).json({ message: "Report not found." });
            await db_1.pool.query(`UPDATE scam_reports SET status = $1, admin_note = $2, reviewer_user_id = $3, reviewed_at = NOW(),
                                 published_at = CASE WHEN $1 = 'approved' THEN NOW() ELSE published_at END,
                                 updated_at = NOW()
          WHERE id = $4`, [newStatus, reason, adminId, reportId]);
            // If approved: bump the aggregated agency counter
            if (action === "approve" && before[0].agency_slug) {
                await db_1.pool.query(`UPDATE reported_agency_profiles SET approved_report_count = approved_report_count + 1,
                                       last_report_at = NOW(),
                                       updated_at = NOW()
            WHERE slug = $1`, [before[0].agency_slug]);
            }
            await db_1.pool.query(`INSERT INTO scam_report_audit_log (report_id, agency_slug, actor_user_id, action, before_json, after_json, reason)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)`, [reportId, before[0].agency_slug, adminId, action, JSON.stringify({ status: before[0].status }), JSON.stringify({ status: newStatus }), reason]);
            res.json({ ok: true, newStatus, message: `Report ${action}d.` });
        }
        catch (err) {
            console.error("[FraudIntel/admin] moderate error:", err?.message);
            res.status(500).json({ message: "Could not update the report." });
        }
    });
    app.get("/api/admin/scam-reports/:id/audit", async (req, res) => {
        const adminId = await ensureAdmin(req, res);
        if (!adminId)
            return;
        const reportId = String(req.params.id);
        try {
            const { rows } = await db_1.pool.query(`SELECT id, actor_user_id, action, reason, before_json, after_json, created_at
           FROM scam_report_audit_log
          WHERE report_id = $1
          ORDER BY created_at DESC`, [reportId]);
            res.json({ ok: true, entries: rows });
        }
        catch (err) {
            res.status(500).json({ message: "Could not load audit trail." });
        }
    });
    console.log("[FraudIntel] Routes registered: POST /api/scam-reports/v2, GET /api/agency-profiles(/:slug), POST /api/agency-appeals, POST /api/scam-reports/evidence, follow/unfollow, admin queue+moderate+audit");
}
// ── Masking helpers (public view) ─────────────────────────────────────
function maskPhone(v) {
    if (!v || v.length <= 5)
        return v;
    return v.slice(0, -4).replace(/./g, "*") + v.slice(-4);
}
function maskEmail(v) {
    const [local, domain] = (v || "").split("@");
    if (!local || !domain)
        return v;
    return `${local.length > 2 ? local.slice(0, 2) + "***" : "***"}@${domain}`;
}
function maskAccount(v) {
    if (!v || v.length <= 5)
        return v;
    return v.slice(0, 4) + "***" + v.slice(-3);
}
