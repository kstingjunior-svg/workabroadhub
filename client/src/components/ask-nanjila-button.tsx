/**
 * Ask Nanjila Button — shared component.
 *
 * Renders a small CTA on screening-tool result pages that opens the Nanjila
 * chat widget with a context-aware opening message. Fits the Master Plan
 * quick win: turn one-off tool runs into an ongoing coaching conversation.
 *
 * How it works:
 *   The NanjilaChatWidget listens for a window CustomEvent("nanjila:open",
 *   { detail: { opener } }) and, on receipt, opens the widget and seeds the
 *   first assistant message with the provided opener text. We tailor the
 *   opener to the screening topic so she picks up the thread naturally.
 *
 * Usage:
 *
 *   <AskNanjilaButton topic="visa" summary="High Risk — MRZ checksum failed." />
 *   <AskNanjilaButton topic="offer" summary="Medium Risk — sender uses gmail domain." />
 *   <AskNanjilaButton topic="cv" summary="Score 67/100." />
 *   <AskNanjilaButton topic="scam" summary="High Risk — 3 warning signals." />
 */

import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";

export type NanjilaTopic = "visa" | "offer" | "cv" | "scam";

interface Props {
  /** Which screening tool the user just used — drives the opener wording. */
  topic:   NanjilaTopic;
  /** Short human-readable summary of what the tool found. */
  summary?: string;
  /** Optional override for the button label. */
  label?:  string;
  /** Optional visual variant. */
  variant?: "default" | "outline" | "ghost";
  /** Optional size. */
  size?:   "sm" | "default" | "lg";
  /** Optional additional className. */
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Opener library — one per topic. These are the FIRST message Nanjila "says"
// when the widget opens. Written in her voice per PERSONA_SPEC.md — direct,
// warm, ends with an offer to help.
// ─────────────────────────────────────────────────────────────────────────────

const OPENERS: Record<NanjilaTopic, (summary: string) => string> = {
  visa: (s) =>
    `Hey — I see you just ran a visa screening${s ? ` (${s})` : ""}. Want me to walk you through what the findings actually mean, or help you figure out what to do next?`,

  offer: (s) =>
    `Hey — I noticed you just screened an offer letter${s ? ` (${s})` : ""}. If any of the findings felt confusing, I can explain them in plain language. Or if you're not sure whether to accept the offer, I can help you think it through.`,

  cv: (s) =>
    `Right — you just got your CV score${s ? ` (${s})` : ""}. Want a quick walkthrough of the top three things that would move the number up? I can also point you at the right service if you want us to fix it for you.`,

  scam: (s) =>
    `Ok, I see the scam checker just flagged this${s ? ` (${s})` : ""}. Want me to help you decide what to do next? If you've already sent money or documents, we should act fast — I can walk you through reporting it.`,
};

export function AskNanjilaButton({
  topic,
  summary,
  label,
  variant = "outline",
  size = "default",
  className,
}: Props) {
  const handleClick = () => {
    const opener = OPENERS[topic](summary ?? "");
    try {
      window.dispatchEvent(new CustomEvent("nanjila:open", {
        detail: {
          reason:  `ask-nanjila:${topic}`,
          opener,
          path:    window.location.pathname,
          context: { topic, summary },
        },
      }));
    } catch (err) {
      // If the widget isn't mounted (shouldn't happen — it's global), log and no-op.
      console.warn("[AskNanjilaButton] dispatch failed:", err);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      className={className}
      data-testid={`ask-nanjila-${topic}`}
    >
      <MessageCircle className="h-4 w-4 mr-2" />
      {label ?? defaultLabel(topic)}
    </Button>
  );
}

function defaultLabel(topic: NanjilaTopic): string {
  switch (topic) {
    case "visa":  return "Ask Nanjila about this visa";
    case "offer": return "Ask Nanjila about this offer";
    case "cv":    return "Ask Nanjila what to fix";
    case "scam":  return "Ask Nanjila what to do next";
  }
}
