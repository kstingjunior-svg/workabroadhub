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
exports.registerKaziKaribuRoutes = registerKaziKaribuRoutes;
const nanoid_1 = require("nanoid");
const db_1 = require("../db");
const feature_flags_1 = require("../nanjila/feature-flags");
const kazi_karibu_1 = require("@shared/kazi-karibu");
const scam_rules_1 = require("../lib/scam-rules");
const kaziKaribuReview_1 = require("../nanjila/capabilities/kaziKaribuReview");
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
// ─── Nanjila Layer-4 review runner (shared by submit + status) ──────────────
/**
 * Runs the Nanjila pre-publish review capability against a post that is
 * currently in state 'pending_moderation' and transitions the post to its
 * final state:
 *
 *   APPROVE  → moderation_state='live', publishes for 7 days
 *   CLARIFY  → moderation_state='held', the poster edits + resubmits
 *   HOLD     → moderation_state='held', admin queue picks it up
 *
 * The capability handler itself writes the audit trail row to
 * kazi_karibu_moderation; this function only handles the post-state
 * transition and any side effects (publish timestamps, first-post-free
 * reputation increment, etc.).
 *
 * Returns the final moderation_state so callers can shape their response.
 */
async function runNanjilaAndTransition(postId, layer3FlagCodes) {
    // Flag OFF short-circuit: skip Nanjila entirely and route straight to
    // human review (state='held') so a broken model outage doesn't block
    // legitimate posts from getting reviewed manually.
    if (!feature_flags_1.NanjilaFlags.nanjilaKaziKaribuReviewEnabled) {
        await db_1.pool.query(`UPDATE kazi_karibu_posts
          SET moderation_state = 'held', updated_at = NOW()
        WHERE id = $1 AND moderation_state = 'pending_moderation'`, [postId]);
        await db_1.pool.query(`INSERT INTO kazi_karibu_moderation (post_id, layer, decision, reason_codes, narrative, actor)
       VALUES ($1, 'human', 'hold', $2, 'Nanjila review flag OFF — routed to human queue', 'system')`, [postId, ["nanjila_flag_off"]]);
        return "held";
    }
    // Invoke the capability. It writes its own moderation-audit row.
    const decision = await kaziKaribuReview_1.kaziKaribuReviewCapability.handler({ postId, layer3FlagCodes }, { userId: null, entitlement: { authenticated: false, paid: false, admin: false, planId: null, userId: null }, traceId: `kk-submit-${postId}` }).catch((err) => {
        console.error(`[KaziKaribu] Nanjila review call threw — falling through to human hold. err=${err?.message}`);
        return {
            ok: false,
            decision: "hold",
            confidence: 0,
            rationale: `Nanjila review threw: ${err?.message ?? "unknown"}`,
            hold_reason_code: "other",
            promptVersion: "v1.0.0",
        };
    });
    // Transition based on Nanjila's verdict.
    if (decision.decision === "approve") {
        await db_1.pool.query(`UPDATE kazi_karibu_posts
          SET moderation_state = 'live',
              published_at     = NOW(),
              expires_at       = NOW() + INTERVAL '7 days',
              updated_at       = NOW()
        WHERE id = $1 AND moderation_state = 'pending_moderation'`, [postId]);
        // Bump the poster's reputation counter.
        await db_1.pool.query(`INSERT INTO kazi_karibu_poster_reputation (user_id, posts_published, updated_at)
       SELECT poster_user_id, 1, NOW() FROM kazi_karibu_posts WHERE id = $1
       ON CONFLICT (user_id) DO UPDATE SET
         posts_published = kazi_karibu_poster_reputation.posts_published + 1,
         updated_at      = NOW()`, [postId]).catch(err => console.warn(`[KaziKaribu] reputation bump failed postId=${postId}: ${err?.message}`));
        return "live";
    }
    // clarify OR hold — both land in 'held' so the poster sees the question
    // OR the admin queue picks it up. The kazi_karibu_moderation row already
    // captures which one it was and the specific reason.
    await db_1.pool.query(`UPDATE kazi_karibu_posts
        SET moderation_state = 'held', updated_at = NOW()
      WHERE id = $1 AND moderation_state = 'pending_moderation'`, [postId]);
    return "held";
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
            if (parsed.ok !== true) {
                // TS narrows to the failure branch here — parsed.error and .field
                // are guaranteed to exist. Using === false rather than !parsed.ok
                // sidesteps a narrowing quirk seen in certain tsc versions.
                const fail = parsed;
                return res.status(400).json({ error: fail.error, field: fail.field });
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
     *
     * Transitions the draft into the paid+moderated lifecycle. See
     * docs/kazi-karibu/STRATEGY.md §6-§9.
     *
     * State flow:
     *   draft | held  →  (re-run Layer 3)  →  awaiting_payment  →  (M-Pesa STK)
     *     →  (client polls /status)  →  pending_moderation  →  (Nanjila review)
     *     →  live | held
     *
     * First-post-free short-circuit: if the poster has zero previously-published
     * posts AND the flag is on, skips the payment step and goes straight to
     * pending_moderation. Phone verification is still required.
     *
     * Response shape (paid path):
     *   { ok, postId, needsPayment: true, transactionRef, amountKes, state: "awaiting_payment" }
     *
     * Response shape (free path):
     *   { ok, postId, needsPayment: false, state: "live"|"held" }
     */
    app.post("/api/kazi-karibu/posts/:id/submit", requireKaziKaribuEnabled, isAuthenticated, async (req, res) => {
        const t0 = Date.now();
        const postId = String(req.params.id);
        const userId = readSessionUserId(req);
        if (!userId)
            return res.status(401).json({ error: "Please sign in first." });
        try {
            // 1. Load the draft and verify ownership + resubmittable state.
            const { rows: postRows } = await db_1.pool.query(`SELECT id, poster_user_id, category, county, sub_county, title, description,
                  budget_min_kes, budget_max_kes, budget_period, duration, moderation_state
             FROM kazi_karibu_posts
            WHERE id = $1
            LIMIT 1`, [postId]);
            const post = postRows[0];
            if (!post)
                return res.status(404).json({ error: "Draft not found." });
            if (post.poster_user_id !== userId) {
                return res.status(403).json({ error: "This isn't your draft." });
            }
            if (!["draft", "held"].includes(post.moderation_state)) {
                return res.status(409).json({
                    error: `This post is in state "${post.moderation_state}" and cannot be re-submitted.`,
                    state: post.moderation_state,
                });
            }
            // 2. Phone-verified check (Layer 2). Required for every submit.
            //    Uses users.phone_verified_at (any non-null value counts as verified;
            //    aging out to 90 days is enforced by /api/pay upstream flows, not here
            //    — keeping this endpoint's contract narrow).
            const { rows: userRows } = await db_1.pool.query(`SELECT phone, phone_verified_at FROM users WHERE id = $1 LIMIT 1`, [userId]);
            const user = userRows[0];
            if (!user?.phone) {
                return res.status(400).json({
                    error: "No phone number on file. Please add your phone number in profile settings before posting.",
                    code: "NO_PHONE",
                });
            }
            if (!user.phone_verified_at) {
                return res.status(400).json({
                    error: "Please verify your phone number before posting on Kazi Karibu.",
                    code: "PHONE_NOT_VERIFIED",
                });
            }
            // 3. Re-run Layer 3 rules on the server — never trust the draft state
            //    to have been rules-checked client-side.
            const ruleCtx = {
                category: post.category,
                county: post.county,
                subCounty: post.sub_county,
                title: post.title,
                description: post.description,
                budgetMinKes: post.budget_min_kes,
                budgetMaxKes: post.budget_max_kes,
                budgetPeriod: post.budget_period,
            };
            const ruleResult = (0, scam_rules_1.evaluatePostAgainstRules)(ruleCtx);
            if (ruleResult.hasReject) {
                // Poster edited to include reject-worthy content since drafting.
                // Kick it back to 'draft' so they can fix, no payment initiated.
                await db_1.pool.query(`UPDATE kazi_karibu_posts SET moderation_state = 'draft', updated_at = NOW() WHERE id = $1`, [postId]);
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
            // 4. First-post-free eligibility.
            const { rows: repRows } = await db_1.pool.query(`SELECT posts_published FROM kazi_karibu_poster_reputation WHERE user_id = $1 LIMIT 1`, [userId]);
            const previouslyPublished = repRows[0]?.posts_published ?? 0;
            const isFirstPostFree = feature_flags_1.NanjilaFlags.kaziKaribuFirstPostFreeEnabled && previouslyPublished === 0;
            // Layer 3 flag codes accumulate — passed to Nanjila either way.
            const layer3FlagCodes = ruleResult.hits
                .filter(h => h.severity === "flag")
                .map(h => h.ruleId);
            // ── Path A: first post free — skip payment, run Nanjila immediately ──
            if (isFirstPostFree) {
                await db_1.pool.query(`UPDATE kazi_karibu_posts
                SET moderation_state    = 'pending_moderation',
                    is_first_post_free  = true,
                    updated_at          = NOW()
              WHERE id = $1 AND moderation_state IN ('draft','held')`, [postId]);
                const finalState = await runNanjilaAndTransition(postId, layer3FlagCodes);
                console.log(`[KaziKaribu] SUBMIT free postId=${postId} userId=${userId} finalState=${finalState} ` +
                    `layer3Flags=${layer3FlagCodes.length} took=${Date.now() - t0}ms`);
                return res.status(200).json({
                    ok: true,
                    postId,
                    needsPayment: false,
                    isFirstPostFree: true,
                    state: finalState,
                });
            }
            // ── Path B: paid post ────────────────────────────────────────────────
            // Look up the canonical price for kazi_karibu_post_standard. The
            // service row exists (migration 0013) even when is_active=false — we
            // don't gate on is_active here since KAZI_KARIBU_ENABLED is the
            // authoritative on/off switch for this whole surface.
            const { rows: svcRows } = await db_1.pool.query(`SELECT id, price FROM services WHERE code = $1 LIMIT 1`, [kazi_karibu_1.KAZI_KARIBU_SERVICE_CODES.STANDARD_POST]);
            const svc = svcRows[0];
            if (!svc) {
                console.error(`[KaziKaribu] SUBMIT missing service row for ${kazi_karibu_1.KAZI_KARIBU_SERVICE_CODES.STANDARD_POST}`);
                return res.status(500).json({ error: "Payment service is not configured. Please contact support." });
            }
            const amountKes = Number(svc.price ?? kazi_karibu_1.KAZI_KARIBU_STANDARD_POST_PRICE_KES);
            // Create a payment record. Same pattern as /api/pay.
            const transactionRef = `KK-${(0, nanoid_1.nanoid)(12)}`;
            const normalizedPhone = user.phone.startsWith("0")
                ? `254${user.phone.slice(1)}`
                : user.phone;
            await db_1.pool.query(`INSERT INTO payments (id, user_id, amount, currency, status, method, service_id, transaction_ref, created_at)
           VALUES ($1, $2, $3, 'KES', 'pending', 'mpesa', $4, $1, NOW())`, [transactionRef, userId, amountKes, svc.id]);
            // Fire the STK push using the same helper /api/pay uses.
            let stkResponse;
            try {
                const { stkPush } = await Promise.resolve().then(() => __importStar(require("../mpesa")));
                stkResponse = await stkPush(normalizedPhone, amountKes, "Kazi Karibu — post fee", transactionRef);
            }
            catch (err) {
                console.error(`[KaziKaribu] SUBMIT STK push failed postId=${postId} err=${err?.message}`);
                // Roll back the payment row to failed so we don't leave orphans.
                await db_1.pool.query(`UPDATE payments SET status = 'failed', updated_at = NOW() WHERE id = $1`, [transactionRef]).catch(() => { });
                return res.status(502).json({
                    error: "Could not reach M-Pesa. Please try again in a moment.",
                });
            }
            // Transition the post to awaiting_payment and link the payment record.
            await db_1.pool.query(`UPDATE kazi_karibu_posts
              SET moderation_state = 'awaiting_payment',
                  payment_id       = $2,
                  updated_at       = NOW()
            WHERE id = $1 AND moderation_state IN ('draft','held')`, [postId, transactionRef]);
            console.log(`[KaziKaribu] SUBMIT paid postId=${postId} userId=${userId} tx=${transactionRef} ` +
                `amount=${amountKes} stk=${stkResponse?.CheckoutRequestID ?? "?"} took=${Date.now() - t0}ms`);
            return res.status(200).json({
                ok: true,
                postId,
                needsPayment: true,
                transactionRef,
                amountKes,
                checkoutRequestId: stkResponse?.CheckoutRequestID ?? null,
                state: "awaiting_payment",
                hint: "Approve the KES 100 M-Pesa prompt on your phone, then poll /api/kazi-karibu/posts/:id/status to watch for publication.",
            });
        }
        catch (err) {
            console.error(`[KaziKaribu] SUBMIT unexpected postId=${postId} err=${err?.message}`);
            return res.status(500).json({ error: "Could not submit your post. Please try again." });
        }
    });
    /**
     * GET /api/kazi-karibu/posts/:id/status
     *
     * Drives the post-payment state transitions and returns the current
     * lifecycle position. Client polls this after submitting a paid post to
     * detect when the M-Pesa callback has landed and the post is either live
     * or held for review.
     *
     * This endpoint is idempotent — safe to poll repeatedly. The state
     * transition uses conditional UPDATE so two concurrent calls can't both
     * trigger Nanjila.
     */
    app.get("/api/kazi-karibu/posts/:id/status", requireKaziKaribuEnabled, isAuthenticated, async (req, res) => {
        const postId = String(req.params.id);
        const userId = readSessionUserId(req);
        if (!userId)
            return res.status(401).json({ error: "Please sign in first." });
        try {
            // 1. Load post + latest payment status.
            const { rows: postRows } = await db_1.pool.query(`SELECT p.id, p.poster_user_id, p.moderation_state, p.payment_id,
                  pay.status  AS payment_status,
                  p.published_at, p.expires_at
             FROM kazi_karibu_posts p
        LEFT JOIN payments pay ON pay.id = p.payment_id
            WHERE p.id = $1
            LIMIT 1`, [postId]);
            const post = postRows[0];
            if (!post)
                return res.status(404).json({ error: "Post not found." });
            if (post.poster_user_id !== userId) {
                return res.status(403).json({ error: "This isn't your post." });
            }
            // 2. If awaiting payment, check whether the payment has succeeded.
            if (post.moderation_state === "awaiting_payment") {
                const paidStatuses = new Set(["success", "completed", "paid"]);
                if (post.payment_status && paidStatuses.has(post.payment_status)) {
                    // Transition to pending_moderation atomically — only if we're
                    // still the first observer. If two concurrent polls race, only
                    // one wins the UPDATE and only one triggers Nanjila.
                    const { rowCount } = await db_1.pool.query(`UPDATE kazi_karibu_posts
                  SET moderation_state = 'pending_moderation', updated_at = NOW()
                WHERE id = $1 AND moderation_state = 'awaiting_payment'`, [postId]);
                    if ((rowCount ?? 0) > 0) {
                        // We won the race — run Nanjila now.
                        const finalState = await runNanjilaAndTransition(postId, []);
                        return res.json({
                            state: finalState,
                            paymentState: post.payment_status,
                            message: finalState === "live"
                                ? "Payment received. Post is live for 7 days."
                                : finalState === "held"
                                    ? "Payment received. Post is being reviewed by our team — you'll hear back within a few hours."
                                    : "Payment received but review returned an issue. Check the moderation history.",
                        });
                    }
                    // Another poll got here first; fall through and read the
                    // now-current state below.
                }
                else if (post.payment_status === "failed") {
                    // Payment failed — return the draft to editable state.
                    await db_1.pool.query(`UPDATE kazi_karibu_posts
                  SET moderation_state = 'draft', updated_at = NOW()
                WHERE id = $1 AND moderation_state = 'awaiting_payment'`, [postId]);
                    return res.json({
                        state: "draft",
                        paymentState: "failed",
                        message: "Your M-Pesa payment did not go through. Please try again.",
                    });
                }
            }
            // 3. Reload after any transitions above to return the freshest state.
            const { rows: freshRows } = await db_1.pool.query(`SELECT moderation_state, published_at, expires_at
             FROM kazi_karibu_posts WHERE id = $1 LIMIT 1`, [postId]);
            const fresh = freshRows[0];
            return res.json({
                state: fresh?.moderation_state ?? post.moderation_state,
                paymentState: post.payment_status,
                publishedAt: fresh?.published_at ?? null,
                expiresAt: fresh?.expires_at ?? null,
            });
        }
        catch (err) {
            console.error(`[KaziKaribu] STATUS postId=${postId} err=${err?.message}`);
            return res.status(500).json({ error: "Could not check post status." });
        }
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
                period: "30d",
                byState: Object.fromEntries(byState.map(r => [r.moderation_state, Number(r.c)])),
            });
        }
        catch (err) {
            console.error("[GET /api/admin/kazi-karibu/stats]", err?.message);
            return res.status(500).json({ error: "Could not load stats." });
        }
    });
}
