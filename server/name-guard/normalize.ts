/**
 * Name Guard — text normalisation for matching (2026-11). PURE.
 *
 * Produces several "views" of a submitted name so the profanity matcher
 * sees through the usual evasion tricks:
 *   • Unicode: NFKC (full-width letters, ligatures) + strip combining marks
 *     for matching only (the stored name keeps its accents)
 *   • Look-alike letters from other scripts (Cyrillic а/е/о/р/с/х…) → Latin
 *   • Leetspeak: 0→o 1→i 3→e 4→a 5→s 7→t 8→b @→a $→s ! →i
 *   • Separators between letters: "f.u.c.k", "f u c k", "f-u_c*k"
 *   • Repeated letters: "fuuuuck" → "fuck"
 *   • Zero-width / invisible characters removed
 */

const ZERO_WIDTH = /[​-‏‪-‮⁠-⁤﻿­]/g;

const CONFUSABLES: Record<string, string> = {
  // Cyrillic
  "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "у": "y", "к": "k", "м": "m", "т": "t", "в": "b", "н": "h", "і": "i", "ј": "j", "ѕ": "s",
  // Greek
  "α": "a", "ε": "e", "ο": "o", "ρ": "p", "τ": "t", "υ": "u", "ι": "i", "κ": "k", "ν": "v",
};

const LEET: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g",
  "@": "a", "$": "s", "!": "i", "|": "i", "+": "t", "€": "e", "£": "l",
};

/** Clean the text the person typed: NFKC, invisible chars out, whitespace collapsed. Keeps accents and case. */
export function cleanInput(raw: string): string {
  return String(raw ?? "")
    .normalize("NFKC")
    .replace(ZERO_WIDTH, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function stripMarks(s: string): string {
  return s.normalize("NFD").replace(/\p{M}+/gu, "").normalize("NFC");
}

function deconfuse(s: string): string {
  return [...s].map((ch) => CONFUSABLES[ch] ?? ch).join("");
}

function deleet(s: string): string {
  return [...s].map((ch) => LEET[ch] ?? ch).join("");
}

function squeezeRepeats(s: string): string {
  return s.replace(/(\p{L})\1{2,}/gu, "$1$1").replace(/(\p{L})\1+/gu, "$1");
}

export interface NameViews {
  /** What the person typed, cleaned. */
  clean: string;
  /** Lower-case words with marks stripped, confusables + leet mapped, separators kept as spaces. */
  words: string[];
  /** All letters joined with no spaces or punctuation ("f.u c-k" → "fuck"). */
  joined: string;
  /** joined with repeated letters squeezed ("fuuuck" → "fuck"). */
  squeezed: string;
  /** words with repeats squeezed. */
  squeezedWords: string[];
}

export function views(raw: string): NameViews {
  const clean = cleanInput(raw);
  const base = deleet(deconfuse(stripMarks(clean.toLowerCase())));
  const words = base.split(/[^\p{L}]+/u).filter(Boolean);
  const joined = words.join("");
  return {
    clean,
    words,
    joined,
    squeezed: squeezeRepeats(joined),
    squeezedWords: words.map(squeezeRepeats),
  };
}

/** Normalise a dictionary term the same way (so admins can type "f*ck" or "Kumamako"). */
export function normTerm(term: string): string {
  const v = views(term);
  return v.joined;
}
