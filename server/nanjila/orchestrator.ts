/**
 * Nanjila — orchestrator.
 *
 * Multi-turn tool-call loop that composes system prompt + capability manifest
 * + memory context, hands to the model, executes tool calls it requests,
 * feeds results back, and returns the final assistant reply.
 *
 * Sits BEHIND the existing legacy `router.ts`. Wired to
 * `NanjilaFlags.orchestratorEnabled` — off by default. When enabled AND
 * `userInBucket(userId, orchestratorRolloutPct)` is true, the caller
 * (nanjila.ts) routes through here.
 *
 * Key properties:
 *
 *   • Bounded — max ORCHESTRATOR_MAX_ITERATIONS tool calls per turn.
 *   • Entitlement-safe — each capability is re-checked against the caller's
 *     entitlement at invocation time, defence-in-depth over the manifest
 *     filter.
 *   • Fully instrumented — every tool call writes to nanjila_conversations
 *     via recordTurn() so the admin dashboard sees what was invoked.
 *   • Fails soft — if any tool errors, orchestrator continues and asks the
 *     model to respond without that data. Never returns 500 to the user.
 *   • Backward-compatible — same input/output shape as the legacy path so
 *     the flag flip is atomic.
 *
 * See OS_EVOLUTION_PLAN.md §13 (Feature 8) and §17.4 (cost governance).
 */

import { openai } from "../lib/openai";
import {
  availableCapabilities,
  resolveCapability,
  invokeCapability,
  type CapabilityDefinition,
  type CapabilityContext,
} from "./capabilities";
import type { UserEntitlement } from "./capabilities/types";
import { NanjilaFlags } from "./feature-flags";
import { recordTurn } from "./conversations";
import { applyPersonaGuards } from "../ai/persona-guards";
import { sanitizeReply } from "../ai/price-sanitizer";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface OrchestrateOptions {
  systemPrompt:     string;
  userMessage:      string;
  entitlement:      UserEntitlement;
  conversationId?:  string;
  model?:           string;   // Override default gpt-4o-mini
  maxIterations?:   number;
}

export interface OrchestrateResult {
  reply:              string;
  toolCallsInvoked:   string[];
  iterations:         number;
  fellBackToLegacy:   boolean;
  costEstimateCents:  number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ORCHESTRATOR_MAX_ITERATIONS = 4;
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_TEMPERATURE = 0.6;

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function orchestrate(opts: OrchestrateOptions): Promise<OrchestrateResult> {
  const maxIter = Math.max(1, Math.min(8, opts.maxIterations ?? ORCHESTRATOR_MAX_ITERATIONS));
  const model   = opts.model ?? DEFAULT_MODEL;

  // ── 1. Build the tool manifest for THIS user ──────────────────────────
  const capabilities = await availableCapabilities(opts.entitlement);
  const tools = capabilities.map(capabilityToOpenAiTool);

  // ── 2. Prime the message stack ─────────────────────────────────────────
  const messages: any[] = [
    { role: "system", content: opts.systemPrompt },
    { role: "user",   content: opts.userMessage },
  ];

  const toolCallsInvoked: string[] = [];
  let iterations = 0;
  let costCents  = 0;

  // ── 3. Multi-turn tool loop ────────────────────────────────────────────
  while (iterations < maxIter) {
    iterations++;

    let completion;
    try {
      completion = await openai.chat.completions.create({
        model,
        temperature: DEFAULT_TEMPERATURE,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? "auto" : undefined,
      });
    } catch (err: any) {
      console.error("[Nanjila/Orchestrator] LLM call failed:", err?.message);
      return {
        reply:              await guardedReply(fallbackReply(opts.userMessage)),
        toolCallsInvoked,
        iterations,
        fellBackToLegacy:   false,
        costEstimateCents:  costCents,
      };
    }

    costCents += estimateCostCents(model, completion.usage);

    const choice = completion.choices[0];
    if (!choice) break;
    const msg = choice.message;

    // Model returned a normal text reply → we're done.
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      const raw = msg.content ?? "";
      const reply = await guardedReply(raw);
      return {
        reply,
        toolCallsInvoked,
        iterations,
        fellBackToLegacy:   false,
        costEstimateCents:  costCents,
      };
    }

    // Model requested tool calls — resolve, invoke, feed results back.
    messages.push(msg);
    for (const call of msg.tool_calls) {
      const slug = call.function?.name ?? "";
      let parsedInput: any = {};
      try {
        parsedInput = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        parsedInput = {};
      }

      const cap = await resolveCapability(slug, opts.entitlement);
      let toolResult: any;
      if (!cap) {
        toolResult = {
          ok:      false,
          error:   "capability_not_available",
          message: "That action isn't available to you right now.",
        };
      } else {
        try {
          const ctx: CapabilityContext = {
            userId:      opts.entitlement.userId,
            entitlement: opts.entitlement,
            traceId:     opts.conversationId ?? "orchestrate",
          };
          toolResult = await invokeCapability(cap, parsedInput, ctx);
          toolCallsInvoked.push(slug);
          // Best-effort record on the conversation.
          if (opts.conversationId) {
            recordTurn(opts.conversationId, { addTool: slug }).catch(() => {});
          }
        } catch (err: any) {
          console.warn(`[Nanjila/Orchestrator] Tool ${slug} threw:`, err?.message);
          toolResult = {
            ok:      false,
            error:   "tool_execution_error",
            message: `That check didn't complete. I'll answer without it.`,
          };
        }
      }

      messages.push({
        role:         "tool",
        tool_call_id: call.id,
        content:      JSON.stringify(toolResult),
      });
    }
    // Loop back — the model will now see the tool outputs and either request
    // more calls or produce the final assistant reply.
  }

  // Ran out of iterations without a final reply — safety fallback.
  return {
    reply:              await guardedReply(
      "I was working on your question but hit a limit before finishing. Try asking again — I'll take another pass."
    ),
    toolCallsInvoked,
    iterations,
    fellBackToLegacy:   false,
    costEstimateCents:  costCents,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function capabilityToOpenAiTool(cap: CapabilityDefinition): any {
  return {
    type: "function",
    function: {
      name:        cap.slug,
      description: cap.description,
      parameters:  cap.inputSchema,
    },
  };
}

async function guardedReply(raw: string): Promise<string> {
  // Same guard chain the legacy path uses — price sanitizer, persona guards.
  const priceScrubbed = await sanitizeReply(raw);
  const { reply } = applyPersonaGuards(priceScrubbed);
  return reply;
}

function fallbackReply(_userMessage: string): string {
  return "I'm having trouble reaching my system right now. Give me a minute and try again — if it keeps failing, tap /contact to reach the team.";
}

function estimateCostCents(model: string, usage: any): number {
  // Rough cost estimate in KES cents. Fine-grained cost tracking will move
  // into a per-turn ledger in Phase C.
  if (!usage) return 0;
  const input  = usage.prompt_tokens ?? 0;
  const output = usage.completion_tokens ?? 0;
  // gpt-4o-mini: ~KES 0.20 per 1M input, ~KES 0.80 per 1M output tokens.
  // gpt-4o     : ~KES 4.00 per 1M input, ~KES 12.00 per 1M output tokens.
  if (model.includes("gpt-4o-mini")) {
    return Math.ceil(((input * 0.20) + (output * 0.80)) / 1_000_000 * 100);
  }
  if (model.includes("gpt-4o")) {
    return Math.ceil(((input * 4.00) + (output * 12.00)) / 1_000_000 * 100);
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rollout gate — the single place nanjila.ts calls to decide "orchestrate or legacy?"
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true when THIS request should route through the orchestrator.
 * Combines the master flag with the percentage-rollout bucket.
 */
export function shouldUseOrchestrator(userId: string | null | undefined): boolean {
  if (!NanjilaFlags.orchestratorEnabled) return false;
  const pct = NanjilaFlags.orchestratorRolloutPct;
  if (pct <= 0) return false;
  if (pct >= 100) return true;
  return NanjilaFlags.userInBucket(userId ?? "guest", pct);
}
