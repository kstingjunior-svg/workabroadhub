/**
 * AI Disclaimer — Play Store compliance component.
 *
 * Google Play now specifically flags AI-generated content. Any surface
 * that renders AI output MUST show this disclaimer near the output.
 *
 * Import wherever an AI feature is presented to users:
 *   • NanjilaChatWidget (AI chat)
 *   • ATS CV Checker, Write-from-Scratch, Job Assistant, Scam Checker,
 *     Visa Check, Offer Check, Interview Practice, Career Match, etc.
 *
 * Two variants:
 *   <AiDisclaimer />               — full banner (default; use above output)
 *   <AiDisclaimer variant="inline"/> — compact one-liner (use in chat headers)
 *
 * Single source of truth: to update the wording, edit here. Never inline.
 */

import { Sparkles } from "lucide-react";

// Softer, reassuring language — meets Play Store AI-disclosure requirement
// without scaring users at the moment of purchase. Positions AI as a
// feature ("built by AI, reviewed by our team") rather than a warning.
export const AI_DISCLAIMER_TEXT =
  "Built with AI and reviewed by our team for quality. For visa or legal matters, always confirm official requirements with the relevant authority.";

interface AiDisclaimerProps {
  variant?: "banner" | "inline";
  className?: string;
}

export function AiDisclaimer({ variant = "banner", className = "" }: AiDisclaimerProps) {
  if (variant === "inline") {
    return (
      <p
        className={`text-[11px] text-muted-foreground italic leading-snug flex items-start gap-1.5 ${className}`}
        data-testid="ai-disclaimer-inline"
      >
        <Sparkles className="h-3 w-3 shrink-0 mt-0.5" />
        <span>{AI_DISCLAIMER_TEXT}</span>
      </p>
    );
  }

  // Softer, less alarming: neutral slate/gray tones instead of amber warning.
  // Sparkles icon (positive AI vibe) instead of Info icon (warning vibe).
  return (
    <p
      className={`text-xs text-muted-foreground/80 leading-snug flex items-start gap-1.5 px-1 py-2 ${className}`}
      data-testid="ai-disclaimer-banner"
      role="note"
    >
      <Sparkles className="h-3 w-3 shrink-0 mt-0.5 text-primary/60" />
      <span>{AI_DISCLAIMER_TEXT}</span>
    </p>
  );
}
