/** Pure helpers for employer-name matching and CSV parsing (unit-tested). */

const LEGAL_SUFFIXES = [
  "limited", "ltd", "plc", "llp", "llc", "lp", "inc", "incorporated", "corp", "corporation",
  "co", "company", "gmbh", "ag", "bv", "nv", "sa", "sarl", "srl", "spa", "pty", "pvt", "private",
  "fze", "fzco", "fz llc", "wll", "w l l", "est", "establishment", "group", "holdings", "uk", "the",
];

/** Lower-case, strip punctuation and legal-form suffixes. "The ACME Co. Ltd" → "acme". */
export function normalizeEmployerName(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = raw.toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
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
