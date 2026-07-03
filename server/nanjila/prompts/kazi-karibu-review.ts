/**
 * Nanjila — Kazi Karibu pre-publish review prompt.
 *
 * Layer 4 of the six-layer trust model.
 * See docs/kazi-karibu/STRATEGY.md §9 and Appendix C.
 *
 * PROMPT STABILITY
 *   Treat this file the same way you'd treat a migration: every change is a
 *   review-worthy commit. Old decisions in kazi_karibu_moderation are
 *   annotated with the prompt version they ran under, so tuning the prompt
 *   doesn't retroactively invalidate history.
 */

export const KAZI_KARIBU_REVIEW_PROMPT_VERSION = "v1.0.0";

/** Fields the prompt template expects. */
export interface KaziKaribuReviewPromptContext {
  category:            string;
  county:              string;
  subCounty:           string | null;
  title:               string;
  description:         string;
  budgetMinKes:        number | null;
  budgetMaxKes:        number | null;
  budgetPeriod:        string | null;
  duration:            string | null;
  posterHistory: {
    postsPublished:  number;
    postsRemoved:    number;
    confirmedHires:  number;
    phoneVerifiedAt: string | null; // ISO
  };
  layer3FlagCodes:     string[];    // rule ids from server/lib/scam-rules.ts
}

/** Structured Nanjila decision returned by the review capability. */
export interface KaziKaribuReviewDecision {
  decision:          "approve" | "clarify" | "hold";
  confidence:        number;         // 0..1
  rationale:         string;         // one sentence
  clarify_question?: string;         // only if decision === "clarify"
  hold_reason_code?: HoldReasonCode; // only if decision === "hold"
}

export type HoldReasonCode =
  | "unrealistic_pay"
  | "impersonation"
  | "internal_inconsistency"
  | "unclear_scope"
  | "unsafe_language"
  | "other";

/**
 * The frozen review prompt. Emits STRICT JSON so the server can parse
 * deterministically.
 */
export function buildKaziKaribuReviewPrompt(ctx: KaziKaribuReviewPromptContext): {
  system: string;
  user:   string;
} {
  const system = [
    "You are Nanjila, the WorkAbroad Hub moderation reviewer for Kazi Karibu — a",
    "Kenyan job-listing surface where individual posters advertise short-term work",
    "(house helps, fundis, tutors, cooks, drivers).",
    "",
    "Your job: read the post below and decide whether it should be:",
    "",
    "  APPROVE — publish immediately. Post is coherent, safe, and legitimate.",
    "  CLARIFY — probably legitimate but missing information or ambiguous.",
    "            Return a specific question the poster must answer.",
    "  HOLD    — post has semantic red flags a rule engine could miss.",
    "            Human moderator should review.",
    "",
    "Never approve if ANY of these are true:",
    "- The post asks the applicant to pay any amount (uniform, deposit, training).",
    "- The pay-to-work ratio is unrealistic for the described work.",
    "- The post impersonates a well-known business or government body.",
    "- The description contains language associated with unsafe or illegal work.",
    "- The location or role is internally inconsistent.",
    "- The category and description contradict each other.",
    "",
    "You have already been shown any Layer-3 rule flags this post triggered — you",
    "may agree, disagree, or add your own reasoning. Be brief and specific in the",
    "rationale (one sentence, no fluff).",
    "",
    "Return STRICT JSON with this shape:",
    "{",
    "  \"decision\": \"approve\" | \"clarify\" | \"hold\",",
    "  \"confidence\": 0.0..1.0,",
    "  \"rationale\": \"one sentence, plain English\",",
    "  \"clarify_question\": \"the specific question, only if decision=clarify\",",
    "  \"hold_reason_code\": \"unrealistic_pay|impersonation|internal_inconsistency|unclear_scope|unsafe_language|other, only if decision=hold\"",
    "}",
    "",
    "Do NOT include any text outside the JSON object.",
  ].join("\n");

  const user = [
    "POST TO REVIEW:",
    `Category: ${ctx.category}`,
    `County: ${ctx.county}`,
    `Sub-area: ${ctx.subCounty ?? "(none provided)"}`,
    `Title: ${ctx.title}`,
    "Description:",
    ctx.description,
    "",
    `Budget: ${ctx.budgetMinKes ?? "(none)"} — ${ctx.budgetMaxKes ?? "(none)"} KES per ${ctx.budgetPeriod ?? "(unspecified)"}`,
    `Duration: ${ctx.duration ?? "(unspecified)"}`,
    "",
    "Poster history:",
    `- Posts published (all-time): ${ctx.posterHistory.postsPublished}`,
    `- Posts removed for cause:    ${ctx.posterHistory.postsRemoved}`,
    `- Confirmed hires:            ${ctx.posterHistory.confirmedHires}`,
    `- Phone verified at:          ${ctx.posterHistory.phoneVerifiedAt ?? "(never)"}`,
    `- Layer 3 flags on THIS post: ${ctx.layer3FlagCodes.length === 0 ? "(none)" : ctx.layer3FlagCodes.join(", ")}`,
  ].join("\n");

  return { system, user };
}

/**
 * Parse a model response into a KaziKaribuReviewDecision. Rejects malformed
 * outputs by returning a safe HOLD decision so a broken model never
 * accidentally publishes a bad post.
 */
export function parseKaziKaribuReviewResponse(raw: string): KaziKaribuReviewDecision {
  let obj: any;
  try {
    // Strip stray code-fence markers just in case a model wraps the JSON.
    const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    obj = JSON.parse(cleaned);
  } catch {
    return {
      decision:         "hold",
      confidence:       0.0,
      rationale:        "Model output was not valid JSON — routed to human review.",
      hold_reason_code: "other",
    };
  }

  const decision = obj?.decision;
  if (decision !== "approve" && decision !== "clarify" && decision !== "hold") {
    return {
      decision:         "hold",
      confidence:       0.0,
      rationale:        `Unrecognised decision value "${String(decision)}" — routed to human review.`,
      hold_reason_code: "other",
    };
  }

  const confidence = Number(obj?.confidence);
  const rationale  = String(obj?.rationale ?? "").slice(0, 500);

  const parsed: KaziKaribuReviewDecision = {
    decision,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
    rationale:  rationale || "(no rationale provided)",
  };

  if (decision === "clarify") {
    parsed.clarify_question = String(obj?.clarify_question ?? "").slice(0, 500) ||
      "Could you clarify the specifics of the role?";
  }
  if (decision === "hold") {
    const allowed: HoldReasonCode[] = [
      "unrealistic_pay","impersonation","internal_inconsistency",
      "unclear_scope","unsafe_language","other",
    ];
    const code = obj?.hold_reason_code;
    parsed.hold_reason_code = allowed.includes(code) ? code : "other";
  }

  return parsed;
}
