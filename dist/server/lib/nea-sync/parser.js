"use strict";
/**
 * NEA sync parser — accepts either raw HTML from neaims.go.ke or CSV/TSV
 * pasted by an admin, and emits a normalized list of agency records.
 *
 * Why both formats?
 *   • NEAIMS is an ASP.NET WebForms page with __VIEWSTATE pagination that
 *     often breaks headless-parseable scraping. When auto-fetch works, we
 *     parse the HTML GridView table.
 *   • When it doesn't, the admin exports the list to CSV from NEAIMS (or
 *     pastes the visible table) and submits it via the admin sync page.
 *
 * The same pipeline (differ.ts + apply.ts) runs downstream regardless of
 * where the rows came from — parser normalisation is the single source of
 * truth for what "one NEA record" looks like.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseNEASource = parseNEASource;
// ─── Public API ───────────────────────────────────────────────────────────
function parseNEASource(raw) {
    const trimmed = raw.trim();
    if (!trimmed)
        return { rows: [], warnings: ["Empty input"], format: "unknown" };
    // ASP.NET GridView renders as <table>…</table> in the response body.
    if (/<table[\s>]/i.test(trimmed)) {
        return parseHtml(trimmed);
    }
    // Detect CSV vs TSV by which separator appears more often in a sample.
    const sample = trimmed.slice(0, 4000);
    const commas = (sample.match(/,/g) ?? []).length;
    const tabs = (sample.match(/\t/g) ?? []).length;
    if (tabs > commas)
        return parseTsv(trimmed);
    return parseCsv(trimmed);
}
// ─── HTML parser (regex-based — the NEAIMS grid is well-formed) ──────────
// We deliberately avoid pulling in cheerio to keep the server build slim.
// The NEA GridView emits <tr><td>…</td></tr> rows with a stable column
// order; regex is more than adequate and resistant to whitespace churn.
function parseHtml(html) {
    const warnings = [];
    const rows = [];
    // Grab everything inside the first agencies table. The NEAIMS grid has
    // id="ctl00_ContentPlaceHolder1_gvAgencies" but IDs get mangled in
    // ASP.NET; matching on the surrounding table + expected column headers
    // is safer.
    const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/gi);
    if (!tableMatch) {
        warnings.push("No <table> found in HTML");
        return { rows, warnings, format: "html" };
    }
    // Find the table with the header row that includes 'Licence' or 'License'.
    const agencyTable = tableMatch.find((t) => /(licen[cs]e\s*(no|number)|licence)/i.test(t) &&
        /agency\s*name/i.test(t));
    if (!agencyTable) {
        warnings.push("No table with expected NEA agency columns");
        return { rows, warnings, format: "html" };
    }
    const rowMatches = agencyTable.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? [];
    for (const rowHtml of rowMatches) {
        const cellMatches = rowHtml.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) ?? [];
        if (cellMatches.length < 3)
            continue;
        const cells = cellMatches.map(stripCell);
        // Skip header row(s) — first cell contains column label
        if (/^licence|^license|^agency|^no\.?$|^#$/i.test(cells[0] ?? ""))
            continue;
        const parsed = mapColumnsToAgency(cells);
        if (parsed)
            rows.push(parsed);
    }
    if (rows.length === 0)
        warnings.push("HTML parsed but produced 0 usable rows");
    return { rows, warnings, format: "html" };
}
// ─── CSV / TSV parsers ────────────────────────────────────────────────────
function parseCsv(csv) {
    return parseDelimited(csv, ",");
}
function parseTsv(tsv) {
    return parseDelimited(tsv, "\t");
}
function parseDelimited(text, sep) {
    const warnings = [];
    const rows = [];
    const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim());
    if (lines.length < 2) {
        warnings.push("Fewer than 2 non-empty lines — need a header + at least 1 row");
        return { rows, warnings, format: sep === "," ? "csv" : "tsv" };
    }
    const headerCells = splitLine(lines[0], sep).map((c) => c.trim().toLowerCase());
    const idx = {
        name: findCol(headerCells, ["agency name", "agency", "name", "company", "employer"]),
        license: findCol(headerCells, ["licence no", "license no", "licence number", "license number", "licence", "license"]),
        email: findCol(headerCells, ["email", "e-mail", "email address"]),
        phone: findCol(headerCells, ["phone", "tel", "telephone", "mobile", "contact"]),
        service: findCol(headerCells, ["service", "service type", "category", "type"]),
        issued: findCol(headerCells, ["issued", "issue date", "date issued", "issued on", "granted"]),
        expiry: findCol(headerCells, ["expiry", "expiry date", "expires", "expiration", "valid to", "valid until"]),
        status: findCol(headerCells, ["status", "state"]),
    };
    if (idx.name < 0 || idx.license < 0) {
        warnings.push(`Header missing required columns. Expected 'Agency Name' + 'Licence No' (got: ${headerCells.join(", ")})`);
        return { rows, warnings, format: sep === "," ? "csv" : "tsv" };
    }
    for (let i = 1; i < lines.length; i++) {
        const cells = splitLine(lines[i], sep).map((c) => c.trim());
        const name = safe(cells, idx.name);
        const lic = safe(cells, idx.license);
        if (!name || !lic)
            continue;
        rows.push({
            agencyName: name,
            licenseNumber: lic,
            email: safe(cells, idx.email) || null,
            phone: safe(cells, idx.phone) || null,
            serviceType: safe(cells, idx.service) || null,
            issueDate: safeDate(safe(cells, idx.issued)),
            expiryDate: safeDate(safe(cells, idx.expiry)),
            rawStatus: safe(cells, idx.status) || null,
        });
    }
    return { rows, warnings, format: sep === "," ? "csv" : "tsv" };
}
// ─── Helpers ──────────────────────────────────────────────────────────────
function stripCell(cellHtml) {
    return cellHtml
        .replace(/<[^>]+>/g, " ") // strip inner tags
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/\s+/g, " ")
        .trim();
}
// NEAIMS GridView column order (as of 2026-08):
//   0=No.  1=Agency Name  2=Licence No  3=Address  4=Contact  5=Email
//   6=Issued  7=Expiry  8=Status
// This order has been stable for years, but if NEA changes it we fall
// through to keyword-based header detection in the CSV branch.
function mapColumnsToAgency(cells) {
    const guess = {
        name: cells[1] ?? "",
        license: cells[2] ?? "",
        contact: cells[4] ?? "",
        email: cells[5] ?? "",
        issued: cells[6] ?? "",
        expiry: cells[7] ?? "",
        status: cells[8] ?? "",
    };
    if (!guess.name || !guess.license)
        return null;
    return {
        agencyName: guess.name,
        licenseNumber: guess.license,
        email: guess.email.includes("@") ? guess.email : null,
        phone: extractPhone(guess.contact),
        serviceType: null,
        issueDate: safeDate(guess.issued),
        expiryDate: safeDate(guess.expiry),
        rawStatus: guess.status || null,
    };
}
function extractPhone(text) {
    const m = text.match(/(\+?\d[\d\s\-()]{6,})/);
    return m ? m[1].replace(/\s+/g, " ").trim() : null;
}
function findCol(headers, candidates) {
    for (const cand of candidates) {
        const idx = headers.findIndex((h) => h === cand || h.includes(cand));
        if (idx >= 0)
            return idx;
    }
    return -1;
}
function safe(cells, idx) {
    if (idx < 0 || idx >= cells.length)
        return "";
    return cells[idx];
}
// Accepts "12/07/2024", "2024-07-12", "12-Jul-2024" — returns ISO 8601 or null.
function safeDate(raw) {
    if (!raw)
        return null;
    const s = raw.trim();
    if (!s)
        return null;
    // DD/MM/YYYY  or  DD-MM-YYYY
    let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) {
        const [, d, mo, y] = m;
        return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    // YYYY-MM-DD
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) {
        const [, y, mo, d] = m;
        return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    // Fallback: try Date parser
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
    }
    return null;
}
// Splits a delimited line, respecting double-quote escaping. Handles CSVs
// exported from NEAIMS which occasionally have commas inside agency names.
function splitLine(line, sep) {
    const out = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuote && line[i + 1] === '"') {
                cur += '"';
                i++;
                continue;
            }
            inQuote = !inQuote;
            continue;
        }
        if (ch === sep && !inQuote) {
            out.push(cur);
            cur = "";
            continue;
        }
        cur += ch;
    }
    out.push(cur);
    return out;
}
