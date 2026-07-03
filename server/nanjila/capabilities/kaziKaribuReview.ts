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

import { pool } from "../../db";
import type { CapabilityDefinition, CapabilityContext } from "./index";
import {
  buildKaziKaribuReviewPrompt,
  parseKaziKaribuReviewResponse,
  KAZI_KARIBU_REVIEW_PROMPT_VERSION,
  type KaziKaribuReviewPromptContext,
  type KaziKaribuReviewDecision,
} from "../prompts/kazi-karibu-review";

// ─── Input / output ─────────────────────────────────────────────────────────

export interface KaziKaribuReviewInput {
  postId: string;
  /** Optional pre-computed Layer 3 rule ids (from server/lib/scam-rules.ts). */
  layer3FlagCodes?: string[];
}

export interface KaziKaribuReviewOutput extends KaziKaribuReviewDecision {
  ok:                  boolean;
  moderationRecordId?: string;
  promptVersion:       string;
  error?:              string;
}

// ─── Handler ────────────────────────────────────────────────────────────────

async function handler(
  input: KaziKaribuReviewInput,
  _ctx:  CapabilityContext,
): Promise<KaziKaribuReviewOutput> {
  // 1. Load the post.
  const { rows: postRows } = await pool.query<{
    id:                string;
    poster_user_id:    string;
    category:          string;
    county:            string;
    sub_county:        string | null;
    title:             string;
    description:       string;
    budget_min_kes:    number | null;
    budget_max_kes:    number | null;
    budget_period:     string | null;
    duration:          string | null;
  }>(
    `SELECT id, poster_user_id, category, county, sub_county, title, description,
            budget_min_kes, budget_max_kes, budget_period, duration
       FROM kazi_karibu_posts
      WHERE id = $1
      LIMIT 1`,
    [input.postId],
  );
  const post = postRows[0];
  if (!post) {
    return {
      ok: false,
      decision: "hold",
      confidence: 0,
      rationale: `Post ${input.postId} not found — routed to human review.`,
      hold_reason_code: "other",
      promptVersion: KAZI_KARIBU_REVIEW_PROMPT_VERSION,
      error: "post_not_found",
    };
  }

  // 2. Load poster history + phone verification. Best-effort — missing
  //    reputation row is normal for a first-time poster.
  const { rows: repRows } = await pool.query<{
    posts_published: number;
    posts_removed:   number;
    confirmed_hires: number;
  }>(
    `SELECT posts_published, posts_removed, confirmed_hires
       FROM kazi_karibu_poster_reputation
      WHERE user_id = $1
      LIMIT 1`,
    [post.poster_user_id],
  );
  const { rows: userRows } = await pool.query<{ phone_verified_at: Date | null }>(
    `SELECT phone_verified_at FROM users WHERE id = $1 LIMIT 1`,
    [post.poster_user_id],
  );
  const rep = repRows[0] ?? { posts_published: 0, posts_removed: 0, confirmed_hires: 0 };
  const phoneVerifiedAt = userRows[0]?.phone_verified_at ?? null;

  // 3. Build prompt.
  const promptCtx: KaziKaribuReviewPromptContext = {
    category:     post.category,
    county:       post.county,
    subCounty:    post.sub_county,
    title:        post.title,
    description:  post.description,
    budgetMinKes: post.budget_min_kes,
    budgetMaxKes: post.budget_max_kes,
    budgetPeriod: post.budget_period,
    duration:     post.duration,
    posterHistory: {
      postsPublished:  rep.posts_published,
      postsRemoved:    rep.posts_removed,
      confirmedHires:  rep.confirmed_hires,
      phoneVerifiedAt: phoneVerifiedAt ? new Date(phoneVerifiedAt).toISOString() : null,
    },
    layer3FlagCodes: input.layer3FlagCodes ?? [],
  };
  const { system, user } = buildKaziKaribuReviewPrompt(promptCtx);

  // 4. Call OpenAI. gpt-4o-mini for cost — ~$0.001 per call at typical
  //    input size. See §9 cost model in strategy doc.
  let decision: KaziKaribuReviewDecision;
  try {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({
      apiKey:  process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user",   content: user   },
      ],
      max_tokens: 400,
      temperature: 0.1,
      response_format: { type: "json_object" },
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    decision = parseKaziKaribuReviewResponse(raw);
  } catch (err: any) {
    // OpenAI outage or budget issue — safe fallback is HOLD.
    console.error("[kaziKaribuReview] OpenAI call failed:", err?.message);
    decision = {
      decision:         "hold",
      confidence:       0,
      rationale:        `Review-model call failed (${err?.message ?? "unknown"}) — routed to human review.`,
      hold_reason_code: "other",
    };
  }

  // 5. Record the moderation decision.
  let moderationRecordId: string | undefined;
  try {
    const reasonCodes: string[] = [];
    if (decision.decision === "hold" && decision.hold_reason_code) {
      reasonCodes.push(`nanjila_hold:${decision.hold_reason_code}`);
    }
    if (input.layer3FlagCodes?.length) {
      for (const code of input.layer3FlagCodes) reasonCodes.push(`layer3_flag:${code}`);
    }
    const { rows: modRows } = await pool.query<{ id: string }>(
      `INSERT INTO kazi_karibu_moderation
         (post_id, layer, decision, reason_codes, narrative, actor, confidence)
       VALUES ($1, 'nanjila', $2, $3, $4, 'nanjila', $5)
       RETURNING id`,
      [
        post.id,
        decision.decision,
        reasonCodes,
        decision.rationale,
        decision.confidence,
      ],
    );
    moderationRecordId = modRows[0]?.id;
  } catch (err: any) {
    console.error("[kaziKaribuReview] Failed to insert moderation row:", err?.message);
  }

  return {
    ok:                true,
    ...decision,
    moderationRecordId,
    promptVersion:     KAZI_KARIBU_REVIEW_PROMPT_VERSION,
  };
}

// ─── Capability definition ──────────────────────────────────────────────────

export const kaziKaribuReviewCapability: CapabilityDefinition<
  KaziKaribuReviewInput,
  KaziKaribuReviewOutput
> = {
  slug:        "kazi_karibu_review",
  label:       "Kazi Karibu — pre-publish moderation",
  description:
    "Reviews a submitted Kazi Karibu post for coherence, red flags, and applicant safety before publication. " +
    "Returns APPROVE, CLARIFY(question), or HOLD(reason).",
  inputSchema: {
    type: "object",
    properties: {
      postId:          { type: "string", format: "uuid" },
      layer3FlagCodes: { type: "array", items: { type: "string" } },
    },
    required: ["postId"],
  },
  outputSchema: {
    type: "object",
    properties: {
      ok:                  { type: "boolean" },
      decision:            { type: "string", enum: ["approve","clarify","hold"] },
      confidence:          { type: "number" },
      rationale:           { type: "string" },
      clarify_question:    { type: "string" },
      hold_reason_code:    { type: "string" },
      moderationRecordId:  { type: "string" },
      promptVersion:       { type: "string" },
      error:               { type: "string" },
    },
  },
  // System-invoked. Not a user-facing chat tool — hidden from availableCapabilities
  // for regular users, but the DB row still governs enabled/disabled.
  requiresAuth:  false,
  requiresPaid:  false,
  requiresAdmin: false,
  handler,
};
