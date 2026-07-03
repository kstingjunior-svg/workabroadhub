"use strict";
/**
 * Kazi Karibu — routes.
 *
 * See docs/kazi-karibu/STRATEGY.md §17 for the design and §22 for the
 * Phase-1 scope.
 *
 * FLAG GATE: every route in this file short-circuits with 404 when
 * NanjilaFlags.kaziKaribuEnabled is false. Shipping the code without
 * setting KAZI_KARIBU_ENABLED=true on Render is safe — none of it is
 * visible to end users.
 *
 * PHASE 1 STATUS (2026-07-03):
 *   Draft-and-preview flow (POST /posts/draft, GET /posts, GET /posts/:id)
 *   is fully implemented and exercisable. Submission (POST /posts/:id/submit)
 *   returns 501 until the M-Pesa payment binding and pipeline wiring lands
 *   in Phase 1b. Applicant interest + contact-reveal likewise scaffold
 *   with 501 until the UI is built. This lets the schema + rules engine +
 *   Nanjila capability go live behind the flag without waiting on UI.
 *
 * All state transitions are:
 *   draft → awaiting_payment → pending_moderation → live | held | rejected
 *   live → expired (sweep) | removed (admin)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerKaziKaribuRoutes = registerKaziKaribuRoutes;
const db_1 = require("../db");
const feature_flags_1 = require("../nanjila/feature-flags");
const kazi_karibu_1 = require("@shared/kazi-karibu");
const scam_rules_1 = require("../lib/scam-rules");
// ─── Feature-flag guard ─────────────────────────────────────────────────────
/**
 * Short-circuits with 404 when the feature is off. Using 404 (not 403) so
 * probes can't detect the surface's existence when we haven't shipped yet.
 */
function requireKaziKaribuEnabled(_req, res, next) {
    if (!feature_flags_1.NanjilaFlags.kaziKaribuEnabled) {
        return res.status(404).json({ error: "Not found" });
    }
    next();
}
// ─── Session helper (reused pattern from local-jobs-routes.ts) ──────────────
function readSessionUserId(req) {
    const fromReqUser = req.user?.claims?.sub ?? req.user?.id;
    if (fromReqUser)
        return String(fromReqUser);
    const fromSession = req.session?.customUserId;
    if (fromSession)
        return String(fromSession);
    if (req.isAuthenticated?.() && req.user) {
        const fromPassport = req.user?.claims?.sub ?? req.user?.id;
        if (fromPassport)
            return String(fromPassport);
    }
    return null;
}
function validateDraft(body) {
    const category = String(body.category ?? "").trim();
    const county = String(body.county ?? "").trim();
    const subCounty = body.subCounty == null ? null : String(body.subCounty).trim() || null;
    const title = String(body.title ?? "").trim();
    const description = String(body.description ?? "").trim();
    const budgetMinKes = body.budgetMinKes == null || body.budgetMinKes === 0 ? null : Number(body.budgetMinKes);
    const budgetMaxKes = body.budgetMaxKes == null || body.budgetMaxKes === 0 ? null : Number(body.budgetMaxKes);
    const budgetPeriod = body.budgetPeriod == null ? null : String(body.budgetPeriod).trim() || null;
    const duration = body.duration == null ? null : String(body.duration).trim() || null;
    if (!kazi_karibu_1.ALLOWED_KAZI_KARIBU_CATEGORY_IDS.has(category)) {
        return { ok: false, error: "Category is required and must be one of the supported types.", field: "category" };
    }
    if (!county) {
        return { ok: false, error: "County is required.", field: "county" };
    }
    const allowlist = feature_flags_1.NanjilaFlags.kaziKaribuCountyAllowlist;
    if (allowlist.length > 0 && !allowlist.includes(county)) {
        return { ok: false, error: `Kazi Karibu is currently only accepting posts from: ${allowlist.join(", ")}. We'll open more counties soon.`, field: "county" };
    }
    if (title.length < 5)
        return { ok: false, error: "Title must be at least 5 characters.", field: "title" };
    if (title.length > 120)
        return { ok: false, error: "Title must be under 120 characters.", field: "title" };
    if (description.length < 30)
        return { ok: false, error: "Description must be at least 30 characters — help applicants understand the role.", field: "description" };
    if (description.length > 4000)
        return { ok: false, error: "Description must be under 4,000 characters.", field: "description" };
    if (budgetMinKes !== null && budgetMinKes < 0)
        return { ok: false, error: "Budget must not be negative.", field: "budgetMinKes" };
    if (budgetMaxKes !== null && budgetMaxKes < 0)
        return { ok: false, error: "Budget must not be negative.", field: "budgetMaxKes" };
    if (budgetMinKes !== null && budgetMaxKes !== null && budgetMinKes > budgetMaxKes) {
        return { ok: false, error: "Minimum budget can't be higher than maximum.", field: "budgetMinKes" };
    }
    if (budgetPeriod !== null && !["hour", "day", "month", "project"].includes(budgetPeriod)) {
        return { ok: false, error: "Budget period must be hour, day, month, or project.", field: "budgetPeriod" };
    }
    if (duration !== null && !["one_off", "recurring_weekly", "permanent"].includes(duration)) {
        return { ok: false, error: "Duration must be one_off, recurring_weekly, or permanent.", field: "duration" };
    }
    return {
        ok: true,
        ctx: { category, county, subCounty, title, description, budgetMinKes, budgetMaxKes, budgetPeriod },
        duration,
        posterShowsName: Boolean(body.posterShowsName),
    };
}
// ─── Registration ───────────────────────────────────────────────────────────
function registerKaziKaribuRoutes(app, isAuthenticated, isAdmin) {
    // ─── POSTER FLOW ──────────────────────────────────────────────────────────
    /**
     * POST /api/kazi-karibu/posts/draft
     * Save a draft. Runs Layer-3 rules; returns any rule hits so the poster
     * can edit before spending money. No payment initiated here.
     */
    app.post("/api/kazi-karibu/posts/draft", requireKaziKaribuEnabled, isAuthenticated, async (req, res) => {
        try {
            const userId = readSessionUserId(req);
            if (!userId)
                return res.status(401).json({ error: "Please sign in first." });
            const parsed = validateDraft(req.body ?? {});
            if (!parsed.ok) {
                return res.status(400).json({ error: parsed.error, field: parsed.field });
            }
            // Layer 3.
            const ruleResult = (0, scam_rules_1.evaluatePostAgainstRules)(parsed.ctx);
            if (ruleResult.hasReject) {
                // Don't persist a rejected draft — surface the rule hits and let
                // the poster edit and resubmit. Failing fast saves DB churn.
                return res.status(422).json({
                    ok: false,
                    layer: "rules",
                    decision: "reject",
                    hits: ruleResult.hits.map(h => ({
                        ruleId: h.ruleId,
                        severity: h.severity,
                        posterReason: h.posterReason,
                    })),
                });
            }
            // Insert draft.
            const { rows } = await db_1.pool.query(`INSERT INTO kazi_karibu_posts (
             poster_user_id, category, county, sub_county, title, description,
             budget_min_kes, budget_max_kes, budget_period, duration,
             poster_display_name, poster_shows_name, moderation_state
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft')
           RETURNING id`, [
                userId,
                parsed.ctx.category,
                parsed.ctx.county,
                parsed.ctx.subCounty,
                parsed.ctx.title,
                parsed.ctx.description,
                parsed.ctx.budgetMinKes,
                parsed.ctx.budgetMaxKes,
                parsed.ctx.budgetPeriod,
                parsed.duration,
                parsed.posterShowsName ? null : (0, kazi_karibu_1.defaultPosterDisplayName)(parsed.ctx.subCounty, parsed.ctx.county),
                parsed.posterShowsName,
            ]);
            return res.status(201).json({
                ok: true,
                postId: rows[0].id,
                layer: "rules",
                decision: ruleResult.layer3Decision,
                flags: ruleResult.hits.filter(h => h.severity === "flag").map(h => ({
                    ruleId: h.ruleId,
                    posterReason: h.posterReason,
                })),
                nextStep: {
                    action: "submit_for_payment",
                    endpoint: `/api/kazi-karibu/posts/${rows[0].id}/submit`,
                    priceKes: kazi_karibu_1.KAZI_KARIBU_STANDARD_POST_PRICE_KES,
                    firstPostFree: feature_flags_1.NanjilaFlags.kaziKaribuFirstPostFreeEnabled,
                },
            });
        }
        catch (err) {
            console.error("[POST /api/kazi-karibu/posts/draft]", err?.message);
            return res.status(500).json({ error: "Could not save draft. Please try again." });
        }
    });
    /**
     * POST /api/kazi-karibu/posts/:id/submit
     * Transition draft → awaiting_payment, initiate M-Pesa STK, on callback
     * transition to pending_moderation, invoke Nanjila review, transition to
     * live | held | rejected.
     *
     * PHASE 1 STATUS: scaffolded, returns 501 until M-Pesa binding lands
     * in the next commit. Route defined here so the client can be built
     * against a stable API surface.
     */
    app.post("/api/kazi-karibu/posts/:id/submit", requireKaziKaribuEnabled, isAuthenticated, async (_req, res) => {
        return res.status(501).json({
            error: "Not implemented",
            message: "Payment binding lands in the next Phase-1 commit. Draft persists — resubmit then.",
        });
    });
    /**
     * GET /api/kazi-karibu/posts/mine
     * The signed-in user's own posts + moderation state.
     */
    app.get("/api/kazi-karibu/posts/mine", requireKaziKaribuEnabled, isAuthenticated, async (req, res) => {
        try {
            const userId = readSessionUserId(req);
            if (!userId)
                return res.status(401).json({ error: "Please sign in first." });
            const { rows } = await db_1.pool.query(`SELECT id, category, county, sub_county, title, moderation_state,
                  is_boosted, published_at, expires_at, created_at
             FROM kazi_karibu_posts
            WHERE poster_user_id = $1
            ORDER BY created_at DESC
            LIMIT 100`, [userId]);
            return res.json({ posts: rows });
        }
        catch (err) {
            console.error("[GET /api/kazi-karibu/posts/mine]", err?.message);
            return res.status(500).json({ error: "Could not load your posts." });
        }
    });
    // ─── PUBLIC BROWSE ────────────────────────────────────────────────────────
    /**
     * GET /api/kazi-karibu/posts
     * Public browse. Live posts only. Paginated. Category + county filters.
     */
    app.get("/api/kazi-karibu/posts", requireKaziKaribuEnabled, async (req, res) => {
        try {
            const category = req.query.category ? String(req.query.category) : null;
            const county = req.query.county ? String(req.query.county) : null;
            const limit = Math.min(Number(req.query.limit ?? 24), 100);
            const offset = Math.max(0, Number(req.query.offset ?? 0));
            const where = [`moderation_state = 'live'`, `expires_at > NOW()`];
            const params = [];
            if (category) {
                params.push(category);
                where.push(`category = $${params.length}`);
            }
            if (county) {
                params.push(county);
                where.push(`county = $${params.length}`);
            }
            const listSql = `
          SELECT id, category, county, sub_county, title, description,
                 budget_min_kes, budget_max_kes, budget_period, duration,
                 poster_display_name, is_boosted, published_at
            FROM kazi_karibu_posts
           WHERE ${where.join(" AND ")}
           ORDER BY is_boosted DESC, published_at DESC
           LIMIT ${limit} OFFSET ${offset}
        `;
            const countSql = `SELECT COUNT(*)::text AS c FROM kazi_karibu_posts WHERE ${where.join(" AND ")}`;
            const [list, count] = await Promise.all([
                db_1.pool.query(listSql, params),
                db_1.pool.query(countSql, params),
            ]);
            return res.json({
                total: Number(count.rows[0]?.c ?? 0),
                limit,
                offset,
                posts: list.rows,
            });
        }
        catch (err) {
            console.error("[GET /api/kazi-karibu/posts]", err?.message);
            return res.status(500).json({ error: "Could not load posts." });
        }
    });
    /**
     * GET /api/kazi-karibu/posts/:id
     * Single-post detail. Public read — but poster contact never returned
     * here; the applicant must express interest and be granted a reveal.
     */
    app.get("/api/kazi-karibu/posts/:id", requireKaziKaribuEnabled, async (req, res) => {
        try {
            const id = String(req.params.id);
            if (!/^[0-9a-f-]{8,}$/i.test(id))
                return res.status(400).json({ error: "Invalid id." });
            const { rows } = await db_1.pool.query(`SELECT id, category, county, sub_county, title, description,
                  budget_min_kes, budget_max_kes, budget_period, duration,
                  poster_display_name, is_boosted, published_at, expires_at
             FROM kazi_karibu_posts
            WHERE id = $1 AND moderation_state = 'live' AND expires_at > NOW()
            LIMIT 1`, [id]);
            if (rows.length === 0)
                return res.status(404).json({ error: "Post not found or no longer active." });
            return res.json({ post: rows[0] });
        }
        catch (err) {
            console.error("[GET /api/kazi-karibu/posts/:id]", err?.message);
            return res.status(500).json({ error: "Could not load post." });
        }
    });
    // ─── APPLICANT FLOW (scaffold — impl in next commit) ──────────────────────
    app.post("/api/kazi-karibu/posts/:id/interest", requireKaziKaribuEnabled, isAuthenticated, async (_req, res) => {
        return res.status(501).json({
            error: "Not implemented",
            message: "Applicant interest flow lands in the next Phase-1 commit.",
        });
    });
    app.post("/api/kazi-karibu/interests/:id/reveal-contact", requireKaziKaribuEnabled, isAuthenticated, async (_req, res) => {
        return res.status(501).json({
            error: "Not implemented",
            message: "Contact-reveal flow lands in the next Phase-1 commit.",
        });
    });
    app.post("/api/kazi-karibu/interests/:id/report", requireKaziKaribuEnabled, isAuthenticated, async (_req, res) => {
        return res.status(501).json({
            error: "Not implemented",
            message: "Reporting flow lands in the next Phase-1 commit.",
        });
    });
    // ─── ADMIN ────────────────────────────────────────────────────────────────
    /**
     * GET /api/admin/kazi-karibu/queue
     * Moderation queue for held posts. Sorted by hold-age (oldest first).
     */
    app.get("/api/admin/kazi-karibu/queue", requireKaziKaribuEnabled, isAuthenticated, isAdmin, async (_req, res) => {
        try {
            const { rows } = await db_1.pool.query(`SELECT p.id, p.category, p.county, p.title, p.description,
                  p.moderation_state, p.created_at, p.updated_at,
                  m.narrative AS latest_narrative,
                  m.decided_at AS latest_decided_at,
                  m.confidence AS latest_confidence,
                  m.reason_codes AS latest_reason_codes,
                  u.email AS poster_email,
                  u.phone AS poster_phone
             FROM kazi_karibu_posts p
             JOIN users u ON u.id = p.poster_user_id
        LEFT JOIN LATERAL (
              SELECT narrative, decided_at, confidence, reason_codes
                FROM kazi_karibu_moderation
               WHERE post_id = p.id
               ORDER BY decided_at DESC
               LIMIT 1
             ) m ON true
            WHERE p.moderation_state IN ('held','pending_moderation')
            ORDER BY p.updated_at ASC
            LIMIT 200`);
            return res.json({ count: rows.length, queue: rows });
        }
        catch (err) {
            console.error("[GET /api/admin/kazi-karibu/queue]", err?.message);
            return res.status(500).json({ error: "Could not load moderation queue." });
        }
    });
    /**
     * POST /api/admin/kazi-karibu/posts/:id/decide
     * Admin approves, rejects, or asks for clarification on a held post.
     */
    app.post("/api/admin/kazi-karibu/posts/:id/decide", requireKaziKaribuEnabled, isAuthenticated, isAdmin, async (req, res) => {
        try {
            const id = String(req.params.id);
            const { decision, narrative, reasonCodes } = req.body ?? {};
            const adminId = req.user?.claims?.sub ?? req.user?.id ?? "unknown";
            if (!["approve", "clarify", "reject"].includes(decision)) {
                return res.status(400).json({ error: "decision must be approve, clarify, or reject." });
            }
            const targetState = decision === "approve" ? "live"
                : decision === "reject" ? "rejected"
                    : "held"; // clarify: keep held until poster edits
            const { rows } = await db_1.pool.query(`UPDATE kazi_karibu_posts
              SET moderation_state = $2,
                  published_at     = CASE WHEN $2 = 'live' THEN COALESCE(published_at, NOW()) ELSE published_at END,
                  expires_at       = CASE WHEN $2 = 'live' THEN COALESCE(expires_at, NOW() + INTERVAL '7 days') ELSE expires_at END,
                  removed_reason   = CASE WHEN $2 = 'rejected' THEN $3 ELSE removed_reason END,
                  updated_at       = NOW()
            WHERE id = $1
        RETURNING id, moderation_state, published_at, expires_at`, [id, targetState, narrative ?? null]);
            if (rows.length === 0)
                return res.status(404).json({ error: "Post not found." });
            await db_1.pool.query(`INSERT INTO kazi_karibu_moderation
             (post_id, layer, decision, reason_codes, narrative, actor)
           VALUES ($1, 'human', $2, $3, $4, $5)`, [id, decision, reasonCodes ?? null, narrative ?? null, String(adminId)]);
            console.log(`[Admin] Kazi Karibu decision: post=${id} decision=${decision} state=${targetState} by=${adminId}`);
            return res.json({ ok: true, post: rows[0] });
        }
        catch (err) {
            console.error("[POST /api/admin/kazi-karibu/posts/:id/decide]", err?.message);
            return res.status(500).json({ error: "Could not record decision." });
        }
    });
    /**
     * GET /api/admin/kazi-karibu/stats
     * Rolling daily counts + revenue for the admin dashboard.
     */
    app.get("/api/admin/kazi-karibu/stats", requireKaziKaribuEnabled, isAuthenticated, isAdmin, async (_req, res) => {
        try {
            const { rows: byState } = await db_1.pool.query(`SELECT moderation_state, COUNT(*)::text AS c
             FROM kazi_karibu_posts
            WHERE created_at > NOW() - INTERVAL '30 days'
            GROUP BY moderation_state`);
            return res.json({
                window: "30d",
                byState: Object.fromEntries(byState.map(r => [r.moderation_state, Number(r.c)])),
            });
        }
        catch (err) {
            console.error("[GET /api/admin/kazi-karibu/stats]", err?.message);
            return res.status(500).json({ error: "Could not load stats." });
        }
    });
}
