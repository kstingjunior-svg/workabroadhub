/**
 * Nanjila — persona guards.
 *
 * Two post-processors that run on every outbound reply AFTER the model has
 * generated and AFTER the price sanitizer has scrubbed prices. These enforce
 * persona rules from docs/nanjila/PERSONA_SPEC.md that we can't fully rely on
 * the model to hold on its own:
 *
 *   1. scrubForbiddenPhrases() — detects (and softens) phrases from the
 *      "never say" list: AI tells, corporate hedges, overpromises, sycophancy.
 *
 *   2. appendSignature() — appends the standard signature UNLESS the reply
 *      qualifies for suppression (short, warning-mode, celebration, already
 *      signed) — in which case it either omits or uses the alternate.
 *
 * Both are pure functions. Order of application matters:
 *
 *   modelReply → sanitizeReply (prices) → scrubForbiddenPhrases → appendSignature
 *
 * See PERSONA_SPEC.md §4 (signature) and §5 (never-say list) for authoritative
 * rules; this file is the mechanical enforcement.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Signatures
// ─────────────────────────────────────────────────────────────────────────────

export const SIGNATURE_STANDARD =
  "I'm Nanjila. Let's build your future abroad — safely.";

export const SIGNATURE_WARNING =
  "Slow down. Verify. I'm Nanjila — I've got your back.";

export const SIGNATURE_CELEBRATION =
  "That's what we're here for. Go do great things — I'm Nanjila.";

/** Minimum reply length (in characters) for a signature to make sense. */
const SIGNATURE_MIN_REPLY_LENGTH = 40;

// ─────────────────────────────────────────────────────────────────────────────
// Forbidden phrases — the "never say" list
// ─────────────────────────────────────────────────────────────────────────────
//
// Each entry has a regex to detect the phrase and an optional `softenTo` — a
// rewrite that captures the same intent without breaking the persona. When
// softenTo is null, we strip the phrase entirely (safer than trying to rewrite).
//
// Ordered roughly by frequency; the scrubber walks the whole list.
// See PERSONA_SPEC.md §5 for the authoritative list + rationale.

interface ForbiddenPhrase {
  code:     string;
  regex:    RegExp;
  softenTo: string | null;   // null → strip; string → replace with this
}

const FORBIDDEN_PHRASES: ForbiddenPhrase[] = [
  // ── AI tells (§5.1) ─────────────────────────────────────────────────────
  { code: "ai_language_model",
    regex: /\bas an? (?:AI|artificial intelligence) (?:language )?model[,.]?/gi,
    softenTo: "" },
  { code: "training_data",
    regex: /\bas of my (?:last )?(?:training data|knowledge cut-?off)[,.]?/gi,
    softenTo: "" },
  { code: "cannot_browse",
    regex: /\bI (?:cannot|can't|don't have (?:the )?ability to) browse (?:the )?internet[,.]?/gi,
    softenTo: "" },
  { code: "just_an_ai",
    regex: /\bI'?m just an? AI[,.]?/gi,
    softenTo: "" },
  { code: "no_real_time",
    regex: /\bI don'?t have access to real-?time (?:data|information)[,.]?/gi,
    softenTo: "" },

  // ── Corporate hedges (§5.2) ─────────────────────────────────────────────
  { code: "would_recommend",
    regex: /\bI would recommend that you consider\b/gi,
    softenTo: "I'd suggest" },
  { code: "may_be_prudent",
    regex: /\bit may be prudent to\b/gi,
    softenTo: "consider" },
  { code: "beyond_my_scope",
    regex: /\bthat is beyond my scope\b/gi,
    softenTo: "let me flag that to the team" },
  { code: "consult_professional_generic",
    // Only match the bare form, not "consult a licensed immigration lawyer" etc.
    regex: /\bplease consult a professional\.?/gi,
    softenTo: "" },

  // ── Overpromise language (§5.3) ─────────────────────────────────────────
  // We don't rewrite these — we log and let the overpromise gate handle it.
  // Detection here is for the metrics feed.
  { code: "guaranteed_visa",
    regex: /\bguaranteed visa\b/gi,
    softenTo: "a strong visa case" },
  { code: "hundred_percent_placement",
    regex: /\b100\s*%\s*(?:placement|success|guarantee|visa|job)\b/gi,
    softenTo: "high success rates" },
  { code: "no_interview_needed",
    regex: /\bno interview (?:required|needed)\b/gi,
    softenTo: "a straightforward interview" },

  // ── Sycophancy (§5.4) ───────────────────────────────────────────────────
  { code: "great_question",
    regex: /^\s*(?:that'?s a )?great question[!.]?\s*/gi,
    softenTo: "" },
  { code: "excellent_question",
    regex: /^\s*excellent question[!.]?\s*/gi,
    softenTo: "" },
  { code: "love_that",
    regex: /^\s*I love that (?:you'?re thinking|question)[!.]?\s*/gi,
    softenTo: "" },
  { code: "absolutely_right",
    regex: /\byou'?re absolutely right[!.]?/gi,
    softenTo: "You're right" },

  // ── Robotic openers (§5.5) ──────────────────────────────────────────────
  { code: "here_to_help_opener",
    regex: /^\s*I'?m here to help[!.]?\s*/gi,
    softenTo: "" },
  { code: "let_me_address",
    regex: /^\s*Let me address (?:that|your question)[.]?\s*/gi,
    softenTo: "" },
  { code: "important_question_opener",
    regex: /^\s*That'?s an important question about\b/gi,
    softenTo: "About" },
  { code: "certainly_opener",
    regex: /^\s*Certainly[!.]?\s*/gi,
    softenTo: "" },
  { code: "sure_opener",
    regex: /^\s*Sure[!.]?\s+(?=[A-Z])/g,
    softenTo: "" },
];

/**
 * Detect and soften forbidden phrases in a reply. Returns the scrubbed reply
 * and a list of matched codes (for metrics + admin visibility).
 */
export function scrubForbiddenPhrases(reply: string): {
  scrubbed: string;
  matched:  string[];
} {
  let scrubbed = reply;
  const matched: string[] = [];

  for (const p of FORBIDDEN_PHRASES) {
    if (p.regex.test(scrubbed)) {
      matched.push(p.code);
      p.regex.lastIndex = 0;
      scrubbed = scrubbed.replace(p.regex, p.softenTo ?? "");
    }
  }

  // Collapse repeated whitespace / empty leading punctuation introduced by
  // the strip-outs.
  scrubbed = scrubbed
    .replace(/^[\s.!,]+/g, "")   // Drop empty leading punctuation
    .replace(/\n{3,}/g, "\n\n")  // Cap blank lines
    .replace(/[ \t]{2,}/g, " ")  // Cap horizontal whitespace
    .trim();

  return { scrubbed, matched };
}

// ─────────────────────────────────────────────────────────────────────────────
// Signature appender
// ─────────────────────────────────────────────────────────────────────────────

export type SignatureMode = "auto" | "standard" | "warning" | "celebration" | "none";

export interface SignatureOptions {
  /** Force a specific signature (or none). Defaults to auto-detect. */
  mode?:        SignatureMode;
  /** Marker string the model can include to explicitly request warning mode. */
  hasWarning?:  boolean;
  /** Marker string the model can include to explicitly request celebration mode. */
  hasCelebration?: boolean;
}

/**
 * Append the appropriate signature to a Nanjila reply.
 *
 * Rules (see PERSONA_SPEC.md §4.2):
 *   • Skip if reply is too short (< 40 chars).
 *   • Skip if reply already contains "I'm Nanjila".
 *   • Warning mode if reply contains High Risk indicators OR opts.hasWarning.
 *   • Celebration mode if opts.hasCelebration.
 *   • Explicit opts.mode overrides everything.
 */
export function appendSignature(reply: string, opts: SignatureOptions = {}): string {
  const mode = opts.mode ?? "auto";

  if (mode === "none") return reply;

  const cleaned = reply.trim();
  if (!cleaned) return reply;

  // Already signed? Don't double-sign.
  if (/i'?m nanjila/i.test(cleaned)) return reply;

  // Too short?
  if (cleaned.length < SIGNATURE_MIN_REPLY_LENGTH && mode === "auto") return reply;

  // Explicit override.
  if (mode === "warning")     return `${cleaned}\n\n_${SIGNATURE_WARNING}_`;
  if (mode === "celebration") return `${cleaned}\n\n_${SIGNATURE_CELEBRATION}_`;
  if (mode === "standard")    return `${cleaned}\n\n_${SIGNATURE_STANDARD}_`;

  // Auto-detect.
  if (opts.hasCelebration || looksLikeCelebration(cleaned)) {
    return `${cleaned}\n\n_${SIGNATURE_CELEBRATION}_`;
  }
  if (opts.hasWarning || looksLikeWarning(cleaned)) {
    return `${cleaned}\n\n_${SIGNATURE_WARNING}_`;
  }
  return `${cleaned}\n\n_${SIGNATURE_STANDARD}_`;
}

/**
 * Detect High Risk / warning tone in a reply. Triggers the alternate signature.
 * Deliberately broad — better to over-detect and use warning tone than to
 * cheapen a scam alert with a friendly close.
 */
function looksLikeWarning(reply: string): boolean {
  const r = reply.toLowerCase();
  return (
    /\bhigh risk\b/.test(r) ||
    /\bred flag(s)?\b/.test(r) ||
    /🚩/.test(reply) ||
    /\bdo not (?:pay|send|reply|engage)\b/.test(r) ||
    /\bthis (?:looks like|is likely) a scam\b/.test(r) ||
    /\bslow down\b/.test(r) ||
    /\bstop\b.{0,20}\bdon'?t\b/.test(r)
  );
}

function looksLikeCelebration(reply: string): boolean {
  const r = reply.toLowerCase();
  return (
    /🎉/.test(reply) ||
    /\b(?:congratulations|congrats)\b/.test(r) ||
    /\bwelcome to (?:the )?(?:nhs|team|company)\b/.test(r) ||
    /\byou did it\b/.test(r)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Combined pipeline — the one call sites should use
// ─────────────────────────────────────────────────────────────────────────────

export interface ApplyGuardsResult {
  reply:            string;
  scrubbedPhrases:  string[];
  signatureApplied: SignatureMode | null;
}

/**
 * Apply the full persona guard pipeline: scrub forbidden phrases, then append
 * the correct signature. Returns the final reply plus diagnostics for the
 * admin dashboard.
 */
export function applyPersonaGuards(
  raw: string,
  opts: SignatureOptions = {},
): ApplyGuardsResult {
  const { scrubbed, matched } = scrubForbiddenPhrases(raw);
  const withSig = appendSignature(scrubbed, opts);
  let sigApplied: SignatureMode | null = null;
  if (withSig !== scrubbed.trim() && withSig !== scrubbed) {
    if (withSig.includes(SIGNATURE_WARNING))     sigApplied = "warning";
    else if (withSig.includes(SIGNATURE_CELEBRATION)) sigApplied = "celebration";
    else if (withSig.includes(SIGNATURE_STANDARD))    sigApplied = "standard";
  }
  return { reply: withSig, scrubbedPhrases: matched, signatureApplied: sigApplied };
}
