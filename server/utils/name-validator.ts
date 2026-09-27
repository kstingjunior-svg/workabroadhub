/**
 * Name real-identity validation
 *
 * 2026-09 (Tony's "make sure people use real names" mandate).
 *
 * We validate first and last names to catch obvious garbage:
 *   - "asdfghjkl" (keyboard mashing)
 *   - "I went home" (sentence in the name field)
 *   - "test test", "admin admin", "user1234"
 *   - "aaaaaaa" (repeated characters)
 *   - "12345" (digits)
 *   - copies of the email prefix
 *
 * We do NOT reject:
 *   - Multi-word African / Kenyan / European names (Ngũgĩ wa Thiong'o,
 *     Anne-Marie, José, Mwikali Wangeci, O'Brien, Van Der Merwe)
 *   - Apostrophes, hyphens, spaces, accented Latin characters
 *   - Single-word names
 *   - Short names (min 2 letters — some cultures have 2-letter names like Xu, Bo)
 *
 * Returns { ok: true } for accept, { ok: false, message } for reject.
 * The message is user-facing so keep it warm and specific.
 */

/** Runs of letters that are almost never a real name. */
const GIBBERISH_TOKENS: readonly RegExp[] = [
  /\b(asdf+|qwer+|zxcv+|hjkl+|jkl+)\b/i,
  /\b(test\d*|testing|tester|dummy|dummies)\b/i,
  /\b(admin|administrator|superuser|root)\b/i,
  /\b(user\d*|username|customer|client)\b/i,
  /\b(name|firstname|lastname|surname)\b/i,
  /\b(anonymous|unknown|nobody|somebody|someone)\b/i,
  /\b(xxxx+|yyyy+|zzzz+|aaaa+|bbbb+|cccc+|dddd+|eeee+|ffff+)\b/i,
  /\b(fake|fakename|fake\d*)\b/i,
];

/** English sentence markers that suggest the person typed a phrase. */
const SENTENCE_TOKENS: readonly RegExp[] = [
  /\b(i am|i'm|iam)\b/i,
  /\bmy name is\b/i,
  /\b(went home|going to|come here|call me)\b/i,
  /\b(hello|hi there|greetings)\b/i,
  /\b(what|why|when|where|how|who)\s+/i,
  /\b(this is|that is|it is|there is)\b/i,
  /\b(please|kindly|thanks|thank you)\b/i,
  /\?|!|@|#|\$|%|\^|&|\*|\+|=|~|`/, // punctuation you'd type in a message
];

/**
 * Simple heuristic: a real name usually has at least one vowel per word
 * (Kenyan, African, European, Asian). A random keyboard mash like "qwrtp"
 * or "bcdfg" has no vowels. We check on a per-word basis and reject only
 * if EVERY word is vowel-less (so initials like "M." mixed with a real
 * name still pass — the word "M" alone doesn't sink the whole name).
 */
const VOWEL_RE = /[aeiouyàáâãäåæèéêëìíîïòóôõöøùúûüýÿœœuÀ-ɏ]/i;

function hasEveryWordVowelless(clean: string): boolean {
  const words = clean.split(/[\s'\-]+/).filter((w) => w.length >= 2);
  if (words.length === 0) return false;
  return words.every((w) => !VOWEL_RE.test(w));
}

/**
 * Detect 4+ consecutive identical letters in the same word ("aaaaa").
 * Some real names have doubles (Lee, Sammy, Kelly) but nothing goes past 3.
 */
const LONG_RUN_RE = /(\p{L})\1{3,}/u;

export interface NameCheckResult {
  ok: boolean;
  /** User-facing message when ok=false. */
  message?: string;
  /** Machine-readable reason code for logging / analytics. */
  code?:
    | "too_short"
    | "too_long"
    | "contains_digits"
    | "invalid_chars"
    | "gibberish"
    | "sentence"
    | "repeated_letters"
    | "vowel_less"
    | "matches_email_prefix";
}

export function validateName(
  raw: string | null | undefined,
  which: "first" | "last",
  emailPrefixHint?: string,
): NameCheckResult {
  const label = which === "first" ? "First name" : "Last name";
  const clean = String(raw ?? "").trim();

  // Length
  if (clean.length < 2) {
    return { ok: false, code: "too_short", message: `${label} looks too short. Please enter your real ${which} name.` };
  }
  if (clean.length > 50) {
    return { ok: false, code: "too_long", message: `${label} is too long (max 50 characters).` };
  }

  // Digits: no real name has digits.
  if (/\d/.test(clean)) {
    return { ok: false, code: "contains_digits", message: `${label} shouldn't contain numbers. Please enter your real ${which} name.` };
  }

  // Character set: letters (any script), spaces, apostrophes, hyphens, dots.
  // We use \p{L} so African / Chinese / Arabic / etc. names all pass.
  if (!/^[\p{L}][\p{L}\s'\-.]*$/u.test(clean)) {
    return { ok: false, code: "invalid_chars", message: `${label} contains characters that aren't letters. Please enter your real ${which} name.` };
  }

  // 4+ same letter run in a word.
  if (LONG_RUN_RE.test(clean)) {
    return { ok: false, code: "repeated_letters", message: `${label} has too many repeated letters. Please enter your real ${which} name.` };
  }

  // Gibberish tokens.
  for (const rx of GIBBERISH_TOKENS) {
    if (rx.test(clean)) {
      return { ok: false, code: "gibberish", message: `Please enter your real ${which} name.` };
    }
  }

  // Sentence-like input.
  for (const rx of SENTENCE_TOKENS) {
    if (rx.test(clean)) {
      return { ok: false, code: "sentence", message: `That looks like a sentence, not a ${which} name. Please enter your real ${which} name.` };
    }
  }

  // Every word vowel-less (probably keyboard mash).
  if (hasEveryWordVowelless(clean)) {
    return { ok: false, code: "vowel_less", message: `${label} doesn't look like a real name. Please enter your real ${which} name.` };
  }

  // 2026-09: don't bother with email-prefix match. Real users very
  // commonly have their first name in their email (grace@gmail.com,
  // john@yahoo.com, etc.), so rejecting on that would lock out legit
  // signups more often than it'd catch fakes.
  return { ok: true };
}

/**
 * Validate both names at once. Returns the first failing check so the
 * caller can surface one clear error message to the user rather than
 * an ambiguous "one of the fields is wrong".
 */
export function validateFirstAndLastName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  emailPrefixHint?: string,
): NameCheckResult {
  const first = validateName(firstName, "first", emailPrefixHint);
  if (!first.ok) return first;
  const last = validateName(lastName, "last", emailPrefixHint);
  if (!last.ok) return last;
  return { ok: true };
}
