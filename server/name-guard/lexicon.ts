/**
 * Name Guard — multilingual offensive-term lexicon + matcher (2026-11).
 *
 * The SEED below is loaded into the `name_guard_terms` table on start-up
 * (ON CONFLICT DO NOTHING). After that, admins manage the list from
 * /admin/name-guard — no code change needed. The matcher itself is PURE.
 *
 * Match modes (chosen per term to avoid the "Scunthorpe problem", i.e.
 * blocking real names that merely contain an offensive substring):
 *   word     — a whole word of the name equals the term (after normalising).
 *              Used for short or ambiguous terms: "kuma" must not hit "Kumar",
 *              "shit" must not hit the Ethiopian name "Shitaye".
 *   contains — the term appears anywhere in the letters with spaces and
 *              punctuation removed. Only for long, unambiguous terms that
 *              never occur inside real names ("motherfucker", "kumamako").
 *   phrase   — a multi-word expression; matched on the joined letters.
 *
 * Severity:
 *   block  — reject the name.
 *   review — allow registration but flag for an admin (the word is also a
 *            legitimate name or has an innocent meaning somewhere).
 *
 * Kept deliberately to clearly offensive vocabulary. Words like "shoga"
 * (Swahili for a woman's female friend, also used as a slur) are REVIEW,
 * never block.
 */
import { views, normTerm } from "./normalize";

export type Severity = "block" | "review";
export type MatchMode = "word" | "contains" | "phrase";
export type Category = "profanity" | "sexual" | "insult" | "slur" | "hate" | "abusive_phrase" | "spam";

export interface Term {
  term: string;
  language: string;      // en | sw | sheng | ...
  category: Category;
  severity: Severity;
  mode: MatchMode;
}

export const SEED_TERMS: Term[] = [
  // ── English ─────────────────────────────────────────────────────────
  { term: "fuck", language: "en", category: "profanity", severity: "block", mode: "contains" },
  { term: "fvck", language: "en", category: "profanity", severity: "block", mode: "contains" },
  { term: "phuck", language: "en", category: "profanity", severity: "block", mode: "contains" },
  { term: "fuk", language: "en", category: "profanity", severity: "block", mode: "word" },
  { term: "fck", language: "en", category: "profanity", severity: "block", mode: "word" },
  { term: "motherfucker", language: "en", category: "profanity", severity: "block", mode: "contains" },
  { term: "shit", language: "en", category: "profanity", severity: "block", mode: "word" },
  { term: "bullshit", language: "en", category: "profanity", severity: "block", mode: "contains" },
  { term: "bitch", language: "en", category: "insult", severity: "block", mode: "contains" },
  { term: "cunt", language: "en", category: "sexual", severity: "block", mode: "word" },
  { term: "pussy", language: "en", category: "sexual", severity: "block", mode: "word" },
  { term: "asshole", language: "en", category: "insult", severity: "block", mode: "contains" },
  { term: "arsehole", language: "en", category: "insult", severity: "block", mode: "contains" },
  { term: "bastard", language: "en", category: "insult", severity: "block", mode: "word" },
  { term: "slut", language: "en", category: "sexual", severity: "block", mode: "word" },
  { term: "whore", language: "en", category: "sexual", severity: "block", mode: "word" },
  { term: "wanker", language: "en", category: "insult", severity: "block", mode: "word" },
  { term: "twat", language: "en", category: "insult", severity: "block", mode: "word" },
  { term: "cock", language: "en", category: "sexual", severity: "review", mode: "word" },   // also a surname
  { term: "dick", language: "en", category: "sexual", severity: "review", mode: "word" },   // also a given name
  { term: "dickhead", language: "en", category: "insult", severity: "block", mode: "contains" },
  { term: "penis", language: "en", category: "sexual", severity: "block", mode: "word" },
  { term: "vagina", language: "en", category: "sexual", severity: "block", mode: "word" },
  { term: "porn", language: "en", category: "sexual", severity: "block", mode: "word" },
  { term: "sex", language: "en", category: "sexual", severity: "review", mode: "word" },
  { term: "idiot", language: "en", category: "insult", severity: "block", mode: "word" },
  { term: "stupid", language: "en", category: "insult", severity: "block", mode: "word" },
  { term: "moron", language: "en", category: "insult", severity: "review", mode: "word" },   // also a Spanish surname (Morón)
  { term: "retard", language: "en", category: "slur", severity: "block", mode: "word" },
  { term: "nigger", language: "en", category: "slur", severity: "block", mode: "contains" },
  { term: "nigga", language: "en", category: "slur", severity: "block", mode: "word" },
  { term: "faggot", language: "en", category: "slur", severity: "block", mode: "contains" },
  { term: "fag", language: "en", category: "slur", severity: "block", mode: "word" },
  { term: "kill yourself", language: "en", category: "abusive_phrase", severity: "block", mode: "phrase" },
  { term: "your mother", language: "en", category: "abusive_phrase", severity: "block", mode: "phrase" },
  { term: "your mom", language: "en", category: "abusive_phrase", severity: "block", mode: "phrase" },
  { term: "fuck you", language: "en", category: "abusive_phrase", severity: "block", mode: "phrase" },
  { term: "suck my", language: "en", category: "abusive_phrase", severity: "block", mode: "phrase" },

  // ── Kiswahili ───────────────────────────────────────────────────────
  { term: "kuma", language: "sw", category: "sexual", severity: "review", mode: "word" },   // also a Japanese surname
  { term: "kumamako", language: "sw", category: "abusive_phrase", severity: "block", mode: "contains" },
  { term: "kumanyoko", language: "sw", category: "abusive_phrase", severity: "block", mode: "contains" },
  { term: "kuma mamako", language: "sw", category: "abusive_phrase", severity: "block", mode: "phrase" },
  { term: "kuma yako", language: "sw", category: "abusive_phrase", severity: "block", mode: "phrase" },   // added after go-live test (AI rated it plausible)
  { term: "kuma nyoko", language: "sw", category: "abusive_phrase", severity: "block", mode: "phrase" },
  { term: "nyoko", language: "sw", category: "abusive_phrase", severity: "block", mode: "word" },
  { term: "mboro", language: "sw", category: "sexual", severity: "review", mode: "word" },   // can be a surname
  { term: "mkundu", language: "sw", category: "sexual", severity: "block", mode: "word" },
  { term: "matako", language: "sw", category: "sexual", severity: "review", mode: "word" },   // possible Japanese name
  { term: "malaya", language: "sw", category: "sexual", severity: "review", mode: "word" },   // also a given name (Philippines, Russia)
  { term: "kahaba", language: "sw", category: "sexual", severity: "block", mode: "word" },
  { term: "tomba", language: "sw", category: "sexual", severity: "review", mode: "word" },   // also an Italian surname
  { term: "kutomba", language: "sw", category: "sexual", severity: "block", mode: "word" },
  { term: "nakutomba", language: "sw", category: "abusive_phrase", severity: "block", mode: "contains" },
  { term: "fira", language: "sw", category: "sexual", severity: "review", mode: "word" },   // also a given name
  { term: "kufira", language: "sw", category: "sexual", severity: "block", mode: "word" },
  { term: "msenge", language: "sw", category: "slur", severity: "block", mode: "word" },
  { term: "shoga", language: "sw", category: "slur", severity: "review", mode: "word" },   // also "female friend"
  { term: "mavi", language: "sw", category: "profanity", severity: "review", mode: "word" },   // also a Turkish name
  { term: "mjinga", language: "sw", category: "insult", severity: "block", mode: "word" },
  { term: "mpumbavu", language: "sw", category: "insult", severity: "block", mode: "word" },
  { term: "pumbavu", language: "sw", category: "insult", severity: "block", mode: "word" },
  { term: "mshenzi", language: "sw", category: "insult", severity: "block", mode: "word" },
  { term: "takataka", language: "sw", category: "insult", severity: "block", mode: "word" },
  { term: "nguruwe", language: "sw", category: "insult", severity: "block", mode: "word" },
  { term: "mbwa wewe", language: "sw", category: "abusive_phrase", severity: "block", mode: "phrase" },
  { term: "mamako", language: "sw", category: "abusive_phrase", severity: "review", mode: "word" },

  // ── Sheng ───────────────────────────────────────────────────────────
  { term: "fala", language: "sheng", category: "insult", severity: "review", mode: "word" },   // also a surname
  { term: "bwege", language: "sheng", category: "insult", severity: "block", mode: "word" },
  { term: "zuzu", language: "sheng", category: "insult", severity: "review", mode: "word" },   // also a nickname (e.g. Zuzanna)
  { term: "msoto", language: "sheng", category: "insult", severity: "review", mode: "word" },
  { term: "kunguru", language: "sheng", category: "insult", severity: "review", mode: "word" },
  { term: "mafala", language: "sheng", category: "insult", severity: "block", mode: "word" },
  { term: "manzi wa kuma", language: "sheng", category: "abusive_phrase", severity: "block", mode: "phrase" },

  // ── Spam / not a name ───────────────────────────────────────────────
  { term: "whatsapp", language: "en", category: "spam", severity: "block", mode: "word" },
  { term: "telegram", language: "en", category: "spam", severity: "block", mode: "word" },
  { term: "crypto", language: "en", category: "spam", severity: "block", mode: "word" },
  { term: "bitcoin", language: "en", category: "spam", severity: "block", mode: "word" },
  { term: "forex", language: "en", category: "spam", severity: "block", mode: "word" },
  { term: "free money", language: "en", category: "spam", severity: "block", mode: "phrase" },
  { term: "click here", language: "en", category: "spam", severity: "block", mode: "phrase" },
];

export interface LexiconHit { term: string; language: string; category: Category; severity: Severity }

function squeeze(s: string): string {
  return s.replace(/(\p{L})\1+/gu, "$1");
}

/**
 * Find offensive terms in a name. `allow` = admin-whitelisted normalised
 * names/words that must never be flagged.
 */
export function matchLexicon(raw: string, terms: Term[], allow: Set<string> = new Set()): LexiconHit[] {
  const v = views(raw);
  if (allow.has(v.joined) || allow.has(squeeze(v.joined))) return [];
  const words = v.words.filter((w) => !allow.has(w));
  // "m.k.u.n.d.u" / "s h i t": letters typed one by one → judge them as one word too.
  const singles = v.words.filter((w) => w.length === 1).length;
  if (v.words.length >= 3 && singles >= v.words.length - 1 && !allow.has(v.joined)) words.push(v.joined);
  const sWords = words.map(squeeze);
  const sJoined = squeeze(words.join(""));
  const hits: LexiconHit[] = [];
  for (const t of terms) {
    const nt = normTerm(t.term);
    if (!nt) continue;
    const st = squeeze(nt);
    let hit = false;
    if (t.mode === "word") {
      hit = words.includes(nt) || sWords.includes(st);
    } else if (t.mode === "contains") {
      hit = st.length >= 4 && sJoined.includes(st);
    } else {
      hit = st.length >= 4 && sJoined.includes(st);
    }
    if (hit) hits.push({ term: t.term, language: t.language, category: t.category, severity: t.severity });
  }
  // strongest first
  return hits.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "block" ? -1 : 1));
}
