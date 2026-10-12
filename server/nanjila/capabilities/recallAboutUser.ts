/**
 * Nanjila — recall_about_user capability.
 *
 * The read side of persistent user memory. Nanjila calls this when she
 * suspects she already knows something about the user that would make
 * her reply more personal — "the agency you mentioned last week",
 * "that nursing role in Qatar", etc.
 *
 * Returns the active (non-archived) facts she's stored for this user,
 * most recently verified first, with sensitivity + confidence metadata
 * so Nanjila can hedge low-confidence facts naturally.
 */

import type { CapabilityDefinition, CapabilityContext } from "./index";
import { recallAll } from "../memory";

export interface RecallAboutUserInput {
  /** Optional topic hint — if present, filter facts whose key contains it. */
  topicHint?: string;
  /** Max facts to return. Default 15. */
  limit?: number;
}

export interface RecalledFact {
  factKey:      string;
  factValue:    unknown;
  category:     string;
  confidence:   number;
  learnedDaysAgo: number;
  staleness:    "fresh" | "aging" | "stale";
}

export interface RecallAboutUserOutput {
  ok:         boolean;
  factCount:  number;
  facts:      RecalledFact[];
  headline:   string;
}

async function recallAboutUserHandler(
  input: RecallAboutUserInput,
  ctx:   CapabilityContext,
): Promise<RecallAboutUserOutput> {
  if (!ctx.userId) {
    return { ok: false, factCount: 0, facts: [], headline: "No memory for anonymous users." };
  }
  const limit = Math.max(1, Math.min(50, input.limit ?? 15));
  const hint = String(input.topicHint ?? "").trim().toLowerCase();

  let all = await recallAll(ctx.userId);
  if (hint) {
    all = all.filter((f) =>
      f.factKey.toLowerCase().includes(hint) ||
      JSON.stringify(f.factValue).toLowerCase().includes(hint),
    );
  }

  const now = Date.now();
  const facts: RecalledFact[] = all.slice(0, limit).map((f) => {
    const daysAgo = Math.floor(
      (now - new Date(f.lastVerifiedAt).getTime()) / (1000 * 60 * 60 * 24),
    );
    const halfLife = f.decayHalfLifeDays || 60;
    let staleness: RecalledFact["staleness"] = "fresh";
    if (daysAgo > halfLife * 2) staleness = "stale";
    else if (daysAgo > halfLife) staleness = "aging";
    return {
      factKey:        f.factKey,
      factValue:      f.factValue,
      category:       f.category,
      confidence:     f.confidence,
      learnedDaysAgo: daysAgo,
      staleness,
    };
  });

  const headline = facts.length === 0
    ? hint
      ? `I don't have any stored facts matching "${hint}" for this user.`
      : "I don't have any memory stored for this user yet."
    : `I remember ${facts.length} fact${facts.length === 1 ? "" : "s"} about this user${hint ? ` matching "${hint}"` : ""}.`;

  return { ok: true, factCount: facts.length, facts, headline };
}

export const recallAboutUserCapability: CapabilityDefinition<RecallAboutUserInput, RecallAboutUserOutput> = {
  slug:        "recall_about_user",
  label:       "Recall what you remember about this user",
  description:
    "Look up durable facts you've previously stored about the signed-in user via remember_about_user. " +
    "Call this at the START of a conversation (or when a returning user says something that sounds " +
    "familiar) so you can reference what they told you before. Pass an optional topicHint to filter " +
    "(e.g. 'country' or 'agency'). Facts tagged 'aging' or 'stale' have decayed — hedge them " +
    "('I think you mentioned…' instead of asserting). Also check confidence: < 75 means hedge.",
  inputSchema: {
    type: "object",
    properties: {
      topicHint: { type: "string",  description: "Optional substring to filter fact keys/values." },
      limit:     { type: "integer", minimum: 1, maximum: 50, description: "Default 15." },
    },
    required: [],
  },
  outputSchema: {
    type: "object",
    properties: {
      ok:        { type: "boolean" },
      factCount: { type: "integer" },
      headline:  { type: "string" },
    },
  },
  requiresAuth:  true,
  requiresPaid:  false,
  requiresAdmin: false,
  handler:       recallAboutUserHandler,
};
