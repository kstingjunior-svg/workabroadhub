"use strict";
/**
 * Nanjila — kazi_karibu_review capability.
 *
 * Layer 4 of the six-layer trust model. Invoked by the Kazi Karibu post
 * submission flow AFTER Layer 3 rules pass AND payment succeeds. See
 * docs/kazi-karibu/STRATEGY.md §9.
 *
 * Contract:
 *   Input:  { postId }
 *   Output: KaziKaribuReviewDecision + moderationRecordId
 *
 * The handler:
 *   1. Loads the post from kazi_karibu_posts.
 *   2. Loads poster history from kazi_karibu_poster_reputation.
 *   3. Calls OpenAI (gpt-4o-mini for cost — ~$0.001 per review).
 *   4. Parses the JSON response defensively (parseKaziKaribuReviewResponse).
 *   5. Writes a kazi_karibu_moderation row for the audit trail.
 *   6. Returns the parsed decision.
 *
 * The handler does NOT transition the post's moderation_state — that's
 * the caller's job. Keeping state transitions in one place (the route
 * handler) makes the flow easy to reason about.
 *
 * FEATURE FLAG: NANJILA_KAZI_KARIBU_REVIEW_ENABLED. When OFF, this
 * capability is registered but the route handler is expected to skip
 * invoking it and route the post straight to the human queue.
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
exports.kaziKaribuReviewCapability = void 0;
const db_1 = require("../../db");
const kazi_karibu_review_1 = require("../prompts/kazi-karibu-review");
// ─── Handler ────────────────────────────────────────────────────────────────
async function handler(input, _ctx) {
    // 1. Load the post.
    const { rows: postRows } = await db_1.pool.query(`SELECT id, poster_user_id, category, county, sub_county, title, description,
            budget_min_kes, budget_max_kes, budget_period, duration
       FROM kazi_karibu_posts
      WHERE id = $1
      LIMIT 1`, [input.postId]);
    const post = postRows[0];
    if (!post) {
        return {
            ok: false,
            decision: "hold",
            confidence: 0,
            rationale: `Post ${input.postId} not found — routed to human review.`,
            hold_reason_code: "other",
            promptVersion: kazi_karibu_review_1.KAZI_KARIBU_REVIEW_PROMPT_VERSION,
            error: "post_not_found",
        };
    }
    // 2. Load poster history + phone verification. Best-effort — missing
    //    reputation row is normal for a first-time poster.
    const { rows: repRows } = await db_1.pool.query(`SELECT posts_published, posts_removed, confirmed_hires
       FROM kazi_karibu_poster_reputation
      WHERE user_id = $1
      LIMIT 1`, [post.poster_user_id]);
    const { rows: userRows } = await db_1.pool.query(`SELECT phone_verified_at FROM users WHERE id = $1 LIMIT 1`, [post.poster_user_id]);
    const rep = repRows[0] ?? { posts_published: 0, posts_removed: 0, confirmed_hires: 0 };
    const phoneVerifiedAt = userRows[0]?.phone_verified_at ?? null;
    // 3. Build prompt.
    const promptCtx = {
        category: post.category,
        county: post.county,
        subCounty: post.sub_county,
        title: post.title,
        description: post.description,
        budgetMinKes: post.budget_min_kes,
        budgetMaxKes: post.budget_max_kes,
        budgetPeriod: post.budget_period,
        duration: post.duration,
        posterHistory: {
            postsPublished: rep.posts_published,
            postsRemoved: rep.posts_removed,
            confirmedHires: rep.confirmed_hires,
            phoneVerifiedAt: phoneVerifiedAt ? new Date(phoneVerifiedAt).toISOString() : null,
        },
        layer3FlagCodes: input.layer3FlagCodes ?? [],
    };
    const { system, user } = (0, kazi_karibu_review_1.buildKaziKaribuReviewPrompt)(promptCtx);
    // 4. Call OpenAI. gpt-4o-mini for cost — ~$0.001 per call at typical
    //    input size. See §9 cost model in strategy doc.
    let decision;
    try {
        const OpenAI = (await Promise.resolve().then(() => __importStar(require("openai")))).default;
        const client = new OpenAI({
            apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
            baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        });
        const completion = await client.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: system },
                { role: "user", content: user },
            ],
            max_tokens: 400,
            temperature: 0.1,
            response_format: { type: "json_object" },
        });
        const raw = completion.choices[0]?.message?.content ?? "";
        decision = (0, kazi_karibu_review_1.parseKaziKaribuReviewResponse)(raw);
    }
    catch (err) {
        // OpenAI outage or budget issue — safe fallback is HOLD.
        console.error("[kaziKaribuReview] OpenAI call failed:", err?.message);
        decision = {
            decision: "hold",
            confidence: 0,
            rationale: `Review-model call failed (${err?.message ?? "unknown"}) — routed to human review.`,
            hold_reason_code: "other",
        };
    }
    // 5. Record the moderation decision.
    let moderationRecordId;
    try {
        const reasonCodes = [];
        if (decision.decision === "hold" && decision.hold_reason_code) {
            reasonCodes.push(`nanjila_hold:${decision.hold_reason_code}`);
        }
        if (input.layer3FlagCodes?.length) {
            for (const code of input.layer3FlagCodes)
                reasonCodes.push(`layer3_flag:${code}`);
        }
        const { rows: modRows } = await db_1.pool.query(`INSERT INTO kazi_karibu_moderation
         (post_id, layer, decision, reason_codes, narrative, actor, confidence)
       VALUES ($1, 'nanjila', $2, $3, $4, 'nanjila', $5)
       RETURNING id`, [
            post.id,
            decision.decision,
            reasonCodes,
            decision.rationale,
            decision.confidence,
        ]);
        moderationRecordId = modRows[0]?.id;
    }
    catch (err) {
        console.error("[kaziKaribuReview] Failed to insert moderation row:", err?.message);
    }
    return {
        ok: true,
        ...decision,
        moderationRecordId,
        promptVersion: kazi_karibu_review_1.KAZI_KARIBU_REVIEW_PROMPT_VERSION,
    };
}
// ─── Capability definition ──────────────────────────────────────────────────
exports.kaziKaribuReviewCapability = {
    slug: "kazi_karibu_review",
    label: "Kazi Karibu — pre-publish moderation",
    description: "Reviews a submitted Kazi Karibu post for coherence, red flags, and applicant safety before publication. " +
        "Returns APPROVE, CLARIFY(question), or HOLD(reason).",
    inputSchema: {
        type: "object",
        properties: {
            postId: { type: "string", format: "uuid" },
            layer3FlagCodes: { type: "array", items: { type: "string" } },
        },
        required: ["postId"],
    },
    outputSchema: {
        type: "object",
        properties: {
            ok: { type: "boolean" },
            decision: { type: "string", enum: ["approve", "clarify", "hold"] },
            confidence: { type: "number" },
            rationale: { type: "string" },
            clarify_question: { type: "string" },
            hold_reason_code: { type: "string" },
            moderationRecordId: { type: "string" },
            promptVersion: { type: "string" },
            error: { type: "string" },
        },
    },
    // System-invoked. Not a user-facing chat tool — hidden from availableCapabilities
    // for regular users, but the DB row still governs enabled/disabled.
    requiresAuth: false,
    requiresPaid: false,
    requiresAdmin: false,
    handler,
};
