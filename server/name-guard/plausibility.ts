/**
 * Name Guard — name plausibility (2026-11). PURE.
 *
 * Judges whether text LOOKS like a personal name. It never checks a name
 * against a list of "known" names, never requires two words, and only
 * applies Latin-alphabet heuristics (vowels, keyboard rows) to Latin-script
 * words — Arabic, Ge'ez, Devanagari, CJK, Cyrillic etc. are judged on
 * structure only.
 *
 * Returns hard failures (reject) and soft signals (review), each with a code.
 */
import { cleanInput } from "./normalize";

export type HardCode = "empty" | "too_short" | "too_long" | "numeric" | "digits" | "symbols" | "contact_or_link" | "too_many_words" | "sentence" | "keyboard_mash" | "repeated_chars" | "no_letters";
export type SoftCode = "unusual_characters" | "vowelless_word" | "long_consonant_run" | "repeated_syllables" | "many_words" | "single_letter_words";

export interface Plausibility { hard: HardCode[]; soft: SoftCode[]; wordCount: number; latin: boolean }

const ALLOWED_PUNCT = /^[\p{L}\p{M}\s'’`ʼ\-.]+$/u;
const LATIN_WORD = /^[a-zà-ɏ'’`ʼ.\-]+$/i;
const VOWELS = /[aeiouyàáâãäåæèéêëìíîïòóôõöøùúûüýÿœ]/i;
const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890"];

const SENTENCE_RX: RegExp[] = [
  /\b(i am|i'm|iam|my name is|call me|this is|that is|it is|there is)\b/i,
  /\b(hello|hi there|greetings|please|kindly|thanks|thank you)\b/i,
  /\b(what|why|when|where|how|who)\s+\w+/i,
  /\b(test|testing|tester|asdf|qwerty|dummy|fake|anonymous|unknown|nobody|admin|user\d*|username|name|firstname|lastname|surname|none|null|undefined)\b/i,
  /\b(jina langu|naitwa|habari yako|niaje)\b/i, // Swahili/Sheng greetings & "my name is" (not "Sasa"/"Mambo" — real names)
];

function keyboardRun(word: string): boolean {
  const w = word.toLowerCase();
  // 5 in a row — 4 would hit real names ("Berty" contains "erty").
  if (w.length < 5) return false;
  for (const row of KEYBOARD_ROWS) {
    for (let i = 0; i + 5 <= w.length; i++) {
      const chunk = w.slice(i, i + 5);
      if (row.includes(chunk) || row.split("").reverse().join("").includes(chunk)) return true;
    }
  }
  return false;
}

export function assessPlausibility(raw: string): Plausibility {
  const name = cleanInput(raw);
  const hard: HardCode[] = [];
  const soft: SoftCode[] = [];
  const letters = (name.match(/\p{L}/gu) ?? []).length;
  const words = name.split(/[\s]+/).filter(Boolean);
  const latin = /^[\p{Script=Latin}\s'’`ʼ\-.\p{M}]*$/u.test(name);

  if (!name) return { hard: ["empty"], soft, wordCount: 0, latin };
  if (/https?:|www\.|\.(com|net|org|co|ke|io|info)\b|@|\b\d{7,}\b/i.test(name)) hard.push("contact_or_link");
  if (/^[\d\s.\-+()]+$/.test(name)) hard.push("numeric");
  else if (/\d/.test(name)) hard.push("digits");
  if (letters === 0 && !hard.includes("numeric")) hard.push("no_letters");
  if (!hard.length && !ALLOWED_PUNCT.test(name)) hard.push("symbols");
  if (letters > 0 && letters < 2) hard.push("too_short");
  if (name.length > 80) hard.push("too_long");
  if (words.length > 6) hard.push("too_many_words");
  else if (words.length > 4) soft.push("many_words");
  if (SENTENCE_RX.some((rx) => rx.test(name))) hard.push("sentence");
  if (/(\p{L})\1{3,}/u.test(name)) hard.push("repeated_chars");

  const latinWords = words.map((w) => w.replace(/[.’'`ʼ\-]/g, "")).filter((w) => w && LATIN_WORD.test(w));
  for (const w of latinWords) {
    if (keyboardRun(w) && !hard.includes("keyboard_mash")) hard.push("keyboard_mash");
    if (w.length >= 4 && !VOWELS.test(w) && !soft.includes("vowelless_word")) soft.push("vowelless_word");
    if (/[bcdfghjklmnpqrstvwxz]{6,}/i.test(w) && !soft.includes("long_consonant_run")) soft.push("long_consonant_run");
    if (/^(\p{L}{2,3})\1{2,}$/u.test(w.toLowerCase()) && !soft.includes("repeated_syllables")) soft.push("repeated_syllables");
  }
  // Whole name made only of vowel-less Latin words of length ≥4 → keyboard smashing.
  if (latinWords.length && latinWords.every((w) => w.length >= 4 && !VOWELS.test(w))) hard.push("keyboard_mash");
  if (words.length >= 2 && words.every((w) => w.replace(/[.\-]/g, "").length <= 1)) soft.push("single_letter_words");
  if (!latin && /[\p{Script=Latin}]/u.test(name) && /[^\p{Script=Latin}\s'’`ʼ\-.\p{M}]/u.test(name)) soft.push("unusual_characters");

  return { hard: [...new Set(hard)], soft: [...new Set(soft)], wordCount: words.length, latin };
}
