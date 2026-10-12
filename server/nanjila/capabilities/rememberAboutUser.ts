/**
 * Nanjila — remember_about_user capability.
 *
 * 2026-10 (Tony's intelligence directive): Nanjila can now persist facts
 * about users across conversations, so a returning user doesn't have to
 * re-tell her everything. Backed by the existing nanjila_user_memory
 * system (server/nanjila/memory.ts), which already enforces:
 *   • Sensitivity gate — health / religion / politics / sexuality /
 *     ethnicity / credentials are REFUSED at write time.
 *   • Decay — preferences fade after ~30 days, personal facts after
 *     a year, with explicit half-lives.
 *   • Confidence hedging — low-confidence facts come back as "I think
 *     you mentioned…" instead of asserted.
 *
 * Nanjila calls this when a user tells her something worth remembering —
 * their target country, preferred service tier, nursing specialty,
 * passport expiry, family situation (non-sensitive), etc. She calls it
 * silently, as a background action — the user doesn't need to see
 * "memory saved" confirmations unless they explicitly ask.
 *
 * Requires an authenticated user — memory is per-account only.
 */

import type { CapabilityDefinition, CapabilityContext } from "./index";
import { rememberFact, type MemoryCategory, type MemorySource } from "../memory";

export interface RememberAboutUserInput {
  /** Short machine key, snake_case. e.g. "target_country", "nursing_specialty". */
  factKey: string;
  /** The value to store. Short string, number, boolean, or small object. */
  factValue: string | number | boolean | Record<string, unknown>;
  /** Category — governs decay rate. */
  category: MemoryCategory;
  /** How confident Nanjila is this fact is correct (0-100). */
  confidence?: number;
  /** Why Nanjila is storing this — user told her directly vs she inferred it. */
  source?: MemorySource;
}

export interface RememberAboutUserOutput {
  ok:          boolean;
  stored:      boolean;
  reason?:     "sensitive_blocked" | "duplicate_reconfirmed" | "memory_disabled" | "no_user";
  message:     string;
}

async function rememberAboutUserHandler(
  input: RememberAboutUserInput,
  ctx:   CapabilityContext,
): Promise<RememberAboutUserOutput> {
  if (!ctx.userId) {
    return {
      ok:      false,
      stored:  false,
      reason:  "no_user",
      message: "I can only remember things for signed-in users.",
    };
  }

  const result = await rememberFact({
    userId:     ctx.userId,
    factKey:    String(input.factKey || "").trim().slice(0, 100),
    factValue:  input.factValue,
    category:   input.category,
    confidence: Math.max(0, Math.min(100, input.confidence ?? 70)),
    source:     input.source ?? "user_stated",
  });

  if (result.ok) {
    return {
      ok:      true,
      stored:  result.reason !== "duplicate_reconfirmed",
      message: result.reason === "duplicate_reconfirmed"
        ? "Reconfirmed — I already knew that."
        : "Noted. I'll remember.",
    };
  }
  return {
    ok:      false,
    stored:  false,
    reason:  result.reason,
    message: result.reason === "sensitive_blocked"
      ? "I'm not going to store that — it's sensitive and we don't keep health, religion, politics or similar facts."
      : "Couldn't save that right now.",
  };
}

export const rememberAboutUserCapability: CapabilityDefinition<RememberAboutUserInput, RememberAboutUserOutput> = {
  slug:        "remember_about_user",
  label:       "Remember a durable fact about the user",
  description:
    "Persist a short fact about the signed-in user so you can reference it in future conversations. " +
    "Use this when the user shares preferences, decisions, career details, or personal context worth " +
    "keeping (target country, nursing specialty, preferred budget tier, family situation, etc). " +
    "Choose a short snake_case factKey ('target_country', 'cv_delivery_pref') and a specific factValue. " +
    "Category: 'preference' (fades fast), 'decision' (medium), 'career' (slow), 'personal' (slowest). " +
    "DO NOT use this for health, religion, politics, sexuality, ethnicity, or credentials — they'll be " +
    "refused at the write layer. Call silently; the user doesn't need to see 'memory saved' confirmations.",
  inputSchema: {
    type: "object",
    properties: {
      factKey:   { type: "string",  description: "Short snake_case key (max 100 chars)." },
      factValue: { description: "The value to store. String, number, boolean, or small object." },
      category:  { type: "string",  enum: ["preference", "personal", "career", "decision"] },
      confidence:{ type: "number",  minimum: 0, maximum: 100, description: "Default 70." },
      source:    { type: "string",  enum: ["user_stated", "inferred", "system_derived"] },
    },
    required: ["factKey", "factValue", "category"],
  },
  outputSchema: {
    type: "object",
    properties: {
      ok:      { type: "boolean" },
      stored:  { type: "boolean" },
      message: { type: "string" },
    },
  },
  requiresAuth:  true,
  requiresPaid:  false,
  requiresAdmin: false,
  handler:       rememberAboutUserHandler,
};
