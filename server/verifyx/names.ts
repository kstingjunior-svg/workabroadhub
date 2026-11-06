/** Pure helpers for employer-name matching and CSV parsing (unit-tested). */

/** Bump when normalizeEmployerName changes so synced registers are rebuilt. */
export const NORMALIZER_VERSION = 2;

const LEGAL_SUFFIXES = [
  "limited", "ltd", "plc", "llp", "llc", "lp", "inc", "incorporated", "corp", "corporation",
  "co", "company", "gmbh", "ag", "bv", "nv", "sa", "sarl", "srl", "spa", "pty", "pvt", "private",
  "fze", "fzco", "fz llc", "wll", "w l l", "est", "establishment", "group", "holdings", "holding", "uk", "the",
];

/** Lower-case, strip punctuation and legal-form suffixes. "The ACME Co. Ltd" → "acme". */
export function normalizeEmployerName(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = raw.toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    // dotted legal forms: "B.V." → "bv", "N.V." → "nv", "S.A.R.L." → "sarl"
    .replace(/\b(?:[a-z]\.){2,}/g, (m) => m.replace(/\./g, "") + " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (s.startsWith("the ")) s = s.slice(4).trim();
  // Strip legal suffix words at the end, repeatedly ("acme uk limited" → "acme").
  let changed = true;
  while (changed && s) {
    changed = false;
    for (const suf of LEGAL_SUFFIXES) {
      if (s.endsWith(" " + suf)) { s = s.slice(0, -suf.length - 1).trim(); changed = true; }
    }
  }
  return s;
}

/** "Foo Ltd T/A Bar Kebab" → ["Foo Ltd", "Bar Kebab"]. */
export function splitTradingNames(name: string): string[] {
  return name
    .split(/\s+(?:t\/a|ta|trading as|t\/as|t\.a\.)\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Minimal RFC-4180 CSV parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Registered domain-ish comparison: "hr.acme.co.uk" vs "acme.co.uk". */
export function registrableDomain(host: string | null | undefined): string {
  if (!host) return "";
  const h = host.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/:?#]/)[0].trim();
  const parts = h.split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const twoLevel = /^(co|com|org|net|gov|ac|edu|ltd|plc|or|ne|go)$/;
  const sld = parts[parts.length - 2];
  if (twoLevel.test(sld) && parts[parts.length - 1].length === 2) return parts.slice(-3).join(".");
  return parts.slice(-2).join(".");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

/**
 * Parse the IND "public register recognised sponsors" page: a table of
 * organisation name + 8-digit KvK number. Pure; returns [] if the layout is
 * unrecognised so the caller can refuse to replace the register.
 */
export function parseIndRegisterHtml(html: string): Array<{ name: string; kvk: string }> {
  const out: Array<{ name: string; kvk: string }> = [];
  const seen = new Set<string>();
  const rowRx = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRx.exec(html))) {
    const cells = [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
      decodeEntities(c[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim());
    if (cells.length < 2) continue;
    const kvk = cells[cells.length - 1].replace(/\s+/g, "");
    const name = cells[0];
    if (!/^\d{8}$/.test(kvk) || !name) continue;
    const key = `${name}|${kvk}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, kvk });
  }
  if (out.length >= 50) return out;
  // Fallback for non-table layouts (definition lists / divs): turn block
  // boundaries into new lines and read "Organisation name 12345678" lines.
  const text = decodeEntities(
    html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<\/(p|div|li|tr|dd|dt|h\d)>|<br\s*\/?>/gi, "\n")
      .replace(/<\/(td|th|span)>/gi, " ")
      .replace(/<[^>]+>/g, ""),
  );
  const lines = text.split(/\n+/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const add = (name: string, kvk: string) => {
    const key = `${name}|${kvk}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name, kvk });
  };
  for (let i = 0; i < lines.length; i++) {
    const lm = /^(.{2,200}?)\s+(\d{8})$/.exec(lines[i]);
    if (lm) { add(lm[1], lm[2]); continue; }
    // "Name" on one line, "12345678" on the next (dt/dd layouts)
    if (/^\d{8}$/.test(lines[i + 1] ?? "") && !/^\d+$/.test(lines[i]) && lines[i].length <= 200) {
      add(lines[i], lines[i + 1]); i++;
    }
  }
  return out;
}
