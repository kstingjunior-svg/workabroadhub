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

import { Sparkles, Info } from "lucide-react";

export const AI_DISCLAIMER_TEXT =
  "AI responses are generated automatically and should not be considered legal, immigration or government advice. Users should verify important information with the relevant authorities.";

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

  return (
    <div
      className={`rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-100 flex items-start gap-2 ${className}`}
      data-testid="ai-disclaimer-banner"
      role="note"
    >
      <Info className="h-4 w-4 shrink-0 mt-0.5" />
      <div>
        <strong className="font-semibold">AI-generated content:</strong>{" "}
        {AI_DISCLAIMER_TEXT}
      </div>
    </div>
  );
}
