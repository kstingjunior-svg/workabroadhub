/**
 * Name Guard — three-level decision engine (2026-11). PURE except for the
 * optional AI callback, which is injected (so tests can simulate an outage).
 *
 *   ACCEPT  — plausible structure, nothing offensive.
 *   REJECT  — clear profanity / abusive phrase / numeric / symbols / link /
 *             keyboard mashing / sentence.
 *   REVIEW  — ambiguous: registration CONTINUES, the name is flagged for an
 *             admin. Unfamiliar names are never rejected.
 *
 * AI is only consulted for REVIEW candidates and can never reject on its
 * own: it needs a deterministic signal pointing the same way.
 */
import { cleanInput, views } from "./normalize";
import { matchLexicon, type LexiconHit, type Term } from "./lexicon";
import { assessPlausibility, type HardCode, type SoftCode } from "./plausibility";
import type { AiVerdict } from "./ai";

export type Decision = "accept" | "review" | "reject";
export type ReasonCategory = "ok" | "offensive" | "random" | "incomplete" | "not_a_name" | "uncertain";

export interface NameDecision {
  decision: Decision;
  category: ReasonCategory;
  /** Polite, user-facing; never reveals dictionary terms or rules. */
  message: string | null;
  /** Internal (admin) detail. */
  signals: { lexicon: LexiconHit[]; hard: HardCode[]; soft: SoftCode[]; ai: AiVerdict | null; whitelisted: boolean };
}

export const MESSAGES = {
  offensive: "Please enter an appropriate personal name. Offensive language and inappropriate expressions are not permitted on WorkAbroadHub.",
  random: "Please enter your actual name rather than random characters or unrelated text.",
  incomplete: "Please check your name and try again.",
};

const RANDOM_HARD = new Set<HardCode>(["numeric", "digits", "symbols", "no_letters", "keyboard_mash", "repeated_chars", "contact_or_link", "too_many_words", "sentence", "too_long"]);
const INCOMPLETE_HARD = new Set<HardCode>(["empty", "too_short"]);

export interface DecideOptions {
  terms: Term[];
  allow?: Set<string>;
  ai?: ((name: string) => Promise<AiVerdict | null>) | null;
}

export async function decideName(raw: string, opts: DecideOptions): Promise<NameDecision> {
  const name = cleanInput(raw);
  const allow = opts.allow ?? new Set<string>();
  const v = views(name);
  const whitelisted = !!v.joined && allow.has(v.joined);
  const p = assessPlausibility(name);
  const base = { lexicon: [] as LexiconHit[], hard: p.hard, soft: p.soft, ai: null as AiVerdict | null, whitelisted };

  if (whitelisted) return { decision: "accept", category: "ok", message: null, signals: base };

  const incompleteHard = p.hard.filter((h) => INCOMPLETE_HARD.has(h));
  if (incompleteHard.length) return { decision: "reject", category: "incomplete", message: MESSAGES.incomplete, signals: base };

  const lexicon = matchLexicon(name, opts.terms, allow);
  base.lexicon = lexicon;
  if (lexicon.some((h) => h.severity === "block")) {
    return { decision: "reject", category: "offensive", message: MESSAGES.offensive, signals: base };
  }
  const randomHard = p.hard.filter((h) => RANDOM_HARD.has(h));
  if (randomHard.length) {
    return { decision: "reject", category: randomHard.some((h) => h === "sentence" || h === "contact_or_link" || h === "too_many_words") ? "not_a_name" : "random", message: MESSAGES.random, signals: base };
  }

  const ambiguous = lexicon.length > 0 || p.soft.length > 0;
  if (!ambiguous) return { decision: "accept", category: "ok", message: null, signals: base };

  // Ambiguous → AI (optional). AI can only confirm what a deterministic signal already suggests.
  let ai: AiVerdict | null = null;
  if (opts.ai) { try { ai = await opts.ai(name); } catch { ai = null; } }
  base.ai = ai;
  if (ai) {
    const offensiveAi = (ai.category === "CLEAR_PROFANITY" || ai.category === "OFFENSIVE_PHRASE") && ai.confidence >= 0.9;
    const randomAi = (ai.category === "RANDOM_TEXT" || ai.category === "SENTENCE_OR_UNRELATED_PHRASE") && ai.confidence >= 0.9;
    if (offensiveAi && lexicon.length > 0) return { decision: "reject", category: "offensive", message: MESSAGES.offensive, signals: base };
    if (randomAi && p.soft.some((s) => s === "vowelless_word" || s === "long_consonant_run" || s === "repeated_syllables")) {
      return { decision: "reject", category: "random", message: MESSAGES.random, signals: base };
    }
    if (ai.category === "PLAUSIBLE_NAME" && ai.confidence >= 0.8 && lexicon.length === 0) {
      return { decision: "accept", category: "ok", message: null, signals: base };
    }
  }
  return { decision: "review", category: "uncertain", message: null, signals: base };
}
